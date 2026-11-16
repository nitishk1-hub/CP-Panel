import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {run,bad} from './management.mjs';
import {dockerStream} from './docker-maintenance.mjs';

export const pollModes={standard:2000,balanced:5000,'low-load':15000,offloaded:60000};
const reservedPorts=new Set([22,53,80,443,5000,5432,5678,8096,8787,19180]);

function securitySummaryMetrics(s={}){
 const counts=Array.isArray(s?.counts)?s.counts:[];
 const sumWhere=fn=>counts.filter(fn).reduce((n,r)=>n+Number(r.count||0),0);
 const modeStr=s?.engines?.protection?.mode||'off';
 return {
  cyberpross_security_protection_mode:modeStr==='block'?2:modeStr==='monitor'?1:0,
  cyberpross_security_events_24h:sumWhere(()=>true),
  cyberpross_security_waf_blocks_24h:sumWhere(r=>['coraza','bunkerweb'].includes(r.engine)&&r.verdict==='blocked'),
  cyberpross_security_waf_monitored_24h:sumWhere(r=>['coraza','bunkerweb'].includes(r.engine)&&r.verdict!=='blocked'),
  cyberpross_security_ids_alerts_24h:sumWhere(r=>r.engine==='suricata'&&r.kind==='alert'),
  cyberpross_security_ips_blocks_24h:sumWhere(r=>r.engine==='suricata'&&r.verdict==='blocked'),
  cyberpross_security_crowdsec_decisions:Array.isArray(s?.engines?.crowdsec?.decisions)?s.engines.crowdsec.decisions.length:0,
  cyberpross_security_db_megabytes:Number(((s?.databaseBytes||0)/1048576).toFixed(2))
 };
}

export function formatPrometheusMetrics({metrics:m,docker:d,health:h,security:s}={}){
 const sec=securitySummaryMetrics(s);
 const lines=[
  '# HELP cyberpross_cpu_usage_percent Host CPU utilization percentage',
  '# TYPE cyberpross_cpu_usage_percent gauge',
  `cyberpross_cpu_usage_percent ${Number(m?.cpu||0).toFixed(2)}`,
  '# HELP cyberpross_cpu_cores Host logical CPU cores',
  '# TYPE cyberpross_cpu_cores gauge',
  `cyberpross_cpu_cores ${Number(m?.cores||1)}`,
  '# HELP cyberpross_memory_total_bytes Total physical memory in bytes',
  '# TYPE cyberpross_memory_total_bytes gauge',
  `cyberpross_memory_total_bytes ${Number(m?.memory?.total||0)}`,
  '# HELP cyberpross_memory_used_bytes Used physical memory in bytes',
  '# TYPE cyberpross_memory_used_bytes gauge',
  `cyberpross_memory_used_bytes ${Number(m?.memory?.used||0)}`,
  '# HELP cyberpross_memory_available_bytes Available physical memory in bytes',
  '# TYPE cyberpross_memory_available_bytes gauge',
  `cyberpross_memory_available_bytes ${Number(m?.memory?.available||0)}`,
  '# HELP cyberpross_disk_total_bytes Root filesystem total bytes',
  '# TYPE cyberpross_disk_total_bytes gauge',
  `cyberpross_disk_total_bytes ${Number(m?.disk?.total||0)}`,
  '# HELP cyberpross_disk_used_bytes Root filesystem used bytes',
  '# TYPE cyberpross_disk_used_bytes gauge',
  `cyberpross_disk_used_bytes ${Number(m?.disk?.used||0)}`,
  '# HELP cyberpross_disk_available_bytes Root filesystem available bytes',
  '# TYPE cyberpross_disk_available_bytes gauge',
  `cyberpross_disk_available_bytes ${Number(m?.disk?.available||0)}`,
  '# HELP cyberpross_network_receive_bytes_per_second Aggregate host network receive rate',
  '# TYPE cyberpross_network_receive_bytes_per_second gauge',
  `cyberpross_network_receive_bytes_per_second ${Number(m?.network?.receiveRate||0)}`,
  '# HELP cyberpross_network_send_bytes_per_second Aggregate host network send rate',
  '# TYPE cyberpross_network_send_bytes_per_second gauge',
  `cyberpross_network_send_bytes_per_second ${Number(m?.network?.sendRate||0)}`,
  '# HELP cyberpross_uptime_seconds Host uptime in seconds',
  '# TYPE cyberpross_uptime_seconds counter',
  `cyberpross_uptime_seconds ${Math.floor(Number(m?.uptime||0))}`,
  '# HELP cyberpross_containers_total Total Docker containers',
  '# TYPE cyberpross_containers_total gauge',
  `cyberpross_containers_total ${Array.isArray(d?.containers)?d.containers.length:0}`,
  '# HELP cyberpross_containers_running Running Docker containers',
  '# TYPE cyberpross_containers_running gauge',
  `cyberpross_containers_running ${Array.isArray(d?.containers)?d.containers.filter(c=>c.State==='running').length:0}`,
  '# HELP cyberpross_health_ok Overall server health monitor status (1 = healthy, 0 = degraded)',
  '# TYPE cyberpross_health_ok gauge',
  `cyberpross_health_ok ${h?.ok===true?1:0}`,
  '# HELP cyberpross_security_protection_mode Active security protection mode (2=block, 1=monitor, 0=off)',
  '# TYPE cyberpross_security_protection_mode gauge',
  `cyberpross_security_protection_mode ${sec.cyberpross_security_protection_mode}`,
  '# HELP cyberpross_security_events_24h Retained security events in last 24h',
  '# TYPE cyberpross_security_events_24h gauge',
  `cyberpross_security_events_24h ${sec.cyberpross_security_events_24h}`,
  '# HELP cyberpross_security_waf_blocks_24h Coraza WAF blocked requests in last 24h',
  '# TYPE cyberpross_security_waf_blocks_24h gauge',
  `cyberpross_security_waf_blocks_24h ${sec.cyberpross_security_waf_blocks_24h}`,
  '# HELP cyberpross_security_waf_monitored_24h Coraza WAF monitored detections in last 24h',
  '# TYPE cyberpross_security_waf_monitored_24h gauge',
  `cyberpross_security_waf_monitored_24h ${sec.cyberpross_security_waf_monitored_24h}`,
  '# HELP cyberpross_security_ids_alerts_24h Suricata IDS alerts in last 24h',
  '# TYPE cyberpross_security_ids_alerts_24h gauge',
  `cyberpross_security_ids_alerts_24h ${sec.cyberpross_security_ids_alerts_24h}`,
  '# HELP cyberpross_security_ips_blocks_24h Suricata IPS blocks in last 24h',
  '# TYPE cyberpross_security_ips_blocks_24h gauge',
  `cyberpross_security_ips_blocks_24h ${sec.cyberpross_security_ips_blocks_24h}`,
  '# HELP cyberpross_security_crowdsec_decisions Active CrowdSec ban decisions',
  '# TYPE cyberpross_security_crowdsec_decisions gauge',
  `cyberpross_security_crowdsec_decisions ${sec.cyberpross_security_crowdsec_decisions}`,
  '# HELP cyberpross_security_db_megabytes Security event database size in MiB',
  '# TYPE cyberpross_security_db_megabytes gauge',
  `cyberpross_security_db_megabytes ${sec.cyberpross_security_db_megabytes}`
 ];
 return lines.join('\n')+'\n';
}

