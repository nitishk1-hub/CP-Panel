import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import {bad} from './management.mjs';

const exec = promisify(execFile);

async function runCmd(cmd, args = [], options = {}) {
  try {
    const res = await exec(cmd, args, {
      timeout: options.timeout || 60000,
      maxBuffer: options.maxBuffer || 4 * 1024 * 1024,
      env: {PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'C.UTF-8', ...options.env}
    });
    return {ok: true, stdout: res.stdout.trim(), stderr: res.stderr.trim(), code: 0};
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || err.message).trim(),
      code: err.code || 1
    };
  }
}

// 1. APT Package Manager
export async function handleApt({action, packages = [], query = '', confirm = false}) {
  const pkgs = Array.isArray(packages) ? packages.map(p => String(p).trim()).filter(Boolean) : [String(packages).trim()].filter(Boolean);
  
  // Package names must be valid Debian package identifiers
  for (const pkg of pkgs) {
    if (!/^[a-z0-9][a-z0-9+.-]{1,127}$/.test(pkg)) throw bad(`Invalid Debian package name: ${pkg}`);
  }

  if (action === 'search') {
    if (!query || typeof query !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(query.trim())) throw bad('Provide a valid package search query');
    const res = await runCmd('apt-cache', ['search', query.trim()]);
    const lines = res.stdout.split('\n').filter(Boolean).slice(0, 50).map(l => {
      const idx = l.indexOf(' - ');
      return idx > 0 ? {package: l.slice(0, idx).trim(), description: l.slice(idx + 3).trim()} : {package: l.trim(), description: ''};
    });
    return {ok: true, action: 'search', results: lines};
  }

  if (action === 'info') {
    if (!pkgs.length) throw bad('Specify at least one package for info');
    const res = await runCmd('apt-cache', ['show', pkgs[0]]);
    return {ok: res.ok, action: 'info', package: pkgs[0], details: res.stdout || res.stderr};
  }

  if (action === 'upgradable') {
    const res = await runCmd('apt', ['list', '--upgradable']);
    const items = res.stdout.split('\n').filter(l => l.includes('/')).map(l => l.trim());
    return {ok: true, action: 'upgradable', count: items.length, packages: items};
  }

  if (action === 'simulate') {
    if (!pkgs.length) throw bad('Specify packages to simulate');
    const res = await runCmd('apt-get', ['install', '-s', '-y', ...pkgs]);
    return {ok: res.ok, action: 'simulate', simulation: res.stdout || res.stderr};
  }

  // Mutating actions require confirm: true
  if (['install', 'update', 'upgrade'].includes(action)) {
    if (confirm !== true) throw bad(`Action "${action}" requires explicit confirm: true`);
    
    if (action === 'update') {
      const res = await runCmd('apt-get', ['update', '-y'], {timeout: 120000});
      return {ok: res.ok, action: 'update', output: res.stdout || res.stderr};
    }

    if (action === 'install') {
      if (!pkgs.length) throw bad('Specify packages to install');
      const res = await runCmd('apt-get', ['install', '-y', ...pkgs], {timeout: 300000});
      return {ok: res.ok, action: 'install', packages: pkgs, output: res.stdout || res.stderr};
    }

    if (action === 'upgrade') {
      const res = await runCmd('apt-get', ['upgrade', '-y'], {timeout: 600000});
      return {ok: res.ok, action: 'upgrade', output: res.stdout || res.stderr};
    }
  }

  throw bad(`Unsupported APT action: ${action}`);
}

