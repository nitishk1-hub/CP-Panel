import path from 'node:path';import {collectDiagnostics} from '../src/diagnostics.mjs';
const root=path.resolve(import.meta.dirname,'..');
console.log(JSON.stringify(await collectDiagnostics({root,dataDir:process.env.PANEL_DATA_DIR||path.join(root,'var')}),null,2));
