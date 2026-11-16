import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createCloudflareDns} from '../src/cloudflare-dns.mjs';

test('Cloudflare DNS service manages token, syncs web records, and provisions full email DNS suite', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-cfdns-test-'));

  const mockZones = [
    {id: 'zone123', name: 'example.org', status: 'active', name_servers: ['ns1.cloudflare.com', 'ns2.cloudflare.com']}
  ];

  const mockRecords = [
    {id: 'rec001', zone_id: 'zone123', name: 'example.org', type: 'A', content: '1.2.3.4', proxied: true}
  ];

  const mockFetch = async (url, options = {}) => {
    const u = new URL(url);

    // IP lookup
    if (u.hostname === 'api.ipify.org') {
      return {ok: true, json: async () => ({ip: '120.60.228.219'})};
    }

    // Token verify
    if (u.pathname === '/client/v4/user/tokens/verify') {
      const auth = options.headers?.Authorization;
      if (auth === 'Bearer valid_token_123') {
        return {ok: true, json: async () => ({success: true, result: {status: 'active', id: 'token_abc'}})};
      }
      return {ok: false, json: async () => ({success: false, errors: [{message: 'Invalid token'}]})};
    }

    // Zones
    if (u.pathname === '/client/v4/zones') {
      return {ok: true, json: async () => ({success: true, result: mockZones})};
    }

    // DNS Records list
    if (u.pathname === '/client/v4/zones/zone123/dns_records' && (!options.method || options.method === 'GET')) {
      return {ok: true, json: async () => ({success: true, result: mockRecords})};
    }

    // DNS Record create
    if (u.pathname === '/client/v4/zones/zone123/dns_records' && options.method === 'POST') {
      const body = JSON.parse(options.body);
      const newRec = {id: 'rec_' + Math.random().toString(36).slice(2), ...body};
      mockRecords.push(newRec);
      return {ok: true, json: async () => ({success: true, result: newRec})};
    }

    // DNS Record update
    if (u.pathname.startsWith('/client/v4/zones/zone123/dns_records/') && options.method === 'PUT') {
      const recId = u.pathname.split('/').pop();
      const body = JSON.parse(options.body);
      const idx = mockRecords.findIndex(r => r.id === recId);
      if (idx >= 0) mockRecords[idx] = {...mockRecords[idx], ...body};
      return {ok: true, json: async () => ({success: true, result: {id: recId, ...body}})};
    }

    return {ok: false, json: async () => ({success: false, errors: [{message: 'Not found'}]})};
  };

  const cfdns = createCloudflareDns({dataDir: tmpDir, fetchFn: mockFetch});

  // 1. Verify token validation
  await assert.rejects(
    async () => await cfdns.verifyToken('bad_token'),
    /Cloudflare API Token verification failed/
  );
  const verifyRes = await cfdns.verifyToken('valid_token_123');
  assert.equal(verifyRes.ok, true);
  assert.equal(verifyRes.status, 'active');

  // 2. Save config
  await cfdns.saveConfig({apiToken: 'valid_token_123', defaultProxied: true});
  const savedCfg = await cfdns.readConfig();
  assert.equal(savedCfg.apiToken, 'valid_token_123');
  assert.equal(savedCfg.defaultProxied, true);

  // 3. Detect Public IP
  const detectedIp = await cfdns.detectPublicIp();
  assert.equal(detectedIp, '120.60.228.219');

  // 4. List zones
  const zones = await cfdns.listZones();
  assert.equal(zones.length, 1);
  assert.equal(zones[0].name, 'example.org');

  // 5. Sync Web DNS (Existing record update)
  const syncRes = await cfdns.syncWebDns({domain: 'example.org', targetIp: '120.60.228.219', proxied: true});
  assert.equal(syncRes.ok, true);
  assert.equal(syncRes.action, 'updated');
  assert.equal(syncRes.ip, '120.60.228.219');

  // 6. Setup Email DNS Suite (Creates Mail A record, MX, SPF, DMARC, DKIM)
  const emailRes = await cfdns.setupEmailDns({
    domain: 'example.org',
    targetIp: '120.60.228.219',
    mailSubdomain: 'mail',
    dmarcPolicy: 'quarantine'
  });

  assert.equal(emailRes.ok, true);
  assert.equal(emailRes.dispatches.length, 5);
  // Verify Mail A record is proxied: false (direct DNS)
  const mailARec = mockRecords.find(r => r.name === 'mail.example.org' && r.type === 'A');
  assert.ok(mailARec);
  assert.equal(mailARec.proxied, false);
  assert.equal(mailARec.content, '120.60.228.219');

  // Verify MX record
  const mxRec = mockRecords.find(r => r.name === 'example.org' && r.type === 'MX');
  assert.ok(mxRec);
  assert.equal(mxRec.content, 'mail.example.org');
  assert.equal(mxRec.priority, 10);

  // Verify SPF record
  const spfRec = mockRecords.find(r => r.name === 'example.org' && r.type === 'TXT' && r.content.includes('v=spf1'));
  assert.ok(spfRec);
  assert.match(spfRec.content, /v=spf1 mx a ip4:120\.60\.228\.219 ~all/);

  // Verify DMARC record
  const dmarcRec = mockRecords.find(r => r.name === '_dmarc.example.org');
  assert.ok(dmarcRec);
  assert.match(dmarcRec.content, /v=DMARC1; p=quarantine/);

  await fs.rm(tmpDir, {recursive: true, force: true});
});
