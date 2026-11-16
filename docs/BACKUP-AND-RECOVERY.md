# Backup export and recovery

Workspace tooling does not change the running production service. These commands are for a separately authorized maintenance/recovery procedure, not a step to run automatically during development.

## Panel state export

The current streaming SPB2 snapshot includes active panel state, accounts/MFA, configuration, IDS rules and GeoIP assets within its size bounds. It excludes verification storage and retired component archives, lists omissions and verifies an isolated restore. It does not snapshot application databases, Docker volumes, external website directories or all of `/etc`. It does not guarantee cross-file/application consistency while other writers are active.

Stop/drain panel operations in a scheduled maintenance window before taking a recovery export. Prepare private, administrator-owned destination directories. Export archive and key to separate paths outside panel data:

```sh
sudo env PANEL_DATA_DIR=/var/lib/server-panel /opt/server-panel/bin/node \
  /opt/server-panel/app/scripts/backup-transfer.mjs export \
  /private-backup-destination/panel.aes /separate-key-destination/panel.key
```

The export refuses any unexpected omissions and will not overwrite an existing destination. Both output parent directories must be private and owned by the invoking account. Keep the key separate from the encrypted archive, copy them securely off-host, and verify both copies. The local backup key remaining on the original server is not disaster recovery. All exported state and state snapshots contain sensitive material; restrict access and set a retention policy.

## Restore to a new directory

Use a compatible independently verified runtime/source on the recovery host. Create a private parent directory; the destination itself must not already exist:

```sh
node scripts/backup-transfer.mjs restore \
  /private-backup-destination/panel.aes /separate-key-destination/panel.key \
  /private-recovery-parent/restored-panel
```

Restoration checks the GCM authentication tag, file hashes, entry paths and limits in private staging before publishing the restored directory. Failure removes staging. Existing/live data is never overwritten. Review restored state and version compatibility offline; use a separately reviewed migration/cutover procedure. Restored account/MFA state requires the corresponding secrets from the snapshot. Revoke old integration grants and rotate credentials where compromise is suspected.

## Separate workload recovery

Back up native databases with engine-aware tools, Docker volumes with application-consistent procedures, website data outside panel storage, proxy/TLS configuration and required host/network configuration. Keep console recovery access. Demonstrate recovery on a second disposable server, including account sign-in, MFA/recovery, service supervision, website responses and guarded VPN rollback. The tool's isolated byte comparison is supporting evidence, not proof of full-server recovery.
