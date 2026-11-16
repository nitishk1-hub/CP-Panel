import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  createDatabases,
  nativePackages,
  packagePlan,
  databaseSoftware,
} from "../src/databases.mjs";
function fixture() {
  const calls = [];
  let list = [],
    now = Date.now(),
    plan = "Inst redis-server (5:8.0.5 Ubuntu:26.04 [amd64])\n",
    foreign = false;
  const states = new Map(),
    pg = [
      { version: "18", name: "main", port: 5432, state: "down" },
      { version: "18", name: "analytics", port: 5433, state: "down" },
    ];
  const names = {
    mysql: "mysql-server-8.4",
    postgresql: "postgresql-18",
    redis: "redis-server",
    mariadb: "mariadb-server",
  };
  const execute = async (file, args) => {
    calls.push([file, args]);
    if (file === "dpkg-query")
      return list.map((p) => `${p.name}\tinstalled\t${p.version}`).join("\n");
    if (file === "pg_lsclusters")
      return pg
        .map(
          (c) =>
            `${c.version} ${c.name} ${c.port} ${c.state} postgres /var/lib/postgresql /var/log/postgresql`,
        )
        .join("\n");
    if (file === "apt-get")
      return args.includes("--simulate") ? plan : "Repositories checked";
    if (file === "journalctl")
      return "Service started\npassword=do-not-show\nHealthy";
    if (file === "systemctl") {
      if (args[0] === "show") {
        const unit = args[1],
          cluster = unit.startsWith("postgresql@"),
          engine = cluster
            ? "postgresql"
            : Object.keys(databaseSoftware).find(
                (id) => databaseSoftware[id].unit === unit,
              ),
          installed = list.some((p) =>
            databaseSoftware[engine]?.server(p.name),
          ),
          state = states.get(unit) || "inactive",
          program = foreign
            ? "/usr/bin/docker run database"
            : engine === "postgresql"
              ? cluster
                ? "/usr/bin/pg_ctlcluster"
                : "/bin/true"
              : engine === "redis"
                ? "/usr/bin/redis-server"
                : engine === "mysql"
                  ? "/usr/sbin/mysqld"
                  : "/usr/sbin/mariadbd";
        return `Id=${unit}\nLoadState=${installed ? "loaded" : "not-found"}\nActiveState=${engine === "postgresql" && !cluster && installed ? "active" : state}\nSubState=dead\nUnitFileState=enabled\nMainPID=${state === "active" ? 123 : 0}\nExecStart={ path=${program} ; argv[]=${program} ; }`;
      }
      if (["start", "restart", "stop"].includes(args[0])) {
        states.set(args[1], args[0] === "stop" ? "inactive" : "active");
        const c = pg.find(
          (c) => args[1] === `postgresql@${c.version}-${c.name}.service`,
        );
        if (c) c.state = args[0] === "stop" ? "down" : "online";
      }
      return "";
    }
    throw Error("Unexpected host command " + file);
  };
  const stream = async (args, log) => {
    calls.push(["package-stream", args]);
    if (args.includes("remove")) {
      const after = args.slice(args.indexOf("remove") + 1);
      list = list.filter((p) => !after.includes(p.name));
    } else {
      const targets = args.slice(args.indexOf("install") + 1);
      for (const target of targets) {
        const engine = Object.keys(names).find(
          (k) => databaseSoftware[k].package === target || names[k] === target,
        );
        if (engine && !list.some((p) => p.name === names[engine]))
          list.push({
            name: names[engine],
            version: engine === "redis" ? "5:8.0.5" : "18.0",
          });
      }
    }
    log("Package operation completed");
  };
  const service = createDatabases({
    execute,
    stream,
    hostInfo: async () => ({ name: "Ubuntu test", supported: true }),
    isAdministrator: () => true,
    clock: () => now,
  });
  return {
    calls,
    service,
    install(engine, version = "18.0") {
      list.push({ name: names[engine], version });
    },
    get list() {
      return list;
    },
    setPlan(p) {
      plan = p;
    },
    expire() {
      now += 600001;
    },
    foreign() {
      foreign = true;
    },
    pg,
  };
}
test("Native inventory excludes client-only packages and uses no container discovery", async () => {
  assert.deepEqual(
    nativePackages(
      "redis-tools\tinstalled\t8\nredis-server\tconfig-files\t8\nmysql-server\tnot-installed\t\n",
    ),
    [{ name: "redis-tools", version: "8" }],
  );
  const f = fixture(),
    d = await f.service.inventory();
  assert.deepEqual(
    d.software.map((s) => s.engine),
    ["mysql", "postgresql", "redis"],
  );
  assert(d.software.every((s) => s.installed === false));
  assert(!("instances" in d));
  assert(!("existing" in d));
  assert(f.calls.every(([file]) => ["dpkg-query", "systemctl"].includes(file)));
  const source = await fs.readFile(
    new URL("../public/databases.js", import.meta.url),
    "utf8",
  );
  assert(
    !/docker|container|database-create|browseDatabase|Connection credentials/i.test(
      source,
    ),
  );
});
test("Native installation requires a reviewed immutable package plan and preserves package-manager safety flags", async () => {
  const f = fixture(),
    p = await f.service.prepare({ engine: "redis", operation: "install" });
  assert.equal(p.changes[0].name, "redis-server");
  assert(!f.calls.some(([file]) => file === "package-stream"));
  await f.service.apply(p.id, null, () => {});
  const args = f.calls.find(([file]) => file === "package-stream")[1];
  assert(args.includes("--no-remove"));
  assert(args.includes("APT::Get::AutomaticRemove=false"));
  assert(args.includes("APT::Get::Purge=false"));
  assert(args.includes("Dpkg::Options::=--force-confold"));
  assert(
    (await f.service.inventory()).software.find((s) => s.engine === "redis")
      .installed,
  );
  await assert.rejects(f.service.apply(p.id, null), /expired/);
});
test("Uninstall stops only the selected native service, retains data, and never purges or autoremoves", async () => {
  const f = fixture();
  f.install("redis", "5:8.0.5");
  f.setPlan("Remv redis-server [5:8.0.5]\n");
  const marker = await fs.mkdtemp("/tmp/native-db-retention-");
  await fs.writeFile(marker + "/database.rdb", "retained");
  try {
    const p = await f.service.prepare({
      engine: "redis",
      operation: "uninstall",
    });
    await assert.rejects(f.service.apply(p.id, "wrong"), /Type Redis/);
    await f.service.apply(p.id, "Redis", () => {});
    assert.equal(
      await fs.readFile(marker + "/database.rdb", "utf8"),
      "retained",
    );
    const stream = f.calls.findIndex(([file]) => file === "package-stream"),
      stop = f.calls.findIndex(
        ([file, a]) => file === "systemctl" && a[0] === "stop",
      );
    assert(stop >= 0 && stream > stop);
    assert.deepEqual(f.calls[stop][1], ["stop", "redis-server.service"]);
    const args = f.calls[stream][1];
    assert(args.includes("remove"));
    assert(!args.includes("purge"));
    assert(!args.includes("autoremove"));
    assert(
      !(await f.service.inventory()).software.find((s) => s.engine === "redis")
        .installed,
    );
  } finally {
    await fs.rm(marker, { recursive: true, force: true });
  }
});
test("Conflicting, unrelated, changed, expired and version-migration package plans are refused", async () => {
  const f = fixture();
  f.setPlan(
    "Remv openssh-server [1]\nInst mysql-server (8.4 Ubuntu [amd64])\n",
  );
  await assert.rejects(
    f.service.prepare({ engine: "mysql", operation: "install" }),
    /remove/,
  );
  f.install("redis", "5:8.0.5");
  f.setPlan("Remv redis-server [5:8.0.5]\nRemv unrelated-app [1]\n");
  await assert.rejects(
    f.service.prepare({ engine: "redis", operation: "uninstall" }),
    /outside/,
  );
  f.setPlan("Inst redis-server [5:8.0.5] (5:9.0.0 Ubuntu [amd64])\n");
  await assert.rejects(
    f.service.prepare({ engine: "redis", operation: "update" }),
    /version-series/,
  );
  f.setPlan("Inst mysql-server (8.4 Ubuntu [amd64])\n");
  let p = await f.service.prepare({ engine: "mysql", operation: "install" });
  f.list.push({ name: "unrelated", version: "2" });
  await assert.rejects(f.service.apply(p.id, null), /packages changed/);
  p = await f.service.prepare({ engine: "mysql", operation: "install" });
  f.expire();
  await assert.rejects(f.service.apply(p.id, null), /expired/);
  assert(!f.calls.some(([file]) => file === "package-stream"));
  assert.equal(packagePlan("Inst pkg [1] (2 Repo [amd64])")[0].to, "2");
});
test("Native PostgreSQL controls actual clusters rather than its active/exited umbrella unit", async () => {
  const f = fixture();
  f.install("postgresql");
  let s = (await f.service.inventory()).software.find(
    (s) => s.engine === "postgresql",
  );
  assert.equal(s.service.active, "active");
  assert.equal(s.state, "stopped");
  await f.service.control("postgresql", "start");
  assert.equal(
    (await f.service.inventory()).software.find(
      (s) => s.engine === "postgresql",
    ).state,
    "running",
  );
  assert(
    f.calls.some(
      ([file, a]) =>
        file === "systemctl" &&
        a[0] === "start" &&
        a[1] === "postgresql@18-analytics.service",
    ),
  );
  assert(
    !f.calls.some(
      ([file, a]) =>
        file === "systemctl" &&
        a[0] === "start" &&
        a[1] === "postgresql.service",
    ),
  );
  await f.service.control("postgresql", "stop");
  assert.equal(
    (await f.service.inventory()).software.find(
      (s) => s.engine === "postgresql",
    ).state,
    "stopped",
  );
});
test("Custom container launchers, arbitrary commands and missing package inventory never become manageable native services", async () => {
  const f = fixture();
  f.install("redis");
  f.foreign();
  assert.equal(
    (await f.service.inventory()).software.find((s) => s.engine === "redis")
      .canControl,
    false,
  );
  await assert.rejects(f.service.control("redis", "stop"), /launcher/);
  await assert.rejects(
    f.service.control("redis", "stop; reboot"),
    /Unsupported/,
  );
  await assert.rejects(
    f.service.prepare({ engine: "redis;reboot", operation: "install" }),
    /Choose/,
  );
  const broken = createDatabases({
    execute: async () => {
      throw Error("unavailable");
    },
    hostInfo: async () => ({ name: "test", supported: true }),
    isAdministrator: () => true,
  });
  const d = await broken.inventory();
  assert.equal(d.canManage, false);
  assert(
    d.software.every((s) => s.installed === null && s.state === "unknown"),
  );
  const denied = createDatabases({ isAdministrator: () => false });
  await assert.rejects(
    denied.control("redis", "start"),
    (e) => e.status === 403,
  );
});
test("Native database APIs enforce admin/origin/intent/confirmation and retire all instance endpoints", async () => {
  const { createPanel } = await import("../src/server.mjs"),
    dir = await fs.mkdtemp("/tmp/native-database-api-");
  let panel,
    applied = 0;
  try {
    const f = fixture();
    panel = await createPanel({
      dataDir: dir,
      port: 0,
      automaticVerification: false,
      databaseService: {
        inventory: () => f.service.inventory(),
        prepare: async () => ({
          id: crypto.randomUUID(),
          engine: "redis",
          name: "Redis",
          operation: "install",
          changes: [],
          warnings: [],
        }),
        apply: async () => {
          applied++;
        },
        control: async () => {},
        logs: async () => ({ output: "native service log" }),
      },
    });
    await new Promise((r) => panel.server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + panel.server.address().port,
      post = (url, b = {}, h = {}) =>
        fetch(base + url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Panel-Intent": "manage",
            ...h,
          },
          body: JSON.stringify(b),
        });
    assert.equal((await fetch(base + "/api/databases")).status, 401);
    const cred = panel.initialCredentials;
    let a = await (await post("/api/login", cred)).json();
    await post(
      "/api/account/password",
      { currentPassword: cred.password, newPassword: "NativeSoftware9!" },
      { Authorization: "Bearer " + a.token },
    );
    a = await (
      await post("/api/login", {
        username: "admin",
        password: "NativeSoftware9!",
      })
    ).json();
    const auth = { Authorization: "Bearer " + a.token };
    for (const path of ["create", "details", "browse", "backup", "credentials"])
      assert.equal(
        (await fetch(base + "/api/databases/" + path, { headers: auth }))
          .status,
        410,
      );
    assert.equal(
      (
        await post(
          "/api/databases/prepare",
          { engine: "redis", operation: "install" },
          auth,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/api/databases/prepare",
          { engine: "redis", operation: "install", confirm: true },
          { ...auth, Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/api/databases/prepare",
          { engine: "redis", operation: "install", confirm: true },
          { ...auth, "X-Panel-Intent": "" },
        )
      ).status,
      403,
    );
    const job = await (
      await post(
        "/api/databases/prepare",
        { engine: "redis", operation: "install", confirm: true },
        auth,
      )
    ).json();
    for (let i = 0; i < 30; i++) {
      const j = await (
        await fetch(base + "/api/jobs?id=" + job.id, { headers: auth })
      ).json();
      if (j.state === "succeeded") break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const plan = await (
      await fetch(base + "/api/databases/plan?job=" + job.id, { headers: auth })
    ).json();
    assert.equal(plan.engine, "redis");
    const result = await post(
      "/api/databases/apply",
      { id: plan.id, confirm: true },
      auth,
    );
    assert.equal(result.status, 202);
    const applyJob = await result.json();
    let applyState;
    for (let i = 0; i < 100; i++) {
      applyState = await (await fetch(base + "/api/jobs?id=" + applyJob.id, { headers: auth })).json();
      if (!["queued", "running"].includes(applyState.state)) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(applyState.state, "succeeded");
    assert.equal(applied, 1);
    await post(
      "/api/users",
      { username: "viewer", password: "ViewerSoftware9!", role: "viewer" },
      auth,
    );
    let v = await (
      await post("/api/login", {
        username: "viewer",
        password: "ViewerSoftware9!",
      })
    ).json();
    await post(
      "/api/account/password",
      { currentPassword: "ViewerSoftware9!", newPassword: "ViewerNative9!" },
      { Authorization: "Bearer " + v.token },
    );
    v = await (
      await post("/api/login", {
        username: "viewer",
        password: "ViewerNative9!",
      })
    ).json();
    assert.equal(
      (
        await fetch(base + "/api/databases", {
          headers: { Authorization: "Bearer " + v.token },
        })
      ).status,
      403,
    );
  } finally {
    if (panel) {
      panel.server.closeAllConnections();
      await new Promise((r) => panel.server.close(r));
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
