const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const FullRebuildService = require('../src/backend/FullRebuildService');
const SaveService = require('../src/backend/SaveService');
const SourceService = require('../src/backend/SourceService');
const SyncService = require('../src/backend/SyncService');

const fixtures = JSON.parse(fs.readFileSync('tests/fixtures/parser_cases.json', 'utf8'));

const config = {
  dropbox: {
    pPath: '/root/Chronos/P_Chronos',
    ac2Path: '/root/AC2',
    tPath: '/root/Chronos/T_Chronos',
    dbPath: '/root/__db__'
  }
};

function entries() {
  return [
    {
      kind: 'P',
      filename: fixtures.pChronos[0].filename,
      content: fixtures.pChronos[0].content,
      path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename}`,
      rev: 'p1'
    },
    ...fixtures.ac2.map((row, i) => ({
      kind: 'AC2',
      filename: row.filename,
      content: row.content,
      path: `/root/AC2/${row.filename}`,
      rev: `a${i}`
    })),
    ...fixtures.tChronos.map((row, i) => ({
      kind: 'T',
      filename: row.filename,
      content: row.content,
      path: `/root/Chronos/T_Chronos/${row.filename}`,
      rev: `t${i}`
    }))
  ];
}

function fakeClient(sourceEntries, feedPages) {
  const files = {};
  for (const row of sourceEntries) {
    files[row.path] = {
      path: row.path,
      name: row.filename,
      content: row.content,
      rev: row.rev,
      modified: row.modified || '2026-08-09T00:00:00Z'
    };
  }
  return {
    files,
    listFolderCalls: [],
    listFolderContinueCalls: [],
    searchFilesCalls: [],
    getMetadata(path) {
      const file = files[path];
      if (!file) {
        const err = new Error('not_found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      return { '.tag': 'file', path_display: path, name: file.name, rev: file.rev, server_modified: file.modified };
    },
    downloadText(path) {
      this.getMetadata(path);
      return files[path].content;
    },
    uploadText(path, content, options = {}) {
      const file = files[path];
      if (!file) {
        files[path] = { path, name: path.split('/').pop(), content, rev: 'new1', modified: '2026-08-09T00:01:00Z' };
        return { path_display: path, rev: 'new1' };
      }
      if (options.rev && options.rev !== file.rev) {
        const err = new Error('conflict');
        err.code = 'CONFLICT';
        throw err;
      }
      file.content = content;
      file.rev = file.rev + '-next';
      return { path_display: path, rev: file.rev };
    },
    move(fromPath, toPath) {
      this.getMetadata(fromPath);
      if (files[toPath]) throw new Error('destination exists');
      files[toPath] = { ...files[fromPath], path: toPath, name: toPath.split('/').pop() };
      delete files[fromPath];
      return { metadata: { path_display: toPath, rev: files[toPath].rev } };
    },
    deletePath(path) {
      delete files[path];
      return {};
    },
    listFolder(folder) {
      this.listFolderCalls.push(folder);
      const prefix = folder.replace(/\/+$/, '') + '/';
      return {
        entries: Object.values(files)
          .filter((file) => file.path.startsWith(prefix))
          .map((file) => ({ '.tag': 'file', path_display: file.path, name: file.name, rev: file.rev, server_modified: file.modified })),
        has_more: false,
        cursor: 'folder-cursor'
      };
    },
    listFolderContinue(cursor) {
      this.listFolderContinueCalls.push(cursor);
      return feedPages[cursor] || { entries: [], has_more: false, cursor };
    },
    searchFiles(folder, query) {
      this.searchFilesCalls.push({ folder, query });
      const prefix = folder.replace(/\/+$/, '') + '/';
      return Object.values(files)
        .filter((file) => file.path.startsWith(prefix) && file.name.includes(query))
        .map((file) => ({ '.tag': 'file', path_display: file.path, name: file.name, rev: file.rev, server_modified: file.modified }));
    }
  };
}

function fakeRepo(initialCache, failMerge = false) {
  const repo = {
    meta: { schemaVersion: 1, cursor: 'cursor-a', syncStatus: 'idle', projectCount: 1 },
    projects: { ...initialCache.projects },
    jobs: { ...initialCache.jobs },
    pIndex: { ...(initialCache.pIndex || {}) },
    syncBatch: null,
    writes: { job: 0, projects: 0, pIndex: 0, meta: 0, syncBatch: 0 },
    readMeta() { return { ...this.meta }; },
    writeMeta(meta) { this.writes.meta += 1; this.meta = { ...meta }; },
    readProjects() { return { ...this.projects }; },
    readPIndex() { return { ...this.pIndex }; },
    writePIndex(pIndex) { this.writes.pIndex += 1; this.pIndex = { ...(pIndex || {}) }; },
    readSyncBatch() { return this.syncBatch ? JSON.parse(JSON.stringify(this.syncBatch)) : null; },
    writeSyncBatch(batch) { this.writes.syncBatch += 1; this.syncBatch = JSON.parse(JSON.stringify(batch || {})); },
    deleteSyncBatch() { this.syncBatch = null; },
    readJob(id) { return this.jobs[id] || null; },
    stageJobCache(jobNoOrProjects, maybeJobNo, maybeCache, maybeOptions = {}) {
      if (failMerge) throw new Error('cache merge failed');
      let existing = jobNoOrProjects;
      let jobNo = maybeJobNo;
      let cache = maybeCache;
      let options = maybeOptions;
      if (typeof jobNoOrProjects === 'string') {
        existing = this.projects;
        jobNo = jobNoOrProjects;
        cache = maybeJobNo;
        options = maybeCache || {};
      }
      let staleProjectIds = [...(options.staleProjectIds || [])];
      if (!staleProjectIds.length) staleProjectIds = Object.keys(cache.projects || {}).length
        ? Object.keys(cache.projects || {})
        : Object.keys(existing).filter((key) => String(existing[key].jobNo) === String(jobNo));
      for (const key of staleProjectIds) delete existing[key];
      Object.assign(existing, cache.projects);
      Object.assign(this.jobs, cache.jobs);
      this.writes.job += Object.keys(cache.jobs || {}).length;
      const deletedProjectIds = staleProjectIds.filter((id) => !Object.prototype.hasOwnProperty.call(cache.jobs || {}, id));
      return {
        affectedProjects: Object.keys(cache.projects || {}),
        projectPatches: { ...(cache.projects || {}) },
        deletedProjectIds,
        projectCount: Object.keys(existing).length
      };
    },
    publishProjectIndexes(projects, metaPatch, deletedProjectIds = []) {
      this.projects = { ...(projects || {}) };
      this.writes.projects += 1;
      this.pIndex = {};
      for (const id of Object.keys(this.projects)) {
        const row = this.projects[id];
        if (!row || !row.jobNo || !row.pPath) continue;
        if (!this.pIndex[row.jobNo]) this.pIndex[row.jobNo] = [];
        this.pIndex[row.jobNo].push({ projectId: id, jobNo: row.jobNo, path: row.pPath, filename: row.pFilename || '', rev: row.rev || '', modified: row.modified || '', kind: 'P' });
      }
      this.writes.pIndex += 1;
      for (const id of deletedProjectIds) delete this.jobs[id];
      this.meta = { ...this.meta, ...(metaPatch || {}), projectCount: Object.keys(this.projects).length };
      this.writes.meta += 1;
      return { affectedProjects: Object.keys(this.projects), projectCount: Object.keys(this.projects).length };
    },
    mergeJobCache(jobNo, cache, options = {}) {
      if (failMerge) throw new Error('cache merge failed');
      let staleProjectIds = [...(options.staleProjectIds || [])];
      if (!staleProjectIds.length) staleProjectIds = Object.keys(cache.projects || {}).length
        ? Object.keys(cache.projects || {})
        : Object.keys(this.projects).filter((key) => String(this.projects[key].jobNo) === String(jobNo));
      for (const key of staleProjectIds) delete this.projects[key];
      Object.assign(this.projects, cache.projects);
      Object.assign(this.jobs, cache.jobs);
      for (const id of Object.keys(this.projects)) {
        const row = this.projects[id];
        if (!row || !row.jobNo || !row.pPath) continue;
        if (!this.pIndex[row.jobNo]) this.pIndex[row.jobNo] = [];
        if (!this.pIndex[row.jobNo].some((ref) => ref.projectId === id)) {
          this.pIndex[row.jobNo].push({ projectId: id, jobNo: row.jobNo, path: row.pPath, filename: row.pFilename || '', rev: row.rev || '', modified: row.modified || '', kind: 'P' });
        }
      }
      this.meta.projectCount = Object.keys(this.projects).length;
      this.meta.lastCacheUpdateAt = 'merge-cache-update';
      this.writes.job += Object.keys(cache.jobs || {}).length;
      this.writes.projects += 1;
      this.writes.pIndex += 1;
      this.writes.meta += 1;
      return { affectedProjects: Object.keys(cache.projects), projectCount: Object.keys(this.projects).length };
    }
  };
  return repo;
}

test('SaveService saves allowed project notes before returning refreshed cache detail', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  const res = SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    baseRev: 'p1',
    patch: { P5_notes: 'REMODEL NOTE UPDATED' }
  });

  assert.equal(res.ok, true);
  assert.match(client.files['/root/Chronos/P_Chronos/260174~COMPLETED~45954~46173~@RonaldTruong.txt'].content, /REMODEL NOTE UPDATED\|COMPLETED\|12\|100\|HUYPHAM1 changed status$/);
  assert.equal(res.detail.project.P5_notes, 'REMODEL NOTE UPDATED');
});

test('SaveService saves only the allowed P fields to the source txt and refreshed cache', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  const res = SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    baseRev: 'p1',
    patch: {
      P5_notes: 'MULTI FIELD NOTES',
      P6_status: 'US ASSIGNED',
      P11_endDate: '6/13/2026'
    }
  });

  const newPath = '/root/Chronos/P_Chronos/260174~US ASSIGNED~45954~46186~@RonaldTruong.txt';
  assert.equal(res.ok, true);
  assert.ok(client.files[newPath]);
  assert.match(client.files[newPath].content, /^REMODEL\|/);
  assert.match(client.files[newPath].content, /MULTI FIELD NOTES\|US ASSIGNED\|12\|100\|HUYPHAM1 changed status$/);
  assert.equal(res.detail.project.P5_notes, 'MULTI FIELD NOTES');
  assert.equal(res.detail.project.P6_status, 'US ASSIGNED');
  assert.equal(res.detail.project.P11_endDate, '6/13/2026');
  assert.equal(res.projectId, '260174');
});

test('SaveService rejects read-only project fields before source overwrite', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  assert.throws(() => SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    baseRev: 'p1',
    patch: { P3_jobName: 'SHOULD NOT SAVE' }
  }), /Read-only project fields: P3_jobName/);
  assert.match(client.files['/root/Chronos/P_Chronos/260174~COMPLETED~45954~46173~@RonaldTruong.txt'].content, /^REMODEL\|/);
});

test('SaveService rejects AC2 code patches while code items are read-only in UI', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  const oldPath = '/root/AC2/260174~01~COMPLETED~46157~UNPAID~1632;1st Sent~Steven Hong.txt';
  assert.throws(() => SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    patch: {},
    codePatches: [{
      code: '01',
      baseRev: 'a0',
      status: 'ASSIGNED',
      dateString: '5/16/2026',
      payment: 'PAID',
      account: '200',
      sent: '2nd Sent',
      contact: 'Steven Hong',
      description: 'UPDATED AC2 DESCRIPTION'
    }]
  }), /Code item editing is disabled for now/);

  assert.ok(client.files[oldPath]);
  assert.match(client.files[oldPath].content, /A retainer prior to start Remodel/);
});

test('SaveService rejects AC2 description patches before source overwrite', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  const oldPath = '/root/AC2/260174~01~COMPLETED~46157~UNPAID~1632;1st Sent~Steven Hong.txt';
  assert.throws(() => SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    patch: {},
    codePatches: [{
      code: '01',
      baseRev: 'a0',
      description: 'UPDATED CODE PAYLOAD DESCRIPTION'
    }]
  }), /Code item editing is disabled for now: 01.description/);

  assert.match(client.files[oldPath].content, /\|01~A retainer prior to start Remodel/);
});

test('SaveService rejects stale baseRev before source overwrite', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  assert.throws(() => SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    baseRev: 'old-rev',
    patch: { P5_notes: 'SHOULD NOT SAVE' }
  }), /changed since you opened/);
});

test('SaveService can return after source write while project cache refresh remains pending', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache, true);

  const res = SaveService.saveProject(client, repo, config, {
    projectId: '260174',
    baseRev: 'p1',
    patch: { P5_notes: 'FAST SAVE NOTE' },
    refreshCache: false
  });

  assert.equal(res.ok, true);
  assert.equal(res.cachePending, true);
  assert.equal(res.detail.project.P5_notes, 'FAST SAVE NOTE');
  assert.match(client.files['/root/Chronos/P_Chronos/260174~COMPLETED~45954~46173~@RonaldTruong.txt'].content, /FAST SAVE NOTE\|COMPLETED\|12\|100\|HUYPHAM1 changed status$/);
});

test('SaveService refreshProjectCache rebuilds and merges one affected job', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);

  client.files['/root/Chronos/P_Chronos/260174~COMPLETED~45954~46173~@RonaldTruong.txt'].content =
    client.files['/root/Chronos/P_Chronos/260174~COMPLETED~45954~46173~@RonaldTruong.txt'].content.replace(/^REMODEL/, 'CACHE REFRESHED');

  const res = SaveService.refreshProjectCache(client, repo, config, '260174');

  assert.equal(res.ok, true);
  assert.equal(res.detail.project.P3_jobName, 'CACHE REFRESHED');
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService commits cursor only after affected job cache merge succeeds', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const changedPath = `/root/Chronos/T_Chronos/${fixtures.tChronos[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: changedPath, name: fixtures.tChronos[0].filename }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.deepEqual(res.affectedJobs, ['260174']);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService updates cache from an external P_Chronos content edit', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const pPath = `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: pPath, name: fixtures.pChronos[0].filename, rev: 'p1-external' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  client.files[pPath].content = client.files[pPath].content.replace(/^REMODEL/, 'EXTERNAL P NAME');
  client.files[pPath].rev = 'p1-external';

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.jobs['260174'].project.P3_jobName, 'EXTERNAL P NAME');
  assert.equal(repo.meta.lastSyncChangeCount, 1);
  assert.ok(repo.meta.lastSyncAt);
});

