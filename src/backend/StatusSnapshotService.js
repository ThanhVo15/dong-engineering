var StatusSnapshotService = (function () {
  'use strict';

  var SNAPSHOT_KEY = 'DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT';

  function props() {
    if (typeof PropertiesService === 'undefined') return null;
    return PropertiesService.getScriptProperties();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function read() {
    var p = props();
    if (!p) return null;
    try {
      return JSON.parse(p.getProperty(SNAPSHOT_KEY) || 'null');
    } catch (err) {
      return null;
    }
  }

  function write(snapshot) {
    var p = props();
    if (!p) return snapshot || null;
    snapshot = snapshot || {};
    snapshot.lastStatusSnapshotAt = snapshot.lastStatusSnapshotAt || nowIso();
    p.setProperty(SNAPSHOT_KEY, JSON.stringify(snapshot));
    return snapshot;
  }

  function autoSyncEnabled(config) {
    if (config && typeof config.autoSyncEnabled === 'boolean') return config.autoSyncEnabled;
    var p = props();
    return p ? p.getProperty('AUTO_SYNC_ENABLED') === 'true' : false;
  }

  function fromMeta(meta, config, extra) {
    meta = meta || {};
    extra = extra || {};
    var cursorPresent = typeof extra.lastKnownCursorPresent === 'boolean' ? extra.lastKnownCursorPresent : !!meta.cursor;
    var projectCount = meta.projectCount;
    if (projectCount == null && meta.recordsCount != null) projectCount = meta.recordsCount;
    var lastError = meta.lastError && (meta.lastError.message || meta.lastError.code) ? meta.lastError : null;
    var snapshot = {
      lastKnownProjectCount: projectCount == null ? null : Number(projectCount),
      lastKnownCursorPresent: cursorPresent,
      lastSyncAt: meta.lastSyncAt || meta.lastCheckedAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt || '',
      autoSyncEnabled: autoSyncEnabled(config),
      lastSyncStatus: meta.syncStatus || 'unknown',
      lastSyncError: lastError,
      lastStatusSnapshotAt: nowIso()
    };
    for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) snapshot[key] = extra[key];
    return write(snapshot);
  }

  function merge(patch, config) {
    var current = read() || {};
    patch = patch || {};
    for (var key in patch) if (Object.prototype.hasOwnProperty.call(patch, key)) current[key] = patch[key];
    if (typeof current.autoSyncEnabled !== 'boolean') current.autoSyncEnabled = autoSyncEnabled(config);
    current.lastStatusSnapshotAt = nowIso();
    return write(current);
  }

  function markError(err, config) {
    var current = read() || {};
    current.autoSyncEnabled = autoSyncEnabled(config);
    current.lastSyncStatus = 'error';
    current.lastSyncError = {
      code: err && err.code || 'ERROR',
      message: err && err.message || String(err || 'Unknown error')
    };
    current.fromSnapshot = true;
    current.statusStale = true;
    current.lastLiveReadError = current.lastSyncError.message;
    current.lastStatusSnapshotAt = nowIso();
    return write(current);
  }

  function metaFromSnapshot(snapshot) {
    snapshot = snapshot || {};
    return {
      schemaVersion: 2,
      syncStatus: snapshot.lastSyncStatus || 'unknown',
      cursor: snapshot.lastKnownCursorPresent === true ? 'SNAPSHOT_CURSOR_PRESENT' : '',
      cursorPresent: snapshot.lastKnownCursorPresent,
      projectCount: snapshot.lastKnownProjectCount == null ? null : Number(snapshot.lastKnownProjectCount),
      autoSyncEnabled: snapshot.autoSyncEnabled === true,
      lastSyncAt: snapshot.lastSyncAt || '',
      lastCheckedAt: snapshot.lastSyncAt || '',
      lastCacheUpdateAt: snapshot.lastCacheUpdateAt || '',
      lastFullRebuildAt: snapshot.lastFullRebuildAt || '',
      lastError: snapshot.lastSyncError || null,
      fromSnapshot: true,
      statusStale: snapshot.statusStale === true,
      lastLiveReadError: snapshot.lastLiveReadError || ''
    };
  }

  function unknown(config, err) {
    return {
      lastKnownProjectCount: null,
      lastKnownCursorPresent: null,
      lastSyncAt: '',
      autoSyncEnabled: autoSyncEnabled(config),
      lastSyncStatus: 'unknown',
      lastSyncError: err ? { code: err.code || 'STATUS_UNKNOWN', message: err.message || String(err) } : null,
      fromSnapshot: true,
      statusStale: true,
      lastLiveReadError: err ? (err.message || String(err)) : '',
      lastStatusSnapshotAt: nowIso()
    };
  }

  return {
    key: SNAPSHOT_KEY,
    read: read,
    write: write,
    fromMeta: fromMeta,
    merge: merge,
    markError: markError,
    metaFromSnapshot: metaFromSnapshot,
    unknown: unknown
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = StatusSnapshotService;
