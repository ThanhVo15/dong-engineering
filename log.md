# PROJECT MEMORY

## PROJECT GOAL

Build lai mot repository Apps Script sach tai `E:\Develop\dong_engineering\dong_engineering`.

He thong can giu dung business behavior cua repo cu nhung khong copy/migrate toan bo repo cu. Repo cu `E:\Develop\dong_engineering` chi la reference implementation.

Muc tieu kien truc:

```text
Dropbox txt source files
  Chronos/P_Chronos
  AC2
  Chronos/T_Chronos
        -> parser/services/business rules
        -> __db__ cache/index
        -> Apps Script backend
        -> responsive UI
```

## NON-NEGOTIABLE ARCHITECTURE DECISIONS

- Dropbox `.txt` files are the source of truth.
- `__db__` is cache/index only; never make it the editable source.
- New cache shape should be simple: `meta.json`, `projects.json`, `jobs/<jobNo>.json`.
- No versioned build folder for normal 5-minute sync.
- Normal sync must be cursor-based incremental upsert/delete by affected job.
- Cursor must be committed only after corresponding cache writes succeed.
- Save is source-first: write/rename Dropbox source with revision protection, then refresh cache, then report success.
- If Dropbox save fails, cache must not pretend success and UI dirty state must remain.
- Avoid queue/state-machine/orchestrator frameworks unless a proven current use case requires them.
- Keep Python scripts that are still useful; do not delete old repo reference files.
- Responsive UI is required for desktop/tablet/mobile.

## CURRENT STATE

- Old repo path: `E:\Develop\dong_engineering`.
- New repo path requested by user: `E:\Develop\dong_engineering\dong_engineering`.
- New folder exists and now has clean scaffold files.
- New folder is now initialized as its own Git repository with nested `.git`.
- `BUILD_PLAN_2_GIAI_DOAN.md` was searched for and not found.
- `report.md` in old repo was read and used as architecture diagnosis.
- Old repo is dirty and must not be cleaned/deleted during this migration phase.
- Old repo local tests from earlier scan: `npm.cmd test` passed 80/80; syntax checks for core backend passed.
- Current session has completed initial read of required docs/status, old repo inventory, business-rule extraction, and minimal scaffold.
- Push-preview config exists. `.clasp.json` currently points to scriptId `1Y2fkWOvdX_TBrWbJMdaD5toyYTKuDzJYxLbN8UUi_L-sHfFEj9PZWeew`; verify this is the intended preview project before `clasp push`.
- Old UI is now treated as the frontend contract: every `gas('api...')` call in restored `Client.js.html` must have a backend endpoint in new `WebApi.js`.
- Old API/auth scan confirmed default account is `admin` / `dong@dmin123`, not `admin` / `admin`.
- New backend no longer uses the temporary plaintext `DONG_USERS_JSON` auth path as the primary login/user-management implementation.
- Dropbox admin folder APIs were fixed after UI error `Cannot read properties of undefined (reading 'length')`: old UI expects `folders`, `steps`, `counts`, and `filesCreated` arrays.
- `clasp push` succeeded at 2026-08-09 17:35:14 local time for 21 Apps Script files. Deployment list includes one `@HEAD` deployment.
- Current cleanup after user review: Python remains only a local initial-rebuild helper; Dropbox OAuth manual/redirect exchange is now handled in Apps Script; Audit tab is removed from admin navigation; Sync Status is simplified to cursor incremental sync/cache status, not old build queues/manifests.
- Save/Sync fast path now rebuilds existing jobs from cached `sourceRefs` plus Dropbox cursor changed entries. It avoids listing all P/AC2/T folders during normal one-job save refresh and incremental sync; full folder scan remains only as fallback for new jobs or missing refs.
- UI polling/edit guard fix in progress/completed on 2026-08-10: background public-status/index refresh no longer reloads list/detail while a Project Management input/select/textarea has focus, while dirty changes exist, or while save is flushing.
- Duplicate project identity fix in progress/completed on 2026-08-10: UI/detail/save/cache refresh must use `projectId` before numeric `jobNo`; `jobNo` alone is not unique, verified by local project `250400` having two P_Chronos source files and two job cache files.
- 2026-08-12 user-edit scope is locked down: all users can edit only project `Status` (`P6_status`), `End / Due` (`P11_endDate`), and `Project Notes` (`P5_notes`). Code items/AC2 fields remain readable and syncable from TXT but are not editable from UI/API for now.

## MIGRATION MATRIX

| Old file/module | Purpose | Decision | New destination | Reason | Status |
|---|---|---|---|---|---|
| `appsscript.json` | Apps Script manifest | REWRITE | `appsscript.json` | Need same platform, but minimal clean manifest. | TODO |
| `Code.js` | Web app entry point and maintenance helpers | REWRITE | `src/backend/App.js` or root Apps Script entry | Keep `doGet`/include/OAuth callback concept; drop old maintenance clutter. | TODO |
| `Config.js` | Environment, props, paths, permissions constants | REWRITE | `src/backend/Config.js` | Keep centralized config and Script Properties keys; simplify cache paths. | TODO |
| `Utils.js` | Path/string/date helpers | REWRITE_SMALL | `src/backend/utils/Utils.js` | Keep only helpers proven by parser/Dropbox/cache. | MIGRATED_PARSER_MINIMAL |
| `DropboxApi.js` | Dropbox HTTP, list/download/upload/move/cursor | REWRITE | `src/backend/DropboxClient.js` | Preserve token refresh, retries, unicode API arg escaping, rev-protected upload, safe rename. Drop extra surface. | TODO |
| `DropboxOAuthService.js` | OAuth app credentials and refresh token exchange | REWRITE | `src/backend/DropboxOAuth.js` | Needed for admin setup; keep lean. | TODO |
| `Repository.js` | Dropbox access plus old `__db__` envelope read/write | REWRITE | fold into `DropboxClient.js` + `CacheService.js` | Old abstraction mixes source/cache. New repo should separate Dropbox source IO from cache IO. | TODO |
| `Parser.js` | P/AC2/T parsers and date conversion | REWRITE_WITH_TESTS | `src/backend/parsers/*` | Core business rules required; rewrite with fixtures, do not copy blindly. | MIGRATED_PARSER_VERIFIED |
| `ProjectService.js` | P14/P15/P16/P18 compute, detail, index, save patch | REWRITE | `src/backend/ProjectService.js`, `SaveService.js` | Keep business outputs and save semantics; split to reduce file size. | PURE_COMPUTE_VERIFIED |
| `BuildService.js` | Versioned active build, full/incremental cache, artifacts | DROP_AS_ARCHITECTURE / REWRITE_BEHAVIOR | `src/backend/CacheService.js`, `SyncService.js` | Do not keep versioned builds; retain only behavior: rebuild cache, recompute affected job, validate. | CACHE_ASSEMBLY_VERIFIED |
| `SyncService.js` | Current sync trigger/state/cursor controller | REWRITE | `src/backend/SyncService.js` | Keep cursor invariant and auto sync idea; drop build version and retired symbols. | TODO |
| `SyncRuntime.js` | Heartbeat pure helpers | DROP_UNLESS_NEEDED | none initially | New sync should be small; add only if current workload proves timeout helper needed. | DECIDED |
| `WebApi.js` | Apps Script API endpoints and permission wrapper | REWRITE | `src/backend/WebApi.js` | Keep endpoint categories but remove dead/retired APIs. | TODO |
| `AuthService.js` | Login/session/roles | REWRITE_OR_SELECTIVE | `src/backend/AuthService.js` | Keep default `admin` / `dong@dmin123`, salted password hash, token-hash sessions, users/admin permissions. | IMPLEMENTED_TESTED |
| `EnumService.js` | Dropdown catalogs | REFERENCE | `src/backend/EnumService.js` maybe | UI has dropdowns/status/people; confirm needed fields before migrate. | TODO |
| `AuditService.js` | Audit log for project patch | REFERENCE_OPTIONAL | `src/backend/AuditService.js` optional | Useful but not core for first working save. Do not block parser/cache/save. | TODO |
| `DiagnosticsService.js` | Counters/diagnostics | DROP_OR_MINIMAL | maybe `Diagnostics.js` | Old diagnostics mostly support overbuilt system. Keep error messages instead. | TODO |
| `BenchmarkService.js` | Benchmarks/connection diagnostics | DROP_MOSTLY | none or admin connection test | Only keep real Dropbox connection test behavior. | DECIDED |
| `SandboxService.js` | Sample data generator and sandbox controls | DROP_DEFAULT | none | User wants production-safe simple app; old generator is not core. | DECIDED |
| `LiveValidationService.js` | Old live validation runner | DROP | none | It calls retired sync functions and is unsafe/noisy for clean repo. | DECIDED |
| `TestRunner.js` | Old Apps Script test harness | REFERENCE | `tests/` Node tests | Keep test ideas, not monolithic harness. | TODO |
| `Index.html` | HTML shell | REWRITE | `src/frontend/Index.html` | Keep layout concept, simplify includes. | TODO |
| `Client.html` | Large UI/client logic | REFERENCE_VISUAL_AND_BEHAVIOR | `src/frontend/*` | Keep UX, field order, interactions; rewrite state/API wiring. | TODO |
| `SearchClient.html` | Search normalization/highlight | REWRITE_SMALL | `src/frontend/search.js.html` and tests | One-character location search/highlight is required. | TODO |
| `Styles.html` | CSS | REWRITE | `src/frontend/Styles.html` | Keep visual intent but enforce responsive layouts. | TODO |
| `scripts/local_dropbox_full_rebuild.py` | Local Dropbox full rebuild tooling | KEEP_PYTHON | `scripts/local_dropbox_full_rebuild.py` later | User explicitly keeps Python; adapt to simple cache later. | TODO |
| `scripts/repair_dropbox_sync_state.py` | Dropbox sync repair tooling | KEEP_PYTHON_REFERENCE | `scripts/` maybe | Keep until new sync stabilizes; may need rewrite for new `meta.json`. | TODO |
| `scripts/build_local_db.js` | Old local builder | REFERENCE / REWRITE | `scripts/build_local_cache.js` | Business useful but outputs old versioned cache. Rewrite to simple cache. | TODO |
| `scripts/validate_local_db.js` | Old validator | REFERENCE / REWRITE | `scripts/validate_cache.js` | Keep validation idea; adapt to `meta/projects/jobs`. | TODO |
| `scripts/location_search_regression.js` | Search regression tests | REFERENCE | `tests/search.test.js` | Keep cases for one-char/highlight. | TODO |
| `scripts/*simulation.js` | Old phase simulations | DROP | none | Built for old versioned/phase sync architecture. | DECIDED |
| `test/*.test.js` | Old tests | REFERENCE | `tests/*.test.js` | Extract parser/save/sync behaviors; avoid old architecture lock-in. | TODO |
| `docs/phase-*.md` | Historical reports | DROP_FROM_NEW | none | Historical only; can confuse new architecture. | DECIDED |
| `artifacts/` | Old gate outputs | DROP_FROM_NEW | none | Generated reports, not source. | DECIDED |
| `.tmp_local_db_test*/` | Old local cache outputs | DROP_FROM_NEW | none | Generated large cache data. | DECIDED |
| `data (1).zip` | Data archive | DROP_FROM_NEW | none | Not source code; do not bring into clean repo. | DECIDED |

## FEATURE INVENTORY

### Authentication / Permission

- Login/logout exists in `AuthService.js` and Web API aliases `apiLogin`, `apiLogout`, `apiSession`.
- Roles/permissions include at least viewer/editor/admin semantics through `canViewProject`, `canApplyProjectPatch`, `canAccessAdmin`, `canManageUsers`, `canManageEnums`.
- New repo should keep minimal: viewer can read, editor can save, admin can configure Dropbox/sync/users if needed.
- Verified old default credentials: username `admin`, password `dong@dmin123`. Passwords must be stored as salted hashes; session tokens must be hashed before persistence.
- New repo implements user management APIs required by old UI: `apiListUsers`, `apiCreateUser`, `apiUpdateUser`, `apiDeleteUser`, `apiResetUserPassword`, `apiAdminChangePassword`.

### Dropbox

- Credentials are Script Properties, not hardcoded.
- Token refresh and short-lived access token cache exist in `DropboxApi.getAccessToken`.
- Dropbox API arg header escapes non-ASCII.
- Needed operations: current account, list folder/page, list changes from cursor, download, upload with revision, metadata, safe move/rename, ensure `__db__`.
- Source delete is blocked in old repo; new repo should not implement arbitrary source delete unless a confirmed business rule appears.
- Safe rename rule: same configured source root, same folder, `.txt`, same six-digit job number, destination absent.

### P_Chronos

- Filename split by `~`: F0 job token, F1 status, F2 start serial, F3 end serial, F4 assignee/name tail.
- Content split by `|`: C0 job name/type per old parser, C1 location, C2 architect, C3 customer, C4 start date, C5 end date, C6 type, C7 notes, C8 fallback status, C9 estimate, C10 progress/raw, C11 last changed by.
- Project mapping currently: P1=F0, P3=C0, P4=C1, P5=C7, P6=F1/C8, P7=C9, P8=C2, P9=C3, P10=C4 or F2 serial, P11=C5 or F3 serial, P12=C6, P13=clean F4.
- Embedded `TASK|`, `TIME|`, `SUM|` lines exist and need fixture coverage.
- Save behavior updates whitelisted P fields and may rename filename fields status/start/end/assignee.

### AC2

- Filename split by `~`, supports variant with 8 parts and variant with 7 parts where S5/S6 are packed by `;`.
- Old parser maps jobNo from S0, code=S1, status=S2, dateSerial=S3, payment=S4, account=S5, sent=S6, contact=S7.
- AC2 content: description usually field index 3, planned hours usually index 5 with tolerant fallback.
- P14 table joins AC2 rows with actual hours from T rows.
- Save behavior updates AC2 content/filename fields with revision protection and safe rename.

### T_Chronos

- Filename split by `~`: T0 job, T1 plan, T2 account, T3 task, T4 date serial, T5 hours, T6 compact code, T7 tail code.
- Code is tail after part 7 or compact T6 fallback.
- Times group by jobNo and code. P15 groups by task and sums hours; P16 is sum of visible P15 rows.

### UI

- Existing UI has list/search, location search, project detail, P overview, notes, P14 code table, P15/P16 time summary, P18 code descriptions, dirty state, apply/discard, conflict rebase, sync badge, admin panel.
- Required visual/business behavior should be migrated, but old `Client.html` implementation is too large and should be split.
- Responsive is a hard requirement; no fixed 1500px page.

### Admin

- Keep only valuable functions: connection test, path config, sync now, full rebuild, auto sync toggle, status, last error, project count.
- Drop old queue/history/generator/dashboard shells unless a confirmed business need emerges.
- Keep admin UI/API for account management, Dropbox connection, folder config, enum/dropdowns, audit/status, sync status.
- Generator/sandbox/benchmark endpoints are intentionally safe stubs/disabled responses unless a real business use case is re-confirmed.

## COMPLETED

- Read memory relevant to old repo.
- Read old `report.md`.
- Checked old repo git status and diff stat.
- Confirmed new repo folder exists and is empty.
- Scanned old repo file list and core file sizes.
- Read reference points for Parser, ProjectService save/compute, DropboxApi safety/cursor, Client UI functions, WebApi endpoints.
- Created this `log.md`.
- Created `docs/business-rules.md`.
- Created clean scaffold: `README.md`, `appsscript.json`, `package.json`, `.gitignore`, `src/backend/*`, `src/frontend/*`.
- Created parser fixture file `tests/fixtures/parser_cases.json`.
- Created fixture smoke test `tests/fixture-shape.test.js`.
- Ran initial new repo test successfully.
- Implemented minimal parser utilities.
- Implemented `PChronosParser`, `AC2Parser`, and `TChronosParser`.
- Added `tests/parser.test.js`.
- Verified parser fixture outputs and Excel serial conversion.
- Added a second AC2 fixture for code `02` so T actual-hour join is testable.
- Implemented pure ProjectService functions: P14, P15, P16, P18, progress, materializeJob.
- Verified ProjectService against parsed fixtures.
- Implemented pure CacheService cache assembly: `meta`, `projects`, `jobs`.
- Implemented stable duplicate P job number project ids using `jobNo@@safeFilename`.
- Verified cache assembly and duplicate handling.
- Initialized new nested Git repository in `E:\Develop\dong_engineering\dong_engineering`.
- Added clasp push-preview hygiene files.
- Added minimal `doGet()` preview page so a preview Apps Script can open after a safe script id is configured.
- Reviewed user-provided P/AC2/T mapping screenshots against new parser/docs/tests.
- Corrected P6 status rule to use filename F1 exactly; C8 is retained only as content metadata.
- Documented P14 column 6 as AC2 content field 5 planned hours plus summed T5 actual hours where T7 code equals S1.
- Added P18 UI label shape: `+ Code {S1} ({content field 5}h)->{content field 3}`.
- Fixed Apps Script runtime compatibility: core modules no longer evaluate CommonJS `require` at file-load time.
- Added `.clasp.json` `filePushOrder` for dependency-friendly Apps Script upload.
- Added Apps Script-like VM contract test that loads core files without `require/module`.
- Implemented pure `FullRebuildService.buildFromEntries`.
- Enhanced `CacheService` job detail with `ac2`, `times`, and structured `sourceRefs` arrays for project/AC2/time files.
- Verified FullRebuildService uses the same parsers, ProjectService, and CacheService core.
- Added `SourceService.rebuildJobFromRefs()` so existing-job refresh can download only known source files.
- Updated Save one-job refresh and incremental Sync to use `sourceRefs` fast path instead of full folder scans.
- Updated `apiApplyProjectPatch()` to write optimistic post-save job detail after Dropbox source write succeeds, keeping sourceRefs fresh for rename/save cases before background refresh.
- Fixed frontend background refresh so `Index ready` polling cannot re-render the project form while the user is typing.
- Fixed cache timestamp lineage so `lastCacheUpdateAt` drives public sync publish token, project-index `updatedAt`, and header `Cache:` time after one-job cache refresh.
- Fixed manual Sync/refresh badge so after incremental sync reloads the project index it also reloads the currently open project detail when safe.
- Fixed duplicate job routing so selecting/searching/opening/saving uses `projectId` first and only displays numeric `jobNo`.
- Fixed one-job rebuild from `sourceRefs` so isolated duplicate rebuild preserves the existing duplicate-safe projectId instead of collapsing back to plain `jobNo`.
- Fixed cache merge so refreshing one duplicate projectId does not delete sibling projects with the same numeric jobNo.
- Fixed incremental sync so shared AC2/T changes rebuild all cached duplicate project details for that jobNo, while P changes rebuild only the matching sourceRef project.
- Fixed completed cache/sync timestamp semantics on 2026-08-10: UI header now labels it `Updated:` and backend prefers `lastSyncAt` before `lastCacheUpdateAt`, so Sync Now/Reload with zero changes still updates the visible time.
- AC2 save is now implemented in `SaveService`: code table patches are passed from `apiApplyProjectPatch`, written source-first to AC2 txt files, and then the affected job cache is refreshed from the updated sourceRefs.
- 2026-08-12 UI cleanup: project details no longer render Template, File, Path / Rev, or Last Modified metadata; these are implementation/source details and should not be shown in the normal Project Management view.
- 2026-08-12 Time Spent (%) color semantics corrected: under plan is green, near plan is warning/orange, over 100% is red. This applies to the P14 code-item bars and the overall Time Spent metric.
- 2026-08-12 responsive cleanup: compacted iPhone/iPad header so Admin/Logout no longer become full-width or drop alone, and compacted mobile P14 code cards by keeping a two-column grid, hiding duplicate status in the card body, reducing padding, and shrinking the description/time controls.
- 2026-08-12 cloud full rebuild mode: `scripts/local_dropbox_full_rebuild.py` now supports `--cloud-rebuild`, which reads source TXT files from Dropbox API, builds simple `__db__` from an entries JSON staging file, and publishes directly to Dropbox cloud. This mode does not read `SANDBOX_LOCAL_ROOT` or local source folders.
- 2026-08-12 cloud rebuild encoding fix: user run failed at `CLOUD BUILD: downloaded source txt 1/66657` with `UnicodeDecodeError: 'utf-8' codec can't decode byte 0x8d`. Python cloud source download now reads bytes and decodes with UTF-8/UTF-8 BOM/UTF-16/CP1252/Latin-1 fallback, logging non-UTF8 counts instead of crashing.
- 2026-08-12 cloud rebuild rate-limit fix: user run scanned `/@ Job Information/LinkAJ` successfully with 66,657 source TXT files (P=3,142, AC2=11,562, T=51,953), then `--download-workers 12` caused heavy Dropbox `HTTP 429` throttling. Python cloud source download now defaults to one-by-one (`--download-workers 1`) and only uses `ThreadPoolExecutor` when explicitly requested.

