import fs from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {waitForPanel} from '../src/health-check.mjs';
if(process.getuid?.()!==0)throw Error('Installed administrator context required');
const port=Number(process.argv[2]);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid panel port');
await promisify(execFile)('/usr/bin/systemctl',['start','server-panel.service'],{timeout:30000});
await waitForPanel({port,root:'/opt/server-panel/app'});
const marker='/var/lib/server-panel/install-incomplete.json',st=await fs.lstat(marker).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(st){if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.uid!==0||(st.mode&0o077))throw Error('Unsafe installation marker; preserved');await fs.rm(marker);}
console.log('Deferred administrator service startup verified.');
