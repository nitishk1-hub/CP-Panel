import express from 'express';
import {mcpAuthRouter} from '@modelcontextprotocol/sdk/server/auth/router.js';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {tools,createBridge,toolScope} from './mcp-tools.mjs';
export function createMCPHTTP({oauth,origin,dispatch,readBody,audit=async()=>{}}){
 let router,cachedOrigin,active=0;const limits=new Map();
 const paths=new Set(['/authorize','/token','/register','/revoke','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']);
 const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
 function authRouter(){if(router&&cachedOrigin===origin())return router;const app=express();app.disable('x-powered-by');app.set('trust proxy','loopback');app.use(mcpAuthRouter({provider:oauth.provider,issuerUrl:new URL(origin()),resourceServerUrl:new URL(oauth.resource()),resourceName:'CyberPross Panel',scopesSupported:['read','manage','command']}));app.get('/.well-known/oauth-protected-resource',(_req,res)=>res.json({resource:oauth.resource(),authorization_servers:[origin()+'/'],scopes_supported:['read','manage','command'],bearer_methods_supported:['header']}));app.use((_req,res)=>res.status(404).json({error:'not_found'}));cachedOrigin=origin();router=app;return router;}
 return {matches:path=>paths.has(path)||path==='/mcp',async handle(req,res,url){
  if(paths.has(url.pathname)){await new Promise((resolve,reject)=>{res.once('finish',resolve);res.once('close',resolve);authRouter()(req,res,error=>error?reject(error):resolve());});return;}
  const allowed=new Set([origin(),...await oauth.clientOrigins()]);if(req.headers.origin&&!allowed.has(req.headers.origin))return send(res,403,{error:'Invalid MCP origin'});
  if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','WWW-Authenticate,MCP-Protocol-Version');}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'POST,GET,DELETE,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,Accept,MCP-Protocol-Version,MCP-Session-Id'});res.end();return;}
  const token=/^Bearer (\S+)$/i.exec(req.headers.authorization||'')?.[1],connection=await oauth.resolve(token);
  if(!connection)return send(res,401,{error:'OAuth sign-in required'},{'WWW-Authenticate':`Bearer resource_metadata="${origin()}/.well-known/oauth-protected-resource/mcp", scope="read"`});
  const now=Date.now(),limit=limits.get(connection.credential)||{at:now,count:0};if(now-limit.at>60000){limit.at=now;limit.count=0;}if(limits.size>1000)limits.clear();limits.set(connection.credential,limit);if(++limit.count>120)return send(res,429,{error:'MCP request limit reached'});
  if(!['GET','POST','DELETE'].includes(req.method))return send(res,405,{error:'Method not allowed'},{Allow:'GET,POST,DELETE,OPTIONS'});
  if(req.method!=='POST')return send(res,405,{error:'This stateless MCP endpoint does not offer an SSE stream or server sessions'},{Allow:'POST,OPTIONS'});
  if(active>=4)return send(res,429,{error:'MCP is busy; retry shortly'});
  if(!(req.headers['content-type']||'').includes('application/json'))return send(res,415,{error:'Use application/json'});
  active++;let server,transport;
  try{const body=await readBody(req);await audit('oauth.mcp.request',connection.user.username+' [OAuth:'+connection.credential+']');server=new Server({name:'cyberpross-panel',version:'1.1.0'},{capabilities:{tools:{}}});
   server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:tools.filter(t=>connection.scopes.includes(toolScope(t.name)))}));
   server.setRequestHandler(CallToolRequestSchema,async request=>{if(!connection.scopes.includes(toolScope(request.params.name)))return {isError:true,content:[{type:'text',text:'This connection does not have permission for this tool'}]};const handle=createBridge({origin:'http://127.0.0.1',token:'internal',request:(url,options)=>dispatch(connection,url.pathname+url.search,options)});const r=await handle({jsonrpc:'2.0',id:1,method:'tools/call',params:request.params});return r.result||{isError:true,content:[{type:'text',text:r.error?.message||'Unknown tool'}]};});
   transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});await server.connect(transport);await transport.handleRequest(req,res,body);
  }finally{active--;await transport?.close();await server?.close();}
 }};
}
