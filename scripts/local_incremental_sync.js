#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FullRebuildService = require('../src/backend/FullRebuildService');
const SourceService = require('../src/backend/SourceService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const parts = trimmed.split('=');
    const key = parts.shift().trim();
    env[key] = parts.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function normalizeDropboxPath(value) {
  let p = String(value || '').replace(/\\/g, '/').trim();
  if (!p) return '';
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+/g, '/').replace(/\/$/, '');
}

function configFromEnv(env) {
  const prefix = env.DONG_ENVIRONMENT === 'production_dropbox' ? 'PROD' : 'SANDBOX';
  const root = normalizeDropboxPath(
    env[prefix + '_DROPBOX_ROOT'] ||
    env[prefix + '_DONG_DROPBOX_ROOT_PATH'] ||
    env.DROPBOX_ROOT ||
    '/@ Job Information/LinkAJ'
  );
  return {
    environment: env.DONG_ENVIRONMENT || 'sandbox_dropbox',
    dropbox: {
      appKey: env[prefix + '_DROPBOX_APP_KEY'] || env.DROPBOX_APP_KEY || '',
      appSecret: env[prefix + '_DROPBOX_APP_SECRET'] || env.DROPBOX_APP_SECRET || '',
      refreshToken: env[prefix + '_DROPBOX_REFRESH_TOKEN'] || env.DROPBOX_REFRESH_TOKEN || '',
      rootPath: root,
      pPath: normalizeDropboxPath(env[prefix + '_DONG_P_CHRONOS_PATH'] || env[prefix + '_P_DROPBOX_PATH'] || root + '/Chronos/P_Chronos'),
      ac2Path: normalizeDropboxPath(env[prefix + '_DONG_AC2_PATH'] || env[prefix + '_AC2_DROPBOX_PATH'] || root + '/AC2'),
      tPath: normalizeDropboxPath(env[prefix + '_DONG_T_CHRONOS_PATH'] || env[prefix + '_T_DROPBOX_PATH'] || root + '/Chronos/T_Chronos'),
      dbPath: normalizeDropboxPath(env[prefix + '_DONG_DB_PATH'] || env[prefix + '_DB_DROPBOX_PATH'] || root + '/__db__')
    }
  };
}

function basename(value) {
  return String(value || '').replace(/\\/g, '/').split('/').pop();
}

function join(base, child) {
  return String(base || '').replace(/\/+$/, '') + '/' + String(child || '').replace(/^\/+/, '');
}

function normalizePathKey(value) {
  return String(value || '').replace(/\\/g, '/').toLowerCase();
}

function changedPathKeys(changes) {
  const keys = {};
  for (const entry of changes || []) {
    const p = entry && (entry.path_display || entry.path_lower);
    if (p) keys[normalizePathKey(p)] = true;
  }
  return keys;
}

function detailTouchesChangedPath(detail, keys) {
  const refs = detail && detail.sourceRefs || {};
  const has = (ref) => ref && ref.path && keys[normalizePathKey(ref.path)];
  if (has(refs.project)) return true;
  for (const ref of refs.ac2 || []) if (has(ref)) return true;
  for (const ref of refs.times || []) if (has(ref)) return true;
  return false;
}

function changesIncludeKind(changes, config, kind) {
  for (const entry of changes || []) {
    const p = entry && (entry.path_display || entry.path_lower || '');
    if (SourceService.classifyPath(p, config) === kind) return true;
  }
  return false;
}

function sourceRefsFromDetail(detail) {
  const refs = [];
  const sourceRefs = detail && detail.sourceRefs || {};
  const push = (kind, ref) => {
    if (!ref || !ref.path) return;
    refs.push({ kind, path: ref.path, filename: ref.filename || basename(ref.path), rev: ref.rev || '', modified: ref.modified || '' });
  };
  push('P', sourceRefs.project);
  for (const ref of sourceRefs.ac2 || []) push('AC2', ref);
  for (const ref of sourceRefs.times || []) push('T', ref);
  return refs;
}

function projectRefFromIndex(row) {
  row = row || {};
  if (!row.pPath) return null;
  return {
    kind: 'P',
    path: row.pPath,
    filename: row.pFilename || basename(row.pPath),
    rev: row.rev || '',
    modified: row.modified || '',
    jobNo: row.jobNo || ''
  };
}

function refFromPIndex(row, jobNo) {
  row = row || {};
  if (!row.path) return null;
  return {
    kind: 'P',
    projectId: row.projectId || '',
    jobNo: row.jobNo || String(jobNo || ''),
    path: row.path || '',
    filename: row.filename || basename(row.path || ''),
    rev: row.rev || '',
    modified: row.modified || ''
  };
}

