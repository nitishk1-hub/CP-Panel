import test from 'node:test';
import assert from 'node:assert/strict';
import {assessHost} from '../src/install-preflight.mjs';
const commands=Object.fromEntries(['python3','flock','systemctl','install','cp','mv','stat','find','sha256sum','curl','apt-get','apt-cache','dpkg-deb','dpkg-architecture','ip'].map(c=>[c,true]));
const host={platform:'linux',arch:'x64',release:{ID:'ubuntu',VERSION_ID:'24.04'},systemd:true,commands,freeBytes:10*1024**3,memoryBytes:8*1024**3};
test('Installation profile rejects unsupported hosts and missing prerequisites before mutation',()=>{assert(assessHost(host).ready);for(const change of [{arch:'arm64'},{platform:'darwin'},{systemd:false},{release:{ID:'fedora',VERSION_ID:'44'}},{freeBytes:0},{commands:{}}])assert.equal(assessHost({...host,...change}).ready,false);assert.throws(()=>assessHost({...host,profile:'unknown'}));});
test('Core profile does not require security package tooling or build resources',()=>{assert(assessHost({...host,commands:{...commands,'apt-get':false},memoryBytes:2*1024**3}).ready);assert.equal(assessHost({...host,profile:'security',memoryBytes:2*1024**3}).ready,false);});
