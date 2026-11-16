async function waitForTasks(base,headers){for(let i=0;i<200;i++){const r=await fetch(base+'/api/jobs',{headers});const data=await r.json();if(data.jobs.every(j=>!['queued','running'].includes(j.state)))return;await new Promise(r=>setTimeout(r,10));}throw Error('Tasks did not finish');}
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createPanel} from '../src/server.mjs';
import {deploymentPlan,detect} from '../src/detect.mjs';
async function initialize(p){const base=`http://127.0.0.1:${p.server.address().port}`;const login=async(password)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})});return r.json();};const first=await login(p.initialCredentials.password);const changed=await fetch(base+'/api/account/password',{method:'POST',headers:{Authorization:`Bearer ${first.token}`,'Content-Type':'application/json','X-Panel-Intent':'manage'},body:JSON.stringify({currentPassword:p.initialCredentials.password,newPassword:'test administrator password 2026'})});assert.equal(changed.status,200);p.token=(await login('test administrator password 2026')).token;}
test('live detector returns measured host data and honest pending services',async()=>{const h=await detect();assert.ok(h.memory.total>0);assert.ok(h.cpuCount>0);const p=deploymentPlan(h);assert.equal(p.mode,'preview');assert.equal(p.steps.find(x=>x.id==='waf').state,'pending');assert.equal(deploymentPlan({...h,platform:'darwin'}).supported,false);});
test('API rejects missing credentials and cross-origin writes; saves authenticated plans',async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sentinel-test-'));
 const p=await createPanel({dataDir:dir,port:0});await new Promise(r=>p.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>p.server.close(r));await fs.rm(dir,{recursive:true,force:true});});await initialize(p);
 const base=`http://127.0.0.1:${p.server.address().port}`;
 assert.equal((await fetch(base+'/api/system')).status,401);
 const headers={Authorization:`Bearer ${p.token}`};
 const badHost=await new Promise((resolve,reject)=>{const r=http.get(base+'/api/system',{headers:{...headers,Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);});r.on('error',reject);});
 assert.equal(badHost,403);
 assert.equal((await fetch(base+'/api/system',{headers})).status,200);
 assert.equal((await fetch(base+'/api/plan/save',{method:'POST',headers})).status,403);
 assert.equal((await fetch(base+'/api/plan/save',{method:'POST',headers:{...headers,Origin:'https://evil.example','X-Panel-Intent':'save-plan'}})).status,403);
 assert.equal((await fetch(base+'/api/plan/save',{method:'POST',headers:{...headers,'X-Panel-Intent':'save-plan'}})).status,200);
 const plan=JSON.parse(await fs.readFile(path.join(dir,'deployment-plan.json'),'utf8'));assert.equal(plan.mode,'preview');
 const audit=await (await fetch(base+'/api/audit',{headers})).json();assert.equal(audit.filter(e=>e.action==='deployment.plan.saved').length,1);assert.equal(audit.at(-1).action,'deployment.plan.saved');
 const page=await fetch(base);assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.equal((await fetch(base+'/.env',{headers})).status,404);
});

