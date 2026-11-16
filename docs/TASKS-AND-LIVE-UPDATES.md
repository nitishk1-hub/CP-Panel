# Tasks and live updates

CyberPross Panel is created by CyberPross. Database software has MySQL, PostgreSQL and Redis navigation categories, matching the Websites submenu pattern. Native package/service management is unchanged.

Resource and status views update automatically. Duplicate page/status Refresh buttons are removed. Update/install, restart, signature updates, running verification and testing/reloading website configuration remain explicit operations; they are not background data refreshes. Live updates pause around dialogs, focused editing fields and dirty website editors. Terminal output remains live. Inventories preserve search filters and file-manager location; editing buffers are not periodically replaced.

The Tasks menu, header indicator and popup show queued, running, completed, failed and interrupted operations with bounded logs. Mutating operation callbacks execute serially in the panel's existing system service, without a queue/Redis/worker container. Closing a browser or navigating away does not stop the service or its operations. Read-only scheduled readiness verification is also observed and can run independently.

Task summaries/logs are persisted atomically in the private panel-data directory, limited to 100 retained entries and a bounded file size. Common credential-bearing log lines are filtered; administrators must still treat operation logs as private. Task history is not an independent or tamper-proof audit trail. Only administrators can read it. Client requests cannot submit arbitrary executable task payloads.

A panel restart marks unfinished work Interrupted; it does not blindly repeat package installs, Docker deployments or VPN changes. Check affected services before retrying. Updates refuse to restart while history reports active manual tasks. This feature provides browser-independent execution, not a transactional host rollback or guaranteed recovery from power/process failure.

Database install/update/uninstall plans and readiness repair plans are prepared in background jobs. Completed review tasks can reopen their plan from the popup; plans remain subject to existing expiry and restart rules. Nothing automatically applies package changes because a plan was prepared.

A completed scan task means that scanning finished. Readiness findings remain failed until the underlying problem is corrected and fresh evidence verifies it. WAF virtual patching may reduce specific exploitation paths but does not repair OS packages, images or source code. OWASP describes this distinction at https://cheatsheetseries.owasp.org/cheatsheets/Virtual_Patching_Cheat_Sheet.html.
