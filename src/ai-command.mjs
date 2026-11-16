import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {bad} from './management.mjs';
export async function runAICommand(b,log,{timeout=120000}={}){
 if(b.confirm!==true||typeof b.command!=='string'||!b.command.trim()||b.command.length>16384||b.command.includes('\0'))throw bad('Confirm a shell command of at most 16384 characters');
 const cwd=await fs.realpath(b.cwd||'/');if(!(await fs.stat(cwd)).isDirectory())throw bad('Choose a working directory');
 const env={...process.env,TERM:'dumb',PANEL_AI:'1'};for(const k of Object.keys(env))if(/TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL/i.test(k)||k.startsWith('NODE_'))delete env[k];
 return new Promise((resolve,reject)=>{const child=spawn('/bin/bash',['-lc',b.command],{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});let bytes=0,timedOut=false,limited=false;const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};const timer=setTimeout(()=>{timedOut=true;kill();},timeout);const output=data=>{bytes+=data.length;if(bytes>4*1024*1024){limited=true;kill();return;}log(data.toString());};child.stdout.on('data',output);child.stderr.on('data',output);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);if(timedOut||limited||code!==0)reject(bad(timedOut?'Command timed out':limited?'Command output limit reached':'Command exited with code '+code));else resolve({ok:true,exitCode:code});});});
}
