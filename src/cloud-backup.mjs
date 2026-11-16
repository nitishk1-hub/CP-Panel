import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import http from 'node:http';
import https from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bad} from './management.mjs';

const exec = promisify(execFile);
const MAGIC_ENC = Buffer.from('CYBER_ENC1');

// AWS Signature Version 4 implementation for S3 / Cloudflare R2 / MinIO
function hmac(key, string) {
  return crypto.createHmac('sha256', key).update(string).digest();
}

function hashSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function aws4SignRequest({
  method = 'GET',
  url,
  headers = {},
  body = Buffer.alloc(0),
  accessKeyId,
  secretAccessKey,
  region = 'us-east-1',
  service = 's3'
}) {
  const reqUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = hashSha256(body);
  const canonicalHeaders = {
    host: reqUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers
  };

  const sortedHeaderKeys = Object.keys(canonicalHeaders).map(k => k.toLowerCase()).sort();
  const canonicalHeadersString = sortedHeaderKeys.map(k => `${k}:${canonicalHeaders[k].trim()}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const searchParams = new URLSearchParams(reqUrl.search);
  searchParams.sort();
  const canonicalQueryString = searchParams.toString();

  const canonicalRequest = [
    method.toUpperCase(),
    reqUrl.pathname,
    canonicalQueryString,
    canonicalHeadersString,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hashSha256(canonicalRequest)
  ].join('\n');

  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...canonicalHeaders,
    Authorization: authorization
  };
}

export async function s3Request({
  endpoint,
  region = 'us-east-1',
  bucket,
  key = '',
  method = 'GET',
  headers = {},
  body = Buffer.alloc(0),
  accessKeyId,
  secretAccessKey
}) {
  let targetUrl = endpoint.replace(/\/+$/, '');
  if (bucket) {
    targetUrl += `/${bucket}`;
  }
  if (key) {
    targetUrl += `/${key.replace(/^\/+/, '')}`;
  }

  const signedHeaders = aws4SignRequest({
    method,
    url: targetUrl,
    headers,
    body,
    accessKeyId,
    secretAccessKey,
    region,
    service: 's3'
  });

  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(parsed, {
      method,
      headers: signedHeaders,
      timeout: 120000
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const resBody = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: resBody,
          text: resBody.toString('utf8')
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(Error('S3 request timeout'));
    });

    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

// AES-256-GCM client-side encryption
export function encryptBackup(buffer, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, 32);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_ENC, salt, iv, tag, encrypted]);
}

export function decryptBackup(buffer, password) {
  if (buffer.subarray(0, 10).toString() !== MAGIC_ENC.toString()) {
    throw bad('Invalid encrypted backup payload or missing magic header');
  }

  const salt = buffer.subarray(10, 26);
  const iv = buffer.subarray(26, 38);
  const tag = buffer.subarray(38, 54);
  const ciphertext = buffer.subarray(54);

  const key = crypto.scryptSync(password, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function createCloudBackup({dataDir}) {
  const configFile = path.join(dataDir, 'cloud-backup-config.json');

  async function readConfig() {
    try {
      const data = await fs.readFile(configFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {
        enabled: false,
        provider: 'r2', // 'r2' | 's3' | 'minio' | 'custom'
        endpoint: '',
        region: 'auto',
        bucket: '',
        accessKeyId: '',
        secretAccessKey: '',
        encryptionPassword: '',
        retentionCount: 7,
        targets: ['panel', 'databases', 'websites']
      };
    }
  }

  async function saveConfig(newConfig) {
    const current = await readConfig();
    const updated = {
      ...current,
      ...newConfig,
      retentionCount: Number(newConfig.retentionCount) || 7
    };
    await fs.writeFile(configFile, JSON.stringify(updated, null, 2), {mode: 0o600});
    return {ok: true};
  }

  async function runBackup({targets = ['panel'], encrypt = true, password}, log = () => {}) {
    const config = await readConfig();
    const encPass = password || config.encryptionPassword;

    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      throw bad('S3 cloud storage is not configured. Please enter endpoint, bucket and credentials in settings.');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const results = [];

    for (const target of targets) {
      log(`Starting backup for target "${target}"...`);
      let tarBuffer;

      if (target === 'panel') {
        const tempTar = `/var/tmp/backup-panel-${timestamp}.tar.gz`;
        try {
          await exec('tar', ['-czf', tempTar, '--exclude=*.sock', '--exclude=*.lock', '--exclude=audit.jsonl', '-C', '/var/lib', 'server-panel']);
          tarBuffer = await fs.readFile(tempTar);
        } finally {
          await fs.rm(tempTar, {force: true});
        }
      } else if (target === 'databases') {
        let dumpOutput = '';
        if (await fs.access('/usr/bin/pg_dumpall').then(() => true, () => false)) {
          log('Dumping PostgreSQL databases...');
          const pg = await exec('su', ['-l', 'postgres', '-c', 'pg_dumpall']).catch(() => null);
          if (pg?.stdout) dumpOutput += pg.stdout;
        }
        if (await fs.access('/usr/bin/mariadb-dump').then(() => true, () => false)) {
          log('Dumping MariaDB/MySQL databases...');
          const my = await exec('mariadb-dump', ['--all-databases']).catch(() => null);
          if (my?.stdout) dumpOutput += my.stdout;
        }
        if (!dumpOutput) {
          log('No native database engines active to dump.');
          continue;
        }
        tarBuffer = zlib.gzipSync(Buffer.from(dumpOutput, 'utf8'));
      } else if (target === 'websites') {
        const tempTar = `/var/tmp/backup-websites-${timestamp}.tar.gz`;
        try {
          await exec('tar', ['-czf', tempTar, '-C', '/var', 'www']).catch(() => null);
          if (await fs.access(tempTar).then(() => true, () => false)) {
            tarBuffer = await fs.readFile(tempTar);
          } else {
            log('No /var/www directory found.');
            continue;
          }
        } finally {
          await fs.rm(tempTar, {force: true});
        }
      } else {
        continue;
      }

      let uploadPayload = tarBuffer;
      let filename = `cyberpross-${target}-${timestamp}.tar.gz`;

      if (encrypt && encPass) {
        log(`Encrypting ${target} backup with AES-256-GCM...`);
        uploadPayload = encryptBackup(tarBuffer, encPass);
        filename += '.enc';
      }

      log(`Uploading ${filename} (${(uploadPayload.length / (1024 * 1024)).toFixed(2)} MB) to S3...`);
      const uploadRes = await s3Request({
        endpoint: config.endpoint,
        region: config.region || 'auto',
        bucket: config.bucket,
        key: filename,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(uploadPayload.length)
        },
        body: uploadPayload,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      });

      if (uploadRes.status >= 200 && uploadRes.status < 300) {
        log(`Successfully uploaded ${filename} to S3 bucket ${config.bucket}`);
        results.push({target, filename, size: uploadPayload.length, status: 'uploaded'});
      } else {
        log(`Failed uploading ${filename}: HTTP ${uploadRes.status} - ${uploadRes.text.slice(0, 300)}`);
        results.push({target, filename, status: 'error', error: uploadRes.text.slice(0, 300)});
      }
    }

    // Prune old backups if retentionCount set
    if (config.retentionCount > 0) {
      log(`Checking retention policy (keep last ${config.retentionCount} backups)...`);
      try {
        const listRes = await s3Request({
          endpoint: config.endpoint,
          region: config.region || 'auto',
          bucket: config.bucket,
          method: 'GET',
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey
        });

        if (listRes.status === 200) {
          const keys = [...listRes.text.matchAll(/<Key>(cyberpross-[^<]+)<\/Key>/g)].map(m => m[1]);
          for (const target of targets) {
            const targetKeys = keys.filter(k => k.startsWith(`cyberpross-${target}-`)).sort();
            if (targetKeys.length > config.retentionCount) {
              const toDelete = targetKeys.slice(0, targetKeys.length - config.retentionCount);
              for (const k of toDelete) {
                log(`Pruning expired backup: ${k}`);
                await s3Request({
                  endpoint: config.endpoint,
                  region: config.region || 'auto',
                  bucket: config.bucket,
                  key: k,
                  method: 'DELETE',
                  accessKeyId: config.accessKeyId,
                  secretAccessKey: config.secretAccessKey
                });
              }
            }
          }
        }
      } catch (err) {
        log(`Warning during pruning: ${err.message}`);
      }
    }

    return {ok: true, results};
  }

  async function listBackups() {
    const config = await readConfig();
    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      return {configured: false, items: []};
    }

    const listRes = await s3Request({
      endpoint: config.endpoint,
      region: config.region || 'auto',
      bucket: config.bucket,
      method: 'GET',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    });

    if (listRes.status !== 200) {
      throw bad(`Failed to list S3 backups: HTTP ${listRes.status}`);
    }

    const matches = [...listRes.text.matchAll(/<Contents><Key>([^<]+)<\/Key><LastModified>([^<]+)<\/LastModified><Size>([^<]+)<\/Size>/g)];
    const items = matches.map(m => ({
      key: m[1],
      lastModified: m[2],
      sizeBytes: Number(m[3]),
      isEncrypted: m[1].endsWith('.enc'),
      target: m[1].includes('-panel-') ? 'panel' : m[1].includes('-databases-') ? 'databases' : m[1].includes('-websites-') ? 'websites' : 'other'
    })).sort((a, b) => b.lastModified.localeCompare(a.lastModified));

    return {configured: true, bucket: config.bucket, items};
  }

  return {
    readConfig,
    saveConfig,
    runBackup,
    listBackups
  };
}
