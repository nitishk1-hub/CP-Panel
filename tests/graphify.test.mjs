import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGraphifyBridge} from '../src/graphify-bridge.mjs';

test('Graphify bridge expands vocabulary, traverses subgraphs within token budget, finds paths, and builds compact server digest',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'graphify-bridge-'));
 t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'graph.json'),JSON.stringify({
  nodes:[
   {id:'n1',label:'createPanel()',source_file:'src/server.mjs',source_location:'L40',community:0},
   {id:'n2',label:'createPrivilegedAgent()',source_file:'src/privileged-agent.mjs',source_location:'L23',community:1},
   {id:'n3',label:'createTransactions()',source_file:'src/transactions.mjs',source_location:'L3',community:1}
  ],
  links:[
   {source:'n1',target:'n2',relation:'calls',confidence:'EXTRACTED'},
   {source:'n2',target:'n3',relation:'calls',confidence:'EXTRACTED'}
  ]
 }));
 await fs.writeFile(path.join(dir,'GRAPH_REPORT.md'),'# Graph Report\n## God Nodes\n1. createPanel()\n');

 const bridge=createGraphifyBridge({
  roots:[dir],
  getDigestContext:async()=>({host:{hostname:'test-host',cpuPercent:4.2},grafana:{active:true,pollMode:'low-load'}})
 });

 const st=await bridge.status();
 assert.equal(st.available,true);
 assert.equal(st.nodes,3);
 assert.equal(st.edges,2);

 const q=await bridge.query({query:'how does privileged agent call transactions',budget:500});
 assert(q.matchedNodes>=2);
 assert.match(q.output,/createPrivilegedAgent/);
 assert.match(q.output,/createTransactions/);

 const exp=await bridge.explain({node:'createPrivilegedAgent'});
 assert.equal(exp.found,true);
 assert.equal(exp.degree,2);

 const p=await bridge.shortestPath({from:'createPanel',to:'createTransactions'});
 assert.equal(p.found,true);
 assert.equal(p.hops,2);

 const d=await bridge.digest();
 assert.equal(d.tokenOptimized,true);
 assert.equal(d.host.hostname,'test-host');
 assert.equal(d.knowledgeGraph.nodes,3);
});
