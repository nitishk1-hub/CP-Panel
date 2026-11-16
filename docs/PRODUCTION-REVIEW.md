# Production review — candidate 0.2.0-rc.1

## Verified by implementation and automated checks

- Installation validates selected administrator credentials, confirmation, username, local port availability and clean HTTPS-origin syntax before service startup.
- Existing accounts are not overwritten. Production startup refuses missing/empty/uninitialized account databases rather than generating credentials in a service journal.
- Passwords use salted scrypt; minimum 9 characters remains, with trivial common/repeated examples rejected. Recovery codes are one-use hashes.
- Sensitive routes enforce administrator permissions, allowed Host/Origin and explicit mutation intent. Login/reset attempts are limited.
- Session cookies are HttpOnly/SameSite; configured remote HTTPS origins use Secure cookies. WebSocket terminal upgrades enforce origin, cookie and one-use ticket checks; revoked sessions close terminals.
- Protected service code/data and installation paths are separated. Workspace changes require authorized deployment. The web service and terminal intentionally have root authority; every panel administrator must be trusted with complete host control.
- Website runtime processes are unprivileged, resource-limited and lack Docker socket/TLS-key mounts. Runtime source is read-only, persistent data separate; dependency helpers have scoped temporary write access and cleanup handling.
- Website file history is private, outside public roots. Route publication checks syntax and observes the newly loaded routing marker; failures restore previous routing/runtime state.
- WireGuard configuration/API outputs mask private and preshared keys. New imported shell hooks are rejected. Existing hook execution, default routes and overlaps require explicit review. Drafts do not change running interfaces.
- VPN actions fail closed if an independent rollback timer cannot be armed. Confirmation and rollback claim the pending state atomically. The helper restores original configuration and service/boot state. Application updates reject pending VPN transactions.
- Release packages have Ed25519-signed application manifests, a protected host-pinned local release identity, per-file/archive checksums, runtime/build metadata and an advisory snapshot. Automatic verification also refreshes advisories.

## Release coverage requirements

1. **Independent security review:** the root-capable HTTP/terminal/file-management surface needs adversarial review and penetration testing. A test suite or zero advisory count does not prove absence of vulnerabilities.
2. **MFA/public exposure:** built-in TOTP MFA is available for local accounts. Enroll all enabled administrators before public privileged access. OIDC browser SSO remains configuration preparation; LDAP support has been removed.
3. **Recovery drills:** test account recovery, data restoration, website application/data backups, service update rollback and real WireGuard rollback after lost connectivity in disposable VMs.
4. **Release authenticity:** local signed manifests and protected key pinning are implemented. Independent publisher provenance, trusted distribution and reviewed key rotation remain separate from local integrity verification.
5. **Compatibility:** test supported distro/CPU/libc/native-module combinations on clean hosts. A bundle built on the current host is not automatically portable to all Linux distributions.
6. **Operations:** local panel-state backups now use AES-256-GCM encryption, retain three snapshots and run isolated restore verification with explicit size limits. Off-host/full-website backups, log rotation/remote audit retention, alerting, patch cadence, incident response and capacity limits require additional operational coverage. Task history is persisted and unfinished work is marked interrupted; active callbacks and sessions remain in memory and are not a durable distributed service.
7. **Filesystem concurrency:** review concurrent external modification and privileged filesystem operations carefully. Administrators must not run untrusted writers against managed paths during maintenance. Existing root terminal/file controls are intentionally not a sandbox.
8. **TLS and application scope:** automatic certificate issuance/renewal, application database provisioning and arbitrary custom runtime extensions are not automated. Validate the chosen reverse proxy and public origin end-to-end.
9. **VPN gateway scope:** NAT/forwarding/DNS/firewall policy is not silently provisioned. Existing policy hooks may have side effects beyond what a file rollback can reverse; maintain a console recovery route.

## Deployment discipline

Do not activate new tunnels, change active VPN routes, expose the panel publicly or replace existing site configurations merely to validate a UI. Destructive hosting/network tests use injected command runners and disposable directories. Live inspection is read-only. Qualify the candidate against the target production environment before declaring it production-ready.

Container image and OS-package scanning is a separate gate from `npm audit`. Review the provenance and vulnerability status of the existing third-party OpenResty/WAF image and each selected runtime image; container status or digest pinning alone cannot establish that an image is free of flaws or unwanted behavior.


## Automatic verification supersedes checklist results

The earlier release-gap list is background, not a UI checklist to mark complete. System → Readiness now runs and records automated evidence; see [Automatic verification](AUTOMATIC-VERIFICATION.md). It verifies signed local releases, live npm advisories, API boundaries, encrypted backup restoration and isolated recovery/compatibility tests. Independent review attestations are verified automatically when supplied by a separately trusted reviewer. Absent external evidence, incomplete VM coverage and live disaster-recovery coverage remain Not verified/warnings rather than manufactured passes.
