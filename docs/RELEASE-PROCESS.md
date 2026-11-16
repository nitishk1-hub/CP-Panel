# Release process

Do not run installation/update/recovery scripts on production to test a release. Current workspace readiness changes have not been deployed. The existing production service uses its installed snapshot.

## Source publication

In a real Git checkout, inspect `git status`, stage only intended source, then run `node scripts/publication-check.mjs --staged`. Review the staged diff, screenshots and reports manually and run a credential/history scanner. The built-in check detects private paths and private-key material; it does not detect every token. Configure GitHub private vulnerability reporting before enabling public supported releases. Keep archives in Releases, private runtime state outside Git, and signing keys outside the checkout.

## Candidate builds

Use Node.js 24 on the intended Linux architecture, matching installed Node headers, npm dependencies from the lockfile and a Docker build environment. Run tests and syntax checks first. Set `PANEL_PTY_BUILDER_IMAGE` to an independently reviewed `node:24-bookworm@sha256:<digest>` reference. Floating builder tags are refused. Run `npm run release` in an isolated build environment; do not build by altering an installed production copy.

Personal builds default to `PANEL_RELEASE_KIND=development` and use ignored local development keys. They are not official publisher releases. Official candidates require `PANEL_RELEASE_KIND=official`, `PANEL_SIGNING_KEY_DIR` outside the checkout with an existing protected Ed25519 key, and a Debian 12 baseline build environment. The archive includes Node, matching native modules, an advisory snapshot, CycloneDX dependency inventory, signed manifest and checksums. The build does not install or deploy anything to the running panel.

Publish the official signing-key fingerprint through an independently trusted channel. Verify first-download trust as well as the archive checksum. Pinned host keys require a separately reviewed rotation/revocation procedure; do not silently accept a new bundled key during an upgrade. Never upload the signing private key.

## Required qualification

The initial candidate matrix is x86-64 Ubuntu 24.04 and Debian 12/13. Inclusion in preflight is a candidate target, not proof of successful VM qualification. ARM, other distros, containers and non-systemd installations are not supported by these installers.

Qualify each target with install, account setup/MFA, documented remote access, reboot, optional capabilities, interrupted-install resume, runtime-changing upgrade, failed-start rollback, backup/restore to a new host and uninstall. Check native libraries, package dependencies, port conflicts, existing workloads, restricted downloads, low disk/RAM and kernel features. Unit tests simulate updater service calls; they do not establish real systemd/APT behavior. Retain evidence with each released version.

## Updates and rollback

Use only an authenticated candidate archive matching the host-pinned publisher key. The updater takes a shared installation/update lock, authenticates candidate files and runtime with the installed verifier, imports the candidate after authentication, enters maintenance, checks outstanding work, stops the service and snapshots panel state. It retains the old application and Node binary, then checks the new startup/build identity. Failure restores both application and runtime. Snapshots contain secrets and require private retention.

The maintenance marker protocol requires the running panel to support it. For an older release that lacks this gate, schedule an offline maintenance window and ensure no users/background jobs can mutate the host before invoking the update. Existing network/VPN rollback transactions must be resolved first. State/schema migration compatibility and actual host recovery remain qualification gates; a file snapshot alone is not a database-consistent/full-host backup.

Workspace edits invalidate the older signed manifest until a new candidate is built. Do not re-sign edits using the production identity merely to hide a failed integrity check. Build and review a distinct candidate, then deploy only after explicit authorization.

The CI actions are pinned to reviewed release commits: [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) and [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0). Review upstream changes before advancing those pins.