export function grafanaDashboard(){
 const ds={type:'prometheus',uid:'cyberpross-prometheus'};
 return {
  uid:'cyberpross-server-overview',
  title:'CyberPross Server Overview',
  tags:['cyberpross','ubuntu','server-panel'],
  timezone:'browser',
  schemaVersion:39,
  refresh:'15s',
  time:{from:'now-15m',to:'now'},
  panels:[
   {id:1,type:'stat',title:'CPU Usage (%)',datasource:ds,gridPos:{h:5,w:4,x:0,y:0},fieldConfig:{defaults:{unit:'percent',min:0,max:100}},targets:[{datasource:ds,expr:'cyberpross_cpu_usage_percent',refId:'A'}]},
   {id:2,type:'stat',title:'Memory Used',datasource:ds,gridPos:{h:5,w:4,x:4,y:0},fieldConfig:{defaults:{unit:'bytes'}},targets:[{datasource:ds,expr:'cyberpross_memory_used_bytes',refId:'A'}]},
   {id:3,type:'stat',title:'Running Containers',datasource:ds,gridPos:{h:5,w:4,x:8,y:0},targets:[{datasource:ds,expr:'cyberpross_containers_running',refId:'A'}]},
   {id:4,type:'stat',title:'Health Monitor (1=OK)',datasource:ds,gridPos:{h:5,w:4,x:12,y:0},targets:[{datasource:ds,expr:'cyberpross_health_ok',refId:'A'}]},
   {id:8,type:'stat',title:'WAF Blocks (24h)',datasource:ds,gridPos:{h:5,w:4,x:16,y:0},targets:[{datasource:ds,expr:'cyberpross_security_waf_blocks_24h',refId:'A'}]},
   {id:9,type:'stat',title:'CrowdSec Active Bans',datasource:ds,gridPos:{h:5,w:4,x:20,y:0},targets:[{datasource:ds,expr:'cyberpross_security_crowdsec_decisions',refId:'A'}]},
   {id:5,type:'timeseries',title:'CPU & Memory Activity',datasource:ds,gridPos:{h:8,w:12,x:0,y:5},targets:[{datasource:ds,expr:'cyberpross_cpu_usage_percent',legendFormat:'CPU %',refId:'A'}]},
   {id:6,type:'timeseries',title:'Network Traffic (Bytes/sec)',datasource:ds,gridPos:{h:8,w:12,x:12,y:5},fieldConfig:{defaults:{unit:'Bps'}},targets:[{datasource:ds,expr:'cyberpross_network_receive_bytes_per_second',legendFormat:'Receive',refId:'A'},{datasource:ds,expr:'cyberpross_network_send_bytes_per_second',legendFormat:'Send',refId:'B'}]},
   {id:7,type:'timeseries',title:'Root Disk Available',datasource:ds,gridPos:{h:7,w:12,x:0,y:13},fieldConfig:{defaults:{unit:'bytes'}},targets:[{datasource:ds,expr:'cyberpross_disk_available_bytes',legendFormat:'Free Disk Space',refId:'A'}]},
   {id:10,type:'timeseries',title:'Security Detections & WAF Blocks (24h)',datasource:ds,gridPos:{h:7,w:12,x:12,y:13},targets:[{datasource:ds,expr:'cyberpross_security_events_24h',legendFormat:'Events (24h)',refId:'A'},{datasource:ds,expr:'cyberpross_security_waf_blocks_24h',legendFormat:'WAF Blocks (24h)',refId:'B'},{datasource:ds,expr:'cyberpross_security_ids_alerts_24h',legendFormat:'IDS Alerts (24h)',refId:'C'}]}
  ]
 };
}

export function grafanaSecurityDashboard(){
 const ds={type:'prometheus',uid:'cyberpross-prometheus'};
 return {
  uid:'cyberpross-security-center',
  title:'CyberPross Security Center & WAF/IDS',
  tags:['cyberpross','security','waf','coraza','suricata','crowdsec'],
  timezone:'browser',
  schemaVersion:39,
  refresh:'15s',
  time:{from:'now-6h',to:'now'},
  panels:[
   {id:1,type:'stat',title:'Protection Mode (2=Block, 1=Monitor, 0=Off)',datasource:ds,gridPos:{h:5,w:4,x:0,y:0},targets:[{datasource:ds,expr:'cyberpross_security_protection_mode',refId:'A'}]},
   {id:2,type:'stat',title:'Total Events (24h)',datasource:ds,gridPos:{h:5,w:4,x:4,y:0},targets:[{datasource:ds,expr:'cyberpross_security_events_24h',refId:'A'}]},
   {id:3,type:'stat',title:'Coraza WAF Blocks (24h)',datasource:ds,gridPos:{h:5,w:4,x:8,y:0},targets:[{datasource:ds,expr:'cyberpross_security_waf_blocks_24h',refId:'A'}]},
   {id:4,type:'stat',title:'Suricata IDS Alerts (24h)',datasource:ds,gridPos:{h:5,w:4,x:12,y:0},targets:[{datasource:ds,expr:'cyberpross_security_ids_alerts_24h',refId:'A'}]},
   {id:5,type:'stat',title:'CrowdSec Active Bans',datasource:ds,gridPos:{h:5,w:4,x:16,y:0},targets:[{datasource:ds,expr:'cyberpross_security_crowdsec_decisions',refId:'A'}]},
   {id:6,type:'stat',title:'Security DB Size (MiB)',datasource:ds,gridPos:{h:5,w:4,x:20,y:0},targets:[{datasource:ds,expr:'cyberpross_security_db_megabytes',refId:'A'}]},
   {id:7,type:'timeseries',title:'Hourly Security Events & Confirmed WAF Blocks (24h)',datasource:ds,gridPos:{h:9,w:12,x:0,y:5},targets:[{datasource:ds,expr:'cyberpross_security_events_hourly',legendFormat:'Hourly Events',refId:'A'},{datasource:ds,expr:'cyberpross_security_blocked_hourly',legendFormat:'Hourly Blocked',refId:'B'}]},
   {id:8,type:'timeseries',title:'Live Engine Activity (Coraza WAF vs Suricata IDS vs CrowdSec)',datasource:ds,gridPos:{h:9,w:12,x:12,y:5},targets:[{datasource:ds,expr:'cyberpross_security_waf_blocks_24h',legendFormat:'Coraza WAF Blocked',refId:'A'},{datasource:ds,expr:'cyberpross_security_waf_monitored_24h',legendFormat:'Coraza WAF Monitored',refId:'B'},{datasource:ds,expr:'cyberpross_security_ids_alerts_24h',legendFormat:'Suricata IDS Alerts',refId:'C'},{datasource:ds,expr:'cyberpross_security_crowdsec_decisions',legendFormat:'CrowdSec Active Bans',refId:'D'}]}
  ]
 };
}

