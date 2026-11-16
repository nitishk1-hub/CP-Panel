import {panelBuild} from './panel-build.mjs';
export async function waitForPanel({port,root,request=fetch,attempts=30,delayMs=500}){
 if(!Number.isInteger(port)||port<1024||port>65535||!root)throw Error('Provide the selected panel port and installed application directory');
 const expected=await panelBuild(root);
 for(let attempt=0;attempt<attempts;attempt++){
  try{const response=await request(`http://127.0.0.1:${port}/api/health`,{redirect:'error',signal:AbortSignal.timeout(1000)});const result=await response.json();if(response.ok&&result.status==='ready'&&result.build===expected)return {ready:true,build:expected};}catch{}
  if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
 }
 throw Error('The expected panel build did not become ready. Inspect server-panel.service logs; do not reset accounts.');
}