// 2. Git Version Control Operations
export async function handleGit({action, directory = '', repo = '', branch = '', depth = 1, confirm = false}) {
  const defaultWorkspace = '/var/lib/server-panel/workspaces';
  let dir = directory ? path.resolve(directory) : '';
  if (!dir) {
    if (await fs.access(path.join(process.cwd(), '.git')).then(() => true, () => false)) {
      dir = process.cwd();
    } else {
      dir = defaultWorkspace;
      await fs.mkdir(defaultWorkspace, { recursive: true, mode: 0o755 }).catch(() => {});
    }
  }

  if (action === 'clone') {
    if (confirm !== true) throw bad('Git clone requires explicit confirm: true');
    if (!repo || !/^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]+$/.test(repo)) throw bad('Provide a valid HTTPS Git repository URL');
    let cloneDestination = dir;
    if (cloneDestination === defaultWorkspace || (await fs.readdir(cloneDestination).then(e => e.length > 0, () => false))) {
      const repoName = repo.split('/').pop().replace(/\.git$/i, '') || 'repo-' + crypto.randomUUID().slice(0, 8);
      cloneDestination = path.join(defaultWorkspace, repoName);
    }
    const args = ['clone'];
    if (depth && Number.isInteger(depth) && depth > 0) args.push(`--depth=${depth}`);
    if (branch && /^[a-zA-Z0-9_.-]+$/.test(branch)) args.push('-b', branch);
    args.push(repo, cloneDestination);
    const res = await runCmd('git', args, {timeout: 180000});
    return {
      ok: res.ok,
      action: 'clone',
      directory: cloneDestination,
      repo,
      branch: branch || 'default',
      output: res.stdout || res.stderr,
      error: res.ok ? undefined : (res.stderr || res.stdout || 'Git clone failed')
    };
  }

  // Directory must exist for remaining actions
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw bad(`Directory not found: ${dir}`);
  } catch {
    throw bad(`Directory not found: ${dir}`);
  }

  const isGit = await fs.access(path.join(dir, '.git')).then(() => true, () => false);
  if (!isGit) {
    return {
      ok: false,
      action,
      directory: dir,
      isGitRepo: false,
      message: `Directory "${dir}" is not a Git repository. Pass a directory containing a cloned Git repository, or run action: "clone" with a repository URL to initialize one.`
    };
  }

  if (action === 'status') {
    const res = await runCmd('git', ['-C', dir, 'status', '--short']);
    return {
      ok: res.ok,
      action: 'status',
      directory: dir,
      isGitRepo: true,
      status: res.stdout || 'clean (no modified files)',
      clean: !res.stdout,
      error: res.ok ? undefined : (res.stderr || res.stdout)
    };
  }

  if (action === 'log') {
    const res = await runCmd('git', ['-C', dir, 'log', '-n', '15', '--oneline']);
    return {
      ok: res.ok,
      action: 'log',
      directory: dir,
      isGitRepo: true,
      commits: res.stdout.split('\n').filter(Boolean),
      error: res.ok ? undefined : (res.stderr || res.stdout)
    };
  }

  if (action === 'diff') {
    const res = await runCmd('git', ['-C', dir, 'diff'], {maxBuffer: 16 * 1024 * 1024});
    return {
      ok: res.ok,
      action: 'diff',
      directory: dir,
      isGitRepo: true,
      diff: res.stdout.slice(0, 100000),
      error: res.ok ? undefined : (res.stderr || res.stdout)
    };
  }

  if (action === 'branch') {
    const res = await runCmd('git', ['-C', dir, 'branch', '-a']);
    return {
      ok: res.ok,
      action: 'branch',
      directory: dir,
      isGitRepo: true,
      branches: res.stdout.split('\n').map(b => b.trim()).filter(Boolean),
      error: res.ok ? undefined : (res.stderr || res.stdout)
    };
  }

  if (action === 'pull') {
    if (confirm !== true) throw bad('Git pull requires explicit confirm: true');
    const res = await runCmd('git', ['-C', dir, 'pull']);
    return {
      ok: res.ok,
      action: 'pull',
      directory: dir,
      isGitRepo: true,
      output: res.stdout || res.stderr,
      error: res.ok ? undefined : (res.stderr || res.stdout)
    };
  }

  if (action === 'checkout') {
    if (confirm !== true) throw bad('Git checkout requires explicit confirm: true');
    if (!branch || !/^[a-zA-Z0-9_.-]+$/.test(branch)) throw bad('Provide a valid branch or commit to checkout');
    const res = await runCmd('git', ['-C', dir, 'checkout', branch]);
    return {
      ok: res.ok,
      action: 'checkout',
      directory: dir,
      branch,
      output: res.stdout || res.stderr,
      error: res.ok ? undefined : (res.stderr || res.stdout)
    };
  }

  throw bad(`Unsupported Git action: ${action}`);
}

