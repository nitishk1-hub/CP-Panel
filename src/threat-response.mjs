import crypto from 'node:crypto';
import ipaddr from 'ipaddr.js';
import fs from 'node:fs/promises';import path from 'node:path';import net from 'node:net';import {run,bad} from './management.mjs';
export const responseTable='server_panel_response';
export function publicPeer(ip){try{return typeof ip==='string'&&net.isIP(ip)>0&&ipaddr.parse(ip).range()==='unicast';}catch{return false;}}

export function responseRules(){return `table inet ${responseTable} {\n comment "Server Panel timed threat response"\n set blocked4 { type ipv4_addr; flags timeout; timeout 15m; }\n set blocked6 { type ipv6_addr; flags timeout; timeout 15m; }\n chain inbound { type filter hook input priority -25; policy accept; ip saddr @blocked4 counter drop; ip6 saddr @blocked6 counter drop; }\n chain outbound { type filter hook output priority -25; policy accept; ip daddr @blocked4 counter drop; ip6 daddr @blocked6 counter drop; }\n chain forwarded { type filter hook forward priority -25; policy accept; ip saddr @blocked4 counter drop; ip daddr @blocked4 counter drop; ip6 saddr @blocked6 counter drop; ip6 daddr @blocked6 counter drop; }\n}\n`;}
export function createThreatResponse({dataDir,execute=run,now=Date.now}={}){const dir=path.join(dataDir,'threat-response'),file=path.join(dir,'events.json');let rows=[],loaded=false;async function load(){if(!loaded){rows=await fs.readFile(file,'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return [];throw e;});loaded=true;}}async function allowlist(){return fs.readFile(path.join(dir,'allowlist.json'),'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return [];throw e;});}async function existing(){try{const s=await execute('nft',['list','table','inet',responseTable]);if(!s.includes('Server Panel timed threat response'))throw bad('Response table belongs to another deployment');return true;}catch(e){if(/No such file|does not exist/.test(e.message))return false;throw e;}}
 async function save(){await fs.mkdir(dir,{recursive:true,mode:0o700});const tmp=file+'.'+crypto.randomUUID();await fs.writeFile(tmp,JSON.stringify(rows.slice(-500)),{mode:0o600,flag:'wx'});await fs.rename(tmp,file);}
 async function enable(){if(await existing())return;await fs.mkdir(dir,{recursive:true,mode:0o700});const rules=path.join(dir,'response.nft');await fs.writeFile(rules,responseRules(),{mode:0o600});await execute('nft',['--check','--file',rules]);await execute('nft',['--file',rules]);}
 async function disable(){if(await existing())await execute('nft',['delete','table','inet',responseTable]);rows=[];await save();}
 async function status(){await load();let active=false,error=null;try{active=await existing();}catch(e){error=e.message;}return {active,error,allowlist:await allowlist(),bans:active?rows.filter(r=>r.expires>now()):[]};}
 async function ban(ip,reason,{protectedIPs=[]}={}){await load();if((await allowlist()).includes(ip))return {blocked:false,allowlisted:true};if(!publicPeer(ip)||protectedIPs.includes(ip))throw bad('Local, private, VPN, reserved and protected server addresses cannot be automatically blocked');await enable();const family=net.isIP(ip)===4?'blocked4':'blocked6';if(rows.some(r=>r.ip===ip&&r.expires>now()))return {blocked:true,alreadyBlocked:true};await execute('nft',['add','element','inet',responseTable,family,'{',ip,'timeout','15m','}']);rows=rows.filter(r=>r.ip!==ip&&r.expires>now());rows.push({ip,reason:String(reason).slice(0,200),createdAt:now(),expires:now()+900000});await save();return {blocked:true};}
 async function unban(ip){await load();if(!net.isIP(ip))throw bad('Choose a valid blocked address');if(await existing())await execute('nft',['delete','element','inet',responseTable,net.isIP(ip)===4?'blocked4':'blocked6','{',ip,'}']);rows=rows.filter(r=>r.ip!==ip);await save();return {unblocked:true};}
 async function restore(snapshot){
  if(!snapshot.active){await disable();return status();}
  await enable();
  // Existing entries keep their current expiry; missing entries use only their remaining lifetime.
  for(const previous of snapshot.bans||[]){
   const seconds=Math.floor((previous.expires-now())/1000);
   if(seconds<1||!publicPeer(previous.ip))continue;
   const family=net.isIP(previous.ip)===4?'blocked4':'blocked6';
   await execute('nft',['get','element','inet',responseTable,family,'{',previous.ip,'}']).catch(()=>execute('nft',['add','element','inet',responseTable,family,'{',previous.ip,'timeout',seconds+'s','}']));
  }
  rows=(snapshot.bans||[]).filter(r=>r.expires>now());loaded=true;await save();return status();
 }
 async function setAllowlist(ip,action){if(!net.isIP(ip)||!['add','remove'].includes(action))throw bad('Choose a valid IP and allowlist action');let list=await allowlist();list=action==='add'?[...new Set([...list,ip])]:list.filter(x=>x!==ip);if(list.length>200)throw bad('Allowlist limit reached');await fs.mkdir(dir,{recursive:true,mode:0o700});const target=path.join(dir,'allowlist.json'),tmp=target+'.'+crypto.randomUUID();await fs.writeFile(tmp,JSON.stringify(list),{mode:0o600,flag:'wx'});await fs.rename(tmp,target);if(action==='add'&&(await status()).bans.some(b=>b.ip===ip))await unban(ip);return {saved:true};}return {enable,disable,status,ban,unban,setAllowlist,restore};}
