import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from './management.mjs';
import {guardTable,guardRules,privateGuardDir,validateGuard} from './network-guard.mjs';
export async function restoreGuard(dir,{execute=run,expectedId}={}){
 await privateGuardDir(dir);const pending=path.join(dir,'pending');if(expectedId){const record=JSON.parse(await fs.readFile(path.join(pending,'record.json'),'utf8'));if(record.id!==expectedId)return {skipped:true};}
 try{await fs.rename(path.join(pending,'pending'),path.join(pending,'rolling-back'));}catch(e){if(e.code==='ENOENT')return {skipped:true};throw e;}
 try{
  const before=JSON.parse(await fs.readFile(path.join(pending,'before.json'),'utf8'));validateGuard(before.policy);
  const exists=await execute('nft',['list','table','inet',guardTable]).then(()=>true,e=>{if(/No such file|does not exist/i.test(e.message))return false;throw e;});
  const file=path.join(pending,'restore.nft'),text=(exists?`delete table inet ${guardTable}\n`:'')+(before.ruleset||'');
  if(text){await fs.writeFile(file,text,{mode:0o600});await execute('nft',['--file',file]);}
  await fs.writeFile(path.join(dir,'policy.json'),JSON.stringify(before.policy),{mode:0o600});
  await fs.rename(path.join(pending,'rolling-back'),path.join(pending,'rolled-back'));return {restored:true};
 }catch(e){await fs.rename(path.join(pending,'rolling-back'),path.join(pending,'pending')).catch(()=>{});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,dir,id,unitDir='/etc/systemd/system']=process.argv.slice(2);if(!path.isAbsolute(dir||'')||!['rollback','boot','confirm'].includes(action))throw Error('Invalid network guard action');
 if(action==='rollback'){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid rollback transaction');await restoreGuard(dir,{expectedId:id});}else if(action==='confirm'){
  await privateGuardDir(dir);const tx=path.join(dir,'pending'),record=JSON.parse(await fs.readFile(path.join(tx,'record.json'),'utf8'));
  if(record.id!==id||Date.now()>=record.expires)throw Error('Confirmation expired');await fs.access(path.join(tx,'pending'));
  if(![process.execPath,fileURLToPath(import.meta.url),dir,unitDir].every(p=>/^\/[A-Za-z0-9_./-]+$/.test(p)))throw Error('Unsafe service path');
  const next=validateGuard(JSON.parse(await fs.readFile(path.join(tx,'next.json'),'utf8')));
  const unit=`[Unit]\nDescription=Server Panel independent network policy\nAfter=network-pre.target\nBefore=network.target docker.service\n[Service]\nType=oneshot\nRemainAfterExit=yes\nExecStart=${process.execPath} ${fileURLToPath(import.meta.url)} boot ${dir}\n[Install]\nWantedBy=multi-user.target\n`;
  try{
   const target=path.join(unitDir,'server-panel-network-guard.service'),existing=await fs.lstat(target).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(existing&&(!existing.isFile()||existing.isSymbolicLink()||existing.nlink!==1||existing.uid!==process.getuid()||!String(await fs.readFile(target)).includes('Description=Server Panel independent network policy')))throw Error('Unsafe or foreign network policy service');const unitTmp=target+'.tmp';await fs.writeFile(unitTmp,unit,{flag:'wx',mode:0o644});await fs.rename(unitTmp,target);await run('systemctl',['daemon-reload']);await run('systemctl',['enable','server-panel-network-guard.service']);
   if(Date.now()>=record.expires)throw Error('Confirmation expired while persisting service');
   const tmp=path.join(dir,'confirmed-policy.tmp');await fs.writeFile(tmp,JSON.stringify(next),{mode:0o600});await fs.rename(tmp,path.join(dir,'policy.json'));
   await fs.rename(path.join(tx,'pending'),path.join(tx,'confirmed'));await run('systemctl',['stop',record.timer+'.timer']).catch(()=>{});
  }catch(e){await restoreGuard(dir);throw e;}
 }else{await privateGuardDir(dir);const c=JSON.parse(await fs.readFile(path.join(dir,'policy.json'),'utf8'));const exists=await run('nft',['list','table','inet',guardTable]).then(()=>true,e=>{if(/No such file|does not exist/i.test(e.message))return false;throw e;});const file=path.join(dir,'boot.nft');await fs.writeFile(file,guardRules(c,exists),{mode:0o600});await run('nft',['--check','--file',file]);await run('nft',['--file',file]);}
}
