import {waitForPanel} from '../src/health-check.mjs';
await waitForPanel({port:Number(process.argv[2]),root:process.argv[3]});
console.log('Panel startup and build identity verified.');
