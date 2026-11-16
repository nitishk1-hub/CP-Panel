# Threat model and trust boundaries

Attacker-controlled network metadata, HTTP paths, hostnames, DNS names and log
messages are untrusted data. Collectors project whitelisted bounded fields;
request bodies, headers, matched values and query strings are excluded. JSON APIs
use parameterized SQL. The UI escapes all event/note text; CSV cells neutralize
spreadsheet formulas. Geolocation and ASN enrichment are local and asynchronous.

Only existing authenticated panel administrators may investigate or mutate
security settings. Host/origin checks, explicit mutation intent, confirmation,
request rate limits and action auditing apply. The security API never accepts
shell commands, arbitrary firewall statements, external include paths or arbitrary
service names. Structured WAF rules and bounded self-contained network rules are
syntax-tested by their engine before deployment. A malicious administrator still
has the existing panel's intentionally powerful server-management permissions.

Native PostgreSQL listens only on a private Unix socket, runs as a dedicated
unprivileged system account and has resource limits. Its database credential is
root-private and absent from API responses/build artifacts. GeoIP credentials are
stored separately in root-private runtime data. Native Coraza runs as a dynamic
unprivileged system user with no capabilities, a local-only listener and private
Unix administration socket. The connector-only privacy patch emits structured
IDs/verdicts rather than upstream matched-value error messages. Core Coraza/CRS
inspection is unchanged.

The current panel remains root-capable, including its pre-existing terminal and
Docker management. The first collector integration runs under that existing
service; separate least-privilege collector/privileged-helper processes remain a
qualification requirement, not an accomplished isolation guarantee. The existing
CrowdSec integration invokes only fixed authenticated cscli operations inside its
owned existing engine; the browser never receives Docker socket or LAPI secrets.

Cloudflare terminates TLS before forwarding local HTTP. Network sensors cannot
inspect encrypted tunnel contents or infer original visitor addresses from the
outer packets. Local HTTP source identity requires a verified trusted proxy
configuration; public/tunnel peer addresses must never be banned as substitutes
for original visitor identity. Coraza is not yet a production replacement while
that identity handling and route migration remain unqualified.

NFQUEUE enforcement is proven only in an isolated network namespace at this
stage. No blanket host/Docker/SSH/VPN queue is deployed. The approved initial
availability-first policy bypasses inspection if a sensor is absent. Full queues,
hung sensors, reboot ordering, firewall reloads and stale policy need independent
watchdog/rollback qualification before expanding live IPS coverage. Inspection
and enforcement evidence must remain separate from requested policy.

Software vulnerabilities remain vulnerabilities. A WAF/IPS is mitigation with
coverage gaps, not proof that every exploit, encrypted protocol or local process
attack is prevented. No production qualification or independent security review
is inferred from these functional tests.
