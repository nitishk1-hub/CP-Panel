import fs from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';
import {encryptedBackupVerification,restoreVerifiedBackup} from './backup-verification.mjs';
async function privateParent(file){const parent=path.dirname(path.resolve(file)),st=await fs.lstat(parent);if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==process.getuid?.()||(st.mode&0o077))throw Error('Backup destinations require a private, owned parent directory');return fs.realpath(parent);}
async function keyBytes(file){const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=await handle.stat();if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid?.()||(st.mode&0o077)||st.size!==32)throw Error('Unsafe backup key');return await handle.readFile();}finally{await handle.close();}}
export async function exportPanelBackup({dataDir,archiveDestination,keyDestination}){
 dataDir=await fs.realpath(dataDir);archiveDestination=path.resolve(archiveDestination);keyDestination=path.resolve(keyDestination);
 if(archiveDestination===keyDestination||[archiveDestination,keyDestination].some(p=>p===dataDir||p.startsWith(dataDir+path.sep)))throw Error('Export archive and key to separate paths outside panel data');
 archiveDestination=path.join(await privateParent(archiveDestination),path.basename(archiveDestination));keyDestination=path.join(await privateParent(keyDestination),path.basename(keyDestination));if([archiveDestination,keyDestination].some(p=>p===dataDir||p.startsWith(dataDir+path.sep)))throw Error('Export destinations resolve inside panel data');
 const result=await encryptedBackupVerification(dataDir);
 if(result.omitted)throw Error('Snapshot has omissions. Resolve them before exporting a recovery backup.');
 const key=await keyBytes(path.join(dataDir,'verification/backup.key'));let archiveWritten=false;
 try{await fs.copyFile(path.join(dataDir,'verification',result.backup),archiveDestination,constants.COPYFILE_EXCL);archiveWritten=true;await fs.writeFile(keyDestination,key,{flag:'wx',mode:0o600});}catch(error){if(archiveWritten)await fs.rm(archiveDestination);throw error;}
 return {archive:archiveDestination,key:keyDestination,files:result.files,bytes:result.bytes,excluded:result.excluded,scope:result.scope};
}
export async function restorePanelBackup({archive,keyFile,destination}){
 destination=path.resolve(destination);const parent=await privateParent(destination);destination=path.join(parent,path.basename(destination));
 try{await fs.lstat(destination);throw Error('Restore destination already exists; live data is never overwritten');}catch(e){if(e.code!=='ENOENT')throw e;}
 const stage=await fs.mkdtemp(path.join(parent,'.panel-restore-'));
 try{const result=await restoreVerifiedBackup(archive,await keyBytes(keyFile),stage);await fs.rename(stage,destination);return {destination,files:result.files.length,bytes:result.bytes};}catch(error){await fs.rm(stage,{recursive:true,force:true});throw error;}
}
