import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGrafana,formatPrometheusMetrics,grafanaDashboard} from '../src/grafana.mjs';

test('Grafana service provisions dashboards, switches to low-load mode on install, and rolls back failed health checks',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'grafana-test-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let containerRunning=false,healthy=true;
 const commands=[];
 const execute=async(file,args)=>{
  commands.push([file,...args]);
  if(file==='systemctl'&&args[0]==='show')return 'LoadState=not-found\nActiveState=inactive';
  if(file==='docker'&&args[0]==='ps')return containerRunning?JSON.stringify({Names:'cyberpross-grafana',Image:'grafana/grafana-oss:latest',State:'running'}):'';
  if(file==='docker'&&args[0]==='logs')return 'msg="HTTP Server Listen" password=secret-value';
  return '';
 };
 const stream=async(args,log)=>{
  commands.push(['docker',...args]);
  if(args[0]==='run')containerRunning=true;
  if(args[0]==='stop')containerRunning=false;
  log('stream '+args[0]);
 };
 const request=async()=>({ok:healthy,status:healthy?200:503,json:async()=>({version:'11.3.0',database:'ok'})});
 const grafana=createGrafana({dataDir:dir,execute,stream,request,isAdministrator:()=>true});
 const initial=await grafana.status(true);
 assert.equal(initial.installed,false);
 assert.equal(initial.pollMode,'standard');
 assert.equal(initial.effectiveIntervalMs,2000);

 await assert.rejects(()=>grafana.saveSettings({grafanaPort:8787}),/unreserved/);
 const updated=await grafana.saveSettings({pollMode:'balanced',grafanaPort:3040,scrapeEnabled:true,adminUser:'cyberadmin',adminPassword:'StrongPassword123!',authProxyEnabled:true});
 assert.equal(updated.pollMode,'balanced');
 assert.equal(updated.port,3040);
 assert.equal(updated.adminUser,'cyberadmin');
 assert.equal(updated.passwordConfigured,true);
 assert.equal(updated.authProxyEnabled,true);
 assert.equal(updated.embeddedURL,'/api/grafana/proxy/?orgId=1');

 const installed=await grafana.install({grafanaPort:3040},()=>{});
 assert.equal(installed.installed,true);
 assert.equal(installed.active,true);
 assert.equal(installed.healthy,true);
 assert.equal(installed.pollMode,'low-load');
 assert.equal(installed.effectiveIntervalMs,15000);
 assert.equal(installed.dashboardProvisioned,true);

 const promResp=await grafana.handlePromApi(new URL('http://localhost/api/grafana/prom/api/v1/query_range?query=cyberpross_cpu_usage_percent&start=1000&end=2000&step=15'),async()=>({metrics:{cpu:22.4,memory:{total:8000,used:4000}},docker:{containers:[{State:'running'}]}}));
 assert.equal(promResp.status,'success');
 assert.equal(promResp.data.resultType,'matrix');
 assert.equal(promResp.data.result[0].metric.__name__,'cyberpross_cpu_usage_percent');

 const aiSt=await grafana.saveAiSettings({provider:'openai',model:'gpt-4o-mini',apiKey:'sk-test1234567890abcdef'});
 assert.equal(aiSt.ai.configured,true);
 assert.equal(aiSt.ai.provider,'openai');
 assert.equal(aiSt.ai.keyHint,'••••cdef');

 const openRouterSt=await grafana.saveAiSettings({provider:'openrouter',model:'anthropic/claude-3.5-sonnet',apiKey:'sk-or-v1-testkey1234567890abcdef'});
 assert.equal(openRouterSt.ai.provider,'openrouter');
 assert.equal(openRouterSt.ai.model,'anthropic/claude-3.5-sonnet');

 const aiReply=await grafana.askAi({prompt:'Turn on security protection to block mode'},async()=>({metrics:{hostname:'test',cpu:12},docker:{containers:[{Names:'web',State:'running'}]},security:{engines:{protection:{mode:'monitor',healthy:true}},counts:[{engine:'coraza',verdict:'blocked',count:3}]}}));
 assert.ok(aiReply.answer.length>10);
 assert.ok(aiReply.actions.some(a=>a.kind==='protection'&&a.mode==='block'));

 const logs=await grafana.logs();
 assert(!logs.output.includes('secret-value'));
 assert(logs.output.includes('[redacted]'));

 await grafana.control({action:'stop'},()=>{});
 assert.equal((await grafana.status(true)).active,false);

 healthy=false;
 const failingGrafana=createGrafana({dataDir:dir,execute,stream,request:async()=>({ok:false,status:503}),isAdministrator:()=>true,healthRetries:2,healthRetryDelayMs:5});
 await assert.rejects(()=>failingGrafana.install({grafanaPort:3040},()=>{}),/rolled back/);

 const prom=formatPrometheusMetrics({metrics:{cpu:14.5,cores:4,memory:{total:8000,used:2000,available:6000},disk:{total:10000,used:3000,available:7000},network:{receiveRate:100,sendRate:200},uptime:3600},docker:{containers:[{State:'running'},{State:'exited'}]},health:{ok:true},security:{counts:[{count:5}]}});
 assert.match(prom,/cyberpross_cpu_usage_percent 14\.50/);
 assert.match(prom,/cyberpross_containers_running 1/);
 assert.match(prom,/cyberpross_health_ok 1/);
 assert.equal(grafanaDashboard().uid,'cyberpross-server-overview');
});
