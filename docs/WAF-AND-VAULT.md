> Historical design note. SSO/Vault hosting was retired. This document is not current setup guidance; see README.md and COMPONENT-DEPLOYMENT.md.

> Historical design: both the custom WAF and Vault modules below are retired. Current protection is documented in WAF-IDS-CONSOLE.md. Vault has no active routes or service controls.

> The WAF/network-security sections in this document describe the retired implementation. Use [WAF-IDS-CONSOLE.md](WAF-IDS-CONSOLE.md) for the replacement. The Vault instructions remain current.

# WAF and application secrets

These modules are optional installations. Adding their pages does not start new services, change website routes, or initialize a vault. Both require a panel administrator. Existing local authentication, MFA, SSO, website and Docker workflows remain in place.

## WAF

The gateway uses the official OWASP ModSecurity Core Rule Set Nginx image, pinned to its resolved repository digest on first start. It runs with no Linux capabilities, an unprivileged user, bounded resources and loopback-only listeners. Host networking lets it reach existing localhost application ports; it is not a network isolation boundary against host compromise.

1. In WAF, enter a domain and its original HTTP localhost backend port. Do not point back to the gateway or to an OpenResty frontend that would create a routing loop. HTTP proxy backends are supported; direct PHP FastCGI ports are not HTTP upstreams.
2. Prepare, then start. Preparation creates configuration only; start downloads the image. The next port after the gateway is reserved for an isolated probe responder.
3. Run Test inspection. Monitor mode permits the sample and proves reachability only. Blocking mode must reject the synthetic XSS sample with 403 while permitting a benign request. Probes never hit the application backend.
4. Use Connection guide to review the change to the existing site's HTTPS application location. Apply it with the existing website configuration editor, preserving certificates, ACME routes and other necessary locations. Test normal pages, APIs, login, uploads and websockets. Keep the previous configuration available for rollback.
5. Observe legitimate traffic before selecting blocking. A configured route or successful local probe does not prove that public traffic passes through WAF. Original backend ports and alternate hostnames can bypass it; binding and firewall restrictions are separate.

Route and enforcement changes test Nginx configuration and probe the gateway before committing the revision; failure restores the previous configuration. Stopping a routed gateway interrupts those websites. Request summaries omit query strings, headers and bodies. Detailed ModSecurity audit logging and response-body inspection are disabled to reduce accidental capture of application secrets; request paths can still contain sensitive identifiers. Summaries and a synthetic test are not comprehensive attack coverage or an independent security review.

## Vault (OpenBao)

The Vault page manages OpenBao, an open-source Vault-compatible service, with encrypted single-node Raft storage, TLS certificate verification, private Docker networking and localhost-only host access. It is not high availability. A host-root administrator can control the panel and vault; this does not defend against host-root compromise.

1. Prepare and start. The panel generates a one-year local certificate. Download its CA and install it only in approved client trust stores; do not disable certificate validation. Certificate renewal requires planned rotation before expiry; automatic rotation is not implemented.
2. Initialize once. Save all three unseal shares and the initial root token securely and separately from the server. The panel does not persist these returned credentials. Two different shares unlock the vault; restart requires unlocking again. Losing the required shares can make data unrecoverable.
3. Submit two shares, one at a time. Enter the initial root token to configure the apps KV v2 mount and AppRole. Declarative, hashed audit output is required and verified; unsafe API audit-device creation remains disabled. Docker audit logs rotate at 10 MiB with three files, so arrange a separate protected audit destination if retention is required.
4. Create an application ID and versioned secret values. Read before updating: writes require the current version; zero creates a secret. Soft deletion can be restored. The engine retains up to 20 versions.
5. Generate credentials for that application. The read-only policy cannot read another application's paths or write secrets. Secret IDs expire after 24 hours or 10 logins. Tokens last 15 minutes with a maximum of one hour. Production consumers must renew or reauthenticate and rotate bootstrap credentials. Disabling the role stops new logins; revoke existing tokens separately by accessor where needed.
6. Connect only approved containers to the displayed Docker network, install the CA, and follow the displayed AppRole/API instructions. Applications need a compatible client, agent or startup secret-loading mechanism. This does not automatically retrofit every application's configuration or promise integrations restricted by third-party editions.
7. Replace bootstrap-root use with a least-privileged administrative policy, then revoke the bootstrap token after verifying recovery procedures. This module does not yet provision scoped human administrator accounts or Keycloak OIDC login for OpenBao.

The panel never stores submitted tokens, secret values or unseal shares in its settings or jobs. They are temporarily present in browser and process memory for authorized operations. Clear sensitive fields after use. OpenBao necessarily stores its encrypted secrets, policies and token records. Audit values are hashed, but request metadata needs protection too.

OpenBao 2.7 does not use mlock. This deployment instead disables swap for the container and verifies cgroup v2 memory.swap.max=0. It stops the service if that protection cannot be verified; the host's global swap settings are unchanged.

Download Raft snapshots and keep them separately from unseal shares. Generic panel file backup excludes the live Raft directory: copying a running database is not a verified backup. Test snapshot restoration and disaster recovery on a disposable deployment before relying on it. Automatic snapshot scheduling and verified full restore are not implemented.

## Repeatable security review

Run `npm test` and `npm audit --omit=dev`. For heuristic source review, provide a separately obtained local semgrep-rules checkout to `node scripts/security-review.mjs /path/to/semgrep-rules`. The pinned scanner runs without network access and mounts source read-only. Private results are under var/security-review. External rules retain their own license and are not bundled. Generated third-party tools-bundle.js is excluded from source heuristics; dependency and release-integrity checks cover separate risks. Findings need triage; a scan is not proof of absence of vulnerabilities.

