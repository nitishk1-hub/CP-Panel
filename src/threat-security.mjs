import crypto from 'node:crypto';
import {createProtectionEdge} from './protection-edge.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {run,bad} from './management.mjs';import {createWebProtection} from './security-center/provider.mjs';import {createNetworkIDS} from './network-ids.mjs';import {createThreatResponse,publicPeer} from './threat-response.mjs';
export function summarizeThreats(webEvents=[],idsEvents=[]){const events=[...webEvents.map(r=>({id:r.id,time:Number.isFinite(Number(r.date))&&Number(r.date)>0&&Number(r.date)<1e11?new Date(Number(r.date)*1000).toISOString():null,ip:r.ip,country:/^[A-Z]{2}$/.test(r.country||'')?r.country:null,method:r.method,path:r.path,service:r.server_name,status:r.status,reason:r.reason,source:'WAF',blocked:r.security_mode==='block'&&Number(r.status)>=400&&Number(r.status)<500})),...idsEvents.map(r=>({id:'ids-'+r.time+'-'+r.signatureId+'-'+r.flowId,time:r.time,ip:r.source,country:null,service:r.destination+':'+(r.destinationPort||''),reason:r.signature,severity:r.severity,source:'IDS',blocked:false,interface:r.interface}))].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,1000);const countries={};for(const r of events)if(r.country)countries[r.country]=(countries[r.country]||0)+1;return {events,countries,counts:{events:events.length,blocked:events.filter(e=>e.blocked).length,sources:new Set(events.map(e=>e.ip)).size,countries:Object.keys(countries).length,unlocated:events.filter(e=>!e.country).length}};}
export function createThreatSecurity({dataDir,webProvider,ids,response,edge,execute=run}={}){webProvider||=createWebProtection({dataDir});ids||=createNetworkIDS({dataDir});response||=createThreatResponse({dataDir});edge||=createProtectionEdge({dataDir});const file=path.join(dataDir,'protection-state.json');let busy=false,timer=null,tickRun=null,lastError=null,seen=new Set(),flowGroups=new Map(),protectedIPs=[];
 const state=()=>fs.readFile(file,'utf8').then(JSON.parse,()=>({mode:'off'}));
 async function saveState(value){const tmp=file+'.'+crypto.randomUUID();await fs.writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await fs.rename(tmp,file);}
 async function status(){const [web,sensor,network,policy]=await Promise.all([webProvider.status(),ids.status(),response.status(),state()]);let evidence={events:[],geo:{}},eventError=null;if(web.ready)try{evidence=await webProvider.reports([...new Set(sensor.events.map(e=>e.source))].filter(publicPeer).slice(0,100));}catch(e){eventError=e.message;}const summary=summarizeThreats(evidence.events,sensor.events);for(const event of summary.events)if(event.source==='IDS'&&evidence.geo?.[event.ip])event.country=evidence.geo[event.ip];summary.countries={};for(const e of summary.events)if(e.country)summary.countries[e.country]=(summary.countries[e.country]||0)+1;summary.counts.countries=Object.keys(summary.countries).length;summary.counts.unlocated=summary.events.filter(e=>!e.country).length;return {policy,entry:await edge.status(),web,ids:sensor,response:network,...summary,error:lastError||eventError,retained:evidence.retained||0,scope:'WAF blocks routed web attacks. IDS observes visible host/Docker/VPN packets. In Block mode, repeated severity-1 inbound IDS alerts from a public source can trigger a 15-minute host-wide block. Private/internal sources are monitored, never automatically blocked.',mapNote:'Approximate IP country, not a person’s physical location. Private, unknown and untrusted-proxy origins remain unmapped. Counts are retained security events, not all traffic or a complete audit.'};}
 async function mode(requested,revision,log=()=>{}){
  if(!['off','monitor','block'].includes(requested))throw bad('Choose off, monitor or block');
  if(tickRun)await tickRun.catch(()=>{});
  if(busy)throw bad('A protection change is running',409);
  busy=true;let snapshot;
  try{
   const policy=await state();
   snapshot={policy,web:await webProvider.config(),ids:await ids.status(),response:await response.status(),entry:await edge.status()};
   if(requested==='off'){
    await edge.apply('off');await response.disable();
    if(snapshot.ids.prepared)await ids.action('stop',log);
    let warning=null;
    try{await webProvider.mode('off',snapshot.web?.revision,log);}catch(e){warning='Ingress bypassed and capture stopped; provider policy update failed: '+e.message;}
    await saveState({mode:'off',changedAt:new Date().toISOString()});lastError=warning;
    log('Protection off: local ingress bypasses inspection, capture and timed response are stopped.');return;
   }
   await webProvider.mode(requested,revision,log);
   // Provider policy applies its own bounded readiness check; do not silently repeat a failed mutation.
   await webProvider.test(requested);
   if(!snapshot.ids.prepared)throw bad('Preinstallation is incomplete: IDS is not prepared');
   await ids.action('start',log);await ids.test(log);
   if(requested==='block'){
    protectedIPs=JSON.parse(await execute('ip',['-j','address','show'])).flatMap(i=>(i.addr_info||[]).map(a=>a.local));
    await response.enable();
   }else await response.disable();
   await edge.apply(requested);
   await saveState({mode:requested,changedAt:new Date().toISOString()});lastError=null;
   log('Mode verified. Coverage includes only ingress routed through the configured local gateway.');
  }catch(error){
   const rollbackErrors=[];
   const restore=async(label,fn)=>{try{await fn();}catch{rollbackErrors.push(label);}};
   if(snapshot){
    await restore('web policy',async()=>{const current=await webProvider.config();await webProvider.mode(snapshot.web?.mode||snapshot.policy.mode,current?.revision,()=>{});});
    await restore('IDS state',async()=>{if(snapshot.ids.prepared)await ids.action(snapshot.ids.active?'start':'stop',()=>{});});
    await restore('response state',async()=>{if(response.restore)await response.restore(snapshot.response);else if(snapshot.response.active)await response.enable();else await response.disable();});
    await restore('ingress routing',()=>edge.apply(snapshot.entry?.mode||snapshot.policy.mode));
    await restore('saved policy',()=>saveState(snapshot.policy));
   }
   lastError=error.message+(rollbackErrors.length?'; rollback needs attention: '+rollbackErrors.join(', '):'');
   if(rollbackErrors.length)throw bad(lastError,503);
   throw error;
  }finally{busy=false;}
 }
 async function tick(){
  if(busy)return;busy=true;try{const desired=(await state()).mode;if(desired==='off')return;
  if(!protectedIPs.length)protectedIPs=JSON.parse(await execute('ip',['-j','address','show'])).flatMap(i=>(i.addr_info||[]).map(a=>a.local));
  const web=await webProvider.status(),entry=await edge.status();
  if(!web.ready){if(entry&&entry.mode!=='off')await edge.apply('off');lastError='Security provider is unavailable; the local ingress is temporarily bypassed to keep applications available.';return;}
  if(entry&&(!entry.active||entry.mode!==desired)){await webProvider.test(desired);if(!(await ids.status()).active)await ids.action('start',()=>{});await ids.test(()=>{});if(desired==='block')await response.enable();await edge.apply(desired);lastError=null;}
  if(desired!=='block')return;const s=await ids.status(),now=Date.now();for(const e of s.events){const id=e.time+':'+e.signatureId+':'+e.flowId;if(seen.has(id))continue;seen.add(id);if(Number(e.severity)!==1||e.direction!=='to_server'||!publicPeer(e.source)||protectedIPs.includes(e.source)||!Number.isFinite(Date.parse(e.time))||now-Date.parse(e.time)>300000||Date.parse(e.time)>now+5000)continue;const group=(flowGroups.get(e.source)||[]).filter(v=>now-v.at<300000);if(e.flowId&&!group.some(v=>v.flow===String(e.flowId)))group.push({flow:String(e.flowId),at:now});flowGroups.set(e.source,group);if(group.length>=3){await response.ban(e.source,'Repeated severity-1 inbound IDS alerts',{protectedIPs});flowGroups.delete(e.source);}}if(seen.size>2000)seen=new Set([...seen].slice(-500));for(const [ip,group]of flowGroups)if(group.every(v=>now-v.at>300000))flowGroups.delete(ip);}finally{busy=false;}}
 function watch(){ids.watch?.();if(!timer){timer=setInterval(()=>{if(!tickRun)tickRun=tick().catch(e=>{lastError=e.message;}).finally(()=>{tickRun=null;});},10000);timer.unref();}}
 function close(){if(timer)clearInterval(timer);ids.close?.();}
 return {status,mode,watch,close,web:webProvider,ids,response,edge};}
