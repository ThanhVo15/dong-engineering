const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const PChronosParser = require('../src/backend/parsers/PChronosParser');
const AC2Parser = require('../src/backend/parsers/AC2Parser');
const TChronosParser = require('../src/backend/parsers/TChronosParser');
const CacheService = require('../src/backend/CacheService');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

function parsedFixtures() {
  return {
    projects: fixtures.pChronos.map((row) => PChronosParser.parse(row)),
    ac2: fixtures.ac2.map((row) => AC2Parser.parse(row)),
    times: fixtures.tChronos.map((row) => TChronosParser.parse(row))
  };
}

test('buildCache creates simple meta projects and per-job detail maps', () => {
  const rows = parsedFixtures();
  const cache = CacheService.buildCache(rows.projects, rows.ac2, rows.times, {
    now: '2026-08-09T08:00:00.000Z',
    cursor: 'cursor-1'
  });
  assert.equal(cache.meta.schemaVersion, 1);
  assert.equal(cache.meta.cursor, 'cursor-1');
  assert.equal(cache.meta.projectCount, 1);
  assert.ok(cache.projects['260174']);
  assert.ok(cache.jobs['260174']);
  assert.equal(cache.projects['260174'].jobName, 'REMODEL');
  assert.equal(cache.projects['260174'].totalHours, 1);
  assert.equal(cache.projects['260174'].codeCount, 3);
  assert.equal(cache.jobs['260174'].p16All, 1);
  assert.equal(cache.jobs['260174'].timeTotalByCode['02'], 1);
});

test('buildCache preserves duplicate P job numbers with stable project ids', () => {
  const rows = parsedFixtures();
  const duplicate = PChronosParser.parse({
    filename: '260174~HOLD~45954~46173~@Duplicate.txt',
    content: fixtures.pChronos[0].content
  });
  const cache = CacheService.buildCache(rows.projects.concat([duplicate]), rows.ac2, rows.times, {
    now: '2026-08-09T08:00:00.000Z'
  });
  const ids = Object.keys(cache.projects).sort();
  assert.equal(ids.length, 2);
  assert.ok(ids.every((id) => id.startsWith('260174@@')));
  assert.deepEqual(cache.diagnostics.duplicateProjectJobs, ['260174']);
});

test('buildCache dedupes account-first AC2 rows against canonical code rows', () => {
  const p = PChronosParser.parse({
    filename: '260253~COMPLETED~46180~46196~@.txt',
    content: 'LEGACY ACCOUNT FIRST|123 TEST ST|Architect|Customer|6/7/2026|6/23/2026|Remodel|Notes|COMPLETED|10|100|admin'
  });
  const canonical = AC2Parser.parse({
    filename: '260253~02~COMPLETED~46231~UNPAID~1682;1st Sent~Anh Phan.txt',
    content: 'meta|code|02|Canonical code|planned|1|'
  });
  const accountFirst = AC2Parser.parse({
    filename: '1682~02~COMPLETED~46231~PAID~260253;1st Sent~Anh Phan.txt',
    content: 'meta|code|02|Account first duplicate|planned|2|'
  });

  const cache = CacheService.buildCache([p], [accountFirst, canonical], [], {
    now: '2026-08-09T08:00:00.000Z'
  });

  assert.equal(cache.jobs['260253'].p14.length, 1);
  assert.equal(cache.jobs['260253'].p14[0].description, 'Canonical code');
  assert.equal(cache.jobs['260253'].sourceRefs.ac2[0].filename, canonical.filename);
  assert.equal(cache.diagnostics.ac2Count, 2);
  assert.equal(cache.diagnostics.ac2DedupedCount, 1);
});
