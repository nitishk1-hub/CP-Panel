# Remember MFA for 24 hours

After a successful authenticator or one-use MFA backup-code verification, the panel remembers that verification in the same browser for a fixed 24 hours. A password is still required at every new sign-in. Logging out ends the session but retains the browser's MFA verification. Ordinary password sign-ins do not refresh its original expiry. Other browsers, private browsing and cleared cookies require their own MFA verification.

The browser receipt is a signed, randomised, HttpOnly, SameSite=Strict, host-only cookie with Max-Age=86400. Configured HTTPS adds Secure, using the same origin policy as the session cookie. The receipt is sent only as a cookie, never in the JSON response, browser storage or URLs. Its signature is domain-separated and tied to the account's password credentials, role and encrypted MFA enrollment. It cannot serve as an API session and is checked only after a valid password. Expired, future-dated, tampered or mismatched receipts require MFA again.

The existing protected MFA key signs receipts, so a panel restart does not forget verification. Password changes/recovery, account disabling, role changes and MFA reconfiguration invalidate applicable receipts. MFA replay counters and recovery-code consumption do not invalidate unrelated remembered browsers. Security-sensitive operations such as disabling MFA still require fresh verification.

Regression tests cover fixed expiry, logout/restart, tampering, password enforcement, non-session receipts, credential/enrollment invalidation, HTTP-only cookie delivery and rejection of receipts supplied through login JSON. Clearing this browser's cookies ends its remembered verification early.
