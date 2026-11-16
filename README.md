<div align="center">

# 🛡️ CP-Panel · by CyberPross
### The Open-Source, Zero-Trust Linux Server Management & Cloud Hosting Control Plane

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js: >=24](https://img.shields.io/badge/Node.js-%3E%3D24-brightgreen.svg)](https://nodejs.org)
[![Security: Coraza WAF + CRS v4 + CrowdSec](https://img.shields.io/badge/Security-Coraza_WAF_%2B_CRS_v4_%2B_CrowdSec-amber.svg)](docs/WAF-AND-VAULT.md)
[![Architecture: Zero-Trust Loopback Tunnel](https://img.shields.io/badge/Architecture-Cloudflare_Tunnel_First-blueviolet.svg)](docs/PANEL-ACCESS.md)
[![AI Integration: MCP + OpenRouter](https://img.shields.io/badge/AI-Model_Context_Protocol_%2B_OpenRouter-teal.svg)](docs/AI-CONNECTIONS.md)
[![Monitoring: Grafana 11 + Prometheus](https://img.shields.io/badge/Observability-Grafana_11_%2B_Prometheus-orange.svg)](docs/GRAFANA-PANEL-ARCHITECTURE.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<p align="center">
  <b>CP-Panel</b> is a next-generation, high-performance, open-source Linux server management panel developed by <b>CyberPross</b>.<br>
  Engineered from the ground up for zero-trust privacy, enterprise WAF defense, Docker container orchestration, native web hosting, and AI-driven autonomous DevOps.
</p>

[Quick Start](#-quick-start) • [Key Features](#-features--capabilities) • [Architecture](#-zero-trust-architecture) • [Documentation](#-documentation) • [FAQ](#-frequently-asked-questions-faq) • [License](#-license)

</div>

---

## 🌟 Why CP-Panel?

Traditional web hosting control panels (such as **cPanel**, **Plesk**, **1Panel**, **aaPanel**, or **CyberPanel**) typically require exposing raw management ports (like 2083, 8888, or 8090) directly to the public internet, exposing your servers to automated port-scanners, brute-force attacks, and unauthenticated exploits.

**CP-Panel** fundamentally redesigns server administration around **Zero-Trust Loopback Isolation**:
* **Zero Publicly Exposed Ports**: The panel binds strictly to internal loopback (`127.0.0.1:8787`). Public access routes securely through Cloudflare Tunnels (`cloudflared`) with zero firewall ports open (no 80, 443, or management ports).
* **Enterprise Security First**: Built-in **Coraza HTTP WAF** with OWASP Core Rule Set (CRS v4), **CrowdSec** global threat intelligence, **Suricata IDS** deep packet inspection, and an interactive WebGL live threat map.
* **100% Free & Open-Source**: Licensed under the **Apache License 2.0**. No paywalled features, no artificial container limits, and zero external telemetry.
* **AI & Agent-Native**: Features an embedded **Model Context Protocol (MCP)** server with **37 tools** and direct integration with **OpenRouter AI** (Claude 3.5 Sonnet, DeepSeek R1, GPT-4o, Llama 3.3) and local **Graphify** semantic knowledge graphs.

---

## ⚡ Features & Capabilities

### 🛡️ 1. Enterprise Cybersecurity Command Center
* **Coraza HTTP WAF**: Native Web Application Firewall enforcing OWASP CRS v4 signatures against SQL Injection (SQLi), Cross-Site Scripting (XSS), Local File Inclusion (LFI), and Remote Code Execution (RCE).
* **CrowdSec LAPI Integration**: Distributed community-powered IP reputation mesh that automatically blocks aggressive port scanners and malicious crawlers.
* **Interactive Threat Origin Map**: MapLibre GL WebGL vector map clustering attack origins in real time with ASN, country, and city geolocation intelligence.
* **Rapid IP Triage**: Instant one-click IP unblock, trusted allowlisting, and temporary or permanent ban management.
* **Virtual Host WAF Rules**: Per-domain WAF mode selection (Enforce, Audit, Bypass) and false-positive rule exclusion manager with automated rollback.

### 🐳 2. Docker Orchestration & 1-Click App Store
* **Container Lifecycle Management**: Start, stop, restart, inspect, view live logs, and access container terminals.
* **Visual Compose Studio**: Multi-file Docker Compose workspace with YAML linting, environment variable injection, and automated drift detection.
* **Network & Volume Manager**: Create, isolate, and prune bridge/overlay networks and persistent volumes.
* **1-Click Application Store**: Deploy popular open-source software (PostgreSQL, MySQL, Redis, Nginx, SearXNG, n8n, Jellyfin, WordPress, Nextcloud, and more) with one click.
* **Private Image Registries**: Seamless authentication for Docker Hub, GitHub Container Registry (ghcr.io), AWS ECR, and self-hosted registries.

### 📊 3. Embedded Observability (Grafana 11 + Prometheus)
* **Pre-Configured Dashboards**: Pre-provisioned `CyberPross Server Overview` and `Security Center` dashboards embedded natively inside the panel.
* **Prometheus Time-Series Metrics**: Automatic scraping of CPU, RAM, disk I/O, network bandwidth, container metrics, and WAF drops.
* **Low-Load Adaptive Polling**: Configurable polling intervals (15s, 30s, 60s) with low-load mode to preserve host resources.
* **Autonomous Health Monitor**: Continuous monitoring of systemd units, Docker healthchecks, and HTTP endpoints with automated self-healing restart policies.

### 🤖 4. AI Copilot & Model Context Protocol (MCP)
* **OpenRouter AI Integration**: Connect any state-of-the-art LLM via OpenRouter (Claude 3.5 Sonnet, DeepSeek V3/R1, Llama 3.3 70B, GPT-4o).
* **Model Context Protocol (MCP) Server**: 37 production-ready tools allowing external agents (Antigravity, Claude Code, Cursor) to manage containers, inspect logs, deploy static sites, and query server health.
* **Graphify Knowledge Graph**: Graph-based AST index reducing token consumption by **35.4x–77.8x** for intelligent server diagnosis and troubleshooting.

### 🌐 5. Modern Web Engine & Reverse Proxies
* **Multi-Runtime Hosting**: Host Reverse Proxies, Static Websites, Node.js applications, Python WSGI/ASGI apps, and PHP-FPM environments.
* **Zero-Downtime Deployments**: Atomic symlink exchange with automatic rollback upon HTTP health check failure.
* **Automated SSL/TLS**: Cloudflare Edge SSL termination or automated Let's Encrypt / ACME certificate issuance.

### 📁 6. Advanced File Manager & Web Terminal
* **File Studio**: Visual directory explorer, file editor with syntax highlighting, permissions (`chmod`/`chown`), compressed archive extraction (`.tar.gz`, `.zip`), and trash can recovery.
* **Multi-Tab Web Terminal**: Full-featured xterm.js terminal with split-pane support, custom color themes, and ANSI/UTF-8 rendering.

### 💾 7. S3 Cloud Backups & Automation
* **S3-Compatible Cloud Backups**: Encrypted AES-256-GCM backups to AWS S3, Cloudflare R2, MinIO, or Backblaze B2.
* **Crontab Task Scheduler**: Visual cron expression editor with execution logging and failure notifications.
* **Multi-Channel Alerts**: Webhook alerts delivered to Telegram, Discord, Slack, and email.

---

## 🚀 Quick Start

### System Requirements
* **Operating System**: Ubuntu 24.04 LTS / 22.04 LTS or Debian 12 / 13 (x86_64 / arm64)
* **Hardware**: Minimum 1 vCPU, 1 GB RAM, 10 GB Disk space
* **Dependencies**: `curl`, `systemd`

### 1-Line Automated Installation
Run the official CyberPross universal installer:

```bash
curl -fsSL https://raw.githubusercontent.com/nitishk1-hub/CP-Panel/main/install.sh | sudo bash
```

The installer will:
1. Validate system prerequisites and dependencies.
2. Install Node.js (v24 LTS) and Docker engine (if not present).
3. Download and cryptographically verify the signed CP-Panel release.
4. Configure systemd services (`server-panel.service` and `server-panel-agent.service`).
5. Generate an initial administrator username, password, and emergency recovery code.

---

### Manual Installation & Development Setup

If you prefer installing from source or contributing to development:

```bash
# 1. Clone the repository
git clone https://github.com/nitishk1-hub/CP-Panel.git
cd CP-Panel

# 2. Install production dependencies and build UI bundles
npm ci
npm run build:tools

# 3. Run automated unit test suite (All tests passing)
npm test

# 4. Initialize first-run administrator credentials
npm run first-run

# 5. Start the development server
npm start
```

Access the panel in your browser at:  
👉 **`http://127.0.0.1:8787`** (or through your configured Cloudflare Tunnel domain).

---

## 🔒 Zero-Trust Architecture

```
                                  [ INTERNET ]
                                       │
                         Cloudflare Edge (WAF, DDoS, SSL)
                                       │
                      Cloudflare Tunnel (Encrypted Wire)
                                       │
┌────────────────────────────── SERVER / HOST ──────────────────────────────┐
│                                                                           │
│  [ cloudflared ] (Loopback connector · Zero open firewall ports)          │
│        │                                                                  │
│        ▼ (127.0.0.1:19180)                                                │
│  [ Coraza WAF Gateway ] (OWASP Core Rule Set v4 inspection)               │
│        │                                                                  │
│        ▼ (127.0.0.1:8787)                                                 │
│  [ CP-Panel Core Engine ] ──► [ Privileged Agent (Unix Domain Socket) ]   │
│        │                                   │                              │
│        ├─► Docker Compose & Containers     ├─► Systemd Service Control    │
│        ├─► Web Engine (Node, Python, PHP)  ├─► File System (Atomic Ops)   │
│        ├─► Embedded Grafana 11 Dashboard   ├─► Suricata IDS Inspection    │
│        └─► OpenRouter AI / MCP Server      └─► CrowdSec LAPI Threat Mesh  │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 📚 Documentation

Detailed architectural and administration guides are available in the [`docs/`](docs/) directory:

| Document | Description |
| :--- | :--- |
| [**Installation Guide**](docs/INSTALLATION.md) | Comprehensive installation, upgrade, and dependency guide |
| [**Panel Access & Tunnels**](docs/PANEL-ACCESS.md) | Configuring Cloudflare Tunnels and remote management |
| [**WAF & Threat Defense**](docs/WAF-AND-VAULT.md) | Coraza WAF rulesets, CrowdSec LAPI, and Suricata IDS |
| [**Grafana Observability**](docs/GRAFANA-PANEL-ARCHITECTURE.md) | Embedded Grafana dashboards, datasources, and Prometheus |
| [**AI Connections & MCP**](docs/AI-CONNECTIONS.md) | OpenRouter AI setup, Model Context Protocol tools, and Graphify |
| [**Native Web Engine**](docs/NATIVE-WEB-ENGINE.md) | Reverse proxy configuration and runtime environments |
| [**Cloud Backups & S3**](docs/BACKUP-AND-RECOVERY.md) | Encrypted S3 snapshots and disaster recovery procedures |
| [**Release Verification**](docs/RELEASE-PROCESS.md) | Cryptographic Ed25519 signature verification |

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>1. How is CP-Panel different from cPanel, aaPanel, or 1Panel?</b></summary>
<br>
Unlike conventional hosting panels that rely on exposing unencrypted management ports to the internet, CP-Panel is strictly <b>Zero-Trust and Cloudflare Tunnel-first</b>. It requires zero open firewall ports, includes enterprise-grade security tools (Coraza WAF and CrowdSec) out of the box, and provides native AI copilot tools through the Model Context Protocol (MCP).
</details>

<details>
<summary><b>2. Do I need to open port 80 or 443 on my firewall?</b></summary>
<br>
<b>No.</b> CP-Panel works natively with Cloudflare Tunnels (<code>cloudflared</code>). Outbound encrypted tunnels connect your server to Cloudflare's edge network, meaning you can block all inbound ports on your firewall (including 80, 443, and 8787) while maintaining full HTTPS public access.
</details>

<details>
<summary><b>3. Which AI models and providers are supported?</b></summary>
<br>
CP-Panel natively integrates with <b>OpenRouter AI</b>, giving you access to 200+ models including Claude 3.5 Sonnet, DeepSeek R1, OpenAI GPT-4o, and Meta Llama 3.3. It also supports local offline Graphify AI graphs without external API requirements.
</details>

<details>
<summary><b>4. Is CP-Panel completely free and open-source?</b></summary>
<br>
<b>Yes.</b> CP-Panel is released under the permissive <b>Apache License 2.0</b>. There are no enterprise tiers, no locked features, and no subscription fees.
</details>

---

## 🤝 Contributing

We welcome contributions from the open-source community! Whether you are reporting a bug, improving documentation, or submitting a feature pull request:

1. Read our [**Contributing Guide**](CONTRIBUTING.md).
2. Adhere to our [**Code of Conduct**](CODE_OF_CONDUCT.md).
3. Report security vulnerabilities responsibly per [**SECURITY.md**](SECURITY.md).

---

## 📄 License

CP-Panel is open-source software licensed under the **[Apache License 2.0](LICENSE)**.  
Copyright © 2026 **CyberPross**.
