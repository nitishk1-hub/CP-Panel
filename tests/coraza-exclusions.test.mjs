import test from 'node:test';
import assert from 'node:assert/strict';
import {corazaConfiguration} from '../src/security-center/coraza.mjs';

test('Coraza configuration renders domain rule exclusions with SecRuleRemoveById', () => {
  const caddyfile = corazaConfiguration({
    origin: 'http://127.0.0.2',
    port: 19180,
    mode: 'block',
    domains: [
      {
        domain: 'n8n.cyberpross.cc',
        mode: 'block',
        exclusions: ['942100', '920272']
      }
    ]
  });

  assert(caddyfile.includes('host n8n.cyberpross.cc'));
  assert(caddyfile.includes('SecRuleRemoveById 942100'));
  assert(caddyfile.includes('SecRuleRemoveById 920272'));
});