test('file containment, stale-save protection and user permissions',async(t)=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sentinel-manage-'));const fileRoot=path.join(dir,'files');await fs.mkdir(fileRoot);await fs.writeFile(path.join(fileRoot,'hello.txt'),'original');await fs.symlink('/etc/passwd',path.join(fileRoot,'outside'));
 const p=await createPanel({dataDir:path.join(dir,'data'),port:0,fileRoot});await new Promise(r=>p.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>p.server.close(r));await fs.rm(dir,{recursive:true,force:true});});await initialize(p);
 const base=`http://127.0.0.1:${p.server.address().port}`;const headers={Authorization:`Bearer ${p.token}`,'Content-Type':'application/json','X-Panel-Intent':'manage'};
 const post=(url,b,h=headers)=>fetch(base+url,{method:'POST',headers:h,body:JSON.stringify(b)});
 assert.equal((await fetch(base+'/api/files?path=outside',{headers})).status,403);
 assert.equal((await fetch(base+'/api/files?path=..',{headers})).status,403);
 const original=await (await fetch(base+'/api/files?path=hello.txt',{headers})).json();
 assert.equal((await post('/api/files?path=hello.txt',{text:'updated',revision:original.revision})).status,200);
 assert.equal((await post('/api/files?path=hello.txt',{text:'overwrite',revision:original.revision})).status,409);
 assert.equal((await post('/api/users',{username:'reader',password:'a sufficiently long password',role:'viewer'})).status,201);
 const login=await (await post('/api/login',{username:'reader',password:'a sufficiently long password'})).json();assert.ok(login.token);
 await post('/api/account/password',{currentPassword:'a sufficiently long password',newPassword:'a replacement reader password'},{...headers,Authorization:`Bearer ${login.token}`});const readerLogin=await (await post('/api/login',{username:'reader',password:'a replacement reader password'})).json();const reader={...headers,Authorization:`Bearer ${readerLogin.token}`};
 assert.equal((await fetch(base+'/api/metrics',{headers:reader})).status,200);
 assert.equal((await fetch(base+'/api/files',{headers:reader})).status,403);
 for(const endpoint of ['/api/files/list','/api/files/trash','/api/files/download','/api/host/status','/api/websites','/api/websites/details','/api/websites/files','/api/websites/file','/api/websites/logs','/api/websites/download','/api/websites/trash','/api/websites/backups','/api/websites/existing/history','/api/wireguard/status','/api/wireguard/config','/api/readiness'])assert.equal((await fetch(base+endpoint,{headers:reader})).status,403);
 for(const endpoint of ['/api/files/manage','/api/files/upload','/api/firewall/unlock','/api/firewall/lock','/api/terminal/session','/api/host/setup','/api/websites/create','/api/websites/settings','/api/websites/runtime','/api/websites/publish','/api/websites/stop','/api/websites/archive','/api/websites/dependencies','/api/websites/certificate','/api/websites/upload','/api/websites/files','/api/websites/file','/api/websites/backup/restore','/api/websites/cleanup','/api/websites/restart','/api/websites/existing/config','/api/websites/existing/action','/api/websites/existing/restore','/api/websites/existing/certificate','/api/websites/existing/settings','/api/websites/existing/files/prepare','/api/websites/existing/files/activate','/api/readiness/run','/api/docker/registries/save','/api/docker/registries/remove','/api/docker/registries/login','/api/docker/registries/logout','/api/docker/registries/default','/api/docker/registries/preview','/api/docker/registries/pull','/api/wireguard/draft','/api/wireguard/action','/api/wireguard/confirm','/api/wireguard/rollback','/api/wireguard/install','/api/wireguard/peer','/api/wireguard/download'])assert.equal((await post(endpoint,{},reader)).status,403);
 for(const endpoint of ['status','config','logs','remote'])assert.equal((await fetch(base+'/api/cloudflare/'+endpoint,{headers:reader})).status,403);
 for(const endpoint of ['install','connect','service','config','api','remote'])assert.equal((await post('/api/cloudflare/'+endpoint,{confirm:true},reader)).status,403);
 assert.equal((await post('/api/cloudflare/install',{})).status,400);
 assert.equal((await post('/api/docker/action',{id:'123456789abc',action:'restart'},reader)).status,403);
 assert.equal((await fetch(base+'/api/users',{headers:reader})).status,403);
 assert.equal((await post('/api/login',{username:'reader',password:'wrong'})).status,401);
 assert.equal((await post('/api/sso',{issuer:'http://insecure.example',applications:[]})).status,410);
 assert.equal((await post('/api/sso',{issuer:'https://auth.example.com/realms/server-panel',applications:[{clientId:'test-app',redirectUri:'https://app.example.com/*'}]})).status,410);
 assert.equal((await post('/api/login',{username:'admin',password:'irrelevant',source:'ldap'})).status,400);
 for(const endpoint of ['/api/ldap','/api/ldap/test','/api/ldap/host/prepare','/api/ldap/host/start'])assert.equal((await post(endpoint,{})).status,404);
 assert.equal((await fetch(base+'/api/ldap',{headers})).status,404);
 assert.equal((await post('/api/users',{username:'legacy-user',password:'ValidPassword9!',role:'admin',authSource:'ldap'})).status,400);
 const safeUsers=await (await fetch(base+'/api/users',{headers})).json();assert.equal(safeUsers[0].hash,undefined);
});

