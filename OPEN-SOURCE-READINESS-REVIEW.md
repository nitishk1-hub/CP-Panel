# Open-source readiness review

Reviewed: 14 November 2026. Snapshot: `0.2.0-rc.1`.

## Verdict

The project has substantial working functionality and useful security controls, but the current folder should not be uploaded wholesale, and the current installer should not be presented as a reliable general-purpose deployment path. Publish a cleaned, clearly labelled experimental source release after the publication gates below. Qualify installation and upgrades before offering a supported release.

Open source does not require implementing every feature below first. Keeping private material out, accurately describing limitations, and providing a reproducible development path are publication requirements. Reliable unattended operation, supported deployment profiles, recovery and security qualification are stable-release requirements.

## Scope and verification

Reviewed the project inventory and architecture graph, application modules, installer/build/update/recovery scripts, browser implementation, test coverage, package metadata and operational documentation. Inventory: 50 source files, 24 script/fixture/license files, 24 test files, 2 web build entry points, 19 public assets, and 22 documentation files, plus root metadata/reports, previews, release and runtime directories. Generated bundles, images, archives and third-party dependencies were inventoried or verified as artifacts rather than individually audited as handwritten application code. This is a code/readiness review, not a complete penetration test or clean-host deployment certification.

Checks performed:

- `npm test`: **143 passed, 0 failed**, once local loopback access was allowed. Initial restricted runs failed to bind disposable local servers; those were environment failures, not demonstrated application regressions.
- `npm run build:tools`: passed. Its three generated JavaScript assets still match the existing signed manifest after rebuilding.
- `bash -n` for the fresh, service and update installers: passed.
- `node scripts/verify-release.mjs . RELEASE-PUBLIC.pem`: passed for current files and Node runtime. This confirms integrity against the supplied local public key, not independent trust in the publisher.
- No installation, upgrade, firewall/VPN change or deployment was performed against the host. No private key or runtime credential contents were copied into this report.
- Git history could not be inspected: this workspace does not expose a usable Git repository. Historical secret exposure remains unverified.

Evidence references below are repository-relative paths. “Confirmed” means visible in the reviewed code/files; “qualification gap” means the required end-to-end evidence is absent, not that the operation has been proven to fail.

## A. Before uploading this folder to GitHub

### 1. Exclude the release signing private key — critical, confirmed

`.release-keys/publisher-ed25519.pem` exists, but `.gitignore` contains only `node_modules/`, `var/`, `.env`, and `coverage/`. A normal broad staging operation could include the signing identity. Add explicit exclusions for signing directories and private artifacts, move production signing outside the checkout, and inspect the actual staged files before publishing. Do not broadly exclude every PEM file: the release public key is intended to be public. If the private key has ever been shared or committed, rotate it and migrate trust; history removal alone does not restore secrecy.

Acceptance: a secret scan of the staged tree and accessible history passes; only intended public keys are included.

### 2. Create a deliberate repository contents policy — high, confirmed

`dist/`, release manifests, many screenshots, dated delivery reports, `graphify-out/`, and project-local agent tooling coexist with source. `var/` is ignored, but contains account/audit/security-review material and must remain excluded. `.env.*` variants are not covered by the current exact `.env` entry. Separate source, development assets, operational evidence and published release downloads. Use GitHub Releases for install archives; decide explicitly which screenshots and generated bundles belong in source. Exclude private local reports, logs, dumps and temporary files. Check screenshots for real domain/account/topology details before sharing.

Acceptance: inspect a clean export/staged-file list, not just the current ignore file. No runtime state, credentials, private backups or signing secrets appear.

### 3. Replace conflicting product and setup claims — high, confirmed

`README.md` still says jobs are in memory, whereas `src/tasks.mjs` persists bounded history and marks interrupted jobs after restart. `docs/INSTALLATION.md` and `docs/WAF-IDS-CONSOLE.md` describe BunkerWeb provisioning, while the active installer provisions native Coraza/Suricata. `docs/COMPONENT-DEPLOYMENT.md` describes BunkerWeb as current. `src/detect.mjs` still offers a deployment plan with Keycloak and NGINX/ModSecurity after those product directions changed. `docs/PRODUCTION-REVIEW.md` claims package/image scans in its final section, while current readiness explicitly excludes OS/image scans. `docs/DEVELOPMENT.md` describes a dependency-free prototype despite the current dependency set.

