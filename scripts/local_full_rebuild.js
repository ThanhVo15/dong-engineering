#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const FullRebuildService = require('../src/backend/FullRebuildService');

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--clean') {
      out.clean = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      out[key] = argv[i + 1] || '';
      i += 1;
    }
  }
  return out;
}

function requireArg(args, key) {
  if (!args[key]) throw new Error(`Missing --${key}`);
  return args[key];
}

function walkTxt(root) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) files.push(full);
    }
  }
  if (!fs.existsSync(root)) throw new Error(`Missing source folder: ${root}`);
  walk(root);
  return files;
}

function toDropboxPath(folderPath, filePath, dropboxFolder) {
  const rel = path.relative(folderPath, filePath).split(path.sep).join('/');
  return String(dropboxFolder || '').replace(/\/+$/, '') + '/' + rel;
}

function sourceEntries(kind, localFolder, dropboxFolder) {
  return walkTxt(localFolder).map((filePath) => {
    const stat = fs.statSync(filePath);
    return {
      kind,
      filename: path.basename(filePath),
      content: fs.readFileSync(filePath, 'utf8'),
      path: toDropboxPath(localFolder, filePath, dropboxFolder),
      modified: stat.mtime.toISOString(),
      rev: ''
    };
  });
}

function sourceEntriesFromJson(entriesPath) {
  const raw = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`--entries-json must contain an array: ${entriesPath}`);
  return raw.map((entry, index) => {
    const pathValue = String(entry.path || '');
    const filename = String(entry.filename || path.basename(pathValue));
    const kind = String(entry.kind || '');
    if (!kind || !filename || !pathValue) {
      throw new Error(`Invalid entry at index ${index}: kind, filename and path are required`);
    }
    return {
      kind,
      filename,
      content: String(entry.content || ''),
      path: pathValue,
      modified: String(entry.modified || ''),
      rev: String(entry.rev || '')
    };
  });
}

function atomicWriteJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + os.EOL, 'utf8');
  fs.renameSync(tmp, target);
}

function cleanDb(dbRoot) {
  if (!dbRoot.toLowerCase().endsWith(`${path.sep}__db__`) && path.basename(dbRoot).toLowerCase() !== '__db__') {
    throw new Error(`Refusing to clean non-__db__ folder: ${dbRoot}`);
  }
  fs.mkdirSync(dbRoot, { recursive: true });
  for (const entry of fs.readdirSync(dbRoot)) {
    const target = path.join(dbRoot, entry);
    let lastError = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        if (fs.existsSync(target)) fs.chmodSync(target, 0o666);
      } catch (ignoreChmod) {}
      try {
        fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
    }
    if (lastError) throw lastError;
  }
}

function writeCache(dbRoot, cache) {
  fs.mkdirSync(path.join(dbRoot, 'jobs'), { recursive: true });
  for (const [projectId, detail] of Object.entries(cache.jobs)) {
    atomicWriteJson(path.join(dbRoot, 'jobs', `${projectId}.json`), detail);
  }
  atomicWriteJson(path.join(dbRoot, 'projects.json'), cache.projects);
  atomicWriteJson(path.join(dbRoot, 'p_index.json'), cache.pIndex || {});
  atomicWriteJson(path.join(dbRoot, 'meta.json'), cache.meta);
}

function validateCache(dbRoot, cache) {
  const projectsPath = path.join(dbRoot, 'projects.json');
  const pIndexPath = path.join(dbRoot, 'p_index.json');
  const metaPath = path.join(dbRoot, 'meta.json');
  const jobsRoot = path.join(dbRoot, 'jobs');
  if (!fs.existsSync(metaPath)) throw new Error('meta.json was not written');
  if (!fs.existsSync(projectsPath)) throw new Error('projects.json was not written');
  if (!fs.existsSync(pIndexPath)) throw new Error('p_index.json was not written');
  if (!fs.existsSync(jobsRoot)) throw new Error('jobs folder was not written');
  const jobFiles = fs.readdirSync(jobsRoot).filter((name) => name.endsWith('.json'));
  if (jobFiles.length !== Object.keys(cache.projects).length) {
    throw new Error(`Job file count mismatch: ${jobFiles.length} files vs ${Object.keys(cache.projects).length} projects`);
  }
}

function main() {
  const started = Date.now();
  const args = parseArgs(process.argv);
  const dbRoot = path.resolve(requireArg(args, 'db-root'));

  if (args.clean) cleanDb(dbRoot);

  const scanStart = Date.now();
  const entries = args['entries-json']
    ? sourceEntriesFromJson(path.resolve(args['entries-json']))
    : []
      .concat(sourceEntries('P', path.resolve(requireArg(args, 'p-local-path')), requireArg(args, 'p-dropbox-path')))
      .concat(sourceEntries('AC2', path.resolve(requireArg(args, 'ac2-local-path')), requireArg(args, 'ac2-dropbox-path')))
      .concat(sourceEntries('T', path.resolve(requireArg(args, 't-local-path')), requireArg(args, 't-dropbox-path')));
  const scanMs = Date.now() - scanStart;

  const cache = FullRebuildService.buildFromEntries(entries, {
    now: nowIso(),
    cursor: args.cursor || '',
    syncStatus: 'idle'
  });
  cache.meta.lastFullRebuildAt = nowIso();
  cache.meta.rebuildSource = args['rebuild-source'] || (args['entries-json'] ? 'dropbox_api' : 'local_filesystem');
  cache.meta.dropboxRoot = args['dropbox-root'] || '';
  cache.meta.environment = args.environment || '';
  cache.meta.lastError = cache.diagnostics.ok ? null : { code: 'PARSE_ERRORS', count: cache.diagnostics.parseErrors.length };

  const writeStart = Date.now();
  writeCache(dbRoot, cache);
  const writeMs = Date.now() - writeStart;
  validateCache(dbRoot, cache);

  const result = {
    mode: 'simple_cache',
    dbRoot,
    durationMs: Date.now() - started,
    timings: {
      scanMs,
      writeMs
    },
    counts: {
      entries: entries.length,
      projects: Object.keys(cache.projects).length,
      jobs: Object.keys(cache.jobs).length,
      p: cache.diagnostics.pCount,
      ac2: cache.diagnostics.ac2Count,
      t: cache.diagnostics.timeCount,
      duplicateProjectJobs: cache.diagnostics.duplicateProjectJobs.length,
      parseErrors: cache.diagnostics.parseErrors.length,
      orphanAC2Jobs: cache.diagnostics.orphanAC2Jobs.length,
      orphanTimeJobs: cache.diagnostics.orphanTimeJobs.length
    }
  };
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (err) {
  console.error(err && err.stack || String(err));
  process.exit(1);
}
