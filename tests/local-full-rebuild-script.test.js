const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

function writeFixture(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

test('local_full_rebuild.js writes simple __db__ cache from local txt folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dong-rebuild-'));
  const pRoot = path.join(root, 'Chronos', 'P_Chronos');
  const ac2Root = path.join(root, 'AC2');
  const tRoot = path.join(root, 'Chronos', 'T_Chronos');
  const dbRoot = path.join(root, '__db__');

  writeFixture(pRoot, fixtures.pChronos[0].filename, fixtures.pChronos[0].content);
  for (const row of fixtures.ac2) writeFixture(ac2Root, row.filename, row.content);
  for (const row of fixtures.tChronos) writeFixture(tRoot, row.filename, row.content);

  const result = spawnSync(process.execPath, [
    'scripts/local_full_rebuild.js',
    '--clean',
    '--db-root', dbRoot,
    '--p-local-path', pRoot,
    '--ac2-local-path', ac2Root,
    '--t-local-path', tRoot,
    '--p-dropbox-path', '/Dong Engineering Sandbox/Chronos/P_Chronos',
    '--ac2-dropbox-path', '/Dong Engineering Sandbox/AC2',
    '--t-dropbox-path', '/Dong Engineering Sandbox/Chronos/T_Chronos',
    '--dropbox-root', '/Dong Engineering Sandbox',
    '--environment', 'sandbox_dropbox',
    '--cursor', 'cursor-test'
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.mode, 'simple_cache');
  assert.equal(summary.counts.projects, 1);

  const meta = JSON.parse(fs.readFileSync(path.join(dbRoot, 'meta.json'), 'utf8'));
  const projects = JSON.parse(fs.readFileSync(path.join(dbRoot, 'projects.json'), 'utf8'));
  const pIndex = JSON.parse(fs.readFileSync(path.join(dbRoot, 'p_index.json'), 'utf8'));
  const job = JSON.parse(fs.readFileSync(path.join(dbRoot, 'jobs', '260174.json'), 'utf8'));
  assert.equal(meta.cursor, 'cursor-test');
  assert.equal(projects['260174'].jobName, 'REMODEL');
  assert.equal(pIndex['260174'][0].path, projects['260174'].pPath);
  assert.equal(job.sourceRefs.ac2.length, 3);
  assert.equal(job.p16All, 1);
  assert.equal(fs.existsSync(path.join(dbRoot, 'sync_batch.json')), false);
});

test('local_full_rebuild.js can build from Dropbox API entries json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dong-rebuild-cloud-'));
  const dbRoot = path.join(root, '__db__');
  const entriesPath = path.join(root, 'entries.json');
  const entries = [
    {
      kind: 'P',
      filename: fixtures.pChronos[0].filename,
      content: fixtures.pChronos[0].content,
      path: '/New Root/Chronos/P_Chronos/' + fixtures.pChronos[0].filename,
      modified: '2026-08-12T01:00:00Z',
      rev: 'p-rev'
    },
    ...fixtures.ac2.map((row, index) => ({
      kind: 'AC2',
      filename: row.filename,
      content: row.content,
      path: '/New Root/AC2/' + row.filename,
      modified: '2026-08-12T01:0' + index + ':00Z',
      rev: 'ac2-rev-' + index
    })),
    ...fixtures.tChronos.map((row, index) => ({
      kind: 'T',
      filename: row.filename,
      content: row.content,
      path: '/New Root/Chronos/T_Chronos/' + row.filename,
      modified: '2026-08-12T01:1' + index + ':00Z',
      rev: 't-rev-' + index
    }))
  ];
  fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2), 'utf8');

  const result = spawnSync(process.execPath, [
    'scripts/local_full_rebuild.js',
    '--clean',
    '--db-root', dbRoot,
    '--entries-json', entriesPath,
    '--dropbox-root', '/New Root',
    '--environment', 'sandbox_dropbox',
    '--cursor', 'cloud-cursor-test'
  ], { cwd: process.cwd(), encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.mode, 'simple_cache');
  assert.equal(summary.counts.projects, 1);

  const meta = JSON.parse(fs.readFileSync(path.join(dbRoot, 'meta.json'), 'utf8'));
  const pIndex = JSON.parse(fs.readFileSync(path.join(dbRoot, 'p_index.json'), 'utf8'));
  const job = JSON.parse(fs.readFileSync(path.join(dbRoot, 'jobs', '260174.json'), 'utf8'));
  assert.equal(meta.cursor, 'cloud-cursor-test');
  assert.equal(meta.rebuildSource, 'dropbox_api');
  assert.equal(pIndex['260174'][0].rev, 'p-rev');
  assert.equal(job.sourceRefs.project.path, '/New Root/Chronos/P_Chronos/' + fixtures.pChronos[0].filename);
  assert.equal(job.sourceRefs.project.rev, 'p-rev');
  assert.equal(fs.existsSync(path.join(dbRoot, 'sync_batch.json')), false);
});
