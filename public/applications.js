// CP-Panel Applications Management View
let appList = [], appFilter = 'all', appSearchQuery = '', activeAppConfig = null, logStreamTimer = null;

async function applicationsPage(id) {
  content.innerHTML = `<div class="loading-state">${icon('refresh')} Scanning host applications and services…</div>`;

  try {
    const data = await api('/api/applications');
    if (id !== generation) return;
    appList = data.applications || [];

    // Update nav counter if present
    const countEl = document.getElementById('apps-nav-count');
    if (countEl) countEl.textContent = appList.length || '';

    renderApplicationsView(data);
  } catch (err) {
    if (id !== generation) return;
    content.innerHTML = `<div class="card">${empty('Failed to scan applications', err.message, 'shield')}</div>`;
  }
}

function renderApplicationsView(data) {
  const summary = data.summary || { total: appList.length, running: 0, hybrid: 0, compose: 0, native: 0 };
  const runningCount = appList.filter(a => a.status === 'running').length;

  // Filter applications
  const filtered = appList.filter(app => {
    if (appFilter === 'hybrid' && app.type !== 'hybrid') return false;
    if (appFilter === 'compose' && !['compose', 'container'].includes(app.type)) return false;
    if (appFilter === 'native' && !['native', 'systemd', 'static'].includes(app.type)) return false;

    if (appSearchQuery) {
      const q = appSearchQuery.toLowerCase();
      const match = (
        app.name?.toLowerCase().includes(q) ||
        app.id?.toLowerCase().includes(q) ||
        app.domain?.toLowerCase().includes(q) ||
        app.runtime?.toLowerCase().includes(q) ||
        (app.ports && app.ports.some(p => String(p).includes(q))) ||
        app.workingDirectory?.toLowerCase().includes(q)
      );
      if (!match) return false;
    }
    return true;
  });

  content.innerHTML = `
    <!-- Top Summary Strip -->
    <div class="system-status-strip">
      <div><span>Total Applications</span><strong>${appList.length} Detected</strong></div>
      <div><span>Active & Running</span><strong>${pill(runningCount + ' Active', 'green')}</strong></div>
      <div><span>Hybrid & Native Services</span><strong>${pill((summary.hybrid || 1) + ' Hybrid · ' + (summary.native || 0) + ' Native', 'blue')}</strong></div>
      <div><span>Docker Stacks & Containers</span><strong>${pill((summary.compose || 0) + ' Compose · ' + (summary.containers || 0) + ' Containers', 'violet')}</strong></div>
    </div>

    <!-- Controls Toolbar -->
    <div class="card management-card" style="margin-bottom: 20px;">
      <div class="toolbar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:14px 18px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button class="button ${appFilter === 'all' ? 'primary' : 'secondary'} small" data-app-filter="all">All (${appList.length})</button>
          <button class="button ${appFilter === 'hybrid' ? 'primary' : 'secondary'} small" data-app-filter="hybrid">⚡ Hybrid Engines</button>
          <button class="button ${appFilter === 'compose' ? 'primary' : 'secondary'} small" data-app-filter="compose">📦 Docker &amp; Compose</button>
          <button class="button ${appFilter === 'native' ? 'primary' : 'secondary'} small" data-app-filter="native">🛡️ Native &amp; Security</button>
        </div>
        <div class="table-toolbar-actions" style="margin-left:auto;display:flex;align-items:center;gap:10px;">
          <input type="search" id="app-search-input" class="table-filter" placeholder="Filter by name, port, domain…" value="${esc(appSearchQuery)}">
          <button id="rescan-apps-btn" class="button secondary small" type="button" title="Rescan host applications">${icon('refresh')} Rescan Host</button>
        </div>
      </div>
    </div>

    <!-- Applications Grid -->
    <div class="apps-card-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:20px;">
      ${filtered.length > 0 ? filtered.map(app => renderAppCard(app)).join('') : empty('No applications matched', 'Try selecting a different filter or clearing your search.', 'layers')}
    </div>
  `;

  // Bind filter buttons
  content.querySelectorAll('[data-app-filter]').forEach(btn => {
    btn.onclick = () => {
      appFilter = btn.dataset.appFilter;
      renderApplicationsView(data);
    };
  });

  // Bind search input
  const searchInput = document.getElementById('app-search-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      appSearchQuery = e.target.value;
      renderApplicationsView(data);
      // Retain focus
      const el = document.getElementById('app-search-input');
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    };
  }

  // Bind rescan button
  bind('rescan-apps-btn', () => applicationsPage(generation));

  // Bind card action buttons
  content.querySelectorAll('[data-app-action]').forEach(btn => {
    const action = btn.dataset.appAction;
    const appId = btn.dataset.appId;
    const app = appList.find(a => a.id === appId);
    if (!app) return;

    btn.onclick = () => {
      if (action === 'configs') openAppConfigModal(app, btn.dataset.configFile);
      if (action === 'logs') openAppLogsModal(app);
      if (action === 'files') openAppFileManager(app);
      if (action === 'restart') triggerAppRestart(app);
    };
  });
}