function excludedPathSet(paths) {
  const out = new Set();
  for (const p of paths || []) if (p) out.add(normalizePathKey(p));
  return out;
}

async function lookupPRefs(dbx, config, pIndex, jobNo, options) {
  options = options || {};
  const excluded = excludedPathSet(options.excludePaths || []);
  const seen = new Set();
  const refs = [];
  const pushRef = (ref) => {
    if (!ref || !ref.path) return;
    const key = normalizePathKey(ref.path);
    if (excluded.has(key) || seen.has(key)) return;
    if (!SourceService.sourceJobMatches(ref.path, config, jobNo)) return;
    seen.add(key);
    refs.push(ref);
  };
  for (const row of (pIndex && pIndex[String(jobNo)] || [])) pushRef(refFromPIndex(row, jobNo));
  if ((!refs.length || options.search === true) && dbx.searchFiles) {
    const found = await dbx.searchFiles(config.dropbox.pPath, String(jobNo), 20);
    for (const entry of found || []) pushRef(refFromPMetadata(entry, jobNo, config));
  }
  return refs;
}

function refFromPMetadata(entry, jobNo, config) {
  const p = entry && (entry.path_display || entry.path_lower || '');
  if (!p || !SourceService.sourceJobMatches(p, config, jobNo)) return null;
  return {
    kind: 'P',
    path: p,
    filename: entry.name || basename(p),
    rev: entry.rev || '',
    modified: entry.server_modified || entry.client_modified || '',
    jobNo: String(jobNo)
  };
}

function syntheticDetailFromPRef(jobNo, ref) {
  return {
    projectId: ref.projectId || '',
    jobNo: String(jobNo || ''),
    ac2: [],
    times: [],
    sourceRefs: { project: ref, ac2: [], times: [] }
  };
}

function cloneDetailWithProjectRef(detail, ref, jobNo) {
  const out = { ...(detail || {}) };
  const refs = detail && detail.sourceRefs || {};
  out.projectId = out.projectId || ref.projectId || '';
  out.jobNo = out.jobNo || String(jobNo || ref.jobNo || '');
  out.sourceRefs = {
    project: ref,
    ac2: [...(refs.ac2 || [])],
    times: [...(refs.times || [])]
  };
  return out;
}

async function replacementDetailsForMissingProjectRef(dbx, config, pIndex, jobNo, detail, missingPath) {
  const refs = await lookupPRefs(dbx, config, pIndex, jobNo, { excludePaths: [missingPath], search: true });
  return refs.map((ref) => cloneDetailWithProjectRef(detail || syntheticDetailFromPRef(jobNo, ref), ref, jobNo));
}

function rowRefs(rows, kind) {
  const out = [];
  for (const row of rows || []) {
    if (!row || !row.path) continue;
    out.push({
      kind,
      path: row.path,
      filename: row.filename || basename(row.path),
      rev: row.rev || '',
      modified: row.modified || '',
      jobNo: row.jobNo || '',
      code: row.code || ''
    });
  }
  return out;
}

function withIndexProjectRef(detail, projectId, row) {
  const pRef = projectRefFromIndex(row);
  if (!detail || !pRef) return detail;
  detail.projectId = detail.projectId || projectId;
  detail.jobNo = detail.jobNo || row.jobNo || '';
  detail.sourceRefs = detail.sourceRefs || {};
  detail.sourceRefs.project = detail.sourceRefs.project && detail.sourceRefs.project.path ? detail.sourceRefs.project : pRef;
  if (!detail.sourceRefs.ac2) detail.sourceRefs.ac2 = rowRefs(detail.ac2, 'AC2');
  if (!detail.sourceRefs.times) detail.sourceRefs.times = rowRefs(detail.times, 'T');
  return detail;
}

function refFromChangedEntry(entry, config) {
  const p = entry && (entry.path_display || entry.path_lower || '');
  if (!p) return null;
  const kind = SourceService.classifyPath(p, config);
  if (!kind) return null;
  return {
    kind,
    path: p,
    filename: entry.name || basename(p),
    rev: entry.rev || '',
    modified: entry.server_modified || entry.client_modified || ''
  };
}

function ac2CodeFromFilename(ref) {
  const name = ref && (ref.filename || basename(ref.path)) || '';
  const parts = String(name).replace(/\.txt$/i, '').split('~');
  return parts[1] || '';
}

function isCanonicalAC2Ref(ref, jobNo) {
  const filename = String(ref && (ref.filename || basename(ref.path)) || '');
  return filename.startsWith(String(jobNo || '') + '~');
}

