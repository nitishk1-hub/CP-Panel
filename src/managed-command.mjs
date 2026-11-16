const service=/^[A-Za-z0-9][A-Za-z0-9_.@:-]{0,180}\.service$/;
const container=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const unitByKind={nginx:'nginx.service',cloudflare:'cloudflared.service',coraza:'cyberpross-coraza.service',crowdsec:'cyberpross-crowdsec.service'};
export function managedCommand(b){
 if(!b||typeof b!=='object')throw Error('Operation required');if(b.timeoutMs!==undefined&&(!Number.isInteger(b.timeoutMs)||b.timeoutMs<100||b.timeoutMs>3600000))throw Error('Invalid operation timeout');let executable,args,mutating=false;
 if(b.kind==='systemd'||Object.hasOwn(unitByKind,b.kind)){
  const unit=unitByKind[b.kind]||b.unit;if(!service.test(String(unit)))throw Error('Use an exact service unit');
  if(b.action==='status'){executable='/usr/bin/systemctl';args=['show','--no-pager','--property=Id,ActiveState,SubState,Result,ExecMainStatus',unit];}
  else if(b.action==='logs'){executable='/usr/bin/journalctl';args=['--no-pager','--output=short-iso','--lines=200','--unit',unit];}
  else if(b.kind==='nginx'&&b.action==='validate'){executable='/usr/sbin/nginx';args=['-t'];}
  else if(['start','stop','restart','reload','enable','disable'].includes(b.action)){executable='/usr/bin/systemctl';args=[b.action,unit];mutating=true;}
  else throw Error('Unsupported service operation');
 }else if(b.kind==='docker'){
  executable='/usr/bin/docker';if(b.action==='list')args=['ps','--all','--format','json'];
  else{if(!container.test(String(b.container)))throw Error('Use an exact container name or ID');if(b.action==='inspect')args=['inspect',b.container];else if(b.action==='logs')args=['logs','--tail','200',b.container];else if(['start','stop','restart'].includes(b.action)){args=[b.action,b.container];mutating=true;}else throw Error('Unsupported container operation');}
 }else if(b.kind==='compose'){
  if(typeof b.file!=='string'||!b.file.startsWith('/')||b.file.includes('\0')||b.file.includes('\n'))throw Error('Use an absolute Compose file path');
  executable='/usr/bin/docker';args=['compose','--file',b.file];if(b.action==='validate')args.push('config','--quiet');else if(b.action==='status')args.push('ps','--all','--format','json');else if(b.action==='logs')args.push('logs','--no-color','--tail','200');else throw Error('Use the transactional Compose deployment tools for changes');
 }else throw Error('Unknown managed component');
 if(mutating&&b.confirm!==true)throw Error('Explicit authorization required for service or container changes');
 return {executable,args,permission:mutating?'manage':'read',timeoutMs:b.timeoutMs??120000};
}
