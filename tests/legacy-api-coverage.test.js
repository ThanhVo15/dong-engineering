const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

test('restored old Client.html only calls WebApi endpoints that exist in the new backend', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');

  const called = new Set();
  for (const match of client.matchAll(/['"](api[A-Za-z0-9_]+)['"]/g)) {
    called.add(match[1]);
  }

  const implemented = new Set();
  for (const match of webApi.matchAll(/function\s+(api[A-Za-z0-9_]+)\s*\(/g)) {
    implemented.add(match[1]);
  }

  const missing = [...called].filter((name) => !implemented.has(name)).sort();
  assert.deepEqual(missing, []);
});

test('WebApi keeps the required legacy admin/config/auth surface', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  for (const name of [
    'apiGetConfig',
    'apiLogin',
    'apiSession',
    'apiLogout',
    'apiListUsers',
    'apiCreateUser',
    'apiUpdateUser',
    'apiDeleteUser',
    'apiResetUserPassword',
    'apiAdminChangePassword',
    'apiGetDropboxConfigMasked',
    'apiSaveDropboxAppCredentials',
    'apiSaveDropboxPathConfig',
    'apiTestDropboxConnection',
    'apiRequestIncrementalSync',
    'apiRefreshProjectCache',
    'apiGetSyncIssueLog',
    'apiSetAutoSyncEnabled'
  ]) {
    assert.match(webApi, new RegExp(`function\\s+${name}\\s*\\(`), name);
  }
});

test('WebApi save path enqueues one-job cache refresh for background retry', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  assert.match(webApi, /CACHE_REFRESH_QUEUE_KEY/);
  assert.match(webApi, /function\s+cacheRefreshTick\s*\(/);
  assert.match(webApi, /enqueueProjectCacheRefresh_/);
  assert.match(webApi, /apiApplyProjectPatch[\s\S]*refreshCache:\s*false/);
  assert.match(webApi, /apiApplyProjectPatch[\s\S]*codePatches:\s*payload\.codePatches \|\| \[\]/);
  assert.match(webApi, /SaveService\.refreshProjectCache/);
});

test('WebApi does not define duplicate public api functions', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  const counts = {};
  for (const match of webApi.matchAll(/function\s+(api[A-Za-z0-9_]+)\s*\(/g)) {
    counts[match[1]] = (counts[match[1]] || 0) + 1;
  }
  const duplicates = Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(duplicates, []);
});

test('apiGetProjectIndex reports loaded record count separately from meta count', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  assert.match(webApi, /recordsCount:\s*records\.length/);
  assert.match(webApi, /projectCount:\s*records\.length/);
  assert.match(webApi, /metaProjectCount:\s*meta\.projectCount/);
  assert.match(webApi, /pendingProjectCount:\s*pendingProjectCount/);
  assert.match(webApi, /uploadedJobCount:\s*meta\.uploadedJobCount \|\| records\.length/);
  assert.match(webApi, /partialCache:\s*cachePublishing && records\.length > 0/);
  assert.match(webApi, /cachePublishing:/);
  assert.match(webApi, /String\(meta\.syncStatus \|\| ''\)\.toLowerCase\(\) === 'publishing'/);
  assert.match(webApi, /completedAt = publishPending \? '' : \(meta\.lastSyncAt \|\| meta\.lastCacheUpdateAt \|\| meta\.lastFullRebuildAt \|\| ''\)/);
});