function dedupeMergedRefs(refs, jobNo) {
  const byKey = {};
  const order = [];
  for (const ref of refs || []) {
    let key = normalizePathKey(ref && ref.path || String(order.length));
    if (ref && ref.kind === 'AC2') {
      const code = ac2CodeFromFilename(ref);
      if (code) key = 'AC2::' + code;
    }
    if (!Object.prototype.hasOwnProperty.call(byKey, key)) {
      order.push(key);
      byKey[key] = ref;
      continue;
    }
    if (ref && ref.kind === 'AC2' && isCanonicalAC2Ref(ref, jobNo) && !isCanonicalAC2Ref(byKey[key], jobNo)) byKey[key] = ref;
  }
  return order.map((key) => byKey[key]);
}

function mergeRefsWithChanges(refs, changes, config, jobNo) {
  const byPath = {};
  for (const ref of refs || []) if (ref && ref.path) byPath[normalizePathKey(ref.path)] = ref;
  for (const entry of changes || []) {
    const p = entry && (entry.path_display || entry.path_lower || '');
    if (!p || !SourceService.sourceJobMatches(p, config, jobNo)) continue;
    const key = normalizePathKey(p);
    if (entry['.tag'] === 'deleted') {
      delete byPath[key];
      continue;
    }
    if (entry['.tag'] && entry['.tag'] !== 'file') continue;
    if (!/\.txt$/i.test(entry.name || basename(p))) continue;
    const ref = refFromChangedEntry(entry, config);
    if (ref) byPath[key] = ref;
  }
  return dedupeMergedRefs(Object.values(byPath), jobNo).sort((a, b) => {
    const order = { P: 0, AC2: 1, T: 2 };
    const ak = order[a.kind] == null ? 9 : order[a.kind];
    const bk = order[b.kind] == null ? 9 : order[b.kind];
    return ak === bk ? String(a.path || '').localeCompare(String(b.path || '')) : ak - bk;
  });
}

function changeDeletesProjectRef(detail, changes) {
  const projectPath = detail && detail.sourceRefs && detail.sourceRefs.project && detail.sourceRefs.project.path;
  if (!projectPath) return false;
  const key = normalizePathKey(projectPath);
  return (changes || []).some((entry) => entry && entry['.tag'] === 'deleted' && normalizePathKey(entry.path_display || entry.path_lower || '') === key);
}

function preserveExistingProjectId(cache, projectId) {
  const keys = Object.keys(cache.projects || {});
  if (keys.length !== 1 || keys[0] === projectId) return cache;
  const oldKey = keys[0];
  cache.projects[projectId] = cache.projects[oldKey];
  cache.projects[projectId].projectId = projectId;
  delete cache.projects[oldKey];
  if (cache.jobs[oldKey]) {
    cache.jobs[projectId] = cache.jobs[oldKey];
    cache.jobs[projectId].projectId = projectId;
    delete cache.jobs[oldKey];
  }
  return cache;
}

async function request(url, options) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const res = await fetch(url, options || {});
      const body = Buffer.from(await res.arrayBuffer());
      if ((res.status === 429 || res.status >= 500) && attempt < 7) {
        const retryAfter = Number(res.headers.get('retry-after') || 0);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 1000 * Math.pow(2, attempt));
        console.warn('[retry] HTTP ' + res.status + ', wait ' + Math.round(waitMs / 1000) + 's');
        await sleep(waitMs);
        continue;
      }
      if (res.status < 200 || res.status >= 300) {
        const err = new Error('Dropbox HTTP ' + res.status + ': ' + body.toString('utf8').slice(0, 300));
        err.status = res.status;
        err.body = body.toString('utf8');
        if (/not_found/i.test(err.body)) err.code = 'NOT_FOUND';
        throw err;
      }
      return { body, headers: res.headers };
    } catch (err) {
      lastError = err;
      if (err.status && err.status < 500 && err.status !== 429) throw err;
      if (attempt >= 7) break;
      const waitMs = Math.min(60000, 1000 * Math.pow(2, attempt));
      console.warn('[retry] network error, wait ' + Math.round(waitMs / 1000) + 's: ' + (err.message || err));
      await sleep(waitMs);
    }
  }
  throw lastError || new Error('Dropbox request failed');
}

class Dropbox {
  constructor(config) {
    this.config = config;
    this.token = '';
  }

