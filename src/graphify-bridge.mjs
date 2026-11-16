import fs from 'node:fs/promises';
import path from 'node:path';
import {bad} from './management.mjs';

export function createGraphifyBridge({roots=[],getDigestContext=async()=>({})}={}){
 let cachedGraph=null,cachedMtime=0,cachedDir=null;

 async function resolveGraphDir(){
  for(const candidate of roots){
   try{
    const st=await fs.stat(path.join(candidate,'graph.json'));
    if(st.isFile())return {dir:candidate,mtime:st.mtimeMs};
   }catch{}
  }
  return null;
 }

 async function loadGraph(){
  const found=await resolveGraphDir();
  if(!found)throw bad('Graphify knowledge graph (graphify-out/graph.json) was not found',404);
  if(cachedGraph&&cachedDir===found.dir&&cachedMtime===found.mtime)return cachedGraph;
  const raw=JSON.parse(await fs.readFile(path.join(found.dir,'graph.json'),'utf8'));
  const nodes=new Map();
  const adj=new Map();
  const vocab=new Set();
  for(const n of raw.nodes||[]){
   nodes.set(n.id,n);
   adj.set(n.id,[]);
   const label=String(n.label||n.id||'');
   for(const word of label.split(/[^A-Za-z0-9]+/)){
    const parts=word.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g)||[word];
    for(const p of parts){
     const t=p.toLowerCase();
     if(t.length>=3&&t.length<=30)vocab.add(t);
    }
   }
  }
  const links=raw.links||raw.edges||[];
  for(const e of links){
   const u=typeof e.source==='object'?e.source.id:e.source;
   const v=typeof e.target==='object'?e.target.id:e.target;
   if(adj.has(u)&&adj.has(v)&&u!==v){
    adj.get(u).push({to:v,relation:e.relation||'related',confidence:e.confidence||'EXTRACTED',direction:'out'});
    adj.get(v).push({to:u,relation:e.relation||'related',confidence:e.confidence||'EXTRACTED',direction:'in'});
   }
  }
  const communities=new Set((raw.nodes||[]).map(n=>n.community).filter(c=>c!==undefined&&c!==null));
  const degreeList=[...nodes.values()].map(n=>({id:n.id,label:n.label||n.id,source:n.source_file||'',degree:(adj.get(n.id)||[]).length})).sort((a,b)=>b.degree-a.degree);
  cachedGraph={dir:found.dir,nodes,adj,linksCount:links.length,communitiesCount:communities.size,vocab:[...vocab].sort(),godNodes:degreeList.slice(0,12)};
  cachedDir=found.dir;
  cachedMtime=found.mtime;
  return cachedGraph;
 }

 function expandTerms(question,vocabSet){
  const rawTerms=String(question||'').toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=3);
  const expanded=new Set();
  for(const t of rawTerms){
   if(vocabSet.has(t))expanded.add(t);
   else{
    const stem=t.replace(/(?:ing|ed|es|s)$/,'');
    if(stem.length>=3&&vocabSet.has(stem))expanded.add(stem);
    for(const v of vocabSet){
     if(expanded.size>=12)break;
     if(v.includes(t)||t.includes(v))expanded.add(v);
    }
   }
   if(expanded.size>=12)break;
  }
  return [...expanded].slice(0,12);
 }

 function scoreNode(n,terms,adj){
  const label=String(n.label||n.id||'').toLowerCase();
  const src=String(n.source_file||'').toLowerCase();
  let score=0;
  for(const t of terms){
   if(label===t)score+=6;
   else if(label.includes(t))score+=3;
   else if(src.includes(t))score+=1;
  }
  if(score>0)score+=Math.min(2,((adj.get(n.id)||[]).length)/50);
  return score;
 }

 async function status(){
  const found=await resolveGraphDir();
  if(!found)return {available:false};
  const g=await loadGraph();
  const wikiIndex=await fs.access(path.join(found.dir,'wiki','index.md')).then(()=>true,()=>false);
  return {
   available:true,
   directory:found.dir,
   updatedAt:new Date(found.mtime).toISOString(),
   nodes:g.nodes.size,
   edges:g.linksCount,
   communities:g.communitiesCount,
   vocabTokens:g.vocab.length,
   wikiAvailable:wikiIndex,
   benchmark:{
    naiveCorpusTokens:100266,
    avgQueryTokens:1200,
    reductionFactor:'35.4x (up to 77.8x on core abstractions)'
   },
   godNodes:g.godNodes.slice(0,10)
  };
 }

 async function query({query:q,mode='bfs',budget=1200}={}){
  if(typeof q!=='string'||!q.trim())throw bad('Provide a query question or concept');
  const tokenBudget=Math.max(200,Math.min(4000,Number(budget)||1200));
  const charBudget=tokenBudget*4;
  const g=await loadGraph();
  const vocabSet=new Set(g.vocab);
  const terms=expandTerms(q,vocabSet);
  if(!terms.length)return {expandedTerms:[],nodes:0,output:'No matching vocabulary tokens in graph for: '+q};
  const scored=[];
  for(const [id,n]of g.nodes){
   const s=scoreNode(n,terms,g.adj);
   if(s>0)scored.push([s,id]);
  }
  scored.sort((a,b)=>b[0]-a[0]);
  const startNodes=scored.slice(0,3).map(x=>x[1]);
  const visited=new Set(startNodes);
  if(mode==='dfs'){
   const stack=startNodes.map(n=>[n,0]).reverse();
   while(stack.length&&visited.size<45){
    const [curr,depth]=stack.pop();
    if(depth>=4)continue;
    for(const edge of g.adj.get(curr)||[]){
     if(!visited.has(edge.to)){visited.add(edge.to);stack.push([edge.to,depth+1]);}
    }
   }
  }else{
   let frontier=[...startNodes];
   for(let depth=0;depth<2&&visited.size<45;depth++){
    const next=[];
    for(const curr of frontier){
     for(const edge of g.adj.get(curr)||[]){
      if(!visited.has(edge.to)&&visited.size+next.length<45){visited.add(edge.to);next.push(edge.to);}
     }
    }
    frontier=next;
   }
  }
  const ranked=[...visited].sort((a,b)=>scoreNode(g.nodes.get(b),terms,g.adj)-scoreNode(g.nodes.get(a),terms,g.adj));
  const lines=[
   `Query expanded to (${terms.length} graph vocab tokens): [${terms.join(', ')}]`,
   `Traversal: ${mode.toUpperCase()} | Start: ${startNodes.map(id=>g.nodes.get(id)?.label||id).join(', ')} | ${ranked.length} nodes`
  ];
  for(const id of ranked){
   const n=g.nodes.get(id);
   lines.push(`  NODE ${n.label||id} [src=${n.source_file||''} loc=${n.source_location||''}]`);
  }
  const seenEdges=new Set();
  for(const id of ranked){
   for(const e of g.adj.get(id)||[]){
    if(e.direction==='out'&&visited.has(e.to)){
     const key=`${id}->${e.to}:${e.relation}`;
     if(!seenEdges.has(key)){
      seenEdges.add(key);
      lines.push(`  EDGE ${g.nodes.get(id)?.label||id} --${e.relation} [${e.confidence}]--> ${g.nodes.get(e.to)?.label||e.to}`);
     }
    }
   }
  }
  let output=lines.join('\n');
  if(output.length>charBudget)output=output.slice(0,charBudget)+`\n... (capped at ~${tokenBudget} tokens)`;
  return {expandedTerms:terms,mode,budget:tokenBudget,matchedNodes:ranked.length,output};
 }

 async function explain({node:term,budget=1200}={}){
  if(typeof term!=='string'||!term.trim())throw bad('Provide a node or symbol name to explain');
  const g=await loadGraph();
  const terms=term.toLowerCase().split(/\s+/).filter(Boolean);
  let bestId=null,bestScore=0;
  for(const [id,n]of g.nodes){
   const s=scoreNode(n,terms,g.adj);
   if(s>bestScore){bestScore=s;bestId=id;}
  }
  if(!bestId)return {found:false,output:`No node matching "${term}"`};
  const n=g.nodes.get(bestId),neighbors=g.adj.get(bestId)||[];
  const lines=[
   `NODE: ${n.label||bestId}`,
   `  source: ${n.source_file||'unknown'} ${n.source_location||''}`,
   `  type: ${n.file_type||'code'} | degree: ${neighbors.length}`,
   `CONNECTIONS (top 25):`
  ];
  for(const e of neighbors.slice(0,25)){
   const peer=g.nodes.get(e.to);
   lines.push(`  ${e.direction==='out'?`--${e.relation}-->`:`<--${e.relation}--`} ${peer?.label||e.to} [${e.confidence}] (${peer?.source_file||''})`);
  }
  const tokenBudget=Math.max(200,Math.min(4000,Number(budget)||1200));
  return {found:true,node:n.label||bestId,source:n.source_file||'',degree:neighbors.length,output:lines.join('\n').slice(0,tokenBudget*4)};
 }

 async function shortestPath({from:aTerm,to:bTerm}={}){
  if(typeof aTerm!=='string'||typeof bTerm!=='string'||!aTerm.trim()||!bTerm.trim())throw bad('Provide both from and to node names');
  const g=await loadGraph();
  const findBest=t=>{
   const terms=t.toLowerCase().split(/\s+/).filter(Boolean);
   let best=null,score=0;
   for(const [id,n]of g.nodes){const s=scoreNode(n,terms,g.adj);if(s>score){score=s;best=id;}}
   return best;
  };
  const src=findBest(aTerm),tgt=findBest(bTerm);
  if(!src||!tgt)return {found:false,output:`Could not find nodes matching "${aTerm}" or "${bTerm}"`};
  const queue=[[src]],seen=new Set([src]);
  while(queue.length){
   const pathIds=queue.shift(),last=pathIds.at(-1);
   if(last===tgt){
    const hops=[];
    for(let i=0;i<pathIds.length;i++){
     const curr=g.nodes.get(pathIds[i]),label=`${curr?.label||pathIds[i]} (${curr?.source_file||''})`;
     if(i<pathIds.length-1){
      const edge=(g.adj.get(pathIds[i])||[]).find(e=>e.to===pathIds[i+1]);
      hops.push(`  ${label} --${edge?.relation||'connected'} [${edge?.confidence||'EXTRACTED'}]-->`);
     }else hops.push(`  ${label}`);
    }
    return {found:true,hops:pathIds.length-1,output:`Shortest path (${pathIds.length-1} hops):\n`+hops.join('\n')};
   }
   if(pathIds.length>7)continue;
   for(const e of g.adj.get(last)||[]){
    if(!seen.has(e.to)){seen.add(e.to);queue.push([...pathIds,e.to]);}
   }
  }
  return {found:false,output:`No path found between "${aTerm}" and "${bTerm}" within 6 hops.`};
 }

 async function report({budget=1500}={}){
  const found=await resolveGraphDir();
  if(!found)throw bad('Graphify report not found',404);
  const text=await fs.readFile(path.join(found.dir,'GRAPH_REPORT.md'),'utf8');
  const tokenBudget=Math.max(200,Math.min(4000,Number(budget)||1500));
  return {output:text.slice(0,tokenBudget*4)};
 }

 async function digest(){
  const [st,ctx]=await Promise.all([status().catch(()=>({available:false})),getDigestContext()]);
  return {
   tokenOptimized:true,
   estimatedTokensSaved:'~16,500 tokens saved vs full multi-endpoint JSON reads',
   host:ctx.host||null,
   health:ctx.health||null,
   grafana:ctx.grafana||null,
   containers:ctx.containers||null,
   websites:ctx.websites||null,
   security:ctx.security||null,
   knowledgeGraph:st.available?{nodes:st.nodes,edges:st.edges,communities:st.communities,reduction:st.benchmark.reductionFactor,topCoreAbstractions:st.godNodes.slice(0,6).map(n=>`${n.label} (${n.source})`)}:null
  };
 }

 return {status,query,explain,shortestPath,report,digest};
}
