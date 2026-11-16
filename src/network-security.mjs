import net from 'node:net';
import {run} from './management.mjs';
export function listeningServices(text){
 const seen=new Set(),out=[];
 for(const line of text.split('\n')){const columns=line.trim().split(/\s+/);if(!['tcp','udp'].includes(columns[0])||columns.length<5)continue;const endpoint=columns[4],at=endpoint.lastIndexOf(':'),port=Number(endpoint.slice(at+1)),address=endpoint.slice(0,at).replace(/^\[|\]$/g,'');if(!Number.isInteger(port)||port<1||port>65535)continue;const key=columns[0]+':'+endpoint;if(seen.has(key))continue;seen.add(key);const ip=address.split('%')[0];out.push({protocol:columns[0],address,port,scope:ip==='*'||ip==='0.0.0.0'||ip==='::'?'All interfaces':ip==='::1'||ip.startsWith('127.')?'Loopback':'Specific interface',family:net.isIP(ip)===6?'IPv6':ip==='*'?'Unspecified':'IPv4'});}
 return out.sort((a,b)=>a.port-b.port||a.protocol.localeCompare(b.protocol));
}
export function createNetworkSecurity({guard,ids,waf,websites,firewall,execute=run}){
 async function dockerBindings(){
  try{const raw=await execute('docker',['ps','--quiet']),ids=raw.split(/\s+/).filter(Boolean);if(!ids.length)return {bindings:[],hostNetwork:[]};if(ids.some(id=>! /^[a-f0-9]{12,64}$/.test(id)))throw Error('Invalid Docker inventory');
   const lines=await execute('docker',['inspect','--format','{"name":{{json .Name}},"network":{{json .HostConfig.NetworkMode}},"ports":{{json .NetworkSettings.Ports}}}',...ids],{maxBuffer:2*1024*1024});const bindings=[],hostNetwork=[];
   for(const line of lines.split('\n').filter(Boolean)){const c=JSON.parse(line);if(c.network==='host')hostNetwork.push(c.name.replace(/^\//,''));for(const [target,ports]of Object.entries(c.ports||{}))for(const p of ports||[])bindings.push({container:c.name.replace(/^\//,''),address:p.HostIp||'0.0.0.0',port:Number(p.HostPort),target,scope:['127.0.0.1','::1'].includes(p.HostIp)?'Loopback':'Published binding'});}
   return {bindings,hostNetwork};
  }catch(e){return {error:e.message,bindings:[],hostNetwork:[]};}
 }
 return {async status(token){
  const [policy,inspection,gateway,web,ufw,listeners,interfaces,docker,published]=await Promise.all([
   guard.status(),ids.status(),waf.status(),websites.inventory().catch(e=>({error:e.message,sites:[],external:[]})),firewall.status(token),
   execute('ss',['-H','-lntu']).then(listeningServices,e=>({error:e.message})),
   execute('ip',['-j','address','show']).then(s=>JSON.parse(s).map(i=>({name:i.ifname,state:i.operstate,addresses:(i.addr_info||[]).filter(a=>['inet','inet6'].includes(a.family)).map(a=>a.local+'/'+a.prefixlen)})),e=>({error:e.message})),
   execute('docker',['info','--format','{{json .FirewallBackend}}']).then(s=>JSON.parse(s),()=>null),dockerBindings()
  ]);
  const routes=gateway.configuration?.sites||[],domains=[...new Set([...(web.sites||[]).filter(s=>s.state==='published').flatMap(s=>s.domains),...(web.external||[]).filter(s=>s.enabled).flatMap(s=>s.domains)])];
  return {checkedAt:new Date().toISOString(),guard:policy,ids:inspection,waf:{prepared:gateway.prepared,localReady:gateway.localReady,mode:gateway.configuration?.mode},ufw:{available:ufw.available,state:ufw.state,error:ufw.error},listeners,interfaces,docker,published,webError:web.error||null,websites:domains.map(domain=>({domain,configuredInGateway:gateway.configuration?.scope==='server'||routes.some(r=>r.domain===domain),coverage:'Public route not verified'})),limits:['WAF applies only to HTTP/HTTPS routed through it after TLS termination. Existing site routing is not automatically rewritten.','The separate network guard filters IP packets for the whole server; deny rules apply to new flows. Docker routed traffic is included, but same-bridge traffic is not universally covered.','Passive IDS monitors visible packets, not encrypted application contents. Packet drops, offload and unsupported paths can create gaps. Signature-based inline IPS is not enabled.']};
 }};
}
