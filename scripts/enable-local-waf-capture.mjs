// Explicit, reversible migration for an existing localhost HTTP origin. No tunnel edits.
import fs from 'node:fs/promises';
import http from 'node:http';
import {createWebProtection} from '../src/security-center/provider.mjs';
import {createProtectionEdge} from '../src/protection-edge.mjs';
import {createWebsites} from '../src/websites.mjs';
if(process.getuid()!==0)throw Error('Administrator context required');
const dataDir='/var/lib/server-panel',web=createWebProtection({dataDir}),edge=createProtectionEdge({dataDir}),before=await edge.config(),provider=await web.config();
if(!before||!['monitor','block'].includes(before.mode)||(await web.status()).ready!==true)throw Error('Enable a verified, healthy Monitor or Block mode first');
if(before.originPort!==provider.originPort||before.webPort!==provider.port)throw Error('Origin/gateway mismatch; no routing change applied');
// The container must use a numeric non-loopback gateway, so its upstream cannot recurse.
const upstream=provider.origin;
if(!upstream||!/^http:\/\/(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)[\d.]+:\d+$/.test(upstream)||Number(new URL(upstream).port||80)!==before.originPort)throw Error('A reviewed numeric private upstream is required; no routing change applied');
await web.test(before.mode);
const inventory=await createWebsites({dataDir}).inventory(true),hosts=[...new Set([...(inventory.sites||[]).filter(s=>s.state==='published').flatMap(s=>s.domains),...(inventory.external||[]).filter(s=>s.enabled).flatMap(s=>s.domains)])];
if(!hosts.length)throw Error('No website hostnames available for preservation checks');
function request(host,path='/',port=before.originPort){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,headers:{Host:host,Connection:'close'},timeout:10000},r=>{let text='';r.on('data',b=>{if(text.length<128)text+=b;});r.on('end',()=>resolve({status:r.statusCode,location:r.headers.location||null,type:r.headers['content-type']||null,sentinel:text==='CYBERPROSS_CORAZA_PROBE_OK'}));});req.on('timeout',()=>req.destroy(Error('Local routing check timed out')));req.on('error',reject);req.end();});}
const baseline=await Promise.all(hosts.map(h=>request(h)));
try{
 await edge.setOriginCapture(true);
 const after=await Promise.all(hosts.map(h=>request(h)));
 if(JSON.stringify(baseline)!==JSON.stringify(after))throw Error('Existing website responses changed');
 const benign=await request('panel-security.internal',provider.probePath+'ok');
 if(benign.status!==200||!benign.sentinel)throw Error('Captured origin did not reach the WAF static canary');
 const samples=[];for(const [category,payload]of [['XSS','<script>alert(1)</script>'],['SQL injection',"1' UNION SELECT 1,2,3-- -"],['Command injection','; cat /etc/passwd'],['Path traversal','../../../../etc/passwd']]){const result=await request('panel-security.internal',provider.probePath+'attack?q='+encodeURIComponent(payload));if(result.status!==(before.mode==='block'?403:200))throw Error('Captured signature check failed: '+category);samples.push({category,status:result.status});}
 const report={time:new Date().toISOString(),mode:before.mode,originCapture:true,websiteResponsesPreserved:hosts.length,benignStatus:benign.status,samples,scope:'New connections to exact IPv4 loopback origin only; existing connections require reconnect.'};
 await fs.writeFile(dataDir+'/protection-edge/capture-verification.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
}catch(e){await edge.setOriginCapture(!!before.captureOrigin);throw e;}
