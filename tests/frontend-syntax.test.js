const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function scriptBody(path) {
  const html = fs.readFileSync(path, 'utf8');
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, `${path} has a script tag`);
  return match[1];
}

test('frontend client script parses as browser JavaScript', () => {
  new vm.Script(scriptBody('src/frontend/Client.js.html'), { filename: 'Client.js.html' });
});

test('frontend search helper parses as browser JavaScript', () => {
  new vm.Script(scriptBody('src/frontend/SearchClient.html'), { filename: 'SearchClient.html' });
});

test('search helper keeps duplicate job numbers routable by projectId', () => {
  const context = { globalThis: {} };
  context.window = context;
  vm.createContext(context);
  new vm.Script(scriptBody('src/frontend/SearchClient.html'), { filename: 'SearchClient.html' }).runInContext(context);
  const records = context.DongSearch.prepareIndex([
    { projectId: '250400@@old', jobNo: '250400', status: 'US ASSIGNED', modified: '2025-07-28T17:03:09Z' },
    { projectId: '250400@@new', jobNo: '250400', status: 'COMPLETED', modified: '2026-08-09T17:10:01Z' }
  ]);
  assert.equal(context.DongSearch.findExactJob(records, '250400@@old').projectId, '250400@@old');
  assert.equal(context.DongSearch.findExactJob(records, '250400').projectId, '250400@@new');
});

test('frontend templates include styles and client partials', () => {
  const index = fs.readFileSync('src/frontend/Index.html', 'utf8');
  assert.match(index, /include\('src\/frontend\/Styles'\)/);
  assert.match(index, /include\('src\/frontend\/SearchClient'\)/);
  assert.match(index, /include\('src\/frontend\/Client\.js'\)/);
});

test('frontend index keeps the old Project Management shell mounts', () => {
  const index = fs.readFileSync('src/frontend/Index.html', 'utf8');
  for (const id of ['summaryBar', 'detailsMount', 'notesMount', 'codeMount', 'timeMount', 'adminPanel', 'editFooterMount']) {
    assert.match(index, new RegExp(`id="${id}"`), id);
  }
  assert.match(index, /brand-title/);
  assert.match(index, /Project Management/);
});

test('restored old client keeps Details and Admin account/config views', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /id="detailsBtn"/);
  assert.match(client, /ADMIN_TAB_DEFS/);
  assert.match(client, /\['users', 'Users'\]/);
  assert.match(client, /\['connection',\s*'Dropbox Connection'\]/);
  assert.match(client, /\['folders',\s*'Folder Setup'\]/);
  assert.match(client, /\['log',\s*'Log'\]/);
  assert.doesNotMatch(client, /\['audit',\s*'Audit'\]/);
  assert.match(client, /function renderUsersPanel/);
  assert.match(client, /function renderSyncLogPanel/);
  assert.match(client, /apiGetSyncIssueLog/);
  assert.match(client, /apiListUsers/);
  assert.match(client, /apiCreateUser/);
  assert.match(client, /apiGetDropboxConfigMasked/);
  assert.match(client, /apiTestDropboxConnection/);
});

test('admin log tab renders skipped sync file paths and reasons only', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const styles = fs.readFileSync('src/frontend/Styles.html', 'utf8');
  assert.match(client, /<th>File path<\/th><th>Reason<\/th>/);
  assert.match(client, /syncIssueLog/);
  assert.match(client, /id="refreshSyncLog"/);
  assert.match(styles, /\.sync-log-table/);
});

test('project count badge is based on loaded records, not cache meta fallback', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /loadedProjectsCount'\)\.textContent\s*=\s*formatCount\(projectCount\)/);
  assert.match(client, /var projectCount = Number\(S\.jobs && S\.jobs\.length \|\| 0\)/);
  assert.doesNotMatch(client, /loadedProjectsCount'\)\.textContent\s*=\s*projectCount\.toLocaleString/);
  assert.match(client, /renderEmptyState\('publishing'\)/);
});

test('sync status shows full rebuild publish progress separately from incremental sync', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /Publishing: /);
  assert.match(client, /Uploaded jobs/);
  assert.match(client, /Pending projects/);
  assert.match(client, /Last completed full rebuild/);
  assert.match(client, /Last incremental sync/);
  assert.match(client, /Full rebuild cache is still publishing/);
  assert.match(client, /formatCount\(uploadedJobs\)/);
});

test('frontend can show a partial project index while full cache publish continues', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /partialCache:\s*data\.partialCache === true/);
  assert.match(client, /data\.cachePublishing \|\| data\.partialCache/);
  assert.match(client, /Showing partial cache/);
  assert.match(client, /S\.indexMeta && S\.indexMeta\.cachePublishing/);
});

