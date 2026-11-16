import {createCoraza} from './coraza.mjs';
import {run} from '../management.mjs';
export function createWebProtection({dataDir,coraza=createCoraza({dataDir}),execute=run}={}){
 async function config(){const c=await coraza.config();return c?{...c,originPort:Number(new URL(c.origin).port||80)}:null;}
 async function status(){const s=await coraza.status();return {...s,ready:s.active&&!!s.configuration,configuration:await config(),consoleURL:null};}
 async function mode(value,revision,log=()=>{}){const c=await config();if(c.mode===value)return;return coraza.policy({mode:value,revision:revision||c.revision},log);}
 async function test(expected){const c=await config();if(expected&&c.mode!==expected)throw Error('Effective Coraza mode does not match requested protection');return coraza.test();}
 async function logs(){const text=await execute('journalctl',['--unit','cyberpross-coraza.service','--no-pager','--output','cat','--lines','80'],{maxBuffer:512*1024});return {output:text};}
 return {config,status,mode,test,logs,reports:async()=>({events:[],geo:{},retained:0})};
}
