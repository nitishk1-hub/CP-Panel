import fs from 'node:fs/promises';
import {createAgentClient} from './privileged-agent.mjs';
export async function operationClientFromEnvironment({actor,permission='read'}){
 const socketPath=process.env.PANEL_AGENT_SOCKET;if(!socketPath)throw Error('The privileged operation agent is not configured');
 const keyFile=process.env.PANEL_AGENT_KEY||'/etc/server-panel/agent.key',st=await fs.lstat(keyFile);
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077))throw Error('Unsafe privileged agent credential');
 return createAgentClient({socketPath,secret:await fs.readFile(keyFile),actor,permission});
}
