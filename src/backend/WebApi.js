function makeBackendContext() {
  var config = AppConfig.current();
  var client = DropboxClient.create(config);
  var cacheRepo = CacheRepository.create(client, config);
  return { config: config, client: client, cacheRepo: cacheRepo };
}

var APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED = true;

function githubDispatchConfig_() {
  var p = {};
  if (typeof PropertiesService !== 'undefined') {
    p = PropertiesService.getScriptProperties().getProperties();
  }
  return {
    repository: p.GITHUB_DISPATCH_REPOSITORY || p.GITHUB_REPOSITORY || 'ThanhVo15/dong-engineering',
    eventType: p.GITHUB_DISPATCH_EVENT_TYPE || 'dropbox-incremental-sync',
    token: p.GITHUB_DISPATCH_TOKEN || p.GITHUB_TOKEN || ''
  };
}

function triggerGitHubDropboxSync_(source) {
  if (typeof UrlFetchApp === 'undefined') {
    return {
      ok: false,
      accepted: false,
      code: 'GITHUB_DISPATCH_UNAVAILABLE',
      errorCode: 'GITHUB_DISPATCH_UNAVAILABLE',
      message: 'UrlFetchApp is not available; cannot trigger GitHub Actions.'
    };
  }
  var cfg = githubDispatchConfig_();
  if (!cfg.token) {
    return {
      ok: false,
      accepted: false,
      code: 'GITHUB_DISPATCH_TOKEN_MISSING',
      errorCode: 'GITHUB_DISPATCH_TOKEN_MISSING',
      message: 'Set GITHUB_DISPATCH_TOKEN in Apps Script Properties to trigger GitHub Actions.'
    };
  }
  var url = 'https://api.github.com/repos/' + cfg.repository + '/dispatches';
  var payload = {
    event_type: cfg.eventType,
    client_payload: {
      source: source || 'apps_script',
      triggeredAt: new Date().toISOString()
    }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: {
      Authorization: 'Bearer ' + cfg.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  });
  var status = res.getResponseCode();
  if (status >= 200 && status < 300) {
    return {
      ok: true,
      accepted: true,
      code: 'GITHUB_DISPATCH_ACCEPTED',
      errorCode: '',
      statusCode: status,
      repository: cfg.repository,
      eventType: cfg.eventType,
      triggeredAt: payload.client_payload.triggeredAt,
      message: 'GitHub Actions incremental sync was triggered.'
    };
  }
  var body = '';
  try { body = String(res.getContentText() || '').slice(0, 500); } catch (ignoreBody) {}
  return {
    ok: false,
    accepted: false,
    code: 'GITHUB_DISPATCH_FAILED',
    errorCode: 'GITHUB_DISPATCH_FAILED',
    statusCode: status,
    message: 'GitHub repository_dispatch failed with HTTP ' + status + '.',
    detail: body
  };
}

function appsScriptIncrementalDisabledPayload_() {
  return {
    accepted: false,
    skipped: true,
    code: 'APPS_SCRIPT_INCREMENTAL_DISABLED',
    errorCode: 'APPS_SCRIPT_INCREMENTAL_DISABLED',
    message: 'Apps Script incremental sync is disabled. GitHub Actions is the scheduled Dropbox sync runner.'
  };
}

function apiGetAppBootstrap() {
  var ctx = makeBackendContext();
  var meta = ctx.cacheRepo.readMeta();
  var projects = ctx.cacheRepo.readProjects();
  return {
    ok: true,
    meta: meta,
    projects: projects,
    autoSyncEnabled: ctx.config.autoSyncEnabled
  };
}

function apiGetProjects(query) {
  var ctx = makeBackendContext();
  var projects = ctx.cacheRepo.readProjects();
  var list = [];
  var q = DongUtils.normalizeSearchText(query || '');
  for (var key in projects) {
    if (!Object.prototype.hasOwnProperty.call(projects, key)) continue;
    var row = projects[key];
    if (q && String(row.searchText || '').indexOf(q) < 0) continue;
    list.push(row);
  }
  list.sort(function (a, b) { return String(b.jobNo || '').localeCompare(String(a.jobNo || '')); });
  return { ok: true, projects: list, count: list.length };
}

function apiSaveProject(payload) {
  var ctx = makeBackendContext();
  try {
    return SaveService.saveProject(ctx.client, ctx.cacheRepo, ctx.config, payload || {});
  } catch (err) {
    return { ok: false, code: err && err.code || 'SAVE_ERROR', message: err && err.message || String(err) };
  }
}

function apiSyncNow() {
  if (APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED) {
    var disabled = appsScriptIncrementalDisabledPayload_();
    return { ok: false, code: disabled.code, message: disabled.message, skipped: true };
  }
  var ctx = makeBackendContext();
  try {
    return SyncService.syncNow(ctx.client, ctx.cacheRepo, ctx.config);
  } catch (err) {
    return { ok: false, code: err && err.code || 'SYNC_ERROR', message: err && err.message || String(err) };
  }
}

function apiGetSyncStatus() {
  var state = readStatusState_(AppConfig.current(), true);
  return { ok: true, meta: state.meta, autoSyncEnabled: state.config.autoSyncEnabled, fromSnapshot: state.fromSnapshot === true };
}

function apiSetAutoSync(enabled) {
  return SyncService.setAutoSync(enabled === true);
}

function apiGetAutoSyncStatus() {
  var config = AppConfig.current();
  return { ok: true, enabled: config.autoSyncEnabled };
}

function autoSyncTick() {
  var config = AppConfig.current();
  if (!config.autoSyncEnabled) return { ok: true, skipped: true };
  return triggerGitHubDropboxSync_('autoSyncTick');
}

/* -------------------------------------------------------------------------
 * Legacy Client.html compatibility layer.
 * The restored old UI expects { ok: true, data: ... } and old endpoint names.
 * Keep these wrappers thin; business work still goes through the new core.
 * ---------------------------------------------------------------------- */

function legacyOk_(data, extra) {
  var out = { ok: true, data: data == null ? {} : data };
  extra = extra || {};
  for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
  return out;
}

function legacyFail_(code, message, detail) {
  return { ok: false, error: { code: code || 'ERROR', message: message || 'Request failed', detail: detail || null } };
}

function props_() {
  if (typeof PropertiesService === 'undefined') return null;
  return PropertiesService.getScriptProperties();
}

function statusSnapshotService_() {
  return typeof StatusSnapshotService === 'undefined' ? null : StatusSnapshotService;
}

var STATUS_STALE_RUNNING_MS = 15 * 60 * 1000;
var STATUS_LIVE_RETRY_MS = 5 * 60 * 1000;

function snapshotAgeMs_(snapshot, primaryKey) {
  snapshot = snapshot || {};
  var value = snapshot[primaryKey || 'lastStatusSnapshotAt'] || snapshot.lastStatusSnapshotAt || snapshot.lastSyncAt || '';
  var parsed = Date.parse(value);
  if (!isFinite(parsed)) return null;
  return Math.max(0, Date.now() - parsed);
}

function recentLiveStatusAttempt_(snapshot) {
  var age = snapshotAgeMs_(snapshot, 'lastLiveReadAt');
  return age !== null && age < STATUS_LIVE_RETRY_MS;
}

