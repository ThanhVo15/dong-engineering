var CacheRepository = (function () {
  'use strict';

  function join(base, child) {
    return String(base || '').replace(/\/+$/, '') + '/' + String(child || '').replace(/^\/+/, '');
  }

  function create(client, config) {
    return new Repository(client, config);
  }

  function Repository(client, config) {
    this.client = client;
    this.config = config || {};
    this.dbPath = (this.config.dropbox && this.config.dropbox.dbPath) || this.config.dbPath || '';
  }

  Repository.prototype._readJson = function (path, fallback) {
    try {
      return JSON.parse(this.client.downloadText(path));
    } catch (err) {
      if (err && err.code === 'NOT_FOUND') return fallback;
      throw err;
    }
  };

  Repository.prototype._writeJson = function (path, value, rev) {
    return this.client.uploadText(path, JSON.stringify(value, null, 2) + '\n', rev ? { rev: rev } : {});
  };

  Repository.prototype.metaPath = function () { return join(this.dbPath, 'meta.json'); };
  Repository.prototype.projectsPath = function () { return join(this.dbPath, 'projects.json'); };
  Repository.prototype.pIndexPath = function () { return join(this.dbPath, 'p_index.json'); };
  Repository.prototype.syncBatchPath = function () { return join(this.dbPath, 'sync_batch.json'); };
  Repository.prototype.jobPath = function (projectId) { return join(join(this.dbPath, 'jobs'), projectId + '.json'); };

  Repository.prototype.readMeta = function () {
    return this._readJson(this.metaPath(), { schemaVersion: 1, cursor: '', syncStatus: 'idle', projectCount: 0, lastError: null });
  };

  Repository.prototype.writeMeta = function (meta) {
    return this._writeJson(this.metaPath(), meta || {});
  };

  Repository.prototype.readProjects = function () {
    return this._readJson(this.projectsPath(), {});
  };

  Repository.prototype.writeProjects = function (projects) {
    return this._writeJson(this.projectsPath(), projects || {});
  };

  Repository.prototype.readPIndex = function () {
    return this._readJson(this.pIndexPath(), {});
  };

  Repository.prototype.writePIndex = function (pIndex) {
    return this._writeJson(this.pIndexPath(), pIndex || {});
  };

  Repository.prototype.readSyncBatch = function () {
    return this._readJson(this.syncBatchPath(), null);
  };

  Repository.prototype.writeSyncBatch = function (batch) {
    return this._writeJson(this.syncBatchPath(), batch || {});
  };

  Repository.prototype.deleteSyncBatch = function () {
    return this.client.deletePath(this.syncBatchPath());
  };

  Repository.prototype.readJob = function (projectId) {
    return this._readJson(this.jobPath(projectId), null);
  };

  Repository.prototype.writeJob = function (projectId, detail) {
    return this._writeJson(this.jobPath(projectId), detail || {});
  };

  Repository.prototype.deleteJob = function (projectId) {
    return this.client.deletePath(this.jobPath(projectId));
  };

  Repository.prototype.upsertCacheResult = function (cache) {
    var projects = cache.projects || {};
    var jobs = cache.jobs || {};
    for (var key in jobs) {
      if (Object.prototype.hasOwnProperty.call(jobs, key)) this.writeJob(key, jobs[key]);
    }
    this.writeProjects(projects);
    this.writePIndex(cache.pIndex || buildPIndexFromProjects(projects));
    this.writeMeta(cache.meta || {});
    return { projectCount: Object.keys(projects).length, jobCount: Object.keys(jobs).length };
  };

  Repository.prototype.mergeJobCache = function (jobNo, cache, options) {
    options = options || {};
    var existing = this.readProjects();
    var staged = this.stageJobCache(existing, jobNo, cache, options);
    var published = this.publishProjectIndexes(existing, {
      projectCount: staged.projectCount,
      lastCacheUpdateAt: new Date().toISOString()
    }, staged.deletedProjectIds);
    published.affectedProjects = staged.affectedProjects || [];
    return published;
  };

  Repository.prototype.stageJobCache = function (existing, jobNo, cache, options) {
    options = options || {};
    existing = existing || {};
    var projects = cache.projects || {};
    var jobs = cache.jobs || {};
    var staleProjectIds = (options.staleProjectIds || []).slice(0);
    if (!staleProjectIds.length) {
      var projectKeys = Object.keys(projects);
      if (projectKeys.length) staleProjectIds = projectKeys.slice(0);
      else {
        for (var key in existing) {
          if (Object.prototype.hasOwnProperty.call(existing, key) && String(existing[key].jobNo || '') === String(jobNo)) staleProjectIds.push(key);
        }
      }
    }
    for (var s = 0; s < staleProjectIds.length; s++) {
      if (Object.prototype.hasOwnProperty.call(existing, staleProjectIds[s])) delete existing[staleProjectIds[s]];
    }
    for (var jobId in jobs) {
      if (Object.prototype.hasOwnProperty.call(jobs, jobId)) this.writeJob(jobId, jobs[jobId]);
    }
    for (var projectId in projects) {
      if (Object.prototype.hasOwnProperty.call(projects, projectId)) existing[projectId] = projects[projectId];
    }
    var deletedProjectIds = [];
    for (var i = 0; i < staleProjectIds.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(jobs, staleProjectIds[i])) {
        deletedProjectIds.push(staleProjectIds[i]);
      }
    }
    return {
      projectCount: Object.keys(existing).length,
      affectedProjects: Object.keys(projects),
      projectPatches: projects,
      deletedProjectIds: deletedProjectIds
    };
  };

  Repository.prototype.publishProjectIndexes = function (projects, metaPatch, deletedProjectIds) {
    projects = projects || {};
    this.writeProjects(projects);
    this.writePIndex(buildPIndexFromProjects(projects));
    for (var i = 0; i < (deletedProjectIds || []).length; i++) {
      try { this.deleteJob(deletedProjectIds[i]); } catch (ignoreDelete) {}
    }
    var meta = this.readMeta();
    metaPatch = metaPatch || {};
    for (var key in metaPatch) if (Object.prototype.hasOwnProperty.call(metaPatch, key)) meta[key] = metaPatch[key];
    meta.projectCount = Object.keys(projects).length;
    if (!meta.lastCacheUpdateAt) meta.lastCacheUpdateAt = new Date().toISOString();
    this.writeMeta(meta);
    return { projectCount: meta.projectCount, affectedProjects: Object.keys(projects) };
  };

  function buildPIndexFromProjects(projects) {
    var out = {};
    projects = projects || {};
    for (var id in projects) {
      if (!Object.prototype.hasOwnProperty.call(projects, id)) continue;
      var row = projects[id] || {};
      var jobNo = String(row.jobNo || '').trim();
      if (!jobNo || !row.pPath) continue;
      if (!out[jobNo]) out[jobNo] = [];
      out[jobNo].push({
        kind: 'P',
        projectId: row.projectId || id,
        jobNo: jobNo,
        path: row.pPath || '',
        filename: row.pFilename || '',
        rev: row.rev || '',
        modified: row.modified || ''
      });
    }
    return out;
  }

  return { create: create, join: join, buildPIndexFromProjects: buildPIndexFromProjects };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CacheRepository;
