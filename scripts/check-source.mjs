import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let checked=0;
async function walk(dir){for(const e of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const name=path.join(dir,e.name);if(e.isDirectory())await walk(name);else if(/\.(mjs|js)$/.test(name)){execFileSync(process.execPath,['--check',name],{cwd:root,stdio:'pipe'});checked++;}else if(name.endsWith('.py')){execFileSync('python3',['-c','import ast,sys;ast.parse(open(sys.argv[1]).read(),filename=sys.argv[1])',name],{cwd:root,stdio:'pipe'});checked++;}else if(name.endsWith('.sh')){execFileSync('bash',['-n',name],{cwd:root,stdio:'pipe'});checked++;}}}
for(const dir of ['src','scripts','tests','web','public'])await walk(dir);
console.log(`Syntax checked ${checked} JavaScript, Python and shell files.`);
