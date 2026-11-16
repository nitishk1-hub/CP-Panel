import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {bad} from './management.mjs';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
export async function createAIAccess({dataDir,identity,clock=()=>Date.now()}){
 const file=path.join(dataDir,'ai-access.json');let queue=Promise.resolve();
 async function records(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}}
 const publicRecord=({hash,...r})=>r;
 function change(fn){const work=queue.then(async()=>{const rows=await records(),result=await fn(rows);const tmp=file+'.'+crypto.randomUUID();await fs.writeFile(tmp,JSON.stringify(rows),{mode:0o600,flag:'wx'});await fs.rename(tmp,file);return result;});queue=work.catch(()=>{});return work;}
 return {
  async list(){return (await records()).map(publicRecord);},
  async create(user,b){const name=String(b.name||'').trim(),days=Number(b.days??30);if(!name||name.length>80||!Number.isInteger(days)||days<1||days>365)throw bad('Provide a name and expiry between 1 and 365 days');const scopes=b.scopes;if(!Array.isArray(scopes)||!scopes.length||scopes.some(s=>!['read','manage','command'].includes(s))||!scopes.includes('read'))throw bad('Choose valid AI permissions including read');const token='cpai_'+crypto.randomBytes(32).toString('base64url');return change(rows=>{if(rows.filter(r=>!r.revokedAt&&Date.parse(r.expiresAt)>clock()).length>=50)throw bad('Revoke an existing AI connection first');const row={id:crypto.randomUUID(),name,userId:user.id,scopes:[...new Set(scopes)],createdAt:new Date(clock()).toISOString(),expiresAt:new Date(clock()+days*86400000).toISOString(),hash:digest(token)};rows.push(row);return {...publicRecord(row),token};});},
  async revoke(id){return change(rows=>{const r=rows.find(r=>r.id===id);if(!r)throw bad('Connection not found',404);r.revokedAt=new Date(clock()).toISOString();return {ok:true};});},
  async resolve(token){if(typeof token!=='string'||!/^cpai_[A-Za-z0-9_-]{43}$/.test(token))return null;const rows=await records(),hash=digest(token),r=rows.find(r=>typeof r.hash==='string'&&r.hash.length===hash.length&&crypto.timingSafeEqual(Buffer.from(r.hash),Buffer.from(hash)));if(!r||r.revokedAt||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=clock())return null;const user=identity.list().find(u=>u.id===r.userId&&u.enabled&&u.role==='admin'&&!u.mustChangePassword);return user?{user,credential:r.id,scopes:r.scopes}:null;}
 };
}
export function authorizeAI(connection,method,pathname){
 if(!pathname.startsWith('/api/')||/^\/api\/(?:login|logout|auth|account|sso|vault)(?:\/|$)/.test(pathname)||pathname==='/api/panel-access'||pathname==='/api/panel-access/probe'||pathname==='/api/host/setup'||pathname==='/api/terminal/session'||pathname.startsWith('/api/ai/connections')||pathname.startsWith('/api/ai/oauth'))throw bad('This operation requires a signed-in person',403);
 const scope=['/api/ai/command','/api/operations/command'].includes(pathname)?'command':method==='GET'?'read':'manage';if(!connection.scopes.includes(scope))throw bad('AI connection does not have '+scope+' permission',403);
}
