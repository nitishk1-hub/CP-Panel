# Native web engine

Websites → Web engine supports native Nginx installation from the host's configured signed APT repositories, service controls, reviewed route recovery and an opt-in automatic-install setting. Existing compatible OpenResty/Nginx installations are reused. There is no new web-engine container.

When no engine is detected, Websites shows **Set up web engine**. Choose **Automatic setup** for the confirmed install/configure job, or **Review installation** to inspect the package plan first. Package removal is refused and an occupied HTTP port blocks automatic installation. Package startup is masked until private configuration validates. A customized packaged default website is not silently removed.

Automatic installation is disabled by default. If enabled, an installed panel checks for a missing compatible engine at startup and queues installation under Tasks. It does not start a deliberately stopped, already-installed engine. Existing saved CyberPross recovery routes can be rebuilt after engine removal/reinstallation; deliberately disabled routes are not re-enabled automatically.

New CyberPross-managed Nginx uses 127.0.0.1:80 and 127.0.0.2:80. With the existing native WAF capture enabled, Cloudflare's localhost:80 connection is redirected through Coraza, which uses 127.0.0.2:80 as its non-recursive backend. Without capture, localhost:80 still reaches Nginx directly. A running pre-existing Coraza policy is retargeted to this native loopback origin during engine installation; its mode, rules, exclusions and bans are retained. A deliberately stopped WAF is not started silently. No Docker gateway address is required.

The default native installation opens no public HTTP/HTTPS listener and requires no local certificate for its HTTP origin. Cloudflare handles public HTTPS and encrypts the tunnel connection. Optional local HTTPS remains available through the existing website certificate controls.

Recovered routes live in `/etc/nginx/conf.d/cyberpross-recovered-*.conf`; static files are copied into `/var/www/cyberpross-recovered/<domain>/public`. Routes are recorded privately in panel data under `web-engine/routes.json`, so active hosting does not depend on 1Panel's filesystem. Preserved legacy directories are read only during explicit recovery. Unknown app upstreams must be entered manually rather than guessed from their domain names. Conflicting unrelated domains are refused; Nginx validates before reload and rejected route changes restore previous route files.

The native proxy supports WebSockets, forwarding of the public scheme, long-running requests and certificate verification for HTTPS upstreams. Managed access logs exclude query strings and headers. A daily, compressed 14-file log rotation policy covers recovered routes and panel-managed websites.

Service Stop affects every website using Nginx and requires confirmation. Install/recover/start/restart/reload operations are admin-only and appear in Tasks. Existing application containers, databases, Cloudflare Tunnel, SSH and WireGuard are not restarted by web-engine setup.
