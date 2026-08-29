# Dong Engineering Project Management

Clean rebuild of the Apps Script + Dropbox Project Management app.

## System

```text
Dropbox txt source files
  -> parsers
  -> cache in __db__
  -> Apps Script backend
  -> responsive UI
```

## Source Of Truth

The source of truth is always Dropbox `.txt` files:

- `Chronos/P_Chronos`
- `AC2`
- `Chronos/T_Chronos`

Do not edit `__db__` by hand. It is a rebuildable cache/index for fast UI loading.

## Cache

Target cache shape:

```text
__db__/
  meta.json
  projects.json
  jobs/
    <jobNo>.json
```

Normal sync upserts/deletes affected jobs. It must not create a new versioned build every 5 minutes.

## Full Rebuild

Preferred full rebuild is the Python runner from the reference repo. It reads `.env.local`, scans Dropbox for a cursor, calls the new repo's JS core builder in a non-Dropbox staging folder, then publishes cache files to Dropbox cloud by API:

```powershell
python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --clean
```

Default output for the Apps Script UI is Dropbox cloud path:

```text
/Dong Engineering Sandbox/__db__/meta.json
/Dong Engineering Sandbox/__db__/projects.json
/Dong Engineering Sandbox/__db__/jobs/*.json
```

During a long cloud publish, `meta.json` is temporarily marked `syncStatus: "publishing"` with `projectCount: 0`. The final publish order is `jobs/*.json` first, `projects.json` second, and final `meta.json` last. That keeps the UI from seeing a completed cursor before cache detail files exist.

For a safe dry run into a temp cache:

```powershell
python E:\Develop\dong_engineering\scripts\local_dropbox_full_rebuild.py --db-root E:\Develop\dong_engineering\dong_engineering\.tmp_rebuild\__db__ --clean --skip-cloud-publish
```

The output is:

```text
__db__/
  meta.json
  projects.json
  jobs/<projectKey>.json
```

## Incremental Sync

Incremental sync reads `meta.cursor`, gets Dropbox changes, updates only affected jobs, validates cache writes, then commits the new cursor last.

## Save

Save is source-first:

1. validate dirty payload;
2. read Dropbox source metadata/rev;
3. write or safe-rename source txt;
4. verify Dropbox success;
5. recompute affected job cache;
6. clear UI dirty state only after success.

## Repo Structure

```text
src/backend       Apps Script backend services; no top-level CommonJS require
src/backend/parsers
src/frontend      old Project Management UI shell/styles plus clean client wiring
scripts           local JS full rebuild builder called by Python
tests             Node smoke/unit tests
docs              business rules and migration notes
log.md            project memory / exact continuation state
```

## Development

Run:

```powershell
npm.cmd test
```

Apps Script push preview:

```powershell
clasp status
clasp push
```

`clasp status` should show only `appsscript.json`, `src/backend/*`, and `src/frontend/*` as tracked.

## Current Verification

- Node/unit tests: `npm.cmd test` passes.
- Apps Script no-CommonJS contract: VM test loads core files without `require/module`.
- Python temp full rebuild: verified against sandbox Dropbox/local files and wrote simple cache shape.
- Real cloud Apps Script push/deploy and real write/save should be manually tested against the intended preview script before production use.
