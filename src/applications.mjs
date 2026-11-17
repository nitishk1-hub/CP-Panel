import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import util from 'node:util';

const exec = util.promisify(execFile);

async function runCmd(cmd, args = []) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { timeout: 15000 });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { ok: false, error: err.message, stdout: err.stdout?.toString().trim() || '', stderr: err.stderr?.toString().trim() || '' };
  }
}

// Common sensitive key regex for masking secrets in .env and configuration files
const SENSITIVE_KEY_REGEX = /([A-Za-z0-9_]*(?:KEY|SECRET|PASSWORD|PASS|PASSWD|TOKEN|CREDENTIAL|PRIVATE|AUTH|SALT|CERT|WEBHOOK|URL|URI|DSN)[A-Za-z0-9_]*\s*=\s*)([^\r\n]+)/gi;

export function maskSecrets(content) {
  if (typeof content !== 'string') return content;
  return content.replace(SENSITIVE_KEY_REGEX, (match, prefix, val) => {
    const trimmed = val.trim();
    if (!trimmed || trimmed === '""' || trimmed === "''") return match;
    const quoteChar = (trimmed.startsWith('"') && trimmed.endsWith('"')) ? '"' : (trimmed.startsWith("'") && trimmed.endsWith("'")) ? "'" : '';
    const rawVal = quoteChar ? trimmed.slice(1, -1) : trimmed;
    if (rawVal.length <= 4) {
      return `${prefix}${quoteChar}••••••••${quoteChar}`;
    }
    const masked = `${rawVal.slice(0, 3)}••••••••${rawVal.slice(-2)}`;
    return `${prefix}${quoteChar}${masked}${quoteChar}`;
  });
}

// Scan a directory for common application configuration files
async function scanDirectoryConfigs(dir) {
  if (!dir) return [];
  const candidates = [
    '.env', '.env.local', '.env.production', '.sample.env',
    'app.py', 'main.py', 'server.py', 'wsgi.py',
    'pyproject.toml', 'requirements.txt', 'Pipfile', 'uv.lock',
    'package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js', 'next.config.js',
    'frontend/package.json', 'frontend/vite.config.ts', 'frontend/tsconfig.json',
    'compose.yml', 'compose.yaml', 'docker-compose.yml', 'docker-compose.yaml',
    'Dockerfile', 'Caddyfile', 'searxng-settings.yml'
  ];

  const found = [];
  for (const rel of candidates) {
    try {
      const full = path.join(dir, rel);
      const st = await fs.stat(full);
      if (st.isFile()) {
        const ext = path.extname(rel).toLowerCase();
        let type = 'config';
        if (rel.includes('.env')) type = 'env';
        else if (['.json', '.toml', '.yaml', '.yml'].includes(ext)) type = 'structured';
        else if (['.py', '.js', '.ts', '.mjs'].includes(ext)) type = 'code';
        else if (rel.toLowerCase().includes('compose') || rel === 'Dockerfile') type = 'docker';

        found.push({
          name: rel,
          path: full,
          type,
          size: st.size,
          updatedAt: st.mtime.toISOString()
        });
      }
    } catch {}
  }
  return found;
}

// Read Nginx virtual hosts in /etc/nginx/conf.d/
async function getNginxRoutes() {
  const routes = [];
  const nginxDir = '/etc/nginx/conf.d';
  try {
    const files = await fs.readdir(nginxDir);
    for (const f of files) {
      if (!f.endsWith('.conf') || f.startsWith('00-') || f.startsWith('01-')) continue;
      const full = path.join(nginxDir, f);
      const content = await fs.readFile(full, 'utf8').catch(() => '');
      const domainMatch = content.match(/server_name\s+([^;]+);/);
      const proxyMatch = content.match(/proxy_pass\s+([^;]+);/);
      const rootMatch = content.match(/root\s+([^;]+);/);
      if (domainMatch) {
        routes.push({
          file: f,
          path: full,
          domain: domainMatch[1].trim().split(/\s+/)[0],
          upstream: proxyMatch ? proxyMatch[1].trim() : null,
          root: rootMatch ? rootMatch[1].trim() : null
        });
      }
    }
  } catch {}
  return routes;
}

