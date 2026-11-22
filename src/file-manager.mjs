import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {constants,createWriteStream,createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {confined,bad} from './management.mjs';
import {anchoredParent,renameNoReplace,linkRetained,copyAnchored} from './anchored-path.mjs';

export function createFileManager({fileRoot,dataDir}){
 const trashDir=path.join(dataDir,'file-trash');
 function name(value){
  if(typeof value!=='string'||!value||Buffer.byteLength(value)>255||value==='.'||value==='..'||/[\/\\\0-\x1f]/.test(value)||value==='.server-panel-trash')throw bad('Enter a single file or folder name');
  return value;
 }
 async function destination(parent,entry){
  const directory=await confined(fileRoot,parent||'.');
  if(!(await fs.stat(directory)).isDirectory())throw bad('Choose a folder');
  const target=path.join(directory,name(entry));
  try{await fs.lstat(target);throw bad('An item already exists at this location',409);}catch(error){if(error.code!=='ENOENT')throw error;}
  return target;
 }
 async function source(relative){
  const requested=path.resolve(fileRoot,relative);
  if((await fs.lstat(requested)).isSymbolicLink())throw bad('Open the original location to modify a symbolic link target');
  const target=await confined(fileRoot,relative),root=await fs.realpath(fileRoot);
  if(target===root)throw bad('The file manager root cannot be moved or deleted');
  if(path.relative(root,target).split(path.sep).includes('.server-panel-trash'))throw bad('Use the Trash screen to restore items');
  return target;
 }
 async function listing(relative){
  const file=await confined(fileRoot,relative||'.'),anchor=await anchoredParent(file);let directory;
  try{
   directory=await fs.open(anchor.path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
   const retained=`/proc/self/fd/${directory.fd}`,entries=await fs.readdir(retained,{withFileTypes:true});
   const shown=entries.filter(entry=>entry.name!=='.server-panel-trash').slice(0,2000);
   const items=await Promise.all(shown.map(async entry=>{
    const st=await fs.lstat(retained+'/'+entry.name).catch(()=>null);
    const target=entry.isSymbolicLink()?await confined(fileRoot,path.relative(fileRoot,path.join(file,entry.name))).then(p=>fs.stat(p)).catch(()=>null):st;
    return {name:entry.name,directory:target?.isDirectory()||false,symlink:entry.isSymbolicLink(),size:st?.isFile()?st.size:null,modified:st?.mtime.toISOString(),mode:st?(st.mode&0o777).toString(8):null,uid:st?.uid??null,gid:st?.gid??null};
   }));
   return {directory:true,path:path.relative(await fs.realpath(fileRoot),file)||'.',entries:items,truncated:entries.length>2000};
  }finally{await directory?.close();await anchor.close();}
 }
 async function mutate(input){
  if(input.action==='create'){
   const target=await destination(input.path,input.name),anchor=await anchoredParent(target);
   try{if(input.kind==='folder')await fs.mkdir(anchor.path,{mode:0o755});else if(input.kind==='file')await fs.writeFile(anchor.path,'',{flag:'wx',mode:0o644});else throw bad('Invalid item type');return {created:true};}finally{await anchor.close();}
  }
  if(input.action==='restore'){
   if(typeof input.id!=='string'||!/^[-a-f0-9]{36}$/.test(input.id))throw bad('Invalid trash item');
   const record=JSON.parse(await fs.readFile(path.join(trashDir,input.id+'.json'),'utf8'));
   const parent=await confined(fileRoot,path.relative(fileRoot,path.dirname(record.original)));
   const target=await destination(path.relative(fileRoot,parent),path.basename(record.original)),actual=await fs.realpath(record.stored);
   if(path.basename(path.dirname(actual))!=='.server-panel-trash'||path.basename(actual)!==input.id)throw bad('Trash location changed');
   const from=await anchoredParent(actual),to=await anchoredParent(target);
   try{const st=await from.handle.stat();if(st.uid!==process.getuid?.()||(st.mode&0o077))throw bad('Private Trash ownership changed');await renameNoReplace(from,to);await fs.rm(path.join(trashDir,input.id+'.json'));return {restored:true};}finally{await from.close();await to.close();}
  }
  if(input.action==='compress'){
   if(input.confirm!==true)throw bad('Confirmation required to compress files');
   const parent=await confined(fileRoot,input.path||'.');
   const format=input.format==='zip'?'zip':'tar.gz';
   const outName=name(input.name||('archive-'+Date.now()+(format==='zip'?'.zip':'.tar.gz')));
   const destFile=await destination(input.path||'.',outName);
   const targets=Array.isArray(input.targets)&&input.targets.length?input.targets.map(name):[];
   if(!targets.length)throw bad('Select at least one file or folder to compress');
   for(const t of targets)await confined(fileRoot,path.join(input.path||'.',t));
   if(format==='zip'){
     await new Promise((resolve,reject)=>{
       const proc=spawn('python3',['-m','zipfile','-c',destFile,...targets],{cwd:parent,stdio:['ignore','pipe','pipe']});
       let err='';proc.stderr.on('data',d=>err+=d);proc.on('close',c=>c===0?resolve():reject(bad('Zip compression failed: '+err)));
     });
   } else {
     await new Promise((resolve,reject)=>{
       const proc=spawn('tar',['-czf',destFile,...targets],{cwd:parent,stdio:['ignore','pipe','pipe']});
       let err='';proc.stderr.on('data',d=>err+=d);proc.on('close',c=>c===0?resolve():reject(bad('Tar compression failed: '+err)));
     });
   }
   return {compressed:true,archive:outName};
  }
  if(input.action==='extract'){
   if(input.confirm!==true)throw bad('Confirmation required to extract archive');
   const srcArchive=await confined(fileRoot,input.path);
   const destDir=await confined(fileRoot,input.destination||path.dirname(input.path));
   const ext=path.extname(srcArchive).toLowerCase();
   if(ext==='.zip'){
     await new Promise((resolve,reject)=>{
       const proc=spawn('python3',['-m','zipfile','-e',srcArchive,destDir],{stdio:['ignore','pipe','pipe']});
       let err='';proc.stderr.on('data',d=>err+=d);proc.on('close',c=>c===0?resolve():reject(bad('Zip extraction failed: '+err)));
     });
   } else {
     await new Promise((resolve,reject)=>{
       const proc=spawn('tar',['-xf',srcArchive,'-C',destDir],{stdio:['ignore','pipe','pipe']});
       let err='';proc.stderr.on('data',d=>err+=d);proc.on('close',c=>c===0?resolve():reject(bad('Tar extraction failed: '+err)));
     });
   }
   return {extracted:true};
  }
  if(input.action==='remote_download'){
   if(input.confirm!==true)throw bad('Confirmation required for remote download');
   if(!input.url||!/^https?:\/\//i.test(input.url))throw bad('Enter a valid HTTP/HTTPS URL');
   const destParent=input.destination||'.';
   let cleanName=input.name;
   if(!cleanName){
     try{cleanName=path.basename(new URL(input.url).pathname);}catch{}
   }
   const outName=name(cleanName||('download-'+Date.now()));
   const target=await destination(destParent,outName);
   const resp=await fetch(input.url,{signal:AbortSignal.timeout(180000),redirect:'follow'});
   if(!resp.ok)throw bad(`Remote download failed: HTTP ${resp.status}`);
   const fileHandle=await fs.open(target,'wx',0o644);
   try{
     await pipeline(resp.body,createWriteStream(`/proc/self/fd/${fileHandle.fd}`));
   }finally{
     await fileHandle.close();
   }
   return {downloaded:true,name:outName};
  }
  if(input.action==='batch'){
   if(!Array.isArray(input.items)||!input.items.length)throw bad('Choose at least one item');
   if(input.confirm!==true)throw bad('Confirm batch operation');
   const results=[];
   for(const item of input.items){
     try{
       if(input.operation==='trash')results.push(await mutate({action:'trash',path:item,confirm:true}));
       else if(input.operation==='permissions')results.push(await mutate({action:'permissions',path:item,mode:input.mode,confirm:true}));
     }catch(err){results.push({path:item,error:err.message});}
   }
   return {batch:true,results};
  }
  if(input.action==='ownership'){const requested=await anchoredParent(path.resolve(fileRoot,input.path));try{if((await fs.lstat(requested.path)).isSymbolicLink())throw bad('Ownership changes refuse symlinks');}finally{await requested.close();}}
  const original=await source(input.path),anchor=await anchoredParent(original);
  try{
   const stat=await fs.lstat(anchor.path);
   if(!stat.isDirectory()&&!stat.isFile())throw bad('Only regular files and folders can be changed');
   if(input.action==='ownership'){
    if(input.confirm!==true||!Number.isInteger(input.uid)||!Number.isInteger(input.gid)||input.uid<0||input.gid<0||input.uid>4294967294||input.gid>4294967294)throw bad('Confirm numeric owner and group IDs');
    const handle=await fs.open(anchor.path,constants.O_RDONLY|constants.O_NOFOLLOW|(stat.isDirectory()?constants.O_DIRECTORY:0));
    try{const current=await handle.stat();if(current.dev!==stat.dev||current.ino!==stat.ino||current.nlink>1&&!current.isDirectory())throw bad('Item changed or is hard-linked',409);await handle.chown(input.uid,input.gid);return {saved:true,uid:input.uid,gid:input.gid};}finally{await handle.close();}
   }
   if(input.action==='permissions'){
    if(typeof input.mode!=='string'||!/^0?[0-7]{3}$/.test(input.mode))throw bad('Choose permissions from 000 to 777');
    const handle=await fs.open(anchor.path,constants.O_RDONLY|constants.O_NOFOLLOW|(stat.isDirectory()?constants.O_DIRECTORY:0));
    try{const current=await handle.stat();if(current.dev!==stat.dev||current.ino!==stat.ino)throw bad('Item changed; refresh before changing permissions',409);await handle.chmod(parseInt(input.mode,8));return {saved:true};}finally{await handle.close();}
   }
   if(input.action==='trash'){
    if(input.confirm!==true)throw bad('Confirm moving this item to Trash');
    const privatePath=anchor.directory+'/.server-panel-trash';
    try{await fs.mkdir(privatePath,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
    const privateHandle=await fs.open(privatePath,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{
     const st=await privateHandle.stat();if(st.uid!==process.getuid?.()||(st.mode&0o077))throw bad('The private Trash directory is not safe to use');
     await fs.mkdir(trashDir,{recursive:true,mode:0o700});
     const id=crypto.randomUUID(),stored=path.join(path.dirname(original),'.server-panel-trash',id),record=path.join(trashDir,id+'.json');
     await fs.writeFile(record,JSON.stringify({id,original,stored,time:new Date().toISOString(),directory:stat.isDirectory()}),{flag:'wx',mode:0o600});
     try{await renameNoReplace(anchor,{handle:privateHandle,name:id});}catch(error){await fs.rm(record);throw error;}
     return {trashed:true,id};
    }finally{await privateHandle.close();}
   }
   if(['rename','move','copy'].includes(input.action)){
    const target=await destination(input.action==='rename'?path.relative(fileRoot,path.dirname(original)):input.destination,input.name||path.basename(original));
    if(target.startsWith(original+path.sep))throw bad('Cannot place a folder inside itself');
    const to=await anchoredParent(target);let staged;
    try{
     if(input.action==='copy'){
      const stagingName='.panel-copy-'+crypto.randomUUID();staged=to.directory+'/'+stagingName;
      await copyAnchored(anchor.path,staged);await renameNoReplace({handle:to.handle,name:stagingName},to);staged=null;
     }else await renameNoReplace(anchor,to);
     return {saved:true};
    }finally{if(staged)await fs.rm(staged,{recursive:true,force:true});await to.close();}
   }
   throw bad('Unknown file operation');
  }finally{await anchor.close();}
 }
 async function trash(){
  let entries=[];try{entries=await fs.readdir(trashDir);}catch{}
  const records=await Promise.all(entries.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(async entry=>{try{const r=JSON.parse(await fs.readFile(path.join(trashDir,entry),'utf8'));const exists=await fs.lstat(r.stored).then(()=>true,()=>false);return exists?{id:r.id,path:path.relative(fileRoot,r.original),time:r.time,directory:r.directory}:null;}catch{return null;}}));
  return records.filter(Boolean);
 }
 async function upload(request,parent,filename){
  const target=await destination(parent,filename),anchor=await anchoredParent(target),temporary=anchor.directory+'/.panel-upload-'+crypto.randomUUID();
  let size=0,handle;
  try{
   handle=await fs.open(temporary,'wx',0o600);
   await pipeline(request,new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(null,chunk);}}),createWriteStream(`/proc/self/fd/${handle.fd}`,{flags:'r+',start:0}));
   await handle.sync();await linkRetained(handle,anchor);await anchor.handle.sync();return {uploaded:true,size};
  }finally{await handle?.close();await fs.rm(temporary,{force:true});await anchor.close();}
 }
 const MIME_TYPES={
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.bmp':'image/bmp',
  '.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8',
  '.log':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8'
 };
 async function download(relative,response,inline=false){
  const file=await confined(fileRoot,relative),anchor=await anchoredParent(file);let handle,child,timer;
  try{
   handle=await fs.open(anchor.path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat(),filename=path.basename(file)||'server';
   if(!stat.isDirectory()&&!stat.isFile())throw bad('Only files and folders can be downloaded');
   if(inline&&stat.isFile()){
    const ext=path.extname(filename).toLowerCase();
    response.setHeader('Content-Type',MIME_TYPES[ext]||'application/octet-stream');
    response.setHeader('Content-Disposition','inline');
    response.setHeader('Content-Length',stat.size);
    await pipeline(createReadStream(`/proc/self/fd/${handle.fd}`),response);
    return;
   }
   response.setHeader('Content-Type',stat.isDirectory()?'application/gzip':'application/octet-stream');
   response.setHeader('Content-Disposition',`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename+(stat.isDirectory()?'.tar.gz':''))}`);
   if(stat.isFile()){response.setHeader('Content-Length',stat.size);await pipeline(createReadStream(`/proc/self/fd/${handle.fd}`),response);return;}
   child=spawn('tar',['--create','--gzip','--file','-','--exclude=.server-panel-trash','--one-file-system','-C',`/proc/${process.pid}/fd/${handle.fd}`,'--','.'],{stdio:['ignore','pipe','pipe']});
   child.stderr.resume();const completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(bad('Folder download did not complete')));});
   timer=setTimeout(()=>child.kill('SIGKILL'),120000);response.once('close',()=>{if(!response.writableFinished)child.kill();});
   await Promise.all([pipeline(child.stdout,response),completed]);
  }finally{if(timer)clearTimeout(timer);child?.kill();await handle?.close();await anchor.close();}
 }
 return {listing,mutate,trash,upload,download};
}
