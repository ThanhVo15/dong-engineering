var AuthService = (function () {
  'use strict';

  var DEFAULT_USERNAME = 'admin';
  var DEFAULT_PASSWORD = 'dong@dmin123';
  var PASSWORD_MIN_LENGTH = 6;
  var USER_CATALOG_KEY = 'DONG_USER_CATALOG';
  var SESSION_CATALOG_KEY = 'DONG_USER_PERSISTENT_SESSIONS';
  var LEGACY_USERS_KEY = 'DONG_USERS_JSON';
  var MEMORY = {};

  var ROLE_PERMISSIONS = {
    admin: {
      canViewProject: true,
      canApplyProjectPatch: true,
      canAccessAdmin: true,
      canManageUsers: true,
      canManageEnums: true,
      canManageDropboxConnection: true,
      canRunSync: true,
      canViewAudit: true
    },
    editor: {
      canViewProject: true,
      canApplyProjectPatch: true
    },
    viewer: {
      canViewProject: true
    },
    disabled: {}
  };

  function props() {
    if (typeof PropertiesService === 'undefined') {
      return {
        getProperty: function (key) { return Object.prototype.hasOwnProperty.call(MEMORY, key) ? MEMORY[key] : null; },
        setProperty: function (key, value) { MEMORY[key] = String(value == null ? '' : value); },
        setProperties: function (values) {
          values = values || {};
          for (var key in values) if (Object.prototype.hasOwnProperty.call(values, key)) MEMORY[key] = String(values[key] == null ? '' : values[key]);
        },
        deleteProperty: function (key) { delete MEMORY[key]; }
      };
    }
    return PropertiesService.getScriptProperties();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uuid() {
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) return Utilities.getUuid();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var n = bytes[i];
      if (n < 0) n += 256;
      out += ('0' + n.toString(16)).slice(-2);
    }
    return out;
  }

  function sha256(text) {
    text = String(text == null ? '' : text);
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
      return bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
    }
    if (typeof require === 'function') {
      return require('crypto').createHash('sha256').update(text, 'utf8').digest('hex');
    }
    var hash = 0;
    for (var i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return String(hash >>> 0);
  }

  function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
  }

  function normalizeRole(role) {
    role = String(role || 'viewer').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role) ? role : 'viewer';
  }

  function hashPassword(password, salt) {
    return sha256(String(salt || '') + ':' + String(password || ''));
  }

  function newSalt() {
    return uuid().replace(/-/g, '') + uuid().replace(/-/g, '');
  }

  function readJson(key, fallback) {
    var raw = props().getProperty(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (err) { return fallback; }
  }

  function writeJson(key, value) {
    props().setProperty(key, JSON.stringify(value || {}));
  }

  function apiError(code, message) {
    var err = new Error(message || code || 'Error');
    err.code = code || 'ERROR';
    return err;
  }

  function sanitizeUser(user) {
    return {
      username: user.username || '',
      displayName: user.displayName || user.username || '',
      role: normalizeRole(user.role),
      status: user.status || 'active',
      createdAt: user.createdAt || '',
      createdBy: user.createdBy || '',
      updatedAt: user.updatedAt || '',
      updatedBy: user.updatedBy || '',
      lastLoginAt: user.lastLoginAt || '',
      lastPasswordChangedAt: user.lastPasswordChangedAt || '',
      defaultPasswordActive: user.defaultPasswordActive === true,
      mustChangePassword: user.mustChangePassword === true,
      sessionVersion: Number(user.sessionVersion || 1)
    };
  }

  function createRawUser(username, displayName, role, password, actor, options) {
    username = normalizeUsername(username);
    password = String(password || '');
    options = options || {};
    if (!username) throw apiError('VALIDATION', 'Username is required.');
    if (!/^[a-z0-9._-]{2,40}$/.test(username)) throw apiError('VALIDATION', 'Username may use letters, numbers, dot, dash and underscore.');
    if (password.length < PASSWORD_MIN_LENGTH) throw apiError('VALIDATION', 'Password must be at least ' + PASSWORD_MIN_LENGTH + ' characters.');
    var salt = newSalt();
    var now = nowIso();
    return {
      username: username,
      displayName: String(displayName || username).trim() || username,
      role: normalizeRole(role),
      status: options.status === 'disabled' ? 'disabled' : 'active',
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: options.createdAt || now,
      createdBy: options.createdBy || actor || 'system',
      updatedAt: now,
      updatedBy: actor || 'system',
      lastLoginAt: options.lastLoginAt || '',
      lastPasswordChangedAt: options.lastPasswordChangedAt || now,
      defaultPasswordActive: options.defaultPasswordActive === true,
      mustChangePassword: options.mustChangePassword === true,
      sessionVersion: Number(options.sessionVersion || 1)
    };
  }

  function activeAdminCount(users) {
    var count = 0;
    for (var key in users) if (Object.prototype.hasOwnProperty.call(users, key)) {
      var user = users[key] || {};
      if (user.role === 'admin' && user.status !== 'disabled') count++;
    }
    return count;
  }

  function assertActiveAdminRemains(users) {
    if (activeAdminCount(users) < 1) throw apiError('VALIDATION', 'At least one active admin is required.');
  }

  function writeCatalog(catalog) {
    catalog = catalog || {};
    catalog.schemaVersion = 1;
    catalog.updatedAt = nowIso();
    catalog.users = catalog.users || {};
    writeJson(USER_CATALOG_KEY, catalog);
    return catalog;
  }

  function migrateLegacyPlaintextUsers() {
    var legacy = readJson(LEGACY_USERS_KEY, null);
    if (!legacy || !legacy.length) return null;
    var users = {};
    for (var i = 0; i < legacy.length; i++) {
      var row = legacy[i] || {};
      var username = normalizeUsername(row.username);
      if (!username) continue;
      users[username] = createRawUser(username, row.displayName || username, row.role || 'viewer', row.password || DEFAULT_PASSWORD, 'legacy-migration', {
        status: row.status || 'active',
        createdAt: row.createdAt || nowIso(),
        lastLoginAt: row.lastLoginAt || '',
        defaultPasswordActive: username === DEFAULT_USERNAME && row.password === 'admin',
        mustChangePassword: username === DEFAULT_USERNAME && row.password === 'admin'
      });
      users[username].lastPasswordChangedAt = row.lastPasswordChangedAt || users[username].lastPasswordChangedAt;
    }
    if (!users[DEFAULT_USERNAME]) {
      users[DEFAULT_USERNAME] = createRawUser(DEFAULT_USERNAME, 'Admin', 'admin', DEFAULT_PASSWORD, 'bootstrap', {
        defaultPasswordActive: true,
        mustChangePassword: true,
        createdBy: 'bootstrap'
      });
    }
    assertActiveAdminRemains(users);
    return writeCatalog({ createdAt: nowIso(), migratedFrom: LEGACY_USERS_KEY, users: users });
  }

  function bootstrapCatalog() {
    var migrated = migrateLegacyPlaintextUsers();
    if (migrated) return migrated;
    var admin = createRawUser(DEFAULT_USERNAME, 'Admin', 'admin', DEFAULT_PASSWORD, 'bootstrap', {
      defaultPasswordActive: true,
      mustChangePassword: true,
      createdBy: 'bootstrap'
    });
    var users = {};
    users[DEFAULT_USERNAME] = admin;
    return writeCatalog({ createdAt: admin.createdAt, users: users });
  }

  function catalog() {
    var existing = readJson(USER_CATALOG_KEY, null);
    if (existing && existing.users) return existing;
    return bootstrapCatalog();
  }

  function readSessions() {
    var sessions = readJson(SESSION_CATALOG_KEY, {});
    var now = Date.now();
    var clean = {};
    for (var key in sessions) if (Object.prototype.hasOwnProperty.call(sessions, key)) {
      var session = sessions[key] || {};
      var expires = Date.parse(session.expiresAt || '');
      if (expires && expires > now) clean[key] = session;
    }
    if (JSON.stringify(clean) !== JSON.stringify(sessions)) writeJson(SESSION_CATALOG_KEY, clean);
    return clean;
  }

  function writeSessions(sessions) {
    writeJson(SESSION_CATALOG_KEY, sessions || {});
  }

  function sessionKey(token) {
    return sha256(String(token || ''));
  }

  function publicStatus() {
    var c = catalog();
    var admin = null;
    for (var key in c.users) if (Object.prototype.hasOwnProperty.call(c.users, key)) {
      if (c.users[key].role === 'admin' && c.users[key].status !== 'disabled') {
        admin = c.users[key];
        break;
      }
    }
    return {
      configured: activeAdminCount(c.users) > 0,
      username: admin && admin.username || DEFAULT_USERNAME,
      defaultPasswordActive: !!(admin && admin.defaultPasswordActive),
      userCount: Object.keys(c.users).length
    };
  }

  function login(username, password, options) {
    options = options || {};
    var c = catalog();
    username = normalizeUsername(username);
    var user = c.users[username];
    if (!user || user.status === 'disabled' || user.role === 'disabled') throw apiError('UNAUTHORIZED', 'Invalid username or password.');
    if (hashPassword(password, user.passwordSalt) !== user.passwordHash) throw apiError('UNAUTHORIZED', 'Invalid username or password.');
    user.lastLoginAt = nowIso();
    c.users[username] = user;
    writeCatalog(c);
    var token = uuid() + uuid();
    var ttlMs = options.remember === true ? 7 * 24 * 3600000 : 2 * 3600000;
    var session = {
      username: user.username,
      displayName: user.displayName || user.username,
      role: normalizeRole(user.role),
      issuedAt: nowIso(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      version: Number(user.sessionVersion || 1),
      remember: options.remember === true
    };
    var sessions = readSessions();
    sessions[sessionKey(token)] = session;
    writeSessions(sessions);
    return {
      token: token,
      username: user.username,
      displayName: user.displayName || user.username,
      role: normalizeRole(user.role),
      expiresAt: session.expiresAt,
      remember: session.remember,
      mustChangePassword: user.mustChangePassword === true,
      defaultPasswordActive: user.defaultPasswordActive === true
    };
  }

  function getSession(token) {
    if (!token) return null;
    var sessions = readSessions();
    var session = sessions[sessionKey(token)] || null;
    if (!session) return null;
    var user = catalog().users[normalizeUsername(session.username)];
    if (!user || user.status === 'disabled' || user.role === 'disabled') return null;
    if (Number(session.version || 0) !== Number(user.sessionVersion || 1)) return null;
    session.role = normalizeRole(user.role);
    session.displayName = user.displayName || user.username;
    return session;
  }

  function assertAuthenticated(token) {
    var session = getSession(token);
    if (!session) throw apiError('UNAUTHORIZED', 'Session expired. Please sign in again.');
    return session;
  }

  function can(session, permission) {
    if (!session || !permission) return false;
    var role = normalizeRole(session.role);
    return !!(ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role][permission]);
  }

  function assertPermission(token, permission) {
    var session = assertAuthenticated(token);
    if (!can(session, permission)) throw apiError('FORBIDDEN', 'You do not have permission for this action.');
    return session;
  }

  function listUsers() {
    var c = catalog();
    var out = [];
    for (var key in c.users) if (Object.prototype.hasOwnProperty.call(c.users, key)) out.push(sanitizeUser(c.users[key]));
    out.sort(function (a, b) { return String(a.username).localeCompare(String(b.username)); });
    return out;
  }

  function createUser(actor, payload) {
    payload = payload || {};
    var c = catalog();
    var username = normalizeUsername(payload.username);
    if (c.users[username]) throw apiError('VALIDATION', 'Username already exists.');
    var user = createRawUser(username, payload.displayName, payload.role || 'viewer', payload.password || payload.temporaryPassword, actor && actor.username || 'admin', {
      status: payload.status || 'active',
      mustChangePassword: payload.mustChangePassword !== false
    });
    c.users[username] = user;
    assertActiveAdminRemains(c.users);
    writeCatalog(c);
    return sanitizeUser(user);
  }

  function updateUser(actor, username, payload) {
    payload = payload || {};
    var c = catalog();
    username = normalizeUsername(username || payload.username);
    var user = c.users[username];
    if (!user) throw apiError('NOT_FOUND', 'User not found.');
    if (payload.displayName != null) user.displayName = String(payload.displayName || username).trim() || username;
    if (payload.role != null) user.role = normalizeRole(payload.role);
    if (payload.status != null) user.status = payload.status === 'disabled' ? 'disabled' : 'active';
    if (user.status === 'disabled') user.sessionVersion = Number(user.sessionVersion || 1) + 1;
    user.updatedAt = nowIso();
    user.updatedBy = actor && actor.username || 'admin';
    c.users[username] = user;
    assertActiveAdminRemains(c.users);
    writeCatalog(c);
    return sanitizeUser(user);
  }

  function deleteUser(actor, username) {
    var c = catalog();
    username = normalizeUsername(username);
    if (!c.users[username]) throw apiError('NOT_FOUND', 'User not found.');
    if (actor && normalizeUsername(actor.username) === username) throw apiError('VALIDATION', 'You cannot delete your own account.');
    delete c.users[username];
    assertActiveAdminRemains(c.users);
    writeCatalog(c);
    return { deleted: true, username: username };
  }

  function resetUserPassword(actor, username, newPassword) {
    var c = catalog();
    username = normalizeUsername(username);
    var user = c.users[username];
    if (!user) throw apiError('NOT_FOUND', 'User not found.');
    newPassword = String(newPassword || '');
    if (newPassword.length < PASSWORD_MIN_LENGTH) throw apiError('VALIDATION', 'Password must be at least ' + PASSWORD_MIN_LENGTH + ' characters.');
    var salt = newSalt();
    user.passwordSalt = salt;
    user.passwordHash = hashPassword(newPassword, salt);
    user.lastPasswordChangedAt = nowIso();
    user.updatedAt = user.lastPasswordChangedAt;
    user.updatedBy = actor && actor.username || 'admin';
    user.defaultPasswordActive = false;
    user.mustChangePassword = true;
    user.sessionVersion = Number(user.sessionVersion || 1) + 1;
    c.users[username] = user;
    writeCatalog(c);
    return { reset: true, user: sanitizeUser(user), sessionsRevoked: true };
  }

  function changePassword(token, payload) {
    payload = payload || {};
    var session = assertAuthenticated(token);
    var c = catalog();
    var user = c.users[normalizeUsername(session.username)];
    if (!user) throw apiError('UNAUTHORIZED', 'Session expired. Please sign in again.');
    if (hashPassword(payload.currentPassword, user.passwordSalt) !== user.passwordHash) throw apiError('UNAUTHORIZED', 'Current password is wrong.');
    var next = String(payload.newPassword || '');
    if (next.length < PASSWORD_MIN_LENGTH || next !== String(payload.confirmPassword || '')) throw apiError('VALIDATION', 'New password confirmation is invalid.');
    var salt = newSalt();
    user.passwordSalt = salt;
    user.passwordHash = hashPassword(next, salt);
    user.defaultPasswordActive = false;
    user.mustChangePassword = false;
    user.lastPasswordChangedAt = nowIso();
    user.updatedAt = user.lastPasswordChangedAt;
    user.updatedBy = user.username;
    user.sessionVersion = Number(user.sessionVersion || 1) + 1;
    c.users[user.username] = user;
    writeCatalog(c);
    return { changed: true, username: user.username, defaultPasswordActive: false, sessionsRevoked: true };
  }

  function logout(token) {
    var sessions = readSessions();
    delete sessions[sessionKey(token)];
    writeSessions(sessions);
    return { loggedOut: true };
  }

  function resetForTests() {
    MEMORY = {};
  }

  return {
    DEFAULT_USERNAME: DEFAULT_USERNAME,
    DEFAULT_PASSWORD: DEFAULT_PASSWORD,
    PASSWORD_MIN_LENGTH: PASSWORD_MIN_LENGTH,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    ensureDefaultAdmin: function () { catalog(); return publicStatus(); },
    publicStatus: publicStatus,
    login: login,
    logout: logout,
    getSession: getSession,
    assertAuthenticated: assertAuthenticated,
    assertPermission: assertPermission,
    can: can,
    listUsers: listUsers,
    createUser: createUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    resetUserPassword: resetUserPassword,
    changePassword: changePassword,
    _hashPassword: hashPassword,
    _resetForTests: resetForTests,
    _readRawCatalogForTests: function () { return catalog(); },
    _readRawSessionsForTests: readSessions
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AuthService;
