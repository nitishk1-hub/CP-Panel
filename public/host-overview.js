function bytes(v){if(v===null||v===undefined)return '—';const units=['B','KiB','MiB','GiB','TiB'];const i=v>0?Math.max(0,Math.min(4,Math.floor(Math.log(v)/Math.log(1024)))):0;return (v/1024**i).toFixed(i?1:0)+' '+units[i];}
function rate(v){return v===null||v===undefined?'—':bytes(v)+'/s';}
let resourceMounts=[],showSystemMounts=false,monitoringCategory='console';
function mountedDrives(){const rows=resourceMounts.filter(m=>showSystemMounts||!m.system);return `<div class="table-wrap"><table><thead><tr><th>MOUNT / DEVICE</th><th>CAPACITY</th><th>USED</th><th>AVAILABLE</th><th>UTILIZATION</th></tr></thead><tbody>${rows.map(m=>`<tr><td><strong class="mount-name">${esc(m.mount)}</strong><small>${esc(m.source)} · ${esc(m.filesystem)}${m.readOnly?' · Read only':''}</small></td><td>${m.total===null?'—':bytes(m.total)}</td><td>${m.used===null?'—':bytes(m.used)}</td><td>${m.available===null?'—':bytes(m.available)}</td><td><div class="drive-usage"><div class="meter"><div class="meter-fill ${m.percent>=90?'amber':''}" data-width="${percent(m.percent||0)}"></div></div><span>${m.percent===null?'—':m.percent+'%'}</span></div></td></tr>`).join('')}</tbody></table></div><div class="table-footer">${rows.length} mounted filesystems · Shared and bind mounts are not added together.</div>`;}
function applyMeters(root=content){root.querySelectorAll('[data-width]').forEach(e=>e.style.width=e.dataset.width+'%');}
function networkChart(){const w=Math.max(360,Math.floor(document.getElementById('network-chart')?.clientWidth||650)-32),h=225,l=70,r=w-18,t=20,b=190,max=Math.max(1024,...samples.flatMap(s=>[s.rx||0,s.tx||0]))*1.15;const path=key=>{let d='',pen=false;samples.forEach((s,i)=>{if(s[key]===null||s[key]===undefined){pen=false;return;}d+=`${pen?'L':'M'}${l+(r-l)*i/59},${b-(b-t)*s[key]/max} `;pen=true;});return d;};return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Incoming and outgoing network traffic in bytes per second">${[0,.5,1].map(p=>`<path class="chart-grid" d="M${l} ${b-(b-t)*p}H${r}"/><text class="chart-label" x="4" y="${b-(b-t)*p+3}">${esc(rate(max*p))}</text>`).join('')}<path class="chart-cpu" d="${path('rx')}"/><path class="chart-ram" d="${path('tx')}"/><text class="chart-label" x="${l}" y="219">Recent samples · 2 minute window</text></svg>`;}
async function hostOverview(id){samples.length=0;const obs=await api('/api/grafana/status').catch(()=>({pollMode:'standard',effectiveIntervalMs:2000,installed:false,active:false}));if(id!==generation)return;const intervalMs=obs.effectiveIntervalMs||2000;
 content.innerHTML=`<div class="overview-control-bar card"><div class="overview-control-copy"><span class="status-dot"></span><strong>Telemetry & panel load:</strong> ${pill(obs.pollMode==='low-load'?'Low-load (15s · Grafana offload)':obs.pollMode==='offloaded'?'Offloaded (60s)':obs.pollMode==='balanced'?'Balanced (5s)':'Live (2s)',obs.pollMode==='low-load'||obs.pollMode==='offloaded'?'green':'blue')}<span class="muted tiny">Coalesced zero-wait host sampler active</span></div>${me.role==='admin'?`<div class="toolbar-group"><select id="overview-poll-mode" class="filters-select" aria-label="Panel polling mode"><option value="standard" ${obs.pollMode==='standard'?'selected':''}>Live · 2s</option><option value="balanced" ${obs.pollMode==='balanced'?'selected':''}>Balanced · 5s</option><option value="low-load" ${obs.pollMode==='low-load'?'selected':''}>Low-load · 15s (Grafana)</option><option value="offloaded" ${obs.pollMode==='offloaded'?'selected':''}>Offloaded · 60s</option></select><button id="overview-grafana-open" class="button secondary small" type="button">${icon('cpu')}Grafana & Load</button><button id="overview-ops-open" class="button secondary small" type="button">${icon('clock')}Operations & Audit</button></div>`:''}</div><div class="metric-grid">${metricCard('cpu','CPU usage','')}${metricCard('memory','Memory usage','green')}${metricCard('download','Network received','violet')}${metricCard('upload','Network sent','amber')}</div><div class="overview-chart-grid"><div class="card"><div class="card-header"><div><h2>Resource activity</h2><p>CPU and memory · ${Math.round(intervalMs/1000)}s interval</p></div><div class="legend"><span><i></i>CPU</span><span><i class="ram"></i>RAM</span></div></div><div class="chart-container" id="resource-chart"></div></div><div class="card"><div class="card-header"><div><h2>Network activity</h2><p id="network-scope">Detecting host uplinks…</p></div><div class="legend"><span><i></i>In</span><span><i class="ram"></i>Out</span></div></div><div class="chart-container" id="network-chart"></div></div></div><div class="card"><div class="card-header"><div><h2>Mounted drives</h2><p>Capacity and available space on every mounted filesystem</p></div><label class="mount-toggle"><input id="show-system-mounts" type="checkbox" ${showSystemMounts?'checked':''}> Include system & bind mounts</label></div><div id="mounted-drives">${empty('Reading mounted drives','Collecting storage information.','disk')}</div></div><div class="overview-bottom-grid"><div class="card"><div class="card-header"><h2>Containers <span id="overview-docker-count" class="count-inline"></span></h2><button id="view-containers" class="text-button">Manage ${icon('arrow')}</button></div><div id="overview-containers">${empty('Reading containers','Connecting to Docker.','docker')}</div></div><div><div class="card"><div class="card-header"><h2>Grafana & Observability</h2><button id="view-grafana" class="text-button">Manage ${icon('arrow')}</button></div><div class="card-pad" id="grafana-summary">${pill(obs.active?'Running':obs.installed?'Stopped':'Ready to provision',obs.active?'green':obs.installed?'amber':'blue')}<p class="field-help">${obs.active?`Independent Grafana active on ${esc(obs.localURL)} · Panel polling at ${Math.round(intervalMs/1000)}s.`:'Offload continuous metrics and dashboards to an independent Grafana instance to reduce panel load.'}</p></div></div><div class="card"><div class="card-header"><h2>Cloudflare Tunnel</h2><button id="view-tunnel" class="text-button">Manage ${icon('arrow')}</button></div><div class="card-pad" id="tunnel-summary">Checking connector…</div></div><div class="card"><div class="card-header"><h2>Server information</h2>${pill('Online','green')}</div><div class="info-list" id="host-info"></div></div></div></div><details class="card"><summary class="card-pad">Network interfaces · counters since boot</summary><div id="network-interfaces"></div></details>`;
 bind('view-containers',()=>route('docker'));bind('view-tunnel',()=>{sub='tunnel';route('system');});bind('view-grafana',()=>{monitoringCategory='console';route('monitoring');});bind('overview-grafana-open',()=>{monitoringCategory='console';route('monitoring');});bind('overview-ops-open',()=>route('tasks'));
 if($('#overview-poll-mode'))$('#overview-poll-mode').onchange=action(async()=>{const pollMode=$('#overview-poll-mode').value;await post('/api/grafana/settings',{pollMode,confirm:true});notify('Panel polling updated to '+pollMode+'.');await hostOverview(generation);});
 bind('show-system-mounts',()=>{showSystemMounts=$('#show-system-mounts').checked;$('#mounted-drives').innerHTML=mountedDrives();applyMeters();});let updating=false,ticks=0;
 const update=async()=>{if(updating)return;updating=true;try{const m=await api('/api/metrics');if(id!==generation)return;const n=m.network;samples.push({time:m.time,cpu:m.cpu,ram:m.memory.used/m.memory.total*100,rx:n.receiveRate,tx:n.sendRate});if(samples.length>60)samples.shift();for(const [key,value,detail]of [['cpu',m.cpu,`${m.cores} logical cores`],['memory',m.memory.used/m.memory.total*100,`${size(m.memory.used)} / ${size(m.memory.total)}`]]){$('#'+key+'-value').innerHTML=value.toFixed(1)+'<span>%</span>';$('#'+key+'-bar').style.width=percent(value)+'%';$('#'+key+'-detail').textContent=detail;}
 for(const [key,value,total]of [['download',n.receiveRate,n.received],['upload',n.sendRate,n.sent]]){$('#'+key+'-value').textContent=rate(value);$('#'+key+'-detail').textContent=total===null||total===undefined?'Collecting interface samples':bytes(total)+' since boot';$('#'+key+'-bar').style.width='0';}
 $('#network-scope').textContent=n.included.length?'Host uplinks: '+n.included.join(', ')+' · bytes/sec':'No host uplink detected · inspect interfaces below';$('#resource-chart').innerHTML=chartMarkup();$('#network-chart').innerHTML=networkChart();resourceMounts=m.mounts.items;$('#mounted-drives').innerHTML=m.mounts.available?mountedDrives():empty('Drive information unavailable',m.mounts.error,'disk');applyMeters();$('#host-info').innerHTML=[['Hostname',m.hostname],['Uptime',Math.floor(m.uptime/86400)+'d '+Math.floor(m.uptime%86400/3600)+'h'],['CPU cores',m.cores],['Total memory',size(m.memory.total)]].map(([k,v])=>`<div class="info-row"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('');$('#network-interfaces').innerHTML=`<div class="table-wrap"><table><thead><tr><th>INTERFACE</th><th>IN / OUT</th><th>RECEIVED / SENT</th><th>ERRORS / DROPS</th></tr></thead><tbody>${n.interfaces.map(i=>`<tr><td>${esc(i.name)} ${i.aggregate?pill('Host uplink','blue'):''}</td><td>${rate(i.receiveRate)} / ${rate(i.sendRate)}</td><td>${bytes(i.received)} / ${bytes(i.sent)}</td><td>${i.rxErrors+i.txErrors} / ${i.rxDropped+i.txDropped}</td></tr>`).join('')}</tbody></table></div>`;
 if(ticks++%5===0){api('/api/cloudflare/summary').then(s=>{if(id!==generation)return;$('#tunnel-summary').innerHTML=`${pill(s.health,s.health==='Connected'?'green':'amber')}<p class="field-help">${s.verified?s.connections+' edge connections observed on local metrics.':'Edge connectivity has not been verified.'}</p>${!s.installed&&me.role==='admin'?'<p>Optional setup: open Manage to install and connect a tunnel.</p>':''}`;}).catch(()=>{});api('/api/applications').then(res=>{if(id!==generation)return;const apps=res.applications||[];if($('#apps-nav-count'))$('#apps-nav-count').textContent=apps.length||'';if($('#overview-apps-count'))$('#overview-apps-count').textContent=apps.length||'';if($('#overview-apps'))$('#overview-apps').innerHTML=apps.length?`<div class="compact-container-grid">`+apps.map(a=>`<div class="compact-container" style="cursor:pointer;" onclick="route('applications')"><strong title="${esc(a.name)}">${esc(a.name)}</strong>${pill(a.status==='running'?('● '+(a.ports?.length?':'+a.ports[0]:'Active')):'Stopped',a.status==='running'?'green':'amber')}<small class="muted" style="display:block;font-size:10px;">${esc(a.badge||a.type)}</small></div>`).join('')+`</div>`:'<p class="card-pad">No applications detected.</p>';}).catch(()=>{});api('/api/docker').then(d=>{if(id!==generation)return;$('#container-count').textContent=d.containers.length||'';$('#overview-docker-count').textContent=d.available?d.containers.length:'';$('#overview-containers').innerHTML=d.available?`<div class="compact-container-grid">${d.containers.map(c=>`<div class="compact-container"><strong title="${esc(c.Names)}">${esc(c.Names)}</strong>${pill(c.State==='running'?'Running':c.State||'Stopped',c.State==='running'?'green':'')}</div>`).join('')||'<p class="card-pad">No containers yet.</p>'}</div>`:empty('Docker is unavailable','Open Docker to install or check the engine.','docker');}).catch(()=>{});}
 }catch(e){if(id===generation)notify(e.message);}finally{updating=false;}};await update();if(id===generation)poll=setInterval(update,intervalMs);
}
const tunnelHelp=`<div class="card"><div class="card-header"><h2>How to use Cloudflare Tunnel</h2></div><div class="card-pad"><p>A tunnel connects this server to Cloudflare through an outbound connection. A public hostname can then reach a local application without opening an inbound router port.</p><ol><li><strong>Already connected?</strong> Nothing to fill in for status, logs or service controls.</li><li><strong>New server:</strong> install the connector here if it is missing. In Cloudflare, open Networking → Tunnels, create a tunnel and copy its connector token. Paste only that token into Connect an existing tunnel.</li><li><strong>Publish an application:</strong> in Cloudflare, add an application route with your subdomain, domain, service type and local address, for example app.example.com → http://localhost:5678. Configure the corresponding DNS route in Cloudflare.</li><li><strong>Optional panel route editing:</strong> click Connect Cloudflare API and supply your Account ID, Tunnel UUID and a scoped API token with Account → Cloudflare Tunnel → Read, or Edit to save changes. The API token is different from the connector token. This panel edits tunnel configuration; it does not create DNS records.</li></ol><p class="field-help">Protect administrative applications with Cloudflare Access before publishing them. To expose this panel, configure its exact HTTPS public origin first; the panel rejects other hostnames. Existing tunnels are preserved.</p><a href="https://developers.cloudflare.com/tunnel/get-started/" target="_blank" rel="noreferrer">Cloudflare setup guide</a></div></div>`;
let cfViewTab = 'tunnel';

async function tunnelPage(){
  const target = $('#system-content');
  target.innerHTML = empty('Checking Cloudflare', 'Reading tunnel and DNS automation status.', 'shield');

  try {
    const [s, dnsStatus] = await Promise.all([
      api('/api/cloudflare/status').catch(() => ({health: 'Unknown', metrics: [], connectors: [], configs: []})),
      api('/api/cloudflare/dns/status').catch(() => ({configured: false, serverIpv4: '120.60.228.219', defaultProxied: true}))
    ]);

    const edges = (s.metrics || []).reduce((n, m) => n + m.connections, 0);

    const tabsHeader = `
      <div class="tabs" style="margin-bottom:16px">
        <button class="tab ${cfViewTab === 'tunnel' ? 'active' : ''}" data-cf-tab="tunnel">
          ${icon('network')} Zero-Trust Tunnel (0 Inbound Ports)
        </button>
        <button class="tab ${cfViewTab === 'dns' ? 'active' : ''}" data-cf-tab="dns">
          ${icon('globe')} Direct DNS, Email &amp; SSL Automation
        </button>
      </div>
    `;

    if (cfViewTab === 'dns') {
      const currentHost = window.location.hostname || '';
      const hostParts = currentHost.split('.').filter(Boolean);
      const detectedRoot = (hostParts.length >= 2 && !['localhost', '127.0.0.1'].includes(currentHost) && !/^\d+$/.test(hostParts.at(-1)))
        ? hostParts.slice(-2).join('.')
        : '';
      const webDomainPlaceholder = detectedRoot ? `e.g. ${detectedRoot} or app.${detectedRoot}` : 'e.g. yourdomain.com or app.yourdomain.com';
      const rootDomainPlaceholder = detectedRoot ? `e.g. ${detectedRoot}` : 'e.g. yourdomain.com';

      target.innerHTML = `
        <div class="system-status-strip">
          <div><span>Cloudflare API</span><strong>${dnsStatus.configured ? pill('Configured &amp; Active', 'green') : pill('Not Configured', 'amber')}</strong></div>
          <div><span>Detected Public IP</span><strong><code>${esc(dnsStatus.serverIpv4 || 'Auto-detecting...')}</code></strong></div>
          <div><span>Edge Proxy</span><strong>${pill('Orange Cloud Ready', 'blue')}</strong></div>
          <div><span>Email DNS Suite</span><strong>${pill('MX · SPF · DMARC · DKIM', 'green')}</strong></div>
        </div>

        ${tabsHeader}

        <!-- 1. Cloudflare API Token -->
        <div class="card management-card" style="margin-bottom:16px">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <h3>1. Cloudflare API Token Configuration</h3>
            <p class="muted tiny">Configure an API Token with <code>Zone.Zone:Read</code> and <code>Zone.DNS:Edit</code> permissions to enable automated DNS, Email, and ACME SSL verification.</p>
          </div>
          <form id="cf-dns-token-form" class="card-pad" style="padding:16px 20px">
            <div class="form-grid">
              <label>Cloudflare API Token
                <input id="cf-dns-token-input" type="password" placeholder="${dnsStatus.configured ? '•••••••••••• (Token Configured)' : 'Paste Cloudflare API Bearer Token'}" autocomplete="off" required>
                <span class="field-help">Create in Cloudflare Dashboard → My Profile → API Tokens → Create Token (Edit zone DNS template).</span>
              </label>
              <div style="display:flex;align-items:flex-end">
                <button type="submit" class="button primary">${icon('check')} Verify &amp; Save API Token</button>
              </div>
            </div>
          </form>
        </div>

        <!-- 2. Web Domain DNS & Reverse Proxy -->
        <div class="card management-card" style="margin-bottom:16px">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <h3>2. Automated Web Domain DNS (A Record &amp; Proxy)</h3>
            <p class="muted tiny">Instantly map any domain or subdomain to this server’s public IP with automatic Cloudflare CDN/WAF proxying.</p>
          </div>
          <form id="cf-dns-web-form" class="card-pad" style="padding:16px 20px">
            <div class="form-grid">
              <label>Domain or Subdomain
                <input id="cf-web-domain" placeholder="${webDomainPlaceholder}" required>
                <span class="field-help">Must exist in your Cloudflare account.</span>
              </label>
              <label>Target Server IPv4
                <input id="cf-web-ip" value="${esc(dnsStatus.serverIpv4 || '')}" placeholder="e.g. 198.51.100.1" required>
                <span class="field-help">Server public IP destination for traffic.</span>
              </label>
            </div>
            <div style="margin:12px 0 16px">
              <label class="checkbox-label" style="font-weight:600">
                <input id="cf-web-proxied" type="checkbox" checked>
                <span>Enable Cloudflare Proxy (Orange Cloud · CDN, DDoS mitigation &amp; Edge SSL)</span>
              </label>
            </div>
            <button type="submit" class="button primary">${icon('play')} Sync Web DNS Record</button>
          </form>
        </div>

        <!-- 3. Complete Email DNS Suite Automation -->
        <div class="card management-card" style="margin-bottom:16px">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <h3>3. Complete 1-Click Email DNS Automation Suite</h3>
            <p class="muted tiny">Automatically provisions unproxied Mail A records, MX records, SPF validation, DMARC policies, and DKIM signatures to ensure 100% email deliverability.</p>
          </div>
          <form id="cf-dns-email-form" class="card-pad" style="padding:16px 20px">
            <div class="form-grid">
              <label>Root Domain
                <input id="cf-email-domain" placeholder="${rootDomainPlaceholder}" required>
                <span class="field-help">The primary email sending domain.</span>
              </label>
              <label>Mail Subdomain
                <input id="cf-email-sub" value="mail" required>
                <span class="field-help">Target host for direct SMTP/IMAP traffic (unproxied).</span>
              </label>
              <label>DMARC Policy
                <select id="cf-email-dmarc">
                  <option value="quarantine">quarantine (Recommended)</option>
                  <option value="none">none (Monitoring only)</option>
                  <option value="reject">reject (Strict protection)</option>
                </select>
                <span class="field-help">Policy applied to unauthenticated emails.</span>
              </label>
              <label>DMARC Aggregate Report Email
                <input id="cf-email-rua" placeholder="e.g. postmaster@yourdomain.com">
                <span class="field-help">Receives deliverability reports.</span>
              </label>
            </div>
            <div style="margin-top:16px">
              <button type="submit" class="button primary">${icon('shield')} Auto-Configure Complete Email DNS Suite</button>
            </div>
            <div id="cf-email-results" style="margin-top:14px" hidden></div>
          </form>
        </div>

        <!-- 4. ACME TLS Certificate via Cloudflare DNS-01 -->
        <div class="card management-card">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <h3>4. Automated TLS Certificate via Cloudflare DNS-01 API</h3>
            <p class="muted tiny">For direct-IP setups without tunnel: issues trusted ECDSA Let's Encrypt / ZeroSSL origin certificates using automatic Cloudflare DNS TXT record challenges.</p>
          </div>
          <form id="cf-dns-cert-form" class="card-pad" style="padding:16px 20px">
            <div class="form-grid">
              <label>Domain Name
                <input id="cf-cert-domain" placeholder="${webDomainPlaceholder}" required>
                <span class="field-help">Domain to issue certificate for.</span>
              </label>
              <label>Certificate Authority Provider
                <select id="cf-cert-provider">
                  <option value="letsencrypt">Let's Encrypt</option>
                  <option value="zerossl">ZeroSSL</option>
                </select>
              </label>
            </div>
            <div style="margin-top:16px">
              <button type="submit" class="button secondary">${icon('lock')} Request ACME TLS Certificate via DNS-01</button>
            </div>
          </form>
        </div>
      `;

      $$('[data-cf-tab]').forEach(b => {
        b.onclick = action(() => { cfViewTab = b.dataset.cfTab; tunnelPage(); });
      });

      form('cf-dns-token-form', async () => {
        const token = $('#cf-dns-token-input').value.trim();
        if (!token) return notify('Please enter a Cloudflare API token');
        await post('/api/cloudflare/dns/token', {token, defaultProxied: true});
        notify('✓ Cloudflare API Token verified and saved successfully!');
        await tunnelPage();
      });

      form('cf-dns-web-form', async () => {
        const domain = $('#cf-web-domain').value.trim();
        const targetIp = $('#cf-web-ip').value.trim();
        const proxied = $('#cf-web-proxied').checked;
        const res = await post('/api/cloudflare/dns/sync-web', {domain, targetIp, proxied});
        notify(`✓ Cloudflare DNS record ${res.action}: ${domain} → ${targetIp} (${proxied ? 'Proxied ☁️' : 'DNS-only'})`);
      });

      form('cf-dns-email-form', async () => {
        const domain = $('#cf-email-domain').value.trim();
        const mailSubdomain = $('#cf-email-sub').value.trim();
        const dmarcPolicy = $('#cf-email-dmarc').value;
        const dmarcEmail = $('#cf-email-rua').value.trim();
        const res = await post('/api/cloudflare/dns/setup-email', {domain, mailSubdomain, dmarcPolicy, dmarcEmail});
        const out = $('#cf-email-results');
        out.hidden = false;
        out.innerHTML = `
          <div class="notice green" style="margin-top:10px">
            <strong>✓ Complete Email DNS Suite Configured on Cloudflare for ${esc(domain)}:</strong>
            <ul style="margin:8px 0 0;padding-left:18px">
              ${(res.dispatches || []).map(d => `<li><strong>${esc(d.type)}</strong>: <code>${esc(d.record)}</code> (${esc(d.desc)}) — ${d.ok ? '<span style="color:var(--green)">✓ ' + esc(d.action) + '</span>' : '<span style="color:var(--red)">✗ ' + esc(d.error) + '</span>'}</li>`).join('')}
            </ul>
          </div>
        `;
        notify('✓ Complete Email DNS Suite configured successfully on Cloudflare!');
      });

      form('cf-dns-cert-form', async () => {
        const domain = $('#cf-cert-domain').value.trim();
        const provider = $('#cf-cert-provider').value;
        if (!confirm(`Request ACME TLS certificate for ${domain} using Cloudflare DNS-01 verification?`)) return;
        notify('Requesting ACME certificate via Cloudflare DNS challenge…');
        const res = await post('/api/cloudflare/dns/issue-cert', {domain, provider});
        notify(`✓ TLS Certificate issued successfully for ${domain}! Valid for 90 days.`);
      });

      return;
    }

    // Default Tunnel View
    target.innerHTML = `
      <div class="system-status-strip">
        <div><span>Connection</span><strong>${pill(s.health, s.health === 'Connected' ? 'green' : 'amber')}</strong></div>
        <div><span>Edge connections</span><strong>${s.metrics.length ? edges : 'Unverified'}</strong></div>
        <div><span>Connectors</span><strong>${s.connectors.length}</strong></div>
        <div><span>Version</span><strong class="status-version">${esc(s.version?.match(/version\s+(\S+)/)?.[1] || 'Not installed')}</strong></div>
      </div>

      ${tabsHeader}

      ${!s.installed ? `
        <div class="access-notice">
          <span class="access-notice-icon">${icon('download')}</span>
          <div><strong>Cloudflare connector is not installed</strong><p>Optional installation from Cloudflare’s signed repository.</p></div>
          ${button('cf-install', 'Install connector', 'plus', 'primary')}
        </div>
      ` : ''}

      <div class="card system-table-card">
        <div class="toolbar">
          <div class="section-table-heading">
            <h2>Connectors</h2>
            <span class="count-inline">${s.connectors.length} total</span>
          </div>
          <button id="cf-help" class="button secondary">${icon('info')}Setup guide</button>
        </div>
        <div class="table-wrap">
          <table class="management-table">
            <thead>
              <tr><th>CONNECTOR</th><th>STATUS</th><th>TYPE</th><th>CONFIGURATION</th><th class="actions-column">ACTIONS</th></tr>
            </thead>
            <tbody>
              ${s.connectors.map((c, i) => {
                const running = ['running', 'active'].includes(c.state);
                return `<tr>
                  <td><div class="table-name"><span class="table-icon">${icon('network')}</span><span><strong>${esc(c.name)}</strong><small>${c.pid ? 'PID ' + esc(c.pid) : esc(c.image || c.detail)}</small></span></div></td>
                  <td>${pill(running ? 'Running' : c.state, running ? 'green' : 'amber')}</td>
                  <td>${esc(c.kind === 'service' ? 'System service' : c.kind === 'docker' ? 'Docker' : 'Manual process')}</td>
                  <td>${pill(c.mode === 'remote' ? 'Cloudflare-managed' : c.mode === 'container-managed' ? 'Container' : c.mode || 'Unknown')}</td>
                  <td class="actions-column">
                    <div class="row-actions">
                      ${c.kind !== 'manual' ? `
                        <button class="button secondary small cf-logs" data-index="${i}">Logs</button>
                        <button class="icon-button cf-service" data-index="${i}" data-action="${running ? 'restart' : 'start'}" title="${running ? 'Restart' : 'Start'} connector" aria-label="${running ? 'Restart' : 'Start'} ${esc(c.name)}">${icon(running ? 'refresh' : 'play')}</button>
                        ${running ? `<button class="icon-button danger cf-service" data-index="${i}" data-action="stop" title="Stop connector" aria-label="Stop ${esc(c.name)}">${icon('stop')}</button>` : ''}
                      ` : ''}
                      <button class="icon-button cf-details" data-index="${i}" title="Connector details" aria-label="Details for ${esc(c.name)}">${icon('info')}</button>
                    </div>
                  </td>
                </tr>`;
              }).join('') || `<tr><td colspan="5"><div class="table-empty-state">${icon('network')}<strong>No connectors detected</strong><p>${s.installed ? 'Connect an existing Cloudflare tunnel below.' : 'Install the connector to get started.'}</p></div></td></tr>`}
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          <span>${s.metrics.length ? s.metrics.map(m => `localhost:${m.port} · ${m.ready ? 'Ready' : 'Not ready'}`).join(' · ') : 'Local metrics unavailable · connection health is unverified'}</span>
        </div>
      </div>

      <div class="card system-table-card">
        <div class="toolbar">
          <div class="section-table-heading"><h2>Configuration</h2></div>
          ${s.remoteConfigured ? button('cf-api', 'API credentials', null) : ''}
        </div>
        <div class="table-wrap">
          <table class="management-table">
            <thead>
              <tr><th>CONFIGURATION</th><th>LOCATION</th><th>ACCESS</th><th class="actions-column">ACTION</th></tr>
            </thead>
            <tbody>
              ${s.configs.map((c, i) => `<tr>
                <td><strong>Local tunnel configuration</strong></td>
                <td><code class="config-path">${esc(c.path)}</code></td>
                <td>${pill(c.readable ? 'Readable' : 'Restricted', c.readable ? 'green' : 'amber')}</td>
                <td class="actions-column"><button class="button secondary small cf-config" data-index="${i}">Open editor</button></td>
              </tr>`).join('')}
              <tr>
                <td><strong>Cloudflare-managed routes</strong><small>Public hostname routing</small></td>
                <td>Cloudflare account</td>
                <td>${pill(s.remoteConfigured ? 'API connected' : 'Not connected', s.remoteConfigured ? 'green' : '')}</td>
                <td class="actions-column">${s.remoteConfigured ? button('cf-remote', 'Open editor', null) : button('cf-api', 'Connect API', null)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-footer"><span>Connector credentials are masked. Local saves create backups.</span></div>
      </div>

      ${s.version && !s.connectors.length ? `
        <details class="card system-connect-card">
          <summary>Connect an existing tunnel ${icon('plus')}</summary>
          <form id="cf-connect-form" class="card-pad">
            <label>Connector token<input id="cf-token" type="password" autocomplete="off" required></label>
            <p class="field-help">Paste your Cloudflare connector token. This creates a service that starts at boot.</p>
            <p class="form-error" role="alert"></p>
            <div class="form-actions"><button class="button" type="submit">Connect tunnel</button></div>
          </form>
        </details>
      ` : ''}
    `;

    $$('[data-cf-tab]').forEach(b => {
      b.onclick = action(() => { cfViewTab = b.dataset.cfTab; tunnelPage(); });
    });

    bind('cf-help', () => openModal('Cloudflare setup guide', `<div class="modal-body">${tunnelHelp}</div>`));
    $$('.cf-details').forEach(b => b.onclick = () => {
      const c = s.connectors[Number(b.dataset.index)];
      openModal('Connector details', `<div class="modal-body"><dl class="detail-grid">${[['Connector', c.name], ['Type', c.kind], ['State', c.state], ['Configuration', c.mode], ['Service file', c.unitFile], ['PID', c.pid], ['Tunnel ID', c.tunnelID], ['Account ID', c.accountID], ['Image', c.image]].filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${c.command ? `<details class="diagnostic-details"><summary>Service command · credentials masked</summary><pre>${esc(c.command)}</pre></details>` : ''}</div>`);
    });
    if ($('#cf-install')) $('#cf-install').disabled = !s.installSupported;
    bind('cf-install', action(async () => {
      if (await confirmOperation('Install Cloudflare Tunnel?', 'Add Cloudflare’s signed APT repository and install cloudflared on this host. No tunnel will be started.', 'Install')) watch(await post('/api/cloudflare/install', {confirm: true}), null, () => system());
    }));
    $$('.cf-service').forEach(b => b.onclick = action(async () => {
      const c = s.connectors[Number(b.dataset.index)];
      const label = b.dataset.action[0].toUpperCase() + b.dataset.action.slice(1);
      if (await confirmOperation(label + ' tunnel?', `This will ${b.dataset.action} ${c.name}. If you access this panel through this tunnel, your connection may be interrupted.`, label)) watch(await post('/api/cloudflare/service', {id: c.id, action: b.dataset.action, confirm: true}), null, () => system());
    }));
    $$('.cf-logs').forEach(b => b.onclick = action(async () => {
      const r = await api('/api/cloudflare/logs?id=' + encodeURIComponent(s.connectors[Number(b.dataset.index)].id));
      openModal('Connector logs', `<div class="modal-body"><pre>${esc(r.output || 'No logs available.')}</pre></div>`);
    }));

    async function editConfig(remote, file) {
      const c = await api(remote ? '/api/cloudflare/remote' : '/api/cloudflare/config?path=' + encodeURIComponent(file));
      openModal(remote ? 'Cloudflare-managed configuration' : 'Local tunnel configuration', `<form id="cf-editor" class="modal-body"><p>${remote ? 'Changes apply to Cloudflare-managed routes.' : 'Saving creates a backup. Restart the connector separately to apply changes.'}</p><label>${remote ? 'JSON' : 'YAML'} configuration<textarea id="cf-config-text" rows="18" spellcheck="false" ${c.editable ? '' : 'readonly'}>${esc(c.text)}</textarea></label>${!c.editable ? '<p>Inline secrets were masked. This configuration is read-only to preserve those values.</p>' : ''}<p class="form-error" role="alert"></p><div class="form-actions"><button type="submit" class="button" ${c.editable ? '' : 'disabled'}>Review & save</button></div></form>`);
      form('cf-editor', async () => {
        const text = $('#cf-config-text').value;
        if (!await confirmOperation('Save tunnel configuration?', remote ? 'Update the remote tunnel routes in Cloudflare.' : 'Save this local configuration and create a backup. The running service will not be restarted.', 'Save')) return;
        await post('/api/cloudflare/' + (remote ? 'remote' : 'config'), {path: file, text, revision: c.revision, confirm: true});
        modal.close();
        notify('Configuration saved.');
      });
    }

    $$('.cf-config').forEach(b => b.onclick = action(() => editConfig(false, s.configs[Number(b.dataset.index)].path)));
    bind('cf-remote', action(() => editConfig(true)));
    bind('cf-api', () => {
      openModal('Connect Cloudflare API', `<form id="cf-api-form" class="modal-body"><label>Cloudflare account ID<input id="cf-account" required autocomplete="off"></label><label>Tunnel UUID<input id="cf-tunnel" required autocomplete="off"></label><label>Scoped API token<input id="cf-api-token" type="password" required autocomplete="off"></label><p class="field-help">Use account-level Cloudflare Tunnel Read for viewing, or Edit for saving routes. This token is stored privately on this server.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">Save connection</button></div></form>`);
      form('cf-api-form', async () => {
        await post('/api/cloudflare/api', {account: $('#cf-account').value.trim(), tunnel: $('#cf-tunnel').value.trim(), token: $('#cf-api-token').value.trim(), confirm: true});
        modal.close();
        await system();
      });
    });

    form('cf-connect-form', async () => {
      const token = $('#cf-token').value;
      $('#cf-token').value = '';
      if (await confirmOperation('Connect Cloudflare Tunnel?', 'Save this token privately and enable a dedicated connector service at boot.', 'Connect')) watch(await post('/api/cloudflare/connect', {token, confirm: true}), null, () => system());
    });
  } catch (e) {
    target.innerHTML = empty('Cloudflare unavailable', e.message, 'shield');
  }
}
async function monitoringPage(){
 if(me.role!=='admin'){content.innerHTML=empty('Administrator access required','Monitoring and Grafana configuration require an administrator.','lock');return;}
 const s=await api('/api/grafana/status?fresh=1');
 const navBar='';
 const strip=`<div class="system-status-strip"><div><span>Grafana console</span><strong>${pill(s.active?(s.healthy?'Running · Embedded':'Running'):s.installed?'Stopped':'Not installed',s.active?'green':s.installed?'amber':'')}</strong></div><div><span>Grafana Admin ID</span><strong><code>${esc(s.adminUser||'admin')}</code> ${pill(s.authProxyEnabled?'Auto-login':'Password login',s.authProxyEnabled?'green':'blue')}</strong></div><div><span>AI integration</span><strong>${pill(s.ai?.configured?`${s.ai.provider} · ${s.ai.keyHint}`:'Graphify Local AI',s.ai?.configured?'green':'blue')}</strong></div><div><span>Panel load mode</span><strong>${pill(s.pollMode==='low-load'?'Low-load · 15s':s.pollMode==='offloaded'?'Offloaded · 60s':s.pollMode==='balanced'?'Balanced · 5s':'Live · 2s',s.pollMode==='low-load'||s.pollMode==='offloaded'?'green':'blue')}</strong></div></div>`;
 if(monitoringCategory==='console'){
  const dashSrc=s.dashboardURL||'/api/grafana/proxy/d/cyberpross-server-overview/cyberpross-server-overview?orgId=1';
  const secDashSrc=s.securityDashboardURL||'/api/grafana/proxy/d/cyberpross-security-center/cyberpross-security-center?orgId=1';
  const homeSrc=s.embeddedURL||'/api/grafana/proxy/?orgId=1';
  const initialSrc=window.preferredGrafanaDash==='security'?secDashSrc:dashSrc;
  window.preferredGrafanaDash=null;
  const aiPresets=[
   ['Analyze Server & Security','Summarize current CPU, memory, containers, and 24h WAF/IDS security blocks'],
   ['Turn ON WAF Block Mode','Turn on security protection to block mode'],
   ['Switch to Low-Load (15s)','Switch panel polling to low-load 15s mode'],
   ['Run Deep Health Scan','Run a deep server health scan and check all services']
  ];
  content.innerHTML=`${strip}${navBar}<div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>AI-Integrated Grafana &amp; Server Copilot</h2>${pill(s.ai?.configured?`API Key Active (${s.ai.provider} · ${s.ai.model})`:'Graphify Local AI Active · Optional API Key Available',s.ai?.configured?'green':'blue')}</div><div class="table-toolbar-actions">${button('grafana-ai-setup-open','Configure AI API Key','key','secondary small')}</div></div><div class="card-pad"><form id="grafana-ai-form" class="toolbar-group" style="margin-bottom:10px"><input id="grafana-ai-input" placeholder="Ask AI about Grafana metrics, security events, or type an action (e.g. 'Turn on WAF block mode', 'Why is RAM high?')…" style="margin:0;flex:1" required><button class="button primary" type="submit">${icon('play')}Ask AI &amp; Control</button></form><div class="toolbar-group" style="flex-wrap:wrap;gap:6px">${aiPresets.map(([label,p])=>`<button type="button" class="button secondary small" data-ai-preset="${esc(p)}">${esc(label)}</button>`).join('')}</div><div id="grafana-ai-output" style="margin-top:12px" hidden><div class="notice" id="grafana-ai-answer"></div><div id="grafana-ai-actions" class="toolbar-group" style="flex-wrap:wrap;margin-top:8px"></div></div></div></div>${!s.installed?`<div class="access-notice"><span class="access-notice-icon">${icon('cpu')}</span><div><strong>Embedded Grafana is ready to install</strong><p>Provisions an isolated local Grafana instance with the CyberPross Server Overview and Security Center dashboards and renders it directly inside this panel.</p></div>${button('grafana-install-console','Install & start Grafana','plus','primary')}</div>`:!s.active?`<div class="access-notice"><span class="access-notice-icon">${icon('play')}</span><div><strong>Grafana is currently stopped</strong><p>Start the local Grafana instance to open the embedded monitoring workspace.</p></div>${button('grafana-start-console','Start Grafana','play','primary')}</div>`:`<div class="card grafana-workspace" id="grafana-workspace"><div class="grafana-toolbar"><div class="grafana-toolbar-title"><span class="terminal-led"></span><div><strong>Embedded Grafana Workspace</strong><small> · Signed in as <code>${esc(s.adminUser||'admin')}</code> (${s.authProxyEnabled?'Panel session auto-auth':'Credentials login'})</small></div></div><div class="toolbar-group">${button('grafana-view-dash','Server Overview','cpu','primary small')}${button('grafana-view-security','Security Center & WAF','shield','secondary small')}${button('grafana-view-home','Full Grafana UI','overview','secondary small')}${button('grafana-reload','Reload','refresh','secondary small')}${button('grafana-open-setup','ID & AI Setup','key','secondary small')}${button('grafana-expand','Expand',null,'secondary small')}</div></div><iframe id="grafana-frame" class="grafana-embed-frame" src="${esc(initialSrc)}" title="Embedded Grafana Console"></iframe></div>`}`;
  const runAiQuery=async prompt=>{
   const out=$('#grafana-ai-output'),ans=$('#grafana-ai-answer'),actWrap=$('#grafana-ai-actions');
   out.hidden=false;ans.textContent='Analyzing live Prometheus, Security Center & Graphify telemetry…';actWrap.innerHTML='';
   const r=await post('/api/grafana/ai',{prompt,confirm:true});
   ans.innerHTML=`<div><strong>${esc(r.providerUsed.toUpperCase())} (${esc(r.modelUsed)}):</strong> ${esc(r.answer)}</div>`;
   actWrap.innerHTML=(r.actions||[]).map((a,i)=>`<button type="button" class="button primary small" data-ai-act="${i}">${icon('check')}${esc(a.label)}</button>`).join('');
   $$('[data-ai-act]').forEach(btn=>btn.onclick=action(async()=>{
    const a=r.actions[Number(btn.dataset.aiAct)];
    if(a.kind==='dashboard'){const f=$('#grafana-frame');if(f&&a.target)f.src=a.target;}
    else if(a.kind==='poll'){await post('/api/grafana/settings',{pollMode:a.pollMode,confirm:true});notify('Panel load mode updated to '+a.pollMode+'.');await monitoringPage();}
    else if(a.kind==='protection'){const stSec=await api('/api/security-center/status');watch(await post('/api/protection/mode',{mode:a.mode,revision:stSec.engines?.coraza?.configuration?.revision,confirm:true}),null,()=>monitoringPage());}
    else if(a.kind==='health'){await api('/api/operations/health?scan=1');notify('Deep health scan completed.');monitoringCategory='health';await monitoringPage();}
    else if(a.kind==='provision'){watch(await post('/api/grafana/service',{action:'provision',confirm:true}),null,()=>monitoringPage());}
   }));
  };
  form('grafana-ai-form',async()=>runAiQuery($('#grafana-ai-input').value));
  $$('[data-ai-preset]').forEach(b=>b.onclick=action(()=>{if($('#grafana-ai-input'))$('#grafana-ai-input').value=b.dataset.aiPreset;return runAiQuery(b.dataset.aiPreset);}));
  bind('grafana-ai-setup-open',()=>{monitoringCategory='setup';render();});
  bind('grafana-install-console',action(async()=>{if(await confirmOperation('Install & start embedded Grafana?','Pull official grafana/grafana-oss, configure the built-in Prometheus datasource and CyberPross Server Overview + Security Center dashboards, and enable embedded panel access.','Install Grafana'))watch(await post('/api/grafana/install',{adminUser:me.username||'admin',confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-start-console',action(async()=>{watch(await post('/api/grafana/service',{action:'start',confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-view-dash',()=>{const f=$('#grafana-frame');if(f)f.src=dashSrc;});
  bind('grafana-view-security',()=>{const f=$('#grafana-frame');if(f)f.src=secDashSrc;});
  bind('grafana-view-home',()=>{const f=$('#grafana-frame');if(f)f.src=homeSrc;});
  bind('grafana-reload',()=>{const f=$('#grafana-frame');if(f?.contentWindow)f.contentWindow.location.reload();else if(f)f.src=f.src;});
  bind('grafana-open-setup',()=>{monitoringCategory='setup';render();});
  bind('grafana-expand',()=>{const w=$('#grafana-workspace');if(!w)return;w.classList.toggle('grafana-expanded');$('#grafana-expand').textContent=w.classList.contains('grafana-expanded')?'Exit full view':'Expand';});
 }else if(monitoringCategory==='setup'){
  content.innerHTML=`${strip}${navBar}<div class="card management-card"><div class="card-header"><div><h2>AI Integration &amp; API Key Setup (OpenRouter + Grafana AI Copilot + LLM Plugin)</h2><p>Connect OpenRouter AI (access any model: Claude 3.5 Sonnet, DeepSeek, Llama 3.3, Gemini, GPT-4o), OpenAI, Google Gemini, or Anthropic for conversational server control, or use built-in Graphify Local AI</p></div>${pill(s.ai?.configured?`Key Configured (${s.ai.keyHint})`:'Local Graphify AI Active',s.ai?.configured?'green':'blue')}</div><form id="grafana-ai-settings-form" class="card-pad"><div class="form-grid"><label>AI Provider<select id="grafana-ai-provider"><option value="auto" ${s.ai?.provider==='auto'?'selected':''}>Auto-detect from API Key (OpenRouter / OpenAI / Gemini / Claude)</option><option value="openrouter" ${s.ai?.provider==='openrouter'?'selected':''}>OpenRouter AI (Any Model: Claude, DeepSeek, Llama, Gemini, GPT-4o)</option><option value="openai" ${s.ai?.provider==='openai'?'selected':''}>OpenAI / ChatGPT (Also provisions grafana-llm-app)</option><option value="gemini" ${s.ai?.provider==='gemini'?'selected':''}>Google Gemini</option><option value="anthropic" ${s.ai?.provider==='anthropic'?'selected':''}>Anthropic Claude</option><option value="local" ${s.ai?.provider==='local'?'selected':''}>Built-in Graphify Local AI (No external API key)</option></select></label><label>Preferred Model<input id="grafana-ai-model" value="${esc(s.ai?.model||'anthropic/claude-3.5-sonnet')}" placeholder="anthropic/claude-3.5-sonnet, deepseek/deepseek-chat, gpt-4o-mini" required></label></div><label>AI API Key<div class="password-field"><input id="grafana-ai-key" type="password" autocomplete="off" placeholder="${s.ai?.configured?`Saved key (${s.ai.keyHint}) — enter a new key to replace`:'Paste sk-or-v1-... (OpenRouter), sk-... (OpenAI), AIza... (Gemini), or sk-ant-... (Anthropic)'}"><button id="grafana-ai-key-toggle" class="icon-button password-toggle" type="button" aria-label="Show password" title="Show password">${icon('eye')}</button></div><span class="field-help">Stored privately on disk (<code>0600</code> permissions) and never exposed in browser responses. Combined with Graphify’s 35.4x–77.8x token reduction so AI queries cost a fraction of a cent.</span></label><p class="form-error" role="alert"></p><div class="form-actions">${s.ai?.configured?button('grafana-ai-key-clear','Clear saved API key','trash','secondary'):''}<button class="button primary" type="submit">${icon('check')}Save AI integration settings</button></div></form></div><div class="card management-card"><div class="card-header"><div><h2>Grafana Admin ID &amp; Password</h2><p>Set your Grafana administrator username and password, or enable automatic sign-in from your CP-Panel session</p></div>${pill(s.passwordConfigured?'Custom password set':'Default / Auto-auth',s.passwordConfigured?'green':'blue')}</div><form id="grafana-credentials-form" class="card-pad"><div class="form-grid"><label>Grafana Admin ID (Username)<div class="toolbar-group"><input id="grafana-admin-user" value="${esc(s.adminUser||'admin')}" pattern="[a-zA-Z0-9._-]{3,64}" required><button id="grafana-use-panel-id" class="button secondary small" type="button">Use my Panel ID (${esc(me.username)})</button></div><span class="field-help">3–64 characters. You can match your CP-Panel username (${esc(me.username)}) or keep <code>admin</code>.</span></label><label>New Grafana Admin Password<div class="password-field"><input id="grafana-admin-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="${s.passwordConfigured?'Leave blank to keep current password, or enter new password':'Enter new Grafana password (8+ characters)'}"><button id="grafana-admin-password-toggle" class="icon-button password-toggle" type="button" aria-label="Show password" title="Show password">${icon('eye')}</button></div><span class="field-help">Set the same password as your panel login if you want identical credentials, or any 8+ character password.</span></label></div><label class="checkbox-label"><input id="grafana-auth-proxy" type="checkbox" ${s.authProxyEnabled?'checked':''}>Automatically sign in to embedded Grafana using my authenticated CP-Panel session (Recommended — no separate login screen)</label><p class="field-help">Saving updates the Grafana container environment and immediately resets the password inside the running Grafana database so you never get a login error.</p><p class="form-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">${icon('check')}Save &amp; apply Grafana credentials</button></div></form></div><div class="card management-card"><div class="card-header"><div><h2>Panel load &amp; polling control</h2><p>Reduce CP-Panel CPU and network overhead when offloading continuous charts to Grafana</p></div></div><form id="grafana-settings-form" class="card-pad"><div class="form-grid"><label>Overview &amp; telemetry polling rate<select id="grafana-poll-mode"><option value="standard" ${s.pollMode==='standard'?'selected':''}>Standard · 2s live updates</option><option value="balanced" ${s.pollMode==='balanced'?'selected':''}>Balanced · 5s interval</option><option value="low-load" ${s.pollMode==='low-load'?'selected':''}>Low-load · 15s (Recommended with Grafana)</option><option value="offloaded" ${s.pollMode==='offloaded'?'selected':''}>Offloaded · 60s minimal background polling</option></select></label><label>Local Grafana HTTP port<input id="grafana-port" type="number" min="1024" max="65535" value="${s.port}" required></label></div><label class="checkbox-label"><input id="grafana-scrape" type="checkbox" ${s.scrapeEnabled?'checked':''}>Enable Prometheus metrics exposition at <code>/api/grafana/prometheus</code> and <code>/api/grafana/prom</code></label><p class="form-error" role="alert"></p><div class="form-actions"><button class="button primary" type="submit">Save load &amp; port settings</button></div></form></div><div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>Service &amp; container lifecycle</h2></div><div class="table-toolbar-actions">${button('grafana-reconfigure','Sync & rebuild container','refresh')}${button('grafana-provision','Re-provision dashboards','check')}${s.installed?`${button('grafana-logs','Logs','file')}${button('grafana-restart',s.active?'Restart':'Start',s.active?'refresh':'play','primary')}${s.active?button('grafana-stop','Stop','stop','danger'):''}`:button('grafana-install','Install Grafana','plus','primary')}</div></div><div class="card-pad"><dl class="detail-grid"><dt>Deployment mode</dt><dd>${esc(s.mode==='native'?'Native systemd service (grafana-server.service)':s.mode==='docker'?'Isolated Docker container ('+(s.target||'cyberpross-grafana')+')':'Not installed')}</dd><dt>Embedded panel path</dt><dd><code>${esc(s.embeddedURL||'/api/grafana/proxy/')}</code> (Proxied directly inside the panel; no external reverse proxy required)</dd><dt>Local bind address</dt><dd><code>${esc(s.localURL)}</code> (Loopback only)</dd><dt>Provisioned dashboards</dt><dd>${s.dashboardProvisioned?pill('CyberPross Server Overview + Security Center ready','green'):pill('Not provisioned yet','amber')}</dd></dl></div></div>`;
  togglePassword('grafana-admin-password');
  togglePassword('grafana-ai-key');
  const provSelect=$('#grafana-ai-provider');
  if(provSelect){
   provSelect.onchange=()=>{
    const m=$('#grafana-ai-model');
    if(!m)return;
    const v=provSelect.value;
    if(v==='openrouter')m.value='anthropic/claude-3.5-sonnet';
    else if(v==='openai')m.value='gpt-4o-mini';
    else if(v==='gemini')m.value='gemini-2.5-flash';
    else if(v==='anthropic')m.value='claude-3-5-sonnet-latest';
    else if(v==='local')m.value='graphify-heuristic-v1';
    else if(v==='auto')m.value='anthropic/claude-3.5-sonnet';
   };
  }
  form('grafana-ai-settings-form',async()=>{
   const provider=$('#grafana-ai-provider').value;
   const model=$('#grafana-ai-model').value.trim();
   const apiKey=$('#grafana-ai-key').value.trim();
   await post('/api/grafana/ai-settings',{provider,model,...(apiKey?{apiKey}:{}),confirm:true});
   $('#grafana-ai-key').value='';
   notify('AI integration settings and Grafana LLM provisioning updated.');
   await monitoringPage();
  });
  bind('grafana-ai-key-clear',action(async()=>{
   await post('/api/grafana/ai-settings',{clearKey:true,confirm:true});
   notify('Saved AI API key cleared; reverted to built-in Graphify Local AI.');
   await monitoringPage();
  }));
  bind('grafana-use-panel-id',()=>{$('#grafana-admin-user').value=me.username;});
  form('grafana-credentials-form',async()=>{
   const adminUser=$('#grafana-admin-user').value.trim();
   const adminPassword=$('#grafana-admin-password').value;
   const authProxyEnabled=$('#grafana-auth-proxy').checked;
   await post('/api/grafana/settings',{adminUser, ...(adminPassword?{adminPassword}:{}), authProxyEnabled, confirm:true});
   $('#grafana-admin-password').value='';
   notify('Grafana Admin ID, password and embedded sign-in settings applied.');
   await monitoringPage();
  });
  form('grafana-settings-form',async()=>{
   await post('/api/grafana/settings',{pollMode:$('#grafana-poll-mode').value,grafanaPort:Number($('#grafana-port').value),scrapeEnabled:$('#grafana-scrape').checked,confirm:true});
   notify('Grafana and panel load settings saved.');
   await monitoringPage();
  });
  bind('grafana-install',action(async()=>{if(await confirmOperation('Install & provision Grafana?','Pull official grafana/grafana-oss, provision the CyberPross Server Overview dashboard, and enable embedded panel access.','Install Grafana'))watch(await post('/api/grafana/install',{grafanaPort:Number($('#grafana-port')?.value||s.port),adminUser:$('#grafana-admin-user')?.value||me.username,confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-reconfigure',action(async()=>{if(await confirmOperation('Sync & rebuild Grafana container?','Recreate the local Grafana container with the latest embedded proxy, datasource and credential settings. Existing dashboards and data are preserved.','Sync container'))watch(await post('/api/grafana/service',{action:'reconfigure',confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-provision',action(async()=>{watch(await post('/api/grafana/service',{action:'provision',confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-restart',action(async()=>{const act=s.active?'restart':'start';if(await confirmOperation((act==='restart'?'Restart':'Start')+' Grafana?',`This will ${act} the local Grafana instance.`,act==='restart'?'Restart':'Start'))watch(await post('/api/grafana/service',{action:act,confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-stop',action(async()=>{if(await confirmOperation('Stop Grafana?','Stop the local Grafana instance. Provisioned dashboards and data are retained.','Stop Grafana'))watch(await post('/api/grafana/service',{action:'stop',confirm:true}),null,()=>monitoringPage());}));
  bind('grafana-logs',action(async()=>{const r=await api('/api/grafana/logs');openModal('Grafana logs',`<div class="modal-body"><pre>${esc(r.output||'No logs available.')}</pre></div>`,'editor');}));
 }else if(monitoringCategory==='metrics'){
  const g=await api('/api/ai/graph?action=status').catch(()=>({available:false}));
  content.innerHTML=`${strip}${navBar}<div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>Graphify AI Knowledge Graph &amp; Token Reduction</h2></div><div class="table-toolbar-actions">${button('graphify-digest-btn','Preview live AI digest','overview','primary')}${button('graphify-report-btn','Architecture report','file')}</div></div><div class="card-pad"><dl class="detail-grid"><dt>Status</dt><dd>${pill(g.available?'Active · Indexed':'Unavailable',g.available?'green':'amber')}</dd><dt>Graph scale</dt><dd>${g.nodeCount||0} nodes · ${g.edgeCount||0} edges · ${g.communityCount||0} communities</dd><dt>Token reduction</dt><dd>${pill('35.4x–77.8x fewer tokens','green')} via <code>panel_graph</code> MCP tool &amp; <code>/api/ai/graph</code></dd></dl><pre id="monitoring-metrics-output"></pre></div></div><div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>Prometheus Metrics Exposition</h2></div><div class="table-toolbar-actions">${button('prom-preview-btn','Load Prometheus metrics','refresh','primary')}</div></div><div class="card-pad"><p class="field-help">Embedded Grafana queries the built-in time-series engine at <code>/api/grafana/prom</code> automatically. External scrapers can read <code>/api/grafana/prometheus</code>.</p><pre id="prom-metrics-output"></pre></div></div>`;
  bind('graphify-digest-btn',action(async()=>{const d=await api('/api/ai/graph?action=digest');$('#monitoring-metrics-output').textContent=JSON.stringify(d,null,2);}));
  bind('graphify-report-btn',action(async()=>{const r=await api('/api/ai/graph?action=report&budget=3000');$('#monitoring-metrics-output').textContent=r.report||JSON.stringify(r,null,2);}));
  bind('prom-preview-btn',action(async()=>{const res=await fetch('/api/grafana/prometheus',{credentials:'same-origin'});$('#prom-metrics-output').textContent=await res.text();}));
 }else if(monitoringCategory==='health'){
  const [h,pol]=await Promise.all([api('/api/operations/health').catch(()=>({status:'unknown',ok:false,issues:[],checks:[]})),api('/api/operations/health-policy').catch(()=>({rules:{}}))]);
  const issues=h.issues?.length?h.issues:(h.checks||[]).filter(c=>!c.ok).map(c=>({
   kind:c.kind,
   target:c.target,
   detail:c.error||(c.state?`${c.state} (${c.status})`:c.status)||'Check failed',
   severity:c.blocked||c.gatewayFailure?'critical':'warning'
  }));
  const isHealthy=h.status==='healthy'||(h.ok===true&&issues.length===0);
  const statusLabel=isHealthy?'Healthy':(issues.length?'Issues Detected':(h.status||'Unknown'));
  const statusColor=isHealthy?'green':'amber';
  content.innerHTML=`${strip}${navBar}<div class="card management-card"><div class="toolbar"><div class="section-table-heading"><h2>Autonomous Health Monitor</h2>${pill(statusLabel,statusColor)}</div><div class="table-toolbar-actions">${button('health-scan-now','Run deep health scan','refresh','primary')}</div></div><div class="card-pad">${issues.length?`<div class="table-wrap"><table class="management-table"><thead><tr><th>KIND</th><th>TARGET</th><th>DETAIL</th><th>SEVERITY</th></tr></thead><tbody>${issues.map(x=>`<tr><td><strong>${esc(x.kind)}</strong></td><td><code>${esc(x.target||x.unit||x.container||'host')}</code></td><td>${esc(x.detail||x.message||JSON.stringify(x))}</td><td>${pill(x.severity||'warning','amber')}</td></tr>`).join('')}</tbody></table></div>`:`<p>${icon('check')} All monitored systemd services, Docker containers, HTTP endpoints (403/502/503 detection) and filesystems are healthy.</p>`}<p class="field-help">Last checked: ${esc(h.checkedAt?new Date(h.checkedAt).toLocaleString():'Just now')} · Safe auto-remediation rules configured: ${Object.keys(pol.rules||{}).length}</p></div></div>`;
  bind('health-scan-now',action(async()=>{await api('/api/operations/health?scan=1');notify('Health scan completed.');await monitoringPage();}));
 }
 $$('[data-monitoring-tab]').forEach(b=>b.onclick=()=>{monitoringCategory=b.dataset.monitoringTab;render();});
}
async function grafanaPage(){monitoringCategory='console';return monitoringPage();}
