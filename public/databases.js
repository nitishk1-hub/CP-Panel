let nativeDatabaseInventory = null, databaseCategory="all", nativeDatabaseTab="service", nativeDatabaseRenderKey="";
const nativeDatabaseState = (s) =>
  ({
    not_installed: "Not installed",
    running: "Running",
    stopped: "Stopped",
    partly_running: "Partly running",
    no_clusters: "No clusters",
    masked: "Service masked",
    unavailable: "Service unavailable",
    unknown: "Unknown",
    failed: "Failed",
    activating: "Starting",
    deactivating: "Stopping",
  })[s] || s;
const nativeDatabaseDescriptions={mysql:'Relational database server',postgresql:'Relational database server',redis:'In-memory data store',mariadb:'Relational database server'};
const nativeDatabaseTone=s=>s.state==='running'?'green':['failed','unknown','unavailable','masked'].includes(s.state)?'amber':'';
function nativeDatabaseOpen(engine){databaseCategory=engine;nativeDatabaseTab='service';route('databases');}
async function refreshNativeDatabases(){if(view==='databases')await databasesPage(generation);}
function nativeDatabaseOverview(d){return `<div class="card management-card database-overview"><div class="toolbar"><h2>Database servers</h2><span class="field-help">Installed on this host</span></div><div class="table-wrap"><table class="management-table"><thead><tr><th>Software</th><th>Version</th><th>Status</th><th>Startup</th><th class="actions-column">Management</th></tr></thead><tbody>${d.software.map(s=>`<tr><td><div class="table-name"><span class="database-engine-mark" aria-hidden="true">${({mysql:'M',postgresql:'P',redis:'R',mariadb:'M'})[s.engine]||'D'}</span><span><strong>${esc(s.name)}</strong><small>${esc(nativeDatabaseDescriptions[s.engine]||'Database server')}</small></span></div></td><td>${esc(s.version||'—')}</td><td>${pill(nativeDatabaseState(s.state),nativeDatabaseTone(s))}</td><td>${!s.installed?'—':['enabled','enabled-runtime'].includes(s.service.enabled)?'Enabled':s.service.enabled==='disabled'?'Disabled':esc(s.service.enabled||'Not reported')}</td><td class="actions-column"><button class="button small secondary database-open" data-engine="${esc(s.engine)}">${s.installed?'Manage':'Set up'}</button></td></tr>`).join('')}</tbody></table></div></div>`;}
function nativeDatabaseService(s,d){const disabled=!d.canManage||d.busy?'disabled':'',running=['running','partly_running'].includes(s.state),startup=['enabled','enabled-runtime'].includes(s.service.enabled);if(s.installed===false)return `<div class="card database-install"><span class="database-install-icon" aria-hidden="true">${icon('disk')}</span><div><h2>Not installed</h2><p>Install ${esc(s.name)} to start managing it here.</p><p class="field-help">You’ll review the package changes before installation. Existing data and other services are preserved.</p><button class="button primary native-package" data-engine="${s.engine}" data-operation="install" ${disabled}>Install ${esc(s.name)}</button></div></div>`;
return `<div class="card management-card"><div class="toolbar"><h2>Service</h2><div class="toolbar-group">${s.canControl?`<button class="button ${running?'secondary':'primary'} native-service" data-engine="${s.engine}" data-operation="${running?'stop':'start'}" ${disabled}>${running?'Stop':'Start'}</button><button class="button secondary native-service" data-engine="${s.engine}" data-operation="restart" ${disabled}>Restart</button>`:''}</div></div><div class="card-pad">${s.error&&s.error!==d.error?notice(s.error,'warning'):''}<dl class="database-service-facts"><div><dt>System service</dt><dd><code>${esc(s.service.unit)}</code></dd></div><div><dt>Process</dt><dd>${s.engine==='postgresql'?'Managed per cluster':s.service.pid?'PID '+s.service.pid:'Not running'}</dd></div><div><dt>Start on boot</dt><dd>${startup?'Enabled':s.service.enabled==='disabled'?'Disabled':esc(s.service.enabled||'Not reported')}${s.canControl?`<button class="button small secondary native-service" data-engine="${s.engine}" data-operation="${startup?'disable':'enable'}" ${disabled}>${startup?'Disable':'Enable'}</button>`:''}</dd></div></dl>${s.clusters?.length?`<h3 class="database-clusters-title">PostgreSQL clusters</h3><div class="table-wrap"><table class="management-table"><thead><tr><th>Version / cluster</th><th>Port</th><th>Status</th></tr></thead><tbody>${s.clusters.map(c=>`<tr><td>${esc(c.version+' / '+c.name)}</td><td>${c.port||'—'}</td><td>${pill(nativeDatabaseState(c.state),c.state==='running'?'green':'')}</td></tr>`).join('')}</tbody></table></div><p class="field-help">Service actions apply to all listed clusters.</p>`:''}</div></div>`;}
function nativeDatabasePackages(s,d){return `<div class="card management-card"><div class="toolbar"><h2>Software packages</h2>${s.managedByApt?`<button class="button secondary native-package" data-engine="${s.engine}" data-operation="update" ${!d.canManage||d.busy?'disabled':''}>Check for updates</button>`:''}</div><div class="table-wrap"><table class="management-table"><thead><tr><th>Package</th><th>Installed version</th></tr></thead><tbody>${(s.packages||[]).map(p=>`<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.version)}</td></tr>`).join('')||'<tr><td colspan="2">No packages managed by the system package manager.</td></tr>'}</tbody></table></div>${s.managedByApt?`<div class="database-removal"><div><h3>Uninstall software</h3><p class="field-help">Database files and configuration are retained. Review the removal plan before confirming.</p></div><button class="button danger native-package" data-engine="${s.engine}" data-operation="uninstall" ${!d.canManage||d.busy?'disabled':''}>Uninstall</button></div>`:''}</div>`;}
function databaseNavTabs(){
  return `<div class="tabs database-tabs" role="tablist" aria-label="Database engines">
    <button class="tab ${databaseCategory==='all'?'active':''}" data-database-subtab="all" type="button" role="tab" aria-selected="${databaseCategory==='all'}">${icon('disk')} All databases</button>
    <button class="tab ${databaseCategory==='mysql'?'active':''}" data-database-subtab="mysql" type="button" role="tab" aria-selected="${databaseCategory==='mysql'}"><span class="database-engine-mark" aria-hidden="true">M</span> MySQL</button>
    <button class="tab ${databaseCategory==='postgresql'?'active':''}" data-database-subtab="postgresql" type="button" role="tab" aria-selected="${databaseCategory==='postgresql'}"><span class="database-engine-mark" aria-hidden="true">P</span> PostgreSQL</button>
    <button class="tab ${databaseCategory==='redis'?'active':''}" data-database-subtab="redis" type="button" role="tab" aria-selected="${databaseCategory==='redis'}"><span class="database-engine-mark" aria-hidden="true">R</span> Redis</button>
    <button class="tab ${databaseCategory==='mariadb'?'active':''}" data-database-subtab="mariadb" type="button" role="tab" aria-selected="${databaseCategory==='mariadb'}"><span class="database-engine-mark" aria-hidden="true">M</span> MariaDB</button>
  </div>`;
}

