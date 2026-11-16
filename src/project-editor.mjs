import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {bad} from './management.mjs';

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function resolveWorkspace(rawDir) {
  if (!rawDir || typeof rawDir !== 'string') {
    throw bad('Specify a project workspace directory');
  }
  const resolved = path.resolve(rawDir);
  // Ensure workspace is not root or dangerous system root
  const forbidden = ['/', '/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/root', '/run', '/sys', '/usr'];
  if (forbidden.includes(resolved)) {
    throw bad(`Workspace cannot be a system directory: ${resolved}`);
  }
  return resolved;
}

function validateRelativePath(workspace, relPath) {
  if (!relPath || typeof relPath !== 'string') {
    throw bad('Provide a valid relative file path');
  }
  if (path.isAbsolute(relPath) || relPath.includes('\0') || relPath.includes('..')) {
    throw bad(`Path traversal detected outside workspace: ${relPath}`);
  }
  const normalized = path.normalize(relPath);
  const target = path.resolve(workspace, normalized);
  if (!target.startsWith(workspace + path.sep) && target !== workspace) {
    throw bad(`Path traversal detected outside workspace: ${relPath}`);
  }
  return {normalized, target};
}

export async function handleProjectRead({workspace, directory, paths = [], includeContent = false, maxFiles = 150}) {
  const rawDir = workspace || directory;
  const dir = resolveWorkspace(rawDir);
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw bad(`Workspace directory not found: ${dir}`);
  } catch {
    throw bad(`Workspace directory not found: ${dir}`);
  }

  // If explicit paths given, read those specific files
  if (Array.isArray(paths) && paths.length > 0) {
    const results = [];
    for (const p of paths.slice(0, maxFiles)) {
      const {normalized, target} = validateRelativePath(dir, p);
      try {
        const st = await fs.stat(target);
        if (st.isDirectory()) {
          results.push({path: normalized, type: 'directory', size: 0, mode: (st.mode & 0o777).toString(8)});
          continue;
        }
        if (!st.isFile()) {
          results.push({path: normalized, type: 'special', size: st.size, error: 'Not a regular file'});
          continue;
        }
        const data = await fs.readFile(target);
        const hash = sha256(data);
        const isBinary = data.subarray(0, 1024).includes(0);
        results.push({
          path: normalized,
          type: 'file',
          size: st.size,
          revision: hash,
          mtime: st.mtime.toISOString(),
          mode: (st.mode & 0o777).toString(8),
          isBinary,
          content: isBinary ? data.toString('base64') : data.toString('utf8'),
          encoding: isBinary ? 'base64' : 'utf8'
        });
      } catch (err) {
        results.push({path: normalized, type: 'missing', error: err.message});
      }
    }
    return {ok: true, workspace: dir, fileCount: results.length, files: results};
  }

  // Otherwise scan directory tree
  const files = [];
  const ignored = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'vendor', '.panel-snapshots']);

  async function walk(currDir, relDir = '') {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(currDir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= maxFiles) break;
      if (ignored.has(e.name)) continue;
      const rel = path.join(relDir, e.name);
      const full = path.join(currDir, e.name);
      if (e.isDirectory()) {
        files.push({path: rel, type: 'directory', size: 0});
        await walk(full, rel);
      } else if (e.isFile()) {
        try {
          const st = await fs.stat(full);
          let hash = '';
          let content;
          let isBinary = false;
          if (st.size <= 1048576) {
            const data = await fs.readFile(full);
            hash = sha256(data);
            isBinary = data.subarray(0, 512).includes(0);
            if (includeContent) {
              content = isBinary ? data.toString('base64') : data.toString('utf8');
            }
          }
          files.push({
            path: rel,
            type: 'file',
            size: st.size,
            revision: hash,
            mtime: st.mtime.toISOString(),
            mode: (st.mode & 0o777).toString(8),
            isBinary,
            ...(includeContent ? {content, encoding: isBinary ? 'base64' : 'utf8'} : {})
          });
        } catch {}
      }
    }
  }

  await walk(dir);
  return {ok: true, workspace: dir, fileCount: files.length, files};
}

