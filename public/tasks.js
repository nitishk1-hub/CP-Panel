let taskRowsRenderKey="",taskPopupRenderKey="";
let taskInventory = { jobs: [], active: 0 },
  taskFilter = "all",
  taskPollBusy = false,
  taskPopupId = null,
  taskMonitorTimer = null,
  automaticUpdateBusy = false;
const taskOngoing = (s) => ["queued", "running"].includes(s);
const taskTone = (s) =>
  s === "succeeded"
    ? "green"
    : ["failed", "interrupted"].includes(s)
      ? "red"
      : s === "running"
        ? "blue"
        : "amber";
const taskLabel = (s) =>
  ({
    queued: "Queued",
    running: "Running",
    succeeded: "Completed",
    failed: "Failed",
    interrupted: "Interrupted",
  })[s] || s;
const taskTime = (t) => (t ? new Date(t).toLocaleString() : "—");
function taskDuration(j) {
  if (!j.startedAt) return "Waiting";
  const seconds = Math.max(
    0,
    Math.floor(
      ((j.finishedAt ? Date.parse(j.finishedAt) : Date.now()) -
        Date.parse(j.startedAt)) /
        1000,
    ),
  );
  return seconds < 60
    ? seconds + "s"
    : Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
}
async function updateTaskMonitor() {
  if (taskPollBusy || !me || me.mustChangePassword || me.role !== "admin")
    return;
  taskPollBusy = true;
  try {
    taskInventory = await api("/api/jobs");
    const running = taskInventory.jobs.filter(
        (j) => j.state === "running",
      ).length,
      queued = taskInventory.jobs.filter((j) => j.state === "queued").length;
    const lastFailed=["failed","interrupted"].includes(taskInventory.jobs[0]?.state);
    const label =
      running || queued
        ? `${running} running${queued ? " · " + queued + " queued" : ""}`
        : lastFailed ? "Last task failed" : "Tasks";
    const indicator = $("#task-indicator");
    if (indicator) {
      indicator.classList.toggle("busy", !!taskInventory.active);
      indicator.classList.toggle("has-failures",!taskInventory.active&&lastFailed);
      indicator.setAttribute("aria-label", "Background tasks: " + label);
      $("#task-indicator-label").textContent = label;
      $("#task-running-dot").hidden = !taskInventory.active&&!lastFailed;
    }
    const count = $("#task-nav-count");
    if (count) {
      count.hidden = !taskInventory.active;
      count.textContent = taskInventory.active;
    }
    if (
      activeJob &&
      !taskInventory.jobs.some(
        (j) => j.id === activeJob && taskOngoing(j.state),
      )
    )
      activeJob = null;
    if (view === "tasks" && $("#task-rows")) renderTaskRows();
    if (modal.open && $("#task-popup-list")) renderTaskPopupRows();
    if (modal.open && taskPopupId && $("#task-detail-output")) {
      const j = await api("/api/jobs?id=" + taskPopupId),
        out = $("#task-detail-output"),
        bottom = out.scrollHeight - out.scrollTop - out.clientHeight < 45,
        scroll = out.scrollTop;
      if (out.textContent !== j.output) {
        out.textContent = j.output || "Waiting for operation output…";
        out.scrollTop = bottom ? out.scrollHeight : scroll;
      }
      $("#task-detail-state").innerHTML = pill(
        taskLabel(j.state),
        taskTone(j.state),
      );
      $("#task-detail-progress").hidden = !taskOngoing(j.state);
      if($("#task-operation-meta"))$("#task-operation-meta").textContent=taskOperationMeta(j);
      const review = $("#task-review-plan");
      if (review) review.hidden = j.state !== "succeeded";
    }
  } catch (e) {
    if (e.status === 401) await login();
  } finally {
    taskPollBusy = false;
  }
}
function startTaskMonitor() {
  if (taskMonitorTimer) return;
  bind("task-indicator", showTaskPopup);
  taskMonitorTimer = setInterval(() => {
    if (!document.hidden) updateTaskMonitor();
  }, 3000);
}
async function tasksPage() {
  await updateTaskMonitor();
  content.innerHTML = `${taskInventory.storageError ? notice("Task history could not be saved. Check panel data storage.", "warning") : ""}<div class="card management-card"><div class="toolbar"><h2>Operation queue &amp; execution history</h2><select id="task-filter" class="filters-select" aria-label="Filter tasks"><option value="all">All tasks</option><option value="active">Running & queued</option><option value="succeeded">Completed</option><option value="failed">Failed & interrupted</option></select></div><div class="table-wrap"><table class="management-table task-table"><thead><tr><th>Task</th><th>Status</th><th>Started</th><th>Duration</th><th class="actions-column">Actions</th></tr></thead><tbody id="task-rows"></tbody></table></div><div class="table-footer"><span>Tasks continue when you leave the page or close the browser.</span><span>Recent history is retained on this server.</span></div></div><div id="operation-monitor" aria-live="polite"></div>`;
  await renderOperationMonitor();
  $("#task-filter").value = taskFilter;
  $("#task-filter").onchange = () => {
    taskFilter = $("#task-filter").value;
    renderTaskRows();
  };
  renderTaskRows();
}
function renderTaskRows() {
  const focused = document.activeElement?.closest("#task-rows .task-view")
    ?.dataset.task;
  const rows = taskInventory.jobs.filter(
    (j) =>
      taskFilter === "all" ||
      (taskFilter === "active" && taskOngoing(j.state)) ||
      (taskFilter === "failed" &&
        ["failed", "interrupted"].includes(j.state)) ||
      j.state === taskFilter,
  );
  const key=JSON.stringify([taskFilter,rows.map(j=>[j.id,j.title,j.state,j.progress,j.startedAt,j.finishedAt])]);
  if(key===taskRowsRenderKey&&$("#task-rows").children.length){updateTaskDurations($("#task-rows"));return;}
  taskRowsRenderKey=key;
  $("#task-rows").innerHTML =
    rows
      .map(
        (j) =>
          `<tr><td><strong>${esc(j.title)}</strong>${j.progress ? `<small>${esc(j.progress)}</small>` : ""}</td><td>${pill(taskLabel(j.state), taskTone(j.state))}</td><td>${esc(taskTime(j.startedAt || j.createdAt))}</td><td data-task-duration="${j.id}">${esc(taskDuration(j))}</td><td class="actions-column"><button class="button secondary small task-view" data-task="${j.id}">View</button></td></tr>`,
      )
      .join("") || '<tr><td colspan="5">No tasks in this view.</td></tr>';
  $$(".task-view").forEach((b) => {
    b.onclick = action(() => showTaskDetails(b.dataset.task));
    if (focused === b.dataset.task) b.focus({ preventScroll: true });
  });
}
async function showTaskPopup() {
  await updateTaskMonitor();
  taskPopupId = null;
  openModal(
    "Background tasks",
    `<div class="modal-body"><p class="field-help">Operations run on the server. Closing this window does not stop them.</p><div id="task-popup-list"></div></div><div class="form-actions">${button("task-open-all", "All tasks", "clock", "primary")}</div>`,
  );
  renderTaskPopupRows();
  bind("task-open-all", () => {
    modal.close();
    route("tasks");
  });
}
function renderTaskPopupRows() {
  const jobs = taskInventory.jobs.slice(0, 8);
  const key=JSON.stringify(jobs.map(j=>[j.id,j.title,j.state,j.startedAt,j.finishedAt]));
  if(key===taskPopupRenderKey&&$("#task-popup-list").children.length){updateTaskDurations($("#task-popup-list"));return;}
  const focused=document.activeElement?.closest('#task-popup-list .task-popup-open')?.dataset.task;
  taskPopupRenderKey=key;
  $("#task-popup-list").innerHTML =
    jobs
      .map(
        (j) =>
          `<div class="toolbar"><div><strong>${esc(j.title)}</strong><div class="task-summary">${pill(taskLabel(j.state), taskTone(j.state))}<time data-task-duration="${j.id}">${esc(taskDuration(j))}</time></div></div><button class="button secondary small task-popup-open" data-task="${j.id}">View</button></div>`,
      )
      .join("") ||
    empty("No recent tasks", "Started operations will appear here.", "clock");
  $$(".task-popup-open").forEach(
    (b) => (b.onclick = action(() => showTaskDetails(b.dataset.task))),
  );
  if(focused)$$(".task-popup-open").find(b=>b.dataset.task===focused)?.focus({preventScroll:true});
}
async function showTaskDetails(id) {
  const j = await api("/api/jobs?id=" + encodeURIComponent(id));
  taskPopupId = id;
  openModal(
    j.title,
    `<div class="modal-body"><div id="task-detail-state">${pill(taskLabel(j.state), taskTone(j.state))}</div><div id="task-detail-progress" class="task-progress detail-heading" ${!taskOngoing(j.state) ? "hidden" : ""}></div><p class="field-help">Created ${esc(taskTime(j.createdAt))}. Closing this window leaves the task running.</p><p id="task-operation-meta" class="field-help">${esc(taskOperationMeta(j))}</p><pre id="task-detail-output" class="task-output"></pre>${j.action === "native-database-plan" ? `<button id="task-review-plan" class="button primary" ${j.state !== "succeeded" ? "hidden" : ""}>Review package plan</button><p class="field-help">Package plans expire after 10 minutes or a panel restart.</p>` : ""}</div><div class="form-actions">${button("task-detail-all", "All tasks", "clock")}</div>`,
    "editor",
  );
  $("#task-detail-output").textContent =
    j.output || "Waiting for operation output…";
  bind("task-detail-all", () => {
    modal.close();
    route("tasks");
  });
  bind("task-review-plan", async () => {
    const p = await api(
      "/api/databases/plan?job=" + encodeURIComponent(id),
    );
    taskPopupId = null;
    showNativeDatabasePlan(p);
  });
}
function startAutomaticUpdates() {
  setInterval(async () => {
    if (
      automaticUpdateBusy ||
      document.hidden ||
      !me ||
      me.mustChangePassword ||
      modal.open ||
      websiteDirty
    )
      return;
    const editing = document.activeElement?.matches(
      "input,textarea,select,[contenteditable=true]",
    );
    if (editing) return;
    automaticUpdateBusy = true;
    const updateGeneration = generation;
    const filters = [
      ...content.querySelectorAll(
        "input[type=search][id],select.filters-select[id]",
      ),
    ].map((e) => ({ id: e.id, value: e.value }));
    try {
      if (view === "system") {
        if (sub === "terminal") return;
        if (sub === "files") {
          if (!content.querySelector(".cm-editor"))
            await browseFiles(fileDirectory, true);
        } else if (sub === "firewall") await firewallPage();
        else if (sub === "readiness") await readinessPage();
        else if (sub === "wireguard" && !content.querySelector("form"))
          await wireguardPage();
        else if (sub === "tunnel") {
          const s = await api("/api/cloudflare/status"),
            facts = $$("#system-content .system-status-strip strong");
          if (
            view === "system" &&
            sub === "tunnel" &&
            updateGeneration === generation &&
            facts.length >= 4
          ) {
            facts[0].innerHTML = pill(
              s.health,
              s.health === "Connected" ? "green" : "amber",
            );
            facts[1].textContent = s.metrics.length
              ? s.metrics.reduce((n, m) => n + m.connections, 0)
              : "Unverified";
            facts[2].textContent = s.connectors.length;
            facts[3].textContent =
              s.version?.match(/version\s+(\S+)/)?.[1] || "Not installed";
          }
        }
      } else if (view === "websites") {
        if (!websiteCurrent) await websitesPage(generation);
        else {
          const tab = $("[data-site-tab].active")?.dataset.siteTab;
          if (tab === "logs" && $("#site-log-output")) {
            const r = await api(
              "/api/websites/logs?id=" +
                websiteCurrent.id +
                "&kind=" +
                $("#site-log-kind").value,
            );
            if ($("#site-log-output"))
              $("#site-log-output").textContent = r.output || "No log entries.";
          } else if (tab === "overview")
            await openWebsite(websiteCurrent.id, "overview");
        }
      } else if (
        view === "docker" &&
        dockerTab !== "containers" &&
        !content.querySelector("form,textarea,.cm-editor")
      ) {
        const fresh = await api("/api/docker");
        if (updateGeneration !== generation || view !== "docker") return;
        dockerData = fresh;
        dockerPanel();
      } else if (view === "users") await userList();
      if (updateGeneration !== generation) return;
      for (const f of filters) {
        const el = document.getElementById(f.id);
        if (el && (el.value !== f.value || el.matches("input[type=search]"))) {
          el.value = f.value;
          el.dispatchEvent(
            new Event(el.tagName === "SELECT" ? "change" : "input", {
              bubbles: true,
            }),
          );
        }
      }
      const label = $("#live-update-label");
      if (label)
        label.title =
          "Last automatic update: " + new Date().toLocaleTimeString();
    } catch (e) {
      if (e.status === 401) await login();
    } finally {
      automaticUpdateBusy = false;
    }
  }, 15000);
}

