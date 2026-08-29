var SaveService = (function () {
  'use strict';

  var nodeUtils;
  var nodePParser;
  var nodeAC2Parser;
  var nodeSourceService;

  function utils() {
    if (typeof DongUtils !== 'undefined') return DongUtils;
    if (typeof require !== 'undefined') {
      if (!nodeUtils) nodeUtils = require('./utils/Utils');
      return nodeUtils;
    }
    throw new Error('DongUtils is not loaded.');
  }

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

  function sourceService() {
    if (typeof SourceService !== 'undefined') return SourceService;
    if (typeof require !== 'undefined') {
      if (!nodeSourceService) nodeSourceService = require('./SourceService');
      return nodeSourceService;
    }
    throw new Error('SourceService is not loaded.');
  }

  function dirname(path) {
    return String(path || '').replace(/\\/g, '/').replace(/\/[^/]*$/, '');
  }

  function makeConflict(message) {
    var err = new Error(message || 'This project changed since you opened it. Reload latest before applying changes.');
    err.code = 'CONFLICT';
    return err;
  }

  function setField(fields, index, value) {
    while (fields.length <= index) fields.push('');
    fields[index] = value == null ? '' : String(value);
  }

  var EDITABLE_PROJECT_FIELDS = {
    P5_notes: true,
    P6_status: true,
    P11_endDate: true
  };

  function readonlyError(message) {
    var err = new Error(message);
    err.code = 'READ_ONLY_FIELD';
    return err;
  }

  function assertAllowedProjectPatch(patch) {
    var blocked = [];
    for (var key in (patch || {})) {
      if (Object.prototype.hasOwnProperty.call(patch, key) && EDITABLE_PROJECT_FIELDS[key] !== true) blocked.push(key);
    }
    if (blocked.length) throw readonlyError('Read-only project fields: ' + blocked.join(', ') + '. Only Status, End / Due, and Project Notes can be edited.');
  }

  function assertAllowedCodePatches(codePatches) {
    var blocked = [];
    for (var i = 0; i < (codePatches || []).length; i++) {
      var patch = codePatches[i] || {};
      for (var key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key) && key !== 'code' && key !== 'baseRev') blocked.push((patch.code || 'unknown') + '.' + key);
      }
    }
    if (blocked.length) throw readonlyError('Code item editing is disabled for now: ' + blocked.join(', ') + '.');
  }

  function applyProjectFields(currentProject, fields, patch) {
    patch = patch || {};
    var project = {};
    for (var key in currentProject) {
      if (Object.prototype.hasOwnProperty.call(currentProject, key)) project[key] = currentProject[key];
    }
    for (var pkey in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, pkey)) project[pkey] = patch[pkey];
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'P3_jobName')) setField(fields, 0, project.P3_jobName);
    if (Object.prototype.hasOwnProperty.call(patch, 'P4_location')) setField(fields, 1, project.P4_location);
    if (Object.prototype.hasOwnProperty.call(patch, 'P8_architect')) setField(fields, 2, project.P8_architect);
    if (Object.prototype.hasOwnProperty.call(patch, 'P9_customer')) setField(fields, 3, project.P9_customer);
    if (Object.prototype.hasOwnProperty.call(patch, 'P10_startDate')) setField(fields, 4, utils().normalizeDate(project.P10_startDate));
    if (Object.prototype.hasOwnProperty.call(patch, 'P11_endDate')) setField(fields, 5, utils().normalizeDate(project.P11_endDate));
    if (Object.prototype.hasOwnProperty.call(patch, 'P12_type')) setField(fields, 6, project.P12_type);
    if (Object.prototype.hasOwnProperty.call(patch, 'P5_notes')) setField(fields, 7, project.P5_notes);
    if (Object.prototype.hasOwnProperty.call(patch, 'P6_status')) setField(fields, 8, project.P6_status);
    if (Object.prototype.hasOwnProperty.call(patch, 'P7_estimate')) setField(fields, 9, project.P7_estimate);
    return project;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj || {}, key);
  }

  function buildPFilename(existingPath, project, parsedName, patch) {
    var U = utils();
    var jobNo = project.P1_jobNumber || parsedName.jobNo;
    var status = hasOwn(patch, 'P6_status') ? project.P6_status : parsedName.F1;
    var startSerial = hasOwn(patch, 'P10_startDate') ? U.usDateToSerial(U.normalizeDate(project.P10_startDate), parsedName.F2) : parsedName.F2;
    var endSerial = hasOwn(patch, 'P11_endDate') ? U.usDateToSerial(U.normalizeDate(project.P11_endDate), parsedName.F3) : parsedName.F3;
    var assigneeToken = hasOwn(patch, 'P13_assignee') ? ('@' + U.cleanAssigneeName(project.P13_assignee)) : parsedName.F4;
    return dirname(existingPath) + '/' + [jobNo, status, startSerial, endSerial, assigneeToken].join('~') + '.txt';
  }

  function assertSafeRename(fromPath, toPath, jobNo) {
    if (fromPath === toPath) return;
    if (dirname(fromPath).toLowerCase() !== dirname(toPath).toLowerCase()) throw new Error('Unsafe rename: folder changed.');
    if (!/\.txt$/i.test(fromPath) || !/\.txt$/i.test(toPath)) throw new Error('Unsafe rename: only .txt source files are allowed.');
    if (utils().jobNumberFromToken(toPath.split('/').pop()) !== String(jobNo)) throw new Error('Unsafe rename: job number changed.');
  }

  function assertSafeCodeRename(fromPath, toPath, jobNo, code) {
    assertSafeRename(fromPath, toPath, jobNo);
    if (utils().cleanTxtExt(String(toPath || '').split('/').pop()).split('~')[1] !== String(code || '')) {
      throw new Error('Unsafe code rename: AC2 code changed.');
    }
  }

  function destinationMustNotExist(client, path) {
    try {
      client.getMetadata(path);
      throw new Error('Destination already exists: ' + path);
    } catch (err) {
      if (err && err.code === 'NOT_FOUND') return;
      throw err;
    }
  }

  function clone(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value == null ? fallback : value));
    } catch (err) {
      return fallback;
    }
  }

  function updateCodeRows(rows, result, now) {
    rows = rows || [];
    result = result || {};
    var patch = result.patch || {};
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i] && rows[i].code || '') !== String(result.code || '')) continue;
      if (hasOwn(patch, 'status')) rows[i].status = patch.status;
      if (hasOwn(patch, 'dateString')) rows[i].dateString = patch.dateString;
      if (hasOwn(patch, 'payment')) rows[i].payment = patch.payment;
      if (hasOwn(patch, 'account')) rows[i].account = patch.account;
      if (hasOwn(patch, 'sent')) rows[i].sent = patch.sent;
      if (hasOwn(patch, 'contact')) rows[i].contact = patch.contact;
      if (hasOwn(patch, 'description')) rows[i].description = patch.description;
      rows[i].path = result.path || rows[i].path || '';
      rows[i].filename = String(result.path || rows[i].path || '').split('/').pop();
      rows[i].rev = result.rev || rows[i].rev || '';
      rows[i].modified = now;
    }
    return rows;
  }

  function updateCodeSourceRefs(refs, result, now) {
    refs = refs || [];
    result = result || {};
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i] && refs[i].code || '') !== String(result.code || '')) continue;
      refs[i].path = result.path || refs[i].path || '';
      refs[i].filename = String(result.path || refs[i].path || '').split('/').pop();
      refs[i].rev = result.rev || refs[i].rev || '';
      refs[i].modified = now;
    }
    return refs;
  }

  function updateP18Rows(rows, result) {
    rows = rows || [];
    result = result || {};
    var patch = result.patch || {};
    if (!hasOwn(patch, 'description')) return rows;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i] && rows[i].code || '') !== String(result.code || '')) continue;
      rows[i].description = patch.description;
      rows[i].label = '+ Code ' + (rows[i].code || '') + ' (' + (Number(rows[i].planned || 0) || 0) + 'h)->' + patch.description;
    }
    return rows;
  }

  function optimisticDetail(detail, nextProject, writePath, uploaded, now, options) {
    options = options || {};
    var next = clone(detail, {});
    next.project = nextProject || next.project || {};
    next.updatedAt = now;
    next.publishToken = now;
    next.sourceRefs = next.sourceRefs || {};
    if (options.projectWritten) {
      next.rev = uploaded && uploaded.rev || next.rev || '';
      next.baseRev = next.rev || next.baseRev || '';
      next.path = writePath || next.path || '';
      next.filename = String(writePath || '').split('/').pop();
      next.sourceRefs.project = next.sourceRefs.project || {};
      next.sourceRefs.project.path = writePath || next.sourceRefs.project.path || '';
      next.sourceRefs.project.filename = next.filename || next.sourceRefs.project.filename || '';
      next.sourceRefs.project.rev = next.rev || next.sourceRefs.project.rev || '';
      next.sourceRefs.project.modified = now;
    }
    var codeResults = options.codeResults || [];
    for (var i = 0; i < codeResults.length; i++) {
      next.ac2 = updateCodeRows(next.ac2 || [], codeResults[i], now);
      next.p14 = updateCodeRows(next.p14 || [], codeResults[i], now);
      next.codeItems = updateCodeRows(next.codeItems || [], codeResults[i], now);
      next.sourceRefs.ac2 = updateCodeSourceRefs(next.sourceRefs.ac2 || [], codeResults[i], now);
      next.p18 = updateP18Rows(next.p18 || [], codeResults[i]);
    }
    return next;
  }

  function hasPatchValues(patch) {
    return Object.keys(patch || {}).some(function (key) { return key !== 'code' && key !== 'baseRev'; });
  }

  function findAc2Ref(detail, code) {
    code = String(code || '');
    var rows = detail && detail.ac2 || [];
    for (var i = 0; i < rows.length; i++) if (String(rows[i].code || '') === code) return rows[i];
    var refs = detail && detail.sourceRefs && detail.sourceRefs.ac2 || [];
    for (var j = 0; j < refs.length; j++) if (String(refs[j].code || '') === code) return refs[j];
    return null;
  }

  function buildAc2Filename(existingPath, parsedName, patch) {
    patch = patch || {};
    var U = utils();
    var filename = String(existingPath || '').split('/').pop();
    var parts = U.cleanTxtExt(filename).split('~');
    var jobNo = parsedName.S0;
    var code = parsedName.S1;
    var status = hasOwn(patch, 'status') ? patch.status : parsedName.S2;
    var dateSerial = hasOwn(patch, 'dateString') ? U.usDateToSerial(U.normalizeDate(patch.dateString), parsedName.S3) : parsedName.S3;
    var payment = hasOwn(patch, 'payment') ? patch.payment : parsedName.S4;
    var account = hasOwn(patch, 'account') ? patch.account : parsedName.S5;
    var sent = hasOwn(patch, 'sent') ? patch.sent : parsedName.S6;
    var contact = hasOwn(patch, 'contact') ? patch.contact : parsedName.S7;
    var tail = parts.length >= 8
      ? [jobNo, code, status, dateSerial, payment, account, sent, contact]
      : [jobNo, code, status, dateSerial, payment, account + ';' + sent, contact];
    return dirname(existingPath) + '/' + tail.join('~') + '.txt';
  }

  function applyAc2ContentFields(fields, patch) {
    patch = patch || {};
    if (hasOwn(patch, 'description')) {
      var codeParts = String(fields[2] || '').split('~');
      if (codeParts.length > 1) {
        codeParts[1] = patch.description == null ? '' : String(patch.description);
        setField(fields, 2, codeParts.join('~'));
      }
      setField(fields, 3, patch.description);
    }
    return fields;
  }

  function saveCodePatch(client, detail, patch) {
    patch = patch || {};
    var code = String(patch.code || '');
    if (!code || !hasPatchValues(patch)) return null;
    var ref = findAc2Ref(detail, code);
    if (!ref || !ref.path) throw new Error('AC2 sourceRef is missing for code ' + code + '.');
    var sourcePath = ref.path;
    var metadata = client.getMetadata(sourcePath);
    if (patch.baseRev && metadata.rev && patch.baseRev !== metadata.rev) throw makeConflict('Code ' + code + ' changed since you opened it. Reload latest before applying changes.');
    var content = client.downloadText(sourcePath);
    var parsedName = ac2Parser().parseFilename(sourcePath.split('/').pop());
    var parsedContent = ac2Parser().parseContent(content);
    var fields = applyAc2ContentFields((parsedContent._fields || []).slice(0), patch);
    var nextContent = fields.join('|');
    var nextPath = buildAc2Filename(sourcePath, parsedName, patch);
    assertSafeCodeRename(sourcePath, nextPath, detail.jobNo || parsedName.jobNo, code);
    var writePath = sourcePath;
    var writeRev = metadata.rev || ref.rev || '';
    if (nextPath !== sourcePath) {
      destinationMustNotExist(client, nextPath);
      client.move(sourcePath, nextPath);
      writePath = nextPath;
      writeRev = (client.getMetadata(writePath) || {}).rev || '';
    }
    var uploaded = client.uploadText(writePath, nextContent, writeRev ? { rev: writeRev } : {});
    return { code: code, path: writePath, rev: uploaded.rev || '', patch: patch };
  }

  function refreshProjectCache(client, cacheRepo, config, projectIdOrJobNo, existingOverride) {
    var projectId = projectIdOrJobNo;
    var existing = existingOverride || cacheRepo.readJob(projectIdOrJobNo);
    if (!existing) {
      var projects = cacheRepo.readProjects ? cacheRepo.readProjects() : {};
      for (var key in projects) {
        if (Object.prototype.hasOwnProperty.call(projects, key) && String(projects[key].jobNo || '') === String(projectIdOrJobNo)) {
          projectId = key;
          existing = cacheRepo.readJob(key);
          break;
        }
      }
    }
    var jobNo = existing && (existing.jobNo || existing.project && existing.project.P1_jobNumber) || projectIdOrJobNo;
    var rebuilt = sourceService().rebuildJobFromRefs(client, config, jobNo, existing, [], { now: new Date().toISOString() });
    var merge = cacheRepo.mergeJobCache(jobNo, rebuilt.cache, { staleProjectIds: existing && existing.projectId ? [existing.projectId] : [] });
    var latestProjectId = merge.affectedProjects[0] || projectId || jobNo;
    return {
      ok: true,
      projectId: latestProjectId,
      jobNo: jobNo,
      detail: cacheRepo.readJob(latestProjectId),
      cache: merge
    };
  }

  function saveProject(client, cacheRepo, config, payload) {
    payload = payload || {};
    var projectId = payload.projectId || payload.projectKey;
    if (!projectId) throw new Error('Missing projectId.');
    var detail = cacheRepo.readJob(projectId);
    if (!detail || !detail.sourceRefs || !detail.sourceRefs.project || !detail.sourceRefs.project.path) throw new Error('Project sourceRef is missing.');
    var projectPatch = payload.patch || payload.projectPatch || {};
    assertAllowedProjectPatch(projectPatch);
    assertAllowedCodePatches(payload.codePatches || []);
    var projectWritten = hasPatchValues(projectPatch);
    var writePath = detail.sourceRefs.project.path;
    var uploaded = { rev: detail.sourceRefs.project.rev || '' };
    var nextProject = clone(detail.project || {}, {});
    if (projectWritten) {
      var sourcePath = detail.sourceRefs.project.path;
      var metadata = client.getMetadata(sourcePath);
      if (payload.baseRev && metadata.rev && payload.baseRev !== metadata.rev) throw makeConflict();

      var content = client.downloadText(sourcePath);
      var parsedName = pParser().parseFilename(sourcePath.split('/').pop());
      var parsedContent = pParser().parseContent(content);
      var fields = (parsedContent._fields || []).slice(0);
      nextProject = applyProjectFields(detail.project || {}, fields, projectPatch);
      var nextContent = fields.join('|');
      var nextPath = buildPFilename(sourcePath, nextProject, parsedName, projectPatch);
      assertSafeRename(sourcePath, nextPath, detail.jobNo || nextProject.P1_jobNumber);

      var writeRev = metadata.rev || detail.sourceRefs.project.rev || '';
      if (nextPath !== sourcePath) {
        destinationMustNotExist(client, nextPath);
        client.move(sourcePath, nextPath);
        writePath = nextPath;
        writeRev = (client.getMetadata(writePath) || {}).rev || '';
      }
      uploaded = client.uploadText(writePath, nextContent, writeRev ? { rev: writeRev } : {});
    }
    var codeResults = [];
    for (var c = 0; c < (payload.codePatches || []).length; c++) {
      var codeResult = saveCodePatch(client, detail, payload.codePatches[c]);
      if (codeResult) codeResults.push(codeResult);
    }
    var jobNo = detail.jobNo || nextProject.P1_jobNumber;
    var now = new Date().toISOString();
    var optimistic = optimisticDetail(detail, nextProject, writePath, uploaded, now, { projectWritten: projectWritten, codeResults: codeResults });
    if (payload.refreshCache === false) {
      return {
        ok: true,
        projectId: projectId,
        jobNo: jobNo,
        path: writePath,
        rev: uploaded.rev || '',
        detail: optimistic,
        codeResults: codeResults,
        cachePending: true
      };
    }
    var refreshed = refreshProjectCache(client, cacheRepo, config, projectId, optimistic);
    var latestProjectId = refreshed.projectId || projectId;
    return {
      ok: true,
      projectId: latestProjectId,
      jobNo: jobNo,
      path: writePath,
      rev: uploaded.rev || '',
      detail: refreshed.detail,
      codeResults: codeResults,
      cache: refreshed.cache
    };
  }

  return {
    saveProject: saveProject,
    refreshProjectCache: refreshProjectCache,
    _applyProjectFields: applyProjectFields,
    _buildPFilename: buildPFilename
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SaveService;
