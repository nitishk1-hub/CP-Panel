import fs from 'node:fs/promises';import path from 'node:path';
import {run} from './management.mjs';
export async function collectDiagnostics({root,dataDir,execute=run}){
 const read=async file=>fs.readFile(file,'utf8').then(JSON.parse,()=>null);
 const pkg=await read(path.join(root,'package.json')),build=await read(path.join(root,'BUILD.json')),verification=await read(path.join(dataDir,'verification/status.json')),tasks=await read(path.join(dataDir,'tasks.json'));
 const report={createdAt:new Date().toISOString(),version:pkg?.version||'unknown',runtime:process.version,platform:process.platform,architecture:process.arch,build:build?{version:build.version,arch:build.arch,node:build.node,releaseKind:build.releaseKind||'legacy-candidate'}:null,paths:{},services:{},verification:verification?{state:verification.state,checks:Object.fromEntries(Object.entries(verification.checks||{}).map(([id,c])=>[id,{status:c.status,checkedAt:c.checkedAt}]))}:null,tasks:{total:Array.isArray(tasks?.jobs)?tasks.jobs.length:0,states:{}}};
 for(const [label,file]of [['application',root],['data',dataDir],['accounts',path.join(dataDir,'users.json')]]){try{const st=await fs.lstat(file);report.paths[label]={exists:true,symlink:st.isSymbolicLink(),mode:(st.mode&0o777).toString(8),owner:st.uid};}catch{report.paths[label]={exists:false};}}
 for(const unit of ['server-panel.service','cyberpross-coraza.service','server-panel-ids.service','cyberpross-security-db.service','nginx.service']){const value=await execute('systemctl',['is-active',unit]).catch(()=> 'unavailable');report.services[unit]=/^(active|inactive|failed|activating|deactivating)$/.test(value)?value:'unavailable';}
 for(const job of tasks?.jobs||[])if(['queued','running','succeeded','failed','interrupted'].includes(job.state))report.tasks.states[job.state]=(report.tasks.states[job.state]||0)+1;
 return report;
}