test('SyncService creates a new project from a new P_Chronos cursor entry without folder scan', () => {
  const newProject = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999999'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'NEW CURSOR PROJECT'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999999')}`,
    rev: 'p-new'
  };
  const client = fakeClient([newProject], {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: newProject.path, name: newProject.filename, rev: 'p-new' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo({ projects: {}, jobs: {} });
  repo.meta.projectCount = 0;

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.projects['999999'].jobName, 'NEW CURSOR PROJECT');
  assert.equal(repo.jobs['999999'].sourceRefs.project.path, newProject.path);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.projectCount, 1);
  assert.ok(repo.meta.lastCacheUpdateAt);
  assert.equal(repo.writes.projects, 1);
  assert.equal(repo.writes.pIndex, 1);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService skips orphan AC2 changes without scanning source folders when no P can be found', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  delete cache.jobs['260174'].sourceRefs;
  cache.projects['260174'].pPath = '';
  cache.projects['260174'].pFilename = '';
  cache.projects['260174'].rev = '';
  const ac2Path = `/root/AC2/${fixtures.ac2[0].filename}`;
  const client = fakeClient(source.filter((row) => row.kind !== 'P'), {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[0].filename, rev: 'a0-next' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  repo.pIndex = {};

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.syncStatus, 'idle');
  assert.equal(repo.meta.lastSkippedOrphanJobs.length, 1);
  assert.equal(repo.meta.lastSkippedOrphanJobs[0].jobNo, '260174');
  assert.equal(repo.meta.syncIssueLog.length, 1);
  assert.equal(repo.meta.syncIssueLog[0].path, ac2Path);
  assert.match(repo.meta.syncIssueLog[0].reason, /Cannot incremental-sync job 260174/);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService records multiple orphan AC2/T jobs and still commits cursor when no real jobs are blocked', () => {
  const orphanAc2 = {
    kind: 'AC2',
    filename: '0364~01~COMPLETED~46231~PAID~;~Someone.txt',
    content: 'meta|code|01|Orphan AC2|planned|1|',
    path: '/root/AC2/0364~01~COMPLETED~46231~PAID~;~Someone.txt',
    rev: 'a-orphan-0364'
  };
  const orphanTime = {
    kind: 'T',
    filename: '1050~Plan 1~QAUSER~Structural~46231~1~~01.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/1050~Plan 1~QAUSER~Structural~46231~1~~01.txt',
    rev: 't-orphan-1050'
  };
  const client = fakeClient([orphanAc2, orphanTime], {
    'cursor-a': {
      entries: [
        { '.tag': 'file', path_display: orphanAc2.path, name: orphanAc2.filename, rev: orphanAc2.rev },
        { '.tag': 'file', path_display: orphanTime.path, name: orphanTime.filename, rev: orphanTime.rev }
      ],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });
  repo.meta.projectCount = 0;

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.projectCount, 0);
  assert.deepEqual(res.affectedProjects, []);
  assert.deepEqual(repo.meta.lastSkippedOrphanJobs.map((row) => row.jobNo).sort(), ['0364', '1050']);
  assert.deepEqual(repo.meta.syncIssueLog.map((row) => row.path).sort(), [orphanAc2.path, orphanTime.path].sort());
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService skips 1317 orphan T change instead of surfacing rebuild-required error', () => {
  const orphanTime = {
    kind: 'T',
    filename: '1317~Plan 1~QAUSER~Structural~46231~1~~01.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/1317~Plan 1~QAUSER~Structural~46231~1~~01.txt',
    rev: 't-orphan-1317'
  };
  const client = fakeClient([orphanTime], {
    'cursor-a': {
      entries: [
        { '.tag': 'file', path_display: orphanTime.path, name: orphanTime.filename, rev: orphanTime.rev }
      ],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });
  repo.meta.projectCount = 0;

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.syncStatus, 'idle');
  assert.equal(repo.meta.lastError, null);
  assert.deepEqual(repo.meta.lastSkippedOrphanJobs.map((row) => row.jobNo), ['1317']);
  assert.equal(repo.meta.syncIssueLog.length, 1);
  assert.equal(repo.meta.syncIssueLog[0].path, orphanTime.path);
  assert.match(repo.meta.syncIssueLog[0].reason, /Cannot incremental-sync job 1317/);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService skips rebuild-required message even when Apps Script drops custom error code', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const timePath = `/root/Chronos/T_Chronos/${fixtures.tChronos[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': {
      entries: [
        { '.tag': 'file', path_display: timePath, name: fixtures.tChronos[0].filename, rev: 't-code-stripped' }
      ],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo(cache);
  const original = SourceService.rebuildJobFromRefs;
  SourceService.rebuildJobFromRefs = function () {
    throw new Error('Cannot incremental-sync job 260174 without a P_Chronos source file. Run full rebuild.');
  };
  try {
    const res = SyncService.syncNow(client, repo, config);

    assert.equal(res.ok, true);
    assert.equal(repo.meta.cursor, 'cursor-b');
    assert.equal(repo.meta.syncStatus, 'idle');
    assert.equal(repo.meta.lastError, null);
    assert.deepEqual(repo.meta.lastSkippedOrphanJobs.map((row) => row.jobNo), ['260174']);
    assert.equal(repo.meta.syncIssueLog[0].path, timePath);
    assert.match(repo.meta.syncIssueLog[0].reason, /Cannot incremental-sync job 260174/);
  } finally {
    SourceService.rebuildJobFromRefs = original;
  }
});

