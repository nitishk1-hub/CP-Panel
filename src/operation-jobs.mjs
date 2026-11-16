import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

const terminal=new Set(['succeeded','failed','interrupted']);
const idPattern=/^[a-f0-9-]{36}$/;
export async function createOperationJobs({directory,spawnProcess=spawn,maxConcurrent=6}={}) {
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const st=await fs.lstat(directory);
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('Unsafe operation storage');
 const jobs=new Map(),running=new Map();let closed=false,pending=0,storageError=null;
 const writeRecord=async j=>{const tmp=path.join(directory,j.id+'.tmp');const h=await fs.open(tmp,'w',0o600);try{await h.writeFile(JSON.stringify(j));await h.sync();}finally{await h.close();}await fs.rename(tmp,path.join(directory,j.id+'.json'));const d=await fs.open(directory,'r');try{await d.sync();}finally{await d.close();}};
 const persist=async j=>{try{return await writeRecord(j);}catch(e){storageError=e.message;j.state='failed';j.error='Operation storage is unavailable';j.finishedAt=new Date().toISOString();throw e;}};
 for(const file of await fs.readdir(directory))if(/^[a-f0-9-]{36}\.json$/.test(file)){
  const filename=path.join(directory,file),s=await fs.lstat(filename);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o077||s.size>65536)throw Error('Unsafe operation record');
  const j=JSON.parse(await fs.readFile(filename,'utf8'));if(!idPattern.test(j.id))throw Error('Invalid operation record');
  if(!terminal.has(j.state)){j.state='interrupted';j.finishedAt=new Date().toISOString();j.error='Agent restarted; automatic command replay is disabled';await persist(j);}jobs.set(j.id,j);
 }
 function get(id){if(!idPattern.test(String(id))||!jobs.has(id))throw Error('Unknown operation');return structuredClone(jobs.get(id));}
 async function logs(id,offset=0){get(id);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid log offset');const h=await fs.open(path.join(directory,id+'.log'),'r');try{const size=(await h.stat()).size;if(offset>size)throw Error('Invalid log offset');const b=Buffer.alloc(Math.min(65536,size-offset));const {bytesRead}=await h.read(b,0,b.length,offset);return {data:b.subarray(0,bytesRead).toString('base64'),encoding:'base64',offset,nextOffset:offset+bytesRead,complete:terminal.has(jobs.get(id).state)&&offset+bytesRead===size};}finally{await h.close();}}
 async function executeSubmission({executable,args=[],cwd='/',timeoutMs=120000,actor,permission,title}){
  if(closed)throw Error('Agent is stopping');if(storageError)throw Error('Operation storage is unavailable; new jobs are blocked');if(running.size+pending>maxConcurrent)throw Error('Operation capacity reached');
  if(typeof executable!=='string'||!path.isAbsolute(executable)||!Array.isArray(args)||args.length>256||args.some(a=>typeof a!=='string'||a.includes('\0')||a.length>16384)||!path.isAbsolute(cwd)||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3600000||typeof actor!=='string'||!actor||typeof permission!=='string'||!permission)throw Error('Invalid operation request');
  const j={id:crypto.randomUUID(),title:String(title||'Privileged operation').slice(0,200),request:{executable,cwd,argumentsHash:crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex')},actor:actor.slice(0,200),permission,state:'queued',createdAt:new Date().toISOString(),timeoutMs,exitCode:null,signal:null,logBytes:0};
  jobs.set(j.id,j);await persist(j);const log=await fs.open(path.join(directory,j.id+'.log'),'wx',0o600);
  if(closed){await log.close();j.state='interrupted';j.error='Agent stopped before execution';await persist(j);return get(j.id);}
  const env={PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C.UTF-8',TERM:'dumb',DEBIAN_FRONTEND:'noninteractive',PANEL_OPERATION_ID:j.id};
  j.state='running';j.startedAt=new Date().toISOString();await persist(j);
  let child;try{child=spawnProcess(executable,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});}catch(e){await log.close();j.state='failed';j.error=e.message;await persist(j);return get(j.id);}
  let chain=Promise.resolve(),reason=null,settled=false;const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
  running.set(j.id,{kill});
  const timer=setTimeout(()=>{reason='timeout';kill();},timeoutMs);timer.unref();
  const write=b=>{if(j.logBytes+b.length>4*1024*1024){reason='output-limit';kill();return;}j.logBytes+=b.length;chain=chain.then(()=>log.write(b)).catch(()=>{reason='log-storage-error';kill();});};
  child.stdout.on('data',write);child.stderr.on('data',write);
  const finish=async(code,signal,error)=>{if(settled)return;settled=true;clearTimeout(timer);await chain;await log.sync().catch(()=>{});await log.close();j.exitCode=code;j.signal=signal;j.reason=reason;j.state=!error&&!reason&&code===0?'succeeded':'failed';j.finishedAt=new Date().toISOString();if(error)j.error=error.message;await persist(j);running.delete(j.id);};
  child.on('error',e=>{void finish(null,null,e).catch(()=>{running.delete(j.id);});});child.on('close',(code,signal)=>{void finish(code,signal).catch(()=>{running.delete(j.id);});});
  return get(j.id);
 }
 async function submit(request){if(running.size+pending>=maxConcurrent)throw Error('Operation capacity reached');pending++;try{return await executeSubmission(request);}finally{pending--;}}
 return {submit,get,logs,list:()=>[...jobs.values()].map(j=>structuredClone(j)),async close(){closed=true;for(const r of running.values())r.kill();while(running.size||pending)await new Promise(r=>setTimeout(r,10));}};
}
