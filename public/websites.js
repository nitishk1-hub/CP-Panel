let websitesInventory=null,websiteCategory='all',websiteTab='sites',websiteCurrent=null,websiteEditor=null,websiteDirty=false,websiteFolder='.',websiteFile=null,websiteRevision=null;
function canLeaveWebsite(){if(websiteDirty&&!window.confirm('Discard unsaved website changes?'))return false;websiteDirty=false;return true;}
function disposeWebsiteEditor(){websiteEditor?.dispose();websiteEditor=null;websiteFile=null;websiteDirty=false;}
function initializeSidebar(){try{if(localStorage.getItem('panel-sidebar-hidden')==='yes')document.body.classList.add('sidebar-collapsed');}catch{}updateSidebarControl();window.addEventListener('resize',updateSidebarControl);}
function updateSidebarControl(){const mobile=matchMedia('(max-width:700px)').matches,expanded=mobile?document.body.classList.contains('nav-open'):!document.body.classList.contains('sidebar-collapsed');document.body.classList.toggle('nav-compact',!expanded);const sidebar=$('#sidebar');if(sidebar){sidebar.inert=false;sidebar.removeAttribute('aria-hidden');}const b=$('#mobile-menu');if(b){b.setAttribute('aria-expanded',String(expanded));b.setAttribute('aria-controls','sidebar');b.setAttribute('aria-label',expanded?'Collapse navigation':'Expand navigation');b.title=expanded?'Collapse navigation':'Expand navigation';}}
function toggleSidebar(){if(matchMedia('(max-width:700px)').matches)document.body.classList.toggle('nav-open');else{const hidden=document.body.classList.toggle('sidebar-collapsed');try{localStorage.setItem('panel-sidebar-hidden',hidden?'yes':'no');}catch{}}updateSidebarControl();}
const websiteType=t=>({static:'Static',node:'Node.js',python:'Python',php:'PHP',proxy:'Reverse proxy'}[t]||t);
const websiteState=s=>s.archived?pill('Archived'):s.state==='published'?pill(['static','proxy'].includes(s.type)?'Published':s.runtimeState==='running'?'Running':s.runtimeState||'Published',['static','proxy'].includes(s.type)||s.runtimeState==='running'?'green':'amber'):pill(s.state==='draft'?'Draft':'Stopped');

function websiteNavTabs(){
  const current=websiteTab!=='sites'?websiteTab:websiteCategory;
  return `<div class="tabs website-tabs" role="tablist" aria-label="Website categories & runtimes">
    <button class="tab ${current==='all'?'active':''}" data-website-subtab="all" data-website-mode="sites" type="button" role="tab" aria-selected="${current==='all'}">${icon('globe')} All websites</button>
    <button class="tab ${current==='proxy'?'active':''}" data-website-subtab="proxy" data-website-mode="sites" type="button" role="tab" aria-selected="${current==='proxy'}">${icon('network')} Reverse proxy</button>
    <button class="tab ${current==='static'?'active':''}" data-website-subtab="static" data-website-mode="sites" type="button" role="tab" aria-selected="${current==='static'}">${icon('globe')} Static websites</button>
    <button class="tab ${current==='node'?'active':''}" data-website-subtab="node" data-website-mode="sites" type="button" role="tab" aria-selected="${current==='node'}">${icon('file')} Node.js</button>
    <button class="tab ${current==='php'?'active':''}" data-website-subtab="php" data-website-mode="sites" type="button" role="tab" aria-selected="${current==='php'}">${icon('file')} PHP</button>
    <button class="tab ${current==='python'?'active':''}" data-website-subtab="python" data-website-mode="sites" type="button" role="tab" aria-selected="${current==='python'}">${icon('file')} Python</button>
    <button class="tab ${current==='runtimes'?'active':''}" data-website-subtab="runtimes" data-website-mode="runtimes" type="button" role="tab" aria-selected="${current==='runtimes'}">${icon('cpu')} Runtimes</button>
    <button class="tab ${current==='engine'?'active':''}" data-website-subtab="engine" data-website-mode="engine" type="button" role="tab" aria-selected="${current==='engine'}">${icon('server')} Web engine</button>
  </div>`;
}

function bindWebsiteSubnav(){
  $$('[data-website-subtab]').forEach(b=>{
    b.onclick=action(async()=>{
      const mode=b.dataset.websiteMode;
      const sub=b.dataset.websiteSubtab;
      if(mode==='sites'){websiteTab='sites';websiteCategory=sub;}
      else{websiteTab=sub;websiteCategory='all';}
      route('websites');
    });
  });
}

async function websitesPage(id){
  if(me.role!=='admin'){
    content.innerHTML=empty('Administrator access required','Website management requires an administrator account.','lock');
    return;
  }
  websiteCurrent=null;
  const [d,engineStatus]=await Promise.all([api('/api/websites'),api('/api/web-engine')]);
  if(id!==generation)return;
  d.webEngine=engineStatus;
  websitesInventory=d;
  content.innerHTML=`${websiteNavTabs()}<div id="websites-content"></div>`;
  bindWebsiteSubnav();
  if(websiteTab==='runtimes')renderWebsiteRuntimes(d);
  else if(websiteTab==='engine')renderWebEngine(d);
  else renderWebsiteList(d);
}
function renderWebsiteList(d){const target=$('#websites-content');const managed=d.sites;target.innerHTML=`${!d.canManage?notice('Website changes require the administrator service. Complete setup under System.','warning'):''}${!d.engine?`<div class="access-notice"><div><strong>Web engine not installed</strong><p>Install native Nginx automatically, or review the package plan and recovery settings first. Existing applications are retained.</p></div>${button('website-engine-setup','Set up web engine','plus','primary')}</div>`:''}<div class="system-status-strip"><div><span>Web engine</span><strong>${d.engine?'OpenResty / Nginx':'Not installed'}</strong></div><div><span>Total sites</span><strong>${managed.filter(s=>!s.archived).length+d.external.length}</strong></div><div><span>Enabled routes</span><strong>${managed.filter(s=>!s.archived&&s.state==='published').length+d.external.filter(s=>s.enabled!==false).length}</strong></div><div><span>Application runtimes</span><strong>${['node','python','php'].filter(t=>d.runtimes[t]?.installed).length} installed · optional</strong></div></div><div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>Configured virtual hosts &amp; routes</h2></div><div class="table-toolbar-actions"><input id="website-search" class="table-filter" type="search" aria-label="Filter websites" placeholder="Filter domains…"><select id="website-filter" class="filters-select" aria-label="Website filter"><option value="all">All websites</option><option value="panel">Panel managed</option><option value="existing">Existing</option><option value="archived">Archived</option></select>${button('website-create','Create website','plus','primary')}</div></div><div class="table-wrap"><table class="management-table"><thead><tr><th>WEBSITE / DOMAINS</th><th>TYPE</th><th>STATUS</th><th>ORIGIN TRANSPORT</th><th class="actions-column">ACTIONS</th></tr></thead><tbody id="website-rows"></tbody></table></div><div class="table-footer"><span id="website-count"></span><span>${d.engine?'Reusing '+esc(d.engine.name):'No compatible web engine detected'}</span></div></div>`;$('#website-create').disabled=!d.engine||!d.canManage;bind('website-create',createWebsiteDialog);bind('website-engine-setup',async()=>{websiteTab='engine';await websitesPage(generation);});$('#website-search').oninput=draw;$('#website-filter').onchange=draw;
 function draw(){const filter=$('#website-filter').value,q=$('#website-search').value.toLowerCase();let rows=[...managed,...d.external];rows=rows.filter(s=>{if(websiteCategory==='all')return true;if(websiteCategory==='python')return s.isAlgo||(s.type||'').toLowerCase().includes('python')||(s.displayType||'').toLowerCase().includes('python')||(s.domains||[]).some(d=>d.includes('algo'));if(websiteCategory==='node')return (s.domains||[]).some(d=>d.includes('cyber.'))||(s.type||'').toLowerCase().includes('node')||(s.displayType||'').toLowerCase().includes('node');if(websiteCategory==='proxy')return s.type==='Reverse proxy'||s.isAlgo||(s.upstreams&&s.upstreams.length)||(s.type||'').includes('Hybrid');if(websiteCategory==='static')return s.type==='Static'||s.type==='static';if(websiteCategory==='php')return (s.type||'').toLowerCase().includes('php');return (s.managed?s.type:({'Static':'static','PHP':'php','Reverse proxy':'proxy'}[s.type]||'proxy'))===websiteCategory;});rows=rows.filter(s=>(filter==='archived'?s.archived:!s.archived)&&(filter!=='panel'||s.managed)&&(filter!=='existing'||!s.managed)&&s.domains.join(' ').toLowerCase().includes(q));$('#website-rows').innerHTML=rows.map((s,i)=>`<tr><td><div class="table-name"><span class="table-icon">${icon('globe')}</span><span><strong>${esc(s.domains[0])}</strong><small>${esc(s.domains.slice(1).join(', ')|| (s.managed?'Panel managed':(s.isAlgo||s.domains[0].includes('algo'))?'Native: openalgo.service':'Managed by existing configuration'))}</small></span></div></td><td>${esc(s.managed?websiteType(s.type):(s.displayType||s.type))}</td><td>${s.managed?websiteState(s):pill(s.enabled===false?'Disabled':(s.isAlgo||s.domains[0].includes('algo'))?'Running (Service)':'Enabled',s.enabled===false?'':'green')}${s.pending&&s.state==='published'?'<small>Unpublished changes</small>':''}</td><td>${pill(s.tls?'HTTPS':d.engine?.listenAddresses?'Local HTTP':'HTTP',s.tls?'green':'')}</td><td class="actions-column"><button class="button secondary small website-manage" data-index="${i}">Manage</button></td></tr>`).join('')||`<tr><td colspan="5">${empty('No websites here',d.engine?'Create a website, upload your code, then publish it.':'Install or configure OpenResty / Nginx to host websites.','globe')}</td></tr>`;$('#website-count').textContent=rows.length+' websites';$$('.website-manage').forEach(b=>b.onclick=action(()=>{const s=rows[Number(b.dataset.index)];return openWebsite(s.id);;}));}draw();}
