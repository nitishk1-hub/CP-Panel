# Historical feature notes — superseded

This is the README captured before the current readiness changes. It describes historical behavior and is not installation guidance. Consult the root README and current installation/release documents.

# CyberPross Panel

Local Linux server panel. Development build; no telemetry or remote assets. Local accounts support authenticator MFA. SSO, LDAP and Vault hosting have been removed.

## Start

Requires Node.js 24+. Run `npm ci`, `npm test`, then `npm start`. First startup creates an administrator with a random password and one-use recovery code; save the credentials from the startup output. Sign in as admin and change the initial password before server controls become available. Later starts preserve accounts and do not generate or print new credentials. Login sessions use HttpOnly, SameSite cookies, survive page refresh, and expire after eight hours or on restart. Login and forced password setup hide all server navigation. There is no owner-link authentication bypass.

The service listens only on 127.0.0.1:8787. Do not publicly expose this development service. `PANEL_PORT` changes the port. `PANEL_FILE_ROOT` changes the file manager's root (default: `/`). `npm start` runs with the current Linux account’s permissions. For full server management, complete **System → Set up administrator service** once; it installs a root-owned systemd service and preserves panel accounts. Docker requires existing daemon access. A Docker socket confers significant host authority; do not grant it to untrusted users.

## Implemented

| Section | Features |
|---|---|
| Overview | Live CPU/RAM, host network rates and charts, all mounted drives, compact container status and Cloudflare health |
| Docker | All containers and status; CPU/RAM stats every five seconds; start/stop/restart; discovered Compose projects and direct file editing; Ubuntu package install/update jobs; reviewed Compose pull/redeploy; image and build-cache cleanup |
| System | One-time administrative service setup; UFW status and add/remove port rules; interactive PTY terminal; file manager/editor/upload/download/Trash; Cloudflare Tunnel management |
| Users | Local panel accounts, authenticator MFA, account recovery and scoped roles. |

Docker package actions use existing configured signed APT repositories: Docker CE packages if CE is already installed, otherwise Ubuntu's docker.io and docker-compose-v2. Unsupported systems or missing candidates fail explicitly. No downloaded root scripts, automatic repository replacement, socket permission changes, or Docker-group changes. Requires root or pre-existing noninteractive sudo authorization; the root-owned service executes these operations directly; regular-account development mode needs pre-existing sudo authorization. The optional host-service setup and temporary firewall unlock each request host authorization explicitly. Package changes may restart the daemon and affect workloads. Actual install/update and firewall mutations have not been executed during development validation.

File saves create sibling backups and reject stale revisions, out-of-root symlinks and hard-linked files. Text files are limited to 1 MiB. Compose edits are restricted to configuration paths discovered from Docker; they are not YAML-validated and do not redeploy services. Only files accessible to the process user can be opened or edited. Backups may contain secrets; retain them with the same care as originals. Concurrent external filesystem mutation remains outside the development build's guarantees.

Terminal opens a persistent interactive Bash PTY through authenticated WebSockets. It supports shell state, history, completion, resizing and interactive programs. It runs with the panel process’s full authority (root after administrative service setup); only panel administrators can connect. The configured file root sets its initial directory and does not confine shell commands.

UFW rule management supports status, allow/deny rules and reviewed removal by current rule number. It does not automatically enable or disable the firewall. Existing SSH policy is preserved. Docker-published ports may bypass UFW filtering and require separate Docker network policy. Jobs are held in memory; restarting loses job tracking and may not stop child operations. This is not a durable production job service.

## Permissions

- Admin: all controls, terminal, files, users and security settings.
- Operator: resource metrics, Docker inventory, container start/stop/restart.
- Viewer: resource metrics and Docker inventory.

Account passwords require 9–256 characters and are stored as salted scrypt hashes. Login attempts are limited per username and connection address. Password changes require the current password and revoke all sessions. Recovery uses a one-use random code and replaces it after successful use; no unauthenticated administrator reset is permitted. From the server console, `npm run recover -- admin` issues an expiring one-use code when the saved code is lost. Set PANEL_DATA_DIR consistently for server and recovery command when using a custom data directory. Built-in TOTP MFA is available for local accounts, including one-use backup codes. OIDC browser login, OS user management, durable sessions and remote tamper-resistant audit storage are not implemented.

## Retired LDAP support

Local accounts and their MFA continue to work. LDAP login, configuration APIs, hosting controls and the ldapts dependency have been removed. Old directory records are retained as inactive sign-in methods and cannot acquire local password authentication. Private historical configuration files and unrelated running services are not deleted during this source update.

