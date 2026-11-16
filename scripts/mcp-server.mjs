#!/usr/bin/env node
// Local stdio MCP bridge. Credentials stay in the client environment, never CLI arguments.
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createBridge} from '../src/mcp-tools.mjs';
export {createBridge,tools} from '../src/mcp-tools.mjs';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const token=process.env.CYBERPROSS_TOKEN;if(!token){process.stderr.write('Set CYBERPROSS_TOKEN from System → AI connections.\n');process.exit(1);}
 const handle=createBridge({origin:process.env.CYBERPROSS_URL||'http://127.0.0.1:8787',token});
 const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});let pending=0;
 input.on('line',line=>{if(line.length>1024*1024||pending>=16){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Request limit exceeded'}})+'\n');return;}pending++;Promise.resolve().then(()=>JSON.parse(line)).then(handle).then(r=>{if(r)process.stdout.write(JSON.stringify(r)+'\n');}).catch(()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n')).finally(()=>pending--);});
}