function snapshotNeedsLiveStatusRead_(snapshot) {
  if (!snapshot) return true;
  if (recentLiveStatusAttempt_(snapshot)) return false;
  var status = String(snapshot.lastSyncStatus || '').toLowerCase();
  if (status === 'running' || status === 'publishing') {
    var activeAge = snapshotAgeMs_(snapshot, 'lastSyncAt');
    return activeAge === null || activeAge > STATUS_STALE_RUNNING_MS;
  }
  if (snapshot.statusStale === true || status === 'unknown' || status === 'error') {
    var staleAge = snapshotAgeMs_(snapshot, 'lastStatusSnapshotAt');
    return staleAge === null || staleAge > STATUS_LIVE_RETRY_MS;
  }
  return false;
}

function cloneObject_(value) {
  var out = {};
  value = value || {};
  for (var key in value) if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key];
  return out;
}

function liveStatusReadFailedSnapshot_(svc, snapshot, config, err) {
  var fallback = snapshot ? cloneObject_(snapshot) : (svc && svc.unknown ? svc.unknown(config, err) : {});
  fallback.statusStale = true;
  fallback.lastLiveReadAt = new Date().toISOString();
  fallback.lastLiveReadError = err && err.message || String(err || 'Unknown error');
  if (!snapshot && !fallback.lastSyncError) {
    fallback.lastSyncError = { code: err && err.code || 'STATUS_UNKNOWN', message: fallback.lastLiveReadError };
  }
  if (svc && svc.write) {
    try { fallback = svc.write(fallback) || fallback; } catch (ignoreWrite) {}
  }
  return fallback;
}

function readStatusState_(config, allowLiveRead) {
  config = config || AppConfig.current();
  var svc = statusSnapshotService_();
  var snapshot = svc && svc.read ? svc.read() : null;
  if (snapshot && svc.metaFromSnapshot && (allowLiveRead === false || !snapshotNeedsLiveStatusRead_(snapshot))) {
    return { config: config, client: null, meta: svc.metaFromSnapshot(snapshot), snapshot: snapshot, fromSnapshot: true };
  }
  if (allowLiveRead !== false) {
    try {
      var client = DropboxClient.create(config);
      var cacheRepo = CacheRepository.create(client, config);
      var meta = cacheRepo.readMeta();
      if (svc && svc.fromMeta) snapshot = svc.fromMeta(meta, config);
      return { config: config, client: client, meta: meta, snapshot: snapshot, fromSnapshot: false };
    } catch (err) {
      snapshot = liveStatusReadFailedSnapshot_(svc, snapshot, config, err);
      return {
        config: config,
        client: null,
        meta: svc && svc.metaFromSnapshot ? svc.metaFromSnapshot(snapshot) : { syncStatus: 'unknown', projectCount: null, cursorPresent: null, lastError: { code: 'STATUS_UNKNOWN', message: err && err.message || String(err) } },
        snapshot: snapshot,
        fromSnapshot: true,
        statusStale: true,
        lastLiveReadError: err && err.message || String(err)
      };
    }
  }
  snapshot = svc && svc.unknown ? svc.unknown(config) : null;
  return {
    config: config,
    client: null,
    meta: svc && svc.metaFromSnapshot ? svc.metaFromSnapshot(snapshot) : { syncStatus: 'unknown', projectCount: null, cursorPresent: null, lastError: null },
    snapshot: snapshot,
    fromSnapshot: true
  };
}

function updateStatusSnapshotFromMeta_(meta, config, extra) {
  var svc = statusSnapshotService_();
  if (!svc || !svc.fromMeta) return null;
  try { return svc.fromMeta(meta || {}, config || AppConfig.current(), extra || {}); } catch (ignoreSnapshot) { return null; }
}

var CACHE_REFRESH_QUEUE_KEY = 'DONG_CACHE_REFRESH_QUEUE';

function readCacheRefreshQueue_() {
  var p = props_();
  if (!p) return {};
  try {
    return JSON.parse(p.getProperty(CACHE_REFRESH_QUEUE_KEY) || '{}') || {};
  } catch (err) {
    return {};
  }
}

function writeCacheRefreshQueue_(queue) {
  var p = props_();
  if (!p) return;
  p.setProperty(CACHE_REFRESH_QUEUE_KEY, JSON.stringify(queue || {}));
}

function installCacheRefreshTrigger_() {
  if (typeof ScriptApp === 'undefined') return;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'cacheRefreshTick') return;
  }
  ScriptApp.newTrigger('cacheRefreshTick').timeBased().after(60 * 1000).create();
}

function deleteCacheRefreshTriggers_() {
  if (typeof ScriptApp === 'undefined') return;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'cacheRefreshTick') ScriptApp.deleteTrigger(triggers[i]);
  }
}

function enqueueProjectCacheRefresh_(jobNo) {
  jobNo = String(jobNo || '').trim();
  if (!jobNo) return;
  var queue = readCacheRefreshQueue_();
  queue[jobNo] = { jobNo: jobNo, requestedAt: new Date().toISOString(), attempts: Number(queue[jobNo] && queue[jobNo].attempts || 0) };
  writeCacheRefreshQueue_(queue);
  installCacheRefreshTrigger_();
}

function removeProjectCacheRefresh_(jobNo) {
  jobNo = String(jobNo || '').trim();
  if (!jobNo) return;
  var queue = readCacheRefreshQueue_();
  if (queue[jobNo]) {
    delete queue[jobNo];
    writeCacheRefreshQueue_(queue);
  }
}

function cacheRefreshTick() {
  var queue = readCacheRefreshQueue_();
  var jobs = Object.keys(queue || {});
  if (!jobs.length) {
    deleteCacheRefreshTriggers_();
    return { ok: true, processed: 0 };
  }
  var ctx = makeBackendContext();
  var processed = 0;
  var errors = [];
  for (var i = 0; i < Math.min(jobs.length, 5); i++) {
    var jobNo = jobs[i];
    try {
      SaveService.refreshProjectCache(ctx.client, ctx.cacheRepo, ctx.config, jobNo);
      delete queue[jobNo];
      processed++;
    } catch (err) {
      queue[jobNo].attempts = Number(queue[jobNo].attempts || 0) + 1;
      queue[jobNo].lastError = err && err.message || String(err);
      if (queue[jobNo].attempts >= 3) errors.push({ jobNo: jobNo, message: queue[jobNo].lastError });
    }
  }
  writeCacheRefreshQueue_(queue);
  if (!Object.keys(queue).length) deleteCacheRefreshTriggers_();
  return { ok: errors.length === 0, processed: processed, remaining: Object.keys(queue).length, errors: errors };
}

function requireSession_(token, roles) {
  var s = AuthService.assertAuthenticated(token);
  if (!s) throw { code: 'UNAUTHORIZED', message: 'Session expired. Please sign in again.' };
  if (roles && roles.length && roles.indexOf(s.role) < 0) throw { code: 'FORBIDDEN', message: 'You do not have permission for this action.' };
  return s;
}

