import {candidateTargets} from './install-preflight.mjs';
import os from 'node:os';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
export async function command(file, args = []) {
  try { const {stdout} = await exec(file, args, {timeout: 3000, maxBuffer: 512000}); return {available:true, output:stdout.trim()}; }
  catch (e) { return {available:false, reason:e.code === 'ENOENT' ? 'not installed' : 'unavailable or permission denied'}; }
}
export async function detect() {
  let release = {};
  try { for (const line of (await fs.readFile('/etc/os-release','utf8')).split('\n')) { const m=line.match(/^([A-Z_]+)=(.*)$/); if(m) release[m[1]]=m[2].replace(/^"|"$/g,''); } } catch {}
  const results=await Promise.all([command('docker',['version','--format','{{.Server.Version}}']),command('podman',['--version']),command('systemctl',['is-system-running']),command('nft',['list','ruleset']),command('ss',['-H','-ltn']),command('findmnt',['-n','-o','FSTYPE','/'])]);
  const disk=await fs.statfs('/');
  return {observedAt:new Date().toISOString(),hostname:os.hostname(),platform:os.platform(),architecture:os.arch(),kernel:os.release(),os:release.PRETTY_NAME || os.type(),osId:release.ID || 'unknown',osVersion:release.VERSION_ID || '',cpuCount:os.availableParallelism(),memory:{total:os.totalmem(),free:os.freemem()},disk:{total:disk.blocks*disk.bsize,available:disk.bavail*disk.bsize},uptime:os.uptime(),load:os.loadavg(),runningAsRoot:process.getuid?.()===0,tools:Object.fromEntries(['docker','podman','systemd','firewall','listeners','filesystem'].map((k,i)=>[k,results[i]]))};
}
export function deploymentPlan(host) {
  const supported=host.platform==='linux' && host.architecture==='x64' && Boolean(candidateTargets[host.osId]?.includes(host.osVersion));
  return {schemaVersion:1,generatedAt:new Date().toISOString(),mode:'preview',supported,steps:[
    {id:'host',title:'Verify Linux host compatibility',state:supported?'ready':'blocked',detail:supported?'Detected candidate target; full disposable-VM qualification remains required.':'Initial installer targets x86-64 Ubuntu 24.04 and Debian 12/13 with systemd.'},
    {id:'runtime',title:'Container runtime',state:host.tools.docker.available?'detected':'required',detail:host.tools.docker.available?'Docker daemon responded.':'Install or grant access to a reviewed container runtime.'},
    {id:'identity',title:'Local accounts and authenticator MFA',state:'pending',detail:'Complete administrator setup and MFA; test recovery before remote access.'},
    {id:'waf',title:'Optional native Coraza and Suricata protection',state:'pending',detail:'Select the security profile, configure its private event database and verify actual ingress coverage.'},
    {id:'backups',title:'Encrypted off-site backups',state:'pending',detail:'Requires destination, separate credentials and a successful restore.'},
    {id:'network',title:'Private administration and firewall',state:'pending',detail:'Preserve existing SSH access; verify routes before applying rules.'}
  ],blockers:[...(!supported?['Unsupported operating system']:[]),'Production domain and target server selection','Reviewed image digests','Off-site backup destination'],host:{os:host.os,architecture:host.architecture,memory:host.memory.total}};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(deploymentPlan(await detect()),null,2));
