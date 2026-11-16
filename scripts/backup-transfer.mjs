import {exportPanelBackup,restorePanelBackup} from '../src/backup-transfer.mjs';
const [operation,first,second,third]=process.argv.slice(2);
let result;
if(operation==='export'&&first&&second)result=await exportPanelBackup({dataDir:process.env.PANEL_DATA_DIR||'/var/lib/server-panel',archiveDestination:first,keyDestination:second});
else if(operation==='restore'&&first&&second&&third)result=await restorePanelBackup({archive:first,keyFile:second,destination:third});
else throw Error('Usage: backup-transfer.mjs export ARCHIVE KEY_FILE | restore ARCHIVE KEY_FILE NEW_DIRECTORY');
console.log(JSON.stringify(result,null,2));
