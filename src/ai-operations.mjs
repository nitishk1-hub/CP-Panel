import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
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
  const dir = path.resolve(directory || process.cwd());

  if (action === 'clone') {
    if (confirm !== true) throw bad('Git clone requires explicit confirm: true');
    if (!repo || !/^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]+$/.test(repo)) throw bad('Provide a valid HTTPS Git repository URL');
    const args = ['clone'];
    if (depth && Number.isInteger(depth) && depth > 0) args.push(`--depth=${depth}`);
    if (branch && /^[a-zA-Z0-9_.-]+$/.test(branch)) args.push('-b', branch);
    args.push(repo, dir);
    const res = await runCmd('git', args, {timeout: 180000});
    return {ok: res.ok, action: 'clone', directory: dir, output: res.stdout || res.stderr};
  }

  // Directory must exist for remaining actions
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) throw bad(`Directory not found: ${dir}`);
  } catch {
    throw bad(`Directory not found: ${dir}`);
  }

  if (action === 'status') {
    const res = await runCmd('git', ['-C', dir, 'status', '--short']);
    return {ok: res.ok, action: 'status', directory: dir, status: res.stdout};
  }

  if (action === 'log') {
    const res = await runCmd('git', ['-C', dir, 'log', '-n', '15', '--oneline']);
    return {ok: res.ok, action: 'log', directory: dir, commits: res.stdout.split('\n').filter(Boolean)};
  }

  if (action === 'diff') {
    const res = await runCmd('git', ['-C', dir, 'diff'], {maxBuffer: 1024 * 1024});
    return {ok: res.ok, action: 'diff', directory: dir, diff: res.stdout.slice(0, 100000)};
  }

  if (action === 'branch') {
    const res = await runCmd('git', ['-C', dir, 'branch', '-a']);
    return {ok: res.ok, action: 'branch', directory: dir, branches: res.stdout.split('\n').map(b => b.trim()).filter(Boolean)};
  }

  if (action === 'pull') {
    if (confirm !== true) throw bad('Git pull requires explicit confirm: true');
    const res = await runCmd('git', ['-C', dir, 'pull']);
    return {ok: res.ok, action: 'pull', directory: dir, output: res.stdout || res.stderr};
  }

  if (action === 'checkout') {
    if (confirm !== true) throw bad('Git checkout requires explicit confirm: true');
    if (!branch || !/^[a-zA-Z0-9_.-]+$/.test(branch)) throw bad('Provide a valid branch or commit to checkout');
    const res = await runCmd('git', ['-C', dir, 'checkout', branch]);
    return {ok: res.ok, action: 'checkout', directory: dir, branch, output: res.stdout || res.stderr};
  }

  throw bad(`Unsupported Git action: ${action}`);
}

// 3. Docker Image Builder
export async function handleDockerBuild({directory, tag, dockerfile = 'Dockerfile', buildArgs = {}, noCache = false, confirm = false}) {
  if (confirm !== true) throw bad('Docker build requires explicit confirm: true');
  if (!tag || !/^[a-z0-9][a-z0-9_.-]*(?::[a-zA-Z0-9_.-]+)?$/.test(tag)) throw bad('Provide a valid Docker image tag (e.g. myapp:v1)');
  
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
    let corazaActive = false;
    let ruleMatches = [];
    try {
      const activeRes = await runCmd('systemctl', ['is-active', 'cyberpross-coraza.service']);
      corazaActive = activeRes.stdout === 'active';
      const caddyContent = await fs.readFile(caddyfile, 'utf8');
      ruleMatches = [...caddyContent.matchAll(/SecRule\s+([A-Za-z_:]+)\s+"([^"]+)"/g)].map(m => ({target: m[1], pattern: m[2]}));
    } catch {}
    result.coraza = {active: corazaActive, listeningPort: 19180, customRuleCount: ruleMatches.length, sampleRules: ruleMatches.slice(0, 5)};
  }

  if (target === 'all' || target === 'crowdsec' || target === 'bouncers' || target === 'decisions') {
    const cscli = '/usr/local/lib/cyberpross-security/crowdsec/cscli';
    const csConfig = '/var/lib/cyberpross-crowdsec/config/config.yaml';
    let bouncers = [];
    let decisions = [];
    try {
      const bRes = await runCmd(cscli, ['-c', csConfig, 'bouncers', 'list', '-o', 'json']);
      if (bRes.ok && bRes.stdout) bouncers = JSON.parse(bRes.stdout);
      const dRes = await runCmd(cscli, ['-c', csConfig, 'decisions', 'list', '-o', 'json']);
      if (dRes.ok && dRes.stdout) decisions = JSON.parse(dRes.stdout);
    } catch {}
    result.crowdsec = {
      active: true,
      listeningPort: 19580,
      bouncers: bouncers.map(b => ({name: b.name, valid: b.valid, type: b.type, lastPull: b.last_pull})),
      activeBansCount: decisions.length,
      sampleBans: decisions.slice(0, 10).map(d => ({value: d.value, scope: d.scope, type: d.type, scenario: d.scenario, duration: d.duration}))
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
    result.cloudflareTunnel = {
      service: 'cloudflared.service',
      active: res.stdout === 'active',
      publicDomain: 'cyber.cyberpross.cc'
    };
  }

  return result;
}

// 6. Isolated Test Runner
export async function handleTestRunner({directory, runtime, command, confirm = false}) {
  if (confirm !== true) throw bad('Test runner requires explicit confirm: true');
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
    ok: res.ok,
    runtime,
    command: testCmd,
    exitCode: res.code,
    output: res.stdout || res.stderr
  };
}