function catchLegacy_(fn) {
  try {
    return fn();
  } catch (err) {
    return legacyFail_(err && err.code || 'ERROR', err && err.message || String(err), err && err.detail);
  }
}

function legacyConfig_() {
  var config = AppConfig.current();
  var state = readStatusState_(config, true);
  var meta = state.meta || {};
  var syncSnapshot = syncSnapshot_(meta, config, state.client);
  return {
    appVersion: 'clean-rebuild',
    schemaVersion: 1,
    environment: config.environment,
    environmentLabel: config.environment === 'production_dropbox' ? 'Production Dropbox' : 'Sandbox Dropbox',
    rootPath: config.dropbox.rootPath,
    paths: {
      base: config.dropbox.rootPath,
      p: config.dropbox.pPath,
      ac2: config.dropbox.ac2Path,
      t: config.dropbox.tPath,
      db: config.dropbox.dbPath
    },
    adminConfigured: AuthService.publicStatus().configured,
    defaultPasswordActive: AuthService.publicStatus().defaultPasswordActive,
    syncStatus: legacySyncStatus_(meta),
    syncHealth: syncSnapshot,
    autoSync: syncSnapshot.autoSync
  };
}

function legacySyncStatus_(meta) {
  meta = meta || {};
  var lastError = meta.lastError || {};
  var publishing = String(meta.syncStatus || '').toLowerCase() === 'publishing';
  var publishPending = publishing || (!meta.cursor && Number(meta.pendingProjectCount || 0) > 0);
  var completedCacheAt = publishPending ? '' : (meta.lastSyncAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt || '');
  var staleRunning = isStaleRunning_(meta);
  var cursorPresent = Object.prototype.hasOwnProperty.call(meta, 'cursorPresent') ? meta.cursorPresent : (!publishPending && !!meta.cursor);
  var projectCount = meta.projectCount == null ? null : Number(meta.projectCount || 0);
  return {
    state: staleRunning ? 'failed' : (meta.syncStatus === 'error' ? 'failed' : (meta.syncStatus || 'completed')),
    status: staleRunning ? 'stale_running' : (meta.syncStatus || 'idle'),
    message: staleRunning ? 'Previous sync did not finish cleanly. Run Sync now after Apps Script UrlFetch quota resets.' : (lastError.message || ''),
    errorCode: staleRunning ? 'STALE_RUNNING' : (lastError.code || ''),
    cursor: cursorPresent ? 'present' : '',
    cursorPresent: cursorPresent,
    publishToken: publishPending ? (meta.publishStartedAt || '') : completedCacheAt,
    projectCount: projectCount,
    pendingProjectCount: meta.pendingProjectCount || 0,
    updatedAt: completedCacheAt,
    lastCacheUpdateAt: meta.lastCacheUpdateAt || '',
    lastSyncAt: meta.lastSyncAt || '',
    lastFullRebuildAt: meta.lastFullRebuildAt || '',
    publishStartedAt: meta.publishStartedAt || '',
    lastSyncChangeCount: meta.lastSyncChangeCount || 0,
    affectedProjects: meta.lastSyncAffectedProjects || [],
    lastError: lastError.message ? lastError : null
  };
}

function isStaleRunning_(meta) {
  meta = meta || {};
  if (String(meta.syncStatus || '').toLowerCase() !== 'running') return false;
  var startedAt = Date.parse(meta.lastSyncStartedAt || meta.lastSyncAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt || '');
  if (!startedAt) return true;
  return Date.now() - startedAt > 15 * 60 * 1000;
}

function autoSyncStatus_(config, meta) {
  config = config || AppConfig.current();
  meta = meta || {};
  var installed = null;
  try { installed = SyncService.autoSyncTriggerInstalled(); } catch (ignore) {}
  var lastCheckedAt = meta.lastSyncAt || meta.lastCheckedAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt || '';
  return {
    enabled: typeof meta.autoSyncEnabled === 'boolean' ? meta.autoSyncEnabled : config.autoSyncEnabled === true,
    triggerInstalled: installed,
    intervalMinutes: 5,
    lastCheckedAt: lastCheckedAt,
    lastChangeCount: meta.lastSyncChangeCount || 0,
    lastAffectedProjects: meta.lastSyncAffectedProjects || []
  };
}

function syncIssueLogFromMeta_(meta) {
  var rows = meta && meta.syncIssueLog || [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    out.push({
      path: row.path || '',
      reason: row.reason || row.message || '',
      jobNo: row.jobNo || '',
      firstSeenAt: row.firstSeenAt || '',
      lastSeenAt: row.lastSeenAt || ''
    });
  }
  return out;
}

function syncSnapshot_(meta, config, client) {
  meta = meta || {};
  config = config || AppConfig.current();
  var status = legacySyncStatus_(meta);
  var publishing = String(meta.syncStatus || '').toLowerCase() === 'publishing';
  var publishPending = publishing || (!meta.cursor && Number(meta.pendingProjectCount || 0) > 0);
  var pendingProjectCount = Number(meta.pendingProjectCount || (publishPending ? meta.projectCount : 0) || 0);
  var uploadedJobCount = publishPending ? Number(meta.uploadedJobCount || meta.projectCount || 0) : null;
  var completedCacheAt = publishPending ? '' : (meta.lastSyncAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt || '');
  var cursorPresent = Object.prototype.hasOwnProperty.call(meta, 'cursorPresent') ? meta.cursorPresent : (!publishPending && !!meta.cursor);
  var projectCount = meta.projectCount == null ? null : Number(meta.projectCount || 0);
  return {
    activeCache: {
      status: publishPending ? 'publishing' : (status.status || meta.syncStatus || 'idle'),
      sourceStatus: meta.syncStatus || 'idle',
      projectCount: projectCount,
      pendingProjectCount: pendingProjectCount,
      uploadedJobCount: uploadedJobCount,
      publishStartedAt: meta.publishStartedAt || '',
      cursorPresent: cursorPresent,
      cursor: cursorPresent ? 'present' : '',
      publishedAt: completedCacheAt,
      lastFullRebuildAt: meta.lastFullRebuildAt || ''
    },
    sync: {
      status: status.status || meta.syncStatus || 'idle',
      mode: publishPending ? 'full rebuild publish' : (meta.lastSyncMode || 'incremental'),
      lastSyncAt: meta.lastSyncAt || '',
      lastFullRebuildAt: meta.lastFullRebuildAt || '',
      publishStartedAt: meta.publishStartedAt || '',
      lastChangeCount: meta.lastSyncChangeCount || 0,
      affectedProjects: meta.lastSyncAffectedProjects || [],
      projectCount: projectCount,
      pendingProjectCount: pendingProjectCount,
      uploadedJobCount: uploadedJobCount,
      cursorPresent: cursorPresent,
      errorCode: status.errorCode || '',
      error: status.message || '',
      lastError: status.lastError,
      issueLog: syncIssueLogFromMeta_(meta)
    },
    health: {
      message: publishPending ? 'Full rebuild cache publish is not complete. Incremental sync is waiting for projects.json and final meta.json.' : (status.message || (cursorPresent ? 'Ready for incremental sync.' : 'Full rebuild required before incremental sync.')),
      cursorPresent: cursorPresent,
      fromSnapshot: meta.fromSnapshot === true,
      statusStale: meta.statusStale === true,
      lastLiveReadError: meta.lastLiveReadError || ''
    },
    autoSync: autoSyncStatus_(config, meta),
    syncStatus: status
  };
}