For an HTTPS reverse proxy on the same host, set PANEL_PUBLIC_URL to the exact HTTPS origin and keep the backend listener private. The allowed Host and Origin checks include that configured origin. Forwarded headers do not override identity or rate limits. Requests through one proxy share the connection-address login limit. TLS termination remains a deployment requirement for remote access. The optional administrative installation supervises the panel through systemd and runs its protected application files as root; it is not a separate restricted privileged helper.

Native n8n OIDC currently requires an Enterprise plan: https://docs.n8n.io/user-management/oidc/ . A proxy login gate can protect access to compatible tools but does not provide their native user provisioning or role integration.

## Validation

`npm test` covers real metrics; access tokens, Host and origin validation; unauthorized operations; viewer boundaries; file traversal/symlink refusal; optimistic concurrency; password login; secret omission from user listings; and HTTPS issuer requirements. Tests bind ephemeral localhost ports. Docker inventory and all four sections have also been checked in the browser. No running containers were restarted or changed during UI verification.

Project-authored code: Apache-2.0. See LICENSE. Integrated software retains its own license.

## Compose updates and Docker cleanup

Docker → Compose projects → Update reviews the deployed service names, configured images, replica counts, original ordered Compose files, working directory and recorded environment files. The confirmed operation revalidates the configuration, pulls registry images using the configured tags, and runs detached Compose up with no builds and a running/health wait. It does not rewrite version pins or digests to latest, run Compose down, remove orphan containers, or delete volumes. Local-build services are not rebuilt. A failed pull stops before redeployment; a failed rollout can leave a partial update and has no automatic rollback. Previously stopped deployed services may start, as may their configured dependencies. Existing replica counts are preserved. The review is invalidated if configuration changes before deployment.

Original shell-only interpolation values must be saved in .env or recorded environment files. Missing interpolation variables, inaccessible files, missing original metadata, and inconsistent metadata across project containers block updates instead of guessing a deployment configuration. The panel does not inherit arbitrary shell interpolation or COMPOSE_PROFILES settings. Default .env and resolved service configuration participate in the review fingerprint. Backup/restore and application compatibility remain the operator’s responsibility.

Docker → Storage & cleanup shows engine-wide Docker system-df estimates and separate controls for dangling images, all unused images, and unused default-builder cache. Each cleanup requires confirmation, defaults to older than 24 hours, and supports 7 days, 30 days, or any age. All-unused-image cleanup includes tagged images not referenced by any running or stopped container, including potential rollback images. Cleanup never prunes containers, volumes or networks. Future builds may be slower after cache removal. External buildx builder caches are not managed by this control. Cleanup output reports actual reclaimed space; summary estimates are not an exact age-filtered deletion preview.

Validation uses injected command runners for destructive Docker actions. Real storage reporting and project previews were read-only. Existing project images, containers and cache were not changed during feature verification.

## Docker workspace

Docker now separates Containers, Compose projects, Networks, Images, Volumes and Storage & cleanup.

- Container and project tables show Docker-published host address/port → container port/protocol, attached networks and Compose service membership. Internal-only EXPOSE metadata is labelled separately. Stopped containers show configured bindings, not claims of active listeners. Host-network containers share the host stack; the administrator-only Host listeners view reports host-wide sockets without claiming per-container ownership. Publication is not a firewall reachability test.
- Container details show health, restart policy, CPU/memory limits, network addresses/aliases, mounts, process metadata and environment variable names with values omitted. Logs refresh in the dialog. Runtime settings, stopped-container removal, individual lifecycle operations and non-interactive in-container commands are available in the UI. Runtime changes to Compose containers must also be persisted in Compose configuration to survive recreation. Existing published ports cannot be edited in place; change Compose and redeploy or create a standalone replacement.
- Network inventory reports driver, scope, IPAM subnet/gateway, internal state and attached containers. UI creation supports bridge networks. Administrators can attach/detach bridge-compatible containers, optionally specifying IPv4/aliases, and remove empty non-built-in networks. Docker built-ins and networks with attached containers cannot be removed by these controls. External Docker drivers remain visible but are not configurable through the creation form.
- Images can be pulled, inspected in inventory, used to create containers, and removed without force. Registry authentication must already be configured for private images. Volumes can be created and inspected; deletion checks both running and stopped container references and permanently deletes unused stored data only after UI confirmation.
- Standalone container creation includes image/name, bridge network, explicit address/port/protocol mappings, named volumes or host bind mounts, environment variables and restart policy. Localhost is the default binding address. Environment values are passed in a temporary 0600 file removed after creation, rather than process arguments. Host bind paths must already exist and be accessible to Docker. Advanced settings can be expressed through Compose.
- Compose projects expose deployed service/port/network information, lifecycle operations, configuration editing, reviewed image updates and optional local-service rebuilds. New projects can be validated as private drafts and deployed from pasted Compose plus .env contents. Draft review omits environment values, validates interpolation and checks a revision before deployment. Draft files become the deployed project's persistent configuration. Failed deployments may leave partial resources; inspect project state rather than blindly retrying. Default profiles apply for new projects; Swarm/Kubernetes and remote build-context upload are not implemented.

