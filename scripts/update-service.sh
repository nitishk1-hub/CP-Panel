#!/bin/bash
set -euo pipefail
[[ ${EUID} -eq 0 ]] || { echo 'Host administrator authorization is required to update the protected service.' >&2; exit 1; }
source_dir=${1:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)}
exec 8>/run/lock/server-panel-transition.lock
flock -n 8 || { echo 'Another panel installation/update is running.'; exit 1; }
python3 - <<'TASK_CHECK'
import json,os
p='/var/lib/server-panel/tasks.json'
if os.path.exists(p):
 with open(p) as f: history=json.load(f)
 if any(j.get('state') in ('queued','running') and not j.get('external') for j in history.get('jobs',[])):
  raise SystemExit('Wait for active panel tasks to finish before updating the service. Their progress is available in Tasks.')
import glob
for file in glob.glob('/var/lib/server-panel/operations/*.json'):
 with open(file) as f: operation=json.load(f)
 if operation.get('state') in ('queued','running'):
  raise SystemExit('Wait for active privileged operations before updating.')
for file in glob.glob('/var/lib/server-panel/operations/transactions/*.json'):
 with open(file) as f: transaction=json.load(f)
 if transaction.get('state') not in ('committed','rolled-back','aborted'):
  raise SystemExit('Resolve privileged transactions before updating.')
TASK_CHECK
if [[ -e /var/lib/server-panel/network-guard/pending/pending || -e /var/lib/server-panel/network-guard/pending/rolling-back ]]; then
 echo 'Confirm or roll back the pending network policy before updating the panel.' >&2
 exit 1
fi
if [[ -d /var/lib/server-panel/wireguard/transactions ]] && [[ -n $(find /var/lib/server-panel/wireguard/transactions -maxdepth 2 -type f \( -name pending -o -name rolling-back \) -print -quit) ]]; then
 echo 'Confirm or roll back the pending VPN transaction before updating the panel.' >&2
 exit 1
