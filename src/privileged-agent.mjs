import {componentTransaction} from './component-transaction.mjs';
import {staticPreview,staticDeploymentTransaction} from './static-deployment.mjs';
import {validateDeployment} from './deployment-validation.mjs';
import {Readable} from 'node:stream';
import {createFileManager} from './file-manager.mjs';
import net from 'node:net';
import {createTransactions} from './transactions.mjs';
import {fileEditTransaction} from './file-transaction.mjs';
import {anchoredReadText} from './anchored-file.mjs';
import {managedCommand} from './managed-command.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createOperationJobs} from './operation-jobs.mjs';

// The private socket is the transport boundary. Each request additionally carries a
// single-use, short-lived signed capability issued by the trusted panel process.
export function signAgentRequest(secret,{method,endpoint,body='',permission,actor,now=Date.now()}){
 const claim=Buffer.from(JSON.stringify({method,endpoint,hash:crypto.createHash('sha256').update(body).digest('hex'),permission,actor,expires:now+30000,nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');
 return claim+'.'+crypto.createHmac('sha256',secret).update(claim).digest('base64url');
}
export async function createPrivilegedAgent({socketPath,directory,secret,requireRoot=true,jobs:injected,health,staticRoots=['/var/www'],staticValidate,fileValidate}={}){
 if(requireRoot&&process.getuid()!==0)throw Error('The privileged agent must run as root');
 if(!Buffer.isBuffer(secret)||secret.length<32)throw Error('Agent credential must contain at least 32 random bytes');
 const parent=path.dirname(socketPath);await fs.mkdir(parent,{recursive:true,mode:0o700});const stat=await fs.lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('Unsafe agent socket directory');
 // Recover a socket left by a crashed agent, but never replace a live listener.
 const previous=await fs.lstat(socketPath).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(previous){if(!previous.isSocket()||previous.uid!==process.getuid())throw Error('Unrecognised agent socket');
  const stale=await new Promise((resolve,reject)=>{const probe=net.createConnection(socketPath);probe.setTimeout(1000);probe.once('connect',()=>{probe.destroy();resolve(false);});probe.once('timeout',()=>{probe.destroy();resolve(false);});probe.once('error',e=>{if(e.code==='ECONNREFUSED')resolve(true);else reject(e);});});
  if(!stale)throw Error('Agent socket is already serving requests');const current=await fs.lstat(socketPath);if(current.ino!==previous.ino||current.dev!==previous.dev)throw Error('Agent socket changed');await fs.unlink(socketPath);
 }
 const fileManager=createFileManager({fileRoot:'/',dataDir:directory});
 const defaultFileValidate=async(input)=>{
  const nginxCheck=input.validateNginx===true||(input.path?.startsWith('/etc/nginx/')&&await fs.access('/usr/sbin/nginx').then(()=>true,()=>false));
  const corazaCheck=input.validateCoraza===true||input.path?.endsWith('/coraza/Caddyfile');
  if(!nginxCheck&&!corazaCheck)return {ok:true};
  return validateDeployment({...(nginxCheck?{nginx:{binary:'/usr/sbin/nginx'}}:{}),...(corazaCheck?{coraza:{config:input.path}}:{})});
 };
 const transactions=await createTransactions({directory:path.join(directory,'transactions'),handlers:{'component':componentTransaction(),'file-edit':fileEditTransaction({validate:fileValidate||defaultFileValidate}),'static-deploy':staticDeploymentTransaction({allowedRoots:staticRoots,validate:staticValidate||(async(input)=>{if(typeof input.url!=='string')throw Error('A website health URL is required');const config=path.join(directory,'../security-center/coraza/Caddyfile'),coraza=await fs.access(config).then(()=>({config}),()=>null);return validateDeployment({nginx:{binary:'/usr/sbin/nginx'},coraza,files:[{path:path.join(input.directory,'index.html'),mode:0o644}],http:[{url:input.url,...(input.host?{host:input.host}:{})}]});})})}});
 const jobs=injected||await createOperationJobs({directory}),nonces=new Map();let active=0;
 function authorize(req,body){
  const [claim,signature,...extra]=String(req.headers.authorization||'').replace(/^Bearer /,'').split('.');if(!claim||!signature||extra.length)throw Error('Invalid agent authorization');
  const expected=crypto.createHmac('sha256',secret).update(claim).digest(),actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw Error('Invalid agent signature');
  const c=JSON.parse(Buffer.from(claim,'base64url').toString());const now=Date.now();for(const [nonce,expiry]of nonces)if(expiry<now)nonces.delete(nonce);
  if(c.method!==req.method||c.endpoint!==req.url||c.hash!==crypto.createHash('sha256').update(body).digest('hex')||!Number.isFinite(c.expires)||c.expires<now||c.expires>now+30000||typeof c.actor!=='string'||!c.actor||!['read','manage','command'].includes(c.permission)||typeof c.nonce!=='string'||nonces.has(c.nonce))throw Error('Expired, replayed or mismatched agent capability');
  if(nonces.size>=10000)throw Error('Agent authorization capacity reached');nonces.set(c.nonce,c.expires);return c;
 }
 const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000},async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(active>=16)return send(429,{error:'Agent is busy'});active++;
  try{let body='';for await(const b of req){body+=b;if(Buffer.byteLength(body)>3*1024*1024)throw Error('Agent request too large');}let c;try{c=authorize(req,body);}catch{return send(403,{error:'Agent authorization denied'});}
   const u=new URL(req.url,'http://agent');
   if(req.method==='POST'&&await fs.access(path.join(directory,'../maintenance.json')).then(()=>true,()=>false))return send(503,{error:'Panel maintenance is in progress; new operations are paused'});
   if(req.method==='POST'&&u.pathname==='/file-upload'){
    if(!['manage','command'].includes(c.permission))return send(403,{error:'Management permission required'});const b=JSON.parse(body);if(b.confirm!==true||typeof b.base64!=='string'||b.base64.length>1400000||Buffer.from(b.base64,'base64').toString('base64')!==b.base64)throw Error('Confirm a base64 upload up to 1 MiB');const bytes=Buffer.from(b.base64,'base64');if(bytes.length>1048576)throw Error('Upload exceeds 1 MiB');const stream=Readable.from([bytes]);stream.headers={'content-length':String(bytes.length)};return send(201,await fileManager.upload(stream,b.directory,b.name));
   }
   if(req.method==='GET'&&u.pathname==='/static-preview')return send(200,await staticPreview(u.searchParams.get('directory'),{allowedRoots:staticRoots}));
   if(req.method==='POST'&&u.pathname==='/static-deploy'){
    if(!['manage','command'].includes(c.permission))return send(403,{error:'Management permission required'});const b=JSON.parse(body);if(typeof b.url!=='string')throw Error('A website health URL is required');const url=new URL(b.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||b.host&&(!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(b.host)))throw Error('Invalid website health target');
    try{return send(200,await transactions.run('static-deploy',b,{actor:c.actor,confirm:b.confirm}));}catch(e){return send(409,{error:e.message,transaction:e.transaction});}
   }
   if(req.method==='GET'&&u.pathname==='/transactions')return send(200,{transactions:transactions.list().map(({input,backup,...r})=>({...r,target:input.path||input.directory||input.unit||input.container||input.kind,backupAvailable:!!backup}))});
   if(req.method==='GET'&&u.pathname==='/file')return send(200,await anchoredReadText(u.searchParams.get('path')));
   if(req.method==='POST'&&u.pathname==='/file-edit'){
    if(!['manage','command'].includes(c.permission))return send(403,{error:'Management permission required'});const b=JSON.parse(body);
    try{return send(200,await transactions.run('file-edit',b,{actor:c.actor,confirm:b.confirm}));}catch(e){return send(409,{error:e.message,transaction:e.transaction});}
   }
   if(req.method==='POST'&&u.pathname==='/file-restore'){
    if(!['manage','command'].includes(c.permission))return send(403,{error:'Management permission required'});const b=JSON.parse(body);if(b.confirm!==true||typeof b.transactionId!=='string')throw Error('Confirm a transaction ID to restore');
    const prior=transactions.get(b.transactionId);if(prior.type!=='file-edit'||typeof prior.backup?.text!=='string'||typeof prior.input?.path!=='string')throw Error('Selected transaction does not contain a restorable file backup');
    const current=await anchoredReadText(prior.input.path);
    try{return send(200,await transactions.run('file-edit',{path:prior.input.path,text:prior.backup.text,revision:current.revision,restoredFrom:prior.id},{actor:c.actor,confirm:true}));}catch(e){return send(409,{error:e.message,transaction:e.transaction});}
   }
   if(req.method==='GET'&&u.pathname==='/health-policy')return send(200,health?health.policy():{rules:{}});
   if(req.method==='POST'&&u.pathname==='/health-policy'){
    if(!['manage','command'].includes(c.permission)||!health)return send(403,{error:'Management permission and configured monitor required'});return send(200,await health.configure({...JSON.parse(body),actor:c.actor}));
   }
   if(req.method==='GET'&&u.pathname==='/health'){if(!health)return send(200,{configured:false,status:'unknown',ok:false,checks:[],issues:[]});const force=u.searchParams.get('scan')==='1';let current=await health.status();if((force||!current||(!current.ok&&Date.now()-Date.parse(current.checkedAt||0)>2000))&&health.scan)current=await health.scan().catch(()=>current);if(current){current.status=current.status||(current.ok?'healthy':'degraded');current.issues=current.issues||current.checks?.filter(c=>!c.ok)||[];}return send(200,current||{configured:true,ok:true,status:'healthy',checks:[],issues:[]});}
   if(req.method==='GET'&&u.pathname==='/jobs')return send(200,{jobs:jobs.list()});
   if(req.method==='GET'&&u.pathname==='/job')return send(200,jobs.get(u.searchParams.get('id')));
   if(req.method==='GET'&&u.pathname==='/logs')return send(200,await jobs.logs(u.searchParams.get('id'),Number(u.searchParams.get('offset')||0)));
   if(req.method==='POST'&&u.pathname==='/component'){
    const b=JSON.parse(body),operation=managedCommand(b);if(operation.permission!=='read'&&!['manage','command'].includes(c.permission))return send(403,{error:'Management permission required'});
    if(operation.permission==='manage'){try{return send(200,await transactions.run('component',b,{actor:c.actor,confirm:b.confirm}));}catch(e){return send(409,{error:e.message,transaction:e.transaction});}}
    return send(202,await jobs.submit({...operation,title:b.kind+' '+b.action,cwd:'/',actor:c.actor}));
   }
   if(req.method==='POST'&&u.pathname==='/command'){
    if(c.permission!=='command')return send(403,{error:'Command permission required'});const b=JSON.parse(body);if(b.confirm!==true||typeof b.command!=='string'||!b.command.trim()||b.command.length>16384||b.command.includes('\0'))throw Error('Explicit command confirmation required');
    return send(202,await jobs.submit({title:'Host command',executable:'/bin/bash',args:['--noprofile','--norc','-c',b.command],cwd:b.cwd||'/',timeoutMs:b.timeoutMs??120000,actor:c.actor,permission:c.permission}));
   }
   send(404,{error:'Unknown agent operation'});
  }catch(e){send(400,{error:e.message});}finally{active--;}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});await fs.chmod(socketPath,0o600);
 return {jobs,async close(){await new Promise(r=>server.close(r));await jobs.close();await fs.unlink(socketPath).catch(e=>{if(e.code!=='ENOENT')throw e;});}};
}
export function createAgentClient({socketPath,secret,actor,permission='read'}){
 return (method,endpoint,value)=>new Promise((resolve,reject)=>{const body=value===undefined?'':JSON.stringify(value),authorization=signAgentRequest(secret,{method,endpoint,body,actor,permission});const req=http.request({socketPath,path:endpoint,method,headers:{Authorization:'Bearer '+authorization,'Content-Type':'application/json'},timeout:60000},res=>{let text='';res.on('data',b=>{text+=b;if(text.length>8*1024*1024)req.destroy(Error('Agent response too large'));});res.on('end',()=>{try{const result=JSON.parse(text);if(res.statusCode>=400)throw Object.assign(Error(result.error),{status:res.statusCode,transaction:result.transaction});resolve(result);}catch(e){reject(e);}});});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('Agent request timed out')));req.end(body);});
}
