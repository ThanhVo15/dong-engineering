var SourceService = (function () {
  'use strict';

  var nodeUtils;
  var nodeFullRebuild;
  var nodeAC2Parser;

  function utils() {
    if (typeof DongUtils !== 'undefined') return DongUtils;
    if (typeof require !== 'undefined') {
      if (!nodeUtils) nodeUtils = require('./utils/Utils');
      return nodeUtils;
    }
    throw new Error('DongUtils is not loaded.');
  }

  function fullRebuild() {
    if (typeof FullRebuildService !== 'undefined') return FullRebuildService;
    if (typeof require !== 'undefined') {
      if (!nodeFullRebuild) nodeFullRebuild = require('./FullRebuildService');
      return nodeFullRebuild;
    }
    throw new Error('FullRebuildService is not loaded.');
  }

  function ac2Parser() {
    if (typeof AC2Parser !== 'undefined') return AC2Parser;
    if (typeof require !== 'undefined') {
      if (!nodeAC2Parser) nodeAC2Parser = require('./parsers/AC2Parser');
      return nodeAC2Parser;
    }
    return null;
  }

  function pathStarts(path, folder) {
    path = String(path || '').toLowerCase().replace(/\\/g, '/');
    folder = String(folder || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    return folder && (path === folder || path.indexOf(folder + '/') === 0);
  }

  function classifyPath(path, config) {
    var d = (config && config.dropbox) || config || {};
    if (pathStarts(path, d.pPath)) return 'P';
    if (pathStarts(path, d.ac2Path)) return 'AC2';
    if (pathStarts(path, d.tPath)) return 'T';
    return '';
  }

  function basename(path) {
    return String(path || '').replace(/\\/g, '/').split('/').pop();
  }

  function normalizePathKey(path) {
    return String(path || '').replace(/\\/g, '/').toLowerCase();
  }

  function addJobCandidate(out, seen, jobNo, role) {
    jobNo = String(jobNo || '').trim();
    if (!jobNo || seen[jobNo]) return;
    seen[jobNo] = true;
    out.push({ jobNo: jobNo, role: role || '' });
  }

  function jobInfoFromPath(path, config) {
    var kind = classifyPath(path, config);
    var name = basename(path);
    var U = utils();
    var candidates = [];
    var seen = {};
    if (kind === 'AC2') {
      var parser = ac2Parser();
      var parsed = parser && parser.parseFilename ? parser.parseFilename(name) : null;
      var filenameJobNo = parsed ? U.jobNumberFromToken(parsed.S0) : U.jobNumberFromToken(name);
      var packedJobNo = parsed ? U.jobNumberFromToken(parsed.S5) : '';
      var parserJobNo = parsed && parsed.jobNo || filenameJobNo || packedJobNo || '';
      addJobCandidate(candidates, seen, parserJobNo, 'parser');
      addJobCandidate(candidates, seen, filenameJobNo, 'filename');
      addJobCandidate(candidates, seen, packedJobNo, 'packed');
      return {
        kind: kind,
        path: path,
        filename: name,
        jobNo: parserJobNo,
        candidates: candidates,
        filenameJobNo: filenameJobNo,
        packedJobNo: packedJobNo,
        account: parsed && parsed.account || '',
        variant: filenameJobNo && packedJobNo && filenameJobNo !== packedJobNo ? 'dual-job-token' : 'canonical',
        parsedName: parsed
      };
    }
    var jobNo = U.jobNumberFromToken(name);
    addJobCandidate(candidates, seen, jobNo, 'filename');
    return { kind: kind, path: path, filename: name, jobNo: jobNo, candidates: candidates };
  }

  function resolveJobNoFromPath(path, config) {
    return jobInfoFromPath(path, config).jobNo || '';
  }

  function sourceJobMatches(path, config, jobNo) {
    var info = jobInfoFromPath(path, config);
    jobNo = String(jobNo || '');
    for (var i = 0; i < (info.candidates || []).length; i++) {
      if (String(info.candidates[i].jobNo || '') === jobNo) return true;
    }
    return String(info.jobNo || '') === jobNo;
  }

  function listAll(client, folder) {
    var out = [];
    var page = client.listFolder(folder, false);
    while (true) {
      out = out.concat(page.entries || []);
      if (!page.has_more) break;
      page = client.listFolderContinue(page.cursor);
    }
    return out;
  }

  function relevantEntry(entry, jobNo, kind, config) {
    if (!entry || entry['.tag'] !== 'file' || !/\.txt$/i.test(entry.name || '')) return false;
    var path = entry.path_display || entry.path_lower || entry.name || '';
    if (kind === 'AC2') return sourceJobMatches(path, config, jobNo);
    return utils().jobNumberFromToken(entry.name) === String(jobNo);
  }

  function downloadEntry(client, kind, entry) {
    var p = entry.path_display || entry.path_lower;
    return {
      kind: kind,
      filename: entry.name || basename(p),
      path: p,
      rev: entry.rev || '',
      modified: entry.server_modified || entry.client_modified || '',
      content: client.downloadText(p)
    };
  }

  function sourceRefsFromDetail(detail) {
    var refs = [];
    var sourceRefs = detail && detail.sourceRefs || {};
    function push(kind, ref) {
      if (!ref || !ref.path) return;
      refs.push({
        kind: kind,
        path: ref.path,
        filename: ref.filename || basename(ref.path),
        rev: ref.rev || '',
        modified: ref.modified || ''
      });
    }
    push('P', sourceRefs.project);
    for (var i = 0; i < (sourceRefs.ac2 || []).length; i++) push('AC2', sourceRefs.ac2[i]);
    for (var j = 0; j < (sourceRefs.times || []).length; j++) push('T', sourceRefs.times[j]);
    return refs;
  }

  function refFromChangedEntry(entry, config) {
    entry = entry || {};
    var p = entry.path_display || entry.path_lower || '';
    if (!p) return null;
    var kind = classifyPath(p, config);
    if (!kind) return null;
    return {
      kind: kind,
      path: p,
      filename: entry.name || basename(p),
      rev: entry.rev || '',
      modified: entry.server_modified || entry.client_modified || ''
    };
  }

  function ac2CodeFromRef(ref) {
    var parser = ac2Parser();
    if (!parser || !parser.parseFilename || !ref) return '';
    return parser.parseFilename(ref.filename || basename(ref.path)).code || '';
  }

  function isCanonicalAC2Ref(ref, jobNo) {
    var filename = String(ref && (ref.filename || basename(ref.path)) || '');
    return filename.indexOf(String(jobNo || '') + '~') === 0;
  }

  function dedupeMergedRefs(refs, jobNo) {
    var byKey = {};
    var order = [];
    for (var i = 0; i < (refs || []).length; i++) {
      var ref = refs[i] || {};
      var key = normalizePathKey(ref.path || String(i));
      if (ref.kind === 'AC2') {
        var code = ac2CodeFromRef(ref);
        if (code) key = 'AC2::' + code;
      }
      if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
        order.push(key);
        byKey[key] = ref;
        continue;
      }
      if (ref.kind === 'AC2' && isCanonicalAC2Ref(ref, jobNo) && !isCanonicalAC2Ref(byKey[key], jobNo)) byKey[key] = ref;
    }
    var out = [];
    for (var j = 0; j < order.length; j++) out.push(byKey[order[j]]);
    return out;
  }

  function mergeRefsWithChanges(refs, changes, config, jobNo) {
    var byPath = {};
    var i;
    for (i = 0; i < (refs || []).length; i++) {
      if (refs[i] && refs[i].path) byPath[normalizePathKey(refs[i].path)] = refs[i];
    }
    for (i = 0; i < (changes || []).length; i++) {
      var entry = changes[i] || {};
      var p = entry.path_display || entry.path_lower || '';
      if (!p || !sourceJobMatches(p, config, jobNo)) continue;
      var key = normalizePathKey(p);
      if (entry['.tag'] === 'deleted') {
        delete byPath[key];
        continue;
      }
      if (entry['.tag'] && entry['.tag'] !== 'file') continue;
      if (!/\.txt$/i.test(entry.name || basename(p))) continue;
      var ref = refFromChangedEntry(entry, config);
      if (ref) byPath[key] = ref;
    }
    var out = [];
    for (var k in byPath) if (Object.prototype.hasOwnProperty.call(byPath, k)) out.push(byPath[k]);
    out = dedupeMergedRefs(out, jobNo);
    out.sort(function (a, b) {
      var order = { P: 0, AC2: 1, T: 2 };
      var ak = order[a.kind] == null ? 9 : order[a.kind];
      var bk = order[b.kind] == null ? 9 : order[b.kind];
      if (ak !== bk) return ak - bk;
      return String(a.path || '').localeCompare(String(b.path || ''));
    });
    return out;
  }

  function changeDeletesProjectRef(detail, changes) {
    var projectPath = detail && detail.sourceRefs && detail.sourceRefs.project && detail.sourceRefs.project.path;
    if (!projectPath) return false;
    var key = normalizePathKey(projectPath);
    for (var i = 0; i < (changes || []).length; i++) {
      var entry = changes[i] || {};
      if (entry['.tag'] !== 'deleted') continue;
      var p = entry.path_display || entry.path_lower || '';
      if (normalizePathKey(p) === key) return true;
    }
    return false;
  }

  function downloadRef(client, ref) {
    if (!ref || !ref.path) return null;
    try {
      return {
        kind: ref.kind,
        filename: ref.filename || basename(ref.path),
        path: ref.path,
        rev: ref.rev || '',
        modified: ref.modified || '',
        content: client.downloadText(ref.path)
      };
    } catch (err) {
      if (err && err.code === 'NOT_FOUND') {
        var missing = new Error('Source file is missing during incremental sync: ' + ref.path);
        missing.code = 'CACHE_SOURCE_REF_NOT_FOUND';
        missing.kind = ref.kind || '';
        missing.path = ref.path;
        missing.filename = ref.filename || basename(ref.path);
        throw missing;
      }
      throw err;
    }
  }

  function loadJobEntries(client, config, jobNo) {
    var d = (config && config.dropbox) || config || {};
    var entries = [];
    var folders = [
      { kind: 'P', path: d.pPath },
      { kind: 'AC2', path: d.ac2Path },
      { kind: 'T', path: d.tPath }
    ];
    for (var i = 0; i < folders.length; i++) {
      var folder = folders[i];
      var listed = listAll(client, folder.path);
      for (var j = 0; j < listed.length; j++) {
        if (relevantEntry(listed[j], jobNo, folder.kind, config)) entries.push(downloadEntry(client, folder.kind, listed[j]));
      }
    }
    return entries;
  }

  function rebuildJob(client, config, jobNo, options) {
    var entries = loadJobEntries(client, config, jobNo);
    var cache = fullRebuild().buildFromEntries(entries, options || {});
    return {
      entries: entries,
      cache: cache,
      projectIds: Object.keys(cache.projects || {})
    };
  }

  function rebuildJobFromRefs(client, config, jobNo, detail, changes, options) {
    var refs = sourceRefsFromDetail(detail);
    var mergedRefs = mergeRefsWithChanges(refs, changes || [], config, jobNo);
    var hasProjectRef = false;
    for (var p = 0; p < mergedRefs.length; p++) {
      if (mergedRefs[p] && mergedRefs[p].kind === 'P') {
        hasProjectRef = true;
        break;
      }
    }
    if (!hasProjectRef && !changeDeletesProjectRef(detail, changes || [])) {
      var err = new Error('Cannot incremental-sync job ' + jobNo + ' without a P_Chronos source file. Run full rebuild.');
      err.code = 'CACHE_REBUILD_REQUIRED_FOR_JOB';
      err.jobNo = String(jobNo || '');
      throw err;
    }
    var entries = [];
    var missingSourceRefs = [];
    for (var i = 0; i < mergedRefs.length; i++) {
      try {
        var downloaded = downloadRef(client, mergedRefs[i]);
        if (downloaded) entries.push(downloaded);
      } catch (errDownload) {
        if (errDownload && errDownload.code === 'CACHE_SOURCE_REF_NOT_FOUND' && mergedRefs[i] && mergedRefs[i].kind !== 'P') {
          missingSourceRefs.push({ kind: mergedRefs[i].kind, path: mergedRefs[i].path || '', filename: mergedRefs[i].filename || basename(mergedRefs[i].path) });
          continue;
        }
        throw errDownload;
      }
    }
    var downloadedProject = false;
    for (var e = 0; e < entries.length; e++) {
      if (entries[e] && entries[e].kind === 'P') {
        downloadedProject = true;
        break;
      }
    }
    if (!downloadedProject && !changeDeletesProjectRef(detail, changes || [])) {
      var missingP = new Error('Cannot incremental-sync job ' + jobNo + ' without a P_Chronos source file. Run full rebuild.');
      missingP.code = 'CACHE_REBUILD_REQUIRED_FOR_JOB';
      missingP.jobNo = String(jobNo || '');
      throw missingP;
    }
    var cache = fullRebuild().buildFromEntries(entries, options || {});
    if (detail && detail.projectId) cache = preserveExistingProjectId(cache, detail.projectId);
    return {
      entries: entries,
      cache: cache,
      projectIds: Object.keys(cache.projects || {}),
      missingSourceRefs: missingSourceRefs,
      usedSourceRefs: true
    };
  }

  function preserveExistingProjectId(cache, projectId) {
    cache = cache || {};
    var projects = cache.projects || {};
    var jobs = cache.jobs || {};
    var keys = Object.keys(projects);
    if (keys.length !== 1 || keys[0] === projectId) return cache;
    var oldKey = keys[0];
    projects[projectId] = projects[oldKey];
    projects[projectId].projectId = projectId;
    delete projects[oldKey];
    if (jobs[oldKey]) {
      jobs[projectId] = jobs[oldKey];
      jobs[projectId].projectId = projectId;
      delete jobs[oldKey];
    }
    cache.projects = projects;
    cache.jobs = jobs;
    return cache;
  }

  return {
    classifyPath: classifyPath,
    jobInfoFromPath: jobInfoFromPath,
    sourceJobMatches: sourceJobMatches,
    resolveJobNoFromPath: resolveJobNoFromPath,
    loadJobEntries: loadJobEntries,
    rebuildJob: rebuildJob,
    rebuildJobFromRefs: rebuildJobFromRefs
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SourceService;
