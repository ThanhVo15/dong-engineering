# Sync V2 refactor log - 2026-08-25

## Step 1 - Read goal and starting state

- Read pasted goal from `C:\Users\ADMIN\.codex\attachments\1e93dd17-c369-4c31-a88a-360d7a4d3db4\pasted-text-1.txt`.
- Confirmed target repo: `E:\Develop\dong_engineering\dong_engineering`.
- Ran `git status --short`: all repo files currently show as untracked in this nested repository, so normal `git diff` is not useful for patch review.
- Read `log.md`: local post-`@25` optimization already exists but has not been deployed; current source has staged cache writes and large cursor-page tests.
- Confirmed no deploy/cloud mutation is approved in this request. Work must stop after local code/tests/report.

## Step 2 - Local implementation edits

- Added `src/backend/StatusSnapshotService.js` for lightweight PropertiesService sync status snapshot.
- Changed `src/backend/SyncService.js` so `syncOnce(client, cacheRepo, config, options)` is the core Sync V2 entrypoint and `syncNow()` is only the compatibility wrapper.
- Sync V2 now updates the lightweight snapshot on running/success/error/cache-publishing/missing-cursor states when Apps Script PropertiesService is available.
- Changed `src/backend/WebApi.js` status/config endpoints to read the snapshot first and only fall back to Dropbox `meta.json` when no snapshot exists.
- `apiGetPublicSyncStatus`, `apiGetSyncHealthSnapshot`, `apiGetSyncStatus`, and `apiGetDropboxConfigMasked` no longer need Dropbox reads when a snapshot exists.
- `apiSetAutoSyncEnabled` updates the snapshot without reading Dropbox metadata.
- Added disabled legacy holder `docs/legacy/SyncServiceV1.disabled.js.txt`; all entrypoints throw `SYNC_V1_DISABLED`.
- Updated `.clasp.json` push order for `StatusSnapshotService.js` and `.claspignore` to explicitly exclude `src/backend/legacy`.
- Updated `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py` cloud publish order to keep `meta.syncStatus=publishing` while jobs upload, then publish `projects.json`, `p_index.json`, and final `meta.json` once.
- Added/updated tests for snapshot-first status, disabled Sync V1 reachability, Sync V2 entrypoint contract, clean rebuild without `sync_batch.json`, and Python publish order.

## Step 3 - Verification

- Syntax checks passed:
  - `node --check src\backend\SyncService.js`
  - `node --check src\backend\CacheRepository.js`
  - `node --check src\backend\SourceService.js`
  - `node --check src\backend\WebApi.js`
  - `node --check src\backend\Config.js`
  - `node --check src\backend\StatusSnapshotService.js`
  - `node --check src\backend\CacheService.js`
  - `node --check scripts\local_full_rebuild.js`
  - `node --check scripts\local_incremental_sync.js`
  - `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`
- Targeted tests passed: `npm.cmd test -- tests/status-snapshot-service.test.js tests/legacy-api-coverage.test.js tests/local-full-rebuild-script.test.js tests/python-full-rebuild-publish.test.js tests/save-sync-service.test.js` -> 66/66.
- Full test suite passed: `npm.cmd test` -> 112/112.
- Local incremental dry-run was run because `..\.env.local` exists:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`
  - result: PASS, no publish/mutation because dry-run.
  - observed cloud cache status at start: `running`.
  - observed Dropbox events: `591`.
  - observed source changes: `331`.
  - observed affected jobs: `99`.
- No `clasp push`, no Apps Script deploy, no cloud sync/rebuild/publish command was run.

## Step 4 - Current boundary

- Local code/tests are ready for review.
- Dropbox cloud was not mutated by this implementation turn.
- Apps Script was not deployed.
- Next exact action if approved: run a real cloud sync/rebuild path with the updated local source only after explicit approval, then push/deploy Apps Script after explicit `approve deploy`.

## Step 5 - Final retest before rebuild command

- Ran final `npm.cmd test`: PASS, 113/113.
- Ran final syntax/compile checks:
  - `node --check src\backend\SyncService.js`
  - `node --check src\backend\CacheRepository.js`
  - `node --check src\backend\SourceService.js`
  - `node --check src\backend\WebApi.js`
  - `node --check src\backend\Config.js`
  - `node --check src\backend\StatusSnapshotService.js`
  - `node --check src\backend\CacheService.js`
  - `node --check scripts\local_full_rebuild.js`
  - `node --check scripts\local_incremental_sync.js`
  - `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`
- Ran static UI/API scan for sync/status names:
  - no `SyncServiceV1` usage outside `docs\legacy` and tests;
  - Client calls `apiRequestProjectIndexSync` / `apiRequestIncrementalSync` / `apiSetAutoSyncEnabled` / status endpoints, all routed through current backend wrappers;
  - status polling constants remain throttled: 5-minute idle/active status, 60-second pending continuation.
- Ran read-only incremental dry-run:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`
  - PASS, dry-run only.
  - observed current cloud cache start status: `running`.
  - observed Dropbox events: `591`.
  - observed source changes: `331`.
  - observed affected jobs: `99`.
