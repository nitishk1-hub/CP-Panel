> Historical BunkerWeb implementation; superseded by native Coraza. Not installation guidance.

# Dedicated WAF / IDS console

This replaces the earlier custom WAF gateway and duplicate network-security screens. The existing System firewall, networking, Docker management, websites, identity and Vault remain separate.

## Components and controls

- BunkerWeb Community 1.6.17 all-in-one image, pinned to publisher digest af2f9ab5e89b2bb3ab344f203ad6b16285d73f31cbb3ebc2e17680043e76cb9b: ModSecurity/OWASP CRS, local CrowdSec, Redis, local administrator UI and internal authenticated control API. No Docker socket is mounted; ports are loopback-only, capabilities are dropped, CPU is capped at two cores, memory at 1536 MiB and logs are rotated.
- Suricata 8 from configured signed APT repositories, using the panel-owned dynamic-user service with only CAP_NET_RAW, filesystem restrictions, a 1 GiB memory limit and two-CPU quota. It captures detected active host, Docker/veth/bridge, loopback and VPN interfaces; changes are checked every 30 seconds. Native multi-interface workers, journal output and a checksum-correct local UDP detection probe are used. Checksum validation remains automatic/enabled. Offload, capture drops, resource limits, encrypted payloads and interface changes can create gaps.
- A separate timed-response nftables table can block repeated public-source IDS threats on host input, output and routed/forwarded paths. It never flushes UFW, Docker, VPN or unrelated tables. No generic firewall editor is added here.

Off bypasses the local web-security entry to the original engine, requests disabled web prevention, stops packet capture and clears only this module's response bans. The provider stays available for retained reports and management. Monitor routes new ingress connections through web detection and starts IDS without automated host bans. Block verifies local WAF and IDS probes, routes new connections through prevention and enables timed responses. Three distinct recent flows from the same public source, each with severity-1 inbound IDS alerts, can produce a 15-minute block. Private, loopback, reserved and protected host addresses are excluded. This is alert-driven response, not universal inline signature IPS or container process/file monitoring. False positives remain possible.

## Local ingress and availability

The stable local ingress is http://127.0.0.1:18180. The private BunkerWeb inspection backend is normally 18190; the original OpenResty backend remains 80. A dedicated loopback-only OUTPUT NAT table selects direct forwarding or inspection. It does not alter public ports, application configuration, Docker networks or VPN routes. Existing connections may keep their prior path until they reconnect; new connections use the new mode. This is not instantaneous retroactive inspection of existing sessions.

On reboot the entry initially bypasses to the original engine for availability. The panel restores a saved Monitor/Block route only after the provider and local detection probes are verified. If the provider becomes unhealthy, the watcher switches new connections to the original engine while reporting degraded protection, then verifies recovery before restoring inspection. This deliberately favors application availability over fail-closed security. It can leave an inspection gap. Do not interpret a requested mode as verified coverage; the console distinguishes unverified/warming states.

External HTTPS/Cloudflare traffic still must be sent through the stable local entry. Direct backend ports and alternate ingress paths bypass WAF. Existing legacy entry users keep the same local address through the migration. A localhost-only console cannot be assumed reachable from another computer.

## Map and event data

The map is bundled Natural Earth public-domain country geometry, rendered locally. No third-party map tile or public IP lookup API receives visitor addresses. BunkerWeb's local country database enriches WAF records and eligible public IDS sources. Locations are approximate IP countries (often a proxy/VPN exit), never an attacker's verified physical location. Private, unknown and untrusted-proxy origins remain unmapped. Countries, tables and counts are based on retained observations, not invented traffic. The dashboard reads up to the latest 1,000 retained WAF records and recent IDS journal events; this is not complete traffic accounting or forensic retention.

Only selected event fields leave the provider: source IP/country, time, method, path without query, target, reason and action. Raw payloads, headers and tokens are not returned by this interface. Native provider storage/logs still need protection and retention administration; a root administrator controls the host. Kernel ban timeouts expire independently of the panel process.

For Cloudflare Tunnel, trust CF-Connecting-IP only from the verified host Docker gateway used by the local connector. Never trust arbitrary Internet-supplied forwarded headers. The current host was configured for its existing active local Cloudflare connector. Wrong proxy trust can falsify locations or cause incorrect bans.

## Preinstallation

The supported installer runs scripts/prepare-protection.mjs after release verification and completed administrator setup. It preinstalls the pinned provider, initializes a separately generated private local console administrator, verifies Off-mode forwarding, prepares Suricata/rules, and leaves prevention and capture off. Missing Docker/nftables may be installed from configured signed Ubuntu repositories; existing-package upgrades/removals are refused for review. Existing daemons and settings are preserved. Initial package/rule/image downloads need network access and can take several minutes. This is not an offline bundle and unsupported hosts remain blocked rather than silently using untrusted installers.

Bootstrap console credentials are revealed only to a panel administrator through an explicit confirmed action, never job output. Change that initial password and enable vendor-console MFA. The provider UI uses the dedicated security-console.localhost hostname and a separate origin. A different port alone would not isolate host-only cookies, so the root panel hostname is not reused. The internal API is not published; its credentials stay private. CrowdSec Central API sharing, BunkerNet and anonymous reporting are disabled. Package/rule/GeoIP downloads still contact their configured publishers.

Back up the private panel configuration, BunkerWeb's separately owned Docker data volume, and required recovery credentials using a tested procedure. Presence of a volume does not prove a successful restore. Existing OS/container vulnerabilities are not fixed by adding WAF/IDS, and no production-security or absence-of-flaws guarantee is made.

## Verification

Functional checks cover Off/Monitor/Block/Off with a dedicated static canary (no attack requests sent to application backends), actual native IDS detection and sandbox startup, isolated local-entry routing switches, kernel timed-ban set syntax and authorization boundaries. scripts/verify-protection-entry.mjs requires administrator authorization but performs all network changes inside a fresh network namespace. It does not modify live host routing. Clean-host installation across every supported target and independent adversarial review remain separate release qualifications.

Sources: https://docs.bunkerweb.io/latest/integrations/ ; https://github.com/bunkerity/bunkerweb ; https://docs.suricata.io/ .

## Verified exploit-signature blocking

The local validation now requires a normal request to pass and representative XSS,
SQL-injection, command-injection and path-traversal requests to return HTTP 403 in
Block mode. Monitor and Off require those samples to pass. Tests use a dedicated
static canary and never send exploit samples to application backends. These four
samples are evidence of effective enforcement, not coverage of every exploit.

An optional host-owned nftables OUTPUT rule captures new IPv4 HTTP connections to
exactly `127.0.0.1:<originPort>` in Monitor / Block mode. This covers a local
Cloudflare connector that already uses that origin, without changing its remote
configuration or restarting its SSH routes. The WAF's numeric Docker-gateway
backend address remains outside this capture, avoiding a proxy loop. Off removes
origin capture and restores the stable gateway's direct backend path. The provider
health watchdog also bypasses inspection if the provider becomes unavailable;
this prioritizes availability and must not be presented as fail-closed protection.

Existing connections retain their previous route until reconnect. Direct public
addresses, other loopback addresses, IPv6, other ports and independently terminated
TLS are not covered by this capture. Configure their trusted ingress explicitly.
Suricata is an IDS with timed responses to repeated severe public-source alerts,
not an inline IPS that rejects every first packet. Encrypted payloads are not
inspected by the IDS. Vulnerability findings remain valid even when a WAF blocks
representative exploitation attempts; they must not be relabeled as patched.
