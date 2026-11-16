import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const finalStates=new Set(['committed','rolled-back','rollback-failed','aborted']);
export async function createTransactions({directory,handlers}={}){
 await fs.mkdir(directory,{recursive:true,mode:0o700});const st=await fs.lstat(directory);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||st.mode&0o077)throw Error('Unsafe transaction directory');
 const records=new Map();let locked=false,storageError=null;
 async function writeRecord(r){r.updatedAt=new Date().toISOString();const temp=path.join(directory,r.id+'.tmp'),file=path.join(directory,r.id+'.json');const f=await fs.open(temp,'w',0o600);try{await f.writeFile(JSON.stringify(r));await f.sync();}finally{await f.close();}await fs.rename(temp,file);const d=await fs.open(directory,'r');try{await d.sync();}finally{await d.close();}}
 async function save(r){try{return await writeRecord(r);}catch(e){storageError=e.message;throw e;}}
 async function phase(r,state){r.state=state;r.history.push({phase:state,at:new Date().toISOString()});await save(r);}
 async function restore(r,handler){try{await phase(r,'rolling-back');}catch(e){r.journalError=e.message;}try{await handler.rollback(r.input,r.backup,{id:r.id});}catch(e){r.rollbackError=e.message;await phase(r,'rollback-failed').catch(error=>{r.journalError=error.message;});return;}await phase(r,'rolled-back').catch(e=>{r.journalError=e.message;});}

 for(const name of await fs.readdir(directory))if(/^[a-f0-9-]{36}\.json$/.test(name)){const f=path.join(directory,name),s=await fs.lstat(f);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||s.mode&0o077||s.size>4*1024*1024)throw Error('Unsafe transaction record');const r=JSON.parse(await fs.readFile(f,'utf8'));if(r.id+'.json'!==name||!Array.isArray(r.history))throw Error('Invalid transaction record');records.set(r.id,r);}
 // A failed recovery blocks new mutations; never silently abandon rollback.
 for(const r of records.values())if(!finalStates.has(r.state)){const h=handlers[r.type];if(r.backupReady&&h){await restore(r,h);}else if(!r.backupReady&&['preflight','backing-up'].includes(r.state)){r.error='Interrupted before mutation';await phase(r,'aborted');}else{r.rollbackError='Recovery handler or backup is unavailable';await phase(r,'rollback-failed');}}
 function get(id){if(!records.has(id))throw Error('Unknown transaction');return structuredClone(records.get(id));}
 async function run(type,input,{actor,confirm=false}={}){
  if(storageError)throw Error('Transaction journal is unavailable; new mutations are blocked');if(locked)throw Error('Another transaction is running');if([...records.values()].some(r=>r.state==='rollback-failed'))throw Error('Resolve the failed rollback before starting another transaction');const h=handlers[type];if(!h)throw Error('Unsupported transaction');if(typeof actor!=='string'||!actor)throw Error('Transaction actor required');if(h.requiresConfirmation&&confirm!==true)throw Error('Explicit authorization required');locked=true;
  const r={id:crypto.randomUUID(),type,input:structuredClone(input),actor,history:[],createdAt:new Date().toISOString(),backupReady:false};records.set(r.id,r);
  try{await phase(r,'preflight');await h.preflight(input,{id:r.id});await phase(r,'backing-up');r.backup=await h.backup(input,{id:r.id});r.backupReady=true;await save(r);await phase(r,'executing');await h.execute(input,r.backup,{id:r.id});await phase(r,'validating');r.validation=await h.validate(input,r.backup,{id:r.id});if(r.validation===false||r.validation?.ok===false)throw Error('Transaction validation failed');await phase(r,'committing');if(h.commit)await h.commit(input,r.backup,{id:r.id});await phase(r,'committed');return get(r.id);
  }catch(e){r.error=e.message;if(r.backupReady)await restore(r,h);else await phase(r,'aborted');const error=new Error(e.message);error.transaction=get(r.id);throw error;}finally{locked=false;}
 }
 return {run,get,list:()=>[...records.values()].map(r=>structuredClone(r))};
}
