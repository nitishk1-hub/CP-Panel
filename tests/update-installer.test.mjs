import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {releaseManifest} from '../src/release-integrity.mjs';
const execute=promisify(execFile);
const project=path.resolve(new URL('..',import.meta.url).pathname);
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'panel-update-fixture-'));
 const app=path.join(root,'opt/server-panel/app'),source=path.join(root,'candidate'),data=path.join(root,'var/lib/server-panel'),configuration=path.join(root,'etc/server-panel'),mock=path.join(root,'mock-bin');
 for(const dir of [app,source,data,configuration,mock,path.join(root,'etc/systemd/system'),path.join(root,'run/lock'),path.join(root,'opt/server-panel/bin')])await fs.mkdir(dir,{recursive:true});
 for(const base of [app,source]){
  for(const dir of ['src','public','scripts','docs','tests','web','node_modules'])await fs.mkdir(path.join(base,dir));
  for(const name of ['LICENSE','README.md','package-lock.json'])await fs.writeFile(path.join(base,name),'{}');
  await fs.writeFile(path.join(base,'package.json'),'{"type":"module"}');
  await fs.writeFile(path.join(base,'src/server.mjs'),'export const version="'+(base===app?'old':'candidate')+'";');
  await fs.copyFile(path.join(project,'src/release-integrity.mjs'),path.join(base,'src/release-integrity.mjs'));
  await fs.writeFile(path.join(base,'scripts/verify-release.mjs'),'// Protected verifier module exists.');
  await fs.writeFile(path.join(base,'scripts/wait-ready.mjs'),"if(process.env.PANEL_FIXTURE_FAIL_HEALTH==='1')process.exit(1);console.log('Fixture ready');");
 }
 const installedNode=path.join(root,'opt/server-panel/bin/node');
 await fs.copyFile(process.execPath,installedNode);await fs.chmod(installedNode,0o755);
 await fs.mkdir(path.join(source,'runtime'));const candidateNode=path.join(source,'runtime/node');
 await fs.copyFile(process.execPath,candidateNode);
 // Appending data keeps this disposable ELF executable runnable, with a different digest.
 await fs.appendFile(candidateNode,'\nPANEL_TEST_DIFFERENT_RUNTIME\n');await fs.chmod(candidateNode,0o755);
 const keys=crypto.generateKeyPairSync('ed25519'),key=keys.publicKey.export({type:'spki',format:'pem'});
 const manifest=Buffer.from(JSON.stringify(await releaseManifest(source,candidateNode)));
 await fs.writeFile(path.join(source,'RELEASE-MANIFEST.json'),manifest);
 await fs.writeFile(path.join(source,'RELEASE-MANIFEST.sig'),crypto.sign(null,manifest,keys.privateKey));
 await fs.writeFile(path.join(source,'RELEASE-PUBLIC.pem'),key);await fs.writeFile(path.join(configuration,'release-public.pem'),key);
 await fs.writeFile(path.join(data,'users.json'),'[{"enabled":true,"role":"admin","authSource":"local","mustChangePassword":false}]',{mode:0o600});
 await fs.writeFile(path.join(configuration,'environment'),'PANEL_PORT=8787\nPANEL_REQUIRE_SETUP=1\n',{mode:0o600});
 await fs.writeFile(path.join(root,'etc/systemd/system/server-panel.service'),'Description=Server Panel privileged server management\n');
 await fs.writeFile(path.join(mock,'systemctl'),'#!/bin/bash\nprintf "%s\\n" "$*" >> "'+root+'/service-calls"\nexit 0\n',{mode:0o755});
 let script=await fs.readFile(path.join(project,'scripts/update-service.sh'),'utf8');
 script=script.replace(/^\[\[ \$\{EUID\}.*\n/m,'');
 for(const prefix of ['/opt/server-panel','/var/lib/server-panel','/etc/server-panel','/etc/systemd/system','/run/lock'])script=script.replaceAll(prefix,root+prefix);
 script=script.replaceAll('-o root -g root ','').replaceAll('chown -R root:root "$staging"','true');
 script=script.replace(/(\$\(stat -c %u [^\n]+?\)) = 0/g,'$1 = '+process.getuid());
 const installer=path.join(root,'update.sh');await fs.writeFile(installer,script,{mode:0o700});
 return {root,app,source,data,candidateNode,installedNode,run:(extra={})=>execute('bash',[installer,source],{env:{...process.env,PATH:mock+':'+process.env.PATH,...extra},timeout:30000,maxBuffer:1024*1024})};
}
test('Update authenticates and replaces application plus a changed runtime without host service calls',async()=>{const f=await fixture();try{const expected=await fs.readFile(f.candidateNode);await f.run();assert.deepEqual(await fs.readFile(f.installedNode),expected);assert((await fs.readFile(path.join(f.app,'src/server.mjs'),'utf8')).includes('candidate'));assert.equal(await fs.access(path.join(f.data,'maintenance.json')).then(()=>true,()=>false),false);assert((await fs.readdir(path.dirname(f.app))).some(n=>n.startsWith('app.previous.')));}finally{await fs.rm(f.root,{recursive:true,force:true});}});
test('Failed startup restores both the previous application and runtime',async()=>{const f=await fixture();try{const previous=await fs.readFile(f.installedNode);await assert.rejects(f.run({PANEL_FIXTURE_FAIL_HEALTH:'1'}));assert.deepEqual(await fs.readFile(f.installedNode),previous);assert((await fs.readFile(path.join(f.app,'src/server.mjs'),'utf8')).includes('old'));assert.equal(await fs.access(path.join(f.data,'maintenance.json')).then(()=>true,()=>false),false);}finally{await fs.rm(f.root,{recursive:true,force:true});}});
test('Tampered candidate is rejected before maintenance or service shutdown',async()=>{const f=await fixture();try{await fs.appendFile(path.join(f.source,'src/server.mjs'),'\n// tampered');await assert.rejects(f.run());assert.equal(await fs.access(path.join(f.root,'service-calls')).then(()=>true,()=>false),false);assert.equal(await fs.access(path.join(f.data,'maintenance.json')).then(()=>true,()=>false),false);}finally{await fs.rm(f.root,{recursive:true,force:true});}});