function apiGetConfig() {
  return catchLegacy_(function () { AuthService.ensureDefaultAdmin(); return legacyOk_(legacyConfig_()); });
}

function apiAdminLogin(username, password, options) {
  return catchLegacy_(function () {
    AuthService.ensureDefaultAdmin();
    return legacyOk_(AuthService.login(username, password, options || {}));
  });
}

function apiLogin(username, password, options) { return apiAdminLogin(username, password, options || {}); }

function apiAdminSession(token) {
  return catchLegacy_(function () {
    AuthService.ensureDefaultAdmin();
    var s = AuthService.getSession(token);
    var status = AuthService.publicStatus();
    return legacyOk_({
      authenticated: !!s,
      session: s,
      adminConfigured: status.configured,
      defaultPasswordActive: status.defaultPasswordActive
    });
  });
}

function apiSession(token) { return apiAdminSession(token); }

function apiAdminLogout(token) {
  return catchLegacy_(function () {
    return legacyOk_(AuthService.logout(token));
  });
}

function apiLogout(token) { return apiAdminLogout(token); }

function apiListUsers(token) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    return legacyOk_({ users: AuthService.listUsers() });
  });
}

function apiCreateUser(token, payload) {
  return catchLegacy_(function () {
    var session = requireSession_(token, ['admin']);
    return legacyOk_(AuthService.createUser(session, payload || {}));
  });
}

function apiUpdateUser(token, username, payload) {
  return catchLegacy_(function () {
    var session = requireSession_(token, ['admin']);
    return legacyOk_(AuthService.updateUser(session, username, payload || {}));
  });
}

function apiDeleteUser(token, username) {
  return catchLegacy_(function () {
    var session = requireSession_(token, ['admin']);
    return legacyOk_(AuthService.deleteUser(session, username));
  });
}

function apiResetUserPassword(token, username, newPassword) {
  return catchLegacy_(function () {
    var session = requireSession_(token, ['admin']);
    return legacyOk_(AuthService.resetUserPassword(session, username, newPassword));
  });
}

function apiAdminChangePassword(token, payload) {
  return catchLegacy_(function () {
    return legacyOk_(AuthService.changePassword(token, payload || {}));
  });
}

function apiChangePassword(token, payload) { return apiAdminChangePassword(token, payload); }

function findProjectId_(ctx, key) {
  var projects = ctx.cacheRepo.readProjects();
  if (projects[key]) return key;
  for (var id in projects) {
    if (!Object.prototype.hasOwnProperty.call(projects, id)) continue;
    if (String(projects[id].jobNo || '') === String(key)) return id;
  }
  return key;
}

function withDetailCompat_(detail) {
  detail = detail || {};
  detail.filename = detail.filename || detail.sourceRefs && detail.sourceRefs.project && detail.sourceRefs.project.filename || '';
  detail.path = detail.path || detail.sourceRefs && detail.sourceRefs.project && detail.sourceRefs.project.path || '';
  detail.rev = detail.rev || detail.sourceRefs && detail.sourceRefs.project && detail.sourceRefs.project.rev || '';
  detail.baseRev = detail.baseRev || detail.rev || '';
  detail.modified = detail.modified || detail.sourceRefs && detail.sourceRefs.project && detail.sourceRefs.project.modified || '';
  detail.publishToken = detail.publishToken || detail.updatedAt || detail.modified || '';
  detail.timeTotalAll = detail.timeTotalAll != null ? detail.timeTotalAll : detail.p16All;
  detail.timeSummaryAll = detail.timeSummaryAll || detail.p15All || [];
  detail.codeItems = detail.codeItems || detail.p14 || [];
  return detail;
}

function apiGetProjectIndex(token) {
  return catchLegacy_(function () {
    requireSession_(token);
    var ctx = makeBackendContext();
    var projects = ctx.cacheRepo.readProjects();
    var meta = ctx.cacheRepo.readMeta();
    var records = [];
    for (var key in projects) if (Object.prototype.hasOwnProperty.call(projects, key)) records.push(projects[key]);
    records.sort(function (a, b) { return String(a.jobNo || '').localeCompare(String(b.jobNo || ''), undefined, { numeric: true }); });
    var publishing = String(meta.syncStatus || '').toLowerCase() === 'publishing';
    var publishPending = publishing || (!meta.cursor && Number(meta.pendingProjectCount || 0) > 0);
    var pendingProjectCount = Number(meta.pendingProjectCount || 0);
    var completedAt = publishPending ? '' : (meta.lastSyncAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt || '');
    var cachePublishing = publishPending || (records.length === 0 && Number(meta.projectCount || 0) > 0);
    return legacyOk_({
      environment: ctx.config.environment,
      rootPath: ctx.config.dropbox.rootPath,
      schemaVersion: 1,
      generatedAt: completedAt,
      updatedAt: completedAt,
      records: records,
      recordsCount: records.length,
      projectCount: records.length,
      metaProjectCount: meta.projectCount || 0,
      pendingProjectCount: pendingProjectCount,
      uploadedJobCount: meta.uploadedJobCount || records.length,
      cachePublishing: cachePublishing,
      partialCache: cachePublishing && records.length > 0,
      message: cachePublishing
        ? (records.length ? ('Showing partial cache while full rebuild publish continues: ' + records.length + '/' + (pendingProjectCount || meta.projectCount || records.length) + ' projects available.') : 'Project index file is not available yet. Full rebuild publish may still be running.')
        : '',
      publishToken: publishPending ? (meta.lastPartialPublishAt || meta.publishStartedAt || '') : completedAt
    });
  });
}

function apiGetProjectFileIndex(token) { return apiGetProjectIndex(token); }

function apiGetProjectDetail(token, jobNo, options) {
  if (arguments.length === 1) {
    jobNo = token;
    token = '';
  }
  return catchLegacy_(function () {
    if (token) requireSession_(token);
    var ctx = makeBackendContext();
    var id = findProjectId_(ctx, jobNo);
    var detail = ctx.cacheRepo.readJob(id);
    if (!detail) throw { code: 'NOT_FOUND', message: 'Project cache not found.' };
    return legacyOk_(withDetailCompat_(detail));
  });
}

function apiCheckProjectFreshness(token, jobNo, clientVersion, options) {
  return catchLegacy_(function () {
    requireSession_(token);
    var ctx = makeBackendContext();
    var id = findProjectId_(ctx, jobNo);
    var detail = ctx.cacheRepo.readJob(id);
    var active = withDetailCompat_(detail || {});
    return legacyOk_({
      state: active.publishToken && clientVersion && clientVersion.publishToken && active.publishToken !== clientVersion.publishToken ? 'server_update_available' : 'fresh',
      activeVersion: { publishToken: active.publishToken || '', baseRev: active.baseRev || '', jobNo: active.jobNo || jobNo },
      syncStatus: legacySyncStatus_(ctx.cacheRepo.readMeta())
    });
  });
}

