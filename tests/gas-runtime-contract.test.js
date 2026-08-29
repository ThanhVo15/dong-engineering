const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

function runScript(context, relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInContext(code, context, { filename: relativePath });
}

test('core files load in an Apps Script-like runtime without require/module', () => {
  const context = vm.createContext({
    console,
    Date,
    Error,
    Number,
    Math,
    String,
    Object,
    Array,
    RegExp,
    isFinite
  });

  runScript(context, 'src/backend/CacheService.js');
  runScript(context, 'src/backend/parsers/PChronosParser.js');
  runScript(context, 'src/backend/parsers/AC2Parser.js');
  runScript(context, 'src/backend/parsers/TChronosParser.js');
  runScript(context, 'src/backend/ProjectService.js');
  runScript(context, 'src/backend/utils/Utils.js');
  runScript(context, 'src/backend/FullRebuildService.js');
  runScript(context, 'src/backend/Config.js');
  runScript(context, 'src/backend/DropboxClient.js');
  runScript(context, 'src/backend/CacheRepository.js');
  runScript(context, 'src/backend/StatusSnapshotService.js');
  runScript(context, 'src/backend/SourceService.js');
  runScript(context, 'src/backend/SaveService.js');
  runScript(context, 'src/backend/SyncService.js');
  runScript(context, 'src/backend/AuthService.js');
  runScript(context, 'src/backend/WebApi.js');

  const p = context.PChronosParser.parse(fixtures.pChronos[0]);
  const ac2 = fixtures.ac2.map((row) => context.AC2Parser.parse(row));
  const times = fixtures.tChronos.map((row) => context.TChronosParser.parse(row));
  const cache = context.CacheService.buildCache([p], ac2, times, {
    now: '2026-08-09T08:00:00.000Z'
  });

  assert.equal(cache.projects['260174'].jobName, 'REMODEL');
  assert.equal(cache.jobs['260174'].p16All, 1);

  const rebuilt = context.FullRebuildService.buildFromEntries([fixtures.pChronos[0]].map((row) => ({
    kind: 'P',
    filename: row.filename,
    content: row.content
  })));
  assert.equal(rebuilt.meta.projectCount, 1);
});