  async accessToken() {
    if (this.token) return this.token;
    const d = this.config.dropbox;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: d.refreshToken,
      client_id: d.appKey,
      client_secret: d.appSecret
    });
    const res = await request('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    this.token = JSON.parse(res.body.toString('utf8')).access_token || '';
    if (!this.token) throw new Error('Dropbox access token refresh failed.');
    return this.token;
  }

  async rpc(endpoint, payload) {
    const res = await request('https://api.dropboxapi.com/2/' + endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await this.accessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    return JSON.parse(res.body.toString('utf8') || '{}');
  }

  async downloadBytes(filePath) {
    try {
      const res = await request('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + await this.accessToken(), 'Dropbox-API-Arg': JSON.stringify({ path: filePath }) }
      });
      return res.body;
    } catch (err) {
      err.path = filePath;
      throw err;
    }
  }

  async downloadText(filePath) {
    return (await this.downloadBytes(filePath)).toString('utf8');
  }

  async downloadJson(filePath, fallback) {
    try {
      return JSON.parse(await this.downloadText(filePath));
    } catch (err) {
      if (err.code === 'NOT_FOUND') return fallback;
      throw err;
    }
  }

  async uploadJson(filePath, value) {
    const res = await request('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + await this.accessToken(),
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: filePath,
          mode: { '.tag': 'overwrite' },
          autorename: false,
          mute: true,
          strict_conflict: false
        })
      },
      body: JSON.stringify(value || {}, null, 2) + '\n'
    });
    return JSON.parse(res.body.toString('utf8') || '{}');
  }

  async deletePath(filePath) {
    try {
      return await this.rpc('files/delete_v2', { path: filePath });
    } catch (err) {
      if (err.code === 'NOT_FOUND') return {};
      throw err;
    }
  }

  async searchFiles(folder, query, limit) {
    const res = await this.rpc('files/search_v2', {
      query: String(query || ''),
      options: {
        path: folder || '',
        max_results: Number(limit || 20),
        filename_only: true,
        file_status: 'active'
      }
    });
    const out = [];
    for (const match of res.matches || []) {
      const metadata = match && match.metadata && (match.metadata.metadata || match.metadata);
      if (metadata && metadata['.tag'] === 'file') out.push(metadata);
    }
    return out;
  }
}

function pIndexHitCount(pIndex, jobNo) {
  const rows = pIndex && pIndex[String(jobNo)] || [];
  return rows && rows.length || 0;
}

function projectHitCount(projects, jobNo) {
  let count = 0;
  for (const row of Object.values(projects || {})) {
    if (String(row && row.jobNo || '') === String(jobNo)) count += 1;
  }
  return count;
}

async function searchPRefCount(dbx, config, jobNo, context) {
  if (!dbx || !dbx.searchFiles) return 0;
  context.pSearchCache = context.pSearchCache || {};
  if (Object.prototype.hasOwnProperty.call(context.pSearchCache, jobNo)) return context.pSearchCache[jobNo];
  let count = 0;
  try {
    const found = await dbx.searchFiles(config.dropbox.pPath, String(jobNo), 20);
    count = found.filter((entry) => refFromPMetadata(entry, jobNo, config)).length;
  } catch (_) {
    count = 0;
  }
  context.pSearchCache[jobNo] = count;
  return count;
}

function projectLikeJobNo(jobNo) {
  return String(jobNo || '').length >= 5;
}

function shouldSearchAmbiguousCandidates(info) {
  if (!info || !info.filenameJobNo || !info.packedJobNo || info.filenameJobNo === info.packedJobNo) return false;
  return projectLikeJobNo(info.filenameJobNo) && projectLikeJobNo(info.packedJobNo);
}

function changePath(entry) {
  return entry && (entry.path_display || entry.path_lower || entry.name || '') || '';
}

function issueKey(row) {
  return [row && row.path || '', row && row.reason || '', row && row.jobNo || ''].join('|');
}

