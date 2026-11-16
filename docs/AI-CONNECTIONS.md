# AI connections: remote MCP with OAuth

Open **System → AI connections**. The primary connection is the remote MCP URL, built from the verified address in **System → Panel address**. For the current deployment:

```json
{
  "mcpServers": {
    "cyberpross": {
      "url": "https://cyber.cyberpross.cc/mcp"
    }
  }
}
```

Some clients ask for a URL in their connector UI instead of a configuration file. Enter the displayed MCP server URL, choose Connect/Sign in, complete the panel's normal login and MFA, and approve the permissions displayed. No static token or local Node command is needed for this method. The MCP client provides the AI model; the panel does not run an AI model or start an autonomous agent.

The address is taken from the verified panel configuration, never from an arbitrary forwarded Host header. OAuth discovery, authorization URLs, token resource/audience and MCP URL use the same origin. Changing that address invalidates existing OAuth codes/connections because the resource changes; reconnect clients at the new address. Existing localhost access to the panel is retained.

## Protocol and authorization

The official `@modelcontextprotocol/sdk` provides OAuth protocol routing/PKCE validation and the stateless Streamable HTTP transport. Express is embedded in the existing HTTP service; no additional listener, container, SSO service or background identity process is installed.

Endpoints:

- `/mcp`: authenticated Streamable HTTP MCP endpoint, with JSON responses. Authenticated GET/DELETE return 405 because the server does not maintain SSE streams or transport sessions.
- `/.well-known/oauth-protected-resource/mcp` (also root variant): protected-resource discovery and authorization-server location.
- `/.well-known/oauth-authorization-server`: issuer, endpoints, supported scopes and S256 PKCE metadata.
- `/register`: dynamic client registration. Supports public clients (`none`) and confidential clients (`client_secret_post`). Redirects require HTTPS, except HTTP loopback callbacks for local clients. Client ID metadata documents are not currently supported; clients must use dynamic registration.
- `/authorize`: authorization-code flow. Requires S256 PKCE and an exact MCP `resource` parameter. Redirects must match registration; loopback port relaxation follows the SDK's RFC 8252 implementation.
- `/token`: authorization-code exchange and refresh grants. Requires the same client, callback and resource. Codes are one-use and expire after 60 seconds.
- `/revoke`: revokes the connection associated with an access/refresh token for its registered client.

Authorization requests expire after ten minutes. Every request shows a consent screen after normal administrator sign-in; client names are explicitly marked client-provided, and the callback destination is shown. Management and root-command permissions are unchecked by default. Browser consent APIs require the normal panel session, allowed origin and explicit mutation intent; AI credentials cannot approve their own access.

Access tokens expire after ten minutes and are restricted to this MCP resource. Refresh tokens rotate on every use and expire after 30 days. Refresh scope can only decrease. Reuse of a consumed refresh token revokes the entire connection. Password/MFA credential changes, administrator disable/demotion, connection revocation and a change of panel domain invalidate access.

OAuth tokens are opaque and stored only as SHA-256 hashes in the private `mcp-oauth.json` file. Confidential client secrets are encrypted with AES-256-GCM using the separate private `mcp-oauth.key`. Both files use mode 0600. Preserve the key with private panel backups. Token values, authorization codes, passwords and refresh tokens are not written to the audit trail. Client registration and protocol endpoints have rate limits and bounded storage; MCP requests have per-connection rate limits and a concurrency cap of four.

The OAuth access token is accepted only at `/mcp`; it is not passed to downstream APIs. Tools invoke existing panel APIs through short-lived, in-memory, loopback-only internal capabilities carrying the approved scopes. This preserves existing argument checks, previews, confirmation fields, audit records and background tasks without exposing a new unrestricted HTTP API.

## Permissions and tools

- `read`: panel API reads, including logs/configuration, which can contain application secrets. Grant only to a trusted client.
- `manage`: existing panel management operations. Reviewed package plans, Compose revisions and explicit operation confirmations still apply.
- `command`: host shell commands with the panel service's permissions, normally root. This effectively grants full server control and can bypass application scopes through the shell. It is not a restricted shell.

Tools are `panel_discover`, `panel_read`, `panel_manage` and `panel_command`. The advertised list excludes management/command tools when not authorized, and calls are checked again. Example workflow: discover → inspect inventory → prepare the operation's preview → submit the confirmed operation → poll `/api/jobs?id=JOB_ID`. Long-running jobs appear in Tasks. Interactive SSH/password prompts use the browser terminal; noninteractive command jobs have a two-minute/4 MiB output limit.

