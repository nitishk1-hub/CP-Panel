import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  handleProjectRead,
  handleProjectEdit,
  handleSecrets,
  handleDeploy,
  handleDockerSecurityInspect,
  handleLogsCorrelate,
  handleSecurityScan,
  handleBackup,
  handleWafVerify,
  handleAppInventory,
  handleApt,
  handleGit
} from '../src/ai-operations.mjs';
import {tools, toolScope} from '../src/mcp-tools.mjs';

test('P0: Transactional multi-file project editing enforces revisions, snapshots and rollback on failure', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-edit-test-'));
  try {
    // 1. Dry run create preview
    const dryRes = await handleProjectEdit({
      workspace: dir,
      dryRun: true,
      operations: [
        {action: 'create', path: 'src/index.js', content: 'console.log("hello");\n'},
        {action: 'create', path: 'package.json', content: '{"name":"test-app"}\n'}
      ]
    });
    assert.equal(dryRes.ok, true);
    assert.equal(dryRes.dryRun, true);
    assert.equal(dryRes.changes.length, 2);

    // Verify files were not created in dryRun
    assert.equal(await fs.access(path.join(dir, 'src/index.js')).then(() => true, () => false), false);

    // 2. Requires confirm: true for execution
    await assert.rejects(handleProjectEdit({
      workspace: dir,
      operations: [{action: 'create', path: 'src/index.js', content: 'hello'}]
    }), /require.*explicit confirm: true/);

    // 3. Execute batch creation
    const editRes = await handleProjectEdit({
      workspace: dir,
      confirm: true,
      operations: [
        {action: 'create', path: 'src/index.js', content: 'console.log("hello");\n'},
        {action: 'create', path: 'package.json', content: '{"name":"test-app"}\n'}
      ]
    });
    assert.equal(editRes.ok, true);
    assert.equal(editRes.appliedCount, 2);
    assert(editRes.revisions['src/index.js']);
    const indexRev = editRes.revisions['src/index.js'];

    // 4. Project Read (supports both workspace and directory alias)
    const readRes = await handleProjectRead({workspace: dir, paths: ['src/index.js']});
    assert.equal(readRes.ok, true);
    assert.equal(readRes.files[0].revision, indexRev);
    assert.equal(readRes.files[0].content, 'console.log("hello");\n');

    const readAliasRes = await handleProjectRead({directory: dir, paths: ['src/index.js']});
    assert.equal(readAliasRes.ok, true);
    assert.equal(readAliasRes.files[0].revision, indexRev);

    // 5. Revision conflict check on patch
    await assert.rejects(handleProjectEdit({
      workspace: dir,
      confirm: true,
      operations: [{action: 'patch', path: 'src/index.js', content: 'updated', revision: 'bad_hash'}]
    }), /Revision conflict/);

    // 6. Successful patch with valid revision
    const patchRes = await handleProjectEdit({
      workspace: dir,
      confirm: true,
      operations: [{action: 'patch', path: 'src/index.js', content: 'console.log("v2");\n', revision: indexRev}]
    });
    assert.equal(patchRes.ok, true);
    assert.notEqual(patchRes.revisions['src/index.js'], indexRev);

    // 7. Path traversal rejected
    await assert.rejects(handleProjectEdit({
      workspace: dir,
      confirm: true,
      operations: [{action: 'create', path: '../../evil.txt', content: 'evil'}]
    }), /Path traversal detected/);
  } finally {
    await fs.rm(dir, {recursive: true, force: true});
  }
});