test('SyncService skips orphan jobs but still applies valid jobs from the same cursor page', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const orphanAc2 = {
    kind: 'AC2',
    filename: '0364~01~COMPLETED~46231~PAID~;~Someone.txt',
    content: 'meta|code|01|Orphan AC2|planned|1|',
    path: '/root/AC2/0364~01~COMPLETED~46231~PAID~;~Someone.txt',
    rev: 'a-orphan-0364'
  };
  const realTime = {
    kind: 'T',
    filename: '260174~Plan 1~QAUSER~Structural~46160~0.75~~02.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/260174~Plan 1~QAUSER~Structural~46160~0.75~~02.txt',
    rev: 't-real-260174'
  };
  const client = fakeClient(source.concat([orphanAc2, realTime]), {
    'cursor-a': {
      entries: [
        { '.tag': 'file', path_display: orphanAc2.path, name: orphanAc2.filename, rev: orphanAc2.rev },
        { '.tag': 'file', path_display: realTime.path, name: realTime.filename, rev: realTime.rev }
      ],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo(cache);
  repo.meta.syncIssueLog = [{ jobNo: '260174', path: realTime.path, reason: 'old transient sync issue' }];

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.jobs['260174'].p16All, 1.75);
  assert.deepEqual(repo.meta.lastSkippedOrphanJobs.map((row) => row.jobNo), ['0364']);
  assert.equal(repo.meta.syncIssueLog.length, 1);
  assert.equal(repo.meta.syncIssueLog[0].path, orphanAc2.path);
  assert.ok(res.affectedProjects.includes('260174'));
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService resolves missing job detail through P search without source folder scan', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const ac2Path = `/root/AC2/${fixtures.ac2[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[0].filename, rev: 'a0-index-ref' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  delete repo.jobs['260174'];
  delete repo.projects['260174'];
  repo.pIndex = {};
  repo.meta.projectCount = 0;

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.projects['260174'].jobName, 'REMODEL');
  assert.equal(repo.jobs['260174'].sourceRefs.project.path, source[0].path);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.lastError, null);
  assert.deepEqual(client.listFolderCalls, []);
  assert.equal(client.searchFilesCalls.length, 1);
});

