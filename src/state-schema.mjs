import fs from 'node:fs/promises';import {constants} from 'node:fs';import path from 'node:path';
export const stateSchemaVersion=1;
export async function ensureStateSchema(dataDir){
 const file=path.join(dataDir,'state-schema.json');
 try{await fs.writeFile(file,JSON.stringify({schema:stateSchemaVersion,createdAt:new Date().toISOString()})+'\n',{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
 const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=await handle.stat();if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid?.()||(st.mode&0o077)||st.size>8192)throw Error('Panel state schema storage is unsafe');const record=JSON.parse(await handle.readFile('utf8'));if(record.schema!==stateSchemaVersion)throw Error('Unsupported panel state schema. Use a compatible release and reviewed state migration; no automatic downgrade was attempted.');return record;}finally{await handle.close();}
}
