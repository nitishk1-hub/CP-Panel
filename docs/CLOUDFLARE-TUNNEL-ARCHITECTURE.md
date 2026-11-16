# Cloudflare Tunnel Architecture: Zero Open Ports & Edge SSL

## 1. Overview & Core Philosophy

This panel and server infrastructure are built from the ground up for **Cloudflare Tunnel (`cloudflared`)**.

In traditional web hosting:
- Inbound ports `80` (HTTP) and `443` (HTTPS) must be punched open in the server firewall and residential/cloud router.
- The server origin IP is publicly exposed in DNS records, leaving it vulnerable to direct-to-IP DDoS, port scanning, and brute-force attacks.
- The server host must install and maintain local ACME agents (such as `certbot`, Let's Encrypt, or ZeroSSL) and run cron renewal jobs that frequently break due to challenge timeouts or firewall blocks.

**Under Cloudflare Tunnel:**
- **Zero Inbound Ports Required:** The server does not listen on any public IP. Inbound ports `80`, `443`, and `8787` can be completely blocked on the external firewall.
- **Outbound-Only Encrypted Connection:** `cloudflared` establishes persistent, outbound-only connections to Cloudflare's nearest edge data centers using QUIC / WireGuard over UDP/TCP.
- **Automated Edge SSL:** Cloudflare Edge terminates public HTTPS with free, auto-renewing universal SSL certificates (TLS 1.2/1.3, HTTP/2, HTTP/3).
- **Origin Operates on Loopback HTTP:** Origin services bind strictly to loopback (`127.0.0.1` and `127.0.0.2`), communicating in plain HTTP over the locally authenticated tunnel.
- **No Local SSL Overhead:** Origin ACME certificates, private keys on disk, and renewal crons are completely obsolete and unnecessary.

---

## 2. Architecture & Data Flow

```
+-------------------------------------------------------------------------------+
|                             PUBLIC INTERNET                                   |
|   Visitor / Browser (https://panel.<your-domain> or https://app.<your-domain>) |
+---------------------------------------+---------------------------------------+
                                        | (HTTPS / TLS 1.3)
                                        v
+-------------------------------------------------------------------------------+
|                       CLOUDFLARE EDGE NETWORK                                  |
|   - Terminate Public SSL / TLS (Edge SSL: Full / Strict)                      |
|   - Global CDN Caching & Anycast DDoS Mitigation                              |
|   - Cloudflare WAF, Rate Limiting & Bot Management                            |
|   - Ingress Routing Rules (Public Hostnames -> Tunnel UUID)                  |
+---------------------------------------+---------------------------------------+
                                        | (Outbound QUIC / WireGuard Tunnel)
                                        v
+-------------------------------------------------------------------------------+
|                             LOCAL SERVER (HOST)                               |
|                                                                               |
|   [cloudflared.service] (Systemd connector: /usr/local/bin/cloudflared)       |
|            |                                                                  |
|            +----> Hostname: panel.<your-domain>  --> http://127.0.0.1:8787    |
|            |      (Server Panel UI & MCP API Gateway)                         |
|            |                                                                  |
|            +----> Hostname: *.<your-domain>       --> http://127.0.0.1:19180   |
|            |      (Coraza WAF & OpenResty Virtual Host Engine)                |
|            |              |                                                   |
|            |              +--> app.<your-domain>     -> http://127.0.0.1:5678 |
|            |              +--> grafana.<your-domain> -> http://127.0.0.1:3030 |
|            |              +--> Static Websites       -> Local Document Roots  |
|            |                                                                  |
|            +----> Inbound Firewall: DENY ALL EXTERNAL INBOUND PORTS           |
+-------------------------------------------------------------------------------+
```

---

## 3. Why Local ACME SSL is Not Needed

| Feature | Cloudflare Tunnel Architecture | Traditional Port Forwarding + ACME |
| :--- | :--- | :--- |
| **Origin Ports** | **Zero open ports** (strictly loopback `127.0.0.1`) | Must expose ports `80` & `443` to the world |
| **Origin SSL Certs** | **None required** (loopback transport inside tunnel) | Required (`certbot`, local `.pem` files, keys) |
| **Cert Renewal Crons**| **None required** (Cloudflare auto-renews edge certs)| Required (breaks if challenge fails) |
| **DDOS Protection** | **100% cloud-level DDoS mitigation** | Origin IP exposed; vulnerable to direct attacks |
| **Subdomain Setup** | Instant (add hostname route in Cloudflare Tunnel) | Must issue new cert or maintain wildcard ACME |
| **Security Surface** | Minimal; origin invisible on the public internet | High; open ports visible to shodan/censys |

---

## 4. Subdomain & Application Routing Guide

When deploying a new application (e.g. from the 1-Click App Catalog) or creating a reverse proxy:

### Step 1: Deploy App or Proxy in the Panel
- Deploy the app (e.g. `n8n` on port `5678`, `Nextcloud` on port `8080`, or `WordPress`).
- The panel binds the container or service to `127.0.0.1:<port>`.
- If a domain is specified (e.g., `app.<your-domain>`), the panel sets up a virtual host reverse proxy in OpenResty / Coraza WAF (`127.0.0.1:19180`).

### Step 2: Route Public Hostname in Cloudflare
In the **Cloudflare Zero Trust Dashboard**:
1. Navigate to **Networks** &rarr; **Tunnels**.
2. Select your active tunnel.
3. Under **Public Hostnames**, click **Add a public hostname**:
   - **Subdomain**: `app` (or your chosen subdomain)
   - **Domain**: `<your-domain>`
   - **Path**: Leave blank
   - **Type**: `HTTP`
   - **URL**: `127.0.0.1:19180` (routes through Coraza WAF) or `127.0.0.1:5678` (direct to app)
4. Click **Save Hostname**.

Cloudflare automatically creates the DNS CNAME record and provisions edge SSL within seconds.

---

## 5. Security & Real Client IP Restoration

Because traffic originates through Cloudflare Tunnel, the incoming HTTP headers contain the true client IP:
- `CF-Connecting-IP`: The real remote visitor's IP address.
- `CF-IPCountry`: Visitor's 2-letter country code (used by Security Center World Map).
- `CF-Ray`: Cloudflare's unique transaction trace ID.

The Coraza WAF (`/etc/coraza/config.yaml`) and Nginx configurations use `real_ip_header CF-Connecting-IP` to ensure that all threat detections, CrowdSec decisions, and rate limits apply to the real attacker's IP rather than `127.0.0.1`.