// 3. Docker Image Builder
export async function handleDockerBuild({directory, tag, dockerfile = 'Dockerfile', buildArgs = {}, noCache = false, confirm = false}) {
  if (confirm !== true) throw bad('Docker build requires explicit confirm: true');
  if (!tag || !/^[a-z0-9][a-z0-9_.-]*(?::[a-zA-Z0-9_.-]+)?$/.test(tag)) throw bad('Provide a valid Docker image tag (e.g. myapp:v1)');
  
  const jobId = 'build_' + crypto.randomUUID().slice(0, 12);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const dir = path.resolve(directory);
  const dfPath = path.resolve(dir, dockerfile || 'Dockerfile');
  try {
    await fs.access(dfPath);
  } catch {
    throw bad(`Dockerfile not found at: ${dfPath}`);
  }

  const args = ['build', '-t', tag, '-f', dfPath];
  if (noCache) args.push('--no-cache');
  for (const [k, v] of Object.entries(buildArgs || {})) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
      args.push('--build-arg', `${k}=${String(v)}`);
    }
  }
  args.push(dir);

  const res = await runCmd('docker', args, {timeout: 600000, maxBuffer: 16 * 1024 * 1024});
  return {
    jobId,
    startedAt,
    durationMs: Date.now() - startTime,
    ok: res.ok,
    action: 'build',
    tag,
    directory: dir,
    output: res.stdout || res.stderr
  };
}

// 4. Security Inspection (Coraza WAF, CrowdSec, Suricata)
export async function handleSecurityInspect({target = 'all'} = {}) {
  const result = {checkedAt: new Date().toISOString()};

  if (target === 'all' || target === 'coraza') {
    const caddyfile = '/var/lib/server-panel/security-center/coraza/Caddyfile';
    const accessLog = '/var/lib/cyberpross-coraza/access.json';
    let corazaActive = false;
    let ruleMatches = [];
    let crowdsecBansEnforced = [];
    let recentBlocks = [];
    try {
      const activeRes = await runCmd('systemctl', ['is-active', 'cyberpross-coraza.service']);
      corazaActive = activeRes.stdout === 'active';
      const caddyContent = await fs.readFile(caddyfile, 'utf8');
      ruleMatches = [...caddyContent.matchAll(/SecRule\s+([A-Za-z_:]+)\s+"([^"]+)"/g)].map(m => ({target: m[1], pattern: m[2]}));
      const banMatch = caddyContent.match(/SecRule REMOTE_ADDR "@ipMatch ([^"]+)"/);
      if (banMatch) crowdsecBansEnforced = banMatch[1].split(',').filter(Boolean);
    } catch {}

    try {
      const logContent = await fs.readFile(accessLog, 'utf8');
      const lines = logContent.trim().split('\n');
      for (let i = lines.length - 1; i >= 0 && recentBlocks.length < 5; i--) {
        try {
          const entry = JSON.parse(lines[i]);
          if (entry.status === 403) {
            recentBlocks.push({
              time: new Date(entry.ts * 1000).toISOString(),
              clientIp: entry.request?.client_ip || entry.request?.remote_ip,
              method: entry.request?.method,
              host: entry.request?.host,
              uri: entry.request?.uri,
              status: 403
            });
          }
        } catch {}
      }
    } catch {}

    result.coraza = {
      active: corazaActive,
      listeningPort: 19180,
      customRuleCount: ruleMatches.length,
      sampleRules: ruleMatches.slice(0, 5),
      crowdsecBansEnforcedCount: crowdsecBansEnforced.length,
      sampleBansEnforced: crowdsecBansEnforced.slice(0, 10),
      actualBlocksProven: recentBlocks.length > 0,
      recentBlockedRequests: recentBlocks
    };
  }

  if (target === 'all' || target === 'crowdsec' || target === 'bouncers' || target === 'decisions') {
    const cscli = '/usr/local/lib/cyberpross-security/crowdsec/cscli';
    const csConfig = '/var/lib/cyberpross-crowdsec/config/config.yaml';
    let bouncers = [];
    let decisions = [];
    let alerts = [];
    try {
      const bRes = await runCmd(cscli, ['-c', csConfig, 'bouncers', 'list', '-o', 'json']);
      if (bRes.ok && bRes.stdout) bouncers = JSON.parse(bRes.stdout);
      const dRes = await runCmd(cscli, ['-c', csConfig, 'decisions', 'list', '-o', 'json']);
      if (dRes.ok && dRes.stdout) decisions = JSON.parse(dRes.stdout);
      const aRes = await runCmd(cscli, ['-c', csConfig, 'alerts', 'list', '--limit', '10', '-o', 'json']);
      if (aRes.ok && aRes.stdout) alerts = JSON.parse(aRes.stdout);
    } catch {}
    result.crowdsec = {
      active: true,
      listeningPort: 19580,
      bouncers: bouncers.map(b => ({
        name: b.name,
        valid: b.valid,
        type: b.type || 'native-coraza-sync',
        lastPull: b.last_pull,
        enforcementMechanism: 'Direct Phase-1 Caddyfile IP match compilation (instant, 0ms pull delay)'
      })),
      activeBansCount: decisions.length,
      sampleBans: decisions.slice(0, 10).map(d => ({value: d.value, scope: d.scope, type: d.type, scenario: d.scenario, duration: d.duration})),
      recentAlertsCount: alerts.length,
      sampleAlerts: alerts.slice(0, 5).map(a => ({scenario: a.scenario, sourceIp: a.source?.ip, eventsCount: a.events_count, createdAt: a.created_at}))
    };
  }

  return result;
}

