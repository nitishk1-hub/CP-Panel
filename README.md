<div align="center">

# 🛡️ CP-Panel · by CyberPross
### The Enterprise Zero-Trust Linux Server Management & Autonomous AI Control Plane

[![Release: v0.2.0-rc.1](https://img.shields.io/badge/Release-v0.2.0--rc.1-blue.svg)](https://github.com/nitishk1-hub/CP-Panel/releases)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-green.svg)](LICENSE)
[![Node.js: >=24](https://img.shields.io/badge/Node.js-%3E%3D24_LTS-brightgreen.svg)](https://nodejs.org)
[![Security: Coraza WAF + CRS v4 + CrowdSec](https://img.shields.io/badge/Security-Coraza_WAF_%2B_CRS_v4_%2B_CrowdSec-amber.svg)](docs/WAF-AND-VAULT.md)
[![Zero-Trust Architecture](https://img.shields.io/badge/Architecture-0_Inbound_Ports_%7C_Cloudflare_Tunnel-blueviolet.svg)](docs/PANEL-ACCESS.md)
[![AI Control: 44 MCP Tools](https://img.shields.io/badge/AI_DevOps-44_MCP_Tools_%2B_OAuth2_PKCE-teal.svg)](docs/AI-CONNECTIONS.md)
[![Observability: Grafana 11 + Prometheus](https://img.shields.io/badge/Observability-Grafana_11_%2B_Prometheus-orange.svg)](docs/GRAFANA-PANEL-ARCHITECTURE.md)
[![Tests Passing: 17/17](https://img.shields.io/badge/Tests-17%2F17_Passing-success.svg)](tests/)

<p align="center">
  <b>CP-Panel</b> is a next-generation, high-performance, open-source Linux server management panel developed by <b>CyberPross</b>.<br>
  Built from the ground up for <b>Zero-Trust Privacy</b>, <b>Inline Coraza WAF Defense</b>, <b>Isolated Docker Orchestration</b>, <b>Multi-Channel Incident Dispatching</b>, and <b>Autonomous AI DevOps via Model Context Protocol (MCP)</b>.
</p>

[Quick Start](#-quick-start) • [Why CP-Panel?](#-why-cp-panel) • [Features](#-core-features--capabilities) • [44 MCP Tools](#-the-44-production-mcp-tools) • [Zero-Trust &amp; Direct DNS](#-dual-network-ingress-architecture) • [Documentation](#-documentation) • [FAQ](#-frequently-asked-questions-faq) • [License](#-license)

</div>

---

## 🌟 Why CP-Panel?

Traditional web hosting control panels (such as **cPanel**, **Plesk**, **1Panel**, **aaPanel**, or **CyberPanel**) typically mandate exposing raw management ports (such as `2083`, `8888`, or `8090`) and raw web ports (`80`, `443`) directly to the public internet. This leaves servers vulnerable to automated port scanners, credential brute-forcing, zero-day unauthenticated exploits, and DDoS floods.

**CP-Panel** redefines server administration around a modern, battle-tested security model:

| Dimension | Traditional Panels (cPanel / aaPanel / 1Panel) | CP-Panel (CyberPross) |
| :--- | :--- | :--- |
| **Firewall Inbound Ports** | Exposes 80, 443, 2083, 8888, 21, etc. | **0 Inbound Ports Open** (Strict loopback isolation via Cloudflare Tunnel) |
| **Web Application Firewall** | Basic ModSecurity or paid commercial plugins | **Coraza HTTP WAF** with OWASP Core Rule Set (CRS v4) built-in |
| **Intrusion Prevention** | Standalone Fail2ban with local-only knowledge | **CrowdSec LAPI** distributed global threat intelligence mesh |
| **AI Integration** | None, or basic text generation wrappers | **44 Production MCP Tools** with OAuth 2.0 PKCE & Streamable HTTP |
| **Runtime Isolation** | Shared root/user processes on host | **Containerized Sandbox Runtimes** (`node:24-bookworm-slim`, PHP, Python) |
| **Incident Notifications** | Rudimentary email alerts | **Centralized Dispatcher** (Telegram, Discord, Slack, HMAC Webhooks) |
| **Observability** | Basic system stats or paid third-party add-ons | **Embedded Grafana 11 & Prometheus** with adaptive low-load sampling |
| **Licensing** | Expensive recurring per-server or per-account fees | **100% Free & Open-Source (Apache License 2.0)** with zero telemetry |

---

## 🔒 Dual Network Ingress Architecture

CP-Panel offers **two supported public routing architectures**, allowing you to choose the exact topology that fits your infrastructure requirements:

### Mode A: Cloudflare Zero-Trust Tunnel (Recommended · 0 Inbound Open Ports)
* **Zero Public Attack Surface**: The server firewall (**UFW / nftables**) blocks all public inbound web ports (80, 443, 2087, 8787).
* **Outbound Wire**: The `cloudflared` daemon opens outbound TLS connections to Cloudflare's Edge Anycast network.
* **Why TLS info in Tunnel mode?**: In Tunnel mode, Cloudflare automatically terminates Edge SSL for your domain at Cloudflare Edge. The traffic then travels encrypted through the tunnel to internal loopback (`127.0.0.1:19180`) $\rightarrow$ Coraza WAF $\rightarrow$ application. Origin certificates are optional because the tunnel wire itself is encrypted end-to-end.

### Mode B: Direct DNS & Cloudflare API Automation (Non-Tunnel / Traditional IP)
If you decide **not** to use Cloudflare Tunnels and prefer direct DNS routing:
* **Automated Web DNS (A Records)**: In **System → Cloudflare Tunnel & DNS**, CP-Panel auto-detects your host's public IP and uses Cloudflare API to create or update `A` records with the **Orange Cloud Proxy** toggle (`proxied: true` for CDN/WAF/Edge SSL, or `proxied: false` for direct DNS).
* **Automated 1-Click Email DNS Suite**: Email protocols (SMTP on port 25/587, IMAP on port 993, POP3 on port 995) cannot be proxied through Cloudflare's HTTP CDN proxy. CP-Panel automatically provisions the complete email DNS suite:
  * **Mail Server A Record**: `mail.<domain>` pointing directly to your server IP (`proxied: false`).
  * **MX Record**: Priority 10 pointing to `mail.<domain>`.
  * **SPF Record (TXT)**: `v=spf1 mx a ip4:<server_ip> ~all` ensuring your server is authorized to send mail.
  * **DMARC Record (TXT)**: `_dmarc.<domain>` with customizable policy (`quarantine`, `none`, `reject`) and aggregate report routing.
  * **DKIM Record (TXT)**: `default._domainkey.<domain>` cryptographic signing key placeholder.
* **Automated Origin TLS (ACME DNS-01)**: Since direct connections reach your server, local TLS is mandatory. CP-Panel automatically requests and signs Let's Encrypt / ZeroSSL ECDSA certificates using Cloudflare DNS-01 TXT record verification.

```
                                  [ INTERNET ]
                                       │
                         Cloudflare Edge (WAF, DDoS, SSL)
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            │                                                     │
     [ Mode A: Outbound Tunnel ]                        [ Mode B: Direct DNS ]
            │                                                     │
            ▼                                                     ▼
┌────────────────────────────── SERVER / HOST ──────────────────────────────┐
│                                                                           │
│  [ cloudflared / direct IP ] ──► [ Coraza WAF Gateway (127.0.0.1:19180) ] │
│                                         │                                 │
│                                         ▼                                 │
│  [ CP-Panel Core Engine ] ──► [ Privileged Agent (Unix Domain Socket) ]   │
│        │                                   │                              │
│        ├─► Docker Compose & Containers     ├─► Systemd Service Control    │
│        ├─► Isolated Web Sandboxes (Node)   ├─► Atomic Transactional FS    │
│        ├─► Embedded Grafana 11 Dashboard   ├─► Cloudflare DNS Automation  │
│        ├─► Incident Dispatcher (Webhooks)  ├─► 1-Click Email DNS Suite    │
│        └─► 44 Remote MCP AI Tools          └─► Automated Service Recovery │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Core Features & Capabilities

### 🛡️ 1. Enterprise Cybersecurity & Threat Defense
* **Coraza HTTP WAF**: Native Web Application Firewall executing OWASP Core Rule Set v4 rulesets in real time to neutralize SQLi, XSS, RCE, SSRF, and LFI attacks.
* **CrowdSec LAPI Integration**: Active bouncer (`panel-coraza-bouncer`) pulling community blocklists and enforcing IP bans at the gateway layer.
* **Interactive 3D Threat Origin Map**: WebGL vector map clustering attack vectors with real-time ASN, country, and city geolocation intelligence.
* **Per-Domain Virtual Host WAF Rules**: Configure WAF enforcement per domain (`Enforce`, `Audit`, `Bypass`) and manage false-positive rule exclusions (`panel_waf_exempt`) with automatic configuration rollbacks.
* **Container Network Isolation**: Strict container network policies (e.g. `enable_icc=false` bridge networks) preventing untrusted workloads from communicating with host loopback or internal services.

### 🤖 2. Autonomous AI DevOps & Model Context Protocol (MCP)
* **43 Production-Ready MCP Tools**: Full operational surface for AI clients (ChatGPT, Claude Code, Cursor, Windsurf, Antigravity) to develop, build, test, deploy, and monitor servers without unrestricted shell exposure.
* **OAuth 2.0 with PKCE & Streamable HTTP**: Industry-standard, secure OAuth 2.0 authorization code flow with S256 PKCE protection and cryptographic token rotation.
* **Transactional File Safety**: Every file edit (`panel_file_edit`) executes preflight syntax checks, atomic write-and-replace, and automatic rollback upon validation failure.
* **Graphify Knowledge Graph**: Semantic AST graph index optimizing repository navigation for AI models, cutting token consumption by **35.4x–77.8x**.

### 📢 3. Next-Gen Incident Notification & Alert Command Center
* **Unified Multi-Channel Dispatcher**: Native webhook dispatchers for **Telegram**, **Discord**, **Slack**, and **Custom Generic Webhooks**.
* **Cryptographic HMAC Security**: Custom webhooks sign alert payloads with `X-Panel-Signature-256` HMAC-SHA256 headers for zero-trust receiver verification.
* **Granular Severity Filtering**: Filter alert triggers by severity:
  * 🔴 **CRITICAL**: System outages, container crashes, disk exhaustion (>90%), WAF attack spikes.
  * 🟡 **WARNING**: High CPU/RAM utilization (>85%), backup retries, SSL renewal warnings.
  * 🔵 **INFO**: Successful deployments, automated service restarts, system maintenance.
* **Live Message Previews**: Real-time interactive UI previews showing exactly how formatted alert cards appear in Telegram MarkdownV2 and Discord Rich Embeds.
* **1-Click Broadcast Diagnostics**: Instant test broadcast button to verify all configured notification channels simultaneously.

### 🐳 4. Docker Orchestration & 1-Click App Catalog
* **Full Container Lifecycle**: Start, stop, restart, pause, inspect, and stream live container logs.
* **Visual Compose Studio**: Multi-file Docker Compose workspace with syntax linting, YAML validation, environment variable management, and drift detection.
* **Curated 1-Click App Store**: Instant zero-configuration deployments for PostgreSQL, MySQL, Redis, Nginx, SearXNG, n8n, Jellyfin, WordPress, Nextcloud, and more.
* **Private Image Registries**: Native authentication for Docker Hub, GitHub Container Registry (`ghcr.io`), AWS ECR, and private registries.

### 🌐 5. Modern Web Engine & Containerized Sandboxes
* **Multi-Language Hosting**: Deploy Node.js, Python WSGI/ASGI, PHP-FPM, and static sites with zero manual configuration.
* **Host vs. Sandbox Runtime Isolation**: The panel runs securely on host Node.js v24 LTS while user applications run in isolated, rootless container sandboxes (`node:24-bookworm-slim`), completely isolating user code from the host filesystem.
* **Atomic Zero-Downtime Deployments**: Symlink-based atomic switching with automated rollback on healthcheck failure.
* **Automated SSL/TLS (ACME)**: Cloudflare Edge SSL termination or automated Let's Encrypt / ZeroSSL certificate issuance with automatic 60-day renewal.

### 📊 6. Observability & Autonomous Self-Healing
* **Grafana 11 & Prometheus**: Embedded dashboards (`CyberPross Server Overview` and `Security Center`) pre-provisioned out of the box.
* **Adaptive Low-Load Polling**: Intelligent telemetry scraping (15s, 30s, 60s intervals) minimizing resource overhead on low-spec VPS hosts.
* **Autonomous Health Supervisor**: Continuously checks systemd services, Docker containers, disk inodes, and HTTP endpoints with automated restart policies and 15-minute cooldown safety caps.

---

## 🛠️ The 44 Production MCP Tools

CP-Panel exposes **44 purpose-built MCP tools** divided into 7 functional domains, enabling AI agents to act as trusted, autonomous DevOps copilots:

| Domain | Tools | Description |
| :--- | :--- | :--- |
| **System & Daemon Control** | `panel_systemd`, `panel_nginx`, `panel_docker`, `panel_compose`, `panel_cloudflare`, `panel_coraza`, `panel_crowdsec` | Supervised management of systemd units, Nginx vhosts, Docker containers, Compose stacks, Cloudflare Tunnel, Coraza WAF, and CrowdSec LAPI. |
| **Developer & Sysadmin Tools** *(NEW)* | `panel_apt`, `panel_git`, `panel_docker_build`, `panel_test_runner`, `panel_cloudflare_dns` | Safe APT package management (search, info, simulation `-s`, upgrade), Git repository lifecycle (clone, pull, status, diff, branch), Docker image building with custom build-args, isolated rootless test execution (`--network none`), and Cloudflare DNS automation for direct-IP setups (A records, Orange Cloud proxy, 1-click Email DNS suite, and DNS-01 ACME certs). |
| **Security & Network Audit** *(NEW)* | `panel_security_inspect`, `panel_network_inspect`, `panel_waf_exempt` | Structured read-only inspection of Coraza WAF rulesets, CrowdSec decisions & active bouncers, Suricata alerts, active listening sockets (`ss -tulpn`), UFW rules, and Cloudflare ingress routes. |
| **Web Hosting & Deployments** | `panel_static_preview`, `panel_static_deploy`, `panel_proxy_create`, `panel_website_import`, `panel_ssl_acme` | Preview directories, deploy static sites with atomic symlink swaps, configure reverse proxies, import multi-runtime websites, and automate ACME SSL issuance. |
| **Transactional File Studio** | `panel_file_upload`, `panel_file_owner`, `panel_file_permissions`, `panel_file_read`, `panel_file_edit`, `panel_file_restore`, `panel_transactions` | Atomic file operations up to 1 MiB with preflight validation, path traversal guards, private transactional snapshots, and instant rollback. |
| **Durable Task Execution** | `panel_exec`, `panel_operations`, `panel_operation`, `panel_operation_logs`, `panel_discover`, `panel_read`, `panel_manage`, `panel_command` | Execute root-capable background jobs through the privileged agent socket with durable operation tracking, signal monitoring, and chunked log streaming. |
| **Infrastructure & Alerts** | `panel_app_catalog`, `panel_app_deploy`, `panel_backup_cloud`, `panel_cron_manage`, `panel_health_policy`, `panel_health`, `panel_grafana`, `panel_graph`, `panel_notification_test` | 1-click Docker app deployments, S3 cloud backups (AWS S3, R2, MinIO), cron scheduling, autonomous self-healing, Grafana dashboards, Graphify knowledge graph queries, and multi-channel incident notifications. |

### Connecting External AI Clients to CP-Panel

#### 1. ChatGPT / OpenAI Codex / Custom GPTs
In your ChatGPT Custom GPT or Action configuration, provide your MCP endpoint URL:
```text
https://cyber.cyberpross.cc/mcp
```
Choose **OAuth 2.0** authentication with Authorization Code Flow (`PKCE`). CP-Panel handles the OAuth handshake and token management automatically.

#### 2. Claude Desktop / Claude Code
Add CP-Panel to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "cp-panel": {
      "url": "https://cyber.cyberpross.cc/mcp"
    }
  }
}
```

#### 3. Cursor / Windsurf / Antigravity IDE
Add the remote MCP server URL in **Settings → Features → MCP Servers**:
* **Name**: `CP-Panel`
* **Type**: `SSE / Streamable HTTP`
* **URL**: `https://cyber.cyberpross.cc/mcp`

---

## 🚀 Quick Start

### System Requirements
* **Operating System**: Ubuntu 24.04 LTS / 22.04 LTS or Debian 12 / 13 (x86_64 / arm64)
* **Hardware**: Minimum 1 vCPU, 1 GB RAM, 10 GB Disk space
* **System Utilities**: `curl`, `systemd`

### 1-Line Automated Installation
Run the official CyberPross universal installer:

```bash
curl -fsSL https://raw.githubusercontent.com/nitishk1-hub/CP-Panel/main/install.sh | sudo bash
```

The installer will:
1. Validate system prerequisites and required packages.
2. Install Node.js (v24 LTS) and Docker Engine (if not already installed).
3. Pre-cache the isolated website container sandbox (`node:24-bookworm-slim`).
4. Download and cryptographically verify the release using native **Ed25519 signatures**.
5. Configure systemd services (`server-panel.service` and `server-panel-agent.service`).
6. Secure private recovery credentials in `/etc/server-panel/recovery/` with mode `0700`.
7. Output initial administrator credentials and the emergency recovery code.

---

### Manual Installation & Development Setup

To build and run CP-Panel from source:

```bash
# 1. Clone repository
git clone https://github.com/nitishk1-hub/CP-Panel.git
cd CP-Panel

# 2. Install production dependencies and build UI bundles
npm ci
npm run build:tools

# 3. Run full automated test suite (16/16 tests passing)
npm test

# 4. Initialize administrator credentials
npm run first-run

# 5. Start panel daemon
npm start
```

Access the panel in your browser at:  
👉 **`http://127.0.0.1:8787`** (or through your configured Cloudflare Tunnel domain).

---

## 📚 Documentation

Comprehensive architectural and configuration guides:

| Guide | Description |
| :--- | :--- |
| [**Installation Guide**](docs/INSTALLATION.md) | Universal installer, offline setup, and upgrade procedures |
| [**Panel Access & Tunnels**](docs/PANEL-ACCESS.md) | Zero-trust Cloudflare Tunnel setup and loopback routing |
| [**WAF & Threat Defense**](docs/WAF-AND-VAULT.md) | Coraza WAF, OWASP CRS v4 rulesets, and CrowdSec bouncer |
| [**AI Connections & MCP**](docs/AI-CONNECTIONS.md) | Model Context Protocol setup, OAuth 2.0 PKCE, and tool reference |
| [**Grafana Observability**](docs/GRAFANA-PANEL-ARCHITECTURE.md) | Embedded Grafana 11 dashboards, datasources, and Prometheus |
| [**Native Web Engine**](docs/NATIVE-WEB-ENGINE.md) | Multi-runtime hosting, reverse proxies, and container sandboxes |
| [**Cloud Backups & S3**](docs/BACKUP-AND-RECOVERY.md) | Encrypted S3 snapshots and disaster recovery workflows |
| [**Release Verification**](docs/RELEASE-PROCESS.md) | Ed25519 signature generation and checksum validation |

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>1. How does CP-Panel compare to cPanel, aaPanel, or 1Panel?</b></summary>
<br>
Unlike traditional panels that expose management ports (2083, 8888, 8090) and raw web ports (80, 443) directly to the public internet, CP-Panel is strictly <b>Zero-Trust and Cloudflare Tunnel-first</b>. It requires <b>zero open inbound firewall ports</b>, includes enterprise-grade Coraza WAF (CRS v4) and CrowdSec out of the box, and provides <b>44 production MCP tools</b> enabling external AI agents to manage servers safely.
</details>

<details>
<summary><b>2. Why does CP-Panel have TLS/SSL settings if it runs via Cloudflare Tunnel? What if I prefer the Direct DNS method?</b></summary>
<br>
When running in <b>Mode A (Cloudflare Tunnel)</b>, Cloudflare Edge automatically handles and terminates public HTTPS/SSL at Cloudflare's edge network for free, then tunnels traffic down an outbound encrypted wire into loopback. In that mode, local origin TLS certificates are optional.<br><br>
However, if you choose <b>Mode B (Direct DNS / Non-Tunnel)</b>, visitors connect directly to your server's public IP address. In that mode, local TLS/SSL certificates are <b>mandatory</b> for HTTPS encryption and Cloudflare Full/Strict SSL proxying. CP-Panel automatically manages both paths: it includes a full <b>Cloudflare API automation suite</b> that creates <code>A</code> records, configures <b>1-Click Email DNS (MX, SPF, DMARC, DKIM)</b>, and issues trusted Let's Encrypt / ZeroSSL certificates via Cloudflare DNS-01 API challenges with zero manual effort.
</details>

<details>
<summary><b>3. Do I need to open port 80 or 443 on my firewall?</b></summary>
<br>
If you use <b>Mode A (Cloudflare Tunnel)</b>: <b>No.</b> All public inbound firewall ports (including 80, 443, 2087, and 8787) can remain completely closed.<br>
If you use <b>Mode B (Direct DNS)</b>: You will need ports 80 and 443 open for web traffic, while CP-Panel itself remains protected behind Coraza WAF.
</details>

<details>
<summary><b>3. Is Node.js installed on the host or inside a container?</b></summary>
<br>
Both! CP-Panel's control plane runs on the host using <b>Node.js v24 LTS</b>, while user websites and applications run inside <b>isolated container sandboxes</b> (such as <code>node:24-bookworm-slim</code>). This architecture prevents customer web applications from interfering with host processes, systemd services, or panel files.
</details>

<details>
<summary><b>4. How does MCP authentication work?</b></summary>
<br>
CP-Panel implements the official Model Context Protocol specification with <b>OAuth 2.0 and PKCE (RFC 7636)</b> over Streamable HTTP. Clients authenticate against standard OAuth endpoints (<code>/.well-known/oauth-authorization-server</code>, <code>/authorize</code>, <code>/token</code>) with short-lived tokens, granular scopes (<code>read</code>, <code>manage</code>, <code>command</code>), and token rotation.
</details>

<details>
<summary><b>5. Is CP-Panel completely free and open-source?</b></summary>
<br>
<b>Yes.</b> CP-Panel is licensed under the permissive <b>Apache License 2.0</b>. There are no enterprise paywalls, no artificial container limits, and no telemetry tracking.
</details>

---

## 🤝 Contributing

We welcome contributions from the open-source community!
1. Read the [**Contributing Guide**](CONTRIBUTING.md).
2. Adhere to our [**Code of Conduct**](CODE_OF_CONDUCT.md).
3. Report security vulnerabilities per [**SECURITY.md**](SECURITY.md).

---

## 📄 License

CP-Panel is open-source software licensed under the **[Apache License 2.0](LICENSE)**.  
Copyright © 2026 **CyberPross**.
