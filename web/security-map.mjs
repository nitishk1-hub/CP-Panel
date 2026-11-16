import * as maplibregl from 'maplibre-gl';
maplibregl.setWorkerUrl('/security-map-worker.js');
export function mount(element,locations,onSelect){
 let capable=false;
 try{capable=!!document.createElement('canvas').getContext('webgl2');}catch{}
 if(!capable)return fallback(element,locations,onSelect);
 const dark=document.documentElement.dataset.theme==='dark';
 let validLocations=(locations||[]).filter(v=>Number.isFinite(Number(v.latitude))&&Number.isFinite(Number(v.longitude)));
 const countryCounts={};
 for(const v of locations||[]){
  const code=String(v.country||'').toUpperCase().trim();
  if(code&&code.length===2)countryCounts[code]=(countryCounts[code]||0)+Number(v.count||1);
 }
 const maxThreat=Math.max(1,...Object.values(countryCounts));
 const fillMatch=['match',['get','iso']];
 const borderMatch=['match',['get','iso']];
 const borderWidthMatch=['match',['get','iso']];
 for(const [iso,count]of Object.entries(countryCounts)){
  const r=count/maxThreat;
  const color=r>0.3?'#b91c1c':r>0.1?'#dc2626':r>0.02?'#ea580c':'#0284c7';
  fillMatch.push(iso,color);
  borderMatch.push(iso,'#f87171');
  borderWidthMatch.push(iso,1.6);
 }
 fillMatch.push(dark?'#151f38':'#f8fafc');
 borderMatch.push(dark?'#334155':'#cbd5e1');
 borderWidthMatch.push(0.5);

 const map=new maplibregl.Map({
  container:element,
  transformRequest:(url)=>({url,credentials:'same-origin'}),
  style:{
   version:8,
   sources:{
    world:{type:'vector',tiles:[location.origin+'/api/security-center/tiles/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:5,attribution:'Natural Earth · public domain'},
    events:{
     type:'geojson',
     cluster:true,
     clusterMaxZoom:8,
     clusterRadius:40,
     data:{
      type:'FeatureCollection',
      features:validLocations.map((v,i)=>({
       type:'Feature',
       geometry:{type:'Point',coordinates:[Number(v.longitude),Number(v.latitude)]},
       properties:{index:i,count:v.count,blocked:['blocked','decision'].includes(v.verdict),engine:v.engine,country:v.country,city:v.city||'',source:v.source||'',severity:v.severity}
      }))
     }
    }
   },
   layers:[
    {id:'ocean',type:'background',paint:{'background-color':dark?'#070b14':'#e2e8f0'}},
    {id:'land',type:'fill',source:'world','source-layer':'land',paint:{'fill-color':Object.keys(countryCounts).length?fillMatch:(dark?'#151f38':'#f8fafc'),'fill-opacity':0.88}},
    {id:'country-borders',type:'line',source:'world','source-layer':'land',paint:{'line-color':Object.keys(countryCounts).length?borderMatch:(dark?'#334155':'#cbd5e1'),'line-width':Object.keys(countryCounts).length?borderWidthMatch:0.5}},
    {id:'clusters',type:'circle',source:'events',filter:['has','point_count'],paint:{'circle-color':'#3b82f6','circle-radius':['step',['get','point_count'],14,20,20,100,26],'circle-stroke-width':2,'circle-stroke-color':dark?'#0f172a':'#fff'}},
    {id:'attacks',type:'circle',source:'events',filter:['!', ['has','point_count']],paint:{'circle-color':['case',['get','blocked'],'#ef4444','#f59e0b'],'circle-radius':['interpolate',['linear'],['get','count'],1,6,100,16],'circle-opacity':0.95,'circle-stroke-width':1.8,'circle-stroke-color':dark?'#fff':'#0f172a'}}
   ]
  },
  center:[20,22],
  zoom:1.25,
  maxZoom:9,
  minZoom:0,
  attributionControl:true
 });
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
 map.on('load',()=>{try{map.resize();}catch{}});
 requestAnimationFrame(()=>{try{map.resize();}catch{}});
 setTimeout(()=>{try{map.resize();}catch{}},300);
 setTimeout(()=>{try{map.resize();}catch{}},1000);
 map.on('click','attacks',e=>{const index=e.features?.[0]?.properties?.index;if(index!==undefined)onSelect?.(validLocations[Number(index)]);});
 map.on('click','clusters',async e=>{const f=e.features[0],zoom=await map.getSource('events').getClusterExpansionZoom(f.properties.cluster_id);map.easeTo({center:f.geometry.coordinates,zoom});});
 map.on('click','land',e=>{const iso=e.features?.[0]?.properties?.iso;if(iso&&countryCounts[iso]){const matched=validLocations.find(l=>String(l.country||'').toUpperCase()===iso)||{country:iso,count:countryCounts[iso]};onSelect?.(matched);}});
 map.on('mouseenter','attacks',()=>map.getCanvas().style.cursor='pointer');
 map.on('mouseleave','attacks',()=>map.getCanvas().style.cursor='');
 map.on('mouseenter','land',e=>{const iso=e.features?.[0]?.properties?.iso;if(iso&&countryCounts[iso])map.getCanvas().style.cursor='pointer';});
 map.on('mouseleave','land',()=>map.getCanvas().style.cursor='');
 let fallbackActive=false;
 map.on('error',e=>{
  const msg=String(e?.error?.message||e?.message||'');
  if(/webgl|context lost|out of memory/i.test(msg)&&!fallbackActive){
   fallbackActive=true;
   element.dataset.mapError='Map rendering unavailable';
   try{map.remove();}catch{}
   fallback(element,validLocations,onSelect);
  }
 });
 const update=(newLocations)=>{
  validLocations=(newLocations||[]).filter(v=>Number.isFinite(Number(v.latitude))&&Number.isFinite(Number(v.longitude)));
  const src=map.getSource('events');
  if(src&&src.setData){
   src.setData({
    type:'FeatureCollection',
    features:validLocations.map((v,i)=>({
     type:'Feature',
     geometry:{type:'Point',coordinates:[Number(v.longitude),Number(v.latitude)]},
     properties:{index:i,count:v.count,blocked:['blocked','decision'].includes(v.verdict),engine:v.engine,country:v.country,city:v.city||'',source:v.source||'',severity:v.severity}
    }))
   });
  }
 };
 return {dispose:()=>{try{map.remove();}catch{}},map,update};
}

function fallback(element,locations,onSelect){
 let disposed=false,currentLocs=locations||[];
 const render=(locs)=>{
  fetch('/security-world.svg').then(r=>r.text()).then(svg=>{
   if(disposed||!element.isConnected)return;
   element.innerHTML=svg;
   const totals={};
   for(const v of locs)if(v.country)totals[v.country]=(totals[v.country]||0)+Number(v.count||0);
   const max=Math.max(1,...Object.values(totals));
   for(const shape of element.querySelectorAll('[data-country]')){
    const country=shape.dataset.country,n=totals[country]||0;
    shape.setAttribute('class','heat-'+(n?Math.max(1,Math.ceil(n/max*5)):0));
    shape.querySelector('title').textContent=country+': '+n+' retained events';
    if(n)shape.onclick=()=>onSelect?.({country});
   }
   const note=document.createElement('p');
   note.className='field-help';
   note.textContent='Country view: this browser does not provide WebGL2. Interactive vector maps are available in browsers with WebGL2.';
   element.append(note);
  });
 };
 element.classList.add('threat-world-map');
 render(currentLocs);
 return {dispose(){disposed=true;},update(newLocs){currentLocs=newLocs||[];render(currentLocs);}};
}
