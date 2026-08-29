var SyncService = (function () {
  'use strict';

  var nodeSourceService;
  var nodeStatusSnapshotService;

  function sourceService() {
    if (typeof SourceService !== 'undefined') return SourceService;
    if (typeof require !== 'undefined') {
      if (!nodeSourceService) nodeSourceService = require('./SourceService');
      return nodeSourceService;
    }
    throw new Error('SourceService is not loaded.');
  }

  function statusSnapshotService() {
    if (typeof StatusSnapshotService !== 'undefined') return StatusSnapshotService;
    if (typeof require !== 'undefined') {
      try {
        if (!nodeStatusSnapshotService) nodeStatusSnapshotService = require('./StatusSnapshotService');
        return nodeStatusSnapshotService;
      } catch (ignoreRequire) {}
    }
    return null;
  }

  function updateStatusSnapshot(meta, config, extra) {
    var svc = statusSnapshotService();
    if (!svc || !svc.fromMeta) return;
    try { svc.fromMeta(meta || {}, config || {}, extra || {}); } catch (ignoreSnapshot) {}
  }

  function collectChanges(client, cursor) {
    var changes = [];
    var page = client.listFolderContinue(cursor);
    var finalCursor = page.cursor || cursor;
    while (true) {
      changes = changes.concat(page.entries || []);
      finalCursor = page.cursor || finalCursor;
      if (!page.has_more) break;
      page = client.listFolderContinue(finalCursor);
    }
    return { changes: changes, cursor: finalCursor };
  }

  function collectChangePage(client, cursor) {
    var page = client.listFolderContinue(cursor);
    return {
      changes: page.entries || [],
      cursor: page.cursor || cursor,
      hasMore: page.has_more === true
    };
  }

  function affectedJobs(changes, config) {
    return Object.keys(affectedJobChanges(changes, config));
  }

  function pIndexHitCount(pIndex, jobNo) {
    var rows = pIndex && pIndex[String(jobNo)] || [];
    return rows && rows.length || 0;
  }

  function projectHitCount(projects, jobNo) {
    var count = 0;
    projects = projects || {};
    for (var id in projects) {
      if (Object.prototype.hasOwnProperty.call(projects, id) && String(projects[id] && projects[id].jobNo || '') === String(jobNo)) count++;
    }
    return count;
  }

  function searchPRefCount(client, config, jobNo, context) {
    if (!client || !client.searchFiles) return 0;
    context = context || {};
    context.pSearchCache = context.pSearchCache || {};
    if (Object.prototype.hasOwnProperty.call(context.pSearchCache, jobNo)) return context.pSearchCache[jobNo];
    var count = 0;
    try {
      var d = (config && config.dropbox) || config || {};
      var found = client.searchFiles(d.pPath, String(jobNo), 20) || [];
      for (var i = 0; i < found.length; i++) {
        var entry = found[i] || {};
        var p = entry.path_display || entry.path_lower || '';
        if (p && sourceService().sourceJobMatches(p, config, jobNo)) count++;
      }
    } catch (ignoreSearch) {}
    context.pSearchCache[jobNo] = count;
    return count;
  }

  function projectLikeJobNo(jobNo) {
    return String(jobNo || '').length >= 5;
  }

  function shouldSearchAmbiguousCandidates(info) {
    if (!info || !info.filenameJobNo || !info.packedJobNo || info.filenameJobNo === info.packedJobNo) return false;
    return projectLikeJobNo(info.filenameJobNo) && projectLikeJobNo(info.packedJobNo);
  }

  function resolveJobForChange(entry, config, context) {
    context = context || {};
    var source = sourceService();
    var p = entry.path_display || entry.path_lower || entry.name || '';
    var info = source.jobInfoFromPath ? source.jobInfoFromPath(p, config) : { kind: source.classifyPath(p, config), jobNo: source.resolveJobNoFromPath(p, config), candidates: [] };
    if (!info.kind || !info.jobNo) return null;
    if (info.kind !== 'AC2' || (info.candidates || []).length <= 1) return info.jobNo;
    var candidates = info.candidates || [];
    var scored = [];
    var evidenceTotal = 0;
    var chosen = '';
    var chosenEvidence = 0;
    for (var i = 0; i < candidates.length; i++) {
      var jobNo = String(candidates[i].jobNo || '');
      var pIndexHits = pIndexHitCount(context.pIndex || {}, jobNo);
      var projectHits = projectHitCount(context.projects || {}, jobNo);
      var evidence = pIndexHits + projectHits;
      evidenceTotal += evidence;
      scored.push({ jobNo: jobNo, role: candidates[i].role || '', pIndexHits: pIndexHits, projectHits: projectHits, searchHits: 0, evidence: evidence });
    }
    for (var s = 0; s < scored.length; s++) {
      if (scored[s].evidence > chosenEvidence) {
        chosen = scored[s].jobNo;
        chosenEvidence = scored[s].evidence;
      }
    }
    if (!chosen && evidenceTotal === 0 && shouldSearchAmbiguousCandidates(info)) {
      var searchWinner = '';
      var searchWinners = 0;
      for (var j = 0; j < scored.length; j++) {
        scored[j].searchHits = searchPRefCount(context.client, config, scored[j].jobNo, context);
        if (scored[j].searchHits > 0) {
          searchWinner = scored[j].jobNo;
          searchWinners++;
        }
      }
      if (searchWinners === 1) chosen = searchWinner;
    }
    if (!chosen) chosen = info.jobNo;
    if (chosen !== info.jobNo || (info.filenameJobNo && info.packedJobNo && info.filenameJobNo !== info.packedJobNo)) {
      context.resolverDiagnostics = context.resolverDiagnostics || [];
      context.resolverDiagnostics.push({
        path: p,
        kind: info.kind,
        filenameJobNo: info.filenameJobNo || '',
        packedJobNo: info.packedJobNo || '',
        resolvedJobNo: chosen,
        parserJobNo: info.jobNo || '',
        candidates: scored
      });
    }
    return chosen;
  }

  function affectedJobChanges(changes, config, context) {
    var jobs = {};
    for (var i = 0; i < (changes || []).length; i++) {
      var entry = changes[i] || {};
      var p = entry.path_display || entry.path_lower || entry.name || '';
      if (!sourceService().classifyPath(p, config)) continue;
      var jobNo = resolveJobForChange(entry, config, context || {});
      if (!jobNo) continue;
      if (!jobs[jobNo]) jobs[jobNo] = [];
      jobs[jobNo].push(entry);
    }
    return jobs;
  }

  function normalizePathKey(path) {
    return String(path || '').replace(/\\/g, '/').toLowerCase();
  }

  function changedPathKeys(changes) {
    var keys = {};
    for (var i = 0; i < (changes || []).length; i++) {
      var p = changes[i] && (changes[i].path_display || changes[i].path_lower);
      if (p) keys[normalizePathKey(p)] = true;
    }
    return keys;
  }

  function detailTouchesChangedPath(detail, keys) {
    var refs = detail && detail.sourceRefs || {};
    function has(ref) {
      return ref && ref.path && keys[normalizePathKey(ref.path)];
    }
    if (has(refs.project)) return true;
    for (var i = 0; i < (refs.ac2 || []).length; i++) if (has(refs.ac2[i])) return true;
    for (var j = 0; j < (refs.times || []).length; j++) if (has(refs.times[j])) return true;
    return false;
  }

  function changesIncludeKind(changes, config, kind) {
    var source = sourceService();
    for (var i = 0; i < (changes || []).length; i++) {
      var p = changes[i] && (changes[i].path_display || changes[i].path_lower || '');
      if (source.classifyPath(p, config) === kind) return true;
    }
    return false;
  }

  function projectRefFromIndex(row) {
    row = row || {};
    if (!row.pPath) return null;
    return {
      kind: 'P',
      path: row.pPath,
      filename: row.pFilename || String(row.pPath || '').replace(/\\/g, '/').split('/').pop(),
      rev: row.rev || '',
      modified: row.modified || '',
      jobNo: row.jobNo || ''
    };
  }

  function rowRefs(rows, kind) {
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      if (!row.path) continue;
      out.push({
        kind: kind,
        path: row.path,
        filename: row.filename || String(row.path || '').replace(/\\/g, '/').split('/').pop(),
        rev: row.rev || '',
        modified: row.modified || '',
        jobNo: row.jobNo || '',
        code: row.code || ''
      });
    }
    return out;
  }

  function withIndexProjectRef(detail, projectId, projectRow) {
    var pRef = projectRefFromIndex(projectRow);
    if (!detail || !pRef) return detail;
    detail.projectId = detail.projectId || projectId;
    detail.jobNo = detail.jobNo || projectRow.jobNo || '';
    detail.sourceRefs = detail.sourceRefs || {};
    detail.sourceRefs.project = detail.sourceRefs.project && detail.sourceRefs.project.path ? detail.sourceRefs.project : pRef;
    if (!detail.sourceRefs.ac2) detail.sourceRefs.ac2 = rowRefs(detail.ac2, 'AC2');
    if (!detail.sourceRefs.times) detail.sourceRefs.times = rowRefs(detail.times, 'T');
    return detail;
  }

  function refFromPIndex(row, jobNo) {
    row = row || {};
    if (!row.path) return null;
    return {
      kind: 'P',
      path: row.path,
      filename: row.filename || String(row.path || '').replace(/\\/g, '/').split('/').pop(),
      rev: row.rev || '',
      modified: row.modified || '',
      jobNo: row.jobNo || jobNo || '',
      projectId: row.projectId || ''
    };
  }

  function excludedPathMap(paths) {
    var out = {};
    for (var i = 0; i < (paths || []).length; i++) {
      if (paths[i]) out[normalizePathKey(paths[i])] = true;
    }
    return out;
  }

  function lookupPRefs(cacheRepo, client, config, jobNo, options) {
    options = options || {};
    var excluded = excludedPathMap(options.excludePaths || []);
    var refs = [];
    var seen = {};
    function pushRef(ref) {
      if (!ref || !ref.path) return;
      var key = normalizePathKey(ref.path);
      if (excluded[key] || seen[key]) return;
      if (!sourceService().sourceJobMatches(ref.path, config, jobNo)) return;
      seen[key] = true;
      refs.push(ref);
    }
    if (cacheRepo.readPIndex) {
      try {
        var pIndex = cacheRepo.readPIndex() || {};
        var rows = pIndex[String(jobNo)] || [];
        for (var i = 0; i < rows.length; i++) {
          var idxRef = refFromPIndex(rows[i], jobNo);
          pushRef(idxRef);
        }
      } catch (ignorePIndex) {}
    }
    if ((!refs.length || options.search === true) && client.searchFiles) {
      try {
        var d = (config && config.dropbox) || config || {};
        var found = client.searchFiles(d.pPath, String(jobNo), 20) || [];
        for (var j = 0; j < found.length; j++) {
          var entry = found[j] || {};
          var p = entry.path_display || entry.path_lower || '';
          if (!p || sourceService().resolveJobNoFromPath(p, config) !== String(jobNo)) continue;
          pushRef({
            kind: 'P',
            path: p,
            filename: entry.name || String(p).replace(/\\/g, '/').split('/').pop(),
            rev: entry.rev || '',
            modified: entry.server_modified || entry.client_modified || '',
            jobNo: String(jobNo)
          });
        }
      } catch (ignoreSearch) {}
    }
    return refs;
  }

  function syntheticDetailFromPRef(jobNo, ref) {
    return {
      projectId: ref.projectId || '',
      jobNo: String(jobNo || ''),
      ac2: [],
      times: [],
      sourceRefs: {
        project: ref,
        ac2: [],
        times: []
      }
    };
  }

  function cloneDetailWithProjectRef(detail, ref, jobNo) {
    var out = {};
    detail = detail || {};
    for (var key in detail) if (Object.prototype.hasOwnProperty.call(detail, key)) out[key] = detail[key];
    out.projectId = out.projectId || ref.projectId || '';
    out.jobNo = out.jobNo || String(jobNo || ref.jobNo || '');
    out.sourceRefs = {};
    var refs = detail.sourceRefs || {};
    out.sourceRefs.project = ref;
    out.sourceRefs.ac2 = (refs.ac2 || []).slice();
    out.sourceRefs.times = (refs.times || []).slice();
    return out;
  }

  function replacementDetailsForMissingProjectRef(cacheRepo, client, config, jobNo, detail, missingPath) {
    var refs = lookupPRefs(cacheRepo, client, config, jobNo, { excludePaths: [missingPath], search: true });
    var out = [];
    for (var i = 0; i < refs.length; i++) out.push(cloneDetailWithProjectRef(detail || syntheticDetailFromPRef(jobNo, refs[i]), refs[i], jobNo));
    return out;
  }

  function readCachedJobDetails(cacheRepo, client, projects, jobNo, changes, config) {
    var keys = changedPathKeys(changes);
    var details = [];
    var touched = [];
    projects = projects || {};
    for (var id in projects) {
      if (!Object.prototype.hasOwnProperty.call(projects, id)) continue;
      if (String(projects[id].jobNo || '') !== String(jobNo)) continue;
      var candidate = withIndexProjectRef(cacheRepo.readJob(id), id, projects[id]);
      if (candidate) {
        details.push(candidate);
        if (detailTouchesChangedPath(candidate, keys)) touched.push(candidate);
      }
    }
    if (changesIncludeKind(changes, config, 'P')) return touched.length ? touched : [null];
    if (details.length) return details;
    var direct = cacheRepo.readJob(jobNo);
    if (direct) return [direct];
    var pRefs = lookupPRefs(cacheRepo, client, config, jobNo);
    if (pRefs.length) {
      var out = [];
      for (var r = 0; r < pRefs.length; r++) out.push(syntheticDetailFromPRef(jobNo, pRefs[r]));
      return out;
    }
    return [null];
  }

  function sourceChangeCount(groupedChanges, onlyJobs) {
    var count = 0;
    var allowed = null;
    if (onlyJobs) {
      allowed = {};
      for (var i = 0; i < onlyJobs.length; i++) allowed[onlyJobs[i]] = true;
    }
    groupedChanges = groupedChanges || {};
    for (var jobNo in groupedChanges) {
      if (!Object.prototype.hasOwnProperty.call(groupedChanges, jobNo)) continue;
      if (allowed && !allowed[jobNo]) continue;
      count += (groupedChanges[jobNo] || []).length;
    }
    return count;
  }

  function changePath(entry) {
    return entry && (entry.path_display || entry.path_lower || entry.name || '') || '';
  }

  function issueKey(row) {
    return [row && row.path || '', row && row.reason || '', row && row.jobNo || ''].join('|');
  }

  function appendIssueRows(issueLog, rows) {
    var out = (issueLog || []).slice(-200);
    var seen = {};
    for (var i = 0; i < out.length; i++) seen[issueKey(out[i])] = true;
    for (var j = 0; j < (rows || []).length; j++) {
      var row = rows[j] || {};
      if (!row.path && !row.reason) continue;
      var next = {
        path: row.path || '',
        reason: row.reason || row.message || '',
        jobNo: row.jobNo || '',
        firstSeenAt: row.firstSeenAt || new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      };
      var key = issueKey(next);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(next);
    }
    return out.slice(-200);
  }

  function issueRowsForSkippedJob(jobNo, changes, reason, paths) {
    var rows = [];
    var seen = {};
    for (var p = 0; p < (paths || []).length; p++) {
      var explicitPath = paths[p] || '';
      if (!explicitPath || seen[normalizePathKey(explicitPath)]) continue;
      seen[normalizePathKey(explicitPath)] = true;
      rows.push({ jobNo: jobNo, path: explicitPath, reason: reason || 'Skipped during incremental sync.' });
    }
    for (var i = 0; i < (changes || []).length; i++) {
      var changedPath = changePath(changes[i]);
      if (changedPath && seen[normalizePathKey(changedPath)]) continue;
      if (changedPath) seen[normalizePathKey(changedPath)] = true;
      rows.push({ jobNo: jobNo, path: changedPath, reason: reason || 'Skipped during incremental sync.' });
    }
    if (!rows.length) rows.push({ jobNo: jobNo, path: '', reason: reason || 'Skipped during incremental sync.' });
    return rows;
  }

  function pruneIssueRows(issueLog, jobNo, changes) {
    var paths = {};
    for (var i = 0; i < (changes || []).length; i++) {
      var p = changePath(changes[i]);
      if (p) paths[normalizePathKey(p)] = true;
    }
    return (issueLog || []).filter(function (row) {
      var sameJob = jobNo && String(row.jobNo || '') === String(jobNo);
      var samePath = row.path && paths[normalizePathKey(row.path)];
      return !(sameJob || samePath);
    });
  }

  function batchSummary(batch, processedCount) {
    batch = batch || {};
    return {
      active: true,
      baseCursor: batch.baseCursor || '',
      cursorAfterPage: batch.cursorAfterPage || '',
      hasMoreAfterPage: batch.hasMoreAfterPage === true,
      totalJobs: (batch.jobs || []).length,
      processedJobs: processedCount || (batch.processedJobs || []).length,
      skippedOrphans: (batch.skippedOrphans || []).length,
      createdAt: batch.createdAt || '',
      updatedAt: new Date().toISOString()
    };
  }

  function readPendingBatch(cacheRepo, meta) {
    if (!meta || !cacheRepo.readSyncBatch) return null;
    var batch = cacheRepo.readSyncBatch();
    if (!batch || batch.baseCursor !== meta.cursor) return null;
    return batch;
  }

  function writePendingBatch(cacheRepo, meta, batch) {
    if (!cacheRepo.writeSyncBatch) return;
    cacheRepo.writeSyncBatch(batch);
    meta.pendingSyncBatch = batchSummary(batch);
  }

  function clearPendingBatch(cacheRepo, meta) {
    meta.pendingSyncBatch = null;
    if (cacheRepo.deleteSyncBatch) {
      try { cacheRepo.deleteSyncBatch(); } catch (ignoreDelete) {}
    }
  }

  function readPIndexSafe(cacheRepo) {
    if (!cacheRepo || !cacheRepo.readPIndex) return {};
    try {
      return cacheRepo.readPIndex() || {};
    } catch (ignorePIndex) {
      return {};
    }
  }

  function createBatch(client, cursor, config, cacheRepo, projects) {
    var page = collectChangePage(client, cursor);
    var context = { client: client, projects: projects || {}, pIndex: readPIndexSafe(cacheRepo) };
    var grouped = affectedJobChanges(page.changes, config, context);
    return {
      baseCursor: cursor,
      cursorAfterPage: page.cursor,
      hasMoreAfterPage: page.hasMore === true,
      entries: page.changes,
      jobs: Object.keys(grouped).sort(),
      processedJobs: [],
      affectedProjects: [],
      skippedOrphans: [],
      resolverDiagnostics: context.resolverDiagnostics || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function processedMap(batch) {
    var out = {};
    for (var i = 0; i < (batch.processedJobs || []).length; i++) out[batch.processedJobs[i]] = true;
    return out;
  }

  function maxJobsPerRun(config) {
    var n = Number(config && config.syncMaxJobsPerRun);
    if (!isFinite(n) || n <= 0) return 1000000;
    return Math.max(1, Math.floor(n));
  }

  function maxRuntimeMs(config) {
    var n = Number(config && config.syncMaxRuntimeMs);
    if (!isFinite(n) || n <= 0) return 270000;
    return Math.max(1000, Math.floor(n));
  }

  function reachedRuntimeBudget(startedAt, config) {
    if (typeof Date === 'undefined' || !Date.now) return false;
    return Date.now() - startedAt >= maxRuntimeMs(config);
  }

  function pushUnique(list, value) {
    list = list || [];
    value = String(value || '');
    if (!value) return list;
    for (var i = 0; i < list.length; i++) if (String(list[i]) === value) return list;
    list.push(value);
    return list;
  }

  function checkpointBatch(cacheRepo, batch) {
    if (!cacheRepo.writeSyncBatch) return;
    batch.updatedAt = new Date().toISOString();
    cacheRepo.writeSyncBatch(batch);
  }

  function removeValue(list, value) {
    var out = [];
    value = String(value || '');
    for (var i = 0; i < (list || []).length; i++) {
      if (String(list[i]) !== value) out.push(list[i]);
    }
    return out;
  }

  function rememberProjectChanges(batch, staged) {
    batch.projectPatches = batch.projectPatches || {};
    batch.deletedProjectIds = batch.deletedProjectIds || [];
    var deleted = staged && staged.deletedProjectIds || [];
    for (var d = 0; d < deleted.length; d++) {
      var deletedId = String(deleted[d] || '');
      if (!deletedId) continue;
      delete batch.projectPatches[deletedId];
      batch.deletedProjectIds = pushUnique(batch.deletedProjectIds, deletedId);
    }
    var patches = staged && staged.projectPatches || {};
    for (var id in patches) {
      if (!Object.prototype.hasOwnProperty.call(patches, id)) continue;
      batch.projectPatches[id] = patches[id];
      batch.deletedProjectIds = removeValue(batch.deletedProjectIds, id);
    }
  }

  function applyRememberedProjectChanges(projects, batch) {
    projects = projects || {};
    batch = batch || {};
    for (var d = 0; d < (batch.deletedProjectIds || []).length; d++) {
      delete projects[batch.deletedProjectIds[d]];
    }
    var patches = batch.projectPatches || {};
    for (var id in patches) if (Object.prototype.hasOwnProperty.call(patches, id)) projects[id] = patches[id];
    return projects;
  }

  function stageJobCache(cacheRepo, projects, jobNo, cache, options) {
    if (cacheRepo.stageJobCache) return cacheRepo.stageJobCache(projects, jobNo, cache, options);
    return cacheRepo.mergeJobCache(jobNo, cache, options);
  }

  function publishProjectIndexes(cacheRepo, projects, meta, deletedProjectIds) {
    meta.projectCount = Object.keys(projects || {}).length;
    meta.lastCacheUpdateAt = new Date().toISOString();
    if (cacheRepo.publishProjectIndexes) return cacheRepo.publishProjectIndexes(projects, meta, deletedProjectIds || []);
    cacheRepo.writeMeta(meta);
    return { projectCount: meta.projectCount };
  }

  function hasProjectChanges(batch) {
    return Object.keys(batch && batch.projectPatches || {}).length > 0 || (batch && batch.deletedProjectIds || []).length > 0;
  }

  function isRebuildRequiredForJob(err) {
    if (!err) return false;
    if (err.code === 'CACHE_REBUILD_REQUIRED_FOR_JOB') return true;
    var message = String(err.message || err || '');
    return message.indexOf('Cannot incremental-sync job ') >= 0 && message.indexOf('without a P_Chronos source file') >= 0;
  }

  function isMissingProjectSourceRef(err, config) {
    if (!err || err.code !== 'CACHE_SOURCE_REF_NOT_FOUND') return false;
    if (err.kind === 'P') return true;
    return sourceService().classifyPath(err.path || '', config) === 'P';
  }

  function missingProjectRefError(jobNo, err) {
    var missingPath = err && err.path || '';
    var out = new Error('Cannot incremental-sync job ' + jobNo + ' because its cached P_Chronos source file is missing: ' + missingPath + '. Run full rebuild or fix the stale source path.');
    out.code = 'CACHE_REBUILD_REQUIRED_FOR_JOB';
    out.jobNo = String(jobNo || '');
    out.path = missingPath;
    out.kind = 'P';
    return out;
  }

  function rebuildDetailWithRepair(client, cacheRepo, config, jobNo, detail, changes, options, missingSourceRefs) {
    try {
      return { detail: detail, rebuilt: sourceService().rebuildJobFromRefs(client, config, jobNo, detail, changes, options) };
    } catch (err) {
      if (!isMissingProjectSourceRef(err, config)) throw err;
      missingSourceRefs.push({ jobNo: jobNo, kind: 'P', path: err.path || '', filename: err.filename || '' });
      var repairedDetails = replacementDetailsForMissingProjectRef(cacheRepo, client, config, jobNo, detail, err.path || '');
      for (var i = 0; i < repairedDetails.length; i++) {
        try {
          return { detail: repairedDetails[i], rebuilt: sourceService().rebuildJobFromRefs(client, config, jobNo, repairedDetails[i], changes, options) };
        } catch (retryErr) {
          if (!isMissingProjectSourceRef(retryErr, config)) throw retryErr;
          missingSourceRefs.push({ jobNo: jobNo, kind: 'P', path: retryErr.path || '', filename: retryErr.filename || '' });
        }
      }
      throw missingProjectRefError(jobNo, err);
    }
  }

  function syncOnce(client, cacheRepo, config, options) {
    options = options || {};
    var startedAt = Date.now ? Date.now() : new Date().getTime();
    var meta = cacheRepo.readMeta();
    var publishPending = String(meta.syncStatus || '').toLowerCase() === 'publishing' || (!meta.cursor && Number(meta.pendingProjectCount || 0) > 0);
    if (publishPending) {
      updateStatusSnapshot(meta, config);
      return { ok: false, code: 'CACHE_PUBLISHING', skipped: true, changes: 0, affectedProjects: [] };
    }
    if (!meta.cursor) {
      meta.syncStatus = 'blocked';
      meta.lastError = { code: 'MISSING_CURSOR', message: 'Full rebuild is required before incremental sync.' };
      cacheRepo.writeMeta(meta);
      updateStatusSnapshot(meta, config);
      return { ok: false, code: 'MISSING_CURSOR', changes: 0, affectedProjects: [] };
    }

    meta.syncStatus = 'running';
    meta.lastSyncMode = 'incremental';
    meta.lastSyncStartedAt = new Date().toISOString();
    meta.lastError = null;
    cacheRepo.writeMeta(meta);
    updateStatusSnapshot(meta, config);

    try {
      var projects = cacheRepo.readProjects ? cacheRepo.readProjects() : {};
      var batch = readPendingBatch(cacheRepo, meta);
      if (!batch) {
        batch = createBatch(client, meta.cursor, config, cacheRepo, projects);
        writePendingBatch(cacheRepo, meta, batch);
        cacheRepo.writeMeta(meta);
      }
      projects = applyRememberedProjectChanges(projects, batch);
      var resolverContext = { client: client, projects: projects, pIndex: readPIndexSafe(cacheRepo), resolverDiagnostics: batch.resolverDiagnostics || [] };
      var groupedChanges = affectedJobChanges(batch.entries, config, resolverContext);
      var jobs = Object.keys(groupedChanges).sort();
      batch.jobs = jobs;
      batch.resolverDiagnostics = resolverContext.resolverDiagnostics || [];
      var done = processedMap(batch);
      var remainingJobs = [];
      for (var j = 0; j < jobs.length; j++) if (!done[jobs[j]]) remainingJobs.push(jobs[j]);
      var jobsToProcess = remainingJobs.slice(0, maxJobsPerRun(config));
      var affectedProjects = batch.affectedProjects || [];
      var skippedOrphans = batch.skippedOrphans || [];
      var missingSourceRefs = batch.missingSourceRefs || [];
      var syncIssueLog = (meta.syncIssueLog || []).slice(-200);
      var now = new Date().toISOString();
      var processedThisRun = [];
      for (var i = 0; i < jobsToProcess.length; i++) {
        if (i > 0 && reachedRuntimeBudget(startedAt, config)) break;
        var jobNo = jobsToProcess[i];
        try {
          var details = readCachedJobDetails(cacheRepo, client, projects, jobNo, groupedChanges[jobNo], config);
          for (var d = 0; d < details.length; d++) {
            var detail = details[d];
            var repair = rebuildDetailWithRepair(client, cacheRepo, config, jobNo, detail, groupedChanges[jobNo], { now: now, cursor: meta.cursor }, missingSourceRefs);
            detail = repair.detail;
            var rebuilt = repair.rebuilt;
            var mergeOptions = detail && detail.projectId ? { staleProjectIds: [detail.projectId] } : {};
            var merge = stageJobCache(cacheRepo, projects, jobNo, rebuilt.cache, mergeOptions);
            rememberProjectChanges(batch, merge);
            for (var m = 0; m < (rebuilt.missingSourceRefs || []).length; m++) {
              var missing = rebuilt.missingSourceRefs[m] || {};
              missingSourceRefs.push({ jobNo: jobNo, kind: missing.kind || '', path: missing.path || '', filename: missing.filename || '' });
            }
            affectedProjects = affectedProjects.concat(merge.affectedProjects || []);
            if (!cacheRepo.stageJobCache && cacheRepo.readProjects) {
              projects = cacheRepo.readProjects();
              resolverContext.projects = projects;
            }
          }
          syncIssueLog = pruneIssueRows(syncIssueLog, jobNo, groupedChanges[jobNo]);
        } catch (jobErr) {
          if (isRebuildRequiredForJob(jobErr)) {
            var skipMessage = jobErr.message || String(jobErr);
            var skippedRows = issueRowsForSkippedJob(jobNo, groupedChanges[jobNo], skipMessage, jobErr.path ? [jobErr.path] : []);
            skippedOrphans.push({ jobNo: jobNo, changes: (groupedChanges[jobNo] || []).length, message: skipMessage, paths: skippedRows.map(function (row) { return row.path; }) });
            syncIssueLog = appendIssueRows(syncIssueLog, skippedRows);
          } else {
            throw jobErr;
          }
        }
        done[jobNo] = true;
        batch.processedJobs = pushUnique(batch.processedJobs, jobNo);
        processedThisRun.push(jobNo);
        batch.affectedProjects = affectedProjects;
        batch.skippedOrphans = skippedOrphans;
        batch.missingSourceRefs = missingSourceRefs;
        batch.syncIssueLog = syncIssueLog;
        checkpointBatch(cacheRepo, batch);
      }
      var finalMeta = cacheRepo.readMeta ? cacheRepo.readMeta() : meta;
      batch.affectedProjects = affectedProjects;
      batch.skippedOrphans = skippedOrphans;
      batch.missingSourceRefs = missingSourceRefs;
      batch.syncIssueLog = syncIssueLog;
      batch.updatedAt = new Date().toISOString();
      var remainingAfter = [];
      for (var rem = 0; rem < jobs.length; rem++) if (!done[jobs[rem]]) remainingAfter.push(jobs[rem]);
      finalMeta.syncStatus = 'idle';
      finalMeta.lastSyncStartedAt = '';
      finalMeta.lastError = null;
      finalMeta.lastCheckedAt = new Date().toISOString();
      finalMeta.lastSyncChangeCount = sourceChangeCount(groupedChanges, processedThisRun);
      finalMeta.lastSyncAffectedProjects = affectedProjects;
      finalMeta.lastSkippedOrphanJobs = skippedOrphans;
      finalMeta.lastMissingSourceRefs = missingSourceRefs.slice(Math.max(0, missingSourceRefs.length - 100));
      finalMeta.lastSyncResolverDiagnostics = batch.resolverDiagnostics || [];
      finalMeta.syncIssueLog = syncIssueLog;
      if (remainingAfter.length) {
        writePendingBatch(cacheRepo, finalMeta, batch);
        if (hasProjectChanges(batch)) publishProjectIndexes(cacheRepo, projects, finalMeta, batch.deletedProjectIds || []);
        else cacheRepo.writeMeta(finalMeta);
        updateStatusSnapshot(finalMeta, config);
        return {
          ok: true,
          changes: batch.entries.length,
          sourceChanges: sourceChangeCount(groupedChanges, processedThisRun),
          affectedJobs: processedThisRun,
          affectedProjects: affectedProjects,
          skippedOrphans: skippedOrphans,
          cursor: meta.cursor,
          cursorCommitted: false,
          morePending: true,
          pendingJobs: remainingAfter.length
        };
      }
      finalMeta.cursor = batch.cursorAfterPage;
      finalMeta.lastSyncAt = new Date().toISOString();
      finalMeta.lastSyncChangeCount = sourceChangeCount(groupedChanges);
      finalMeta.lastSyncAffectedProjects = affectedProjects;
      finalMeta.lastMissingSourceRefs = missingSourceRefs.slice(Math.max(0, missingSourceRefs.length - 100));
      finalMeta.lastSyncResolverDiagnostics = batch.resolverDiagnostics || [];
      finalMeta.syncIssueLog = syncIssueLog;
      finalMeta.pendingSyncBatch = null;
      if (hasProjectChanges(batch)) publishProjectIndexes(cacheRepo, projects, finalMeta, batch.deletedProjectIds || []);
      else cacheRepo.writeMeta(finalMeta);
      updateStatusSnapshot(finalMeta, config);
      if (cacheRepo.deleteSyncBatch) {
        try { cacheRepo.deleteSyncBatch(); } catch (ignoreDelete) {}
      }
      return {
        ok: true,
        changes: batch.entries.length,
        sourceChanges: sourceChangeCount(groupedChanges),
        affectedJobs: jobs,
        affectedProjects: affectedProjects,
        skippedOrphans: skippedOrphans,
        cursor: batch.cursorAfterPage,
        cursorCommitted: true,
        morePending: batch.hasMoreAfterPage === true
      };
    } catch (err) {
      var errorMeta = cacheRepo.readMeta ? cacheRepo.readMeta() : meta;
      errorMeta.cursor = meta.cursor;
      errorMeta.syncStatus = 'error';
      errorMeta.lastSyncStartedAt = '';
      errorMeta.lastError = { code: err && err.code || 'SYNC_ERROR', message: err && err.message || String(err) };
      cacheRepo.writeMeta(errorMeta);
      updateStatusSnapshot(errorMeta, config, { statusStale: true, lastLiveReadError: errorMeta.lastError.message });
      throw err;
    }
  }

  function syncNow(client, cacheRepo, config) {
    return syncOnce(client, cacheRepo, config);
  }

  function setAutoSync(enabled) {
    if (typeof PropertiesService === 'undefined' || typeof ScriptApp === 'undefined') {
      return { ok: false, message: 'Apps Script services are not available.' };
    }
    var props = PropertiesService.getScriptProperties();
    props.setProperty('AUTO_SYNC_ENABLED', enabled ? 'true' : 'false');
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'autoSyncTick') ScriptApp.deleteTrigger(triggers[i]);
    }
    if (enabled) ScriptApp.newTrigger('autoSyncTick').timeBased().everyMinutes(5).create();
    var svc = statusSnapshotService();
    if (svc && svc.merge) {
      try { svc.merge({ autoSyncEnabled: enabled === true }, { autoSyncEnabled: enabled === true }); } catch (ignoreSnapshot) {}
    }
    return { ok: true, enabled: enabled === true, triggerInstalled: enabled === true, intervalMinutes: 5 };
  }

  function autoSyncTriggerInstalled() {
    if (typeof ScriptApp === 'undefined') return null;
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'autoSyncTick') return true;
    }
    return false;
  }

  return {
    syncOnce: syncOnce,
    syncNow: syncNow,
    collectChanges: collectChanges,
    affectedJobs: affectedJobs,
    affectedJobChanges: affectedJobChanges,
    setAutoSync: setAutoSync,
    autoSyncTriggerInstalled: autoSyncTriggerInstalled
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SyncService;