All new mutations, logs, mounts, image/volume management and host-listener reporting require administrator access. Read-only users retain container/port/network inventory access. Resource operations use fixed Docker argument arrays, not host shell interpolation. Existing filesystem permissions and original Compose metadata restrictions still apply. Browser QA inspects real host inventories while all mutating tests use injected runners; production containers, ports, networks, images and volumes are not changed during validation.

### Overview resources and Cloudflare Tunnel

The Overview now samples host-uplink receive/send rates, CPU and memory every two seconds. Uplink totals exclude loopback, Docker bridges, veth pairs and bonded slaves to reduce double counting. Expand Network interfaces for individual interface counters, rates, errors and drops. The first rate sample and reset counters are unknown until another measurement exists. Charts contain only observations collected while the page is open.

Mounted drives show total, used and user-available space independently for every mount. Linux reserved blocks can make used plus available smaller than total. System and bind mounts are hidden by default and can be included; duplicate mounts are never summed into a misleading capacity. Mount data is cached for 15 seconds, with bounded `findmnt` execution.

System → Cloudflare Tunnel detects existing native systemd services and cloudflared Docker containers. Local metrics and readiness are checked separately from process activity; a running service alone is **not** marked connected. Standard loopback metrics ports 20241–20245 and explicit loopback metrics ports in detected native commands are checked. Containers with private metrics endpoints may remain unverified. Existing connector tokens are masked. Detected local YAML configuration can be edited with revision protection and backups when the panel user has write permission. Configurations containing inline secrets are masked and read-only.

Token-based remote configuration is held by Cloudflare. Connect a scoped account API token in the UI to view/edit those routes; the panel does not pretend a local file represents remote configuration. API credentials and new connector tokens are kept in private panel data files. Service start/stop/restart and configuration saves require explicit review. Restarting or stopping a tunnel used to access the panel interrupts that connection.

When absent, the Cloudflare screen offers an optional installation from Cloudflare’s official signed Debian/Ubuntu APT repository. Installation does not start a tunnel. A separate connector-token form creates a dedicated systemd service only when no connector is detected; existing installations are preserved. Administrator/noninteractive sudo permission is required for package and systemd operations. Other distributions are not automatically installed. Manually launched cloudflared processes are detected to prevent duplicate setup, but their lifecycle is not managed. This does not create a Cloudflare account, purchase a domain, or automatically expose the panel.

### Interactive terminal, firewall authorization and file tools

System → Terminal uses xterm.js, WebSockets and node-pty to open a real interactive Bash session. It preserves shell state, supports completion/history, Ctrl+C, full-screen programs and resizing. Click Connect to begin; disconnecting or leaving System → Terminal ends the session. Two simultaneous sessions per administrator and eight per panel are allowed. Sessions expire with panel authentication and after 30 minutes without input. WebSocket upgrades enforce exact host/origin, an authenticated admin cookie and a short-lived single-use ticket; commands/output are not written to audit logs. The shell runs as the panel process user, not automatically as root. The terminal and CodeMirror editor are bundled locally with `npm run build:tools` and their licenses are retained in `public/third-party-notices.txt`.

System → Firewall now offers a five-minute unlock using the **host account's sudo password**, not the panel password. Passwords go to sudo via standard input, never command arguments, logs or files. The temporary grant is restricted to validated UFW status/add/delete operations and the current panel session; lock it explicitly or sign out to clear it. This does not edit sudoers or enable UFW automatically. A host account without sudo permission cannot unlock it. No actual host rule changes were made while developing or testing this feature.

