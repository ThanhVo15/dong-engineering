const assert = require('node:assert/strict');
const test = require('node:test');

const AuthService = require('../src/backend/AuthService');

test('AuthService bootstraps the old default admin account with hashed storage', () => {
  AuthService._resetForTests();

  const status = AuthService.ensureDefaultAdmin();
  assert.equal(status.username, 'admin');
  assert.equal(AuthService.DEFAULT_PASSWORD, 'dong@dmin123');
  assert.equal(status.defaultPasswordActive, true);

  const login = AuthService.login('admin', 'dong@dmin123');
  assert.equal(login.username, 'admin');
  assert.equal(login.role, 'admin');
  assert.ok(login.token);

  const catalog = AuthService._readRawCatalogForTests();
  const admin = catalog.users.admin;
  assert.ok(admin.passwordHash);
  assert.ok(admin.passwordSalt);
  assert.notEqual(admin.passwordHash, 'dong@dmin123');
  assert.equal(admin.password, undefined);

  const sessions = AuthService._readRawSessionsForTests();
  assert.equal(Object.prototype.hasOwnProperty.call(sessions, login.token), false);
  assert.equal(AuthService.getSession(login.token).username, 'admin');
});

test('AuthService user management keeps credentials out of public user payloads', () => {
  AuthService._resetForTests();
  const adminLogin = AuthService.login('admin', 'dong@dmin123');
  const adminSession = AuthService.getSession(adminLogin.token);

  const created = AuthService.createUser(adminSession, {
    username: 'viewer.one',
    displayName: 'Viewer One',
    role: 'viewer',
    password: 'secret123'
  });
  assert.equal(created.username, 'viewer.one');
  assert.equal(created.role, 'viewer');
  assert.equal(created.password, undefined);
  assert.equal(created.passwordHash, undefined);
  assert.equal(created.passwordSalt, undefined);

  const users = AuthService.listUsers();
  const visible = users.find((row) => row.username === 'viewer.one');
  assert.ok(visible);
  assert.equal(visible.password, undefined);
  assert.equal(visible.passwordHash, undefined);
  assert.equal(visible.passwordSalt, undefined);

  const reset = AuthService.resetUserPassword(adminSession, 'viewer.one', 'changed123');
  assert.equal(reset.reset, true);
  assert.equal(AuthService.login('viewer.one', 'changed123').username, 'viewer.one');
});

test('AuthService roles and lifecycle guards are safe for long-term internal use', () => {
  AuthService._resetForTests();
  const adminLogin = AuthService.login('admin', 'dong@dmin123');
  const adminSession = AuthService.getSession(adminLogin.token);

  const editor = AuthService.createUser(adminSession, {
    username: 'editor.one',
    displayName: 'Editor One',
    role: 'editor',
    password: 'secret123'
  });
  const viewer = AuthService.createUser(adminSession, {
    username: 'viewer.two',
    displayName: 'Viewer Two',
    role: 'viewer',
    password: 'secret123'
  });
  const secondAdmin = AuthService.createUser(adminSession, {
    username: 'admin.two',
    displayName: 'Admin Two',
    role: 'admin',
    password: 'secret123'
  });

  assert.equal(editor.role, 'editor');
  assert.equal(viewer.role, 'viewer');
  assert.equal(secondAdmin.role, 'admin');

  assert.equal(AuthService.can({ role: 'admin' }, 'canManageUsers'), true);
  assert.equal(AuthService.can({ role: 'editor' }, 'canApplyProjectPatch'), true);
  assert.equal(AuthService.can({ role: 'editor' }, 'canManageUsers'), false);
  assert.equal(AuthService.can({ role: 'viewer' }, 'canViewProject'), true);
  assert.equal(AuthService.can({ role: 'viewer' }, 'canApplyProjectPatch'), false);

  const viewerLogin = AuthService.login('viewer.two', 'secret123');
  assert.ok(AuthService.getSession(viewerLogin.token));
  AuthService.updateUser(adminSession, 'viewer.two', { status: 'disabled' });
  assert.equal(AuthService.getSession(viewerLogin.token), null);

  AuthService.deleteUser(adminSession, 'admin.two');
  assert.throws(() => AuthService.updateUser(adminSession, 'admin', { status: 'disabled' }), /At least one active admin/);
  assert.throws(() => AuthService.deleteUser(adminSession, 'admin'), /You cannot delete your own account/);
});
