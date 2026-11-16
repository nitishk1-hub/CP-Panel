import {validateDeployment} from './deployment-validation.mjs';
import {operationClientFromEnvironment} from './operation-client.mjs';
import {ensureStateSchema} from './state-schema.mjs';
import {createAudit} from './audit.mjs';
import {createWebEngine} from './web-engine.mjs';
import {panelBuild} from './panel-build.mjs';
import {createMCPOAuth} from './mcp-oauth.mjs';
import {createMCPHTTP} from './mcp-http.mjs';
import {createPanelAccess,panelUpstream} from './panel-access.mjs';
import {createAIAccess,authorizeAI} from './ai-access.mjs';
import {runAICommand} from './ai-command.mjs';
import {createSecurityCenter} from './security-center/index.mjs';
import {securityTile} from './security-center/tiles.mjs';
import {csvCell} from './security-center/events.mjs';
import {createTasks} from './tasks.mjs';
import {createDatabases} from './databases.mjs';
import {createThreatSecurity} from './threat-security.mjs';
import {createDockerRegistries} from './docker-registries.mjs';
import {createWireGuard} from './wireguard.mjs';
import {productionReadiness} from './readiness.mjs';
import {createReadinessAutomation} from './readiness-automation.mjs';
import {createWebsites} from './websites.mjs';
import {createHostService} from './host-service.mjs';
import {attachTerminal} from './interactive-terminal.mjs';
import {firewallManager} from './firewall.mjs';
import {createFileManager} from './file-manager.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { detect, deploymentPlan } from './detect.mjs';
import {metrics,dockerSnapshot,confined,readText,saveText,dockerPackages,composeFile,containerAction,privileged,bad} from './management.mjs';
import {identityStore} from './identity.mjs';
import {createDockerMaintenance,cleanupCommand} from './docker-maintenance.mjs';
import {createCloudflare} from './cloudflare.mjs';
import {createCloudflareDns} from './cloudflare-dns.mjs';
import {createDockerWorkspace} from './docker-workspace.mjs';
import {createGrafana,formatPrometheusMetrics} from './grafana.mjs';
import {createGraphifyBridge} from './graphify-bridge.mjs';
import {createAppsCatalog} from './apps-catalog.mjs';
import {createCloudBackup} from './cloud-backup.mjs';
import {createAcmeClient} from './acme-ssl.mjs';
import {createCronManager} from './cron-manager.mjs';
import {createNotifications} from './notifications.mjs';
import {handleApt,handleGit,handleDockerBuild,handleSecurityInspect,handleNetworkInspect,handleTestRunner} from './ai-operations.mjs';
import {tools,toolScope} from './mcp-tools.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const assets=new Map([['/security-center.js',['security-center.js','text/javascript']],['/security-map.js',['security-map.js','text/javascript']],['/security-map-worker.js',['security-map-worker.js','text/javascript']],['/security-map.css',['security-map.css','text/css']],['/tasks.js',['tasks.js','text/javascript']],['/databases.js',['databases.js','text/javascript']],['/security-world.svg',['security-world.svg','image/svg+xml']],['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/third-party-notices.txt',['third-party-notices.txt','text/plain']],['/network-system.js',['network-system.js','text/javascript']],['/websites.js',['websites.js','text/javascript']],['/system-tools.js',['system-tools.js','text/javascript']],['/tools-bundle.js',['tools-bundle.js','text/javascript']],['/xterm.css',['xterm.css','text/css']],['/host-overview.js',['host-overview.js','text/javascript']],['/docker-workspace.js',['docker-workspace.js','text/javascript']],['/style.css',['style.css','text/css']]]);
export async function createPanel({dataDir=process.env.PANEL_DATA_DIR||path.join(root,'var'),port=8787,fileRoot=process.env.PANEL_FILE_ROOT||'/',dockerMaintenance=createDockerMaintenance(),dockerWorkspace,cloudflareService,grafanaService,hostService,websiteService,wireguardService,automaticVerification=true,readinessService,registryService,wafService,networkGuardService,networkIDSService,threatSecurityService,databaseService,taskService,securityCenterService,panelAccessRequest,webEngineService}={}) {
  await fs.mkdir(dataDir,{recursive:true,mode:0o700});
  if(process.env.PANEL_REQUIRE_SETUP==='1'){let seeded;try{seeded=JSON.parse(await fs.readFile(path.join(dataDir,'users.json'),'utf8'));}catch{}if(!Array.isArray(seeded)||!seeded.some(u=>u.enabled&&u.role==='admin'&&(u.authSource||'local')==='local'&&!u.mustChangePassword))throw new Error('Complete the installer before starting the production service.');}
  await ensureStateSchema(dataDir);
  const identity=await identityStore(dataDir),jobs=taskService||await createTasks({dataDir}),databasePlans=new Map();
  const aiAccess=await createAIAccess({dataDir,identity});
  const cloudflare=cloudflareService||createCloudflare({dataDir});
  const grafana=grafanaService||createGrafana({dataDir,panelPort:()=>server.address()?.port||port});
  const firewall=firewallManager(),fileManager=createFileManager({fileRoot,dataDir});
  const wireguard=wireguardService||createWireGuard({dataDir});
  const websites=websiteService||createWebsites({dataDir,validatePublished:async(site,engine,roots)=>{
    const config=path.join(dataDir,'security-center/coraza/Caddyfile'),coraza=await fs.access(config).then(()=>({config}),()=>null);
    return validateDeployment({coraza,files:site.type==='static'?[{path:path.join(roots.app,'public'),...(engine.kind==='native'&&engine.workerUser?{reader:engine.workerUser}:{})}]:[],upstreams:site.type==='proxy'?[site.upstream]:[],http:[{url:'http://127.0.0.1:'+site.listenPort+'/',host:site.domains[0],statuses:[200,201,204,301,302,307,308]}]});
  }});
  const webEngine=webEngineService||createWebEngine({dataDir});
  const databases=databaseService||createDatabases();
  const registries=registryService||createDockerRegistries({dataDir});
  const threat=threatSecurityService||createThreatSecurity({dataDir});
  const securityCenter=securityCenterService||createSecurityCenter({dataDir,threat});
  const securityLimits=new Map();
  const workspace=dockerWorkspace||createDockerWorkspace({dataDir});
  const appsCatalog=createAppsCatalog({workspace,websites,jobs});
  const cloudBackup=createCloudBackup({dataDir});
  const acmeClient=createAcmeClient({dataDir});
  const cloudflareDns=createCloudflareDns({dataDir,acmeClient});
  const cronManager=createCronManager({dataDir,cloudBackup,dockerMaintenance,acmeClient});
  const notifications=createNotifications({dataDir});
  cronManager.startScheduler();
  const graphify=createGraphifyBridge({
    roots:[path.join(root,'graphify-out'),'/home/cyber/Documents/ChatGPT/1PanelServer/graphify-out',path.join(dataDir,'graphify-out')],
    getDigestContext:async()=>{
      const [m,d,w,g,s]=await Promise.all([
        metrics().catch(()=>null),
        dockerSnapshot().catch(()=>null),
        websites.inventory().catch(()=>null),
        grafana.status().catch(()=>null),
        securityCenter.overview().catch(()=>null)
      ]);
      return {
        host:m?{hostname:m.hostname,cpuPercent:Number(m.cpu.toFixed(1)),memoryUsedGiB:Number((m.memory.used/1024**3).toFixed(2)),memoryTotalGiB:Number((m.memory.total/1024**3).toFixed(2)),diskFreeGiB:Number((m.disk.available/1024**3).toFixed(2)),uptimeHours:Math.round(m.uptime/3600)}:null,
        grafana:g?{active:g.active,healthy:g.healthy,localURL:g.localURL,pollMode:g.pollMode,intervalMs:g.effectiveIntervalMs}:null,
        containers:d?.containers?d.containers.map(c=>({name:c.Names,state:c.State,status:c.Status})):[],
        websites:w?[...(w.sites||[]).map(x=>({domains:x.domains,type:x.type,state:x.state})),...(w.external||[]).map(x=>({domains:x.domains,type:x.type,enabled:x.enabled}))]:[],
        security:s?{mode:s.engines?.protection?.mode,corazaHealthy:s.engines?.protection?.healthy,crowdsecAvailable:s.engines?.crowdsec?.available,activeDecisions:s.engines?.crowdsec?.decisions?.length||0}:null
      };
    }
  });
  let publicURL=process.env.PANEL_PUBLIC_URL?new URL(process.env.PANEL_PUBLIC_URL):null;
  const panelAccess=await createPanelAccess({dataDir,initialOrigin:publicURL?.origin,localPort:()=>server.address()?.port||port,request:panelAccessRequest,onChange:url=>{publicURL=url;interactiveTerminal.closeAll();void synchronizePanelWAF().catch(()=>{});}});
  publicURL=panelAccess.get();
  async function synchronizePanelWAF(){const provider=securityCenter.coraza;if(!publicURL||!provider?.config||!provider?.policy)return;const configured=await provider.config();if(!configured)return;const hosts=[publicURL.hostname];if(JSON.stringify(configured.panelHosts||[])===JSON.stringify(hosts))return;if(!(await provider.status()).active)return;await provider.policy({panelHosts:hosts,revision:configured.revision});await writeAudit('panel.waf.bypass.synchronized','system',{target:publicURL.hostname,outcome:'configured'});}
  if(publicURL&&(publicURL.protocol!=='https:'||publicURL.username||publicURL.password||publicURL.pathname!=='/'||publicURL.search||publicURL.hash))throw new Error('PANEL_PUBLIC_URL must be a clean HTTPS origin');
  const body=async(req)=>{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>3*1024*1024)throw bad('Request too large',413);chunks.push(chunk);}try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('object required');return parsed;}catch{throw bad('Provide a valid JSON object');}};
  const build=await panelBuild(root);
  const verification=readinessService||createReadinessAutomation({root,dataDir,expectedBuild:build,publicOrigin:()=>publicURL?.origin,onProgress:info=>jobs.observe(info)});
  let administrativeSetup=false;
  let latest, refreshed=0;
  const inventory=async()=>{if(!latest || Date.now()-refreshed>10000){latest=await detect();refreshed=Date.now();}return latest;};
  async function synchronizePanelWebsite(id,result,log=()=>{}){const existing=/^[a-f0-9]{16}$/.test(String(id));const site=await (existing?websites.existing:websites).details(id);const upstream=existing?site.upstreams?.[0]:site.upstream;if(!panelUpstream(upstream,server.address()?.port||port))return result;const domain=site.domains?.find(d=>!d.includes('*'));if(!domain)return result;try{const access=await panelAccess.apply('https://'+domain);log('Panel HTTPS address verified and applied to authentication, APIs and terminal.');return {...result,panelAccess:access};}catch(e){log('Website routing saved; panel address verification needs attention: '+e.message);return {...result,panelAccess:{warning:e.message}};}}
  const mcpInternalTokens=new Map();
  const auditStore=createAudit({dataDir});
  const writeAudit=(action,actor,details)=>auditStore.write(action,actor,details);
  const server=http.createServer({maxHeaderSize:64*1024},async(req,res)=>{
    const styleNonce=crypto.randomBytes(18).toString('base64');
    const requestId=crypto.randomUUID();let auditActor='anonymous',requestedPath='unknown';res.setHeader('X-Request-Id',requestId);
    res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${styleNonce}'; connect-src 'self' data: blob:; img-src 'self' data: blob:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(status>=400&&data&&typeof data==='object'&&!Array.isArray(data)?{...data,requestId}:data));};
    try {
      const proof=panelAccess.probe(req);if(proof)return send(200,proof);
      const allowed=new Set([`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`]);
      if(publicURL)allowed.add(publicURL.host);
      if(!allowed.has(req.headers.host))return send(403,{error:'Invalid host'});
      const url=new URL(req.url,'http://localhost');requestedPath=url.pathname;
      if(req.method!=='GET'&&await fs.access(path.join(dataDir,'maintenance.json')).then(()=>true,()=>false))return send(503,{error:'Panel maintenance is in progress. Wait for it to finish before changing the server.'});
      if(req.method==='GET'&&url.pathname==='/api/health')return send(200,{status:'ready',build});
      if(remoteMCP.matches(url.pathname))return await remoteMCP.handle(req,res,url);
      if(req.method==='GET' && assets.has(url.pathname)) {const [file,type]=assets.get(url.pathname);res.writeHead(200,{'Content-Type':type});const bytes=await fs.readFile(path.join(root,'public',file));return res.end(file==='index.html'?bytes.toString().replace(/(src|href)="(\/[^"]+\.(?:js|css))"/g,`$1="$2?v=${build}"`).replace('</head>',`<meta name="style-nonce" content="${styleNonce}"></head>`):bytes);}
      if(url.pathname.startsWith('/api/grafana/prom/')){
        if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(403,{error:'Prometheus datasource is loopback-only'});
        const token=await grafana.getPromToken();
        if(req.headers.authorization!=='Bearer '+token)return send(401,{error:'Invalid Prometheus datasource token'});
        const promData=await grafana.handlePromApi(url,async()=>{
          const [m,d,s]=await Promise.all([metrics().catch(()=>null),dockerSnapshot().catch(()=>({containers:[]})),securityCenter.overview().catch(()=>({counts:[]}))]);
          return {metrics:m,docker:d,security:s};
        });
        return send(200,promData);
      }
      const supplied=req.headers.authorization?.replace(/^Bearer /,'') || req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('panel_session='))?.slice('panel_session='.length) || '';
      const browserCookie=name=>req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(name+'='))?.slice(name.length+1)||'';
      const setCookie=(name,value,maxAge)=>{const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(old?(Array.isArray(old)?old:[old]):[]),`${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${publicURL?'; Secure':''}`]);};
      const cookie=(value,maxAge)=>setCookie('panel_session',value,maxAge);
      if(req.headers.origin && !new Set([`http://127.0.0.1:${server.address()?.port}`,`http://localhost:${server.address()?.port}`,...(publicURL?[publicURL.origin]:[])]).has(req.headers.origin))return send(403,{error:'Invalid origin'});
      const rateKey=req.socket.remoteAddress;
      if(administrativeSetup&&req.method!=='GET'&&url.pathname!=='/api/logout')throw bad('Administrative installation is in progress; wait for the panel to restart.',409);
      if(req.method==='GET'&&url.pathname==='/api/version')return send(200,{build});
      if(req.method==='GET'&&url.pathname==='/api/auth/options')return send(200,{methods:['local'],mfa:true});
      if(req.method==='POST' && url.pathname==='/api/login'){const b=await body(req);if(b.source&&b.source!=='local')throw bad('This sign-in method is no longer available',400);const result=await identity.login(b.username,b.password,rateKey,browserCookie('panel_mfa_browser'));if(result.mfaRequired)return send(200,result);await writeAudit('account.login',result.user.username);cookie(result.token,8*3600);return send(200,result);}
      if(req.method==='POST'&&url.pathname==='/api/login/mfa'){const b=await body(req),result=await identity.completeMfa(b.challenge,b.code,rateKey);await writeAudit('account.login.mfa',result.user.username);cookie(result.token,8*3600);setCookie('panel_mfa_browser',result.rememberedBrowser,24*3600);const {rememberedBrowser,...signedIn}=result;return send(200,signedIn);}
      if(req.method==='POST'&&url.pathname==='/api/account/reset'){const b=await body(req);const result=await identity.resetPassword(b.username,b.recoveryCode,b.newPassword,rateKey);await writeAudit('account.password.recovered',b.username);return send(200,result);}
      const internal=mcpInternalTokens.get(supplied);
      const aiConnection=internal&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)?internal:supplied.startsWith('cpai_')?await aiAccess.resolve(supplied):null;
      const user=aiConnection?.user||identity.resolve(supplied);
      if(aiConnection)authorizeAI(aiConnection,req.method,url.pathname);
      if(!user)return send(401,{error:'Sign in to manage this server'});
      auditActor=user.username+(aiConnection?' [AI:'+aiConnection.credential+']':'');
      const audit=action=>writeAudit(action,auditActor,{requestId,target:url.pathname,outcome:'recorded'});
      if(aiConnection){const key='ai:'+aiConnection.credential,now=Date.now(),limit=securityLimits.get(key)||{at:now,count:0};if(now-limit.at>60000){limit.at=now;limit.count=0;}securityLimits.set(key,limit);if(++limit.count>120)throw bad('AI request limit reached',429);await audit('ai.api.'+req.method+'.'+url.pathname);}
      const admin=()=>{if(user.role!=='admin')throw bad('Administrator permission required',403);};
      if(process.env.PANEL_REQUIRE_ADMIN_MFA==='1'&&user.role==='admin'&&!user.mfaEnabled&&!['/api/me','/api/logout','/api/account/password','/api/account/recovery','/api/account/mfa/start','/api/account/mfa/confirm'].includes(url.pathname))throw bad('Administrator MFA is required. Open My account and complete authenticator setup before managing the server.',403);
      if(user.mustChangePassword&&!['/api/me','/api/logout','/api/account/password'].includes(url.pathname))throw bad('Change your initial password before managing the server',403);
      if(url.pathname==='/api/grafana/proxy'||url.pathname.startsWith('/api/grafana/proxy/')){
        admin();
        if(url.pathname==='/api/grafana/proxy'){res.writeHead(302,{Location:'/api/grafana/proxy/?orgId=1'});return res.end();}
        return await grafana.proxyHttp(req,res);
      }
      if(req.method!=='GET'&&url.pathname!=='/api/plan/save'){
        if(req.headers['x-panel-intent']!=='manage')throw bad('Explicit operation intent required',403);
        if(user.role==='viewer'&&!['/api/logout','/api/account/password','/api/account/recovery','/api/account/mfa/start','/api/account/mfa/confirm','/api/account/mfa/disable','/api/account/reauth'].includes(url.pathname))throw bad('Read-only account',403);
      }
      const sensitiveChange=req.method==='POST'&&['/api/ai/connections','/api/users','/api/users/disable','/api/panel-access','/api/protection/mode','/api/operations/health-policy'].includes(url.pathname);
      if(process.env.PANEL_REQUIRE_RECENT_AUTH==='1'&&!aiConnection&&user.role==='admin'&&sensitiveChange&&!identity.recentlyAuthenticated(supplied))return send(428,{error:'Verify your identity before continuing this sensitive change.',reauthRequired:true,mfaEnabled:user.mfaEnabled});
      if(req.method==='POST'&&url.pathname==='/api/account/reauth'){const b=await body(req);const result=await identity.reauthenticate(supplied,b.currentPassword,b.code);await audit('account.reauthenticated');return send(200,result);}
      if(url.pathname==='/api/web-engine'||url.pathname.startsWith('/api/web-engine/')){admin();const endpoint=url.pathname.slice('/api/web-engine'.length);if(req.method==='GET'&&!endpoint)return send(200,await webEngine.status());if(req.method==='POST'){const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm the web-engine operation');if(endpoint==='/prepare')return send(200,await webEngine.prepare());if(endpoint==='/settings'){await audit('web-engine.settings.updated');return send(200,await webEngine.saveOptions(b));}if(endpoint==='/install'){await audit('web-engine.install.requested');return send(202,jobs.start('Install native web engine',async log=>{const result=await webEngine.install(log);if(b.restorePanel&&publicURL&&!(await webEngine.registeredRoutes()).some(r=>r.domain===publicURL.hostname))await webEngine.recover([{domain:publicURL.hostname,type:'proxy',upstream:`http://127.0.0.1:${server.address().port}`}],log);return result;}));}if(endpoint==='/recover'){await audit('web-engine.routes.recovery.requested');return send(202,jobs.start('Recover website routes',log=>webEngine.recover(b.routes,log)));}if(endpoint==='/action'){await audit('web-engine.service.'+b.action);return send(202,jobs.start('Web engine '+b.action,log=>webEngine.operate(b,log)));}}}
      if(req.method==='GET'&&url.pathname==='/api/panel-access'){admin();return send(200,panelAccess.status());}
      if(req.method==='POST'&&url.pathname==='/api/panel-access'){admin();const b=await body(req);if(b.confirm!==true)throw bad('Confirm the panel address change');const result=await panelAccess.apply(b.origin);await audit('panel.address.updated');return send(200,result);}
      if(req.method==='GET'&&url.pathname==='/api/ai/oauth/request'){admin();return send(200,oauth.requestInfo(url.searchParams.get('id')));}
      if(req.method==='POST'&&url.pathname==='/api/ai/oauth/consent'){admin();const result=await oauth.decide(user,await body(req));return send(200,result);}
      if(url.pathname==='/api/ai/connections'){admin();if(req.method==='GET')return send(200,{connections:[...(await oauth.list()),...(await aiAccess.list()).map(c=>({...c,kind:'legacy'}))],origin:publicURL?.origin||`http://127.0.0.1:${server.address()?.port}`,mcpURL:(publicURL?.origin||`http://127.0.0.1:${server.address()?.port}`)+'/mcp',oauth:!!publicURL,bridge:'/opt/server-panel/app/scripts/mcp-server.mjs',node:'/opt/server-panel/bin/node'});if(req.method==='POST'){const b=await body(req);if(b.confirm!==true)throw bad('Confirm the AI permissions');const r=await aiAccess.create(user,b);await audit('ai.connection.created');return send(201,r);}}
      if(req.method==='POST'&&url.pathname==='/api/ai/connections/revoke'){admin();const b=await body(req);if(b.confirm!==true)throw bad('Confirm connection revocation');const r=await (b.kind==='oauth'?oauth:aiAccess).revoke(b.id);await audit('ai.connection.revoked');return send(200,r);}
      if(req.method==='GET'&&url.pathname==='/api/ai/catalog'){admin();const source=await fs.readFile(fileURLToPath(import.meta.url),'utf8');const paths=[...new Set([...[...source.matchAll(/(?:url\.pathname===|\[)'(\/api\/[^'?]+)'/g)].map(m=>m[1]),'/api/ai/graph','/api/grafana/status','/api/grafana/logs','/api/grafana/prometheus','/api/grafana/settings','/api/grafana/install','/api/grafana/service','/api/operations/static-preview','/api/operations/static-deploy','/api/operations/file-upload','/api/operations/health-policy','/api/operations/transactions','/api/operations/file','/api/operations/file-edit','/api/operations/file-restore','/api/operations/health','/api/operations/component','/api/operations/command','/api/websites/quick-proxy','/api/websites/import','/api/apps/catalog','/api/apps/deploy','/api/backup/cloud/config','/api/backup/cloud/run','/api/backup/cloud/list','/api/ssl/acme/status','/api/ssl/acme/issue','/api/cron/tasks','/api/notifications/config','/api/security-center/coraza/exclude-rule','/api/operations/apt','/api/operations/git','/api/operations/docker-build','/api/operations/security-inspect','/api/operations/network-inspect','/api/operations/test-runner'])].filter(p=>!/^\/api\/(login|logout|auth|account|sso|vault)/.test(p)&&!p.startsWith('/api/ai/connections')&&p!=='/api/host/setup'&&p!=='/api/terminal/session');const allowedScopes=aiConnection?.scopes||['read','manage','command'];return send(200,{paths,mcpTools:tools.filter(t=>allowedScopes.includes(toolScope(t.name))).map(t=>({name:t.name,scope:toolScope(t.name),description:t.description})),permissions:allowedScopes,usage:'Prefer panel_graph (action: digest | query | explain | path) first to reduce token usage by 35x–77x. GET reads, POST changes. Supply X-Panel-Intent: manage for POST. Existing operations may require confirm:true, preview IDs or revision hashes. Poll /api/jobs?id=ID for background progress. Websocket terminal and account credentials require browser sign-in. API routes are documented in docs/AI-CONNECTIONS.md. Command permission grants full host access.'});}
      if(req.method==='GET'&&url.pathname==='/api/ai/graph'){
        admin();const act=url.searchParams.get('action')||'status',budget=Number(url.searchParams.get('budget')||1200);
        if(act==='status')return send(200,await graphify.status());
        if(act==='digest')return send(200,await graphify.digest());
        if(act==='query')return send(200,await graphify.query({query:url.searchParams.get('query')||'',mode:url.searchParams.get('mode')||'bfs',budget}));
        if(act==='explain')return send(200,await graphify.explain({node:url.searchParams.get('node')||url.searchParams.get('query')||'',budget}));
        if(act==='path')return send(200,await graphify.shortestPath({from:url.searchParams.get('from')||'',to:url.searchParams.get('to')||''}));
        if(act==='report')return send(200,await graphify.report({budget}));
        throw bad('Choose status, digest, query, explain, path or report');
      }
      if(url.pathname==='/api/grafana'||url.pathname.startsWith('/api/grafana/')){
        const endpoint=url.pathname.slice('/api/grafana'.length);
        if(req.method==='GET'&&endpoint==='/status')return send(200,await grafana.status(url.searchParams.get('fresh')==='1'));
        admin();
        if(req.method==='GET'&&endpoint==='/logs')return send(200,await grafana.logs());
        if(req.method==='GET'&&endpoint==='/prometheus'){
          const st=await grafana.status();if(!st.scrapeEnabled)throw bad('Prometheus scraping is disabled in Grafana & Load settings',403);
          const [m,d,s]=await Promise.all([metrics(),dockerSnapshot().catch(()=>({containers:[]})),securityCenter.overview().catch(()=>({counts:[]}))]);
          let h=null;if(process.env.PANEL_AGENT_SOCKET){try{const agent=await operationClientFromEnvironment({actor:auditActor});h=await agent('GET','/health');}catch{}}
          const text=formatPrometheusMetrics({metrics:m,docker:d,health:h,security:s});
          res.writeHead(200,{'Content-Type':'text/plain; version=0.0.4; charset=utf-8','Cache-Control':'no-store'});return res.end(text);
        }
        if(req.method==='POST'){
          const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm the Grafana & observability operation');
          if(endpoint==='/settings'){const result=await grafana.saveSettings(b);await audit('grafana.settings.updated');return send(200,result);}
          if(endpoint==='/ai-settings'){const result=await grafana.saveAiSettings(b);await audit('grafana.ai.settings.updated');return send(200,result);}
          if(endpoint==='/ai'){
            const result=await grafana.askAi(b,async()=>{
              const [m,d,s]=await Promise.all([metrics().catch(()=>null),dockerSnapshot().catch(()=>({containers:[]})),securityCenter.overview().catch(()=>({counts:[]}))]);
              return {metrics:m,docker:d,security:s};
            });
            await audit('grafana.ai.query');
            return send(200,result);
          }
          if(endpoint==='/install'){await audit('grafana.install.requested');return send(202,jobs.start('Install & provision Grafana',log=>grafana.install(b,log)));}
          if(endpoint==='/service'){await audit('grafana.service.'+String(b.action||'').slice(0,20));return send(202,jobs.start('Grafana: '+String(b.action||'service'),log=>grafana.control(b,log)));}
        }
        throw bad('Unknown Grafana endpoint',404);
      }
      if(url.pathname==='/api/operations'||url.pathname.startsWith('/api/operations/')){admin();const endpoint=url.pathname.slice('/api/operations'.length);const agent=await operationClientFromEnvironment({actor:auditActor,permission:endpoint==='/command'?'command':['/component','/file-edit','/file-restore','/file-upload','/health-policy','/static-deploy'].includes(endpoint)?(aiConnection?.scopes.includes('manage')||!aiConnection?'manage':'read'):'read'});
        if(req.method==='GET'&&endpoint==='/static-preview')return send(200,await agent('GET','/static-preview?directory='+encodeURIComponent(url.searchParams.get('directory')||'')));
        if(req.method==='POST'&&endpoint==='/static-deploy'){const b=await body(req);await audit('operation.static-deploy.requested');const transaction=await agent('POST','/static-deploy',b);await writeAudit('operation.static-deploy.'+transaction.state,auditActor,{requestId,target:transaction.id,outcome:transaction.state});return send(200,transaction);}
        if(req.method==='POST'&&endpoint==='/file-upload'){const b=await body(req);await audit('operation.file-upload.requested');return send(201,await agent('POST','/file-upload',b));}
        if(req.method==='GET'&&endpoint==='/health-policy')return send(200,await agent('GET','/health-policy'));
        if(req.method==='POST'&&endpoint==='/health-policy'){const b=await body(req);await audit('operation.remediation-policy.requested');return send(200,await agent('POST','/health-policy',b));}
        if(req.method==='GET'&&endpoint==='/transactions')return send(200,await agent('GET','/transactions'));
        if(req.method==='GET'&&endpoint==='/file')return send(200,await agent('GET','/file?path='+encodeURIComponent(url.searchParams.get('path')||'')));
        if(req.method==='POST'&&endpoint==='/file-edit'){const b=await body(req);await audit('operation.file-edit.requested');const transaction=await agent('POST','/file-edit',b);await writeAudit('operation.file-edit.'+transaction.state,auditActor,{requestId,target:transaction.id,outcome:transaction.state});return send(200,transaction);}
        if(req.method==='POST'&&endpoint==='/file-restore'){const b=await body(req);await audit('operation.file-restore.requested');const transaction=await agent('POST','/file-restore',b);await writeAudit('operation.file-restore.'+transaction.state,auditActor,{requestId,target:transaction.id,outcome:transaction.state});return send(200,transaction);}
        if(req.method==='GET'&&endpoint==='/health')return send(200,await agent('GET','/health'+(url.searchParams.get('scan')==='1'?'?scan=1':'')));
        if(req.method==='GET'&&endpoint==='')return send(200,await agent('GET','/jobs'));
        if(req.method==='GET'&&endpoint==='/job')return send(200,await agent('GET','/job?id='+encodeURIComponent(url.searchParams.get('id')||'')));
        if(req.method==='GET'&&endpoint==='/logs')return send(200,await agent('GET','/logs?id='+encodeURIComponent(url.searchParams.get('id')||'')+'&offset='+encodeURIComponent(url.searchParams.get('offset')||'0')));
        if(req.method==='POST'&&endpoint==='/component'){const b=await body(req);await audit('operation.component.requested');return send(202,await agent('POST','/component',b));}
        if(req.method==='POST'&&endpoint==='/command'){const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm the privileged command');await audit('operation.command.requested');return send(202,await agent('POST','/command',b));}
        if(endpoint==='/apt'){admin();const b=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams);return send(200,await handleApt(b));}
        if(endpoint==='/git'){admin();const b=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams);return send(200,await handleGit(b));}
        if(endpoint==='/docker-build'){admin();const b=await body(req);return send(200,await handleDockerBuild(b));}
        if(endpoint==='/security-inspect'){admin();return send(200,await handleSecurityInspect(Object.fromEntries(url.searchParams)));}
        if(endpoint==='/network-inspect'){admin();return send(200,await handleNetworkInspect(Object.fromEntries(url.searchParams)));}
        if(endpoint==='/test-runner'){admin();const b=await body(req);return send(200,await handleTestRunner(b));}
        throw bad('Unknown operation endpoint',404);
      }
      if(req.method==='POST'&&url.pathname==='/api/ai/command'){admin();const b=await body(req);if(b.confirm!==true||typeof b.command!=='string'||!b.command.trim()||b.command.length>16384||b.command.includes('\0'))throw bad('Review and confirm a valid shell command');await audit('ai.command.requested');return send(202,jobs.start('AI host command',log=>runAICommand(b,log)));}
      if(url.pathname==='/api/databases'||url.pathname.startsWith('/api/databases/')){admin();const endpoint=url.pathname.slice('/api/databases'.length);
        if(['/create','/details','/browse','/backup','/credentials'].includes(endpoint))return send(410,{error:'Instance management endpoints are retired. Use native software management.'});
        if(req.method==='GET'&&endpoint==='')return send(200,await databases.inventory());
        if(req.method==='GET'&&endpoint==='/logs')return send(200,await databases.logs(url.searchParams.get('engine')));
        if(req.method==='GET'&&endpoint==='/plan'){const plan=databasePlans.get(url.searchParams.get('job'));if(!plan)throw bad('This software plan is unavailable. Review the operation again.',404);return send(200,plan);}
        if(req.method==='POST'){const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm the native software operation');
          if(endpoint==='/prepare'){if(!['mysql','postgresql','redis','mariadb'].includes(b.engine)||!['install','update','uninstall'].includes(b.operation))throw bad('Unsupported native software operation');await audit('database.software.plan.'+b.operation);let job;job=jobs.start('Review '+b.engine+' '+b.operation,async log=>{log('Reading native packages and reviewing signed repository candidates.');const plan=await databases.prepare(b);if(databasePlans.size>25)databasePlans.clear();databasePlans.set(job.id,plan);log('Package plan ready for review. No server packages have been installed or removed.');},{action:'native-database-plan'});return send(202,job);}
          if(endpoint==='/apply'){await audit('database.software.apply');return send(202,jobs.start('Apply native database software plan',log=>databases.apply(b.id,b.typedName,log)));}
          if(endpoint==='/operate'){if(!['mysql','postgresql','redis','mariadb'].includes(b.engine)||!['start','stop','restart','enable','disable'].includes(b.operation))throw bad('Unsupported native service operation');await audit('database.service.'+b.engine+'.'+b.operation);return send(202,jobs.start(b.engine+': '+b.operation,log=>databases.control(b.engine,b.operation,log)));}
        }throw bad('Unknown database software endpoint',404);
      }

      if(url.pathname==='/api/sso'||url.pathname.startsWith('/api/sso/')||url.pathname==='/api/vault'||url.pathname.startsWith('/api/vault/')){admin();return send(410,{error:'This module has been removed. Local accounts and MFA remain available.'});}
      if(req.method==='GET'&&url.pathname==='/api/me')return send(200,{...user,fileRoot,build,hostAdministrator:process.getuid?.()===0});
      if(req.method==='GET'&&url.pathname==='/api/host/status'){admin();return send(200,await administrativeHost.status());}
      if(req.method==='POST'&&url.pathname==='/api/host/setup'){admin();const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm administrative service installation');if(administrativeSetup)throw bad('Administrative setup is already running',409);identity.limitDirectory(rateKey);administrativeSetup=true;try{await audit('host.administrative.setup.requested');const result=await administrativeHost.install(b.password);send(200,{...result,restarting:true});setTimeout(()=>{interactiveTerminal.closeAll();server.closeAllConnections();server.close();},1500).unref();return;}catch(e){administrativeSetup=false;throw e;}}
      if(req.method==='POST'&&url.pathname==='/api/logout'){firewall.lock(supplied);identity.logout(supplied);cookie('',0);return send(200,{ok:true});}
      if(req.method==='POST'&&url.pathname==='/api/account/password'){const b=await body(req);const result=await identity.changePassword(user.id,b.currentPassword,b.newPassword);await audit('account.password.changed');cookie('',0);return send(200,result);}
      if(req.method==='POST'&&url.pathname==='/api/account/recovery'){const b=await body(req);const result=await identity.rotateRecovery(user.id,b.currentPassword);await audit('account.recovery.rotated');return send(200,result);}
      if(req.method==='POST'&&url.pathname==='/api/account/mfa/start'){const b=await body(req);return send(200,await identity.beginMfa(user.id,b.currentPassword));}
      if(req.method==='POST'&&url.pathname==='/api/account/mfa/confirm'){const b=await body(req),result=await identity.confirmMfa(user.id,b.code);await audit('account.mfa.enabled');cookie('',0);return send(200,result);}
      if(req.method==='POST'&&url.pathname==='/api/account/mfa/disable'){const b=await body(req),result=await identity.disableMfa(user.id,b.currentPassword,b.code);await audit('account.mfa.disabled');cookie('',0);return send(200,result);}
      if(url.pathname.startsWith('/api/network-security/')||url.pathname.startsWith('/api/waf/')){admin();return send(410,{error:'Legacy security controls were retired. Use WAF & IDS.'});}
      if(url.pathname.startsWith('/api/security-center/')){
       admin();const ep=url.pathname.slice('/api/security-center/'.length),now=Date.now(),key=user.id,limit=securityLimits.get(key)||{at:now,count:0};if(now-limit.at>60000){limit.at=now;limit.count=0;}if(++limit.count>180)throw bad('Security request limit reached; retry shortly',429);if(securityLimits.size>100)securityLimits.clear();securityLimits.set(key,limit);
       if(req.method==='GET'){
        if(ep==='status')return send(200,await securityCenter.overview({force:url.searchParams.get('refresh')==='1'||url.searchParams.get('force')==='1'}));
        if(ep==='traffic')return send(200,await securityCenter.traffic());
        if(ep==='rules')return send(200,await securityCenter.ruleCatalog.list(Object.fromEntries(url.searchParams)));
        if(ep==='events')return send(200,{events:await securityCenter.events(Object.fromEntries(url.searchParams))});
        if(ep==='incident')return send(200,await securityCenter.incident(url.searchParams.get('id')));
        if(ep==='export'){const events=await securityCenter.events({...Object.fromEntries(url.searchParams),limit:1000});await audit('security.events.exported');res.setHeader('Content-Disposition','attachment; filename="security-events.'+(url.searchParams.get('format')==='csv'?'csv':'json')+'"');if(url.searchParams.get('format')!=='csv')return send(200,{events,limit:1000});const keys=['id','occurred_at','engine','source','destination','protocol','rule_id','rule_name','severity','verdict','domain'];res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8'});res.end([keys.map(csvCell).join(','),...events.map(e=>keys.map(k=>csvCell(e[k])).join(','))].join('\r\n'));return;}
        const tile=ep.match(/^tiles\/(\d{1,2})\/(\d{1,4})\/(\d{1,4})\.pbf$/);if(tile){try{const bytes=await securityTile(...tile.slice(1).map(Number));res.writeHead(200,{'Content-Type':'application/x-protobuf','Cache-Control':'private, max-age=86400'});res.end(bytes);return;}catch{res.writeHead(404,{'Content-Type':'application/x-protobuf'});res.end(Buffer.alloc(0));return;}}
        if(ep==='stream'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.write('event: ready\ndata: {}\n\n');const unsubscribe=securityCenter.subscribe(event=>{if(res.writableLength>65536)return res.end();res.write('event: security\ndata: '+JSON.stringify(event)+'\n\n');});const heartbeat=setInterval(()=>{if(identity.resolve(supplied)?.role!=='admin')return res.end();res.write(': heartbeat\n\n');},15000);heartbeat.unref();res.on('close',()=>{clearInterval(heartbeat);unsubscribe();});return;}
       }
       if(req.method==='POST'){const b=await body(req);if(b.confirm!==true)throw bad('Confirm this security change');
        if(ep==='incident'){await audit('security.investigation.updated');return send(200,await securityCenter.annotate(b.id,b,user.username));}
        if(ep==='settings'){await audit('security.retention.updated');return send(200,await securityCenter.updateSettings(b));}
        if(ep==='geoip/update'){await audit('security.geoip.updated');return send(202,jobs.start('Update local GeoIP databases',log=>securityCenter.geoip.update(log)));}
        if(ep==='ids/local-rules'){await audit('security.ids.local_rules');return send(202,jobs.start('Validate custom network signatures',log=>threat.ids.localRules(b.rules,log)));}
        if(ep==='ids/telemetry'){await audit('security.ids.telemetry');return send(202,jobs.start('Update bounded network metadata',log=>threat.ids.setTelemetry(b.enabled,log)));}
        if(ep==='coraza/test'){await audit('security.coraza.verified');return send(202,jobs.start('Verify Coraza signatures',log=>securityCenter.coraza.test(log)));}
        if(ep==='coraza/policy'){await audit('security.coraza.policy');return send(202,jobs.start('Validate and apply Coraza policy',log=>securityCenter.coraza.policy(b,log)));}
        if(ep==='coraza/exclude-rule'){await audit('security.coraza.exclude_rule');return send(202,jobs.start('Exempt Coraza rule '+b.ruleId+' for '+b.domain,log=>securityCenter.coraza.excludeRule(b,log)));}
        if(ep==='crowdsec/decision'){await audit('security.crowdsec.decision.'+String(b.action).slice(0,20));return send(200,await securityCenter.crowdsec.decision(b));}
       }throw bad('Unknown Security Center operation',404);
      }
      if(url.pathname.startsWith('/api/protection/')){
       admin();const endpoint=url.pathname.slice('/api/protection/'.length);
       if(req.method==='GET'&&endpoint==='status')return send(200,await threat.status());
       if(req.method==='GET'&&endpoint==='logs')return send(200,await threat.web.logs());
       if(req.method==='POST'){
        const b=await body(req);if(b.confirm!==true)throw bad('Review and explicitly confirm this security operation');
        if(endpoint==='credentials')return send(410,{error:'The retired vendor console is no longer used. Manage native protection inside the panel.'});
        if(endpoint==='mode'){if(!['off','monitor','block'].includes(b.mode))throw bad('Choose off, monitor or block');await audit('protection.mode.'+b.mode);return send(202,jobs.start('Protection: '+b.mode,log=>threat.mode(b.mode,b.revision,log)));}
        if(endpoint==='allowlist'){const r=await threat.response.setAllowlist(b.ip,b.action);const updatedList=(await threat.response.status()).allowlist||[];await securityCenter.coraza.syncAllowlist(updatedList).catch(()=>{});await audit('protection.allowlist.changed');return send(200,r);}
        if(endpoint==='unban'){await audit('protection.ip.released');return send(200,await threat.response.unban(b.ip));}
        if(endpoint==='ids-update'){await audit('protection.signatures.updated');return send(202,jobs.start('Update detection signatures',log=>threat.ids.update(log)));}
        if(endpoint==='test'){await audit('protection.test');return send(202,jobs.start('Verify security detection',async log=>{const w=await threat.web.test();log(JSON.stringify(w));if((await threat.ids.status()).active)await threat.ids.test(log);else log('Packet capture is stopped; IDS verification skipped.');}));}
       }
      }
      if(req.method==='GET'&&url.pathname==='/api/metrics')return send(200,await metrics());
      if(req.method==='GET'&&url.pathname==='/api/cloudflare/summary'){const s=await cloudflare.status();return send(200,{installed:s.installed,health:s.health,connections:s.metrics.reduce((n,m)=>n+m.connections,0),verified:s.metrics.length>0});}
      if(url.pathname.startsWith('/api/cloudflare/')){
        admin();const endpoint=url.pathname.slice('/api/cloudflare/'.length);
        if(endpoint.startsWith('dns/')){
          const dnsSub=endpoint.slice('dns/'.length);
          if(req.method==='GET'&&dnsSub==='status'){
            const cfg=await cloudflareDns.readConfig();
            const currentIp=await cloudflareDns.detectPublicIp();
            return send(200,{configured:Boolean(cfg.apiToken),defaultProxied:cfg.defaultProxied??true,serverIpv4:currentIp});
          }
          if(req.method==='POST'&&dnsSub==='token'){
            const b=await body(req);
            const token=b.token?.trim();
            if(!token)throw bad('Provide a Cloudflare API token');
            await cloudflareDns.verifyToken(token);
            await cloudflareDns.saveConfig({apiToken:token,defaultProxied:b.defaultProxied??true});
            await audit('cloudflare.dns.token.configured');
            return send(200,{ok:true,verified:true});
          }
          if(req.method==='GET'&&dnsSub==='zones')return send(200,await cloudflareDns.listZones());
          if(req.method==='GET'&&dnsSub==='records'){
            const domain=url.searchParams.get('domain');
            if(!domain)throw bad('Query parameter "domain" required');
            return send(200,await cloudflareDns.listRecords(domain));
          }
          if(req.method==='POST'&&dnsSub==='sync-web'){
            const b=await body(req);
            await audit('cloudflare.dns.web.synced');
            return send(200,await cloudflareDns.syncWebDns(b));
          }
          if(req.method==='POST'&&dnsSub==='setup-email'){
            const b=await body(req);
            await audit('cloudflare.dns.email.setup');
            return send(200,await cloudflareDns.setupEmailDns(b));
          }
          if(req.method==='POST'&&dnsSub==='issue-cert'){
            const b=await body(req);
            await audit('cloudflare.dns.cert.issued');
            return send(200,await cloudflareDns.issueTlsWithDns(b));
          }
        }
        if(req.method==='GET'&&endpoint==='status')return send(200,await cloudflare.status(true));
        if(req.method==='GET'&&endpoint==='config')return send(200,await cloudflare.config(url.searchParams.get('path')));
        if(req.method==='GET'&&endpoint==='logs')return send(200,await cloudflare.logs(url.searchParams.get('id')));
        if(req.method==='GET'&&endpoint==='remote')return send(200,await cloudflare.remote());
        if(req.method==='POST'){const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm the Cloudflare operation');
          if(endpoint==='config'){const result=await cloudflare.saveConfig(b);await audit('cloudflare.config.saved');return send(200,result);}
          if(endpoint==='api'){await audit('cloudflare.api.configured');return send(200,await cloudflare.apiSettings(b));}
          if(endpoint==='remote'){const result=await cloudflare.remote(b.text,b.revision);await audit('cloudflare.remote.saved');return send(200,result);}
          if(['install','connect','service'].includes(endpoint)){await audit('cloudflare.'+endpoint);return send(202,jobs.start('Cloudflare Tunnel '+endpoint,log=>endpoint==='install'?cloudflare.install(log):endpoint==='connect'?cloudflare.connect(b,log):cloudflare.service(b,log)));}
        }
      }
      if(req.method==='GET'&&url.pathname==='/api/docker')return send(200,await dockerSnapshot());
      if(req.method==='GET'&&url.pathname==='/api/docker/listeners'){admin();return send(200,await workspace.listeners());}
      if(req.method==='GET'&&url.pathname==='/api/docker/networks')return send(200,await workspace.networks());
      if(req.method==='GET'&&url.pathname==='/api/docker/container/details'){admin();return send(200,await workspace.details(url.searchParams.get('id')));}
      if(req.method==='GET'&&url.pathname==='/api/docker/container/logs'){admin();return send(200,await workspace.logs(url.searchParams.get('id'),url.searchParams.get('tail')||200));}
      if(url.pathname.startsWith('/api/docker/registries')){admin();const endpoint=url.pathname.slice('/api/docker/registries'.length);if(req.method==='GET'&&!endpoint)return send(200,await registries.list());if(req.method==='POST'){const b=await body(req);if(endpoint==='/preview')return send(200,await registries.preview(b));if(endpoint==='/pull'){if(b.confirm!==true)throw bad('Review and confirm the exact image pull list');await audit('docker.images.pull.requested');return send(202,jobs.start('Pull image batch',log=>registries.pull(b,log)));}const operations={'/save':'save','/remove':'remove','/default':'setDefault','/login':'authenticate','/logout':'logout'},operation=operations[endpoint];if(operation){if(b.confirm!==true)throw bad('Confirm the registry change');if(operation==='authenticate')identity.limitDirectory('registry:'+user.id);const result=await registries[operation](b);await audit('docker.registry.'+operation);return send(200,result);}}}
      if(req.method==='GET'&&url.pathname==='/api/docker/images'){admin();return send(200,await workspace.images());}
      if(req.method==='GET'&&url.pathname==='/api/docker/volumes'){admin();return send(200,await workspace.volumes());}
      if(req.method==='GET'&&url.pathname==='/api/docker/volume/details'){admin();return send(200,await workspace.volumeDetails(url.searchParams.get('name')));}
      if(req.method==='GET'&&url.pathname==='/api/docker/compose/drafts'){admin();return send(200,await workspace.drafts());}
      if(req.method==='GET'&&url.pathname==='/api/docker/compose/draft'){admin();return send(200,await workspace.draftPreview(url.searchParams.get('id')));}
      if(req.method==='POST'&&url.pathname==='/api/docker/compose/prepare'){admin();return send(201,await workspace.prepareCompose(await body(req)));}
      if(req.method==='POST'&&url.pathname==='/api/docker/compose/discard'){admin();const b=await body(req);if(b.confirm!==true)throw bad('Confirm draft removal');const result=await workspace.discardDraft(b.draft);await audit('compose.draft.discarded');return send(200,result);}
      const workspaceJobs={
        '/api/docker/network':['Network operation',(b,log)=>workspace.networkAction(b,log)],
        '/api/docker/image':['Image operation',(b,log)=>workspace.imageAction(b,log)],
        '/api/docker/volume':['Volume operation',(b,log)=>workspace.volumeAction(b,log)],
        '/api/docker/container/configure':['Update container settings',(b,log)=>workspace.configureContainer(b,log)],
        '/api/docker/container/remove':['Remove stopped container',(b,log)=>workspace.removeContainer(b.id,log)],
        '/api/docker/container/exec':['Container command',(b,log)=>workspace.execute(b,log)],
        '/api/docker/container/create':['Create container',(b,log)=>workspace.createContainer(b,log)],
        '/api/docker/project/action':['Compose project operation',(b,log)=>workspace.projectAction(b,log)],
        '/api/docker/compose/deploy':['Deploy Compose project',(b,log)=>workspace.deployCompose(b,log)]
      };
      if(req.method==='POST'&&workspaceJobs[url.pathname]){admin();const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm this Docker operation');const [title,task]=workspaceJobs[url.pathname];await audit('docker.'+url.pathname.split('/').slice(3).join('.'));return send(202,jobs.start(title,log=>task(b,log)));}
      if(req.method==='POST'&&url.pathname==='/api/docker/packages'){admin();const b=await body(req);if(!['install','update'].includes(b.action))throw bad('Invalid package operation');await audit('docker.packages.'+b.action);return send(202,jobs.start('Docker '+b.action,log=>dockerPackages(b.action,log)));}
      if(req.method==='POST'&&url.pathname==='/api/docker/action'){const b=await body(req);await audit('container.'+b.action);return send(200,{output:await containerAction(b.id,b.action)});}
      if(req.method==='GET'&&url.pathname==='/api/docker/disk-usage'){admin();return send(200,await dockerMaintenance.diskUsage());}
      if(req.method==='POST'&&url.pathname==='/api/docker/cleanup'){admin();const b=await body(req);cleanupCommand(b.kind,b.olderThan);if(b.confirm!==true)throw bad('Confirm the cleanup scope before starting');await audit('docker.cleanup.'+b.kind);return send(202,jobs.start('Docker cleanup: '+b.kind,log=>dockerMaintenance.cleanup(b,log)));}
      if(req.method==='POST'&&url.pathname==='/api/compose/update/preview'){admin();const b=await body(req);return send(200,await dockerMaintenance.preview(b.project));}
      if(req.method==='POST'&&url.pathname==='/api/compose/update'){admin();const b=await body(req);if(!['pull','build',undefined].includes(b.mode)||typeof b.project!=='string'||!/^[a-z0-9][a-z0-9_-]{0,100}$/.test(b.project)||b.confirm!==true||typeof b.revision!=='string'||!/^[a-f0-9]{64}$/.test(b.revision))throw bad('Review and confirm the Compose update first');await audit('compose.project.update.requested');return send(202,jobs.start('Update Compose project: '+String(b.project).slice(0,100),log=>dockerMaintenance.update(b.project,b.revision,log,b.mode||'pull')));}
      if(req.method==='GET'&&url.pathname==='/api/jobs'){admin();const id=url.searchParams.get('id');if(!process.env.PANEL_AGENT_SOCKET)return send(200,id?jobs.get(id):jobs.list());
        if(id){try{return send(200,jobs.get(id));}catch(e){if(e.status!==404)throw e;}const agent=await operationClientFromEnvironment({actor:auditActor});const job=await agent('GET','/job?id='+encodeURIComponent(id));const tail=Math.max(0,job.logBytes-48000),chunk=await agent('GET','/logs?id='+encodeURIComponent(id)+'&offset='+tail);return send(200,{...job,title:job.title||'Privileged operation',source:'agent',output:Buffer.from(chunk.data,'base64').toString('utf8')});}
        const local=jobs.list();try{const agent=await operationClientFromEnvironment({actor:auditActor}),remote=await agent('GET','/jobs');const combined=[...local.jobs,...remote.jobs.map(j=>({...j,title:j.title||'Privileged operation',source:'agent',outputAvailable:j.logBytes>0}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return send(200,{...local,agentConfigured:true,jobs:combined,active:combined.filter(j=>['queued','running'].includes(j.state)).length});}catch(e){return send(200,{...local,agentConfigured:true,agentError:e.message});}
      }
      if(url.pathname==='/api/compose'){admin();const file=await composeFile(url.searchParams.get('file'));if(req.method==='GET')return send(200,{file,...await readText(file)});if(req.method==='POST'){const b=await body(req);const result=await saveText(file,b.text,b.revision);await audit('compose.file.saved');return send(200,result);}}
      if(req.method==='POST'&&url.pathname==='/api/terminal/session'){admin();return send(201,interactiveTerminal.ticket(supplied));}
      if(url.pathname.startsWith('/api/websites')){
        admin();const endpoint=url.pathname.slice('/api/websites'.length),id=url.searchParams.get('id');const isExisting=v=>typeof v==='string'&&/^[a-f0-9]{16}$/.test(v);const siteService=isExisting(id)?websites.existing:websites;
        if(req.method==='GET'&&endpoint==='')return send(200,await websites.inventory(true));
        if(req.method==='GET'&&endpoint==='/details')return send(200,await siteService.details(id));
        if(req.method==='GET'&&endpoint==='/logs')return send(200,await siteService.logs(id,url.searchParams.get('kind')||'runtime'));
        if(req.method==='GET'&&endpoint==='/trash')return send(200,await (await siteService.files(id)).trash());
        if(req.method==='GET'&&endpoint==='/files')return send(200,await (await siteService.files(id)).listing(url.searchParams.get('path')||'.'));
        if(req.method==='GET'&&endpoint==='/backups')return send(200,isExisting(id)?await websites.existing.history(id,'file',url.searchParams.get('path')):await websites.backups(id,url.searchParams.get('path')));
        if(req.method==='GET'&&endpoint==='/existing/history')return send(200,await websites.existing.history(id,'config'));
        if(req.method==='GET'&&endpoint==='/file')return send(200,await siteService.readFile(id,url.searchParams.get('path')));
        if(req.method==='GET'&&endpoint==='/download'){await (await siteService.files(id)).download(url.searchParams.get('path')||'.',res);return;}
        if(req.method==='POST'&&endpoint==='/upload'){const fm=await siteService.files(id);const name=url.searchParams.get('name'),relative=url.searchParams.get('path')||'.';const result=await fm.upload(req,relative,name);await audit('website.file.uploaded');return send(201,result);}
        if(req.method==='POST'){const b=await body(req);
          if(endpoint==='/file'){const result=await (isExisting(b.id)?websites.existing:websites).saveFile(b.id,b);await audit('website.file.saved');return send(200,result);}
          if(endpoint==='/files'){const result=await (await (isExisting(b.id)?websites.existing:websites).files(b.id)).mutate(b.action==='restore'?{...b,id:b.idToRestore}:b);await audit('website.file.'+b.action);return send(200,result);}
          if(b.confirm!==true)throw bad('Review and confirm the website operation');
          if(endpoint==='/existing/settings'){let result=await websites.existing.settings(b.id,b);if(panelUpstream(b.upstream,server.address()?.port||port))result=await synchronizePanelWebsite(b.id,result);await audit('website.existing.settings.saved');return send(200,result);}
          if(endpoint==='/existing/files/prepare'){const result=await websites.existing.prepareFiles(b.id,b);await audit('website.existing.files.prepared');return send(200,result);}
          if(endpoint==='/existing/files/activate'){const result=await websites.existing.activateFiles(b.id,b);await audit('website.existing.files.activated');return send(200,result);}
          if(endpoint==='/existing/certificate'){const result=await websites.existing.certificate(b.id,b);await audit('website.existing.certificate.saved');return send(200,result);}
          if(endpoint==='/existing/config'){const result=await websites.existing.changeConfig(b.id,b);await audit('website.existing.configuration.saved');return send(200,result);}
          if(endpoint==='/existing/action'){const result=await websites.existing.lifecycle(b.id,b);await audit('website.existing.'+b.action);return send(200,result);}
          if(endpoint==='/existing/restore'){const result=await websites.existing.restore(b.id,b.backup,b.revision);await audit('website.existing.configuration.restored');return send(200,result);}
          if(endpoint==='/create'){const result=await websites.create(b);await audit('website.created');return send(201,result);}
          if(endpoint==='/settings'){const result=await websites.settings(b.id,b);await audit('website.settings.saved');return send(200,result);}
          if(endpoint==='/certificate'){const result=await websites.certificate(b.id,b);await audit('website.certificate.saved');return send(200,result);}
          if(endpoint==='/backup/restore'){const result=await (isExisting(b.id)?websites.existing.restore(b.id,b.backup):websites.restoreBackup(b.id,b.backup));await audit('website.backup.restored');return send(200,result);}
          if(endpoint==='/restore'){const result=await websites.restore(b.id);await audit('website.restored');return send(200,result);}
          if(endpoint==='/quick-proxy'){let result=await websites.quickProxy(b);if(panelUpstream(result.upstream,server.address()?.port||port))result=await synchronizePanelWebsite(result.id,result);await audit('website.quick-proxy');return send(200,result);}
          if(endpoint==='/import'){let result=await websites.importSite(b);if(panelUpstream(result.upstream,server.address()?.port||port))result=await synchronizePanelWebsite(result.id,result);await audit('website.import');return send(200,result);}
          const operations={restart:log=>websites.restart(b.id,log),cleanup:log=>websites.cleanupDependencies(b.id,log),runtime:log=>websites.installRuntime(b.runtime,log),publish:async log=>{const result=await websites.publish(b.id,log);return synchronizePanelWebsite(b.id,result,log);},stop:log=>websites.stop(b.id,log),archive:log=>websites.stop(b.id,log,true),dependencies:log=>websites.dependencies(b.id,log)};
          const key=endpoint.slice(1);if(operations[key]){await audit('website.'+key);return send(202,jobs.start('Website '+key,operations[key]));}
        }
      }
      if(url.pathname==='/api/apps/catalog'||url.pathname.startsWith('/api/apps/')){admin();
        if(url.pathname==='/api/apps/catalog'){const id=url.searchParams.get('id');if(id)return send(200,await appsCatalog.get(id));return send(200,await appsCatalog.list());}
        if(req.method==='POST'&&url.pathname==='/api/apps/deploy'){const b=await body(req);if(b.confirm!==true)throw bad('Confirm application deployment');await audit('apps.deploy.'+String(b.appId||'app').slice(0,20));return send(202,jobs.start('Deploy App: '+(b.name||b.appId),log=>appsCatalog.deploy(b,log)));}
      }
      if(url.pathname.startsWith('/api/backup/cloud')){admin();const endpoint=url.pathname.slice('/api/backup/cloud'.length);
        if(req.method==='GET'&&endpoint==='/config'){const cfg=await cloudBackup.readConfig();return send(200,{...cfg,secretAccessKey:cfg.secretAccessKey?'********':'',encryptionPassword:cfg.encryptionPassword?'********':''});}
        if(req.method==='POST'&&endpoint==='/config'){const b=await body(req);await audit('backup.cloud.config.saved');return send(200,await cloudBackup.saveConfig(b));}
        if(req.method==='GET'&&endpoint==='/list')return send(200,await cloudBackup.listBackups());
        if(req.method==='POST'&&endpoint==='/run'){const b=await body(req);if(b.confirm!==true)throw bad('Confirm S3 cloud backup execution');await audit('backup.cloud.run');return send(202,jobs.start('Cloud Backup to S3',log=>cloudBackup.runBackup(b,log)));}
      }
      if(url.pathname.startsWith('/api/ssl/acme')){admin();const endpoint=url.pathname.slice('/api/ssl/acme'.length);
        if(req.method==='GET'&&endpoint==='/status')return send(200,await acmeClient.readCertificates());
        if(req.method==='POST'&&endpoint==='/issue'){const b=await body(req);if(b.confirm!==true)throw bad('Confirm ACME SSL certificate issuance');await audit('ssl.acme.issue.'+String(b.domain||'').slice(0,30));return send(202,jobs.start('Issue ACME SSL for '+b.domain,log=>acmeClient.issueCertificate(b,log)));}
      }
      if(url.pathname.startsWith('/api/cron/')){admin();const endpoint=url.pathname.slice('/api/cron/'.length);
        if(req.method==='GET'&&endpoint==='tasks')return send(200,await cronManager.list());
        if(req.method==='POST'){const b=await body(req);
          if(endpoint==='tasks'){if(b.id){const r=await cronManager.update(b.id,b);await audit('cron.task.updated');return send(200,r);}const r=await cronManager.create(b);await audit('cron.task.created');return send(201,r);}
          if(endpoint==='tasks/run'){if(b.confirm!==true)throw bad('Confirm running task');const r=await cronManager.runNow(b.id);await audit('cron.task.run');return send(200,r);}
          if(endpoint==='tasks/delete'){if(b.confirm!==true)throw bad('Confirm deleting task');const r=await cronManager.delete(b.id);await audit('cron.task.deleted');return send(200,r);}
        }
      }
      if(url.pathname.startsWith('/api/notifications/')){admin();const endpoint=url.pathname.slice('/api/notifications/'.length);
        if(req.method==='GET'&&endpoint==='config'){const cfg=await notifications.readConfig();return send(200,{...cfg,telegram:{...cfg.telegram,botToken:cfg.telegram?.botToken?'********':''},discord:{...cfg.discord,webhookUrl:cfg.discord?.webhookUrl?'********':''},slack:{...cfg.slack,webhookUrl:cfg.slack?.webhookUrl?'********':''},smtp:{...cfg.smtp,pass:cfg.smtp?.pass?'********':''}});}
        if(req.method==='POST'&&endpoint==='config'){const b=await body(req);await audit('notifications.config.saved');return send(200,await notifications.saveConfig(b));}
        if(req.method==='POST'&&endpoint==='test'){const b=await body(req);await audit('notifications.test.'+String(b.channel||'').slice(0,20));return send(200,await notifications.testNotification(b.channel));}
      }
      if(req.method==='GET'&&url.pathname==='/api/readiness'){admin();return send(200,await productionReadiness({root,dataDir,identity,publicURL,execute:privileged,automation:await verification.status()}));}
      if(req.method==='POST'&&url.pathname==='/api/readiness/run'){admin();const b=await body(req);if(b.confirm!==true)throw bad('Start verification explicitly');await audit('readiness.automatic.started');return send(202,jobs.start('Automatic production verification',log=>verification.run(log)));}
      if(url.pathname.startsWith('/api/wireguard/')){admin();const endpoint=url.pathname.slice('/api/wireguard/'.length),name=url.searchParams.get('interface');
        if(req.method==='GET'&&endpoint==='status')return send(200,await wireguard.inventory());
        if(req.method==='GET'&&endpoint==='config')return send(200,await wireguard.config(name));
        if(req.method==='POST'){const b=await body(req);if(b.confirm!==true)throw bad('Review and confirm the WireGuard operation');
          if(endpoint==='draft'){const result=await wireguard.save(b.interface,b);await audit('wireguard.draft.saved');return send(200,result);}
          if(endpoint==='action'){await audit('wireguard.action.requested');return send(200,await wireguard.transaction(b.interface,b));}
          if(endpoint==='confirm'){const result=await wireguard.confirm(b.id);await audit('wireguard.change.confirmed');return send(200,result);}
          if(endpoint==='rollback'){const result=await wireguard.rollback(b.id);await audit('wireguard.change.rolled-back');return send(200,result);}
          if(endpoint==='peer'){const result=await wireguard.addPeer(b.interface,b);await audit('wireguard.peer.prepared');return send(200,result);}
          if(endpoint==='download'){const bytes=await wireguard.exportClient(b.id);await audit('wireguard.client.downloaded');res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="wireguard-client.conf"'});return res.end(bytes);}
          if(endpoint==='install'){await audit('wireguard.install.requested');return send(202,jobs.start('Install WireGuard tools',log=>wireguard.install(log)));}
        }
      }
      if(req.method==='GET'&&url.pathname==='/api/firewall'){admin();return send(200,await firewall.status(supplied));}
      if(req.method==='POST'&&url.pathname==='/api/firewall/unlock'){admin();const b=await body(req);identity.limitDirectory(rateKey);const result=await firewall.unlock(supplied,b.password);await audit('firewall.unlocked');return send(200,result);}
      if(req.method==='POST'&&url.pathname==='/api/firewall/lock'){admin();firewall.lock(supplied);return send(200,{locked:true});}
      if(req.method==='POST'&&url.pathname==='/api/firewall'){admin();const b=await body(req);const result=await firewall.change(supplied,b);await audit('firewall.rule.'+b.action);return send(200,result);}
      if(req.method==='GET'&&url.pathname==='/api/files/list'){admin();return send(200,await fileManager.listing(url.searchParams.get('path')||'.'));}
      if(req.method==='GET'&&url.pathname==='/api/files/trash'){admin();return send(200,await fileManager.trash());}
      if(req.method==='POST'&&url.pathname==='/api/files/manage'){admin();const b=await body(req);const result=await fileManager.mutate(b);await audit('file.'+b.action);return send(200,result);}
      if(req.method==='POST'&&url.pathname==='/api/files/upload'){admin();const result=await fileManager.upload(req,url.searchParams.get('path')||'.',url.searchParams.get('name'));await audit('file.uploaded');return send(201,result);}
      if(req.method==='GET'&&url.pathname==='/api/files/download'){admin();await fileManager.download(url.searchParams.get('path')||'.',res,url.searchParams.get('inline')==='1');return;}
      if(url.pathname==='/api/files'){admin();const file=await confined(fileRoot,url.searchParams.get('path')||'.');if(req.method==='GET'){const stat=await fs.stat(file);if(stat.isDirectory())return send(200,await fileManager.listing(url.searchParams.get('path')||'.'));return send(200,{directory:false,...await readText(file)});}if(req.method==='POST'){const b=await body(req);const result=await saveText(file,b.text,b.revision);await audit('file.saved');return send(200,result);}}

      if(req.method==='GET'&&url.pathname==='/api/users'){admin();return send(200,identity.list());}
      if(req.method==='POST'&&url.pathname==='/api/users'){admin();const b=await body(req);const u=await identity.create(b);await audit('user.created');return send(201,u);}
      if(req.method==='POST'&&url.pathname==='/api/users/disable'){admin();const b=await body(req);await identity.disable(b.id);await audit('user.disabled');return send(200,{ok:true});}
      if(req.method==='GET' && url.pathname==='/api/system')return send(200,await inventory());
      if(req.method==='GET' && url.pathname==='/api/plan')return send(200,deploymentPlan(await inventory()));
      if(req.method==='GET' && url.pathname==='/api/audit') {admin();return send(200,await auditStore.tail());}
      if(req.method==='POST' && url.pathname==='/api/plan/save') {
        admin();
        if(req.headers['x-panel-intent']!=='save-plan')return send(403,{error:'Explicit operation intent required'});
        const plan=deploymentPlan(await inventory());
        await fs.writeFile(path.join(dataDir,'deployment-plan.json'),JSON.stringify(plan,null,2),{mode:0o600});await audit('deployment.plan.saved');return send(200,{saved:true,plan});
      }
      return send(404,{error:'Unknown operation'});
    }catch(e) {if(e.status!==429)await writeAudit('request.failed',auditActor,{requestId,target:requestedPath,outcome:String(e.status||500)}).catch(()=>{});if(res.headersSent){res.destroy();return;}if(['EACCES','EPERM'].includes(e.code))return send(403,{error:'Host permissions deny access to this file or operation. The panel has not elevated its privileges.'});send(e.status||500,{error:e.status?e.message:'Request failed; inspect local service configuration',...(e.transaction?.id?{transactionId:e.transaction.id}:{})});}
  });
  const oauth=await createMCPOAuth({dataDir,identity,origin:()=>publicURL?.origin||`http://127.0.0.1:${server.address()?.port}`,audit:writeAudit});
  const remoteMCP=createMCPHTTP({oauth,origin:()=>publicURL?.origin||`http://127.0.0.1:${server.address()?.port}`,readBody:body,audit:writeAudit,dispatch:async(connection,endpoint,options)=>{const internal=crypto.randomBytes(32).toString('base64url');mcpInternalTokens.set(internal,connection);try{return await fetch(`http://127.0.0.1:${server.address().port}`+endpoint,{...options,redirect:'error',headers:{...options.headers,Authorization:'Bearer '+internal}});}finally{mcpInternalTokens.delete(internal);}}});
  const administrativeHost=hostService||createHostService({root,dataDir,port:port||8787,publicURL});
  const interactiveTerminal=attachTerminal({server,identity,fileRoot,publicURL:()=>publicURL,audit:writeAudit});
  if(automaticVerification&&process.getuid?.()===0&&root.startsWith('/opt/server-panel/'))server.once('listening',()=>{void (async()=>{if(await fs.access(path.join(dataDir,'maintenance.json')).then(()=>true,()=>false))return;const options=await webEngine.readOptions();if(!options.autoInstall)return;const inventory=await websites.inventory(true);if(inventory.engine)return;jobs.start('Automatic web-engine installation',async log=>{const result=await webEngine.install(log);if(publicURL&&!(await webEngine.registeredRoutes()).some(r=>r.domain===publicURL.hostname))await webEngine.recover([{domain:publicURL.hostname,type:'proxy',upstream:`http://127.0.0.1:${server.address().port}`}],log);return result;});})().catch(()=>{});});
  if(automaticVerification)threat.watch?.();
  if(automaticVerification&&process.getuid?.()===0&&root.startsWith('/opt/server-panel/'))server.once('listening',()=>securityCenter.start());
  if(automaticVerification&&process.getuid?.()===0&&root.startsWith('/opt/server-panel/'))server.once('listening',()=>{jobs.start('Apply panel management WAF bypass',()=>synchronizePanelWAF());});
  server.on('close',()=>{firewall.close();verification.close();threat.close?.();});
  if(automaticVerification&&process.getuid?.()===0&&process.env.PANEL_REQUIRE_SETUP==='1'&&root.startsWith('/opt/server-panel/'))server.once('listening',()=>verification.start());
  server.on('clientError',(error,socket)=>{if(!socket.writable||socket.writableEnded)return;const overflow=error.code==='HPE_HEADER_OVERFLOW',status=overflow?431:400,message=overflow?'Browser cookies or request headers exceed the panel limit. Clear site data for this panel domain and sign in again.':'Malformed HTTP request';const bytes=Buffer.from(JSON.stringify({error:message}));socket.end('HTTP/1.1 '+status+' '+(overflow?'Request Header Fields Too Large':'Bad Request')+'\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: '+bytes.length+'\r\n\r\n'+bytes);});
  server.requestTimeout=120000;server.headersTimeout=10000;server.maxHeadersCount=100;
  server.on('close',()=>{jobs.close().catch(()=>{});});
  const closeServer=server.close.bind(server);server.close=callback=>closeServer(()=>{cronManager.stopScheduler();Promise.allSettled([jobs.close(),securityCenter.close(),auditStore.close()]).then(()=>callback?.());});
  return {server,initialCredentials:identity.initialCredentials,port,async shutdown(){interactiveTerminal.closeAll();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const panel=await createPanel({port:Number(process.env.PANEL_PORT || 8787)});
 let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),12000);deadline.unref();panel.shutdown().then(()=>{clearTimeout(deadline);process.exitCode=0;},()=>{clearTimeout(deadline);process.exitCode=1;});});
 panel.server.listen(panel.port,'127.0.0.1',async ()=>{
  console.log(`CP-Panel (by CyberPross): http://127.0.0.1:${panel.server.address().port}/`);
  if(panel.initialCredentials){
    const c=panel.initialCredentials;
    const targetDir=process.env.PANEL_DATA_DIR||'/var/lib/server-panel';
    const credFile=path.join(targetDir,'initial-credentials.txt');
    try{
      await fs.mkdir(targetDir,{recursive:true,mode:0o700});
      await fs.writeFile(credFile,`Administrator: ${c.username}\nTemporary password: ${c.password}\nRecovery code: ${c.recoveryCode}\n`,{mode:0o600,flag:'w'});
      console.log(`FIRST RUN — initial administrator "${c.username}" generated. Credentials saved securely to ${credFile}. Remove after first sign-in.`);
    }catch{
      console.log(`FIRST RUN — initial administrator "${c.username}" generated. Access the panel or run: npm run recover -- admin`);
    }
  }else console.log('Sign in with an existing account. For console recovery: npm run recover -- admin');
 });
}
