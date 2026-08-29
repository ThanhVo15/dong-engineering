var AC2Parser = (function () {
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
    var s = { S0: '', S1: '', S2: '', S3: '', S4: '', S5: '', S6: '', S7: '' };
    if (parts.length >= 8) {
      s.S0 = field(parts, 0);
      s.S1 = field(parts, 1);
      s.S2 = field(parts, 2);
      s.S3 = field(parts, 3);
      s.S4 = field(parts, 4);
      s.S5 = field(parts, 5);
      s.S6 = field(parts, 6);
      s.S7 = String(parts.slice(7).join('~') || '').trim();
    } else if (parts.length === 7) {
      s.S0 = field(parts, 0);
      s.S1 = field(parts, 1);
      s.S2 = field(parts, 2);
      s.S3 = field(parts, 3);
      s.S4 = field(parts, 4);
      var packed = field(parts, 5).split(';');
      s.S5 = String(packed[0] || '').trim();
      s.S6 = String(packed.slice(1).join(';') || '').trim();
      s.S7 = field(parts, 6);
    } else {
      for (var i = 0; i < parts.length && i <= 7; i++) s['S' + i] = field(parts, i);
      if (s.S5.indexOf(';') >= 0) {
        var semi = s.S5.split(';');
        s.S5 = String(semi[0] || '').trim();
        s.S6 = String(semi.slice(1).join(';') || '').trim();
      }
    }
    var primaryJobNo = U.jobNumberFromToken(s.S0);
    var packedJobNo = U.jobNumberFromToken(s.S5);
    var accountFirstVariant = primaryJobNo && primaryJobNo.length < 5 && packedJobNo && packedJobNo.length >= 5;
    var fallbackJobNo = (!primaryJobNo || accountFirstVariant) ? packedJobNo : '';
    return {
      S0: s.S0,
      S1: s.S1,
      S2: s.S2,
      S3: s.S3,
      S4: s.S4,
      S5: s.S5,
      S6: s.S6,
      S7: s.S7,
      jobNo: fallbackJobNo || primaryJobNo,
      code: s.S1,
      status: s.S2,
      dateSerial: s.S3,
      dateString: U.excelSerialToDate(s.S3),
      payment: s.S4,
      account: accountFirstVariant ? s.S0 : (fallbackJobNo ? '' : s.S5),
      sent: s.S6,
      contact: U.cleanTxtExt(s.S7)
    };
  }

  function numberOrNull(value) {
    var s = String(value == null ? '' : value).trim();
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function parseContent(content) {
    var fields = String(content == null ? '' : content).split('|');
    var codeParts = field(fields, 2).split('~');
    var descriptionFromCodeField = String(codeParts[1] || '').trim();
    var description = descriptionFromCodeField || field(fields, 3);
    var plannedHours = numberOrNull(field(fields, 5));
    if (plannedHours == null && codeParts.length > 2) plannedHours = numberOrNull(codeParts[2]);
    if (!description) {
      var best = '';
      for (var i = 0; i < fields.length; i++) {
        var current = field(fields, i);
        if (/[a-z]/i.test(current) && current.length > best.length) best = current;
      }
      description = best;
    }
    if (plannedHours == null) {
      for (var j = 0; j < fields.length; j++) {
        var candidate = numberOrNull(field(fields, j));
        if (candidate != null && candidate >= 0 && candidate < 1000) {
          plannedHours = candidate;
          break;
        }
      }
    }
    if (plannedHours == null) plannedHours = 0;
    return { description: description, plannedHours: plannedHours, _fields: fields };
  }

  function parse(input) {
    input = input || {};
    var filename = input.filename || input.name || '';
    var parsedName = parseFilename(filename);
    var parsedContent = parseContent(input.content || '');
    return {
      kind: 'AC2',
      filename: filename,
      path: input.path || '',
      rev: input.rev || '',
      modified: input.modified || '',
      jobNo: parsedName.jobNo,
      code: parsedName.code,
      status: parsedName.status,
      dateSerial: parsedName.dateSerial,
      dateString: parsedName.dateString,
      payment: parsedName.payment,
      account: parsedName.account,
      sent: parsedName.sent,
      contact: parsedName.contact,
      description: parsedContent.description,
      plannedHours: parsedContent.plannedHours,
      parsedName: parsedName,
      parsedContent: parsedContent
    };
  }

  return { parseFilename: parseFilename, parseContent: parseContent, parse: parse };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AC2Parser;
