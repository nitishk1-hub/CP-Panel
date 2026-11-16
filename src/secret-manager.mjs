import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {bad} from './management.mjs';

function getSecretsPath(dataDir) {
  const dir = dataDir || process.env.PANEL_DATA_DIR || (process.getuid?.() === 0 ? '/var/lib/server-panel' : path.join(os.tmpdir(), 'server-panel-data'));
  return path.join(dir, 'secrets.json');
}

async function loadSecrets(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {version: 1, secrets: {}};
    throw err;
  }
}

async function saveSecrets(filePath, data) {
  await fs.mkdir(path.dirname(filePath), {recursive: true, mode: 0o700});
  const tmp = filePath + '.' + crypto.randomUUID().slice(0, 8) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), {mode: 0o600});
  await fs.rename(tmp, filePath);
}

function maskSecretValue(val) {
  if (!val || typeof val !== 'string') return '***';
  if (val.length <= 8) return '********';
  return val.slice(0, 3) + '...' + val.slice(-3);
}

export function maskKnownSecrets(text, secretValues = []) {
  if (!text || typeof text !== 'string') return text;
  let masked = text;
  for (const val of secretValues) {
    if (typeof val === 'string' && val.length >= 4) {
      masked = masked.split(val).join('[REDACTED_SECRET]');
    }
  }
  return masked;
}

export async function handleSecrets({action, name, value, scope = 'app', description = '', confirm = false, dataDir = ''}) {
  const filePath = getSecretsPath(dataDir);
  const data = await loadSecrets(filePath);

  if (action === 'list') {
    const list = Object.entries(data.secrets).map(([k, s]) => ({
      name: k,
      scope: s.scope || 'app',
      description: s.description || '',
      maskedValue: maskSecretValue(s.value),
      version: s.version || 1,
      createdAt: s.createdAt,
      lastRotatedAt: s.lastRotatedAt || s.createdAt
    }));
    return {ok: true, count: list.length, secrets: list};
  }

  if (action === 'get') {
    if (!name || typeof name !== 'string') throw bad('Specify secret name to get');
    const s = data.secrets[name];
    if (!s) throw bad(`Secret not found: "${name}"`, 404);
    if (confirm !== true) {
      return {
        ok: true,
        name,
        scope: s.scope || 'app',
        description: s.description || '',
        maskedValue: maskSecretValue(s.value),
        version: s.version || 1,
        requiresConfirmForRawValue: true
      };
    }
    return {
      ok: true,
      name,
      scope: s.scope || 'app',
      description: s.description || '',
      value: s.value,
      version: s.version || 1,
      lastRotatedAt: s.lastRotatedAt || s.createdAt
    };
  }

  // Mutating operations require confirm: true
  if (confirm !== true) {
    throw bad(`Secret operation "${action}" requires explicit confirm: true`);
  }

  if (action === 'set') {
    if (!name || !/^[A-Za-z0-9_.-]{1,128}$/.test(name)) {
      throw bad('Provide a valid secret name (alphanumeric, dashes, dots, underscores, max 128 chars)');
    }
    if (typeof value !== 'string' || !value) {
      throw bad('Provide a non-empty string value for secret');
    }
    const existing = data.secrets[name];
    const now = new Date().toISOString();
    data.secrets[name] = {
      name,
      value,
      scope: scope || 'app',
      description: description || existing?.description || '',
      version: (existing?.version || 0) + 1,
      createdAt: existing?.createdAt || now,
      lastRotatedAt: now
    };
    await saveSecrets(filePath, data);
    return {
      ok: true,
      action: 'set',
      name,
      scope: data.secrets[name].scope,
      version: data.secrets[name].version,
      maskedValue: maskSecretValue(value)
    };
  }

  if (action === 'rotate') {
    if (!name || typeof name !== 'string') throw bad('Specify secret name to rotate');
    if (!data.secrets[name]) throw bad(`Secret not found: "${name}"`, 404);
    if (typeof value !== 'string' || !value) throw bad('Provide a new string value for rotation');
    const existing = data.secrets[name];
    const now = new Date().toISOString();
    data.secrets[name] = {
      ...existing,
      value,
      version: (existing.version || 1) + 1,
      lastRotatedAt: now
    };
    await saveSecrets(filePath, data);
    return {
      ok: true,
      action: 'rotate',
      name,
      version: data.secrets[name].version,
      lastRotatedAt: now,
      maskedValue: maskSecretValue(value)
    };
  }

  if (action === 'delete') {
    if (!name || typeof name !== 'string') throw bad('Specify secret name to delete');
    if (!data.secrets[name]) throw bad(`Secret not found: "${name}"`, 404);
    delete data.secrets[name];
    await saveSecrets(filePath, data);
    return {ok: true, action: 'delete', name};
  }

  throw bad(`Unsupported secrets action: "${action}". Supported: list, get, set, rotate, delete`);
}
