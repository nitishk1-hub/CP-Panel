> Historical development-topology observation, not a supported generic installation profile. Domain examples have been anonymized. Consult current installation/component guides.

# Observed topology and migration boundaries

Runtime discovery on 14 November 2026 found 1Panel and OpenResty, native
cloudflared and WireGuard, fourteen running application containers, one existing
BunkerWeb container and native panel-owned Suricata. Full interface/route/firewall
inventory is private runtime evidence under security-center/topology-inventory.json.
It contains no copied environment variables or tunnel tokens.

Cloudflare web ingress forwards example.com and its wildcard to 127.0.0.1:80;
SSH ingress separately targets local port 22. The existing owned loopback NAT
capture sends new HTTP origin connections to the BunkerWeb gateway. BunkerWeb
connects to the numeric Docker bridge host address on port 80, avoiding recapture.
OpenResty then selects the original application by hostname. Application ports,
Docker networks, 1Panel, cloudflared and WireGuard configuration are preserved.

Parallel Coraza binds only 127.0.0.1:19180, with the same reviewed numeric backend
address. It has not replaced the current live entry. Its admin socket is private
Unix-only. Native private PostgreSQL has no TCP listener. GeoLite City/ASN data are
local. World vector tiles are generated locally from public-domain Natural Earth
geography and served behind panel authentication; no external tile or visitor-IP
lookup calls are needed by the map.

Suricata passive capture includes detected active host/bridge/veth/VPN/loopback
interfaces. The same packet can appear on multiple interfaces; decoder counters
are not a unique-traffic meter. Flow records are completed or periodic sensor
records, not necessarily current active connections. Encrypted DNS/TLS payloads,
offload, packet loss and unsupported paths limit visibility. Current host sockets
are a separate namespace-specific view and do not establish Docker namespace
coverage. Native flow/DNS/TLS events have short configured retention.

The isolated IPS test queues only dedicated test UDP traffic inside an unshared
network namespace. It proves a real Suricata drop verdict and missing-sensor
bypass without changing any live host packet path. Expanding this into production
requires traffic-class selection, management exemptions, independent watchdog and
representative load/recovery qualification. Never queue every chain by assumption.

Native retirement migration: the owned local HTTP entry now targets Coraza on
127.0.0.1:19180 after comparing all five website responses and testing benign and
four malicious-pattern static requests. Only loopback is a trusted proxy for
CF-Connecting-IP; this assumes local proxy processes are trusted. Native CrowdSec
uses a private local API on 127.0.0.1:19580, migrated SQLite state, bounded redacted
HTTP logs and native Coraza decision remediation. The retired BunkerWeb Docker
container, its unreferenced image and its owned volume are removed only after
migration checks pass; a private recovery archive remains outside active services.
