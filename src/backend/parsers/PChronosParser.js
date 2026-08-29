var PChronosParser = (function () {
  'use strict';

  var nodeUtils;

  function utils() {
    if (typeof DongUtils !== 'undefined') return DongUtils;
    if (typeof require !== 'undefined') {
      if (!nodeUtils) nodeUtils = require('../utils/Utils');
      return nodeUtils;
    }
    throw new Error('DongUtils is not loaded.');
  }

  function field(parts, index) {
    return parts[index] != null ? String(parts[index]).trim() : '';
  }

  function parseFilename(filename) {
    var U = utils();
    var parts = U.cleanTxtExt(filename).split('~');
    var f0 = field(parts, 0);
    var f1 = field(parts, 1);
    var f2 = field(parts, 2);
    var f3 = field(parts, 3);
    var f4 = String(parts.slice(4).join('~') || '').trim();
    return {
      F0: f0,
      F1: f1,
      F2: f2,
      F3: f3,
      F4: f4,
      jobNo: U.jobNumberFromToken(f0),
      statusFromName: f1,
      startSerial: f2,
      endSerial: f3,
      assignee: U.cleanAssigneeName(f4)
    };
  }

  function parseContent(content) {
    var fields = String(content == null ? '' : content).split('|');
    return {
      C0: field(fields, 0),
      C1: field(fields, 1),
      C2: field(fields, 2),
      C3: field(fields, 3),
      C4: field(fields, 4),
      C5: field(fields, 5),
      C6: field(fields, 6),
      C7: field(fields, 7),
      C8: field(fields, 8),
      C9: field(fields, 9),
      C10: field(fields, 10),
      C11: field(fields, 11),
      _fields: fields
    };
  }

  function parseEmbeddedLines(content) {
    var lines = String(content == null ? '' : content).split(/\r?\n/);
    var out = { tasks: [], times: [], summaries: [], errors: [] };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!/^(TASK|TIME|SUM)\|/.test(line)) continue;
      var parts = line.split('|');
      if (parts[0] === 'TASK') {
        if (parts.length < 7) out.errors.push({ line: i + 1, type: 'TASK', value: line, message: 'Expected 7 fields.' });
        else out.tasks.push({ task: parts[1], account: parts[2], status: parts[3], code: parts[4], hours: Number(parts[5]) || 0, date: parts[6] });
      } else if (parts[0] === 'TIME') {
        if (parts.length < 6) out.errors.push({ line: i + 1, type: 'TIME', value: line, message: 'Expected 6 fields.' });
        else out.times.push({ account: parts[1], task: parts[2], date: parts[3], hours: Number(parts[4]) || 0, code: parts[5] });
      } else if (parts[0] === 'SUM') {
        if (parts.length < 3) out.errors.push({ line: i + 1, type: 'SUM', value: line, message: 'Expected 3 fields.' });
        else out.summaries.push({ date: parts[1], text: parts.slice(2).join('|') });
      }
    }
    return out;
  }

  function buildProject(filename, content) {
    var f = parseFilename(filename);
    var c = parseContent(content);
    var U = utils();
    return {
      P1_jobNumber: f.jobNo,
      P3_jobName: c.C0,
      P4_location: c.C1,
      P5_notes: c.C7,
      P6_status: f.F1,
      P7_estimate: c.C9,
      P8_architect: c.C2,
      P9_customer: c.C3,
      P10_startDate: c.C4 || U.excelSerialToDate(f.F2),
      P11_endDate: c.C5 || U.excelSerialToDate(f.F3),
      P12_type: c.C6,
      P13_assignee: f.assignee,
      contentStatus: c.C8,
      rawProgress: c.C10,
      lastChangedBy: c.C11,
      embedded: parseEmbeddedLines(content),
      _filename: filename,
      _F: f,
      _C: c
    };
  }

  function parse(input) {
    input = input || {};
    var filename = input.filename || input.name || '';
    var content = input.content || '';
    var parsedName = parseFilename(filename);
    return {
      kind: 'P',
      filename: filename,
      path: input.path || '',
      rev: input.rev || '',
      modified: input.modified || '',
      jobNo: parsedName.jobNo,
      parsedName: parsedName,
      parsedContent: parseContent(content),
      project: buildProject(filename, content)
    };
  }

  return {
    parseFilename: parseFilename,
    parseContent: parseContent,
    parseEmbeddedLines: parseEmbeddedLines,
    buildProject: buildProject,
    parse: parse
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PChronosParser;
