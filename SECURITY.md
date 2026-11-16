# Security

This is a release candidate for trusted single-host administrators. The installed service, administrator terminal, filesystem tools and powerful integrations can control the entire host. Do not use it as a tenant isolation boundary.

Do not include passwords, tokens, private keys, runtime data or exploit details in public issues. Use GitHub's private vulnerability reporting for this repository when enabled. Until a private reporting channel is configured, request a private contact from the maintainer without posting the vulnerability itself. Maintainers must enable a private reporting channel before publishing supported releases.

Report the affected version, deployment profile, impact and a minimal reproduction with disposable data. Fixes are validated against the current maintained release candidate; no long-term support window is promised yet. Publisher signatures verify artifact identity, not absence of vulnerabilities.

Keep production release signing keys outside the repository. If a private key has been published, revoke/rotate it and migrate pinned trust; deleting the file from the latest commit is insufficient.
