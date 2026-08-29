const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const AppConfig = require('../src/backend/Config');

test('Dropbox Desktop local path normalizes to Dropbox API path', () => {
  assert.equal(
    AppConfig.normalizePath('C:\\Users\\ADMIN\\Dropbox\\Dong Engineering Sandbox'),
    '/Dong Engineering Sandbox'
  );
  assert.equal(
    AppConfig.normalizePath('C:\\Users\\ADMIN\\Dropbox\\Dong Engineering Sandbox\\Chronos\\P_Chronos'),
    '/Dong Engineering Sandbox/Chronos/P_Chronos'
  );
});

test('legacy Dropbox admin endpoints return the fields old Client.html reads', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  assert.match(webApi, /folders:\s*folders/, 'apiListDropboxFolders must return data.folders');
  assert.match(webApi, /entries:\s*folders/, 'apiListDropboxFolders may also return entries for compatibility');
  assert.match(webApi, /counts:\s*counts/, 'apiTestDropboxConnection must return data.counts');
  assert.match(webApi, /steps:\s*steps/, 'apiTestDropboxConnection must return data.steps');
  assert.match(webApi, /filesCreated:\s*filesCreated/, 'apiEnsureDbFolder must return data.filesCreated');
  assert.match(webApi, /foldersCreated:\s*foldersCreated/, 'apiEnsureDbFolder must return data.foldersCreated');
  assert.match(webApi, /pPath/, 'apiSaveDropboxPathConfig must accept old UI pPath');
  assert.match(webApi, /tPath/, 'apiSaveDropboxPathConfig must accept old UI tPath');
  assert.match(webApi, /ac2Path/, 'apiSaveDropboxPathConfig must accept old UI ac2Path');
  assert.match(webApi, /dbPath/, 'apiSaveDropboxPathConfig must accept old UI dbPath');
});
