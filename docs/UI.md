# Panel interface

A desktop-first server workspace with five sections: Overview, Docker, Websites, System, and Users & identity. A dark navigation rail anchors a neutral light workspace. Blue denotes primary actions; green indicates observed running state; amber is used for setup or permission requirements. A user-selected dark theme is stored locally.

The login and forced password screens are separate from the application shell. Menus are hidden until authentication and account setup succeed. Passwords retain the 9-character minimum.

Overview renders observed CPU, available-memory-based RAM usage, root disk usage, uptime, operating system and container inventory. Charts hold up to 60 real readings collected while the page is open, at two-second intervals. No historic readings are invented or stored server-side.

Docker separates container operations from Compose configuration. Search and state filters are retained across live updates. Start, stop, restart, package changes, firewall rules and directory startup use explicit confirmation dialogs. File and Compose edits open in a focused dialog and preserve backend revision checks and backups.

System separates firewall, command terminal and files. Missing host permissions are displayed as a restriction, never as a disabled firewall or absent service. Terminal uses an interactive PTY.

Identity separates users, LDAP and SSO preparation. Account creation starts with Viewer selected. Directory settings, credentials and generated recovery material are never placed in browser local storage. The only persistent UI preference is appearance.

At narrow widths, the sidebar becomes a dismissible drawer, resource cards use two columns, dashboard sections stack, settings forms use one column and wide tables scroll within their cards. Native forms, labels, modal dialogs, visible focus, inline errors and reduced-motion styles support keyboard access.

Browser QA uses an isolated account database and the real host metrics. Production account credentials are not changed for visual checks.

Docker resource management now has distinct Networks, Images and Volumes tabs. Container/project rows include host bindings and network membership. Container details separate metadata, live-refresh logs, runtime settings and non-interactive container commands. Built-in/occupied network deletion and in-use volume/container deletion are blocked. Bridge connection controls include optional IPv4 and aliases. The Host listeners view explicitly reports host-wide sockets without assuming ownership by an individual host-network container.

New standalone containers use form rows for port bindings and mounts; the initial bind address is localhost and the default selected network is Docker bridge. New Compose projects use a validate/review/deploy workflow with private saved drafts. Deployment, removal, connection changes and cleanup show their scope before the job is sent. Existing Compose updates optionally rebuild local services. Private-registry login, a persistent interactive TTY, Swarm/Kubernetes and changing a container's immutable port mappings in place remain outside the implemented controls.

Overview now uses four top metrics (CPU, RAM, receive rate, send rate), two aligned live charts, a mounted-drive table and a compact name/status container list beside tunnel health and host information. Drive tables scroll inside the card when system/bind mounts are included. Network interface details expand independently below the main overview. Tunnel installation, connector lifecycle, logs, local config and optional Cloudflare-managed configuration are under System → Cloudflare Tunnel; secret fields are password inputs and detected inline secrets are masked.

System tools: Terminal is now a dark xterm.js session with Connect/Disconnect, expand, output search, copy/paste and normal interactive keyboard controls. It ends when leaving the tool. Firewall offers an inline, session-scoped host authorization form instead of a dead-end restricted message. File manager has a location bar, folder filter, drag/drop upload, size/date/permission columns, per-item management, recoverable Trash and a full CodeMirror editor. Cloudflare includes an on-screen step-by-step guide explaining connector tokens versus optional management API credentials and DNS responsibilities.


Firewall sidebar regression: navigation layout now targets `#sidebar` at desktop and mobile breakpoints. The firewall's semantic `<aside>` remains a normal content card. System displays current host privilege state and a one-time root service setup option before individual tools. Installation explains full administrator authority, preserves accounts, requires the host sudo password and an explicit confirmation, and reconnects after restart. Build-versioned asset URLs and a new-build reload notice help avoid stale screens.

Page headers use one title and a Refresh action. The repeated workspace eyebrow, breadcrumb page name and generic descriptions were removed across all sections to reduce visual clutter.

