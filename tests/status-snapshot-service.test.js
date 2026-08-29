const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function properties(initial = {}) {
  const store = { ...initial };
  return {
    store,
    service: {
      getScriptProperties() {
        return {
          getProperties: () => ({ ...store }),
          getProperty: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
          setProperty: (key, value) => { store[key] = String(value); },
          setProperties: (values) => { Object.assign(store, values); },
          deleteProperty: (key) => { delete store[key]; }
        };
      }
    }
  };
}

function loadWebApiContext(initialProps = {}, options = {}) {
  const props = properties(initialProps);
  const config = { environment: 'sandbox_dropbox', autoSyncEnabled: options.autoSyncEnabled === true, dropbox: { rootPath: '/root', pPath: '/root/Chronos/P_Chronos', ac2Path: '/root/AC2', tPath: '/root/Chronos/T_Chronos', dbPath: '/root/__db__' } };
  const calls = { dropboxCreate: 0, readMeta: 0, urlFetch: 0, lastFetch: null };
  const context = vm.createContext({
    console,
    Date,
    Error,
    JSON,
    Number,
    String,
    Object,
    Array,
    Math,
    isFinite,
    PropertiesService: props.service,
    UrlFetchApp: {
      fetch(url, fetchOptions) {
        calls.urlFetch += 1;
        calls.lastFetch = { url, options: fetchOptions };
        const isRunStatus = String(url).includes('/actions/workflows/dropbox-incremental-sync.yml/runs');
        const body = isRunStatus
          ? JSON.stringify({ workflow_runs: options.githubRuns || [] })
          : (options.githubResponseBody || '');
        return {
          getResponseCode: () => options.githubStatusCode || 204,
          getContentText: () => body
        };
      }
    },
    AppConfig: { current: () => ({ ...config, autoSyncEnabled: props.store.AUTO_SYNC_ENABLED === 'true' || config.autoSyncEnabled === true }), normalizePath: (value) => value || '' },
    DropboxClient: {
      create() {
        calls.dropboxCreate += 1;
        return {};
      }
    },
    CacheRepository: {
      create() {
        return {
          readMeta() {
            calls.readMeta += 1;
            if (options.readMetaResult) return { ...options.readMetaResult };
            const err = options.readMetaError || new Error('Service invoked too many times for one day: urlfetch');
            if (!err.code) err.code = 'URLFETCH_QUOTA';
            throw err;
          }
        };
      }
    },
    AuthService: {
      publicStatus: () => ({ configured: true, defaultPasswordActive: false, username: 'admin' }),
      assertAuthenticated: () => ({ role: 'admin' })
    },
    SyncService: {
      autoSyncTriggerInstalled: () => true,
      setAutoSync: (enabled) => {
        props.store.AUTO_SYNC_ENABLED = enabled ? 'true' : 'false';
        config.autoSyncEnabled = enabled === true;
        context.StatusSnapshotService.merge({ autoSyncEnabled: enabled === true }, { ...config, autoSyncEnabled: enabled === true });
        return { ok: true, enabled: enabled === true, triggerInstalled: enabled === true, intervalMinutes: 5 };
      }
    }
  });
  vm.runInContext(fs.readFileSync('src/backend/StatusSnapshotService.js', 'utf8'), context, { filename: 'src/backend/StatusSnapshotService.js' });
  vm.runInContext(fs.readFileSync('src/backend/WebApi.js', 'utf8'), context, { filename: 'src/backend/WebApi.js' });
  return { context, props, calls };
}

