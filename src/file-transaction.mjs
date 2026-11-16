import crypto from 'node:crypto';import path from 'node:path';import {anchoredReadText,anchoredSave} from './anchored-file.mjs';
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
export function fileEditTransaction({validate=async()=>({ok:true})}={}){
 return {requiresConfirmation:true,
 async preflight(input){if(!input||typeof input.path!=='string'||!path.isAbsolute(input.path)||typeof input.text!=='string'||input.text.includes('\0')||Buffer.byteLength(input.text)>1024*1024||!/^[a-f0-9]{64}$/.test(input.revision||''))throw Error('An absolute path, reviewed revision and text up to 1 MiB are required');const existing=await anchoredReadText(input.path);if(existing.revision!==input.revision)throw Error('File changed; reload before editing');},
 async backup(input){return anchoredReadText(input.path);},
 async execute(input,backup){if(backup.revision!==input.revision)throw Error('File changed before backup');await anchoredSave(input.path,input.text,backup.revision,{keepBackup:false});},
 async validate(input){const after=await anchoredReadText(input.path);if(after.revision!==hash(input.text))return {ok:false,error:'Content mismatch'};return validate(input);},
 async rollback(input,backup){const current=await anchoredReadText(input.path);if(current.revision===backup.revision)return;if(current.revision!==hash(input.text))throw Error('File was changed by another writer; manual recovery is required');await anchoredSave(input.path,backup.text,current.revision,{keepBackup:false});}
 };
}
