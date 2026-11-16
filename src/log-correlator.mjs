import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {maskKnownSecrets} from './secret-manager.mjs';

const exec = promisify(execFile);

async function runCmd(cmd, args = [], timeout = 10000) {
  try {
    const res = await exec(cmd, args, {timeout, maxBuffer: 4 * 1024 * 1024});
    return {ok: true, stdout: res.stdout.trim(), stderr: res.stderr.trim()};
  } catch (err) {
    return {ok: false, stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message).trim()};
  }
}

export async function handleLogsCorrelate({
  deploymentId,
  requestId,
  domain,
  query,
  limit = 50,
  sources = ['docker', 'nginx', 'coraza', 'crowdsec', 'systemd'],
  since = '1h'
}) {
  const maxEntries = Math.min(Math.max(1, Number(limit) || 50), 200);
  const logEntries = [];
  const queryLower = query ? String(query).toLowerCase() : null;

  // 1. Docker Container Logs
  if (sources.includes('docker')) {
    const psRes = await runCmd('docker', ['ps', '--format', '{{.ID}} {{.Names}}']);
    if (psRes.ok && psRes.stdout) {
      const containers = psRes.stdout.split('\n').filter(Boolean).map(l => l.split(' ')[1]);
      for (const c of containers.slice(0, 5)) {
        const dLogs = await runCmd('docker', ['logs', '--tail', '50', '--timestamps', c]);
        if (dLogs.ok && dLogs.stdout) {
          const lines = dLogs.stdout.split('\n').filter(Boolean);
          for (const line of lines) {
            const firstSpace = line.indexOf(' ');
            const ts = firstSpace > 0 ? line.slice(0, firstSpace) : new Date().toISOString();
            const msg = firstSpace > 0 ? line.slice(firstSpace + 1) : line;
            if (queryLower && !msg.toLowerCase().includes(queryLower)) continue;
            if (requestId && !msg.includes(requestId)) continue;
            if (deploymentId && !msg.includes(deploymentId)) continue;
            logEntries.push({
              timestamp: ts,
              source: 'docker',
              service: c,
              level: /error|err|fatal/i.test(msg) ? 'error' : /warn/i.test(msg) ? 'warn' : 'info',
              message: msg
            });
          }
        }
      }
    }
  }

  // 2. Coraza WAF Access & Audit Logs
  if (sources.includes('coraza')) {
    const corazaLogPath = '/var/lib/cyberpross-coraza/access.json';
    try {
      const raw = await fs.readFile(corazaLogPath, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      for (let i = Math.max(0, lines.length - 100); i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          const host = entry.request?.host || '';
          const uri = entry.request?.uri || '';
          const clientIp = entry.request?.client_ip || entry.request?.remote_ip || '';
          const status = entry.status || 0;
          const msg = `${entry.request?.method || 'REQ'} ${host}${uri} -> status ${status} (client: ${clientIp})`;

          if (domain && !host.includes(domain)) continue;
          if (queryLower && !msg.toLowerCase().includes(queryLower)) continue;
          if (requestId && !lines[i].includes(requestId)) continue;

          logEntries.push({
            timestamp: new Date((entry.ts || Date.now() / 1000) * 1000).toISOString(),
            source: 'coraza-waf',
            service: 'cyberpross-coraza',
            level: status >= 500 ? 'error' : status === 403 ? 'warn' : 'info',
            message: msg,
            details: {status, clientIp, host, uri}
          });
        } catch {}
      }
    } catch {}
  }

  // 3. Nginx / OpenResty Logs
  if (sources.includes('nginx')) {
    const nginxLogPaths = ['/var/log/nginx/access.log', '/var/log/nginx/error.log', '/usr/local/openresty/nginx/logs/error.log'];
    for (const p of nginxLogPaths) {
      try {
        const raw = await fs.readFile(p, 'utf8');
        const lines = raw.trim().split('\n').filter(Boolean).slice(-60);
        const isErrorLog = p.includes('error');
        for (const line of lines) {
          if (domain && !line.includes(domain)) continue;
          if (queryLower && !line.toLowerCase().includes(queryLower)) continue;
          if (requestId && !line.includes(requestId)) continue;
          logEntries.push({
            timestamp: new Date().toISOString(),
            source: 'nginx',
            service: isErrorLog ? 'nginx-error' : 'nginx-access',
            level: isErrorLog ? 'error' : 'info',
            message: line
          });
        }
      } catch {}
    }
  }

  // 4. CrowdSec Log
  if (sources.includes('crowdsec')) {
    const csLogPath = '/var/log/crowdsec.log';
    try {
      const raw = await fs.readFile(csLogPath, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean).slice(-60);
      for (const line of lines) {
        if (queryLower && !line.toLowerCase().includes(queryLower)) continue;
        logEntries.push({
          timestamp: new Date().toISOString(),
          source: 'crowdsec',
          service: 'crowdsec-engine',
          level: /error/i.test(line) ? 'error' : /warning|ban/i.test(line) ? 'warn' : 'info',
          message: line
        });
      }
    } catch {}
  }

  // 5. Systemd Journal Logs
  if (sources.includes('systemd')) {
    const jRes = await runCmd('journalctl', ['-u', 'server-panel', '--since', since, '-n', '60', '--no-pager']);
    if (jRes.ok && jRes.stdout) {
      const lines = jRes.stdout.split('\n').filter(Boolean);
      for (const line of lines) {
        if (queryLower && !line.toLowerCase().includes(queryLower)) continue;
        if (requestId && !line.includes(requestId)) continue;
        if (deploymentId && !line.includes(deploymentId)) continue;
        logEntries.push({
          timestamp: new Date().toISOString(),
          source: 'systemd',
          service: 'server-panel.service',
          level: /error|fail|exception/i.test(line) ? 'error' : 'info',
          message: line
        });
      }
    }
  }

  // Sort by timestamp desc and take limit
  logEntries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const finalEntries = logEntries.slice(0, maxEntries).map(entry => ({
    ...entry,
    message: maskKnownSecrets(entry.message)
  }));

  return {
    ok: true,
    totalFound: logEntries.length,
    returned: finalEntries.length,
    filters: {deploymentId, requestId, domain, query, since, sources},
    logs: finalEntries
  };
}
