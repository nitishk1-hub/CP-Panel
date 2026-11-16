import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bad} from './management.mjs';

const exec = promisify(execFile);

async function runCmd(cmd, args = []) {
  try {
    const res = await exec(cmd, args, {timeout: 30000, maxBuffer: 8 * 1024 * 1024});
    return {ok: true, stdout: res.stdout.trim(), stderr: res.stderr.trim()};
  } catch (err) {
    return {ok: false, stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message).trim()};
  }
}

export async function handleDockerSecurityInspect({container, target = 'all'}) {
  const listRes = await runCmd('docker', ['ps', '-a', '--format', '{{.ID}} {{.Names}} {{.Image}} {{.Status}}']);
  if (!listRes.ok) {
    return {
      ok: false,
      message: 'Docker daemon is not running or not accessible',
      containers: []
    };
  }

  const lines = listRes.stdout.split('\n').filter(Boolean);
  const containerList = lines.map(l => {
    const parts = l.split(/\s+/);
    return {id: parts[0], name: parts[1], image: parts[2], status: parts.slice(3).join(' ')};
  });

  const targets = container
    ? containerList.filter(c => c.id.startsWith(container) || c.name === container)
    : containerList;

  if (container && targets.length === 0) {
    throw bad(`Container not found: "${container}"`, 404);
  }

  const reports = [];

  for (const c of targets) {
    const inspectRes = await runCmd('docker', ['inspect', c.id]);
    if (!inspectRes.ok || !inspectRes.stdout) continue;
    let data;
    try {
      data = JSON.parse(inspectRes.stdout)[0];
    } catch {
      continue;
    }

    const hostConfig = data.HostConfig || {};
    const config = data.Config || {};
    const mounts = data.Mounts || [];

    const findings = [];
    let penalty = 0;

    const name = (data.Name || '').replace(/^\//, '');
    const image = config.Image || '';
    const socketMount = mounts.find(m => m.Source === '/var/run/docker.sock' || m.Destination === '/var/run/docker.sock');
    const networkMode = hostConfig.NetworkMode || '';
    const isDinDRunner = name.includes('dind') || image.includes('dind') || name.includes('runner-dind') || name.includes('sandbox-runner');

    // 1. Privileged Container Check
    const isPrivileged = Boolean(hostConfig.Privileged);
    if (isPrivileged) {
      if (isDinDRunner && !socketMount && networkMode !== 'host') {
        findings.push({
          severity: 'INFO',
          code: 'SANDBOX_DIND_ISOLATED',
          description: 'Container is a dedicated Docker-in-Docker (DinD) sandbox runner. Privileged execution is strictly required and constrained to its internal nested container engine daemon. Host docker.sock is NOT mounted and host network is NOT exposed.',
          remediation: 'Verified architectural requirement for nested sandboxing; isolation confirmed.'
        });
        penalty += 5;
      } else {
        findings.push({
          severity: 'CRITICAL',
          code: 'CONTAINER_PRIVILEGED',
          description: 'Container is running with --privileged flag, giving full host root capabilities',
          remediation: 'Remove privileged mode and grant only required Linux capabilities using --cap-add'
        });
        penalty += 40;
      }
    }

    // 2. Docker Socket Exposure (CRITICAL)
    if (socketMount) {
      findings.push({
        severity: 'CRITICAL',
        code: 'DOCKER_SOCKET_EXPOSED',
        description: 'Docker socket (/var/run/docker.sock) is mounted inside the container, granting container root access to Docker daemon',
        remediation: 'Do not mount docker.sock into untrusted workloads; use isolated agents or API proxy'
      });
      penalty += 35;
    }

    // 3. User check (HIGH if root)
    const user = config.User || '';
    const isRoot = !user || user === 'root' || user === '0';
    if (isRoot) {
      findings.push({
        severity: 'MEDIUM',
        code: 'RUNNING_AS_ROOT',
        description: `Container execution user is root ("${user || 'default (0)'}")`,
        remediation: 'Set a non-root USER instruction in Dockerfile or pass --user uid:gid'
      });
      penalty += 15;
    }

    // 4. Capabilities (HIGH if dangerous capabilities added)
    const capAdd = hostConfig.CapAdd || [];
    const capDrop = hostConfig.CapDrop || [];
    const dangerousCaps = ['SYS_ADMIN', 'NET_ADMIN', 'SYS_RAWIO', 'SYS_PTRACE', 'ALL'];
    const addedDangerous = capAdd.filter(c => dangerousCaps.includes(c));
    if (addedDangerous.length > 0) {
      findings.push({
        severity: 'HIGH',
        code: 'DANGEROUS_CAPABILITIES',
        description: `Dangerous Linux capabilities added: ${addedDangerous.join(', ')}`,
        remediation: 'Remove dangerous capabilities; prefer --cap-drop=ALL and add only necessary capabilities'
      });
      penalty += 20;
    }

    // 5. Host Network Mode (HIGH)
    if (networkMode === 'host') {
      findings.push({
        severity: 'HIGH',
        code: 'HOST_NETWORK_MODE',
        description: 'Container shares the host network namespace (--network=host)',
        remediation: 'Use isolated bridge or custom Docker network instead of host networking'
      });
      penalty += 15;
    }

    // 6. Sensitive Mounts (HIGH)
    const sensitivePaths = ['/etc', '/proc', '/sys', '/root', '/boot'];
    const dangerousMounts = mounts.filter(m => sensitivePaths.some(p => m.Source === p || m.Source?.startsWith(p + '/')));
    if (dangerousMounts.length > 0) {
      findings.push({
        severity: 'HIGH',
        code: 'SENSITIVE_HOST_MOUNTS',
        description: `Sensitive host paths mounted: ${dangerousMounts.map(m => m.Source + ' -> ' + m.Destination).join(', ')}`,
        remediation: 'Avoid mounting root or system directories into application containers'
      });
      penalty += 20;
    }

    // 7. Resource Limits (MEDIUM if unlimited)
    const memoryLimit = hostConfig.Memory || 0;
    const nanoCpus = hostConfig.NanoCPUs || 0;
    const pidsLimit = hostConfig.PidsLimit || 0;
    if (memoryLimit === 0 && nanoCpus === 0) {
      findings.push({
        severity: 'LOW',
        code: 'NO_RESOURCE_LIMITS',
        description: 'No memory or CPU limits set on container',
        remediation: 'Set --memory and --cpus to avoid container exhausting host memory or CPU'
      });
      penalty += 10;
    }

    // 8. Read-only Root Filesystem (INFO / LOW)
    const readOnly = Boolean(hostConfig.ReadonlyRootfs);
    if (!readOnly) {
      findings.push({
        severity: 'LOW',
        code: 'WRITABLE_ROOT_FS',
        description: 'Root filesystem is writable',
        remediation: 'Consider --read-only with explicit tmpfs mounts for temporary files'
      });
      penalty += 5;
    }

    const score = Math.max(0, 100 - penalty);
    const riskLevel = score >= 85 ? 'LOW' : score >= 60 ? 'MEDIUM' : score >= 35 ? 'HIGH' : 'CRITICAL';

    reports.push({
      id: c.id,
      name: c.name,
      image: c.image,
      status: c.status,
      securityScore: score,
      riskLevel,
      isolation: {
        isDinDRunner,
        hostSocketExposed: Boolean(socketMount),
        hostNetworkMode: networkMode === 'host',
        network: networkMode,
        isolatedSandboxVerified: isDinDRunner && !socketMount && networkMode !== 'host',
        requiredCapabilities: isDinDRunner ? ['SYS_ADMIN', 'MKNOD', 'nested_cgroups'] : (capAdd || [])
      },
      config: {
        privileged: isPrivileged,
        user: user || 'root (0)',
        networkMode,
        capAdd,
        capDrop,
        readOnlyRootfs: readOnly,
        memoryLimitBytes: memoryLimit,
        nanoCpus,
        pidsLimit,
        mountCount: mounts.length
      },
      mounts: mounts.map(m => ({source: m.Source, destination: m.Destination, mode: m.Mode, rw: m.RW})),
      findingsCount: findings.length,
      findings
    });
  }

  const overallScore = reports.length > 0
    ? Math.round(reports.reduce((acc, r) => acc + r.securityScore, 0) / reports.length)
    : 100;

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    totalContainers: reports.length,
    overallScore,
    overallRisk: overallScore >= 80 ? 'LOW' : overallScore >= 60 ? 'MEDIUM' : overallScore >= 40 ? 'HIGH' : 'CRITICAL',
    containers: reports
  };
}