test('first-run password UI contract and cookie-based change/relogin flow',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'panel-account-'));const p=await createPanel({dataDir:dir,port:0});await new Promise(r=>p.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>p.server.close(r));await fs.rm(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${p.server.address().port}`;
 const page=await (await fetch(base)).text();assert.ok(page.includes('<title>CP-Panel · by CyberPross</title>'));assert.ok(page.includes('id="sidebar" hidden'));assert.ok(page.includes('id="panel-header" hidden'));assert.ok(!page.includes('Sentinel'));
 const post=(route,data,cookie='')=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Panel-Intent':'manage',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
 const login=await post('/api/login',{username:'admin',password:p.initialCredentials.password});assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.ok(setCookie.includes('HttpOnly'));assert.ok(setCookie.includes('SameSite=Strict'));let cookie=setCookie.split(';')[0];
 assert.equal((await fetch(base+'/api/metrics',{headers:{Cookie:cookie}})).status,403);
 assert.equal((await post('/api/account/password',{currentPassword:p.initialCredentials.password,newPassword:'12345678'},cookie)).status,400);
 assert.equal((await post('/api/account/password',{currentPassword:'incorrect password',newPassword:'NineChars'},cookie)).status,400);
 assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,200);
 const change=await post('/api/account/password',{currentPassword:p.initialCredentials.password,newPassword:'NineChars'},cookie);assert.equal(change.status,200);assert.ok(change.headers.get('set-cookie').includes('Max-Age=0'));
 assert.equal((await fetch(base+'/api/me',{headers:{Cookie:cookie}})).status,401);
 assert.equal((await post('/api/login',{username:'admin',password:p.initialCredentials.password})).status,401);
 const updated=await post('/api/login',{username:'admin',password:'NineChars'});assert.equal(updated.status,200);cookie=updated.headers.get('set-cookie').split(';')[0];assert.equal((await fetch(base+'/api/metrics',{headers:{Cookie:cookie}})).status,200);
});

test('Docker maintenance requires admin permission, reviewed updates and explicit cleanup confirmation',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'panel-docker-'));const calls=[];const revision='a'.repeat(64);const service={preview:async project=>({project,revision}),update:async()=>{calls.push('update');},cleanup:async()=>{calls.push('cleanup');},diskUsage:async()=>[]};const p=await createPanel({dataDir:dir,port:0,dockerMaintenance:service});await new Promise(r=>p.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>p.server.close(r));await fs.rm(dir,{recursive:true,force:true});});await initialize(p);const base=`http://127.0.0.1:${p.server.address().port}`,headers={Authorization:`Bearer ${p.token}`,'Content-Type':'application/json','X-Panel-Intent':'manage'};const post=(route,body,h=headers)=>fetch(base+route,{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.equal((await post('/api/docker/cleanup',{kind:'unused-images',olderThan:'24h'})).status,400);assert.equal((await post('/api/docker/cleanup',{kind:'volumes',olderThan:'all',confirm:true})).status,400);assert.equal((await post('/api/compose/update',{project:'sample',confirm:true})).status,400);assert.equal(calls.length,0);
 assert.equal((await post('/api/compose/update/preview',{project:'sample'})).status,200);assert.equal((await post('/api/compose/update',{project:'sample',revision,confirm:true})).status,202);assert.equal((await post('/api/docker/cleanup',{kind:'unused-images',olderThan:'24h',confirm:true})).status,202);await waitForTasks(base,headers);assert.deepEqual(calls,['update','cleanup']);
 await post('/api/users',{username:'operator',password:'operator password',role:'operator'});const signed=await (await post('/api/login',{username:'operator',password:'operator password'})).json();const h={...headers,Authorization:`Bearer ${signed.token}`};await post('/api/account/password',{currentPassword:'operator password',newPassword:'changed operator password'},h);const login=await (await post('/api/login',{username:'operator',password:'changed operator password'})).json();h.Authorization=`Bearer ${login.token}`;assert.equal((await post('/api/docker/cleanup',{kind:'build-cache',olderThan:'all',confirm:true},h)).status,403);assert.equal((await post('/api/compose/update/preview',{project:'sample'},h)).status,403);assert.equal((await fetch(base+'/api/docker/disk-usage',{headers:h})).status,403);assert.equal(calls.length,2);
});

test('Docker workspace mutations and sensitive detail views are administrator-only',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'panel-workspace-acl-')),calls=[];const workspace={networks:async()=>[],networkAction:async()=>{calls.push('network');},details:async()=>({}),logs:async()=>({text:''}),images:async()=>[],volumes:async()=>[],volumeDetails:async()=>({}),drafts:async()=>[],prepareCompose:async()=>({}),draftPreview:async()=>({})};const p=await createPanel({dataDir:dir,port:0,dockerWorkspace:workspace});await new Promise(r=>p.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>p.server.close(r));await fs.rm(dir,{recursive:true,force:true});});await initialize(p);const base=`http://127.0.0.1:${p.server.address().port}`,headers={Authorization:`Bearer ${p.token}`,'Content-Type':'application/json','X-Panel-Intent':'manage'};const post=(route,body,h=headers)=>fetch(base+route,{method:'POST',headers:h,body:JSON.stringify(body)});
 assert.equal((await post('/api/docker/network',{action:'create',name:'test'})).status,400);assert.equal(calls.length,0);assert.equal((await post('/api/docker/network',{action:'create',name:'test',confirm:true})).status,202);await waitForTasks(base,headers);assert.deepEqual(calls,['network']);
 await post('/api/users',{username:'viewer',password:'viewer password',role:'viewer'});let session=await (await post('/api/login',{username:'viewer',password:'viewer password'})).json();await post('/api/account/password',{currentPassword:'viewer password',newPassword:'changed viewer password'},{...headers,Authorization:`Bearer ${session.token}`});session=await (await post('/api/login',{username:'viewer',password:'changed viewer password'})).json();const viewer={...headers,Authorization:`Bearer ${session.token}`};assert.equal((await fetch(base+'/api/docker/networks',{headers:viewer})).status,200);
 for(const route of ['/api/docker/network','/api/docker/image','/api/docker/volume','/api/docker/container/create','/api/docker/container/configure','/api/docker/container/remove','/api/docker/container/exec','/api/docker/compose/prepare','/api/docker/compose/deploy','/api/docker/project/action'])assert.equal((await post(route,{confirm:true},viewer)).status,403,route);
 for(const route of ['/api/docker/listeners','/api/docker/container/details?id=abc','/api/docker/container/logs?id=abc','/api/docker/images','/api/docker/registries','/api/docker/volumes','/api/docker/volume/details?name=test','/api/docker/compose/drafts'])assert.equal((await fetch(base+route,{headers:viewer})).status,403,route);await waitForTasks(base,headers);assert.deepEqual(calls,['network']);
});
