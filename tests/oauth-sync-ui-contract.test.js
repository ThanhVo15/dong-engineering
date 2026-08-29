const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('Dropbox OAuth exchange is handled in Apps Script, not by the local rebuild Python script', () => {
  const webApi = fs.readFileSync('src/backend/WebApi.js', 'utf8');
  assert.match(webApi, /function\s+apiExchangeDropboxAuthorizationCode\s*\(/);
  assert.match(webApi, /oauth2\/token/);
  assert.match(webApi, /DROPBOX_REFRESH_TOKEN/);
  assert.doesNotMatch(webApi, /local Python runner/i);
});

test('Admin Sync Status stays focused on cursor incremental sync instead of old build queues', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /rebuilds only affected jobs/);
  assert.match(client, /commits the cursor after cache writes succeed/);
  assert.doesNotMatch(client, /maintenanceStartFullRebuild/);
  assert.doesNotMatch(client, /apiMaterializeUiViews/);
  assert.doesNotMatch(client, /active manifests/i);
});