function appendIssueRows(issueLog, rows) {
  const out = (issueLog || []).slice(-200);
  const seen = new Set(out.map(issueKey));
  for (const row of rows || []) {
    if (!row || (!row.path && !row.reason)) continue;
    const next = {
      path: row.path || '',
      reason: row.reason || row.message || '',
      jobNo: row.jobNo || '',
      firstSeenAt: row.firstSeenAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    const key = issueKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(next);
  }
  return out.slice(-200);
}

function issueRowsForSkippedJob(jobNo, changes, reason, paths) {
  const rows = [];
  const seen = new Set();
  for (const p of paths || []) {
    if (!p || seen.has(normalizePathKey(p))) continue;
    seen.add(normalizePathKey(p));
    rows.push({ jobNo, path: p, reason: reason || 'Skipped during incremental sync.' });
  }
  for (const entry of changes || []) {
    const p = changePath(entry);
    if (p && seen.has(normalizePathKey(p))) continue;
    if (p) seen.add(normalizePathKey(p));
    rows.push({ jobNo, path: p, reason: reason || 'Skipped during incremental sync.' });
  }
  return rows.length ? rows : [{ jobNo, path: '', reason: reason || 'Skipped during incremental sync.' }];
}

function pruneIssueRows(issueLog, jobNo, changes) {
  const paths = {};
  for (const entry of changes || []) {
    const p = changePath(entry);
    if (p) paths[normalizePathKey(p)] = true;
  }
  return (issueLog || []).filter((row) => {
    const sameJob = jobNo && String(row.jobNo || '') === String(jobNo);
    const samePath = row.path && paths[normalizePathKey(row.path)];
    return !(sameJob || samePath);
  });
}

async function resolveJobForChange(entry, config, context) {
  const p = entry.path_display || entry.path_lower || entry.name || '';
  const info = SourceService.jobInfoFromPath
    ? SourceService.jobInfoFromPath(p, config)
    : { kind: SourceService.classifyPath(p, config), jobNo: SourceService.resolveJobNoFromPath(p, config), candidates: [] };
  if (!info.kind || !info.jobNo) return '';
  if (info.kind !== 'AC2' || (info.candidates || []).length <= 1) return info.jobNo;
  const scored = [];
  let evidenceTotal = 0;
  let chosen = '';
  let chosenEvidence = 0;
  for (const candidate of info.candidates || []) {
    const jobNo = String(candidate.jobNo || '');
    const pIndexHits = pIndexHitCount(context.pIndex || {}, jobNo);
    const projectHits = projectHitCount(context.projects || {}, jobNo);
    const evidence = pIndexHits + projectHits;
    evidenceTotal += evidence;
    scored.push({ jobNo, role: candidate.role || '', pIndexHits, projectHits, searchHits: 0, evidence });
    if (evidence > chosenEvidence) {
      chosen = jobNo;
      chosenEvidence = evidence;
    }
  }
  if (!chosen && evidenceTotal === 0 && shouldSearchAmbiguousCandidates(info)) {
    let searchWinner = '';
    let searchWinners = 0;
    for (const row of scored) {
      row.searchHits = await searchPRefCount(context.dbx, config, row.jobNo, context);
      if (row.searchHits > 0) {
        searchWinner = row.jobNo;
        searchWinners += 1;
      }
    }
    if (searchWinners === 1) chosen = searchWinner;
  }
  if (!chosen) chosen = info.jobNo;
  if (chosen !== info.jobNo || (info.filenameJobNo && info.packedJobNo && info.filenameJobNo !== info.packedJobNo)) {
    context.resolverDiagnostics = context.resolverDiagnostics || [];
    context.resolverDiagnostics.push({
      path: p,
      kind: info.kind,
      filenameJobNo: info.filenameJobNo || '',
      packedJobNo: info.packedJobNo || '',
      resolvedJobNo: chosen,
      parserJobNo: info.jobNo || '',
      candidates: scored
    });
  }
  return chosen;
}

async function groupChanges(changes, config, context) {
  const jobs = {};
  for (const entry of changes || []) {
    const p = entry.path_display || entry.path_lower || entry.name || '';
    if (!SourceService.classifyPath(p, config)) continue;
    const jobNo = await resolveJobForChange(entry, config, context || {});
    if (!jobNo) continue;
    if (!jobs[jobNo]) jobs[jobNo] = [];
    jobs[jobNo].push(entry);
  }
  return jobs;
}

async function collectChanges(dbx, cursor) {
  const changes = [];
  let page = await dbx.rpc('files/list_folder/continue', { cursor });
  let finalCursor = page.cursor || cursor;
  let pages = 0;
  while (true) {
    pages += 1;
    changes.push(...(page.entries || []));
    finalCursor = page.cursor || finalCursor;
    if (!page.has_more) break;
    page = await dbx.rpc('files/list_folder/continue', { cursor: finalCursor });
  }
  return { changes, cursor: finalCursor, pages };
}

async function readCachedJobDetails(dbx, config, projects, pIndex, jobNo, changes) {
  const keys = changedPathKeys(changes);
  const details = [];
  const touched = [];
  for (const [id, row] of Object.entries(projects || {})) {
    if (String(row && row.jobNo || '') !== String(jobNo)) continue;
    const detail = await dbx.downloadJson(join(join(config.dropbox.dbPath, 'jobs'), id + '.json'), null);
    const candidate = withIndexProjectRef(detail, id, row);
    if (!candidate) continue;
    details.push(candidate);
    if (detailTouchesChangedPath(candidate, keys)) touched.push(candidate);
  }
  if (changesIncludeKind(changes, config, 'P')) return touched.length ? touched : [null];
  if (details.length) return details;
  const direct = await dbx.downloadJson(join(join(config.dropbox.dbPath, 'jobs'), jobNo + '.json'), null);
  if (direct) return [direct];
  const refs = await lookupPRefs(dbx, config, pIndex, jobNo);
  return refs.length ? refs.map((ref) => syntheticDetailFromPRef(jobNo, ref)) : [null];
}

function buildPIndexFromProjects(projects) {
  const out = {};
  for (const [id, row] of Object.entries(projects || {})) {
    const jobNo = String(row && row.jobNo || '').trim();
    const pPath = String(row && row.pPath || '').trim();
    if (!jobNo || !pPath) continue;
    if (!out[jobNo]) out[jobNo] = [];
    out[jobNo].push({
      kind: 'P',
      projectId: row.projectId || id,
      jobNo,
      path: pPath,
      filename: row.pFilename || basename(pPath),
      rev: row.rev || '',
      modified: row.modified || ''
    });
  }
  return out;
}

function replaceObject(target, source) {
  for (const key of Object.keys(target || {})) delete target[key];
  Object.assign(target, source || {});
}

async function downloadEntries(dbx, refs) {
  const out = [];
  const missingSourceRefs = [];
  for (const ref of refs || []) {
    try {
      const content = ref.kind === 'T' ? '' : await dbx.downloadText(ref.path);
      out.push({
        kind: ref.kind,
        filename: ref.filename || basename(ref.path),
        path: ref.path,
        rev: ref.rev || '',
        modified: ref.modified || '',
        content
      });
    } catch (err) {
      if (err && err.code === 'NOT_FOUND' && ref.kind !== 'P') {
        missingSourceRefs.push({ kind: ref.kind, path: ref.path || '', filename: ref.filename || basename(ref.path) });
        continue;
      }
      if (err && err.code === 'NOT_FOUND' && ref.kind === 'P') {
        const missing = new Error('Source file is missing during incremental sync: ' + ref.path);
        missing.code = 'CACHE_SOURCE_REF_NOT_FOUND';
        missing.kind = 'P';
        missing.path = ref.path || '';
        missing.filename = ref.filename || basename(ref.path);
        throw missing;
      }
      throw err;
    }
  }
  return { entries: out, missingSourceRefs };
}

async function rebuildFromRefs(dbx, config, jobNo, detail, changes, now, oldCursor) {
  const refs = sourceRefsFromDetail(detail);
  const mergedRefs = mergeRefsWithChanges(refs, changes || [], config, jobNo);
  const hasProjectRef = mergedRefs.some((ref) => ref && ref.kind === 'P');
  if (!hasProjectRef && !changeDeletesProjectRef(detail, changes || [])) {
    const err = new Error('Cannot incremental-sync job ' + jobNo + ' without a P_Chronos source file.');
    err.code = 'CACHE_REBUILD_REQUIRED_FOR_JOB';
    err.jobNo = String(jobNo || '');
    throw err;
  }
  const downloaded = await downloadEntries(dbx, mergedRefs);
  const entries = downloaded.entries;
  const hasProjectEntry = entries.some((entry) => entry && entry.kind === 'P');
  if (!hasProjectEntry && !changeDeletesProjectRef(detail, changes || [])) {
    const err = new Error('Cannot incremental-sync job ' + jobNo + ' without a P_Chronos source file.');
    err.code = 'CACHE_REBUILD_REQUIRED_FOR_JOB';
    err.jobNo = String(jobNo || '');
    throw err;
  }
  let cache = FullRebuildService.buildFromEntries(entries, { now, cursor: oldCursor });
  if (detail && detail.projectId) cache = preserveExistingProjectId(cache, detail.projectId);
  return { cache, missingSourceRefs: downloaded.missingSourceRefs };
}

function isRebuildRequiredForJob(err) {
  if (!err) return false;
  if (err.code === 'CACHE_REBUILD_REQUIRED_FOR_JOB') return true;
  const message = String(err.message || err || '');
  return message.includes('Cannot incremental-sync job ') && message.includes('without a P_Chronos source file');
}

function isMissingProjectSourceRef(err, config) {
  if (!err || err.code !== 'CACHE_SOURCE_REF_NOT_FOUND') return false;
  if (err.kind === 'P') return true;
  return SourceService.classifyPath(err.path || '', config) === 'P';
}

function missingProjectRefError(jobNo, err) {
  const missingPath = err && err.path || '';
  const out = new Error('Cannot incremental-sync job ' + jobNo + ' because its cached P_Chronos source file is missing: ' + missingPath + '. Run full rebuild or fix the stale source path.');
  out.code = 'CACHE_REBUILD_REQUIRED_FOR_JOB';
  out.jobNo = String(jobNo || '');
  out.path = missingPath;
  out.kind = 'P';
  return out;
}

async function rebuildWithRepair(dbx, config, pIndex, jobNo, detail, changes, now, oldCursor, missingSourceRefs) {
  try {
    return { detail, rebuilt: await rebuildFromRefs(dbx, config, jobNo, detail, changes, now, oldCursor) };
  } catch (err) {
    if (!isMissingProjectSourceRef(err, config)) throw err;
    missingSourceRefs.push({ jobNo, kind: 'P', path: err.path || '', filename: err.filename || '' });
    const repairedDetails = await replacementDetailsForMissingProjectRef(dbx, config, pIndex, jobNo, detail, err.path || '');
    for (const repairedDetail of repairedDetails) {
      try {
        return { detail: repairedDetail, rebuilt: await rebuildFromRefs(dbx, config, jobNo, repairedDetail, changes, now, oldCursor) };
      } catch (retryErr) {
        if (!isMissingProjectSourceRef(retryErr, config)) throw retryErr;
        missingSourceRefs.push({ jobNo, kind: 'P', path: retryErr.path || '', filename: retryErr.filename || '' });
      }
    }
    throw missingProjectRefError(jobNo, err);
  }
}

async function writeProjectCache(dbx, config, projects, jobNo, cache, staleProjectIds) {
  const incomingProjects = cache.projects || {};
  const incomingJobs = cache.jobs || {};
  const stale = staleProjectIds && staleProjectIds.length
    ? staleProjectIds.slice()
    : Object.keys(incomingProjects).length
      ? Object.keys(incomingProjects)
      : Object.keys(projects).filter((id) => String(projects[id] && projects[id].jobNo || '') === String(jobNo));

  for (const id of stale) delete projects[id];
  for (const [id, detail] of Object.entries(incomingJobs)) {
    await dbx.uploadJson(join(join(config.dropbox.dbPath, 'jobs'), id + '.json'), detail);
  }
  for (const [id, row] of Object.entries(incomingProjects)) projects[id] = row;
  for (const id of stale) {
    if (!incomingJobs[id]) await dbx.deletePath(join(join(config.dropbox.dbPath, 'jobs'), id + '.json'));
  }
  return Object.keys(incomingProjects);
}

function parseArgs(argv) {
  const args = { env: path.resolve(__dirname, '..', '..', '.env.local'), flushEvery: 10 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--env') {
      args.env = path.resolve(argv[i + 1] || '');
      i += 1;
    } else if (arg === '--flush-every') {
      args.flushEvery = Math.max(1, Number(argv[i + 1] || 10));
      i += 1;
    }
  }
  return args;
}

