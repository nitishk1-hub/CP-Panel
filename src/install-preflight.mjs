import fs from 'node:fs/promises';
import os from 'node:os';
export const candidateTargets={ubuntu:['24.04'],debian:['12','13']};
export function assessHost({platform,arch,release,systemd,commands,freeBytes,memoryBytes,profile='core'}){
 if(!['core','security'].includes(profile))throw Error('Choose core or security installation profile');
 const checks=[];
 const check=(id,ok,detail)=>checks.push({id,status:ok?'pass':'blocked',detail});
 check('platform',platform==='linux','A Linux host is required.');
 check('target',arch==='x64'&&candidateTargets[release.ID]?.includes(release.VERSION_ID),'Candidate targets: Ubuntu 24.04 or Debian 12/13, x86-64. Full VM qualification is still required.');
 check('systemd',systemd,'A running systemd host is required; containers/WSL without systemd are unsupported.');
 for(const name of ['python3','flock','systemctl','install','cp','mv','stat','find','sha256sum','curl',...(profile==='security'?['apt-get','apt-cache','dpkg-deb','dpkg-architecture','ip']:[])])check('command:'+name,Boolean(commands[name]),'Required command: '+name);
 check('disk',freeBytes>= (profile==='security'?6:1)*1024**3,'Free space required: '+(profile==='security'?'6':'1')+' GiB (additional workload data is separate).');
 check('memory',memoryBytes>= (profile==='security'?4:1)*1024**3,'RAM required: '+(profile==='security'?'4':'1')+' GiB.');
 return {profile,target:`${release.ID||'unknown'} ${release.VERSION_ID||''} ${arch}`,ready:checks.every(c=>c.status==='pass'),checks,qualification:'Candidate profile, not clean-VM certification',changes:profile==='core'?['Panel application, private account data, environment and systemd service only.']:['Core panel plus native security binaries, private event database, rules and service units. Network downloads are required.']};
}
export async function installPreflight({profile='core'}={}){
 const release=Object.fromEntries((await fs.readFile('/etc/os-release','utf8').catch(()=>'' )).split('\n').flatMap(line=>{const m=line.match(/^([A-Z_]+)=(.*)$/);return m?[[m[1],m[2].replace(/^"|"$/g,'')]]:[];}));
 const names=['python3','flock','systemctl','install','cp','mv','stat','find','sha256sum','curl','apt-get','apt-cache','dpkg-deb','dpkg-architecture','ip'];
 const commands=Object.fromEntries(await Promise.all(names.map(async name=>[name,(await Promise.all((process.env.PATH||'/usr/sbin:/usr/bin:/sbin:/bin').split(':').filter(Boolean).map(dir=>fs.access(dir+'/'+name,fs.constants.X_OK).then(()=>true,()=>false)))).some(Boolean)])));
 const disk=await fs.statfs('/var');
 return assessHost({platform:process.platform,arch:process.arch,release,systemd:await fs.access('/run/systemd/system').then(()=>true,()=>false),commands,freeBytes:disk.bavail*disk.bsize,memoryBytes:os.totalmem(),profile});
}