export async function handleProjectEdit({workspace, directory, operations = [], dryRun = false, confirm = false}) {
  const rawDir = workspace || directory;
  const dir = resolveWorkspace(rawDir);
  if (!Array.isArray(operations) || operations.length === 0) {
    throw bad('Supply at least one file operation in operations array');
  }
  if (operations.length > 100) {
    throw bad('Maximum 100 operations allowed per project edit batch');
  }

  // Ensure workspace directory exists or create it safely
  await fs.mkdir(dir, {recursive: true, mode: 0o755});

  const transactionId = 'tx_' + crypto.randomUUID().slice(0, 12);
  const plannedChanges = [];
  const revisions = {};

  // 1. Preflight Validation
  for (const op of operations) {
    if (!['create', 'patch', 'delete'].includes(op.action)) {
      throw bad(`Invalid operation action: "${op.action}". Must be create, patch, or delete.`);
    }
    const {normalized, target} = validateRelativePath(dir, op.path);
    let existingStat = null;
    let existingHash = null;

    try {
      existingStat = await fs.stat(target);
      if (existingStat.isFile()) {
        const existingData = await fs.readFile(target);
        existingHash = sha256(existingData);
      }
    } catch {
      existingStat = null;
    }

    if (op.action === 'create') {
      if (existingStat && !op.overwrite) {
        throw bad(`File already exists: "${normalized}". Use action: "patch" or set overwrite: true.`);
      }
      if (typeof op.content !== 'string') {
        throw bad(`Provide string content for create operation on: "${normalized}"`);
      }
      plannedChanges.push({
        action: 'create',
        path: normalized,
        target,
        content: op.content,
        encoding: op.encoding || 'utf8',
        mode: op.mode ? parseInt(op.mode, 8) : 0o644,
        existed: Boolean(existingStat),
        previousHash: existingHash
      });
    } else if (op.action === 'patch') {
      if (!existingStat || !existingStat.isFile()) {
        throw bad(`Cannot patch non-existent file: "${normalized}". Use action: "create".`);
      }
      if (op.revision && existingHash !== op.revision) {
        throw bad(`Revision conflict on "${normalized}": expected revision ${op.revision}, but file has ${existingHash}`);
      }
      if (typeof op.content !== 'string') {
        throw bad(`Provide string content for patch operation on: "${normalized}"`);
      }
      plannedChanges.push({
        action: 'patch',
        path: normalized,
        target,
        content: op.content,
        encoding: op.encoding || 'utf8',
        mode: op.mode ? parseInt(op.mode, 8) : (existingStat.mode & 0o777),
        previousHash: existingHash
      });
    } else if (op.action === 'delete') {
      if (existingStat) {
        if (op.revision && existingHash !== op.revision) {
          throw bad(`Revision conflict on delete "${normalized}": expected revision ${op.revision}, but file has ${existingHash}`);
        }
        plannedChanges.push({
          action: 'delete',
          path: normalized,
          target,
          previousHash: existingHash
        });
      }
    }
  }

  // If dryRun, return planned changes without executing
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      transactionId,
      workspace: dir,
      operationCount: plannedChanges.length,
      changes: plannedChanges.map(c => ({
        action: c.action,
        path: c.path,
        previousHash: c.previousHash || null,
        newSize: c.content ? Buffer.byteLength(c.content, c.encoding) : 0
      }))
    };
  }

  // Mutating batch edits require explicit confirmation
  if (confirm !== true) {
    throw bad('Project edits require explicit confirm: true');
  }

  // 2. Snapshot Backup Creation
  const snapshotBase = path.join(dir, '.panel-snapshots');
  await fs.mkdir(snapshotBase, {recursive: true, mode: 0o700});
  const snapshotDir = path.join(snapshotBase, transactionId);
  await fs.mkdir(snapshotDir, {recursive: true, mode: 0o700});

  const rollbackManifest = [];
  try {
    for (const change of plannedChanges) {
      if (change.previousHash) {
        const backupTarget = path.join(snapshotDir, change.path.replace(/\//g, '_') + '.bak');
        await fs.copyFile(change.target, backupTarget);
        rollbackManifest.push({target: change.target, backup: backupTarget, existed: true});
      } else {
        rollbackManifest.push({target: change.target, existed: false});
      }
    }

    // 3. Apply Changes Atomically
    for (const change of plannedChanges) {
      if (change.action === 'create' || change.action === 'patch') {
        await fs.mkdir(path.dirname(change.target), {recursive: true, mode: 0o755});
        const tmpFile = change.target + '.' + crypto.randomUUID().slice(0, 8) + '.tmp';
        const buffer = Buffer.from(change.content, change.encoding);
        await fs.writeFile(tmpFile, buffer, {mode: change.mode || 0o644});
        await fs.rename(tmpFile, change.target);
        revisions[change.path] = sha256(buffer);
      } else if (change.action === 'delete') {
        await fs.rm(change.target, {force: true});
        revisions[change.path] = null;
      }
    }

    return {
      ok: true,
      transactionId,
      workspace: dir,
      appliedCount: plannedChanges.length,
      affectedFiles: plannedChanges.map(c => c.path),
      snapshotId: transactionId,
      revisions
    };
  } catch (err) {
    // 4. Automatic Rollback on Any Failure
    for (const item of rollbackManifest) {
      try {
        if (item.existed && item.backup) {
          await fs.copyFile(item.backup, item.target);
        } else if (!item.existed) {
          await fs.rm(item.target, {force: true});
        }
      } catch {}
    }
    throw bad(`Transaction failed and was rolled back: ${err.message}`);
  }
}
