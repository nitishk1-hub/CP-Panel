import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const exec=promisify(execFile);
if(process.getuid()!==0)throw Error('Run end-to-end qualification as root so temporary OAuth grant and test fixtures can be cleaned up safely.');

const dataDir='/var/lib/server-panel';
const oauthFile=path.join(dataDir,'mcp-oauth.json');
const usersFile=path.join(dataDir,'users.json');
const publicOrigin='https://cyber.cyberpross.cc';
const mcpUrl=publicOrigin+'/mcp';

const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const users=JSON.parse(await fs.readFile(usersFile,'utf8'));
const admin=users.find(u=>u.enabled&&u.role==='admin'&&!u.mustChangePassword);
if(!admin)throw Error('No active admin user found');
const stamp=hash((admin.salt||'')+'\0'+(admin.hash||'')+'\0'+JSON.stringify(admin.mfa?.secret||null));

const clientId='e2e-client-'+crypto.randomUUID();
const grantId=crypto.randomUUID();
const rawToken='cpoa_'+crypto.randomBytes(32).toString('base64url');
const now=Date.now();

const oauthBackup=await fs.readFile(oauthFile,'utf8').catch(()=>null);
const oauthData=oauthBackup?JSON.parse(oauthBackup):{clients:[],codes:[],grants:[],tokens:[]};
oauthData.clients.push({client_id:clientId,client_name:'E2E Qualification Runner',redirect_uris:['http://127.0.0.1:9999/cb'],token_endpoint_auth_method:'none'});
oauthData.grants.push({id:grantId,kind:'oauth',clientId,name:'E2E Qualification Runner',userId:admin.id,stamp,scopes:['read','manage','command'],resource:mcpUrl,createdAt:new Date(now).toISOString()});
oauthData.tokens.push({hash:hash(rawToken),kind:'access',grantId,clientId,scopes:['read','manage','command'],expires:now+600000});
await fs.writeFile(oauthFile,JSON.stringify(oauthData),{mode:0o600});

const tempDir=await fs.mkdtemp(path.join(os.tmpdir(),'mcp-e2e-'));
const staticFixtureDir='/var/www/.mcp-e2e-static-'+crypto.randomUUID().slice(0,8);
const results=[];

async function mcpRpc(method,params={},id=1){
 const res=await fetch(mcpUrl,{
  method:'POST',
  headers:{
   'Authorization':'Bearer '+rawToken,
   'Content-Type':'application/json',
   'Accept':'application/json, text/event-stream'
  },
  body:JSON.stringify({jsonrpc:'2.0',id,method,params}),
  signal:AbortSignal.timeout(60000)
 });
 assert.equal(res.status,200,`Expected HTTP 200 from ${mcpUrl} for ${method}, got ${res.status}`);
 const payload=await res.json();
 if(payload.error)throw Error(`MCP RPC error on ${method}: ${JSON.stringify(payload.error)}`);
 return payload.result;
}

async function callTool(name,args={}){
 const r=await mcpRpc('tools/call',{name,arguments:args});
 if(r.isError)throw Error(`Tool ${name} returned error: ${r.content?.[0]?.text}`);
 const text=r.content?.[0]?.text||'{}';
 try{return JSON.parse(text);}catch{return text;}
}

async function waitAgentJob(id){
 for(let i=0;i<60;i++){
  const job=await callTool('panel_operation',{id});
  if(['succeeded','failed','interrupted'].includes(job.state)){
   const logs=await callTool('panel_operation_logs',{id,offset:0});
   return {job,logs,output:Buffer.from(logs.data||'', 'base64').toString('utf8')};
  }
  await new Promise(r=>setTimeout(r,300));
 }
 throw Error('Agent job timed out: '+id);
}

async function waitPanelJob(id){
 for(let i=0;i<60;i++){
  const job=await callTool('panel_read',{path:'/api/jobs?id='+encodeURIComponent(id)});
  if(['succeeded','failed','interrupted'].includes(job.state))return job;
  await new Promise(r=>setTimeout(r,1500));
 }
 throw Error('Panel job timed out: '+id);
}

