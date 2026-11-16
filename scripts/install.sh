#!/bin/bash
set -euo pipefail
umask 077
profile=core
resume=0
automated=0
recovery_file=
for argument in "$@"; do
 case "$argument" in
  --profile=core) profile=core ;;
  --profile=security) profile=security ;;
  --resume) resume=1 ;;
  --config-stdin) automated=1 ;;
  --recovery-file=/*) recovery_file=${argument#--recovery-file=} ;;
  *) echo 'Usage: sudo ./scripts/install.sh [--profile=core|security] [--resume] [--config-stdin --recovery-file=/private/path]'; exit 2 ;;
 esac
done
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
[[ ${EUID} -eq 0 ]] || { echo 'Run this installer with host administrator authorization: sudo ./scripts/install.sh'; exit 1; }
[[ $(uname -s) = Linux ]] || { echo 'This package supports Linux only.'; exit 1; }
command -v systemctl >/dev/null
command -v python3 >/dev/null
command -v flock >/dev/null
[[ -d /run/systemd/system ]] || { echo 'A running systemd host is required.'; exit 1; }
exec 9>/run/lock/server-panel-install.lock
flock -n 9 || { echo 'Another installation is running.'; exit 1; }
if [[ -e /var/lib/server-panel/users.json || -e /etc/systemd/system/server-panel.service ]]; then
 [[ $resume = 1 && -f /var/lib/server-panel/install-incomplete.json ]] || { echo 'Existing installation detected. Use the update installer. For an interrupted installation use --resume; existing accounts are preserved.'; exit 1; }
 systemctl is-active --quiet server-panel.service && { echo 'The panel is active. Use the update installer; no installation changes made.'; exit 1; }
fi
if [[ -f $source_dir/MANIFEST.sha256 ]]; then (cd "$source_dir"; sha256sum --quiet -c MANIFEST.sha256); fi
node_source="$source_dir/runtime/node"
if [[ ! -x $node_source ]]; then node_source=$(command -v node || true); fi
[[ -x $node_source ]] || { echo 'Use the installable release bundle with its matching Linux Node runtime, or install Node.js 24+ first.'; exit 1; }
"$node_source" "$source_dir/scripts/verify-release.mjs" "$source_dir" "$source_dir/RELEASE-PUBLIC.pem"
"$node_source" --input-type=module -e "if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24+ required'); await import('file://'+process.argv[1]+'/src/server.mjs')" "$source_dir" || { echo 'Runtime/native dependency compatibility failed before account setup.'; exit 1; }
"$node_source" "$source_dir/scripts/preflight.mjs" "$profile"
staging=$(mktemp -d /var/tmp/server-panel-install-XXXXXXXX)
trap 'rm -rf -- "$staging"' EXIT
if [[ $resume = 1 && -f /var/lib/server-panel/install-incomplete.json ]]; then
 "$node_source" --input-type=module -e "const fs=await import('node:fs');const r=JSON.parse(fs.readFileSync('/var/lib/server-panel/install-incomplete.json'));if(r.schema!==1||r.profile!==process.argv[1])throw Error('Resume with the original installation profile');" "$profile"
 cp -- /etc/server-panel/environment "$staging/environment"
 source_data=/var/lib/server-panel
else
 if [[ $automated = 1 ]]; then
  [[ -n $recovery_file ]] || { echo 'Automated setup requires a private recovery output path.'; exit 2; }
  "$node_source" "$source_dir/scripts/first-run-from-stdin.mjs" "$staging/data" "$staging/environment" "$recovery_file"
 else
  "$node_source" "$source_dir/scripts/first-run.mjs" "$staging/data" "$staging/environment"
 fi
 source_data="$staging/data"
fi
port=$(sed -n 's/^PANEL_PORT=//p' "$staging/environment")
origin=$(sed -n 's/^PANEL_PUBLIC_URL=//p' "$staging/environment")
# Require completed administrator setup before the service can start.
/bin/bash "$source_dir/scripts/install-service.sh" "$source_dir" "$source_data" "$node_source" "$port" "$origin" 1 "$profile"
printf '\nInstallation complete. Open http://127.0.0.1:%s/ and sign in with the administrator credentials you selected.\n' "$port"
printf 'Installed profile: %s. Optional security services are only prepared with --profile=security.\n' "$profile"