test('apiGetPublicSyncStatus reads PropertiesService snapshot without Dropbox', () => {
  const seed = {
    lastKnownProjectCount: 3168,
    lastKnownCursorPresent: true,
    lastSyncAt: '2026-08-25T10:05:12.000Z',
    autoSyncEnabled: true,
    lastSyncStatus: 'idle',
    lastSyncError: null,
    lastStatusSnapshotAt: '2026-08-25T10:05:12.000Z'
  };
  const { context, calls } = loadWebApiContext({
    DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT: JSON.stringify(seed)
  });

  const res = context.apiGetPublicSyncStatus();

  assert.equal(res.ok, true);
  assert.equal(res.data.syncStatus.projectCount, 3168);
  assert.equal(res.data.syncStatus.cursorPresent, true);
  assert.equal(res.data.autoSync.enabled, true);
  assert.equal(res.data.fromSnapshot, true);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('apiGetPublicSyncStatus keeps stale snapshot without live Dropbox metadata', () => {
  const seed = {
    lastKnownProjectCount: 3168,
    lastKnownCursorPresent: true,
    lastSyncAt: '2000-01-01T00:00:00.000Z',
    autoSyncEnabled: true,
    lastSyncStatus: 'running',
    lastSyncError: null,
    lastStatusSnapshotAt: '2000-01-01T00:00:00.000Z'
  };
  const { context, calls } = loadWebApiContext({
    DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT: JSON.stringify(seed)
  });

  const res = context.apiGetPublicSyncStatus();

  assert.equal(res.ok, true);
  assert.equal(res.data.syncStatus.status, 'stale_running');
  assert.equal(res.data.syncStatus.projectCount, 3168);
  assert.equal(res.data.fromSnapshot, true);
  assert.equal(res.data.statusStale, false);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('apiGetPublicSyncStatus returns unknown snapshot without live Dropbox fallback', () => {
  const { context, calls } = loadWebApiContext();

  const res = context.apiGetPublicSyncStatus();

  assert.equal(res.ok, true);
  assert.equal(res.data.syncStatus.projectCount, null);
  assert.equal(res.data.syncStatus.cursorPresent, null);
  assert.equal(res.data.statusStale, true);
  assert.equal(res.data.lastLiveReadError, '');
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('apiGetPublicSyncStatus keeps stale known counts without live read', () => {
  const seed = {
    lastKnownProjectCount: 3157,
    lastKnownCursorPresent: true,
    lastSyncAt: '2000-01-01T00:00:00.000Z',
    autoSyncEnabled: true,
    lastSyncStatus: 'running',
    lastSyncError: null,
    lastStatusSnapshotAt: '2000-01-01T00:00:00.000Z'
  };
  const { context, props, calls } = loadWebApiContext({
    DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT: JSON.stringify(seed)
  });

  const res = context.apiGetPublicSyncStatus();
  const stored = JSON.parse(props.store.DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT);

  assert.equal(res.ok, true);
  assert.equal(res.data.syncStatus.projectCount, 3157);
  assert.equal(res.data.syncStatus.cursorPresent, true);
  assert.equal(res.data.statusStale, false);
  assert.equal(res.data.lastLiveReadError, '');
  assert.equal(stored.lastKnownProjectCount, 3157);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('apiSetAutoSyncEnabled installs Apps Script dispatcher trigger without reading Dropbox metadata', () => {
  const seed = {
    lastKnownProjectCount: 3168,
    lastKnownCursorPresent: true,
    lastSyncAt: '2026-08-25T10:05:12.000Z',
    autoSyncEnabled: false,
    lastSyncStatus: 'idle',
    lastSyncError: null,
    lastStatusSnapshotAt: '2026-08-25T10:05:12.000Z'
  };
  const { context, props, calls } = loadWebApiContext({
    DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT: JSON.stringify(seed)
  });

  const res = context.apiSetAutoSyncEnabled('token', true);
  const stored = JSON.parse(props.store.DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT);

  assert.equal(res.ok, true);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.enabled, true);
  assert.equal(stored.autoSyncEnabled, true);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('autoSyncTick dispatches GitHub Actions without creating Dropbox client', () => {
  const { context, calls } = loadWebApiContext({
    AUTO_SYNC_ENABLED: 'true',
    GITHUB_DISPATCH_TOKEN: 'token',
    GITHUB_DISPATCH_REPOSITORY: 'ThanhVo15/dong-engineering',
    GITHUB_DISPATCH_EVENT_TYPE: 'dropbox-incremental-sync'
  });

  const res = context.autoSyncTick();

  assert.equal(res.ok, true);
  assert.equal(res.accepted, true);
  assert.equal(res.code, 'GITHUB_DISPATCH_ACCEPTED');
  assert.equal(calls.urlFetch, 1);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
  assert.equal(calls.lastFetch.url, 'https://api.github.com/repos/ThanhVo15/dong-engineering/dispatches');
  assert.equal(calls.lastFetch.options.method, 'post');
  assert.match(calls.lastFetch.options.payload, /"event_type":"dropbox-incremental-sync"/);
});

test('autoSyncTick reports missing GitHub dispatch token without creating Dropbox client', () => {
  const { context, calls } = loadWebApiContext({ AUTO_SYNC_ENABLED: 'true' });

  const res = context.autoSyncTick();

  assert.equal(res.ok, false);
  assert.equal(res.accepted, false);
  assert.equal(res.code, 'GITHUB_DISPATCH_TOKEN_MISSING');
  assert.equal(calls.urlFetch, 0);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('apiRequestIncrementalSync dispatches GitHub Actions without creating Dropbox client', () => {
  const { context, calls } = loadWebApiContext({
    GITHUB_DISPATCH_TOKEN: 'token',
    GITHUB_DISPATCH_REPOSITORY: 'ThanhVo15/dong-engineering'
  });

  const res = context.apiRequestIncrementalSync('token');

  assert.equal(res.ok, true);
  assert.equal(res.data.accepted, true);
  assert.equal(res.data.code, 'GITHUB_DISPATCH_ACCEPTED');
  assert.equal(calls.urlFetch, 1);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});

test('apiGetGitHubSyncStatus reads repository_dispatch completion without Dropbox', () => {
  const { context, calls } = loadWebApiContext({
    GITHUB_DISPATCH_TOKEN: 'token',
    GITHUB_DISPATCH_REPOSITORY: 'ThanhVo15/dong-engineering'
  }, {
    githubRuns: [{
      id: 123,
      run_number: 9,
      status: 'completed',
      conclusion: 'success',
      event: 'repository_dispatch',
      created_at: '2026-08-29T11:44:23Z',
      updated_at: '2026-08-29T11:44:50Z',
      html_url: 'https://github.com/ThanhVo15/dong-engineering/actions/runs/123'
    }]
  });

  const res = context.apiGetGitHubSyncStatus('token', '2026-08-29T11:44:00Z');

  assert.equal(res.ok, true);
  assert.equal(res.data.status, 'completed');
  assert.equal(res.data.conclusion, 'success');
  assert.equal(res.data.runNumber, 9);
  assert.equal(calls.urlFetch, 1);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
  assert.match(calls.lastFetch.url, /actions\/workflows\/dropbox-incremental-sync\.yml\/runs/);
});

test('apiSyncNow direct Apps Script incremental endpoint remains disabled without creating Dropbox client', () => {
  const { context, calls } = loadWebApiContext();

  const res = context.apiSyncNow();

  assert.equal(res.ok, false);
  assert.equal(res.skipped, true);
  assert.equal(res.code, 'APPS_SCRIPT_INCREMENTAL_DISABLED');
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});
