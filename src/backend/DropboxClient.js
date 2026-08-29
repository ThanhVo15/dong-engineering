var DropboxClient = (function () {
  'use strict';

  var ACCESS_TOKEN_CACHE_KEY_PREFIX = 'DONG_DROPBOX_ACCESS_TOKEN_CACHE';
  var ACCESS_TOKEN_EXPIRY_SKEW_MS = 60 * 1000;

  function create(config, transport) {
    return new Client(config, transport);
  }

  function Client(config, transport) {
    this.config = config || {};
    this.transport = transport || {};
    this._accessToken = '';
  }

  function safeKeyPart(value) {
    return String(value || 'default').replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 40) || 'default';
  }

  function tokenCacheKey(config, dropboxConfig) {
    return ACCESS_TOKEN_CACHE_KEY_PREFIX + '_' + safeKeyPart(config && config.environment || 'default') + '_' + safeKeyPart(dropboxConfig && dropboxConfig.appKey || 'app');
  }

  function scriptProperties() {
    if (typeof PropertiesService === 'undefined') return null;
    try { return PropertiesService.getScriptProperties(); } catch (err) { return null; }
  }

  Client.prototype._cachedAccessToken = function (dropboxConfig) {
    if (this.transport.disableTokenCache === true) return '';
    var p = scriptProperties();
    if (!p) return '';
    try {
      var raw = p.getProperty(tokenCacheKey(this.config, dropboxConfig));
      var cached = raw ? JSON.parse(raw) : null;
      if (!cached || cached.appKey !== dropboxConfig.appKey || !cached.accessToken) return '';
      if (Number(cached.expiresAt || 0) <= Date.now() + ACCESS_TOKEN_EXPIRY_SKEW_MS) return '';
      return cached.accessToken;
    } catch (err) {
      return '';
    }
  };

  Client.prototype._writeCachedAccessToken = function (dropboxConfig, body) {
    if (this.transport.disableTokenCache === true) return;
    var p = scriptProperties();
    if (!p) return;
    var token = body && body.access_token || '';
    if (!token) return;
    try {
      var expiresInMs = Math.max(60, Number(body.expires_in || 14400) - 120) * 1000;
      p.setProperty(tokenCacheKey(this.config, dropboxConfig), JSON.stringify({
        appKey: dropboxConfig.appKey,
        accessToken: token,
        expiresAt: Date.now() + expiresInMs
      }));
    } catch (err) {}
  };

  Client.prototype._fetch = function (url, options) {
    if (this.transport.fetch) return this.transport.fetch(url, options);
    if (typeof UrlFetchApp === 'undefined') throw new Error('UrlFetchApp is not available.');
    var res = UrlFetchApp.fetch(url, options);
    return {
      status: res.getResponseCode(),
      text: function () { return res.getContentText(); },
      bytes: function () { return res.getBlob().getBytes(); }
    };
  };

  Client.prototype._json = function (host, path, payload, token, form) {
    var body = form ? Object.keys(payload || {}).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(payload[key]);
    }).join('&') : JSON.stringify(payload || {});
    var res = this._fetch('https://' + host + path, {
      method: 'post',
      contentType: form ? 'application/x-www-form-urlencoded' : 'application/json',
      payload: body,
      muteHttpExceptions: true,
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    });
    var status = res.status;
    var text = res.text();
    if (status < 200 || status >= 300) throw dropboxError(status, text);
    return text ? JSON.parse(text) : {};
  };

  Client.prototype.accessToken = function () {
    if (this._accessToken) return this._accessToken;
    var d = this.config.dropbox || this.config;
    if (!d.appKey || !d.appSecret || !d.refreshToken) throw new Error('Dropbox credentials are not configured.');
    this._accessToken = this._cachedAccessToken(d);
    if (this._accessToken) return this._accessToken;
    var body = this._json('api.dropboxapi.com', '/oauth2/token', {
      grant_type: 'refresh_token',
      refresh_token: d.refreshToken,
      client_id: d.appKey,
      client_secret: d.appSecret
    }, '', true);
    this._accessToken = body.access_token || '';
    if (!this._accessToken) throw new Error('Dropbox access token refresh failed.');
    this._writeCachedAccessToken(d, body);
    return this._accessToken;
  };

  Client.prototype.rpc = function (endpoint, payload) {
    return this._json('api.dropboxapi.com', '/2/' + endpoint, payload || {}, this.accessToken(), false);
  };

  Client.prototype.contentRpc = function (endpoint, arg, body, contentType) {
    var res = this._fetch('https://content.dropboxapi.com/2/' + endpoint, {
      method: 'post',
      contentType: contentType || 'application/octet-stream',
      payload: body || '',
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + this.accessToken(),
        'Dropbox-API-Arg': JSON.stringify(arg || {})
      }
    });
    var status = res.status;
    var text = res.text();
    if (status < 200 || status >= 300) throw dropboxError(status, text);
    return text;
  };

  Client.prototype.testConnection = function () {
    var account = this.rpc('users/get_current_account', {});
    return { ok: true, accountId: account.account_id || '', name: account.name && account.name.display_name || '' };
  };

  Client.prototype.getMetadata = function (path) {
    return this.rpc('files/get_metadata', { path: path, include_deleted: true });
  };

  Client.prototype.downloadText = function (path) {
    return this.contentRpc('files/download', { path: path }, '', 'application/octet-stream');
  };

  Client.prototype.uploadText = function (path, content, options) {
    options = options || {};
    var mode = options.rev ? { '.tag': 'update', update: options.rev } : { '.tag': 'overwrite' };
    var text = this.contentRpc('files/upload', {
      path: path,
      mode: mode,
      autorename: false,
      mute: true,
      strict_conflict: true
    }, content || '', 'application/octet-stream');
    return text ? JSON.parse(text) : {};
  };

  Client.prototype.move = function (fromPath, toPath) {
    return this.rpc('files/move_v2', { from_path: fromPath, to_path: toPath, allow_shared_folder: false, autorename: false });
  };

  Client.prototype.deletePath = function (path) {
    return this.rpc('files/delete_v2', { path: path });
  };

  Client.prototype.createFolder = function (path) {
    return this.rpc('files/create_folder_v2', { path: path, autorename: false });
  };

  Client.prototype.listFolder = function (path, recursive) {
    return this.rpc('files/list_folder', { path: path || '', recursive: recursive === true, include_deleted: true, limit: 2000 });
  };

  Client.prototype.listFolderContinue = function (cursor) {
    return this.rpc('files/list_folder/continue', { cursor: cursor });
  };

  Client.prototype.searchFiles = function (folder, query, limit) {
    var res = this.rpc('files/search_v2', {
      query: String(query || ''),
      options: {
        path: folder || '',
        max_results: Number(limit || 20),
        filename_only: true,
        file_status: 'active'
      }
    });
    var out = [];
    var matches = res.matches || [];
    for (var i = 0; i < matches.length; i++) {
      var metadata = matches[i] && matches[i].metadata && (matches[i].metadata.metadata || matches[i].metadata);
      if (!metadata || metadata['.tag'] !== 'file') continue;
      out.push(metadata);
    }
    return out;
  };

  Client.prototype.getLatestCursor = function (path, recursive) {
    var res = this.rpc('files/list_folder/get_latest_cursor', { path: path || '', recursive: recursive !== false, include_deleted: true });
    return res.cursor || '';
  };

  function dropboxError(status, text) {
    var err = new Error('Dropbox API failed with HTTP ' + status);
    err.status = status;
    err.body = String(text || '').replace(/(access_token|refresh_token|client_secret)[^,}]*/ig, '$1:[masked]');
    if (/conflict/i.test(err.body)) err.code = 'CONFLICT';
    else if (/not_found/i.test(err.body)) err.code = 'NOT_FOUND';
    else if (status === 401 || status === 403) err.code = 'AUTH';
    else if (status === 429) err.code = 'RATE_LIMIT';
    else err.code = 'DROPBOX_ERROR';
    return err;
  }

  return { create: create, dropboxError: dropboxError };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DropboxClient;