## IN PROGRESS

- Ready-for-real-user-test hardening: preview push/manual cloud write verification remains.
- Browser/device visual acceptance still needs user/device confirmation after deployment `@10`.
- Cloud rebuild is implemented and locally syntax/unit verified; real Dropbox cloud run is still pending user execution/approval because it will rewrite cloud `__db__`.
- User's first real cloud run exposed legacy non-UTF8 source TXT. Encoding fallback is fixed; rerun the same `--cloud-rebuild` command.
- If a cloud rebuild is still running from before the parallel downloader change, stop it with Ctrl+C and rerun; running Python processes do not pick up script changes.

## OPEN ISSUES

- New repo is nested under old folder but has its own `.git`. Parent repo still sees `dong_engineering/` as an untracked nested project.
- `.clasp.json` currently has scriptId `1Y2fkWOvdX_TBrWbJMdaD5toyYTKuDzJYxLbN8UUi_L-sHfFEj9PZWeew`; confirm it is a dedicated preview Apps Script project before `clasp push`.
- Real sandbox source folders were scanned by Python full rebuild on 2026-08-09; current counts were P=3118, AC2=11342, T=51033.
- Project count conflict in historical notes: memory has both 3117 P-only and current local validation/report has 3118. Treat as checkout/data-state dependent; new code must define project as P_Chronos file and validate count from current source, not hardcode.
- Duplicate P files with same numeric jobNo require a stable key decision. User requested `jobs/<jobNo>.json`, but old memory warns duplicate job numbers exist. Need preserve simple design while avoiding data loss, likely by `projectId = jobNo` for normal case and `jobNo@@safeFilename` for duplicates.
- SaveService project and AC2 code-save flows are unit-verified source-first with conflict handling. Real Apps Script browser write still needs user-side manual confirmation on the live web app.
- Apps Script code was pushed with `clasp push`; if user is opening a versioned `/exec` deployment pinned to `@3` or `@1`, they may still see old code. Use the `@HEAD` test deployment URL or redeploy a new version after verification.
- Real UI Dropbox write has not been manually verified after the latest push.
- Local Dropbox `__db__` may temporarily contain `meta (THANH-OS's conflicted copy 2026-08-09).json` from the earlier Dropbox Desktop conflict. UI/backend read only `meta.json`; cloud and local `meta.json` are now correct.
- Current user-observed state after running full rebuild again: publish was still in progress at `uploaded job cache 500/3118`; UI showed `3.118 projects` from `meta.projectCount` but list showed no projects because `/__db__/projects.json` was not yet available. This was a real UI/publish-state bug.

## DECISIONS MADE

- Do not migrate old versioned `active_build/builds/inventory/manifests` architecture into new normal sync.
- Do not migrate old sync queues, seed reconcile, phase reports, live validation, sandbox generator, generated artifacts, or tmp cache folders by default.
- Rebuild new parser from business rules and fixtures instead of blind-copying `Parser.js`.
- Keep Dropbox safe rename and rev-protected upload semantics.
- Keep Python scripts as separate migration category.
- Full rebuild uses Python runner plus new JS core builder so parser/business logic does not diverge between Python and Apps Script.
- Project-only save does not rename unless a filename-backed field changes; a test caught and fixed accidental rename on jobName-only edits.

## FILES CHANGED

- Added `dong_engineering/log.md`.
- Added `dong_engineering/README.md`.
- Added `dong_engineering/appsscript.json`.
- Added `dong_engineering/package.json`.
- Added `dong_engineering/.gitignore`.
- Added `dong_engineering/docs/business-rules.md`.
- Added `dong_engineering/tests/fixtures/parser_cases.json`.
- Added `dong_engineering/tests/fixture-shape.test.js`.
- Added scaffold placeholders under `dong_engineering/src/backend` and `dong_engineering/src/frontend`.
- Updated `dong_engineering/src/backend/utils/Utils.js`.
- Updated parser modules under `dong_engineering/src/backend/parsers`.
- Added `dong_engineering/tests/parser.test.js`.
- Updated `dong_engineering/src/backend/ProjectService.js`.
- Updated `dong_engineering/tests/fixtures/parser_cases.json`.
- Added `dong_engineering/tests/project-service.test.js`.
- Updated `dong_engineering/src/backend/CacheService.js`.
- Updated `dong_engineering/src/backend/utils/Utils.js` for cache search/key helpers.
- Added `dong_engineering/tests/cache-service.test.js`.
- Initialized `dong_engineering/.git/`.
- Added `dong_engineering/.clasp.json`.
- Added `dong_engineering/.claspignore`.
- Updated `dong_engineering/.gitignore`.
- Updated `dong_engineering/src/backend/App.js`.
- Updated `dong_engineering/src/frontend/Index.html`.
- Updated `dong_engineering/docs/business-rules.md` after screenshot mapping review.
- Updated `dong_engineering/src/backend/parsers/PChronosParser.js` for exact P6 source.
- Updated `dong_engineering/src/backend/ProjectService.js` for P18 label output.
- Updated `dong_engineering/tests/parser.test.js`.
- Updated `dong_engineering/tests/project-service.test.js`.
- Updated `dong_engineering/.clasp.json` with core file push order.
- Updated parser/core modules to lazy-resolve Node dependencies only when `require` exists.
- Added `dong_engineering/tests/gas-runtime-contract.test.js`.
- Added `dong_engineering/src/backend/FullRebuildService.js`.
- Added `dong_engineering/tests/full-rebuild-service.test.js`.
- Updated `dong_engineering/src/backend/CacheService.js` with detailed source refs.
- Added `dong_engineering/scripts/local_full_rebuild.js`.
- Added `dong_engineering/tests/local-full-rebuild-script.test.js`.
- Updated `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py` to call the new simple cache builder when available.
- Updated `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py` to mask cursor in logged command output.
- Added/updated backend IO modules: `Config.js`, `DropboxClient.js`, `CacheRepository.js`, `SourceService.js`, `SaveService.js`, `SyncService.js`, `WebApi.js`.
- Rebuilt frontend files: `src/frontend/Index.html`, `Client.js.html`, `Styles.html`.
- Added `dong_engineering/tests/frontend-syntax.test.js`.
- Added `dong_engineering/tests/save-sync-service.test.js`.
- Added `dong_engineering/src/backend/AuthService.js`.
- Updated `dong_engineering/.clasp.json` to load `AuthService.js` before `WebApi.js`.
- Updated `dong_engineering/src/backend/WebApi.js` auth/user/session endpoints to use `AuthService`.
- Updated `dong_engineering/tests/gas-runtime-contract.test.js`.
- Added `dong_engineering/tests/auth-service.test.js`.
- Added `dong_engineering/tests/legacy-api-coverage.test.js`.
- Updated `dong_engineering/src/backend/DropboxClient.js` with `createFolder`.
- Updated Dropbox admin APIs in `dong_engineering/src/backend/WebApi.js`: folder browse returns `folders`, root validate returns `paths/checks/missing/steps`, test connection returns counts, ensure DB returns `filesCreated/foldersCreated`, save folder config accepts `pPath/tPath/ac2Path/dbPath`.
- Updated `dong_engineering/src/backend/Config.js` to normalize Dropbox Desktop local paths like `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox` into Dropbox API paths like `/Dong Engineering Sandbox`.
- Added `dong_engineering/tests/dropbox-admin-api-shape.test.js`.
- Updated `dong_engineering/README.md`.
- Created ignored temp validation output under `dong_engineering/.tmp_rebuild/__db__`.
- Updated `dong_engineering/src/backend/App.js` so Dropbox OAuth callback routes through Apps Script web app `doGet`.
- Updated `dong_engineering/src/backend/WebApi.js` with minimal Dropbox OAuth token exchange, stored account metadata, real disconnect cleanup, simplified sync snapshot, and removed unused `apiMaterializeUiViews`.
- Updated `dong_engineering/src/backend/SyncService.js` to mark normal sync mode as `incremental`.
- Updated `dong_engineering/src/frontend/Client.js.html` to remove the Audit tab, remove dead old build controls, simplify Sync Status copy, and remove the stale `maintenanceStartFullRebuild` user-facing message.
- Added `dong_engineering/tests/oauth-sync-ui-contract.test.js`.
- Updated `dong_engineering/src/backend/SyncService.js` so incremental sync skips while full rebuild cache publish is pending and does not overwrite the publish marker.
- Updated `dong_engineering/src/backend/WebApi.js` so sync health treats `publishing` or `blocked + pendingProjectCount + no cursor` as cache publish pending, separates completed cache time from publish-start time, and exposes uploaded job-cache progress.
- Updated `dong_engineering/src/frontend/Client.js.html` so the header says `Publishing:` during full cache publish and Sync Status shows `Loaded projects`, `Pending projects`, `Uploaded jobs`, `Last completed full rebuild`, and `Last incremental sync`.
- Updated `dong_engineering/tests/frontend-syntax.test.js`, `dong_engineering/tests/legacy-api-coverage.test.js`, and `dong_engineering/tests/save-sync-service.test.js` for the publish-pending/auto-sync guard.
- Updated `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py` so long cloud publish exposes a partial `projects.json` after each uploaded job-cache batch. UI can now list/search the uploaded subset while final cursor/meta waits until the full publish completes.
- Added `dong_engineering/tests/python-full-rebuild-publish.test.js` to lock the progressive partial-index publisher behavior.
- Updated `dong_engineering/src/backend/SourceService.js` with sourceRefs-based one-job rebuild.
- Updated `dong_engineering/src/backend/SyncService.js` to group cursor changes by job and pass only those changes to the one-job rebuild.
- Updated `dong_engineering/src/backend/SaveService.js` so one-job cache refresh prefers sourceRefs and duplicate-safe project lookup.
- Updated `dong_engineering/src/backend/WebApi.js` so fast save writes optimistic job detail after source success.
- Updated `dong_engineering/tests/save-sync-service.test.js` with no-full-folder-scan assertions for Save refresh and Sync.
- Updated `dong_engineering/src/frontend/Client.js.html` with `backgroundRefreshBlocked()` and safe visible-project detail reload.
- Updated `dong_engineering/src/backend/WebApi.js` to include `lastCacheUpdateAt` in public cache timestamp/publish token and to return sync status/health from `apiRefreshProjectCache`.
- Updated `dong_engineering/tests/frontend-syntax.test.js` and `dong_engineering/tests/legacy-api-coverage.test.js` for the edit guard and cache timestamp rules.
- Updated `dong_engineering/src/frontend/SearchClient.html` so exact duplicate job-number lookup can route by projectId and otherwise chooses the newest modified duplicate.
- Updated `dong_engineering/src/frontend/Client.js.html` so search/open/prefetch/detail cache/save payload use projectId-first routing.
- Updated `dong_engineering/src/backend/CacheRepository.js`, `SourceService.js`, `SyncService.js`, and `SaveService.js` for duplicate-safe one-project cache merge and rebuild.
- Updated `dong_engineering/tests/cache-repository-order.test.js`, `frontend-syntax.test.js`, and `save-sync-service.test.js` with duplicate projectId regression coverage.
- Updated `dong_engineering/src/frontend/Client.js.html` to allow editing only `P5_notes`, `P6_status`, `P11_endDate`, make all code-item controls read-only, hide implementation metadata from Project Details, and invert Time Spent (%) risk colors.
- Updated `dong_engineering/src/frontend/Styles.html` so Time Spent bars show green under plan, orange near plan, and red over plan/no-plan-with-actual.
- Updated `dong_engineering/src/backend/SaveService.js` with backend `READ_ONLY_FIELD` guards for project/code patches.
- Updated `dong_engineering/tests/frontend-syntax.test.js` and `dong_engineering/tests/save-sync-service.test.js` to lock the edit whitelist, hidden metadata, color semantics, and backend readonly enforcement.

## TESTS RUN

- `npm.cmd test` in new repo: PASS, 1/1 tests.
- `npm.cmd test` after parser implementation: PASS, 5/5 tests.
- `node --check` for Utils and parser modules: PASS.
- `npm.cmd test` after ProjectService pure compute: PASS, 9/9 tests.
- `node --check src\backend\ProjectService.js`: PASS.
- `npm.cmd test` after CacheService pure assembly: PASS, 11/11 tests.
- `node --check src\backend\CacheService.js` and `src\backend\utils\Utils.js`: PASS.
- `npm.cmd test` after clasp preview config: PASS, 11/11 tests.
- `node --check src\backend\App.js`: PASS.
- `npm.cmd test` after P/AC2/T screenshot mapping review: PASS, 11/11 tests.
- `node --check src\backend\parsers\PChronosParser.js` and `src\backend\ProjectService.js`: PASS.
- `npm.cmd test` after Apps Script `require` fix: PASS, 12/12 tests.
- `node --check tests\gas-runtime-contract.test.js`: PASS.
- `npm.cmd test` after FullRebuildService/sourceRefs: PASS, 14/14 tests.
- `node --check src\backend\FullRebuildService.js`, `src\backend\CacheService.js`, `tests\full-rebuild-service.test.js`, and `tests\gas-runtime-contract.test.js`: PASS.
- `npm.cmd test` after local builder, backend IO, UI, SaveService, SyncService: PASS, 22/22 tests.
- `npm.cmd test` after restoring old UI client: PASS, 25/25 tests.
- `npm.cmd test` after API/auth scan and AuthService rewrite: PASS, 29/29 tests.
- `node --check src\backend\AuthService.js`: PASS.
- `node --check src\backend\WebApi.js`: PASS.
- `rg "DONG_USERS_JSON|users_\(|sessions_\(|sessionFor_\(|password: 'admin'|password: \"admin\"|found\.password" src\backend\WebApi.js src\backend\AuthService.js tests log.md`: PASS; no plaintext auth path remains in `WebApi.js`.
- Local filesystem check for `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox`: exists; source counts P=3118, AC2=11342, T=51033, `__db__` exists.
- `npm.cmd test` after Dropbox admin API shape fix: PASS, 31/31 tests.
- `node --check src\backend\WebApi.js`, `src\backend\DropboxClient.js`, `src\backend\Config.js`: PASS.
- `clasp status`: tracked Apps Script files only; docs/tests/tmp untracked locally.
- `clasp push`: PASS, pushed 21 files at 2026-08-09 17:35:14 local time.
- `clasp deployments`: PASS, found 3 deployments including `AKfycbyBsP3F46oHH4dqUIIJ9RV5c-1GOPw9QVRoTpayyJcb @HEAD`.
- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- Python temp full rebuild command: `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --db-root E:\Develop\dong_engineering\dong_engineering\.tmp_rebuild\__db__ --clean`: PASS.
- Python temp full rebuild result: scanned Dropbox 72086 entries over 42 pages, source TXT P=3118, AC2=11342, T=51033, total=65493; wrote simple cache projects=3118, jobs=3118, parseErrors=0, duplicateProjectJobs=53; validation PASS.
- `clasp status`: PASS/read-only; tracked push set is `appsscript.json`, `src/backend/*`, and `src/frontend/*`.
- Old repo evidence read: prior `npm.cmd test` passed 80/80 and core `node --check` passed during report creation.
- `npm.cmd test` after OAuth/config/sync-status cleanup: PASS, 33/33 tests.
- `node --check src\backend\WebApi.js; node --check src\backend\App.js; node --check src\backend\Config.js; node --check src\backend\SyncService.js`: PASS.
- `rg "local Python runner|\['audit',\s*'Audit'\]|maintenanceStartFullRebuild|apiMaterializeUiViews|active manifests" src\frontend\Client.js.html src\backend\WebApi.js tests`: PASS; only blocking regexes remain in tests.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-09 17:46:12 local time.
- `clasp deployments`: PASS, `@HEAD` deployment remains `AKfycbyBsP3F46oHH4dqUIIJ9RV5c-1GOPw9QVRoTpayyJcb`.
- `npm.cmd test` after publish-pending Sync Status and Auto Sync guard: PASS, 41/41 tests.
- `node --check src\backend\SyncService.js; node --check src\backend\WebApi.js; node --check src\backend\DropboxClient.js`: PASS.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-09 23:17:41 local time.
- Read-only Dropbox cloud check at 2026-08-09 23:17:59: `meta.syncStatus=blocked`, `projectCount=0`, `pendingProjectCount=3118`, cursor missing, `projects.json` unavailable, `/jobs` has 1185 JSON files. This means full cache publish is incomplete; source TXT was not touched.
- `npm.cmd test` after progressive partial-index publishing: PASS, 43/43 tests.
- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- `node --check src\backend\WebApi.js; node --check src\backend\SyncService.js`: PASS.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-09 23:24:45 local time.
- `npm.cmd test` after Save/Sync sourceRefs fast path: PASS, 50/50 tests.
- `node --check src\backend\SourceService.js; node --check src\backend\SyncService.js; node --check src\backend\SaveService.js; node --check src\backend\WebApi.js`: PASS.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:27:23 local time.
- `npm.cmd test` after UI polling/edit guard and cache timestamp fix: PASS, 50/50 tests.
- `node --check src\backend\WebApi.js`: PASS. `node --check` is not applicable to `src\frontend\Client.js.html` because Node rejects `.html`; frontend script parsing is covered by the VM test in `npm.cmd test`.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:33:25 local time.
- Local actual-data inspection for project `250400`: found two P source files and two cache projectIds: `250400@@250400_COMPLETED_45896_45980_@AnhTran` and `250400@@250400_US_ASSIGNED_45896_45983_@`.
- Local actual-data rebuild for both `250400` projectIds via `SourceService.rebuildJobFromRefs`: PASS; output preserved the input projectId, used sourceRefs, did not call `listFolder`, and source/cache notes/end-date/status matched for each TXT.
- `npm.cmd test` after duplicate projectId routing/merge fix: PASS, 53/53 tests.
- `node --check src\backend\SourceService.js; node --check src\backend\CacheRepository.js; node --check src\backend\SyncService.js; node --check src\backend\SaveService.js`: PASS.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:45:14 local time.
- `npm.cmd test` after timestamp, AC2 save, and external P/AC2/T sync hardening: PASS, 59/59 tests.
- `node --check src\backend\SaveService.js; node --check src\backend\WebApi.js; node --check src\backend\SyncService.js`: PASS.
- Local read-only integration using `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox` data for project `250400`: PASS. It cloned 11 local source entries in memory, verified two duplicate-safe projectIds, saved P fields, saved AC2 code `01`, synced external P edit, synced external AC2 edit, and synced external T add without writing real source files.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:59:34 local time.
- `clasp run apiGetPublicSyncStatus`: NOT AVAILABLE, returned `Script function not found. Please make sure script is deployed as API executable.` This is a clasp/Execution API availability issue, not a local logic test pass/fail.
- `npm.cmd test` after edit-whitelist/UI metadata/color cleanup: PASS, 69/69 tests.
- `node --check src\backend\SaveService.js`: PASS.
- `clasp push --force`: PASS, pushed 21 Apps Script files at 2026-08-12 01:04:02 local time.
- `clasp version "restrict user edits and invert time spent colors"`: PASS, created version 7.
- `clasp deploy --deploymentId AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ --versionNumber 7 --description "restrict user edits and invert time spent colors"`: PASS, deployed `@7`.

