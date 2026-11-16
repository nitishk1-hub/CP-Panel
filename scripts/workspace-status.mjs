import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
const baseline=JSON.parse(await fs.readFile('.review-state/baseline.json','utf8'));
const current={};
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(dir,e.name);if(e.isDirectory())await walk(name);else if(e.isFile())current[name]=digest(await fs.readFile(name));}}
for(const name of ['src','scripts','tests','docs','web','public','.github'])try{await walk(name);}catch(e){if(e.code!=='ENOENT')throw e;}
for(const name of (await fs.readdir('.')).filter(p=>/\.(md|json)$/.test(p)&&!p.startsWith('RELEASE-')).concat(['.gitignore','.env.example','LICENSE']))try{current[name]=digest(await fs.readFile(name));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const name of [...new Set([...Object.keys(baseline),...Object.keys(current)])].sort())if(baseline[name]!==current[name])console.log(`${!baseline[name]?'added':!current[name]?'removed':'changed'} ${name}`);
