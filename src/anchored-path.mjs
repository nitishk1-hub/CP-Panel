import fs from 'node:fs/promises';import {constants,createReadStream,createWriteStream} from 'node:fs';import path from 'node:path';import {pipeline} from 'node:stream/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),helper=fileURLToPath(new URL('./anchored-path-operation.py',import.meta.url));
export async function anchoredParent(target){
 const parts=path.resolve(target).split('/').filter(Boolean),name=parts.pop()||'.';let handle=await fs.open('/',constants.O_RDONLY|constants.O_DIRECTORY);
 try{for(const part of parts){const next=await fs.open(`/proc/self/fd/${handle.fd}/${part}`,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);await handle.close();handle=next;}return {handle,name,directory:`/proc/self/fd/${handle.fd}`,path:`/proc/self/fd/${handle.fd}/${name}`,close:()=>handle.close()};}catch(error){await handle.close();throw error;}
}
const retained=handle=>`/proc/${process.pid}/fd/${handle.fd}`;
async function operation(args){try{await execute('python3',[helper,...args],{timeout:10000,maxBuffer:8192});}catch(error){const number=Number(error.stderr?.trim());throw Object.assign(Error(number===17?'An item already exists at this location':number===18?'Cross-filesystem moves require an explicit copy and verification':number===38?'Atomic file operations are unavailable on this host':'The file operation could not complete; refresh the folder and retry'),{status:number===17?409:400});}}
export const renameNoReplace=(source,destination)=>operation(['rename',retained(source.handle),source.name,retained(destination.handle),destination.name]);
export const exchangeAnchored=(source,destination)=>operation(['exchange',retained(source.handle),source.name,retained(destination.handle),destination.name]);
export const linkRetained=(source,destination)=>operation(['link',retained(source),retained(destination.handle),destination.name]);
export async function copyAnchored(source,destination,{maxFiles=100000,maxBytes=32*1024**3}={}){
 let files=0,bytes=0;
 async function copy(from,to,depth){
  if(depth>64||++files>maxFiles)throw Error('Copy exceeds the directory/file-count limit');
  const observed=await fs.lstat(from);
  if(observed.isSymbolicLink()){await fs.symlink(await fs.readlink(from),to);return;}
  if(!observed.isDirectory()&&!observed.isFile())throw Error('Copy includes an unsupported special file');
  const input=await fs.open(from,constants.O_RDONLY|constants.O_NOFOLLOW|(observed.isDirectory()?constants.O_DIRECTORY:0));
  try{
   const st=await input.stat();if(st.dev!==observed.dev||st.ino!==observed.ino)throw Error('Source changed during copy');
   if(st.isDirectory()){
    await fs.mkdir(to,{mode:0o700});const output=await fs.open(to,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{if((await output.stat()).uid!==process.getuid?.())throw Error('Copy destination ownership changed');for(const name of await fs.readdir(`/proc/self/fd/${input.fd}`)){if(name!=='.server-panel-trash')await copy(`/proc/self/fd/${input.fd}/${name}`,`/proc/self/fd/${output.fd}/${name}`,depth+1);}await output.chmod(st.mode&0o777);}finally{await output.close();}
   }else{
    if((bytes+=st.size)>maxBytes)throw Error('Copy exceeds the configured size limit');
    const output=await fs.open(to,'wx',0o600);
    try{if(st.size)await pipeline(createReadStream(`/proc/self/fd/${input.fd}`,{start:0,end:st.size-1}),createWriteStream(`/proc/self/fd/${output.fd}`,{flags:'r+',start:0}));await output.chmod(st.mode&0o777);}finally{await output.close();}
   }
  }finally{await input.close();}
 }
 await copy(source,destination,0);
}