Revoke access in **System → AI connections**. New requests and refreshes are denied immediately; revocation does not undo changes or cancel tasks already accepted. Task output can contain sensitive information deliberately printed by commands. The client must treat files, logs and application content as untrusted data, not as instructions.

## Optional legacy local bridge

Existing stdio clients can still use a manually created legacy token. The UI now generates its CYBERPROSS_URL from the assigned panel domain instead of hard-coding localhost. The command and script paths apply to a client running on this server; remote clients should use the URL-based OAuth connection above. Legacy tokens are shown once, hashed at rest, expiring and revocable. They do not become OAuth tokens automatically.

Protocol references:

- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

Runtime MCP tools are shared from `src/mcp-tools.mjs`. The application runtime does not import the CLI wrapper under `scripts/`, so runtime-only compatibility packages do not need CLI scripts.

## Host authority of integration permissions

Only connect clients trusted with host-administrator information and authority. The existing `read` permission includes operational configuration, logs and administrator file reads, which can reveal credentials. `manage` includes file changes and container/application deployment, which can lead to code execution with host authority even without the dedicated command tool. These names classify API operations; they are not sandbox boundaries. Revoke compromised grants and rotate any exposed host credentials. Resource-specific low-trust integration access is not currently implemented.

## Independent privileged operations (workspace implementation)

The existing `/mcp` endpoint now advertises `panel_exec`, operation status/log tools,
component tools for systemd, Nginx, Docker, Compose, Cloudflare Tunnel, Coraza and
CrowdSec, transactional text editing, transaction history and health status.
These tools require the separately supervised local operation agent. Until its
reviewed installation is complete, they return an unavailable-agent error; the
legacy tools remain compatible.

The agent listens only on `/run/server-panel-agent/control.sock` (root-owned,
0700 parent, 0600 socket). The panel signs each request using a private 32-byte
key; capabilities expire within 30 seconds, are bound to method, path and body,
and cannot be replayed. `command` scope is independently enforced for arbitrary
shell execution. Component mutations and file transactions require `manage`;
service/container changes and file edits require explicit confirmation.

`panel_exec` returns immediately with a durable operation ID. Poll
`panel_operation`; read bounded base64 log chunks using `panel_operation_logs`
and its `nextOffset`. Jobs preserve exit code, signal, deadline/output-limit
reason and actor. They continue across panel restarts while the agent stays
running. Agent restarts mark unfinished jobs interrupted and never replay shell
commands. Root commands inherit a minimal environment, not panel credentials.
Logs are privileged administrator data and can contain command output secrets.

The existing Tasks view includes agent jobs and their exit status. File editing
records preflight, backup, execute, validation, commit and rollback phases.
Unfinished file transactions are restored on agent startup. Failed restoration
blocks subsequent transactional mutations for investigation. Text editing is
limited to existing regular files up to 1 MiB and refuses symlink ancestors.
Backups stay in private transaction storage, outside website content.

Health monitoring checks service state, container state/health, free bytes and
inodes, and configured HTTP endpoints (including 403, 502 and 503). Production
agent startup derives local and public panel health endpoints from the existing
environment file. Automatic remediation defaults to disabled. The implementation
allows only explicitly configured restarts of noncritical services, with a
15-minute cooldown. SSH, network, tunnel, VPN, Docker-daemon, panel and security
service auto-restarts are rejected. Authorized repair policy persists across restarts and is available from the existing Tasks view. The same view shows health and transaction summaries.

`node scripts/setup-operation-agent.mjs` prints an installation plan. Fresh installation and signed updates provision the agent and verify socket readiness. Updates preserve its prior unit/enable state for rollback, and uninstall removes only owned supervision while retaining credentials and history. The current web process remains root-capable for legacy
features. Migrating the whole panel to an unprivileged service account requires
additional compatibility work; the socket boundary alone does not establish that
separation.

## Full Inventory of 44 Production MCP Tools

CP-Panel advertises 44 structured tools across 7 functional domains:

### 1. Developer Operations & Autonomous Toolchain (NEW)
- `panel_apt`: Safe Ubuntu/Debian APT package management. Supports actions: `search`, `info`, `upgradable`, `simulate` (dry-run with `-s`), `update`, `install`, and `upgrade`.
- `panel_git`: Full Git version control workflow: `clone`, `pull`, `status`, `log`, `diff`, `branch`, and `checkout`.
- `panel_docker_build`: Build custom Docker container images with `--build-arg`, Dockerfile paths, and streaming logs.
- `panel_test_runner`: Automated isolated rootless test runner for Node (`npm test`), Python (`pytest`), Rust (`cargo test`), and Go (`go test`) using `--network none` and read-only code mounts.
- `panel_cloudflare_dns`: Manage Cloudflare DNS and domain routing automation for direct-IP / non-tunnel setups. Supports token verification, listing active zones, automated A-record creation with Cloudflare Orange-Cloud proxy toggle, complete 1-click Email DNS suite setup (Mail A record, MX, SPF, DMARC, DKIM), and automated Let's Encrypt / ZeroSSL TLS certificates via Cloudflare DNS-01 API challenge.