export function createGrafana({dataDir,panelPort=8787,execute=run,stream=dockerStream,request=fetch,isAdministrator=()=>process.getuid?.()===0,healthRetries=25,healthRetryDelayMs=800}={}){
 const dir=path.join(dataDir,'grafana'),settingsFile=path.join(dir,'settings.json'),envFile=path.join(dir,'grafana.env'),promTokenFile=path.join(dir,'prom.token'),aiFile=path.join(dir,'ai.json');
 const dashboardFile=path.join(dir,'dashboards','cyberpross-overview.json');
 const securityDashboardFile=path.join(dir,'dashboards','cyberpross-security.json');
 let cache=null,stamp=0,promTokenCache=null;
 const seriesHistory=[];

 async function readAiConfig(){
  try{
   const raw=JSON.parse(await fs.readFile(aiFile,'utf8'));
   return {
    provider:['auto','openrouter','openai','gemini','anthropic','local'].includes(raw.provider)?raw.provider:'auto',
    model:typeof raw.model==='string'&&raw.model.trim()?raw.model.trim().slice(0,80):'anthropic/claude-3.5-sonnet',
    apiKey:typeof raw.apiKey==='string'?raw.apiKey.trim():'',
    baseUrl:typeof raw.baseUrl==='string'&&raw.baseUrl.startsWith('https://')?raw.baseUrl.trim():''
   };
  }catch{
   return {provider:'auto',model:'anthropic/claude-3.5-sonnet',apiKey:'',baseUrl:''};
  }
 }

 async function saveAiSettings(b={}){
  const current=await readAiConfig();
  const provider=b.provider&&['auto','openrouter','openai','gemini','anthropic','local'].includes(b.provider)?b.provider:current.provider;
  const model=typeof b.model==='string'&&b.model.trim()?b.model.trim().slice(0,80):current.model;
  const apiKey=b.clearKey===true?'':(typeof b.apiKey==='string'&&b.apiKey.trim()?b.apiKey.trim():current.apiKey);
  if(apiKey&&(apiKey.length<10||apiKey.length>300||/[\r\n\0]/.test(apiKey)))throw bad('Provide a valid AI API key');
  const baseUrl=typeof b.baseUrl==='string'&&b.baseUrl.trim()?b.baseUrl.trim():current.baseUrl;
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const next={provider,model,apiKey,baseUrl,updatedAt:new Date().toISOString()};
  await fs.writeFile(aiFile,JSON.stringify(next,null,2),{mode:0o600});
  await fs.chmod(aiFile,0o600);
  await provision().catch(()=>{});
  stamp=0;
  return status(true);
 }

 function recordSnapshot({metrics:m,docker:d,health:h,security:s}={}){
  const t=Math.floor(Date.now()/1000);
  const sec=securitySummaryMetrics(s);
  const values={
   cyberpross_cpu_usage_percent:Number(m?.cpu||0),
   cyberpross_cpu_cores:Number(m?.cores||1),
   cyberpross_memory_total_bytes:Number(m?.memory?.total||0),
   cyberpross_memory_used_bytes:Number(m?.memory?.used||0),
   cyberpross_memory_available_bytes:Number(m?.memory?.available||0),
   cyberpross_disk_total_bytes:Number(m?.disk?.total||0),
   cyberpross_disk_used_bytes:Number(m?.disk?.used||0),
   cyberpross_disk_available_bytes:Number(m?.disk?.available||0),
   cyberpross_network_receive_bytes_per_second:Number(m?.network?.receiveRate||0),
   cyberpross_network_send_bytes_per_second:Number(m?.network?.sendRate||0),
   cyberpross_uptime_seconds:Math.floor(Number(m?.uptime||0)),
   cyberpross_containers_total:Array.isArray(d?.containers)?d.containers.length:0,
   cyberpross_containers_running:Array.isArray(d?.containers)?d.containers.filter(c=>c.State==='running').length:0,
   cyberpross_health_ok:h?.ok===false?0:1,
   ...sec,
   cyberpross_security_events_hourly:sec.cyberpross_security_events_24h,
   cyberpross_security_blocked_hourly:sec.cyberpross_security_waf_blocks_24h
  };
  if(!seriesHistory.length||t-seriesHistory.at(-1).t>=2){
   seriesHistory.push({t,values});
   if(seriesHistory.length>360)seriesHistory.shift();
  }else{
   seriesHistory[seriesHistory.length-1]={t,values};
  }
  return values;
 }

 async function getPromToken(){
  if(promTokenCache)return promTokenCache;
  try{
   promTokenCache=(await fs.readFile(promTokenFile,'utf8')).trim();
   if(promTokenCache.length>=32)return promTokenCache;
  }catch{}
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  promTokenCache=crypto.randomBytes(24).toString('base64url');
  await fs.writeFile(promTokenFile,promTokenCache,{mode:0o600});
  return promTokenCache;
 }

 async function readSettings(){
  try{
   const raw=JSON.parse(await fs.readFile(settingsFile,'utf8'));
   return {
    pollMode:Object.hasOwn(pollModes,raw.pollMode)?raw.pollMode:'standard',
    grafanaPort:Number.isInteger(raw.grafanaPort)&&raw.grafanaPort>=1024&&raw.grafanaPort<=65535&&!reservedPorts.has(raw.grafanaPort)?raw.grafanaPort:3030,
    scrapeEnabled:raw.scrapeEnabled!==false,
    adminUser:typeof raw.adminUser==='string'&&/^[a-zA-Z0-9._-]{3,64}$/.test(raw.adminUser)?raw.adminUser:'admin',
    authProxyEnabled:raw.authProxyEnabled!==false,
    passwordConfigured:Boolean(raw.passwordConfigured)
   };
  }catch{
   return {pollMode:'standard',grafanaPort:3030,scrapeEnabled:true,adminUser:'admin',authProxyEnabled:true,passwordConfigured:false};
  }
 }

 async function writeSettings(next){
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  const tmp=settingsFile+'.'+crypto.randomUUID();
  await fs.writeFile(tmp,JSON.stringify(next,null,2),{mode:0o600,flag:'wx'});
  await fs.rename(tmp,settingsFile);
  stamp=0;
  return next;
 }

 async function writeContainerEnv({port,adminUser,adminPassword,authProxyEnabled}){
  await fs.mkdir(dir,{recursive:true,mode:0o700});
  let existingPassword=crypto.randomBytes(16).toString('hex');
  try{
   const oldEnv=await fs.readFile(envFile,'utf8');
   const m=/^GF_SECURITY_ADMIN_PASSWORD=(.+)$/m.exec(oldEnv);
   if(m)existingPassword=m[1];
  }catch{}
  const pass=adminPassword||existingPassword;
  const lines=[
   'GF_SERVER_HTTP_ADDR=127.0.0.1',
   `GF_SERVER_HTTP_PORT=${port}`,
   'GF_SERVER_ROOT_URL=%(protocol)s://%(domain)s:%(http_port)s/api/grafana/proxy/',
   'GF_SERVER_SERVE_FROM_SUB_PATH=true',
   'GF_SECURITY_ALLOW_EMBEDDING=true',
   'GF_SECURITY_COOKIE_SAMESITE=lax',
   `GF_SECURITY_ADMIN_USER=${adminUser}`,
   `GF_SECURITY_ADMIN_PASSWORD=${pass}`,
   `GF_AUTH_PROXY_ENABLED=${authProxyEnabled?'true':'false'}`,
   'GF_AUTH_PROXY_HEADER_NAME=X-WEBAUTH-USER',
   'GF_AUTH_PROXY_HEADER_PROPERTY=username',
   'GF_AUTH_PROXY_AUTO_SIGN_UP=true',
   'GF_USERS_AUTO_ASSIGN_ORG_ROLE=Admin',
   'GF_USERS_ALLOW_SIGN_UP=false',
   'GF_ANALYTICS_REPORTING_ENABLED=false',
   'GF_ANALYTICS_CHECK_FOR_UPDATES=false',
   'GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/grafana/cyberpross-dashboards/cyberpross-overview.json'
  ];
  await fs.writeFile(envFile,lines.join('\n')+'\n',{mode:0o600});
  await fs.chmod(envFile,0o600);
 }

 async function saveSettings(b={}){
  const current=await readSettings();
  const pollMode=b.pollMode??current.pollMode;
  if(!Object.hasOwn(pollModes,pollMode))throw bad('Choose standard (2s), balanced (5s), low-load (15s) or offloaded (60s)');
  const grafanaPort=b.grafanaPort===undefined?current.grafanaPort:Number(b.grafanaPort);
  if(!Number.isInteger(grafanaPort)||grafanaPort<1024||grafanaPort>65535||reservedPorts.has(grafanaPort))throw bad('Choose an unreserved local Grafana port between 1024 and 65535');
  const scrapeEnabled=b.scrapeEnabled===undefined?current.scrapeEnabled:Boolean(b.scrapeEnabled);
  const adminUser=b.adminUser===undefined?current.adminUser:String(b.adminUser).trim();
  if(!/^[a-zA-Z0-9._-]{3,64}$/.test(adminUser))throw bad('Grafana admin username must be 3–64 letters, numbers, dots, underscores or hyphens');
  const authProxyEnabled=b.authProxyEnabled===undefined?current.authProxyEnabled:Boolean(b.authProxyEnabled);
  let passwordConfigured=current.passwordConfigured;
  if(b.adminPassword!==undefined&&b.adminPassword!==''){
   const pw=String(b.adminPassword);
   if(pw.length<8||pw.length>128||/[\r\n\0]/.test(pw))throw bad('Grafana admin password must be 8–128 characters');
   passwordConfigured=true;
   await writeContainerEnv({port:grafanaPort,adminUser,adminPassword:pw,authProxyEnabled});
   const st=await status(true);
   if(st.installed&&st.active&&st.mode==='docker'){
    await execute('docker',['exec',st.target||'cyberpross-grafana','grafana','cli','admin','reset-admin-password',pw]).catch(()=>{});
   }
  }else{
   await writeContainerEnv({port:grafanaPort,adminUser,authProxyEnabled});
  }
  const stAfter=await status(true);
  if(stAfter.installed&&stAfter.active&&stAfter.mode==='docker'){
   if(adminUser!==current.adminUser){
    await request(`http://127.0.0.1:${grafanaPort}/api/grafana/proxy/api/users/1`,{
     method:'PUT',
     headers:{'Content-Type':'application/json','X-WEBAUTH-USER':current.adminUser||'admin'},
     body:JSON.stringify({login:adminUser,name:adminUser,email:`${adminUser}@localhost`}),
     signal:AbortSignal.timeout(3000)
    }).catch(()=>{});
   }
   if(authProxyEnabled!==current.authProxyEnabled||grafanaPort!==current.grafanaPort){
    await recreateContainer({port:grafanaPort}).catch(()=>{});
   }
  }
  await writeSettings({pollMode,grafanaPort,scrapeEnabled,adminUser,authProxyEnabled,passwordConfigured,updatedAt:new Date().toISOString()});
  return status(true);
 }

 async function provision(){
  const provRoot=path.join(dir,'provisioning');
  const provDatasources=path.join(provRoot,'datasources');
  const provDashboards=path.join(provRoot,'dashboards');
  const provPlugins=path.join(provRoot,'plugins');
  const dashboardsDir=path.join(dir,'dashboards');
  const dataStorage=path.join(dir,'data');
  for(const d of [dir,provRoot,provDatasources,provDashboards,provPlugins,dashboardsDir,dataStorage]){
   await fs.mkdir(d,{recursive:true,mode:0o755});
   await fs.chmod(d,d===dir?0o700:0o755);
  }
  const token=await getPromToken();
  const aiCfg=await readAiConfig();
  const portNum=(typeof panelPort==='function'?panelPort():panelPort)||8787;
  const datasourceFile=path.join(provDatasources,'cyberpross.yaml');
  const providerFile=path.join(provDashboards,'provider.yaml');
  const llmPluginFile=path.join(provPlugins,'llm.yaml');
  const datasourceYaml=`apiVersion: 1\ndeleteDatasources:\n  - name: Prometheus\n    orgId: 1\ndatasources:\n  - name: CyberPross Prometheus\n    uid: cyberpross-prometheus\n    orgId: 1\n    type: prometheus\n    access: proxy\n    url: http://127.0.0.1:${portNum}/api/grafana/prom\n    isDefault: true\n    editable: true\n    jsonData:\n      httpMethod: GET\n      httpHeaderName1: Authorization\n    secureJsonData:\n      httpHeaderValue1: Bearer ${token}\n`;
  const providerYaml=`apiVersion: 1\nproviders:\n  - name: CyberPross\n    orgId: 1\n    folder: CyberPross\n    type: file\n    disableDeletion: false\n    editable: true\n    options:\n      path: /var/lib/grafana/cyberpross-dashboards\n`;
  await fs.writeFile(datasourceFile,datasourceYaml,{mode:0o644});
  await fs.writeFile(providerFile,providerYaml,{mode:0o644});
  await fs.writeFile(dashboardFile,JSON.stringify(grafanaDashboard(),null,2),{mode:0o644});
  await fs.writeFile(securityDashboardFile,JSON.stringify(grafanaSecurityDashboard(),null,2),{mode:0o644});
  if(aiCfg.apiKey){
   const isOR=aiCfg.provider==='openrouter'||aiCfg.apiKey.startsWith('sk-or-v1-')||aiCfg.apiKey.startsWith('sk-or-');
   const llmUrl=isOR?'https://openrouter.ai/api/v1':(aiCfg.baseUrl||'https://api.openai.com');
   const llmYaml=`apiVersion: 1\napps:\n  - type: grafana-llm-app\n    org_id: 1\n    disabled: false\n    jsonData:\n      openAI:\n        provider: openai\n        url: ${llmUrl}\n    secureJsonData:\n      openAIKey: ${aiCfg.apiKey}\n`;
   await fs.writeFile(llmPluginFile,llmYaml,{mode:0o640});
  }
  for(const f of [datasourceFile,providerFile,dashboardFile,securityDashboardFile])await fs.chmod(f,0o644);
  if(process.getuid?.()===0){
   for(const p of [provRoot,provDatasources,provDashboards,provPlugins,dashboardsDir,dataStorage,datasourceFile,providerFile,dashboardFile,securityDashboardFile]){
    await fs.chown(p,472,472).catch(()=>{});
   }
  }
  stamp=0;
  return {provisioned:true,dashboardFile,securityDashboardFile};
 }

 async function probeHealth(port){
  for(const p of [`/api/grafana/proxy/api/health`,`/api/health`]){
   try{
    const r=await request(`http://127.0.0.1:${port}${p}`,{signal:AbortSignal.timeout(2000),redirect:'error'});
    if(!r.ok)continue;
    const data=await r.json().catch(()=>({}));
    return {ok:true,version:data.version||null,database:data.database||'ok'};
   }catch{}
  }
  return {ok:false};
 }

 async function status(fresh=false){
  if(!fresh&&cache&&Date.now()-stamp<8000)return cache;
  const [settings,aiCfg]=await Promise.all([readSettings(),readAiConfig()]);
  let mode=null,state='not_installed',containerId=null,unit=null,version=null;
  const unitOut=await execute('systemctl',['show','grafana-server.service','--no-pager','-p','LoadState','-p','ActiveState','-p','SubState']).catch(()=>'');
  const unitProps=Object.fromEntries(unitOut.split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
  if(unitProps.LoadState==='loaded'){
   mode='native';
   unit='grafana-server.service';
   state=unitProps.ActiveState==='active'?'running':unitProps.ActiveState||'stopped';
  }
  const dockerOut=await execute('docker',['ps','-a','--format','{{json .}}']).catch(()=>'');
  for(const line of dockerOut.split('\n').filter(Boolean)){
   try{
    const c=JSON.parse(line);
    if(c.Names==='cyberpross-grafana'||/(?:^|\/)grafana(?:-oss|-enterprise)?(?::|@|$)/i.test(c.Image)){
     mode='docker';
     containerId=c.Names||c.ID;
     state=c.State==='running'?'running':c.State||'stopped';
     break;
    }
   }catch{}
  }
  const health=state==='running'?await probeHealth(settings.grafanaPort):{ok:false};
  if(health.version)version=health.version;
  const dashboardProvisioned=await fs.access(dashboardFile).then(()=>true,()=>false);
  cache={
   installed:Boolean(mode),
   active:state==='running',
   healthy:health.ok,
   mode,
   state,
   target:containerId||unit||null,
   version,
   port:settings.grafanaPort,
   localURL:`http://127.0.0.1:${settings.grafanaPort}`,
   embedURL:'/api/grafana/proxy/d/cyberpross-server-overview/cyberpross-server-overview?orgId=1&kiosk=tv',
   dashboardURL:'/api/grafana/proxy/d/cyberpross-server-overview/cyberpross-server-overview?orgId=1',
   securityDashboardURL:'/api/grafana/proxy/d/cyberpross-security-center/cyberpross-security-center?orgId=1',
   consoleURL:'/api/grafana/proxy/?orgId=1',
   embeddedURL:'/api/grafana/proxy/?orgId=1',
   adminUser:settings.adminUser,
   authProxyEnabled:settings.authProxyEnabled,
   passwordConfigured:settings.passwordConfigured,
   pollMode:settings.pollMode,
   effectiveIntervalMs:pollModes[settings.pollMode]||2000,
   scrapeEnabled:settings.scrapeEnabled,
   prometheusEndpoint:'/api/grafana/prometheus',
   dashboardProvisioned,
   ai:{
    configured:Boolean(aiCfg.apiKey),
    provider:aiCfg.provider,
    model:aiCfg.model,
    keyHint:aiCfg.apiKey?'••••'+aiCfg.apiKey.slice(-4):null,
    baseUrl:aiCfg.baseUrl||''
   },
   canManage:isAdministrator()
  };
  stamp=Date.now();
  return cache;
 }

 async function startContainer(port,settings,log){
  const args=[
   'run','--detach','--name','cyberpross-grafana',
   '--restart','unless-stopped',
   '--network','host',
   '--user','472:472',
   '--cap-drop','ALL',
   '--security-opt','no-new-privileges:true',
   '--memory','512m','--cpus','1',
   '--env-file',envFile,
   '--mount',`type=bind,src=${path.join(dir,'data')},dst=/var/lib/grafana`,
   '--mount',`type=bind,src=${path.join(dir,'provisioning')},dst=/etc/grafana/provisioning,readonly`,
   '--mount',`type=bind,src=${path.join(dir,'dashboards')},dst=/var/lib/grafana/cyberpross-dashboards,readonly`,
   'grafana/grafana-oss:latest'
  ];
  log(`Starting isolated Grafana instance on 127.0.0.1:${port} with embedded panel proxy…`);
  await stream(args,log);
 }

 async function install(b={},log=()=>{}){
  if(!isAdministrator())throw bad('Administrator service is required to install Grafana',403);
  const settings=await readSettings();
  const port=b.grafanaPort?Number(b.grafanaPort):settings.grafanaPort;
  if(!Number.isInteger(port)||port<1024||port>65535||reservedPorts.has(port))throw bad('Choose a valid unreserved local port for Grafana');
  const adminUser=b.adminUser?String(b.adminUser).trim():settings.adminUser;
  if(!/^[a-zA-Z0-9._-]{3,64}$/.test(adminUser))throw bad('Invalid Grafana admin username');
  const authProxyEnabled=b.authProxyEnabled===undefined?settings.authProxyEnabled:Boolean(b.authProxyEnabled);
  let passwordConfigured=settings.passwordConfigured;
  if(b.adminPassword){
   const pw=String(b.adminPassword);
   if(pw.length<8||pw.length>128||/[\r\n\0]/.test(pw))throw bad('Grafana admin password must be 8–128 characters');
   passwordConfigured=true;
  }
  log('Provisioning CyberPross Grafana dashboards, Prometheus data bridge, and embedded configuration…');
  await provision();
  await writeContainerEnv({port,adminUser,adminPassword:b.adminPassword,authProxyEnabled});
  await execute('docker',['rm','--force','cyberpross-grafana']).catch(()=>{});
  log('Pulling official grafana/grafana-oss image…');
  await stream(['pull','grafana/grafana-oss:latest'],log);
  await startContainer(port,{adminUser,authProxyEnabled},log);
  let ready=false;
  for(let i=0;i<healthRetries;i++){
   const h=await probeHealth(port);
   if(h.ok){ready=true;break;}
   await new Promise(r=>setTimeout(r,healthRetryDelayMs));
  }
  if(!ready){
   await execute('docker',['rm','--force','cyberpross-grafana']).catch(()=>{});
   throw bad('Grafana did not pass local HTTP health verification; container was rolled back.');
  }
  if(b.adminPassword){
   await execute('docker',['exec','cyberpross-grafana','grafana','cli','admin','reset-admin-password',String(b.adminPassword)]).catch(()=>{});
  }
  await writeSettings({pollMode:b.pollMode&&Object.hasOwn(pollModes,b.pollMode)?b.pollMode:'low-load',grafanaPort:port,scrapeEnabled:true,adminUser,authProxyEnabled,passwordConfigured,updatedAt:new Date().toISOString()});
  log('Grafana is active, embedded inside the Monitoring view, and panel polling is in low-load mode (15s).');
  return status(true);
 }

 async function control(b={},log=()=>{}){
  if(!isAdministrator())throw bad('Administrator permission required',403);
  const {action}=b;
  if(action==='provision'||action==='reconfigure'){
   const settings=await saveSettings(b);
   await provision();
   const current=await status(true);
   if(current.mode==='docker'){
    await execute('docker',['rm','--force','cyberpross-grafana']).catch(()=>{});
    await startContainer(settings.port,settings,log);
    for(let i=0;i<healthRetries;i++){
     if((await probeHealth(settings.port)).ok)break;
     await new Promise(r=>setTimeout(r,healthRetryDelayMs));
    }
    if(b.adminPassword){
     await execute('docker',['exec','cyberpross-grafana','grafana','cli','admin','reset-admin-password',String(b.adminPassword)]).catch(()=>{});
    }
   }
   stamp=0;
   log('Provisioned CyberPross Server Overview dashboard and applied Grafana credentials/proxy settings.');
   return status(true);
  }
  if(!['start','stop','restart'].includes(action))throw bad('Choose start, stop, restart, provision or reconfigure');
  const current=await status(true);
  if(!current.installed)throw bad('Grafana is not installed yet');
  if(current.mode==='native'){
   await execute('systemctl',[action,'grafana-server.service'],{timeout:60000});
  }else{
   await stream([action,current.target||'cyberpross-grafana'],log);
  }
  stamp=0;
  const after=await status(true);
  log(`Grafana ${action} completed (${after.state}).`);
  return after;
 }

 async function logs(){
  const current=await status(true);
  if(!current.installed)return {output:'Grafana is not installed.'};
  const out=current.mode==='native'
   ?await execute('journalctl',['-u','grafana-server.service','-n','150','--no-pager','-o','short-iso']).catch(e=>e.message)
   :await execute('docker',['logs','--tail','150',current.target||'cyberpross-grafana']).catch(e=>e.message);
  return {output:String(out).replace(/(password|secret|token)\s*[:=]\s*\S+/gi,'$1=[redacted]').slice(-64000)};
 }

 async function handlePromApi(url,collectNow){
  const latest=await collectNow();
  const values=recordSnapshot(latest);
  const trends=Array.isArray(latest?.security?.trends)?latest.security.trends:[];
  const nowSec=Math.floor(Date.now()/1000);
  const sub=url.pathname.slice('/api/grafana/prom'.length);
  const metricNames=Object.keys(values);
  if(sub==='/api/v1/labels')return {status:'success',data:['__name__','instance','job']};
  if(sub.startsWith('/api/v1/label/')&&sub.endsWith('/values')){
   const label=sub.slice('/api/v1/label/'.length,-'/values'.length);
   return {status:'success',data:label==='__name__'?metricNames:label==='job'?['cyberpross']:['localhost']};
  }
  if(sub==='/api/v1/metadata')return {status:'success',data:Object.fromEntries(metricNames.map(k=>[k,[{type:'gauge',help:k,unit:''}]]))};
  if(sub==='/api/v1/series')return {status:'success',data:metricNames.map(k=>({__name__:k,job:'cyberpross',instance:'localhost'}))};
  const expr=String(url.searchParams.get('query')||'').trim();
  const matched=metricNames.filter(k=>expr.includes(k));
  const targets=matched.length?matched:(metricNames.includes(expr)?[expr]:[]);
  if(sub==='/api/v1/query'){
   const t=Number(url.searchParams.get('time'))||nowSec;
   return {
    status:'success',
    data:{
     resultType:'vector',
     result:targets.map(name=>({
      metric:{__name__:name,job:'cyberpross',instance:'localhost'},
      value:[t,String(values[name]??0)]
     }))
    }
   };
  }
  if(sub==='/api/v1/query_range'){
   const start=Number(url.searchParams.get('start'))||(nowSec-900);
   const end=Number(url.searchParams.get('end'))||nowSec;
   const points=seriesHistory.filter(p=>p.t>=start&&p.t<=end);
   return {
    status:'success',
    data:{
     resultType:'matrix',
     result:targets.map(name=>{
      if((name==='cyberpross_security_events_hourly'||name==='cyberpross_security_blocked_hourly')&&trends.length){
       const trendVals=trends.map(row=>[Math.floor(Date.parse(row.hour)/1000),String(name==='cyberpross_security_blocked_hourly'?Number(row.blocked||0):Number(row.count||0))]).filter(([ts])=>Number.isFinite(ts));
       if(trendVals.length)return {metric:{__name__:name,job:'cyberpross',instance:'localhost'},values:trendVals};
      }
      const vals=points.length>=2?points.map(p=>[p.t,String(p.values[name]??0)]):[[start,String(values[name]??0)],[Math.floor((start+end)/2),String(values[name]??0)],[end,String(values[name]??0)]];
      return {metric:{__name__:name,job:'cyberpross',instance:'localhost'},values:vals};
     })
    }
   };
  }
  return {status:'success',data:{resultType:'vector',result:[]}};
 }

 async function askAi(b={},collectContext=async()=>({})){
  const prompt=String(b.prompt||'').trim();
  if(!prompt||prompt.length>2000)throw bad('Enter an AI question or control instruction (up to 2,000 characters)');
  const [ctx,aiCfg,st]=await Promise.all([collectContext(),readAiConfig(),status()]);
  const sec=securitySummaryMetrics(ctx.security);
  const actions=[];
  const q=prompt.toLowerCase();
  if(/block\s+attack|turn\s+on\s+security|enable\s+(?:waf|security|protection)|mode\s+block/i.test(q)){
   actions.push({id:'protection-block',label:'Turn On Security (Block Attacks)',kind:'protection',mode:'block'});
  }else if(/monitor\s+mode|monitor\s+only/i.test(q)){
   actions.push({id:'protection-monitor',label:'Set Security to Monitor Mode',kind:'protection',mode:'monitor'});
  }else if(/turn\s+off\s+security|disable\s+(?:waf|security|protection)|mode\s+off/i.test(q)){
   actions.push({id:'protection-off',label:'Turn Off Security Protection',kind:'protection',mode:'off'});
  }
  if(/security|waf|attack|coraza|crowdsec|ids|suricata/i.test(q)){
   actions.push({id:'open-security-dash',label:'Open Security Center Dashboard in Grafana',kind:'dashboard',target:st.securityDashboardURL});
  }
  if(/low[-\s]?load|offload|reduce\s+load|polling/i.test(q)){
   actions.push({id:'poll-low-load',label:'Switch Panel to Low-Load (15s)',kind:'poll',pollMode:'low-load'});
   actions.push({id:'poll-offloaded',label:'Switch Panel to Offloaded (60s)',kind:'poll',pollMode:'offloaded'});
  }
  if(/health|scan|doctor|check\s+server/i.test(q)){
   actions.push({id:'health-scan',label:'Run Deep Server Health Scan',kind:'health'});
  }
  if(/provision|refresh\s+dashboard|rebuild\s+dashboard/i.test(q)){
   actions.push({id:'grafana-provision',label:'Re-provision Grafana Dashboards',kind:'provision'});
  }
  const compactContext={
   host:ctx.metrics?{hostname:ctx.metrics.hostname,cpuPercent:Number((ctx.metrics.cpu||0).toFixed(1)),ramUsedGiB:Number(((ctx.metrics.memory?.used||0)/1024**3).toFixed(2)),ramTotalGiB:Number(((ctx.metrics.memory?.total||0)/1024**3).toFixed(2)),diskFreeGiB:Number(((ctx.metrics.disk?.available||0)/1024**3).toFixed(2))}:null,
   containers:Array.isArray(ctx.docker?.containers)?ctx.docker.containers.map(c=>({name:c.Names,state:c.State})):[],
   security:{
    mode:ctx.security?.engines?.protection?.mode||'unknown',
    corazaHealthy:Boolean(ctx.security?.engines?.protection?.healthy),
    events24h:sec.cyberpross_security_events_24h,
    wafBlocks24h:sec.cyberpross_security_waf_blocks_24h,
    idsAlerts24h:sec.cyberpross_security_ids_alerts_24h,
    crowdsecActiveBans:sec.cyberpross_security_crowdsec_decisions
   },
   grafana:{active:st.active,healthy:st.healthy,pollMode:st.pollMode,intervalMs:st.effectiveIntervalMs}
  };
  const systemInstruction='You are the CyberPross Server Panel & Grafana AI Copilot. Use the provided compact Graphify & Prometheus telemetry digest (~350 tokens) to answer concisely in plain text (3-6 sentences) with actionable server, Grafana, and Security Center guidance.';
  let answer=null,providerUsed='graphify-local',modelUsed='graphify-heuristic-v1';
  const useProvider=aiCfg.apiKey&&(aiCfg.provider==='auto'?(aiCfg.apiKey.startsWith('sk-or-v1-')||aiCfg.apiKey.startsWith('sk-or-')?'openrouter':/^AIza/.test(aiCfg.apiKey)?'gemini':/^sk-ant/.test(aiCfg.apiKey)?'anthropic':'openai'):aiCfg.provider);
  if(useProvider&&useProvider!=='local'&&aiCfg.apiKey){
   try{
    if(useProvider==='openrouter'){
     const model=aiCfg.model&&aiCfg.model.includes('/')?aiCfg.model:'anthropic/claude-3.5-sonnet';
     const r=await request((aiCfg.baseUrl||'https://openrouter.ai/api/v1')+'/chat/completions',{
      method:'POST',
      headers:{
       'Content-Type':'application/json',
       Authorization:'Bearer '+aiCfg.apiKey,
       'HTTP-Referer':(process.env.PANEL_PUBLIC_URL||'https://'+os.hostname()),
       'X-Title':'Server Panel'
      },
      body:JSON.stringify({
       model,
       messages:[
        {role:'system',content:systemInstruction},
        {role:'user',content:`Telemetry digest:\n${JSON.stringify(compactContext)}\n\nAdmin request: ${prompt}`}
       ],
       max_tokens:600,
       temperature:0.2
      }),
      signal:AbortSignal.timeout(15000)
     });
     const data=await r.json();
     if(r.ok&&data.choices?.[0]?.message?.content){
      answer=data.choices[0].message.content.trim();
      providerUsed='openrouter';
      modelUsed=model;
     }
    }else if(useProvider==='openai'){
     const model=aiCfg.model||'gpt-4o-mini';
     const r=await request((aiCfg.baseUrl||'https://api.openai.com')+'/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+aiCfg.apiKey},
      body:JSON.stringify({model,messages:[{role:'system',content:systemInstruction},{role:'user',content:`Telemetry digest:\n${JSON.stringify(compactContext)}\n\nAdmin request: ${prompt}`}],max_tokens:450,temperature:0.2}),
      signal:AbortSignal.timeout(15000)
     });
     const data=await r.json();
     if(r.ok&&data.choices?.[0]?.message?.content){answer=data.choices[0].message.content.trim();providerUsed='openai';modelUsed=model;}
    }else if(useProvider==='gemini'){
     const model=aiCfg.model&&aiCfg.model.startsWith('gemini')?aiCfg.model:'gemini-2.5-flash';
     const r=await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(aiCfg.apiKey)}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{parts:[{text:`${systemInstruction}\n\nTelemetry digest:\n${JSON.stringify(compactContext)}\n\nAdmin request: ${prompt}`}]}]}),
      signal:AbortSignal.timeout(15000)
     });
     const data=await r.json();
     const text=data.candidates?.[0]?.content?.parts?.[0]?.text;
     if(r.ok&&text){answer=text.trim();providerUsed='gemini';modelUsed=model;}
    }else if(useProvider==='anthropic'){
     const model=aiCfg.model&&aiCfg.model.startsWith('claude')?aiCfg.model:'claude-3-5-sonnet-latest';
     const r=await request('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':aiCfg.apiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model,max_tokens:450,system:systemInstruction,messages:[{role:'user',content:`Telemetry digest:\n${JSON.stringify(compactContext)}\n\nAdmin request: ${prompt}`}]}),
      signal:AbortSignal.timeout(15000)
     });
     const data=await r.json();
     const text=data.content?.[0]?.text;
     if(r.ok&&text){answer=text.trim();providerUsed='anthropic';modelUsed=model;}
    }
   }catch{}
  }
  if(!answer){
   const h=compactContext.host,s=compactContext.security;
   const runningCount=compactContext.containers.filter(c=>c.state==='running').length;
   answer=[
    `[Graphify + Prometheus Telemetry Summary] Host ${h?.hostname||'server'} is at ${h?.cpuPercent??0}% CPU, ${h?.ramUsedGiB??0}/${h?.ramTotalGiB??0} GiB RAM, and ${h?.diskFreeGiB??0} GiB free disk with ${runningCount}/${compactContext.containers.length} containers running.`,
    `Security Center is in "${s.mode}" mode (Coraza WAF: ${s.corazaHealthy?'Healthy':'Check required'}) with ${s.events24h} events, ${s.wafBlocks24h} WAF blocks, ${s.idsAlerts24h} Suricata IDS alerts, and ${s.crowdsecActiveBans} active CrowdSec bans in the last 24h.`,
    `Grafana is ${st.active?'running embedded':'stopped'} with panel load set to "${st.pollMode}" (${Math.round(st.effectiveIntervalMs/1000)}s interval).`,
    actions.length?'Click any suggested action button below to execute the change immediately.':'Use the quick action buttons or add an OpenAI / Gemini / Anthropic API key in Credentials & Setup for deep conversational analysis.'
   ].join(' ');
  }
  if(!actions.length){
   actions.push(
    {id:'open-security-dash',label:'View Security Center in Grafana',kind:'dashboard',target:st.securityDashboardURL},
    {id:'open-overview-dash',label:'View Server Overview in Grafana',kind:'dashboard',target:st.dashboardURL}
   );
  }
  return {answer,actions,providerUsed,modelUsed,context:compactContext,tokenReduction:'35.4x–77.8x via Graphify digest'};
 }

 async function proxyHttp(req,res){
  const settings=await readSettings();
  const headers={...req.headers,host:req.headers.host||`127.0.0.1:${settings.grafanaPort}`};
  delete headers['x-webauth-user'];
  if(settings.authProxyEnabled)headers['x-webauth-user']=settings.adminUser||'admin';
  const upstream=http.request({
   hostname:'127.0.0.1',
   port:settings.grafanaPort,
   path:req.url,
   method:req.method,
   headers,
   timeout:30000
  },upRes=>{
   const outHeaders={...upRes.headers};
   delete outHeaders['x-frame-options'];
   outHeaders['content-security-policy']="frame-ancestors 'self'";
   res.writeHead(upRes.statusCode||502,outHeaders);
   upRes.pipe(res);
  });
  upstream.on('error',()=>{
   if(!res.headersSent){
    res.writeHead(502,{'Content-Type':'text/html; charset=utf-8'});
    res.end('<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px;color:#52647a">Grafana is starting or not running on 127.0.0.1:'+settings.grafanaPort+'. Use Monitoring → Setup & Credentials to start or provision it.</body>');
   }else res.destroy();
  });
  req.pipe(upstream);
 }

 return {status,readSettings,saveSettings,saveAiSettings,askAi,provision,install,control,logs,getPromToken,recordSnapshot,handlePromApi,proxyHttp};
}
