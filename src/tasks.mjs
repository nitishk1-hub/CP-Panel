import {writeFileSync,renameSync,openSync,fsyncSync,closeSync,unlinkSync} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { bad } from "./management.mjs";
const ongoing = (s) => ["queued", "running"].includes(s);
const redact = (text) =>
  String(text)
    .split("\n")
    .filter(
      (l) =>
        !/password|credential|authorization|bearer|secret|token|https?:\/\/[^/\s]+:[^@\s]+@/i.test(
          l,
        ),
    )
    .join("\n");
export async function createTasks({ dataDir, clock = () => Date.now() } = {}) {
  const file = path.join(dataDir, "tasks.json"),
    jobs = new Map(),
    callbacks = new Map();
  let worker = null,
    writeQueue = Promise.resolve(),
    timer = null,
    closed = false,
    storageError = null,
    intentRevision = 0;
  const stamp = () => new Date(clock()).toISOString();
  const snapshot = () => [...jobs.values()].map((j) => structuredClone(j));
  const prune = () => {
    const complete = [...jobs.values()].filter((j) => !ongoing(j.state));
    for (const j of complete.slice(0, Math.max(0, jobs.size - 100)))
      jobs.delete(j.id);
  };
  function save() {
    if (closed) return writeQueue;
    const task = writeQueue.then(async () => {
      const revision=intentRevision;
      prune();
      let bytes = JSON.stringify({ schema: 1, jobs: snapshot() });
      while (Buffer.byteLength(bytes) > 7 * 1024 * 1024) {
        const oldest = [...jobs.values()].find((j) => !ongoing(j.state));
        if (oldest) jobs.delete(oldest.id);
        else for (const j of jobs.values()) j.output = j.output.slice(-8000);
        bytes = JSON.stringify({ schema: 1, jobs: snapshot() });
      }
      const temp = file + "." + crypto.randomUUID();
      try {
        await fs.writeFile(temp, bytes, { mode: 0o600, flag: "wx" });
        if(revision!==intentRevision)return;
        await fs.rename(temp, file);
        storageError = null;
      } finally {
        await fs.rm(temp, { force: true });
      }
    });
    writeQueue = task.catch((e) => {
      storageError = e.message;
    });
    return task;
  }
  function schedule() {
    if (timer || closed) return;
    timer = setTimeout(() => {
      timer = null;
      save().catch(() => {});
    }, 1000);
    timer.unref();
  }
  const st = await fs.lstat(file).catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (st) {
    if (
      !st.isFile() ||
      st.isSymbolicLink() ||
      st.uid !== process.getuid?.() ||
      st.mode & 0o077 ||
      st.size > 8 * 1024 * 1024
    )
      throw Error("Task history storage is unsafe");
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    if (data.schema !== 1 || !Array.isArray(data.jobs))
      throw Error("Task history has an unsupported format");
    for (const old of data.jobs.slice(-100)) {
      if (
        !/^[a-f0-9-]{36}$/.test(old.id) ||
        !["queued", "running", "succeeded", "failed", "interrupted"].includes(
          old.state,
        )
      )
        continue;
      const j = {
        id: old.id,
        title: String(old.title).slice(0, 200),
        state: old.state,
        output: String(old.output || "").slice(-64000),
        createdAt: old.createdAt,
        ...(old.externalKey
          ? { externalKey: String(old.externalKey), external: !!old.external }
          : {}),
        startedAt: old.startedAt || null,
        finishedAt: old.finishedAt || null,
        ...(["native-database-plan", "readiness-repair-plan"].includes(
          old.action,
        )
          ? { action: old.action }
          : {}),
      };
      if (ongoing(j.state)) {
        j.state = "interrupted";
        j.finishedAt = stamp();
        j.output +=
          "\nThe panel restarted before completion was confirmed. Check the affected service before retrying; this task was not automatically repeated.";
      }
      jobs.set(j.id, j);
    }
    await save();
  }
  async function pump() {
    while (!closed) {
      const job = [...jobs.values()].find((j) => j.state === "queued");
      if (!job) break;
      job.state = "running";
      job.startedAt = stamp();
      try {
        await save();
        if (closed) throw Error("Panel task runner stopped before execution");
        const task = callbacks.get(job.id);
        if (!task) throw Error("Task operation is unavailable");
        await task((s) => {
          const text = redact(s);
          if (text) job.output = (job.output + text + "\n").slice(-64000);
          schedule();
        });
        job.state = "succeeded";
      } catch (e) {
        job.state = "failed";
        job.output = (
          job.output +
          "\n" +
          redact(e.message || "Task failed")
        ).slice(-64000);
      } finally {
        callbacks.delete(job.id);
        job.finishedAt = stamp();
        await save().catch(() => {});
      }
    }
  }
  function startWorker() {
    if (worker || closed) return;
    worker = Promise.resolve()
      .then(pump)
      .finally(() => {
        worker = null;
        if (!closed && [...jobs.values()].some((j) => j.state === "queued"))
          startWorker();
      });
  }
  return {
    start(title, task, { action } = {}) {
      if (closed) throw bad("The task runner is shutting down", 503);
      if ([...jobs.values()].filter((j) => ongoing(j.state)).length >= 25)
        throw bad("The task queue is full; wait for current operations", 429);
      const job = {
        id: crypto.randomUUID(),
        title: String(title).slice(0, 200),
        state: "queued",
        output: "",
        createdAt: stamp(),
        startedAt: null,
        finishedAt: null,
        ...(["native-database-plan", "readiness-repair-plan"].includes(action)
          ? { action }
          : {}),
      };
      jobs.set(job.id, job);
      callbacks.set(job.id, task);
      // Persist intent before acknowledging the operation or starting its side effects.
      intentRevision++;
      const initial=file+"."+crypto.randomUUID();
      try {
        prune();
        writeFileSync(initial,JSON.stringify({schema:1,jobs:snapshot()}),{mode:0o600,flag:"wx"});
        const fd=openSync(initial,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
        renameSync(initial,file);
        const parent=openSync(dataDir,"r");try{fsyncSync(parent);}finally{closeSync(parent);}
      } catch(error) {
        jobs.delete(job.id);callbacks.delete(job.id);
        try{unlinkSync(initial);}catch{}
        throw bad("Could not persist task intent; no operation was started",503);
      }
      schedule();
      startWorker();
      return structuredClone(job);
    },
    observe(info) {
      if (
        closed ||
        !info.startedAt ||
        !["running", "complete", "failed", "interrupted"].includes(info.state)
      )
        return;
      const key = "readiness:" + info.startedAt;
      let job = [...jobs.values()].find((j) => j.externalKey === key);
      if (!job)
        job = [...jobs.values()].find(
          (j) =>
            j.state === "running" &&
            [
              "Automatic production verification",
              "Repair host packages and verify",
            ].includes(j.title),
        );
      if (!job) {
        job = {
          id: crypto.randomUUID(),
          title: "Scheduled readiness verification",
          external: true,
          externalKey: key,
          state: "running",
          createdAt: info.startedAt,
          startedAt: info.startedAt,
          finishedAt: null,
          output: "",
        };
        jobs.set(job.id, job);
      }
      job.externalKey = key;
      const message = redact(info.progress || "");
      if (message && job.progress !== message) {
        job.progress = message;
        job.output = (job.output + message + "\n").slice(-64000);
      }
      if (job.external) {
        job.state = info.state === "complete" ? "succeeded" : info.state;
        job.finishedAt =
          info.state === "running" ? null : info.finishedAt || stamp();
        if (info.state === "complete")
          job.output +=
            "Scan execution completed; unresolved findings remain in Readiness.\n";
      }
      schedule();
    },
    get(id) {
      const j = jobs.get(id);
      if (!j) throw bad("Task not found", 404);
      return structuredClone(j);
    },
    list() {
      return {
        jobs: [...jobs.values()]
          .reverse()
          .map(({ output, ...j }) => ({ ...j, outputAvailable: !!output })),
        active: [...jobs.values()].filter((j) => ongoing(j.state)).length,
        storageError,
      };
    },
    async idle() {
      while (worker) await worker;
      await writeQueue;
    },
    async close() {
      if (closed) return writeQueue;
      if (timer) clearTimeout(timer);
      const final = save().catch(() => {});
      closed = true;
      await final;
      await writeQueue;
    },
  };
}