try{
 // 1. Initialize & list tools over public https://cyber.cyberpross.cc/mcp
 const init=await mcpRpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'e2e-verifier',version:'1.0.0'}});
 assert.equal(init.protocolVersion,'2025-11-25');
 const listed=await mcpRpc('tools/list',{});
 const toolNames=listed.tools.map(t=>t.name);
 results.push({step:'mcp_initialize_and_tools_list',count:toolNames.length,ok:toolNames.length>=25});

 // 2. panel_discover, panel_graph (Graphify token reduction), & panel_read
 const discovered=await callTool('panel_discover',{});
 assert(Array.isArray(discovered.paths)&&(discovered.paths.includes('/api/grafana')||discovered.paths.includes('/api/grafana/status')));
 assert(Array.isArray(discovered.mcpTools)&&discovered.mcpTools.some(t=>t.name==='panel_graph'));
 const graphDigest=await callTool('panel_graph',{action:'digest'});
 assert.equal(graphDigest.tokenOptimized,true);
 assert(graphDigest.knowledgeGraph?.nodes>1000);
 const graphQuery=await callTool('panel_graph',{action:'query',query:'privileged agent transaction rollback',budget:800});
 assert(graphQuery.matchedNodes>0);
 const sysInfo=await callTool('panel_read',{path:'/api/system'});
 assert(sysInfo.os);
 results.push({step:'panel_discover_graphify_and_read',graphNodes:graphDigest.knowledgeGraph.nodes,reduction:graphDigest.knowledgeGraph.reduction,ok:true});

 // 3. panel_exec, panel_operation, panel_operation_logs, panel_operations (with WAF-sensitive shell syntax)
 const execSub=await callTool('panel_exec',{command:'id -u && uname -s; printf "WAF_SHELL_SYNTAX_OK <script>alert(1)</script>"',confirm:true});
 const execDone=await waitAgentJob(execSub.id);
 assert.equal(execDone.job.exitCode,0);
 assert.match(execDone.output,/^0\nLinux\nWAF_SHELL_SYNTAX_OK/);
 const opsList=await callTool('panel_operations',{});
 assert(opsList.jobs.some(j=>j.id===execSub.id));
 results.push({step:'panel_exec_and_streaming_logs',jobId:execSub.id,exitCode:execDone.job.exitCode,ok:true});

 // 4. panel_command
 const cmdSub=await callTool('panel_command',{command:'printf PANEL_COMMAND_OK',confirm:true});
 const cmdDone=await waitPanelJob(cmdSub.id);
 assert.equal(cmdDone.state,'succeeded');
 assert.match(cmdDone.output,/PANEL_COMMAND_OK/);
 results.push({step:'panel_command',jobId:cmdSub.id,ok:true});

 // 5. Dedicated component tools: systemd, nginx, docker, compose, cloudflare, coraza, crowdsec
 const systemdJob=await callTool('panel_systemd',{action:'status',unit:'nginx.service'});
 const systemdDone=await waitAgentJob(systemdJob.id);
 assert.match(systemdDone.output,/ActiveState=active/);

 const nginxVal=await callTool('panel_nginx',{action:'validate'});
 const nginxDone=await waitAgentJob(nginxVal.id);
 assert.equal(nginxDone.job.exitCode,0);

 const dockerList=await callTool('panel_docker',{action:'list'});
 const dockerDone=await waitAgentJob(dockerList.id);
 assert.equal(dockerDone.job.exitCode,0);

 const composeFile=path.join(tempDir,'compose.yaml');
 await fs.writeFile(composeFile,'services:\n  test:\n    image: alpine:latest\n',{mode:0o644});
 const composeVal=await callTool('panel_compose',{action:'validate',file:composeFile});
 const composeDone=await waitAgentJob(composeVal.id);
 assert.equal(composeDone.job.exitCode,0);

 const cfStatus=await callTool('panel_cloudflare',{action:'status'});
 assert.equal((await waitAgentJob(cfStatus.id)).job.exitCode,0);

 const corazaStatus=await callTool('panel_coraza',{action:'status'});
 assert.equal((await waitAgentJob(corazaStatus.id)).job.exitCode,0);

 const crowdsecStatus=await callTool('panel_crowdsec',{action:'status'});
 assert.equal((await waitAgentJob(crowdsecStatus.id)).job.exitCode,0);
 results.push({step:'dedicated_component_tools',ok:true});

 // 6. Atomic file operations: upload, read, edit (with WAF-like code payload), restore, permissions, owner, transactions
 const upRes=await callTool('panel_file_upload',{directory:tempDir,name:'script.sh',base64:Buffer.from('#!/bin/bash\necho "initial"\n').toString('base64'),confirm:true});
 assert.equal(upRes.uploaded,true);
 const targetFile=path.join(tempDir,'script.sh');
 const read1=await callTool('panel_file_read',{path:targetFile});
 const editTx=await callTool('panel_file_edit',{path:targetFile,text:'#!/bin/bash\n# cat /etc/passwd; UNION SELECT 1,2,3\necho "updated"\n',revision:read1.revision,confirm:true});
 assert.equal(editTx.state,'committed');
 const read2=await callTool('panel_file_read',{path:targetFile});
 assert.match(read2.text,/updated/);

 const restoreTx=await callTool('panel_file_restore',{transactionId:editTx.id,confirm:true});
 assert.equal(restoreTx.state,'committed');
 const read3=await callTool('panel_file_read',{path:targetFile});
 assert.equal(read3.text,'#!/bin/bash\necho "initial"\n');

 await callTool('panel_file_permissions',{path:targetFile,mode:'640',confirm:true});
 assert.equal((await fs.stat(targetFile)).mode&0o777,0o640);
 await callTool('panel_file_owner',{path:targetFile,uid:0,gid:0,confirm:true});
 const txList=await callTool('panel_transactions',{});
 assert(txList.transactions.some(t=>t.id===editTx.id)&&txList.transactions.some(t=>t.id===restoreTx.id));
 results.push({step:'atomic_file_operations_and_restore',editTx:editTx.id,restoreTx:restoreTx.id,ok:true});

 // 7. Static website deployment preview, commit, and automatic rollback on failed health validation
 await fs.mkdir(staticFixtureDir,{recursive:true,mode:0o755});
 await fs.writeFile(path.join(staticFixtureDir,'index.html'),'<!doctype html><title>Initial</title><h1>Initial</h1>\n',{mode:0o644});
 const prev1=await callTool('panel_static_preview',{directory:staticFixtureDir});
 const deployOk=await callTool('panel_static_deploy',{
  directory:staticFixtureDir,
  revision:prev1.revision,
  files:[{path:'index.html',base64:Buffer.from('<!doctype html><title>Deployed</title><h1>Deployed</h1>\n').toString('base64')}],
  url:'http://127.0.0.1:8787/api/health',
  confirm:true
 });
 assert.equal(deployOk.state,'committed');
 assert.match(await fs.readFile(path.join(staticFixtureDir,'index.html'),'utf8'),/Deployed/);

 // Now test automatic rollback when HTTP validation fails (404 URL)
 const prev2=await callTool('panel_static_preview',{directory:staticFixtureDir});
 const rollbackRes=await mcpRpc('tools/call',{
  name:'panel_static_deploy',
  arguments:{
   directory:staticFixtureDir,
   revision:prev2.revision,
   files:[{path:'index.html',base64:Buffer.from('<!doctype html><title>Broken</title>\n').toString('base64')}],
   url:'http://127.0.0.1:8787/api/nonexistent-health-probe',
   confirm:true
  }
 });
 assert.equal(rollbackRes.isError,true);
 // Verify original content was automatically restored!
 assert.match(await fs.readFile(path.join(staticFixtureDir,'index.html'),'utf8'),/Deployed/);
 results.push({step:'static_deploy_and_automatic_rollback',deployTx:deployOk.id,ok:true});

 // 8. Health monitoring & controlled remediation policy
 const health=await callTool('panel_health',{scan:true});
 assert(Array.isArray(health.checks)&&health.checks.filter(c=>c.kind==='service').every(c=>c.ok),'All monitored system services must be healthy');
 assert(health.checks.filter(c=>c.kind==='http').every(c=>c.ok&&c.status===200),'All monitored HTTP endpoints must return 200');
 assert(health.checks.filter(c=>c.kind==='storage').every(c=>c.ok),'Storage check must be healthy');
 const policy=await callTool('panel_health_policy',{});
 assert(Array.isArray(policy.protectedServices)&&policy.protectedServices.includes('cloudflared.service'));
 const policySaved=await callTool('panel_health_policy',{rules:{'nginx.service':'restart'},confirm:true});
 assert.equal(policySaved.rules['nginx.service'],'restart');
 // Reject critical service auto-remediation
 const badPolicy=await mcpRpc('tools/call',{name:'panel_health_policy',arguments:{rules:{'ssh.service':'restart'},confirm:true}});
 assert.equal(badPolicy.isError,true);
 results.push({step:'health_monitor_and_remediation_policy',ok:true});

 // 9. Grafana independent installation, provisioning & panel load reduction
 const gBefore=await callTool('panel_grafana',{action:'status'});
 if(!gBefore.active){
  const gInstallJob=await callTool('panel_grafana',{action:'install',grafanaPort:3030,confirm:true});
  const gJobDone=await waitPanelJob(gInstallJob.id);
  assert.equal(gJobDone.state,'succeeded',gJobDone.output);
 }else{
  const gProvJob=await callTool('panel_grafana',{action:'provision',confirm:true});
  await waitPanelJob(gProvJob.id);
 }
 const gAfter=await callTool('panel_grafana',{action:'status'});
 assert.equal(gAfter.installed,true);
 assert.equal(gAfter.active,true);
 assert.equal(gAfter.healthy,true);
 assert.equal(gAfter.dashboardProvisioned,true);
 const gSettings=await callTool('panel_manage',{path:'/api/grafana/settings',body:{pollMode:'low-load',grafanaPort:3030,scrapeEnabled:true,confirm:true}});
 assert.equal(gSettings.pollMode,'low-load');
 results.push({step:'grafana_independent_install_and_low_load',localURL:gAfter.localURL,pollMode:gSettings.pollMode,ok:true});

 // 10. Coraza WAF persistence & regression check across regeneration and restart
 const {createCoraza}=await import('/opt/server-panel/app/src/security-center/coraza.mjs');
 const coraza=createCoraza({dataDir:'/var/lib/server-panel'});
 const cfgBefore=await coraza.config();
 assert(cfgBefore.panelHosts.includes('cyber.cyberpross.cc'));
 await coraza.policy({revision:cfgBefore.revision,mode:cfgBefore.mode});
 await exec('/usr/bin/systemctl',['restart','cyberpross-coraza.service'],{timeout:30000});
 let wafTest;
 for(let i=0;i<15;i++){
  try{wafTest=await coraza.test();break;}catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,500));}
 }
 assert.equal(wafTest.verified,true);
 const businessOk=await fetch('https://cyberpross.cc/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
 await businessOk.body?.cancel();
 const businessBlocked=await fetch('https://cyberpross.cc/?q='+encodeURIComponent('<script>alert(1)</script>'),{redirect:'manual',signal:AbortSignal.timeout(15000)});
 await businessBlocked.body?.cancel();
 assert.equal(businessOk.status,200);
 assert.equal(businessBlocked.status,403);
 results.push({step:'waf_persistence_and_regression',panelHosts:(await coraza.config()).panelHosts,businessOk:businessOk.status,businessBlocked:businessBlocked.status,ok:true});

 console.log(JSON.stringify({qualified:true,endpoint:mcpUrl,results},null,2));
}finally{
 // Clean up temporary static directories & backup directories
 const wwwEntries=await fs.readdir('/var/www').catch(()=>[]);
 for(const name of wwwEntries){
  if(name.startsWith('.mcp-e2e-static-')||name.startsWith('.panel-static-')){
   await fs.rm(path.join('/var/www',name),{recursive:true,force:true}).catch(()=>{});
  }
 }
 await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
 if(oauthBackup!==null){
  const current=JSON.parse(await fs.readFile(oauthFile,'utf8'));
  current.clients=current.clients.filter(c=>c.client_id!==clientId);
  current.grants=current.grants.filter(g=>g.id!==grantId);
  current.tokens=current.tokens.filter(t=>t.grantId!==grantId);
  await fs.writeFile(oauthFile,JSON.stringify(current),{mode:0o600});
 }
}
