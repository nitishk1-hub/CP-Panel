import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApt, handleGit, handleSecurityInspect, handleNetworkInspect, handleDockerBuild, handleTestRunner} from '../src/ai-operations.mjs';

test('handleApt validates package names and actions', async () => {
  // Test search
  const searchRes = await handleApt({action: 'search', query: 'curl'});
  assert.equal(searchRes.ok, true);
  assert.equal(searchRes.action, 'search');
  assert(Array.isArray(searchRes.results));

  // Test upgradable
  const upRes = await handleApt({action: 'upgradable'});
  assert.equal(upRes.ok, true);
  assert.equal(typeof upRes.count, 'number');

  // Test info
  const infoRes = await handleApt({action: 'info', packages: ['curl']});
  assert.equal(infoRes.ok, true);
  assert(infoRes.details.includes('Package: curl'));

  // Test simulate
  const simRes = await handleApt({action: 'simulate', packages: ['curl']});
  assert.equal(simRes.ok, true);
  assert(simRes.simulation.length > 0);

  // Test mutation without confirm fails
  await assert.rejects(handleApt({action: 'install', packages: ['curl']}), /requires explicit confirm: true/);
  await assert.rejects(handleApt({action: 'update'}), /requires explicit confirm: true/);

  // Test invalid package name rejected
  await assert.rejects(handleApt({action: 'info', packages: ['curl; rm -rf /']}), /Invalid Debian package name/);
});

test('handleGit validates actions and executes on local checkout', async () => {
  // Status check on current project
  const statusRes = await handleGit({action: 'status', directory: process.cwd()});
  assert.equal(statusRes.ok, true);

  // Log check
  const logRes = await handleGit({action: 'log', directory: process.cwd()});
  assert.equal(logRes.ok, true);
  assert(logRes.commits.length > 0);

  // Diff check
  const diffRes = await handleGit({action: 'diff', directory: process.cwd()});
  assert.equal(diffRes.ok, true);

  // Branch check
  const branchRes = await handleGit({action: 'branch', directory: process.cwd()});
  assert.equal(branchRes.ok, true);
  assert(branchRes.branches.length > 0);
  assert(branchRes.branches.some(b => b.includes('main') || b.includes('HEAD') || b.includes('master')));

  // Non-git directory check returns descriptive guidance
  const nonGitRes = await handleGit({action: 'status', directory: '/tmp'});
  assert.equal(nonGitRes.ok, false);
  assert.equal(nonGitRes.isGitRepo, false);
  assert(nonGitRes.message.includes('not a Git repository'));

  // Mutating action without confirm fails
  await assert.rejects(handleGit({action: 'clone', repo: 'https://github.com/test/repo.git'}), /requires explicit confirm: true/);
  await assert.rejects(handleGit({action: 'pull', directory: process.cwd()}), /requires explicit confirm: true/);
});

test('handleSecurityInspect returns structured security state', async () => {
  const res = await handleSecurityInspect({target: 'all'});
  assert(res.checkedAt);
  assert(res.coraza);
  assert.equal(res.coraza.listeningPort, 19180);
  assert(res.crowdsec);
  assert.equal(res.crowdsec.listeningPort, 19580);
  assert(Array.isArray(res.crowdsec.bouncers));
});

test('handleNetworkInspect returns listening ports and firewall', async () => {
  const res = await handleNetworkInspect({target: 'all'});
  assert(res.checkedAt);
  assert(Array.isArray(res.listeningPorts));
  assert(res.firewall);
  assert(res.cloudflareTunnel);
});

test('handleDockerBuild and handleTestRunner require confirmation and valid inputs', async () => {
  await assert.rejects(handleDockerBuild({directory: process.cwd(), tag: 'test:v1'}), /requires explicit confirm: true/);
  await assert.rejects(handleTestRunner({directory: process.cwd(), runtime: 'node'}), /requires explicit confirm: true/);
  await assert.rejects(handleDockerBuild({directory: '/nonexistent', tag: 'test:v1', confirm: true}), /Dockerfile not found/);
});
