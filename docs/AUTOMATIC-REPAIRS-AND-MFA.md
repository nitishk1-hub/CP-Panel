# Two-factor authentication

The OS/image vulnerability scans and their dependent repair workflow were removed by the owner. Historical findings are not resolved by this change.

## MFA configuration

Built-in TOTP MFA is available for local panel accounts. Open My account → Two-factor authentication, enter the current panel password, scan the QR code with an authenticator app, and submit its current six-digit code. Manual key entry is also available. Setup expires after ten minutes and is not enabled until confirmed. The QR code is generated locally; no third-party QR service receives the secret.

After enabling MFA, all existing account sessions are revoked. Save the ten one-use MFA backup codes before returning to sign-in. Sign in with your password, then your authenticator code (or an unused MFA backup code). The normal account password recovery code is separate: password recovery does not remove MFA. Keep MFA backup codes accessible independently of the host. A stolen or lost device requires an unused MFA backup code; no email or bypass route is added by this release.

Authentication uses OTPAuth's RFC 6238 implementation, a 30-second interval, six digits, a ±1 step clock tolerance, persisted replay counters, limited attempts and expiring password-verified challenges. No session cookie is issued before the second step. Secrets are AES-256-GCM encrypted using a private `mfa.key` in panel data and associated with the account ID. Backup codes are stored as SHA-256 hashes of 128-bit random values. Include the key and account database together in protected recovery backups. Root compromise can access both; encryption does not protect against a compromised administrator host.

MFA disable requires the current password and a valid authenticator or unused backup code and revokes sessions. LDAP support has been removed; existing directory records cannot sign in. Public privileged access remains blocked in readiness until every enabled administrator has measured MFA protection. This report does not infer protection from the existence of an external SSO provider.

## Release compatibility

Release packaging rebuilds node-pty in an unprivileged, network-isolated Debian 12 builder using the exact bundled Node headers and executable. This avoids requiring the newer builder host's glibc. The builder image digest and ABI are recorded. The Ubuntu 24.04 smoke test still runs against the finished bundle; it does not imply complete VM/systemd/upgrade qualification.

Independent review still requires a real reviewer and signed attestation covering the exact build. Live disaster recovery and full VM installation qualification remain explicit evidence gaps. The panel cannot create an independent review by reviewing itself or mark untested recovery as passed.

## Optional administrator policies

`PANEL_REQUIRE_ADMIN_MFA=1` restricts administrator management until authenticator enrollment is complete; account enrollment/password/recovery paths remain available. Test recovery before enforcing this setting. `PANEL_REQUIRE_RECENT_AUTH=1` requires a password/MFA verification within five minutes for account creation/disable, integration creation, panel-address and protection-mode changes. The browser uses a separate native dialog so existing form values are retained; password managers and paste remain supported. Cancellation does not retry the blocked action. Explicitly delegated integrations retain their granted permissions and do not perform interactive step-up on every API call. These policies default off for compatibility; they are not a tenant-isolation boundary.