// Discover host-wide applications
export async function scanApplications() {
  const nginxRoutes = await getNginxRoutes();

  // 1. Docker containers
  const dockerRes = await runCmd('docker', ['ps', '-a', '--format', '{{json .}}']);
  const containers = [];
  if (dockerRes.ok && dockerRes.stdout) {
    for (const line of dockerRes.stdout.split('\n').filter(Boolean)) {
      try {
        containers.push(JSON.parse(line));
      } catch {}
    }
  }

  // Group compose projects
  const composeProjects = new Map();
  const standaloneContainers = [];

  for (const c of containers) {
    const labels = (c.Labels || '').split(',').reduce((acc, curr) => {
      const idx = curr.indexOf('=');
      if (idx !== -1) acc[curr.slice(0, idx).trim()] = curr.slice(idx + 1).trim();
      return acc;
    }, {});

    const projectName = labels['com.docker.compose.project'];
    const workingDir = labels['com.docker.compose.project.working_dir'];
    const configFile = labels['com.docker.compose.project.config_files'];

    if (projectName) {
      if (!composeProjects.has(projectName)) {
        composeProjects.set(projectName, {
          name: projectName,
          workingDir: workingDir || null,
          configFile: configFile || null,
          containers: []
        });
      }
      composeProjects.get(projectName).containers.push(c);
    } else {
      standaloneContainers.push(c);
    }
  }

  // 2. Systemd services
  const systemdRes = await runCmd('systemctl', ['list-units', '--type=service', '--state=running', '--no-pager', '--no-legend']);
  const runningUnits = systemdRes.ok && systemdRes.stdout
    ? systemdRes.stdout.split('\n').filter(Boolean).map(l => l.trim().split(/\s+/)[0])
    : [];

  const appServices = [];
  for (const unit of runningUnits) {
    if (!unit.endsWith('.service')) continue;
    const showRes = await runCmd('systemctl', [
      'show', unit,
      '--property=Description,WorkingDirectory,ExecStart,ActiveState,SubState,MainPID,User,FragmentPath,DropInPaths'
    ]);
    if (!showRes.ok) continue;

    const props = Object.fromEntries(showRes.stdout.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1)];
    }));

    const isApp = (
      unit.startsWith('openalgo') ||
      unit.startsWith('server-panel') ||
      unit.startsWith('cyberpross-coraza') ||
      unit.startsWith('cyberpross-crowdsec') ||
      unit.startsWith('cyberpross-security-db') ||
      unit.startsWith('cloudflared') ||
      (props.WorkingDirectory && (
        props.WorkingDirectory.startsWith('/home') ||
        props.WorkingDirectory.startsWith('/opt') ||
        props.WorkingDirectory.startsWith('/var/www')
      )) ||
      (props.ExecStart && /python|node|ruby|java|gunicorn|uvicorn|flask|npm|deno|bun/i.test(props.ExecStart))
    );

    if (isApp) {
      appServices.push({ unit, ...props });
    }
  }

  const applications = [];

  // A. OpenAlgo (Native / Hybrid Python + React)
  const algoService = appServices.find(s => s.unit === 'openalgo.service');
  const algoRoute = nginxRoutes.find(r => r.domain.includes('algo') || (r.upstream && r.upstream.includes(':5000')));
  const algoDir = algoService?.WorkingDirectory || '/home/cyber/Downloads/openalgo';
  const algoConfigs = await scanDirectoryConfigs(algoDir);

  if (algoService?.FragmentPath) {
    algoConfigs.push({
      name: 'openalgo.service (systemd unit)',
      path: algoService.FragmentPath,
      type: 'systemd',
      size: (await fs.stat(algoService.FragmentPath).catch(() => ({ size: 0 }))).size
    });
  }
  if (algoService?.DropInPaths) {
    for (const p of algoService.DropInPaths.split(/\s+/).filter(Boolean)) {
      algoConfigs.push({
        name: `${path.basename(p)} (drop-in)`,
        path: p,
        type: 'systemd',
        size: (await fs.stat(p).catch(() => ({ size: 0 }))).size
      });
    }
  }
  if (algoRoute?.path) {
    algoConfigs.push({
      name: 'Nginx Virtual Host',
      path: algoRoute.path,
      type: 'nginx',
      size: (await fs.stat(algoRoute.path).catch(() => ({ size: 0 }))).size
    });
  }

  if (algoConfigs.length === 0) {
    algoConfigs.push({
      name: 'openalgo.service (systemd unit)',
      path: '/etc/systemd/system/openalgo.service',
      type: 'systemd',
      size: (await fs.stat('/etc/systemd/system/openalgo.service').catch(() => ({ size: 0 }))).size
    });
  }

  applications.push({
    id: 'openalgo',
    name: 'OpenAlgo Trading Platform',
    badge: 'Hybrid (Python + React)',
    category: 'Fintech & Trading',
    type: 'hybrid',
    runtime: 'Python 3.12 + Node.js (React 19)',
    status: algoService?.ActiveState === 'active' ? 'running' : 'stopped',
    pid: algoService?.MainPID ? parseInt(algoService.MainPID, 10) : null,
    user: algoService?.User || 'openalgo',
    workingDirectory: algoDir,
    systemdUnit: 'openalgo.service',
    ports: [5000, 5555, 8765],
    upstream: 'http://127.0.0.1:5000',
    publicUrl: algoRoute ? `https://${algoRoute.domain}` : 'https://algo.cyberpross.cc',
    domain: algoRoute?.domain || 'algo.cyberpross.cc',
    wafStatus: 'OWASP CRS v4 Active',
    stack: {
      category: 'Hybrid (Python Backend + Node.js/React Frontend)',
      backend: {
        runtime: 'Python 3.12 (Flask, eventlet, Werkzeug)',
        entrypoint: 'app.py',
        environment: 'Python virtual environment (.venv / uv)',
        role: 'Core trading engine, order execution, broker adapters, WebSocket streaming, unified REST API (/api/v1/)',
        port: 5000
      },
      frontend: {
        runtime: 'React 19, TypeScript, Vite, Tailwind CSS, TanStack Query',
        sourceDirectory: path.join(algoDir, 'frontend'),
        productionServing: 'Built static assets compiled into frontend/dist/ and served by Flask on port 5000',
        role: 'Web dashboard, charting terminals, options suite, strategy builders, scalping terminal'
      }
    },
    configs: algoConfigs
  });

  // B. Server Panel (Native Node.js Control Panel)
  const panelService = appServices.find(s => s.unit === 'server-panel.service');
  const panelRoute = nginxRoutes.find(r => r.domain === 'cyber.cyberpross.cc' || (r.upstream && r.upstream.includes(':8787')));
  const panelDir = panelService?.WorkingDirectory || '/opt/server-panel/app';
  const panelConfigs = await scanDirectoryConfigs(panelDir);
  if (panelService?.FragmentPath) {
    panelConfigs.push({
      name: 'server-panel.service (systemd unit)',
      path: panelService.FragmentPath,
      type: 'systemd',
      size: (await fs.stat(panelService.FragmentPath).catch(() => ({ size: 0 }))).size
    });
  }
  if (panelRoute?.path) {
    panelConfigs.push({
      name: 'Nginx Virtual Host',
      path: panelRoute.path,
      type: 'nginx',
      size: (await fs.stat(panelRoute.path).catch(() => ({ size: 0 }))).size
    });
  }

  applications.push({
    id: 'server-panel',
    name: 'CP-Panel by CyberPross',
    badge: 'Native Node.js',
    category: 'Infrastructure & Management',
    type: 'native',
    runtime: 'Node.js 24 ES Modules',
    status: panelService?.ActiveState === 'active' ? 'running' : 'stopped',
    pid: panelService?.MainPID ? parseInt(panelService.MainPID, 10) : null,
    user: panelService?.User || 'root',
    workingDirectory: panelDir,
    systemdUnit: 'server-panel.service',
    ports: [8787],
    upstream: 'http://127.0.0.1:8787',
    publicUrl: panelRoute ? `https://${panelRoute.domain}` : 'https://cyber.cyberpross.cc',
    domain: panelRoute?.domain || 'cyber.cyberpross.cc',
    wafStatus: 'Bypass (Intentional Control Panel Route)',
    stack: {
      category: 'Node.js System Management Panel',
      backend: { runtime: 'Node.js 24', entrypoint: 'src/server.mjs', port: 8787 }
    },
    configs: panelConfigs
  });

  // C. n8n Compose Project
  const n8nProject = composeProjects.get('cyberpross-n8n');
  const n8nRoute = nginxRoutes.find(r => r.domain.includes('n8n') || (r.upstream && r.upstream.includes(':5678')));
  const n8nDir = n8nProject?.workingDir || '/opt/n8n';
  const n8nConfigs = await scanDirectoryConfigs(n8nDir);
  if (n8nRoute?.path) {
    n8nConfigs.push({
      name: 'Nginx Virtual Host',
      path: n8nRoute.path,
      type: 'nginx',
      size: (await fs.stat(n8nRoute.path).catch(() => ({ size: 0 }))).size
    });
  }

  const n8nMainContainer = n8nProject?.containers.find(c => c.Names?.includes('n8n-1') || c.Image?.includes('n8n'));
  applications.push({
    id: 'cyberpross-n8n',
    name: 'n8n Workflow Automation',
    badge: 'Docker Compose Stack',
    category: 'Automation & Integration',
    type: 'compose',
    runtime: 'Node.js (n8n 2.47) + PostgreSQL 17 + SearXNG',
    status: n8nMainContainer?.State === 'running' ? 'running' : 'stopped',
    workingDirectory: n8nDir,
    composeFile: n8nProject?.configFile || path.join(n8nDir, 'compose.yml'),
    containers: (n8nProject?.containers || []).map(c => ({ id: c.ID, name: c.Names, image: c.Image, status: c.Status, state: c.State })),
    ports: [5678, 5432, 8080],
    upstream: 'http://127.0.0.1:5678',
    publicUrl: n8nRoute ? `https://${n8nRoute.domain}` : 'https://n8n.cyberpross.cc',
    domain: n8nRoute?.domain || 'n8n.cyberpross.cc',
    wafStatus: 'OWASP CRS v4 Active',
    stack: {
      category: 'Docker Compose Multi-Container Workflow Engine',
      components: [
        'n8n Web UI & Task Orchestrator (:5678)',
        'PostgreSQL 17 Database Engine (:5432)',
        'SearXNG Privacy Metasearch Engine (:8080)',
        'Isolated Task Runners & DinD Sandbox'
      ]
    },
    configs: n8nConfigs
  });

  // D. Jellyfin Compose Project
  const jellyfinProject = composeProjects.get('cyber-jellyfin');
  const jellyfinRoute = nginxRoutes.find(r => r.domain.includes('jellyfin') || (r.upstream && r.upstream.includes(':8096')));
  const jellyfinDir = jellyfinProject?.workingDir || '/opt/jellyfin-private';
  const jellyfinConfigs = await scanDirectoryConfigs(jellyfinDir);
  if (jellyfinRoute?.path) {
    jellyfinConfigs.push({
      name: 'Nginx Virtual Host',
      path: jellyfinRoute.path,
      type: 'nginx',
      size: (await fs.stat(jellyfinRoute.path).catch(() => ({ size: 0 }))).size
    });
  }

  const jellyfinMain = jellyfinProject?.containers.find(c => c.Names?.includes('jellyfin'));
  applications.push({
    id: 'cyber-jellyfin',
    name: 'Jellyfin Media Server',
    badge: 'Docker Compose',
    category: 'Media & Streaming',
    type: 'compose',
    runtime: 'Jellyfin 12.4 (.NET Core)',
    status: jellyfinMain?.State === 'running' ? 'running' : 'stopped',
    workingDirectory: jellyfinDir,
    composeFile: jellyfinProject?.configFile || path.join(jellyfinDir, 'compose.yaml'),
    containers: (jellyfinProject?.containers || []).map(c => ({ id: c.ID, name: c.Names, image: c.Image, status: c.Status, state: c.State })),
    ports: [8096],
    upstream: 'http://127.0.0.1:8096',
    publicUrl: jellyfinRoute ? `https://${jellyfinRoute.domain}` : 'https://jellyfin.cyberpross.cc',
    domain: jellyfinRoute?.domain || 'jellyfin.cyberpross.cc',
    wafStatus: 'OWASP CRS v4 Active',
    stack: {
      category: 'Media Streaming Server',
      backend: { runtime: '.NET Core Jellyfin', port: 8096 }
    },
    configs: jellyfinConfigs
  });

  // E. CyberPross Main Static Site
  const webRoute = nginxRoutes.find(r => r.domain === 'cyberpross.cc');
  const webDir = webRoute?.root || '/var/www/cyberpross-recovered/cyberpross.cc/public';
  const webConfigs = await scanDirectoryConfigs(webDir);
  if (webRoute?.path) {
    webConfigs.push({
      name: 'Nginx Virtual Host',
      path: webRoute.path,
      type: 'nginx',
      size: (await fs.stat(webRoute.path).catch(() => ({ size: 0 }))).size
    });
  }

  applications.push({
    id: 'cyberpross-web',
    name: 'CyberPross Official Site',
    badge: 'Static Web Application',
    category: 'Web & Brand',
    type: 'static',
    runtime: 'Static HTML5 / CSS3 / JavaScript',
    status: 'running',
    workingDirectory: webDir,
    ports: [80, 443],
    publicUrl: 'https://cyberpross.cc',
    domain: 'cyberpross.cc',
    wafStatus: 'OWASP CRS v4 Active',
    stack: {
      category: 'High-Performance Static Web Application',
      serving: 'Nginx Native Static Asset Pipeline'
    },
    configs: webConfigs
  });

  // F. Grafana Container
  const grafanaCont = standaloneContainers.find(c => c.Names?.includes('grafana') || c.Image?.includes('grafana'));
  if (grafanaCont) {
    applications.push({
      id: 'cyberpross-grafana',
      name: 'Grafana Observability',
      badge: 'Docker Container',
      category: 'Telemetry & Observability',
      type: 'container',
      runtime: 'Grafana OSS',
      status: grafanaCont.State === 'running' ? 'running' : 'stopped',
      ports: [3030],
      upstream: 'http://127.0.0.1:3030',
      publicUrl: 'http://127.0.0.1:3030',
      wafStatus: 'Internal Telemetry Bus',
      stack: { category: 'Observability & Dashboards Engine' },
      configs: []
    });
  }

  // G. Coraza WAF Caddy Gateway
  const corazaService = appServices.find(s => s.unit === 'cyberpross-coraza.service');
  if (corazaService) {
    const corazaConfigs = [];
    if (corazaService.FragmentPath) {
      corazaConfigs.push({
        name: 'cyberpross-coraza.service',
        path: corazaService.FragmentPath,
        type: 'systemd',
        size: (await fs.stat(corazaService.FragmentPath).catch(() => ({ size: 0 }))).size
      });
    }
    applications.push({
      id: 'cyberpross-coraza',
      name: 'Coraza WAF Caddy Gateway',
      badge: 'Native Security Engine',
      category: 'Security & Protection',
      type: 'systemd',
      runtime: 'Coraza Caddy Go Binary (CRS v4)',
      status: corazaService.ActiveState === 'active' ? 'running' : 'stopped',
      pid: corazaService.MainPID ? parseInt(corazaService.MainPID, 10) : null,
      ports: [19180],
      wafStatus: 'OWASP Core Rule Set v4 Active',
      systemdUnit: 'cyberpross-coraza.service',
      configs: corazaConfigs
    });
  }

  // H. CrowdSec
  const crowdsecService = appServices.find(s => s.unit === 'cyberpross-crowdsec.service');
  if (crowdsecService) {
    applications.push({
      id: 'cyberpross-crowdsec',
      name: 'CrowdSec Threat Intelligence',
      badge: 'Native Security Engine',
      category: 'Security & Protection',
      type: 'systemd',
      runtime: 'CrowdSec LAPI Go Binary',
      status: crowdsecService.ActiveState === 'active' ? 'running' : 'stopped',
      pid: crowdsecService.MainPID ? parseInt(crowdsecService.MainPID, 10) : null,
      ports: [19580],
      systemdUnit: 'cyberpross-crowdsec.service',
      configs: []
    });
  }

  // I. Cloudflare Tunnel
  const cfService = appServices.find(s => s.unit === 'cloudflared.service');
  if (cfService) {
    applications.push({
      id: 'cloudflared',
      name: 'Cloudflare Zero-Trust Tunnel',
      badge: 'Native Ingress Connector',
      category: 'Networking & Ingress',
      type: 'systemd',
      runtime: 'Cloudflared Go Connector',
      status: cfService.ActiveState === 'active' ? 'running' : 'stopped',
      pid: cfService.MainPID ? parseInt(cfService.MainPID, 10) : null,
      ports: [20241],
      systemdUnit: 'cloudflared.service',
      configs: []
    });
  }

  // J. Dynamic User Compose Projects
  const knownAppIds = new Set(applications.map(a => a.id));
  for (const [projName, proj] of composeProjects.entries()) {
    if (knownAppIds.has(projName)) continue;
    const projRoute = nginxRoutes.find(r => r.domain.includes(projName) || proj.containers.some(c => (c.Ports || '').includes(r.upstream)));
    const projDir = proj.workingDir || (proj.configFile ? path.dirname(proj.configFile) : null);
    const projConfigs = projDir ? await scanDirectoryConfigs(projDir) : [];
    if (projRoute?.path) {
      projConfigs.push({
        name: 'Nginx Virtual Host',
        path: projRoute.path,
        type: 'nginx',
        size: (await fs.stat(projRoute.path).catch(() => ({ size: 0 }))).size
      });
    }
    const isRunning = proj.containers.some(c => c.State === 'running');
    applications.push({
      id: projName,
      name: projName,
      badge: 'Docker Compose Stack',
      category: 'User Application',
      type: 'compose',
      runtime: 'Docker Compose',
      status: isRunning ? 'running' : 'stopped',
      workingDirectory: projDir,
      composeFile: proj.configFile,
      containers: (proj.containers || []).map(c => ({ id: c.ID, name: c.Names, image: c.Image, status: c.Status, state: c.State })),
      publicUrl: projRoute ? `https://${projRoute.domain}` : null,
      domain: projRoute?.domain || null,
      wafStatus: 'OWASP CRS v4 Active',
      configs: projConfigs
    });
    knownAppIds.add(projName);
  }

  // K. Dynamic User Systemd Services
  for (const svc of appServices) {
    const svcId = svc.unit.replace(/\.service$/, '');
    if (knownAppIds.has(svcId) || svc.unit.startsWith('server-panel-') || svc.unit.startsWith('cyberpross-security')) continue;
    const svcRoute = nginxRoutes.find(r => r.domain.includes(svcId));
    const svcDir = svc.WorkingDirectory || null;
    const svcConfigs = svcDir ? await scanDirectoryConfigs(svcDir) : [];
    if (svc.FragmentPath) {
      svcConfigs.push({
        name: `${svc.unit} (systemd unit)`,
        path: svc.FragmentPath,
        type: 'systemd',
        size: (await fs.stat(svc.FragmentPath).catch(() => ({ size: 0 }))).size
      });
    }
    applications.push({
      id: svcId,
      name: svc.Description || svcId,
      badge: 'Native Service',
      category: 'User Application',
      type: 'systemd',
      runtime: svc.ExecStart || 'Native Service',
      status: svc.ActiveState === 'active' ? 'running' : 'stopped',
      pid: svc.MainPID ? parseInt(svc.MainPID, 10) : null,
      user: svc.User || 'root',
      workingDirectory: svcDir,
      systemdUnit: svc.unit,
      publicUrl: svcRoute ? `https://${svcRoute.domain}` : null,
      domain: svcRoute?.domain || null,
      wafStatus: 'OWASP CRS v4 Active',
      configs: svcConfigs
    });
    knownAppIds.add(svcId);
  }

  const runningCount = applications.filter(a => a.status === 'running').length;

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    summary: {
      total: applications.length,
      running: runningCount,
      hybrid: applications.filter(a => a.type === 'hybrid').length,
      compose: applications.filter(a => a.type === 'compose').length,
      native: applications.filter(a => ['native', 'systemd'].includes(a.type)).length,
      containers: standaloneContainers.length
    },
    applications
  };
}

