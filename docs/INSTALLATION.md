# Installation and first access

These instructions describe the workspace candidate. They do not authorize updating an existing production installation. Use only a reviewed, authenticated archive built from the candidate after qualification.

## Candidate prerequisites

The installer targets x86-64 Ubuntu 24.04 and Debian 12/13 on a running systemd host. It rejects other distro/CPU combinations before account setup. These are candidate targets, not certified compatibility claims. Core setup needs Node 24 (bundled in the archive), Python 3, flock, curl and ordinary Linux file utilities, at least 1 GiB RAM and 1 GiB free space. The security profile needs APT/dpkg tooling including dpkg-architecture, iproute2, at least 4 GiB RAM and 6 GiB free space for builds/downloads. Allow additional space for actual workloads and event retention.

Verify the archive checksum and independently trusted publisher fingerprint before extracting. The installer verifies the signed application/runtime and native imports. A source checkout's old signature becomes invalid after edits; build a distinct candidate archive before installing it.

Run the read-only preflight with the bundled runtime:

```sh
./runtime/node scripts/preflight.mjs core
```

## Core installation

In the extracted archive run:

```sh
sudo ./scripts/install.sh --profile=core
```

Choose administrator username/password, confirm the password, select an unused local port and optionally enter an exact HTTPS origin. Store the one-use recovery code and acknowledge it. No production password is passed as a command argument or generated into the system service journal.

Core setup installs protected code/runtime under `/opt/server-panel`, private data under `/var/lib/server-panel`, configuration under `/etc/server-panel` and `server-panel.service`. It does not install the security suite. The CLI waits for the expected build's local health response before reporting success. Existing active installations are not replaced by the fresh installer.

Inspect a failure with `sudo journalctl -u server-panel.service --no-pager -n 100`. Do not delete users.json or regenerate accounts to repair a failed service. An installation interrupted after its owned state was recorded can be retried from the authenticated archive using the same profile and `--resume`. The marker preserves credentials and profile identity. Unknown/unowned partial paths or an incomplete database initialization directory require inspection rather than destructive cleanup.

The browser development-to-administrator handover has a delayed start because the old process must release its listener. Its result says staged, not ready; confirm the service's health separately. Prefer the standalone archive installer for a fresh server.

## Remote access

For a server listening on port 8787, open a trusted local SSH forward from your own computer:

```sh
ssh -N -L 8787:127.0.0.1:8787 server-user@server-address
```

Then open `http://127.0.0.1:8787` in your local browser. If you chose a different panel port, replace the remote port; choose an unused local port as needed. The Host allowlist uses the panel port, so using the same local/remote port is the simplest initial path. Keep console/SSH recovery access available. Configuring a public HTTPS origin enables secure cookies; browser behavior for initial localhost access should be verified for the chosen browser.

For public access, configure DNS and an HTTPS reverse proxy or Cloudflare Tunnel to the private listener first. Forward the original Host, support WebSockets and restrict access as appropriate. Use System → Panel address to verify the exact HTTPS address against this instance. A public URL setting does not issue a certificate or create a public listener. Existing `panel-access.json` takes precedence over the initial environment default. Back it up before console repair; an authorized offline removal of that saved address returns to the configured environment default on restart.

Nginx users can configure a reviewed server block with TLS termination and `proxy_pass http://127.0.0.1:8787`, `proxy_set_header Host $host`, HTTP/1.1 and Upgrade/Connection headers. Do not copy this fragment over unrelated routes. See the native web-engine guide for the panel-managed loopback profile and the panel-address guide for verification. Enroll MFA for every enabled administrator before exposing privileged access.

## Optional security profile

Choose `--profile=security` explicitly at fresh installation. The profile downloads signed repository PostgreSQL packages for a separate private event database, builds native Coraza with a checked compiler archive, prepares Suricata/signatures and creates owned service units. It requires network access and compatible runtime libraries. It does not replace application databases. Missing library/package prerequisites produce a failure for inspection/resume; no clean-host claim is inferred.

Prevention and packet capture start off. The origin is an explicitly reviewed local topology; native Nginx uses `127.0.0.2:80` to avoid recapture. CrowdSec is optional and an existing engine is used only when detected/configured; the security profile does not silently install an arbitrary CrowdSec distribution. GeoIP requires the operator's account/license and local assets. Neither optional absence should block unrelated event ingestion.

Core-to-security conversion and removal of optional security components require a separately reviewed maintenance procedure; do not rerun the fresh installer against an active service. Log rotation limits accumulation during normal operation; it is not a filesystem quota or a guarantee against disk exhaustion under attack.

## Updates, recovery and support

Read RELEASE-PROCESS.md before an update. Resolve active jobs and VPN/network rollback transactions first. Keep the previous application/runtime and a private state snapshot. BACKUP-AND-RECOVERY.md explains operator export/isolated restore and its limits. Installation interruption, real systemd/APT operations, reboot, TLS/browser paths, full-host restore and each candidate target remain disposable-VM release gates.

## Remove core supervision

`scripts/uninstall-service.sh` prints a read-only removal plan by default. In an authorized maintenance window, `sudo ./scripts/uninstall-service.sh --apply` stops/disables and removes only the owned core service unit, retaining a unit copy under `/etc/server-panel`. It refuses active tasks and pending network/VPN changes. Application/runtime files, private accounts/backups, optional security services and user workloads remain in place. Optional service removal and permanent data purge require a separate ownership/backup review; this command deliberately does not delete them. The same legacy maintenance-protocol limits described for updates apply.

## Automated account setup

The installer accepts `--config-stdin --recovery-file=/private/path` for automation. Supply a JSON object on stdin with `username`, `password`, `confirmation`, `port` and optional `publicURL`. Store input JSON privately, remove it according to your secret-management policy, and never pass its contents as shell arguments. The recovery output must be a new file in a private administrator-owned directory outside panel data. It is written mode 0600 and is not printed. Account/environment validation is identical to interactive setup. This interface only changes how setup input is supplied; it does not bypass archive authentication, preflight, profile choice or existing-account preservation.