function bindDatabaseSubnav(){
  $$('[data-database-subtab]').forEach(b=>{
    b.onclick=action(async()=>{
      databaseCategory=b.dataset.databaseSubtab;
      nativeDatabaseTab='service';
      route('databases');
    });
  });
}

async function databasesPage(id=generation){const category=databaseCategory,tab=nativeDatabaseTab,d=await api('/api/databases');if(id!==generation||view!=='databases'||category!==databaseCategory||tab!==nativeDatabaseTab)return;nativeDatabaseInventory=d;syncNativeDatabaseNavigation(d);const renderKey=JSON.stringify([category,tab,d]);if(renderKey===nativeDatabaseRenderKey&&content.querySelector('.database-overview,.database-context')){if(tab==='logs')await loadNativeDatabaseLogs(category,id);return;}nativeDatabaseRenderKey=renderKey;
const warning=`${d.error?notice(d.error,'warning'):''}${!d.host.supported?notice('Native installation supports Ubuntu and Debian with APT.','warning'):!d.canManage?notice('Service changes require the installed administrator service.','warning'):''}`;
if(category==='all'){content.innerHTML=databaseNavTabs()+warning+nativeDatabaseOverview(d);bindDatabaseSubnav();}else{const s=d.software.find(v=>v.engine===category);if(!s){content.innerHTML=warning+empty('Software unavailable','Choose a database server from the navigation.','disk');return;}const installed=s.installed!==false;content.innerHTML=databaseNavTabs()+warning+`<div class="database-context"><span>${esc(nativeDatabaseDescriptions[s.engine]||'Database server')}${s.version?' · '+esc(s.version):''}</span>${installed?pill(nativeDatabaseState(s.state),nativeDatabaseTone(s)):''}</div>${installed?`<div class="tabs" role="tablist" aria-label="Database management">${[['service','Service'],['logs','Logs'],['packages','Packages']].map(([key,label])=>`<button class="tab ${tab===key?'active':''}" role="tab" id="native-database-tab-${key}" aria-controls="native-database-panel" tabindex="${tab===key?0:-1}" aria-selected="${tab===key}" data-database-tab="${key}">${label}</button>`).join('')}</div>`:''}${!installed||tab==='service'?nativeDatabaseService(s,d):tab==='packages'?nativeDatabasePackages(s,d):'<div class="card management-card"><div class="toolbar"><h2>Service logs</h2><span class="field-help">Updates automatically</span></div><pre class="database-log-output" id="native-database-logs" tabindex="0" aria-label="Recent database service logs">Loading logs…</pre></div>'}`;
if(installed){const panel=content.querySelector('.management-card');if(panel){panel.id='native-database-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','native-database-tab-'+tab);}}if(installed&&tab==='logs')await loadNativeDatabaseLogs(s.engine,id);
}
bindDatabaseSubnav();
$$('.database-open').forEach(b=>b.onclick=()=>nativeDatabaseOpen(b.dataset.engine));$$('[data-database-tab]').forEach((b,index)=>{b.onclick=action(async()=>{nativeDatabaseTab=b.dataset.databaseTab;await databasesPage();});b.onkeydown=e=>action(async()=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=$$('[data-database-tab]'),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;nativeDatabaseTab=tabs[next].dataset.databaseTab;await databasesPage();$('[data-database-tab="'+nativeDatabaseTab+'"]')?.focus();})();});bindNativeDatabaseActions();clearInterval(poll);poll=setInterval(()=>{if(view==='databases'&&!modal.open&&!activeJob&&!document.querySelector('.database-log-output:focus'))refreshNativeDatabases().catch(()=>{});},15000);
}
function bindNativeDatabaseActions() {
  const d = nativeDatabaseInventory;
  $$(".native-package").forEach(
    (b) =>
      (b.onclick = action(() =>
        prepareNativeDatabase(b.dataset.engine, b.dataset.operation),
      )),
  );
  $$(".native-service").forEach(
    (b) =>
      (b.onclick = action(async () => {
        const s = d.software.find((s) => s.engine === b.dataset.engine),
          operation = b.dataset.operation;
        if (
          ["stop", "restart", "disable"].includes(operation) &&
          !(await confirmOperation(
            operation === "disable"
              ? "Disable " + s.name + " startup?"
              : operation[0].toUpperCase() +
                  operation.slice(1) +
                  " " +
                  s.name +
                  "?",
            operation === "disable"
              ? "The native service will not be enabled for startup by this unit. Existing PostgreSQL cluster startup settings still apply."
              : "Applications using this native database may lose connections. Database data and configuration are retained.",
            operation[0].toUpperCase() + operation.slice(1),
          ))
        )
          return;
        watch(
          await post("/api/databases/operate", {
            engine: s.engine,
            operation,
            confirm: true,
          }),
          null,
          () => refreshNativeDatabases(),
        );
      })),
  );
}
async function prepareNativeDatabase(engine, operation) {
  const job = await post("/api/databases/prepare", {
    engine,
    operation,
    confirm: true,
  });
  watch(job, null, async (done) => {
    if (done.state !== "succeeded" || view !== "databases") return;
    const plan = await api(
      "/api/databases/plan?job=" + encodeURIComponent(job.id),
    );
    showNativeDatabasePlan(plan);
  });
}
function showNativeDatabasePlan(plan) {
  openModal(
    plan.operation[0].toUpperCase() + plan.operation.slice(1) + " " + plan.name,
    `<form id="native-package-apply" class="modal-body">${plan.warnings.map((w) => `<p class="field-help">${esc(w)}</p>`).join("")}<div class="table-wrap"><table class="management-table"><thead><tr><th>Package</th><th>Change</th><th>Current</th><th>Candidate</th></tr></thead><tbody>${plan.changes.map((c) => `<tr><td><code>${esc(c.name)}</code></td><td>${esc(c.action)}</td><td>${esc(c.from || "—")}</td><td>${esc(c.to || "—")}</td></tr>`).join("") || '<tr><td colspan="4">No package changes available.</td></tr>'}</tbody></table></div>${plan.operation === "uninstall" ? `<label class="detail-heading">Type ${esc(plan.name)} to confirm uninstall<input id="native-uninstall-name" autocomplete="off" required></label><p class="field-help">Database data and configuration files are retained. No purge or autoremove is performed.</p>` : ""}<p class="form-error" role="alert"></p><div class="form-actions"><button class="button ${plan.operation === "uninstall" ? "danger" : "primary"}" type="submit" ${!plan.changes.length ? "disabled" : ""}>${plan.operation === "uninstall" ? "Uninstall software" : plan.operation === "update" ? "Apply updates" : "Install software"}</button></div></form>`,
    "editor",
  );
  form("native-package-apply", async () => {
    const typedName = $("#native-uninstall-name")?.value;
    if (plan.operation === "uninstall" && typedName !== plan.name)
      throw Error("Type the exact software name to confirm uninstall.");
    const job = await post("/api/databases/apply", {
      id: plan.id,
      typedName,
      confirm: true,
    });
    modal.close();
    watch(job, null, () => refreshNativeDatabases());
  });
}