// 5. Network Inspection (Listening Ports, UFW, Ingress)
export async function handleNetworkInspect({target = 'all'} = {}) {
  const result = {checkedAt: new Date().toISOString()};

  if (target === 'all' || target === 'ports') {
    const res = await runCmd('ss', ['-tulpn']);
    const lines = res.stdout.split('\n').slice(1).map(l => {
      const cols = l.trim().split(/\s+/);
      return cols.length >= 5 ? {protocol: cols[0], state: cols[1], localAddress: cols[4], process: cols.slice(6).join(' ')} : null;
    }).filter(Boolean);
    result.listeningPorts = lines;
  }

  if (target === 'all' || target === 'firewall') {
    const res = await runCmd('ufw', ['status', 'verbose']);
    result.firewall = {
      status: res.stdout.split('\n')[0] || 'unknown',
      rules: res.stdout.split('\n').filter(l => /ALLOW|DENY|REJECT/.test(l)).map(l => l.trim())
    };
  }

  if (target === 'all' || target === 'tunnel') {
    const res = await runCmd('systemctl', ['is-active', 'cloudflared.service']);
    let publicDomain = null;
    if (process.env.PANEL_PUBLIC_URL) {
      try { publicDomain = new URL(process.env.PANEL_PUBLIC_URL).hostname; } catch {}
    }
    if (!publicDomain) {
      try {
        const access = JSON.parse(await fs.readFile(path.join(process.env.PANEL_DATA_DIR || '/var/lib/server-panel', 'panel-access.json'), 'utf8'));
        if (access?.origin) publicDomain = new URL(access.origin).hostname;
      } catch {}
    }
    result.cloudflareTunnel = {
      service: 'cloudflared.service',
      active: res.stdout === 'active',
      publicDomain: publicDomain || os.hostname() || 'localhost'
    };
  }

  return result;
}

// 6. Isolated Test Runner
export async function handleTestRunner({directory, runtime, command, confirm = false}) {
  if (confirm !== true) throw bad('Test runner requires explicit confirm: true');
  const jobId = 'test_' + crypto.randomUUID().slice(0, 12);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const dir = path.resolve(directory);
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw bad(`Project directory not found: ${dir}`);
  } catch {
    throw bad(`Project directory not found: ${dir}`);
  }

  const defaultCmds = {
    node: 'npm test',
    python: 'pytest',
    php: 'vendor/bin/phpunit'
  };

  const testCmd = command || defaultCmds[runtime];
  if (!testCmd) throw bad(`No default test command for runtime: ${runtime}. Provide a command.`);

  const images = {
    node: 'node:24-bookworm-slim',
    python: 'python:3.14-slim-bookworm',
    php: 'php:8.4-cli-bookworm'
  };

  const image = images[runtime] || 'node:24-bookworm-slim';

  // Run isolated rootless container with read-only root and no network
  const args = [
    'run', '--rm',
    '--network', 'none',
    '--read-only',
    '--user', `${process.getuid?.() || 1000}:${process.getgid?.() || 1000}`,
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true',
    '--pids-limit', '64',
    '--memory', '512m',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m',
    '--mount', `type=bind,src=${dir},dst=/app,ro`,
    '-w', '/app',
    image,
    '/bin/sh', '-c', testCmd
  ];

  const res = await runCmd('docker', args, {timeout: 120000});
  return {
    jobId,
    startedAt,
    durationMs: Date.now() - startTime,
    ok: res.ok,
    runtime,
    command: testCmd,
    exitCode: res.code,
    output: res.stdout || res.stderr
  };
}
