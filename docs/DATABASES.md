# Native database software

The Databases page manages native host software: MySQL, PostgreSQL and Redis. An existing native MariaDB installation is also detected. The page reads installed OS server packages and their systemd units. It does not discover, inspect, list, create or manage database containers, and it does not query application databases or store database credentials.

Supported installation hosts are Ubuntu and Debian with APT and systemd. Server/client packages are distinguished: a database command-line client alone does not count as an installed server. If native package inventory fails, the page reports Unknown instead of claiming software is absent. Custom service launchers are not silently adopted or overwritten.

## Install and update

Install prepares a package plan using the host's existing signed repositories. Metadata refresh and plan generation run as a visible background job. Review exact package/version/dependency changes, then apply the plan. No external repositories or remote install scripts are added. Package installation may start the native service. Existing configuration files are preserved and credentials are not reset. No firewall ports are opened by the panel.

Update targets installed server packages. Automatic database version-series migrations and plans that remove packages or change unrelated server infrastructure are blocked. Plans expire after ten minutes and are rechecked before execution. Concurrent package changes require a fresh plan; package-manager locks are respected. The panel does not claim package rollback after a partial installation failure.

## Service controls

Start, stop and restart act on the detected native service. Startup can be enabled or disabled through its systemd unit. Existing native authentication and bind settings remain unchanged. This page is a software/service manager, not a SQL administration console.

PostgreSQL's parent unit may report active/exited while every cluster is stopped. The panel reads native cluster status and applies start/stop/restart to the actual cluster units. A partly running set is shown explicitly. Existing PostgreSQL cluster startup policies still apply; enabling the parent unit does not rewrite them.

## Uninstall

Review the removal plan and type the software name to confirm. The panel stops the selected native service and removes its server packages without purge or autoremove. Database data directories and configuration files are retained. Dependencies outside the selected database package family block the operation instead of being silently removed. Retention does not replace a database-specific backup or prove future-version compatibility.

Native database data is outside panel-data backup coverage. Arrange appropriate backups before software changes. Service logs are bounded and common credential-bearing lines are filtered; administrators must still treat operational logs as private.

## Verification scope

Regression coverage includes package/client distinction, service detection, no container discovery, reviewed plans, expiry/revalidation, version/conflict restrictions, data-retaining uninstall commands, native PostgreSQL cluster controls and API authorization. Host validation reads native inventory and APT simulations without installing live-host software. Disposable Ubuntu package checks separately exercise package installation/removal and retained data/configuration; they do not establish systemd lifecycle compatibility on every distribution or replace native-host release qualification.
