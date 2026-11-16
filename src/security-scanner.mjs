import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bad} from './management.mjs';

const exec = promisify(execFile);

async function runCmd(cmd, args = [], options = {}) {
  try {
    const res = await exec(cmd, args, {timeout: options.timeout || 30000, maxBuffer: 8 * 1024 * 1024, cwd: options.cwd});
    return {ok: true, stdout: res.stdout.trim(), stderr: res.stderr.trim(), code: 0};
  } catch (err) {
    return {ok: false, stdout: (err.stdout || '').trim(), stderr: (err.stderr || err.message).trim(), code: err.code || 1};
  }
}

// Built-in secret detection patterns (Gitleaks equivalent regexes)
const SECRET_PATTERNS = [
  {name: 'AWS Access Key ID', pattern: /\b(AKIA[0-9A-Z]{16})\b/g, severity: 'CRITICAL'},
  {name: 'GitHub Personal Access Token', pattern: /\b(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82})\b/g, severity: 'CRITICAL'},
  {name: 'Generic Private Key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: 'CRITICAL'},
  {name: 'Slack Bot/User Token', pattern: /\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g, severity: 'HIGH'},
  {name: 'Generic API Key / Secret Assignment', pattern: /(?:api[_-]?key|secret|password|auth[_-]?token)\s*[:=]\s*['"]([A-Za-z0-9_\-./+=]{16,128})['"]/gi, severity: 'HIGH'}
];

async function scanSecretsInDirectory(dir, maxFiles = 300) {
  const findings = [];
  const ignoredDirs = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'vendor', '.panel-snapshots']);
  let scannedCount = 0;

  async function walk(currDir, relDir = '') {
    if (scannedCount >= maxFiles) return;
    let entries;
    try {
      entries = await fs.readdir(currDir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const e of entries) {
      if (scannedCount >= maxFiles) break;
      if (ignoredDirs.has(e.name)) continue;
      const full = path.join(currDir, e.name);
      const rel = path.join(relDir, e.name);
      if (e.isDirectory()) {
        await walk(full, rel);
      } else if (e.isFile()) {
        scannedCount++;
        // Skip .env.example, sample files, lock files, binary files
        if (rel.endsWith('.example') || rel.endsWith('.lock') || rel.endsWith('.min.js')) continue;
        try {
          const st = await fs.stat(full);
          if (st.size > 2 * 1024 * 1024) continue; // Skip files > 2MB
          const content = await fs.readFile(full, 'utf8');
          // Check if file is binary
          if (content.slice(0, 512).includes('\0')) continue;

          for (const rule of SECRET_PATTERNS) {
            const matches = [...content.matchAll(rule.pattern)];
            for (const m of matches) {
              const matchedStr = m[1] || m[0];
              // Mask the found secret
              const preview = matchedStr.length > 8
                ? matchedStr.slice(0, 4) + '...' + matchedStr.slice(-4)
                : '********';
              findings.push({
                file: rel,
                type: rule.name,
                severity: rule.severity,
                preview,
                line: content.slice(0, m.index).split('\n').length
              });
            }
          }
        } catch {}
      }
    }
  }

  await walk(dir);
  return {scannedFiles: scannedCount, findings};
}

export async function handleSecurityScan({directory = '', target = 'all', image = ''}) {
  const dir = directory ? path.resolve(directory) : process.cwd();
  const report = {
    scannedAt: new Date().toISOString(),
    directory: dir,
    summary: {critical: 0, high: 0, medium: 0, low: 0, totalSecrets: 0, totalVulnerabilities: 0},
    secrets: [],
    dependencies: [],
    containerVulnerabilities: [],
    recommendations: []
  };

  // 1. Secret Scanning
  if (target === 'all' || target === 'secrets') {
    const secResult = await scanSecretsInDirectory(dir);
    report.secrets = secResult.findings;
    report.summary.totalSecrets = secResult.findings.length;
    for (const f of secResult.findings) {
      if (f.severity === 'CRITICAL') report.summary.critical++;
      else if (f.severity === 'HIGH') report.summary.high++;
    }
    if (secResult.findings.length > 0) {
      report.recommendations.push('Remove hardcoded secrets from project files. Store credentials using panel_secrets and inject them via environment variables.');
    }
  }

  // 2. Dependency Vulnerability Scanning
  if (target === 'all' || target === 'dependencies') {
    const hasPackageJson = await fs.access(path.join(dir, 'package.json')).then(() => true, () => false);
    if (hasPackageJson) {
      const auditRes = await runCmd('npm', ['audit', '--json'], {cwd: dir});
      try {
        const auditData = JSON.parse(auditRes.stdout);
        const vulns = auditData.vulnerabilities || {};
        for (const [pkg, info] of Object.entries(vulns)) {
          const sev = (info.severity || 'low').toLowerCase();
          if (sev === 'critical') report.summary.critical++;
          else if (sev === 'high') report.summary.high++;
          else if (sev === 'moderate') report.summary.medium++;
          else report.summary.low++;
          report.summary.totalVulnerabilities++;
          report.dependencies.push({
            package: pkg,
            severity: sev.toUpperCase(),
            title: info.via?.[0]?.title || 'Known vulnerability',
            range: info.range || '',
            fixAvailable: Boolean(info.fixAvailable)
          });
        }
      } catch {}
    }

    const hasComposer = await fs.access(path.join(dir, 'composer.json')).then(() => true, () => false);
    if (hasComposer) {
      const compRes = await runCmd('composer', ['audit', '--format=json'], {cwd: dir});
      try {
        const cData = JSON.parse(compRes.stdout);
        const advisories = cData.advisories || {};
        for (const [pkg, advList] of Object.entries(advisories)) {
          for (const adv of advList) {
            report.summary.totalVulnerabilities++;
            report.dependencies.push({
              package: pkg,
              severity: 'HIGH',
              title: adv.title || 'Composer security advisory',
              cve: adv.cve || '',
              link: adv.link || ''
            });
          }
        }
      } catch {}
    }
  }

  // 3. Container Scan (if image specified or target is container)
  if ((target === 'all' || target === 'container') && image) {
    const trivyInstalled = await runCmd('which', ['trivy']).then(r => r.ok);
    if (trivyInstalled) {
      const tRes = await runCmd('trivy', ['image', '--format', 'json', '--quiet', image]);
      try {
        const tData = JSON.parse(tRes.stdout);
        for (const res of tData.Results || []) {
          for (const v of (res.Vulnerabilities || []).slice(0, 30)) {
            const sev = v.Severity || 'LOW';
            if (sev === 'CRITICAL') report.summary.critical++;
            else if (sev === 'HIGH') report.summary.high++;
            else if (sev === 'MEDIUM') report.summary.medium++;
            else report.summary.low++;
            report.containerVulnerabilities.push({
              vulnerabilityId: v.VulnerabilityID,
              package: v.PkgName,
              installedVersion: v.InstalledVersion,
              fixedVersion: v.FixedVersion || '',
              severity: sev,
              title: v.Title || ''
            });
          }
        }
      } catch {}
    } else {
      report.containerVulnerabilities.push({
        status: 'notice',
        message: 'Trivy scanner is not installed on host. Standard Docker container inspection is available via panel_docker_security_inspect.'
      });
    }
  }

  report.ok = true;
  return report;
}