function renderWebsiteRuntimes(d){$('#websites-content').innerHTML=`<div class="card management-card"><div class="toolbar"><div><h2>Website Sandbox Runtimes</h2><p class="field-help">Hosted client websites execute inside unprivileged rootless Docker containers for security isolation, distinct from the host panel Node.js runtime.</p></div>${pill(d.docker?'Docker available':'Docker not installed',d.docker?'green':'amber')}</div><div class="table-wrap"><table class="management-table"><thead><tr><th>RUNTIME</th><th>HOST ENVIRONMENT</th><th>WEBSITE SANDBOX</th><th>CONTAINER IMAGE</th><th class="actions-column">ACTION</th></tr></thead><tbody>${Object.entries(d.runtimes).map(([id,r])=>`<tr><td><strong>${esc(r.name)}</strong>${id==='composer'?'<small>Optional PHP dependency manager</small>':''}</td><td>${esc(d.host[id==='python'?'python3':id]||'Not installed on host')}</td><td>${pill(r.installed?'Sandbox ready':'Not pulled',r.installed?'green':'amber')}</td><td><code>${esc(r.image)}</code>${r.digest?`<small title="${esc(r.digest)}">Digest pinned when publishing</small>`:''}</td><td class="actions-column"><button class="button secondary small website-runtime-install" data-runtime="${id}" ${!d.docker||!d.canManage?'disabled':''}>${r.installed?'Pull update':'Pull sandbox'}</button></td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Websites run inside isolated unprivileged containers. Existing sites keep their image until republished.</span></div></div>`;$$('.website-runtime-install').forEach(b=>b.onclick=action(async()=>{const r=d.runtimes[b.dataset.runtime];if(await confirmOperation('Install '+r.name+'?',`Pull ${r.image} from its official Docker repository. Existing websites will keep running unchanged.`,'Install runtime'))watch(await post('/api/websites/runtime',{runtime:b.dataset.runtime,confirm:true}),null,()=>websitesPage(generation));}));}
function createWebsiteDialog(){const d=websitesInventory;openModal('Create website',`<form id="website-create-form" class="modal-body"><div class="form-grid"><label>Website type<select id="website-type" aria-label="Website type"><option value="static">Static HTML / CSS / JavaScript</option><option value="node">Node.js</option><option value="python">Python</option><option value="php">PHP</option><option value="proxy">Reverse proxy</option></select></label><label>HTTP port<input id="website-port" type="number" min="1" max="65535" value="80" required></label><label class="span-2">Domains<textarea id="website-domains" rows="3" placeholder="example.com&#10;www.example.com" required></textarea></label></div><label id="website-upstream-field" hidden>Upstream address<input id="website-upstream" type="url" placeholder="http://127.0.0.1:3000"></label><p id="website-runtime-note" class="field-help">Static files use the detected OpenResty installation.</p><p class="field-help">Creates a draft with starter code. Nothing is published until you review the code and click Publish. DNS and Cloudflare hostname routes are configured separately.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Create draft</button></div></form>`);$('#website-type').onchange=()=>{const t=$('#website-type').value;$('#website-upstream-field').hidden=t!=='proxy';$('#website-upstream').required=t==='proxy';$('#website-runtime-note').textContent=t==='proxy'?'Routes through the detected web engine. No runtime installation is required.':t==='static'?'Static files use the detected OpenResty installation.':d.runtimes[t]?.installed?'Isolated '+websiteType(t)+' sandbox container is installed and ready.':'Docker sandbox container for '+websiteType(t)+' ('+esc(d.runtimes[t]?.image||'')+') is not pulled yet. You can create the draft now, then pull the container runtime under Websites → Runtimes before publishing.';};if(websiteCategory!=='all')$('#website-type').value=websiteCategory;$('#website-type').onchange();form('website-create-form',async()=>{const s=await post('/api/websites/create',{type:$('#website-type').value,upstream:$('#website-upstream').value,domains:$('#website-domains').value,listenPort:Number($('#website-port').value),confirm:true});modal.close();await openWebsite(s.id);});}
async function openWebsite(id,tab='overview',extra=null){if(!canLeaveWebsite())return;disposeWebsiteEditor();const s=await api('/api/websites/details?id='+id);websiteCurrent=s;if(s.existing)return existingWebsiteWorkspace(s,tab,extra);const missingRuntime=!['static','proxy'].includes(s.type)&&!websitesInventory?.runtimes[s.type]?.installed;content.innerHTML=`<div class="website-heading"><div><button id="websites-back" class="text-button">${icon('up')}All websites</button><div class="website-heading-name"><h2>${esc(s.domains[0])}</h2>${websiteState(s)}${s.pending?pill('Unpublished changes','amber'):''}</div><p>${esc(websiteType(s.type))}${missingRuntime?' · Website runtime not installed':''} · ${s.domains.length} domain${s.domains.length===1?'':'s'}</p></div><div class="row-actions">${!s.archived&&s.state==='published'?button('website-stop-top','Stop','stop'):''}${!s.archived&&s.state==='published'&&!['static','proxy'].includes(s.type)?button('website-restart-top','Restart','refresh'):''}${s.archived?button('website-restore','Restore',null):missingRuntime?button('website-install-runtime','Install runtime','download','primary'):button('website-publish',s.state==='published'?'Publish changes':'Publish','play','primary')}</div></div><div class="tabs">${[['overview','Overview','overview'],['code','Files & code','folder'],['settings','Domains & runtime','server'],['logs','Logs','terminal'],['https','HTTPS','lock'],['routing','Routing','network']].map(([k,t,ic])=>`<button class="tab ${tab===k?'active':''}" data-site-tab="${k}">${icon(ic)} ${t}</button>`).join('')}</div>${s.dependencyContainer?`<div class="access-notice"><div><strong>Dependency cleanup required</strong><p>Clean up the previous dependency job before editing website files.</p></div>${button('site-dependency-cleanup','Clean dependency job','refresh')}</div>`:''}<div id="website-detail"></div>`;bind('websites-back',()=>{if(canLeaveWebsite()){disposeWebsiteEditor();websitesPage(generation);}});$$('[data-site-tab]').forEach(b=>b.onclick=action(()=>openWebsite(id,b.dataset.siteTab)));bind('website-publish',()=>publishWebsite(s));bind('website-install-runtime',async()=>{if(!canLeaveWebsite())return;const r=websitesInventory.runtimes[s.type];if(await confirmOperation('Install '+r.name+'?',`Pull the official ${r.image} website runtime. It will not publish this website yet.`,'Install runtime'))watch(await post('/api/websites/runtime',{runtime:s.type,confirm:true}),null,async()=>{websitesInventory=await api('/api/websites');await openWebsite(s.id);});});bind('website-restore',async()=>{await post('/api/websites/restore',{id:s.id,confirm:true});await openWebsite(id);});bind('site-dependency-cleanup',async()=>{if(await confirmOperation('Clean dependency job?','Remove the website’s dedicated dependency container and restore protected source permissions.','Clean up'))watch(await post('/api/websites/cleanup',{id:s.id,confirm:true}),null,()=>openWebsite(s.id));});if(s.dependencyContainer){$('#website-detail').innerHTML='';return;}bind('website-stop-top',async()=>{if(await confirmOperation('Stop website?',s.domains.join(', ')+' will stop serving. Files are retained.','Stop website'))watch(await post('/api/websites/stop',{id:s.id,confirm:true}),null,()=>openWebsite(s.id));});bind('website-restart-top',async()=>{if(await confirmOperation('Restart website?',s.domains[0]+' will briefly disconnect while its application restarts.','Restart'))watch(await post('/api/websites/restart',{id:s.id,confirm:true}),null,()=>openWebsite(s.id));});if(tab==='overview')websiteOverview(s);if(tab==='code')await websiteCode(s);if(tab==='settings')websiteSettings(s);if(tab==='logs')websiteLogs(s);if(tab==='https')websiteTLS(s);if(tab==='routing')websiteRouting(s);}
async function publishWebsite(s){if(!canLeaveWebsite())return;const type=['static','proxy'].includes(s.type)?'its static files':'a new isolated '+websiteType(s.type)+' runtime';if(await confirmOperation('Publish website?',`Publish ${s.domains.join(', ')} on HTTP port ${s.listenPort}${s.tls?' and HTTPS port '+s.tls.port:''} using ${type}. OpenResty configuration is tested before reload. DNS must already point to this server.`,'Publish'))watch(await post('/api/websites/publish',{id:s.id,confirm:true}),null,()=>openWebsite(s.id,'routing'));}
async function websiteCode(s){websiteFolder='.';$('#website-detail').innerHTML=`<div class="card website-code-card"><div class="toolbar"><div class="row-actions">${button('site-file-parent','Parent','up')}${button('site-new-file','New file','plus')}${button('site-new-folder','New folder','folder')}${button('site-upload','Upload','upload')}${button('site-trash','Trash','trash')}</div><div class="row-actions">${!['static','proxy'].includes(s.type)?button('site-dependencies','Install dependencies',null):''}<a class="icon-button" href="/api/websites/download?id=${s.id}&path=." title="Download source code" aria-label="Download source code">${icon('download')}</a>${button('site-file-history','History',null)}${button('site-file-save','Save file','check','primary')}</div></div><div class="website-code-layout"><div class="website-file-tree"><div id="site-file-path" class="website-tree-path">/</div><div id="site-file-list"></div></div><div class="website-editor-pane"><div class="editor-heading"><code id="site-editor-name">Select a text file</code><span id="site-editor-status"></span></div><div id="site-editor"><div class="table-empty-state">${icon('file')}<strong>Select a file to edit</strong><p>Changes are saved with a backup and checked for external edits.</p></div></div></div></div><div class="table-footer"><span id="site-file-progress"></span><span>${s.existing?'Document root: '+esc(s.root||s.fileRoot):'Runtime entry point: '+esc(['static','proxy'].includes(s.type)?'public/index.html':s.command)}</span></div><input id="site-upload-input" type="file" multiple hidden></div>`;$('#site-file-save').disabled=true;bind('site-file-parent',()=>browseWebsiteFiles(s,websiteFolder.split('/').slice(0,-1).join('/')||'.'));bind('site-new-file',()=>newWebsiteFile(s,'file'));bind('site-new-folder',()=>newWebsiteFile(s,'folder'));bind('site-trash',()=>websiteTrash(s));bind('site-upload',()=>$('#site-upload-input').click());$('#site-upload-input').onchange=()=>uploadWebsiteFiles(s,[...$('#site-upload-input').files]);bind('site-file-history',()=>websiteHistory(s));bind('site-file-save',async()=>{if(!websiteEditor||!websiteFile)return;const r=await post('/api/websites/file',{id:s.id,path:websiteFile,text:websiteEditor.getText(),revision:websiteRevision});websiteRevision=(await api('/api/websites/file?id='+s.id+'&path='+encodeURIComponent(websiteFile))).revision;websiteDirty=false;$('#site-editor-status').textContent='Saved';notify('File saved with a private backup. Use History to restore previous versions.');});bind('site-dependencies',async()=>{if(!canLeaveWebsite())return;if(await confirmOperation('Install website dependencies?',`Install ${s.type==='node'?'package.json':s.type==='python'?'requirements.txt':'composer.json'} dependencies in the website’s app directory using an isolated container. Dependency scripts may run inside that container.`,'Install dependencies'))watch(await post('/api/websites/dependencies',{id:s.id,confirm:true}));});await browseWebsiteFiles(s,'.');const starter=s.existing?'index.html':s.type==='php'?'public/index.php':['static','proxy'].includes(s.type)?'public/index.html':s.type==='node'?'server.mjs':'server.py';try{await editWebsiteFile(s,starter);}catch{};}
async function browseWebsiteFiles(s,relative){const data=await api('/api/websites/files?id='+s.id+'&path='+encodeURIComponent(relative));if(websiteCurrent?.id!==s.id||!$('#site-file-list'))return;websiteFolder=data.path;$('#site-file-path').textContent='/'+(data.path==='.'?'':data.path);$('#site-file-parent').disabled=data.path==='.';const entries=data.entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));$('#site-file-list').innerHTML=entries.map((e,i)=>`<div class="website-tree-item"><button class="website-tree-open" data-index="${i}" title="${esc(e.name)}">${icon(e.directory?'folder':'file')}<span>${esc(e.name)}</span></button><button class="icon-button website-file-more" data-index="${i}" title="Manage ${esc(e.name)}" aria-label="Manage ${esc(e.name)}">${icon('menu')}</button></div>`).join('')||'<p class="card-pad muted">Empty folder</p>';$$('.website-tree-open').forEach(b=>b.onclick=action(()=>{const e=entries[Number(b.dataset.index)],p=(websiteFolder==='.'?'':websiteFolder+'/')+e.name;return e.directory?browseWebsiteFiles(s,p):editWebsiteFile(s,p);}));$$('.website-file-more').forEach(b=>b.onclick=()=>manageWebsiteFile(s,entries[Number(b.dataset.index)]));}
async function editWebsiteFile(s,relative){if(!canLeaveWebsite())return;const f=await api('/api/websites/file?id='+s.id+'&path='+encodeURIComponent(relative));disposeWebsiteEditor();websiteFile=relative;websiteRevision=f.revision;$('#site-editor').innerHTML='';$('#site-editor-name').textContent=relative;$('#site-editor-status').textContent='Saved';websiteEditor=PanelTools.editor($('#site-editor'),f.text,relative,()=>{websiteDirty=true;$('#site-editor-status').textContent='Unsaved changes';});$('#site-file-save').disabled=false;websiteEditor.focus();}
function newWebsiteFile(s,kind){openModal('New '+kind,`<form id="site-create-file" class="modal-body"><label>Name<input id="site-new-name" required></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Create ${kind}</button></div></form>`);form('site-create-file',async()=>{const name=$('#site-new-name').value;await post('/api/websites/files',{id:s.id,action:'create',kind,path:websiteFolder,name});modal.close();await browseWebsiteFiles(s,websiteFolder);if(kind==='file')await editWebsiteFile(s,(websiteFolder==='.'?'':websiteFolder+'/')+name);});}
function manageWebsiteFile(s,e){const file=(websiteFolder==='.'?'':websiteFolder+'/')+e.name;openModal(e.name,`<form id="site-manage-file" class="modal-body"><label>Operation<select id="site-file-operation"><option value="rename">Rename</option><option value="copy">Copy to folder</option><option value="move">Move to folder</option></select></label><label>Name<input id="site-file-new-name" value="${esc(e.name)}" required></label><label>Destination folder<input id="site-file-destination" value="${esc(websiteFolder)}"></label><p class="form-error" role="alert"></p><div class="form-actions"><a class="button secondary" href="/api/websites/download?id=${s.id}&path=${encodeURIComponent(file)}">Download</a><button id="site-file-delete" class="button danger" type="button">Move to Trash</button><button class="button" type="submit">Apply</button></div></form>`);form('site-manage-file',async()=>{if(!canLeaveWebsite())return;await post('/api/websites/files',{id:s.id,action:$('#site-file-operation').value,path:file,name:$('#site-file-new-name').value,destination:$('#site-file-destination').value});modal.close();await browseWebsiteFiles(s,websiteFolder);});bind('site-file-delete',async()=>{if(!canLeaveWebsite())return;if(await confirmOperation('Move to Trash?',`Move ${file} and its contents to recoverable Trash? This can affect a running website.`,'Move to Trash')){await post('/api/websites/files',{id:s.id,action:'trash',path:file,confirm:true});disposeWebsiteEditor();modal.close();await websiteCode(s);}});}
async function websiteTrash(s){const rows=await api('/api/websites/trash?id='+s.id);openModal('Website Trash',`<div class="modal-body">${rows.map((r,i)=>`<div class="trash-row"><span>${esc(r.path)}<small>${esc(new Date(r.time).toLocaleString())}</small></span><button class="button secondary site-restore-file" data-index="${i}">Restore</button></div>`).join('')||'<p>Trash is empty.</p>'}</div>`);$$('.site-restore-file').forEach(b=>b.onclick=action(async()=>{await post('/api/websites/files',{id:s.id,action:'restore',idToRestore:rows[Number(b.dataset.index)].id});modal.close();await browseWebsiteFiles(s,websiteFolder);}));}
async function uploadWebsiteFiles(s,files){
 for(const f of files){
  $('#site-file-progress').textContent='Uploading '+f.name+'…';
  try{
   await new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('POST','/api/websites/upload?id='+encodeURIComponent(s.id)+'&path='+encodeURIComponent(websiteFolder)+'&name='+encodeURIComponent(f.name));
    xhr.setRequestHeader('X-Panel-Intent','manage');
    xhr.setRequestHeader('Content-Type','application/octet-stream');
    xhr.upload.onprogress=e=>{if(e.lengthComputable)$('#site-file-progress').textContent='Uploading '+f.name+' · '+Math.round(e.loaded/e.total*100)+'% ('+bytes(e.loaded)+' / '+bytes(e.total)+')';};
    xhr.onload=()=>{let r;try{r=JSON.parse(xhr.responseText);}catch{}xhr.status<300?resolve():reject(Error(r?.error||'Upload failed'));};
    xhr.onerror=()=>reject(Error('Upload connection failed'));
    xhr.send(f);
   });
  }catch(e){notify(e.message);}
 }
 if($('#site-file-progress'))$('#site-file-progress').textContent='Upload finished';
 await browseWebsiteFiles(s,websiteFolder);
}
function websiteSettings(s){$('#website-detail').innerHTML=`<div class="card"><div class="card-header"><h2>Website settings</h2></div><form id="website-settings-form" class="card-pad">${s.type==='proxy'?`<label>Upstream address<input id="site-upstream" type="url" value="${esc(s.upstream)}" required></label>`:''}<div class="form-grid"><label>Domains<textarea id="site-domains" rows="3" required>${esc(s.domains.join('\n'))}</textarea></label><label>HTTP port<input id="site-port" type="number" value="${s.listenPort}" min="1" max="65535" required></label>${!['static','proxy'].includes(s.type)?`<label class="span-2">Startup command<input id="site-command" value="${esc(s.command)}" required ${s.type==='php'?'readonly':''}></label><label>Memory (MiB)<input id="site-memory" type="number" value="${s.memory}" min="128" max="4096" required></label><label>CPU cores<input id="site-cpus" type="number" value="${s.cpus}" min="0.25" max="4" step="0.25" required></label>`:''}</div>${!['static','proxy'].includes(s.type)?`<p class="field-help">HTTP applications must listen on 0.0.0.0:8080. Python dependencies are available under /app/.python. App source is read-only inside the runtime; use /data for persistent writable files and /tmp for temporary files. PHP uses its fixed FPM startup command.</p><details><summary>Environment variables · ${s.envNames.length} saved</summary><p class="field-help">Saved names: ${esc(s.envNames.join(', ')||'None')}. Values are not returned. Replacing variables removes any omitted values. PORT and runtime helper paths are managed automatically.</p><label class="checkbox-label"><input id="site-replace-env" type="checkbox">Replace saved environment variables</label><label>One NAME=value per line<textarea id="site-env" rows="5" spellcheck="false" placeholder="APP_ENV=production"></textarea></label></details>`:''}<p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Save settings</button></div></form></div><div class="card"><div class="toolbar"><div><h2>Website lifecycle</h2><span class="muted tiny">Stopping removes this website’s route. Archiving retains its files.</span></div><div class="row-actions">${button('site-stop','Stop website','stop')}${button('site-archive','Archive website','trash','danger')}</div></div></div>`;form('website-settings-form',async()=>{const b={...(s.type==='proxy'?{upstream:$('#site-upstream').value}:{}),id:s.id,domains:$('#site-domains').value,listenPort:Number($('#site-port').value),command:$('#site-command')?.value||'',memory:Number($('#site-memory')?.value||512),cpus:Number($('#site-cpus')?.value||1),confirm:true};if($('#site-replace-env')?.checked){b.env={};for(const l of $('#site-env').value.split('\n').filter(l=>l.trim())){const split=l.indexOf('=');if(split<1)throw Error('Use NAME=value for environment variables');b.env[l.slice(0,split).trim()]=l.slice(split+1);}}await post('/api/websites/settings',b);notify('Settings saved. Publish changes to apply them.');await openWebsite(s.id,'settings');});for(const name of ['stop','archive'])bind('site-'+name,async()=>{if(await confirmOperation(name==='stop'?'Stop website?':'Archive website?',`${s.domains[0]} will stop serving through this panel’s route. Website files are retained.`,name==='stop'?'Stop website':'Archive'))watch(await post('/api/websites/'+name,{id:s.id,confirm:true}),null,()=>openWebsite(s.id,'settings'));});}
async function websiteLogs(s){$('#website-detail').innerHTML=`<div class="card"><div class="toolbar"><h2>Website logs</h2><div class="row-actions"><select id="site-log-kind" class="filters-select" aria-label="Log source"><option value="runtime">Runtime</option><option value="access">Access</option><option value="error">Web server errors</option></select>${button('site-log-refresh','Refresh','refresh')}</div></div><div class="card-pad"><pre id="site-log-output">Reading logs…</pre></div></div>`;if(s.nativeService?.unit && !$('#site-log-kind option[value=service]')){
  const opt = document.createElement('option');
  opt.value = 'service';
  opt.textContent = '⚡ Service logs ('+s.nativeService.unit+')';
  $('#site-log-kind').prepend(opt);
  $('#site-log-kind').value = 'service';
}
const load=async()=>{
  const kind = $('#site-log-kind').value;
  if (kind === 'service') {
    try {
      const res = await api('/api/websites/existing/service-logs?id='+encodeURIComponent(s.id)+'&lines=150');
      if($('#site-log-output'))$('#site-log-output').textContent = res.logs || 'No service logs recorded.';
    } catch (e) {
      if($('#site-log-output'))$('#site-log-output').textContent = 'Error loading service logs: ' + e.message;
    }
    return;
  }
  const r=await api('/api/websites/logs?id='+s.id+'&kind='+kind);
  if($('#site-log-output'))$('#site-log-output').textContent=r.output||'No log entries.';
};$('#site-log-kind').onchange=action(load);bind('site-log-refresh',load);await load();}
function websiteTLS(s){
  const cfNotice=`<div class="card card-pad" style="border-left: 4px solid var(--accent, #3b82f6); background: rgba(59,130,246,0.06); margin-bottom: 16px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="font-size:20px">☁️</span>
      <strong style="font-size:15px">Cloudflare Tunnel Mode (Active &amp; Recommended)</strong>
      ${pill('Zero Maintenance','green')}
    </div>
    <p style="margin:0 0 8px 0;line-height:1.5;color:var(--text, #e2e8f0)">
      This server routes public traffic through <strong>Cloudflare Tunnel</strong>. 
      <strong>Edge HTTPS is fully automated and terminated by Cloudflare</strong> with free universal SSL, TLS 1.3, DDoS protection, and global CDN caching.
    </p>
    <ul style="margin:0;padding-left:18px;line-height:1.6;font-size:13px;color:var(--text-muted, #94a3b8)">
      <li><strong>No local SSL required:</strong> The origin server operates securely on loopback HTTP (<code>127.0.0.1</code>) inside an encrypted tunnel.</li>
      <li><strong>No open ports:</strong> Inbound ports 80 and 443 do not need to be opened on your firewall or router.</li>
      <li><strong>Automatic subdomains:</strong> Any configured domain or subdomain (e.g., <code>app.yourdomain.com</code>) automatically receives valid HTTPS at Cloudflare Edge.</li>
    </ul>
  </div>`;

  $('#website-detail').innerHTML=`${cfNotice}<div class="card"><div class="card-header"><h2>Optional Direct-IP Origin Certificate</h2>${pill(s.tls?'Custom Certificate saved':'Using Cloudflare Tunnel Edge SSL',s.tls?'green':'blue')}</div><form id="site-tls-form" class="card-pad">${s.tls?`<p>Expires: ${esc(s.tls.expires)}</p><p class="field-help">${esc(s.tls.issuer)}</p>`:''}<div class="form-grid"><label class="span-2">Certificate chain (PEM)<textarea id="site-tls-cert" rows="6" required spellcheck="false" autocomplete="off"></textarea></label><label class="span-2">Private key (PEM)<textarea id="site-tls-key" rows="6" required spellcheck="false" autocomplete="off"></textarea></label><label>HTTPS port<input id="site-tls-port" type="number" value="${s.tls?.port||443}" min="1" max="65535" required></label></div><p class="field-help">Only needed if exposing a direct public IP without Cloudflare Tunnel. Under Cloudflare Tunnel, leave this unconfigured — Cloudflare manages Edge SSL automatically.</p><p class="form-error" role="alert"></p><div class="form-actions">${s.tls?button('site-tls-remove','Remove HTTPS',null,'danger'):''}<button class="button" type="submit">Save certificate</button></div></form></div>`;form('site-tls-form',async()=>{const b={id:s.id,certificate:$('#site-tls-cert').value,privateKey:$('#site-tls-key').value,port:Number($('#site-tls-port').value),confirm:true};$('#site-tls-key').value='';await post('/api/websites/certificate',b);notify('Certificate saved. Publish changes to enable HTTPS.');await openWebsite(s.id,'https');});bind('site-tls-remove',async()=>{if(await confirmOperation('Remove HTTPS configuration?','Save an HTTP-only configuration for this website. Publish changes to apply it.','Remove HTTPS')){await post('/api/websites/certificate',{id:s.id,remove:true,confirm:true});await openWebsite(s.id,'https');}});
}
function websiteRouting(s){$('#website-detail').innerHTML=`<div class="card management-card"><div class="toolbar"><h2>Domain routing</h2>${s.pending?pill('Unpublished changes','amber'):pill('Published','green')}</div><div class="table-wrap"><table class="management-table"><thead><tr><th>DOMAIN</th><th>HTTP</th><th>HTTPS</th></tr></thead><tbody>${s.domains.map(d=>`<tr><td><strong>${esc(d)}</strong></td><td><a href="http://${d}:${s.listenPort}" target="_blank" rel="noreferrer">${esc(d)}:${s.listenPort}</a></td><td>${s.tls?`<a href="https://${d}:${s.tls.port}" target="_blank" rel="noreferrer">${esc(d)}:${s.tls.port}</a>`:'Not configured'}</td></tr>`).join('')}</tbody></table></div><div class="table-footer"><span>Point DNS or your Cloudflare hostname route to this server. Publishing does not create DNS records.</span></div></div><details class="card"><summary class="card-pad">Last published OpenResty configuration</summary><div class="card-pad"><pre>${esc(s.activeConfig||'This website has not been published yet.')}</pre></div></details>`;}
window.addEventListener('beforeunload',e=>{if(websiteDirty){e.preventDefault();e.returnValue='';}});
async function websiteHistory(s){if(!websiteFile){notify('Select a file first.');return;}const file=websiteFile,rows=await api('/api/websites/backups?id='+s.id+'&path='+encodeURIComponent(file));openModal('File history',`<div class="modal-body"><p><code>${esc(file)}</code></p><div class="table-wrap"><table class="management-table"><thead><tr><th>SAVED VERSION</th><th class="actions-column">ACTION</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(new Date(r.time).toLocaleString())}</td><td class="actions-column"><button class="button secondary small site-restore-version" data-index="${i}">Restore</button></td></tr>`).join('')||'<tr><td colspan="2">No previous versions yet.</td></tr>'}</tbody></table></div><p class="field-help">Backups are private and are never served as website files. Restoring also saves the current version.</p></div>`);$$('.site-restore-version').forEach(b=>b.onclick=action(async()=>{if(!canLeaveWebsite())return;if(await confirmOperation('Restore this version?',`Replace ${file} with the selected saved version. A private backup of the current file will be kept.`,'Restore')){await post('/api/websites/backup/restore',{id:s.id,backup:rows[Number(b.dataset.index)].id,confirm:true});modal.close();await editWebsiteFile(s,file);notify('Previous version restored.');}}));}

