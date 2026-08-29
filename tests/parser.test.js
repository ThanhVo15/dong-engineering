const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const Utils = require('../src/backend/utils/Utils');
const PChronosParser = require('../src/backend/parsers/PChronosParser');
const AC2Parser = require('../src/backend/parsers/AC2Parser');
const TChronosParser = require('../src/backend/parsers/TChronosParser');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

test('Excel serial conversion matches business examples', () => {
  assert.equal(Utils.excelSerialToDate(46157), '5/15/2026');
  assert.equal(Utils.excelSerialToDate(46145), '5/3/2026');
  assert.equal(Utils.excelSerialToDate(46154), '5/12/2026');
  assert.equal(Utils.usDateToSerial('5/15/2026'), 46157);
});

test('P_Chronos parser maps filename and content fields to P fields', () => {
  const row = fixtures.pChronos[0];
  const parsed = PChronosParser.parse(row);
  assert.equal(parsed.jobNo, row.expected.jobNo);
  assert.equal(parsed.parsedName.statusFromName, row.expected.status);
  assert.equal(parsed.parsedName.assignee, row.expected.assignee);
  assert.equal(parsed.project.P6_status, parsed.parsedName.F1);
  assert.equal(parsed.project.contentStatus, parsed.parsedContent.C8);
  for (const [field, expected] of Object.entries(row.expected.project)) {
    assert.equal(parsed.project[field], expected, field);
  }
});

test('AC2 parser supports packed and separate filename variants', () => {
  for (const row of fixtures.ac2) {
    const parsed = AC2Parser.parse(row);
    for (const [field, expected] of Object.entries(row.expected)) {
      assert.equal(parsed[field], expected, `${row.name}: ${field}`);
    }
  }
});

test('AC2 parser supports account-first legacy filename variant', () => {
  const parsed = AC2Parser.parse({
    filename: '1682~02~COMPLETED~46231~PAID~260253;1st Sent~Anh Phan.txt',
    content: 'meta|code|02|Legacy account first code|planned|1|'
  });
  assert.equal(parsed.jobNo, '260253');
  assert.equal(parsed.account, '1682');
  assert.equal(parsed.sent, '1st Sent');
  assert.equal(parsed.contact, 'Anh Phan');
});

test('T_Chronos parser maps time row filename fields', () => {
  const row = fixtures.tChronos[0];
  const parsed = TChronosParser.parse(row);
  for (const [field, expected] of Object.entries(row.expected)) {
    assert.equal(parsed[field], expected, field);
  }
});