function updateTaskDurations(root){const jobs=new Map(taskInventory.jobs.map(j=>[j.id,j]));for(const el of root.querySelectorAll('[data-task-duration]')){const job=jobs.get(el.dataset.taskDuration);if(job)el.textContent=taskDuration(job);}}

function taskOperationMeta(j){return j.source==="agent"?`Operation ${j.id}${j.exitCode!==null?` · Exit code ${j.exitCode}`:""}${j.reason?` · ${j.reason}`:""}`:"";}

async function renderOperationMonitor(forceScan=false){
 const slot=$("#operation-monitor");if(!slot)return;
 const calls=taskInventory.agentConfigured?[api("/api/operations/health"+(forceScan?"?scan=1":"")),api("/api/operations/transactions"),api("/api/audit")]:[Promise.resolve(null),Promise.resolve({transactions:[]}),api("/api/audit")];
 const results=await Promise.allSettled(calls);
 const health=results[0].status==="fulfilled"?results[0].value:null,transactions=results[1].status==="fulfilled"?(results[1].value?.transactions||[]):[],auditEntries=results[2].status==="fulfilled"&&Array.isArray(results[2].value)?results[2].value.slice().reverse().slice(0,50):[];
 let html="";
 if(taskInventory.agentConfigured){
  html+=`<div class="card management-card"><div class="toolbar"><h2>Server health</h2><div class="toolbar-group">${button("operation-refresh","Refresh","refresh")}${button("operation-policy","Automatic repairs","settings")}</div></div>${health?`<p class="field-help card-pad">Last checked ${esc(taskTime(health.checkedAt))}. ${health.ok?"All configured checks passed.":"Some checks need attention."}${health.repairs?.length?` · ${health.repairs.length} automatic repair(s) attempted.`:""}</p><div class="table-wrap"><table class="management-table"><thead><tr><th>Check</th><th>Target</th><th>Status</th></tr></thead><tbody>${(health.checks||[]).map(c=>`<tr><td>${esc(c.kind)}</td><td><code>${esc(c.target)}</code></td><td>${pill(c.ok?"Healthy":c.status?"HTTP "+c.status:"Needs attention",c.ok?"green":"red")}</td></tr>`).join("")}</tbody></table></div>`:notice("The health monitor has not returned a result yet.","warning")}</div><div class="card management-card"><div class="toolbar"><h2>Deployment and file transactions</h2><span class="count-inline">${transactions.length} recorded</span></div><div class="table-wrap"><table class="management-table"><thead><tr><th>Operation & ID</th><th>Target</th><th>Actor</th><th>Status</th><th>Updated</th><th class="actions-column">Action</th></tr></thead><tbody>${transactions.length?transactions.slice().sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).map(r=>`<tr><td><strong>${esc(r.type)}</strong><small><code>${esc(r.id)}</code></small></td><td><code>${esc(r.target||"")}</code></td><td>${esc(r.actor||"—")}</td><td>${pill(r.state,["committed","rolled-back"].includes(r.state)?"green":"amber")}</td><td>${esc(taskTime(r.updatedAt))}</td><td class="actions-column">${r.type==="file-edit"&&r.backupAvailable?`<button class="button secondary small tx-restore" data-tx="${esc(r.id)}" data-target="${esc(r.target||"")}">Restore backup</button>`:"—"}</td></tr>`).join(""):'<tr><td colspan="6">No transactions recorded.</td></tr>'}</tbody></table></div><p class="field-help card-pad">Previous files and static releases stay in private backup storage. Failed rollback requires administrator attention.</p></div>`;
 }
 html+=`<div class="card management-card"><div class="toolbar"><h2>Persistent audit trail</h2><span class="count-inline">Latest ${auditEntries.length} events</span></div><div class="table-wrap"><table class="management-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target / Request</th><th>Outcome</th></tr></thead><tbody>${auditEntries.length?auditEntries.map(a=>`<tr><td>${esc(taskTime(a.time))}</td><td><strong>${esc(a.actor||"—")}</strong></td><td><code>${esc(a.action||"")}</code></td><td><code>${esc(a.target||"—")}</code>${a.requestId?`<small>${esc(a.requestId)}</small>`:""}</td><td>${pill(a.outcome||"recorded",a.outcome==="403"||a.outcome==="500"||a.outcome==="rollback-failed"?"red":"green")}</td></tr>`).join(""):'<tr><td colspan="5">No audit entries recorded yet.</td></tr>'}</tbody></table></div></div>`;
 slot.innerHTML=html;
 bind("operation-refresh",()=>action(()=>renderOperationMonitor(true))());
 bind("operation-policy",()=>action(showOperationPolicy)());
 $$(".tx-restore").forEach(b=>b.onclick=action(async()=>{if(!await confirmOperation("Restore file backup?",`Atomically restore ${b.dataset.target} from transaction ${b.dataset.tx}?`,"Restore backup"))return;await post("/api/operations/file-restore",{transactionId:b.dataset.tx,confirm:true});notify("File restored from transaction backup.");await renderOperationMonitor();}));
}
async function showOperationPolicy(){
 const policy=await api("/api/operations/health-policy"),services=policy.eligibleServices||[];
 openModal("Automatic repairs",`<form id="operation-policy-form"><div class="modal-body"><p>Choose which failed services the monitor may restart automatically. Each service has a 15-minute cooldown. Tunnel, VPN, SSH, panel and security services require a separate authorized operation.</p>${services.length?services.map((unit,i)=>`<label class="check-row"><input type="checkbox" name="repair-${i}" ${policy.rules[unit]==="restart"?"checked":""}>${esc(unit)}</label>`).join(""):'<p>No services are eligible for automatic restart.</p>'}</div><div class="form-actions">${button("operation-policy-cancel","Cancel","close")}<button id="operation-policy-save" class="button primary" type="submit">Save authorization</button></div></form>`);
 bind("operation-policy-cancel",()=>modal.close());$("#operation-policy-form").onsubmit=e=>{e.preventDefault();action(async()=>{const rules={};services.forEach((unit,i)=>{if($("#operation-policy-form").elements.namedItem("repair-"+i).checked)rules[unit]="restart";});await api("/api/operations/health-policy",{method:"POST",body:JSON.stringify({rules,confirm:true})});modal.close();await renderOperationMonitor();})();};
}