function apiApplyProjectPatch(token, payload) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin', 'editor']);
    payload = payload || {};
    var ctx = makeBackendContext();
    var id = findProjectId_(ctx, payload.projectId || payload.projectKey || payload.jobNo);
    var res = SaveService.saveProject(ctx.client, ctx.cacheRepo, ctx.config, {
      projectId: id,
      baseRev: payload.baseRev || '',
      patch: payload.projectPatch || payload.patch || {},
      codePatches: payload.codePatches || [],
      refreshCache: false
    });
    try {
      ctx.cacheRepo.writeJob(res.projectId || id, res.detail);
    } catch (cacheErr) {
      res.cacheWriteWarning = cacheErr && cacheErr.message || String(cacheErr);
    }
    try { updateStatusSnapshotFromMeta_(ctx.cacheRepo.readMeta(), ctx.config); } catch (ignoreSnapshot) {}
    enqueueProjectCacheRefresh_(res.jobNo || id);
    return legacyOk_({
      detail: withDetailCompat_(res.detail),
      projectId: res.projectId || id,
      jobNo: res.jobNo || payload.jobNo || id,
      newRev: res.rev || '',
      rev: res.rev || '',
      syncRequested: true,
      cachePending: res.cachePending === true,
      cacheWriteWarning: res.cacheWriteWarning || ''
    });
  });
}

function apiRefreshProjectCache(token, projectIdOrJobNo) {
  return catchLegacy_(function () {
    requireSession_(token);
    var ctx = makeBackendContext();
    var id = findProjectId_(ctx, projectIdOrJobNo);
    var refreshed = SaveService.refreshProjectCache(ctx.client, ctx.cacheRepo, ctx.config, id);
    removeProjectCacheRefresh_(refreshed.jobNo || projectIdOrJobNo);
    var meta = ctx.cacheRepo.readMeta();
    return legacyOk_({
      projectId: refreshed.projectId,
      jobNo: refreshed.jobNo,
      detail: withDetailCompat_(refreshed.detail),
      cache: refreshed.cache,
      syncStatus: legacySyncStatus_(meta),
      syncHealth: syncSnapshot_(meta, ctx.config, ctx.client)
    });
  });
}

function apiGetPublicSyncStatus() {
  return catchLegacy_(function () {
    var state = readStatusState_(AppConfig.current(), true);
    return legacyOk_({
      syncStatus: legacySyncStatus_(state.meta),
      syncHealth: syncSnapshot_(state.meta, state.config, state.client),
      autoSync: autoSyncStatus_(state.config, state.meta),
      fromSnapshot: state.fromSnapshot === true,
      statusStale: state.statusStale === true || state.meta.statusStale === true,
      lastLiveReadError: state.lastLiveReadError || state.meta.lastLiveReadError || ''
    });
  });
}

function apiGetSyncIssueLog(token) {
  return catchLegacy_(function () {
    requireSession_(token);
    var ctx = makeBackendContext();
    var meta = ctx.cacheRepo.readMeta();
    return legacyOk_({ rows: syncIssueLogFromMeta_(meta), total: (meta.syncIssueLog || []).length });
  });
}

function apiRequestIncrementalSync(token) {
  return catchLegacy_(function () {
    requireSession_(token);
    return legacyOk_(triggerGitHubDropboxSync_('apiRequestIncrementalSync'));
  });
}

function apiRequestProjectIndexSync(token) {
  return catchLegacy_(function () {
    requireSession_(token);
    return legacyOk_(triggerGitHubDropboxSync_('apiRequestProjectIndexSync'));
  });
}

function apiRunSyncNow(token) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    return legacyOk_(triggerGitHubDropboxSync_('apiRunSyncNow'));
  });
}

function apiSyncNowLegacy_() {
  return catchLegacy_(function () {
    if (APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED) return legacyOk_(appsScriptIncrementalDisabledPayload_());
    var ctx = makeBackendContext();
    var res = SyncService.syncNow(ctx.client, ctx.cacheRepo, ctx.config);
    var meta = ctx.cacheRepo.readMeta();
    return legacyOk_({ accepted: true, syncStatus: legacySyncStatus_(meta), syncHealth: syncSnapshot_(meta, ctx.config, ctx.client), result: res });
  });
}

function apiSetAutoSyncEnabled(token, enabled) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var result = SyncService.setAutoSync(enabled === true);
    var freshConfig = AppConfig.current();
    var svc = statusSnapshotService_();
    var snapshot = svc && svc.merge ? svc.merge({ autoSyncEnabled: enabled === true }, freshConfig) : null;
    var state = snapshot && svc && svc.metaFromSnapshot
      ? { meta: svc.metaFromSnapshot(snapshot), config: freshConfig, client: null }
      : readStatusState_(freshConfig, true);
    var health = syncSnapshot_(state.meta, freshConfig, state.client);
    return legacyOk_({
      ok: result.ok === true,
      enabled: enabled === true,
      autoSync: health.autoSync,
      syncStatus: legacySyncStatus_(state.meta),
      syncHealth: health
    });
  });
}

function apiName() {
  return 'Dong Engineering Project Management';
}

function envPrefix_(environment) {
  return environment === 'production_dropbox' ? 'PROD' : 'SANDBOX';
}

function redirectUri_() {
  try {
    if (typeof ScriptApp === 'undefined') return '';
    return String(ScriptApp.getService().getUrl() || '').replace(/[?#].*$/, '').replace(/\/dev$/, '/exec');
  } catch (err) {
    return '';
  }
}

function oauthStateKey_(state) {
  return 'DONG_DROPBOX_OAUTH_STATE_' + String(state || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function randomState_() {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  return String(Date.now()) + String(Math.random()).slice(2);
}

function formEncode_(payload) {
  var parts = [];
  payload = payload || {};
  for (var key in payload) if (Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]));
  }
  return parts.join('&');
}

function dropboxTokenRequest_(payload) {
  if (typeof UrlFetchApp === 'undefined') {
    throw { code: 'APPS_SCRIPT_ONLY', message: 'Dropbox OAuth exchange must run in Apps Script.' };
  }
  var res = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: formEncode_(payload),
    muteHttpExceptions: true
  });
  var text = res.getContentText() || '{}';
  var body = {};
  try { body = JSON.parse(text); } catch (err) {}
  if (res.getResponseCode() >= 300 || !body.refresh_token) {
    var summary = body.error_description || body.error || 'Dropbox token exchange failed.';
    if (/redirect_uri/i.test(summary)) summary = 'Redirect URI mismatch. Copy the exact Redirect URI shown in this screen into Dropbox App Console.';
    if (/invalid_grant|code/i.test(summary)) summary = 'The Dropbox authorization code is invalid, expired, or already used. Generate a fresh link and approve again.';
    throw { code: 'DROPBOX_TOKEN_EXCHANGE_FAILED', message: summary };
  }
  return body;
}

function dropboxAccountFromAccessToken_(accessToken) {
  if (!accessToken || typeof UrlFetchApp === 'undefined') return {};
  try {
    var res = UrlFetchApp.fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'post',
      contentType: 'application/json',
      payload: '{}',
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) return {};
    var body = JSON.parse(res.getContentText() || '{}');
    return {
      accountId: body.account_id || '',
      accountName: body.name && body.name.display_name || ''
    };
  } catch (err) {
    return {};
  }
}

