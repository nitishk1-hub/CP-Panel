import path from 'node:path';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {run} from '../src/management.mjs';
import {firstRun} from '../src/first-run.mjs';
export {firstRun,validateInstallInput} from '../src/first-run.mjs';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.stdin.isTTY)throw Error('Run installation in an interactive terminal. Credentials must not be supplied in command arguments.');
 let muted=false;const output=new Writable({write(chunk,encoding,cb){if(!muted)process.stdout.write(chunk);cb();}});const rl=readline.createInterface({input:process.stdin,output,terminal:true});
 const ask=q=>rl.question(q),secret=async q=>{process.stdout.write(q);muted=true;try{return await rl.question('');}finally{muted=false;process.stdout.write('\n');}};
 try{console.log('Server Panel installation candidate · Linux '+process.arch+' · Node '+process.version);for(const [name,args]of [['docker',['--version']],['wg',['--version']],['python3',['--version']],['php',['--version']]]){const version=await run(name,args).then(s=>s.split('\n')[0],()=> 'Not installed');console.log(name+': '+version);}console.log('Optional components are not installed or activated automatically. Review Runtimes and System after signing in.');await firstRun({dataDir:process.argv[2],environmentFile:process.argv[3],ask,secret,show:s=>console.log(s),confirmRecovery:async()=>{while((await ask('Type SAVED after storing your recovery code: ')).trim()!=='SAVED')console.log('Store the recovery code before continuing.');}});}catch(e){console.error('Installation setup failed: '+e.message);process.exitCode=1;}finally{rl.close();}
}