test('frontend only allows editing status, end due, and project notes', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const editableProject = client.match(/function editableProjectField\(field\) \{([\s\S]*?)\n  \}/);
  assert.ok(editableProject, 'editableProjectField exists');
  const editableProjectBody = editableProject[1];
  assert.match(editableProjectBody, /P5_notes:\s*true/);
  assert.match(editableProjectBody, /P6_status:\s*true/);
  assert.match(editableProjectBody, /P11_endDate:\s*true/);
  for (const field of ['P3_jobName', 'P4_location', 'P7_estimate', 'P8_architect', 'P9_customer', 'P10_startDate', 'P12_type', 'P13_assignee']) {
    assert.doesNotMatch(editableProjectBody, new RegExp(`${field}:\\s*true`), field);
  }
  assert.match(client, /function editableCodeField\(field\)\s*{\s*return false;\s*}/);
  const renderCodeTable = client.match(/function renderCodeTable\(rows, selectedCode\) \{([\s\S]*?)\n  \}\n\n  function bindCodeClicks/);
  assert.ok(renderCodeTable, 'renderCodeTable exists');
  assert.match(renderCodeTable[1], /var descriptionEditable = editable && editableCodeField\('description'\);/);
  assert.doesNotMatch(client, /\(editable \? '<textarea rows="3" data-code-edit=/);
});

test('project detail view hides implementation metadata from users', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.doesNotMatch(client, /readonlyEditField\('Template'/);
  assert.doesNotMatch(client, /readonlyEditField\('File'/);
  assert.doesNotMatch(client, /readonlyEditField\('Path \/ Rev'/);
  assert.doesNotMatch(client, /renderLastModifiedBlock\(\) \+/);
});

test('time spent colors increase risk as percent passes plan', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const styles = fs.readFileSync('src/frontend/Styles.html', 'utf8');
  assert.match(client, /pct > 100 \? 'over' : pct >= 85 \? 'high' : pct >= 50 \? 'mid' : 'low'/);
  assert.match(client, /n > 100 \? 's-red' : n >= 85 \? 's-orange' : 's-green'/);
  assert.match(styles, /\.time-spent-bar\.low \.time-meter span \{ background: var\(--success\); \}/);
  assert.match(styles, /\.time-spent-bar\.over \.time-meter span, \.time-spent-bar\.no-plan \.time-meter span \{ background: var\(--danger\); \}/);
});

test('password fields have show hide controls and reset password avoids browser prompt', () => {
  const index = fs.readFileSync('src/frontend/Index.html', 'utf8');
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const styles = fs.readFileSync('src/frontend/Styles.html', 'utf8');
  assert.match(index, /data-password-toggle="loginPass"/);
  assert.match(client, /function passwordInputHtml\(id, attrs\)/);
  assert.match(client, /function bindPasswordToggles\(root\)/);
  for (const id of [
    'adminPass',
    'profileCurrentPassword',
    'profileNewPassword',
    'profileConfirmPassword',
    'newUserPassword',
    'resetUserPasswordInput',
    'currentAdminPassword',
    'newAdminPassword',
    'confirmAdminPassword',
    'dbxSecret',
    'dbxRefresh'
  ]) {
    assert.match(client, new RegExp(`passwordInputHtml\\('${id}'`), id);
  }
  assert.doesNotMatch(client, /window\.prompt\('Enter a new temporary password/);
  assert.match(styles, /\.password-control/);
  assert.match(styles, /\.password-toggle/);
});

test('frontend header labels completed sync time as Auto Sync checked instead of stale Cache wording', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /'Auto Sync checked: '/);
  assert.match(client, /'Auto Sync stale: '/);
  assert.match(client, /'Updated: '/);
  assert.match(client, /lastCheckedAt/);
  assert.match(client, /function staleSyncIso\(iso\)/);
  assert.match(client, /var STALE_SYNC_MS = 15 \* 60 \* 1000/);
  assert.doesNotMatch(client, /'Cache: ' \+ formatRefresh\(syncRefresh\)/);
});

test('responsive header and mobile P14 cards stay compact on phone and tablet', () => {
  const index = fs.readFileSync('src/frontend/Index.html', 'utf8');
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  const styles = fs.readFileSync('src/frontend/Styles.html', 'utf8');
  assert.doesNotMatch(index, /id="themeBtn"/);
  assert.doesNotMatch(styles, /html\[data-theme="dark"\]/);
  assert.doesNotMatch(client, /prefers-color-scheme/);
  assert.match(client, /document\.documentElement\.setAttribute\('data-theme', 'light'\)/);
  assert.match(styles, /\.header-right \{[^}]*flex-wrap: wrap;/);
  assert.match(styles, /\.last-refresh \{[^}]*white-space: normal;[^}]*overflow: visible;[^}]*text-overflow: clip;/);
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.mode-badge \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 1024px\) \{[\s\S]*?\.last-refresh \{[^}]*flex-basis: 100%;[^}]*max-width: none;/);
  assert.match(styles, /@media \(max-width: 767px\) \{[\s\S]*?\.header-right \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto;/);
  assert.match(styles, /#lastRefreshText \{ grid-column: 1 \/ -1;[\s\S]*?white-space: normal;[\s\S]*?max-width: none;/);
  assert.match(styles, /#configBtn \{ grid-column: 2 \/ 3;[\s\S]*?width: auto;[\s\S]*?min-width: 68px;/);
  assert.match(styles, /#logoutBtn \{ grid-column: 3 \/ 4;[\s\S]*?width: auto;[\s\S]*?min-width: 68px;/);
  assert.match(styles, /\.mobile-code-grid label:first-child \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 420px\) \{[\s\S]*?\.mobile-code-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(styles, /#logoutBtn \{[^}]*width: 100%;/);
});

test('frontend P14 client compute preserves decimal timesheet hours', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /function pad3\(n\)\s*{\s*var s = String\(round2\(Number\(n\) \|\| 0\)\)/);
  assert.doesNotMatch(client, /function pad3\(n\)\s*{\s*var s = String\(Math\.round\(Number\(n\) \|\| 0\)\)/);
});

test('project refresh badge reloads index after sync, including idle final status and unclear sync responses', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /var readyState = terminalSuccess \|\| state === 'idle'/);
  assert.match(client, /var canRefreshIndex = !backgroundRefreshBlocked\(\)/);
  assert.match(client, /canRefreshIndex && readyState && token/);
  assert.match(client, /refreshVisibleProjectIfSafe\('manual-sync'\)/);
  assert.match(client, /refreshVisibleProjectIfSafe\('poll'\)/);
  assert.match(client, /return loadIndex\(false\)/);
  assert.match(client, /function shouldRevalidateIndex\(cached, autoOpen, options\)/);
  assert.match(client, /var INDEX_REVALIDATE_TTL_MS = STATUS_POLL_IDLE_MS/);
  assert.match(client, /Date\.now\(\) - at >= INDEX_REVALIDATE_TTL_MS/);
  assert.match(client, /return finishIndexFromCache\(\)/);
  assert.match(client, /loadIndex\(false, \{ force: true \}\)\.then\(function \(\) \{ return refreshVisibleProjectIfSafe\('poll-no-token'\); \}\)/);
  assert.match(client, /Sync response failed · refreshing project list/);
  assert.match(client, /Project list refreshed\. Sync response was unclear/);
  assert.match(client, /return gas\('apiGetProjectIndex'/);
});

test('frontend sync status polling is throttled to protect Apps Script UrlFetch quota', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /var STATUS_POLL_IDLE_MS = 5 \* 60 \* 1000/);
  assert.match(client, /var STATUS_POLL_ACTIVE_MS = STATUS_POLL_IDLE_MS/);
  assert.match(client, /var STATUS_POLL_MANUAL_MS = 60 \* 1000/);
  assert.match(client, /var SYNC_WAIT_PUBLISH_MS = 15 \* 1000/);
  assert.match(client, /var SYNC_CONTINUE_MS = 60 \* 1000/);
  assert.match(client, /var INDEX_REVALIDATE_TTL_MS = STATUS_POLL_IDLE_MS/);
  assert.match(client, /function syncHasMorePending\(payload\)/);
  assert.match(client, /syncHasMorePending\(d\) && attempt < 40/);
  assert.match(client, /resolve\(runSyncCommand\(apiName, nextText, successText, attempt \+ 1\)\)/);
  assert.match(client, /setTimeout\(function \(\) \{ resolve\(runSyncCommand\(apiName, nextText, successText, attempt \+ 1\)\); \}, SYNC_CONTINUE_MS\)/);
  assert.match(client, /function statusPollDelay\(state\)/);
  assert.match(client, /setTimeout\(pollPublicStatus, Number\(delayMs \|\| statusPollDelay\(state\)\)\)/);
  assert.match(client, /setTimeout\(pollPublicStatus, statusPollDelay\(S\.lastPublicSyncState\)\)/);
  assert.match(client, /attempt >= 12/);
  assert.match(client, /setTimeout\(function \(\) \{ resolve\(waitForSyncPublish\(beforeToken, attempt \+ 1\)\); \}, SYNC_WAIT_PUBLISH_MS\)/);
  assert.doesNotMatch(client, /setTimeout\(pollPublicStatus, 15000\)/);
  assert.doesNotMatch(client, /waitForSyncPublish\(beforeToken, attempt \+ 1\)\); \}, 1000\)/);
  assert.doesNotMatch(client, /waitForSyncPublish\(beforeToken, attempt \+ 1\)\); \}, 5000\)/);
});

test('save flow updates UI immediately and refreshes only the affected project cache', () => {
  const client = fs.readFileSync('src/frontend/Client.js.html', 'utf8');
  assert.match(client, /apiRefreshProjectCache/);
  assert.match(client, /projectId:\s*currentProjectKey\(\)/);
  assert.match(client, /recordKey\(item\)/);
  assert.match(client, /openJob\(recordKey\(match\)\)/);
  assert.match(client, /detailCacheKey\(payload\.projectId \|\| payload\.jobNo\)/);
  assert.match(client, /Saved to Dropbox\. Updating this project cache/);
  assert.match(client, /Project cache updated/);
  assert.match(client, /Cache refresh will retry in background/);
  assert.match(client, /function backgroundRefreshBlocked\(\)/);
  assert.match(client, /refreshed && refreshed\.detail && !backgroundRefreshBlocked\(\)/);
  assert.doesNotMatch(client, /Saved to Dropbox\. Project index update is pending\.'\), 'success'\);\s*if \(data && data\.syncRequested\) {\s*gas\('apiRequestProjectIndexSync'/);
});
