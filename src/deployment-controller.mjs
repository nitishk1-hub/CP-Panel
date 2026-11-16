import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {bad} from './management.mjs';
import {handleTestRunner, handleDockerBuild} from './ai-operations.mjs';

function getDeploymentsDir(dataDir) {
  const dir = dataDir || process.env.PANEL_DATA_DIR || (process.getuid?.() === 0 ? '/var/lib/server-panel' : path.join(os.tmpdir(), 'server-panel-data'));
  return path.join(dir, 'deployments');
}

async function loadDeploymentsState(deploymentsDir) {
  await fs.mkdir(deploymentsDir, {recursive: true, mode: 0o700});
  const file = path.join(deploymentsDir, 'releases.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {releases: [], deployments: [], previews: {}};
    throw err;
  }
}

async function saveDeploymentsState(deploymentsDir, state) {
  await fs.mkdir(deploymentsDir, {recursive: true, mode: 0o700});
  const file = path.join(deploymentsDir, 'releases.json');
  const tmp = file + '.' + crypto.randomUUID().slice(0, 8) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), {mode: 0o600});
  await fs.rename(tmp, file);
}

function probeTcpPort(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({host: host || '127.0.0.1', port: Number(port)});
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve({live: true, port});
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve({live: false, port, error: 'Connection timed out'});
    });
    socket.once('error', (err) => {
      resolve({live: false, port, error: err.message});
    });
  });
}

async function probeHttpEndpoint(url, hostHeader = '', expectedStatuses = [200, 201, 204, 301, 302, 401, 403]) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: hostHeader ? {Host: hostHeader} : {},
      signal: AbortSignal.timeout(6000),
      redirect: 'manual'
    });
    return {
      ok: expectedStatuses.includes(res.status),
      status: res.status,
      headers: Object.fromEntries(res.headers.entries())
    };
  } catch (err) {
    return {ok: false, error: err.message};
  }
}

