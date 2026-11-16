import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import {bad} from './management.mjs';

export function createNotifications({dataDir}) {
  const file = path.join(dataDir, 'notifications-config.json');

  async function readConfig() {
    try {
      const text = await fs.readFile(file, 'utf8');
      return JSON.parse(text);
    } catch {
      return {
        telegram: {enabled: false, botToken: '', chatId: ''},
        discord: {enabled: false, webhookUrl: ''},
        slack: {enabled: false, webhookUrl: ''},
        webhook: {enabled: false, url: '', secretHeader: ''},
        smtp: {enabled: false, host: '', port: 587, secure: false, user: '', pass: '', from: '', to: ''},
        events: {
          container_down: true,
          storage_alert: true,
          waf_surge: true,
          backup_failed: true,
          ssl_expiry: true
        }
      };
    }
  }

  async function saveConfig(newConfig) {
    const current = await readConfig();
    const merged = {
      ...current,
      ...newConfig,
      telegram: {...current.telegram, ...(newConfig.telegram || {})},
      discord: {...current.discord, ...(newConfig.discord || {})},
      slack: {...current.slack, ...(newConfig.slack || {})},
      webhook: {...current.webhook, ...(newConfig.webhook || {})},
      smtp: {...current.smtp, ...(newConfig.smtp || {})},
      events: {...current.events, ...(newConfig.events || {})}
    };
    await fs.writeFile(file, JSON.stringify(merged, null, 2), {mode: 0o600});
    return {ok: true};
  }

  async function dispatchAlert({event, title, message, severity = 'warning', details = {}}) {
    const config = await readConfig();
    if (config.events && config.events[event] === false) return {skipped: true};

    const textPayload = `🛡️ [CP-Panel · CyberPross]\n*${title}*\nSeverity: ${severity.toUpperCase()}\nEvent: ${event}\n\n${message}\nTime: ${new Date().toISOString()}`;
    const results = [];

    // 1. Telegram
    if (config.telegram?.enabled && config.telegram.botToken && config.telegram.chatId) {
      try {
        const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            chat_id: config.telegram.chatId,
            text: textPayload,
            parse_mode: 'Markdown'
          })
        });
        results.push({channel: 'telegram', ok: res.ok});
      } catch (err) {
        results.push({channel: 'telegram', ok: false, error: err.message});
      }
    }

    // 2. Discord
    if (config.discord?.enabled && config.discord.webhookUrl) {
      try {
        const color = severity === 'critical' ? 0xff0033 : severity === 'warning' ? 0xffaa00 : 0x00ccff;
        const res = await fetch(config.discord.webhookUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            content: `🛡️ **CP-Panel Alert (by CyberPross)**: ${title}`,
            embeds: [{
              title,
              description: message,
              color,
              fields: [
                {name: 'Severity', value: severity.toUpperCase(), inline: true},
                {name: 'Event', value: event, inline: true}
              ],
              timestamp: new Date().toISOString()
            }]
          })
        });
        results.push({channel: 'discord', ok: res.ok});
      } catch (err) {
        results.push({channel: 'discord', ok: false, error: err.message});
      }
    }

    // 3. Slack
    if (config.slack?.enabled && config.slack.webhookUrl) {
      try {
        const res = await fetch(config.slack.webhookUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            text: textPayload
          })
        });
        results.push({channel: 'slack', ok: res.ok});
      } catch (err) {
        results.push({channel: 'slack', ok: false, error: err.message});
      }
    }

    // 4. Custom Webhook
    if (config.webhook?.enabled && config.webhook.url) {
      try {
        const headers = {'Content-Type': 'application/json'};
        if (config.webhook.secretHeader) {
          headers['X-Panel-Secret'] = config.webhook.secretHeader;
        }
        const res = await fetch(config.webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event,
            title,
            message,
            severity,
            details,
            timestamp: new Date().toISOString()
          })
        });
        results.push({channel: 'webhook', ok: res.ok});
      } catch (err) {
        results.push({channel: 'webhook', ok: false, error: err.message});
      }
    }

    return {ok: true, dispatches: results};
  }

  async function testNotification(channel) {
    return await dispatchAlert({
      event: 'test_notification',
      title: 'Notification Channel Test',
      message: `Test alert dispatched to verify channel "${channel}". Integration is active!`,
      severity: 'info',
      details: {testedChannel: channel}
    });
  }

  return {
    readConfig,
    saveConfig,
    dispatchAlert,
    testNotification
  };
}
