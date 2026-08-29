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
  const config = { environment: 'sandbox_dropbox', autoSyncEnabled: false, dropbox: { rootPath: '/root', pPath: '/root/Chronos/P_Chronos', ac2Path: '/root/AC2', tPath: '/root/Chronos/T_Chronos', dbPath: '/root/__db__' } };
  const calls = { dropboxCreate: 0, readMeta: 0 };
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
    AppConfig: { current: () => config, normalizePath: (value) => value || '' },
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

test('stale running snapshot refreshes from live Dropbox metadata', () => {
  const seed = {
    lastKnownProjectCount: 3168,
    lastKnownCursorPresent: true,
    lastSyncAt: '2000-01-01T00:00:00.000Z',
    autoSyncEnabled: true,
    lastSyncStatus: 'running',
    lastSyncError: null,
    lastStatusSnapshotAt: '2000-01-01T00:00:00.000Z'
  };
  const { context, props, calls } = loadWebApiContext({
    DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT: JSON.stringify(seed)
  }, {
    readMetaResult: {
      syncStatus: 'idle',
      cursor: 'cursor-new',
      projectCount: 3157,
      lastSyncAt: '2026-08-26T03:37:33.000Z'
    }
  });

  const res = context.apiGetPublicSyncStatus();
  const stored = JSON.parse(props.store.DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT);

  assert.equal(res.ok, true);
  assert.equal(res.data.syncStatus.status, 'idle');
  assert.equal(res.data.syncStatus.projectCount, 3157);
  assert.equal(res.data.fromSnapshot, false);
  assert.equal(res.data.statusStale, false);
  assert.equal(stored.lastSyncStatus, 'idle');
  assert.equal(stored.lastKnownProjectCount, 3157);
  assert.equal(calls.dropboxCreate, 1);
  assert.equal(calls.readMeta, 1);
});

test('status fallback preserves unknown values instead of fake zero on UrlFetch quota error', () => {
  const { context, calls } = loadWebApiContext();

  const res = context.apiGetPublicSyncStatus();

  assert.equal(res.ok, true);
  assert.equal(res.data.syncStatus.projectCount, null);
  assert.equal(res.data.syncStatus.cursorPresent, null);
  assert.equal(res.data.statusStale, true);
  assert.match(res.data.lastLiveReadError, /urlfetch/i);
  assert.equal(calls.dropboxCreate, 1);
  assert.equal(calls.readMeta, 1);
});

test('stale running snapshot keeps known counts when live read hits quota', () => {
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
  assert.equal(res.data.statusStale, true);
  assert.match(res.data.lastLiveReadError, /urlfetch/i);
  assert.equal(stored.lastKnownProjectCount, 3157);
  assert.equal(stored.lastLiveReadError, res.data.lastLiveReadError);
  assert.equal(calls.dropboxCreate, 1);
  assert.equal(calls.readMeta, 1);
});

test('apiSetAutoSyncEnabled updates snapshot without reading Dropbox metadata', () => {
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
  assert.equal(res.data.enabled, true);
  assert.equal(stored.autoSyncEnabled, true);
  assert.equal(calls.dropboxCreate, 0);
  assert.equal(calls.readMeta, 0);
});
