import {installOperationAgent} from '../src/install-operation-agent.mjs';
if(!process.argv.includes('--apply')){console.log('Plan: provision a private agent credential, install the operation service and panel service override, and verify socket readiness. Existing network, tunnel, VPN, Docker and website configuration is retained.');process.exit(0);}
if(process.getuid()!==0)throw Error('Administrator authorization required');
await installOperationAgent();console.log('Privileged operation agent is ready. Activate the panel override during the reviewed application deployment.');