function storeDropboxToken_(environment, tokenBody) {
  var prefix = envPrefix_(environment);
  var account = dropboxAccountFromAccessToken_(tokenBody.access_token);
  var updates = {};
  updates[prefix + '_DROPBOX_REFRESH_TOKEN'] = tokenBody.refresh_token || '';
  updates[prefix + '_DROPBOX_CONNECTED_AT'] = new Date().toISOString();
  updates[prefix + '_DROPBOX_ACCOUNT_ID'] = account.accountId || tokenBody.account_id || '';
  updates[prefix + '_DROPBOX_ACCOUNT_NAME'] = account.accountName || '';
  props_().setProperties(updates, false);
  return {
    connected: true,
    environment: environment,
    connectedAt: updates[prefix + '_DROPBOX_CONNECTED_AT'],
    accountId: updates[prefix + '_DROPBOX_ACCOUNT_ID'],
    accountName: updates[prefix + '_DROPBOX_ACCOUNT_NAME']
  };
}

function exchangeDropboxCode_(environment, code, redirectUri) {
  var c = AppConfig.current();
  if (!c.dropbox.appKey || !c.dropbox.appSecret) {
    throw { code: 'DROPBOX_APP_CREDENTIALS_REQUIRED', message: 'Save App Key and App Secret first.' };
  }
  code = String(code || '').trim();
  if (!code) throw { code: 'VALIDATION', message: 'Paste the Dropbox authorization code first.' };
  var payload = {
    code: code,
    grant_type: 'authorization_code',
    client_id: c.dropbox.appKey,
    client_secret: c.dropbox.appSecret
  };
  if (redirectUri) payload.redirect_uri = redirectUri;
  return storeDropboxToken_(environment || c.environment, dropboxTokenRequest_(payload));
}

function handleDropboxOAuthCallback_(parameters) {
  parameters = parameters || {};
  if (parameters.error) throw { code: 'DROPBOX_OAUTH_DENIED', message: parameters.error_description || parameters.error };
  var key = oauthStateKey_(parameters.state);
  var raw = props_() && props_().getProperty(key);
  if (!raw) throw { code: 'OAUTH_STATE_INVALID', message: 'Dropbox OAuth state is missing or expired. Generate a new authorization link.' };
  props_().deleteProperty(key);
  var record = {};
  try { record = JSON.parse(raw); } catch (err) {}
  if (!record.environment || !record.redirectUri) throw { code: 'OAUTH_STATE_INVALID', message: 'Dropbox OAuth state is invalid. Generate a new authorization link.' };
  if (Date.now() - Number(record.createdAt || 0) > 10 * 60 * 1000) throw { code: 'OAUTH_STATE_EXPIRED', message: 'Dropbox OAuth state expired. Generate a new authorization link.' };
  return exchangeDropboxCode_(record.environment, parameters.code, record.redirectUri);
}

function apiGetDropboxConfigMasked(token, environment) {
  return catchLegacy_(function () {
    requireSession_(token);
    var c = AppConfig.current();
    var state = readStatusState_(c, true);
    var meta = state.meta || {};
    var syncSnapshot = syncSnapshot_(meta, c, state.client);
    var redirectUri = redirectUri_();
    var selected = {
      environment: c.environment,
      environmentLabel: c.environment === 'production_dropbox' ? 'Production Dropbox' : 'Sandbox Dropbox',
      production: c.environment === 'production_dropbox',
      paths: { base: c.dropbox.rootPath, p: c.dropbox.pPath, ac2: c.dropbox.ac2Path, t: c.dropbox.tPath, db: c.dropbox.dbPath },
      oauth: {
        connected: !!c.dropbox.refreshToken,
        appKey: c.dropbox.appKey ? c.dropbox.appKey.slice(0, 3) + '…' + c.dropbox.appKey.slice(-4) : '',
        appSecretConfigured: !!c.dropbox.appSecret,
        refreshTokenConfigured: !!c.dropbox.refreshToken,
        accountId: c.dropbox.accountId || '',
        accountName: c.dropbox.accountName || '',
        connectedAt: c.dropbox.connectedAt || '',
        redirectUri: redirectUri
      },
      credentials: { refreshToken: c.dropbox.refreshToken ? 'configured' : '' },
      admin: { username: AuthService.publicStatus().username },
      syncStatus: legacySyncStatus_(meta),
      syncHealth: syncSnapshot,
      syncIssueLog: syncSnapshot.sync.issueLog || [],
      autoSync: syncSnapshot.autoSync
    };
    return legacyOk_({ activeEnvironment: c.environment, selected: selected, sandbox: selected, production: selected });
  });
}

function apiSaveDropboxAppCredentials(token, payload) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    if (!props_()) return legacyOk_({ saved: false });
    payload = payload || {};
    var env = payload.environment === 'production_dropbox' ? 'PROD' : 'SANDBOX';
    var updates = {};
    if (payload.appKey) updates[env + '_DROPBOX_APP_KEY'] = payload.appKey;
    if (payload.appSecret) updates[env + '_DROPBOX_APP_SECRET'] = payload.appSecret;
    if (payload.refreshToken) {
      updates[env + '_DROPBOX_REFRESH_TOKEN'] = payload.refreshToken;
      updates[env + '_DROPBOX_CONNECTED_AT'] = new Date().toISOString();
    }
    props_().setProperties(updates, false);
    return legacyOk_({ saved: true });
  });
}

function apiSaveDropboxCredentials(token, payload) { return apiSaveDropboxAppCredentials(token, payload); }

function apiSaveDropboxPathConfig(token, payload) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    if (!props_()) return legacyOk_({ saved: false });
    payload = payload || {};
    var env = payload.environment === 'production_dropbox' ? 'PROD' : 'SANDBOX';
    var paths = payload.paths || payload;
    var base = paths.base || paths.basePath || paths.rootPath || '';
    var defaults = defaultDropboxPaths_(base || AppConfig.current().dropbox.rootPath);
    var updates = {};
    if (base) updates[env + '_DROPBOX_ROOT'] = normalizeDropboxPath_(base);
    updates[env + '_DONG_P_CHRONOS_PATH'] = normalizeDropboxPath_(paths.p || paths.pPath || defaults.p);
    updates[env + '_DONG_AC2_PATH'] = normalizeDropboxPath_(paths.ac2 || paths.ac2Path || defaults.ac2);
    updates[env + '_DONG_T_CHRONOS_PATH'] = normalizeDropboxPath_(paths.t || paths.tPath || defaults.t);
    updates[env + '_DONG_DB_PATH'] = normalizeDropboxPath_(paths.db || paths.dbPath || defaults.db);
    props_().setProperties(updates, false);
    return legacyOk_({ saved: true, paths: {
      base: updates[env + '_DROPBOX_ROOT'] || AppConfig.current().dropbox.rootPath,
      p: updates[env + '_DONG_P_CHRONOS_PATH'],
      ac2: updates[env + '_DONG_AC2_PATH'],
      t: updates[env + '_DONG_T_CHRONOS_PATH'],
      db: updates[env + '_DONG_DB_PATH']
    } });
  });
}

