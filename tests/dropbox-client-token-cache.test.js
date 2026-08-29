const assert = require('node:assert/strict');
const test = require('node:test');

const DropboxClient = require('../src/backend/DropboxClient');

function installProperties(store) {
  global.PropertiesService = {
    getScriptProperties() {
      return {
        getProperty: (key) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
        setProperty: (key, value) => { store[key] = String(value); }
      };
    }
  };
}

function clearProperties() {
  delete global.PropertiesService;
}

function config() {
  return {
    environment: 'sandbox',
    dropbox: {
      appKey: 'appKey',
      appSecret: 'appSecret',
      refreshToken: 'refreshToken'
    }
  };
}

test('DropboxClient reuses cached Apps Script access token without oauth refresh', () => {
  const store = {
    DONG_DROPBOX_ACCESS_TOKEN_CACHE_sandbox_appKey: JSON.stringify({
      appKey: 'appKey',
      accessToken: 'cached-token',
      expiresAt: Date.now() + 60 * 60 * 1000
    })
  };
  const calls = [];
  installProperties(store);
  try {
    const client = DropboxClient.create(config(), {
      fetch(url, options) {
        calls.push({ url, options });
        return { status: 200, text: () => '{"ok":true}', bytes: () => [] };
      }
    });

    client.downloadText('/root/__db__/projects.json');

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /content\.dropboxapi\.com\/2\/files\/download/);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer cached-token');
  } finally {
    clearProperties();
  }
});

test('DropboxClient stores refreshed access token for the next execution', () => {
  const store = {};
  const calls = [];
  installProperties(store);
  try {
    function fetch(url, options) {
      calls.push({ url, options });
      if (String(url).includes('/oauth2/token')) {
        return { status: 200, text: () => '{"access_token":"fresh-token","expires_in":14400}', bytes: () => [] };
      }
      return { status: 200, text: () => '{"ok":true}', bytes: () => [] };
    }

    DropboxClient.create(config(), { fetch }).downloadText('/root/__db__/projects.json');
    DropboxClient.create(config(), { fetch }).downloadText('/root/__db__/meta.json');

    assert.equal(calls.filter((call) => String(call.url).includes('/oauth2/token')).length, 1);
    assert.equal(calls.filter((call) => String(call.url).includes('/files/download')).length, 2);
    assert.equal(Object.keys(store).length, 1);
    assert.match(Object.values(store)[0], /fresh-token/);
  } finally {
    clearProperties();
  }
});
