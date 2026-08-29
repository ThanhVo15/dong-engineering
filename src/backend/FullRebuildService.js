var FullRebuildService = (function () {
  'use strict';

  var nodePParser;
  var nodeAC2Parser;
  var nodeTParser;
  var nodeCacheService;

  function pParser() {
    if (typeof PChronosParser !== 'undefined') return PChronosParser;
    if (typeof require !== 'undefined') {
      if (!nodePParser) nodePParser = require('./parsers/PChronosParser');
      return nodePParser;
    }
    throw new Error('PChronosParser is not loaded.');
  }

  function ac2Parser() {
    if (typeof AC2Parser !== 'undefined') return AC2Parser;
    if (typeof require !== 'undefined') {
      if (!nodeAC2Parser) nodeAC2Parser = require('./parsers/AC2Parser');
      return nodeAC2Parser;
    }
    throw new Error('AC2Parser is not loaded.');
  }

  function tParser() {
    if (typeof TChronosParser !== 'undefined') return TChronosParser;
    if (typeof require !== 'undefined') {
      if (!nodeTParser) nodeTParser = require('./parsers/TChronosParser');
      return nodeTParser;
    }
    throw new Error('TChronosParser is not loaded.');
  }

  function cacheService() {
    if (typeof CacheService !== 'undefined') return CacheService;
    if (typeof require !== 'undefined') {
      if (!nodeCacheService) nodeCacheService = require('./CacheService');
      return nodeCacheService;
    }
    throw new Error('CacheService is not loaded.');
  }

  function text(value) {
    return String(value == null ? '' : value);
  }

  function classify(entry) {
    entry = entry || {};
    var kind = text(entry.kind).toUpperCase();
    if (kind === 'P' || kind === 'P_CHRONOS' || kind === 'PROJECT') return 'P';
    if (kind === 'AC2' || kind === 'S') return 'AC2';
    if (kind === 'T' || kind === 'T_CHRONOS' || kind === 'TIME') return 'T';

    var path = text(entry.path || entry.filename || entry.name).replace(/\\/g, '/');
    if (/\/Chronos\/P_Chronos\//i.test(path) || /\/P_Chronos\//i.test(path)) return 'P';
    if (/\/Chronos\/T_Chronos\//i.test(path) || /\/T_Chronos\//i.test(path)) return 'T';
    if (/\/AC2\//i.test(path)) return 'AC2';
    return '';
  }

  function parseOne(entry) {
    var kind = classify(entry);
    if (kind === 'P') return { kind: kind, row: pParser().parse(entry) };
    if (kind === 'AC2') return { kind: kind, row: ac2Parser().parse(entry) };
    if (kind === 'T') return { kind: kind, row: tParser().parse(entry) };
    return { kind: '', row: null, error: 'UNKNOWN_SOURCE_KIND' };
  }

  function collectOrphans(rows, pJobSet) {
    var out = [];
    var seen = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var jobNo = text(rows[i] && rows[i].jobNo).trim();
      if (!jobNo || pJobSet[jobNo] || seen[jobNo]) continue;
      seen[jobNo] = true;
      out.push(jobNo);
    }
    return out;
  }

  function buildFromEntries(entries, options) {
    options = options || {};
    var parsedProjects = [];
    var parsedCodes = [];
    var parsedTimes = [];
    var errors = [];

    for (var i = 0; i < (entries || []).length; i++) {
      var entry = entries[i] || {};
      try {
        var parsed = parseOne(entry);
        if (parsed.error) {
          errors.push({ index: i, path: entry.path || '', filename: entry.filename || entry.name || '', error: parsed.error });
        } else if (parsed.kind === 'P') {
          parsedProjects.push(parsed.row);
        } else if (parsed.kind === 'AC2') {
          parsedCodes.push(parsed.row);
        } else if (parsed.kind === 'T') {
          parsedTimes.push(parsed.row);
        }
      } catch (err) {
        errors.push({
          index: i,
          path: entry.path || '',
          filename: entry.filename || entry.name || '',
          error: err && err.message || String(err)
        });
      }
    }

    var cache = cacheService().buildCache(parsedProjects, parsedCodes, parsedTimes, options);
    var pJobSet = {};
    for (var p = 0; p < parsedProjects.length; p++) {
      if (parsedProjects[p] && parsedProjects[p].jobNo) pJobSet[parsedProjects[p].jobNo] = true;
    }
    cache.diagnostics.parseErrors = errors;
    cache.diagnostics.orphanAC2Jobs = collectOrphans(parsedCodes, pJobSet);
    cache.diagnostics.orphanTimeJobs = collectOrphans(parsedTimes, pJobSet);
    cache.diagnostics.ok = errors.length === 0;
    return cache;
  }

  return {
    classify: classify,
    parseOne: parseOne,
    buildFromEntries: buildFromEntries
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FullRebuildService;
