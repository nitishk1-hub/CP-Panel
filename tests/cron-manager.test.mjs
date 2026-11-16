import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {matchCronField, isCronDue, createCronManager} from '../src/cron-manager.mjs';

test('Cron expression matching handles intervals, ranges, and aliases', () => {
  assert.equal(matchCronField('*', 15), true);
  assert.equal(matchCronField('*/5', 15), true);
  assert.equal(matchCronField('*/5', 14), false);
  assert.equal(matchCronField('10-20', 15), true);
  assert.equal(matchCronField('10-20', 25), false);
  assert.equal(matchCronField('1,2,3', 2), true);
  assert.equal(matchCronField('1,2,3', 4), false);

  const midnight = new Date(2026, 10, 16, 0, 0, 0);
  assert.equal(isCronDue('@daily', midnight), true);
  assert.equal(isCronDue('0 0 * * *', midnight), true);
});

test('Cron manager service manages tasks and records execution history', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cron-test-'));
  try {
    const manager = createCronManager({dataDir: tmp});
    const initial = await manager.list();
    assert(initial.length >= 1);

    const created = await manager.create({
      name: 'Test Echo Job',
      schedule: '*/10 * * * *',
      type: 'shell',
      command: 'echo "CYBERPROSS_CRON_TEST"'
    });

    assert.equal(created.name, 'Test Echo Job');
    assert(created.id);

    // Execute runNow
    const result = await manager.runNow(created.id);
    assert.equal(result.exitCode, 0);
    assert(result.output.includes('CYBERPROSS_CRON_TEST'));

    // Check history updated
    const updated = await manager.list();
    const task = updated.find(t => t.id === created.id);
    assert.equal(task.lastExitCode, 0);
    assert(task.lastRun);
    assert.equal(task.history.length, 1);

    // Delete
    await manager.delete(created.id);
    const afterDelete = await manager.list();
    assert(!afterDelete.some(t => t.id === created.id));
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
});
