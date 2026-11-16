import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {identityStore} from '../src/identity.mjs';

test('bootstrap once, force password change, reset once and revoke every session',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sentinel-identity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=await identityStore(dir),c=store.initialCredentials;assert.equal(c.username,'admin');assert.ok(c.password.length>=32);const signed=await store.login('admin',c.password);assert.equal(store.resolve(signed.token).mustChangePassword,true);
 await store.changePassword(signed.user.id,c.password,'my new administrator password');assert.equal(store.resolve(signed.token),null);const again=await store.login('admin','my new administrator password');assert.equal(again.user.mustChangePassword,false);
 const reset=await store.resetPassword('admin',c.recoveryCode,'my recovered administrator password');assert.ok(reset.recoveryCode);assert.equal(store.resolve(again.token),null);await assert.rejects(store.resetPassword('admin',c.recoveryCode,'a replayed administrator password'),/Invalid or expired/);
 await assert.rejects(store.login('admin','my new administrator password'),/Invalid credentials/);assert.ok((await store.login('admin','my recovered administrator password')).token);
 const reload=await identityStore(dir);assert.equal(reload.initialCredentials,null);assert.ok((await reload.login('admin','my recovered administrator password')).token);await assert.rejects(reload.disable(signed.user.id),/at least one/);
 const raw=await fs.readFile(path.join(dir,'users.json'),'utf8');assert.ok(!raw.includes(c.password));assert.ok(!raw.includes(c.recoveryCode));assert.ok(!raw.includes(reset.recoveryCode));
});

test('Retired directory accounts cannot be created or acquire local password authentication',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'panel-retired-identity-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=await identityStore(dir);await assert.rejects(store.create({username:'directory-user',role:'admin',authSource:'ldap',password:'ValidPassword9!'}),/valid username, role and login source/);assert.equal(store.directoryLogin,undefined);});
