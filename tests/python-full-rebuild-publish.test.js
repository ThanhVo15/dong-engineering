const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('Python full rebuild publisher uses safe full-publish order without partial idle/index claims', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  const publishBody = script.match(/def publish_simple_cache_to_dropbox[\s\S]*?def read_json/)[0];
  assert.match(publishBody, /publishing_meta\["cursor"\]\s*=\s*""/);
  assert.match(publishBody, /publishing_meta\["syncStatus"\]\s*=\s*"publishing"/);
  assert.match(publishBody, /join_dropbox\(db_path,\s*"meta\.json"\)/);
  assert.match(publishBody, /join_dropbox\(jobs_path,\s*path\.name\)/);
  assert.match(publishBody, /join_dropbox\(db_path,\s*"projects\.json"\)/);
  assert.match(publishBody, /join_dropbox\(db_path,\s*"p_index\.json"\)/);
  assert.match(publishBody, /join_dropbox\(db_path,\s*"meta\.json"\),\s*meta_path\.read_bytes\(\)/);
  assert.doesNotMatch(publishBody, /partial_projects/);
  assert.doesNotMatch(publishBody, /partial_meta/);
  assert.doesNotMatch(publishBody, /partialCache/);
});

test('Python Dropbox publisher retries transient network timeouts', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /import socket/);
  assert.match(script, /def is_transient_network_error/);
  assert.match(script, /urllib\.error\.URLError/);
  assert.match(script, /WinError 10060/i);
  assert.match(script, /network timeout\/error/);
  assert.match(script, /for attempt in range\(20\)/);
});

test('Python publisher can resume a pending cloud publish for the same build', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /def dropbox_list_file_names/);
  assert.match(script, /same_build_pending/);
  assert.match(script, /build_p_index_from_projects/);
  assert.match(script, /resume mode found/);
  assert.match(script, /existing_job_names/);
  assert.match(script, /skipped_existing/);
  assert.match(script, /already existed/);
});

test('Python cloud rebuild can move existing __db__ to backup before publishing new cache', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /def dropbox_move/);
  assert.match(script, /files\/move_v2/);
  assert.match(script, /--backup-existing-cloud-db/);
  assert.match(script, /--backup-db-name/);
  assert.match(script, /__db_backup__/);
  assert.match(script, /BACKUP: moving existing Dropbox cache/);
  assert.match(script, /dropbox_move\(token,\s*db_path,\s*backup_path\)/);
  assert.match(script, /Refusing to back up .* onto itself/);
});

test('Python can rebuild cache from Dropbox API without SANDBOX_LOCAL_ROOT', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /--cloud-rebuild/);
  assert.match(script, /def scan_dropbox_source_files/);
  assert.match(script, /def write_cloud_entries_json/);
  assert.match(script, /source mode=Dropbox API cloud rebuild; local source paths are ignored/);
  assert.match(script, /args\.cloud_rebuild[\s\S]*?scan_dropbox_source_files/);
  assert.match(script, /build_args\.entries_json = entries_json/);
  assert.match(script, /--entries-json/);
  assert.match(script, /"dropbox_api"/);
  const cloudBranch = script.match(/if args\.cloud_rebuild:([\s\S]*?)cursor, scan = scan_dropbox/);
  assert.ok(cloudBranch, 'cloud rebuild branch exists before local rebuild branch');
  assert.doesNotMatch(cloudBranch[1], /count_local_txt/);
});

test('Python cloud rebuild decodes legacy non UTF-8 txt without crashing', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /def decode_source_bytes/);
  assert.match(script, /data\.startswith\(b"\\xff\\xfe"\)/);
  assert.match(script, /for encoding in \("utf-8", "cp1252", "latin-1"\):/);
  assert.match(script, /data\.decode\("utf-8", errors="replace"\)/);
  assert.match(script, /content, encoding, lossy = decode_source_bytes\(raw, meta\["path"\]\)/);
  assert.match(script, /entry\["encoding"\] = encoding/);
  assert.match(script, /nonUtf8/);
});

test('Python cloud rebuild defaults to one-by-one downloads and keeps optional parallel mode', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /import concurrent\.futures/);
  assert.match(script, /--download-workers/);
  assert.match(script, /DONG_DROPBOX_DOWNLOAD_WORKERS/);
  assert.match(script, /DONG_DROPBOX_DOWNLOAD_WORKERS", "1"/);
  assert.match(script, /Default: 1, one-by-one/);
  assert.match(script, /def download_cloud_source_entry/);
  assert.match(script, /if workers == 1:/);
  assert.match(script, /write_entry\(index, download_cloud_source_entry\(token, meta, download_t_content=download_t_content\)\)/);
  assert.match(script, /ThreadPoolExecutor\(max_workers=workers\)/);
  assert.match(script, /concurrent\.futures\.as_completed/);
  assert.match(script, /pending:\s*Dict\[int,\s*Dict\[str,\s*Any\]\]\s*=\s*\{\}/);
  assert.match(script, /while next_write in pending:/);
  assert.match(script, /write_cloud_entries_json\(token, files, entries_json, workers=args\.download_workers, download_t_content=args\.download_t_content\)/);
});

test('Python cloud rebuild skips T_Chronos content by default but has an explicit full-content flag', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /--download-t-content/);
  assert.match(script, /Default skips T content because current cache\/UI parse T rows from filenames/);
  assert.match(script, /def download_cloud_source_entry\(token: str, meta: Dict\[str, Any\], download_t_content: bool = False\)/);
  assert.match(script, /str\(meta\.get\("kind"\) or ""\)\.upper\(\) == "T" and not download_t_content/);
  assert.match(script, /entry\["content"\] = ""/);
  assert.match(script, /entry\["encoding"\] = "metadata-only"/);
  assert.match(script, /entry\["_contentSkipped"\] = True/);
  assert.match(script, /skippedContent/);
  assert.match(script, /including T content" if download_t_content else "skipping T content"/);
});

test('Python cloud rebuild skips source files that disappeared after scan', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /class DropboxPathNotFoundError\(RuntimeError\)/);
  assert.match(script, /path\/not_found/);
  assert.match(script, /raise DropboxPathNotFoundError/);
  assert.match(script, /except DropboxPathNotFoundError:/);
  assert.match(script, /entry\["_sourceMissing"\] = True/);
  assert.match(script, /missingSource/);
  assert.match(script, /source disappeared after scan; skipping/);
  assert.match(script, /if source_missing:[\s\S]*?return[\s\S]*?if not first:/);
});

test('Python cloud rebuild keeps temp source entries after unexpected failure', () => {
  const script = fs.readFileSync(path.resolve('..', 'scripts', 'local_dropbox_full_rebuild.py'), 'utf8');
  assert.match(script, /cloud_rebuild_completed = False/);
  assert.match(script, /cloud_rebuild_completed = True/);
  assert.match(script, /keeping temp source entries folder after failure for inspection/);
  assert.match(script, /if cloud_rebuild_completed:[\s\S]*?shutil\.rmtree\(cloud_temp/);
});