Acceptance: one current architecture and feature matrix, with historical delivery notes clearly archived and excluded from current instructions.

### 4. Add the minimum public-project support files — high, confirmed

There is an Apache-2.0 `LICENSE`, but no root `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, issue/PR templates or `.github/workflows/`. Add private vulnerability reporting instructions, development/build/test steps, supported scope, release status, support expectations and contribution guidance. A code of conduct and maintainer governance are useful as contributions grow. `package.json` being `private: true` prevents accidental npm publication; it does not prevent open sourcing and need not be removed.

Acceptance: a new contributor can find the setup instructions and report a security problem without posting exploit details publicly.

### 5. Review redistribution and attribution — high, qualification gap

The project includes Node's license and browser third-party notices. Verify the complete distribution against its actual contents: npm/transitive dependencies, Coraza/Caddy/CRS, Suricata rules, optional CrowdSec components, map data and GeoIP terms. Generate a dependency/license inventory and SBOM for releases. Determine whether a NOTICE file is required by included upstream notices; absence alone is not proof of a license violation. Document external GeoIP account/license requirements without redistributing restricted data or credentials.

Acceptance: each distributed component has version, origin, applicable license and required notices recorded.

## B. Fix the installation and first-run path

### 6. Wire Security Center database provisioning into installation — release blocker, confirmed

`src/security-center/store.mjs` requires `security-center/database.json`; collection calls `store.migrate()` before it can initialize. `scripts/setup-security-database.mjs` can create this configuration, but neither `scripts/install.sh`, `scripts/install-service.sh` nor `scripts/prepare-protection.mjs` invokes it. A clean install therefore lacks the event database setup that an already-prepared development host has.

Fix: provide a supported private-database provisioning step, or an explicit existing-database configuration flow, and verify connectivity/migrations before reporting Security Center ready.

### 7. Provide CrowdSec onboarding instead of assuming a migrated local engine — high, confirmed

`src/security-center/crowdsec.mjs` only discovers `/usr/local/lib/cyberpross-security/crowdsec/cscli` with `/var/lib/cyberpross-crowdsec/config/config.yaml`. Fresh security preparation does not install or configure that engine. `src/security-center/index.mjs` also appends to `/var/lib/cyberpross-crowdsec/http-access.log`; a missing parent directory can fail collection before journal events are flushed.

Fix: make CrowdSec an explicitly provisioned optional capability, create owned log paths safely when selected, and let unrelated Coraza/Suricata collection continue when CrowdSec is absent. Test a host with no CrowdSec files.

### 8. Make installation transactional and safely resumable — release blocker, confirmed

`scripts/install-service.sh` writes account data, installs code/runtime/configuration, and enables `server-panel.service` before running network-dependent security preparation. A failure leaves those changes behind. `scripts/install.sh` then rejects the existing account database or unit on rerun. The exit trap only removes staging, not the already committed installation. This can strand users between fresh install and update.

Fix: preflight first, record owned changes and phases, commit service activation last, and provide resume/repair with preserved credentials. Test interrupted downloads, full disk, failed package/build/probe steps and rerunning each phase.

### 9. Decouple the core panel from heavyweight security provisioning — high, confirmed

First-run messaging says optional components are not installed automatically, yet `prepare-protection.mjs` installs nftables when missing, builds Coraza, installs/prepares Suricata and downloads rules. A basic panel install can fail because an optional security component needs a package change or unavailable download.

Fix: offer core, web-hosting and security profiles with a reviewable package/service/download plan. Core installation should work without the security suite, and failed optional setup should have a recoverable state.

### 10. Reject unsupported hosts before any persistent changes — high, confirmed

The fresh installer checks Linux/systemd/tools, not an approved distro/version/architecture profile. Later preparation assumes APT. Docker installation supports Ubuntu only; VPN and other package paths use differing Debian/Ubuntu checks. `build-coraza.py` downloads `linux-amd64`, and private PostgreSQL setup uses an x86-64 library path, despite release naming being derived from any `process.arch`.

Fix: initially declare a narrow supported matrix and fail unsupported combinations before account/service creation. Add ARM64 only after removing architecture assumptions and qualifying it. Explicitly handle or reject WSL, containers, non-systemd hosts and restricted VPS kernels.

### 11. Add complete resource and dependency preflight — high, qualification gap

The install path can need Python, build tools/network access, APT/package candidates, nftables/kernel support, Suricata, free fixed ports and enough RAM/disk for a Go build. These are discovered incrementally after state changes. The private DB script requires exactly three PostgreSQL 18 packages supplied manually and does not obtain them itself.

Fix: a read-only preflight should inventory prerequisites, disk/RAM, package-manager state, ports, existing service ownership and outbound endpoints. Report all blockers together and state what will be downloaded.

### 12. Wait for actual readiness before announcing success — high, confirmed

`install-service.sh` schedules a start eight seconds later with `systemd-run`; the outer installer prints “Installation complete” without confirming panel startup, authenticated access or a successful first health response.

Fix: the CLI should start and poll a bounded readiness check, distinguish installed/starting/ready/failed, show the actual selected local address and provide recovery/log commands. Keep the delayed handover only where needed for installation initiated from a running development panel.

### 13. Supply a complete remote-access walkthrough — high, confirmed gap

The listener is intentionally loopback-only, and choosing `PANEL_PUBLIC_URL` does not provision DNS, TLS or a proxy. Current instructions leave users to bridge this gap themselves. Secure cookies are enabled when a public origin is configured, so initial HTTP forwarding behavior also needs browser verification rather than assumptions.

Fix: document and test SSH forwarding with a custom panel port, a supported native reverse proxy with WebSocket headers, and an optional Cloudflare route. Explain DNS/TLS prerequisites, first login, MFA and recovery. Provide a console path to repair a saved public origin that becomes unreachable.

### 14. Provide validated configuration and automation interfaces — medium, confirmed gap

There is no `.env.example`, complete environment reference, config validation command or documented noninteractive installer. Interactive setup deliberately protects passwords, which is good, but limits Ansible/cloud-init deployment.

Fix: publish supported settings/defaults and add an optional secure file-descriptor/stdin/secret-file automation path. Preserve the rule that passwords are not command arguments or logs. Include validation without applying changes.

### 15. Make initial setup guide users through capabilities — medium, improvement

Credential creation is implemented, but users must discover host permissions, web-engine setup, runtime images, security prerequisites, backups and public access in separate screens. Add a resumable onboarding status that distinguishes required setup, optional setup, unsupported capabilities and externally managed services. Finish with tested access and recovery information.

## C. Make releases and upgrades dependable

### 16. Support updating the bundled Node runtime — release blocker, confirmed

`scripts/update-service.sh` stages application files but not `runtime/node`. It verifies the candidate using `/opt/server-panel/bin/node`, and `verifyRelease()` requires that executable's hash to equal the new release's `nodeDigest`. A legitimate release built with a different Node binary will fail; the updater has no runtime replacement transaction.

Fix: authenticate application and candidate runtime before executing candidate code, check architecture/ABI/libc, switch both atomically and restore both on failure. Include a real Node patch-version upgrade in acceptance tests.

### 17. Add upgrade locking and a maintenance boundary — high, confirmed

Fresh installation uses an install lock; `update-service.sh` does not acquire an equivalent update lock. Its task/pending-network checks are snapshots while the panel can accept new work. Two updates or a newly started host task can race with application replacement.

Fix: use one host-level installation/update lock, enter maintenance mode, drain/refuse conflicting operations, then recheck VPN/network transactions immediately before commit. Test simultaneous update attempts.

### 18. Upgrade state and dependent services with rollback — high, confirmed gap

The updater swaps application code and keeps an older application directory. It does not version/migrate panel JSON state, update security binaries/units/schema as a coordinated release, or snapshot and restore all affected state. An older application directory is not a complete rollback after schema or runtime changes.

Fix: introduce state/schema versions, reversible or explicitly irreversible migrations, consistent backups and a rollback compatibility policy for panel, database and security services.

### 19. Replace the one-second process check with functional health checks — high, confirmed

Update success is based on restarting systemd and being active after one second. That does not prove sign-in, static assets, native terminal imports, database migration or delayed initialization remain healthy. Initial installation has an even weaker deferred-start result.

Fix: bounded startup/readiness checks with build identity and essential dependencies; preserve failure diagnostics and revert on failure. Separate degraded optional capabilities from core startup failure.

### 20. Make source builds reproducible on documented clean builders — high, confirmed

`build-portable-pty.mjs` requires `/usr/include/node` headers exactly matching the executing Node binary, Docker and a pulled builder image. The build copies the host Node executable into a Debian 12 container: rebuilding only the PTY module cannot make a host Node binary with newer libc requirements portable. `BUILD.json` records the current build's glibc as 2.43. That is build metadata, not proof of the Node binary's minimum required libc.

Fix: use supported baseline build environments and known runtime artifacts, document all prerequisites, inspect executable/library requirements, and test the full archive on each supported target. Keep developer `npm ci`/test and publisher packaging as distinct supported workflows.

### 21. Record and pin the complete build inputs — high, confirmed gap

There are useful exact npm pins, lockfile checks, compiler checksum and Coraza build provenance. However the PTY builder begins from a moving `node:24-bookworm` tag and web runtime templates use moving tags. Coraza installation compiles and fetches modules on the target host. Image IDs are observed after pull rather than selected from reviewed release inputs.

Fix: controlled version/digest updates, full build provenance, artifact checksums and SBOMs. Prefer prebuilt verified security artifacts for supported targets, or document the exact online-build requirements and reproducibility limits.

### 22. Establish publisher trust and key rotation — high, confirmed gap

The current signer generates a local Ed25519 identity if absent. Initial installation trusts the public key shipped with the same bundle, then pins it. This supplies local continuity but does not independently authenticate the first download. A fresh contributor build also creates a different publisher identity.

Fix: distinguish official releases from personal builds, publish a trusted fingerprint/provenance channel, keep signing secrets outside source/CI logs, and define tested key rotation, revocation and recovery. The checksum beside an archive is an integrity check, not independent publisher authentication.

### 23. Add clean-host and release CI — high, qualification gap

No workflow currently enforces the passing local test suite or verifies install artifacts. `tests/install.test.mjs` checks credential/first-run behavior, not an actual systemd/APT installation. Readiness's Ubuntu container smoke test explicitly does not qualify full VM install/upgrade behavior.

Fix: CI for lockfile installation, syntax/lint, tests and assets; disposable systemd VM jobs for supported distro/CPU combinations; install → login → reboot → upgrade → rollback → uninstall. Include occupied ports, existing workloads, interrupted network/package operations and failed restoration. A Docker smoke test supplements these tests.

### 24. Provide repair, uninstall and retention tools — medium, confirmed gap

There is no supported general uninstall script or phase-aware installation repair. Application snapshots, compiler/dependency downloads, configuration backups and same-drive Trash can accumulate. Removing the panel must not remove adopted/user workloads or databases.

Fix: ownership-labelled resources, dry-run repair/uninstall, preserve-data defaults, explicit purge scope and retention policies for old releases/backups/trash. Test removal without disturbing existing Docker, Nginx, VPN and firewall configuration.

## D. Security and operational behavior before a stable release

### 25. Clarify or narrow AI access scopes — high, confirmed

`authorizeAI()` in `src/ai-access.mjs` assigns GET requests to `read`; resolved credentials use their administrator owner's identity. Admin GET file/download endpoints can therefore expose root-readable configuration, panel state and host credentials when `PANEL_FILE_ROOT=/`. The docs already warn that reads can contain secrets. Likewise `manage` permits powerful file/container deployment operations that can lead to host code execution even without `/api/ai/command` permission.

Fix: avoid presenting read/manage/command as strong host-security boundaries. Either explicitly grant trusted full-administrator integration access or use resource/endpoint allowlists, restricted roots and secret exclusions. Test scope escape paths through files, Compose, bind mounts and application deployment, not just the command endpoint. This is authorized capability risk, not a demonstrated unauthenticated exploit.

### 26. Decide and document the root privilege architecture — high, confirmed design risk

The HTTP service intentionally runs as root, has full-root file access and PTY, and sets `NoNewPrivileges=false`. That makes every exploitable API/UI dependency part of the host administrator attack surface. Root capability is intentional, but ownership protection of installed code is not a restricted privileged helper.

Fix: before broad stable adoption, assess an unprivileged web/API process with a narrow independently authorized host helper. If retaining the root design, state the single-host/full-trust boundary prominently and obtain focused adversarial review. Do not promise multi-tenant isolation.

### 27. Add policy for MFA and sensitive-action reauthentication — high, improvement

TOTP, one-use backup codes and remembered-browser proofs exist. Enrollment is optional, and many high-impact actions rely on an existing administrator session plus `confirm:true`, rather than recent password/MFA verification. Add configurable mandatory MFA for administrator remote access and recent-auth checks for integration creation, account/security changes and destructive host actions. Test lockout and recovery before enforcing the policy.

### 28. Harden and test authentication behind proxies — medium, confirmed limitation

Rate limiting uses the socket address and username, so users behind a local reverse proxy share an address bucket. The README acknowledges this. Never blindly trust arbitrary forwarded headers. Add explicitly configured trusted proxies and a tested client-IP policy if per-client limits are needed, plus bounded authentication work under abuse and monitoring for repeated failures.

### 29. Address privileged filesystem races and metadata preservation — high, confirmed risk

`confined()` resolves a path before later operations. Untrusted concurrent writers can change directory/symlink state between checks and use. `saveText()` checks a revision before replacement, preserves mode, but does not preserve original UID/GID, ACLs or extended attributes. In a root service, replacing a user-owned file can change its ownership to root. The README already limits concurrency guarantees.

Fix: descriptor-relative/no-follow operations or equally robust ownership/locking boundaries; preserve intended ownership/metadata; review sibling backup permissions. Add race tests with untrusted writers and tests for user-owned website/system files. Do not describe a path check alone as race-safe confinement.

### 30. Bound and improve audit logging — high, confirmed

`src/server.mjs` appends action names/actor/time to `audit.jsonl` without rotation. The audit endpoint reads the entire file before taking the last 100 records. Object identifiers, structured outcomes, failure context and correlation IDs are limited; terminal contents deliberately are not logged.

Fix: bounded read/rotation/retention, structured target and result metadata with secret redaction, operational error logs and optional remote append-only shipping. Keep session-open/close auditing without casually recording passwords typed into terminals.

### 31. Bound Coraza audit storage — high, confirmed gap

The generated Caddy configuration rotates access logs, but Coraza uses a serial `/var/lib/cyberpross-coraza/audit.json` without a rotation/size policy in the reviewed provisioning path. Security database size limits do not bound that separate file or the host journal.

Fix: coordinated log rotation/reopen behavior, journald retention guidance, disk-space warnings and tested behavior during an attack or full disk.

### 32. Turn backup verification into usable disaster recovery — high, confirmed limitation

`encryptedBackupVerification()` is a useful local panel-state restore probe, limited to 16 MiB per file and 64 MiB total. It omits external websites, native databases, relevant host configuration and verification storage; its key is on the same host. It is not an operator-facing full-server backup/restore workflow and is not coordinated for a consistent multi-service snapshot.

Fix: explicit backup scope, off-host destinations, separately recoverable encryption keys, database-aware backups, schedules/retention and a documented restore command onto a clean host. Surface omissions prominently. Demonstrate recovery after losing the original server.

### 33. Make tasks recoverable across process failure — high, confirmed limitation

Task history is persisted; active callbacks and plans are not. Restarted jobs are marked interrupted, not reconciled with APT/Docker/service state. New queued jobs are acknowledged before their scheduled history write is guaranteed. Package/deployment side effects can outlive confirmed UI progress.

Fix: persist intent before acknowledgement, add operation IDs/idempotency and reconciliation, define cancellation/timeouts/process-group behavior, and prevent conflicting package operations across all entry points. Durable history is useful but does not make operations resumable.

### 34. Reconcile security state after partial failure — high, confirmed gap

`createThreatSecurity().mode()` changes provider mode, IDS, response rules and entry routing in several steps. Its catch path restores some state, but only restores IDS/response specially when the previous mode was off. For example, a failure moving from monitor to block after enabling response can leave response state inconsistent with the saved previous mode.

Fix: snapshot every component's original state, compensate each successful step, report rollback failures and reconcile observed state to the chosen policy on startup. Inject failures at every transition, including monitor ↔ block.

### 35. Match WAF protection claims to actual ingress — high, confirmed limitation

`src/protection-edge.mjs` manages loopback IPv4 OUTPUT NAT; this does not automatically cover public listeners, IPv6, direct Docker published ports or every TLS path. Current installation guesses a Docker bridge gateway or `127.0.0.2` origin on port 80. A fresh native web engine may not listen on the guessed address. Coraza configuration and the capture-migration script accept different upstream address sets.

Fix: explicitly discover/select origin and ingress, validate loops/reachability, identify bypass paths, and show protected/unprotected routes in the UI. Test native Nginx, custom Docker networks, no Docker, IPv6, direct public origin access and TLS. Expose the availability-first bypass state when the WAF fails.

### 36. Make proxy source identity configurable — high, confirmed assumption

Coraza trusts loopback for `CF-Connecting-IP`. That is a deployment-specific assumption about local proxies, not a universal origin identity policy. CrowdSec remediation depends on correct client attribution.

Fix: explicit trusted proxy/header profiles, overwrite/filter policies at the edge, and spoofed-header tests before source-IP bans. Document trusted local-process assumptions and management exemptions.

### 37. Fix security event retention and capacity semantics — medium, confirmed

Settings permit 90-day event retention, but `SecurityStore.insert()` rejects events older than 30 days and `filters()` imposes a 30-day query window. Higher settings therefore do not expose 90 days of history consistently. The collector stops above a database-byte threshold after retention, while row deletion does not guarantee the physical database shrinks. Investigation records are not cleaned by the shown retention method.

Fix: consistent configurable time windows, partition-aware retention, bounded notes/investigations, sensible vacuum/storage policy, and restart/resume behavior when capacity recovers. Test high event rates, dropped batches, cursor recovery and database outages with real PostgreSQL.

### 38. Add explicit schema migrations and service lifecycle shutdown — medium, confirmed gap

Security schema creation uses `CREATE TABLE IF NOT EXISTS`, not versioned migrations. Panel state files have mixed schema practices. Server close hooks exist, but the CLI has no explicit SIGTERM/SIGINT graceful-shutdown path that closes HTTP, collectors, tasks, terminal sessions and database pools before exit.

Fix: versioned migrations with upgrade compatibility tests, and bounded signal handling tested while jobs and WebSockets are active. State exactly what resumes, stops or becomes interrupted.

### 39. Make readiness practical and capability-aware — medium, confirmed

The bundle includes Node but does not install npm; readiness invokes the host `npm audit`. Its compatibility probe needs Docker and a pulled Ubuntu image even for a native core-panel profile. It runs once initially; failed/interrupted initial attempts are not automatically retried. These are disclosed limitations, but new users may experience avoidable “failed” results for optional missing tooling.

Fix: separate required health from optional qualification; distinguish unavailable tooling, failed checks and unverified scope. Provide a repair/retry path, record freshness, and keep heavy checks explicit. Do not infer a clean security state from the shipped advisory snapshot.

## E. Hosting, maintainability and user experience

### 40. Provide a supported web-engine bootstrap — high for hosting, confirmed gap

`src/websites.mjs` discovers existing compatible native Nginx/OpenResty or Docker mounts, and rejects hosting operations when none is found. It does not install a reviewed web engine for a fresh server. Docker discovery recognizes particular OpenResty layout/paths despite matching generic nginx names.

Fix: offer installation of one supported fresh-host web-engine profile, or state clearly that existing web-engine setup is mandatory. Add native/standard Nginx adapters and test existing-service adoption rather than inheriting one local 1Panel/OpenResty layout.

### 41. Complete certificate lifecycle and deployment rollback — high for hosting, confirmed limitation

Certificate upload/pair/domain validation is implemented, but ACME issuance/renewal is not. Compose rollout warns that failure can leave partial resources; prior images/configuration alone do not restore application data or migrations.

Fix: an explicit certificate-management path with expiry alerts and tested renewal/reload, plus deployment health checks, previous digest/config tracking and a documented rollback/backup boundary. Do not imply that native database package management also provisions application users/databases or backups.

### 42. Break large compressed modules into maintainable units — medium, confirmed

Much handwritten backend/frontend code is compressed into very long lines. `src/server.mjs` combines routing, policy, orchestration, auditing and lifecycle. Browser modules rely on shared globals and repeated markup. This makes reviews, merge conflicts and security-policy changes harder.

Fix: format handwritten code, introduce consistent lint/format checks, extract route/service boundaries, share validation and add useful types/JSDoc or a gradual type-checking path. Generate an API contract instead of discovering routes by regex over server source.

### 43. Verify accessibility and failure workflows in real browsers — medium, qualification gap

The implementation contains useful labels, focus management and mobile styling; that is not complete accessibility evidence. Add keyboard/screen-reader, contrast, touch, narrow-screen, slow-network, expired-session and failed-action checks. Add browser automation for first login, MFA/recovery, panel address, task interruption and destructive confirmations. Current tests concentrate on backend/injected operations.

Fix one concrete UI inconsistency too: `public/app.js` suppresses every button label starting with “Refresh” globally. Replace that label-based behavior with an explicit component decision so new refresh actions cannot silently disappear.

### 44. Reduce initial browser cost and stale-asset risk — medium, improvement

The current build emits roughly 1 MiB each for editor/tools and security map, plus about 0.5 MiB for the worker. The map dataset and auxiliary assets are separate. Several large assets are absent from the server's build-hash input list, although they are release-signed.

Fix: load editors/maps only when needed, measure compressed transfer and low-powered devices, fingerprint all generated assets and ensure proxy caching cannot mix releases. Preserve local-only asset delivery.

### 45. Add actionable diagnostics and support boundaries — medium, improvement

API errors often collapse to configuration failures, some background catches suppress detail, and there is no unified redacted support export. New users need the installed version, target profile, current readiness, failed phase, service logs and exact recovery next step without exposing credentials.

Fix: a diagnostic command/export with tested redaction, request/job correlation and clear unsupported-capability messages. Document single-host architecture, tested scale/resource requirements, upgrade support window and patch policy. Multi-node, HA, SSO, tenant isolation and additional hosting recipes can remain future work if explicitly outside the initial scope.

## Suggested execution order

1. **Safe experimental publication:** items 1–5; corrected README with narrow support scope; clean contributor install/test/build instructions; staged-tree secret/license review; passing CI. Publish as experimental with the known deployment gaps linked.
2. **Reliable installation candidate:** items 6–15, 20 and 23. Start with one exact distro/CPU profile. Prove a new user can install, access, recover and repair it without relying on this workstation's pre-existing services.
3. **Upgrade and recovery candidate:** items 16–19, 22, 24, 32–34 and 38. Prove runtime-changing upgrades, failed upgrades, reboots and clean-host recovery.
4. **Stable security/hosting qualification:** remaining security, capacity and hosting items; targeted external review; representative load and browser tests. Expand the support matrix only after those targets pass.

## Release acceptance scenario

A reviewer starts with an empty supported VM and only documented prerequisites, verifies an official archive, installs the selected profile, reaches the panel through the documented access route, signs in and enrolls MFA. Core management works; selected security capabilities have working databases and observable events; unselected capabilities are clearly optional. A sample website can be deployed only after a supported web engine is present. The reviewer reboots, upgrades including a Node runtime change, induces a failed upgrade and observes recovery. An interrupted optional installation can resume without resetting accounts. A backup is restored to a second clean VM. Uninstall preserves user workloads. Every step has logs and a reproducible result.

Passing unit/API tests and a signed archive are necessary supporting evidence. They do not replace this deployment scenario.