test('SyncService resolves missing job detail through p_index before Dropbox search', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const ac2Path = `/root/AC2/${fixtures.ac2[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[0].filename, rev: 'a0-p-index-ref' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  const pRef = repo.pIndex['260174'][0];
  delete repo.jobs['260174'];
  delete repo.projects['260174'];
  repo.pIndex = { '260174': [pRef] };
  repo.meta.projectCount = 0;

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.projects['260174'].jobName, 'REMODEL');
  assert.equal(repo.jobs['260174'].sourceRefs.project.path, source[0].path);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.lastError, null);
  assert.deepEqual(client.searchFilesCalls, []);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService uses projects index P path plus changed T row when sourceRefs are missing', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const newTime = {
    kind: 'T',
    filename: '260174~Plan 1~QAUSER~Structural~46160~0.75~~02.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/260174~Plan 1~QAUSER~Structural~46160~0.75~~02.txt',
    rev: 't-index-ref'
  };
  const client = fakeClient(source.concat([newTime]), {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: newTime.path, name: newTime.filename, rev: 't-index-ref' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  delete repo.jobs['260174'].sourceRefs;

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.jobs['260174'].sourceRefs.project.path, cache.projects['260174'].pPath);
  assert.equal(repo.jobs['260174'].p16All, 1.75);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService removes a project when its P_Chronos source is deleted without folder scan', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const pPath = `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename}`;
  const remainingSource = source.filter((row) => row.path !== pPath);
  const client = fakeClient(remainingSource, {
    'cursor-a': { entries: [{ '.tag': 'deleted', path_display: pPath, name: fixtures.pChronos[0].filename }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.projects['260174'], undefined);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService updates cache from an external AC2 content edit', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const ac2Path = `/root/AC2/${fixtures.ac2[1].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[1].filename, rev: 'a1-external' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  const parts = client.files[ac2Path].content.split('|');
  parts[3] = 'EXTERNAL AC2 DESCRIPTION';
  client.files[ac2Path].content = parts.join('|');
  client.files[ac2Path].rev = 'a1-external';

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.jobs['260174'].p14.find((row) => row.code === '02').description, 'EXTERNAL AC2 DESCRIPTION');
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService groups account-first AC2 filename by packed project jobNo', () => {
  const pName = '260253~COMPLETED~46180~46196~@.txt';
  const ac2Name = '1682~02~COMPLETED~46231~PAID~260253;1st Sent~Anh Phan.txt';
  const pEntry = {
    kind: 'P',
    filename: pName,
    content: 'LEGACY ACCOUNT FIRST|123 TEST ST|Architect|Customer|6/7/2026|6/23/2026|Remodel|Notes|COMPLETED|10|100|admin',
    path: `/root/Chronos/P_Chronos/${pName}`,
    rev: 'p-260253'
  };
  const ac2Entry = {
    kind: 'AC2',
    filename: ac2Name,
    content: 'meta|code|02|Legacy account first code|planned|1|',
    path: `/root/AC2/${ac2Name}`,
    rev: 'a-account-first'
  };
  const cache = FullRebuildService.buildFromEntries([pEntry]);
  const client = fakeClient([pEntry, ac2Entry], {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Entry.path, name: ac2Entry.filename, rev: ac2Entry.rev }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.deepEqual(res.affectedJobs, ['260253']);
  assert.equal(repo.meta.lastError, null);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.jobs['260253'].p14.find((row) => row.code === '02').account, '1682');
  assert.equal(repo.jobs['260253'].p14.find((row) => row.code === '02').sent, '1st Sent');
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService repairs stale missing P sourceRef through P search without blocking cursor', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const goodP = source.find((row) => row.kind === 'P');
  const stalePPath = goodP.path.replace(/\.txt$/i, '.tx');
  cache.projects['260174'].pPath = stalePPath;
  cache.projects['260174'].pFilename = stalePPath.split('/').pop();
  cache.jobs['260174'].sourceRefs.project.path = stalePPath;
  cache.jobs['260174'].sourceRefs.project.filename = stalePPath.split('/').pop();
  cache.pIndex = {
    '260174': [{ projectId: '260174', jobNo: '260174', path: stalePPath, filename: stalePPath.split('/').pop(), kind: 'P' }]
  };
  const timePath = `/root/Chronos/T_Chronos/${fixtures.tChronos[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': {
      entries: [{ '.tag': 'file', path_display: timePath, name: fixtures.tChronos[0].filename, rev: 't-repair-p' }],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.lastError, null);
  assert.equal(repo.jobs['260174'].sourceRefs.project.path, goodP.path);
  assert.equal(repo.meta.lastMissingSourceRefs[0].path, stalePPath);
  assert.deepEqual(repo.meta.syncIssueLog || [], []);
  assert.equal(client.searchFilesCalls.length, 1);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService logs and skips stale missing P sourceRef when no replacement P exists', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const stalePPath = cache.jobs['260174'].sourceRefs.project.path.replace(/\.txt$/i, '.tx');
  cache.projects['260174'].pPath = stalePPath;
  cache.projects['260174'].pFilename = stalePPath.split('/').pop();
  cache.jobs['260174'].sourceRefs.project.path = stalePPath;
  cache.jobs['260174'].sourceRefs.project.filename = stalePPath.split('/').pop();
  cache.pIndex = {
    '260174': [{ projectId: '260174', jobNo: '260174', path: stalePPath, filename: stalePPath.split('/').pop(), kind: 'P' }]
  };
  const timePath = `/root/Chronos/T_Chronos/${fixtures.tChronos[0].filename}`;
  const client = fakeClient(source.filter((row) => row.kind !== 'P'), {
    'cursor-a': {
      entries: [{ '.tag': 'file', path_display: timePath, name: fixtures.tChronos[0].filename, rev: 't-missing-p' }],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.syncStatus, 'idle');
  assert.equal(repo.meta.lastError, null);
  assert.deepEqual(repo.meta.lastSkippedOrphanJobs.map((row) => row.jobNo), ['260174']);
  assert.equal(repo.meta.syncIssueLog[0].path, stalePPath);
  assert.match(repo.meta.syncIssueLog[0].reason, /cached P_Chronos source file is missing/);
  assert.equal(client.searchFilesCalls.length, 1);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService resolves 1317 account-first AC2 through P evidence and repairs legacy batch jobs', () => {
  const pName = '250282~COMPLETED~45832~45898~@.txt';
  const ac2Name = '1317~02~COMPLETED~45847~PAID~250282;1st Sent~Bill Nuhaily.txt';
  const pEntry = {
    kind: 'P',
    filename: pName,
    content: 'NUHAILY PROJECT|1 MAIN ST|Architect|Customer|5/12/2026|7/17/2026|Remodel|Notes|COMPLETED|8|100|admin',
    path: `/root/Chronos/P_Chronos/${pName}`,
    rev: 'p-250282'
  };
  const ac2Entry = {
    kind: 'AC2',
    filename: ac2Name,
    content: 'meta|code|02|Bill Nuhaily account-first code|planned|1|',
    path: `/root/AC2/${ac2Name}`,
    rev: 'a-1317-account-first'
  };
  const cache = FullRebuildService.buildFromEntries([pEntry]);
  const client = fakeClient([pEntry, ac2Entry], {
    'cursor-a': { entries: [], has_more: false, cursor: 'cursor-unused' }
  });
  const repo = fakeRepo(cache);
  repo.meta.pendingSyncBatch = { active: true, baseCursor: 'cursor-a', totalJobs: 1 };
  repo.meta.lastError = {
    code: 'CACHE_REBUILD_REQUIRED_FOR_JOB',
    message: 'Cannot incremental-sync job 1317 without a P_Chronos source file. Run full rebuild.'
  };
  repo.syncBatch = {
    baseCursor: 'cursor-a',
    cursorAfterPage: 'cursor-b',
    hasMoreAfterPage: false,
    entries: [{ '.tag': 'file', path_display: ac2Entry.path, name: ac2Entry.filename, rev: ac2Entry.rev }],
    jobs: ['1317'],
    processedJobs: [],
    affectedProjects: [],
    skippedOrphans: []
  };

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.deepEqual(res.affectedJobs, ['250282']);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.lastError, null);
  assert.deepEqual(repo.meta.lastSkippedOrphanJobs, []);
  assert.deepEqual(repo.meta.syncIssueLog || [], []);
  assert.equal(repo.jobs['250282'].p14.find((row) => row.code === '02').account, '1317');
  assert.equal(repo.meta.lastSyncResolverDiagnostics[0].filenameJobNo, '1317');
  assert.equal(repo.meta.lastSyncResolverDiagnostics[0].packedJobNo, '250282');
  assert.equal(repo.meta.lastSyncResolverDiagnostics[0].resolvedJobNo, '250282');
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService does not duplicate P14 when account-first AC2 duplicate exists beside canonical row', () => {
  const pName = '260253~COMPLETED~46180~46196~@.txt';
  const canonicalName = '260253~02~COMPLETED~46231~UNPAID~1682;1st Sent~Anh Phan.txt';
  const accountFirstName = '1682~02~COMPLETED~46231~PAID~260253;1st Sent~Anh Phan.txt';
  const pEntry = {
    kind: 'P',
    filename: pName,
    content: 'LEGACY ACCOUNT FIRST|123 TEST ST|Architect|Customer|6/7/2026|6/23/2026|Remodel|Notes|COMPLETED|10|100|admin',
    path: `/root/Chronos/P_Chronos/${pName}`,
    rev: 'p-260253'
  };
  const canonical = {
    kind: 'AC2',
    filename: canonicalName,
    content: 'meta|code|02|Canonical code|planned|1|',
    path: `/root/AC2/${canonicalName}`,
    rev: 'a-canonical'
  };
  const accountFirst = {
    kind: 'AC2',
    filename: accountFirstName,
    content: 'meta|code|02|Account first duplicate|planned|2|',
    path: `/root/AC2/${accountFirstName}`,
    rev: 'a-account-first'
  };
  const cache = FullRebuildService.buildFromEntries([pEntry, canonical]);
  const client = fakeClient([pEntry, canonical, accountFirst], {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: accountFirst.path, name: accountFirst.filename, rev: accountFirst.rev }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);
  const code02Rows = repo.jobs['260253'].p14.filter((row) => row.code === '02');

  assert.equal(res.ok, true);
  assert.deepEqual(res.affectedJobs, ['260253']);
  assert.equal(code02Rows.length, 1);
  assert.equal(code02Rows[0].description, 'Canonical code');
  assert.equal(repo.jobs['260253'].sourceRefs.ac2[0].path, canonical.path);
  assert.equal(repo.meta.cursor, 'cursor-b');
});

test('SyncService reads external AC2 description edits from code payload field', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const ac2Path = `/root/AC2/${fixtures.ac2[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[0].filename, rev: 'a0-code-payload' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  const parts = client.files[ac2Path].content.split('|');
  const codeParts = parts[2].split('~');
  codeParts[1] = 'EXTERNAL CODE PAYLOAD DESCRIPTION';
  parts[2] = codeParts.join('~');
  client.files[ac2Path].content = parts.join('|');
  client.files[ac2Path].rev = 'a0-code-payload';

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.jobs['260174'].p14.find((row) => row.code === '01').description, 'EXTERNAL CODE PAYLOAD DESCRIPTION');
});