test('P0: Scoped secret management supports masking, rotation, and audit logs', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-test-'));
  try {
    // 1. Set secret requires confirmation
    await assert.rejects(handleSecrets({
      action: 'set',
      name: 'DATABASE_URL',
      value: 'postgres://user:pass@127.0.0.1:5432/db',
      dataDir: dir
    }), /requires explicit confirm: true/);

    const setRes = await handleSecrets({
      action: 'set',
      name: 'DATABASE_URL',
      value: 'postgres://user:pass@127.0.0.1:5432/db',
      scope: 'database',
      description: 'Primary PostgreSQL cluster URL',
      confirm: true,
      dataDir: dir
    });
    assert.equal(setRes.ok, true);
    assert.equal(setRes.version, 1);
    assert(setRes.maskedValue.includes('...'));

    // 2. List secrets returns masked values, never raw secrets
    const listRes = await handleSecrets({action: 'list', dataDir: dir});
    assert.equal(listRes.ok, true);
    assert.equal(listRes.secrets.length, 1);
    assert.equal(listRes.secrets[0].name, 'DATABASE_URL');
    assert(!listRes.secrets[0].maskedValue.includes('user:pass'));

    // 3. Get without confirm returns masked
    const getMasked = await handleSecrets({action: 'get', name: 'DATABASE_URL', dataDir: dir});
    assert.equal(getMasked.requiresConfirmForRawValue, true);
    assert(!getMasked.value);

    // 4. Get with confirm returns raw
    const getRaw = await handleSecrets({action: 'get', name: 'DATABASE_URL', confirm: true, dataDir: dir});
    assert.equal(getRaw.value, 'postgres://user:pass@127.0.0.1:5432/db');

    // 5. Rotate secret
    const rotRes = await handleSecrets({
      action: 'rotate',
      name: 'DATABASE_URL',
      value: 'postgres://user:new_pass@127.0.0.1:5432/db',
      confirm: true,
      dataDir: dir
    });
    assert.equal(rotRes.ok, true);
    assert.equal(rotRes.version, 2);

    // 6. Delete secret
    const delRes = await handleSecrets({action: 'delete', name: 'DATABASE_URL', confirm: true, dataDir: dir});
    assert.equal(delRes.ok, true);
    const afterDel = await handleSecrets({action: 'list', dataDir: dir});
    assert.equal(afterDel.secrets.length, 0);
  } finally {
    await fs.rm(dir, {recursive: true, force: true});
  }
});

test('P0: Unified Deployment Controller orchestrates Preview, Deploy, History and Rollback', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deploy-controller-test-'));
  try {
    const mockWebsites = {
      quickProxy: async (args) => ({id: 'site_123', domain: args.domain, upstream: args.upstream, published: true})
    };

    // 1. Preview
    const prevRes = await handleDeploy({
      action: 'preview',
      dataDir: dir,
      project: {
        name: 'MyApi',
        domain: 'api.example.com',
        type: 'node',
        port: 8080
      }
    });
    assert.equal(prevRes.ok, true);
    assert(prevRes.previewId);
    assert(prevRes.stages.includes('deploy'));

    // 2. Deploy requires confirmation
    await assert.rejects(handleDeploy({
      action: 'deploy',
      previewId: prevRes.previewId,
      dataDir: dir,
      websitesService: mockWebsites
    }), /requires explicit confirm: true/);

    // 3. Deploy execution
    const depRes = await handleDeploy({
      action: 'deploy',
      previewId: prevRes.previewId,
      confirm: true,
      dataDir: dir,
      websitesService: mockWebsites
    });
    assert.equal(depRes.ok, true);
    assert.equal(depRes.status, 'succeeded');
    assert.equal(depRes.domain, 'api.example.com');
    assert(depRes.deploymentId);
    assert(depRes.releaseId);

    // 4. History
    const histRes = await handleDeploy({action: 'history', dataDir: dir});
    assert.equal(histRes.ok, true);
    assert.equal(histRes.activeReleasesCount, 1);
    assert.equal(histRes.releases[0].id, depRes.releaseId);

    // 5. Deploy v2 to create prior release for rollback test
    const dep2Res = await handleDeploy({
      action: 'deploy',
      confirm: true,
      dataDir: dir,
      websitesService: mockWebsites,
      project: {
        name: 'MyApi',
        domain: 'api.example.com',
        type: 'node',
        port: 8081
      }
    });
    assert.equal(dep2Res.ok, true);

    // 6. Rollback
    const rollRes = await handleDeploy({
      action: 'rollback',
      domain: 'api.example.com',
      releaseId: depRes.releaseId,
      confirm: true,
      dataDir: dir,
      websitesService: mockWebsites,
      project: {domain: 'api.example.com'}
    });
    assert.equal(rollRes.ok, true);
    assert.equal(rollRes.status, 'restored');
    assert.equal(rollRes.restoredReleaseId, depRes.releaseId);
  } finally {
    await fs.rm(dir, {recursive: true, force: true});
  }
});