fi
[[ $source_dir = /* && -f $source_dir/src/server.mjs && -f $source_dir/package-lock.json ]] || exit 2
grep -qx 'Description=Server Panel privileged server management' /etc/systemd/system/server-panel.service || { echo 'The expected panel service was not found.'; exit 2; }
for dir in /opt/server-panel /opt/server-panel/app; do
 [[ -d $dir && ! -L $dir && $(stat -c %u "$dir") = 0 ]] || { echo 'Unsafe installed application path'; exit 2; }
done
python3 - "$source_dir" <<'PY'
import os,sys
base=os.path.realpath(sys.argv[1])
for name in ['src','public','scripts','docs','tests','web','node_modules']:
 for parent,dirs,files in os.walk(os.path.join(base,name),followlinks=False):
  for item in dirs+files:
   p=os.path.join(parent,item)
   if os.path.islink(p) and (os.path.isabs(os.readlink(p)) or os.path.commonpath([base,os.path.realpath(p)])!=base):
    raise SystemExit('Unsafe source symlink: '+p)
PY
staging=$(mktemp -d /opt/server-panel/.update-XXXXXXXX)
trap 'rm -rf -- "$staging"' EXIT
for entry in src public scripts docs tests web node_modules package.json package-lock.json LICENSE README.md; do cp -a -- "$source_dir/$entry" "$staging/"; done
for metadata in BUILD.json SECURITY-AUDIT.json RELEASE-MANIFEST.json RELEASE-MANIFEST.sig RELEASE-PUBLIC.pem; do if [[ -f $source_dir/$metadata ]]; then cp -- "$source_dir/$metadata" "$staging/$metadata"; fi; done
chown -R root:root "$staging"
chmod -R go-w "$staging"
# Verify against the protected signing key; first authorized upgrade pins the local release identity.
[[ -f "$staging/RELEASE-MANIFEST.json" && -f "$staging/RELEASE-PUBLIC.pem" ]] || { echo 'A signed release build is required.'; exit 2; }
trust_key=/etc/server-panel/release-public.pem
if [[ -e $trust_key || -L $trust_key ]]; then
 [[ -f $trust_key && ! -L $trust_key && $(stat -c %u "$trust_key") = 0 ]] || exit 2
else
 trust_key="$staging/RELEASE-PUBLIC.pem"
fi
validator=/opt/server-panel/app/scripts/verify-release.mjs
[[ -f $validator && ! -L $validator ]] || { echo 'A protected release verifier is required for updates. Review the legacy bootstrap upgrade separately.'; exit 2; }
candidate_node="$source_dir/runtime/node"
[[ -x $candidate_node && ! -L $candidate_node ]] || candidate_node=/opt/server-panel/bin/node
# The old trusted runtime and verifier authenticate the candidate binary as data.
# Never execute an unauthenticated candidate runtime or load its verifier first.
/opt/server-panel/bin/node --input-type=module -e "const fs=await import('node:fs/promises');const {verifyRelease}=await import('/opt/server-panel/app/src/release-integrity.mjs');await verifyRelease(process.argv[1],await fs.readFile(process.argv[2]),{node:process.argv[3]});" "$staging" "$trust_key" "$candidate_node"
install -o root -g root -m 0755 "$candidate_node" "$staging/.candidate-node"
/opt/server-panel/bin/node --input-type=module -e "const fs=await import('node:fs/promises');const {verifyRelease}=await import('/opt/server-panel/app/src/release-integrity.mjs');await verifyRelease(process.argv[1],await fs.readFile(process.argv[2]),{node:process.argv[3]});" "$staging" "$trust_key" "$staging/.candidate-node"
"$staging/.candidate-node" --input-type=module -e "if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24+ required');await import('file://'+process.argv[1]+'/src/server.mjs');" "$staging"

if [[ ! -e /etc/server-panel/release-public.pem ]]; then install -o root -g root -m 0644 "$staging/RELEASE-PUBLIC.pem" /etc/server-panel/release-public.pem; fi
# Enforce completed account setup on upgrades without changing existing credentials.
/opt/server-panel/bin/node --input-type=module -e "const fs=await import('node:fs/promises');const u=JSON.parse(await fs.readFile('/var/lib/server-panel/users.json','utf8'));if(!Array.isArray(u)||!u.some(a=>a.enabled&&a.role==='admin'&&(a.authSource||'local')==='local'&&!a.mustChangePassword))throw Error('Complete administrator password setup before upgrading production mode');"
[[ -f /etc/server-panel/environment && ! -L /etc/server-panel/environment && $(stat -c %u /etc/server-panel/environment) = 0 ]] || { echo 'Unsafe service environment file'; exit 2; }
if grep -q '^PANEL_REQUIRE_SETUP=' /etc/server-panel/environment; then sed -i 's/^PANEL_REQUIRE_SETUP=.*/PANEL_REQUIRE_SETUP=1/' /etc/server-panel/environment; else printf '\nPANEL_REQUIRE_SETUP=1\n' >> /etc/server-panel/environment; fi
chmod 0600 /etc/server-panel/environment
# Check rollback/snapshot capacity before the service is stopped.
/opt/server-panel/bin/node --input-type=module -e "const fs=await import('node:fs/promises');let bytes=0,count=0;async function walk(p){for(const e of await fs.readdir(p,{withFileTypes:true})){if(++count>200000)throw Error('State file count exceeds the update preflight limit');const f=p+'/'+e.name;if(e.isDirectory())await walk(f);else bytes+=(await fs.lstat(f)).size;}}await walk('/var/lib/server-panel');const data=await fs.statfs('/var/lib'),code=await fs.statfs('/opt/server-panel'),runtime=await fs.stat('/opt/server-panel/bin/node');if(data.bavail*data.bsize<bytes*1.25+67108864||code.bavail*code.bsize<runtime.size+67108864)throw Error('Insufficient free space for private state/runtime rollback snapshots');"
backup="/opt/server-panel/app.previous.$(date +%s).$$"
runtime_backup="/opt/server-panel/bin/node.previous.$(date +%s).$$"
maintenance=/var/lib/server-panel/maintenance.json
[[ ! -e $maintenance && ! -L $maintenance ]] || { echo 'Maintenance marker already exists. Inspect the interrupted update before retrying.'; exit 1; }
# Exclusive creation; the running panel refuses new mutations while this marker exists.
(set -o noclobber; printf '{"operation":"update"}\n' > "$maintenance")
chmod 0600 "$maintenance"
app_swapped=0
runtime_swapped=0
stopped=0
committed=0
agent_recovery=
agent_snapshot=
finish_update() {
 status=$?
 trap - EXIT INT TERM
 if [[ $committed = 0 ]]; then
  if [[ $app_swapped = 1 ]]; then
   mv /opt/server-panel/app "/opt/server-panel/app.failed.$(date +%s).$$"
   mv "$backup" /opt/server-panel/app
  elif [[ -d $backup && ! -d /opt/server-panel/app ]]; then
   mv "$backup" /opt/server-panel/app
  fi
  if [[ $runtime_swapped = 1 ]]; then mv "$runtime_backup" /opt/server-panel/bin/node; fi
  if [[ -n $agent_recovery && -f $agent_snapshot ]]; then /opt/server-panel/bin/node "$agent_recovery" restore "$agent_snapshot" || status=1; fi
  if [[ $stopped = 1 ]]; then systemctl restart server-panel.service || status=1; fi
 fi
 rm -f -- "$maintenance"
 [[ -z ${staging:-} || ! -d $staging ]] || rm -rf -- "$staging"
 exit "$status"
}
trap finish_update EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Recheck work after maintenance is visible, and again after stopping the old service.
python3 - <<'TASK_RECHECK'
import json,os
p='/var/lib/server-panel/tasks.json'
if os.path.exists(p):
 with open(p) as f: history=json.load(f)
 if any(j.get('state') in ('queued','running') and not j.get('external') for j in history.get('jobs',[])):
  raise SystemExit('Active tasks remain. Wait for completion before updating.')
import glob
for file in glob.glob('/var/lib/server-panel/operations/*.json'):
 with open(file) as f: operation=json.load(f)
 if operation.get('state') in ('queued','running'):
  raise SystemExit('Wait for active privileged operations before updating.')
for file in glob.glob('/var/lib/server-panel/operations/transactions/*.json'):
 with open(file) as f: transaction=json.load(f)
 if transaction.get('state') not in ('committed','rolled-back','aborted'):
  raise SystemExit('Resolve privileged transactions before updating.')
TASK_RECHECK
[[ ! -e /var/lib/server-panel/network-guard/pending/pending && ! -e /var/lib/server-panel/network-guard/pending/rolling-back ]] || { echo 'Pending network policy; update stopped.'; exit 1; }
if [[ -d /var/lib/server-panel/wireguard/transactions ]] && [[ -n $(find /var/lib/server-panel/wireguard/transactions -maxdepth 2 -type f \( -name pending -o -name rolling-back \) -print -quit) ]]; then echo 'Pending VPN transaction; update stopped.'; exit 1; fi
systemctl stop server-panel.service
stopped=1
# Preserve coherent panel state for manual recovery. Schema migrations remain a separate gate.
state_backup="/var/lib/server-panel-update-backup.$(date +%s).$$"
install -d -o root -g root -m 0700 "$state_backup"
cp -a /var/lib/server-panel/. "$state_backup/"
if [[ -f $staging/scripts/operation-agent-state.mjs ]]; then
 agent_recovery="$state_backup/operation-agent-recovery.mjs"
 agent_snapshot="$state_backup/operation-agent-state.json"
 cp -- "$staging/scripts/operation-agent-state.mjs" "$agent_recovery"
 chmod 0600 "$agent_recovery"
 /opt/server-panel/bin/node "$agent_recovery" snapshot "$agent_snapshot"
fi
rm -f -- "$state_backup/maintenance.json"
cp -p /opt/server-panel/bin/node "$runtime_backup"
mv /opt/server-panel/app "$backup"
mv "$staging/.candidate-node" /opt/server-panel/bin/node.new
mv /opt/server-panel/bin/node.new /opt/server-panel/bin/node
runtime_swapped=1
mv "$staging" /opt/server-panel/app
app_swapped=1
staging=''
if [[ -f /opt/server-panel/app/scripts/setup-operation-agent.mjs ]]; then /opt/server-panel/bin/node /opt/server-panel/app/scripts/setup-operation-agent.mjs --apply; fi
systemctl restart server-panel.service
port=$(sed -n 's/^PANEL_PORT=//p' /etc/server-panel/environment)
/opt/server-panel/bin/node /opt/server-panel/app/scripts/wait-ready.mjs "$port" /opt/server-panel/app
committed=1
echo 'Updated application and runtime; startup/build identity verified. Previous application, runtime and state snapshot retained.'