- Added Python runner option for the requested rebuild workflow:
  - `--backup-existing-cloud-db`
  - `--backup-db-name "__db_backup__"`
  - it moves current Dropbox `__db__` to sibling backup before publishing the new full rebuild cache.
- Retested Python backup option contract:
  - `npm.cmd test -- tests/python-full-rebuild-publish.test.js tests/status-snapshot-service.test.js tests/legacy-api-coverage.test.js`: PASS, 23/23.
- Still no Dropbox cloud mutation and no Apps Script deploy in this retest turn.

## Step 6 - Cloud rebuild completed by user

- User ran cloud full rebuild command with `--cloud-rebuild --download-workers 2 --backup-existing-cloud-db --backup-db-name "__db_backup__"`.
- Pasted output confirms:
  - source scan completed: P=3157, AC2=11689, T=52474, total source txt=67320;
  - T content was skipped by design: `metadata-only` count 52474;
  - JS simple cache builder completed with projects=3157, jobs=3157, parseErrors=0;
  - cache validation passed: `simple cache ok projects=3157 jobFiles=3157`;
  - Dropbox cache backup happened: `/@ Job Information/LinkAJ/__db__ -> /@ Job Information/LinkAJ/__db_backup__`;
  - new cloud `__db__` publish completed at 03:37:33, projects=3157.
- Post-rebuild read-only dry-run:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`
  - result: PASS.
  - observed new cloud cache: `status=idle`, projects=3157, cursor present.
  - observed post-rebuild delta after the rebuild cursor: changes=6512, sourceChanges=79, affectedJobs=31.
  - This means the rebuild succeeded, but there are source changes after the rebuild cursor that should be applied by a real incremental sync before/after deployment.
- Targeted local tests after pasted rebuild output:
  - `npm.cmd test -- tests/status-snapshot-service.test.js tests/legacy-api-coverage.test.js tests/python-full-rebuild-publish.test.js`: PASS, 23/23.

## Step 7 - Fixed stale PropertiesService status recovery

- Root cause confirmed in local code:
  - `readStatusState_()` returned `DONG_LIGHTWEIGHT_SYNC_STATUS_SNAPSHOT` immediately when present;
  - after Python cloud rebuild, Dropbox `__db__/meta.json` was idle, but Apps Script `PropertiesService` could still hold an old `running` snapshot;
  - that old snapshot made `legacySyncStatus_()` show `Previous sync did not finish cleanly...`.
- Fix applied:
  - healthy idle snapshots still avoid Dropbox reads for quota safety;
  - stale `running` / `publishing` snapshots older than 15 minutes now trigger one live `__db__/meta.json` read;
  - if live meta is readable, snapshot is refreshed from the real cache meta, so UI can leave stale-running;
  - if live read hits UrlFetch quota, known project count/cursor are preserved and the snapshot is marked stale with `lastLiveReadError`.
- Verification:
  - `node --check src\backend\WebApi.js`: PASS.
  - `npm.cmd test -- tests/status-snapshot-service.test.js`: PASS, 5/5.
  - `npm.cmd test`: PASS, 115/115.
- Boundary:
  - no cloud mutation;
  - no `clasp push`;
  - no Apps Script deployment.

## Step 8 - Incremental cloud cache brought up to latest source data

- Ran real incremental cache update against Dropbox `__db__`:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local`
  - result: PASS.
  - processed Dropbox changes: 1041.
  - source changes: 635.
  - affected jobs: 121.
  - affected projects: 131.
  - skipped orphans: 0.
  - final project count: 3162.
  - cursor changed: true.
  - duration: 779 seconds.
- Ran a second real incremental pass to advance cursor through non-source events:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local`
  - result: PASS.
  - processed Dropbox changes: 132.
  - source changes: 0.
  - affected jobs: 0.
  - affected projects: 0.
  - skipped orphans: 0.
  - project count: 3162.
  - cursor changed: true.
  - duration: 8 seconds.
- Ran a third real incremental pass to advance one final non-source cursor event:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local`
  - result: PASS.
  - processed Dropbox changes: 1.
  - source changes: 0.
  - affected jobs: 0.
  - affected projects: 0.
  - skipped orphans: 0.
  - project count: 3162.
  - cursor changed: true.
  - duration: 10 seconds.
- Final read-only dry-run:
  - command: `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`
  - cache status: idle.
  - project count: 3162.
  - source changes: 0.
  - affected jobs: 0.
  - resolver diagnostics: none.
  - note: dry-run still sees one non-source cursor event, likely from the previous `__db__` metadata write; no source data remains to rebuild.

## Step 9 - GitHub Actions incremental sync plan

- Decided to move scheduled heavy sync/build work out of Apps Script to avoid Apps Script `UrlFetchApp` quota.
- Added `.github/workflows/dropbox-incremental-sync.yml`.
- Workflow behavior:
  - runs every 5 minutes with cron `*/5 * * * *`;
  - supports manual `workflow_dispatch`;
  - uses `concurrency.group = dong-dropbox-incremental-sync`;
  - uses `cancel-in-progress: false` so a previous run is not interrupted mid-cache publish;
  - writes `.env.local` from GitHub Actions variables/secrets:
    - `SANDBOX_DROPBOX_APP_KEY`
    - `SANDBOX_DROPBOX_APP_SECRET`
    - `SANDBOX_DROPBOX_REFRESH_TOKEN`
    - `SANDBOX_DROPBOX_ROOT`
  - runs only `node scripts/local_incremental_sync.js --env .env.local`;
  - does not run tests or full rebuild on the schedule.