async function main() {
  const started = Date.now();
  const args = parseArgs(process.argv);
  const config = configFromEnv(readEnv(args.env));
  const d = config.dropbox;
  if (!d.appKey || !d.appSecret || !d.refreshToken) throw new Error('Missing Dropbox credentials in ' + args.env);
  const dbx = new Dropbox(config);
  const metaPath = join(d.dbPath, 'meta.json');
  const projectsPath = join(d.dbPath, 'projects.json');
  const pIndexPath = join(d.dbPath, 'p_index.json');

  const meta = await dbx.downloadJson(metaPath, null);
  if (!meta || !meta.cursor) throw new Error('Missing cache cursor; full rebuild is required before incremental sync.');
  const oldCursor = meta.cursor;
  const projects = await dbx.downloadJson(projectsPath, {});
  const pIndex = await dbx.downloadJson(pIndexPath, {});
  console.log('[start] db=' + d.dbPath + ' status=' + (meta.syncStatus || '') + ' projects=' + Object.keys(projects).length + ' cursor=' + oldCursor.slice(0, 20) + '...');

  const feed = await collectChanges(dbx, oldCursor);
  const resolverContext = { dbx, projects, pIndex, resolverDiagnostics: [] };
  const grouped = await groupChanges(feed.changes, config, resolverContext);
  const jobs = Object.keys(grouped).sort();
  const sourceChangeCount = Object.values(grouped).reduce((sum, rows) => sum + rows.length, 0);
  console.log('[cursor] pages=' + feed.pages + ' changes=' + feed.changes.length + ' sourceChanges=' + sourceChangeCount + ' affectedJobs=' + jobs.length + ' cursorWillChange=' + (feed.cursor !== oldCursor));
  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, affectedJobs: jobs.slice(0, 80), resolverDiagnostics: resolverContext.resolverDiagnostics.slice(0, 20) }, null, 2));
    return;
  }

  const runMeta = { ...meta, syncStatus: 'running', lastSyncMode: 'local_incremental', lastSyncStartedAt: new Date().toISOString(), lastError: null };
  await dbx.uploadJson(metaPath, runMeta);

  const affectedProjects = [];
  const skippedOrphans = [];
  const missingSourceRefs = [];
  let syncIssueLog = (meta.syncIssueLog || []).slice(-200);
  const now = new Date().toISOString();
  try {
    for (let i = 0; i < jobs.length; i += 1) {
      const jobNo = jobs[i];
      try {
        const details = await readCachedJobDetails(dbx, config, projects, pIndex, jobNo, grouped[jobNo]);
        for (let detail of details) {
          const repair = await rebuildWithRepair(dbx, config, pIndex, jobNo, detail, grouped[jobNo], now, oldCursor, missingSourceRefs);
          detail = repair.detail;
          const rebuilt = repair.rebuilt;
          const staleProjectIds = detail && detail.projectId ? [detail.projectId] : [];
          const changedProjectIds = await writeProjectCache(dbx, config, projects, jobNo, rebuilt.cache, staleProjectIds);
          replaceObject(pIndex, buildPIndexFromProjects(projects));
          for (const missing of rebuilt.missingSourceRefs || []) missingSourceRefs.push({ jobNo, ...missing });
          affectedProjects.push(...changedProjectIds);
        }
        syncIssueLog = pruneIssueRows(syncIssueLog, jobNo, grouped[jobNo]);
      } catch (err) {
        if (isRebuildRequiredForJob(err)) {
          const reason = err.message || String(err);
          const skippedRows = issueRowsForSkippedJob(jobNo, grouped[jobNo], reason, err.path ? [err.path] : []);
          skippedOrphans.push({ jobNo, reason, changes: (grouped[jobNo] || []).length, paths: skippedRows.map((row) => row.path) });
          syncIssueLog = appendIssueRows(syncIssueLog, skippedRows);
          console.warn('[skip] orphan job without cached/P source: ' + jobNo + ' changes=' + (grouped[jobNo] || []).length);
        } else {
          throw err;
        }
      }
      if ((i + 1) % args.flushEvery === 0 || i + 1 === jobs.length) {
        await dbx.uploadJson(projectsPath, projects);
        await dbx.uploadJson(pIndexPath, pIndex);
        const progressMeta = await dbx.downloadJson(metaPath, {});
        await dbx.uploadJson(metaPath, {
          ...progressMeta,
          syncStatus: 'running',
          lastSyncMode: 'local_incremental',
          lastSyncStartedAt: runMeta.lastSyncStartedAt,
          projectCount: Object.keys(projects).length,
          lastCacheUpdateAt: new Date().toISOString(),
          localSyncProgress: { processedJobs: i + 1, totalJobs: jobs.length, skippedOrphans: skippedOrphans.length, missingSourceRefs: missingSourceRefs.length },
          syncIssueLog
        });
        console.log('[progress] jobs=' + (i + 1) + '/' + jobs.length + ' projects=' + Object.keys(projects).length);
      }
    }

    const finalMeta = await dbx.downloadJson(metaPath, {});
    await dbx.uploadJson(projectsPath, projects);
    await dbx.uploadJson(pIndexPath, pIndex);
    await dbx.uploadJson(metaPath, {
      ...finalMeta,
      cursor: feed.cursor,
      syncStatus: 'idle',
      lastSyncMode: 'local_incremental',
      lastSyncAt: new Date().toISOString(),
      lastSyncStartedAt: '',
      lastSyncChangeCount: sourceChangeCount,
      lastSyncAffectedProjects: affectedProjects,
      lastSyncResolverDiagnostics: resolverContext.resolverDiagnostics,
      projectCount: Object.keys(projects).length,
      lastCacheUpdateAt: new Date().toISOString(),
      localSyncProgress: null,
      lastSkippedOrphanJobs: skippedOrphans,
      lastMissingSourceRefs: missingSourceRefs.slice(-100),
      syncIssueLog,
      lastError: null
    });
    console.log(JSON.stringify({
      ok: true,
      changes: feed.changes.length,
      sourceChanges: sourceChangeCount,
      affectedJobs: jobs.length,
      affectedProjects: affectedProjects.length,
      skippedOrphans: skippedOrphans.length,
      projectCount: Object.keys(projects).length,
      cursorChanged: feed.cursor !== oldCursor,
      durationSeconds: Math.round((Date.now() - started) / 1000)
    }, null, 2));
  } catch (err) {
    const errorMeta = await dbx.downloadJson(metaPath, {});
    await dbx.uploadJson(projectsPath, projects);
    await dbx.uploadJson(pIndexPath, pIndex);
    await dbx.uploadJson(metaPath, {
      ...errorMeta,
      cursor: oldCursor,
      syncStatus: 'error',
      lastSyncMode: 'local_incremental',
      lastSyncStartedAt: '',
      projectCount: Object.keys(projects).length,
      lastCacheUpdateAt: new Date().toISOString(),
      localSyncProgress: null,
      lastError: { code: err.code || 'LOCAL_INCREMENTAL_ERROR', message: err.message || String(err), jobNo: err.jobNo || '' }
    });
    throw err;
  }
}

main().catch((err) => {
  console.error(err && err.stack || String(err));
  process.exit(1);
});
