var TChronosParser = (function () {
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
    var parts = String(filename == null ? '' : filename).split('~');
    var U = utils();
    var tailCode = U.cleanTxtExt(parts.slice(7).join('~')).trim();
    var compactCode = U.cleanTxtExt(field(parts, 6)).trim();
    var code = tailCode || compactCode;
    return {
      T0: field(parts, 0),
      T1: field(parts, 1),
      T2: field(parts, 2),
      T3: field(parts, 3),
      T4: field(parts, 4),
      T5: field(parts, 5),
      T6: field(parts, 6),
      T7: code,
      jobNo: U.jobNumberFromToken(field(parts, 0)),
      plan: field(parts, 1),
      account: field(parts, 2),
      task: field(parts, 3),
      dateSerial: field(parts, 4),
      dateString: U.excelSerialToDate(field(parts, 4)),
      hours: Number(field(parts, 5)) || 0,
      code: code
    };
  }

  function parse(input) {
    input = input || {};
    var filename = input.filename || input.name || '';
    var parsedName = parseFilename(filename);
    return {
      kind: 'T',
      filename: filename,
      path: input.path || '',
      rev: input.rev || '',
      modified: input.modified || '',
      jobNo: parsedName.jobNo,
      plan: parsedName.plan,
      account: parsedName.account,
      task: parsedName.task,
      dateSerial: parsedName.dateSerial,
      dateString: parsedName.dateString,
      hours: parsedName.hours,
      code: parsedName.code,
      parsedName: parsedName
    };
  }

  return { parseFilename: parseFilename, parse: parse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = TChronosParser;
