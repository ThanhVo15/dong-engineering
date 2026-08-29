var AppConfig = (function () {
  'use strict';

  var DEFAULT_ENV = 'sandbox_dropbox';

  function props() {
    if (typeof PropertiesService === 'undefined') return {};
    return PropertiesService.getScriptProperties().getProperties();
  }

  function value(map, names, fallback) {
    for (var i = 0; i < names.length; i++) {
      if (map[names[i]]) return map[names[i]];
    }
    return fallback || '';
  }

  function normalizePath(path) {
    path = String(path || '').replace(/\\/g, '/').trim();
    var desktop = path.match(/^[A-Za-z]:\/.*\/Dropbox\/(.+)$/i);
    if (desktop) path = '/' + desktop[1];
    if (!path) return '';
    if (path === '/') return '';
    if (path.charAt(0) !== '/') path = '/' + path;
    return path.replace(/\/+/g, '/').replace(/\/$/, '');
  }

  function current() {
    var p = props();
    var env = value(p, ['DONG_ENVIRONMENT'], DEFAULT_ENV);
    if (env === 'sandbox') env = 'sandbox_dropbox';
    if (env === 'production') env = 'production_dropbox';
    var prefix = env === 'production_dropbox' ? 'PROD' : 'SANDBOX';
    var root = normalizePath(value(p, [prefix + '_DROPBOX_ROOT', prefix + '_DONG_DROPBOX_ROOT_PATH', 'DROPBOX_ROOT'], '/Dong Engineering Sandbox'));
    var syncMaxJobsPerRun = Number(value(p, [prefix + '_SYNC_MAX_JOBS_PER_RUN', 'SYNC_MAX_JOBS_PER_RUN'], '0')) || 0;
    return {
      environment: env,
      syncMaxJobsPerRun: syncMaxJobsPerRun,
      dropbox: {
        appKey: value(p, [prefix + '_DROPBOX_APP_KEY', 'DROPBOX_APP_KEY']),
        appSecret: value(p, [prefix + '_DROPBOX_APP_SECRET', 'DROPBOX_APP_SECRET']),
        refreshToken: value(p, [prefix + '_DROPBOX_REFRESH_TOKEN', 'DROPBOX_REFRESH_TOKEN']),
        connectedAt: value(p, [prefix + '_DROPBOX_CONNECTED_AT']),
        accountId: value(p, [prefix + '_DROPBOX_ACCOUNT_ID']),
        accountName: value(p, [prefix + '_DROPBOX_ACCOUNT_NAME']),
        rootPath: root,
        pPath: normalizePath(value(p, [prefix + '_DONG_P_CHRONOS_PATH', prefix + '_P_DROPBOX_PATH'], root + '/Chronos/P_Chronos')),
        ac2Path: normalizePath(value(p, [prefix + '_DONG_AC2_PATH', prefix + '_AC2_DROPBOX_PATH'], root + '/AC2')),
        tPath: normalizePath(value(p, [prefix + '_DONG_T_CHRONOS_PATH', prefix + '_T_DROPBOX_PATH'], root + '/Chronos/T_Chronos')),
        dbPath: normalizePath(value(p, [prefix + '_DONG_DB_PATH', prefix + '_DB_DROPBOX_PATH'], root + '/__db__'))
      },
      autoSyncEnabled: value(p, ['AUTO_SYNC_ENABLED'], 'false') === 'true'
    };
  }

  return {
    current: current,
    normalizePath: normalizePath
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppConfig;