- Rationale:
  - previous 779 second local run was a catch-up backlog after multiple days, not expected steady-state runtime;
  - 5-minute cron is acceptable once concurrency prevents overlapping cursor/cache writes.
- Still required before activation:
  - create GitHub Actions variables/secrets for `SANDBOX_DROPBOX_APP_KEY`, `SANDBOX_DROPBOX_APP_SECRET`, `SANDBOX_DROPBOX_REFRESH_TOKEN`, and `SANDBOX_DROPBOX_ROOT`;
  - push workflow to the default branch;
  - turn off Apps Script `AUTO_SYNC_ENABLED` / remove `autoSyncTick` trigger to stop duplicate scheduled sync.

## Step 10 - GitHub repository publication prep

- Target GitHub repository: `https://github.com/ThanhVo15/dong-engineering.git`.
- Remote state checked:
  - remote branch `main` existed with initial README-only commit `502e41f`.
  - local branch was attached to `origin/main` without force-push.
- Workflow updated:
  - `.github/workflows/dropbox-incremental-sync.yml` uses cron `*/5 * * * *`.
  - workflow prefers GitHub Secrets for app key/secret/refresh token and falls back to GitHub Variables with the same names.
  - `SANDBOX_DROPBOX_ROOT` is read from GitHub Variables.
  - workflow validates required values before writing `.env.local`.
- Safety checks:
  - `.gitignore` excludes `.env.local`, `.env.*.local`, temp rebuild data, `__db__`, pycache, and zip artifacts.
  - local scan found no real Dropbox credential values committed, only variable names in code/logs.
  - `npm.cmd test`: PASS, 115/115.
- Apps Script auto-sync handoff:
  - attempted `npx.cmd clasp run apiSetAutoSync --params "[false]"`;
  - result: failed with `Unable to run script function. Please make sure you have permission to run the script function.`;
  - therefore Apps Script auto-sync was not disabled by CLI in this step and still needs to be disabled from Apps Script UI/admin once GitHub Actions is active.

## Step 11 - GitHub Actions Environment Prod wiring

- User confirmed GitHub Actions Environment is named `Prod` and contains the `SANDBOX_DROPBOX_*` variables.
- Workflow adjusted:
  - job declares `environment: Prod`;
  - `.env.local` written with `DONG_ENVIRONMENT=Prod`;
  - `.env.local` also writes `DONG_DROPBOX_VAR_PREFIX=SANDBOX` so the sync runner reads `SANDBOX_DROPBOX_*` even though the GitHub Environment is named `Prod`.
- `scripts/local_incremental_sync.js` adjusted to honor optional `DONG_DROPBOX_VAR_PREFIX`.
- Verification:
  - `node --check scripts\local_incremental_sync.js`: PASS.
  - `npm.cmd test -- tests/save-sync-service.test.js tests/python-full-rebuild-publish.test.js`: PASS, 52/52.

## Step 12 - Apps Script incremental sync hard-disabled for GitHub Actions handoff

- User confirmed GitHub Actions should be the scheduled incremental runner and Apps Script should no longer run incremental sync.
- Apps Script Web API changed:
  - `autoSyncTick()` returns `APPS_SCRIPT_INCREMENTAL_DISABLED` before creating a Dropbox client;
  - `apiSyncNow()` returns disabled before creating a Dropbox client;
  - `apiRequestIncrementalSync()`, `apiRequestProjectIndexSync()`, and `apiRunSyncNow()` route through a disabled legacy payload;
  - `apiSetAutoSyncEnabled(..., true)` refuses to turn Apps Script auto-sync on and attempts `SyncService.setAutoSync(false)` to remove trigger/state.
- GitHub/local runner preserved:
  - `SyncService.syncNow()` and `syncOnce()` remain available for `scripts/local_incremental_sync.js` and GitHub Actions.
- Verification:
  - `node --check src\backend\WebApi.js`: PASS.
  - `npm.cmd test -- tests/status-snapshot-service.test.js tests/legacy-api-coverage.test.js tests/frontend-syntax.test.js`: PASS, 37/37.
  - `npm.cmd test`: PASS, 117/117.
- Deployment boundary:
  - GitHub push will update repository and Actions workflow;
  - Apps Script production will not receive this hard-disable until `clasp push` / Apps Script deployment is performed.

## Step 13 - GitHub schedule offset to improve automatic cron pickup

- GitHub manual workflow runs were observed by the user, but no automatic schedule run was visible yet.
- GitHub Actions schedule is best-effort and can be delayed/dropped during high-load periods, especially at the start of an hour.
- Workflow cron changed from `*/5 * * * *` to `1,6,11,16,21,26,31,36,41,46,51,56 * * * *`.
- This still runs every 5 minutes, but avoids minute `00`.