## LAST VERIFIED STATE

- New repo folder exists with minimal scaffold.
- Business rules documented in `docs/business-rules.md`.
- Parser fixture shape is verified.
- Parser modules are implemented and verified against current fixtures.
- ProjectService pure compute/materialization is implemented and verified.
- CacheService pure assembly is implemented and verified.
- `.clasp.json` and `.claspignore` are present for preview push setup.
- `src/backend/App.js` has a minimal `doGet()` preview page.
- P/AC2/T core mapping is reviewed against the screenshot notes and locked by tests for P6, P14/P15/P16, and P18 basics.
- Core parser/cache files are Apps Script-safe against `ReferenceError: require is not defined`; verified by VM test without `require/module`.
- FullRebuildService core is implemented and verified from source entries to simple cache shape.
- Job cache now carries source refs required for future save/conflict/delete behavior.
- Python local full rebuild is wired to the new simple cache builder and verified in a temp `__db__`.
- DropboxClient, CacheRepository, SourceService, SaveService, SyncService, and WebApi are implemented.
- Responsive UI for list/search/filter/detail/P14/P15/P16/P17/P18/dirty/save/sync/admin status is implemented and syntax-verified.
- SaveService project save is unit-verified for source-first update and stale rev conflict.
- SyncService is unit-verified for affected-job recompute, multi-page cursor feed, cursor commit last, and failure keeping old cursor.
- Real Apps Script push/deploy and real UI Dropbox write are READY FOR MANUAL TEST, not yet verified in cloud.
- Old repo source app remains reference-only; the only intentional old-repo code change in this session is `scripts/local_dropbox_full_rebuild.py` to route full rebuild into the new simple cache builder.
- Old UI API contract is now test-locked: every static `gas('api...')` call in restored `Client.js.html` has a backend `api...` function in `WebApi.js`.
- Auth/user management is implemented with old default `admin` / `dong@dmin123`, salted password hashing, hashed session persistence, and no password/hash/salt in public user payloads.
- Dropbox Desktop path `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox` exists locally with P=3118, AC2=11342, T=51033. Backend now normalizes this local path to Dropbox API path `/Dong Engineering Sandbox`.
- Old UI folder refresh/test connection API shape is fixed and pushed: `apiListDropboxFolders` returns `folders`, `apiTestDropboxConnection` returns `steps/counts`, `apiEnsureDbFolder` returns `filesCreated/foldersCreated`.
- Dropbox OAuth setup no longer depends on Python for manual code exchange; `apiExchangeDropboxAuthorizationCode` posts to Dropbox token API from Apps Script and stores refresh token securely in Script Properties.
- Admin Audit tab is removed from visible tab list.
- Sync Status UI/backend is verified by tests to focus on cursor incremental sync, affected-job rebuild, cursor-commit-after-cache, and simple cache metadata.
- Code review found and fixed alignment issues: duplicate public APIs `apiGetProjectDetail`/`apiTestDropboxConnection`, unsafe cache publish order in `mergeJobCache`, and Python full rebuild relying on Dropbox Desktop conflict-prone local sync for `meta.json`.
- Cloud Dropbox cache now verifies as ready: `/Dong Engineering Sandbox/__db__/meta.json` has `projectCount=3118`, cursor present, `syncStatus=idle`; `/projects.json` has 3118 records; `/jobs` has 3118 JSON files.
- Apps Script backend cleanup has been pushed after alignment review.
- Header project count now uses loaded project records (`S.jobs.length`) only, formatted without locale grouping, so it shows `3118` only when records are actually loaded. While publish is incomplete it shows `0` instead of a misleading `3.118`.
- `apiGetProjectIndex` now returns `recordsCount`, `projectCount` from actual records, and `metaProjectCount` separately; UI treats empty records plus positive meta as publishing/not-ready.
- Python publisher now writes a temporary `meta.json` marker with `syncStatus=publishing`, `projectCount=0`, `pendingProjectCount=3118`, and no cursor before long job uploads; final `meta.json` is still written last after `jobs` and `projects.json`.
- Root cause of `meta: blocked` during publish was found: Auto Sync/Sync Now saw the temporary publish marker with no cursor and wrote `MISSING_CURSOR` over it. `SyncService.syncNow` now returns `CACHE_PUBLISHING` without writing meta when publish is pending.
- UI/backend now treat both `syncStatus=publishing` and the currently observed stale `syncStatus=blocked` plus `pendingProjectCount>0` plus empty cursor as cache publish pending.
- Header `Cache:` timestamp now means last completed cache update only. During pending full publish it shows `Publishing:` with publish-start time; Sync Status shows uploaded job-cache count against pending project count.
- Current cloud cache is not ready yet: `/Dong Engineering Sandbox/__db__/projects.json` is still unavailable and `/jobs` count was 1185/3118 at the last read-only check. The long-running Python process PID 25572 was still alive.
- Full rebuild publish is now progressive for the next run: after each 250 uploaded job detail files, the Python publisher writes a partial `projects.json` and partial `meta.json` with `projectCount=<uploaded available projects>`, `pendingProjectCount=3118`, `uploadedJobCount=<uploaded jobs>`, `partialCache=true`, empty cursor, and `syncStatus=publishing`.
- Existing in-flight Python process PID 25572 was started before the progressive-publish patch, so it may not expose partial `projects.json`; if it finishes successfully it will still publish the final full `projects.json` and final `meta.json`.
- The in-flight old publisher failed after `uploaded job cache 2750/3118` with `urllib.error.URLError: <urlopen error [WinError 10060]>`. This was a transient Dropbox/network timeout during upload, not a parser/source-data failure.
- `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py` now retries transient Dropbox RPC/upload/download failures: 429, 5xx, `URLError`, `TimeoutError`, `socket.timeout`, and Windows network errors 10053/10054/10060.
- Python publisher now supports same-build resume: if cloud `meta.json` has the same `lastFullRebuildAt`, empty cursor, and matching `pendingProjectCount`, it lists existing `/__db__/jobs/*.json`, skips already uploaded job cache files, and publishes partial/full `projects.json` from the local cache.
- Resume command executed successfully: `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --db-root C:\Users\ADMIN\AppData\Local\Temp\dong_simple_cache_build_ib2ii8sm\__db__ --publish-existing-cache`. It found 2842/3118 existing job cache files, uploaded the remaining files, published partial indexes, then wrote final `projects.json` and `meta.json`.
- Final read-only cloud verification after resume: `/Dong Engineering Sandbox/__db__/meta.json` has `syncStatus=idle`, `projectCount=3118`, cursor present, `lastError=null`; `/projects.json` has 3118 records; `/jobs` has 3118 JSON files.
- User reported project-count refresh button showed toast `Sync request failed: Request failed`, but browser F5 showed new data. Root cause: frontend only reloaded project index for sync states `completed/success/synced`; new sync final state is `idle`, so backend cache could update while the UI kept stale local index until page reload.
- Updated `src/frontend/Client.js.html`: `pollPublicStatus()` now treats `idle` as a ready state for publish-token based index reload; `requestProjectIndexSync()` now clears local index cache and reloads `apiGetProjectIndex` after sync request success, and if sync response is unclear/fails it still tries to reload the project index before showing an error.
- Updated `loadIndex()` and `loadDirectProjectFileIndex()` to return Promises and always clear the loading badge on success or failure.
- Added frontend regression coverage for idle-state reload and unclear-sync-response reload behavior.
- `npm.cmd test`: PASS, 46/46 tests.
- `node --check src\backend\WebApi.js; node --check src\backend\SyncService.js`: PASS.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:12:15 local time.
- User reported Save can stay `Saving...` too long; source TXT was updated locally but UI kept showing old cache/detail until refresh. Root cause: `SaveService.saveProject()` wrote source and then synchronously rebuilt/merged affected job cache before returning, so UI waited on Dropbox list/download/cache writes and did not show the optimistic saved values immediately.
- Updated `src/backend/SaveService.js`: default behavior can still rebuild cache synchronously for tests/tools, but `refreshCache:false` returns after source write with an optimistic detail containing the patched project fields, new rev/path, and `cachePending=true`. Added `refreshProjectCache()` for one-job cache rebuild.
- Updated `src/backend/WebApi.js`: `apiApplyProjectPatch` now calls `SaveService.saveProject(... refreshCache:false)`, enqueues the affected job for background cache refresh, and returns `syncRequested/cachePending`. Added `apiRefreshProjectCache` for immediate one-job refresh and `cacheRefreshTick` queue fallback via Script Properties/time trigger so cache can still update if the user leaves after save.
- Updated `src/frontend/Client.js.html`: after save response, UI shows the returned patched detail immediately, then calls `apiRefreshProjectCache` for that job; when refresh finishes it swaps in the rebuilt cache detail and reloads index. If refresh fails, source save is still treated as successful and background retry remains queued.
- Added tests for fast source-first save, one-job cache refresh, background queue API surface, and frontend save flow.
- `npm.cmd test`: PASS, 50/50 tests.
- `node --check src\backend\SaveService.js; node --check src\backend\WebApi.js; node --check src\backend\SourceService.js`: PASS.
- `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:18:02 local time.
- Save/Sync sourceRefs fast path is implemented and locally verified: existing-job refresh/download uses cached source file refs and cursor changed entries, not full folder scans.
- Duplicate numeric jobNo lookup is safer for incremental sync: when a changed path matches a cached detail's `sourceRefs`, that detail is preferred before falling back to `jobs/<jobNo>.json`.
- Apps Script preview was pushed after the Save/Sync sourceRefs fast-path change at 2026-08-10 00:27:23.
- UI edit stability fix is locally verified by tests: background `Index ready` refresh is blocked while Project Management controls are focused/dirty/saving.
- Cache timestamp fix is locally verified by tests: one-job cache updates expose `lastCacheUpdateAt` through public sync status/index metadata so header `Cache:` can show the newest cache update time.
- Apps Script preview was pushed after the UI polling/edit guard and cache timestamp fix at 2026-08-10 00:33:25.
- Duplicate projectId routing is locally verified: project `250400` has two source/cache records, and one-job rebuild now preserves each distinct projectId instead of collapsing to `250400`.
- Apps Script preview was pushed after the duplicate projectId routing/cache-merge fix at 2026-08-10 00:45:14.
- Header timestamp now represents last completed sync/check/update: backend exposes `lastSyncAt || lastCacheUpdateAt || lastFullRebuildAt`, and frontend displays `Updated:` for completed cache state.
- Save and sync are locally verified against both fixture data and read-only cloned sandbox data for project `250400`: UI-style P edits, AC2 edits, external P/AC2 edits, and external T add all refresh the affected job cache correctly.
- Apps Script preview was pushed after timestamp and AC2 save/sync fixes at 2026-08-10 00:59:34.
- 2026-08-11 hardening: header now displays `Auto Sync checked:` when auto sync is enabled and uses `lastSyncAt`/`lastCheckedAt` first, so the user can see the latest 5-minute auto-sync check even when there are 0 Dropbox changes.
- Auto sync status now reports `triggerInstalled`, `intervalMinutes`, `lastCheckedAt`, `lastChangeCount`, and affected projects through public/admin sync APIs.
- Frontend P14 client-side time display no longer rounds decimal actual hours to integers; `0.25` remains visible instead of becoming `000`.
- Incremental sync is regression-tested for external AC2 content edit, external AC2 filename rename, external T add, and decimal T hours.
- Apps Script versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` was redeployed to `@5` with description `auto sync timestamp and incremental AC2/T fixes`.
- AC2 content description rule corrected on 2026-08-11: if content field `C2` has shape `<code>~<description>~<plannedHours>~...`, parser uses `C2[1]` as description and `C2[2]` as planned hours. Field `C3` remains fallback for legacy rows where `C2` is only the code.
- Apps Script versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` was redeployed to `@6` with description `AC2 code payload description parser fix`.
- Apps Script versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` was redeployed to `@7` with description `restrict user edits and invert time spent colors`.
- Current verified user edit scope: only Status, End / Due, and Project Notes are editable in UI and accepted by backend save. AC2/code-item edits are blocked by frontend and backend, while external TXT AC2/T sync behavior remains covered by tests.
- Fixed read-only code description expand bug: `descriptionEditable` was accidentally scoped inside `renderProjectNotes()` while `renderCodeTable()` used it, causing the Info/description expand action to fail at runtime. It now lives inside `renderCodeTable()`, so descriptions can be opened read-only while still not editable.
- Apps Script versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` was redeployed to `@8` with description `fix read-only code description expand`.
- Password visibility UI added on 2026-08-12: login, admin login, profile password change, admin account password change, create user temporary password, reset user password, Dropbox app secret, and refresh token fields now have show/hide controls.
- Account management review: AuthService keeps users in Script Properties as salted SHA-256 hashes, does not return hash/salt/password to browser, supports `admin`, `editor`, `viewer`, `disabled`, restricts user management APIs to admin, prevents deleting/disabling the last active admin, prevents deleting the current user's own account, and revokes sessions by incrementing `sessionVersion` when disabling/resetting/changing password.
- Long-term limitation: current account management is appropriate for a small internal Apps Script app. It is not a full identity system: no MFA, no login rate limit/lockout, only 6-character minimum password rule, and user catalog size is bounded by Apps Script Properties limits.
- Apps Script versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` was redeployed to `@9` with description `password visibility and account role review`.

## NEXT EXACT ACTION

Hard refresh the Apps Script web app using the redeployed `@9` `/exec` URL. Verify password eye toggles on Login, Admin > My Account, Admin > Users > Add User, Admin > Users > Reset Password, and Dropbox Connection secret/token fields. Then create one viewer and one editor test account, confirm viewer can open projects read-only and editor can edit only Status, End / Due, and Project Notes.

## SESSION HISTORY

### 2026-08-11

- User reported the header still showed `Cache: 08/11/2026, 1:56 AM`; desired behavior is to show the latest Auto Sync check time every 5 minutes, even when Dropbox returns 0 changes.
- User also reported code-item Apply Changes did not work, and external TXT tests 8/9/10 did not update through incremental sync; test 10 looked rounded or missing for `0.25` hours.
- Read `log.md`, checked git status/diff, and inspected `SyncService`, `WebApi`, `App`, `Client.js.html`, `CacheRepository`, `SaveService`, `DropboxClient`, and parser/time render code before editing.
- Verified local sandbox `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox\__db__\meta.json` already had `lastSyncAt=2026-08-10T19:14:59.788Z`, newer than `lastCacheUpdateAt=2026-08-10T19:04:13.946Z`; this proves backend sync/check time can advance while the UI/deployment still displayed stale cache wording.
- Updated `SyncService` with `autoSyncTriggerInstalled()` and richer `setAutoSync()` return fields.

### 2026-08-12

- User requested UI cleanup: invert Time Spent (%) colors so over-plan values are red, restrict all users to edit only Status, End / Due, and Project Notes, and hide Template/File/Path/Rev/Last Modified implementation metadata.
- Read `log.md`, checked `git status`, attempted `git diff`, inspected `Client.js.html`, `Styles.html`, `SaveService.js`, and relevant tests before editing.
- Updated frontend edit whitelist to `P5_notes`, `P6_status`, and `P11_endDate`; `editableCodeField()` now returns false and code description textarea is guarded by that function.
- Updated backend `SaveService.saveProject()` to reject read-only project fields and any code-item patch with `READ_ONLY_FIELD`, so API calls cannot bypass the UI lock.
- Updated Time Spent tone logic and CSS: low/under-plan is green, 50-84% warning, 85-100% orange, over 100% red.
- Removed Template/File/Path/Rev/Last Modified render calls from Project Details.
- Ran `npm.cmd test`: PASS, 69/69.
- Ran `node --check src\backend\SaveService.js`: PASS.
- Pushed and deployed Apps Script version `@7` to deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ`.
- User reported code description could no longer be opened after the read-only edit lock.
- Root cause: `descriptionEditable` was declared inside `renderProjectNotes()` but referenced in `renderCodeTable()`, causing the description expand render to throw.
- Moved `descriptionEditable` into `renderCodeTable()` and updated frontend regression coverage so the guard must stay in that function.
- Ran `npm.cmd test`: PASS, 69/69.
- `clasp push --force`: PASS, pushed 21 Apps Script files at 2026-08-12 01:08:35 local time.
- `clasp version "fix read-only code description expand"`: PASS, created version 8.
- `clasp deploy --deploymentId AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ --versionNumber 8 --description "fix read-only code description expand"`: PASS, deployed `@8`.
- User requested password-eye visibility controls and review of create/delete/update account behavior for admin/editor/viewer.
- Reviewed `AuthService.js`, `WebApi.js`, and `Client.js.html`: backend user management is admin-only, stores salted hashes, sanitizes user payloads, and protects last active admin. Viewer/editor/admin role permissions are centralized in `ROLE_PERMISSIONS`.
- Added reusable `passwordInputHtml()` and `bindPasswordToggles()` in frontend. Replaced raw password inputs in login/profile/admin/create-user/Dropbox credential fields and replaced reset-password `window.prompt()` with a modal that has a show/hide password button.
- Added CSS `.password-control` and `.password-toggle`.
- Added tests for password show/hide coverage and reset modal, plus AuthService role/lifecycle guards.
- Ran `npm.cmd test`: PASS, 71/71.
- Ran `node --check src\backend\AuthService.js` and `node --check src\backend\WebApi.js`: PASS.
- `clasp push --force`: PASS, pushed 21 Apps Script files at 2026-08-12 21:18:44 local time.
- `clasp version "password visibility and account role review"`: PASS, created version 9.
- `clasp deploy --deploymentId AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ --versionNumber 9 --description "password visibility and account role review"`: PASS, deployed `@9`.
- Updated `WebApi` with `autoSyncStatus_()` so public/admin APIs expose `enabled`, `triggerInstalled`, `intervalMinutes`, `lastCheckedAt`, `lastChangeCount`, and affected projects.
- Updated frontend header to show `Auto Sync checked:` when Auto Sync is enabled and `Updated:` otherwise; `syncRefreshIso()` now prefers `lastSyncAt`/`lastCheckedAt`.
- Updated Admin Sync Status to show `Last check` inside the Auto Sync box.
- Fixed frontend P14 decimal display by changing client-side `pad3()` from integer `Math.round()` to `round2()`.
- Added tests for auto sync status, header wording, frontend decimal hours, external AC2 filename rename, and external T `0.25` add.
- Ran `npm.cmd test`: PASS, 63/63.
- Ran `node --check src\backend\SyncService.js; node --check src\backend\WebApi.js; node --check src\backend\SaveService.js`: PASS.
- Ran read-only local integration with actual sandbox source files, cloned in memory only: `220004` AC2 content edit PASS, `220016` AC2 rename PASS, `220008` T add `0.25` PASS (`p16All` moved from `28.25` to `28.5`).
- Ran `clasp push --force`: PASS, pushed 21 files at 2026-08-11 02:20:56 local time.
- Ran `clasp version "auto sync timestamp + AC2/T incremental fixes"`: created version 5.
- Redeployed deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` to `@5`.
- Ran `clasp deployments`: confirmed `@HEAD`, `@5`, and `@1`; `@5` has description `auto sync timestamp and incremental AC2/T fixes`.
- User showed real AC2 content for `220004` where `QA_TXT_AC2_220004` was in content field `C2` subfield 1, while UI still showed old `C3` text `soil compaction...`.
- Root cause: `AC2Parser.parseContent()` prioritized field `C3`; the actual editable business description can live in `C2` shaped like `<code>~<description>~<plannedHours>~...`.
- Updated `AC2Parser` to prefer `C2[1]` description when present and use `C2[2]` as planned hours fallback. `C3` remains fallback for rows where `C2` only contains the code.
- Updated `SaveService.applyAc2ContentFields()` so UI description saves back to `C2[1]` and also mirrors `C3` for compatibility.
- Added fixture using the exact user-provided content string and tests for parsing, external sync from code payload field, and save writing both fields.
- Ran `npm.cmd test`: PASS, 65/65.
- Ran exact parser snippet for user content: PASS, output `description=QA_TXT_AC2_220004`, `plannedHours=1`.
- Ran `clasp push --force`: PASS, pushed 21 files at 2026-08-11 02:28:54 local time.
- Ran `clasp version "AC2 code payload description parser fix"`: created version 6.
- Redeployed deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ` to `@6`.

### 2026-08-10

- User asked for final usability hardening: header time should mean last sync/update, reload should update that time even with no changes, and save/sync should be tested across UI edits and local Dropbox source edits.
- Read `log.md`, checked git status/diff, and re-read relevant Save/WebApi/frontend code before editing.
- Changed backend timestamp priority in `legacySyncStatus_`, `syncSnapshot_`, and `apiGetProjectIndex` to `lastSyncAt || lastCacheUpdateAt || lastFullRebuildAt`.
- Changed frontend header label from stale-looking `Cache:` to `Updated:` for completed cache state, while keeping `Publishing:` during full publish.
- Found AC2 save was still a real gap: frontend collects `codePatches`, but `apiApplyProjectPatch` did not pass them to `SaveService`.
- Implemented AC2 source-first save in `SaveService`: metadata/rev check, optional safe same-folder rename, source upload, sourceRefs update, optimistic detail update, and one-job cache refresh from updated refs.
- Fixed refresh after P/AC2 rename so it uses the optimistic detail with updated sourceRefs instead of stale pre-save refs.
- Added regression tests for multi-field P save, AC2 code save, external P edit sync, external AC2 edit sync, external T add sync, WebApi `codePatches` forwarding, and frontend `Updated:` label.
- Ran `npm.cmd test`: PASS, 59/59.
- Ran backend syntax checks for `SaveService.js`, `WebApi.js`, and `SyncService.js`: PASS.
- Ran a read-only local integration on project `250400` from `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox`: PASS; no real source files were modified because the test cloned files into memory.
- Ran `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:59:34.
- Ran `clasp deployments`: confirmed `@HEAD` deployment `AKfycbyBsP3F46oHH4dqUIIJ9RV5c-1GOPw9QVRoTpayyJcb` plus versioned deployments `@3` and `@1`.
- Tried `clasp run apiGetPublicSyncStatus`: blocked by Apps Script Execution API setup/function exposure (`Script function not found...`), so live API execution was not counted as verified.

