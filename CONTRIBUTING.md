# Contributing

Use Linux with Node.js 24 and a disposable development account. Run `npm ci`, `npm test`, and `npm run build:tools`. `npm start` binds to loopback and uses workspace-local `var/` unless configured otherwise. Never point development tests at production data. Do not run installation, update, package, firewall or VPN commands on a production host to validate a pull request.

Keep changes focused and include regression tests for security boundaries, state changes and failure recovery. Existing tests use temporary directories and injected command runners for privileged changes. New tests must follow that approach. Never introduce a real package install or service restart into the default test suite.

Before submitting, run `npm run check` and the test suite, describe user-visible behavior and limitations, and provide reproduction steps. Keep credentials, signing keys, backups and live-host reports out of commits. Run `npm run publication:check` against the actual staged tree from a Git checkout before publication.

The installer and runtime update paths need clean disposable VM qualification in addition to unit tests. A passing local suite is not a deployment certification. Consult `docs/INSTALLATION.md`, `docs/RELEASE-PROCESS.md` and the readiness tracker for current scope.