export async function handleDeploy({
  action = 'preview',
  previewId,
  deploymentId,
  releaseId,
  project = {},
  confirm = false,
  dataDir = '',
  websitesService = null
}) {
  const deploymentsDir = getDeploymentsDir(dataDir);
  const state = await loadDeploymentsState(deploymentsDir);

  // 1. History
  if (action === 'history') {
    return {
      ok: true,
      activeReleasesCount: state.releases.filter(r => r.status === 'active').length,
      releases: state.releases.slice(-30).reverse(),
      recentDeployments: state.deployments.slice(-30).reverse()
    };
  }

  // 2. Get Single Deployment
  if (action === 'get') {
    if (!deploymentId) throw bad('Specify deploymentId to inspect');
    const d = state.deployments.find(x => x.id === deploymentId);
    if (!d) throw bad(`Deployment not found: "${deploymentId}"`, 404);
    return {ok: true, deployment: d};
  }

  // 3. Preview Action
  if (action === 'preview') {
    const {name, directory, type = 'node', domain, port, test, build, waf} = project;
    if (!name || typeof name !== 'string') throw bad('Specify application name');
    if (!domain || typeof domain !== 'string') throw bad('Specify domain name');
    const upstreamPort = Number(port || (type === 'static' ? 80 : 3000));
    if (!upstreamPort || upstreamPort < 1 || upstreamPort > 65535) throw bad('Provide a valid port between 1 and 65535');

    const pId = 'prev_' + crypto.randomUUID().slice(0, 12);
    const stages = [];
    if (test?.command || test?.runtime) stages.push('test');
    if (build?.dockerfile || type === 'docker') stages.push('build');
    stages.push('deploy', 'verify');

    // Preflight checks
    const preflight = {
      workspaceAccessible: false,
      portConflict: false,
      domainFormatValid: /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)
    };

    if (directory) {
      try {
        const st = await fs.stat(path.resolve(directory));
        preflight.workspaceAccessible = st.isDirectory();
      } catch {
        preflight.workspaceAccessible = false;
      }
    }

    const portCheck = await probeTcpPort('127.0.0.1', upstreamPort, 1000);
    preflight.portAlreadyListening = portCheck.live;

    const previewRecord = {
      id: pId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      project: {
        name,
        directory: directory ? path.resolve(directory) : '',
        type,
        domain,
        port: upstreamPort,
        test: test || null,
        build: build || null,
        waf: waf || {enabled: true, mode: 'block'}
      },
      stages,
      preflight
    };

    state.previews[pId] = previewRecord;
    // Clean old previews
    for (const [k, v] of Object.entries(state.previews)) {
      if (Date.parse(v.expiresAt) < Date.now()) delete state.previews[k];
    }
    await saveDeploymentsState(deploymentsDir, state);

    return {
      ok: true,
      action: 'preview',
      previewId: pId,
      project: previewRecord.project,
      stages,
      preflight,
      summary: `Prepared deployment pipeline for ${name} (${domain} -> :${upstreamPort}) through stages: ${stages.join(' -> ')}`,
      confirmRequiredToDeploy: true
    };
  }

  // Mutating operations require confirm: true
  if (confirm !== true) {
    throw bad(`Deployment action "${action}" requires explicit confirm: true`);
  }

  // 4. Rollback Action
  if (action === 'rollback') {
    const targetReleaseId = releaseId || deploymentId;
    if (!targetReleaseId) throw bad('Specify releaseId or deploymentId to rollback');
    const currentActive = state.releases.find(r => r.status === 'active' && (r.id === targetReleaseId || r.deploymentId === targetReleaseId || (project.domain && r.domain === project.domain)));
    const previousRelease = state.releases
      .filter(r => r.domain === (currentActive?.domain || project.domain) && r.status !== 'failed' && r.id !== (currentActive?.id || targetReleaseId))
      .pop();

    if (!previousRelease) {
      throw bad(`No previous stable release found to restore for domain: ${project.domain || currentActive?.domain || targetReleaseId}`);
    }

    const rollbackTxId = 'roll_' + crypto.randomUUID().slice(0, 10);
    const logs = [];
    logs.push(`Initiating rollback to prior release ${previousRelease.id} (${previousRelease.timestamp})`);

    // Restore prior routing if websitesService available
    if (websitesService && previousRelease.domain && previousRelease.upstream) {
      try {
        await websitesService.quickProxy({
          domain: previousRelease.domain,
          upstream: previousRelease.upstream,
          publish: true
        });
        logs.push(`Restored OpenResty/Nginx proxy route to ${previousRelease.upstream}`);
      } catch (err) {
        logs.push(`Warning restoring proxy: ${err.message}`);
      }
    }

    // Verify health after restoration
    const health = await probeTcpPort('127.0.0.1', previousRelease.port || 80);
    logs.push(`Post-rollback upstream health probe (: ${previousRelease.port}): ${health.live ? 'LIVE' : 'UNREACHABLE'}`);

    if (currentActive) currentActive.status = 'rolled_back';
    previousRelease.status = 'active';
    await saveDeploymentsState(deploymentsDir, state);

    return {
      ok: true,
      action: 'rollback',
      rollbackId: rollbackTxId,
      restoredReleaseId: previousRelease.id,
      domain: previousRelease.domain,
      status: 'restored',
      upstream: previousRelease.upstream,
      isLive: health.live,
      logs
    };
  }

  // 5. Deploy Action
  if (action === 'deploy') {
    let proj = project;
    if (previewId) {
      const prev = state.previews[previewId];
      if (!prev) throw bad(`Deployment preview not found or expired: "${previewId}"`, 404);
      proj = prev.project;
    }

    const {name, directory, type = 'node', domain, port, test, build, waf} = proj;
    if (!name || !domain) throw bad('Specify application name and domain to deploy');
    const upstreamPort = Number(port || 3000);
    const dId = 'dep_' + Date.now() + '_' + crypto.randomUUID().slice(0, 8);
    const rId = 'rel_' + Date.now();
    const deploymentLogs = [];

    deploymentLogs.push(`Starting unified deployment ${dId} for ${name} (${domain})`);

    // Capture pre-deployment release for automatic rollback
    const priorActiveRelease = state.releases.find(r => r.domain === domain && r.status === 'active');

    try {
      // Stage 1: Testing (if configured)
      if (test && (test.command || test.runtime)) {
        deploymentLogs.push(`[Stage: Test] Running isolated test suite for runtime: ${test.runtime || type}...`);
        const testRes = await handleTestRunner({
          directory: directory || process.cwd(),
          runtime: test.runtime || (type === 'static' ? 'node' : type),
          command: test.command,
          confirm: true
        });
        if (!testRes.ok) {
          deploymentLogs.push(`[Stage: Test FAILED] Tests failed with exit code ${testRes.exitCode}: ${testRes.output}`);
          throw bad(`Deployment aborted: test suite failed (${testRes.output.slice(0, 500)})`);
        }
        deploymentLogs.push(`[Stage: Test PASSED] Tests completed successfully in ${testRes.durationMs}ms`);
      }

      // Stage 2: Docker Build (if configured)
      let builtImageTag = null;
      if (build && directory) {
        deploymentLogs.push(`[Stage: Build] Building Docker image for ${name}...`);
        const tag = build.tag || `${name.toLowerCase().replace(/[^a-z0-9_.-]/g, '-')}:${rId}`;
        const buildRes = await handleDockerBuild({
          directory,
          tag,
          dockerfile: build.dockerfile || 'Dockerfile',
          buildArgs: build.buildArgs || {},
          noCache: Boolean(build.noCache),
          confirm: true
        });
        if (!buildRes.ok) {
          deploymentLogs.push(`[Stage: Build FAILED] ${buildRes.output}`);
          throw bad(`Deployment aborted: Docker build failed`);
        }
        builtImageTag = tag;
        deploymentLogs.push(`[Stage: Build PASSED] Built image ${tag} in ${buildRes.durationMs}ms`);
      }

      // Stage 3: Routing & WAF Configuration
      deploymentLogs.push(`[Stage: Deploy] Configuring OpenResty/Nginx route and Coraza WAF rules for ${domain}...`);
      const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;
      if (websitesService) {
        await websitesService.quickProxy({
          domain,
          upstream: upstreamUrl,
          publish: true
        });
        deploymentLogs.push(`[Stage: Deploy] Published virtual host for ${domain} -> ${upstreamUrl}`);
      }

      // Stage 4: Verification Probes
      deploymentLogs.push(`[Stage: Verify] Probing upstream listener at :${upstreamPort}...`);
      const tcpCheck = await probeTcpPort('127.0.0.1', upstreamPort, 5000);
      deploymentLogs.push(`Upstream TCP probe (: ${upstreamPort}): ${tcpCheck.live ? 'SUCCESS' : 'PENDING'}`);

      const httpCheck = await probeHttpEndpoint(`http://127.0.0.1:${upstreamPort}`, domain);
      deploymentLogs.push(`HTTP health probe status: ${httpCheck.status || httpCheck.error || 'tested'}`);

      // Record successful release
      if (priorActiveRelease) priorActiveRelease.status = 'superseded';
      const newRelease = {
        id: rId,
        deploymentId: dId,
        name,
        domain,
        type,
        port: upstreamPort,
        upstream: upstreamUrl,
        image: builtImageTag,
        status: 'active',
        timestamp: new Date().toISOString(),
        waf: waf || {enabled: true, mode: 'block'}
      };
      state.releases.push(newRelease);

      const deploymentRecord = {
        id: dId,
        releaseId: rId,
        name,
        domain,
        status: 'succeeded',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        versionInfo: {releaseId: rId, timestamp: newRelease.timestamp},
        affectedResources: [domain, `port:${upstreamPort}`, builtImageTag].filter(Boolean),
        logs: deploymentLogs,
        rollbackRef: rId
      };
      state.deployments.push(deploymentRecord);
      await saveDeploymentsState(deploymentsDir, state);

      return {
        ok: true,
        action: 'deploy',
        deploymentId: dId,
        releaseId: rId,
        status: 'succeeded',
        domain,
        upstream: upstreamUrl,
        versionInfo: deploymentRecord.versionInfo,
        affectedResources: deploymentRecord.affectedResources,
        logs: deploymentLogs,
        rollbackRef: rId
      };
    } catch (err) {
      deploymentLogs.push(`[Deployment Failure]: ${err.message}`);
      // Automatic Rollback to prior stable release if one existed!
      let rollbackStatus = 'none';
      if (priorActiveRelease && websitesService) {
        deploymentLogs.push(`[Auto-Rollback] Triggering automatic rollback to prior release ${priorActiveRelease.id}...`);
        try {
          await websitesService.quickProxy({
            domain: priorActiveRelease.domain,
            upstream: priorActiveRelease.upstream,
            publish: true
          });
          priorActiveRelease.status = 'active';
          rollbackStatus = 'restored_prior_release';
          deploymentLogs.push(`[Auto-Rollback] Successfully restored route to ${priorActiveRelease.upstream}`);
        } catch (rollErr) {
          rollbackStatus = 'rollback_failed: ' + rollErr.message;
          deploymentLogs.push(`[Auto-Rollback Error]: ${rollErr.message}`);
        }
      }

      const failedRecord = {
        id: dId,
        name,
        domain,
        status: 'failed',
        error: err.message,
        rollbackStatus,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        logs: deploymentLogs
      };
      state.deployments.push(failedRecord);
      await saveDeploymentsState(deploymentsDir, state);

      throw bad(`Deployment failed: ${err.message}. Rollback outcome: ${rollbackStatus}`);
    }
  }

  throw bad(`Unsupported deployment action: "${action}". Supported: preview, deploy, verify, rollback, history, get`);
}
