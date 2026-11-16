import {automatedSetup} from '../src/automated-setup.mjs';
if(process.stdin.isTTY)throw Error('Supply setup JSON through stdin; credentials must not be command arguments');
const [dataDir,environmentFile,recoveryFile]=process.argv.slice(2);if(!dataDir||!environmentFile||!recoveryFile)throw Error('Provide staged data, environment and private recovery-output paths');
let bytes=0;const chunks=[];for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>32768)throw Error('Setup input exceeds 32 KiB');chunks.push(chunk);}
let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Invalid setup JSON');}
await automatedSetup({input,dataDir,environmentFile,recoveryFile});
console.log('Administrator setup completed; the recovery code was written privately. No credentials were printed.');
