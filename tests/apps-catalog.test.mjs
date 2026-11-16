import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_TEMPLATES, createAppsCatalog, findNextAvailablePort} from '../src/apps-catalog.mjs';

test('App templates catalog includes essential open source apps', () => {
  const ids = APP_TEMPLATES.map(t => t.id);
  assert(ids.includes('n8n'));
  assert(ids.includes('wordpress'));
  assert(ids.includes('postgresql'));
  assert(ids.includes('redis'));
  assert(ids.includes('nextcloud'));
  assert(ids.includes('uptime-kuma'));
  assert(ids.includes('vaultwarden'));
  assert(ids.includes('gitea'));
  assert(ids.includes('ghost'));

  for (const t of APP_TEMPLATES) {
    assert(typeof t.id === 'string' && t.id.length > 0);
    assert(typeof t.name === 'string' && t.name.length > 0);
    assert(typeof t.category === 'string');
    assert(Number.isInteger(t.defaultPort) && t.defaultPort > 1000);
    assert(typeof t.composeTemplate === 'function');

    const result = t.composeTemplate({name: 'test-' + t.id, port: t.defaultPort + 10, env: {}});
    assert(typeof result.compose === 'string');
    assert(result.compose.includes('services:'));
    assert(result.compose.includes(String(t.defaultPort + 10)));
  }
});

test('Apps catalog service deploys an app with workspace and proxy integration', async () => {
  const calls = [];
  const fakeWorkspace = {
    drafts: async () => [{name: 'n8n', createdAt: new Date().toISOString()}],
    prepareCompose: async (input) => {
      calls.push(['prepareCompose', input]);
      return {draft: 'draft-1234-uuid', revision: 'rev-abc'};
    },
    deployCompose: async (input) => {
      calls.push(['deployCompose', input]);
      return {ok: true};
    }
  };

  const fakeWebsites = {
    quickProxy: async (input) => {
      calls.push(['quickProxy', input]);
      return {id: 'site-uuid', domain: input.domain, upstream: input.upstream};
    }
  };

  const catalog = createAppsCatalog({
    workspace: fakeWorkspace,
    websites: fakeWebsites
  });

  const list = await catalog.list();
  const n8nApp = list.find(a => a.id === 'n8n');
  assert(n8nApp);
  assert.equal(n8nApp.installed, true);

  const ghostApp = list.find(a => a.id === 'ghost');
  assert(ghostApp);
  assert.equal(ghostApp.installed, false);

  const getGhost = await catalog.get('ghost');
  assert(getGhost.suggestedPort >= 1024);

  const deployResult = await catalog.deploy({
    appId: 'ghost',
    name: 'my-blog',
    port: 2368,
    domain: 'blog.example.com',
    confirm: true
  });

  assert.equal(deployResult.ok, true);
  assert.equal(deployResult.name, 'my-blog');
  assert.equal(deployResult.port, 2368);
  assert.equal(deployResult.domain, 'blog.example.com');
  assert(calls.some(c => c[0] === 'prepareCompose' && c[1].name === 'my-blog'));
  assert(calls.some(c => c[0] === 'deployCompose' && c[1].draft === 'draft-1234-uuid'));
  assert(calls.some(c => c[0] === 'quickProxy' && c[1].domain === 'blog.example.com'));
});
