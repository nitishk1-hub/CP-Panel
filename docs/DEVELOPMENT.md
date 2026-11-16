# Development

Use Linux, Node.js 24, npm and compiler prerequisites for native node-pty. Install dependencies with `npm ci`. Run `npm run check`, `npm test`, `npm run build:tools`, then `npm start` with disposable workspace-local state. The app has npm dependencies; it is no longer a dependency-free discovery prototype.

The current architecture is a Node HTTP/API service, local browser modules, a bounded persistent task-history queue and deliberately privileged single-host administration. The installed service runs as root; a restricted privileged helper and multi-tenant isolation are not implemented. Native Nginx setup is optional, website application runtimes can use isolated containers, and security engines/database run as separate native services. Local accounts/TOTP are current; retired SSO/Vault routes remain unavailable. MCP supports local token and remote OAuth access for trusted administrators.

Tests must use temporary directories, disposable local ports and injected privileged command runners. The updater tests rewrite installation paths into a temporary fixture and simulate systemctl; they never restart the host. Do not add real install/package/network mutation to npm test. Use disposable VMs for actual installation/upgrade/recovery qualification.

See CONTRIBUTING.md and RELEASE-PROCESS.md. The current status tracker distinguishes implemented code, regression evidence, remaining code and external qualification. The architecture graph is a navigation aid and may lag edits; source is authoritative.
