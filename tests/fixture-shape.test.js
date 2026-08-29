const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('parser fixtures are present and shaped for parser-first migration', () => {
  const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));
  assert.ok(Array.isArray(fixtures.pChronos));
  assert.ok(Array.isArray(fixtures.ac2));
  assert.ok(Array.isArray(fixtures.tChronos));
  assert.ok(fixtures.pChronos.length >= 1);
  assert.ok(fixtures.ac2.length >= 2);
  assert.ok(fixtures.tChronos.length >= 1);
  assert.equal(fixtures.pChronos[0].expected.jobNo, '260174');
  assert.equal(fixtures.ac2[0].expected.code, '01');
  assert.equal(fixtures.tChronos[0].expected.code, '02');
});
