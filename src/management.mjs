import {anchoredSave,anchoredReadText} from './anchored-file.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {summaryTemplate,portSummary} from './docker-model.mjs';
import {createHostResources} from './host-resources.mjs';
const exec=promisify(execFile);
const SAFE_RUN_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  LANG: 'C.UTF-8',
  LC_ALL: 'C',
  DEBIAN_FRONTEND: 'noninteractive',
  NEEDRESTART_MODE: 'l'
};

export const run=async(file,args=[],options={})=>{
  try{
    const timeout = typeof options.timeout === 'number' ? options.timeout : 15000;
    const maxBuffer = typeof options.maxBuffer === 'number' ? options.maxBuffer : 2 * 1024 * 1024;
    const cwd = typeof options.cwd === 'string' ? options.cwd : undefined;
    const r=await exec(file,args,{timeout,maxBuffer,cwd,env:SAFE_RUN_ENV});
    return r.stdout.trim();
  }catch(e){
    throw Object.assign(new Error((e.stderr || e.message).trim().slice(0,2000)),{status:400});
  }
};
const hostResources=createHostResources();
export const bad=(message,status=400)=>Object.assign(new Error(message),{status});
let lastCpu=null,metricsCache=null,metricsStamp=0,metricsInflight=null;
export async function metrics(){
 if(metricsInflight)return metricsInflight;
 if(metricsCache&&Date.now()-metricsStamp<800)return metricsCache;
 metricsInflight=(async()=>{
  const cpu=()=>os.cpus().reduce((s,c)=>{s.idle+=c.times.idle;s.total+=Object.values(c.times).reduce((a,b)=>a+b,0);return s;},{idle:0,total:0});
  const now=Date.now();
  let a=lastCpu;
  if(!a||now-a.at<40||now-a.at>60000){a={...cpu(),at:now};await new Promise(r=>setTimeout(r,120));}
  const b={...cpu(),at:Date.now()};lastCpu=b;
  let available=os.freemem();try{const m=(await fs.readFile('/proc/meminfo','utf8')).match(/^MemAvailable:\s+(\d+)/m);if(m)available=Number(m[1])*1024;}catch{}
  const disk=await fs.statfs('/');
  const [network,mounts]=await Promise.all([hostResources.network(),hostResources.mounts()]);
  metricsCache={network,mounts,time:new Date().toISOString(),cpu:Math.max(0,Math.min(100,100*(1-(b.idle-a.idle)/Math.max(1,b.total-a.total)))),cores:os.availableParallelism(),memory:{total:os.totalmem(),used:os.totalmem()-available,available},disk:{total:disk.blocks*disk.bsize,used:(disk.blocks-disk.bfree)*disk.bsize,available:disk.bavail*disk.bsize},hostname:os.hostname(),uptime:os.uptime()};
  metricsStamp=Date.now();
  return metricsCache;
 })().finally(()=>{metricsInflight=null;});
 return metricsInflight;
}
const jsonLines=s=>s?s.split('\n').filter(Boolean).map(JSON.parse):[];
export async function dockerSnapshot(){
 let version;try{version=await run('docker',['version','--format','{{json .}}']);}catch(e){let installed=false;try{await run('docker',['--version']);installed=true;}catch{}return {available:false,installed,error:e.message,containers:[],stats:[],projects:[]};}
 const results=await Promise.allSettled([run('docker',['ps','-a','--no-trunc','--format','{{json .}}']),run('docker',['stats','--no-stream','--format','{{json .}}']),run('docker',['compose','ls','--all','--format','json'])]);
 const containers=results[0].status==='fulfilled'?jsonLines(results[0].value):[],errors=results.flatMap(r=>r.status==='rejected'?[r.reason.message]:[]);
 if(containers.length){try{const details=[];for(let i=0;i<containers.length;i+=50)details.push(...jsonLines(await run('docker',['inspect','--format',summaryTemplate,...containers.slice(i,i+50).map(c=>c.ID)])));const byId=new Map(details.map(c=>[c.ID,c]));for(const c of containers){const info=byId.get(c.ID);if(info)Object.assign(c,portSummary(info,info.Running??(c.State==='running')));}}catch{errors.push('Port and network inspection failed. Refresh to retry.');}}
 const projects=results[2].status==='fulfilled'?JSON.parse(results[2].value):[];
 for(const p of projects){const members=containers.filter(c=>c.Project===p.Name);p.Containers=members.map(c=>c.ID);p.PortDetailsAvailable=members.length>0&&members.every(c=>c.PublishedPorts!==undefined);p.PublishedPorts=members.flatMap(c=>(c.PublishedPorts||[]).map(port=>({...port,service:c.Service||c.Names})));p.Networks=[...new Set(members.flatMap(c=>c.Networks||[]))];p.HostNetworking=members.some(c=>c.NetworkMode==='host');}
 return {available:true,installed:true,version:JSON.parse(version).Server?.Version,containers,stats:results[1].status==='fulfilled'?jsonLines(results[1].value):[],projects,errors};
}
export async function confined(root,relative='.'){
 if(typeof relative!=='string'||relative.includes('\0'))throw bad('Invalid file path');
 const base=await fs.realpath(root),target=await fs.realpath(path.resolve(base,relative));
 if(path.relative(base,target).startsWith('..'+path.sep)||path.relative(base,target)==='..'||path.isAbsolute(path.relative(base,target)))throw bad('Path is outside the configured file root',403);
 return target;
}
export async function readText(target){return anchoredReadText(target);}

