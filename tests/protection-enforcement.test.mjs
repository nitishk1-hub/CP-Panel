import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {entryRules,createProtectionEdge} from '../src/protection-edge.mjs';
import {createCoraza} from '../src/security-center/coraza.mjs';

test('HTTP capture is exact-loopback, mode-dependent and rolls back rejected transactions',async()=>{
 const dir=await fs.mkdtemp('/tmp/panel-edge-test-');let active=false,rejectNext=false;const rules=[];
 const execute=async(_,a)=>{if(a[0]==='list'){if(!active)throw Error('No such file');return 'Server Panel local protection entry';}if(a[0]==='--check'&&rejectNext){rejectNext=false;throw Error('rejected transaction');}if(a[0]==='--file'){active=true;rules.push(await fs.readFile(a[1],'utf8'));}return '';};
 try{const edge=createProtectionEdge({dataDir:dir,execute});await edge.prepare({port:28180,originPort:28080,webPort:28190,legacyOwned:true});await edge.apply('block');rejectNext=true;await assert.rejects(edge.setOriginCapture(true),/rejected/);assert.equal((await edge.config()).captureOrigin,false);assert(!rules.at(-1).includes('dport 28080'));await edge.setOriginCapture(true);assert(rules.at(-1).includes('ip daddr 127.0.0.1 tcp dport 28080 redirect to :28190'));await edge.apply('off');assert(!rules.at(-1).includes('dport 28080'));assert(rules.at(-1).includes('dport 28180 redirect to :28080'));assert(!rules.join('').includes('flush ruleset'));await assert.rejects(edge.apply('invalid'));assert.throws(()=>entryRules(1,2,false,2));}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('Native WAF verification requires benign pass and all four representative signature outcomes',async()=>{
 const dir=await fs.mkdtemp('/tmp/panel-waf-probe-');try{const storage=path.join(dir,'security-center/coraza');await fs.mkdir(storage,{recursive:true,mode:0o700});const file=path.join(storage,'configuration.json'),config={port:19180,probePath:'/__fixture_probe/',mode:'block',domains:[]};await fs.writeFile(file,JSON.stringify(config));let mode='block',miss=false;const calls=[];const web=createCoraza({dataDir:dir,probe:async ({path})=>{calls.push(path);assert(path.startsWith('/__fixture_probe/'));const benign=path.endsWith('/ok');return {status:benign||mode!=='block'||(miss&&decodeURIComponent(path).includes('UNION SELECT'))?200:403,body:benign?'CYBERPROSS_CORAZA_PROBE_OK':''};}});const evidence=await web.test();assert.equal(evidence.samples.length,4);assert(evidence.samples.every(s=>s.status===403));miss=true;await assert.rejects(web.test(),/signature checks failed/);miss=false;mode='monitor';await fs.writeFile(file,JSON.stringify({...config,mode}));assert((await web.test()).samples.every(s=>s.status===200));assert.equal(calls.length,15);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
