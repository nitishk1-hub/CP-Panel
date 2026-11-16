# Current components

The Node panel, account/MFA state, task history, API, file manager, terminal and MCP/OAuth run in server-panel.service. The installed service deliberately has full host administrator authority. Core installation creates no security container or private event database.

Optional native Nginx setup and route recovery are implemented; existing compatible engines are reused. Optional website application runtimes still use containers where selected. Native database software management is distinct from application instance provisioning.

The selected security profile provisions native Coraza, Suricata and a dedicated private PostgreSQL event database. Detection/prevention modes are off initially. CrowdSec and GeoIP are optional configured integrations, not assumed fresh-host services. BunkerWeb, retired SSO and Vault are historical implementations, not the current provider.

Development/package builds and qualification may use temporary builder/test containers. They are not production service dependencies. Existing application containers, tunnels, VPN and firewall policies must be preserved during tests and installation. Read RELEASE-PROCESS.md for qualification requirements and docs/history for superseded implementation notes.
