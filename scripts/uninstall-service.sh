#!/bin/bash
set -euo pipefail
umask 077
if [[ ${1:-} != --apply ]]; then
 echo 'Plan: stop and disable the panel and its owned operation agent, retaining their unit definitions and all private data.'
 echo 'All application/runtime files, account data, backups, optional security services and user workloads are preserved.'
 echo 'Run with --apply only in an authorized maintenance window. Pending tasks/network transactions block removal.'
 exit 0
fi
[[ ${EUID} -eq 0 ]] || { echo 'Host administrator authorization is required.'; exit 1; }
exec 8>/run/lock/server-panel-transition.lock
flock -n 8 || { echo 'Another panel installation/update is running.'; exit 1; }
unit=/etc/systemd/system/server-panel.service
[[ -f $unit && ! -L $unit && $(stat -c %u "$unit") = 0 ]] || { echo 'Expected protected service unit is unavailable; no changes made.'; exit 1; }
grep -qx 'Description=Server Panel privileged server management' "$unit" || { echo 'Service ownership does not match; preserved.'; exit 1; }
agent_unit=/etc/systemd/system/server-panel-agent.service
if [[ -e $agent_unit || -L $agent_unit ]]; then
 [[ -f $agent_unit && ! -L $agent_unit && $(stat -c %u "$agent_unit") = 0 ]] || { echo 'Unrecognised operation agent unit; preserved.'; exit 1; }
 grep -qx 'Description=CyberPross privileged operation agent' "$agent_unit" || { echo 'Operation agent ownership does not match; preserved.'; exit 1; }
fi
[[ ! -e /var/lib/server-panel/maintenance.json ]] || { echo 'Maintenance is already in progress.'; exit 1; }
/opt/server-panel/bin/node --input-type=module -e "const fs=await import('node:fs');let t;try{t=JSON.parse(fs.readFileSync('/var/lib/server-panel/tasks.json'));}catch(e){if(e.code!=='ENOENT')throw e;}if(t?.jobs?.some(j=>['queued','running'].includes(j.state)&&!j.external))throw Error('Wait for active tasks to finish');"
/opt/server-panel/bin/node --input-type=module <<'OPERATIONS_IDLE'
import fs from 'node:fs/promises';
for(const [directory,states]of [['/var/lib/server-panel/operations',['queued','running']],['/var/lib/server-panel/operations/transactions',null]]){
 for(const file of await fs.readdir(directory).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))if(/^[a-f0-9-]{36}\.json$/.test(file)){const item=JSON.parse(await fs.readFile(directory+'/'+file,'utf8'));if(states?states.includes(item.state):!['committed','rolled-back','aborted'].includes(item.state))throw Error('Resolve active privileged operations before removal');}
}
OPERATIONS_IDLE
[[ ! -e /var/lib/server-panel/network-guard/pending/pending && ! -e /var/lib/server-panel/network-guard/pending/rolling-back ]] || { echo 'Resolve pending network policy first.'; exit 1; }
if [[ -d /var/lib/server-panel/wireguard/transactions ]] && [[ -n $(find /var/lib/server-panel/wireguard/transactions -maxdepth 2 -type f \( -name pending -o -name rolling-back \) -print -quit) ]]; then echo 'Resolve pending VPN changes first.'; exit 1; fi
(set -o noclobber; printf '{"operation":"remove-core-service"}\n' > /var/lib/server-panel/maintenance.json)
trap 'rm -f -- /var/lib/server-panel/maintenance.json' EXIT
install -d -o root -g root -m 0755 /etc/server-panel
cp -p -- "$unit" "/etc/server-panel/server-panel.service.removed.$(date +%s).$$"
systemctl disable --now server-panel.service
if [[ -f $agent_unit ]]; then
 cp -p -- "$agent_unit" "/etc/server-panel/server-panel-agent.service.removed.$(date +%s).$$"
 systemctl disable --now server-panel-agent.service
 rm -- "$agent_unit"
fi
operations_drop=/etc/systemd/system/server-panel.service.d/operations.conf
if [[ -f $operations_drop && ! -L $operations_drop ]] && grep -qx 'Environment=PANEL_AGENT_SOCKET=/run/server-panel-agent/control.sock' "$operations_drop"; then
 cp -p -- "$operations_drop" "/etc/server-panel/operations.conf.removed.$(date +%s).$$"
 rm -- "$operations_drop"
fi
rm -- "$unit"
systemctl daemon-reload
echo 'Core panel supervision removed. Account data, installed code/runtime, optional services and user workloads were preserved.'