test('SyncService updates cache from an external AC2 filename rename', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const oldPath = `/root/AC2/${fixtures.ac2[0].filename}`;
  const newName = fixtures.ac2[0].filename.replace('UNPAID', 'PAID').replace('1st Sent', '2nd Sent');
  const newPath = `/root/AC2/${newName}`;
  const renamedSource = source.map((row) => row.path === oldPath ? {
    ...row,
    filename: newName,
    path: newPath,
    rev: 'a0-renamed'
  } : row);
  const client = fakeClient(renamedSource, {
    'cursor-a': {
      entries: [
        { '.tag': 'deleted', path_display: oldPath, name: fixtures.ac2[0].filename },
        { '.tag': 'file', path_display: newPath, name: newName, rev: 'a0-renamed' }
      ],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  const row = repo.jobs['260174'].p14.find((item) => item.code === '01');
  assert.equal(res.ok, true);
  assert.equal(row.payment, 'PAID');
  assert.equal(row.sent, '2nd Sent');
  assert.equal(row.path, newPath);
  assert.equal(repo.meta.cursor, 'cursor-b');
});

test('SyncService updates cache from an external T_Chronos add', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const newTime = {
    kind: 'T',
    filename: '260174~Plan 1~QAUSER~Structural~46160~2~~02.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/260174~Plan 1~QAUSER~Structural~46160~2~~02.txt',
    rev: 't-new'
  };
  const client = fakeClient(source.concat([newTime]), {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: newTime.path, name: newTime.filename, rev: 't-new' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.jobs['260174'].p16All, 3);
  assert.equal(repo.jobs['260174'].p14.find((row) => row.code === '02').actual, 3);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService drops stale missing AC2 sourceRefs without blocking current changes', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source.slice(0, 2));
  const staleAc2Path = source[1].path;
  const newTime = {
    kind: 'T',
    filename: '260174~Plan 1~QAUSER~Structural~46160~0.75~~02.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/260174~Plan 1~QAUSER~Structural~46160~0.75~~02.txt',
    rev: 't-new-stale-ref'
  };
  const client = fakeClient([source[0], newTime], {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: newTime.path, name: newTime.filename, rev: newTime.rev }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.lastError, null);
  assert.equal(repo.meta.lastMissingSourceRefs.length, 1);
  assert.equal(repo.meta.lastMissingSourceRefs[0].path, staleAc2Path);
  assert.equal(repo.jobs['260174'].sourceRefs.project.path, source[0].path);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService preserves decimal hours from an external T_Chronos add', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const newTime = {
    kind: 'T',
    filename: '260174~Plan 1~QAUSER~Structural~46160~0.25~~02.txt',
    content: '',
    path: '/root/Chronos/T_Chronos/260174~Plan 1~QAUSER~Structural~46160~0.25~~02.txt',
    rev: 't-quarter'
  };
  const client = fakeClient(source.concat([newTime]), {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: newTime.path, name: newTime.filename, rev: 't-quarter' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.equal(repo.jobs['260174'].p16All, 1.25);
  assert.equal(repo.jobs['260174'].p14.find((row) => row.code === '02').actual, 1.25);
  assert.equal(repo.jobs['260174'].p14.find((row) => row.code === '02').actualDisplay, '1.25');
});

test('SyncService processes one Dropbox cursor page per run', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const ac2Path = `/root/AC2/${fixtures.ac2[0].filename}`;
  const tPath = `/root/Chronos/T_Chronos/${fixtures.tChronos[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[0].filename }], has_more: true, cursor: 'cursor-mid' },
    'cursor-mid': { entries: [{ '.tag': 'file', path_display: tPath, name: fixtures.tChronos[0].filename }], has_more: false, cursor: 'cursor-final' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.changes, 1);
  assert.equal(repo.meta.cursor, 'cursor-mid');
  assert.equal(res.morePending, true);
  assert.deepEqual(res.affectedJobs, ['260174']);

  const res2 = SyncService.syncNow(client, repo, config);

  assert.equal(res2.changes, 1);
  assert.equal(repo.meta.cursor, 'cursor-final');
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a', 'cursor-mid']);
});

test('SyncService checkpoints affected jobs and resumes the same cursor page before reading new changes', () => {
  const p1 = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999901'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'CHUNK ONE'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999901')}`,
    rev: 'p901'
  };
  const p2 = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999902'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'CHUNK TWO'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999902')}`,
    rev: 'p902'
  };
  const p3 = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999903'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'CHUNK THREE'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999903')}`,
    rev: 'p903'
  };
  const client = fakeClient([p1, p2, p3], {
    'cursor-a': {
      entries: [
        { '.tag': 'file', path_display: p1.path, name: p1.filename, rev: 'p901' },
        { '.tag': 'file', path_display: p2.path, name: p2.filename, rev: 'p902' }
      ],
      has_more: false,
      cursor: 'cursor-b'
    },
    'cursor-b': {
      entries: [
        { '.tag': 'file', path_display: p3.path, name: p3.filename, rev: 'p903' }
      ],
      has_more: false,
      cursor: 'cursor-c'
    }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });
  repo.meta.projectCount = 0;

  const first = SyncService.syncNow(client, repo, { ...config, syncMaxJobsPerRun: 1 });

  assert.equal(first.morePending, true);
  assert.equal(first.cursorCommitted, false);
  assert.equal(first.pendingJobs, 1);
  assert.equal(repo.meta.cursor, 'cursor-a');
  assert.ok(repo.projects['999901']);
  assert.equal(repo.projects['999902'], undefined);
  assert.deepEqual(repo.syncBatch.processedJobs, ['999901']);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);

  const second = SyncService.syncNow(client, repo, { ...config, syncMaxJobsPerRun: 1 });

  assert.equal(second.morePending, false);
  assert.equal(second.cursorCommitted, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.syncBatch, null);
  assert.ok(repo.projects['999901']);
  assert.ok(repo.projects['999902']);
  assert.equal(repo.projects['999903'], undefined);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);

  const third = SyncService.syncNow(client, repo, { ...config, syncMaxJobsPerRun: 1 });

  assert.equal(third.cursorCommitted, true);
  assert.equal(repo.meta.cursor, 'cursor-c');
  assert.ok(repo.projects['999903']);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a', 'cursor-b']);
});

