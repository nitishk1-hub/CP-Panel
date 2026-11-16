# CyberPross Architecture: Panel vs. Grafana Division & Offload Guide

## Executive Summary
To ensure CyberPross Server Panel remains ultra-responsive, lightweight, and low-latency while managing high-traffic production workloads, a clear separation of concerns is maintained between the **Operational Control Plane (CyberPross Panel)** and the **Observability & Analytics Plane (Grafana + Prometheus + Loki)**.

All components used are **100% free and open-source**.

---

## 1. Workload Separation: What Stays in the Panel vs. What Moves to Grafana

```
┌─────────────────────────────────────────────────────────┐
│              CyberPross Server Panel                    │
│             (Operational Control Plane)                 │
├─────────────────────────────────────────────────────────┤
│ • Interactive Web UI & Terminal (root PTY)              │
│ • Real-time Firewalls (UFW / nftables) & Port Rules     │
│ • Container Management (Docker Engine & Compose Stacks) │
│ • 1-Click App Store (n8n, WordPress, PostgreSQL, etc.)  │
│ • Live Allowlist / Ban Toggles (Coraza & CrowdSec LAPI) │
│ • 1-Click WAF Rule Exclusion (SecRuleRemoveById)        │
│ • Website Runtimes (Static, Node, PHP, Python, Proxy)   │
│ • S3-Compatible Cloud Backups & Disaster Recovery       │
│ • ACME SSL Automation (Let's Encrypt / ZeroSSL)         │
│ • Automated Crontab Scheduler & Multi-Channel Alerts    │
│ • Local Operation Agent & Model Context Protocol (MCP)  │
└──────────────────────────┬──────────────────────────────┘
                           │ Prometheus Metrics (/metrics)
                           │ Structured Logs (/var/log/*)
                           ▼
┌─────────────────────────────────────────────────────────┐
│               CyberPross Observability                  │
│             (Grafana + Prometheus + Loki)               │
├─────────────────────────────────────────────────────────┤
│ • High-Frequency Time-Series Telemetry (CPU/RAM/IO/Net) │
│ • Long-Term Historical Trends (7d, 30d, 90d, 1y)        │
│ • WAF Attack Heatmaps & CRS Attack Category Analytics   │
│ • Multi-Container Memory & Network Throughput Dashboards│
│ • Prometheus Scrape Engine & Storage (TSDB)             │
│ • Loki Log Aggregation & Full-Text Search               │
│ • Prometheus Alertmanager Rules                         │
│ • Embedded Single-Sign-On Proxy into Panel              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Detailed Component Matrix

| Domain / Responsibility | CyberPross Panel (Port 8787) | Grafana Observability (Port 3030) | Why This Split? |
| :--- | :--- | :--- | :--- |
| **System Host Telemetry** | Displays instantaneous CPU %, RAM used, Disk free, Uptime in header. | Long-term graphs, 15-second granularity Prometheus TSDB, capacity forecasting. | Prevents panel SQLite/Postgres from ballooning with gigabytes of time-series samples. |
| **Container Monitoring** | Container start, stop, restart, inspect, image pull, and real-time logs (tail 200). | Historical container CPU/RAM spikes, container restart count over weeks. | Docker stats streaming causes heavy Node.js event-loop churn if polled continuously. |
| **WAF & Security Center** | Live allowlist/ban action, 1-click rule exemption, threat map (current active origins), instant incident response. | Historical attack volume over months, OWASP CRS rule category breakdown, threat choropleth heatmaps. | 925k+ raw security events in Postgres can slow overview queries; Grafana excels at downsampled time aggregations. |
| **Website & Reverse Proxy** | Domain configuration, vhost creation, SSL certificates, atomic file editor, route recovery. | HTTP request rates, 4xx/5xx error distributions, response time latencies (p50, p95, p99). | Web traffic analytics require high ingest rates best handled by Promtail/Loki. |
| **Database Management** | Service status, cluster start/stop, database/user creation, backup dumps. | Active connection counts, slow query trends, cache hit ratios. | Observability TSDB isolates monitoring overhead from relational data engines. |
| **Alerting** | Multi-channel immediate dispatches (Telegram, Discord, Slack, SMTP) for system faults. | Complex Prometheus PromQL alerting expressions and threshold rules. | Redundant dual alerting ensures critical outages are never missed. |

---

## 3. Panel Load Reduction Modes

The panel supports dynamic polling reduction modes configured under **Monitoring > AI & Credentials**:
1. **Standard Mode**: Scrapes host and container metrics every 5 seconds. Ideal for development and single-server environments.
2. **Balanced Mode**: Scrapes every 15 seconds. Reduces Node.js CPU usage by ~65%.
3. **Low-Load Mode**: Scrapes every 60 seconds. Background polling suspended while browser tabs are inactive.
4. **Offloaded Mode (Recommended for Busy Servers)**:
   - The panel disables internal continuous metrics recording.
   - Prometheus scrapes `/api/grafana/prometheus` via loopback datasource.
   - Panel UI loads metrics on-demand only when a user visits the dashboard.
   - CPU usage drops to < 0.5% idle.

---

## 4. Single-Sign-On Embedded Grafana Access

Administrators can access Grafana dashboards directly inside the CyberPross Panel without remembering a separate password or exposing port 3030:
1. Navigate to **Monitoring > Grafana Console** in the panel sidebar.
2. The panel acts as an authenticated reverse proxy (`/api/grafana/proxy/`), injecting auth credentials so Grafana renders seamlessly in the embedded console.
3. Port 3030 is bound strictly to `127.0.0.1` and protected from external internet scanning.