// Safely retrieve application configuration file content
export async function getApplicationConfig(appId, relativeOrFullPath, unmask = false) {
  const scan = await scanApplications();
  const app = scan.applications.find(a => a.id === appId);
  if (!app) {
    throw new Error(`Application with ID "${appId}" not found`);
  }

  // Find configuration file in detected configs
  let matchedConfig = app.configs.find(c => c.name === relativeOrFullPath || c.path === relativeOrFullPath);
  let targetPath = matchedConfig?.path;

  if (!targetPath && app.workingDirectory) {
    // Resolve relative path securely within workingDirectory
    const resolved = path.resolve(app.workingDirectory, relativeOrFullPath);
    if (resolved.startsWith(path.resolve(app.workingDirectory))) {
      targetPath = resolved;
    }
  }

  if (!targetPath) {
    throw new Error(`Requested configuration file "${relativeOrFullPath}" is outside the application scope`);
  }

  let content = '';
  try {
    content = await fs.readFile(targetPath, 'utf8');
  } catch (err) {
    if (err.code === 'EACCES') {
      content = `# Protected Configuration File (${err.message})\n# This file requires host administrator (root) permissions to read.`;
    } else {
      throw err;
    }
  }
  let isMasked = false;

  // Mask secrets in .env or sensitive config files unless explicitly unmasked
  if (!unmask && (targetPath.includes('.env') || targetPath.endsWith('.conf') || targetPath.endsWith('.yaml') || targetPath.endsWith('.yml'))) {
    const masked = maskSecrets(content);
    if (masked !== content) {
      content = masked;
      isMasked = true;
    }
  }

  return {
    ok: true,
    appId,
    name: path.basename(targetPath),
    path: targetPath,
    size: Buffer.byteLength(content, 'utf8'),
    isMasked,
    content
  };
}