function apiTestDropboxConnection(token) {
  return catchLegacy_(function () {
    if (token) requireSession_(token);
    var ctx = makeBackendContext();
    var started = Date.now();
    var res = ctx.client.testConnection();
    var validation = validateDropboxRoot_(ctx.client, ctx.config.dropbox.rootPath);
    var counts = { projects: 0, ac2: 0, times: 0 };
    var steps = [{ name: 'account', ms: Date.now() - started, ok: true }];
    if (validation.checks.p) {
      started = Date.now();
      counts.projects = countTxtInFolder_(ctx.client, validation.paths.p);
      steps.push({ name: 'P_Chronos', ms: Date.now() - started, ok: true, count: counts.projects });
    }
    if (validation.checks.ac2) {
      started = Date.now();
      counts.ac2 = countTxtInFolder_(ctx.client, validation.paths.ac2);
      steps.push({ name: 'AC2', ms: Date.now() - started, ok: true, count: counts.ac2 });
    }
    if (validation.checks.t) {
      started = Date.now();
      counts.times = countTxtInFolder_(ctx.client, validation.paths.t);
      steps.push({ name: 'T_Chronos', ms: Date.now() - started, ok: true, count: counts.times });
    }
    return legacyOk_({
      connected: true,
      dataReady: validation.dataReady,
      missing: validation.missing,
      counts: counts,
      accountId: res.accountId || '',
      accountName: res.name || '',
      steps: steps,
      paths: validation.paths
    });
  });
}

function apiDisconnectDropbox(token) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var prefix = envPrefix_(AppConfig.current().environment);
    var p = props_();
    if (p) {
      p.deleteProperty(prefix + '_DROPBOX_REFRESH_TOKEN');
      p.deleteProperty(prefix + '_DROPBOX_CONNECTED_AT');
      p.deleteProperty(prefix + '_DROPBOX_ACCOUNT_ID');
      p.deleteProperty(prefix + '_DROPBOX_ACCOUNT_NAME');
    }
    return legacyOk_({ disconnected: true });
  });
}

function apiGenerateDropboxAuthUrl(token, payload) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var c = AppConfig.current();
    if (!c.dropbox.appKey || !c.dropbox.appSecret) {
      throw { code: 'DROPBOX_APP_CREDENTIALS_REQUIRED', message: 'Save App Key and App Secret first.' };
    }
    var redirectUri = redirectUri_();
    var state = randomState_();
    var automaticUrl = '';
    if (redirectUri) {
      props_().setProperty(oauthStateKey_(state), JSON.stringify({ environment: c.environment, redirectUri: redirectUri, createdAt: Date.now() }));
      automaticUrl = 'https://www.dropbox.com/oauth2/authorize?' + formEncode_({
        client_id: c.dropbox.appKey,
        response_type: 'code',
        token_access_type: 'offline',
        state: state,
        redirect_uri: redirectUri
      });
    }
    var manualUrl = 'https://www.dropbox.com/oauth2/authorize?' + formEncode_({
      client_id: c.dropbox.appKey,
      response_type: 'code',
      token_access_type: 'offline'
    });
    return legacyOk_({
      authorizationUrl: automaticUrl || manualUrl,
      manualAuthorizationUrl: manualUrl,
      redirectUri: redirectUri,
      expiresAt: new Date(Date.now() + 600000).toISOString()
    });
  });
}

function apiGetDropboxOAuthStatus(token, environment) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var c = AppConfig.current();
    return legacyOk_({
      environment: environment || c.environment,
      connected: !!c.dropbox.refreshToken,
      appKeyConfigured: !!c.dropbox.appKey,
      appSecretConfigured: !!c.dropbox.appSecret,
      refreshTokenConfigured: !!c.dropbox.refreshToken,
      connectedAt: c.dropbox.connectedAt || '',
      accountId: c.dropbox.accountId || '',
      accountName: c.dropbox.accountName || '',
      redirectUri: redirectUri_()
    });
  });
}

function apiExchangeDropboxAuthorizationCode(token, payload) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    payload = payload || {};
    return legacyOk_(exchangeDropboxCode_(payload.environment || AppConfig.current().environment, payload.code, ''));
  });
}

function normalizeDropboxPath_(path) {
  path = String(path || '').trim();
  var desktop = path.match(/^[A-Za-z]:[\\/].*[\\/]Dropbox[\\/](.+)$/i);
  if (desktop) path = '/' + desktop[1].replace(/[\\]+/g, '/');
  return AppConfig.normalizePath(path || '');
}

function parentDropboxPath_(path) {
  path = normalizeDropboxPath_(path);
  if (!path) return '';
  var i = path.lastIndexOf('/');
  return i <= 0 ? '' : path.slice(0, i);
}

function defaultDropboxPaths_(basePath) {
  var base = normalizeDropboxPath_(basePath || AppConfig.current().dropbox.rootPath || '');
  return {
    base: base,
    p: normalizeDropboxPath_(base + '/Chronos/P_Chronos'),
    t: normalizeDropboxPath_(base + '/Chronos/T_Chronos'),
    ac2: normalizeDropboxPath_(base + '/AC2'),
    db: normalizeDropboxPath_(base + '/__db__')
  };
}

function listAllDropboxEntries_(client, path, recursive) {
  var out = [];
  var page = client.listFolder(normalizeDropboxPath_(path), recursive === true);
  out = out.concat(page.entries || []);
  while (page.has_more) {
    page = client.listFolderContinue(page.cursor);
    out = out.concat(page.entries || []);
  }
  return out.filter(function (entry) { return entry && entry['.tag'] !== 'deleted'; });
}

function folderExists_(client, path) {
  try {
    var meta = client.getMetadata(normalizeDropboxPath_(path));
    return meta && meta['.tag'] === 'folder';
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') return false;
    throw err;
  }
}

function fileExists_(client, path) {
  try {
    var meta = client.getMetadata(normalizeDropboxPath_(path));
    return meta && meta['.tag'] === 'file';
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') return false;
    throw err;
  }
}

function ensureFolder_(client, path) {
  path = normalizeDropboxPath_(path);
  if (!path || folderExists_(client, path)) return false;
  if (!client.createFolder) throw new Error('Dropbox create folder is not available.');
  try {
    client.createFolder(path);
    return true;
  } catch (err) {
    if (/conflict/i.test(String(err && (err.body || err.message) || '')) && folderExists_(client, path)) return false;
    throw err;
  }
}

function countTxtInFolder_(client, path) {
  if (!folderExists_(client, path)) return 0;
  var entries = listAllDropboxEntries_(client, path, false);
  var count = 0;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i]['.tag'] === 'file' && /\.txt$/i.test(entries[i].name || entries[i].path_display || '')) count++;
  }
  return count;
}