File manager defaults to `/` (override with `PANEL_FILE_ROOT` to confine it). It uses the existing host user's filesystem permissions. It supports folder/file creation, syntax-aware text editing with find/replace, backups and stale-save protection, rename, copy/move, Unix permissions, upload (100 MiB per file), file download and folder download as tar.gz. Downloads of folders stay on one filesystem and exclude panel Trash. Text editing is limited to 1 MiB and rejects binary files. Delete moves regular files/folders into a private `.server-panel-trash` on the same drive, with restore records in private panel data. Trash is recoverable and continues to consume space; it is not automatically purged. Existing destination files are not intentionally overwritten. Symlink targets may be browsed if within the configured root; mutation of symlinks is refused to avoid unexpectedly modifying a target.

### One-time administrator service setup

The sidebar layout is scoped to `#sidebar`; help boxes cannot acquire its fixed positioning. HTML assets carry a build version in their URLs and the footer identifies the current build. Existing tabs show a reload notice when a newer build is detected. Reload older tabs once after updating.

System → Set up administrator service requests the current Linux account’s sudo password once and explicit confirmation of full server authority. It installs protected copies of the application and Node executable under `/opt/server-panel`, preserves existing account data under `/var/lib/server-panel`, writes private environment configuration under `/etc/server-panel`, and enables `server-panel.service` as root at boot. The listener remains on loopback; an existing exact HTTPS public origin is retained. Application code is root-owned and ordinary host users cannot edit that running copy. Root service installation is optional for development; authenticated viewer/operator restrictions remain enforced even when the backend is root. Every panel administrator must be trusted with full server authority, including the root terminal and filesystem.

The installation is prepared and validated with injected execution tests; the real host installation requires the user’s Linux authorization in the setup form. Passwords are passed to sudo on standard input and are never saved or put into executable arguments. The installer does not enable UFW or alter its rules. It refuses conflicting service names, unsafe installation paths and external/absolute source symlinks. The service starts after the existing development process releases its port. Existing account files are retained in the workspace for rollback; runtime data moves to the protected service data directory. Console recovery after installation must use that service data directory with host administrator permission.

The protected service runs the installed snapshot. Later workspace edits require an authorized deployment to that protected copy; they do not silently change root-executed application code.

Firewall rules are returned as structured rows while retaining the original UFW output in an optional details view. Unknown rule formats are reported there rather than guessed. Row deletion requires a fingerprint of the currently observed numbered list; changed lists must be refreshed before deletion. The UFW command remains a numbered removal, so out-of-panel concurrent firewall changes should still be avoided while reviewing an operation. System connector/configuration tables use the same visual hierarchy as Docker, files and users; technical details and setup instructions are opened only when needed.

For an existing protected service, `scripts/update-service.sh /absolute/path/to/workspace` applies a reviewed workspace build with host administrator authorization. It copies and protects application files, checks imports, keeps the previous application snapshot, restarts the known service, and restores the prior snapshot if startup fails. It preserves runtime account data, environment configuration and all managed host resources. Editing workspace files alone does not update the protected service.

## Websites and collapsible navigation

The header menu button hides/shows the sidebar on desktop and opens/closes it on mobile. Desktop preference persists in local storage, and hidden navigation is removed from keyboard focus.

Websites → Sites lists panel-created sites and websites discovered in the existing OpenResty configuration. Existing 1Panel-managed sites open a management workspace with scoped file editing, form-based domain/upstream changes, logs, routing editors, certificate replacement and configuration history. They are never adopted or rewritten automatically: each change requires a user action and guarded configuration operations retain backups and test/reload the shared engine with rollback on failure. On this host the existing host-network OpenResty container's `/www` and `conf.d` bind mounts are reused. Compatible native Nginx/OpenResty layouts are also detected. If the required engine is not detected, creation is unavailable with a clear installation state. Containerized dynamic hosting currently requires a host-network proxy; unsupported proxy networking is rejected explicitly.