test('SyncService processes more than five jobs when runtime budget allows and publishes indexes once', () => {
  const projectEntries = [];
  const changes = [];
  for (let i = 1; i <= 7; i += 1) {
    const jobNo = `99992${i}`;
    const filename = fixtures.pChronos[0].filename.replace('260174', jobNo);
    const entry = {
      kind: 'P',
      filename,
      content: fixtures.pChronos[0].content.replace(/^REMODEL/, `BATCH ${i}`),
      path: `/root/Chronos/P_Chronos/${filename}`,
      rev: `p92${i}`
    };
    projectEntries.push(entry);
    changes.push({ '.tag': 'file', path_display: entry.path, name: entry.filename, rev: entry.rev });
  }
  const client = fakeClient(projectEntries, {
    'cursor-a': { entries: changes, has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.cursorCommitted, true);
  assert.equal(res.morePending, false);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(Object.keys(repo.projects).length, 7);
  assert.equal(repo.writes.job, 7);
  assert.equal(repo.writes.projects, 1);
  assert.equal(repo.writes.pIndex, 1);
  assert.equal(repo.writes.meta, 3);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);
});

test('SyncService finishes a large cursor page before reading newer Dropbox changes', () => {
  const source = [];
  const firstPageChanges = [];
  const secondPageChanges = [];
  for (let i = 1; i <= 80; i += 1) {
    const jobNo = `991${String(i).padStart(3, '0')}`;
    const filename = fixtures.pChronos[0].filename.replace('260174', jobNo);
    const entry = {
      kind: 'P',
      filename,
      content: fixtures.pChronos[0].content.replace(/^REMODEL/, `PAGE A ${i}`),
      path: `/root/Chronos/P_Chronos/${filename}`,
      rev: `pa${i}`
    };
    source.push(entry);
    firstPageChanges.push({ '.tag': 'file', path_display: entry.path, name: entry.filename, rev: entry.rev });
  }
  for (let i = 1; i <= 20; i += 1) {
    const jobNo = `992${String(i).padStart(3, '0')}`;
    const filename = fixtures.pChronos[0].filename.replace('260174', jobNo);
    const entry = {
      kind: 'P',
      filename,
      content: fixtures.pChronos[0].content.replace(/^REMODEL/, `PAGE B ${i}`),
      path: `/root/Chronos/P_Chronos/${filename}`,
      rev: `pb${i}`
    };
    source.push(entry);
    secondPageChanges.push({ '.tag': 'file', path_display: entry.path, name: entry.filename, rev: entry.rev });
  }
  const client = fakeClient(source, {
    'cursor-a': { entries: firstPageChanges, has_more: false, cursor: 'cursor-b' },
    'cursor-b': { entries: secondPageChanges, has_more: false, cursor: 'cursor-c' }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });
  const chunkedConfig = { ...config, syncMaxJobsPerRun: 55 };

  const first = SyncService.syncNow(client, repo, chunkedConfig);

  assert.equal(first.morePending, true);
  assert.equal(first.cursorCommitted, false);
  assert.equal(first.pendingJobs, 25);
  assert.equal(repo.meta.cursor, 'cursor-a');
  assert.equal(Object.keys(repo.projects).length, 55);
  assert.equal(repo.writes.job, 55);
  assert.equal(repo.writes.projects, 1);
  assert.equal(repo.writes.pIndex, 1);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);

  const second = SyncService.syncNow(client, repo, chunkedConfig);

  assert.equal(second.morePending, false);
  assert.equal(second.cursorCommitted, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(Object.keys(repo.projects).length, 80);
  assert.equal(repo.syncBatch, null);
  assert.equal(repo.writes.job, 80);
  assert.equal(repo.writes.projects, 2);
  assert.equal(repo.writes.pIndex, 2);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);

  const third = SyncService.syncNow(client, repo, chunkedConfig);

  assert.equal(third.morePending, false);
  assert.equal(third.cursorCommitted, true);
  assert.equal(repo.meta.cursor, 'cursor-c');
  assert.equal(Object.keys(repo.projects).length, 100);
  assert.equal(repo.writes.job, 100);
  assert.equal(repo.writes.projects, 3);
  assert.equal(repo.writes.pIndex, 3);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a', 'cursor-b']);
});

