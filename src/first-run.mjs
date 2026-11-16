import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {initializeAdministrator,validateAccountPassword} from './identity.mjs';
export function validateInstallInput({username,password,confirmation,port,publicURL}){
 if(!/^[a-zA-Z0-9._-]{3,64}$/.test(username||''))throw Error('Username must contain 3–64 letters, digits, dots, underscores or hyphens.');
 validateAccountPassword(password);
 if(password!==confirmation)throw Error('Administrator passwords do not match.');
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Choose a panel port from 1024 to 65535.');
 let origin='';if(publicURL){let u;try{u=new URL(publicURL);}catch{throw Error('Public URL must be a clean HTTPS origin.');}if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Public URL must be a clean HTTPS origin.');origin=u.origin;}
 return {username,port,publicURL:origin};
}
async function freePort(port){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',()=>reject(Error('The selected panel port is already in use.')));s.listen(port,'127.0.0.1',()=>s.close(resolve));});}
export async function firstRun({dataDir,environmentFile,ask,secret,show,confirmRecovery,portCheck=freePort}){
 try{await fs.access(path.join(dataDir,'users.json'));throw Error('Existing accounts found. Use the update installer; no accounts were changed.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const username=(await ask('Panel administrator username [admin]: ')).trim()||'admin',password=await secret('Panel administrator password (minimum 9 characters): '),confirmation=await secret('Confirm administrator password: ');
 const port=Number((await ask('Local panel port [8787]: ')).trim()||8787),publicURL=(await ask('Exact public HTTPS origin, or leave empty for local-only access: ')).trim();const input=validateInstallInput({username,password,confirmation,port,publicURL});await portCheck(port);
 const result=await initializeAdministrator(dataDir,{username,password,confirmation});
 const text=`PANEL_PORT=${port}\nPANEL_DATA_DIR=/var/lib/server-panel\nPANEL_FILE_ROOT=/\nPANEL_REQUIRE_SETUP=1\n${input.publicURL?'PANEL_PUBLIC_URL='+input.publicURL+'\n':''}`;
 await fs.writeFile(environmentFile,text,{mode:0o600,flag:'wx'});await fs.writeFile(path.join(dataDir,'installation.json'),JSON.stringify({createdAt:new Date().toISOString(),account:username,passwordValidated:true,port,publicURL:input.publicURL,platform:process.platform,architecture:process.arch,node:process.version},null,2),{mode:0o600,flag:'wx'});
 await show('Administrator account created. Save this one-use recovery code securely:\n'+result.recoveryCode+'\nIt is not written to a plaintext file.');await confirmRecovery();return input;
}