Websites → Runtimes distinguishes host installations from dedicated website runtime images. Install only the runtimes needed: Node.js 24, Python 3.14, PHP 8.4 FPM and optional Composer. These are Docker Official Image families, verified against the [official image manifests](https://github.com/docker-library/official-images/tree/master/library). Pulling a runtime does not restart existing sites; publishing pins the currently resolved image ID. Static websites reuse OpenResty directly and do not need an application runtime image.

Create a website draft, select its type and domains, edit/upload starter code, install its runtime if needed, and Publish. New routes use separate `server-panel-<id>.conf` files. Conflicting domains are rejected. The complete web-engine configuration is tested before reload, and publishing verifies its new deployment marker through a loopback HEAD request. Failure restores the previous route; dynamic deployment retains the previous runtime until routing succeeds. This is routing/runtime rollback, not a versioned rollback of edited source files or application data.

Each dynamic site runs as UID/GID 1000 with no capabilities, no-new-privileges, memory/CPU/PID limits, a read-only root filesystem and read-only application source. Only that site's application and storage directories are mounted; no Docker socket, other website directories or TLS keys are exposed to the runtime. Writable persistent data is available at `/data` and temporary files at `/tmp`. Node/Python HTTP applications listen on `0.0.0.0:8080`; PHP uses FPM on port 9000. Backend ports are published only on loopback for OpenResty. Dependency installation runs a dedicated unprivileged helper container with temporary application write access, then cleans up the helper and restores protected source ownership. A failed cleanup locks source editing until the user runs Clean dependency job. Resource isolation does not make arbitrary application code inherently safe.

Per-site tools include Code (file tree, syntax-aware editor, create/rename/copy/move/upload/download/Trash, source download), private file History with restore, Settings (domains, startup command, environment variables and resources), Logs (runtime/access/errors), HTTPS and Routing. Website editor backups stay under private panel data rather than publicly served directories. Static/source edits may affect a running site immediately; republish dynamic code/dependencies when a process restart is needed. Website application storage is under the reused web-root's `server-panel-sites/<id>` directory; site metadata, environment values and file history are under private panel data.

HTTPS accepts a matching PEM chain/private key covering all configured domains, checks validity and saves keys privately outside the source mount. Apply it by publishing. DNS records, Cloudflare public-hostname routing, ACME certificate issuance/renewal, database provisioning and custom runtime extensions/build images are not automated by this feature. Existing Cloudflare and Docker tools remain available separately. Stopping removes only the panel site's route; archiving retains code/data for recovery. No live website was created or republished while developing the feature; hosting mutations are exercised against disposable fixtures and injected Docker/proxy commands.

## Installable candidate and production checks

Candidate `0.2.0-rc.1` adds an offline-capable Linux bundle with its Node runtime, interactive fresh installation, validated selected administrator credentials and private one-use recovery setup. Build it with `npm run release`; follow [INSTALLATION.md](docs/INSTALLATION.md). Fresh installation preserves existing installations by refusing to overwrite them. The service's production mode refuses missing/uninitialized account data. Checksums provide integrity, not publisher authenticity.

System → WireGuard detects existing wg-quick interfaces, shows public/runtime information, prepares validated drafts and offers guarded changes with an independent 90-second rollback timer. New imports cannot carry shell hooks; existing hooks need explicit acknowledgement. Private keys are hidden; generated client exports are private, expiring and one-use. Existing VPNs are never restarted or adopted automatically. Split-tunnel host access is supported; Internet-gateway/NAT/DNS/forwarding policy remains an explicit separate task.

System → Readiness runs automatic verification after installed startup and when daily evidence is due, with an hourly scheduler and Run checks now. It records signed release integrity, live advisories, OS/deployed-image scans, encrypted backup restoration, isolated recovery/API probes and clean-container compatibility. See [AUTOMATIC-VERIFICATION.md](docs/AUTOMATIC-VERIFICATION.md) for evidence scope, private key/backup handling and findings. Missing independent review, complete VM/disaster recovery and MFA remain explicit gaps. This is an installable candidate, not a security certification or a claim of flaw-free production readiness.

## Websites, databases and protection

Websites has separate Node.js, PHP, Static websites, Reverse proxy and Python categories. Existing OpenResty/Nginx sites remain manageable through their original configuration. New reverse proxies do not require an application runtime.

Databases manages native MySQL, PostgreSQL and Redis software, with existing native MariaDB detection. It provides reviewed APT install/update/uninstall plans, start/stop/restart controls, startup settings and native service logs. Uninstall retains data and configuration. Database container discovery and instance/user/table/backup management were removed from this page.

SSO and Vault were removed. Local accounts, MFA and recovery remain. The protected retirement script stops/removes only verified panel-owned services and archives their settings; it never deletes their data volumes.

See [WAF & IDS operation](docs/WAF-IDS-CONSOLE.md) and [Database management](docs/DATABASES.md) for supported behavior and limits.

MFA verification is remembered for a fixed 24 hours in the same browser using a signed HttpOnly, SameSite=Strict cookie (Secure with configured HTTPS). Passwords are still required at login. Logout retains this browser verification until its original expiry; password sign-ins do not extend it. Other browsers and cleared cookies require MFA. Password changes/recovery, MFA reconfiguration and role changes invalidate remembered verification. The signed receipt survives panel restarts and cannot be used as an API session.

Created by **CyberPross**. The user interface refreshes resource/status information automatically. Background operations use the panel service’s native task queue and private retained history; no separate queue container is required.
