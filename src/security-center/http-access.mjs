import net from 'node:net';
export function expectedAuthenticationChallenge(method,uri,status){
 const pathname=String(uri||'/').split('?')[0].replace(/\/+$/,'')||'/';
 return status===401&&((method==='POST'&&pathname==='/mcp')||(['GET','HEAD'].includes(method)&&['/api/me','/api/jobs'].includes(pathname)));
}
export function crowdsecAccessLine(record){
 const request=record?.request||{},ip=request.client_ip||request.remote_ip;
 if(!net.isIP(ip))return null;
 const host=String(request.host||record?.hostname||'').toLowerCase();
 if(host==='cyber.cyberpross.cc')return null;
 const date=new Date(record.ts*1000);if(!Number.isFinite(date.getTime()))return null;
 const method=/^[A-Z]{1,12}$/.test(request.method)?request.method:'GET',uri=String(request.uri||'/').split('?')[0].replace(/[\s"\x00-\x1f]/g,'_').slice(0,400),status=Number(record.status)||0;
 // An OAuth discovery challenge or an expired-session poll is not a password attempt.
 // Keep the original access log and all non-challenge security responses intact.
 if(expectedAuthenticationChallenge(method,uri,status))return null;
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],stamp=String(date.getUTCDate()).padStart(2,'0')+'/'+months[date.getUTCMonth()]+'/'+date.getUTCFullYear()+':'+date.toISOString().slice(11,19)+' +0000';
 return ip+' - - ['+stamp+'] "'+method+' '+uri+' HTTP/1.1" '+status+' '+(Number(record.size)||0)+' "-" "CyberPross-redacted"';
}
