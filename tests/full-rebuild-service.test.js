const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const FullRebuildService = require('../src/backend/FullRebuildService');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

function entriesFromFixtures() {
  const p = fixtures.pChronos.map((row) => ({
    kind: 'P',
    filename: row.filename,
    content: row.content,
    path: `/Chronos/P_Chronos/${row.filename}`,
    rev: 'p-rev'
  }));
  const ac2 = fixtures.ac2.map((row, index) => ({
    kind: 'AC2',
    filename: row.filename,
    content: row.content,
    path: `/AC2/${row.filename}`,
    rev: `ac2-rev-${index}`
  }));
  const times = fixtures.tChronos.map((row, index) => ({
    kind: 'T',
    filename: row.filename,
    content: row.content,
    path: `/Chronos/T_Chronos/${row.filename}`,
    rev: `t-rev-${index}`
  }));
  return p.concat(ac2, times);
}

test('FullRebuildService parses entries and builds the simple cache shape', () => {
  const cache = FullRebuildService.buildFromEntries(entriesFromFixtures(), {
    now: '2026-08-09T08:00:00.000Z',
    cursor: 'cursor-after-rebuild'
  });

  assert.equal(cache.meta.cursor, 'cursor-after-rebuild');
  assert.equal(cache.meta.projectCount, 1);
  assert.equal(cache.projects['260174'].codeCount, 3);
  assert.equal(cache.jobs['260174'].ac2.length, 3);
  assert.equal(cache.jobs['260174'].times.length, 1);
  assert.equal(cache.jobs['260174'].sourceRefs.project.rev, 'p-rev');
  assert.equal(cache.jobs['260174'].sourceRefs.ac2.length, 3);
  assert.equal(cache.jobs['260174'].sourceRefs.times[0].rev, 't-rev-0');
  assert.equal(cache.diagnostics.ok, true);
  assert.deepEqual(cache.diagnostics.parseErrors, []);
});

test('FullRebuildService reports unknown source kind without failing full cache build', () => {
  const cache = FullRebuildService.buildFromEntries(entriesFromFixtures().concat([{
    filename: 'unknown.txt',
    content: ''
  }]));
  assert.equal(cache.diagnostics.ok, false);
  assert.equal(cache.diagnostics.parseErrors[0].error, 'UNKNOWN_SOURCE_KIND');
  assert.ok(cache.jobs['260174']);
});