function websiteOverview(s){
  const missing=!['static','proxy'].includes(s.type)&&!websitesInventory?.runtimes[s.type]?.installed;
  const isRunning=s.state==='published';
  const primaryDomain=s.domains[0]||'localhost';

  const heroHtml=`
    <div class="app-overview-hero card">
      <div class="app-overview-hero-left">
        <div class="app-hero-icon">
          ${icon('globe')}
          <span class="status-pulse-dot ${isRunning?'green':'amber'}"></span>
        </div>
        <div class="app-hero-title-group">
          <h2>
            ${esc(primaryDomain)}
            ${websiteState(s)}
            ${pill(websiteType(s.type),'blue')}
          </h2>
          <p>${esc(websiteType(s.type))} · ${s.domains.length} domain${s.domains.length===1?'':'s'}${missing?' · Runtime container not installed':''}</p>
          <div class="app-hero-badges">
            ${pill('HTTP Port '+s.listenPort,'purple')}
            ${s.tls?pill('HTTPS Port '+s.tls.port,'green'):pill('HTTP Only','amber')}
            ${pill('OpenResty Nginx + Coraza WAF','blue')}
          </div>
        </div>
      </div>
      <div class="app-overview-hero-actions">
        ${!s.archived&&s.state==='published'&&!['static','proxy'].includes(s.type)?button('hero-btn-restart','Restart','refresh','secondary small'):''}
        ${button('hero-btn-code','Browse Files','folder','secondary small')}
        ${button('hero-btn-logs','Live Logs','terminal','secondary small')}
        ${s.state==='published'?button('hero-btn-publish','Publish changes','play','primary small'):button('hero-btn-publish','Publish Website','play','primary small')}
      </div>
    </div>
  `;

  const archHtml=`
    <div class="app-architecture-grid">
      <div class="app-arch-card card">
        <div class="app-arch-card-header">
          <div class="app-arch-card-title">${icon('server')} Runtime Engine</div>
          ${pill(websiteType(s.type),'blue')}
        </div>
        <div class="app-arch-specs">
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Runtime Type</span><span class="app-arch-spec-val">${esc(websiteType(s.type))}</span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Engine Status</span><span class="app-arch-spec-val">${websiteState(s)}</span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Runtime Image</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">${esc(websitesInventory?.runtimes[s.type]?.image||s.type)}</code></span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Pending Edits</span><span class="app-arch-spec-val">${s.pending?pill('Unpublished changes','amber'):pill('Synced','green')}</span></div>
        </div>
      </div>
      <div class="app-arch-card card">
        <div class="app-arch-card-header">
          <div class="app-arch-card-title">${icon('network')} Domains &amp; Serving</div>
          ${pill(s.listenPort?':'+s.listenPort:'Not listening','purple')}
        </div>
        <div class="app-arch-specs">
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Configured Domains</span><span class="app-arch-spec-val">${s.domains.map(esc).join(', ')}</span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Internal Listen</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">127.0.0.1:${s.listenPort}</code></span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Coraza WAF</span><span class="app-arch-spec-val">OWASP Core Rule Set Active</span></div>
        </div>
      </div>
      <div class="app-arch-card card">
        <div class="app-arch-card-header">
          <div class="app-arch-card-title">${icon('lock')} TLS &amp; HTTPS</div>
          ${pill(s.tls?'Secured':'No TLS',s.tls?'green':'amber')}
        </div>
        <div class="app-arch-specs">
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">Certificate Status</span><span class="app-arch-spec-val">${s.tls?'Active · expires '+esc(s.tls.expires):'Not configured'}</span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">HTTPS Port</span><span class="app-arch-spec-val">${s.tls?s.tls.port:'None'}</span></div>
          <div class="app-arch-spec-row"><span class="app-arch-spec-label">HTTP to HTTPS</span><span class="app-arch-spec-val">${s.tls?'Enforced':'Disabled'}</span></div>
        </div>
      </div>
    </div>
  `;

  const operationsHtml=`
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <h2>Website Management</h2>
          <p>Application lifecycle, source code files, domains, runtime limits, and routing</p>
        </div>
      </div>
      <div class="card-pad" style="padding-top:0;">
        <div class="operations-matrix-grid">
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('folder')}</div>
              <div class="op-card-copy">
                <h4>Files &amp; Code</h4>
                <p>Upload, edit, rename, download, and restore website files in the atomic workspace.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small website-task" data-tab="code">Open Files</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('server')}</div>
              <div class="op-card-copy">
                <h4>Domains &amp; Application</h4>
                <p>Set domains, internal ports, startup command, environment variables, and memory limits.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small website-task" data-tab="settings">Open Settings</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('terminal')}</div>
              <div class="op-card-copy">
                <h4>Logs &amp; Telemetry</h4>
                <p>Stream real-time application logs, Nginx access logs, and web-server errors.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small website-task" data-tab="logs">View Logs</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('lock')}</div>
              <div class="op-card-copy">
                <h4>HTTPS Certificate</h4>
                <p>Install or replace custom origin SSL certificates and manage private keys securely.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small website-task" data-tab="https">Manage HTTPS</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('network')}</div>
              <div class="op-card-copy">
                <h4>Routing Configuration</h4>
                <p>Review serving addresses and the published OpenResty / Nginx virtual host configuration.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small website-task" data-tab="routing">View Routing</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  $('#website-detail').innerHTML=`${heroHtml}${archHtml}${operationsHtml}${s.state!=='published'?notice(missing?'Install the required runtime, add your files and settings, then Publish.':'This website is not serving yet. Add your files and review settings, then Publish.'):''}`;

  $$('.website-task').forEach(b=>b.onclick=action(()=>openWebsite(s.id,b.dataset.tab)));
  bind('hero-btn-code',()=>openWebsite(s.id,'code'));
  bind('hero-btn-logs',()=>openWebsite(s.id,'logs'));
  bind('hero-btn-publish',()=>publishWebsite(s));
  bind('hero-btn-restart',async()=>{
    if(!await confirmOperation('Restart website?',s.domains[0]+' will briefly disconnect while its container restarts.','Restart'))return;
    watch(await post('/api/websites/restart',{id:s.id,confirm:true}),null,()=>openWebsite(s.id));
  });
}
async function existingWebsiteWorkspace(s,tab='overview',extra=null){content.innerHTML=`<div class="website-heading"><div><button id="websites-back" class="text-button">${icon('up')}All websites</button><div class="website-heading-name"><h2>${esc(s.domains[0])}</h2>${pill(s.enabled?'Enabled':'Disabled',s.enabled?'green':'')}</div><p>${esc(s.kind)} · Existing configuration · ${esc(s.engine)}</p></div><div class="website-command-bar">${button('existing-reload','Test & reload','refresh')}${button('existing-toggle',s.enabled?'Disable website':'Enable website',s.enabled?'stop':'play',s.enabled?'secondary':'primary')}</div></div><div class="tabs">${[['overview','Overview','overview'],['code','Files & code','folder'],['configs','Configurations','file'],['settings','Domains & upstream','server'],['logs','Logs','terminal'],['routing','Routing configuration','network'],['https','HTTPS','lock'],['backups','Configuration backups','disk']].map(([key,label,ic])=>`<button class="tab ${tab===key?'active':''}" data-existing-tab="${key}">${icon(ic)} ${label}</button>`).join('')}</div><div id="website-detail"></div>`;bind('websites-back',()=>{if(canLeaveWebsite()){disposeWebsiteEditor();websitesPage(generation);}});$$('[data-existing-tab]').forEach(b=>b.onclick=action(()=>openWebsite(s.id,b.dataset.existingTab)));bind('existing-reload',()=>existingWebsiteAction(s,'reload'));bind('existing-toggle',()=>existingWebsiteAction(s,s.enabled?'disable':'enable'));
 function renderExistingOverview(s){
  const isAlgo=s.isAlgo||s.domains?.some(d=>d.includes('algo'))||s.detectedStack||s.nativeService;
  const isPanel=s.domains?.some(d=>d.includes('cyber.'));
  const stack=s.detectedStack||(isAlgo?{
    type:'Hybrid (Python Backend + React Frontend)',
    backend:'Python 3.12 (Flask, eventlet / Werkzeug / Gunicorn, app.py, .venv)',
    frontend:'React 19, TypeScript, Vite, Tailwind CSS, TanStack Query (frontend/dist/)',
    dist:'frontend/dist',
    workingDirectory:s.fileRoot||s.nativeService?.workingDirectory||'/home/cyber/Downloads/openalgo',
    role:'Python backend core engine on port 5000 serving built React UI from frontend/dist/'
  }:null);

  const configs=s.detectedConfigs||[];
  const primaryDomain=s.domains[0]||'localhost';
  const upstreamTarget=s.upstreams?.[0]||(isAlgo?'127.0.0.1:5000':'Direct Static Files');
  const listenAddresses=s.listen?.length?s.listen.join(', '):'Port 80 / 443';

  // Hero Status Banner
  const heroHtml=`
    <div class="app-overview-hero card">
      <div class="app-overview-hero-left">
        <div class="app-hero-icon">
          ${icon(isAlgo?'server':'globe')}
          <span class="status-pulse-dot ${s.enabled?'green':'amber'}"></span>
        </div>
        <div class="app-hero-title-group">
          <h2>
            ${esc(primaryDomain)}
            ${pill(s.enabled?(s.nativeService?.status==='running'||isAlgo?'● Active · '+(s.nativeService?.unit||'openalgo.service'):'● Routing Enabled'):'Disabled',s.enabled?'green':'amber')}
            ${stack?pill('Hybrid: Python + React','blue'):pill(s.kind||'Reverse Proxy','blue')}
          </h2>
          <p>${esc(s.nativeService?.description||(isAlgo?'OpenAlgo Python Trading Server · Broker-Agnostic Execution Engine':'Production Web Route & Service Upstream'))}</p>
          <div class="app-hero-badges">
            ${isAlgo?pill('Port 5000','purple'):(s.upstreams?.length?pill(s.upstreams[0],'purple'):'')}
            ${pill('OpenResty / Nginx Engine','blue')}
            ${pill('Coraza WAF (OWASP CRS v4)','green')}
            ${s.pair?pill('HTTPS Encrypted','green'):pill('HTTP / Edge SSL','blue')}
          </div>
        </div>
      </div>
      <div class="app-overview-hero-actions">
        ${isAlgo||s.nativeService?`<button id="hero-btn-restart" class="button secondary small" type="button">${icon('refresh')} Restart Service</button>`:''}
        ${button('hero-btn-code','Browse Files','folder','secondary small')}
        ${configs.length?`<button id="hero-btn-configs" class="button secondary small" type="button">${icon('file')} Configurations (${configs.length})</button>`:''}
        ${button('hero-btn-logs','Live Logs','terminal','secondary small')}
        ${button('hero-btn-reload','Test & Reload','refresh','secondary small')}
      </div>
    </div>
  `;

  // Architecture & Component Cards Grid
  let archHtml='';
  if(stack){
    archHtml=`
      <div class="app-architecture-grid">
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('server')} Backend &amp; Core Engine</div>
            ${pill('Python 3.12','blue')}
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Framework</span><span class="app-arch-spec-val">Flask · eventlet / Gunicorn</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Environment</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">.venv / uv</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Service Unit</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">${esc(s.nativeService?.unit||'openalgo.service')}</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Entry Point</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">app.py</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Capabilities</span><span class="app-arch-spec-val">REST API (/api/v1/) · WebSockets</span></div>
          </div>
        </div>
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('globe')} Client Surface &amp; UI</div>
            ${pill('React 19 Vite','green')}
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">UI Framework</span><span class="app-arch-spec-val">React 19 · TypeScript</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Styling &amp; Query</span><span class="app-arch-spec-val">Tailwind CSS · TanStack Query</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Target Build</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">frontend/dist/</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Distribution</span><span class="app-arch-spec-val">Served via Flask on port 5000</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Dev Mode</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">npm run dev</code> (frontend/)</span></div>
          </div>
        </div>
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('network')} Ingress &amp; Reverse Proxy</div>
            ${pill('OpenResty Nginx','blue')}
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Public Domain</span><span class="app-arch-spec-val">${esc(primaryDomain)}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Internal Upstream</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">${esc(upstreamTarget)}</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Serving Ports</span><span class="app-arch-spec-val">${esc(listenAddresses)}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">WAF Defense</span><span class="app-arch-spec-val">Coraza OWASP CRS v4 Active</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">TLS Status</span><span class="app-arch-spec-val">${s.pair?'Origin Certificate Active':'Edge TLS via Cloudflare'}</span></div>
          </div>
        </div>
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('folder')} Workspace Directory</div>
            <button id="arch-open-code-btn" class="button secondary small" type="button">${icon('folder')} Browse Files</button>
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Filesystem Path</span><span class="app-arch-spec-val"><code class="app-arch-spec-code" style="word-break:break-all;">${esc(s.fileRoot||s.nativeService?.workingDirectory||'/home/cyber/Downloads/openalgo')}</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Configurations</span><span class="app-arch-spec-val">${configs.length} project files identified</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Staged Status</span><span class="app-arch-spec-val">${s.filesStaged?'Staged directory active':'Live project workspace'}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">File Operations</span><span class="app-arch-spec-val">Atomic write, edit, upload, git</span></div>
          </div>
        </div>
      </div>
    `;
  } else {
    archHtml=`
      <div class="app-architecture-grid">
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('network')} Ingress &amp; Upstream</div>
            ${pill(s.enabled?'Enabled':'Disabled',s.enabled?'green':'amber')}
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Public Domains</span><span class="app-arch-spec-val">${s.domains.map(esc).join(', ')}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Upstream Destination</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">${esc(upstreamTarget)}</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Listen Sockets</span><span class="app-arch-spec-val">${esc(listenAddresses)}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Routing Engine</span><span class="app-arch-spec-val">${esc(s.engine||'OpenResty / Nginx')}</span></div>
          </div>
        </div>
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('folder')} Document Root &amp; Files</div>
            ${s.fileRoot?button('arch-open-code-btn','Browse Files','folder','secondary small'):''}
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Document Root</span><span class="app-arch-spec-val"><code class="app-arch-spec-code">${esc(s.fileRoot||'Internal web engine root')}</code></span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Serving Source</span><span class="app-arch-spec-val">${s.upstreams?.length?'Reverse proxy forwarding to upstream':'Static files served directly'}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Detected Configs</span><span class="app-arch-spec-val">${configs.length} files detected</span></div>
          </div>
        </div>
        <div class="app-arch-card card">
          <div class="app-arch-card-header">
            <div class="app-arch-card-title">${icon('lock')} TLS &amp; Security</div>
            ${pill(s.pair?'HTTPS':'HTTP',s.pair?'green':'blue')}
          </div>
          <div class="app-arch-specs">
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Origin Certificate</span><span class="app-arch-spec-val">${s.pair?'Custom Certificate Saved':'Edge TLS / Direct HTTP'}</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">WAF Protection</span><span class="app-arch-spec-val">Coraza OWASP CRS v4 Active</span></div>
            <div class="app-arch-spec-row"><span class="app-arch-spec-label">Ingress Channel</span><span class="app-arch-spec-val">Cloudflare Tunnel / Direct Nginx</span></div>
          </div>
        </div>
      </div>
    `;
  }

  // Zero-Trust Configuration Inspector Shelf
  const configShelfHtml=configs.length?`
    <div class="config-inspector-card card">
      <div class="config-inspector-head">
        <div class="config-inspector-title">
          <h3>Zero-Trust Project Configurations (${configs.length})</h3>
          <p>Sensitive credentials (API keys, secrets, tokens) are automatically redacted until explicitly unmasked by an administrator.</p>
        </div>
        <button id="overview-inspect-all-configs" class="button secondary small" type="button">${icon('file')} Inspect All Configurations &rarr;</button>
      </div>
      <div class="config-pills-shelf">
        ${configs.map(cf=>`
          <button type="button" class="config-pill-btn hybrid-config-pill" data-config-file="${esc(cf.name)}" title="Inspect ${esc(cf.name)}">
            ${icon(cf.type==='env'?'lock':cf.type==='systemd'?'server':'file')}
            <span>${esc(cf.name)}</span>
            <span class="config-size">${Math.round((cf.size||0)/1024)} KB</span>
          </button>
        `).join('')}
      </div>
    </div>
  `:'';

  // Interactive Operations Matrix Grid
  const operationsHtml=`
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <h2>Website &amp; Application Operations</h2>
          <p>Direct workspace management tools, service inspection, and configuration lifecycle controls</p>
        </div>
      </div>
      <div class="card-pad" style="padding-top:0;">
        <div class="operations-matrix-grid">
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('folder')}</div>
              <div class="op-card-copy">
                <h4>Files &amp; Code</h4>
                <p>Browse, upload, download, and edit source files directly in the browser with atomic commits.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="code">Open Files</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('file')}</div>
              <div class="op-card-copy">
                <h4>Configurations</h4>
                <p>Inspect detected configuration files (.env, app.py, systemd units) with zero-trust secret masking.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="configs">View Configs</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('network')}</div>
              <div class="op-card-copy">
                <h4>Domains &amp; Upstream</h4>
                <p>Update domain names, proxy destinations, and upstream application socket mappings safely.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="settings">Manage Upstream</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('terminal')}</div>
              <div class="op-card-copy">
                <h4>Logs &amp; Telemetry</h4>
                <p>Stream real-time application runtime logs, Nginx access logs, and upstream error traces.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="logs">Stream Logs</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('server')}</div>
              <div class="op-card-copy">
                <h4>Routing Configuration</h4>
                <p>Inspect and fine-tune Nginx virtual host directives, location blocks, and rewrite rules.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="routing">Edit Routing</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('lock')}</div>
              <div class="op-card-copy">
                <h4>HTTPS &amp; Certificates</h4>
                <p>Review active origin SSL certificates, install custom certificates, and check expiry dates.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="https">Manage TLS</button>
            </div>
          </div>
          <div class="op-card">
            <div class="op-card-header">
              <div class="op-card-icon">${icon('disk')}</div>
              <div class="op-card-copy">
                <h4>Configuration Backups</h4>
                <p>Restore previous verified virtual host and proxy configuration snapshots on demand.</p>
              </div>
            </div>
            <div class="op-card-footer">
              <button class="button secondary small existing-task" data-tab="backups">View Backups</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  $('#website-detail').innerHTML=`${heroHtml}${archHtml}${configShelfHtml}${operationsHtml}`;

  // Event bindings
  $$('.existing-task').forEach(b=>b.onclick=action(()=>openWebsite(s.id,b.dataset.tab)));
  $$('.hybrid-config-pill').forEach(b=>b.onclick=()=>openWebsite(s.id,'configs',b.dataset.configFile));
  bind('overview-inspect-all-configs',()=>openWebsite(s.id,'configs'));
  bind('hero-btn-code',()=>openWebsite(s.id,'code'));
  bind('arch-open-code-btn',()=>openWebsite(s.id,'code'));
  bind('hero-btn-configs',()=>openWebsite(s.id,'configs'));
  bind('hero-btn-logs',()=>openWebsite(s.id,'logs'));
  bind('hero-btn-reload',()=>existingWebsiteAction(s,'reload'));
  bind('hero-btn-restart',async()=>{
    const unitName=s.nativeService?.unit||'openalgo.service';
    if(!await confirmOperation('Restart '+unitName+'?','This will restart the application service. Connected WebSocket clients will briefly reconnect.','Restart Now'))return;
    try{
      notify('Restarting service…');
      const r=await post('/api/websites/existing/service-restart',{id:s.id,confirm:true});
      notify(r.message||'Service restarted successfully.');
      setTimeout(()=>openWebsite(s.id,'overview'),1500);
    }catch(err){notify('Restart failed: '+err.message);}
  });
}

 if(tab==='overview')renderExistingOverview(s);
 if(tab==='code'){if(s.fileRoot){await websiteCode(s);if(s.filesStaged){$('#website-detail').insertAdjacentHTML('afterbegin',`<div class="access-notice"><div><strong>Staged website files</strong><p>These files are not live yet. Upload your website, then switch this site to the prepared folder.</p></div>${button('existing-files-activate','Use these files','play','primary')}</div>`);bind('existing-files-activate',async()=>{if(!canLeaveWebsite()||!await confirmOperation('Use prepared website files?',s.domains.join(', ')+' will start serving this folder. Its previous files are retained and the old routing is backed up.','Use these files'))return;await post('/api/websites/existing/files/activate',{id:s.id,revision:s.revision,confirm:true});await openWebsite(s.id,'code');});}}else{$('#website-detail').innerHTML=`<div class="card card-pad"><h2>${s.upstreams.length?'Application files':'Prepare website files'}</h2><p>${s.upstreams.length?'This site forwards traffic to an upstream application. Manage its application container in Docker.':'The current root is inside the web-engine image and has no host folder to edit. Prepare a separate folder, upload your website, then activate it. Preparing files does not change the running website.'}</p><div class="form-actions">${s.upstreams.length?button('existing-open-docker','Open Docker','docker'):button('existing-files-prepare','Prepare editable folder','folder','primary')}</div></div>`;bind('existing-open-docker',()=>route('docker'));bind('existing-files-prepare',async()=>{await post('/api/websites/existing/files/prepare',{id:s.id,revision:s.revision,confirm:true});await openWebsite(s.id,'code');});}}
 if(tab==='configs')await existingConfigs(s,extra);if(tab==='settings')existingSettings(s);if(tab==='routing')existingRouting(s);
 if(tab==='logs'){await websiteLogs(s);const runtime=$('#site-log-kind option[value=runtime]');if(runtime)runtime.remove();$('#site-log-kind').value='access';$('#site-log-kind').dispatchEvent(new Event('change'));}
 if(tab==='backups')await existingConfigBackups(s);
 if(tab==='https')existingHTTPS(s);
}
async function existingWebsiteAction(s,action){if(!canLeaveWebsite())return;const label=action==='reload'?'Test & reload':action==='disable'?'Disable website':'Enable website';if(!await confirmOperation(label+'?',action==='reload'?'Test the complete web-engine configuration and gracefully reload it. All websites share this engine.':`${action==='disable'?'Disable':'Enable'} ${s.domains.join(', ')}. Files and upstream containers are retained.`,label))return;await post('/api/websites/existing/action',{id:s.id,action,revision:s.revision,confirm:true});await openWebsite(s.id);notify(label+' completed.');}
function existingRouting(s){$('#website-detail').innerHTML=`<div class="card website-code-card"><div class="toolbar"><h2>Routing configuration</h2>${button('existing-config-save','Test & save','check','primary')}</div><div class="website-config-layout"><label>Configuration file<select id="existing-config-file">${s.configFiles.map((f,i)=>`<option value="${i}">${esc(f.path)}</option>`).join('')}</select></label><p id="existing-config-notice" class="field-help"></p><div id="existing-config-editor" class="website-config-editor"></div><p class="field-help">Advanced web-server configuration. Changes can affect routing, filesystem access and security. Saving an enabled site tests and gracefully reloads the shared engine. A disabled site is checked when enabled.</p></div></div>`;function select(){disposeWebsiteEditor();const f=s.configFiles[Number($('#existing-config-file').value)];$('#existing-config-editor').innerHTML='';websiteEditor=PanelTools.editor($('#existing-config-editor'),f.text,'nginx.conf',()=>{websiteDirty=true;});$('#existing-config-save').disabled=!f.editable;$('#existing-config-notice').textContent=f.editable?'A private backup is kept for every save.':'Sensitive lines are hidden. This file is read-only to preserve protected values.';}$('#existing-config-file').onchange=()=>{if(canLeaveWebsite())select();};select();bind('existing-config-save',async()=>{const f=s.configFiles[Number($('#existing-config-file').value)],text=websiteEditor.getText();if(!await confirmOperation('Save routing configuration?',`Save ${f.path}${s.enabled?' and reload the shared web engine after validation':'. It will be validated when this website is enabled'}.`,'Save configuration'))return;await post('/api/websites/existing/config',{id:s.id,file:f.key,revision:s.revision,text,confirm:true});websiteDirty=false;await openWebsite(s.id,'routing');notify('Configuration saved with a private backup.');});}
async function existingConfigBackups(s){const rows=await api('/api/websites/existing/history?id='+s.id);$('#website-detail').innerHTML=`<div class="card management-card"><div class="toolbar"><h2>Configuration backups</h2></div><div class="table-wrap"><table class="management-table"><thead><tr><th>Saved</th><th>File</th><th>Action</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(new Date(r.time).toLocaleString())}</td><td><code>${esc(r.path)}</code></td><td><button class="button secondary existing-config-restore" data-index="${i}">Restore</button></td></tr>`).join('')||'<tr><td colspan="3">Backups appear after a configuration change.</td></tr>'}</tbody></table></div></div>`;$$('.existing-config-restore').forEach(b=>b.onclick=action(async()=>{if(!await confirmOperation('Restore configuration?',`Restore ${rows[Number(b.dataset.index)].path}. The current file is backed up before replacement; enabled sites are tested and reloaded.`,'Restore'))return;await post('/api/websites/existing/restore',{id:s.id,backup:rows[Number(b.dataset.index)].id,revision:s.revision,confirm:true});await openWebsite(s.id,'backups');notify('Configuration restored.');}));}
function existingHTTPS(s){
  const cfNotice=`<div class="card card-pad" style="border-left: 4px solid var(--accent, #3b82f6); background: rgba(59,130,246,0.06); margin-bottom: 16px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="font-size:20px">☁️</span>
      <strong style="font-size:15px">Cloudflare Tunnel Edge SSL Active</strong>
      ${pill('Origin: Loopback HTTP','green')}
    </div>
    <p style="margin:0;line-height:1.5;color:var(--text, #e2e8f0)">
      Cloudflare Tunnel secures incoming connections to <strong>${esc(s.domains.join(', '))}</strong> at Cloudflare Edge.
      Your server runs on loopback HTTP without needing port 80/443 open or manual ACME renewals.
    </p>
  </div>`;
  $('#website-detail').innerHTML=`${cfNotice}<div class="card"><div class="card-header"><h2>Origin HTTPS certificate (Optional Direct-IP)</h2>${pill(s.tls?'HTTPS':d.engine?.listenAddresses?'Local HTTP':'HTTP',s.tls?'green':'')}</div><div class="card-pad"><p>${s.certificatePaths.map(esc).join('<br>')||'No origin certificate was detected. Cloudflare Tunnel handles HTTPS at the edge.'}</p>${s.tls&&!s.certificateReplaceAvailable?`<p class="notice warning">${esc(s.certificateNote||'Certificate files cannot be safely replaced from this site.')}</p>`:''}<p class="field-help">Cloudflare edge HTTPS and the certificate on this server are separate. Under Cloudflare Tunnel, an origin certificate is not required.</p>${s.certificateReplaceAvailable?`<form id="existing-tls-form"><label>New certificate chain (PEM)<textarea id="existing-tls-cert" required spellcheck="false" autocomplete="off"></textarea></label><label>New private key (PEM)<textarea id="existing-tls-key" required spellcheck="false" autocomplete="off"></textarea></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Validate & replace certificate</button></div></form>`:''}</div></div>`;form('existing-tls-form',async()=>{const certificate=$('#existing-tls-cert').value,privateKey=$('#existing-tls-key').value;if(!await confirmOperation('Replace origin certificate?','Validate the certificate, domain coverage and matching key. Replace the detected files and reload the enabled website. The previous pair is restored if validation or reload fails.','Replace certificate'))return;await post('/api/websites/existing/certificate',{id:s.id,certificate,privateKey,revision:s.revision,tlsRevision:s.tlsRevision,confirm:true});$('#existing-tls-key').value='';notify('Certificate replaced.');await openWebsite(s.id,'https');});
}

function existingSettings(s){$('#website-detail').innerHTML=`<div class="card"><div class="card-header"><h2>Domains & upstream</h2></div><form id="existing-settings-form" class="card-pad"><label>Domain names<textarea id="existing-domains" rows="3" required>${esc(s.domains.join('\n'))}</textarea></label>${s.kind==='Reverse proxy'&&s.upstreams.length===1?`<label>Application upstream<input id="existing-upstream" type="url" value="${esc(s.upstreams[0])}" required><span class="field-help">Example: http://127.0.0.1:5678. This changes routing; it does not start or reconfigure the application container.</span></label>`:''}<p class="field-help">DNS and Cloudflare hostnames must be updated separately. Multiple server blocks and location-specific upstreams are managed in Routing configuration.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Test & save settings</button></div></form></div>`;form('existing-settings-form',async()=>{const b={id:s.id,domains:$('#existing-domains').value,revision:s.revision,confirm:true};if($('#existing-upstream'))b.upstream=$('#existing-upstream').value;if(!await confirmOperation('Apply website settings?',s.domains.join(', ')+': update domains and routing, validate the enabled site and gracefully reload the shared engine.','Apply settings'))return;const result=await post('/api/websites/existing/settings',b);if(result.panelAccess?.warning)notify('Routing saved. '+result.panelAccess.warning);else if(result.panelAccess?.verified){if(result.panelAccess.origin!==location.origin&&!['127.0.0.1','localhost'].includes(location.hostname)){openModal('Panel address applied',`<div class="modal-body"><p>Website routing and panel access are configured.</p><a href="${esc(result.panelAccess.origin)}">Open your panel at its new address</a></div>`);return;}notify('Panel address verified and applied.');}await openWebsite(s.id,'settings');if(!result.panelAccess)notify('Website settings saved.');});}

function renderWebEngine(d){const e=d.webEngine;$('#websites-content').innerHTML=`<div class="card management-card"><div class="toolbar"><h2>Web engine</h2>${pill(e.installed?e.state:d.engine?'Existing engine detected':'Not installed',e.state==='active'?'green':'')}</div><div class="card-pad"><p>${e.installed?'Native Nginx '+esc(e.version||'')+' · '+esc(e.service):d.engine?'Your existing '+esc(d.engine.name)+' is reused.':'Native Nginx can be installed from the host’s signed package repositories. It runs without a Docker web-engine container.'}</p><p class="field-help">CyberPross-managed origin listeners use loopback HTTP. Cloudflare supplies public HTTPS; a local certificate is optional when you explicitly configure an HTTPS origin.</p><div class="row-actions">${!e.installed&&!d.engine?button('web-engine-install','Automatic setup','plus','primary')+button('web-engine-review','Review installation',null):e.installed?['start','stop','restart','reload'].map(a=>button('web-engine-'+a,a[0].toUpperCase()+a.slice(1),a==='stop'?'stop':'play',a==='start'?'primary':'secondary')).join(''):''}</div><label class="checkbox-label detail-heading"><input id="web-engine-auto" type="checkbox" ${e.autoInstall?'checked':''}>Automatically install a missing web engine when the installed panel starts</label><p class="field-help">Disabled by default. This does not start a deliberately stopped, already-installed engine. Existing compatible web engines are reused. Installation and service jobs are tracked under Tasks.</p></div></div><div class="card management-card detail-heading"><div class="toolbar"><h2>Recover website routes</h2>${button('web-route-manual','Add route manually','plus')}</div><p class="card-pad field-help">Recover preserved static files or point a domain at an application that is already running. Recovered routes and files live in CyberPross-owned directories; web-engine reinstallation can rebuild the saved routes.</p><div class="table-wrap"><table class="management-table"><thead><tr><th>Preserved website</th><th>Static files</th><th>Action</th></tr></thead><tbody>${e.recoveryCandidates.map(c=>`<tr><td><strong>${esc(c.domain)}</strong></td><td>${c.staticFiles||'None detected'}</td><td>${e.registeredRoutes?.some(r=>r.domain===c.domain)?pill('Recovered','green'):`<button class="button secondary small web-route-recover" data-domain="${esc(c.domain)}">Configure recovery</button>`}</td></tr>`).join('')||'<tr><td colspan="3">No preserved legacy website folders detected. You can add a route manually.</td></tr>'}</tbody></table></div></div>`;
 const review=async()=>{const plan=await post('/api/web-engine/prepare',{confirm:true});openModal('Native web-engine installation',`<div class="modal-body"><p>${esc(plan.description)}</p><div class="table-wrap"><table><thead><tr><th>Package</th><th>Version</th></tr></thead><tbody>${plan.changes.map(p=>`<tr><td>${esc(p.package)}</td><td>${esc(p.version)}</td></tr>`).join('')||'<tr><td colspan="2">No package changes required.</td></tr>'}</tbody></table></div><p class="field-help">Installation rechecks repository metadata and refuses package removal. HTTP port 80 must be available. The panel’s configured domain is restored automatically if it has no saved route.</p></div><div class="form-actions">${button('web-engine-do-install','Install & configure',null,'primary')}</div>`);bind('web-engine-do-install',async()=>{watch(await post('/api/web-engine/install',{confirm:true,restorePanel:true}),null,()=>view==='websites'?websitesPage(generation):undefined);});};bind('web-engine-review',review);bind('web-engine-install',async()=>{if(await confirmOperation('Install native Nginx?','Install from signed APT repositories, create private HTTP listeners and restore the panel route. Application containers and the Cloudflare Tunnel will not be restarted.','Install automatically'))watch(await post('/api/web-engine/install',{confirm:true,restorePanel:true}),null,()=>view==='websites'?websitesPage(generation):undefined);});
 $('#web-engine-auto').onchange=action(async()=>{const wanted=$('#web-engine-auto').checked;try{await post('/api/web-engine/settings',{autoInstall:wanted,confirm:true});notify(wanted?'Automatic installation enabled.':'Automatic installation disabled.');}catch(error){$('#web-engine-auto').checked=!wanted;throw error;}});
 for(const a of ['start','stop','restart','reload'])bind('web-engine-'+a,async()=>{if(await confirmOperation(a[0].toUpperCase()+a.slice(1)+' web engine?',a==='stop'?'All websites using this engine, including the panel’s public domain, will stop responding. Keep direct access to http://127.0.0.1:8787 available so you can start it again.':'Nginx configuration will be validated before this service operation.',a[0].toUpperCase()+a.slice(1)))watch(await post('/api/web-engine/action',{action:a,confirm:true}),null,()=>view==='websites'?websitesPage(generation):undefined);});bind('web-route-manual',()=>webEngineRecoverDialog(null));$$('.web-route-recover').forEach(b=>b.onclick=()=>webEngineRecoverDialog(e.recoveryCandidates.find(c=>c.domain===b.dataset.domain)));
}
function webEngineRecoverDialog(candidate){openModal('Recover website route',`<form id="web-route-recovery"><div class="modal-body"><label>Domain<input id="web-recover-domain" value="${esc(candidate?.domain||'')}" placeholder="app.example.com" required></label><label>Website type<select id="web-recover-type"><option value="proxy">Reverse proxy to an existing application</option value="static" ${candidate?.staticFiles?'selected':''}>Static website</option></select></label><label>Application upstream<input id="web-recover-upstream" type="url" placeholder="http://127.0.0.1:5678"></label>${candidate?.staticFiles?'<label class="checkbox-label"><input id="web-recover-files" type="checkbox" checked>Copy preserved static files into CyberPross storage</label>':''}<p class="field-help">Choose the actual application address; domain names alone do not prove an upstream. Unrelated routes are not overwritten; existing CyberPross recovery routes can be updated. DNS/tunnel hostnames must already route here.</p><p class="form-error" role="alert"></p></div><div class="form-actions"><button class="button" type="submit">Validate & recover</button></div></form>`);form('web-route-recovery',async()=>{const type=$('#web-recover-type').value,route={domain:$('#web-recover-domain').value.trim(),type,...(type==='proxy'?{upstream:$('#web-recover-upstream').value.trim()}:{}),copyStatic:type==='static'&&!!$('#web-recover-files')?.checked};watch(await post('/api/web-engine/recover',{routes:[route],confirm:true}),null,()=>view==='websites'?websitesPage(generation):undefined);});}

async function existingConfigs(s, selectedFileName = null) {
  const configs = s.detectedConfigs || [];
  if (!configs.length) {
    $('#website-detail').innerHTML = `<div class="card card-pad">${empty("No project configuration files detected", "Scanning project workspace: configuration files (.env, app.py, pyproject.toml, package.json, unit files) will appear here when detected.", "file")}</div>`;
    return;
  }
  const selected = selectedFileName || configs[0].name;

  $('#website-detail').innerHTML = `
    <div class="card website-code-card">
      <div class="toolbar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 18px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <label style="margin:0;font-size:12px;font-weight:600;display:flex;align-items:center;gap:8px;">Configuration file:
            <select id="existing-config-select" class="filters-select" style="min-width:240px;font-family:monospace;font-size:12px;">
              ${configs.map(cf => `<option value="${esc(cf.name)}" ${cf.name === selected ? "selected" : ""}>${esc(cf.name)} (${Math.round((cf.size||0)/1024)} KB)</option>`).join("")}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin:0;cursor:pointer;">
            <input type="checkbox" id="unmask-config-secrets" style="margin:0;">
            <span>Reveal Secrets (Admin)</span>
          </label>
        </div>
        <div class="row-actions" style="margin-left:auto;display:flex;align-items:center;gap:8px;">
          <button id="copy-existing-config-btn" class="button secondary small" type="button">${icon("copy")} Copy</button>
          <button id="jump-to-code-btn" class="button secondary small" type="button">${icon("folder")} Edit in Files &amp; Code</button>
        </div>
      </div>
      <div style="padding:8px 18px;background:#3b82f612;border-bottom:1px solid var(--line);font-size:11px;color:var(--text);display:flex;align-items:center;justify-content:space-between;">
        <span>🛡️ <strong>Zero-Trust Configuration Inspector:</strong> Sensitive credentials (API keys, passwords, tokens) in environment files are masked by default.</span>
        <span id="config-path-indicator" style="font-family:monospace;color:var(--muted);"></span>
      </div>
      <div style="background:#0d1117;color:#c9d1d9;padding:16px 20px;max-height:560px;overflow:auto;">
        <pre id="existing-config-viewer" style="margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">Reading configuration…</pre>
      </div>
    </div>
  `;

  bind("jump-to-code-btn", () => openWebsite(s.id, "code"));

  const loadViewer = async (fileName, unmask = false) => {
    const viewer = $('#existing-config-viewer');
    const pathInd = $('#config-path-indicator');
    if (!viewer) return;
    viewer.textContent = "Reading configuration…";
    try {
      const res = await api(`/api/websites/existing/config-file?id=${encodeURIComponent(s.id)}&file=${encodeURIComponent(fileName)}&unmask=${unmask ? "true" : "false"}`);
      if (pathInd) pathInd.textContent = res.path || fileName;
      viewer.textContent = res.content || "# Empty configuration file";
    } catch (err) {
      viewer.textContent = `# Error reading configuration:\n# ${err.message}`;
    }
  };

  const sel = $('#existing-config-select');
  const toggle = $('#unmask-config-secrets');
  if (sel) sel.onchange = () => loadViewer(sel.value, toggle?.checked);
  if (toggle) toggle.onchange = () => loadViewer(sel?.value || selected, toggle?.checked);

  bind("copy-existing-config-btn", () => {
    const text = $('#existing-config-viewer')?.textContent;
    if (text) {
      navigator.clipboard.writeText(text);
      notify("Configuration copied to clipboard.");
    }
  });

  await loadViewer(selected, false);
}
