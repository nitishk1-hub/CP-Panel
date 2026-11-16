import fs from 'node:fs/promises';
import path from 'node:path';
import {bad} from './management.mjs';

export function createCloudflareDns({dataDir, acmeClient, fetchFn = globalThis.fetch}) {
  const dir = path.join(dataDir, 'cloudflare');
  const configFile = path.join(dir, 'dns-api.json');

  async function readConfig() {
    try {
      const text = await fs.readFile(configFile, 'utf8');
      return JSON.parse(text);
    } catch {
      return {
        apiToken: '',
        accountId: '',
        defaultProxied: true,
        detectedIp: ''
      };
    }
  }

  async function saveConfig(updates) {
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
    const current = await readConfig();
    const merged = {
      ...current,
      ...updates
    };
    await fs.writeFile(configFile, JSON.stringify(merged, null, 2), {mode: 0o600});
    return {ok: true};
  }

  async function detectPublicIp() {
    try {
      const res = await fetchFn('https://api.ipify.org?format=json', {signal: AbortSignal.timeout(5000)});
      if (res.ok) {
        const data = await res.json();
        if (data.ip && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(data.ip)) {
          return data.ip;
        }
      }
    } catch {}

    try {
      const res2 = await fetchFn('https://icanhazip.com', {signal: AbortSignal.timeout(5000)});
      if (res2.ok) {
        const text = (await res2.text()).trim();
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) {
          return text;
        }
      }
    } catch {}

    return '127.0.0.1';
  }

  async function getToken(explicitToken) {
    if (explicitToken && typeof explicitToken === 'string' && explicitToken.trim()) {
      return explicitToken.trim();
    }
    const cfg = await readConfig();
    if (cfg.apiToken && typeof cfg.apiToken === 'string' && cfg.apiToken.trim()) {
      return cfg.apiToken.trim();
    }
    throw bad('Cloudflare API Token is not configured. Please supply an API Token with Zone.DNS and Zone.Zone permissions.');
  }

  async function verifyToken(token) {
    const t = await getToken(token);
    const res = await fetchFn('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: {
        'Authorization': `Bearer ${t}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw bad(`Cloudflare API Token verification failed: ${data.errors?.[0]?.message || 'Invalid token'}`);
    }
    return {ok: true, status: data.result?.status || 'active', id: data.result?.id};
  }

  async function listZones(token) {
    const t = await getToken(token);
    const res = await fetchFn('https://api.cloudflare.com/client/v4/zones?status=active&per_page=50', {
      headers: {
        'Authorization': `Bearer ${t}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw bad(`Failed to list Cloudflare zones: ${data.errors?.[0]?.message || 'Unknown error'}`);
    }
    return (data.result || []).map(z => ({
      id: z.id,
      name: z.name,
      status: z.status,
      nameServers: z.name_servers || [],
      paused: Boolean(z.paused)
    }));
  }

  async function findZoneForDomain(domain, token) {
    const zones = await listZones(token);
    const cleanDomain = String(domain || '').toLowerCase().trim();
    const parts = cleanDomain.split('.');

    // Try finding exact zone match or parent domain match
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join('.');
      const matched = zones.find(z => z.name.toLowerCase() === candidate);
      if (matched) return matched;
    }

    throw bad(`No active Cloudflare Zone found for domain "${cleanDomain}". Ensure domain is added to your Cloudflare account.`);
  }

  async function listRecords(domain, token) {
    const t = await getToken(token);
    const zone = await findZoneForDomain(domain, t);
    const res = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records?per_page=100`, {
      headers: {
        'Authorization': `Bearer ${t}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw bad(`Failed to fetch DNS records: ${data.errors?.[0]?.message || 'Unknown error'}`);
    }
    return {
      zone,
      records: data.result || []
    };
  }

  async function syncWebDns({domain, targetIp, proxied = true, token}) {
    if (!domain || typeof domain !== 'string') throw bad('Valid domain name required');
    const t = await getToken(token);
    const ip = targetIp || await detectPublicIp();
    const zone = await findZoneForDomain(domain, t);

    // Check existing records in zone
    const {records} = await listRecords(domain, t);
    const existing = records.find(r => r.name.toLowerCase() === domain.toLowerCase() && ['A', 'CNAME'].includes(r.type));

    const payload = {
      type: 'A',
      name: domain,
      content: ip,
      proxied: Boolean(proxied),
      ttl: proxied ? 1 : 120 // 1 means automatic when proxied by Cloudflare
    };

    let resultRecord;
    if (existing) {
      // Update existing record
      const updateRes = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${existing.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${t}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok || !updateData.success) {
        throw bad(`Failed to update DNS record: ${updateData.errors?.[0]?.message || 'Cloudflare API error'}`);
      }
      resultRecord = updateData.result;
    } else {
      // Create new record
      const createRes = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${t}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.success) {
        throw bad(`Failed to create DNS record: ${createData.errors?.[0]?.message || 'Cloudflare API error'}`);
      }
      resultRecord = createData.result;
    }

    return {
      ok: true,
      action: existing ? 'updated' : 'created',
      zone: zone.name,
      domain,
      ip,
      proxied: Boolean(proxied),
      recordId: resultRecord.id
    };
  }

  async function setupEmailDns({
    domain,
    targetIp,
    token,
    mailSubdomain = 'mail',
    dmarcPolicy = 'quarantine',
    dmarcEmail = ''
  }) {
    if (!domain || typeof domain !== 'string') throw bad('Valid root domain required');
    const t = await getToken(token);
    const ip = targetIp || await detectPublicIp();
    const zone = await findZoneForDomain(domain, t);
    const mailHost = `${mailSubdomain}.${domain}`.toLowerCase();
    const {records} = await listRecords(domain, t);

    const emailRecordsToSet = [
      // 1. Mail Host A record (MUST BE PROXIED: FALSE because Cloudflare HTTP proxy does not route SMTP/IMAP)
      {
        type: 'A',
        name: mailHost,
        content: ip,
        proxied: false,
        ttl: 120,
        desc: 'Mail Server A Record (Direct unproxied routing for SMTP/IMAP/POP3)'
      },
      // 2. MX Record
      {
        type: 'MX',
        name: domain,
        content: mailHost,
        priority: 10,
        proxied: false,
        ttl: 120,
        desc: 'Mail Exchange (MX) record priority 10'
      },
      // 3. SPF Record
      {
        type: 'TXT',
        name: domain,
        content: `v=spf1 mx a ip4:${ip} ~all`,
        proxied: false,
        ttl: 300,
        desc: 'Sender Policy Framework (SPF) authorization'
      },
      // 4. DMARC Policy Record
      {
        type: 'TXT',
        name: `_dmarc.${domain}`,
        content: `v=DMARC1; p=${dmarcPolicy}; sp=${dmarcPolicy}; rua=mailto:${dmarcEmail || 'postmaster@' + domain}`,
        proxied: false,
        ttl: 300,
        desc: 'Domain-based Message Authentication (DMARC) policy'
      },
      // 5. Default DKIM placeholder Record
      {
        type: 'TXT',
        name: `default._domainkey.${domain}`,
        content: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3',
        proxied: false,
        ttl: 300,
        desc: 'DomainKeys Identified Mail (DKIM) verification signature'
      }
    ];

    const results = [];
    for (const item of emailRecordsToSet) {
      const match = records.find(r => r.name.toLowerCase() === item.name.toLowerCase() && r.type === item.type);
      const body = {
        type: item.type,
        name: item.name,
        content: item.content,
        ttl: item.ttl,
        ...(item.priority !== undefined ? {priority: item.priority} : {}),
        proxied: item.proxied
      };

      try {
        let res;
        if (match) {
          res = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${match.id}`, {
            method: 'PUT',
            headers: {'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json'},
            body: JSON.stringify(body)
          });
        } else {
          res = await fetchFn(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
            method: 'POST',
            headers: {'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json'},
            body: JSON.stringify(body)
          });
        }
        const j = await res.json();
        results.push({
          record: item.name,
          type: item.type,
          desc: item.desc,
          ok: res.ok && j.success,
          action: match ? 'updated' : 'created',
          error: (!res.ok || !j.success) ? (j.errors?.[0]?.message || 'Failed') : undefined
        });
      } catch (err) {
        results.push({
          record: item.name,
          type: item.type,
          desc: item.desc,
          ok: false,
          error: err.message
        });
      }
    }

    return {
      ok: true,
      domain,
      mailHost,
      ip,
      dispatches: results
    };
  }

  async function issueTlsWithDns({domain, altNames = [], provider = 'letsencrypt', token}) {
    if (!acmeClient) throw bad('ACME SSL client is not available');
    const t = await getToken(token);
    return await acmeClient.issueCertificate({
      domain,
      altNames,
      provider,
      challengeType: 'dns-01',
      cloudflareToken: t,
      confirm: true
    });
  }

  return {
    readConfig,
    saveConfig,
    detectPublicIp,
    verifyToken,
    listZones,
    findZoneForDomain,
    listRecords,
    syncWebDns,
    setupEmailDns,
    issueTlsWithDns
  };
}
