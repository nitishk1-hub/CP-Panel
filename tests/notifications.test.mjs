import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createNotifications} from '../src/notifications.mjs';

test('Notifications service manages channel config and formats alert payloads', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'notif-test-'));
  try {
    const notif = createNotifications({dataDir: tmp});
    const cfg = await notif.readConfig();
    assert.equal(cfg.telegram.enabled, false);

    await notif.saveConfig({
      telegram: {enabled: true, botToken: '123456:ABC-DEF', chatId: '987654321'},
      discord: {enabled: true, webhookUrl: 'https://discord.com/api/webhooks/123/xyz'},
      events: {container_down: true, storage_alert: false}
    });

    const updated = await notif.readConfig();
    assert.equal(updated.telegram.enabled, true);
    assert.equal(updated.telegram.chatId, '987654321');
    assert.equal(updated.events.storage_alert, false);

    // Dispatches skip disabled events
    const skipped = await notif.dispatchAlert({
      event: 'storage_alert',
      title: 'Disk space warning',
      message: 'Disk at 90%'
    });
    assert.equal(skipped.skipped, true);
  } finally {
    await fs.rm(tmp, {recursive: true, force: true});
  }
});
