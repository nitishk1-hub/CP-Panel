import fs from "node:fs/promises";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { bad, run } from "./management.mjs";

export const databaseSoftware = {
  mysql: {
    name: "MySQL",
    package: "mysql-server",
    unit: "mysql.service",
    server: (p) =>
      /^mysql-(?:community-)?server(?:-(?:core|[0-9][a-z0-9.+-]*))*$/.test(p),
    family: (p) => /^(?:default-mysql-server|mysql-)/.test(p),
    native: /\/(?:mysqld|mysql-systemd-start)(?:\s|;|$)/,
  },
  postgresql: {
    name: "PostgreSQL",
    package: "postgresql",
    unit: "postgresql.service",
    server: (p) => /^postgresql(?:-[0-9]+)?$/.test(p),
    family: (p) => /^postgresql(?:-|$)/.test(p),
    native: /\/(?:true|pg_ctlcluster)(?:\s|;|$)/,
  },
  redis: {
    name: "Redis",
    package: "redis-server",
    unit: "redis-server.service",
    server: (p) => p === "redis-server",
    family: (p) => /^redis(?:-|$)/.test(p),
    native: /\/redis-server(?:\s|;|$)/,
  },
  mariadb: {
    name: "MariaDB",
    package: "mariadb-server",
    unit: "mariadb.service",
    server: (p) => /^mariadb-server(?:-(?:core|[0-9][a-z0-9.+-]*))*$/.test(p),
    family: (p) => /^(?:default-mysql-server|mariadb-)/.test(p),
    native: /\/(?:mariadbd|mysqld)(?:\s|;|$)/,
  },
};
const engineFor = (id) => {
  if (!Object.hasOwn(databaseSoftware, id))
    throw bad(
      "Choose MySQL, PostgreSQL, Redis or an installed MariaDB service",
    );
  return databaseSoftware[id];
};
const cleanPackage = (p) => p.split(":")[0];
export function nativePackages(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const [name, status, version] = line.split("\t");
    if (
      status === "installed" &&
      /^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?$/.test(name) &&
      version
    )
      rows.push({ name: cleanPackage(name), version });
  }
  return rows;
}
export function packagePlan(text) {
  const changes = [];
  for (const line of text.split("\n")) {
    let m;
    if (
      (m = line.match(/^Inst (\S+)(?: \[([^\]]+)\])? \((\S+)(?: (.*))?\)$/))
    ) {
      if (!/^[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?$/.test(m[1]))
        throw bad("Invalid package plan");
      changes.push({
        name: cleanPackage(m[1]),
        action: m[2] ? "update" : "install",
        from: m[2] || null,
        to: m[3],
      });
    } else if ((m = line.match(/^Remv (\S+)(?: \[([^\]]+)\])?/))) {
      changes.push({
        name: cleanPackage(m[1]),
        action: "remove",
        from: m[2] || null,
        to: null,
      });
    } else if (/^(?:Inst|Remv)\s/.test(line))
      throw bad("Unsupported package-manager plan");
  }
  return changes;
}
function serviceFields(text) {
  return Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const n = l.indexOf("=");
        return [l.slice(0, n), l.slice(n + 1)];
      }),
  );
}
const digest = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const filtered = (text) =>
  String(text)
    .split("\n")
    .filter(
      (l) =>
        !/password|requirepass|masterauth|credential|authorization|bearer|secret|token/i.test(
          l,
        ),
    )
    .join("\n");
