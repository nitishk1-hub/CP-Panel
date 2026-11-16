import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const staged=process.argv.includes('--staged');
const files=execFileSync('git',staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const denied=/(^|\/)(?:\.release-keys|\.review-state|var|node_modules|dist|\.aws|\.codex|graphify-out)(\/|$)|(^|\/)\.env(?:\.|$)|(?:private|publisher-ed25519)\.pem$|\.(?:aes|dump)$/i;
const privateMaterial=/-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----/;
let failures=0;
for(const name of files){if(name!=='.env.example'&&denied.test(name)){console.error('Private/local path must not be published: '+name);failures++;continue;}let content;try{content=staged?execFileSync('git',['show',':'+name],{maxBuffer:32*1024*1024}):await fs.readFile(name);}catch{console.error('Cannot inspect publication file: '+name);failures++;continue;}if(content.length>32*1024*1024){console.error('Oversized source artifact: '+name);failures++;continue;}if(privateMaterial.test(content.toString('utf8'))){console.error('Private key material detected in: '+name);failures++;}}
if(failures)process.exitCode=1;else console.log(`Checked ${files.length} ${staged?'staged':'tracked'} paths for private files and key material. Run a full credential/history scanner as a separate release gate.`);
