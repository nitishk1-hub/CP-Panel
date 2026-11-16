import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { createTasks } from "../src/tasks.mjs";
test("Tasks execute in order in the backend, retain bounded history and redact credentials", async () => {
  const dir = await fs.mkdtemp("/tmp/panel-task-queue-");
  const runner = await createTasks({ dataDir: dir }),
    order = [];
  let release;
  const blocked = new Promise((r) => (release = r));
  try {
    const first = runner.start("First", async (log) => {
        order.push("first-start");
        log("ordinary progress");
        log("PASSWORD=private-value");
        await blocked;
        order.push("first-end");
      }),
      second = runner.start("Second", async () => order.push("second"));
    assert.equal(second.state, "queued");
    assert.equal(runner.list().active, 2);
    for (let i = 0; i < 50 && order.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(order, ["first-start"]);
    release();
    await runner.idle();
    assert.deepEqual(order, ["first-start", "first-end", "second"]);
    assert.equal(runner.get(first.id).state, "succeeded");
    assert(!runner.get(first.id).output.includes("private-value"));
    assert(!JSON.stringify(runner.list()).includes("ordinary progress"));
    const state = JSON.parse(await fs.readFile(dir + "/tasks.json", "utf8"));
    assert.equal(state.jobs.length, 2);
    assert.equal((await fs.stat(dir + "/tasks.json")).mode & 0o777, 0o600);
    await runner.close();
    const fresh = await createTasks({ dataDir: dir });
    assert.equal(fresh.get(second.id).state, "succeeded");
    await fresh.close();
  } finally {
    release?.();
    await runner.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Restarted tasks are marked interrupted and are never automatically repeated", async () => {
  const dir = await fs.mkdtemp("/tmp/panel-task-restart-"),
    id = crypto.randomUUID();
  try {
    await fs.writeFile(
      dir + "/tasks.json",
      JSON.stringify({
        schema: 1,
        jobs: [
          {
            id,
            title: "Package operation",
            state: "running",
            createdAt: new Date().toISOString(),
            output: "Started",
          },
        ],
      }),
      { mode: 0o600 },
    );
    const runner = await createTasks({ dataDir: dir });
    assert.equal(runner.get(id).state, "interrupted");
    assert.equal(runner.list().active, 0);
    assert.match(runner.get(id).output, /not automatically repeated/);
    await runner.close();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Failed tasks do not stall the queue, and external scan completion does not clear security findings", async () => {
  const dir = await fs.mkdtemp("/tmp/panel-task-failure-"),
    runner = await createTasks({ dataDir: dir });
  try {
    const failed = runner.start("Failure", async () => {
        throw Error("operation failed");
      }),
      next = runner.start("Next", async () => {});
    await runner.idle();
    assert.equal(runner.get(failed.id).state, "failed");
    assert.equal(runner.get(next.id).state, "succeeded");
    const startedAt = new Date().toISOString();
    runner.observe({
      startedAt,
      state: "running",
      progress: "OS scan running",
    });
    assert.equal(runner.list().active, 1);
    runner.observe({
      startedAt,
      state: "complete",
      progress: "Verification completed",
    });
    assert.equal(runner.list().active, 0);
    const external = runner.list().jobs.find((j) => j.external);
    assert.match(runner.get(external.id).output, /unresolved findings remain/);
  } finally {
    await runner.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("Task history endpoints are admin-only and accept no executable client payload", async () => {
  const { createPanel } = await import("../src/server.mjs");
  const dir = await fs.mkdtemp("/tmp/panel-task-api-");
  let panel;
  try {
    panel = await createPanel({
      dataDir: dir,
      port: 0,
      automaticVerification: false,
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
    assert.equal((await fetch(base + "/api/jobs")).status, 401);
    const cred = panel.initialCredentials;
    let a = await (await post("/api/login", cred)).json();
    await post(
      "/api/account/password",
      { currentPassword: cred.password, newPassword: "TasksAdminTesting9!" },
      { Authorization: "Bearer " + a.token },
    );
    a = await (
      await post("/api/login", {
        username: "admin",
        password: "TasksAdminTesting9!",
      })
    ).json();
    const auth = { Authorization: "Bearer " + a.token };
    const history = await (
      await fetch(base + "/api/jobs", { headers: auth })
    ).json();
    assert(Array.isArray(history.jobs));
    assert.equal(
      (
        await post(
          "/api/jobs",
          { command: "arbitrary command", confirm: true },
          auth,
        )
      ).status,
      404,
    );
    await post(
      "/api/users",
      { username: "viewer", password: "ViewerTaskTesting9!", role: "viewer" },
      auth,
    );
    let v = await (
      await post("/api/login", {
        username: "viewer",
        password: "ViewerTaskTesting9!",
      })
    ).json();
    await post(
      "/api/account/password",
      {
        currentPassword: "ViewerTaskTesting9!",
        newPassword: "ChangedTaskViewer9!",
      },
      { Authorization: "Bearer " + v.token },
    );
    v = await (
      await post("/api/login", {
        username: "viewer",
        password: "ChangedTaskViewer9!",
      })
    ).json();
    for (const suffix of ["", "?id=" + crypto.randomUUID()])
      assert.equal(
        (
          await fetch(base + "/api/jobs" + suffix, {
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
