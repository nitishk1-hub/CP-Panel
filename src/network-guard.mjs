import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {run,bad} from './management.mjs';
export const guardTable='server_panel_guard';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export function networkPrefix(value){
 if(typeof value!=='string'||value.length>70)throw bad('Enter an IPv4 or IPv6 address or network');
 const [address,bits,...extra]=value.trim().split('/'),family=net.isIP(address);
 if(!family||extra.length||bits!==undefined&&(!/^\d{1,3}$/.test(bits)||Number(bits)>(family===4?32:128)))throw bad('Enter a valid IPv4 or IPv6 network');
 return {value:address+(bits===undefined?'':'/'+Number(bits)),family};
}
export function validateGuard(input){
 if(!Array.isArray(input.rules)||input.rules.length>200)throw bad('Provide up to 200 network rules');
 const rules=input.rules.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r))throw bad('Each network rule must be an object');
  if(!['incoming','outgoing','forwarded','all'].includes(r.direction)||!['any','tcp','udp'].includes(r.protocol))throw bad('Choose a network direction and protocol');
  const peer=networkPrefix(r.peer),port=r.port===''||r.port===null||r.port===undefined?null:Number(r.port);
  if(port!==null&&(!['tcp','udp'].includes(r.protocol)||!Number.isInteger(port)||port<1||port>65535))throw bad('Choose TCP/UDP and a valid destination port, or leave the port empty');
  const note=String(r.note||'');if(note.length>120||/[\x00-\x1f\x7f]/.test(note))throw bad('Use a short single-line note');
  return {direction:r.direction,protocol:r.protocol,peer:peer.value,port,note};
 });
 return {schema:1,rules,dropInvalid:input.dropInvalid===true};
}
export function guardRules(input,exists=false){
 const c=validateGuard(input),out=[];if(exists)out.push(`delete table inet ${guardTable}`);
 out.push(`table inet ${guardTable} {`, ' comment "Managed by Server Panel; independent deny policy"');
 for(const [chain,hook]of [['incoming','input'],['outgoing','output'],['forwarded','forward']]){
  out.push(` chain ${chain} { type filter hook ${hook} priority -20; policy accept;`);
  out.push(chain==='incoming'?'  iifname "lo" return':chain==='outgoing'?'  oifname "lo" return':'  iifname "lo" return');
  if(c.dropInvalid)out.push('  ct state invalid counter drop');
  // Preserve established management/application flows; deny rules apply to new flows.
  out.push('  ct state established,related return');
  for(const r of c.rules.filter(r=>r.direction==='all'||r.direction===chain)){
   const family=networkPrefix(r.peer).family===4?'ip':'ip6',proto=r.protocol==='any'?'':`meta l4proto ${r.protocol} `;
   const port=r.port===null?'':chain==='forwarded'?`ct original proto-dst ${r.port} `:`${r.protocol} dport ${r.port} `;
   const addresses=chain==='forwarded'?['saddr','daddr']:[chain==='incoming'?'saddr':'daddr'];
   for(const address of addresses)out.push(`  ${family} ${address} ${r.peer} ${proto}${port}counter drop`);
  }
  out.push(' }');
 }
 out.push('}');return out.join('\n')+'\n';
}
export async function privateGuardDir(dir){await fs.mkdir(dir,{recursive:true,mode:0o700});const st=await fs.lstat(dir);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw bad('Network policy storage ownership or permissions are unsafe');}
async function atomic(file,text){const tmp=file+'.'+crypto.randomUUID();await fs.writeFile(tmp,text,{flag:'wx',mode:0o600});await fs.rename(tmp,file);}
export function createNetworkGuard({dataDir,execute=run,now=Date.now,unitDir='/etc/systemd/system'}={}){
 const dir=path.join(dataDir,'network-guard'),policyFile=path.join(dir,'policy.json'),transactionDir=path.join(dir,'pending');let busy=false;
 async function table(){try{const value=await execute('nft',['list','table','inet',guardTable]);if(!value.includes('Managed by Server Panel; independent deny policy'))throw bad('The network guard table is owned by another configuration');return value;}catch(e){if(/No such file|does not exist/i.test(e.message))return null;throw e;}}
 async function policy(){try{return validateGuard(JSON.parse(await fs.readFile(policyFile,'utf8')));}catch(e){if(e.code==='ENOENT')return {schema:1,rules:[],dropInvalid:false};throw e;}}
 async function pending(){try{const r=JSON.parse(await fs.readFile(path.join(transactionDir,'record.json'),'utf8'));for(const phase of ['pending','rolling-back'])if(await fs.access(path.join(transactionDir,phase)).then(()=>true,()=>false))return {id:r.id,expires:r.expires,phase};return null;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function status(){let current=null,error=null;try{current=await table();}catch(e){error=e.message;}const configured=await policy();return {available:!error,error,active:current!==null&&!error,policy:configured,revision:hash(JSON.stringify(configured)+'\n'+(current||error||'').replace(/counter packets \d+ bytes \d+/g,'counter')),pending:await pending(),scope:'Server-wide IPv4/IPv6 packet filtering for incoming, outgoing and routed/forwarded traffic, including routed Docker published ports. It is not a WAF or signature-based IPS.',behavior:'Additive deny policy; unmatched traffic and established connections continue. Other firewall rules still apply. Bridged-only traffic depends on bridge netfilter and is not universally covered.',ruleset:current};}
 async function apply(input){if(busy)throw bad('A network policy change is running',409);busy=true;try{
  await privateGuardDir(dir);if(await pending())throw bad('Confirm or roll back the pending network policy first',409);
  const before=await status();if(!before.available)throw bad(before.error);if(input.revision!==before.revision)throw bad('Network policy changed; refresh and review again',409);
  const next=validateGuard(input),id=crypto.randomUUID();await fs.rm(transactionDir,{recursive:true,force:true});await fs.mkdir(transactionDir,{mode:0o700});
  const candidate=guardRules(next,before.active),file=path.join(transactionDir,'candidate.nft');await atomic(file,candidate);await execute('nft',['--check','--file',file]);
  const snapshot=before.active?before.ruleset:null;await atomic(path.join(transactionDir,'before.json'),JSON.stringify({ruleset:snapshot,policy:before.policy}));await atomic(path.join(transactionDir,'next.json'),JSON.stringify(next));
  const record={id,expires:now()+90000,timer:'server-panel-net-rollback-'+id};await atomic(path.join(transactionDir,'record.json'),JSON.stringify(record));await atomic(path.join(transactionDir,'pending'),'');
  const helper=fileURLToPath(new URL('./network-guard-cli.mjs',import.meta.url));
  try{await execute('systemd-run',['--unit='+record.timer,'--on-active=90s','--collect','--property=Restart=on-failure','--property=RestartSec=5s','/usr/bin/flock','--wait','20',path.join(dir,'transition.lock'),process.execPath,helper,'rollback',dir,id]);}catch{await fs.rename(path.join(transactionDir,'pending'),path.join(transactionDir,'failed'));throw bad('Could not arm the independent rollback timer; no firewall changes were made');}
  try{await execute('nft',['--file',file]);}catch(e){await execute('/usr/bin/flock',['--wait','20',path.join(dir,'transition.lock'),process.execPath,helper,'rollback',dir,id]).catch(()=>{});throw e;}
  return {pending:{id,expires:record.expires},message:'Policy applied temporarily. Verify access from a new session, then confirm within 90 seconds. Otherwise the independent timer restores the previous panel policy.'};
 }finally{busy=false;}}
 async function confirm(id){
  const p=await pending();if(!p||p.id!==id||now()>=p.expires)throw bad('The confirmation expired or the policy has already been resolved',409);
  await execute('/usr/bin/flock',['--wait','20',path.join(dir,'transition.lock'),process.execPath,fileURLToPath(new URL('./network-guard-cli.mjs',import.meta.url)),'confirm',dir,id,unitDir]);return {confirmed:true};
 }
 async function rollback(id){const p=await pending();if(!p||p.id!==id)throw bad('No matching pending network change',409);await execute('/usr/bin/flock',['--wait','20',path.join(dir,'transition.lock'),process.execPath,fileURLToPath(new URL('./network-guard-cli.mjs',import.meta.url)),'rollback',dir,id]);return {rolledBack:true};}

 return {status,apply,confirm,rollback};
}