Optional real-service integration checks: `node scripts/verify-waf-service.mjs` and `node scripts/verify-vault-service.mjs`. These need Docker and free local fixture ports 28200/28210/28211. They create randomly named test services and remove only those resources, using disposable secrets and storage. They do not test the installed production vault or existing website routes. Their fixed fixture ports are deliberately separate from the module defaults.

## Server-wide network security

The former WAF menu is now Network security, with Server coverage, Network firewall, Intrusion detection and Web firewall sections. It applies to the server independently of project ownership. Coverage lists published domains, IPv4/IPv6 listening sockets, Docker NAT-published ports (including those without a listening proxy socket), host-network containers and interfaces. A binding is not proof of Internet reachability. Unknown and unverified coverage remains visible.

### Central web firewall

New WAF setup defaults to Whole server / shared web engine. Set its origin to the existing OpenResty/Nginx HTTP frontend, normally http://127.0.0.1:80. The gateway accepts all hostnames and preserves Host while forwarding to that shared engine, so future domains on the engine need no individual WAF registration. Existing installations with individual routes can switch through Use shared engine for all hostnames. Changes validate/reload the WAF and roll back on a failed local probe.

Connect the trusted HTTPS terminator or Cloudflare Tunnel to the WAF gateway (normally http://127.0.0.1:18180). Retain the original shared engine as its backend. Do not proxy the shared engine back into WAF: that creates a loop. The central mode does not automatically edit Cloudflare's remotely managed ingress configuration or every existing TLS frontend. Use the panel's Cloudflare configuration tools to review those origin routes. Direct origin access, other ingress paths, QUIC and unconnected HTTPS endpoints can bypass this gateway. Firewall controls can restrict alternate access after reviewing required services. WAF still inspects web requests only; it cannot inspect encrypted arbitrary network protocols.

### Network firewall

This independent nftables inet table hooks input, output and forward for IPv4 and IPv6, before ordinary filter-priority rules. It does not flush UFW, Docker, VPN or unrelated tables. Rules block peer IPs/networks, optionally by TCP/UDP destination port, across incoming, outgoing, forwarded or all directions. In forwarded traffic the destination-port match uses the original conntrack destination port, including Docker published-port translation. Pure bridge paths and disabled bridge netfilter can create gaps; universal same-bridge filtering is not claimed.

This is an additive deny policy, not a default-deny replacement firewall. Unmatched traffic continues through existing policy. Loopback and established/related connections are retained; an existing connection to a newly blocked peer is not terminated. Rule counters are shown. An optional invalid-conntrack-packet drop is available. No broad new allow rule overrides another firewall's deny.

Review the generated rules before applying. The panel validates syntax, saves only its table and committed policy, and arms an independent systemd rollback before applying. You have 90 seconds to verify access from a new session and confirm. Confirmation enables a boot service for the committed policy; an unconfirmed policy is not persisted for boot. The independent helper works without the panel process and restores only the previous panel table. Transaction IDs and an OS-level transition lock prevent stale timers or concurrent confirmation from reverting a later change. If restoration fails, the helper retries and the unresolved state remains visible. Panel updates are blocked while a network change is pending.

### Network IDS

Suricata and its updater can be installed from the host's configured signed APT repositories, without adding a third-party repository. Existing Suricata installations are preserved; a separate panel-owned service is used. Preparation downloads the updater's configured signature feed (normally ET Open) and validates the configuration/signatures before service creation. Rule updates stage and validate new signatures and restart only the panel IDS, reverting its rule directory if the restart fails. Signature updates are explicit; they are not silently scheduled.

The service is passive, not inline IPS. It uses Linux AF_PACKET over detected active interfaces, including physical, loopback, bridge/veth and VPN interfaces where supported. Interface/address changes are checked every 30 seconds while the panel is running; changed capture configuration is validated before restarting only IDS. During that restart there is a monitoring gap. The native service uses a dynamic unprivileged identity, only CAP_NET_RAW, filesystem restrictions, a 1 GiB memory limit, a two-CPU quota and journal rate limits. Existing Suricata services, interfaces, NIC offload and routing are not changed. Running multiple sensors and capturing both bridge and veth interfaces can duplicate alerts and consume resources; monitor capture drops and actual load.

Production checksum validation remains enabled with automatic capture handling. A dedicated checksum-valid loopback UDP probe verifies signature processing without contacting real applications. A successful local probe does not prove every interface/path is captured. Offload, capture drops, CPU/memory limits, changing interfaces and encrypted payloads can limit detection. Alerts do not automatically block IPs. Inline signature-based IPS/NFQUEUE is not implemented in this release; the firewall provides explicit server-wide IP/port blocking.

No PCAP files, HTTP-body logs or packet payload logs are enabled. Alert/statistics metadata goes to the host journal, whose retention and access policy still need administration. Rate limits can drop messages during a flood. Captured traffic is not uploaded by the module; package and rule downloads contact their configured repositories/providers. The coverage page deliberately does not claim that installing a sensor or a running process secures all traffic.

### Additional verification

`node scripts/verify-network-guard.mjs` requires administrator authorization and performs blocking/counter/rollback tests inside isolated network namespaces; it never edits the host's live network rules. `node scripts/verify-waf-service.mjs --central` verifies wildcard-hostname forwarding and blocking in disposable WAF fixtures. Suricata configuration/signatures and actual checksum-valid UDP detection were separately exercised in an isolated Ubuntu 26.04 fixture with production checksum validation intact. Native systemd deployment and live-host capture still need verification after enabling the IDS through the UI.