function renderAppCard(app) {
  const isRunning = app.status === 'running';
  const isHybrid = app.type === 'hybrid';
  const isCompose = app.type === 'compose';
  const typeTone = isHybrid ? 'violet' : isCompose ? 'blue' : 'green';

  const configs = app.configs || [];

  return `
    <div class="card app-card" style="display:flex;flex-direction:column;justify-content:space-between;border:1px solid var(--line);border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
      <!-- Card Header -->
      <div style="padding:16px 20px;border-bottom:1px solid var(--line);background:var(--surface-alt);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <div style="display:grid;place-items:center;width:40px;height:40px;border-radius:8px;background:${isHybrid ? '#3b82f620' : '#10b98120'};color:${isHybrid ? '#60a5fa' : '#34d399'};flex-shrink:0;">
            ${icon(isHybrid ? 'cpu' : isCompose ? 'docker' : 'server')}
          </div>
          <div style="min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <strong style="font-size:15px;color:var(--text);">${esc(app.name)}</strong>
              ${pill(app.badge || app.type, typeTone)}
            </div>
            <small class="muted" style="display:block;margin-top:2px;">${esc(app.category || app.runtime || '')}</small>
          </div>
        </div>
        <div>
          ${pill(isRunning ? '● Running' : 'Stopped', isRunning ? 'green' : 'amber')}
        </div>
      </div>

      <!-- Card Body / Details Grid -->
      <div style="padding:16px 20px;flex:1;">
        <div style="display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px 16px;font-size:12px;margin-bottom:16px;">
          <div class="muted">Tech Stack:</div>
          <div><strong>${esc(app.runtime || 'Standard')}</strong></div>

          ${app.workingDirectory ? `
            <div class="muted">Project Root:</div>
            <div><code style="font-size:11px;background:var(--surface);padding:2px 6px;border-radius:4px;border:1px solid var(--line);">${esc(app.workingDirectory)}</code></div>
          ` : ''}

          ${app.ports && app.ports.length > 0 ? `
            <div class="muted">Listening Ports:</div>
            <div>
              ${app.ports.map(p => `<span class="pill blue" style="font-family:monospace;font-size:11px;margin-right:4px;">:${esc(p)}</span>`).join('')}
            </div>
          ` : ''}

          ${app.publicUrl ? `
            <div class="muted">Public Route:</div>
            <div>
              <a href="${esc(app.publicUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:4px;">
                ${esc(app.domain || app.publicUrl)} ${icon('external')}
              </a>
              <span class="pill green" style="font-size:10px;margin-left:6px;">${esc(app.wafStatus || 'Protected')}</span>
            </div>
          ` : ''}

          ${app.systemdUnit ? `
            <div class="muted">Systemd Unit:</div>
            <div><code>${esc(app.systemdUnit)}</code> ${app.pid ? `<span class="muted tiny">(PID ${app.pid})</span>` : ''}</div>
          ` : ''}

          ${app.containers && app.containers.length > 0 ? `
            <div class="muted">Containers:</div>
            <div>
              ${app.containers.map(c => `<span class="pill" style="font-size:10px;margin-right:4px;">${esc(c.name || c.id)}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Detected Configuration Files Section -->
        <div style="border-top:1px solid var(--line);padding-top:12px;margin-top:12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span class="muted tiny" style="font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">
              Detected Configurations (${configs.length})
            </span>
            <small class="muted">Click any file to inspect</small>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${configs.length > 0 ? configs.map(c => `
              <button type="button" class="text-button" data-app-action="configs" data-app-id="${esc(app.id)}" data-config-file="${esc(c.name)}" style="background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:3px 8px;font-size:11px;font-family:monospace;cursor:pointer;" title="Inspect ${esc(c.name)} (${esc(c.size)} bytes)">
                📄 ${esc(c.name)}
              </button>
            `).join('') : '<span class="muted tiny">No configuration files detected in project tree.</span>'}
          </div>
        </div>
      </div>

      <!-- Card Actions Footer -->
      <div style="padding:12px 20px;border-top:1px solid var(--line);background:var(--surface-alt);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="button secondary small" data-app-action="configs" data-app-id="${esc(app.id)}">
            ${icon('edit')} Configurations (${configs.length})
          </button>
          <button class="button secondary small" data-app-action="logs" data-app-id="${esc(app.id)}">
            ${icon('terminal')} Logs
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${app.workingDirectory ? `
            <button class="button secondary small" data-app-action="files" data-app-id="${esc(app.id)}" title="Browse project files in File Manager">
              ${icon('folder')} Files
            </button>
          ` : ''}
          <button class="button secondary small" data-app-action="restart" data-app-id="${esc(app.id)}" title="Restart application service">
            ${icon('refresh')} Restart
          </button>
        </div>
      </div>
    </div>
  `;
}

// Open application configuration viewer modal
async function openAppConfigModal(app, preselectedFileName = null) {
  const configs = app.configs || [];
  if (configs.length === 0) {
    notify('No configuration files found for ' + app.name);
    return;
  }

  const selected = preselectedFileName || configs[0].name;

  openModal(
    `Configurations · ${esc(app.name)}`,
    `<div class="modal-body" style="padding:0;min-height:480px;display:flex;flex-direction:column;">
      <div style="padding:12px 20px;background:var(--surface-alt);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <select id="app-config-selector" class="filters-select" style="min-width:240px;font-family:monospace;font-size:12px;">
            ${configs.map(c => `<option value="${esc(c.name)}" ${c.name === selected ? 'selected' : ''}>${esc(c.name)} (${Math.round((c.size || 0)/1024)} KB)</option>`).join('')}
          </select>
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin:0;cursor:pointer;">
            <input type="checkbox" id="unmask-secrets-toggle" style="margin:0;">
            <span>Reveal Secrets (Admin)</span>
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="copy-config-btn" class="button secondary small">${icon('copy')} Copy</button>
          <button id="modal-files-btn" class="button secondary small">${icon('folder')} Browse Project</button>
        </div>
      </div>

      <!-- Config Meta Notice -->
      <div id="config-notice-bar" style="padding:8px 20px;background:#3b82f615;border-bottom:1px solid var(--line);font-size:11px;color:var(--text);display:flex;align-items:center;justify-content:space-between;">
        <span>🛡️ <strong>Zero-Trust Protection:</strong> Sensitive tokens and API passwords in this file are masked by default.</span>
        <span id="config-path-label" style="font-family:monospace;color:var(--muted);"></span>
      </div>

      <!-- Code Container -->
      <div style="flex:1;position:relative;background:#0d1117;color:#c9d1d9;overflow:auto;max-height:550px;">
        <pre id="app-config-code" style="margin:0;padding:16px 20px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">Loading configuration…</pre>
      </div>
    </div>
    <div class="form-actions" style="padding:12px 20px;border-top:1px solid var(--line);display:flex;justify-content:space-between;">
      <small class="muted" style="align-self:center;">File changes can be managed via the integrated File Manager.</small>
      <button class="button primary" id="app-config-close">Done</button>
    </div>`
  );

  bind('app-config-close', () => modal.close());
  bind('modal-files-btn', () => { modal.close(); openAppFileManager(app); });

  const loadConfigContent = async (fileName, unmask = false) => {
    const codeEl = document.getElementById('app-config-code');
    const pathEl = document.getElementById('config-path-label');
    if (!codeEl) return;

    codeEl.textContent = 'Reading configuration file…';
    try {
      const res = await api(`/api/applications/config?id=${encodeURIComponent(app.id)}&file=${encodeURIComponent(fileName)}&unmask=${unmask ? 'true' : 'false'}`);
      if (pathEl) pathEl.textContent = res.path || fileName;
      codeEl.textContent = res.content || '# Empty file';
    } catch (err) {
      codeEl.textContent = `# Error reading configuration:\n# ${err.message}`;
    }
  };

  const sel = document.getElementById('app-config-selector');
  const toggle = document.getElementById('unmask-secrets-toggle');

  if (sel) {
    sel.onchange = () => loadConfigContent(sel.value, toggle?.checked);
  }
  if (toggle) {
    toggle.onchange = () => loadConfigContent(sel?.value || selected, toggle.checked);
  }

  const copyBtn = document.getElementById('copy-config-btn');
  if (copyBtn) {
    copyBtn.onclick = () => {
      const code = document.getElementById('app-config-code')?.textContent;
      if (code) {
        navigator.clipboard.writeText(code);
        notify('Configuration copied to clipboard.');
      }
    };
  }

  await loadConfigContent(selected, false);
}

// Open application logs modal
async function openAppLogsModal(app) {
  openModal(
    `Live Logs · ${esc(app.name)}`,
    `<div class="modal-body" style="padding:0;min-height:480px;display:flex;flex-direction:column;">
      <div style="padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="status-dot"></span>
          <strong>${esc(app.systemdUnit || app.id)}</strong>
          <small class="muted">Last 100 log lines</small>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="refresh-logs-btn" class="button secondary small">${icon('refresh')} Refresh</button>
          <button id="copy-logs-btn" class="button secondary small">${icon('copy')} Copy</button>
        </div>
      </div>
      <div style="flex:1;background:#0d1117;color:#8b949e;overflow:auto;max-height:550px;">
        <pre id="app-logs-output" style="margin:0;padding:16px 20px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:#e6edf3;">Reading application logs…</pre>
      </div>
    </div>
    <div class="form-actions" style="padding:12px 20px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;">
      <button class="button primary" id="app-logs-close">Close</button>
    </div>`
  );

  bind('app-logs-close', () => modal.close());

  const loadLogs = async () => {
    const out = document.getElementById('app-logs-output');
    if (!out) return;
    try {
      const res = await api(`/api/applications/logs?id=${encodeURIComponent(app.id)}&lines=150`);
      out.textContent = res.logs || 'No log entries found.';
      out.scrollTop = out.scrollHeight;
    } catch (err) {
      out.textContent = 'Error loading logs: ' + err.message;
    }
  };

  bind('refresh-logs-btn', loadLogs);
  bind('copy-logs-btn', () => {
    const text = document.getElementById('app-logs-output')?.textContent;
    if (text) {
      navigator.clipboard.writeText(text);
      notify('Logs copied to clipboard.');
    }
  });

  await loadLogs();
}

// Redirect to File Manager at application project root
function openAppFileManager(app) {
  if (!app.workingDirectory) return;
  sub = 'files';
  route('system');
  setTimeout(() => {
    if (typeof loadFiles === 'function') {
      loadFiles(app.workingDirectory);
    }
  }, 100);
}

// Trigger restart with confirmation
async function triggerAppRestart(app) {
  const confirmed = await confirmOperation(
    `Restart ${app.name}?`,
    `This will restart the underlying service (${app.systemdUnit || app.id}). Running connections may briefly reconnect.`,
    'Restart Now'
  );
  if (!confirmed) return;

  try {
    notify(`Restarting ${app.name}…`);
    const res = await post('/api/applications/restart', { id: app.id, confirm: true });
    notify(res.message || `${app.name} restarted successfully.`);
    setTimeout(() => applicationsPage(generation), 1000);
  } catch (err) {
    notify(`Restart failed: ${err.message}`);
  }
}
