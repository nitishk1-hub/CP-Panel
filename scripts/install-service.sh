#!/bin/bash
set -euo pipefail
# Run once with host administrator authorization. Never accept a shell command.
if [[ ${EUID} -ne 0 ]]; then echo 'Host administrator authorization is required.' >&2; exit 1; fi
source_dir=${1:?Source directory is required}
source_data=${2:?Existing panel data directory is required}
node_source=${3:?Node executable is required}
panel_port=${4:-8787}
public_origin=${5:-}
require_setup=${6:-1}
profile=${7:-core}
start_mode=${8:-direct}
[[ $start_mode = direct || $start_mode = deferred ]] || exit 2
[[ $profile = core || $profile = security ]] || { echo 'Choose core or security profile'; exit 2; }
exec 8>/run/lock/server-panel-transition.lock
flock -n 8 || { echo 'Another panel installation/update is running.'; exit 1; }
[[ $require_setup = 0 || $require_setup = 1 ]] || exit 2
[[ $source_dir = /* && $source_data = /* && $node_source = /* && $panel_port =~ ^[0-9]+$ ]] || exit 2
((panel_port >= 1024 && panel_port <= 65535)) || exit 2
[[ -z $public_origin || $public_origin =~ ^https://[A-Za-z0-9.:-]+/?$ || $public_origin =~ ^https://\[[a-fA-F0-9:]+\](:[0-9]+)?/?$ ]] || { echo 'Invalid public HTTPS origin'; exit 2; }
[[ -f $source_dir/src/server.mjs && -f $source_data/users.json && -x $node_source ]] || { echo 'Panel source, existing accounts or Node executable is missing'; exit 2; }
command -v systemctl >/dev/null
systemctl show --property=Version --value >/dev/null
# Reject external source/data symlinks before copying executable code or private data.
python3 - "$source_dir" "$source_data" <<'PY'
import os,sys
for base in sys.argv[1:]:
    base=os.path.realpath(base)
    directories=['src','public','scripts','docs','tests','web','node_modules'] if base==os.path.realpath(sys.argv[1]) else ['.']
    for name in directories:
        for parent,dirs,files in os.walk(os.path.join(base,name),followlinks=False):
            for item in dirs+files:
                p=os.path.join(parent,item)
                if os.path.islink(p) and (os.path.isabs(os.readlink(p)) or os.path.commonpath([base,os.path.realpath(p)])!=base):
                    raise SystemExit('External symlink refused: '+p)
PY
if [[ -e /etc/systemd/system/server-panel.service ]]; then
    grep -qx 'Description=Server Panel privileged server management' /etc/systemd/system/server-panel.service || { echo 'A different service already uses server-panel.service; it was preserved.'; exit 2; }
fi
for target in /opt/server-panel /opt/server-panel/bin /opt/server-panel/app /var/lib/server-panel /etc/server-panel; do
    if [[ -e $target || -L $target ]]; then
        [[ -d $target && ! -L $target && $(stat -c %u "$target") = 0 ]] || { echo "Unsafe existing installation path: $target"; exit 2; }
    fi
done
if systemctl is-active --quiet server-panel.service; then echo 'The privileged panel service is already active. No replacement was made.'; exit 0; fi
"$node_source" "$source_dir/scripts/preflight.mjs" "$profile"
"$node_source" "$source_dir/scripts/verify-release.mjs" "$source_dir" "$source_dir/RELEASE-PUBLIC.pem"
install -d -o root -g root -m 0755 /opt/server-panel /opt/server-panel/bin /etc/server-panel
install -d -o root -g root -m 0700 /var/lib/server-panel
config_tmp=$(mktemp /etc/server-panel/.environment-XXXXXXXX)
printf 'PANEL_PORT=%s\nPANEL_DATA_DIR=/var/lib/server-panel\nPANEL_FILE_ROOT=/\n' "$panel_port" > "$config_tmp"
if [[ -n $public_origin ]]; then printf 'PANEL_PUBLIC_URL=%s\n' "$public_origin" >> "$config_tmp"; fi
printf 'PANEL_REQUIRE_SETUP=%s\nPANEL_INSTALL_PROFILE=%s\n' "$require_setup" "$profile" >> "$config_tmp"
chmod 0600 "$config_tmp"
mv "$config_tmp" /etc/server-panel/environment
printf '{"schema":1,"profile":"%s"}\n' "$profile" > /var/lib/server-panel/install-incomplete.json
chmod 0600 /var/lib/server-panel/install-incomplete.json
if [[ -f /var/lib/server-panel/users.json ]]; then
    echo 'Existing service account data found; preserving it.'
else
    cp -a -- "$source_data/." /var/lib/server-panel/
    chown -R root:root /var/lib/server-panel
    chmod 0700 /var/lib/server-panel
    find /var/lib/server-panel -type f -exec chmod go-rwx {} +
fi
staging=$(mktemp -d /opt/server-panel/.app-XXXXXXXX)
trap 'rm -rf -- "$staging"' EXIT
for entry in src public scripts docs tests web node_modules package.json package-lock.json LICENSE README.md; do cp -a -- "$source_dir/$entry" "$staging/"; done
for metadata in BUILD.json SECURITY-AUDIT.json RELEASE-MANIFEST.json RELEASE-MANIFEST.sig RELEASE-PUBLIC.pem; do if [[ -f $source_dir/$metadata ]]; then cp -- "$source_dir/$metadata" "$staging/$metadata"; fi; done
chown -R root:root "$staging"
chmod -R go-w "$staging"
install -o root -g root -m 0755 "$node_source" /opt/server-panel/bin/node
if [[ -f $source_dir/scripts/LICENSE.node ]]; then install -o root -g root -m 0644 "$source_dir/scripts/LICENSE.node" /opt/server-panel/bin/LICENSE.node; fi
# The initial authorized installation pins the bundled local release identity.
[[ -f "$staging/RELEASE-PUBLIC.pem" ]] || { echo 'Build the signed release before installing.'; exit 2; }
"$node_source" "$staging/scripts/verify-release.mjs" "$staging" "$staging/RELEASE-PUBLIC.pem"
if [[ -e /etc/server-panel/release-public.pem || -L /etc/server-panel/release-public.pem ]]; then
 [[ -f /etc/server-panel/release-public.pem && ! -L /etc/server-panel/release-public.pem ]] || exit 2
 "$node_source" "$staging/scripts/verify-release.mjs" "$staging" /etc/server-panel/release-public.pem
else
 install -o root -g root -m 0644 "$staging/RELEASE-PUBLIC.pem" /etc/server-panel/release-public.pem
fi
# Verify native dependencies before enabling anything.
/opt/server-panel/bin/node --input-type=module -e "await import('file://'+process.argv[1]+'/src/server.mjs')" "$staging"
if [[ -d /opt/server-panel/app ]]; then mv /opt/server-panel/app "/opt/server-panel/app.previous.$(date +%s)"; fi
mv "$staging" /opt/server-panel/app
trap - EXIT
cat > /etc/systemd/system/server-panel.service <<'UNIT'
[Unit]
Description=Server Panel privileged server management
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=60
StartLimitBurst=10
[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/server-panel/app
EnvironmentFile=/etc/server-panel/environment
ExecStart=/opt/server-panel/bin/node /opt/server-panel/app/src/server.mjs
Restart=on-failure
RestartSec=3
UMask=0077
# Full administrator terminal supports sudo, su and SSH sessions.
NoNewPrivileges=false
KillMode=control-group
TimeoutStopSec=15
[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 /etc/systemd/system/server-panel.service
systemctl daemon-reload
# Optional provisioning is explicit; its failure leaves a resumable marker.
if [[ $profile = security ]]; then
 /opt/server-panel/bin/node /opt/server-panel/app/scripts/prepare-protection.mjs /var/lib/server-panel
fi
/opt/server-panel/bin/node /opt/server-panel/app/scripts/setup-operation-agent.mjs --apply
systemctl enable server-panel.service
if [[ $start_mode = direct ]]; then
 systemctl start server-panel.service
 /opt/server-panel/bin/node /opt/server-panel/app/scripts/wait-ready.mjs "$panel_port" /opt/server-panel/app
 rm -- /var/lib/server-panel/install-incomplete.json
 printf '\nAdministrative service is ready. Accounts were preserved.\n'
else
 # Browser-based development handover must first release its existing listener.
 systemd-run --unit="server-panel-first-start-$$" --on-active=8s --collect /opt/server-panel/bin/node /opt/server-panel/app/scripts/finish-install.mjs "$panel_port"
 printf '\nAdministrative service staged. Confirm its readiness after the development listener closes.\n'
fi
