import {createProtectionEdge} from './protection-edge.mjs';
const dataDir=process.argv[2];if(process.getuid()!==0||!/^\/[A-Za-z0-9_./-]+$/.test(dataDir||''))throw Error('Invalid protection entry context');const edge=createProtectionEdge({dataDir});await edge.apply('off');
