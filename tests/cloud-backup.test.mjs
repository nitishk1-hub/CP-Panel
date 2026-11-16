import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {aws4SignRequest, encryptBackup, decryptBackup, createCloudBackup} from '../src/cloud-backup.mjs';

test('AWS4 signature generator formats canonical request and headers', () => {
  const signed = aws4SignRequest({
    method: 'PUT',
    url: 'https://test-bucket.r2.cloudflarestorage.com/backup-2026.tar.gz',
    headers: {'content-type': 'application/octet-stream'},
    body: Buffer.from('test payload'),
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'auto',
    service: 's3'
  });

  assert(signed.Authorization.startsWith('AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/'));
  assert(signed['x-amz-content-sha256']);
  assert(signed['x-amz-date']);
  assert.equal(signed.host, 'test-bucket.r2.cloudflarestorage.com');
});

test('Client-side AES-256-GCM backup encryption and verified decryption', () => {
  const original = Buffer.from('CyberPross confidential database dump contents and server state!');
  const password = 'SuperSecretEncryptionKey123!';

  const encrypted = encryptBackup(original, password);
  assert.notDeepEqual(encrypted, original);
  assert(encrypted.length > original.length);

  const decrypted = decryptBackup(encrypted, password);
  assert.deepEqual(decrypted, original);
  assert.equal(decrypted.toString('utf8'), original.toString('utf8'));

  // Wrong password fails authentication tag verification
  assert.throws(() => decryptBackup(encrypted, 'WrongPassword'), /Unsupported state or unable to authenticate data|bad/);
});

test('Cloud backup service manages config and retention settings in private storage', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
  try {
    const backup = createCloudBackup({dataDir: tmp});
    const initial = await backup.readConfig();
    assert.equal(initial.enabled, false);

    await backup.saveConfig({
      enabled: true,
      provider: 'r2',
      endpoint: 'https://cf-account.r2.cloudflarestorage.com',
      bucket: 'my-backups',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      retentionCount: 14
    });

    const saved = await backup.readConfig();
    assert.equal(saved.enabled, true);
    assert.equal(saved.bucket, 'my-backups');
    assert.equal(saved.retentionCount, 14);
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
});
