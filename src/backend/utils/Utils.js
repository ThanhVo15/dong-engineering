var DongUtils = (function () {
  'use strict';

  var EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

  function text(value) {
    return String(value == null ? '' : value);
  }

  function cleanTxtExt(value) {
    return text(value).replace(/\.txt$/i, '');
  }

  function jobNumberFromToken(value) {
    var match = text(value).trim().match(/^(\d+)/);
    return match ? match[1] : '';
  }

  function cleanAssigneeName(value) {
    return cleanTxtExt(value).replace(/^@+/, '').trim();
  }

  function excelSerialToDate(serial) {
    var n = Number(serial);
    if (!isFinite(n) || n <= 0) return '';
    var d = new Date(EXCEL_EPOCH_MS + Math.round(n) * 86400000);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '/' + d.getUTCFullYear();
  }

  function dateToExcelSerial(year, month, day) {
    return Math.round((Date.UTC(year, month - 1, day) - EXCEL_EPOCH_MS) / 86400000);
  }

  function normalizeDate(value) {
    var s = text(value).trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return Number(iso[2]) + '/' + Number(iso[3]) + '/' + Number(iso[1]);
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!us) return s;
    var year = Number(us[3]);
    if (year < 100) year += 2000;
    return Number(us[1]) + '/' + Number(us[2]) + '/' + year;
  }

  function usDateToSerial(value, fallback) {
    var s = text(value).trim();
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return dateToExcelSerial(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    var us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!us) return fallback == null ? '' : fallback;
    var year = Number(us[3]);
    if (year < 100) year += 2000;
    return dateToExcelSerial(year, Number(us[1]), Number(us[2]));
  }

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function pad3(value) {
    var n = round2(value);
    var s = String(n);
    return s.length >= 3 ? s : ('000' + s).slice(-3);
  }

  function normalizeSearchText(value) {
    var s = text(value);
    try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignoreNormalize) {}
    s = s.replace(/[\u0111\u0110]/g, function (ch) { return ch === '\u0110' ? 'D' : 'd'; });
    return s.toLocaleLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeKeyPart(value) {
    return text(value)
      .replace(/\.txt$/i, '')
      .replace(/[\\/:*?"<>|#%{}[\]^~`]+/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 160);
  }

  return {
    text: text,
    cleanTxtExt: cleanTxtExt,
    jobNumberFromToken: jobNumberFromToken,
    cleanAssigneeName: cleanAssigneeName,
    excelSerialToDate: excelSerialToDate,
    dateToExcelSerial: dateToExcelSerial,
    normalizeDate: normalizeDate,
    usDateToSerial: usDateToSerial,
    round2: round2,
    pad3: pad3,
    normalizeSearchText: normalizeSearchText,
    safeKeyPart: safeKeyPart
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DongUtils;
