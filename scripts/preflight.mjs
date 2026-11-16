import {installPreflight} from '../src/install-preflight.mjs';
const result=await installPreflight({profile:process.argv[2]||'core'});
console.log(JSON.stringify(result,null,2));
if(!result.ready)process.exitCode=1;