test('sync health separates publishing progress from completed cache timestamp', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  assert.doesNotMatch(webApi, /function\s+countPublishedJobCacheFiles_\s*\(/);
  assert.doesNotMatch(webApi, /countPublishedJobCacheFiles_\(/);
  assert.match(webApi, /var uploadedJobCount = publishPending \? Number\(meta\.uploadedJobCount \|\| meta\.projectCount \|\| 0\) : null/);
  assert.match(webApi, /uploadedJobCount:\s*uploadedJobCount/);
  assert.match(webApi, /publishStartedAt:\s*meta\.publishStartedAt/);
  assert.match(webApi, /publishedAt:\s*completedCacheAt/);
  assert.match(webApi, /publishPending\s*=\s*publishing \|\|/);
  assert.match(webApi, /completedCacheAt\s*=\s*publishPending \? ''/);
  assert.match(webApi, /publishToken:\s*publishPending \? \(meta\.publishStartedAt \|\| ''\) : completedCacheAt/);
  assert.match(webApi, /lastCacheUpdateAt:\s*meta\.lastCacheUpdateAt/);
  assert.match(webApi, /cursorPresent:\s*cursorPresent/);
});

test('sync health treats old running metadata as stale instead of active polling forever', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  const syncService = fs.readFileSync('src/backend/SyncService.js', 'utf8');
  assert.match(webApi, /function\s+isStaleRunning_\s*\(meta\)/);
  assert.match(webApi, /Date\.now\(\) - startedAt > 15 \* 60 \* 1000/);
  assert.match(webApi, /status:\s*staleRunning \? 'stale_running'/);
  assert.match(webApi, /errorCode:\s*staleRunning \? 'STALE_RUNNING'/);
  assert.match(syncService, /meta\.lastSyncStartedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(syncService, /finalMeta\.lastSyncStartedAt = ''/);
  assert.match(syncService, /errorMeta\.lastSyncStartedAt = ''/);
});

test('auto sync status exposes trigger and last check time', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  const syncService = fs.readFileSync('src/backend/SyncService.js', 'utf8');
  assert.match(syncService, /function\s+autoSyncTriggerInstalled\s*\(/);
  assert.doesNotMatch(syncService, /AUTO_SYNC_COOLDOWN/);
  assert.doesNotMatch(syncService, /function\s+autoSyncTick\s*\(/);
  assert.doesNotMatch(webApi, /resetAutoSyncTimerAfterManualSync_/);
  assert.match(webApi, /function autoSyncTick\(\)[\s\S]*?APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED[\s\S]*?APPS_SCRIPT_INCREMENTAL_DISABLED/);
  assert.match(webApi, /function\s+autoSyncStatus_\s*\(/);
  assert.match(webApi, /triggerInstalled:\s*installed/);
  assert.match(webApi, /var lastCheckedAt = meta\.lastSyncAt \|\| meta\.lastCheckedAt \|\| meta\.lastCacheUpdateAt \|\| meta\.lastFullRebuildAt \|\| ''/);
  assert.match(webApi, /lastCheckedAt:\s*lastCheckedAt/);
  assert.match(webApi, /autoSync:\s*autoSyncStatus_\(state\.config,\s*state\.meta\)/);
  assert.match(webApi, /issueLog:\s*syncIssueLogFromMeta_\(meta\)/);
  assert.match(webApi, /apiSetAutoSyncEnabled[\s\S]*syncHealth:\s*health/);
});

test('Apps Script incremental sync endpoints are hard-disabled for GitHub Actions handoff', () => {
  const syncService = fs.readFileSync('src/backend/SyncService.js', 'utf8');
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');

  assert.match(webApi, /APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED = true/);
  assert.match(webApi, /function\s+appsScriptIncrementalDisabledPayload_\s*\(/);
  assert.match(webApi, /function\s+apiSyncNow\s*\(\)[\s\S]*?APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED[\s\S]*?APPS_SCRIPT_INCREMENTAL_DISABLED/);
  assert.match(webApi, /apiSyncNowLegacy_[\s\S]*?APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED[\s\S]*?legacyOk_\(appsScriptIncrementalDisabledPayload_\(\)\)/);
  assert.match(webApi, /apiSetAutoSyncEnabled[\s\S]*?enabled === true && APPS_SCRIPT_INCREMENTAL_SYNC_DISABLED[\s\S]*?SyncService\.setAutoSync\(false\)/);
  assert.match(syncService, /function\s+syncNow\s*\(client,\s*cacheRepo,\s*config\)\s*\{[\s\S]*?return syncOnce\(client,\s*cacheRepo,\s*config\);[\s\S]*?\}/);
});

test('Sync V1 legacy holder is disabled, unreachable, and excluded from Apps Script push', () => {
  const legacy = fs.readFileSync('docs/legacy/SyncServiceV1.disabled.js.txt', 'utf8');
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const clasp = fs.readFileSync('.clasp.json', 'utf8');
  const claspIgnore = fs.readFileSync('.claspignore', 'utf8');
  const context = vm.createContext({ Error, module: { exports: {} } });

  vm.runInContext(legacy, context, { filename: 'docs/legacy/SyncServiceV1.disabled.js.txt' });
  const service = context.module.exports;

  for (const name of ['syncNow', 'syncOnce', 'collectChanges', 'affectedJobs', 'affectedJobChanges', 'setAutoSync', 'autoSyncTriggerInstalled']) {
    assert.throws(() => service[name](), /SYNC_V1_DISABLED/, name);
  }
  assert.doesNotMatch(webApi, /SyncServiceV1/);
  assert.doesNotMatch(client, /SyncServiceV1|apiSyncNowV1|apiRequestIncrementalSyncV1/);
  assert.doesNotMatch(clasp, /SyncServiceV1\.disabled|src\/backend\/legacy|docs\/legacy/);
  assert.match(claspIgnore, /\*\*\/docs\/\*\*/);
  assert.match(claspIgnore, /\*\*\/src\/backend\/legacy\/\*\*/);
});

test('Sync V2 syncOnce remains available for local and GitHub Actions runners', () => {
  const syncService = fs.readFileSync('src/backend/SyncService.js', 'utf8');
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');

  assert.match(syncService, /function\s+syncOnce\s*\(client,\s*cacheRepo,\s*config,\s*options\)/);
  assert.match(syncService, /function\s+syncNow\s*\(client,\s*cacheRepo,\s*config\)\s*\{[\s\S]*?return syncOnce\(client,\s*cacheRepo,\s*config\);[\s\S]*?\}/);
  assert.match(webApi, /APPS_SCRIPT_INCREMENTAL_DISABLED/);
  assert.doesNotMatch(webApi, /collectChanges\(client/);
});
