let securitySection='map',securityMapView=null,securityStream=null,securityQuery={},securityRefreshTimer=null,securityData=null;
function disposeSecurityCenter(){
 if(securityRefreshTimer){clearInterval(securityRefreshTimer);securityRefreshTimer=null;}
 securityMapView?.dispose();
 securityMapView=null;
 securityStream?.close();
 securityStream=null;
 securityData=null;
}
function securityFacts(rows){return `<dl class="sso-facts">${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v??'Not available')}</dd></div>`).join('')}</dl>`;}

function renderOriginsList(locations,allowlist,decisions){
 return (locations||[]).slice(0,35).map((loc,idx)=>{
  const ip=(loc.source||'').split('/')[0];
  const isAllowed=ip&&allowlist.includes(ip);
  const isBanned=ip&&decisions.some(d=>(d.value||'').split('/')[0]===ip);
  const statusBadge=isAllowed?pill('Allowlisted','green'):isBanned?pill('Banned','red'):pill(`${loc.count} · ${loc.verdict}`,['blocked','decision'].includes(loc.verdict)?'red':'amber');
  return `<button type="button" class="country-event-row" data-origin-idx="${idx}">
   <div>
    <strong><code>${esc(loc.source||loc.country||'Unknown')}</code></strong>
    <small style="display:block;color:var(--muted)">${esc([loc.city,loc.country,loc.organization].filter(Boolean).join(' · '))} · ${esc(loc.engine)}</small>
   </div>
   ${statusBadge}
  </button>`;
 }).join('')||'<p class="field-help" style="padding:20px;text-align:center">No active threat origins recorded in the current inspection window.</p>';
}

function renderAllowlistTags(allowlist){
 if(!allowlist||!allowlist.length)return '';
 return `<div style="margin-top:14px;display:flex;align-items:center;flex-wrap:wrap;gap:8px">
  <small class="muted" style="font-weight:600">Trusted Allowlist (Zero-Trust Bypass): </small>
  ${allowlist.map(ip=>`<span class="pill green" style="display:inline-flex;align-items:center;gap:6px"><code>${esc(ip)}</code> <button type="button" class="text-button" data-remove-allow="${esc(ip)}" style="color:inherit;font-size:11px;padding:0" title="Remove from allowlist" aria-label="Remove ${esc(ip)}">✕</button></span>`).join('')}
 </div>`;
}

function renderAccessTbody(decisions,recentBlocked,allowlist){
 const rows=[];
 for(const d of decisions||[]){
  rows.push(`<tr>
   <td><code><strong>${esc(d.value)}</strong></code></td>
   <td><small>${esc(d.scope||'IP')} · CrowdSec LAPI</small></td>
   <td><strong>${esc(d.scenario||d.origin||'CrowdSec ban')}</strong></td>
   <td>${pill('Active Ban','red')}</td>
   <td>${esc(d.duration||d.until||'Active')}</td>
   <td class="actions-column"><div class="row-actions">
    <button class="button primary small" data-unblock-ip="${esc(d.value.split('/')[0])}" data-crowdsec-target="${esc(d.value)}">Unblock &amp; Release</button>
    <button class="button secondary small" data-allowlist-ip="${esc(d.value.split('/')[0])}">Allowlist</button>
   </div></td>
  </tr>`);
 }
 for(const b of recentBlocked||[]){
  const ip=(b.source||'').split('/')[0];
  const isAllowed=ip&&allowlist.includes(ip);
  const isBanned=ip&&decisions.some(d=>(d.value||'').split('/')[0]===ip);
  const statusPill=isAllowed?`${pill('Allowlisted','green')} <small>(${b.count}x)</small>`:isBanned?`${pill('Banned in CrowdSec','red')} <small>(${b.count}x)</small>`:`${pill(b.verdict==='blocked'?'WAF Blocked':b.verdict==='decision'?'CrowdSec Ban':'Monitored',b.verdict==='blocked'||b.verdict==='decision'?'red':'amber')} <small>(${b.count}x)</small>`;
  rows.push(`<tr>
   <td><code><strong>${esc(b.source)}</strong></code>${b.domain?`<small style="color:var(--muted);display:block">Target: ${esc(b.domain)}</small>`:''}</td>
   <td>${esc([b.city,b.country].filter(Boolean).join(', ')||'—')}<small style="color:var(--muted);display:block">${esc(b.organization||'')}</small></td>
   <td><strong>${esc(b.engine.toUpperCase())}</strong> · ${esc(b.rule_name||'Rule '+b.rule_id)}<small style="color:var(--muted);display:block">${b.rule_id?'Signature ID: '+esc(b.rule_id):''}</small></td>
   <td>${statusPill}</td>
   <td>${b.latest?esc(new Date(b.latest).toLocaleString()):'—'}</td>
   <td class="actions-column"><div class="row-actions">
    ${isBanned?`<button class="button primary small" data-unblock-ip="${esc(b.source)}" data-crowdsec-target="${esc(b.source)}">Unblock IP</button>`:''}
    ${isAllowed?`<button class="button secondary small" data-remove-allow="${esc(b.source)}">Remove Allowlist</button>`:`<button class="button secondary small" data-allowlist-ip="${esc(b.source)}">Allowlist IP</button>`}
    ${!isBanned?`<button class="button danger small" data-ban-ip="${esc(b.source)}">Ban 24h</button>`:''}
   </div></td>
  </tr>`);
 }
 if(!rows.length)return '<tr><td colspan="6"><div class="table-empty-state"><span data-icon="shield"></span><strong>Zero Active Bans or Mitigated Events</strong><p>No malicious IP addresses or active ban decisions recorded in the current audit window.</p></div></td></tr>';
 return rows.join('');
}

async function securityCenterPage(){
 if(me.role!=='admin'){content.innerHTML=empty('Administrator access required','Security controls require an administrator account.','lock');return;}
 disposeSecurityCenter();

 const s=await api('/api/security-center/status');if(view!=='waf')return;
 securityData=s;
 const counts=s.counts||[],total=counts.reduce((n,r)=>n+r.count,0),count=(engine,verdict)=>counts.filter(r=>(!engine||r.engine===engine)&&(!verdict||r.verdict===verdict)).reduce((n,r)=>n+r.count,0);
 const currentMode=s.engines.protection?.mode||'off';
 const wafBlocks=count('coraza','blocked')+count('bunkerweb','blocked');
 const idsAlerts=counts.filter(r=>r.engine==='suricata'&&r.kind==='alert').reduce((n,r)=>n+r.count,0);
 const decisions=s.engines.crowdsec?.decisions||[];
 const allowlist=s.engines.response?.allowlist||[];
 const recentBlocked=s.recentBlocked||[];
 const locations=s.locations||[];
 const domainOverrides=s.engines.coraza?.configuration?.domains||[];

 const modeBadge=currentMode==='block'
  ?pill('Active Defense · Enforcing','green')
  :currentMode==='monitor'
  ?pill('Detection Only · Audit','amber')
  :pill('Protection Bypassed','red');

 content.innerHTML=`
  <!-- Enterprise Cybersecurity Posture Banner -->
  <div class="security-hero-banner">
   <div class="security-hero-status">
    <div class="security-shield-icon ${currentMode}">
     ${icon('shield')}
     <span class="status-pulse-dot ${currentMode}"></span>
    </div>
    <div class="security-hero-copy">
     <div class="security-hero-title-row">
      <h2>Cyber Defense &amp; Threat Mitigation Center</h2>
      <span id="security-hero-mode-pill">${modeBadge}</span>
     </div>
     <p>Autonomous Edge Firewall · Coraza WAF (OWASP CRS v4) · Suricata Network IDS · CrowdSec Threat Mesh</p>
    </div>
   </div>
   <div class="security-hero-controls">
    <div class="security-mode-switcher" role="radiogroup" aria-label="Enforcement Mode">
     <button type="button" class="mode-pill-btn ${currentMode==='block'?'active-block':''}" id="native-protection-block" title="Drop &amp; mitigate malicious attacks immediately" aria-pressed="${currentMode==='block'}">
      ${icon('shield')} Enforce &amp; Mitigate
     </button>
     <button type="button" class="mode-pill-btn ${currentMode==='monitor'?'active-monitor':''}" id="native-protection-monitor" title="Audit and detect threats without dropping traffic" aria-pressed="${currentMode==='monitor'}">
      ${icon('info')} Detection Only
     </button>
     <button type="button" class="mode-pill-btn ${currentMode==='off'?'active-off':''}" id="native-protection-off" title="Bypass protection and suspend packet inspection" aria-pressed="${currentMode==='off'}">
      ${icon('stop')} Bypass Mode
     </button>
    </div>
    <div class="security-hero-quick-actions">
     ${button('security-open-grafana','Grafana SIEM','cpu','secondary')}
     ${button('security-coraza-test','Attack Simulation','check','secondary')}
     ${button('security-map-refresh','Refresh','refresh','secondary')}
    </div>
   </div>
  </div>

  ${s.collector.lastError?notice(s.collector.lastError,'warning'):''}

  <!-- 4 High-Density SOC KPI Cards -->
  <div class="security-kpi-grid">
   <div class="security-kpi-card">
    <div class="kpi-header">
     <span class="kpi-label">Active Enforcement</span>
     <span id="sec-kpi-enforce-pill">${pill(s.engines.protection?.healthy?'Operational':'Check Required',s.engines.protection?.healthy?'green':'amber')}</span>
    </div>
    <div class="kpi-value" id="sec-kpi-enforce-val">${currentMode==='block'?'Enforcing':currentMode==='monitor'?'Audit Mode':'Bypassed'}</div>
    <div class="kpi-sub" id="sec-kpi-enforce-sub">Coraza WAF · OWASP CRS v4</div>
   </div>
   <div class="security-kpi-card">
    <div class="kpi-header">
     <span class="kpi-label">Threats Mitigated</span>
     <span class="pill red" id="sec-kpi-threats-pill">${wafBlocks>0?((wafBlocks/Math.max(1,total))*100).toFixed(1)+'% dropped':'0 blocks'}</span>
    </div>
    <div class="kpi-value" id="sec-kpi-threats-val">${wafBlocks.toLocaleString()} <small class="kpi-total">/ ${total.toLocaleString()}</small></div>
    <div class="kpi-sub">Inspected web transactions</div>
   </div>
   <div class="security-kpi-card">
    <div class="kpi-header">
     <span class="kpi-label">Active IP Reputation Bans</span>
     <span id="sec-kpi-bans-pill">${pill(decisions.length?decisions.length+' active':'Clean',decisions.length?'red':'green')}</span>
    </div>
    <div class="kpi-value" id="sec-kpi-bans-val">${decisions.length} <small class="kpi-total">bans</small></div>
    <div class="kpi-sub" id="sec-kpi-bans-sub">${allowlist.length} trusted IP(s) allowlisted</div>
   </div>
   <div class="security-kpi-card">
    <div class="kpi-header">
     <span class="kpi-label">Suricata Network IDS</span>
     <span id="sec-kpi-ids-pill">${pill(s.engines.suricata?.active?'Capturing':'Standby',s.engines.suricata?.active?'green':'amber')}</span>
    </div>
    <div class="kpi-value" id="sec-kpi-ids-val">${idsAlerts.toLocaleString()} <small class="kpi-total">alerts</small></div>
    <div class="kpi-sub" id="sec-kpi-ids-sub">${(s.engines.suricata?.metadata?.signatures||0).toLocaleString()} signatures loaded</div>
   </div>
  </div>

  <!-- Modern Navigation Sub-Tabs -->
  <div class="tabs security-tabs" role="tablist">
   <button class="tab ${securitySection==='map'?'active':''}" data-sec-tab="map" type="button" role="tab" aria-selected="${securitySection==='map'}">
    ${icon('globe')} Threat Intelligence Map <span class="badge" id="sec-badge-map">${locations.length}</span>
   </button>
   <button class="tab ${securitySection==='access'?'active':''}" data-sec-tab="access" type="button" role="tab" aria-selected="${securitySection==='access'}">
    ${icon('shield')} Access Control &amp; IP Reputation <span class="badge" id="sec-badge-access">${decisions.length + recentBlocked.length}</span>
   </button>
   <button class="tab ${securitySection==='domains'?'active':''}" data-sec-tab="domains" type="button" role="tab" aria-selected="${securitySection==='domains'}">
    ${icon('network')} Domain WAF Policies <span class="badge" id="sec-badge-domains">${domainOverrides.length}</span>
   </button>
   <button class="tab ${securitySection==='maintenance'?'active':''}" data-sec-tab="maintenance" type="button" role="tab" aria-selected="${securitySection==='maintenance'}">
    ${icon('server')} Security Engines &amp; Signatures
   </button>
  </div>

  <!-- Tab Content Containers -->
  <div id="security-tab-content">
   ${renderActiveTab()}
  </div>
 `;

 function renderActiveTab(){
  if(securitySection==='map'){
   return `
    <div class="card security-map-card">
     <div class="toolbar">
      <div class="section-table-heading">
       <h2>Live Threat Origin Map &amp; Geo-Telemetry</h2>
       <span class="count-inline" id="sec-map-clusters-count">${locations.length} geolocated threat origin clusters</span>
      </div>
      <div class="table-toolbar-actions">
       ${button('security-map-refresh-inner','Refresh Map','refresh')}
      </div>
     </div>
     <div class="protection-map-layout">
      <div id="security-live-map" class="security-live-map" aria-label="Geographic source locations of mitigated attacks"></div>
      <div class="threat-countries">
       <div id="security-origin-inspector" class="card-pad" style="padding:0 0 14px;border-bottom:1px solid var(--line);margin-bottom:12px">
        <strong>Origin &amp; Incident Inspector</strong>
        <p class="field-help">Click any marker on the map or select an attacking origin below to triage, unblock, or ban the IP.</p>
       </div>
       <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:12px">Top Geolocated Origins (<span id="sec-origins-count">${locations.length}</span>)</strong>
        <small class="muted">By attack volume</small>
       </div>
       <div id="security-origins-list" style="max-height:340px;overflow-y:auto">
        ${renderOriginsList(locations,allowlist,decisions)}
       </div>
      </div>
     </div>
    </div>
   `;
  }

  if(securitySection==='access'){
   return `
    <div class="card management-card">
     <div class="toolbar">
      <div class="section-table-heading">
       <h2>Rapid IP Triage &amp; Reputation Manager</h2>
       <span class="count-inline" id="sec-access-counts">${decisions.length} active bans · ${allowlist.length} allowlisted</span>
      </div>
      <div class="table-toolbar-actions">
       ${button('security-add-ban','Add Ban Decision (CIDR / IP)','plus','danger')}
      </div>
     </div>
     <div class="card-pad" style="border-bottom:1px solid var(--line);background:var(--surface-alt)">
      <form id="security-quick-ip-form" class="toolbar-group" style="flex-wrap:wrap">
       <input id="security-quick-ip" placeholder="Search or triage IP address / CIDR (e.g. 198.51.100.24 or 203.0.113.0/24)…" style="margin:0;flex:1;min-width:280px" required>
       <button type="submit" class="button primary">${icon('check')} Unblock &amp; Allowlist IP</button>
       <button type="button" id="security-quick-ban-btn" class="button danger">Ban IP (24h)</button>
      </form>
      <div id="security-allowlist-container">
       ${renderAllowlistTags(allowlist)}
      </div>
     </div>
     <div class="table-wrap">
      <table class="management-table">
       <thead><tr><th>TARGET / IP</th><th>SCOPE &amp; LOCATION</th><th>TRIGGER ENGINE &amp; RULE</th><th>REPUTATION STATUS</th><th>EXPIRY / DURATION</th><th class="actions-column">ACTIONS</th></tr></thead>
       <tbody id="security-access-tbody">
        ${renderAccessTbody(decisions,recentBlocked,allowlist)}
       </tbody>
      </table>
     </div>
    </div>
   `;
  }

  if(securitySection==='domains'){
   return `
    <div class="card management-card">
     <div class="toolbar">
      <div class="section-table-heading">
       <h2>Virtual Host WAF Policies &amp; OWASP CRS Rules</h2>
       <span class="count-inline">${domainOverrides.length} domain policies configured</span>
      </div>
      <div class="table-toolbar-actions">
       ${button('security-domain-policy','Configure WAF Policies &amp; Exclusions','edit','primary')}
      </div>
     </div>
     <div class="card-pad" style="border-bottom:1px solid var(--line)">
      <p>Configure dedicated Coraza WAF rulesets, false-positive exclusions, and sensitivity levels per virtual host. Changes are cryptographically validated with automated zero-downtime rollback.</p>
     </div>
     <div class="table-wrap">
      <table class="management-table">
       <thead><tr><th>PROTECTED HOST / DOMAIN</th><th>ENFORCEMENT MODE</th><th>OWASP CRS EXCLUSIONS</th><th>CUSTOM SIGNATURES</th><th class="actions-column">POLICY STATUS</th></tr></thead>
       <tbody>
        <tr>
         <td><strong>* (Global Fallback)</strong><small style="color:var(--muted);display:block">Default server reverse proxy</small></td>
         <td>${pill(currentMode==='block'?'Enforce & Mitigate':currentMode==='monitor'?'Detection Only':'Bypassed',currentMode==='block'?'green':currentMode==='monitor'?'amber':'')}</td>
         <td>Standard OWASP CRS v4 Core Rule Set</td>
         <td>${s.engines.coraza?.configuration?.customRules?.length||0} custom rule(s)</td>
         <td class="actions-column">${pill('Active Global Policy','blue')}</td>
        </tr>
        ${domainOverrides.map(d=>`<tr>
         <td><code><strong>${esc(d.domain)}</strong></code></td>
         <td>${pill(d.mode==='block'?'Enforce':d.mode==='monitor'?'Audit':d.mode==='off'?'Bypass':'Inherit',d.mode==='block'?'green':d.mode==='monitor'?'amber':'')}</td>
         <td>${d.exclusions?.length?d.exclusions.map(ex=>`<span class="badge" style="margin-right:4px">Rule ${esc(ex)}</span>`).join(''):'Zero exclusions (Strict CRS)'}</td>
         <td>—</td>
         <td class="actions-column"><button class="button secondary small" id="edit-domain-override">Manage Policy</button></td>
        </tr>`).join('')}
       </tbody>
      </table>
     </div>
    </div>
   `;
  }

  if(securitySection==='maintenance'){
   return `
    <div class="security-engine-grid">
     <div class="engine-card">
      <div class="engine-card-header">
       <div class="engine-card-title">
        ${icon('shield')}
        <div>
         <h3>Coraza HTTP WAF</h3>
         <small class="muted">OWASP Core Rule Set v4</small>
        </div>
       </div>
       ${pill(s.engines.protection?.healthy?'Healthy':'Degraded',s.engines.protection?.healthy?'green':'amber')}
      </div>
      <div class="engine-card-facts">
       <div><dt>Enforcement Mode</dt><dd><code>${esc(s.engines.coraza?.configuration?.mode||currentMode)}</code></dd></div>
       <div><dt>Config Revision</dt><dd>${esc(s.engines.coraza?.configuration?.revision?.slice(0,8)||'Current')}</dd></div>
       <div><dt>Domain Overrides</dt><dd>${domainOverrides.length} domain(s)</dd></div>
       <div><dt>Panel Bypass</dt><dd>Host protected</dd></div>
      </div>
     </div>

     <div class="engine-card">
      <div class="engine-card-header">
       <div class="engine-card-title">
        ${icon('network')}
        <div>
         <h3>Suricata Network IDS</h3>
         <small class="muted">Emerging Threats (ET Open)</small>
        </div>
       </div>
       ${pill(s.engines.suricata?.active?'Capturing':'Stopped',s.engines.suricata?.active?'green':'amber')}
      </div>
      <div class="engine-card-facts">
       <div><dt>Active Signatures</dt><dd>${(s.engines.suricata?.metadata?.signatures||0).toLocaleString()} rules</dd></div>
       <div><dt>Total Packet Alerts</dt><dd>${idsAlerts.toLocaleString()}</dd></div>
       <div><dt>Flow Telemetry</dt><dd>${s.engines.suricata?.telemetry?'Enabled':'Disabled'}</dd></div>
       <div><dt>Live Toggle</dt><dd><button id="security-telemetry" class="text-button" type="button">${s.engines.suricata?.telemetry?'Disable Telemetry':'Enable Telemetry'}</button></dd></div>
      </div>
     </div>

     <div class="engine-card">
      <div class="engine-card-header">
       <div class="engine-card-title">
        ${icon('users')}
        <div>
         <h3>CrowdSec Threat Engine</h3>
         <small class="muted">Local API &amp; Community Intelligence</small>
        </div>
       </div>
       ${pill(s.engines.crowdsec?.available?'Connected':'Unavailable',s.engines.crowdsec?.available?'green':'amber')}
      </div>
      <div class="engine-card-facts">
       <div><dt>Active Scenarios</dt><dd>${s.engines.crowdsec?.scenarios?.length||0} detection scenarios</dd></div>
       <div><dt>Active Ban Decisions</dt><dd>${decisions.length} banned targets</dd></div>
       <div><dt>WAF Gateway</dt><dd>Synchronized</dd></div>
       <div><dt>Local Journal</dt><dd>Active</dd></div>
      </div>
     </div>

     <div class="engine-card">
      <div class="engine-card-header">
       <div class="engine-card-title">
        ${icon('globe')}
        <div>
         <h3>MaxMind GeoIP2 Database</h3>
         <small class="muted">City + Autonomous System (ASN)</small>
        </div>
       </div>
       ${pill(s.geoip?.available?'Loaded':'Unavailable',s.geoip?.available?'green':'amber')}
      </div>
      <div class="engine-card-facts">
       <div><dt>Database Size</dt><dd>${Math.round((s.databaseBytes||0)/1048576)} MiB</dd></div>
       <div><dt>Retention Window</dt><dd>${s.settings?.eventDays||30} days</dd></div>
       <div><dt>Last Database Update</dt><dd>${esc(s.geoip?.metadata?.updatedAt?new Date(s.geoip.metadata.updatedAt).toLocaleDateString():'Synchronized')}</dd></div>
       <div><dt>ASN Coverage</dt><dd>Global AS routing</dd></div>
      </div>
     </div>
    </div>

    <div class="card management-card">
     <div class="toolbar">
      <div class="section-table-heading">
       <h2>Security Operations, Updates &amp; Diagnostics</h2>
      </div>
     </div>
     <div class="card-pad" style="display:flex;flex-wrap:wrap;gap:12px">
      ${button('security-ids-update','Update IDS Signatures (ET Open)','refresh','primary')}
      ${button('security-geoip-update','Update GeoIP2 Databases','download')}
      ${button('security-coraza-test','Run Full WAF &amp; IDS Self-Test','check')}
      ${button('security-local-rules','Custom Network Signatures','edit')}
      ${button('security-settings-open','Event Retention &amp; DB Limits','disk')}
     </div>
    </div>
   `;
  }
  return '';
 }

 // Bind Subtab Switching
 $$('[data-sec-tab]').forEach(tab=>{
  tab.onclick=()=>{
   securitySection=tab.dataset.secTab;
   if(typeof syncRouteState==='function')syncRouteState();
   $$('[data-security-nav]').forEach(b=>{
    const sel=b.dataset.securityNav===securitySection;
    b.classList.toggle('active',sel);
    if(sel)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
   });
   securityCenterPage();
  };
 });
 $$('[data-security-nav]').forEach(b=>{
  const sel=b.dataset.securityNav===securitySection;
  b.classList.toggle('active',sel);
  if(sel)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
 });

 function inspectOrigin(loc){
  const box=$('#security-origin-inspector');
  if(!box||!loc)return;
  if(securityMapView?.map&&Number.isFinite(Number(loc.longitude))&&Number.isFinite(Number(loc.latitude))){
   securityMapView.map.easeTo({center:[Number(loc.longitude),Number(loc.latitude)],zoom:Math.max(securityMapView.map.getZoom(),4.5)});
  }
  const ipAddr=(loc.source||'').split('/')[0];
  const curAllowlist=securityData?.engines?.response?.allowlist||allowlist;
  const curDecisions=securityData?.engines?.crowdsec?.decisions||decisions;
  const isAllowed=ipAddr&&curAllowlist.includes(ipAddr);
  const isBanned=ipAddr&&curDecisions.some(d=>(d.value||'').split('/')[0]===ipAddr);
  const statusPill=isAllowed?pill('Allowlisted (Trusted)','green'):isBanned?pill('Actively Banned in CrowdSec','red'):pill('Historical '+loc.verdict,['blocked','decision'].includes(loc.verdict)?'amber':'blue');
  const statusNotice=isAllowed?`<div style="margin:8px 0;padding:8px 10px;border-radius:6px;background:rgba(34,197,94,0.12);color:var(--text);font-size:12px;border:1px solid rgba(34,197,94,0.3)"><strong>Active State:</strong> ✅ Allowlisted · Bypasses all Coraza WAF rules and firewall blocks.<br><small style="color:var(--muted)">Historical audit: ${loc.count} past event(s) recorded on ${esc(loc.domain||'servers')}.</small></div>`:isBanned?`<div style="margin:8px 0;padding:8px 10px;border-radius:6px;background:rgba(239,68,68,0.12);color:var(--text);font-size:12px;border:1px solid rgba(239,68,68,0.3)"><strong>Active State:</strong> 🚫 Actively Banned by CrowdSec LAPI.</div>`:`<div style="margin:8px 0;padding:6px 10px;border-radius:6px;background:var(--surface-alt);color:var(--muted);font-size:12px"><strong>Active State:</strong> Not currently banned (${loc.count} past ${esc(loc.verdict||'detected')} events recorded).</div>`;

  box.innerHTML=`
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <strong><code>${esc(ipAddr||loc.country||'Origin')}</code></strong>
    ${statusPill}
   </div>
   ${statusNotice}
   <div style="font-size:12px;color:var(--muted);line-height:1.6">
    <div><strong>Location:</strong> ${esc([loc.city,loc.country].filter(Boolean).join(', ')||'Unknown')}</div>
    <div><strong>ISP / ASN:</strong> ${esc(loc.organization||'Unknown')} ${loc.asn?`(AS${esc(loc.asn)})`:''}</div>
    <div><strong>Engine &amp; Signature:</strong> ${esc(loc.engine)} · ${esc(loc.rule_name||'Signature match')} (${loc.count} events)</div>
    ${loc.domain?`<div><strong>Target Host:</strong> <code>${esc(loc.domain)}</code></div>`:''}
   </div>
   ${ipAddr?`<div class="row-actions" style="margin-top:12px;flex-wrap:wrap">
    ${isBanned?`<button type="button" class="button primary small" id="inspect-unblock">Unblock &amp; Release</button>`:''}
    ${isAllowed?`<button type="button" class="button secondary small" id="inspect-remove-allow">Remove Allowlist</button>`:`<button type="button" class="button secondary small" id="inspect-allow">Allowlist IP</button>`}
    ${!isBanned?`<button type="button" class="button danger small" id="inspect-ban">Ban 24h</button>`:''}
    ${loc.rule_id&&loc.domain?`<button type="button" class="button secondary small" id="inspect-exempt" title="Exempt Rule ${esc(loc.rule_id)} on ${esc(loc.domain)}">Exempt Rule ${esc(loc.rule_id)}</button>`:''}
   </div>`:''}`;

  if(ipAddr){
   bind('inspect-unblock',()=>unblockIp(ipAddr,ipAddr,loc));
   bind('inspect-allow',()=>allowlistIp(ipAddr,'add',loc));
   bind('inspect-remove-allow',()=>allowlistIp(ipAddr,'remove',loc));
   bind('inspect-ban',()=>banIp(ipAddr,24,loc));
   if(loc.rule_id&&loc.domain)bind('inspect-exempt',()=>exemptWafRule(loc.domain,loc.rule_id));
  }
 }

 async function exemptWafRule(domain,ruleId){
  if(!confirm(`Exempt Coraza WAF Rule ${ruleId} for domain ${domain}?\nThis removes false-positive blocks caused by this signature.`))return;
  await post('/api/security-center/coraza/exclude-rule',{domain,ruleId:String(ruleId),confirm:true});
  notify(`Exempted WAF rule ${ruleId} for ${domain}. Policy applied.`);
  await syncSecurityData(true);
 }

 async function unblockIp(ipAddr,csTarget,reinspectLoc){
  const cleanIp=String(ipAddr||'').split('/')[0].trim();
  await Promise.allSettled([
   post('/api/protection/unban',{ip:cleanIp,confirm:true}),
   post('/api/security-center/crowdsec/decision',{confirm:true,action:'release',target:csTarget||cleanIp})
  ]);
  notify(`Released and unblocked ${cleanIp} across CrowdSec and host firewall.`);
  await syncSecurityData(true);
  if(reinspectLoc)inspectOrigin(reinspectLoc);
 }

 async function allowlistIp(ipAddr,act='add',reinspectLoc){
  const cleanIp=String(ipAddr||'').split('/')[0].trim();
  await post('/api/protection/allowlist',{ip:cleanIp,action:act,confirm:true});
  if(act==='add'){
   await post('/api/security-center/crowdsec/decision',{confirm:true,action:'release',target:cleanIp}).catch(()=>{});
  }
  notify(act==='add'?`Added ${cleanIp} to allowlist and cleared any active bans.`:`Removed ${cleanIp} from allowlist.`);
  await syncSecurityData(true);
  if(reinspectLoc)inspectOrigin(reinspectLoc);
 }

 async function banIp(targetIp,hours=24,reinspectLoc){
  await post('/api/security-center/crowdsec/decision',{confirm:true,action:'ban',target:targetIp.trim(),duration:hours+'h'});
  notify(`Banned ${targetIp} in CrowdSec for ${hours}h.`);
  await syncSecurityData(true);
  if(reinspectLoc)inspectOrigin(reinspectLoc);
 }

 // Global Hero Mode Switcher
 for(const mode of ['off','monitor','block']){
  bind('native-protection-'+mode,async()=>{
   const modeLabel=mode==='block'?'ENFORCEMENT (BLOCK ATTACKS)':mode==='monitor'?'DETECTION ONLY (AUDIT)':'BYPASS';
   if(await confirmOperation('Set cybersecurity posture to '+modeLabel+'?','This updates Coraza HTTP WAF enforcement and native IDS packet capture across your infrastructure with zero downtime.','Apply '+mode.toUpperCase())){
    watch(await post('/api/protection/mode',{mode,revision:s.engines.coraza.configuration?.revision,confirm:true}),null,()=>securityCenterPage());
   }
  });
 }

 bind('security-open-grafana',()=>{window.preferredGrafanaDash='security';monitoringCategory='console';route('monitoring');});

 const triggerRefresh=async()=>{
  const btn1=$('#security-map-refresh'),btn2=$('#security-map-refresh-inner');
  if(btn1)btn1.disabled=true;if(btn2)btn2.disabled=true;
  try{
   await syncSecurityData(true);
   notify('Threat intelligence and security telemetry synchronized.');
  }finally{
   if(btn1)btn1.disabled=false;if(btn2)btn2.disabled=false;
  }
 };
 bind('security-map-refresh',triggerRefresh);
 bind('security-map-refresh-inner',triggerRefresh);

 bind('security-domain-policy',()=>securityDomainPolicy(s.engines.coraza.configuration));
 bind('edit-domain-override',()=>securityDomainPolicy(s.engines.coraza.configuration));

 function bindOriginsList(){
  const listLocations=securityData?.locations||locations;
  $$('#security-origins-list [data-origin-idx]').forEach(b=>b.onclick=()=>inspectOrigin(listLocations[Number(b.dataset.originIdx)]));
 }

 function bindAccessActions(){
  $$('[data-unblock-ip]').forEach(b=>b.onclick=action(()=>unblockIp(b.dataset.unblockIp,b.dataset.crowdsecTarget)));
  $$('[data-allowlist-ip]').forEach(b=>b.onclick=action(()=>allowlistIp(b.dataset.allowlistIp,'add')));
  $$('[data-remove-allow]').forEach(b=>b.onclick=action(()=>allowlistIp(b.dataset.removeAllow,'remove')));
  $$('[data-ban-ip]').forEach(b=>b.onclick=action(()=>banIp(b.dataset.banIp,24)));
 }

 bindOriginsList();
 bindAccessActions();

 form('security-quick-ip-form',async()=>{
  const ip=$('#security-quick-ip').value.trim();
  if(!ip)return;
  await unblockIp(ip,ip);
  await allowlistIp(ip,'add');
 });

 bind('security-quick-ban-btn',async()=>{
  const ip=$('#security-quick-ip').value.trim();
  if(!ip)return notify('Enter an IP address or CIDR in the input box first.');
  await banIp(ip,24);
 });

 bind('security-add-ban',()=>{
  openModal('Add Ban Decision in CrowdSec',`<form id="security-ban-form" class="modal-body"><label>Public IP or CIDR Network<input name="target" placeholder="e.g. 203.0.113.50 or 198.51.100.0/24" required></label><label>Ban Duration (Hours)<input name="hours" type="number" min="1" max="168" value="24" required></label><p class="field-help">Adds an active ban decision to CrowdSec and synchronizes immediately with the Coraza WAF drop table.</p><div class="form-actions"><button class="button danger" type="submit">Deploy Ban Decision</button></div></form>`);
  $('#security-ban-form').onsubmit=action(async e=>{
   e.preventDefault();
   const f=Object.fromEntries(new FormData(e.target));
   modal.close();
   await banIp(f.target,Number(f.hours)||24);
  });
 });

 bind('security-ids-update',async()=>watch(await post('/api/protection/ids-update',{confirm:true}),null,()=>syncSecurityData(true)));
 bind('security-geoip-update',async()=>watch(await post('/api/security-center/geoip/update',{confirm:true}),null,()=>syncSecurityData(true)));
 bind('security-coraza-test',async()=>watch(await post('/api/protection/test',{confirm:true}),null,()=>syncSecurityData(true)));
 bind('security-telemetry',async()=>watch(await post('/api/security-center/ids/telemetry',{enabled:!s.engines.suricata?.telemetry,confirm:true}),null,()=>syncSecurityData(true)));
 
 bind('security-local-rules',async()=>{
  const catalog=await api('/api/security-center/rules');
  openModal('Custom Suricata Network Signatures',`<form id="security-local-form" class="modal-body"><p class="field-help">Self-contained ET rules with SID 9901000–9901999 are validated by Suricata before deployment.</p><label>Rules<textarea name="rules" rows="14" spellcheck="false">${esc(catalog.localRules||'')}</textarea></label><div class="form-actions"><button class="button primary" type="submit">Validate &amp; deploy rules</button></div></form>`,'editor');
  $('#security-local-form').onsubmit=action(async e=>{
   e.preventDefault();
   const rules=new FormData(e.target).get('rules');
   modal.close();
   watch(await post('/api/security-center/ids/local-rules',{rules,confirm:true}),null,()=>syncSecurityData(true));
  });
 });

 bind('security-settings-open',()=>{
  openModal('Security Event Retention & Database Limits',`<form id="security-settings-form" class="modal-body"><div class="form-grid"><label>Event retention (days)<input name="eventDays" type="number" min="1" max="90" value="${s.settings?.eventDays||30}"></label><label>Flow metadata retention (hours)<input name="flowHours" type="number" min="1" max="168" value="${s.settings?.flowHours||24}"></label><label class="span-2">Maximum event database size (MiB)<input name="databaseMiB" type="number" min="256" max="10240" value="${Math.round((s.settings?.maxDatabaseBytes||2147483648)/1048576)}"></label></div><div class="form-actions"><button class="button primary" type="submit">Save retention limits</button></div></form>`);
  $('#security-settings-form').onsubmit=action(async e=>{
   e.preventDefault();
   const f=Object.fromEntries(new FormData(e.target));
   await post('/api/security-center/settings',{confirm:true,eventDays:Number(f.eventDays),flowHours:Number(f.flowHours),maxDatabaseBytes:Number(f.databaseMiB)*1048576});
   modal.close();
   notify('Security retention limits updated.');
   await syncSecurityData(true);
  });
 });

 // Mount Map if in map view
 if(securitySection==='map'&&$('#security-live-map')){
  securityMapView=SecurityMap.mount($('#security-live-map'),locations,loc=>inspectOrigin(loc));
  if(locations.length)inspectOrigin(locations[0]);
 }

 // Live Synchronization Logic
 function updateSecurityViews(fresh){
  if(!fresh||view!=='waf')return;
  const fcounts=fresh.counts||[],ftotal=fcounts.reduce((n,r)=>n+r.count,0),fcount=(engine,verdict)=>fcounts.filter(r=>(!engine||r.engine===engine)&&(!verdict||r.verdict===verdict)).reduce((n,r)=>n+r.count,0);
  const fmode=fresh.engines?.protection?.mode||'off';
  const fwafBlocks=fcount('coraza','blocked')+fcount('bunkerweb','blocked');
  const fidsAlerts=fcounts.filter(r=>r.engine==='suricata'&&r.kind==='alert').reduce((n,r)=>n+r.count,0);
  const fdecisions=fresh.engines?.crowdsec?.decisions||[];
  const fallowlist=fresh.engines?.response?.allowlist||[];
  const frecentBlocked=fresh.recentBlocked||[];
  const flocations=fresh.locations||[];
  const fdomainOverrides=fresh.engines?.coraza?.configuration?.domains||[];

  // Hero Pill
  const heroBadge=$('#security-hero-mode-pill');
  if(heroBadge)heroBadge.innerHTML=fmode==='block'?pill('Active Defense · Enforcing','green'):fmode==='monitor'?pill('Detection Only · Audit','amber'):pill('Protection Bypassed','red');

  // KPI Values
  const kpiEnforceVal=$('#sec-kpi-enforce-val');
  if(kpiEnforceVal)kpiEnforceVal.textContent=fmode==='block'?'Enforcing':fmode==='monitor'?'Audit Mode':'Bypassed';

  const kpiThreatsPill=$('#sec-kpi-threats-pill');
  if(kpiThreatsPill)kpiThreatsPill.textContent=fwafBlocks>0?((fwafBlocks/Math.max(1,ftotal))*100).toFixed(1)+'% dropped':'0 blocks';
  const kpiThreatsVal=$('#sec-kpi-threats-val');
  if(kpiThreatsVal)kpiThreatsVal.innerHTML=`${fwafBlocks.toLocaleString()} <small class="kpi-total">/ ${ftotal.toLocaleString()}</small>`;

  const kpiBansPill=$('#sec-kpi-bans-pill');
  if(kpiBansPill)kpiBansPill.innerHTML=pill(fdecisions.length?fdecisions.length+' active':'Clean',fdecisions.length?'red':'green');
  const kpiBansVal=$('#sec-kpi-bans-val');
  if(kpiBansVal)kpiBansVal.innerHTML=`${fdecisions.length} <small class="kpi-total">bans</small>`;
  const kpiBansSub=$('#sec-kpi-bans-sub');
  if(kpiBansSub)kpiBansSub.textContent=`${fallowlist.length} trusted IP(s) allowlisted`;

  const kpiIdsVal=$('#sec-kpi-ids-val');
  if(kpiIdsVal)kpiIdsVal.innerHTML=`${fidsAlerts.toLocaleString()} <small class="kpi-total">alerts</small>`;

  // Tab Badges
  const bMap=$('#sec-badge-map');if(bMap)bMap.textContent=flocations.length;
  const bAccess=$('#sec-badge-access');if(bAccess)bAccess.textContent=fdecisions.length+frecentBlocked.length;
  const bDomains=$('#sec-badge-domains');if(bDomains)bDomains.textContent=fdomainOverrides.length;

  if(securitySection==='map'){
   const clustersCount=$('#sec-map-clusters-count');
   if(clustersCount)clustersCount.textContent=`${flocations.length} geolocated threat origin clusters`;
   const originsCount=$('#sec-origins-count');
   if(originsCount)originsCount.textContent=flocations.length;
   const list=$('#security-origins-list');
   if(list){
    list.innerHTML=renderOriginsList(flocations,fallowlist,fdecisions);
    bindOriginsList();
   }
   securityMapView?.update?.(flocations);
  }else if(securitySection==='access'){
   const accessCounts=$('#sec-access-counts');
   if(accessCounts)accessCounts.textContent=`${fdecisions.length} active bans · ${fallowlist.length} allowlisted`;
   const allowContainer=$('#security-allowlist-container');
   if(allowContainer)allowContainer.innerHTML=renderAllowlistTags(fallowlist);
   const tbody=$('#security-access-tbody');
   if(tbody){
    tbody.innerHTML=renderAccessTbody(fdecisions,frecentBlocked,fallowlist);
    bindAccessActions();
   }
  }
 }

 let isSyncing=false;
 async function syncSecurityData(force=false){
  if(isSyncing||view!=='waf')return;
  isSyncing=true;
  try{
   const fresh=await api('/api/security-center/status'+(force?'?refresh=1':''));
   if(view!=='waf')return;
   securityData=fresh;
   updateSecurityViews(fresh);
  }catch(err){
   console.warn('Security Center live sync warning:',err);
  }finally{
   isSyncing=false;
  }
 }

 // Set up periodic auto-refresh every 12 seconds
 securityRefreshTimer=setInterval(()=>{
  if(view==='waf'&&document.visibilityState!=='hidden')syncSecurityData(false);
 },12000);

 // Set up live server-sent events stream
 if(window.EventSource&&!securityStream){
  try{
   securityStream=new EventSource('/api/security-center/stream');
   let debounceTimer=null;
   securityStream.addEventListener('security',()=>{
    if(debounceTimer)clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>{if(view==='waf')syncSecurityData(true);},1500);
   });
  }catch{}
 }
}

function securityDomainPolicy(c){
 if(!c)return notify('Coraza is not configured');
 openModal('Per-domain WAF policies & rule exclusions',`<form id="security-domain-form" class="modal-body"><label>Default WAF mode<select name="mode">${['block','monitor','off'].map(v=>`<option ${c.mode===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Custom rules (JSON)<textarea name="customRules" rows="6" spellcheck="false">${esc(JSON.stringify(c.customRules||[],null,2))}</textarea></label><p class="field-help">Custom rules accept id (10000000–10000999), target (REQUEST_URI, ARGS or REQUEST_HEADERS:User-Agent), pattern and action (detect or block).</p><label>Domain overrides &amp; OWASP CRS Rule Exclusions (JSON)<textarea name="domains" rows="10" spellcheck="false">${esc(JSON.stringify(c.domains,null,2))}</textarea></label><p class="field-help">Example: <code>[{"domain": "app.example.com", "mode": "block", "exclusions": [942100, 941100]}]</code>. Validated before reload; automatic rollback on failure.</p><div class="form-actions"><button class="button primary" type="submit">Validate &amp; apply WAF policy</button></div></form>`,'editor');
 $('#security-domain-form').onsubmit=action(async e=>{
  e.preventDefault();
  const f=Object.fromEntries(new FormData(e.target)),domains=JSON.parse(f.domains);
  if(!Array.isArray(domains))throw Error('Domain overrides must be an array');
  modal.close();
  watch(await post('/api/security-center/coraza/policy',{confirm:true,revision:c.revision,mode:f.mode,domains,customRules:JSON.parse(f.customRules)}),null,()=>securityCenterPage());
 });
}
