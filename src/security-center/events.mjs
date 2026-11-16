import crypto from 'node:crypto';
import net from 'node:net';
const text=(v,n=300)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n);
const ip=v=>net.isIP(String(v||''))?String(v):null;
const port=v=>Number.isInteger(Number(v))&&Number(v)>0&&Number(v)<=65535?Number(v):null;
export function normalizeSecurityEvent(engine,raw,sensor='host'){
 if(!raw||typeof raw!=='object'||!['suricata','coraza','crowdsec','bunkerweb'].includes(engine))throw Error('Unsupported security event');
 const timestamp=raw.timestamp||raw.time||raw.created_at||raw.transaction?.timestamp;
 const date=new Date(timestamp);if(!Number.isFinite(date.getTime())||date.getTime()>Date.now()+300000)throw Error('Invalid event timestamp');
 let source,destination,sourcePort,destinationPort,protocol,ruleId,ruleName,severity,kind='alert',verdict='detected',domain=null,evidence={};
 if(engine==='suricata'){
  ({src_ip:source,dest_ip:destination,src_port:sourcePort,dest_port:destinationPort,proto:protocol}=raw);
  kind=['flow','dns','tls','http','stats'].includes(raw.event_type)?raw.event_type:'alert';ruleId=raw.alert?.signature_id;ruleName=raw.alert?.signature;severity=raw.alert?.severity===1?'high':raw.alert?.severity===2?'medium':'low';
  // A signature alert is not enforcement proof. Suricata's actual drop/reject verdict is required.
  verdict=raw._inline===true&&(['drop','reject'].includes(raw.verdict?.action)||raw.alert?.action==='blocked')?'blocked':'detected';
  evidence={flowId:text(raw.flow_id,30),interface:text(raw.in_iface,50),direction:text(raw.direction,20),classification:text(raw.alert?.category,100),packets:Number(raw.flow?.pkts_toserver||0)+Number(raw.flow?.pkts_toclient||0),bytes:Number(raw.flow?.bytes_toserver||0)+Number(raw.flow?.bytes_toclient||0),dnsName:text(raw.dns?.rrname,253),tlsSni:text(raw.tls?.sni,253),tlsVersion:text(raw.tls?.version,32)};
 }else if(engine==='coraza'){
  const tx=raw.transaction||raw;source=tx.client_ip||raw.source;destination=tx.host_ip;sourcePort=tx.client_port;destinationPort=tx.host_port;protocol='HTTP';domain=raw.domain;const m=(raw.messages||tx.messages||[])[0]||{};ruleId=m.details?.ruleId||m.details?.rule_id||raw.ruleId;ruleName=m.message||raw.ruleName||'WAF audit event';severity=[0,1,2].includes(raw.severity)?'critical':raw.severity===4?'medium':raw.severity>=5?'low':'high';
  verdict=raw.enforcement==='blocked'?'blocked':raw.enforcement==='monitored'?'monitored':'detected';
  evidence={method:text(tx.request?.method||raw.method,16),path:text(String(tx.request?.uri||raw.path||'').split('?')[0],500),status:Number(tx.response?.http_code||raw.status)||null,transactionId:text(tx.id||tx.unique_id||raw.id,100)};
 }else if(engine==='bunkerweb'){
  source=raw.ip;protocol='HTTP';ruleName=raw.reason;domain=raw.server_name;severity='medium';verdict=raw.security_mode==='block'&&Number(raw.status)>=400&&Number(raw.status)<500?'blocked':'monitored';evidence={method:text(raw.method,16),path:text(String(raw.path||'').split('?')[0],500),status:Number(raw.status)||null};
 }else{
  source=raw.source?.ip||raw.value;protocol='BEHAVIOR';ruleName=raw.scenario||raw.reason||'CrowdSec decision';severity='medium';kind='decision';verdict='decision';evidence={decisionId:text(raw.id,60),scope:text(raw.scope||raw.source?.scope,30),duration:text(raw.duration,40),origin:text(raw.origin,100),remediationConfirmed:false};
 }
 const stable=raw.id||raw.uuid||raw.transaction?.id||raw.transaction?.unique_id||crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
 const id=crypto.createHash('sha256').update([engine,sensor,String(stable),date.toISOString()].join('\0')).digest('hex');
 return {id,occurredAt:date.toISOString(),sensor:text(sensor,80),engine,kind,source:ip(source),destination:ip(destination),sourcePort:port(sourcePort),destinationPort:port(destinationPort),protocol:text(protocol||'unknown',20),ruleId:text(ruleId,80),ruleName:text(ruleName||kind,300),severity,verdict,blockingEngine:verdict==='blocked'?engine:null,domain:text(domain,253)||null,evidence};
}
export function safeNote(value){const s=String(value||'').trim();if(!s||s.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw Error('Provide a note of 1–4000 characters');return s;}
export function csvCell(value){const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
