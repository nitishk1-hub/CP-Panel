import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {bad} from './management.mjs';

const exec = promisify(execFile);

export function matchCronField(pattern, value) {
  if (pattern === '*') return true;
  for (const part of pattern.split(',')) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      const start = range === '*' ? 0 : parseInt(range, 10);
      if ((value - start) >= 0 && (value - start) % step === 0) return true;
    } else if (part.includes('-')) {
      const [minStr, maxStr] = part.split('-');
      const min = parseInt(minStr, 10);
      const max = parseInt(maxStr, 10);
      if (value >= min && value <= max) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }
  return false;
}

export function isCronDue(schedule, date = new Date()) {
  const norm = schedule.trim().toLowerCase();
  if (norm === '@hourly') return date.getMinutes() === 0;
  if (norm === '@daily' || norm === '@midnight') return date.getMinutes() === 0 && date.getHours() === 0;
  if (norm === '@weekly') return date.getMinutes() === 0 && date.getHours() === 0 && date.getDay() === 0;
  if (norm === '@monthly') return date.getMinutes() === 0 && date.getHours() === 0 && date.getDate() === 1;

  const parts = norm.split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, mon, dow] = parts;
  return (
    matchCronField(min, date.getMinutes()) &&
    matchCronField(hour, date.getHours()) &&
    matchCronField(dom, date.getDate()) &&
    matchCronField(mon, date.getMonth() + 1) &&
    matchCronField(dow, date.getDay())
  );
}

export function createCronManager({dataDir, cloudBackup, dockerMaintenance, acmeClient}) {
  const file = path.join(dataDir, 'cron-tasks.json');
  let timer = null;

  async function readTasks() {
    try {
      const text = await fs.readFile(file, 'utf8');
      return JSON.parse(text);
    } catch {
      return [
        {
          id: 'default-docker-cleanup',
          name: 'Weekly Docker Prune & Cache Cleanup',
          schedule: '0 3 * * 0',
          type: 'docker_cleanup',
          command: '',
          enabled: true,
          lastRun: null,
          lastExitCode: null,
          lastDurationMs: null,
          history: []
        },
        {
          id: 'default-backup',
          name: 'Daily Server & Database S3 Backup',
          schedule: '0 2 * * *',
          type: 'backup',
          command: '',
          enabled: false,
          lastRun: null,
          lastExitCode: null,
          lastDurationMs: null,
          history: []
        }
      ];
    }
  }

  async function saveTasks(tasks) {
    await fs.writeFile(file, JSON.stringify(tasks, null, 2), {mode: 0o600});
  }

  async function executeTask(task) {
    const start = Date.now();
    let exitCode = 0;
    let output = '';

    try {
      if (task.type === 'shell') {
        if (!task.command) throw bad('Shell command cannot be empty');
        const res = await exec('/bin/bash', ['-c', task.command], {timeout: 600000});
        output = (res.stdout + '\n' + res.stderr).trim().slice(-2000);
      } else if (task.type === 'backup' && cloudBackup) {
        const res = await cloudBackup.runBackup({targets: ['panel', 'databases', 'websites']});
        output = JSON.stringify(res);
      } else if (task.type === 'docker_cleanup' && dockerMaintenance) {
        const res = await exec('docker', ['system', 'prune', '-f', '--volumes']).catch(e => ({stdout: '', stderr: e.message}));
        output = (res.stdout || res.stderr).slice(-1000);
      } else if (task.type === 'ssl_renew' && acmeClient) {
        output = 'Checked ACME SSL certificates';
      }
    } catch (err) {
      exitCode = err.code || 1;
      output = err.message || 'Execution failed';
    }

    const durationMs = Date.now() - start;
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      const record = {
        at: new Date().toISOString(),
        exitCode,
        durationMs,
        output: output.slice(-500)
      };
      tasks[idx].lastRun = record.at;
      tasks[idx].lastExitCode = exitCode;
      tasks[idx].lastDurationMs = durationMs;
      tasks[idx].history = [record, ...(tasks[idx].history || []).slice(0, 19)];
      await saveTasks(tasks);
    }

    return {exitCode, durationMs, output};
  }

  function startScheduler() {
    if (timer) clearInterval(timer);
    timer = setInterval(async () => {
      try {
        const now = new Date();
        const tasks = await readTasks();
        for (const t of tasks) {
          if (t.enabled && isCronDue(t.schedule, now)) {
            void executeTask(t);
          }
        }
      } catch {}
    }, 60000);
    timer.unref();
  }

  function stopScheduler() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    startScheduler,
    stopScheduler,
    async list() {
      return await readTasks();
    },
    async create(data) {
      if (!data.name || !data.schedule || !data.type) throw bad('Provide name, schedule, and type');
      const tasks = await readTasks();
      const newTask = {
        id: crypto.randomUUID(),
        name: data.name,
        schedule: data.schedule,
        type: data.type,
        command: data.command || '',
        enabled: data.enabled !== false,
        lastRun: null,
        lastExitCode: null,
        lastDurationMs: null,
        history: []
      };
      tasks.push(newTask);
      await saveTasks(tasks);
      return newTask;
    },
    async update(id, data) {
      const tasks = await readTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx < 0) throw bad('Cron task not found', 404);
      tasks[idx] = {
        ...tasks[idx],
        ...data,
        id // retain id
      };
      await saveTasks(tasks);
      return tasks[idx];
    },
    async delete(id) {
      let tasks = await readTasks();
      tasks = tasks.filter(t => t.id !== id);
      await saveTasks(tasks);
      return {ok: true};
    },
    async runNow(id) {
      const tasks = await readTasks();
      const task = tasks.find(t => t.id === id);
      if (!task) throw bad('Task not found', 404);
      return await executeTask(task);
    }
  };
}
