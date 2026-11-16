# Automatic production verification

System → Readiness runs verification automatically for the installed administrator service. A first run starts after startup; a persistent marker prevents further automatic runs, including after restarts, updates, stale results or failures. **Run checks now** starts the same workflow. Results, progress, timestamps and bounded evidence are stored privately and exported through the readiness report. Concurrent runs are locked across processes.

The panel no longer presents a manual checklist or accepts a checkbox as evidence. A failed download, missing tool, unsupported target or missing attestation produces a failed/not-verified result. Automated does not mean passed.

## Checks

- **Release integrity:** Ed25519 signatures bind the application files and matching Node binary. The protected host public key is pinned on the first authorized installation/upgrade. Later updates must verify against that key. This authenticates the local release identity; it is not an independent publisher endorsement or proof that the source is safe.
- **Independent review:** the verifier checks an independently signed attestation against a separately trusted reviewer key, exact source digest and expiration. Without external review evidence it reports Not verified. The panel cannot honestly manufacture its own independent review.
- **API boundaries:** disposable accounts and a local-only test server probe anonymous access, roles, cookie flags, invalid Host/Origin and mutation intent. No live management operation is performed.
- **Encrypted backup restoration:** a local panel-data snapshot is encrypted with AES-256-GCM, decrypted into a disposable directory and compared byte-for-byte. Three encrypted snapshots are retained. The private local key is outside the snapshot. The SPB2 format streams compression/encryption and restore checks rather than loading the snapshot into memory. Limits are 256 MiB total and 128 MiB per file; individual omissions include a path and reason. Active IDS rules and GeoIP databases are included within these bounds. Verification outputs and inactive retired-component archives are explicitly excluded. This is not an off-host backup or full website-data disaster recovery service.
- **Recovery drills:** generated test accounts exercise one-use account recovery/session revocation; disposable website files exercise private-history restoration; a copied WireGuard transaction exercises the rollback implementation using injected service commands. The real VPN and administrator account are untouched. The result explicitly distinguishes verified rollback logic from an untested live network outage.
- **Dependency advisories:** fresh `npm audit` output is evaluated. A registry/network error does not become a clean audit.
- **Compatibility:** the matching Node binary/application are tested in a fresh official Ubuntu 24.04 container, pinned to its resolved ID. It runs without the host network, host credentials or Docker socket, as an unprivileged user with dropped capabilities and a read-only root. Native imports, startup and sign-in are tested. Full systemd VM installation/upgrade, other targets and actual disaster recovery remain unverified until separate automated environments cover them.
- **Public HTTPS, when configured:** platform certificate validation, an exact panel-build response and rejection of anonymous account API requests are checked from the host. For Cloudflare Tunnel, connected metrics and the active connector’s ingress configuration are inspected. A same-network-namespace loopback HTTP hop does not require a local certificate; a local HTTPS hop must retain certificate verification. Unknown configuration, non-loopback origin transport, a disconnected tunnel or disabled origin TLS verification remains a warning. Public-address changes invalidate older HTTPS evidence. These checks do not attest every external network, Cloudflare Access policy or the absence of alternate ingress routes. Built-in panel MFA is evaluated separately.

## Signing and trust

Personal development builds create a private Ed25519 key under ignored `.release-keys/` (0700 directory, 0600 key) if one does not exist. Official builds require an existing key outside the checkout; see RELEASE-PROCESS.md. The private key is never packaged. Preserve it securely for future releases. `RELEASE-MANIFEST.json`, its detached signature and the public key are packaged. Installer/update helpers pin the public key under `/etc/server-panel/release-public.pem` and verify subsequent updates; replacing that trusted identity requires a separately reviewed rotation.

Initial key pinning trusts the authorized source/distribution channel. Bundling a public key alone is not proof of a third party's identity. Do not delete/recreate the signing key to bypass a failed verification.

Optional independent-review evidence uses `/etc/server-panel/reviewer-public.pem` and the private data file `verification/independent-review.json`. The latter contains a UTF-8 `payload` string and base64 `signature`. The signed payload must contain `scope: "independent-security-review"`, the exact `sourceDigest`, valid `reviewedAt` and future `expiresAt`. A release signer is not automatically trusted as an independent reviewer.

## Operational limits

OS and deployed-image vulnerability scans and their repair workflow have been removed at the owner’s request. They are excluded from readiness, not passed or resolved. Historical private reports remain available on disk. Compatibility checks can still use disk, CPU and network bandwidth for official test-image downloads. Findings are reported; the panel does not automatically upgrade packages/images, open ports, change routes, replace live accounts, or restore data over the running server. Vulnerability reports and a clean smoke test cannot certify absence of security flaws. Readiness remains unqualified when checks fail or required coverage is missing.

Initialization-only policy: the first automatic attempt is recorded persistently
before scanning starts. A previous readiness report also counts as an initial
attempt, including an interrupted or failed run. Restarts, application updates,
changed images, stale results and the passage of time do not trigger new scans.
The hourly timer and daily/failure retry rules have been removed. Run checks now
remains available. Stale or changed-build evidence remains marked pending rather
than being falsely treated as current.

## Operational checks and release assurance

Measured checks receive results within their stated scope: an Ubuntu runtime container smoke test and isolated account/website/VPN recovery logic tests can pass. Full-host disaster recovery, independent signed security review and full VM/systemd installation/upgrade qualification remain separate evidence requirements. `deploymentStatus` reports the operational checks; `releaseStatus` continues to report Not production-qualified while required release-assurance evidence is absent. A healthy Cloudflare Tunnel does not resolve those unrelated gaps.

The tunnel route inspector reads bounded configuration records from the current connector PID’s journal, or its detected local configuration for a locally managed connector. It exports only the selected route and transport facts, not raw configuration, tokens or credentials. It runs as part of explicit/initial verification, not as a new background scan.
