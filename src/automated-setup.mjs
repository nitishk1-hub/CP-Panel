import fs from 'node:fs/promises';import path from 'node:path';
import {firstRun} from './first-run.mjs';
export async function automatedSetup({input,dataDir,environmentFile,recoveryFile,portCheck}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['username','password','confirmation','port','publicURL'].includes(k)))throw Error('Provide a JSON object with only administrator setup fields');
 if(!recoveryFile||!path.isAbsolute(recoveryFile))throw Error('Provide an absolute recovery output path in a private directory');
 const parent=await fs.realpath(path.dirname(recoveryFile)),st=await fs.lstat(path.dirname(recoveryFile));
 if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid?.()||(st.mode&0o077))throw Error('Recovery output requires a private, owned directory');
 recoveryFile=path.join(parent,path.basename(recoveryFile));
 const data=path.resolve(dataDir);
 if(recoveryFile===data||recoveryFile.startsWith(data+path.sep))throw Error('Store the recovery code outside panel data');
 try{await fs.lstat(recoveryFile);throw Error('Recovery output already exists; it will not be overwritten');}catch(error){if(error.code!=='ENOENT')throw error;}
 const answers=[String(input.username??''),String(input.port??''),String(input.publicURL??'')],secrets=[input.password,input.confirmation];let index=0,secretIndex=0;
 return firstRun({dataDir,environmentFile,portCheck,ask:async()=>answers[index++],secret:async()=>secrets[secretIndex++],show:async text=>fs.writeFile(recoveryFile,text+'\n',{flag:'wx',mode:0o600}),confirmRecovery:async()=>{const saved=await fs.stat(recoveryFile);if(!saved.isFile()||(saved.mode&0o077))throw Error('Recovery output was not stored privately');}});
}