// Get live application logs
export async function getApplicationLogs(appId, lines = 100) {
  const scan = await scanApplications();
  const app = scan.applications.find(a => a.id === appId);
  if (!app) {
    throw new Error(`Application with ID "${appId}" not found`);
  }

  const numLines = Math.min(Math.max(10, parseInt(lines, 10) || 100), 1000);

  if (app.systemdUnit) {
    const res = await runCmd('journalctl', ['-u', app.systemdUnit, '-n', String(numLines), '--no-pager']);
    return {
      ok: true,
      appId,
      source: 'systemd',
      unit: app.systemdUnit,
      logs: res.stdout || res.stderr || 'No logs recorded.'
    };
  }

  if (app.type === 'compose' || app.type === 'container') {
    const containerName = app.containers?.[0]?.name || app.id;
    const res = await runCmd('docker', ['logs', containerName, '--tail', String(numLines)]);
    return {
      ok: true,
      appId,
      source: 'docker',
      container: containerName,
      logs: res.stdout || res.stderr || 'No logs recorded.'
    };
  }

  return { ok: true, appId, logs: 'Live logging is not configured for this application type.' };
}

// Restart application
export async function restartApplication(appId) {
  const scan = await scanApplications();
  const app = scan.applications.find(a => a.id === appId);
  if (!app) {
    throw new Error(`Application with ID "${appId}" not found`);
  }

  if (app.systemdUnit) {
    const res = await runCmd('systemctl', ['restart', app.systemdUnit]);
    if (!res.ok) throw new Error(`Failed to restart ${app.systemdUnit}: ${res.error || res.stderr}`);
    return { ok: true, message: `Service ${app.name} (${app.systemdUnit}) restarted successfully.` };
  }

  if (app.type === 'compose' && app.composeFile) {
    const res = await runCmd('docker', ['compose', '-f', app.composeFile, 'restart']);
    if (!res.ok) throw new Error(`Failed to restart compose project: ${res.error || res.stderr}`);
    return { ok: true, message: `Compose project ${app.name} restarted successfully.` };
  }

  if (app.type === 'container') {
    const containerName = app.id;
    const res = await runCmd('docker', ['restart', containerName]);
    if (!res.ok) throw new Error(`Failed to restart container: ${res.error || res.stderr}`);
    return { ok: true, message: `Container ${app.name} restarted successfully.` };
  }

  throw new Error(`Restart operation not supported for application type: ${app.type}`);
}
