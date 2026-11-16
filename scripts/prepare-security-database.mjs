import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../src/management.mjs';
import {SecurityStore} from '../src/security-center/store.mjs';
if(process.getuid?.()!==0)throw Error('Private event database provisioning requires host administrator authorization');
const dataDir=process.argv[2]||'/var/lib/server-panel';
if(dataDir!=='/var/lib/server-panel')throw Error('Installed security database provisioning currently requires the standard private data path');
const settings=path.join(dataDir,'security-center/database.json');
if(await fs.access(settings).then(()=>true,()=>false)){
 const store=new SecurityStore({dataDir});try{await store.migrate();console.log('Existing private security database verified and preserved.');}finally{await store.close();}
}else{
 await run('apt-get',['update','--error-on=any'],{timeout:180000,maxBuffer:4*1024*1024});
 const dependencies=await run('apt-cache',['depends','postgresql']);
 const major=dependencies.match(/Depends:\s+postgresql-(15|16|17|18)\b/)?.[1];
 if(!major)throw Error('No supported PostgreSQL 15–18 candidate in the configured signed repositories. Configure a private event database before enabling collection.');
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'panel-private-db-packages-'));
 try{
  for(const pkg of ['postgresql-'+major,'postgresql-client-'+major,'libpq5']){
   const policy=await run('apt-cache',['policy',pkg]),version=policy.match(/Candidate:\s+(\S+)/)?.[1];
   if(!version||version==='(none)')throw Error('No signed repository candidate for '+pkg);
   await run('apt-get',['download',pkg+'='+version],{cwd:stage,timeout:180000,maxBuffer:4*1024*1024});
  }
  await run(process.execPath,[fileURLToPath(new URL('./setup-security-database.mjs',import.meta.url)),stage],{timeout:180000,maxBuffer:4*1024*1024});
 }finally{await fs.rm(stage,{recursive:true,force:true});}
 const store=new SecurityStore({dataDir});try{await store.migrate();console.log('Private event database schema and connectivity verified.');}finally{await store.close();}
}
