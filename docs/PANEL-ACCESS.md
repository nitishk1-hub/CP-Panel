# Public panel access

Configure your HTTPS domain's DNS and proxy/tunnel route to the localhost panel upstream first. Then use **System → Panel address → Verify & apply address**. A bare domain is accepted by the backend as HTTPS; the browser form expects a full HTTPS URL.

The panel checks the TLS certificate and requires the new address to return a one-use random proof from this exact running instance. An arbitrary Host or forwarded header is never adopted as a trusted domain. The proof endpoint is available only during a pending administrator-requested check, and only for its random challenge. Failed verification leaves the previous configuration intact.

One saved address applies to authentication, secure session cookies, Host/Origin validation, API requests, readiness HTTPS checks and terminal WebSockets. New connections use it immediately; existing terminal sessions close during a change. Localhost access remains available. Replacing a public address retires the previous one; open the verified new address after applying it. Browser sessions are host-specific, so sign in at a new hostname.

The private `panel-access.json` file is authoritative after an address is saved. `PANEL_PUBLIC_URL` remains the initial installer/environment default. Existing state survives updates and restarts. No manual environment-file edit is required for later domain changes.

When an existing website's settings explicitly point its upstream to localhost at the running panel port, the panel verifies the site's HTTPS address and synchronizes access automatically. The same occurs after publishing a panel-managed reverse proxy website. Other applications and upstreams are not reconfigured. If DNS/TLS has not been set up yet, website routing remains saved with an explicit verification warning. External proxy tools cannot notify this application of configuration changes; use Panel address once after changing routing in such a tool.

## Domain-cookie login failure

Browsers may send unrelated cookies from applications sharing a parent domain. Earlier versions accepted Node's default 16 KiB total HTTP header limit. Oversized requests returned HTTP 431 with an empty body, and the frontend unconditionally parsed JSON, resulting in `Unexpected end of JSON input`.

The panel now accepts at most 64 KiB total headers and up to 100 headers. Requests over that bound return a JSON 431 explaining how to clear the site's cookies. The frontend also handles empty, interrupted and non-JSON proxy responses with status-specific errors rather than exposing JSON parser errors. Login and mutation requests are not automatically retried.

A test with 17 KiB of unrelated cookies reproduced the old empty 431 through both localhost and the public HTTPS proxy. A successful public sign-in with a disposable read-only account and authenticated API requests passed before the change. These observations identify a reproducible cookie-size failure path; they do not inspect the user's private browser cookies.
