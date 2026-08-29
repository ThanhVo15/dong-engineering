const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const PChronosParser = require('../src/backend/parsers/PChronosParser');
const AC2Parser = require('../src/backend/parsers/AC2Parser');
const TChronosParser = require('../src/backend/parsers/TChronosParser');
const ProjectService = require('../src/backend/ProjectService');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

function fixtureJob() {
  const project = PChronosParser.parse(fixtures.pChronos[0]).project;
  const ac2 = fixtures.ac2.map((row) => AC2Parser.parse(row)).filter((row) => row.jobNo === '260174');
  const times = fixtures.tChronos.map((row) => TChronosParser.parse(row));
  return { project, ac2, times };
}

test('computeP14 joins AC2 planned hours with T actual hours by code', () => {
  const job = fixtureJob();
  const p14 = ProjectService.computeP14(job.ac2, job.times);
  const byCode = Object.fromEntries(p14.map((row) => [row.code, row]));
  assert.equal(byCode['01'].planned, 1);
  assert.equal(byCode['01'].actual, 0);
  assert.equal(byCode['02'].planned, 4);
  assert.equal(byCode['02'].actual, 1);
  assert.equal(byCode['02'].percent, 25);
});

test('computeP15 groups time rows by task and computeP16 totals visible rows', () => {
  const job = fixtureJob();
  const p15 = ProjectService.computeP15(job.times, '02');
  assert.equal(p15.length, 1);
  assert.equal(p15[0].task, 'Structural');
  assert.equal(p15[0].hours, 1);
  assert.equal(p15[0].accountDisplay, 'AnhTran+');
  assert.equal(p15[0].lastDay, '5/12/2026');
  assert.equal(ProjectService.computeP16(p15), 1);
});

test('computeP18 returns code descriptions for UI explain list', () => {
  const job = fixtureJob();
  const p18 = ProjectService.computeP18(job.ac2);
  const byCode = Object.fromEntries(p18.map((row) => [row.code, row]));
  assert.equal(byCode['02'].planned, 4);
  assert.match(byCode['02'].description, /Completion of O's/);
  assert.equal(byCode['02'].label, "+ Code 02 (4h)->Completion of O's for 1st city submittal Remodel (Structural)");
});

test('materializeJob returns UI-ready p14 p15 p16 progress bundle', () => {
  const job = fixtureJob();
  const detail = ProjectService.materializeJob('260174', job.project, job.ac2, job.times);
  assert.equal(detail.jobNo, '260174');
  assert.equal(detail.p14.length, 3);
  assert.equal(detail.p15All.length, 1);
  assert.equal(detail.p16All, 1);
  assert.equal(detail.timeTotalByCode['02'], 1);
  assert.equal(detail.project.progress, '8');
});