function syncNativeDatabaseNavigation(d){const group=document.querySelector('.database-subnav');if(!group)return;const present=d.software.some(s=>s.engine==='mariadb');let button=group.querySelector('[data-database-nav="mariadb"]');if(present&&!button){button=document.createElement('button');button.className='nav-link nav-child';button.dataset.view='databases';button.dataset.databaseNav='mariadb';button.setAttribute('aria-label','MariaDB');button.title='MariaDB';button.innerHTML='<span class="database-engine-mark" aria-hidden="true">M</span><span class="nav-text">MariaDB</span>';button.onclick=()=>nativeDatabaseOpen('mariadb');group.append(button);}if(button){button.hidden=!present;const selected=databaseCategory==='mariadb';button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}}

async function loadNativeDatabaseLogs(engine,id=generation){const before=$('#native-database-logs');if(!before||before===document.activeElement)return;const scroll=before.scrollTop,tail=before.scrollHeight-before.scrollTop-before.clientHeight<24;try{const r=await api('/api/databases/logs?engine='+encodeURIComponent(engine));if(view!=='databases'||id!==generation||databaseCategory!==engine||nativeDatabaseTab!=='logs')return;const out=$('#native-database-logs');if(!out||out===document.activeElement)return;const text=r.output||'No recent journal entries.';if(out.textContent!==text){out.textContent=text;out.scrollTop=tail?out.scrollHeight:scroll;}}catch(e){const out=$('#native-database-logs');if(out)out.textContent=e.message;}}
