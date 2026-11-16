import fs from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
import {anchoredParent} from './anchored-path.mjs';
const execute=promisify(execFile),hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const invalid=message=>Object.assign(Error(message),{status:409});
async function retainedText(descriptor){const handle=await fs.open(descriptor,'r');try{const chunks=[];let total=0;while(true){const buffer=Buffer.alloc(65536),{bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(total>1024*1024)throw invalid('Text file exceeds 1 MiB');chunks.push(buffer.subarray(0,bytesRead));}return Buffer.concat(chunks).toString('utf8');}finally{await handle.close();}}
export async function anchoredReadText(target){const anchor=await anchoredParent(target);let handle;try{handle=await fs.open(anchor.path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat();if(!stat.isFile()||stat.size>1024*1024)throw invalid('Choose a text file smaller than 1 MiB');const text=await retainedText(`/proc/self/fd/${handle.fd}`);if(text.includes('\0'))throw invalid('Binary files cannot be edited');return {text,revision:hash(text)};}finally{await handle?.close();await anchor.close();}}
// Retain directory descriptors so a replaced parent symlink cannot redirect a save.
export async function anchoredSave(target,text,revision,{keepBackup=true}={}){
 target=path.resolve(target);let parent=await fs.open('/',constants.O_RDONLY|constants.O_DIRECTORY),original,candidate;
 const parts=target.split('/').filter(Boolean),leaf=parts.pop();let temp;
 try{
  for(const part of parts){const next=await fs.open(`/proc/self/fd/${parent.fd}/${part}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);await parent.close();parent=next;}
  const directory=`/proc/self/fd/${parent.fd}`,file=directory+'/'+leaf;
  original=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const stat=await original.stat();if(!stat.isFile()||stat.size>1024*1024||stat.nlink!==1)throw invalid('Choose a regular, non-hard-linked text file smaller than 1 MiB');
  const descriptor=`/proc/self/fd/${original.fd}`,before=await retainedText(descriptor);
  if(before.includes('\0')||hash(before)!==revision)throw invalid('File changed; reload before saving');
  const stem=Buffer.from(leaf).subarray(0,120).toString('utf8').replace(/\uFFFD$/,'');const backupName=stem+'.sentinel-backup-'+crypto.randomUUID(),backup=directory+'/'+backupName;
  if(keepBackup)await fs.copyFile(descriptor,backup,constants.COPYFILE_EXCL);
  const helper=fileURLToPath(new URL('./preserve-file-metadata.py',import.meta.url));
  const sourceDescriptor=`/proc/${process.pid}/fd/${original.fd}`;
  // A private sibling backup retains the original access controls as well as its contents.
  if(keepBackup){const backupHandle=await fs.open(backup,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{await execute('python3',[helper,sourceDescriptor,`/proc/${process.pid}/fd/${backupHandle.fd}`],{timeout:5000,maxBuffer:8192});}finally{await backupHandle.close();}}
  temp=directory+'/.panel-save-'+crypto.randomUUID();
  candidate=await fs.open(temp,'wx',0o600);await candidate.writeFile(text);
  await execute('python3',[helper,sourceDescriptor,`/proc/${process.pid}/fd/${candidate.fd}`],{timeout:5000,maxBuffer:8192});
  await candidate.sync();
  const current=await fs.lstat(file);
  if(current.isSymbolicLink()||current.dev!==stat.dev||current.ino!==stat.ino||hash(await retainedText(descriptor))!==revision)throw invalid('File changed during save; reload before saving');
  await fs.rename(temp,file);temp=null;await parent.sync();
  return {saved:true,...(keepBackup?{backup:backupName}:{})};
 }finally{if(temp)await fs.rm(temp,{force:true}).catch(()=>{});await candidate?.close();await original?.close();await parent.close();}
}