export async function saveText(target,text,revision){
 if(typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw bad('Text exceeds 1 MiB');
 return anchoredSave(target,text,revision);
}
export async function privileged(file,args,options={}){return process.getuid?.()===0?run(file,args,options):run('sudo',['-n','--',file,...args],options);}
export async function dockerPackages(action,log){
 const release=await fs.readFile('/etc/os-release','utf8');
 if(!/^ID=ubuntu$/m.test(release))throw bad('Automatic package management currently supports Ubuntu only');
 const ce=await run('dpkg-query',['-W','-f=${Status}','docker-ce']).catch(()=>'');
 const pkgs=ce.includes('install ok installed')?['docker-ce','docker-ce-cli','containerd.io','docker-buildx-plugin','docker-compose-plugin']:['docker.io','docker-compose-v2'];
 log('Using configured signed APT repositories. '+(action==='update'?'Upgrading ':'Installing ')+pkgs.join(', '));
 log(await privileged('apt-get',['update'],{timeout:180000}));
 for(const p of pkgs){const policy=await run('apt-cache',['policy',p]);if(!/Candidate: (?!\(none\))\S+/.test(policy))throw bad('No package candidate for '+p+'; no untrusted installer will be used');}
 log(await privileged('apt-get',['install','-y',...(action==='update'?['--only-upgrade']:[]),...pkgs],{timeout:900000,env:{DEBIAN_FRONTEND:'noninteractive'}}));
 log(await privileged('systemctl',['enable','--now','docker']));
 log('Completed. Existing daemon access permissions have been preserved.');
}
export async function firewallStatus(){try{return {available:true,output:await privileged('ufw',['status','numbered'])};}catch(e){return {available:false,error:e.message};}}
export async function composeFile(file){const snap=await dockerSnapshot();if(!snap.available)throw bad(snap.error);const paths=snap.projects.flatMap(p=>(p.ConfigFiles||'').split(',').filter(Boolean));for(const candidate of paths){try{if(await fs.realpath(candidate)===await fs.realpath(file))return await fs.realpath(file);}catch{}}throw bad('Only files discovered from Docker Compose projects are accessible',403);}
export async function containerAction(id,action){if(!/^[a-f0-9]{12,64}$/.test(id)||!['start','stop','restart'].includes(action))throw bad('Invalid container operation');return run('docker',[action,id],{timeout:60000});}
export async function terminal(command,cwd){if(typeof command!=='string'||command.length>8000)throw bad('Invalid command');return run('/bin/bash',['--noprofile','--norc','-c',command],{cwd,timeout:15000});}