export function nativePackageStream(args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn("apt-get", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LC_ALL: "C",
        DEBIAN_FRONTEND: "noninteractive",
        NEEDRESTART_MODE: "l",
      },
    });
    const buffers = new Map();
    let expired = false;
    const emit = (key, chunk) => {
      const text = (buffers.get(key) || "") + chunk.toString(),
        lines = text.split("\n");
      buffers.set(key, lines.pop());
      const safe = filtered(lines.join("\n"));
      if (safe) log(safe);
    };
    child.stdout.on("data", (b) => emit("out", b));
    child.stderr.on("data", (b) => emit("err", b));
    const timer = setTimeout(() => {
        expired = true;
        child.kill("SIGTERM");
      }, 30 * 60000),
      force = setTimeout(() => child.kill("SIGKILL"), 30 * 60000 + 5000);
    child.once("error", () => {
      clearTimeout(timer);
      clearTimeout(force);
      reject(bad("Cannot start the system package manager"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      clearTimeout(force);
      for (const value of buffers.values()) {
        const safe = filtered(value);
        if (safe) log(safe);
      }
      if (code || expired)
        reject(
          bad(
            "The package operation did not finish successfully. Review the operation output and refresh the software status; no package rollback is claimed.",
          ),
        );
      else resolve();
    });
  });
}
async function nativeHost() {
  const text = await fs.readFile("/etc/os-release", "utf8").catch(() => "");
  const values = Object.fromEntries(
    text
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
  return {
    name: values.PRETTY_NAME || process.platform,
    supported:
      process.platform === "linux" &&
      /\b(?:ubuntu|debian)\b/.test([values.ID, values.ID_LIKE].join(" ")) &&
      (await fs.access("/usr/bin/apt-get", fs.constants.X_OK).then(
        () => true,
        () => false,
      )),
  };
}
export function createDatabases({
  execute = run,
  stream = nativePackageStream,
  isAdministrator = () => process.getuid?.() === 0,
  hostInfo = nativeHost,
  clock = () => Date.now(),
} = {}) {
  let busy = false;
  const plans = new Map(),
    env = {
      ...process.env,
      LC_ALL: "C",
      DEBIAN_FRONTEND: "noninteractive",
      NEEDRESTART_MODE: "l",
    };
  const packages = async () =>
    nativePackages(
      await execute(
        "dpkg-query",
        ["-W", "-f=${binary:Package}\t${db:Status-Status}\t${Version}\n"],
        { maxBuffer: 4 * 1024 * 1024, env },
      ),
    );
  async function unit(engine) {
    const e = engineFor(engine);
    const raw = await execute(
      "systemctl",
      [
        "show",
        e.unit,
        "--no-pager",
        "--property=Id,LoadState,ActiveState,SubState,UnitFileState,ExecStart,MainPID,MemoryCurrent,ExecMainStartTimestamp",
      ],
      { env },
    );
    const s = serviceFields(raw),
      native =
        s.LoadState === "loaded" &&
        e.native.test(s.ExecStart || "") &&
        !/(?:docker|podman|containerd|nerdctl)/i.test(s.ExecStart || "");
    return {
      unit: s.Id || e.unit,
      load: s.LoadState || "unknown",
      active: s.ActiveState || "unknown",
      sub: s.SubState || "unknown",
      enabled: s.UnitFileState || "unknown",
      native,
      pid: Number(s.MainPID) || null,
      memory: /^\d+$/.test(s.MemoryCurrent || "")
        ? Number(s.MemoryCurrent)
        : null,
      startedAt: s.ExecMainStartTimestamp || null,
    };
  }
  async function clusters() {
    const text = await execute("pg_lsclusters", ["--no-header"], {
      env,
      maxBuffer: 1024 * 1024,
    });
    const rows = text
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => {
        const [version, cluster, port, status] = line.trim().split(/\s+/);
        return { version, cluster, port, status };
      });
    return rows.map((c) => {
      const version = String(c.version),
        name = String(c.cluster);
      if (
        !/^\d+$/.test(version) ||
        !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,62}$/.test(name)
      )
        throw bad(
          "A PostgreSQL cluster name needs explicit administrator review",
        );
      return {
        version,
        name,
        port: Number(c.port) || null,
        state:
          c.status === "online" ? "running" : String(c.status || "unknown"),
        unit: `postgresql@${version}-${name}.service`,
      };
    });
  }
  async function status(engine, installed) {
    const e = engineFor(engine),
      rows = installed.filter((p) => e.server(p.name)),
      service = await unit(engine).catch((err) => ({
        unit: e.unit,
        load: "unknown",
        active: "unknown",
        enabled: "unknown",
        native: false,
        error: err.message,
      }));
    let pg = [],
      error = service.error || null;
    if (engine === "postgresql" && rows.length)
      try {
        pg = await clusters();
      } catch (err) {
        error = err.message;
      }
    const present = !!rows.length || service.native;
    let state = !present
      ? "not_installed"
      : service.native
        ? service.active === "active"
          ? "running"
          : service.active === "inactive"
            ? "stopped"
            : service.active
        : service.load === "masked"
          ? "masked"
          : "unavailable";
    if (engine === "postgresql" && present && !error) {
      const up = pg.filter((c) => c.state === "running").length;
      state =
        up === pg.length && up > 0
          ? "running"
          : up
            ? "partly_running"
            : pg.length
              ? "stopped"
              : "no_clusters";
    }
    return {
      engine,
      name: e.name,
      package: e.package,
      installed: present,
      managedByApt: !!rows.length,
      version:
        (engine === "postgresql" && rows.some(p=>p.name!=="postgresql") ? rows.filter(p=>p.name!=="postgresql") : rows)
          .map((p) => p.version)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ") || null,
      packages: rows,
      service,
      state,
      clusters: pg,
      error,
      canControl: present && service.native && !error,
    };
  }
  async function inventory() {
    const host = await hostInfo();
    let list = [],
      error = null;
    try {
      list = await packages();
    } catch (e) {
      error = "Native package inventory is unavailable: " + e.message;
    }
    const ids = [
        "mysql",
        "postgresql",
        "redis",
        ...(list.some((p) => databaseSoftware.mariadb.server(p.name))
          ? ["mariadb"]
          : []),
      ],
      software = await Promise.all(ids.map((id) => status(id, list)));
    if (error)
      for (const item of software) {
        item.installed = null;
        item.state = "unknown";
        item.canControl = false;
        item.error = error;
      }
    return {
      host,
      canManage: host.supported && isAdministrator() && !error,
      error,
      busy,
      software,
    };
  }
  async function ensureAdmin() {
    if (!isAdministrator())
      throw bad(
        "Use the installed administrator service to manage native software",
        403,
      );
    if (!(await hostInfo()).supported)
      throw bad(
        "Native database installation currently supports Ubuntu and Debian APT hosts",
      );
  }
  const aptArgs = (operation, targets, simulate) => [
    "-o",
    "APT::Get::AllowUnauthenticated=false",
    "-o",
    "Acquire::AllowInsecureRepositories=false",
    "-o",
    "Acquire::AllowDowngradeToInsecureRepositories=false",
    "-o",
    "APT::Get::AutomaticRemove=false",
    "-o",
    "APT::Get::Purge=false",
    ...(simulate
      ? ["--simulate"]
      : [
          "--yes",
          "-o",
          "DPkg::Lock::Timeout=60",
          "-o",
          "Dpkg::Options::=--force-confold",
        ]),
    ...(operation === "uninstall" ? [] : ["--no-remove"]),
    ...(operation === "update" ? ["--only-upgrade"] : []),
    "--no-install-recommends",
    operation === "uninstall" ? "remove" : "install",
    ...targets,
  ];
  function targetsFor(engine, operation, list) {
    const e = engineFor(engine),
      server = list.filter((p) => e.server(p.name));
    if (operation === "install") {
      if (server.length)
        throw bad(
          "This software is already installed. Use its service controls or Update.",
        );
      if (
        (engine === "mysql" &&
          list.some((p) => databaseSoftware.mariadb.server(p.name))) ||
        (engine === "mariadb" &&
          list.some((p) => databaseSoftware.mysql.server(p.name)))
      )
        throw bad(
          "MySQL and MariaDB conflict. Uninstall the existing native server separately before choosing another.",
        );
      return [e.package];
    }
    if (!server.length) throw bad("Native server software is not installed");
    const names = server.map((p) => p.name);
    return operation === "update" && engine === "postgresql"
      ? names.filter((n) => n !== "postgresql")
      : names;
  }
  async function simulate(engine, operation, targets) {
    const out = await execute("apt-get", aptArgs(operation, targets, true), {
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      env,
    });
    const changes = packagePlan(out),
      e = engineFor(engine);
    if (operation !== "uninstall" && changes.some((c) => c.action === "remove"))
      throw bad(
        "This installation would remove existing packages; it was blocked",
      );
    if (
      operation === "uninstall" &&
      changes.some((c) => c.action !== "remove" || !e.family(c.name))
    )
      throw bad(
        "Uninstall would remove software outside the selected database family. No packages were changed.",
      );
    if (
      changes.some((c) =>
        /^(?:docker|containerd|wireguard|openssh-server|systemd|network-manager|ufw|nftables|linux-image|nginx|openresty)(?:[-.]|$)/.test(
          c.name,
        ),
      )
    )
      throw bad(
        "This plan changes unrelated server infrastructure and was blocked",
      );
    for (const c of changes.filter(
      (c) => c.action === "update" && e.server(c.name),
    )) {
      const series = (v) =>
        v
          .replace(/^\d+:/, "")
          .match(
            engine === "mysql" || engine === "mariadb" ? /^\d+\.\d+/ : /^\d+/,
          )?.[0];
      if (c.from && series(c.from) !== series(c.to))
        throw bad(
          "An automatic database version-series migration is not supported",
        );
    }
    return { changes, revision: digest(changes) };
  }
  async function prepare({ engine, operation }) {
    engineFor(engine);
    if (!["install", "update", "uninstall"].includes(operation))
      throw bad("Choose install, update or uninstall");
    await ensureAdmin();
    if (busy) throw bad("A native database operation is running", 409);
    busy = true;
    try {
      if (operation !== "uninstall")
        await execute("apt-get", ["update", "--error-on=any"], {
          timeout: 180000,
          maxBuffer: 4 * 1024 * 1024,
          env,
        });
      const list = await packages(),
        existing = await status(engine, list);
      if (operation === "install" && existing.service.load !== "not-found")
        throw bad(
          "A service definition already exists or could not be read. Installation will not overwrite a native or custom setup.",
        );
      const targets = targetsFor(engine, operation, list);
      if (!targets.length)
        throw bad(
          "No installed server package is available for this operation",
        );
      const plan = await simulate(engine, operation, targets),
        id = crypto.randomUUID(),
        created = clock(),
        current = await status(engine, list);
      const result = {
        id,
        engine,
        name: engineFor(engine).name,
        operation,
        changes: plan.changes,
        createdAt: new Date(created).toISOString(),
        expiresAt: new Date(created + 10 * 60000).toISOString(),
        warnings:
          operation === "uninstall"
            ? [
                "Stops this native database service. Applications using it lose their connections.",
                "Removes server packages without purge or autoremove. Database data and configuration files are retained.",
                "Back up important database data separately. Reinstalling is not a tested disaster-recovery procedure.",
              ]
            : [
                "Uses the host’s existing signed APT repositories; no external repository or script is added.",
                "The displayed dependency changes are part of the operation. Package installation or updates can start/restart this database.",
                "Existing configuration is preserved. Credentials and database bindings are not reset; no firewall ports are opened.",
              ],
      };
      if (plans.size > 30) plans.clear();
      plans.set(id, {
        ...result,
        targets,
        revision: plan.revision,
        packages: digest(list),
        expires: created + 10 * 60000,
        unit: current.service,
      });
      return result;
    } finally {
      busy = false;
    }
  }
  async function control(engine, operation, log = () => {}) {
    await ensureAdmin();
    if (!["start", "stop", "restart", "enable", "disable"].includes(operation))
      throw bad("Unsupported native service action");
    if (busy) throw bad("A native database operation is running", 409);
    busy = true;
    try {
      await controlInternal(engine, operation, log);
    } finally {
      busy = false;
    }
  }
  async function controlInternal(engine, operation, log) {
    const current = await status(engine, await packages());
    if (!current.canControl)
      throw bad(
        current.error ||
          "The native package service is unavailable, masked or replaced by a custom launcher",
      );
    if (
      engine === "postgresql" &&
      ["start", "stop", "restart"].includes(operation)
    ) {
      if (!current.clusters.length) {
        if (operation === "stop") { log("No native PostgreSQL clusters are running."); return; }
        throw bad("No native PostgreSQL cluster exists. Installation must create a cluster before it can be started.");
      }
      for (const cluster of current.clusters) {
        const raw = serviceFields(
          await execute(
            "systemctl",
            ["show", cluster.unit, "--property=LoadState,ExecStart"],
            { env },
          ),
        );
        if (
          raw.LoadState !== "loaded" ||
          !databaseSoftware.postgresql.native.test(raw.ExecStart || "") ||
          /(?:docker|podman)/.test(raw.ExecStart || "")
        )
          throw bad("A PostgreSQL cluster service has an unexpected launcher");
        await execute("systemctl", [operation, cluster.unit], {
          timeout: 120000,
          env,
        });
      }
    } else
      await execute("systemctl", [operation, engineFor(engine).unit], {
        timeout: 120000,
        env,
      });
    const after = await status(engine, await packages());
    if (["start", "restart"].includes(operation) && after.state !== "running")
      throw bad(
        "The service did not reach a running state. Check its native service logs.",
      );
    if (
      operation === "stop" &&
      ["running", "partly_running"].includes(after.state)
    )
      throw bad("The service still reports running; check its logs");
    log(engineFor(engine).name + ": " + operation + " completed.");
  }
  async function apply(id, typedName, log = () => {}) {
    await ensureAdmin();
    if (busy) throw bad("A native database operation is running", 409);
    const plan = plans.get(id);
    if (!plan || clock() >= plan.expires)
      throw bad("The software plan expired. Review a new plan.", 409);
    if (plan.operation === "uninstall" && typedName !== plan.name)
      throw bad("Type " + plan.name + " to confirm uninstall");
    busy = true;
    plans.delete(id);
    try {
      const list = await packages();
      if (digest(list) !== plan.packages)
        throw bad("Installed packages changed. Review a new plan.", 409);
      const latest = await simulate(plan.engine, plan.operation, plan.targets);
      if (latest.revision !== plan.revision)
        throw bad("Package candidates changed. Review a new plan.", 409);
      if (!latest.changes.length) {
        log("No package changes are available.");
        return;
      }
      if (plan.operation === "uninstall") {
        const current = await status(plan.engine, list);
        if (current.canControl) await controlInternal(plan.engine, "stop", log);
        else if (
          current.service.load === "loaded" ||
          current.service.active === "active" ||
          ["running", "partly_running"].includes(current.state)
        )
          throw bad(
            "Cannot safely uninstall while this custom or unavailable service definition exists",
          );
      }
      log(
        plan.operation === "uninstall"
          ? "Removing native server packages. Data/configuration are retained; no purge or autoremove."
          : "Applying reviewed native software packages. This can take several minutes.",
      );
      await stream(aptArgs(plan.operation, plan.targets, false), log);
      await execute("systemctl", ["daemon-reload"], { env });
      const after = await status(plan.engine, await packages());
      if (
        plan.operation === "uninstall" &&
        (after.installed || ["running", "partly_running"].includes(after.state))
      )
        throw bad(
          "Removal is not complete; inspect native package and service status",
        );
      if (plan.operation !== "uninstall" && !after.installed)
        throw bad("Native server installation was not confirmed");
      log(plan.name + " " + plan.operation + " completed.");
      return after;
    } finally {
      busy = false;
    }
  }
  async function logs(engine) {
    engineFor(engine);
    const current = await status(engine, await packages());
    if (!current.installed) throw bad("Native software is not installed");
    if (!current.service.native) throw bad("Logs are available only for a verified native service");
    const units = [
      engineFor(engine).unit,
      ...current.clusters.map((c) => c.unit),
    ];
    return {
      output: filtered(
        await execute(
          "journalctl",
          [
            ...units.flatMap((u) => ["--unit", u]),
            "--no-pager",
            "--output",
            "cat",
            "--lines",
            "150",
          ],
          { maxBuffer: 1024 * 1024, env },
        ),
      ).slice(-64000),
    };
  }
  return { inventory, prepare, apply, control, logs };
}
