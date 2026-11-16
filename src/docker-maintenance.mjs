import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {bad} from './management.mjs';
const exec=promisify(execFile);
const prefix='com.docker.compose.';
export function dockerEnvironment(){return Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','HOME','USER','LOGNAME','LANG','TZ','TMPDIR','XDG_RUNTIME_DIR','SSH_AUTH_SOCK'].includes(key)||key.startsWith('DOCKER_')));}
export async function dockerRead(args,options={}){try{return await exec('docker',args,{timeout:30000,maxBuffer:4*1024*1024,env:dockerEnvironment(),...options});}catch{throw bad('Docker could not read the requested configuration. Check engine access, Compose files and saved environment variables.');}}
export function dockerStream(args,log,options={}){return new Promise((resolve,reject)=>{const child=spawn('docker',args,{env:dockerEnvironment(),stdio:['ignore','pipe','pipe'],...options});let expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGTERM');},15*60000);const force=setTimeout(()=>child.kill('SIGKILL'),15*60000+5000);child.stdout.on('data',chunk=>log(chunk.toString()));child.stderr.on('data',chunk=>log(chunk.toString()));child.on('error',()=>{clearTimeout(timer);clearTimeout(force);reject(bad('Docker command could not be started'));});child.on('close',code=>{clearTimeout(timer);clearTimeout(force);if(expired)reject(bad('Docker operation timed out. Check project status before retrying.'));else if(code!==0)reject(bad('Docker reported an error. Check the operation output; no automatic rollback was attempted.'));else resolve();});});}
function parse(text){try{return JSON.parse(text);}catch{throw bad('Docker returned an unsupported response');}}
function split(value){return String(value||'').split(',').map(s=>s.trim()).filter(Boolean);}
async function projectContext(name,read){
 if(typeof name!=='string'||!/^[a-z0-9][a-z0-9_-]{0,100}$/.test(name))throw bad('Invalid Compose project name');
 const listed=parse((await read(['compose','ls','--all','--format','json'])).stdout);
 if(!listed.some(p=>p.Name===name))throw bad('Compose project was not discovered on this engine',404);
 const ids=(await read(['ps','--all','--quiet','--filter',`label=${prefix}project=${name}`])).stdout.trim().split('\n').filter(Boolean);
 if(!ids.length||!ids.every(id=>/^[a-f0-9]{12,64}$/.test(id)))throw bad('No inspectable project containers were found');
 const inspected=parse((await read(['inspect',...ids])).stdout);
 const containers=inspected.filter(c=>c.Config?.Labels?.[prefix+'project']===name&&c.Config.Labels[prefix+'oneoff']!=='True'&&!c.Config.Labels[prefix+'hook']);
 if(!containers.length)throw bad('No deployed Compose services were found');
 const first=containers[0].Config.Labels;
 const cwd=first[prefix+'project.working_dir'],configuredFiles=split(first[prefix+'project.config_files']),environmentFiles=split(first[prefix+'project.environment_file']);
 if(!cwd||!path.isAbsolute(cwd)||!configuredFiles.length||configuredFiles.some(f=>!path.isAbsolute(f)))throw bad('Original working directory or Compose file metadata is missing. Update from the original deployment directory instead.');
 for(const c of containers){const l=c.Config.Labels;if(l[prefix+'project.working_dir']!==cwd||JSON.stringify(split(l[prefix+'project.config_files']))!==JSON.stringify(configuredFiles)||JSON.stringify(split(l[prefix+'project.environment_file']))!==JSON.stringify(environmentFiles))throw bad('Project containers have conflicting deployment metadata. Resolve the project configuration before updating.');}
 const workingDirectory=await fs.realpath(cwd);if(!(await fs.stat(workingDirectory)).isDirectory())throw bad('Original project directory is unavailable');
 const files=await Promise.all(configuredFiles.map(f=>fs.realpath(f)));
 const envFiles=await Promise.all(environmentFiles.map(f=>fs.realpath(path.resolve(workingDirectory,f))));
 const args=['compose','--project-name',name,'--project-directory',workingDirectory,...files.flatMap(f=>['--file',f]),...envFiles.flatMap(f=>['--env-file',f])];
 const scales={};for(const c of containers){const service=c.Config.Labels[prefix+'service'];if(!service||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(service))throw bad('Invalid deployed service metadata');scales[service]=(scales[service]||0)+1;}
 return {project:name,files,envFiles,workingDirectory,args,scales};
}
export function createDockerMaintenance({read=dockerRead,stream=dockerStream}={}){
 const preview=async name=>{
  const context=await projectContext(name,read);
  const result=await read([...context.args,'config','--format','json'],{cwd:context.workingDirectory});
  if(/variable.*not set|defaulting to a blank|unset variable|required variable/i.test(result.stderr||''))throw bad('Compose has missing environment variables. Save the original values in its .env or recorded env files before updating.');
  const config=parse(result.stdout);
  const services=Object.keys(context.scales).map(name=>{const s=config.services?.[name];if(!s)throw bad('A deployed service is missing from the current Compose configuration: '+name);return {name,image:s.image||null,localBuild:Boolean(s.build),replicas:context.scales[name]};});
  if(!services.length)throw bad('No services are available to update');
  const hash=crypto.createHash('sha256').update(JSON.stringify({...context,config}));
  for(const f of [...context.files,...context.envFiles])hash.update(await fs.readFile(f));
  const revision=hash.digest('hex');
  return {context,plan:{project:name,revision,files:context.files,environmentFiles:context.envFiles,workingDirectory:context.workingDirectory,services,warnings:['Uses the image tags or digests already configured; does not replace pinned versions with :latest.','Recreates changed containers and may interrupt service. Previously stopped deployed services may be started.','Keeps existing replica counts. Does not remove volumes, orphan containers or old images.','Local-build services are rebuilt only when explicitly selected. Original shell-only variables must be saved in .env or a recorded environment file.','A failed rollout can leave a partially updated project. Back up important data; automatic rollback is not provided.']}};
 };
 return {
  async preview(name){return (await preview(name)).plan;},
  async update(name,revision,log,mode='pull'){if(!['pull','build'].includes(mode))throw bad('Invalid update mode');if(typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))throw bad('Review the Compose update before starting');let prepared=await preview(name);if(prepared.plan.revision!==revision)throw bad('Project configuration changed. Review the update again.',409);log('Validated original project files and environment. Pulling current configured image tags.');const {context}=prepared;const services=prepared.plan.services.map(s=>s.name);
   if(prepared.plan.services.some(s=>!s.localBuild&&s.image))await stream([...context.args,'pull','--policy','always','--ignore-buildable','--include-deps',...services],log,{cwd:context.workingDirectory});else log('Only local-build services are deployed; no registry images to pull.');
   if(mode==='build'){const builds=prepared.plan.services.filter(s=>s.localBuild).map(s=>s.name);if(builds.length){log('Rebuilding configured local services with fresh base-image checks.');await stream([...context.args,'build','--pull',...builds],log,{cwd:context.workingDirectory});}}
   prepared=await preview(name);if(prepared.plan.revision!==revision)throw bad('Project configuration changed during the image pull. Redeployment was stopped; review again.',409);
   log('Image pull completed. Applying the project without deleting volumes or orphan containers.');
   await stream([...context.args,'up','--detach','--no-build','--pull','never','--wait','--wait-timeout','120',...Object.entries(context.scales).flatMap(([service,count])=>['--scale',`${service}=${count}`]),...services],log,{cwd:context.workingDirectory});
   log('Compose reports services running or healthy. Services without health checks have only a running-state check.');
  },
  async diskUsage(){const {stdout}=await read(['system','df','--format','json']);try{const parsed=JSON.parse(stdout);return Array.isArray(parsed)?parsed:[parsed];}catch{return stdout.trim().split('\n').filter(Boolean).map(parse);}},
  async cleanup({kind,olderThan='24h'},log){const args=cleanupCommand(kind,olderThan);log('Removing '+kind+' older than '+olderThan+'. Volumes, containers and networks are not pruned.');await stream(args,log);log('Cleanup finished. Docker output above reports reclaimed space.');}
 };
}
export function cleanupCommand(kind,olderThan='24h'){
 if(!['24h','168h','720h','all'].includes(olderThan))throw bad('Choose a supported cleanup age');
 const age=olderThan==='all'?[]:['--filter',`until=${olderThan}`];
 if(kind==='dangling-images')return ['image','prune','--force',...age];
 if(kind==='unused-images')return ['image','prune','--all','--force',...age];
 if(kind==='build-cache')return ['builder','prune','--all','--force',...age];
 throw bad('Choose dangling images, unused images or build cache');
}
