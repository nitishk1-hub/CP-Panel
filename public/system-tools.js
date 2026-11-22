let systemToolCleanup=null,fileDirectory='.',editorHandle=null;
function disposeSystemTools(){if(systemToolCleanup){systemToolCleanup();systemToolCleanup=null;}}
async function terminalPage(){
 const target=$('#system-content');
 let savedTheme='cyberdark',savedCursor='block',savedFont=14,customSnippets=[];
 try{
  savedTheme=localStorage.getItem('panel-term-theme')||'cyberdark';
  savedCursor=localStorage.getItem('panel-term-cursor')||'block';
  savedFont=Number(localStorage.getItem('panel-term-font'))||14;
  customSnippets=JSON.parse(localStorage.getItem('panel-term-snippets')||'[]');
 }catch{}
 const defaultRunbooks=[
  {cat:'Process & Load',title:'Interactive Process Viewer',cmd:'htop || top'},
  {cat:'Process & Load',title:'Top 15 Memory-Consuming Processes',cmd:'ps aux --sort=-%mem | head -n 16'},
  {cat:'Process & Load',title:'System Load, Uptime & Memory Summary',cmd:'uptime && echo "---" && free -h'},
  {cat:'Docker',title:'Running Containers & Published Ports',cmd:'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"'},
  {cat:'Docker',title:'Live Container CPU / RAM Stream (One-shot)',cmd:'docker stats --no-stream'},
  {cat:'Network & Ports',title:'All Listening TCP/UDP Sockets & PIDs',cmd:'ss -tulpn'},
  {cat:'Network & Ports',title:'Active HTTPS (443) Connections',cmd:'ss -tn state established "( dport = :443 or sport = :443 )"'},
  {cat:'Network & Ports',title:'WireGuard VPN Interfaces & Handshakes',cmd:'wg show'},
  {cat:'Storage',title:'Filesystem Capacity & Usage',cmd:'df -hT -x tmpfs -x devtmpfs'},
  {cat:'Storage',title:'Top 15 Largest Directories in /var',cmd:'du -xh /var 2>/dev/null | sort -hr | head -n 15'},
  {cat:'Services & Logs',title:'Failed Systemd Units',cmd:'systemctl --failed --no-pager'},
  {cat:'Services & Logs',title:'Follow Live System Journal',cmd:'journalctl -f -n 30'},
  {cat:'Services & Logs',title:'Nginx Configuration Test & Status',cmd:'nginx -t && systemctl status nginx --no-pager'},
  {cat:'Security',title:'UFW Firewall Numbered Rules',cmd:'ufw status numbered'},
  {cat:'Security',title:'CrowdSec Active Decisions (Bans)',cmd:'cscli decisions list'},
  {cat:'Security',title:'Recent SSH Auth Logins & Failures',cmd:'journalctl -u ssh -n 40 --no-pager'}
 ];
 target.innerHTML=`<div class="term-ide card" id="term-ide">
  <div class="term-ide-bar">
   <div class="term-tabs-wrap">
    <div class="term-tabs" id="term-tabs" role="tablist" aria-label="Terminal sessions"></div>
    <div class="term-add-group">
     <button id="term-new-tab" class="term-bar-btn" type="button" title="New Host Shell (Alt+N)" aria-label="New Host Shell">${icon('plus')}</button>
     <button id="term-target-btn" class="term-bar-btn term-caret-btn" type="button" title="Open Container Shell or Split Preset" aria-label="Shell targets">▾</button>
     <div id="term-target-menu" class="term-popover term-target-menu" hidden></div>
    </div>
   </div>
   <div class="term-ide-actions">
    <button id="term-palette-btn" class="term-pill-btn" type="button" title="Command Palette, Snippets &amp; AI Shell Assistant (Ctrl+K)"><span>⌘K</span><span>Command Palette &amp; AI</span></button>
    <button id="term-split-btn" class="term-bar-btn" type="button" title="Toggle Side-by-Side Split View (Alt+S)">◫ Split</button>
    <button id="term-broadcast-btn" class="term-bar-btn" type="button" title="Broadcast keystrokes to all open sessions">📡 Broadcast</button>
    <button id="term-search-btn" class="term-bar-btn" type="button" title="Find in terminal (Ctrl+F)" aria-label="Search terminal">${icon('search')}</button>
    <div class="term-settings-wrap">
     <button id="term-settings-btn" class="term-bar-btn" type="button" title="Terminal Preferences &amp; Session Export" aria-label="Terminal preferences">⚙</button>
     <div id="term-settings-popover" class="term-popover term-settings-popover" hidden>
      <div class="term-pop-head"><strong>Terminal Preferences</strong></div>
      <label>Color Theme<select id="terminal-theme"><option value="cyberdark" ${savedTheme==='cyberdark'?'selected':''}>CyberDark</option><option value="midnight" ${savedTheme==='midnight'?'selected':''}>Midnight Blue</option><option value="solarized" ${savedTheme==='solarized'?'selected':''}>Solarized Dark</option><option value="matrix" ${savedTheme==='matrix'?'selected':''}>Matrix Green</option><option value="light" ${savedTheme==='light'?'selected':''}>Paper Light</option></select></label>
      <label>Cursor Style<select id="terminal-cursor"><option value="block" ${savedCursor==='block'?'selected':''}>Block █</option><option value="bar" ${savedCursor==='bar'?'selected':''}>Vertical Bar |</option><option value="underline" ${savedCursor==='underline'?'selected':''}>Underline _</option></select></label>
      <div class="term-pop-row"><span>Font Size (<strong id="term-font-label">${savedFont}px</strong>)</span><div class="row-actions"><button id="terminal-font-dec" class="button secondary small" type="button">A−</button><button id="terminal-font-inc" class="button secondary small" type="button">A+</button></div></div>
      <div class="term-pop-actions">
       <button id="terminal-clear" class="button secondary small" type="button">Clear Pane</button>
       <button id="terminal-reconnect" class="button secondary small" type="button">Reconnect</button>
       <button id="terminal-download" class="button primary small" type="button">${icon('download')}Export .log</button>
      </div>
     </div>
    </div>
    <button id="terminal-fullscreen" class="term-bar-btn" type="button" title="Toggle Fullscreen">⛶</button>
   </div>
  </div>
  <div class="term-viewport-area" id="term-viewport-area">
   <div id="term-search-overlay" class="term-search-overlay" hidden>
    <input id="terminal-search" type="search" placeholder="Find in active pane…" autocomplete="off">
    <button id="terminal-find-prev" class="term-bar-btn" type="button" title="Previous match">↑</button>
    <button id="terminal-find" class="term-bar-btn" type="button" title="Next match">↓</button>
    <button id="term-search-close" class="term-bar-btn" type="button" title="Close search">✕</button>
   </div>
   <div id="term-palette-overlay" class="term-palette-overlay" hidden>
    <div class="term-palette-box">
     <div class="term-palette-head">
      <strong>⌘K Command Palette, Runbooks &amp; AI Shell Generator</strong>
      <button id="term-palette-close" class="icon-button" type="button" aria-label="Close palette">${icon('close')}</button>
     </div>
     <form id="term-ai-form" class="term-palette-input-row">
      <input id="term-palette-input" placeholder="Search runbooks, or describe a command for AI to generate (e.g. 'find files over 100MB in /var')…" autocomplete="off">
      <button type="submit" class="button primary small">✨ AI Generate</button>
      <button id="term-save-snippet" type="button" class="button secondary small" title="Save input as reusable snippet">+ Save Snippet</button>
     </form>
     <div id="term-ai-suggestion" class="term-ai-suggestion" hidden></div>
     <div id="term-palette-list" class="term-palette-list"></div>
    </div>
   </div>
   <div class="term-panes" id="term-panes"></div>
  </div>
  <div class="term-ide-footer">
   <span id="terminal-status-host"><i class="status-dot"></i> Initializing session…</span>
   <span id="term-status-mode">Single Pane · Broadcast Off</span>
   <span id="terminal-status-dims">Geometry: —</span>
   <span class="term-shortcuts-hint"><code>Ctrl+K</code> Command Palette &amp; AI · <code>Ctrl+F</code> Find · <code>Alt+N</code> New Tab · <code>Alt+S</code> Split</span>
  </div>
 </div>`;

 let sessions=[],activeId=null,splitMode=false,broadcastMode=false,disposed=false,seq=1;
 const panesEl=$('#term-panes'),tabsEl=$('#term-tabs');

 function activeSession(){return sessions.find(s=>s.id===activeId)||sessions[0]||null;}
 function visibleSessions(){
  if(!sessions.length)return [];
  const act=activeSession();
  if(!splitMode||sessions.length<2)return [act];
  const second=sessions.find(s=>s.id!==act.id)||sessions[0];
  return [act,second];
 }

 function updateFooter(){
  if(disposed)return;
  const s=activeSession();
  if($('#terminal-status-host')){
   const dot=s?.connected?'<i class="status-dot"></i>':'<i class="status-dot" style="background:var(--amber)"></i>';
   $('#terminal-status-host').innerHTML=`${dot} ${esc(s?.hostLabel||s?.title||'Disconnected')} (${sessions.length} session${sessions.length===1?'':'s'})`;
  }
  if($('#term-status-mode')){
   $('#term-status-mode').textContent=`${splitMode&&sessions.length>1?'Split View (2 Panes)':'Single Pane'} · Broadcast: ${broadcastMode?'ON':'OFF'}`;
  }
  if(s&&$('#terminal-status-dims')){
   $('#terminal-status-dims').textContent=`${s.widget.term.cols} × ${s.widget.term.rows} · ${savedFont}px`;
  }
 }

 function renderTabsAndPanes(){
  if(disposed)return;
  const vis=visibleSessions();
  const visIds=new Set(vis.map(v=>v.id));
  tabsEl.innerHTML=sessions.map(s=>`<div class="term-tab ${s.id===activeId?'active':''} ${visIds.has(s.id)&&splitMode&&s.id!==activeId?'split-peer':''}" data-tab-id="${s.id}"><span class="term-tab-dot ${s.connected?'online':''}"></span><button type="button" class="term-tab-select" data-select-id="${s.id}">${esc(s.title)}</button>${sessions.length>1?`<button type="button" class="term-tab-close" data-close-id="${s.id}" title="Close session">✕</button>`:''}</div>`).join('');
  panesEl.classList.toggle('is-split',splitMode&&vis.length>1);
  sessions.forEach(s=>{
   const isVis=visIds.has(s.id);
   s.paneEl.hidden=!isVis;
   s.paneEl.classList.toggle('active-pane',s.id===activeId);
   if(isVis)requestAnimationFrame(()=>{try{s.widget.fit.fit();}catch{}});
  });
  $$('[data-select-id]').forEach(b=>b.onclick=()=>{activeId=Number(b.dataset.selectId);renderTabsAndPanes();activeSession()?.widget.term.focus();});
  $$('[data-close-id]').forEach(b=>b.onclick=e=>{e.stopPropagation();closeSession(Number(b.dataset.closeId));});
  $('#term-split-btn')?.classList.toggle('active',splitMode);
  $('#term-broadcast-btn')?.classList.toggle('active',broadcastMode);
  updateFooter();
 }

 async function connectSession(s,initialCommand=null){
  if(initialCommand)s.pendingCmd=initialCommand;
  if(s.socket&&s.socket.readyState===1){
   if(s.pendingCmd){const c=s.pendingCmd;s.pendingCmd=null;s.socket.send(JSON.stringify({type:'input',data:c+'\r'}));}
   return;
  }
  if(s.socket&&s.socket.readyState===0)return;
  try{
   const info=await post('/api/terminal/session');
   if(disposed||s.closed)return;
   const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/terminal/socket`,['panel-terminal',info.ticket]);
   s.socket=ws;
   ws.onopen=()=>{if(disposed||s.closed)return;s.widget.fit.fit();if(s.id===activeId)s.widget.term.focus();};
   ws.onmessage=e=>{
    if(disposed||s.closed)return;
    const m=JSON.parse(e.data);
    if(m.type==='output'){
     s.widget.term.write(m.data);
     s.log+=m.data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,'');
     if(s.log.length>512000)s.log=s.log.slice(-512000);
    }
    if(m.type==='ready'){
     s.connected=true;
     s.hostLabel=`${m.user}@${m.hostname}`;
     ws.send(JSON.stringify({type:'resize',cols:s.widget.term.cols,rows:s.widget.term.rows}));
     if(s.pendingCmd){const c=s.pendingCmd;s.pendingCmd=null;setTimeout(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'input',data:c+'\r'}));},120);}
     renderTabsAndPanes();
    }
    if(m.type==='error')s.widget.term.writeln('\r\n'+m.message);
    if(m.type==='exit'){s.connected=false;s.widget.term.writeln('\r\n[Process exited · code '+m.code+']');renderTabsAndPanes();}
   };
   ws.onclose=()=>{s.connected=false;if(!disposed&&!s.closed)renderTabsAndPanes();};
   ws.onerror=()=>{s.connected=false;if(!disposed&&!s.closed)renderTabsAndPanes();};
  }catch(e){
   notify(e.message);
  }
 }

 async function createSession({title=null,initialCommand=null,split=false}={}){
  if(sessions.length>=8){notify('Maximum of 8 concurrent terminal tabs reached.');return;}
  const id=seq++;
  const paneEl=document.createElement('div');
  paneEl.className='term-pane';
  paneEl.onmousedown=()=>{if(activeId!==id){activeId=id;renderTabsAndPanes();}};
  panesEl.appendChild(paneEl);
  const widget=PanelTools.terminal(paneEl,{theme:savedTheme,cursorStyle:savedCursor,fontSize:savedFont});
  const s={id,title:title||`bash #${id}`,paneEl,widget,socket:null,connected:false,closed:false,hostLabel:'',pendingCmd:initialCommand,log:''};
  s.inputSub=widget.term.onData(data=>{
   if(broadcastMode){
    sessions.forEach(peer=>{if(peer.socket?.readyState===1)peer.socket.send(JSON.stringify({type:'input',data}));});
   }else if(s.socket?.readyState===1){
    s.socket.send(JSON.stringify({type:'input',data}));
   }
  });
  s.resizeSub=widget.term.onResize(({cols,rows})=>{
   if(s.socket?.readyState===1)s.socket.send(JSON.stringify({type:'resize',cols,rows}));
   if(s.id===activeId)updateFooter();
  });
  sessions.push(s);
  activeId=id;
  if(split&&sessions.length>1)splitMode=true;
  renderTabsAndPanes();
  await connectSession(s,initialCommand);
  return s;
 }

 function closeSession(id){
  const idx=sessions.findIndex(s=>s.id===id);
  if(idx<0)return;
  const s=sessions[idx];
  s.closed=true;
  try{s.socket?.close();}catch{}
  s.inputSub?.dispose();
  s.resizeSub?.dispose();
  s.widget?.dispose();
  s.paneEl?.remove();
  sessions.splice(idx,1);
  if(activeId===id)activeId=sessions[Math.max(0,idx-1)]?.id||null;
  if(sessions.length<2)splitMode=false;
  renderTabsAndPanes();
 }

 function sendToActive(cmd,newline=true){
  const s=activeSession();
  if(!s)return;
  if(s.socket?.readyState===1){
   s.socket.send(JSON.stringify({type:'input',data:cmd+(newline?'\r':'')}));
   s.widget.term.focus();
  }else{
   connectSession(s,cmd);
  }
 }

 // Target dropdown menu (Host shell, Split presets, or Container shells)
 async function openTargetMenu(){
  const menu=$('#term-target-menu');
  if(!menu.hidden){menu.hidden=true;return;}
  menu.hidden=false;
  menu.innerHTML='<div class="term-pop-head"><strong>Launch Shell Target</strong></div><button type="button" class="term-menu-item" data-target-cmd=""><span>💻 New Host Root Shell (bash)</span></button><button type="button" class="term-menu-item" data-target-split="htop || top"><span>◫ Split Pane: Live Resource Monitor (htop)</span></button><button type="button" class="term-menu-item" data-target-split="journalctl -f -n 25"><span>◫ Split Pane: Live System Journal</span></button><div class="term-pop-head"><strong>Attach to Running Container</strong></div><div id="term-container-targets" class="muted tiny" style="padding:6px 10px">Loading containers…</div>';
  const bindItems=()=>{
   menu.querySelectorAll('[data-target-cmd]').forEach(b=>b.onclick=()=>{menu.hidden=true;createSession({title:b.dataset.targetTitle||null,initialCommand:b.dataset.targetCmd||null});});
   menu.querySelectorAll('[data-target-split]').forEach(b=>b.onclick=()=>{menu.hidden=true;createSession({title:'Monitor',initialCommand:b.dataset.targetSplit,split:true});});
  };
  bindItems();
  try{
   const d=await api('/api/docker');
   const running=(d.containers||[]).filter(c=>c.State==='running');
   const slot=$('#term-container-targets');
   if(slot){
    slot.outerHTML=running.length?running.map(c=>`<button type="button" class="term-menu-item" data-target-title="🐳 ${esc(c.Names)}" data-target-cmd="docker exec -it ${esc(c.Names)} /bin/sh -c 'if command -v bash >/dev/null; then exec bash; else exec sh; fi'"><span>🐳 ${esc(c.Names)}</span><small class="muted">${esc(c.Image.split(':')[0])}</small></button>`).join(''):'<div class="muted tiny" style="padding:6px 10px">No running containers</div>';
    bindItems();
   }
  }catch{}
 }

 // Command Palette & AI Shell Assistant
 function renderPaletteList(filter=''){
  const q=filter.toLowerCase().trim();
  const all=[
   ...customSnippets.map((c,i)=>({cat:'Saved Snippet',title:c.title||c.cmd,cmd:c.cmd,customIndex:i})),
   ...defaultRunbooks
  ].filter(r=>!q||(r.title+' '+r.cmd+' '+r.cat).toLowerCase().includes(q));
  $('#term-palette-list').innerHTML=all.map((r,i)=>`<div class="term-palette-row"><button type="button" class="term-palette-run" data-run-idx="${i}"><div><strong>${esc(r.title)}</strong> <span class="badge">${esc(r.cat)}</span></div><code>${esc(r.cmd)}</code></button>${r.customIndex!==undefined?`<button type="button" class="icon-button danger term-del-snip" data-del-snip="${r.customIndex}" title="Delete snippet">${icon('trash')}</button>`:''}</div>`).join('')||'<p class="muted card-pad">No matching runbooks. Press "✨ AI Generate" above to synthesize a command from your description.</p>';
  $$('[data-run-idx]').forEach(b=>b.onclick=()=>{
   const item=all[Number(b.dataset.runIdx)];
   $('#term-palette-overlay').hidden=true;
   sendToActive(item.cmd,true);
  });
  $$('[data-del-snip]').forEach(b=>b.onclick=e=>{
   e.stopPropagation();
   customSnippets.splice(Number(b.dataset.delSnip),1);
   try{localStorage.setItem('panel-term-snippets',JSON.stringify(customSnippets));}catch{}
   renderPaletteList($('#term-palette-input').value);
  });
 }

 function togglePalette(){
  const ov=$('#term-palette-overlay');
  ov.hidden=!ov.hidden;
  if(!ov.hidden){
   $('#term-ai-suggestion').hidden=true;
   renderPaletteList($('#term-palette-input').value);
   $('#term-palette-input').focus();
  }else{
   activeSession()?.widget.term.focus();
  }
 }

 bind('term-new-tab',()=>createSession());
 bind('term-target-btn',openTargetMenu);
 bind('term-palette-btn',togglePalette);
 bind('term-palette-close',()=>{$('#term-palette-overlay').hidden=true;activeSession()?.widget.term.focus();});
 $('#term-palette-input').oninput=e=>renderPaletteList(e.target.value);
 bind('term-save-snippet',()=>{
  const cmd=$('#term-palette-input').value.trim();
  if(!cmd)return notify('Type a command in the palette box first to save it as a snippet.');
  customSnippets.unshift({title:cmd.slice(0,48),cmd});
  try{localStorage.setItem('panel-term-snippets',JSON.stringify(customSnippets));}catch{}
  notify('Saved to your personal terminal snippets.');
  renderPaletteList('');
 });
 form('term-ai-form',async()=>{
  const q=$('#term-palette-input').value.trim();
  if(!q)return;
  const sug=$('#term-ai-suggestion');
  sug.hidden=false;
  sug.innerHTML='<span class="muted">Synthesizing shell command…</span>';
  const r=await post('/api/grafana/ai',{prompt:`Provide a single safe Linux bash one-liner command for Ubuntu server administration to accomplish: "${q}". Include the command inside backticks.`,confirm:true});
  const match=/`([^`\n]+)`/.exec(r.answer);
  const cmd=match?match[1]:q;
  sug.innerHTML=`<div class="term-ai-card"><div><strong>AI Suggested Command:</strong><code>${esc(cmd)}</code><p class="field-help">${esc(r.answer)}</p></div><div class="row-actions"><button type="button" id="term-ai-run" class="button primary small">${icon('play')}Run in Terminal</button></div></div>`;
  bind('term-ai-run',()=>{$('#term-palette-overlay').hidden=true;sendToActive(cmd,true);});
 });

 bind('term-split-btn',async()=>{
  if(!splitMode&&sessions.length<2){
   await createSession({title:`bash #${seq}`,split:true});
  }else{
   splitMode=!splitMode;
   renderTabsAndPanes();
  }
 });
 bind('term-broadcast-btn',()=>{
  broadcastMode=!broadcastMode;
  renderTabsAndPanes();
  notify(broadcastMode?'Broadcast mode ON: keystrokes are sent to all open terminal sessions.':'Broadcast mode OFF.');
 });
 bind('term-search-btn',()=>{
  const s=$('#term-search-overlay');
  s.hidden=!s.hidden;
  if(!s.hidden)$('#terminal-search').focus();
  else activeSession()?.widget.term.focus();
 });
 bind('term-search-close',()=>{$('#term-search-overlay').hidden=true;activeSession()?.widget.term.focus();});
 bind('terminal-find',()=>activeSession()?.widget.search.findNext($('#terminal-search').value));
 bind('terminal-find-prev',()=>activeSession()?.widget.search.findPrevious($('#terminal-search').value));
 $('#terminal-search').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();activeSession()?.widget.search.findNext($('#terminal-search').value);}};

 bind('term-settings-btn',()=>{$('#term-settings-popover').hidden=!$('#term-settings-popover').hidden;});
 $('#terminal-theme').onchange=()=>{
  savedTheme=$('#terminal-theme').value;
  sessions.forEach(s=>s.widget.setTheme(savedTheme));
  try{localStorage.setItem('panel-term-theme',savedTheme);}catch{}
 };
 $('#terminal-cursor').onchange=()=>{
  savedCursor=$('#terminal-cursor').value;
  sessions.forEach(s=>s.widget.setCursorStyle(savedCursor));
  try{localStorage.setItem('panel-term-cursor',savedCursor);}catch{}
 };
 const changeFont=delta=>{
  sessions.forEach(s=>{savedFont=s.widget.setFontSize(savedFont+delta);});
  if($('#term-font-label'))$('#term-font-label').textContent=savedFont+'px';
  updateFooter();
  try{localStorage.setItem('panel-term-font',String(savedFont));}catch{}
 };
 bind('terminal-font-dec',()=>changeFont(-1));
 bind('terminal-font-inc',()=>changeFont(1));
 bind('terminal-clear',()=>{const s=activeSession();if(s){s.widget.term.clear();sendToActive('\x0c',false);}$('#term-settings-popover').hidden=true;});
 bind('terminal-reconnect',()=>{const s=activeSession();if(s){try{s.socket?.close();}catch{}s.socket=null;connectSession(s);}$('#term-settings-popover').hidden=true;});
 bind('terminal-download',()=>{
  const s=activeSession();
  const blob=new Blob([s?.log||'No terminal output recorded in this pane yet.\n'],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(s?.title||'terminal').replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.log`;a.click();URL.revokeObjectURL(a.href);
  $('#term-settings-popover').hidden=true;
 });
 bind('terminal-fullscreen',()=>{
  const ide=$('#term-ide');
  ide.classList.toggle('terminal-expanded');
  sessions.forEach(s=>{try{s.widget.fit.fit();}catch{}});
  updateFooter();
 });

 const keyHandler=e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();togglePalette();}
  else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&document.activeElement?.closest('#term-ide')){e.preventDefault();$('#term-search-overlay').hidden=false;$('#terminal-search').focus();}
  else if(e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();createSession();}
  else if(e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();$('#term-split-btn').click();}
 };
 document.addEventListener('keydown',keyHandler);

 await createSession({title:'Host #1'});

 systemToolCleanup=()=>{
  disposed=true;
  document.removeEventListener('keydown',keyHandler);
  sessions.forEach(s=>{
   s.closed=true;
   try{s.socket?.close();}catch{}
   s.inputSub?.dispose();
   s.resizeSub?.dispose();
   s.widget?.dispose();
  });
  sessions=[];
 };
}
async function firewallPage(){const requestGeneration=generation;const f=await api('/api/firewall');if(requestGeneration!==generation||view!=='system'||sub!=='firewall')return;const rules=f.rules||[];const readable=f.available;const state=readable?(f.state==='active'?'Active':f.state==='inactive'?'Inactive':'Unknown'):'Locked';$('#system-content').innerHTML=`<div class="system-status-strip"><div><span>Firewall</span><strong>${pill(state,state==='Active'?'green':state==='Inactive'?'':'amber')}</strong></div><div><span>Rules</span><strong>${readable?rules.length:'—'}</strong></div><div><span>Host access</span><strong>${me.hostAdministrator?'Administrator':f.unlockedUntil?'Temporary access':'Authorization needed'}</strong></div><div><span>Engine</span><strong>UFW</strong></div></div>${!readable?`<div class="access-notice"><span class="access-notice-icon">${icon('lock')}</span><div><strong>Firewall access needs authorization</strong><p>Complete administrator setup above, or unlock this session temporarily.</p></div>${button('fw-unlock-open','Unlock session','lock')}</div>`:''}<div class="card system-table-card"><div class="toolbar"><div class="section-table-heading"><h2>Firewall rules</h2><span class="count-inline">${readable?rules.length+' total':'Authorization required'}</span></div><div class="table-toolbar-actions"><input id="fw-search" class="table-filter" type="search" placeholder="Filter rules…" aria-label="Filter firewall rules" ${readable?'':'disabled'}>${f.unlockedUntil?button('fw-lock','Lock access','lock'):''}${button('fw-add','Add rule','plus','primary')}</div></div><div class="table-wrap"><table class="management-table"><thead><tr><th>PORT / DESTINATION</th><th>ACTION</th><th>SOURCE</th><th>DIRECTION</th><th>IP VERSION</th><th class="actions-column">ACTIONS</th></tr></thead><tbody id="fw-rule-rows">${rules.map(r=>`<tr data-rule-search="${esc([r.destination,r.action,r.source,r.direction,r.family,r.comment].join(' ').toLowerCase())}"><td><strong class="table-primary">${esc(r.destination)}</strong>${r.comment?`<small>${esc(r.comment)}</small>`:''}</td><td>${pill(r.action,r.action==='ALLOW'?'green':r.action==='DENY'||r.action==='REJECT'?'red':'amber')}</td><td>${esc(r.source)}</td><td>${esc(r.direction==='IN'?'Incoming':r.direction==='OUT'?'Outgoing':'Forwarded')}</td><td>${pill(r.family)}</td><td class="actions-column"><button class="icon-button danger fw-remove" data-rule="${r.number}" aria-label="Delete rule ${r.number} for ${esc(r.destination)}" title="Delete rule">${icon('trash')}</button></td></tr>`).join('')||`<tr><td colspan="6"><div class="table-empty-state">${icon(!readable?'lock':'shield')}<strong>${!readable?'Unlock to view firewall rules':f.state==='inactive'?'Firewall is inactive':'No firewall rules'}</strong><p>${!readable?'Rules cannot be read until host access is authorized.':f.state==='inactive'?'UFW is installed but is not enforcing rules.':'Add a rule to control access to a port.'}</p></div></td></tr>`}</tbody></table></div><div class="table-footer"><span id="fw-visible-count">${readable?rules.length+' rules':'No rule data available'}</span><button id="fw-details" class="text-button">Connection & rule details ${icon('info')}</button></div></div>`;
 $('#fw-add').disabled=!readable;bind('fw-add',()=>{openModal('Add firewall rule',`<form id="firewall-form" class="modal-body"><div class="form-grid"><label>Action<select id="fw-action"><option value="allow">Allow</option><option value="deny">Deny</option></select></label><label>Protocol<select id="fw-protocol"><option value="tcp">TCP</option><option value="udp">UDP</option></select></label><label class="span-2">Port<input id="fw-port" type="number" min="1" max="65535" placeholder="443" required></label></div><p class="field-help">Applies to incoming connections. Keep the port used by your current server connection allowed.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Review rule</button></div></form>`);form('firewall-form',async()=>{const b={action:$('#fw-action').value,protocol:$('#fw-protocol').value,port:Number($('#fw-port').value)};if(await confirmOperation('Add firewall rule?',`${b.action} incoming ${b.protocol.toUpperCase()} connections on port ${b.port}.`,'Add rule')){try{await post('/api/firewall',b);}catch(e){notify(e.message);throw e;}modal.close();await firewallPage();notify('Firewall rule added.');}});});bind('fw-unlock-open',()=>{openModal('Unlock firewall access',`<form id="fw-unlock" class="modal-body"><label>Linux administrator password<input id="fw-password" type="password" autocomplete="off" required></label><p class="field-help">Use the host account’s sudo password. Access lasts five minutes for this session; the password is kept only in memory.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Unlock session</button></div></form>`);form('fw-unlock',async()=>{const password=$('#fw-password').value;$('#fw-password').value='';await post('/api/firewall/unlock',{password});modal.close();await firewallPage();});});bind('fw-lock',async()=>{await post('/api/firewall/lock');await firewallPage();});
 $$('.fw-remove').forEach(b=>b.onclick=action(async()=>{const r=rules.find(r=>r.number===Number(b.dataset.rule));if(await confirmOperation('Delete firewall rule?',`${r.action} ${r.destination} from ${r.source} (${r.family}). Removing this rule may affect existing access.`,'Delete rule')){await post('/api/firewall',{action:'delete',rule:r.number,revision:f.revision,confirm:true});await firewallPage();}}));$('#fw-search').oninput=()=>{const q=$('#fw-search').value.toLowerCase();let visible=0;$$('[data-rule-search]').forEach(r=>{r.hidden=!r.dataset.ruleSearch.includes(q);if(!r.hidden)visible++;});$('#fw-visible-count').textContent=visible+' of '+rules.length+' rules';};bind('fw-details',()=>openModal('Firewall details',`<div class="modal-body"><p>Docker-published ports may bypass normal UFW rules and need separate network policy.</p>${f.unparsed?.length?'<p>Some rules could not be parsed; they remain visible in the original output below.</p>':''}<pre>${esc(f.output||f.error||'No response from UFW.')}</pre></div>`));
}
function filePath(name){return (fileDirectory==='.'?'':fileDirectory+'/')+name;}
let fmSelected=new Set(),fmCurrentEntries=[];
const FM_BOOKMARKS=[
 {label:'Root (/)',path:'.'},
 {label:'Web (/var/www)',path:'var/www'},
 {label:'Logs (/var/log)',path:'var/log'},
 {label:'Nginx (/etc/nginx)',path:'etc/nginx'},
 {label:'Panel (/opt/server-panel)',path:'opt/server-panel'},
 {label:'Home (/home/cyber)',path:'home/cyber'},
 {label:'Tmp (/tmp)',path:'tmp'}
];
function renderFmBreadcrumbs(dir){
 const parts=dir==='.'?[]:dir.split('/').filter(Boolean);
 let html=`<button class="fm-crumb ${parts.length===0?'active':''}" data-fm-path=".">${icon('folder')} <span>Root</span></button>`;
 let accum='';
 for(let i=0;i<parts.length;i++){
  accum=(accum?accum+'/':'')+parts[i];
  const isLast=i===parts.length-1;
  html+=`<span class="fm-crumb-sep">/</span><button class="fm-crumb ${isLast?'active':''}" data-fm-path="${esc(accum)}"><span>${esc(parts[i])}</span></button>`;
 }
 return html;
}
function fmFileType(entry){
 if(entry.directory)return {kind:'folder',icon:'folder',label:'DIR',color:'amber'};
 const ext=entry.name.includes('.')?entry.name.split('.').pop().toLowerCase():'';
 if(['png','jpg','jpeg','gif','webp','svg','ico','bmp'].includes(ext))return {kind:'image',icon:'image',label:ext.toUpperCase(),color:'emerald',isImage:true};
 if(['zip','tar','gz','tgz','bz2','xz','7z'].includes(ext))return {kind:'archive',icon:'archive',label:ext.toUpperCase(),color:'purple',isArchive:true};
 if(['js','mjs','ts','py','sh','bash','php','html','css','json','yaml','yml','sql','conf','toml','xml'].includes(ext))return {kind:'code',icon:'file',label:ext.toUpperCase(),color:'blue',isCode:true};
 if(['txt','log','md','csv','pdf'].includes(ext))return {kind:'text',icon:'file',label:ext.toUpperCase(),color:'muted',isText:true};
 return {kind:'file',icon:'file',label:ext?ext.toUpperCase():'FILE',color:'default'};
}
function updateFmSelectionBar(){
 let bar=$('#fm-selection-bar');
 if(!fmSelected.size){if(bar)bar.remove();return;}
 if(!bar){
  bar=document.createElement('div');
  bar.id='fm-selection-bar';
  bar.className='fm-selection-bar';
  $('.file-manager')?.appendChild(bar);
 }
 bar.innerHTML=`<div class="fm-selection-info"><span class="pill primary">${fmSelected.size} selected</span></div><div class="fm-selection-actions">${button('fm-sel-compress','Compress ('+fmSelected.size+')','archive')}${button('fm-sel-chmod','Permissions','shield')}${button('fm-sel-trash','Move to Trash','trash','danger')}<button class="icon-button" type="button" id="fm-sel-clear" title="Clear selection">${icon('close')}</button></div>`;
 bind('fm-sel-compress',()=>fileCompress([...fmSelected]));
 bind('fm-sel-chmod',()=>fileBatchPermissions([...fmSelected]));
 bind('fm-sel-trash',()=>fileBatchTrash([...fmSelected]));
 bind('fm-sel-clear',()=>{fmSelected.clear();$$('.fm-row-check').forEach(c=>c.checked=false);const a=$('#fm-select-all');if(a)a.checked=false;updateFmSelectionBar();});
}
async function fileManagerPage(){
 fileDirectory='.';fmSelected.clear();
 $('#system-content').innerHTML=`<div class="card file-manager"><div class="fm-header-bar"><div class="fm-breadcrumbs-wrap"><div id="fm-breadcrumbs" class="fm-breadcrumbs"></div><button id="fm-toggle-direct-path" class="icon-button" title="Edit path as text">${icon('edit')}</button></div><div class="fm-header-actions"><input id="fm-search" type="search" placeholder="Filter files…" aria-label="Filter files"><button id="fm-refresh" class="icon-button" title="Refresh folder">${icon('refresh')}</button></div></div><form id="fm-location" class="file-location" hidden><span>${icon('folder')}</span><input id="fm-path" aria-label="Folder path relative to file root" value="." autocomplete="off"><button class="button secondary" type="submit">Go to folder</button><button id="fm-cancel-path" class="button secondary" type="button">Cancel</button></form><div class="fm-bookmarks-bar"><span class="fm-bm-label">Quick Jumps:</span>${FM_BOOKMARKS.map(b=>`<button class="fm-bm-pill" data-fm-path="${esc(b.path)}">${esc(b.label)}</button>`).join('')}</div><div class="file-toolbar"><div class="row-actions">${button('fm-parent','Parent','up')}${button('fm-new-folder','New folder','folder')}${button('fm-new-file','New file','plus')}${button('fm-upload','Upload','upload','primary')}${button('fm-remote-dl','Remote Download','globe')}${button('fm-compress-btn','Compress','archive')}${button('fm-trash','Trash Bin','trash')}</div></div><div class="file-drop-hint" id="fm-drop">Drop files here or click Upload · Direct streaming upload (no size limit)</div><input id="fm-upload-input" type="file" multiple hidden><div id="fm-progress" role="status"></div><div id="fm-list"></div><div class="table-footer"><span id="fm-count"></span><span>Server root: ${esc(me.fileRoot)} · host user permissions</span></div></div>`;
 bind('fm-parent',()=>browseFiles(fileDirectory.split('/').slice(0,-1).join('/')||'.'));
 bind('fm-refresh',()=>browseFiles(fileDirectory));
 bind('fm-toggle-direct-path',()=>{const loc=$('#fm-location');loc.hidden=!loc.hidden;if(!loc.hidden)$('#fm-path').focus();});
 bind('fm-cancel-path',()=>{$('#fm-location').hidden=true;});
 form('fm-location',()=>{const val=$('#fm-path').value.trim()||'.';$('#fm-location').hidden=true;browseFiles(val);});
 bind('fm-new-folder',()=>fileCreate('folder'));
 bind('fm-new-file',()=>fileCreate('file'));
 bind('fm-remote-dl',fileRemoteDownload);
 bind('fm-compress-btn',()=>fileCompress());
 bind('fm-trash',fileTrash);
 bind('fm-upload',()=>$('#fm-upload-input').click());
 $('#fm-upload-input').onchange=()=>uploadFiles([...$('#fm-upload-input').files]);
 $('#fm-search').oninput=()=>{const q=$('#fm-search').value.toLowerCase();$$('#fm-list tbody tr').forEach(r=>r.hidden=!r.dataset.name.includes(q));};
 const drop=$('#fm-drop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');uploadFiles([...e.dataTransfer.files]);};
 $$('.fm-bm-pill').forEach(b=>b.onclick=()=>browseFiles(b.dataset.fmPath));
 await browseFiles('.');
}
async function browseFiles(relative,automatic=false){
 const requestGeneration=generation,originalFolder=fileDirectory;
 const f=await api('/api/files/list?path='+encodeURIComponent(relative));
 if(requestGeneration!==generation||view!=='system'||sub!=='files'||automatic&&originalFolder!==fileDirectory)return;
 fileDirectory=f.path;
 $('#fm-path').value=f.path;
 $('#fm-parent').disabled=f.path==='.';
 $('#fm-count').textContent=f.entries.length+' items'+(f.truncated?' · first 2,000 shown':'');
 fmSelected.clear();
 updateFmSelectionBar();
 $('#fm-breadcrumbs').innerHTML=renderFmBreadcrumbs(f.path);
 $$('.fm-crumb').forEach(b=>b.onclick=()=>browseFiles(b.dataset.fmPath));
 const entries=f.entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
 fmCurrentEntries=entries;
 $('#fm-list').innerHTML=entries.length?`<div class="table-wrap"><table class="management-table fm-table"><thead><tr><th class="fm-check-col"><input type="checkbox" id="fm-select-all" aria-label="Select all files"></th><th>NAME</th><th>SIZE</th><th>MODIFIED</th><th>PERMISSIONS</th><th>OWNER</th><th class="actions-column">ACTIONS</th></tr></thead><tbody>${entries.map((e,i)=>{
  const t=fmFileType(e);
  return `<tr data-name="${esc(e.name.toLowerCase())}" data-index="${i}"><td class="fm-check-col"><input type="checkbox" class="fm-row-check" data-name="${esc(e.name)}"></td><td><div class="fm-name-cell"><span class="fm-type-badge ${t.color}">${icon(t.icon)}</span><button class="file-link ${e.directory?'folder':''}" data-fm-open="${i}" title="${esc(e.name)}"><span>${esc(e.name)}${e.symlink?' ↗':''}</span></button></div></td><td>${e.size===null?'—':bytes(e.size)}</td><td class="nowrap">${e.modified?esc(new Date(e.modified).toLocaleString()):'—'}</td><td><button class="fm-mode-pill" data-fm-mode="${i}" title="Change permissions"><code>${esc(e.mode||'—')}</code></button></td><td class="nowrap"><small class="text-muted">${e.uid!==undefined?esc(e.uid+':'+e.gid):'—'}</small></td><td class="actions-column"><div class="row-actions">${t.isImage?`<button class="button secondary fm-preview" data-index="${i}" title="Preview image">${icon('image')} Preview</button>`:''}${t.isArchive?`<button class="button secondary fm-extract" data-index="${i}" title="Extract archive">${icon('archive')} Extract</button>`:''}${!e.directory&&!t.isImage&&!t.isArchive?`<button class="button secondary fm-edit" data-index="${i}" title="Edit file">${icon('edit')} Edit</button>`:''}<a class="icon-button" href="/api/files/download?path=${encodeURIComponent(filePath(e.name))}" title="${e.directory?'Download folder as tar.gz':'Download file'}" aria-label="Download ${esc(e.name)}">${icon('download')}</a><button class="button secondary fm-more" data-index="${i}">Manage</button></div></td></tr>`;
 }).join('')}</tbody></table></div>`:empty('This folder is empty','Create a folder or file, upload files, or download from a remote URL.','folder');
 const allCheck=$('#fm-select-all');
 if(allCheck){
  allCheck.onchange=()=>{
   const checked=allCheck.checked;
   $$('.fm-row-check').forEach(c=>{
    c.checked=checked;
    if(checked)fmSelected.add(c.dataset.name);else fmSelected.delete(c.dataset.name);
   });
   updateFmSelectionBar();
  };
 }
 $$('.fm-row-check').forEach(c=>{
  c.onchange=()=>{
   if(c.checked)fmSelected.add(c.dataset.name);else fmSelected.delete(c.dataset.name);
   if(allCheck)allCheck.checked=fmSelected.size===entries.length&&entries.length>0;
   updateFmSelectionBar();
  };
 });
 $$('[data-fm-open]').forEach(b=>b.onclick=action(()=>{
  const e=entries[Number(b.dataset.fmOpen)];
  if(e.directory)return browseFiles(filePath(e.name));
  const t=fmFileType(e);
  if(t.isImage)return fileImagePreview(e);
  if(t.isArchive)return fileExtract(e);
  return fileEditor(filePath(e.name));
 }));
 $$('.fm-preview').forEach(b=>b.onclick=()=>fileImagePreview(entries[Number(b.dataset.index)]));
 $$('.fm-extract').forEach(b=>b.onclick=()=>fileExtract(entries[Number(b.dataset.index)]));
 $$('.fm-edit').forEach(b=>b.onclick=()=>fileEditor(filePath(entries[Number(b.dataset.index)].name)));
 $$('.fm-mode-pill').forEach(b=>b.onclick=()=>fileBatchPermissions([entries[Number(b.dataset.fmMode)].name]));
 $$('.fm-more').forEach(b=>b.onclick=()=>fileManage(entries[Number(b.dataset.index)]));
}
function fileCreate(kind){
 openModal('New '+kind,`<form id="fm-create" class="modal-body"><label>${kind==='folder'?'Folder':'File'} name<input id="fm-name" required autocomplete="off" placeholder="e.g. ${kind==='folder'?'assets':'index.html'}"></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button submit" type="submit">Create ${kind}</button></div></form>`);
 form('fm-create',async()=>{
  const name=$('#fm-name').value.trim();
  await post('/api/files/manage',{action:'create',kind,path:fileDirectory,name});
  modal.close();
  await browseFiles(fileDirectory);
  if(kind==='file')await fileEditor(filePath(name));
 });
}
function fileRemoteDownload(){
 openModal('Remote URL Download',`<form id="fm-remote-form" class="modal-body"><p class="field-help">Download an archive, repository, or asset from any public HTTP/HTTPS URL directly onto the server into <code>${esc(fileDirectory)}</code>.</p><label>File URL<input id="fm-remote-url" type="url" placeholder="https://example.com/file.zip" required autocomplete="off"></label><label>Target filename (optional, inferred from URL if blank)<input id="fm-remote-name" placeholder="file.zip" autocomplete="off"></label><p id="fm-remote-status" class="field-help"></p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button submit" type="submit">${icon('download')} Download to Server</button></div></form>`);
 form('fm-remote-form',async()=>{
  const url=$('#fm-remote-url').value.trim(),filename=$('#fm-remote-name').value.trim();
  $('#fm-remote-status').textContent='Streaming download to server storage…';
  await post('/api/files/manage',{action:'remote_download',path:fileDirectory,url,filename,confirm:true});
  modal.close();
  await browseFiles(fileDirectory);
  notify('Remote file downloaded successfully.');
 });
}
function fileCompress(targets=[]){
 const defaultTargets=targets.length?targets:(fmSelected.size?[...fmSelected]:[]);
 if(!defaultTargets.length){notify('Select one or more items to compress.');return;}
 const defaultName=(defaultTargets.length===1?defaultTargets[0]:'archive')+'.zip';
 openModal('Compress items',`<form id="fm-compress-form" class="modal-body"><p class="field-help">Compressing <strong>${defaultTargets.length}</strong> item(s) in <code>${esc(fileDirectory)}</code>.</p><div class="form-grid"><label>Archive Format<select id="fm-compress-format"><option value="zip" selected>ZIP (.zip universal)</option><option value="tar.gz">TAR.GZ (.tar.gz Linux)</option></select></label><label class="span-2">Archive Name<input id="fm-compress-name" value="${esc(defaultName)}" required autocomplete="off"></label></div><p class="form-error" role="alert"></p><div class="form-actions"><button class="button submit" type="submit">${icon('archive')} Compress Now</button></div></form>`);
 $('#fm-compress-format').onchange=()=>{
  const fmt=$('#fm-compress-format').value;
  const base=$('#fm-compress-name').value.replace(/\.(zip|tar\.gz|tgz)$/i,'');
  $('#fm-compress-name').value=base+(fmt==='zip'?'.zip':'.tar.gz');
 };
 form('fm-compress-form',async()=>{
  const format=$('#fm-compress-format').value,archiveName=$('#fm-compress-name').value.trim();
  await post('/api/files/manage',{action:'compress',path:fileDirectory,targets:defaultTargets,format,archiveName,confirm:true});
  modal.close();
  fmSelected.clear();
  await browseFiles(fileDirectory);
  notify('Created archive '+archiveName);
 });
}
function fileExtract(entry){
 const src=filePath(entry.name);
 openModal('Extract archive',`<form id="fm-extract-form" class="modal-body"><p class="field-help">Extract archive <strong>${esc(entry.name)}</strong>.</p><label>Destination folder (relative to file root)<input id="fm-extract-dest" value="${esc(fileDirectory)}" required autocomplete="off"></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button submit" type="submit">${icon('archive')} Extract Files</button></div></form>`);
 form('fm-extract-form',async()=>{
  const destination=$('#fm-extract-dest').value.trim();
  await post('/api/files/manage',{action:'extract',path:src,destination,confirm:true});
  modal.close();
  await browseFiles(fileDirectory);
  notify('Archive extracted successfully.');
 });
}
function fileImagePreview(entry){
 const src=filePath(entry.name);
 const inlineUrl=`/api/files/download?path=${encodeURIComponent(src)}&inline=1`;
 const dlUrl=`/api/files/download?path=${encodeURIComponent(src)}`;
 openModal('Preview: '+entry.name,`<div class="modal-body fm-preview-modal"><div class="fm-preview-img-wrap"><img src="${inlineUrl}" alt="${esc(entry.name)}" class="fm-preview-img"></div><div class="fm-preview-info"><div><span>File size:</span> <strong>${bytes(entry.size)}</strong></div><div><span>Modified:</span> <strong>${entry.modified?new Date(entry.modified).toLocaleString():'—'}</strong></div><div><span>Permissions:</span> <code>${esc(entry.mode||'—')}</code></div></div><div class="form-actions"><a class="button" href="${dlUrl}" download="${esc(entry.name)}">${icon('download')} Download Image</a><button class="button secondary" type="button" id="fm-prev-manage">Manage</button></div></div>`);
 bind('fm-prev-manage',()=>{modal.close();fileManage(entry);});
}
function fileBatchPermissions(targets){
 openModal('Change permissions',`<form id="fm-perm-form" class="modal-body"><p class="field-help">Setting permissions for <strong>${targets.length}</strong> item(s).</p><div class="fm-presets-row"><button type="button" class="button secondary fm-p-btn" data-mode="0644">0644 (File Standard)</button><button type="button" class="button secondary fm-p-btn" data-mode="0755">0755 (Directory / Executable)</button><button type="button" class="button secondary fm-p-btn" data-mode="0600">0600 (Private Secret)</button><button type="button" class="button secondary fm-p-btn" data-mode="0777">0777 (Full Access)</button></div><label>Mode (octal, e.g. 0644 or 0755)<input id="fm-perm-val" value="0644" pattern="[0-7]{3,4}" required autocomplete="off"></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button submit" type="submit">Apply Permissions</button></div></form>`);
 $$('.fm-p-btn').forEach(b=>b.onclick=()=>{$('#fm-perm-val').value=b.dataset.mode;});
 form('fm-perm-form',async()=>{
  const mode=$('#fm-perm-val').value.trim();
  await post('/api/files/manage',{action:'batch',path:fileDirectory,operation:'permissions',targets,mode,confirm:true});
  modal.close();
  fmSelected.clear();
  await browseFiles(fileDirectory);
  notify('Updated permissions for '+targets.length+' item(s).');
 });
}
async function fileBatchTrash(targets){
 if(await confirmOperation('Move to Trash?',`Move ${targets.length} selected item(s) to private Trash? You can restore them anytime from Trash.`,'Move to Trash')){
  await post('/api/files/manage',{action:'batch',path:fileDirectory,operation:'trash',targets,confirm:true});
  fmSelected.clear();
  await browseFiles(fileDirectory);
  notify(targets.length+' item(s) moved to Trash.');
 }
}
function fileManage(entry){
 const src=filePath(entry.name);
 const t=fmFileType(entry);
 openModal('Manage '+entry.name,`<form id="fm-manage" class="modal-body"><div class="fm-manage-badge-row"><span class="pill ${t.color}">${t.label}</span><code>${esc(src)}</code></div><label>Operation<select id="fm-operation"><option value="rename">Rename</option><option value="copy">Copy to folder</option><option value="move">Move to folder</option><option value="permissions">Change permissions</option></select></label><label id="fm-wrap-name">New Name<input id="fm-new-name" value="${esc(entry.name)}" required></label><label id="fm-wrap-dest">Destination folder, relative to file manager root<input id="fm-destination" value="${esc(fileDirectory)}"></label><label id="fm-wrap-mode">Permissions (octal)<input id="fm-mode" value="${esc(entry.mode||'0644')}" pattern="[0-7]{3,4}"></label><p class="field-help">Moves and copies refuse to overwrite existing items. Copying large folders can take some time.</p><p class="form-error" role="alert"></p><div class="form-actions"><button id="fm-delete" class="button danger" type="button">${icon('trash')} Move to Trash</button>${t.isArchive?`<button id="fm-quick-extract" class="button secondary" type="button">${icon('archive')} Extract</button>`:''}${button('fm-quick-compress','Compress','archive')}<button class="button submit" type="submit">Apply Operation</button></div></form>`);
 const opSelect=$('#fm-operation');
 const updateOpVisibility=()=>{
  const op=opSelect.value;
  $('#fm-wrap-name').hidden=op!=='rename';
  $('#fm-wrap-dest').hidden=op!=='copy'&&op!=='move';
  $('#fm-wrap-mode').hidden=op!=='permissions';
 };
 opSelect.onchange=updateOpVisibility;
 updateOpVisibility();
 form('fm-manage',async()=>{
  const b={action:opSelect.value,path:src,name:$('#fm-new-name').value,destination:$('#fm-destination').value,mode:$('#fm-mode').value};
  await post('/api/files/manage',b);
  modal.close();
  await browseFiles(fileDirectory);
 });
 bind('fm-delete',async()=>{
  if(await confirmOperation('Move to Trash?',`Move ${entry.name}${entry.directory?' and its contents':''} to private Trash? You can restore it from Trash.`,'Move to Trash')){
   await post('/api/files/manage',{action:'trash',path:src,confirm:true});
   modal.close();
   await browseFiles(fileDirectory);
  }
 });
 if(t.isArchive)bind('fm-quick-extract',()=>{modal.close();fileExtract(entry);});
 bind('fm-quick-compress',()=>{modal.close();fileCompress([entry.name]);});
}
async function fileTrash(){
 const rows=await api('/api/files/trash');
 openModal('File manager Trash',`<div class="modal-body"><p>Deleted items stay in a private folder on their original drive. Restore them here. Trash continues to use disk space.</p>${rows.map((r,i)=>`<div class="trash-row"><span><strong>${esc(r.path)}</strong><small>${esc(new Date(r.time).toLocaleString())}</small></span><button class="button secondary fm-restore" data-index="${i}">Restore</button></div>`).join('')||'<p>Trash is empty.</p>'}</div>`);
 $$('.fm-restore').forEach(b=>b.onclick=action(async()=>{
  await post('/api/files/manage',{action:'restore',id:rows[Number(b.dataset.index)].id});
  modal.close();
  await browseFiles(fileDirectory);
  notify('Item restored.');
 }));
}
async function fileEditor(relative){
 const url='/api/files?path='+encodeURIComponent(relative),data=await api(url);let changed=false;
 openModal('Edit file',`<div class="modal-body file-editor-body"><div class="editor-heading"><code>${esc(relative)}</code><span id="fm-editor-state">Saved</span></div><div id="fm-code-editor"></div><p class="field-help">Syntax highlighting, line numbers, find/replace (Ctrl+F) and undo. Saving checks for external changes and creates a backup. Text files up to 1 MiB.</p><p id="fm-editor-error" class="form-error" role="alert"></p></div><div class="form-actions">${button('fm-editor-close','Close',null)}${button('fm-editor-save','Save changes','check','primary')}</div>`,'editor');
 editorHandle=PanelTools.editor($('#fm-code-editor'),data.text,relative,()=>{changed=true;$('#fm-editor-state').textContent='Unsaved changes';});
 let revision=data.revision;
 const cancel=e=>{if(changed&&!window.confirm('Discard unsaved file changes?')){e?.preventDefault();return false;}return true;};
 const close=()=>{if(modal.open)return;editorHandle?.dispose();editorHandle=null;modal.removeEventListener('close',close);modal.removeEventListener('cancel',cancel);};
 modal.addEventListener('close',close);modal.addEventListener('cancel',cancel);
 bind('fm-editor-close',()=>{if(cancel())modal.close();});
 bind('modal-close',()=>{if(cancel())modal.close();});
 bind('fm-editor-save',async()=>{
  try{
   const text=editorHandle.getText();
   const result=await post(url,{text,revision});
   revision=(await api(url)).revision;
   changed=false;
   $('#fm-editor-state').textContent='Saved';
   notify('File saved. Backup: '+result.backup);
  }catch(e){$('#fm-editor-error').textContent=e.message;}
 });
 editorHandle.focus();
}
window.PanelUploader = {
 currentXhr: null,
 isCancelled: false,

 getCard() {
  let card = document.getElementById('panel-upload-dock');
  if (!card) {
   card = document.createElement('div');
   card.id = 'panel-upload-dock';
   card.className = 'upload-floating-card';
   card.setAttribute('role', 'region');
   card.setAttribute('aria-label', 'File Upload Status');
   card.hidden = true;
   document.body.appendChild(card);
  }
  return card;
 },

 formatEta(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return Math.ceil(seconds) + 's left';
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's left';
 },

 async uploadQueue({ files, getUrl, intent = 'manage', contentType, inlineStatusEl, onFileComplete, onAllComplete }) {
  if (!files || !files.length) return;
  const card = this.getCard();
  card.hidden = false;
  card.style.opacity = '1';
  card.style.transform = 'translateY(0)';
  this.isCancelled = false;

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
   try { Notification.requestPermission().catch(() => {}); } catch {}
  }

  const totalFiles = files.length;
  let successCount = 0;

  for (let i = 0; i < totalFiles; i++) {
   if (this.isCancelled) break;
   const file = files[i];
   const url = getUrl(file);

   card.innerHTML = `
    <div class="upload-card-header">
     <div class="upload-card-title-group">
      <span class="upload-badge blue" id="pud-badge"><i class="upload-dot pulse"></i> Uploading</span>
      <span class="upload-counter">${totalFiles > 1 ? `File ${i + 1} of ${totalFiles}` : '1 file'}</span>
     </div>
     <button type="button" class="upload-btn-cancel" id="pud-cancel">Cancel</button>
    </div>
    <div class="upload-card-body">
     <div class="upload-file-row">
      <span class="upload-filename" title="${esc(file.name)}">${esc(file.name)}</span>
      <span class="upload-filesize">${bytes(file.size)}</span>
     </div>
     <div class="upload-bar-track">
      <div class="upload-bar-fill" id="pud-fill" style="width: 0%"></div>
     </div>
     <div class="upload-stats-line">
      <span id="pud-transferred">0 B / ${bytes(file.size)} (0%)</span>
      <span id="pud-speed-eta"><span id="pud-speed">0 B/s</span> · <span id="pud-eta">Starting…</span></span>
     </div>
     <div class="upload-substatus" id="pud-sub">Direct streaming upload to server…</div>
    </div>
   `;

   const badgeEl = card.querySelector('#pud-badge');
   const fillEl = card.querySelector('#pud-fill');
   const transferredEl = card.querySelector('#pud-transferred');
   const speedEl = card.querySelector('#pud-speed');
   const etaEl = card.querySelector('#pud-eta');
   const subEl = card.querySelector('#pud-sub');
   const cancelBtn = card.querySelector('#pud-cancel');

   if (inlineStatusEl) {
    inlineStatusEl.textContent = `Uploading ${file.name} (${bytes(file.size)})…`;
   }
   notify(`Uploading ${file.name} (${bytes(file.size)})…`);

   let lastLoaded = 0;
   let lastTime = Date.now();
   let smoothedSpeed = 0;
   let isStalled = false;
   let stallTimer = null;
   let fileCompleted = false;

   const resetStallCheck = () => {
    clearTimeout(stallTimer);
    if (isStalled) {
     isStalled = false;
     badgeEl.className = 'upload-badge blue';
     badgeEl.innerHTML = '<i class="upload-dot pulse"></i> Uploading';
     fillEl.classList.remove('stalled');
     subEl.className = 'upload-substatus';
     subEl.textContent = 'Upload resumed · streaming to server';
    }
    stallTimer = setTimeout(() => {
     if (!fileCompleted && !this.isCancelled) {
      isStalled = true;
      badgeEl.className = 'upload-badge amber';
      badgeEl.innerHTML = '<i class="upload-dot"></i> Stalled / Paused';
      fillEl.classList.add('stalled');
      subEl.className = 'upload-substatus warning';
      subEl.textContent = 'Upload stalled (no data transferred for 8s). Network or mobile screen lock may be pausing transfer.';
      notify(`⚠️ Upload stalled for ${file.name} (network waiting)`);
     }
    }, 8000);
   };

   resetStallCheck();

   const onOffline = () => {
    if (!fileCompleted && !this.isCancelled) {
     isStalled = true;
     badgeEl.className = 'upload-badge amber';
     badgeEl.innerHTML = '<i class="upload-dot"></i> Offline';
     fillEl.classList.add('stalled');
     subEl.className = 'upload-substatus warning';
     subEl.textContent = 'Device is offline. Upload paused.';
     notify(`⚠️ Device went offline during upload of ${file.name}`);
    }
   };
   window.addEventListener('offline', onOffline);

   try {
    await new Promise((resolve, reject) => {
     const xhr = new XMLHttpRequest();
     this.currentXhr = xhr;

     cancelBtn.onclick = () => {
      this.isCancelled = true;
      clearTimeout(stallTimer);
      xhr.abort();
      badgeEl.className = 'upload-badge red';
      badgeEl.textContent = 'Cancelled';
      fillEl.classList.add('failed');
      subEl.className = 'upload-substatus error';
      subEl.textContent = 'Upload cancelled by user.';
      cancelBtn.textContent = 'Close';
      cancelBtn.onclick = () => { card.hidden = true; };
      notify(`Upload cancelled: ${file.name}`);
      reject(Error('Upload cancelled'));
     };

     xhr.open('POST', url);
     if (intent) xhr.setRequestHeader('X-Panel-Intent', intent);
     if (contentType) xhr.setRequestHeader('Content-Type', contentType);

     xhr.upload.onprogress = e => {
      if (!e.lengthComputable || this.isCancelled) return;
      resetStallCheck();

      const now = Date.now();
      const timeDelta = (now - lastTime) / 1000;
      if (timeDelta >= 0.4) {
       const bytesDelta = e.loaded - lastLoaded;
       const instantSpeed = bytesDelta / timeDelta;
       smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : (smoothedSpeed * 0.65 + instantSpeed * 0.35);
       lastLoaded = e.loaded;
       lastTime = now;
      }

      const pct = Math.round((e.loaded / e.total) * 100);
      const remaining = e.total - e.loaded;
      const eta = smoothedSpeed > 0 ? Math.ceil(remaining / smoothedSpeed) : null;

      fillEl.style.width = pct + '%';
      transferredEl.textContent = `${bytes(e.loaded)} / ${bytes(e.total)} (${pct}%)`;
      speedEl.textContent = `${bytes(smoothedSpeed)}/s`;
      etaEl.textContent = this.formatEta(eta);

      const progressMsg = `Uploading ${file.name} · ${pct}% (${bytes(e.loaded)} / ${bytes(e.total)})`;
      if (inlineStatusEl) inlineStatusEl.textContent = progressMsg;

      if (e.loaded >= e.total) {
       clearTimeout(stallTimer);
       badgeEl.className = 'upload-badge amber';
       badgeEl.innerHTML = '<i class="upload-dot pulse"></i> Finalizing';
       fillEl.classList.add('pulse');
       etaEl.textContent = 'Syncing…';
       subEl.className = 'upload-substatus';
       subEl.textContent = '100% transferred. Server is committing and syncing to disk…';
       if (inlineStatusEl) inlineStatusEl.textContent = `Processing ${file.name} on server…`;
      }
     };

     xhr.onload = () => {
      fileCompleted = true;
      clearTimeout(stallTimer);
      window.removeEventListener('offline', onOffline);
      if (xhr.status >= 200 && xhr.status < 300) {
       successCount++;
       fillEl.style.width = '100%';
       fillEl.className = 'upload-bar-fill complete';
       badgeEl.className = 'upload-badge green';
       badgeEl.textContent = '✓ Complete';
       subEl.className = 'upload-substatus success';
       subEl.textContent = `File saved successfully (${bytes(file.size)}).`;
       cancelBtn.textContent = 'Close';
       cancelBtn.onclick = () => { card.hidden = true; };

       const successMsg = `✓ Upload complete: ${file.name} (${bytes(file.size)})`;
       notify(successMsg);
       if (inlineStatusEl) inlineStatusEl.textContent = successMsg;

       if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        try {
         new Notification('CP-Panel Upload Complete', {
          body: `${file.name} (${bytes(file.size)}) uploaded successfully.`,
          icon: '/favicon.ico'
         });
        } catch {}
       }

       if (onFileComplete) onFileComplete(file);
       resolve();
      } else {
       let errMsg = 'Upload failed (HTTP ' + xhr.status + ')';
       try {
        const r = JSON.parse(xhr.responseText);
        if (r?.error) errMsg = r.error;
       } catch {}
       badgeEl.className = 'upload-badge red';
       badgeEl.textContent = 'Failed';
       fillEl.classList.add('failed');
       subEl.className = 'upload-substatus error';
       subEl.textContent = errMsg;
       cancelBtn.textContent = 'Close';
       cancelBtn.onclick = () => { card.hidden = true; };

       notify(`✗ Upload failed: ${errMsg}`);
       if (inlineStatusEl) inlineStatusEl.textContent = `Upload failed: ${errMsg}`;

       if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
        try {
         new Notification('CP-Panel Upload Failed', {
          body: `${file.name}: ${errMsg}`,
          icon: '/favicon.ico'
         });
        } catch {}
       }

       reject(Error(errMsg));
      }
     };

     xhr.onerror = () => {
      fileCompleted = true;
      clearTimeout(stallTimer);
      window.removeEventListener('offline', onOffline);
      badgeEl.className = 'upload-badge red';
      badgeEl.textContent = 'Connection Error';
      fillEl.classList.add('failed');
      subEl.className = 'upload-substatus error';
      subEl.textContent = 'Upload connection was closed or interrupted.';
      cancelBtn.textContent = 'Close';
      cancelBtn.onclick = () => { card.hidden = true; };

      const errText = `Upload stopped: connection error for ${file.name}`;
      notify(errText);
      if (inlineStatusEl) inlineStatusEl.textContent = errText;

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
       try {
        new Notification('CP-Panel Upload Interrupted', {
         body: `${file.name}: Connection was closed or interrupted.`,
         icon: '/favicon.ico'
        });
       } catch {}
      }

      reject(Error('Upload connection failed'));
     };

     xhr.onabort = () => {
      fileCompleted = true;
      clearTimeout(stallTimer);
      window.removeEventListener('offline', onOffline);
      reject(Error('Upload cancelled'));
     };

     xhr.send(file);
    });
   } catch (e) {
    if (this.isCancelled) break;
   } finally {
    clearTimeout(stallTimer);
    window.removeEventListener('offline', onOffline);
    this.currentXhr = null;
   }
  }

  if (onAllComplete) await onAllComplete();

  if (successCount === totalFiles && !this.isCancelled) {
   setTimeout(() => {
    if (!this.currentXhr && card) {
     card.style.opacity = '0';
     card.style.transform = 'translateY(20px)';
     setTimeout(() => { card.hidden = true; card.style.opacity = ''; card.style.transform = ''; }, 300);
    }
   }, 4500);
  }
 }
};
async function uploadFiles(files){
 await window.PanelUploader.uploadQueue({
  files,
  getUrl: file => '/api/files/upload?path=' + encodeURIComponent(fileDirectory) + '&name=' + encodeURIComponent(file.name),
  intent: 'manage',
  inlineStatusEl: $('#fm-progress'),
  onAllComplete: async () => {
   if ($('#fm-progress')) $('#fm-progress').textContent = 'Upload complete.';
   await browseFiles(fileDirectory);
  }
 });
}
function hostAccessCard(h){return h.isRoot?`<div class="host-access-ready"><span>${icon('shield')} Administrator access</span>${pill('Active','green')}</div>`:`<div class="host-setup-banner"><span class="access-notice-icon">${icon('shield')}</span><div><strong>Administrator setup required</strong><p>Enable full server management with a one-time installation.</p></div>${h.setupSupported?button('host-admin-setup','Complete setup','arrow','primary'):pill('Linux + systemd required','amber')}</div>`;}
function hostAdminSetup(h){openModal('Set up administrator service',`<form id="host-admin-form" class="modal-body"><p>This installs CP-Panel (by CyberPross) as a root-owned system service and restarts it. Your existing panel accounts will be kept; you will sign in again after the restart.</p><ul><li>Administrative service: <code>${esc(h.serviceName)}</code></li><li>Application files are protected from ordinary Linux users.</li><li>Panel administrators gain full access to the server.</li><li>Existing firewall rules are preserved.</li></ul>${passwordField('host-admin-password','Linux administrator password','current-password')}<p class="field-help">Use the password for the Linux account running this panel. It must have sudo permission. This password is used only for installation and is not saved.</p><label class="host-setup-check"><input id="host-admin-confirm" type="checkbox" required>I understand that panel administrators will have full access to this server.</label><p id="host-admin-progress" role="status"></p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Install and restart panel</button></div></form>`);togglePassword('host-admin-password');form('host-admin-form',async()=>{const password=$('#host-admin-password').value;$('#host-admin-password').value='';if(!$('#host-admin-confirm').checked)throw Error('Confirm administrator access before continuing.');$('#host-admin-progress').textContent='Authorizing and installing the service… This may take a minute.';try{const r=await post('/api/host/setup',{password,confirm:true});$('#host-admin-progress').textContent=r.output+'\nRestarting the panel…';let attempts=0;const reconnect=async()=>{try{const res=await fetch('/api/auth/options',{cache:'no-store'});if(res.ok&&attempts>5){location.reload();return;}}catch{}if(++attempts<90)setTimeout(reconnect,2000);else $('#host-admin-progress').textContent='The service was installed. Reload this page to reconnect, or check the service if it does not respond.';};setTimeout(reconnect,3000);}catch(e){$('#host-admin-progress').textContent='';throw e;}});}
let updateCheckStarted=false;
function startBuildCheck(){if(updateCheckStarted)return;updateCheckStarted=true;setInterval(async()=>{if(!me?.build)return;try{const r=await fetch('/api/version',{cache:'no-store'});if(!r.ok)return;const v=await r.json();if(v.build!==me.build&&!$('#panel-update-banner')){const banner=document.createElement('div');banner.id='panel-update-banner';banner.className='panel-update-banner';banner.innerHTML='<span>A newer panel version is ready. Reload to use the updated tools.</span><button class="button secondary" type="button">Reload panel</button>';banner.querySelector('button').onclick=()=>location.reload();document.querySelector('.page-body').prepend(banner);}}catch{}},15000);}
startBuildCheck();