test('SyncService stops at runtime budget, checkpoints progress, then resumes without reading a new cursor page', () => {
  const projectEntries = [];
  const changes = [];
  for (let i = 1; i <= 3; i += 1) {
    const jobNo = `99993${i}`;
    const filename = fixtures.pChronos[0].filename.replace('260174', jobNo);
    const entry = {
      kind: 'P',
      filename,
      content: fixtures.pChronos[0].content.replace(/^REMODEL/, `RUNTIME ${i}`),
      path: `/root/Chronos/P_Chronos/${filename}`,
      rev: `p93${i}`
    };
    projectEntries.push(entry);
    changes.push({ '.tag': 'file', path_display: entry.path, name: entry.filename, rev: entry.rev });
  }
  const client = fakeClient(projectEntries, {
    'cursor-a': { entries: changes, has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });
  const realNow = Date.now;
  let nowCalls = 0;
  Date.now = () => (nowCalls++ === 0 ? 0 : 999999);
  try {
    const first = SyncService.syncNow(client, repo, { ...config, syncMaxRuntimeMs: 1 });

    assert.equal(first.morePending, true);
    assert.equal(first.cursorCommitted, false);
    assert.equal(first.pendingJobs, 2);
    assert.equal(repo.meta.cursor, 'cursor-a');
    assert.deepEqual(repo.syncBatch.processedJobs, ['999931']);
    assert.equal(repo.writes.job, 1);
    assert.equal(repo.writes.projects, 1);
    assert.equal(repo.writes.pIndex, 1);
    assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);
  } finally {
    Date.now = realNow;
  }

  const second = SyncService.syncNow(client, repo, config);

  assert.equal(second.cursorCommitted, true);
  assert.equal(second.morePending, false);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.syncBatch, null);
  assert.equal(Object.keys(repo.projects).length, 3);
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);
});

