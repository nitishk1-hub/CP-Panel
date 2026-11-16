// Root-only integration test. All firewall changes happen in an isolated network namespace.
import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {guardRules} from '../src/network-guard.mjs';
if(process.getuid()!==0)throw Error('Run this isolated network test with host administrator authorization.');
const dir=await fs.mkdtemp('/tmp/panel-nft-fixture-');
try{
 await fs.mkdir(dir+'/pending',{mode:0o700});
 await fs.writeFile(dir+'/pending/pending','');await fs.writeFile(dir+'/pending/record.json',JSON.stringify({id:'00000000-0000-4000-8000-000000000001'}));await fs.writeFile(dir+'/pending/before.json',JSON.stringify({ruleset:null,policy:{rules:[],dropInvalid:false}}));
 await fs.writeFile(dir+'/candidate.nft',guardRules({rules:[{peer:'10.200.8.2',direction:'incoming',protocol:'tcp',port:28444}],dropInvalid:true}));
 await fs.writeFile(dir+'/ipv6.nft',guardRules({rules:[{peer:'2001:db8::/32',direction:'all',protocol:'tcp',port:443}]}));
 execFileSync('unshare',['--net','/bin/bash',fileURLToPath(new URL('./fixtures/network-guard.sh',import.meta.url)),dir,process.execPath,fileURLToPath(new URL('../src/network-guard-cli.mjs',import.meta.url))],{stdio:'inherit',timeout:60000});
}finally{await fs.rm(dir,{recursive:true,force:true});}