- User asked to optimize the sync/incremental/save call graph so it makes the fewest Dropbox calls possible while keeping the requested source-first/cache-after behavior.
- Read `log.md`, checked git status/diff, and inspected `SourceService`, `SyncService`, `SaveService`, `WebApi`, `CacheRepository`, and Save/Sync tests.
- Found the main hot path bug: Save one-job refresh and incremental sync were still calling `SourceService.rebuildJob()`, which lists all P/AC2/T folders before filtering one job.
- Added `SourceService.rebuildJobFromRefs()` to rebuild an existing job from cached `sourceRefs` plus current cursor changed entries. It downloads only known source files and falls back to full folder scan only for new jobs/missing refs.
- Updated `SyncService.syncNow()` to group Dropbox cursor entries by jobNo and feed only that job's changes into `rebuildJobFromRefs()`.
- Updated `SaveService.refreshProjectCache()` to use the sourceRefs fast path and to locate cached detail by duplicate-safe project key when only a numeric jobNo is provided.
- Updated `apiApplyProjectPatch()` to write optimistic job cache detail immediately after Dropbox source save succeeds, before queueing background refresh.
- Added tests asserting Save refresh and Sync do not call `listFolder()` when sourceRefs are available.
- Ran `npm.cmd test`: PASS, 50/50.
- Ran backend syntax checks for `SourceService.js`, `SyncService.js`, `SaveService.js`, and `WebApi.js`: PASS.
- Ran `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:27:23 local time.
- User reported major UI bug: while status says `Index ready`, typing in fields gets reset like a page refresh; source TXT changes are saved/changed but the open UI detail remains old; header `Cache:` stayed at `08/10/2026 12:11 AM` around 12:22.
- Found two causes: public-status polling could call `loadIndex(false)` while the user had an active editor field focused, and public/index timestamp output omitted `meta.lastCacheUpdateAt`.
- Updated frontend with `activeEditorHasFocus()` and `backgroundRefreshBlocked()`; polling now reloads index/detail only when no dirty changes, no save in flight, and no Project Management input/select/textarea is focused.
- Updated manual project-index sync so after index reload it safely reloads the currently open project detail.
- Updated save cache-refresh return handling so it applies refreshed detail only if the user has not started another edit/focus; otherwise it caches the detail without re-rendering over the user's input.
- Updated backend `legacySyncStatus_()` and `apiGetProjectIndex()` so `lastCacheUpdateAt` is the completed cache timestamp/publish token before `lastSyncAt`/`lastFullRebuildAt`.
- Updated `apiRefreshProjectCache()` to return fresh `syncStatus` and `syncHealth` after the cache merge.
- Ran `npm.cmd test`: PASS, 50/50.
- Ran `node --check src\backend\WebApi.js`: PASS. Frontend `.html` syntax is covered by the VM test in `npm.cmd test`.
- Ran `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:33:25 local time.
- User reported the issue still happens and asked for local test on project code `250400`; UI showed `Project list refreshed. Sync response was unclear: Request failed` and data below TXT differed from UI.
- Inspected local Dropbox sandbox data for `250400`; confirmed two P source files exist: `250400~COMPLETED~45896~45980~@AnhTran.txt` and `250400~US ASSIGNED~45896~45983~@.txt`.
- Inspected local `__db__/jobs` and `projects.json`; confirmed two distinct duplicate-safe cache IDs exist for the same numeric jobNo.
- Root cause found: frontend selection/save/open paths often preferred numeric `jobNo` over `projectId`, and backend one-job rebuild/merge could collapse/delete duplicate sibling cache entries.
- Updated SearchClient exact lookup to route projectId exactly and choose newest modified duplicate when only a numeric jobNo is entered.
- Updated Client routing to use `projectId` first for search suggestion open, auto-open, prefetch, detail cache key, save payload, `apiRefreshProjectCache`, and detail refresh.
- Updated CacheRepository merge to accept `staleProjectIds`; SaveService passes the current projectId so sibling duplicates are not deleted.
- Updated SourceService one-job rebuild to preserve existing duplicate-safe projectId when rebuilding an isolated duplicate from sourceRefs.
- Updated SyncService so AC2/T changes rebuild all duplicate project details for a jobNo, and P changes rebuild only the touched project detail.
- Added duplicate regression tests and local actual-data rebuild verification for `250400`.
- Ran `npm.cmd test`: PASS, 53/53.
- Ran syntax checks for changed backend modules: PASS.
- Ran `clasp push`: PASS, pushed 21 Apps Script files at 2026-08-10 00:45:14 local time.

### 2026-08-09