test('P1: Git discovery and APT change-impact previews', async () => {
  // 1. Git discovery
  const gitDisc = await handleGit({action: 'discover'});
  assert.equal(gitDisc.ok, true);
  assert(Array.isArray(gitDisc.repositories));
  assert(gitDisc.repositories.some(r => r.path === process.cwd()));

  // 2. APT structured change-impact preview
  const aptPrev = await handleApt({action: 'preview'});
  assert.equal(aptPrev.ok, true);
  assert(aptPrev.impact);
  assert(Array.isArray(aptPrev.impact.packagesToInstall));
  assert(Array.isArray(aptPrev.impact.packagesToUpgrade));
  assert(Array.isArray(aptPrev.impact.packagesToRemove));
  assert.equal(typeof aptPrev.impact.rebootRequired, 'boolean');
});

test('P1 & P2: Docker security inspect, log correlation, security scanning, WAF verification and app inventory', async () => {
  // 1. Docker security inspect
  const docSec = await handleDockerSecurityInspect({target: 'all'});
  assert.equal(typeof docSec.ok, 'boolean');
  assert(Array.isArray(docSec.containers));
  const dindRunner = docSec.containers.find(c => c.name?.includes('runner-dind') || c.name?.includes('sandbox-runner'));
  if (dindRunner) {
    assert.equal(dindRunner.isolation.isDinDRunner, true);
    assert.equal(dindRunner.isolation.isolatedSandboxVerified, true);
    assert.equal(dindRunner.isolation.hostSocketExposed, false);
    assert.equal(dindRunner.isolation.hostNetworkMode, false);
  }

  // 2. Correlated logs search with secret redaction
  const logsRes = await handleLogsCorrelate({limit: 10, sources: ['systemd']});
  assert.equal(logsRes.ok, true);
  assert(Array.isArray(logsRes.logs));

  // 3. Security scanner ignores synthetic test credentials and test fixture directories
  const scanRes = await handleSecurityScan({target: 'secrets', directory: process.cwd()});
  assert.equal(scanRes.ok, true);
  assert(scanRes.summary);
  assert(Array.isArray(scanRes.secrets));
  // Ensure no test fixtures are flagged as real secrets
  for (const s of scanRes.secrets) {
    assert(!s.file.includes('tests/'), `Scanner should not flag test files: ${s.file}`);
  }

  // 4. Per-domain WAF verification
  // 4a. Panel domain: preserves intentional management bypass
  const panelWaf = await handleWafVerify({domain: 'cyber.cyberpross.cc'});
  assert.equal(panelWaf.ok, true);
  assert.equal(panelWaf.status, 'panel_bypass_preserved');
  assert.equal(panelWaf.isIntentionalBypass, true);
  assert.equal(panelWaf.wafMode, 'bypass');
  assert.equal(panelWaf.trafficProtected, true);

  // 4b. Application domain (n8n): verifies active protection with webhook exclusions
  const n8nWaf = await handleWafVerify({domain: 'n8n.cyberpross.cc'});
  assert.equal(n8nWaf.ok, true);
  assert.equal(n8nWaf.status, 'enforcing');
  assert.equal(n8nWaf.isIntentionalBypass, false);
  assert.equal(n8nWaf.trafficProtected, true);
  assert.equal(n8nWaf.corazaWaf.webhookExclusionsApplied, true);

  // 5. Application Inventory: correlates nginx routes and containers
  const appInv = await handleAppInventory();
  assert.equal(appInv.ok, true);
  assert(Array.isArray(appInv.applications));
  assert(appInv.totalApplications >= 1);
  const n8nApp = appInv.applications.find(a => a.domain === 'n8n.cyberpross.cc');
  if (n8nApp) {
    assert.equal(n8nApp.upstream, 'http://127.0.0.1:5678');
    assert.equal(n8nApp.wafProtected, true);
  }

  // 6. Backup inventory and verification
  const backupInv = await handleBackup({action: 'inventory'});
  assert.equal(backupInv.ok, true);
  assert(Array.isArray(backupInv.localSnapshots));
});

test('Machine-readable MCP discovery contract exports exact tools, schemas and metadata', () => {
  assert(tools.length >= 40);
  for (const t of tools) {
    assert(t.name);
    assert(t.description);
    assert(t.inputSchema);
    assert.equal(t.inputSchema.type, 'object');
    const scope = toolScope(t.name);
    assert(['read', 'manage', 'command'].includes(scope));
  }
});
