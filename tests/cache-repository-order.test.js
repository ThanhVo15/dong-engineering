const assert = require('node:assert/strict');
const test = require('node:test');

const CacheRepository = require('../src/backend/CacheRepository');

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

test('mergeJobCache writes job detail before publishing projects index', () => {
  const store = {
    '/root/__db__/meta.json': json({ schemaVersion: 1, cursor: 'cursor-a', projectCount: 1 }),
    '/root/__db__/projects.json': json({ '260174': { projectId: '260174', jobNo: '260174' } }),
    '/root/__db__/jobs/260174.json': json({ projectId: '260174', jobNo: '260174', old: true })
  };
  const writes = [];
  const client = {
    downloadText(path) {
      if (!Object.prototype.hasOwnProperty.call(store, path)) {
        const err = new Error('not_found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      return store[path];
    },
    uploadText(path, content) {
      writes.push(path);
      store[path] = content;
      return { path_display: path, rev: `rev-${writes.length}` };
    },
    deletePath(path) {
      delete store[path];
      return {};
    }
  };
  const repo = CacheRepository.create(client, { dropbox: { dbPath: '/root/__db__' } });

  repo.mergeJobCache('260174', {
    projects: { '260174': { projectId: '260174', jobNo: '260174', updated: true } },
    jobs: { '260174': { projectId: '260174', jobNo: '260174', updated: true } }
  });

  assert.equal(writes[0], '/root/__db__/jobs/260174.json');
  assert.equal(writes[1], '/root/__db__/projects.json');
  assert.equal(writes[2], '/root/__db__/p_index.json');
  assert.equal(writes[3], '/root/__db__/meta.json');
});

test('upsertCacheResult writes all job details before publishing indexes and meta', () => {
  const store = {};
  const writes = [];
  const client = {
    downloadText(path) {
      if (!Object.prototype.hasOwnProperty.call(store, path)) {
        const err = new Error('not_found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      return store[path];
    },
    uploadText(path, content) {
      writes.push(path);
      store[path] = content;
      return { path_display: path, rev: `rev-${writes.length}` };
    },
    deletePath(path) {
      delete store[path];
      return {};
    }
  };
  const repo = CacheRepository.create(client, { dropbox: { dbPath: '/root/__db__' } });

  repo.upsertCacheResult({
    meta: { schemaVersion: 1, cursor: 'cursor-b', projectCount: 2 },
    projects: {
      '260174': { projectId: '260174', jobNo: '260174', pPath: '/p/260174.txt' },
      '260175': { projectId: '260175', jobNo: '260175', pPath: '/p/260175.txt' }
    },
    jobs: {
      '260174': { projectId: '260174', jobNo: '260174' },
      '260175': { projectId: '260175', jobNo: '260175' }
    }
  });

  assert.deepEqual(writes, [
    '/root/__db__/jobs/260174.json',
    '/root/__db__/jobs/260175.json',
    '/root/__db__/projects.json',
    '/root/__db__/p_index.json',
    '/root/__db__/meta.json'
  ]);
  const pIndex = JSON.parse(store['/root/__db__/p_index.json']);
  assert.equal(pIndex['260174'][0].path, '/p/260174.txt');
});

test('mergeJobCache can update one duplicate projectId without deleting sibling jobNo cache', () => {
  const store = {
    '/root/__db__/meta.json': json({ schemaVersion: 1, cursor: 'cursor-a', projectCount: 2 }),
    '/root/__db__/projects.json': json({
      '250400@@completed': { projectId: '250400@@completed', jobNo: '250400', status: 'COMPLETED' },
      '250400@@assigned': { projectId: '250400@@assigned', jobNo: '250400', status: 'US ASSIGNED' }
    }),
    '/root/__db__/jobs/250400@@completed.json': json({ projectId: '250400@@completed', jobNo: '250400', old: true }),
    '/root/__db__/jobs/250400@@assigned.json': json({ projectId: '250400@@assigned', jobNo: '250400', sibling: true })
  };
  const client = {
    downloadText(path) {
      if (!Object.prototype.hasOwnProperty.call(store, path)) {
        const err = new Error('not_found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      return store[path];
    },
    uploadText(path, content) {
      store[path] = content;
      return { path_display: path, rev: 'rev' };
    },
    deletePath(path) {
      delete store[path];
      return {};
    }
  };
  const repo = CacheRepository.create(client, { dropbox: { dbPath: '/root/__db__' } });

  repo.mergeJobCache('250400', {
    projects: { '250400@@completed': { projectId: '250400@@completed', jobNo: '250400', status: 'COMPLETED', updated: true } },
    jobs: { '250400@@completed': { projectId: '250400@@completed', jobNo: '250400', updated: true } }
  }, { staleProjectIds: ['250400@@completed'] });

  const projects = JSON.parse(store['/root/__db__/projects.json']);
  assert.equal(projects['250400@@completed'].updated, true);
  assert.equal(projects['250400@@assigned'].status, 'US ASSIGNED');
  assert.ok(store['/root/__db__/jobs/250400@@assigned.json']);
});