System management layout now uses compact status strips and shared management tables. Firewall displays parsed UFW rules by destination, action, source, direction and IP version; adding/unlocking happens in focused dialogs and deletion is a row action guarded by the observed rule-list revision. Locked/inactive states remain explicit without sample rows. Cloudflare displays connector lifecycle controls in a connector table and local/remote editor access in a configuration table; setup guidance and technical details open on demand. Administrator setup is a compact banner. Table typography, header colors, row hover, action alignment and toolbar spacing are shared with Docker, Files and Users, with responsive wrapping and horizontal scrolling for wide tables.

Websites is an administrator navigation section with Sites and Runtimes tabs. Sites use the shared table hierarchy and distinguish panel-created drafts/running sites from existing configurations managed through the existing-site workspace. Runtime installation is explicit and shows host and website-runtime states separately. Each site has Code, Settings, Logs, HTTPS and Routing tabs. The embedded editor includes a scoped file tree, private History and source download. Runtime absence is displayed before publishing, with an Install runtime action. Sidebar collapse preserves desktop preference and removes hidden navigation from keyboard focus; the header toggle remains visible to reopen it.


## Administration workspace refresh

The shared presentation layer now uses a navy navigation rail, slate workspace, readable semantic status colors, stronger section toolbars and consistent resource tables. Page headings remain singular. Brand and sidebar copy identify the tool without repeated slogans. The header indicates an authenticated session rather than inferring network health.

Typography, controls, dialogs, forms, notices, settings, file management, website editors, terminal toolbars and light/dark themes follow the same sizing and contrast tokens. Container tables fit the desktop workspace and reflow into labeled rows on phones, preserving ports, networks, usage and lifecycle controls. Other wide tables stay in labeled, keyboard-focusable scroll regions.

Dialogs have accessible names and initial/return focus handling. Forms retain existing validation and requests, add pending feedback and focus announced errors. Table headers have column scope, navigation controls expose selected state, and form controls have names. A skip-to-content link is available after sign-in. Container refreshes preserve the focused row action and horizontal scroll.

This refresh changes presentation only. It does not implement the complete improvement backlog, browser SSO login, new server APIs or historical metrics. Existing authentication, permissions, confirmations, backups, revision checks and VPN recovery mechanisms remain unchanged. Browser QA uses isolated credentials and does not mutate production workloads.


## Black theme and existing website management

Dark mode uses neutral black/charcoal workspace, surfaces, navigation and editors. Blue is an action accent, not the surface color. Existing OpenResty sites now open a management workspace rather than a read-only details dialog. Overview, Files & code, Domains & upstream, Logs, Routing configuration, HTTPS and Configuration backups expose their supported operations. Site document roots are detected by directive block context so ACME challenge locations are not mistaken for content roots.

Existing-site file access is scoped to the detected website folder. File edits use revision checks and private history; upload, download, folder creation, rename, move and Trash reuse the existing file manager. Configuration edits cover discovered main/proxy include files, check the whole revision, keep private backups, and test/reload enabled sites with rollback on failure. Domain and single-upstream changes use forms; complex location-specific configuration stays in the editor. Enable/disable retains files and upstream containers. The shared engine is gracefully reloaded, so the confirmation explains its scope. Existing origin certificates can be replaced after validation when the certificate/key pair is unambiguous, mapped locally and not shared with another site. Issuance, renewal and DNS are not automated by this workflow.

Static websites whose document root exists only inside the web-engine image can prepare a new editable folder without changing routing. Files must be added before activation. Switching folders is a separate confirmed, validated configuration change. No existing live site is automatically migrated.

Panel-created websites open an overview with direct management links. Stop and application Restart are top-level controls; Publish remains separate from saving files/settings. External proxy applications remain under Docker for runtime lifecycle; website controls change routing, not application ownership.


## Automatic readiness

Readiness has automatic progress, Run checks now, failed/blocked and pending/unverified counts, per-check evidence/timestamps and export. It no longer shows a manual-verification count or accepts unchecked claims as passed. Runs continue when leaving the page; heavy checks run only once during initialization; later checks require Run checks now. OS/image vulnerability scans and their repair controls are removed; the report discloses these exclusions. Automatic results retain explicit coverage limits for independent review, full VMs and live disaster recovery.