function validateDropboxRoot_(client, basePath) {
  var paths = defaultDropboxPaths_(basePath);
  var checks = {
    p: folderExists_(client, paths.p),
    t: folderExists_(client, paths.t),
    ac2: folderExists_(client, paths.ac2),
    db: folderExists_(client, paths.db)
  };
  var missing = [];
  if (!checks.p) missing.push('Chronos/P_Chronos');
  if (!checks.t) missing.push('Chronos/T_Chronos');
  if (!checks.ac2) missing.push('AC2');
  return {
    valid: missing.length === 0,
    dataReady: missing.length === 0,
    basePath: paths.base,
    paths: paths,
    checks: checks,
    missing: missing,
    dbConfigured: checks.db,
    dbWillBeCreated: !checks.db,
    steps: [
      { name: 'P_Chronos', ok: checks.p, path: paths.p },
      { name: 'AC2', ok: checks.ac2, path: paths.ac2 },
      { name: 'T_Chronos', ok: checks.t, path: paths.t },
      { name: '__db__', ok: checks.db, path: paths.db }
    ]
  };
}

function apiListDropboxFolders(token, path) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var ctx = makeBackendContext();
    var normalized = normalizeDropboxPath_(path || ctx.config.dropbox.rootPath || '');
    var entries = listAllDropboxEntries_(ctx.client, normalized, false);
    var folders = entries.filter(function (entry) {
      return entry['.tag'] === 'folder';
    }).map(function (entry) {
      return {
        name: entry.name || String(entry.path_display || '').split('/').pop(),
        path: normalizeDropboxPath_(entry.path_display || entry.path_lower || ''),
        type: 'folder'
      };
    }).sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return legacyOk_({ path: normalized, parent: parentDropboxPath_(normalized), folders: folders, entries: folders });
  });
}

function apiValidateDropboxRoot(token, path) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var ctx = makeBackendContext();
    return legacyOk_(validateDropboxRoot_(ctx.client, path || ctx.config.dropbox.rootPath));
  });
}

function apiEnsureDbFolder(token) {
  return catchLegacy_(function () {
    requireSession_(token, ['admin']);
    var ctx = makeBackendContext();
    var dbPath = normalizeDropboxPath_(ctx.config.dropbox.dbPath);
    var jobsPath = normalizeDropboxPath_(dbPath + '/jobs');
    var filesCreated = [];
    var foldersCreated = [];
    if (ensureFolder_(ctx.client, dbPath)) foldersCreated.push(dbPath);
    if (ensureFolder_(ctx.client, jobsPath)) foldersCreated.push(jobsPath);
    if (!fileExists_(ctx.client, ctx.cacheRepo.metaPath())) {
      ctx.cacheRepo.writeMeta({ schemaVersion: 1, cursor: '', syncStatus: 'idle', projectCount: 0, lastError: null });
      filesCreated.push('meta.json');
    }
    if (!fileExists_(ctx.client, ctx.cacheRepo.projectsPath())) {
      ctx.cacheRepo.writeProjects({});
      filesCreated.push('projects.json');
    }
    if (!fileExists_(ctx.client, ctx.cacheRepo.pIndexPath())) {
      ctx.cacheRepo.writePIndex({});
      filesCreated.push('p_index.json');
    }
    return legacyOk_({ ensured: true, dbPath: dbPath, foldersCreated: foldersCreated, filesCreated: filesCreated });
  });
}
function apiSwitchEnvironment(token, environment) { return catchLegacy_(function () { requireSession_(token, ['admin']); if (props_()) props_().setProperty('DONG_ENVIRONMENT', environment); return legacyOk_(legacyConfig_()); }); }

function localEnumValues_() {
  return {
    projectStatuses: ['ASSIGNED', 'COMPLETED', 'HOLD'],
    projectTypes: ['Remodel', 'Addition', 'New', 'DEFAULT'],
    codeStatuses: ['COMPLETED', 'ASSIGNED', 'HOLD'],
    codePayments: ['UNPAID', 'PAID', 'NON CHARGE'],
    codeSentValues: ['1st Sent', '2nd Sent', ''],
    codeAccounts: ['100', '1632', '']
  };
}

function apiGetEnumCatalog(token, environment) {
  return catchLegacy_(function () { if (token) requireSession_(token); return legacyOk_({ environment: environment || AppConfig.current().environment, values: localEnumValues_(), meta: {} }); });
}

function apiSaveEnumCatalog(token, payload) {
  return catchLegacy_(function () { requireSession_(token, ['admin']); return legacyOk_({ environment: payload && payload.environment || AppConfig.current().environment, values: payload && payload.values || localEnumValues_(), meta: payload && payload.meta || {} }); });
}

function apiGetAuditLog(token, limit) { return catchLegacy_(function () { requireSession_(token); return legacyOk_({ events: [] }); }); }
function apiGetBackgroundStatus(token) { return catchLegacy_(function () { requireSession_(token); return legacyOk_({ syncHealth: { sync: legacySyncStatus_({}) }, generator: { state: 'idle' } }); }); }
function apiGetSyncHealthSnapshot(token) {
  return catchLegacy_(function () {
    requireSession_(token);
    var state = readStatusState_(AppConfig.current(), true);
    return legacyOk_(syncSnapshot_(state.meta, state.config, state.client));
  });
}
function apiGetGeneratorStatus(token) { return catchLegacy_(function () { requireSession_(token); return legacyOk_({ state: 'idle' }); }); }
function apiGetBenchmarkRuns(token) { return catchLegacy_(function () { requireSession_(token); return legacyOk_({ runs: [] }); }); }
function apiGetDiagnostics(token) { return catchLegacy_(function () { requireSession_(token); return legacyOk_({ diagnostics: {} }); }); }
function apiGetErrorReport(token) { return catchLegacy_(function () { requireSession_(token); return legacyOk_({ total: 0, errors: [] }); }); }
function apiRunTests(token) { return catchLegacy_(function () { requireSession_(token, ['admin']); return legacyOk_({ passed: 0, failed: 0, note: 'Local npm tests are run outside Apps Script.' }); }); }
function apiInitializeSandbox(token) { return catchLegacy_(function () { requireSession_(token, ['admin']); return legacyOk_({ foldersCreated: [], db: { filesCreated: [] } }); }); }
function apiGenerateSampleDataset(token) { return catchLegacy_(function () { requireSession_(token, ['admin']); return legacyOk_({ state: 'disabled' }); }); }
function apiCancelGenerator(token) { return catchLegacy_(function () { requireSession_(token, ['admin']); return legacyOk_({ state: 'idle' }); }); }
function apiPauseGenerator(token) { return apiCancelGenerator(token); }
function apiResumeGenerator(token) { return apiCancelGenerator(token); }
function apiKillGenerator(token) { return apiCancelGenerator(token); }
function apiPublishGeneratedDataset(token) { return apiCancelGenerator(token); }
function apiDeleteGeneratedSampleFiles(token) { return apiCancelGenerator(token); }
function apiCleanDbOnly(token) { return apiCancelGenerator(token); }
function apiResetSandboxData(token) { return apiCancelGenerator(token); }
function apiRepairBackgroundJobs(token) { return apiCancelGenerator(token); }
function apiResetSyncJobs(token) { return apiCancelGenerator(token); }
function apiRetryCurrentWorker(token) { return apiCancelGenerator(token); }
function apiCancelCurrentSync(token) { return apiCancelGenerator(token); }
function apiRunBenchmark(token) { return catchLegacy_(function () { requireSession_(token, ['admin']); return legacyOk_({ runs: [] }); }); }
