import {validateLocalRules} from './security-center/rules.mjs';
import net from 'node:net';
import dgram from 'node:dgram';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {run,bad} from './management.mjs';
import {privateGuardDir} from './network-guard.mjs';
const unitName='server-panel-ids.service';
export function idsConfig(base,addresses=[],interfaces=['lo']){
 const telemetry=(base?.outputs||[]).some(o=>(o['eve-log']?.types||[]).includes('flow'));const c=structuredClone(base);if(!c||typeof c!=='object'||Array.isArray(c))throw bad('Unsupported Suricata configuration');
 c.vars||={};c.vars['address-groups']||={};const nets=['127.0.0.0/8','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','::1','fc00::/7',...addresses.filter(a=>net.isIP(a))];c.vars['address-groups'].HOME_NET='['+[...new Set(nets)].join(',')+']';c.vars['address-groups'].EXTERNAL_NET='any';
 c['default-rule-path']='/run/server-panel-ids/rules';c['rule-files']=['suricata.rules','panel-probe.rules'];
 c['default-log-dir']='/run/server-panel-ids';c['runmode']='workers';delete c.pcap;const cluster=crypto.randomInt(1,64000);c['af-packet']=interfaces.map((name,i)=>({interface:name,threads:1,'cluster-id':cluster+i,'cluster-type':'cluster_flow',defrag:true,'use-mmap':true,'tpacket-v3':true,'ring-size':2048,'disable-promisc':true,'checksum-checks':'auto'}));
 c.outputs=[{'eve-log':{enabled:true,filetype:'syslog',identity:'server-panel-ids',facility:'local5',level:'Info',types:[{alert:{payload:false,packet:false,metadata:false,'http-body':false,'http-body-printable':false,'tagged-packets':false}},{stats:{totals:true,threads:false}},...(telemetry?['flow',{dns:{requests:true,responses:false}},{tls:{extended:false}}]:[])]}}];
 c.logging={'default-log-level':'notice',outputs:[{console:{enabled:true}}]};
 c['unix-command']={enabled:false};c.detect={...(c.detect||{}),'sgh-mpm-caching-path':'/var/lib/server-panel-ids-cache'};c['flow']={...(c.flow||{}),memcap:'64mb'};c['stream']={...(c.stream||{}),memcap:'64mb',reassembly:{...(c.stream?.reassembly||{}),memcap:'128mb'}};
 return c;
}
export function idsUnit(dir){if(!/^\/[A-Za-z0-9_./-]+$/.test(dir))throw bad('Unsupported IDS configuration path');return `[Unit]\nDescription=Server Panel passive network intrusion detection\nAfter=network-online.target\nWants=network-online.target\n[Service]\nType=simple\nDynamicUser=yes\nRuntimeDirectory=server-panel-ids\nRuntimeDirectoryMode=0700\nStateDirectory=server-panel-ids-cache\nStateDirectoryMode=0700\nBindReadOnlyPaths=${dir}/config.yaml:/run/server-panel-ids/config.yaml ${dir}/rules:/run/server-panel-ids/rules\nExecStart=/usr/bin/suricata -c /run/server-panel-ids/config.yaml --af-packet -l /run/server-panel-ids --runmode=workers\nRestart=on-failure\nRestartSec=5\nNoNewPrivileges=yes\nAmbientCapabilities=CAP_NET_RAW\nCapabilityBoundingSet=CAP_NET_RAW\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\nProtectKernelTunables=yes\nProtectKernelModules=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_PACKET AF_NETLINK\nMemoryMax=1G\nCPUQuota=200%\nTasksMax=128\nStandardOutput=journal\nStandardError=journal\nLogRateLimitIntervalSec=30s\nLogRateLimitBurst=500\n[Install]\nWantedBy=multi-user.target\n`;}
export function idsEvents(text){const events=[];let stats=null;for(const line of text.split('\n'))try{const r=JSON.parse(line);if(r.event_type==='alert')events.push({time:r.timestamp,flowId:r.flow_id,interface:r.in_iface,direction:r.direction,source:r.src_ip,destination:r.dest_ip,sourcePort:r.src_port,destinationPort:r.dest_port,protocol:r.proto,signatureId:r.alert?.signature_id,signature:String(r.alert?.signature||'').slice(0,300),severity:r.alert?.severity,action:r.alert?.action||'allowed'});if(r.event_type==='stats')stats={time:r.timestamp,capture:r.stats?.capture,decoder:r.stats?.decoder?{pkts:r.stats.decoder.pkts,bytes:r.stats.decoder.bytes}:null};}catch{}return {events:events.slice(-100),stats};}
export function createNetworkIDS({dataDir,execute=run,unitDir='/etc/systemd/system',readBase=()=>fs.readFile('/etc/suricata/suricata.yaml','utf8')}={}){
 const dir=path.join(dataDir,'network-ids');let busy=false,watcher=null,watchError=null;
 const owned=async()=>{const st=await fs.lstat(path.join(unitDir,unitName)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(st&&(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==process.getuid()))throw bad('Unsafe IDS service file');const s=await fs.readFile(path.join(unitDir,unitName),'utf8').catch(()=>null);if(s&&!s.includes('Description=Server Panel passive network intrusion detection'))throw bad('The IDS service name belongs to another installation');return !!s;};
 async function status(){const installed=await execute('suricata',['--build-info']).then(s=>s.split('\n').find(l=>l.includes('Suricata'))||'Installed',()=>null),prepared=await owned(),active=prepared&&await execute('systemctl',['is-active',unitName]).then(s=>s==='active',()=>false);const updaterInstalled=await execute('suricata-update',['--version']).then(()=>true,()=>false);const metadata=await fs.readFile(path.join(dir,'metadata.json'),'utf8').then(JSON.parse,()=>null);return {installed,updaterInstalled,prepared,active,metadata,mode:'Passive IDS; does not block traffic',watchError,scope:'Linux AF_PACKET capture across detected active host interfaces, refreshed when interfaces change, including visible host, Docker bridge and VPN interfaces. Encrypted payloads, kernel capture drops and unsupported/offloaded paths limit inspection; this is not verified universal coverage.',telemetry:metadata?.telemetry===true,selfTest:await fs.readFile(path.join(dir,'self-test.json'),'utf8').then(JSON.parse,()=>null),privacy:'No packet capture files or HTTP bodies. Selected alert/stats and optional flow/DNS/TLS metadata go to the host journal, with service rate limits. Traffic is inspected locally; metadata can contain private IP addresses.',...(prepared?idsEvents(await execute('journalctl',['--unit',unitName,'--no-pager','--output','cat','--lines','200'],{maxBuffer:1024*1024}).catch(()=>'')):{events:[],stats:null})};}
 async function install(log=()=>{}){
  if(busy)throw bad('An IDS operation is running',409);busy=true;let masked=false;
  try{
   const exists=await execute('suricata',['--build-info']).then(()=>true,()=>false);const updater=await execute('suricata-update',['--version']).then(()=>true,()=>false);if(exists&&updater){log('Suricata and its updater are already installed; existing services and configuration are preserved.');return;}
   log('Installing Suricata from existing signed APT repositories. No external repository is added.');
   const load=exists?'masked':await execute('systemctl',['show','--property','LoadState','--value','suricata.service']);if(load!=='masked'){await execute('systemctl',['mask','--runtime','suricata.service']);masked=true;}
   await execute('apt-get',['update','--error-on=any'],{timeout:180000,maxBuffer:4*1024*1024});
   const plan=await execute('apt-get',['--simulate','--no-remove','--no-install-recommends','install',...(exists?['suricata-update']:['suricata','suricata-update'])],{timeout:120000,maxBuffer:4*1024*1024});if(/^Inst \S+ \[/m.test(plan))throw bad('Preinstallation would upgrade existing packages; review that package change separately');
   await execute('apt-get',['--yes','--no-remove','--no-install-recommends','-o','Dpkg::Options::=--force-confold','install',...(exists?['suricata-update']:['suricata','suricata-update'])],{timeout:600000,maxBuffer:4*1024*1024,env:{PATH:'/usr/sbin:/usr/bin:/sbin:/bin',DEBIAN_FRONTEND:'noninteractive',LC_ALL:'C',NEEDRESTART_MODE:'l'}});
   if(!exists)await execute('systemctl',['disable','suricata.service']);log('Installed. Prepare the separate panel IDS service before starting packet inspection.');
  }finally{if(masked)await execute('systemctl',['unmask','--runtime','suricata.service']).catch(()=>{});busy=false;}
 }
 async function prepare(log=()=>{}){
  if(busy)throw bad('An IDS operation is running',409);busy=true;let created=false;
  try{
   if(await owned())throw bad('The IDS is already prepared; use Update rules to refresh signatures');await privateGuardDir(dir);await fs.mkdir(path.join(dir,'rules'),{mode:0o755});created=true;
   const base=YAML.parse(await readBase());const devices=JSON.parse(await execute('ip',['-j','address','show'])),addresses=devices.flatMap(i=>(i.addr_info||[]).map(a=>a.local)),interfaces=devices.filter(i=>i.flags?.includes('UP')).map(i=>i.ifname);if(!interfaces.length)throw bad('No active capture interfaces were detected');const c=idsConfig(base,addresses,interfaces);
   log('Downloading the default ET Open signature feed with Suricata Update. No captured traffic is uploaded.');
   await execute('suricata-update',['--no-test','--no-reload','--output',path.join(dir,'rules')],{timeout:300000,maxBuffer:4*1024*1024});
   const rules=await fs.readFile(path.join(dir,'rules/suricata.rules'),'utf8'),count=rules.split('\n').filter(l=>/^alert\s/.test(l)).length;if(!count)throw bad('No active detection signatures were obtained');
   await fs.writeFile(path.join(dir,'rules/panel-probe.rules'),'alert udp any any -> any any (msg:"Server Panel IDS verification probe"; content:"PANEL_IDS_PROBE:"; startswith; sid:9900001; rev:1;)\n',{mode:0o644});await fs.chmod(path.join(dir,'rules/panel-probe.rules'),0o644);await fs.chmod(path.join(dir,'rules'),0o755);await fs.chmod(path.join(dir,'rules/suricata.rules'),0o644);
   await fs.writeFile(path.join(dir,'config.yaml'),'%YAML 1.1\n---\n'+YAML.stringify(c),{mode:0o644});await fs.chmod(path.join(dir,'config.yaml'),0o644);
   // Validate with real storage paths before creating a service. Runtime bind paths differ.
   const check=structuredClone(c);check['default-rule-path']=path.join(dir,'rules');check['default-log-dir']=dir;check.outputs=[];
   await fs.writeFile(path.join(dir,'test.yaml'),'%YAML 1.1\n---\n'+YAML.stringify(check),{mode:0o600});await execute('suricata',['-T','-c',path.join(dir,'test.yaml'),'-l',dir],{timeout:120000,maxBuffer:2*1024*1024});
   await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify({updatedAt:new Date().toISOString(),signatures:count,interfaces,feed:'Suricata Update default ET Open'}),{mode:0o600});
   await fs.writeFile(path.join(unitDir,unitName),idsUnit(dir),{mode:0o644});await execute('systemctl',['daemon-reload']);log('Prepared passive IDS with validated signatures. Start it to begin inspection.');
  }catch(e){if(created&&!await owned())await fs.rm(dir,{recursive:true,force:true});throw e;}finally{busy=false;}
 }
 async function update(log=()=>{}){
  if(busy)throw bad('An IDS operation is running',409);if(!await owned())throw bad('Prepare IDS before updating rules');busy=true;
  const candidate=path.join(dir,'candidate-'+crypto.randomUUID()),old=path.join(dir,'previous-'+crypto.randomUUID());let swapped=false,wasActive=false;
  try{
   await fs.mkdir(candidate,{mode:0o755});
   await execute('suricata-update',['--no-test','--no-reload','--output',candidate],{timeout:300000,maxBuffer:4*1024*1024});
   const rules=await fs.readFile(path.join(candidate,'suricata.rules'),'utf8'),count=rules.split('\n').filter(l=>/^alert\s/.test(l)).length;if(!count)throw bad('No active detection signatures were obtained');
   await fs.copyFile(path.join(dir,'rules/panel-probe.rules'),path.join(candidate,'panel-probe.rules'));await fs.copyFile(path.join(dir,'rules/panel-local.rules'),path.join(candidate,'panel-local.rules')).catch(e=>{if(e.code!=='ENOENT')throw e;});
   for(const name of ['suricata.rules','panel-probe.rules'])await fs.chmod(path.join(candidate,name),0o644);await fs.chmod(candidate,0o755);
   const check=YAML.parse(await fs.readFile(path.join(dir,'config.yaml'),'utf8'));check['default-rule-path']=candidate;check['default-log-dir']=dir;check.outputs=[];
   await fs.writeFile(path.join(dir,'test.yaml'),'%YAML 1.1\n---\n'+YAML.stringify(check),{mode:0o600});await execute('suricata',['-T','-c',path.join(dir,'test.yaml'),'-l',dir],{timeout:120000,maxBuffer:2*1024*1024});
   wasActive=await execute('systemctl',['is-active',unitName]).then(v=>v==='active',()=>false);
   await fs.rename(path.join(dir,'rules'),old);await fs.rename(candidate,path.join(dir,'rules'));swapped=true;
   if(wasActive){await execute('systemctl',['restart',unitName]);await execute('systemctl',['is-active',unitName]);}
   await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify({...JSON.parse(await fs.readFile(path.join(dir,'metadata.json'),'utf8')),updatedAt:new Date().toISOString(),signatures:count,feed:'Suricata Update default ET Open'}),{mode:0o600});await fs.rm(path.join(dir,'self-test.json'),{force:true});
   const snapshots=(await fs.readdir(dir)).filter(n=>/^previous-[a-f0-9-]{36}$/.test(n));const ordered=await Promise.all(snapshots.map(async n=>({n,time:(await fs.stat(path.join(dir,n))).mtimeMs})));for(const v of ordered.sort((a,b)=>b.time-a.time).slice(5))await fs.rm(path.join(dir,v.n),{recursive:true,force:true});log('Validated signatures updated. '+(wasActive?'Only the panel IDS service was restarted.':'Monitoring remains stopped.'));
  }catch(e){if(swapped){await fs.rm(path.join(dir,'rules'),{recursive:true,force:true});await fs.rename(old,path.join(dir,'rules'));if(wasActive)await execute('systemctl',['restart',unitName]).catch(()=>{});}throw e;}
  finally{await fs.rm(candidate,{recursive:true,force:true});busy=false;}
 }
 async function action(action,log=()=>{}){
  if(busy)throw bad('An IDS operation is running',409);if(!['start','stop','restart'].includes(action))throw bad('Unsupported IDS action');if(!await owned())throw bad('Prepare the IDS service first');
  if(action!=='stop')await refreshInterfaces(false);busy=true;try{await execute('systemctl',[action,unitName]);if(action!=='stop'){await execute('systemctl',['is-active',unitName]);await execute('systemctl',['enable',unitName]);}else await execute('systemctl',['disable',unitName]);log(action==='stop'?'Passive monitoring stopped.':'Passive monitoring started; review live counters and alerts. This is not inline IPS.');}finally{busy=false;}
 }
 async function test(log=()=>{}){
  if(busy)throw bad('An IDS operation is running',409);if(!(await status()).active)throw bad('Start passive monitoring before testing');
  if(busy)throw bad('An IDS operation is running',409);busy=true;const start=Date.now(),server=dgram.createSocket('udp4');
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.bind(0,'127.0.0.1',resolve);});
   for(let attempt=0;attempt<12;attempt++){
    await execute('python3',[fileURLToPath(new URL('../scripts/ids-self-test.py',import.meta.url)),String(server.address().port)],{timeout:10000});
    await new Promise(r=>setTimeout(r,1000));
    const recent=await status();if(recent.events.some(e=>e.signatureId===9900001&&e.destinationPort===server.address().port&&Date.parse(e.time)>=start)){
     const evidence={checkedAt:new Date().toISOString(),detected:true,scope:'Dedicated checksum-valid loopback UDP probe. This verifies local signature processing, not every interface, encrypted payload inspection or inline blocking.'};
     await fs.writeFile(path.join(dir,'self-test.json'),JSON.stringify(evidence),{mode:0o600});log(evidence.scope);return evidence;
    }
   }
   throw bad('The IDS probe alert was not observed. Monitoring is not verified; check capture counters and logs.');
  }finally{try{await new Promise(r=>server.close(r));}catch{}busy=false;}
 }
 async function localRules(text,log=()=>{}){validateLocalRules(text);if(busy)throw bad('An IDS change is already running',409);if(!await owned())throw bad('Prepare IDS first');busy=true;const file=path.join(dir,'config.yaml'),before=await fs.readFile(file,'utf8'),rule=path.join(dir,'rules/panel-local.rules'),old=await fs.readFile(rule,'utf8').catch(()=>null);let wasActive=false;try{const c=YAML.parse(before),candidate=path.join(dir,'local-candidate-'+crypto.randomUUID());await fs.mkdir(candidate,{mode:0o755});try{for(const name of ['suricata.rules','panel-probe.rules'])await fs.copyFile(path.join(dir,'rules',name),path.join(candidate,name));await fs.writeFile(path.join(candidate,'panel-local.rules'),text,{mode:0o644});c['rule-files']=[...new Set([...c['rule-files'],'panel-local.rules'])];const check=structuredClone(c);check['default-rule-path']=candidate;check['default-log-dir']=dir;check.outputs=[];await fs.writeFile(path.join(dir,'test.yaml'),'%YAML 1.1\n---\n'+YAML.stringify(check),{mode:0o600});await execute('suricata',['-T','-c',path.join(dir,'test.yaml'),'-l',dir],{timeout:120000,maxBuffer:2*1024*1024});wasActive=await execute('systemctl',['is-active',unitName]).then(v=>v==='active',()=>false);await fs.writeFile(rule,text,{mode:0o644});await fs.writeFile(file,'%YAML 1.1\n---\n'+YAML.stringify(c),{mode:0o644});if(wasActive){await execute('systemctl',['restart',unitName]);await execute('systemctl',['is-active',unitName]);}log('Custom signatures syntax-checked and deployed only to the native IDS. Drop actions are not claimed as inline prevention in passive mode.');}finally{await fs.rm(candidate,{recursive:true,force:true});}}catch(e){await fs.writeFile(file,before,{mode:0o644});if(old===null)await fs.rm(rule,{force:true});else await fs.writeFile(rule,old,{mode:0o644});if(wasActive)await execute('systemctl',['restart',unitName]).catch(()=>{});throw e;}finally{busy=false;}}
 async function setTelemetry(enabled,log=()=>{}){
  if(typeof enabled!=='boolean'||busy)throw bad('Choose telemetry mode when no IDS operation is running');if(!await owned())throw bad('Prepare IDS first');busy=true;const file=path.join(dir,'config.yaml'),before=await fs.readFile(file,'utf8');let changed=false,wasActive=false;
  try{const current=YAML.parse(before),types=current.outputs?.find(o=>o['eve-log'])?.['eve-log']?.types;if(!types)throw bad('IDS event output not found');const filtered=types.filter(t=>!(typeof t==='string'?['flow','dns','tls'].includes(t):t.dns||t.tls));if(enabled)filtered.push('flow',{dns:{requests:true,responses:false}},{tls:{extended:false}});current.outputs.find(o=>o['eve-log'])['eve-log'].types=filtered;const check=structuredClone(current);check['default-rule-path']=path.join(dir,'rules');check['default-log-dir']=dir;check.outputs=[];await fs.writeFile(path.join(dir,'test.yaml'),'%YAML 1.1\n---\n'+YAML.stringify(check),{mode:0o600});await execute('suricata',['-T','-c',path.join(dir,'test.yaml'),'-l',dir],{timeout:120000,maxBuffer:2*1024*1024});wasActive=await execute('systemctl',['is-active',unitName]).then(v=>v==='active',()=>false);await fs.writeFile(file,'%YAML 1.1\n---\n'+YAML.stringify(current),{mode:0o644});changed=true;if(wasActive){await execute('systemctl',['restart',unitName]);await execute('systemctl',['is-active',unitName]);}const meta=JSON.parse(await fs.readFile(path.join(dir,'metadata.json'),'utf8'));meta.telemetry=enabled;await fs.rm(path.join(dir,'self-test.json'),{force:true});await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(meta),{mode:0o600});log(enabled?'Flow/DNS/TLS metadata enabled. No HTTP bodies or authentication headers are retained.':'Flow/DNS/TLS metadata stopped.');return {enabled};}catch(e){if(changed){await fs.writeFile(file,before,{mode:0o644});if(wasActive)await execute('systemctl',['restart',unitName]).catch(()=>{});}throw e;}finally{busy=false;}
 }
 async function refreshInterfaces(requireActive=true){
  if(busy||!await owned())return;const wasActive=await execute('systemctl',['is-active',unitName]).then(v=>v==='active',()=>false);if(requireActive&&!wasActive)return;
  const devices=JSON.parse(await execute('ip',['-j','address','show'])),interfaces=devices.filter(i=>i.flags?.includes('UP')).map(i=>i.ifname).sort(),file=path.join(dir,'config.yaml'),before=await fs.readFile(file,'utf8'),current=YAML.parse(before);
  const desired=idsConfig(current,devices.flatMap(i=>(i.addr_info||[]).map(a=>a.local)),interfaces);if(JSON.stringify((current['af-packet']||[]).map(i=>i.interface).sort())===JSON.stringify(interfaces)&&current.vars?.['address-groups']?.HOME_NET===desired.vars['address-groups'].HOME_NET)return;
  busy=true;
  try{
   const c=desired,check=structuredClone(c);check['default-rule-path']=path.join(dir,'rules');check.outputs=[];check['default-log-dir']=dir;
   await fs.writeFile(path.join(dir,'test.yaml'),'%YAML 1.1\n---\n'+YAML.stringify(check),{mode:0o600});await execute('suricata',['-T','-c',path.join(dir,'test.yaml'),'-l',dir],{timeout:120000,maxBuffer:2*1024*1024});
   await fs.writeFile(file,'%YAML 1.1\n---\n'+YAML.stringify(c),{mode:0o644});
   if(wasActive)try{await execute('systemctl',['restart',unitName]);await execute('systemctl',['is-active',unitName]);}catch(e){await fs.writeFile(file,before,{mode:0o644});await execute('systemctl',['restart',unitName]).catch(()=>{});throw e;}
   const meta=JSON.parse(await fs.readFile(path.join(dir,'metadata.json'),'utf8'));meta.interfaces=interfaces;meta.captureUpdatedAt=new Date().toISOString();await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify(meta),{mode:0o600});await fs.rm(path.join(dir,'self-test.json'),{force:true});watchError=null;
  }finally{busy=false;}
 }
 function watch(){if(watcher)return;watcher=setInterval(()=>refreshInterfaces().catch(e=>{watchError=e.message;}),30000);watcher.unref();}
 function close(){if(watcher)clearInterval(watcher);watcher=null;}
 return {status,install,prepare,action,test,update,watch,close,setTelemetry,localRules};
}