- User requested Phase 1 clean rebuild in `E:\Develop\dong_engineering\dong_engineering`.
- Read required docs/status first per rule.
- Confirmed `BUILD_PLAN_2_GIAI_DOAN.md` absent.
- Confirmed old repo contains overbuilt versioned cache/sync architecture and new repo should use simple `meta.json`, `projects.json`, `jobs/<jobNo>.json`.
- Created initial project memory.
- Documented P/AC2/T business mappings in `docs/business-rules.md`.
- Scaffolded clean repo files and parser fixtures.
- Ran `npm.cmd test`: fixture smoke passed 1/1.
- Implemented parser utilities and P/AC2/T parsers.
- Ran `npm.cmd test`: parser suite passed 5/5.
- Implemented ProjectService pure business calculations.
- Ran `npm.cmd test`: parser + ProjectService suite passed 9/9.
- Implemented pure CacheService assembly and duplicate projectId handling.
- Ran `npm.cmd test`: parser + ProjectService + CacheService suite passed 11/11.
- Ran `git init` in new repo folder.
- Added `.clasp.json`, `.claspignore`, safer `.gitignore`, and minimal preview `doGet`.
- Ran `npm.cmd test`: still passed 11/11.
- Reviewed mapping against the three user screenshots.
- Fixed P6 to use F1 as the exact UI status source and documented C8 as duplicate content metadata only.
- Documented P14 column 6 and P18 formula exactly from the screenshot notes.
- Ran `npm.cmd test`: passed 11/11.
- User reported Apps Script error `ReferenceError: require is not defined` in `src/backend/CacheService`.
- Reworked dependency access in parser/cache/project core to lazy Node fallback guarded by `typeof require`.
- Added clasp file push order and VM runtime test for Apps Script-like no-CommonJS load.
- Ran `npm.cmd test`: passed 12/12.
- Implemented FullRebuildService and detailed sourceRefs in CacheService.
- Ran `npm.cmd test`: passed 14/14.
- Added new JS local full rebuild builder and wired existing Python runner to call it for simple cache output.
- Ran Python temp full rebuild against sandbox Dropbox/local files; validation passed with 3118 projects and 0 parse errors.
- Implemented Config, DropboxClient, CacheRepository, SourceService, SaveService, SyncService, and WebApi.
- Implemented responsive UI with list/search/filter/detail/edit/save/sync/auto-sync controls and P14/P15/P16/P17/P18 rendering.
- Added Save/Sync invariant tests including source-first save, conflict, multi-page cursor, and cursor commit-last failure behavior.
- Ran `npm.cmd test`: passed 22/22.
- Ran `clasp status`: tracked files are only Apps Script manifest/backend/frontend.
- User clarified the UI must be the old Project Management UI, not a newly designed dashboard.
- Replaced the newly designed frontend shell with old repo `Index.html`, `Styles.html`, and `SearchClient.html`.
- Adjusted includes to new repo paths: `src/frontend/Styles`, `src/frontend/SearchClient`, `src/frontend/Client.js`.
- Rewrote `Client.js.html` as a thin clean-data client that renders into the old UI shell mounts/classes: `summaryBar`, `detailsMount`, `notesMount`, `codeMount`, `timeMount`, `adminPanel`, `editFooterMount`.
- Added frontend regression tests proving old shell mounts remain and SearchClient parses.
- Ran `npm.cmd test`: passed 24/24.
- Ran `clasp status`: tracked frontend files now include old UI shell/style/search plus clean client.
- User rejected the thin clean client because 100% old UI/admin behavior is required.
- Copied old repo `Client.html` byte-for-byte into new `src/frontend/Client.js.html`.
- Verified SHA256 match for old/new `Client`, `Styles`, and `SearchClient`; `Index` differs only in Apps Script include paths for the new folder layout.
- Added WebApi compatibility wrappers for old Client endpoints including auth/session, project index/detail, Apply Changes, public sync status, user management, Dropbox config/connection, enum catalog, audit/status placeholders.
- Added frontend regression test for old Details button, Users admin tab, Dropbox Connection tab, Folder Setup tab, `renderUsersPanel`, and related API calls.
- Ran `npm.cmd test`: passed 25/25.
- User correctly rejected the temporary API scan gap: UI had been restored but auth/admin/API behavior was not fully scanned/locked.
- Scanned old `AuthService.js` and old `WebApi.js` auth/config/user endpoints.
- Confirmed old default admin is `admin` / `dong@dmin123`; old implementation stores salted SHA-256 password hashes and hashed session tokens.
- Added new `src/backend/AuthService.js` with default admin bootstrap, salted password hashing, hashed session persistence, role permissions, login/logout/session, user create/update/delete/reset, and password change.
- Updated `.clasp.json` and Apps Script runtime contract test to load `AuthService.js` before `WebApi.js`.
- Rewired new `WebApi.js` legacy auth/user APIs to `AuthService` instead of the temporary plaintext `DONG_USERS_JSON` path.
- Removed dead plaintext-auth helper block from `WebApi.js` (`users_`, `sessions_`, `sessionFor_`, `password: 'admin'`). `AuthService` alone owns auth; it only references `DONG_USERS_JSON` as one-time migration input if temporary data exists.
- Added `apiSaveDropboxCredentials`, `apiGetDropboxOAuthStatus`, `apiMaterializeUiViews`, and `apiName` coverage to prevent old UI calls from missing backend functions.
- Added `tests/auth-service.test.js` and `tests/legacy-api-coverage.test.js`.
- Ran `npm.cmd test`: passed 29/29.
- Ran `node --check src\backend\AuthService.js`: PASS.
- Ran `node --check src\backend\WebApi.js`: PASS.
- Re-ran scan for plaintext auth remnants: only `AuthService.js` migration constant `DONG_USERS_JSON` remains; `WebApi.js` has no plaintext default-password helper.
- User reported Dropbox admin UI error: connected account but Test Connection showed 0 projects/AC2/timesheets and Folder Refresh threw `Cannot read properties of undefined (reading 'length')`.
- Verified local Dropbox Desktop folder `C:\Users\ADMIN\Dropbox\Dong Engineering Sandbox` exists with AC2, Chronos, and `__db__`; counted source TXT files: P=3118, AC2=11342, T=51033.
- Root cause found in new `WebApi.js`: `apiListDropboxFolders` returned `entries` instead of old UI's expected `folders`; `apiTestDropboxConnection` returned `steps: []` and no counts; `apiEnsureDbFolder` returned no `filesCreated`.
- Fixed Dropbox admin API shape and actual folder validation/counting in `WebApi.js`.
- Added Dropbox Desktop path normalization in `Config.js` and `WebApi.js`, so local path input maps to Dropbox API path `/Dong Engineering Sandbox`.
- Added `DropboxClient.createFolder` for `apiEnsureDbFolder`.
- Added `tests/dropbox-admin-api-shape.test.js`.
- Ran `npm.cmd test`: passed 31/31.
- Ran syntax checks for `WebApi.js`, `DropboxClient.js`, and `Config.js`: PASS.
- Ran `clasp push`: pushed 21 Apps Script files successfully.
- Ran `clasp deployments`: confirmed one `@HEAD` deployment exists plus versioned deployments `@3` and `@1`.
- User clarified Python must not be required for web config; it is only for initial local rebuild.
- Implemented Apps Script-native Dropbox OAuth exchange and callback handling.
- Removed visible Audit tab from admin navigation.
- Simplified Sync Status around the intended cursor incremental model: Dropbox cursor -> affected files/jobs -> cache update -> cursor commit after cache success.
- Removed old `maintenanceStartFullRebuild` wording and unused `apiMaterializeUiViews`.
- Ran `npm.cmd test`: passed 33/33.
- Ran syntax checks for `WebApi.js`, `App.js`, `Config.js`, and `SyncService.js`: PASS.
- Ran targeted regex scan: PASS; old Python/OAuth, Audit tab, build-manifest, and materialize strings no longer exist in source code.
- Ran `clasp push`: pushed 21 Apps Script files successfully at 17:46:12.
- Ran `clasp deployments`: confirmed `@HEAD` deployment `AKfycbyBsP3F46oHH4dqUIIJ9RV5c-1GOPw9QVRoTpayyJcb`.
- User asked for full code alignment review because UI showed `0 projects` and `Sync request failed`.
- Found local/default Dropbox `__db__` had old versioned cache files plus new `meta.json` with empty cursor/projectCount 0. This made incremental sync correctly fail with `MISSING_CURSOR`.
- Fixed `CacheRepository.mergeJobCache` to write job detail before publishing `projects.json`, then update `meta.json` last.
- Removed duplicate public API definitions in `WebApi.js`.
- Added tests: `cache-repository-order.test.js` and duplicate public API guard in `legacy-api-coverage.test.js`.
- Updated `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: simple cache only, no legacy active-build fallback; build in non-Dropbox staging folder for default cloud publish; publish cache to Dropbox by API; upload `jobs` first, `projects.json` second, `meta.json` last; retry Dropbox 429 write throttling.
- First default rebuild exposed Dropbox Desktop conflict: good local meta was renamed to `meta (THANH-OS's conflicted copy 2026-08-09).json` while `meta.json` stayed blocked/projectCount 0.
- A failed publish attempt deleted cloud/local synced `jobs`; source TXT was not touched. Rebuilt from source after changing to staging publish.
- Final cloud verification passed: `cloudProjectCount=3118`, `cloudCursorPresent=true`, `cloudSyncStatus=idle`, `cloudProjectsJsonCount=3118`, `cloudJobFiles=3118`, `lastFullRebuildAt=2026-08-09T11:16:18.736Z`.
- Ran `npm.cmd test`: passed 35/35.
- Ran syntax checks for `CacheRepository.js`, `WebApi.js`, `local_full_rebuild.js`, and Python full rebuild runner: PASS.
- Ran `clasp push`: pushed 21 Apps Script files successfully at 22:43:41.
- Ran `clasp deployments`: confirmed `@HEAD` deployment `AKfycbyBsP3F46oHH4dqUIIJ9RV5c-1GOPw9QVRoTpayyJcb`.
- Verified local Dropbox `__db__` after sync: `meta.json` has `projectCount=3118`, cursor present, `syncStatus=idle`; local `jobs` has 3118 JSON files.
- User asked why UI still showed no projects while publish log was at 500/3118.
- Verified live cloud mismatch: `meta.json` existed with final-ish count, but `/Dong Engineering Sandbox/__db__/projects.json` returned Dropbox `path/not_found`; cloud `jobs` was only partially published.
- Uploaded temporary publishing marker to cloud `meta.json`: `projectCount=0`, `syncStatus=publishing`, `pendingProjectCount=3118`, cursor empty.
- Updated frontend header count to use `S.jobs.length` only and no locale grouping, preventing `3.118` display before records are loaded.
- Updated UI empty state to show publishing/not-ready when meta says cache is pending but records are unavailable.
- Updated `apiGetProjectIndex` to separate loaded records count from meta count.
- Updated Python full rebuild publisher to write a publishing marker before long uploads and final meta only at the end.
- Ran `npm.cmd test`: passed 37/37.
- Ran backend/script syntax checks and Python compile: PASS. `node --check Client.js.html` is not applicable because Node cannot check `.html` directly; frontend VM test passed.
- Ran `clasp push`: pushed 21 Apps Script files successfully at 23:08:34.
- Checked publish progress after push: cloud `/jobs` had 805 JSON files while Python process 25572 was still running.
- User asked whether Sync Status/Cache time should show last updated time, project count, and current status more clearly.
- Confirmed the UI confusion was real: `Cache: 08/09/2026, 10:50 PM` was using stale `lastFullRebuildAt` even while the current full cache publish was not complete.
- Read-only cloud check showed current state: `meta.syncStatus=blocked`, `projectCount=0`, `pendingProjectCount=3118`, no cursor, `projects.json` unavailable, and `/jobs` count 1185/3118.
- Found root cause of `blocked`: Auto Sync/Sync Now ran against the temporary publish marker with no cursor and overwrote the marker with `MISSING_CURSOR`. This must be treated as publish-pending, not as a true empty project set.
- Updated `SyncService.syncNow` so pending full cache publish returns `CACHE_PUBLISHING` and does not write `meta.json`.
- Updated `WebApi.syncSnapshot_` so publish-pending cache shows project progress and withholds completed cache timestamp/cursor until final meta is written.
- Updated frontend header and Sync Status to show `Publishing:` plus pending/uploaded counts during full publish, and `Cache:` only for last completed cache update.
- Ran `npm.cmd test`: passed 41/41.
- Ran backend syntax checks for `SyncService.js`, `WebApi.js`, and `DropboxClient.js`: PASS.
- Ran `clasp push`: pushed 21 Apps Script files successfully at 23:17:41.

# GĐ1 COMPLETION REPORT

## App hiện làm được gì

- Load `projects.json` and `jobs/<projectKey>.json` from Dropbox `__db__`.
- Show project list/search/filter and open project detail.
- Show/edit P fields and render P14/P15/P16/P17/P18.
- Save project P fields source-first to Dropbox TXT, then rebuild affected job cache.
- Run cursor-based Sync Now and Auto Sync trigger setup.

## Architecture cuối cùng

Dropbox TXT is source of truth. `__db__` is disposable cache: `meta.json`, `projects.json`, `jobs/<projectKey>.json`. Full rebuild, Save, and Sync use shared parser/business/cache core.

## Python Full Rebuild

Existing `scripts/local_dropbox_full_rebuild.py` now calls `dong_engineering/scripts/local_full_rebuild.js` when present. Temp integration run passed on sandbox data: P=3118, AC2=11342, T=51033, total TXT=65493, projects=3118, jobs=3118, parseErrors=0.

## Save behavior

Implemented project P save and AC2 code save with revision conflict protection, safe same-folder same-job rename when needed, source write before cache merge, affected-job cache refresh, and dirty UI success/failure behavior.

## Incremental behavior

Implemented Dropbox cursor continue, multi-page consumption, affected-job recompute, projects index update, cursor commit last, and failure retaining old cursor.

## Responsive status

CSS keeps the old Project Management UI contract but now has compact header behavior for tablet/mobile: no free header wrap under 1024px, iPad hides low-priority environment badge instead of dropping Logout, and phone uses a two-row compact control grid. Mobile P14 cards now stay dense with a two-column grid, duplicate body Status hidden, smaller time bar, and smaller Description action. Deployed to Apps Script web deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @10`.

## Latest verification

- Ran `npm.cmd test`: PASS, 74/74.
- Ran `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- Ran `node --check E:\Develop\dong_engineering\dong_engineering\scripts\local_full_rebuild.js`: PASS.
- Ran `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --help`: PASS; `--cloud-rebuild` is available.
- Ran targeted Python decode check for byte `0x8d`: PASS; decoded via Latin-1 without raising `UnicodeDecodeError`.
- Ran `npm.cmd test -- tests/python-full-rebuild-publish.test.js`: PASS, 6/6.
- Ran `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --help`: PASS; `--download-workers` is available, default 1.
- Ran `clasp push --force`: PASS, pushed 21 files at 2026-08-12 21:26:48 local time.
- Ran `clasp version "compact responsive header and mobile cards"`: PASS, created version 10.
- Ran `clasp deploy --deploymentId AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ --versionNumber 10 --description "compact responsive header and mobile cards"`: PASS.

## Next exact action

Stop the current parallel cloud rebuild if still running, then rerun one-by-one to avoid Dropbox HTTP 429 throttling: `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --cloud-rebuild --download-workers 1 --dropbox-root "<new root>" --p-dropbox-path "<new root>/Chronos/P_Chronos" --ac2-dropbox-path "<new root>/AC2" --t-dropbox-path "<new root>/Chronos/T_Chronos" --db-dropbox-path "<new root>/__db__"`. Omitting `--download-workers` is also safe now because the default is 1.

## 2026-08-12 Cloud Rebuild Rate Limit Fix

### Current State

- User retried cloud rebuild with `--download-workers 12`.
- Dropbox returned many `HTTP 429` responses while downloading source TXT files.
- This is a Dropbox throttling/rate-limit issue caused by parallel downloads, not evidence that source data or parser mapping is broken.

### Completed

- Changed `scripts/local_dropbox_full_rebuild.py` cloud rebuild default download mode from parallel workers to one-by-one.
- `--download-workers` remains available for explicit future tuning, but default is now `1`.
- Added a true sequential branch in `write_cloud_entries_json` when `workers == 1`.
- Kept optional `ThreadPoolExecutor` branch only when user explicitly passes `--download-workers > 1`.
- Updated `tests/python-full-rebuild-publish.test.js` to assert the safe default and sequential branch.

### Tests Run

- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- `npm.cmd test -- tests/python-full-rebuild-publish.test.js`: PASS, 6/6.

### Last Verified State

- Cloud rebuild code compiles.
- Targeted publisher tests pass.
- Default `--cloud-rebuild` no longer uses parallel download workers.

### Next Exact Action

Stop any currently running 12-worker rebuild, then run: `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --cloud-rebuild --download-workers 1 --dropbox-root "/@ Job Information/LinkAJ" --p-dropbox-path "/@ Job Information/LinkAJ/Chronos/P_Chronos" --ac2-dropbox-path "/@ Job Information/LinkAJ/AC2" --t-dropbox-path "/@ Job Information/LinkAJ/Chronos/T_Chronos" --db-dropbox-path "/@ Job Information/LinkAJ/__db__"`. Watch for `HTTP 429`; if it still happens, keep sequential mode and let retry/backoff finish rather than increasing workers.

## 2026-08-13 Cloud Rebuild T Content Fast Path

### Current State

- User's one-by-one cloud rebuild reached 6,000/66,657 source TXT files after about 78 minutes, which projects to many hours.
- Verified from code that `TChronosParser.js` parses T rows from filename metadata only.
- Verified from local sandbox that T_Chronos file bodies do exist and may contain notes: about 51,034 T files, about 28,676 have non-empty-ish content, about 700 are over 100 bytes.
- Decision: do not claim T files have no content. Correct statement is that current cache/UI behavior does not use T file body content.

### Completed

- Changed cloud rebuild default to skip downloading T_Chronos file bodies and write T entries as `content: ""`, `encoding: "metadata-only"`.
- Added explicit `--download-t-content` flag for full T body download when/if timesheet notes need to be migrated or displayed.
- Kept P_Chronos and AC2 body downloads because their parsers use content.
- Added logging for `skippedContent` so rebuild output shows how many file bodies were intentionally skipped.
- Updated publisher tests to assert default T metadata-only behavior and the explicit full-content flag.

### Tests Run

- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- `npm.cmd test -- tests/python-full-rebuild-publish.test.js`: PASS, 7/7.
- `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --help`: PASS; `--download-t-content` appears.

### Last Verified State

- Default `--cloud-rebuild` now downloads only P/AC2 bodies plus T metadata.
- `--download-t-content` preserves the slow full-body path for T.
- Existing publish phase still uploads job caches progressively after cache build starts.

### Next Exact Action

Stop the currently running one-by-one full-body cloud rebuild, then rerun the same cloud rebuild command without `--download-t-content`: `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --cloud-rebuild --download-workers 1 --dropbox-root "/@ Job Information/LinkAJ" --p-dropbox-path "/@ Job Information/LinkAJ/Chronos/P_Chronos" --ac2-dropbox-path "/@ Job Information/LinkAJ/AC2" --t-dropbox-path "/@ Job Information/LinkAJ/Chronos/T_Chronos" --db-dropbox-path "/@ Job Information/LinkAJ/__db__"`. Expect logs to show `skipping T content` and `skippedContent` increasing for T files.

## 2026-08-13 Cloud Rebuild Missing Source Guard

### Current State

- User's fast-path rebuild reached about 50,000/66,662 entries, then failed on Dropbox `HTTP 409 path/not_found` for `/@ Job Information/LinkAJ/Chronos/P_Chronos/250484~COMPLETED~45992~46236~@LamDo.txt`.
- Interpretation: Dropbox listed that file during scan, but the file disappeared or was renamed before content download.
- This is different from `HTTP 429`: 429 retries; 409 path/not_found is a source mutation/race during a long live cloud rebuild.

### Completed

- Added `DropboxPathNotFoundError`.
- `dropbox_download_bytes` now detects Dropbox `409 path/not_found` separately.
- `download_cloud_source_entry` returns a `_sourceMissing` marker instead of crashing for disappeared P/AC2 files.
- `write_cloud_entries_json` skips missing source entries, logs `source disappeared after scan`, and increments `missingSource`.
- Fixed JSON output ordering so skipped entries do not write dangling commas.
- Added failure hygiene: if cloud rebuild fails unexpectedly in the future, the temp source entries folder is kept for inspection instead of always being deleted.
- Added tests for missing-source skip and temp preservation.

### Tests Run

- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- `npm.cmd test -- tests/python-full-rebuild-publish.test.js`: PASS, 9/9.

### Last Verified State

- Cloud rebuild will no longer fail the entire run only because one scanned P/AC2 source path disappears before download.
- `missingSource` is visible in progress logs.
- Old crashed run likely cannot resume from 50k because the previous script version deleted its temp source entries folder on failure.

### Next Exact Action

Rerun cloud rebuild explicitly with one worker and no T body download: `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --cloud-rebuild --download-workers 1 --dropbox-root "/@ Job Information/LinkAJ" --p-dropbox-path "/@ Job Information/LinkAJ/Chronos/P_Chronos" --ac2-dropbox-path "/@ Job Information/LinkAJ/AC2" --t-dropbox-path "/@ Job Information/LinkAJ/Chronos/T_Chronos" --db-dropbox-path "/@ Job Information/LinkAJ/__db__"`. Watch for `missingSource`; a small number indicates live source changes during rebuild and should not block cache publication.

## 2026-08-16 Apps Script UrlFetch Quota / Polling Fix

### Current State

- User reported web UI repeatedly showing `Index refresh failed: Service invoked too many times for one day: urlfetch`.
- Verified cloud Dropbox cache directly via local Python, not Apps Script: `/@ Job Information/LinkAJ/__db__/projects.json` exists with 3,143 records, `meta.json` exists with cursor present, but `meta.syncStatus` was stuck as `running`.
- Root cause found in code: `apiGetPublicSyncStatus` built `syncSnapshot_`, and when cache was publish-pending it called `countPublishedJobCacheFiles_`, which listed `/__db__/jobs` from Dropbox during frontend status polling. Frontend also polled public status every 15 seconds forever and `waitForSyncPublish` polled every 1 second after some manual refresh/sync flows.
- Interpretation: UI was consuming Apps Script `UrlFetchApp` quota with status polling and Dropbox job-count checks, separate from the 5-minute Apps Script auto-sync trigger.

### Completed

- Removed the Dropbox `/jobs` count from public sync status. `syncSnapshot_` now uses `meta.uploadedJobCount || meta.projectCount || 0` instead of calling Dropbox list APIs.
- Removed `countPublishedJobCacheFiles_` helper from `WebApi.js`.
- Throttled frontend public status polling: idle/completed status polls every 5 minutes; active/publishing/running status polls every 60 seconds.
- Throttled `waitForSyncPublish` from 1-second polling x30 to 5-second polling x12.
- Throttled admin Sync Status follow-up polling from 2/5 seconds to 30/60 seconds.
- Added stale running guard: old `meta.syncStatus='running'` older than 15 minutes is treated as `STALE_RUNNING` instead of active forever.
- `SyncService.syncNow` now writes `lastSyncStartedAt` when starting and clears it on success/error.
- Cleared cloud cache metadata from stale `running` to `idle` after confirming `projects.json` count matched `meta.projectCount` and cursor was present.
- Pushed Apps Script source with `clasp push --force`.
- Created Apps Script version 11 and redeployed existing versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @11`.

### Tests Run

- `npm.cmd test -- tests/legacy-api-coverage.test.js tests/frontend-syntax.test.js tests/save-sync-service.test.js`: PASS, 47/47.
- `node --check src\backend\WebApi.js`: PASS.
- `node --check src\backend\SyncService.js`: PASS.
- `npm.cmd test`: PASS, 81/81.

### Last Verified State

- Dropbox cache cloud state after local direct check: `syncStatus=idle`, `projectCount=3143`, `projectsCount=3143`, cursor present.
- Deployed Apps Script version 11 contains throttled polling and no public status Dropbox job-count list.
- If Apps Script daily UrlFetch quota is already exhausted, the current web app may still fail until Google's quota window resets.

### Next Exact Action

Hard refresh the deployed web app URL after quota reset or from a fresh browser tab. Verify it loads 3,143 projects. Then leave the page open for at least 2 minutes and confirm the header does not visibly refresh every 15 seconds; normal status refresh should be idle 5-minute polling, while Apps Script auto sync remains a separate 5-minute trigger.

## Manual tests cần user làm

- Confirm preview-safe `.clasp.json` scriptId.
- `clasp push`.
- Set Script Properties credentials/paths.
- Run real `python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --clean` if ready to replace sandbox `__db__`.
- Open web app and test Save, external TXT edit + Sync Now, add/edit/delete/rename source, Auto Sync, and conflict scenario.

## 2026-08-16 Auto Sync Cooldown After Manual Sync

### Current State

- User confirmed desired timing: normal auto sync every 5 minutes, but if user manually clicks Sync at 10:12, the next automatic incremental sync must be based on that manual sync time, so it should not call Dropbox before 10:17.
- Existing Apps Script time-based trigger can wake on Google's schedule, so the app-level guard is responsible for skipping early ticks without touching Dropbox.

### Completed

- Added `SyncService.autoSyncTick(client, cacheRepo, config, nowMs)` and `autoSyncCooldown()` with a 5-minute minimum interval based on `meta.lastSyncAt || meta.lastFullRebuildAt`.
- Updated Apps Script trigger `autoSyncTick()` in `WebApi.js` to call `SyncService.autoSyncTick()` instead of blindly running `apiSyncNow()`.
- Manual Sync still runs immediately through `apiSyncNow()` / `SyncService.syncNow()` and updates `meta.lastSyncAt` when successful.
- Auto trigger ticks before the cooldown expires return `AUTO_SYNC_COOLDOWN` and do not call Dropbox `list_folder/continue`.
- Added regression tests proving a manual sync at `10:12` skips an auto tick at `10:15`, then permits sync at `10:17`.
- Pushed Apps Script source with `clasp push --force`.
- Created Apps Script version 12 and redeployed existing versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @12`.
- Tightened the manual sync behavior after that deploy: successful manual Sync now calls `SyncService.setAutoSync(true)` when Auto Sync is enabled, deleting the old trigger and creating a fresh 5-minute trigger from the manual sync time.
- Created Apps Script version 13 and redeployed existing versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @13`.
- User asked to change the manual Sync wait loop from 5 seconds to 15 seconds.
- Updated frontend `waitForSyncPublish()` to use `SYNC_WAIT_PUBLISH_MS = 15 * 1000`, while keeping idle public status polling at 5 minutes and active/running/publishing polling at 60 seconds.
- Created Apps Script version 14 and redeployed existing versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @14`.

### Tests Run

- `npm.cmd test -- tests/save-sync-service.test.js tests/legacy-api-coverage.test.js`: PASS, 30/30.
- `node --check src\backend\SyncService.js`: PASS.
- `node --check src\backend\WebApi.js`: PASS.
- `npm.cmd test`: PASS, 83/83.
- `npm.cmd test -- tests/frontend-syntax.test.js tests/legacy-api-coverage.test.js tests/cache-service.test.js`: PASS, 29/29.
- `node --check src\frontend\Client.js.html`: NOT APPLICABLE; Node 24 rejects `.html` extension directly. Frontend syntax is covered by `tests/frontend-syntax.test.js`.

### Last Verified State

- Version `@14` contains the manual-sync cooldown guard, manual-sync trigger reset, and 15-second manual publish wait loop.
- Public/admin status polling remains throttled from version `@11`: idle/completed public status polling is 5 minutes, running/publishing is 60 seconds, manual publish wait polling is 15 seconds.
- Cloud cache direct verification from the previous step remains: `syncStatus=idle`, `projectCount=3143`, `projects.json` has 3143 records, cursor present.
- If Apps Script daily UrlFetch quota is already exhausted, browser UI may still show quota errors until Google resets that quota window even though the deployed code is quieter.

### Next Exact Action

After Apps Script UrlFetch quota resets, hard refresh the `@14` deployed web app. Click manual Sync once, verify the header time moves forward, then leave the page open: successful manual Sync should recreate the auto trigger; UI should wait for publish/status at 15-second intervals; any early trigger tick still skips with `AUTO_SYNC_COOLDOWN`; the first eligible auto sync should occur no earlier than 5 minutes after the manual sync's successful `lastSyncAt`.

## 2026-08-16 Stale Auto Sync Timestamp Diagnosis

### Current State

- User reported the header still showed `Auto Sync checked: 08/13/2026, 8:25 AM` on 2026-08-16.
- Direct Dropbox API read from local Python, not Apps Script, showed current cloud cache at `/@ Job Information/LinkAJ/__db__`: `syncStatus=idle`, `projectCount=3143`, `projects.json` has 3143 records, cursor present, `lastCacheUpdateAt=2026-08-16T00:49:11.385Z`, but `lastSyncAt` is empty.
- Interpretation: full cloud cache is present, but Apps Script incremental/auto sync has not successfully completed and written `lastSyncAt` since rebuild. If the browser is still showing 08/13, it is likely reading stale browser/App Script status while `UrlFetchApp` quota is failing, not the current cloud `meta.json`.

### Completed

- Updated `autoSyncStatus_()` so `autoSync.lastCheckedAt` falls back to `meta.lastSyncAt || meta.lastCheckedAt || meta.lastCacheUpdateAt || meta.lastFullRebuildAt`, avoiding a blank check time immediately after full rebuild.
- Updated frontend header to show `Auto Sync stale:` instead of `Auto Sync checked:` when the visible timestamp is older than 15 minutes.
- Added regression coverage for the fallback and stale label.
- Pushed Apps Script source and redeployed existing versioned deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @15`.

### Tests Run

- `npm.cmd test -- tests/frontend-syntax.test.js tests/legacy-api-coverage.test.js tests/save-sync-service.test.js`: PASS, 49/49.
- `node --check src\backend\WebApi.js`: PASS.
- `node --check src\backend\SyncService.js`: PASS.
- `npm.cmd test`: PASS, 83/83.

### Last Verified State

- Deployment `@15` contains stale timestamp warning and auto sync lastCheckedAt fallback.
- Direct cloud cache is valid at `/@ Job Information/LinkAJ/__db__`, but Apps Script `UrlFetchApp` quota may still block UI/API/manual sync until reset.

### Next Exact Action

After quota resets, hard refresh the `@15` web app. If the header says `Auto Sync stale`, click Sync once. Success means `Auto Sync checked:` moves to the current time and `meta.lastSyncAt` is written; failure with `Service invoked too many times for one day: urlfetch` means Apps Script quota is still exhausted.

## 2026-08-17 Incremental Sync No Full-Scan Guard

### Current State

- User clarified the `projects` refresh button must run real Dropbox cursor incremental sync, not just a UI/cache reload.
- Root mistake identified: incremental sync was allowed to fall back from `SourceService.rebuildJobFromRefs()` into `rebuildJob()`, which lists the configured P_Chronos, AC2, and T_Chronos source folders. That fallback is unsafe inside Apps Script normal sync because the source has tens of thousands of TXT files and can burn `UrlFetchApp` quota.

### Completed

- Updated `src/backend/SourceService.js` so `rebuildJobFromRefs()` no longer falls back to folder scanning when cache/sourceRefs are missing.
- New incremental rule: use only cached `sourceRefs` plus Dropbox cursor changed entries. If no P_Chronos source is available for the affected job, throw `CACHE_REBUILD_REQUIRED_FOR_JOB` and keep the old cursor.
- New project rule: a new P_Chronos file returned by Dropbox cursor can create a new project directly from that changed file without scanning folders.
- Delete rule: if Dropbox cursor reports the cached P_Chronos source file deleted, the affected project can be removed from cache without scanning folders.
- Missing source file rule: if a referenced source file is missing during incremental download, throw `CACHE_SOURCE_REF_NOT_FOUND` instead of silently building from partial data.
- Added regression tests for:
  - new P_Chronos cursor entry creates project without `listFolder`;
  - missing sourceRefs fails with `CACHE_REBUILD_REQUIRED_FOR_JOB`, does not call `listFolder`, and does not commit cursor;
  - deleted P_Chronos removes project without `listFolder`.

### Tests Run

- `npm.cmd test -- tests/save-sync-service.test.js`: PASS, 25/25.
- `npm.cmd test`: PASS, 86/86.
- `node --check src\backend\SourceService.js`: PASS.
- `node --check src\backend\SyncService.js`: PASS.

### Last Verified State

- Local Node tests verify manual/auto incremental sync still uses Dropbox cursor pages but does not call source folder `listFolder()` for known job edits, new P project creation, T add, AC2 edit/rename, duplicate jobNo shared AC2/T changes, missing sourceRefs, or P delete.
- No Apps Script deployment was pushed in this step.

### Next Exact Action

Push the updated Apps Script source with `clasp push --force`, create a new Apps Script version, redeploy the existing web app, then after UrlFetch quota is available test one manual `projects` refresh. Expected: it calls cursor incremental sync once, creates/updates/deletes only affected jobs, never scans full P_Chronos/AC2/T_Chronos folders, and updates `lastSyncAt` only after cache writes and cursor commit succeed.

## 2026-08-17 Cloud Meta Stale Running Repair

### Current State

- User interrupted a local incremental dry-run. The process continued briefly in the background and left cloud `/@ Job Information/LinkAJ/__db__/meta.json` with `syncStatus: running`.
- Read-only verification showed `__db__`, `meta.json`, `projects.json`, and `jobs/` still existed. `projects.json` still had 3143 records and cursor was present.

### Completed

- Stopped the lingering local `node scripts/local_incremental_sync.js --dry-run` process.
- Updated only cloud `/@ Job Information/LinkAJ/__db__/meta.json`.
- Preserved the exact Dropbox cursor.
- Set `syncStatus` from `running` to `idle`.
- Cleared `lastSyncStartedAt`.
- Added `lastRepairAt` and `lastRepairReason`.
- Did not fake `lastSyncAt`.
- Did not modify `projects.json` or any `jobs/*.json`.

### Tests Run

- Direct Dropbox API read before/after repair.
- Verified `CURSOR PRESERVED: True`.

### Last Verified State

- `/@ Job Information/LinkAJ/__db__/meta.json`: `syncStatus=idle`, `projectCount=3143`, cursor present and unchanged, `lastSyncAt` still blank, `lastSyncStartedAt` blank.
- `/@ Job Information/LinkAJ/__db__/projects.json`: still present with 3143 records from the earlier read-only check.

### Next Exact Action

Do not run the local incremental sync writer until `scripts/local_incremental_sync.js` is reviewed for safe write ordering and bounded affected-job downloads. If testing again, start with `--dry-run`, confirm queued writes are reasonable, and ensure no background process remains if interrupted.

## 2026-08-17 Pre-Deploy Cleanup Review

### Current State

- User asked to review and clean everything changed since the last deployment before pushing/deploying.
- Files changed since last deploy review are limited to `src/backend/SourceService.js`, `src/backend/SyncService.js`, `tests/save-sync-service.test.js`, and `log.md`.
- The experimental `scripts/local_incremental_sync.js` was removed because it was not clean enough to push/deploy and had caused a stale `running` meta state during dry-run interruption.

### Completed

- Confirmed `.claspignore` excludes `scripts/`, `tests/`, `docs/`, `log.md`, and package files from Apps Script push.
- Removed the experimental local incremental runner from the clean repo.
- Tightened `SyncService.withIndexProjectRef()` so `projects.json` can repair a missing P sourceRef only when the job detail cache still exists. If `jobs/<projectId>.json` is missing for an AC2/T-only change, incremental sync now fails without folder scan instead of writing partial job cache.
- Stopped an unintended background `local_dropbox_full_rebuild.py --cloud-rebuild` process that was still downloading source files. It was stopped before publish; the log ended at source download `9250/66877` and had no publish lines.
- Read-only cloud verification after stopping the background rebuild: `/@ Job Information/LinkAJ/__db__/meta.json` remains `syncStatus=idle`, `projectCount=3143`, cursor present; `/projects.json` has 3143 records.

### Tests Run

- `npm.cmd test`: PASS, 88/88.
- `node --check src\backend\SyncService.js`: PASS.
- `node --check src\backend\SourceService.js`: PASS.
- `Test-Path scripts\local_incremental_sync.js`: False.

### Last Verified State

- No reviewed production code path calls full source-folder scan during normal cursor incremental sync.
- `SourceService.rebuildJob()` still exists for explicit repair/full tooling but is not called by `SyncService.syncNow()` or `SaveService.refreshProjectCache()`.
- Current cloud cache is intact and idle: 3143 projects, cursor present, `lastSyncStartedAt` blank.

### Next Exact Action

Safe to push/deploy the clean Apps Script changes only after confirming no background full rebuild process is running. After deploy, test one manual incremental sync when Apps Script UrlFetch quota is available. If there is a large backlog, expect possible Apps Script timeout; do not restart cloud full rebuild unless intentionally requested.

## 2026-08-18 Sync Meta Count Alignment Fix

### Current State

- User reported cloud cache count/state is still wrong: UI/cache says 3143 projects while Dropbox source has newer project files.
- Read-only Dropbox verification against `/@ Job Information/LinkAJ`:
  - `__db__/meta.json`: `syncStatus=running`, `projectCount=3143`, cursor present.
  - `__db__/projects.json`: 3143 records.
  - `Chronos/P_Chronos`: 3157 `.txt` files, 3103 unique job numbers.
  - Cache unique job numbers: 3089.
  - P job numbers missing from cache: 14 (`260050`, `260375` through `260387`).
  - Cursor backlog from saved cursor: 4468 Dropbox events across 3 cursor pages, including P=261, AC2=303, T=249, affected source job numbers=153.

### Completed

- Restored sync call flow closer to known-good version 8:
  - manual sync calls `SyncService.syncNow()` directly;
  - `autoSyncTick()` only checks `AUTO_SYNC_ENABLED`, then calls `SyncService.syncNow()` once;
  - removed extra cooldown/reset-trigger wrapper from normal sync path.
- Fixed real meta overwrite bug in `src/backend/SyncService.js`:
  - `CacheRepository.mergeJobCache()` writes fresh `projectCount` and `lastCacheUpdateAt`;
  - old `SyncService.syncNow()` then wrote the stale `meta` object captured before merge, which could overwrite those fresh values;
  - new code re-reads meta after all cache merges, then writes cursor/status fields onto that fresh meta.
- Error path also re-reads fresh meta and preserves the old cursor so partial cache metadata is not overwritten by stale starting meta.
- Added/updated regression coverage so new P cursor entries preserve fresh `projectCount`/`lastCacheUpdateAt` and WebApi no longer contains the manual sync trigger-reset wrapper.

### Tests Run

- `npm.cmd test`: PASS, 86/86.
- `node --check src\backend\SyncService.js`: PASS.
- `node --check src\backend\WebApi.js`: PASS.
- `node --check src\backend\SourceService.js`: PASS.

### Last Verified State

- Local code is fixed and tested, but not yet pushed/deployed in this checkpoint.
- Cloud cache still needs one successful incremental sync from the existing cursor to apply the 4468-event backlog.
- Cloud `meta.syncStatus` was still `running` during verification, with `lastSyncStartedAt=2026-08-18T15:54:19.288Z` and `lastCacheUpdateAt=2026-08-18T15:59:58.928Z`.

### Next Exact Action

Push/deploy the tested Apps Script changes, then run one manual incremental sync. If cloud meta is still stuck `running` and no `lastCacheUpdateAt` movement is observed for more than 15 minutes, repair only `meta.syncStatus` to `idle` while preserving cursor, then run manual incremental sync again.

## 2026-08-18 Local Incremental Backlog Repair

### Current State

- After user deployed the code and clicked Sync Now, Apps Script returned `Exceeded maximum execution time` and cloud meta still showed `syncStatus=running`.
- Root cause confirmed: the saved cursor had a large backlog (`4471` Dropbox events, `153` affected source jobs). Apps Script web request cannot reliably process that backlog before the maximum execution time.

### Completed

- Added `scripts/local_incremental_sync.js` for local Dropbox cursor incremental repair.
- The runner:
  - reads the existing cloud `__db__/meta.json` cursor;
  - collects Dropbox cursor changes;
  - groups only P_Chronos/AC2/T_Chronos source changes by job;
  - rebuilds only affected job cache using cached `sourceRefs` plus changed entries;
  - skips orphan AC2/T-only jobs with no cached/P source instead of creating partial fake projects;
  - writes job cache and `projects.json`;
  - commits the Dropbox cursor only after cache writes finish;
  - records `lastSyncChangeCount` as source P/AC2/T changes only, not `__db__` self-write events.
- Local incremental run completed:
  - changes: `4471`
  - affected jobs: `153`
  - affected projects: `139`
  - skipped orphan jobs: `17`
  - project count: `3157`
  - cursor changed: `true`
  - duration: `833s`
- Ran one extra local incremental pass to consume Dropbox cursor events caused by internal `__db__` cache writes:
  - total Dropbox events: `1`
  - source changes: `0`
  - project count remained `3157`.
- Pushed Apps Script source and redeployed existing deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ @17`.

### Tests Run

- `node --check scripts\local_incremental_sync.js`: PASS.
- `node scripts\local_incremental_sync.js --dry-run`: PASS, read `4471` events and `153` affected jobs.
- `npm.cmd test -- tests/save-sync-service.test.js tests/legacy-api-coverage.test.js`: PASS, 33/33.
- `npm.cmd test`: PASS, 86/86.

### Last Verified State

- Cloud `/@ Job Information/LinkAJ/__db__/meta.json`:
  - `syncStatus=idle`
  - `lastSyncMode=local_incremental`
  - `projectCount=3157`
  - `lastSyncChangeCount=0`
  - `lastError=null`
  - cursor present.
- Cloud `/@ Job Information/LinkAJ/__db__/projects.json`: `3157` records.
- Cloud `/@ Job Information/LinkAJ/Chronos/P_Chronos`: `3157` `.txt` files.

### Next Exact Action

Hard refresh the deployed web app `@17`, confirm the header shows `3157 projects` and status `Active cache ready`/`idle`. Then click Sync once only if needed; expected normal result after backlog repair is quick, with `sourceChanges=0` or only the newly edited P/AC2/T files.

## 2026-08-18 Chunked Incremental Sync + P Index

### Current State

- User approved implementing the safer incremental design after the backlog timeout diagnosis.
- Problem to fix: a large Dropbox cursor page can still exceed Apps Script execution time if one manual/auto sync tries to rebuild too many affected jobs in one invocation.
- Secondary problem: when an AC2/T change arrives for a job missing local job cache/sourceRefs, the app should try to find the matching P_Chronos file quickly instead of scanning all source folders or immediately giving up.

### Completed

- Added `__db__/p_index.json` as a small derived index from `projects.json`: jobNo -> P_Chronos source refs.
- Added `CacheService` generation of `pIndex`.
- Added `CacheRepository` read/write support for `p_index.json` and `sync_batch.json`.
- Updated cache write order so job detail files are written before publishing `projects.json`, `p_index.json`, then `meta.json`.
- Added Dropbox `search_v2` wrapper `DropboxClient.searchFiles()`.
- Updated `SyncService.syncNow()`:
  - reads only one Dropbox cursor page per invocation;
  - groups source P/AC2/T changes by job;
  - processes at most `syncMaxJobsPerRun` jobs per invocation, default `5`;
  - writes `sync_batch.json` if the cursor page still has pending jobs;
  - keeps the old cursor until the whole cursor page is processed;
  - commits the new cursor only after all cache writes for that page are complete;
  - if AC2/T is missing job detail, looks up P via `p_index.json`, then Dropbox `search_v2`, without full folder scan;
  - skips true orphan AC2/T jobs with `lastSkippedOrphanJobs` instead of blocking unrelated jobs.
- Updated manual Sync UI to keep calling the sync endpoint every 15 seconds while backend returns `morePending=true`, capped at 40 continuations.
- Updated `apiEnsureDbFolder()` to create empty `p_index.json` for new setup.
- Updated `scripts/local_full_rebuild.js` to write/validate `p_index.json`.
- Updated parent Python full rebuild publisher `E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py` to validate/stage/publish `p_index.json`; if publishing an older existing cache without p_index, it builds p_index from projects.
- Updated `scripts/local_incremental_sync.js` to:
  - search P_Chronos by jobNo when job detail/sourceRefs are missing;
  - upload `p_index.json` together with `projects.json` during progress/final/error writes.
- Uploaded current cloud `p_index.json` derived from current cloud `projects.json`; did not edit source TXT files.

### Tests Run

- `node --check src\backend\SyncService.js; node --check src\backend\CacheRepository.js; node --check src\backend\DropboxClient.js; node --check src\backend\CacheService.js; node --check src\backend\Config.js; node --check src\backend\WebApi.js; node --check scripts\local_incremental_sync.js; node --check scripts\local_full_rebuild.js`: PASS.
- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- `npm.cmd test`: PASS, 88/88.
- Direct Dropbox verify after p_index upload:
  - `syncStatus=idle`
  - `lastSyncMode=incremental`
  - `lastSyncChangeCount=0`
  - `projectCount=3157`
  - `projects.json=3157`
  - `p_index job keys=3103`
  - `p_index refs=3157`
  - `pendingSyncBatch=false`
  - `cursor present=true`
  - `lastError=null`

### Last Verified State

- Cloud cache is still aligned: meta/project count 3157, projects file 3157 records, p_index 3157 P refs.
- Auto incremental appears to have consumed the internal `p_index.json` upload event and left status idle with `lastSyncChangeCount=0`; this is expected because `__db__` events are not source changes.
- Apps Script source has not yet been pushed/deployed with these latest code changes in this checkpoint.

### Next Exact Action

Push Apps Script source from `E:\Develop\dong_engineering\dong_engineering` with `clasp push --force`, create a new Apps Script version, redeploy existing deployment `AKfycbyELDHDLuYw4oQbFPc3tJM5zZpLruA8nPVMM9y-jU4WQMiE8oKob-LE7ptZmjWq_jyGQQ`, then test manual Sync once. Expected result: if no source changes, it finishes quickly with source changes 0; if a cursor page has many changed jobs, it processes chunks and continues every 15 seconds from UI until the page cursor is committed.

## 2026-08-19 AC2 Account-First Job Resolver Fix

### Current State

- User reported old deployed version failed with `Cannot incremental-sync job 1682 without a P_Chronos source file. Run full rebuild.`
- Read-only Dropbox verification showed:
  - no P_Chronos file for job `1682`;
  - P_Chronos exists for `260253`;
  - AC2 has account-first legacy files like `1682~02~COMPLETED~46231~PAID~260253;1st Sent~Anh Phan.txt`;
  - AC2 also has canonical files like `260253~02~COMPLETED~46231~UNPAID~1682;1st Sent~Anh Phan.txt`.
- Root cause: the old resolver treated the first AC2 filename token as jobNo for every AC2 file. In this legacy variant, first token is account and the packed S5 field contains the real project jobNo.

### Completed

- Updated `AC2Parser.parseFilename()`:
  - normal canonical AC2 still uses S0 as jobNo;
  - if S0 is short/account-like and S5 contains a 5/6 digit job number, use S5 as jobNo and keep S0 as account.
- Updated `SourceService.resolveJobNoFromPath(path, config)` so AC2 paths use `AC2Parser.parseFilename()` instead of blind first-token parsing.
- Updated `SyncService.affectedJobChanges()` and P-search verification to pass config into resolver.
- Updated `SourceService.mergeRefsWithChanges()` to dedupe AC2 refs by logical code and prefer canonical `jobNo~code~...` file when both canonical and account-first duplicates exist.
- Updated `CacheService.buildCache()` to dedupe AC2 rows by `jobNo+code`, also preferring canonical rows, so full rebuild and incremental sync behave consistently.
- Mirrored resolver/dedupe changes in `scripts/local_incremental_sync.js`.
- Changed `SyncService` internal fallback batch size from 20 to 5 so every path defaults to the same safe chunk size.

### Tests Run

- `npm.cmd test -- tests/parser.test.js tests/cache-service.test.js tests/save-sync-service.test.js`: PASS, 36/36.
- `npm.cmd test`: PASS, 92/92.
- `node --check src\backend\parsers\AC2Parser.js; node --check src\backend\CacheService.js; node --check src\backend\SourceService.js; node --check src\backend\SyncService.js; node --check src\backend\Config.js; node --check src\backend\WebApi.js; node --check scripts\local_incremental_sync.js; node --check scripts\local_full_rebuild.js`: PASS.
- `python -m py_compile E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py`: PASS.
- Added and verified extra orphan regression tests:
  - multiple orphan AC2/T jobs such as `0364` and `1050` are recorded in `lastSkippedOrphanJobs`, do not scan source folders, and cursor can commit when no real job is blocked;
  - one orphan job plus one valid job in the same cursor page still applies the valid job and records only the orphan skip.
- `npm.cmd test -- tests/save-sync-service.test.js tests/parser.test.js tests/cache-service.test.js`: PASS, 38/38.
- `node --check src\backend\SyncService.js; node --check src\backend\SourceService.js; node --check src\backend\CacheService.js; node --check src\backend\parsers\AC2Parser.js`: PASS.
- `npm.cmd test`: PASS, 94/94.

### Last Verified State

- Local code handles the exact `1682~...~260253;...` AC2 variant:
  - parser resolves jobNo `260253`;
  - incremental sync groups affected job as `260253`;
  - if canonical AC2 already exists, P14 remains one code row, not duplicate;
  - no source folder scan is required.
- Cloud currently may still show the old `lastError` from deployed `@17` until the fixed code is deployed and Sync Now runs successfully.
- Apps Script source has not been pushed/deployed in this checkpoint.

### Next Exact Action

After user explicitly approves deployment, run `clasp push --force`, create a new Apps Script version, redeploy existing deployment, then click Sync Now once. Expected: old `1682` error clears after successful sync; if source changes are small it completes in one call, and if there are more than 5 affected jobs it continues in chunks without committing cursor until the cursor page is fully applied.

## 2026-08-19 Local Cache Catch-Up To Latest

### Current State

- User requested running local incremental to bring cloud cache to the latest state.
- No `node/npm/python/clasp` rebuild/sync process was running before start, except unrelated AmazonQ language server processes.
- Apps Script source still has not been deployed with the latest parser/sync fixes.

### Completed

- Ran `node scripts\local_incremental_sync.js --dry-run`:
  - starting cloud status: `error` from old deployed `1682` failure;
  - Dropbox cursor backlog: 344 events;
  - source changes: 208;
  - affected jobs: 60;
  - affected list included `260253`.
- Ran `node scripts\local_incremental_sync.js` with the fixed local parser/sync code:
  - processed 60 affected jobs;
  - affected projects: 63;
  - skipped orphans: 0;
  - projectCount moved from 3157 to 3160;
  - cursor committed.
- Ran a second local incremental pass to consume internal `__db__` events created by cache writes:
  - Dropbox events: 67;
  - source changes: 0;
  - affected jobs: 0;
  - projectCount remained 3160;
  - cursor committed.
- Final verification found stale `meta.pendingSyncBatch=true` and `sync_batch.json` from an old Apps Script batch whose `baseCursor` did not match the current committed cursor.
- Repaired only cache metadata:
  - cleared `meta.pendingSyncBatch`;
  - deleted stale `__db__/sync_batch.json`;
  - preserved cursor;
  - left `projects.json`, `p_index.json`, and job caches as produced by local incremental.

### Tests Run

- `node scripts\local_incremental_sync.js --dry-run`: PASS.
- `node scripts\local_incremental_sync.js`: PASS, 60 affected jobs, 3160 projects.
- `node scripts\local_incremental_sync.js`: PASS, sourceChanges 0 internal-event cleanup, 3160 projects.
- Direct Dropbox verify:
  - `syncStatus=idle`
  - `lastSyncMode=local_incremental`
  - `lastSyncAt=2026-08-19T15:16:01.430Z`
  - `lastCacheUpdateAt=2026-08-19T15:16:01.430Z`
  - `projectCount=3160`
  - `projects.json=3160`
  - `p_index refs=3160`
  - `pendingSyncBatch=false`
  - `cursor present=true`
  - `lastSkippedOrphanJobs=0`
  - `lastError=null`

### Last Verified State

- Cloud cache at `/@ Job Information/LinkAJ/__db__` is caught up by local incremental and idle with 3160 projects.
- Old deployed Apps Script may still contain old code until an explicit deploy is approved, but cloud cache itself is now up to date and no longer has the old `1682` lastError.

### Next Exact Action

Open/hard refresh the web app and confirm the header shows 3160 projects with idle/active cache state. Do not deploy unless user explicitly says to push/deploy.

## 2026-08-19 Responsive Header Light-Only UI

### Current State

- User requested UI-only cleanup for tablet/phone header.
- Scope: always light UI, remove light/dark mode, make `Auto Sync checked` timestamp visible on iPad/iPhone instead of clipped.
- No backend, sync, Dropbox, cursor, cache, push, or deploy changes were made in this checkpoint.

### Completed

- Removed the header theme toggle button from `src/frontend/Index.html`.
- Simplified `initTheme()` in `src/frontend/Client.js.html` so the app always sets `data-theme="light"` and clears any old saved theme preference.
- Removed dark-theme CSS variables and dark-mode selectors from `src/frontend/Styles.html`.
- Changed header layout so it can wrap instead of forcing one long row.
- Changed `lastRefreshText` / Auto Sync timestamp to wrap and stay visible:
  - desktop/tablet can wrap the header status row;
  - <=1024px gives the timestamp its own full-width line;
  - <=767px uses a 3-column header grid: project count/current refresh, full-width Auto Sync line, then account/admin/logout row.
- Updated `tests/frontend-syntax.test.js` to lock the new behavior: no `themeBtn`, no dark theme selector, no `prefers-color-scheme`, Auto Sync timestamp is not ellipsized, and mobile header uses the new grid.

### Tests Run

- `npm.cmd test -- tests/frontend-syntax.test.js`: PASS, 19/19.
- `npm.cmd test`: PASS, 94/94.

### Last Verified State

- Local frontend source is light-only.
- Local responsive header no longer clips `Auto Sync checked` on tablet/phone CSS rules.
- No Apps Script push/deploy has been performed.

### Next Exact Action

If user approves, run `clasp push --force` and deploy/update the Apps Script web app; then hard refresh on iPhone/iPad and verify the header shows project count plus the full `Auto Sync checked` line without horizontal clipping.

## 2026-08-20 1317 Orphan Sync Regression Check

### Current State

- User reported deployed UI still shows: `Cannot incremental-sync job 1317 without a P_Chronos source file. Run full rebuild.`
- Need to verify whether current local code really handles this case.
- No push/deploy/cloud mutation was performed in this checkpoint.

### Completed

- Re-read latest project memory in `log.md` and inspected current sync code.
- Verified current local `SyncService.syncNow()` catches `CACHE_REBUILD_REQUIRED_FOR_JOB`, records the job in `lastSkippedOrphanJobs`, keeps `syncStatus=idle`, and does not surface the rebuild-required error to UI.
- Added an exact regression test for `1317` as an orphan T_Chronos change:
  - input change: `/root/Chronos/T_Chronos/1317~Plan 1~QAUSER~Structural~46231~1~~01.txt`;
  - no P project exists in `projects`, `jobs`, or `p_index`;
  - expected: sync succeeds, cursor commits, `lastError=null`, `lastSkippedOrphanJobs=['1317']`, no folder scan.

### Tests Run

- `npm.cmd test -- tests/save-sync-service.test.js`: PASS, 31/31.
- `node --check src\backend\SyncService.js; node --check src\backend\SourceService.js`: PASS.
- `npm.cmd test`: PASS, 95/95.

### Last Verified State

- Local source no longer fails on orphan job `1317`; it skips and records it.
- Seeing the exact rebuild-required error in the browser means one of these is likely true:
  - deployed Apps Script is still an older version; or
  - the browser is calling a deployment/version that does not include current `SyncService` catch behavior.
- This checkpoint did not push/deploy, by user preference.

### Next Exact Action

Compare deployed Apps Script source/version against local `src/backend/SyncService.js`. If user explicitly approves deployment, push/deploy current local source, then run Sync Now once and confirm `1317` appears only in `lastSkippedOrphanJobs` instead of a UI error.

## 2026-08-20 Deployed 1317 Error Follow-Up

### Current State

- User reported that after deploying new code, UI still shows `Cannot incremental-sync job 1317 without a P_Chronos source file. Run full rebuild.`
- Previous conclusion based only on Node/local tests was insufficient.
- No push/deploy/cloud mutation was performed in this checkpoint.

### Completed

- Inspected `WebApi.js`, `SyncService.js`, `SourceService.js`, `.clasp.json`, `.claspignore`, and tracked Apps Script files.
- `clasp.cmd status` confirms `src/backend/SyncService.js` is tracked for Apps Script push.
- Found a real robustness gap in `SyncService.syncNow()`:
  - old catch only recognized `jobErr.code === 'CACHE_REBUILD_REQUIRED_FOR_JOB'`;
  - if Apps Script/runtime preserves only the error message and not custom `.code`, the same rebuild-required error can leak to UI.
- Updated `src/backend/SyncService.js` with `isRebuildRequiredForJob(err)`:
  - catches by `err.code`; or
  - catches by message containing `Cannot incremental-sync job ... without a P_Chronos source file`.
- Added regression test for exact runtime-like failure mode:
  - monkeypatches `SourceService.rebuildJobFromRefs()` to throw only the message, no `.code`;
  - expected: sync succeeds, cursor commits, `syncStatus=idle`, `lastError=null`, job recorded in `lastSkippedOrphanJobs`.

### Tests Run

- `npm.cmd test -- tests/save-sync-service.test.js`: PASS, 32/32.
- `node --check src\backend\SyncService.js; node --check tests\save-sync-service.test.js`: PASS.
- `npm.cmd test`: PASS, 96/96.
- `clasp.cmd status`: PASS, confirms tracked files include `src\backend\SyncService.js`.
- `clasp.cmd deployments`: FAILED due `request to https://script.googleapis.com/.../deployments failed` in this environment.
- `clasp.cmd versions`: FAILED due `request to https://script.googleapis.com/.../versions failed` in this environment.

### Last Verified State

- Local code now handles both forms:
  - `CACHE_REBUILD_REQUIRED_FOR_JOB` with custom `err.code`;
  - same rebuild-required message without custom `err.code`.
- Live deployment/version could not be read from this environment because Apps Script API calls failed.
- No deployment was performed here.

### Next Exact Action

Push/deploy this exact local patch only after user explicitly approves. Then run Sync Now and verify the UI no longer shows the rebuild-required error; expected result is `1317` appears in `lastSkippedOrphanJobs` and sync returns idle/success.

## 2026-08-21 p_index Sync Wiring Correction

### Current State

- User correctly challenged the previous explanation: `p_index.json` was created to avoid full scans and must be used before asking for full rebuild.
- The right behavior is not "skip 1317" as a project decision. Correct behavior:
  - parse affected jobNo from Dropbox change;
  - use existing job cache/sourceRefs when available;
  - if job detail is missing, use `p_index.json` to find P_Chronos quickly;
  - if `p_index` has no P, search Dropbox P_Chronos by filename/jobNo;
  - do not full scan source folders during normal incremental sync.

### Completed

- Verified Apps Script backend `SyncService.lookupPRefs()` already had p_index lookup plus Dropbox P search fallback, but diagnostics were too weak and the local runner was not aligned.
- Added regression coverage proving backend uses p_index before Dropbox search:
  - removes `jobs/260174.json` and `projects[260174]`;
  - keeps only `p_index['260174']`;
  - Sync rebuilds from the p_index P ref;
  - `client.searchFilesCalls` remains empty;
  - no folder scan occurs.
- Updated `scripts/local_incremental_sync.js` so the local incremental runner also downloads and uses `/__db__/p_index.json` before Dropbox P search.
- Updated local runner orphan/error guard to recognize rebuild-required by code or message, matching Apps Script `SyncService`.

### Tests Run

- `npm.cmd test -- tests/save-sync-service.test.js tests/cache-repository-order.test.js tests/local-full-rebuild-script.test.js`: PASS, 38/38.
- `node --check src\backend\SyncService.js; node --check scripts\local_incremental_sync.js; node --check tests\save-sync-service.test.js`: PASS.
- `npm.cmd test`: PASS, 97/97.
- `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`: FAILED/TIMED OUT after 120s due repeated network `fetch failed`; no cache write was performed because it was dry-run and failed before cursor processing output.
- Checked running node processes after timeout: only AmazonQ language server node processes remained, no local sync runner.

### Last Verified State

- Local code now has explicit tests for both p_index and search fallback.
- Local runner is aligned with Apps Script p_index behavior.
- Cloud/live cursor could not be checked from this environment due network failure.

### Next Exact Action

If network is available, rerun `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run` to inspect real affected jobs without writing cache. If user approves deploy, push current source so Apps Script gets the same p_index-first behavior and diagnostics.

## 2026-08-21 Long-Term AC2 Resolver + Cloud Cache Catch-Up

### Current State

- User requested a durable fix, not another one-off patch for account numbers like `1682` or `1317`.
- Direct Dropbox inspection before the fix showed:
  - cloud `meta.syncStatus=error`;
  - `lastError=CACHE_REBUILD_REQUIRED_FOR_JOB`;
  - message `Cannot incremental-sync job 1317 without a P_Chronos source file. Run full rebuild.`;
  - no project/P/p_index/job cache for `1317`;
  - AC2 contained `1317~02~...~250282;...`, where `1317` is the account and `250282` is the real project jobNo;
  - P/cache/p_index for `250282` existed.

### Completed

- Updated `src/backend/SourceService.js`:
  - added `jobInfoFromPath()` with AC2 candidates from parser, filename token, and packed `S5` token;
  - added `sourceJobMatches()` so AC2 matching can accept any valid candidate for the intended job;
  - changed AC2 folder/ref matching to use candidate matching instead of a single blind resolved token;
  - made `rebuildJobFromRefs()` skip stale missing AC2/T source refs and record them, while still blocking fake project creation when P is missing.
- Updated `src/backend/SyncService.js`:
  - `affectedJobChanges()` can now resolve AC2 jobNo using current cache evidence: `projects`, `p_index`, then limited P search only for truly ambiguous project-like candidates;
  - pending `sync_batch.json` jobs are recomputed from `entries` under current resolver, so old bad batches such as `jobs:["1317"]` no longer keep poisoning sync;
  - writes `lastSyncResolverDiagnostics` and `lastMissingSourceRefs` into meta for future diagnosis.
- Updated `scripts/local_incremental_sync.js` with the same resolver, p_index/search behavior, stale AC2/T sourceRef skipping, and diagnostics so local cache repair aligns with Apps Script backend.
- Added regression tests:
  - real-shaped `1317~...~250282` AC2 repairs a legacy pending batch that had `jobs:["1317"]`;
  - stale missing AC2 sourceRefs are dropped without full-folder scans or blocking current changes.

### Tests Run

- `node --check src\backend\SourceService.js; node --check src\backend\SyncService.js; node --check scripts\local_incremental_sync.js`: PASS.
- `npm.cmd test -- tests/save-sync-service.test.js`: PASS, 35/35.
- `npm.cmd test`: PASS, 99/99.

### Cloud Cache Catch-Up

- Ran `node scripts\local_incremental_sync.js --env ..\.env.local`:
  - started from `syncStatus=error`, `projectCount=3160`;
  - cursor page had `605` Dropbox events, `328` source changes, `74` affected jobs;
  - completed successfully in `489s`;
  - affected projects `73`;
  - skipped true orphan jobs `1763` and `1764`;
  - projectCount became `3163`.
- Ran a second pass:
  - `101` Dropbox events, `16` source changes, `6` affected jobs;
  - completed successfully in `76s`;
  - projectCount remained `3163`.
- Ran cleanup/internal-event passes:
  - source changes reached `0`;
  - final cache verification showed no source backlog.

### Last Verified State

- Direct Dropbox verification for `/@ Job Information/LinkAJ/__db__`:
  - `syncStatus=idle`;
  - `lastError=null`;
  - `lastSyncMode=local_incremental`;
  - `lastSyncChangeCount=0`;
  - `projectCount=3163`;
  - `projects.json=3163`;
  - `p_index refs=3163`;
  - `p_index keys=3107`;
  - `lastSkippedOrphanJobs=0`;
  - `lastMissingSourceRefs=0`;
  - `lastSyncResolverDiagnostics=0`.

### Next Exact Action

Push/deploy the current Apps Script source if the deployed web app should get the same durable AC2 resolver and stale-ref self-healing behavior. The cloud cache itself is already caught up and idle.

## 2026-08-21 Admin Sync Log + Non-Blocking Orphan Errors

### Request

- Add an Admin `Log` tab with two columns:
  - file path currently failing;
  - reason.
- If incremental sync hits an error like `Cannot incremental-sync job 1317 without a P_Chronos source file. Run full rebuild.`, record it, skip that stale item, and continue the rest of the sync.
- When a later sync successfully rebuilds that same job/path, remove the related log rows.

### Completed

- Updated `src/backend/SyncService.js`:
  - introduced persistent `meta.syncIssueLog`;
  - records skipped rebuild-required/orphan changes as `{ path, reason, jobNo, firstSeenAt, lastSeenAt }`;
  - keeps sync non-blocking for those stale items;
  - prunes matching log rows after a later successful rebuild for that job/path;
  - caps the log to the newest 200 rows.
- Updated `scripts/local_incremental_sync.js` with the same issue-log behavior so local cache repair and Apps Script incremental sync stay aligned.
- Updated `src/backend/WebApi.js`:
  - exposes sanitized issue rows through `apiGetSyncIssueLog(token)`;
  - includes `sync.issueLog` in the sync health snapshot and selected admin config.
- Updated `src/frontend/Client.js.html` and `src/frontend/Styles.html`:
  - added Admin tab `Log`;
  - renders a simple two-column table: `File path` and `Reason`;
  - added refresh button for the log table.
- Updated tests:
  - orphan `1317` no longer surfaces as a fatal sync error; it is recorded in `syncIssueLog`;
  - real legacy AC2 `1317~...~250282` still resolves through P/p_index evidence and leaves `syncIssueLog` empty;
  - mixed valid + stale changes prune resolved issue rows and keep only the stale paths;
  - frontend/API coverage includes the new Admin log tab and API.

### Tests Run

- `node --check src\backend\SyncService.js; node --check src\backend\WebApi.js; node --check scripts\local_incremental_sync.js`: PASS.
- `npm.cmd test -- tests/save-sync-service.test.js tests/frontend-syntax.test.js tests/legacy-api-coverage.test.js`: PASS, 63/63.
- `npm.cmd test`: PASS, 100/100.

### Cache Verification

- Ran `node scripts\local_incremental_sync.js --env ..\.env.local` after the code change:
  - sourceChanges `2`;
  - affectedJobs `2`;
  - skippedOrphans `0`;
  - projectCount `3163`;
  - completed successfully in `37s`.
- Ran `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run` immediately after:
  - sourceChanges `0`;
  - affectedJobs `[]`;
  - resolverDiagnostics `[]`.

### Last Verified State

- The current cache cursor is caught up for source changes.
- The previously reported `Cannot incremental-sync job 1317...` did not reappear in the latest real sync or follow-up dry-run.
- If a true stale/orphan source path appears later, it should show under Admin -> Log instead of killing the whole incremental sync.

### Next Exact Action

Deploy the current Apps Script source when approved so the hosted Admin UI gets the new `Log` tab and the deployed sync path gets the same non-blocking issue-log behavior.

## 2026-08-24 Resumable Incremental Sync Checkpoints

### Request

- User wanted Apps Script incremental sync to survive the 6-minute execution limit by saving progress as it goes.
- If a cursor page has many affected jobs, process it in multiple sync steps instead of redoing the same page after timeout.
- Do not full-scan P_Chronos/AC2/T_Chronos repeatedly; continue using Dropbox cursor changes and p_index/search recovery only when needed.

### Completed

- Updated `src/backend/SyncService.js`:
  - restored use of `config.syncMaxJobsPerRun` as the per-invocation affected-job cap; default remains 5 from `Config.js`;
  - added a runtime budget guard defaulting to 270 seconds so Apps Script can stop before the 6-minute hard limit;
  - writes `sync_batch.json` after each processed job with updated `processedJobs`, affected projects, skipped orphan rows, missing refs, and issue log state;
  - resumes `sync_batch.json` before calling Dropbox `list_folder/continue` again;
  - allows batch resume even if `meta.pendingSyncBatch` summary is stale, as long as `sync_batch.json.baseCursor` still matches `meta.cursor`;
  - commits `meta.cursor` only after all affected jobs in that cursor page are processed.
- Updated `tests/save-sync-service.test.js`:
  - added simulation for a cursor page split across multiple sync runs;
  - confirmed new Dropbox changes after that page are not read until the old batch finishes;
  - confirmed stale `meta.pendingSyncBatch` does not cause the backend to abandon a valid `sync_batch.json`.

### Tests Run

- `node --check src\backend\SyncService.js; node --check src\backend\CacheRepository.js`: PASS.
- `npm.cmd test -- tests/save-sync-service.test.js`: PASS, 38/38.
- `npm.cmd test`: PASS, 103/103.

### Cloud Cache Catch-Up

- Ran `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run` before local repair:
  - starting cloud meta was `syncStatus=running`;
  - projects `3168`;
  - cursor page had `71` Dropbox events;
  - sourceChanges `35`;
  - affectedJobs `15`.
- Ran `node scripts\local_incremental_sync.js --env ..\.env.local`:
  - processed `15/15` affected jobs in `77s`;
  - affectedProjects `14`;
  - skippedOrphans `1` (`1800`);
  - projectCount stayed `3168`;
  - cursor changed successfully.
- Ran cleanup pass for internal `__db__` events:
  - changes `17`;
  - sourceChanges `0`;
  - affectedJobs `0`;
  - projectCount `3168`.
- Final dry-run after cleanup:
  - sourceChanges `0`;
  - affectedJobs `[]`;
  - resolverDiagnostics `[]`;
  - one remaining non-source Dropbox event was visible, likely from the just-written cache metadata.

### Deployment

- `clasp push --force`: PASS, pushed 21 Apps Script files at 2026-08-24 23:37 local time.
- `clasp version "resumable incremental sync checkpoints"`: PASS, created version 25.
- `clasp redeploy AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow --versionNumber 25 --description "resumable incremental sync checkpoints"`: PASS.
- `clasp deployments --json`: PASS, deployment `AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow` is now `@25`.

### Last Verified State

- Local code passes all tests.
- Cloud cache is caught up for P_Chronos/AC2/T_Chronos source changes as of the local incremental run.
- Apps Script source deployed to version `@25`.
- Normal Apps Script sync behavior after deploy should be:
  - if no pending batch, read one Dropbox cursor page;
  - process up to `SYNC_MAX_JOBS_PER_RUN` affected jobs, default 5;
  - checkpoint `sync_batch.json` after every job;
  - on the next auto/manual sync, finish pending batch before reading newer Dropbox changes;
  - commit cursor only when the cursor page is fully applied.

### Open Issues

- Git remote is not configured in this local repository, so no Git push was performed.
- `CacheRepository.mergeJobCache()` still publishes `projects.json` and `p_index.json` per processed job. This is safe and resumable, but not the lowest possible UrlFetch count. A later optimization could add a durable project patch log or batch index flush, but that should be done only with tests proving no data loss after timeout.
- Apps Script UrlFetch quota may still need to reset before the deployed UI can call Dropbox successfully.

### Next Exact Action

Hard refresh the deployed web app that points to deployment `AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow @25`. After Apps Script UrlFetch quota is available, click Sync once. Expected: if no source changes, it finishes quickly; if a cursor page has more than 5 affected jobs, repeated manual/auto sync calls continue `sync_batch.json` instead of starting a new Dropbox scan or committing cursor early.

## 2026-08-23 Remove 5-Job Chunk Limit + Repair Stale Missing P SourceRefs

### Request

- Remove the incremental limit that rebuilds only 5 affected jobs per invocation.
- Fix errors like:
  - `Source file is missing during incremental sync: /@ Job Information/LinkAJ/Chronos/P_Chronos/250278~...@AnhTran.tx`
- Build the latest cloud cache.
- If new real sync errors appear during cache build, convert the learning into durable code instead of one-off patching.

### Root Cause

- The old chunk behavior in `src/backend/SyncService.js` used `DEFAULT_SYNC_JOB_LIMIT=5` and processed only a slice of the current cursor page.
- A different failure class remained uncovered:
  - cached job detail / `p_index.json` can point to a stale P_Chronos path;
  - when that exact P path is gone in Dropbox, `SourceService.rebuildJobFromRefs()` threw `CACHE_SOURCE_REF_NOT_FOUND`;
  - because P_Chronos is the project root file, the error was fatal, cursor stayed old, and every later auto/manual sync retried the same bad cursor/batch.
- Example symptom path ended with `.tx`, which indicates the cache/sourceRef path was stale or malformed compared with the expected `.txt` source file.

### Completed

- Updated `src/backend/SyncService.js`:
  - removed the 5-job per-run limit; one sync invocation now processes every affected job in the current Dropbox cursor page;
  - retained the one-cursor-page boundary so sync still does not consume unlimited Dropbox pages in one call;
  - added stale P sourceRef repair:
    - read P candidates from `p_index.json`;
    - exclude the exact missing stale P path;
    - search P_Chronos by jobNo only if needed;
    - rebuild using the replacement P ref plus the existing cached AC2/T refs;
    - record the stale P path in `lastMissingSourceRefs`;
    - if no replacement P exists, write the missing P path to `syncIssueLog`, skip that job, and keep processing the rest.
  - refreshes in-memory `projects` after each cache merge so a large single invocation does not keep using stale project rows.
- Updated `src/backend/SourceService.js`:
  - enriched `CACHE_SOURCE_REF_NOT_FOUND` with `kind`, `path`, and `filename` so caller code can distinguish missing P from missing AC2/T.
- Updated `scripts/local_incremental_sync.js`:
  - mirrors the same stale P repair behavior;
  - keeps in-memory `pIndex` current after each project cache merge;
  - local cache repair and Apps Script backend remain aligned.
- Updated tests:
  - stale cached P path `.tx` repairs through P search when the real `.txt` P exists;
  - stale cached P path logs/skips when no replacement P exists;
  - old `syncMaxJobsPerRun: 1` no longer chunks the page; all affected jobs in the page are processed in one run.

### Tests Run

- `node --check src\backend\SourceService.js; node --check src\backend\SyncService.js; node --check scripts\local_incremental_sync.js`: PASS.
- `npm.cmd test -- tests/save-sync-service.test.js tests/legacy-api-coverage.test.js`: PASS, 45/45.
- `npm.cmd test`: PASS, 102/102.

### Cache Build / Incremental Repair

- Pre-run dry-run:
  - cloud cache status was `error`;
  - projects `3163`;
  - cursor page had `464` Dropbox events;
  - sourceChanges `282`;
  - affectedJobs `76`;
  - resolverDiagnostics showed multiple legacy AC2 account-first/account-packed names, but they resolved to project job numbers.
- Ran `node scripts\local_incremental_sync.js --env ..\.env.local`:
  - processed all `76/76` affected jobs in one run;
  - sourceChanges `282`;
  - affectedProjects `75`;
  - skippedOrphans `3`;
  - skipped orphan jobs: `1754`, `1765`, `1766`;
  - projectCount increased from `3163` to `3167`;
  - completed successfully in `477s`.
- Ran cleanup pass for internal `__db__` write events:
  - changes `79`;
  - sourceChanges `0`;
  - affectedJobs `0`;
  - projectCount `3167`;
  - completed successfully in `7s`.
- Final dry-run:
  - cache status `idle`;
  - projects `3167`;
  - sourceChanges `0`;
  - affectedJobs `[]`;
  - resolverDiagnostics `[]`;
  - only `1` non-source Dropbox event remained from internal cache metadata churn.

### Last Verified State

- Cloud cache is caught up for P_Chronos/AC2/T_Chronos source changes.
- The old fatal P sourceRef missing class is now repaired if a replacement P exists, or logged/skipped if no real P exists.
- The incremental path no longer stops after 5 jobs in the current cursor page.

### Next Exact Action

Deploy the current Apps Script source when approved so hosted Auto Sync / Sync Now uses the same no-5-job-limit and stale-P-repair behavior that the local cache runner just used successfully.

## 2026-08-23 Throttle Browser Index Revalidation

### Request

- User reported `Showing cache · revalidating…` appearing repeatedly and objected to `apiGetProjectIndex` revalidation behaving like a short-loop poll.
- Desired behavior: normal cached-index revalidation should be bounded like the 5-minute idle status cadence, not repeatedly call Dropbox cache reads every 15 seconds.

### Completed

- Updated `src/frontend/Client.js.html`:
  - added `INDEX_REVALIDATE_TTL_MS = STATUS_POLL_IDLE_MS`;
  - added `shouldRevalidateIndex()` and `finishIndexFromCache()`;
  - `loadIndex(false)` now uses the browser `localStorage` index without calling `apiGetProjectIndex` again while the cached index is still under the 5-minute TTL;
  - `Showing cache · revalidating…` is shown only when a real server revalidation will happen;
  - forced/event-based refresh still works immediately for startup/explicit retry/environment or folder config changes/save/manual sync finalization/new publish token.
- Updated `tests/frontend-syntax.test.js` to lock the new TTL and force-refresh contract.

### Tests Run

- `npm.cmd test -- tests/frontend-syntax.test.js`: PASS, 20/20.
- `npm.cmd test`: PASS, 102/102.

### Last Verified State

- Normal index cache display no longer implies a Dropbox/API revalidation on every repeated UI status loop.
- `apiGetProjectIndex` is still used when needed, but idle cached-index revalidation is capped by the 5-minute TTL.

### Next Exact Action

Deploy the current Apps Script source when approved so the hosted UI gets the throttled index revalidation behavior.

## 2026-08-24 Latest Checkpoint - Resumable Sync Deployed

### Current State

- `src/backend/SyncService.js` now uses resumable cursor-page batches:
  - process up to `SYNC_MAX_JOBS_PER_RUN` affected jobs per Apps Script invocation, default 5;
  - checkpoint `sync_batch.json` after each processed job;
  - resume `sync_batch.json` before reading a new Dropbox cursor page;
  - commit `meta.cursor` only after the current cursor page is fully applied.
- Cloud cache was caught up locally with Node runner:
  - before repair: `sourceChanges=35`, `affectedJobs=15`, projects `3168`;
  - after repair: source backlog dry-run shows `sourceChanges=0`, `affectedJobs=[]`;
  - skipped true orphan job `1800`.
- Apps Script source was pushed and deployment `AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow` was redeployed to `@25`.

### Tests Run

- `node --check src\backend\SyncService.js; node --check src\backend\CacheRepository.js`: PASS.
- `npm.cmd test -- tests/save-sync-service.test.js`: PASS, 38/38.
- `npm.cmd test`: PASS, 103/103.
- `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`: PASS before and after local cache repair.
- `node scripts\local_incremental_sync.js --env ..\.env.local`: PASS, processed source backlog and cleanup.
- `clasp push --force`: PASS.
- `clasp version "resumable incremental sync checkpoints"`: PASS, created version 25.
- `clasp redeploy AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow --versionNumber 25 --description "resumable incremental sync checkpoints"`: PASS.

### Open Issues

- Git remote is not configured in this local repo, so no Git push was performed.
- Apps Script UrlFetch quota may still need to reset before UI/API calls succeed.
- `CacheRepository.mergeJobCache()` still publishes `projects.json` and `p_index.json` per processed job. This is safe/resumable but not the absolute minimum UrlFetch count; optimize later only with durable project-patch replay tests.

### Next Exact Action

Hard refresh the deployed web app on deployment `AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow @25`. After Apps Script UrlFetch quota is available, click Sync once and confirm: no source backlog should finish quickly; future pages with more than 5 affected jobs should continue through `sync_batch.json` across manual/auto sync calls without full folder scan or early cursor commit.

## 2026-08-24 Latest Checkpoint - Old Deployments Removed + Smoke Test

### Current State

- Kept current versioned deployment:
  - `AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow @25`
- Removed old versioned deployments that were still listed:
  - `@22`, `@23`, `@18`, `@17`, `@1`, `@19`, `@21`
- Remaining `clasp deployments --json` output has:
  - one read-only `@HEAD` deployment `AKfycbyBsP3F46oHH4dqUIIJ9RV5c-1GOPw9QVRoTpayyJcb`, which `clasp undeploy` refused with `Read-only deployments may not be deleted`;
  - current deployment `AKfycbxCfGxpUJXGBtoC2MwH2ZFa6_clKqOP2aJ6-DQOm9Nx5BqkIjUsPOTTr9a5cv-F9rDSow @25`.

### Smoke Tests Run

- `npm.cmd test`: PASS, 103/103.
- `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`: PASS:
  - cloud cache status `idle`;
  - projects `3168`;
  - sourceChanges `0`;
  - affectedJobs `[]`;
  - resolverDiagnostics `[]`;
  - one non-source Dropbox event remains, consistent with recent `__db__` metadata writes.
- HTTP GET smoke for current web app deployment URL:
  - status `200 OK`;
  - title `Dong Engineering - Project Management Preview`;
  - response length `382837`.
- `clasp.cmd run apiGetPublicSyncStatus`: NOT VERIFIED because Apps Script Execution API returned `Unable to run script function. Please make sure you have permission to run the script function.`

### Quota / Timeout Notes

- Direct terminal smoke cannot prove Apps Script `UrlFetchApp` quota is available because `clasp run` is blocked by execution permission.
- The deployed `doGet` smoke proves the web app URL serves HTML, but it does not call Dropbox and therefore does not consume/test `UrlFetchApp`.
- If an Apps Script sync step times out unexpectedly, the new `sync_batch.json` checkpoint should keep already-processed jobs and let the next manual/auto sync continue the same cursor page. Cursor still must not advance until the page is fully applied.

### Next Exact Action

In the browser, hard refresh the current `@25` web app URL only. If the UI still says `Service invoked too many times for one day: urlfetch`, wait for Apps Script quota reset and do not repeatedly press Sync. When quota is available, click Sync once and verify it returns quickly with no source backlog; if it reports pending, let the next 5-minute auto sync or one manual Sync continue the existing `sync_batch.json`.

## 2026-08-25 Latest Checkpoint - Sync Batch Write Optimization

### Current State

- User correctly called out that the prior `@25` code was only resumable, not fully aligned with the intended optimization:
  - it still defaulted to `SYNC_MAX_JOBS_PER_RUN=5`;
  - `SyncService` still called `mergeJobCache()` per affected job, which rewrote `projects.json`, `p_index.json`, and `meta.json` per job.
- Updated local source, not deployed yet:
  - `src/backend/Config.js`: default `SYNC_MAX_JOBS_PER_RUN` is now `0`, meaning no hard job-count cap unless explicitly configured.
  - `src/backend/SyncService.js`: `maxJobsPerRun()` treats unset/0 as effectively unlimited and relies on runtime budget; processed jobs are checkpointed in `sync_batch.json`.
  - `src/backend/CacheRepository.js`: added staged cache writes:
    - `stageJobCache()` writes affected `jobs/<projectId>.json` and mutates in-memory projects only;
    - `publishProjectIndexes()` writes `projects.json`, `p_index.json`, deletes stale job details, then writes `meta.json`;
    - existing `mergeJobCache()` still works for old callers/save flow by staging then publishing immediately.
  - `src/backend/SyncService.js`: during incremental sync, job details are staged/checkpointed per job; `projects.json`, `p_index.json`, and `meta.json` are published once at the end of the invocation, or once before returning `morePending=true`.
  - `sync_batch.json` now remembers `projectPatches` and `deletedProjectIds`, so if Apps Script dies before index publish, the next invocation can still apply already-processed job changes before continuing.
  - `src/frontend/Client.js.html`: public active/running status polling now uses the 5-minute idle interval instead of 60 seconds; manual pending continuation uses new `SYNC_CONTINUE_MS=60s` instead of reusing the 15-second publish wait.

### Tests Run

- `node --check src\backend\SyncService.js; node --check src\backend\CacheRepository.js; node --check src\backend\Config.js`: PASS.
- `npm.cmd test -- tests/save-sync-service.test.js tests/cache-repository-order.test.js tests/frontend-syntax.test.js`: PASS, 62/62.
- `npm.cmd test`: PASS, 104/104.
- `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`: PASS:
  - cloud cache status `idle`;
  - projects `3168`;
  - sourceChanges `0`;
  - affectedJobs `[]`;
  - resolverDiagnostics `[]`.

### Last Verified State

- Local code now matches the intended optimization better:
  - not capped at 5 jobs by default;
  - processes as many affected jobs as fit within the runtime budget;
  - writes job detail/checkpoint per job;
  - publishes `projects.json`, `p_index.json`, and `meta.json` once per invocation instead of once per job;
  - avoids 15-second manual continuation loops for pending sync work.
- Added regression test proving 7 affected jobs complete in one invocation when runtime allows, while `projects.json` and `p_index.json` are each written once.

### Open Issues

- This optimization has not been pushed/deployed yet.
- Because the local repo files are currently untracked, `git diff` does not show a normal patch even though tests read the updated files.
- Apps Script runtime quota still cannot be checked from terminal via `clasp run` due Execution API permission.

### Next Exact Action

Review the local optimized changes in `src/backend/CacheRepository.js`, `src/backend/SyncService.js`, `src/backend/Config.js`, `src/frontend/Client.js.html`, and related tests. If approved, push/deploy a new Apps Script version after confirming the user wants this local optimization deployed over `@25`.

## 2026-08-25 Harder Sync Smoke Tests

### Current State

- Local source is still not deployed after the batch-write optimization.
- Added a harder regression smoke test for the exact large-backlog case:
  - cursor page A has 80 changed projects;
  - safety cap is forced to 55 for the test;
  - cursor page B has 20 newer projects;
  - first invocation writes 55 job detail files and publishes indexes once, but does not commit cursor A;
  - second invocation resumes the same `sync_batch.json`, finishes the remaining 25 jobs, then commits cursor A to cursor B;
  - third invocation reads cursor B and applies the newer 20 jobs.
- This verifies the intended invariant: newer Dropbox changes are not read until the current cursor page has been fully applied and published.
- Previous hard smoke caught a real bug: final cursor-page completion deleted `sync_batch.json` before `projects.json` / `p_index.json` publish succeeded. Fixed in `src/backend/SyncService.js` so batch deletion now happens only after successful publish/meta write.

### Tests Run

- `node --check src\backend\SyncService.js; node --check src\backend\CacheRepository.js; node --check src\backend\Config.js`: PASS.
- `node --test --test-name-pattern "large cursor page|runtime budget|publish failure|processes more than five" tests\save-sync-service.test.js`: PASS, 4/4.
- `npm.cmd test -- tests/save-sync-service.test.js tests/cache-repository-order.test.js tests/frontend-syntax.test.js`: PASS, 64/64.
- `npm.cmd test`: PASS, 107/107.
- `node scripts\local_incremental_sync.js --env ..\.env.local --dry-run`: PASS:
  - cloud cache status `idle`;
  - projects `3168`;
  - cursor present;
  - Dropbox changes `1`;
  - sourceChanges `0`;
  - affectedJobs `[]`;
  - resolverDiagnostics `[]`.

### Last Verified State

- Local sync behavior is covered for:
  - more than 5 jobs in one invocation;
  - large cursor page split across invocations;
  - new Dropbox changes arriving after the current page;
  - runtime budget stop/resume;
  - publish-index failure retry without cursor loss;
  - p_index-first / Dropbox-search recovery for missing P refs;
  - account-first AC2 1317/1682 handling;
  - no full source folder list in incremental tests.
- Frontend incremental pending continuation is 60 seconds, not 15 seconds.
- Active/running public status polling uses the same 5-minute interval as idle status polling.

### Open Issues

- Hosted Apps Script UI cannot be fully smoke-tested while the project is quota-limited by `UrlFetchApp`.
- Local tests and local dry-run validate logic, but do not prove current deployed UI runtime until quota resets and the optimized local code is deployed.
- The local repository still shows files as untracked, so normal `git diff` is not useful for review.

### Next Exact Action

If the user approves, push the current local source to Apps Script, create a new version after `@25`, redeploy the current web app deployment to that version, then perform one browser Sync Now only after `UrlFetchApp` quota is available. Do not repeatedly press Sync while quota is exhausted.
