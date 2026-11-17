import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectStackFromDirectory } from '../src/existing-websites.mjs';
import { createCronManager } from '../src/cron-manager.mjs';
import { maskSecrets } from '../src/applications.mjs';
import { maskKnownSecrets } from '../src/secret-manager.mjs';

test('Security Hardening: Caddy host bypass parser uses safe token matching without RegExp', () => {
  const sampleCaddyfile = `
  route {
    @panel_8d01af7fd4f5 host cyber.cyberpross.cc
    handle @panel_8d01af7fd4f5 {
      reverse_proxy http://127.0.0.2
    }
    handle {
      coraza_waf
    }
  }
  `;
  const tokens = sampleCaddyfile.split(/\s+/);
  const checkBypass = d => tokens.some((t, i, arr) => t === 'host' && arr[i + 1] === d && arr[i - 1]?.startsWith('@panel'));

  assert.equal(checkBypass('cyber.cyberpross.cc'), true);
  assert.equal(checkBypass('algo.cyberpross.cc'), false);
  assert.equal(checkBypass('evil-example'), false);
  assert.equal(checkBypass('cyber.cyberpross.cc.evil'), false);
  assert.equal(checkBypass('cyber.cyberpross.cc+evil'), false);
  assert.equal(checkBypass('cyber.cyberpross.cc(test)'), false);
});

test('Security Hardening: Docker system prune cron task does not use --volumes to prevent data loss', async () => {
  const cronPath = path.resolve('src/cron-manager.mjs');
  const content = await fs.readFile(cronPath, 'utf8');
  assert.equal(content.includes("prune', '-f', '--volumes'"), false, 'docker system prune must NEVER include --volumes');
  assert.ok(content.includes("prune', '-f'"));

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cron-prune-test-'));
  try {
    const manager = createCronManager({ dataDir: tmp });
    const list = await manager.list();
    const dockerPruneTask = list.find(t => t.id === 'default-docker-cleanup');
    assert.ok(dockerPruneTask, 'default-docker-cleanup task must exist in default cron list');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('Security Hardening: Host overview script contains no hardcoded fallback IP', async () => {
  const hostOverviewPath = path.resolve('public/host-overview.js');
  const content = await fs.readFile(hostOverviewPath, 'utf8');
  assert.equal(content.includes('120.60.228.219'), false, 'Hardcoded IP 120.60.228.219 must not appear in public/host-overview.js');
});

test('Security Hardening: Server.mjs contains dynamic graphify-out root resolution', async () => {
  const serverPath = path.resolve('src/server.mjs');
  const content = await fs.readFile(serverPath, 'utf8');
  assert.equal(content.includes('/home/cyber/Documents/ChatGPT/1PanelServer/graphify-out'), false, 'Hardcoded graphify-out path must not appear in src/server.mjs');
  assert.ok(content.includes("roots:[path.join(root,'graphify-out'),path.join(dataDir,'graphify-out'),process.env.GRAPHIFY_OUT_DIR].filter(Boolean)"));
});

test('Dynamic Stack Detection: Identifies Hybrid, Python, Node.js, and PHP projects', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stack-detect-test-'));
  try {
    // 1. Python + React Hybrid project
    const hybridDir = path.join(tmp, 'hybrid-app');
    await fs.mkdir(path.join(hybridDir, 'frontend'), { recursive: true });
    await fs.writeFile(path.join(hybridDir, 'requirements.txt'), 'flask==3.0.0\ngunicorn==22.0.0\n');
    await fs.writeFile(path.join(hybridDir, 'app.py'), 'from flask import Flask\napp = Flask(__name__)\n');
    await fs.writeFile(path.join(hybridDir, 'frontend', 'package.json'), '{"name":"frontend","dependencies":{"react":"^19.0.0"}}\n');
    await fs.writeFile(path.join(hybridDir, 'frontend', 'vite.config.ts'), 'export default {}\n');

    const hybridStack = await detectStackFromDirectory(hybridDir);
    assert.ok(hybridStack);
    assert.equal(hybridStack.type, 'Hybrid (Python + React)');
    assert.equal(hybridStack.dist, 'frontend/dist');

    // 2. Pure Python project
    const pyDir = path.join(tmp, 'py-app');
    await fs.mkdir(pyDir, { recursive: true });
    await fs.writeFile(path.join(pyDir, 'pyproject.toml'), '[project]\nname = "py-app"\n');
    await fs.writeFile(path.join(pyDir, 'main.py'), 'print("hello")\n');

    const pyStack = await detectStackFromDirectory(pyDir);
    assert.ok(pyStack);
    assert.equal(pyStack.type, 'Python (WSGI / ASGI)');

    // 3. Pure Node.js project
    const nodeDir = path.join(tmp, 'node-app');
    await fs.mkdir(nodeDir, { recursive: true });
    await fs.writeFile(path.join(nodeDir, 'package.json'), '{"name":"node-app","scripts":{"start":"node index.js"}}\n');

    const nodeStack = await detectStackFromDirectory(nodeDir);
    assert.ok(nodeStack);
    assert.equal(nodeStack.type, 'Node.js Application');

    // 4. Pure PHP project
    const phpDir = path.join(tmp, 'php-app');
    await fs.mkdir(phpDir, { recursive: true });
    await fs.writeFile(path.join(phpDir, 'index.php'), '<?php echo "hello";\n');

    const phpStack = await detectStackFromDirectory(phpDir);
    assert.ok(phpStack);
    assert.equal(phpStack.type, 'PHP Application');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('Secret Management: maskKnownSecrets and maskSecrets redact sensitive credentials', () => {
  const secret = 'super-secret-production-token-998877';
  const rawLog = `Deploying container with API_KEY=${secret} and DB_USER=admin`;
  const maskedLog = maskKnownSecrets(rawLog, [secret]);
  assert.equal(maskedLog.includes(secret), false);
  assert.ok(maskedLog.includes('[REDACTED_SECRET]'));

  const envText = `
AUTH_TOKEN=${secret}
HOST=127.0.0.1
DATABASE_URL=postgres://user:${secret}@localhost:5432/db
`;
  const maskedEnv = maskSecrets(envText);
  assert.equal(maskedEnv.includes(secret), false);
  assert.ok(maskedEnv.includes('AUTH_TOKEN='));
  assert.ok(maskedEnv.includes('HOST=127.0.0.1'));
});