test('SyncService recovers processed project patches after index publish failure without losing cursor safety', () => {
  const p1 = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999941'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'CRASH BEFORE PUBLISH'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999941')}`,
    rev: 'p941'
  };
  const client = fakeClient([p1], {
    'cursor-a': {
      entries: [{ '.tag': 'file', path_display: p1.path, name: p1.filename, rev: 'p941' }],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo({ projects: {}, jobs: {}, pIndex: {} });
  const realPublish = repo.publishProjectIndexes.bind(repo);
  repo.publishProjectIndexes = function () {
    throw new Error('publish index failed');
  };

  assert.throws(() => SyncService.syncNow(client, repo, config), /publish index failed/);
  assert.equal(repo.meta.cursor, 'cursor-a');
  assert.equal(repo.meta.syncStatus, 'error');
  assert.equal(repo.projects['999941'], undefined);
  assert.ok(repo.jobs['999941']);
  assert.deepEqual(repo.syncBatch.processedJobs, ['999941']);
  assert.equal(repo.syncBatch.projectPatches['999941'].jobName, 'CRASH BEFORE PUBLISH');

  repo.publishProjectIndexes = realPublish;
  const retry = SyncService.syncNow(client, repo, config);

  assert.equal(retry.cursorCommitted, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.equal(repo.meta.syncStatus, 'idle');
  assert.equal(repo.syncBatch, null);
  assert.equal(repo.projects['999941'].jobName, 'CRASH BEFORE PUBLISH');
  assert.deepEqual(client.listFolderContinueCalls, ['cursor-a']);
});

test('SyncService resumes sync_batch even when meta pending summary is stale', () => {
  const p1 = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999911'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'STALE META ONE'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999911')}`,
    rev: 'p911'
  };
  const p2 = {
    kind: 'P',
    filename: fixtures.pChronos[0].filename.replace('260174', '999912'),
    content: fixtures.pChronos[0].content.replace(/^REMODEL/, 'STALE META TWO'),
    path: `/root/Chronos/P_Chronos/${fixtures.pChronos[0].filename.replace('260174', '999912')}`,
    rev: 'p912'
  };
  const client = fakeClient([p1, p2], {
    'cursor-a': {
      entries: [
        { '.tag': 'file', path_display: p1.path, name: p1.filename, rev: 'p911' },
        { '.tag': 'file', path_display: p2.path, name: p2.filename, rev: 'p912' }
      ],
      has_more: false,
      cursor: 'cursor-b'
    }
  });
  const repo = fakeRepo(FullRebuildService.buildFromEntries([p1]));
  repo.syncBatch = {
    baseCursor: 'cursor-a',
    cursorAfterPage: 'cursor-b',
    hasMoreAfterPage: false,
    entries: [
      { '.tag': 'file', path_display: p1.path, name: p1.filename, rev: 'p911' },
      { '.tag': 'file', path_display: p2.path, name: p2.filename, rev: 'p912' }
    ],
    jobs: ['999911', '999912'],
    processedJobs: ['999911'],
    affectedProjects: ['999911'],
    skippedOrphans: [],
    resolverDiagnostics: []
  };
  repo.meta.pendingSyncBatch = null;

  const res = SyncService.syncNow(client, repo, { ...config, syncMaxJobsPerRun: 1 });

  assert.equal(res.cursorCommitted, true);
  assert.equal(repo.meta.cursor, 'cursor-b');
  assert.ok(repo.projects['999912']);
  assert.deepEqual(client.listFolderContinueCalls, []);
});

test('SyncService preserves duplicate P projects when shared AC2/T changes rebuild a jobNo', () => {
  const source = entries();
  const originalP = source[0];
  const duplicateP = {
    ...originalP,
    filename: originalP.filename.replace('COMPLETED', 'ASSIGNED').replace('@RonaldTruong', '@AnhTran'),
    path: originalP.path.replace('COMPLETED', 'ASSIGNED').replace('@RonaldTruong', '@AnhTran'),
    rev: 'p-duplicate'
  };
  const duplicateSource = [originalP, duplicateP, ...source.slice(1)];
  const cache = FullRebuildService.buildFromEntries(duplicateSource);
  const projectIds = Object.keys(cache.projects);
  assert.equal(projectIds.length, 2);
  const ac2Path = `/root/AC2/${fixtures.ac2[0].filename}`;
  const client = fakeClient(duplicateSource, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: ac2Path, name: fixtures.ac2[0].filename, rev: 'a0-next' }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, true);
  assert.deepEqual(Object.keys(repo.projects).sort(), projectIds.sort());
  assert.equal(res.affectedProjects.length, 2);
  assert.deepEqual(client.listFolderCalls, []);
});

test('SyncService keeps old cursor if cache merge fails', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const changedPath = `/root/AC2/${fixtures.ac2[0].filename}`;
  const client = fakeClient(source, {
    'cursor-a': { entries: [{ '.tag': 'file', path_display: changedPath, name: fixtures.ac2[0].filename }], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache, true);

  assert.throws(() => SyncService.syncNow(client, repo, config), /cache merge failed/);
  assert.equal(repo.meta.cursor, 'cursor-a');
  assert.equal(repo.meta.syncStatus, 'error');
});

test('SyncService skips incremental sync while full rebuild cache publish is pending', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {
    'cursor-a': { entries: [], has_more: false, cursor: 'cursor-b' }
  });
  const repo = fakeRepo(cache);
  repo.meta = {
    schemaVersion: 1,
    cursor: '',
    syncStatus: 'publishing',
    projectCount: 0,
    pendingProjectCount: 3118,
    publishStartedAt: '2026-08-09T16:07:15Z',
    lastError: null
  };

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.ok, false);
  assert.equal(res.code, 'CACHE_PUBLISHING');
  assert.equal(res.skipped, true);
  assert.equal(repo.meta.syncStatus, 'publishing');
  assert.equal(repo.meta.pendingProjectCount, 3118);
  assert.equal(repo.meta.lastError, null);
});

test('SyncService treats blocked pending publish marker as cache publishing without overwriting meta', () => {
  const source = entries();
  const cache = FullRebuildService.buildFromEntries(source);
  const client = fakeClient(source, {});
  const repo = fakeRepo(cache);
  repo.meta = {
    schemaVersion: 1,
    cursor: '',
    syncStatus: 'blocked',
    projectCount: 0,
    pendingProjectCount: 3118,
    publishStartedAt: '2026-08-09T16:07:15Z',
    lastError: { code: 'MISSING_CURSOR', message: 'Full rebuild is required before incremental sync.' }
  };

  const res = SyncService.syncNow(client, repo, config);

  assert.equal(res.code, 'CACHE_PUBLISHING');
  assert.equal(repo.meta.syncStatus, 'blocked');
  assert.equal(repo.meta.lastError.code, 'MISSING_CURSOR');
});
