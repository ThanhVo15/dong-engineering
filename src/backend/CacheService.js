var CacheService = (function () {
  'use strict';

  var nodeUtils;
  var nodeProjectService;

  function utils() {
    if (typeof DongUtils !== 'undefined') return DongUtils;
    if (typeof require !== 'undefined') {
      if (!nodeUtils) nodeUtils = require('./utils/Utils');
      return nodeUtils;
    }
    throw new Error('DongUtils is not loaded.');
  }

  function projectService() {
    if (typeof ProjectService !== 'undefined') return ProjectService;
    if (typeof require !== 'undefined') {
      if (!nodeProjectService) nodeProjectService = require('./ProjectService');
      return nodeProjectService;
    }
    throw new Error('ProjectService is not loaded.');
  }

  function groupByJob(rows) {
    var out = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      var jobNo = String(row.jobNo || '').trim();
      if (!jobNo) continue;
      if (!out[jobNo]) out[jobNo] = [];
      out[jobNo].push(row);
    }
    return out;
  }

  function isCanonicalCodeRow(row) {
    row = row || {};
    var filename = String(row.filename || row.path || '').replace(/\\/g, '/').split('/').pop();
    return filename.indexOf(String(row.jobNo || '') + '~') === 0;
  }

  function dedupeCodeRows(rows) {
    var byKey = {};
    var order = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      var key = String(row.jobNo || '') + '::' + String(row.code || '');
      if (!row.jobNo || !row.code) {
        order.push('__raw__' + i);
        byKey['__raw__' + i] = row;
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
        order.push(key);
        byKey[key] = row;
        continue;
      }
      if (isCanonicalCodeRow(row) && !isCanonicalCodeRow(byKey[key])) byKey[key] = row;
    }
    var out = [];
    for (var j = 0; j < order.length; j++) out.push(byKey[order[j]]);
    return out;
  }

  function projectIdFor(row, duplicateCounts) {
    var jobNo = String(row && row.jobNo || '').trim();
    if (!jobNo) return '';
    if (Number(duplicateCounts[jobNo] || 0) <= 1) return jobNo;
    return jobNo + '@@' + utils().safeKeyPart(row.filename || row.path || jobNo);
  }

  function duplicateCounts(projectRows) {
    var counts = {};
    for (var i = 0; i < (projectRows || []).length; i++) {
      var jobNo = String(projectRows[i] && projectRows[i].jobNo || '').trim();
      if (jobNo) counts[jobNo] = (counts[jobNo] || 0) + 1;
    }
    return counts;
  }

  function compactRecord(projectId, detail, sourceProject) {
    var project = detail.project || {};
    var codeItems = detail.p14 || [];
    var codeHints = codeItems.map(function (row) {
      return [row.code, row.status, row.payment, row.account, row.contact, row.description].join(' ');
    }).join(' ');
    var searchText = utils().normalizeSearchText([
      projectId,
      detail.jobNo,
      project.P3_jobName,
      project.P4_location,
      project.P6_status,
      project.P13_assignee,
      project.P9_customer,
      project.P8_architect,
      project.P12_type,
      codeHints
    ].join(' '));
    return {
      projectId: projectId,
      jobNo: detail.jobNo,
      jobName: project.P3_jobName || '',
      location: project.P4_location || '',
      status: project.P6_status || '',
      assignee: project.P13_assignee || '',
      customer: project.P9_customer || '',
      architect: project.P8_architect || '',
      type: project.P12_type || '',
      estimate: project.P7_estimate || '',
      progress: project.progress || '',
      totalHours: detail.p16All || 0,
      codeCount: codeItems.length,
      pPath: sourceProject && sourceProject.path || '',
      pFilename: sourceProject && sourceProject.filename || '',
      rev: sourceProject && sourceProject.rev || '',
      modified: sourceProject && sourceProject.modified || '',
      updatedAt: detail.updatedAt || '',
      searchText: searchText
    };
  }

  function sourceRef(row) {
    row = row || {};
    return {
      path: row.path || '',
      filename: row.filename || '',
      rev: row.rev || '',
      modified: row.modified || '',
      kind: row.kind || '',
      jobNo: row.jobNo || '',
      code: row.code || ''
    };
  }

  function sourceRefs(rows) {
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) out.push(sourceRef(rows[i]));
    return out;
  }

  function pIndexRef(projectId, sourceProject) {
    var ref = sourceRef(sourceProject);
    ref.projectId = projectId || '';
    return ref;
  }

  function buildCache(parsedProjects, parsedCodes, parsedTimes, options) {
    options = options || {};
    var now = options.now || new Date().toISOString();
    var counts = duplicateCounts(parsedProjects || []);
    var dedupedCodes = dedupeCodeRows(parsedCodes || []);
    var codesByJob = groupByJob(dedupedCodes);
    var timesByJob = groupByJob(parsedTimes || []);
    var projects = {};
    var jobs = {};
    var pIndex = {};
    var duplicateProjectJobs = [];

    for (var i = 0; i < (parsedProjects || []).length; i++) {
      var sourceProject = parsedProjects[i] || {};
      var jobNo = String(sourceProject.jobNo || '').trim();
      if (!jobNo) continue;
      if (Number(counts[jobNo] || 0) > 1 && duplicateProjectJobs.indexOf(jobNo) < 0) duplicateProjectJobs.push(jobNo);
      var projectId = projectIdFor(sourceProject, counts);
      var codeRows = codesByJob[jobNo] || [];
      var timeRows = timesByJob[jobNo] || [];
      var detail = projectService().materializeJob(jobNo, sourceProject.project || {}, codeRows, timeRows);
      detail.projectId = projectId;
      detail.ac2 = codeRows;
      detail.times = timeRows;
      detail.sourceRefs = {
        project: sourceRef(sourceProject),
        ac2: sourceRefs(codeRows),
        times: sourceRefs(timeRows)
      };
      detail.updatedAt = now;
      jobs[projectId] = detail;
      projects[projectId] = compactRecord(projectId, detail, sourceProject);
      if (!pIndex[jobNo]) pIndex[jobNo] = [];
      pIndex[jobNo].push(pIndexRef(projectId, sourceProject));
    }

    return {
      meta: {
        schemaVersion: 1,
        cursor: options.cursor || '',
        lastSyncAt: options.lastSyncAt || '',
        lastFullRebuildAt: options.lastFullRebuildAt || now,
        syncStatus: options.syncStatus || 'idle',
        projectCount: Object.keys(projects).length,
        lastError: null
      },
      projects: projects,
      jobs: jobs,
      pIndex: pIndex,
      diagnostics: {
        pCount: (parsedProjects || []).length,
        ac2Count: (parsedCodes || []).length,
        ac2DedupedCount: dedupedCodes.length,
        timeCount: (parsedTimes || []).length,
        duplicateProjectJobs: duplicateProjectJobs
      }
    };
  }

  return {
    groupByJob: groupByJob,
    projectIdFor: projectIdFor,
    buildCache: buildCache
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CacheService;
