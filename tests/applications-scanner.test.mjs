import test from 'node:test';
import assert from 'node:assert/strict';
import { scanApplications, getApplicationConfig, maskSecrets } from '../src/applications.mjs';

test('maskSecrets redacts sensitive credentials and retains keys', () => {
  const sampleEnv = `
# Sample Configuration
OPENALGO_API_KEY=sk_live_983749823749823749823
DATABASE_PASSWORD="supersecretpassword123"
REDIS_TOKEN='my_secret_token'
PORT=5000
DEBUG=False
`;
  const masked = maskSecrets(sampleEnv);
  assert.match(masked, /OPENALGO_API_KEY=sk_••••••••23/);
  assert.match(masked, /DATABASE_PASSWORD="sup••••••••23"/);
  assert.match(masked, /REDIS_TOKEN='my_••••••••en'/);
  assert.match(masked, /PORT=5000/);
  assert.match(masked, /DEBUG=False/);
});

test('scanApplications discovers host applications and returns structured metadata', async () => {
  const res = await scanApplications();
  assert.equal(res.ok, true);
  assert.ok(typeof res.summary.total === 'number');
  assert.ok(Array.isArray(res.applications));
  assert.ok(res.applications.length > 0);

  // Check OpenAlgo application detection
  const openalgo = res.applications.find(a => a.id === 'openalgo');
  if (openalgo) {
    assert.equal(openalgo.type, 'hybrid');
    assert.equal(openalgo.systemdUnit, 'openalgo.service');
    assert.ok(openalgo.ports.includes(5000));
    assert.ok(openalgo.configs.length > 0);
    assert.ok(openalgo.stack.category.includes('Hybrid'));
  }

  // Check Server Panel detection
  const panel = res.applications.find(a => a.id === 'server-panel');
  if (panel) {
    assert.equal(panel.type, 'native');
    assert.equal(panel.systemdUnit, 'server-panel.service');
    assert.ok(panel.ports.includes(8787));
  }
});
