// Run external rules locally in a network-isolated, pinned scanner. Reports stay private.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const rules=await fs.realpath(process.argv[2]||'');
for(const name of ['javascript','bash'])if(!(await fs.stat(path.join(rules,name))).isDirectory())throw Error('Supply a local semgrep-rules checkout');
const output=path.join(root,'var','security-review');await fs.mkdir(output,{recursive:true,mode:0o700});await fs.chmod(output,0o700);
const files=[];async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())await walk(rel);else if(e.isFile()&&/\.(?:mjs|js|sh)$/.test(e.name)&&rel!=='public/tools-bundle.js')files.push('/source/'+rel);}}
for(const dir of ['src','public','scripts','tests','web'])await walk(dir);
const args=['run','--rm','--network','none','--read-only','--user',`${process.getuid()}:${process.getgid()}`,'--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','256','--memory','2g','--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777','--env','HOME=/tmp','--env','SEMGREP_SEND_METRICS=off','--env','SEMGREP_ENABLE_VERSION_CHECK=0','--mount',`type=bind,src=${root},dst=/source,readonly`,'--mount',`type=bind,src=${rules},dst=/rules,readonly`,'semgrep/semgrep@sha256:67518c174185a2043fdbed16c70631b79209499b3671178e7194379b48295a0d','semgrep','scan','--metrics','off','--disable-version-check','--no-git-ignore','--json','--config','/rules/javascript','--config','/rules/bash',...files];
const out=await fs.open(path.join(output,'findings.json'),'w',0o600),err=await fs.open(path.join(output,'scanner.log'),'w',0o600);let code;
try{code=await new Promise((resolve,reject)=>{const child=spawn('docker',args,{stdio:['ignore',out.fd,err.fd]});child.on('error',reject);child.on('exit',resolve);});}finally{await out.close();await err.close();}
if(code!==0)throw Error('Source scanner failed; see the private scanner log');
const report=JSON.parse(await fs.readFile(path.join(output,'findings.json'),'utf8'));
console.log(JSON.stringify({targetFiles:files.length,scannedFiles:report.paths?.scanned?.length,findings:report.results?.length,errors:report.errors?.length,report:path.join(output,'findings.json'),scope:'Heuristic source review; findings need human triage. Excludes bundled third-party tools-bundle.js; dependency audit is separate.'},null,2));