### 2. Security, Network & Threat Inspection (NEW)
- `panel_security_inspect`: Read-only structured telemetry: Coraza WAF active rulesets and per-domain exclusions, CrowdSec decisions and registered bouncers, and Suricata IDS alerts.
- `panel_network_inspect`: Read-only structured network telemetry: active listening sockets (`ss -tulpn`), UFW firewall rules, and Cloudflare Tunnel routing.
- `panel_waf_exempt`: Per-domain WAF rule ID exclusion manager to eliminate false positives without weakening global rules.

### 3. System & Daemon Supervision
- `panel_systemd`: Inspect service status, reload systemd daemon, restart and control services.
- `panel_nginx`: Validate syntax (`nginx -t`), reload, restart, and inspect active reverse proxy configurations.
- `panel_docker`: Container status, inspect, stop, restart, and resource telemetry.
- `panel_compose`: Validate, deploy, update, restart, and manage multi-container Compose projects.
- `panel_cloudflare`: Inspect Cloudflare Tunnel status, connector health, and public ingress mappings.
- `panel_coraza`: WAF status, OWASP CRS v4 ruleset coverage, and blocking mode.
- `panel_crowdsec`: CrowdSec LAPI status, active decisions, and bouncer connectivity.

### 4. Web Engine & Deployments
- `panel_static_preview`: Validate static file directories prior to atomic symlink deployment.
- `panel_static_deploy`: Deploy static sites with zero-downtime atomic directory swaps.
- `panel_proxy_create`: Configure reverse proxy vhosts with WebSocket, HTTP/2, and TLS termination.
- `panel_website_import`: Deploy multi-runtime web applications (Node.js, Python, PHP, Static) in isolated container sandboxes.
- `panel_ssl_acme`: Request, issue, and manage Let's Encrypt / ZeroSSL TLS certificates via ACME.

### 5. Transactional File Studio
- `panel_file_upload`: Safe atomic file upload (up to 1 MiB) through the privileged agent socket.
- `panel_file_owner`: Safe numeric ownership (`chown`) changes with directory boundary enforcement.
- `panel_file_permissions`: Safe file permission (`chmod`) changes.
- `panel_file_read`: Read regular text files with path traversal checks.
- `panel_file_edit`: Atomically edit regular text files with preflight validation and automated rollback.
- `panel_file_restore`: Restore prior file versions from private transactional snapshots.
- `panel_transactions`: List persistent transaction history and rollback records.

### 6. Durable Tasks & Execution
- `panel_exec`: Execute root-capable background jobs through the privileged agent socket.
- `panel_operations`: List active and completed durable jobs surviving panel restarts.
- `panel_operation`: Inspect status, exit code, execution duration, and signal of a specific job.
- `panel_operation_logs`: Read bounded chunks of operation output logs.
- `panel_discover`: Explore panel API routes and capabilities.
- `panel_read`: Inspect panel API endpoints.
- `panel_manage`: Execute high-level administrative tasks.
- `panel_command`: Run noninteractive shell commands with output limits.

### 7. Cloud, Observability & Alerts
- `panel_app_catalog`: Browse curated 1-click Docker Compose open-source applications.
- `panel_app_deploy`: Deploy 1-click apps with automated volume and port mappings.
- `panel_backup_cloud`: AES-256-GCM encrypted S3-compatible cloud backups (AWS S3, Cloudflare R2, MinIO, Backblaze B2).
- `panel_cron_manage`: Schedule and inspect recurring cron jobs with execution histories.
- `panel_health_policy`: Authorize safe automatic service restart policies with 15-minute cooldown caps.
- `panel_health`: Real-time health monitoring of systemd units, Docker containers, disk space, and HTTP endpoints.
- `panel_grafana`: Independent Grafana 11 dashboard and Prometheus datasource management.
- `panel_graph`: Token-efficient Graphify semantic knowledge graph queries for architecture & codebase context.
- `panel_notification_test`: Dispatch multi-channel incident alerts (Telegram, Discord, Slack, Custom Webhooks) with live previews.

