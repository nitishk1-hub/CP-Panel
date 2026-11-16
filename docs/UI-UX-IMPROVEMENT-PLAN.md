# Server Panel UI/UX improvement plan

Prepared 13 November 2026. Status: reviewed and planned; application changes have not started.

## 1. Installation verification

The requested commands were executed from `/home/cyber/Documents/ChatGPT/1PanelServer`:

| Check / command | Result |
| --- | --- |
| `node --version` | `v24.22.3` |
| `npm --version` | `11.19.1` |
| `npx --version` | `11.19.1` |
| `npx -y skills add anthropics/skills --skill frontend-design -a codex -y` | Exit 0; installation complete |
| `npx -y skills add vercel-labs/agent-skills --skill web-design-guidelines -a codex -y` | Exit 0; installation complete |
| `npx -y skills add nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max -a codex -y` | Exit 0; installation complete |
| `npx -y skills list` | Exit 0; lists all three with `Agents: Codex` |

All three `SKILL.md` files were opened and read successfully. The UI/UX Pro Max search utility also ran successfully against its local data.

These are **project-scoped Codex installations**, as selected by the requested commands, not global installations for unrelated projects. Their locations are:

- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/web-design-guidelines/SKILL.md`
- `.agents/skills/ui-ux-pro-max/SKILL.md`

The installer added `.agents/skills/` and `skills-lock.json`. No installation errors remained. Codex can discover the installed skills on the next turn; their instructions were read directly for this review.

## 2. Review scope and evidence

Reviewed the current HTML/CSS/JavaScript implementation and an isolated-account browser preview of the same application. Desktop review used the normal approximately 1280 × 720 viewport; narrow-screen checks used 390 × 844 and then restored the normal viewport.

Browser inspection covered sign-in, Overview, Docker containers and its create dialog, Websites and Runtimes, System firewall, file manager, terminal presentation, Cloudflare Tunnel, WireGuard, and Users & identity including SSO configuration. The current Readiness implementation and earlier verified screen were also reviewed. Website editor and other advanced configuration flows were reviewed in source; they were not exercised through publication or changes to live services.

The preview used a temporary account database and ordinary host permissions. Its administrator-setup notices and disabled privileged actions reflect that preview context; they do not establish a fault in the installed root service. No production credentials, files, firewall rules, containers, websites, VPN settings or directory configuration were changed.

The review is a usability and accessibility assessment, not a security certification or a complete assistive-technology audit. Dark-theme styling was reviewed in source; a full dark-theme browser matrix and screen-reader tests remain acceptance work.

## 3. What to retain

- The five main destinations: Overview, Docker, Websites, System, Users & identity.
- Hideable sidebar, remembered desktop preference, mobile drawer and active-page indication.
- Single page title; the earlier removal of repeated introductory labels was correct.
- Tables for resource inventories, compact container name/status on Overview, and measured data rather than simulated history.
- Explicit installation choices, clear read-only ownership of existing websites, and distinction between host software and website runtime images.
- Real xterm terminal and CodeMirror editors.
- Authentication gates, password-manager support, nine-character password minimum, role checks, secret masking, revision checks, backups and existing confirmation flows.
- Honest Cloudflare verification, VPN availability states, and SSO's current “configuration only” limitation.

## 4. Findings with implementation locations

Priorities: P1 affects task completion, accessibility or safe operation; P2 affects clarity and consistency; P3 is refinement.

| Priority | Location | Verified finding | Planned resolution |
| --- | --- | --- | --- |
| P1 | `public/style.css:1`, `:21`, `:23` | Main body starts at 13px; many meaningful labels and table details use 10–12px. The brand subtitle uses 7px. | Establish a readable type scale and remove decorative microcopy. Keep operational text at least 12px, normally 14–16px. |
| P1 | `public/style.css:1` | `--muted: #778091` against white is approximately 3.98:1; chart labels `#98a1af` against white are approximately 2.61:1. These do not meet the 4.5:1 normal-text target. | Replace text tokens and verify actual foreground/background pairs in both themes, including muted text, placeholders and states. |
| P1 | `public/style.css:1` | Icon controls are 33 × 33px. Narrow-screen inspection also found approximately 30px-high identity tabs. | Provide 44 × 44px touch targets and adequate separation; icons may remain visually smaller inside them. |
| P1 | `public/app.js:37` | The native modal has a visible heading but no accessible name association. Create-container opens with focus on Close. | Link dialog to its heading/description; set appropriate initial focus and verify return focus and keyboard dismissal. Native modal behavior should be retained. |
| P1 | `public/app.js:20` | Custom form errors use an alert paragraph, but lack field association and explicit first-error focus management. | Add field-level messages, `aria-invalid`/`aria-describedby`, and a focusable summary for multi-field failures. Preserve backend validation. |
| P1 | `public/app.js:3`, `:22`, `:70`, `:79` | Pages and subpages are held in JavaScript variables; observed URL remains `/`. | Add URL-backed view/tab/filter state and browser Back/Forward while preserving authentication and unsaved-change guards. Keep sensitive values out of URLs. |
| P1 | `public/docker-workspace.js`, `public/style.css:1` | At 390px, Docker table content was approximately 954px wide within a 339px viewport. Row actions require a long horizontal scroll. | Mobile rows expose name, status and an action menu immediately; retain ports/networks/usage in expandable details or an accessible full-table view. |
| P1 | `public/host-overview.js:9–13`, `public/app.js:47` | Metrics/table refreshes replace markup regularly; Docker row rendering can replace focused row buttons. | Update values by stable resource identity and preserve focus, selection, filters and scroll. Add a visible freshness indicator and pause for visual live updates. |
| P2 | `public/style.css:11`, `:26` | Tab strips showed vertical scroll controls on desktop and both scroll directions on mobile; measured mobile content was 1px taller than the strip. | Correct vertical overflow and padding, provide horizontal affordances, and make the active destination visible without clipping focus outlines. |
| P2 | `public/index.html:5–9` | Repeated workspace slogans consume sidebar height. The server identity looks like a dropdown without a corresponding interaction. | Remove slogans and the decorative dropdown affordance; retain a compact host identity and account controls. |
| P2 | `public/index.html:5–13` | Header/sidebar display “Local connection” / “Connected locally” independently of verified service health or access route. | Use precise labels based on existing data: host identity, last successful response and service-specific health. Do not infer HTTPS or tunnel health from these labels. |
| P2 | `public/websites.js:12` | Runtime table has disabled install controls in the non-root preview without a nearby explanation. | Place the permission/dependency reason beside the runtime action and link to the existing setup destination. Do not change permission requirements. |
| P2 | `public/app.js:38` | The shared confirmation helper styles its final action as danger, including routine operations. | Use neutral/primary styling for ordinary confirmed actions and reserve danger for destructive or disruptive operations. Keep confirmation semantics. |
| P2 | `public/app.js:43` | Job results use generic completion/failure notices; job watching is tied to the current view generation. | Show the resource, requested action, running/result state and relevant output; retain job ID so a running job can be reopened during the session. No new job APIs. |
| P2 | `public/app.js:84` | SSO issuer placeholder still uses `/realms/sentinel`. | Use Server Panel terminology and a neutral issuer example, while keeping the configuration-only notice visible. |
| P2 | `public/index.html:10–13` | No skip-to-content link. | Add a keyboard-visible skip link and a main-content focus destination. |
| P2 | `public/app.js:70`, `:79` | Page-like subnavigation uses ordinary buttons without full tab semantics or deep links. | Use links for destinations; reserve ARIA tabs with arrow-key behavior for true local tab panels. |
| P2 | `public/app.js:28`, `public/docker-workspace.js` | Sampled forms have IDs and labels but lack meaningful `name` attributes; dialog inputs commonly have no autocomplete policy. | Add names and appropriate autocomplete/input types. Preserve username/current-password/new-password handling and allow paste. |
| P3 | `public/style.css` | Shared styles have accumulated multiple overrides and inconsistent component sizes. | Consolidate into tokens and clearly scoped layout/component sections, with visual comparisons before removing overrides. |
| P3 | `docs/UI.md` | Earlier paragraphs contradict later implementation notes about terminal and navigation. | Replace chronological notes with an accurate current interaction specification after implementation. |

Contrast figures above are calculations from current CSS colors, not a claim that every rendered element was measured. Small text size is a readability finding; size alone is not automatically a WCAG violation.

## 5. Proposed visual direction

**An operator's workspace: calm, readable and compact enough to compare real server data.** The distinctive element is the information hierarchy: resource identity first, verified state second, action third. Avoid marketing-style hero sections, decorative gradients, repeated descriptions and ornamental cards.

### Core tokens

| Role | Proposed light-theme value |
| --- | --- |
| Workspace | `#F4F6F9` |
| Surface | `#FFFFFF` |
| Primary text / navigation | `#182230` |
| Secondary text | `#475569` |
| Primary action / focus | `#1D4ED8` |
| Separators | `#CBD5E1` |

Use semantic success, warning, danger and unknown tokens with independently checked text, background and border pairs. Never rely on a dot or color alone. Dark mode needs its own checked pairs rather than automatic inversion. Secondary text and blue-on-white in this proposal calculate to approximately 7.58:1 and 6.70:1 respectively; the complete component palette still needs validation.

Typography proposal: self-host IBM Plex Sans for interface text and IBM Plex Mono for commands, paths and identifiers, with system fallbacks. Validate readability and the packaged font license before adding assets. No runtime Google Fonts requests. Use 16px default text, 14px table/form text, 12px minimum supporting data, 20–24px page titles, tabular numerals, and 1.4–1.6 line heights. A user-selected compact table density can reduce spacing without shrinking essential text.

Spacing: 4/8/12/16/24/32px scale. Standard desktop row height approximately 48–56px; larger when content wraps. Use subtle borders, restrained 6–8px radii and shadows only for overlays. Align names left, numeric values right, and row actions consistently. Show units beside values.

One page heading and one primary creation/action button per working area. Long descriptions belong in Help or expandable details. Keep advanced options available through progressive disclosure.

Desktop structure:

```text
Host / navigation | Page title                          Refresh
                  | Subnavigation
                  | Compact status summary, when useful
                  | Search / filters               Primary action
                  | Resource table or working surface
                  | Result / count / last updated
```

Mobile structure:

```text
Menu                                      Account
Page title                                Refresh
Current section / accessible subnavigation
Search + filters                          Add
Resource name       State                 Actions
  Expand for ports, networks and measurements
```

## 6. Screen-by-screen work

| Screen | Improvements and completion criteria |
| --- | --- |
| Sign-in, recovery, account | Simplify decorative copy and use a clear form title. Keep menus hidden before authentication. Preserve Show/Hide, paste, password-manager autocomplete, nine-character minimum and recovery workflow. Explain field errors without clearing valid input. Recovery codes remain outside browser persistence and analytics. |
| Sidebar and header | Keep all five destinations and hide/show behavior. Remove unused dropdown cues and slogans. Use real navigation links, consistent icons and keyboard-visible focus. Opening/closing the mobile drawer manages focus and Escape; hidden navigation stays inert. |
| Overview | Keep four current metrics, aligned resource/network charts, all mounts, compact name/status containers, tunnel health and host details. Improve labels and chart axes; show last sample time and unavailable/stale values explicitly. Add a pause control and accessible current-value/data summary. Do not add fake history or a 24-hour selector without historical data. |
| Docker containers | Consistent sortable presentation of already-returned values, filter persistence, readable names, copyable bindings, clear internal-only versus published ports, and immediately accessible mobile actions. Details can use a wide focused workspace. No change to container lifecycle or resource ownership. |
| Compose | Make Edit, Pull/update, optional Build, Deploy and Logs discoverable. Show reviewed file scope and deployment progress. Preserve ordered files, environment-file handling, revision review and existing pull/build/deploy sequence. Never imply that an update happened until the job succeeds. |
| Networks, images, volumes, cleanup | Reuse the same table pattern. Put detailed IDs/digests behind disclosure. Cleanup clearly describes image versus builder-cache scope and existing usage guards. Do not invent reclaimed-space estimates when the API has none. |
| Websites | Present “Managed here” and “Detected existing” ownership explicitly. Make the primary action Create website. Explain “0 of 3 website runtime images installed” once with a link to Runtimes. Static sites do not need an application runtime image. Preserve existing-site read-only behavior. |
| Website detail and editor | Group Code, Settings, Logs, HTTPS and Routing consistently. Keep file identity, saved/unsaved status and Save visible; label Publish as a separate deployment action. Retain private history, revision checks and unsaved-change protection. Reflow file tree/editor on narrow screens. |
| Runtimes | Clearly distinguish host installation from isolated website images. Identify optional Composer separately from the three language runtimes. Installation/update progress and dependency/permission explanations appear beside the selected runtime. |
| Firewall | Keep rule table and consistent source/destination/protocol labels. Consolidate authorization guidance into one useful notice. Preserve the distinction between locked, inactive, active and unknown. Keep delete revision checks and the warning about Docker-published ports. |
| Terminal | Retain xterm behavior and explicit Connect. Make connection state, host context and session-ending behavior clear. Keep search, copy/paste and expansion in a compact toolbar, with an optional keyboard guide. No automatic shell commands during navigation. |
| Files | Add navigable breadcrumbs alongside editable path, consistent sort/filter presentation and clear file/folder/symlink indicators. Keep upload progress, Trash/restore, editor, revision protection and backups. Root-relative path scope must remain evident. Large directories need incremental rendering of the existing response, not invented server pagination. |
| Cloudflare Tunnel | Separate connector process state from verified edge connectivity. Show configuration ownership and a single Setup guide. Present local versus Cloudflare-managed setup as distinct flows using existing capabilities. Keep token masking and avoid claiming hostname/DNS creation unless actually performed. |
| WireGuard | Separate interface state, latest handshake and peer availability. Show draft versus applied status clearly. Keep the rollback countdown and confirmation persistent during a pending transaction. Expose existing acknowledgements and client-export expiry clearly. Never put private keys in summary views, URLs or persistent browser storage. |
| Readiness | Prioritize blockers, warnings and manual checks; provide filters over the existing result data. Give each item a readable explanation, available next action and checked time. Keep “Not production-qualified” until the actual release criteria are satisfied. |
| Users, LDAP, SSO | Show role permissions at assignment time; retain Viewer default and server enforcement. Group directory connection/security settings without weakening verified LDAPS. Name the SSO page “SSO configuration” and keep its current limitations visible. No claim of implemented browser SSO or identity-provider hosting. |
| Installation experience | Align terminology and help with the existing installer: admin credentials and confirmation, nine-character minimum, local port, optional exact HTTPS origin, recovery acknowledgement and optional capabilities. Keep CLI functionality; a browser installer or new install API is outside this UI-only plan. |

## 7. Shared interaction contracts

- Tables: semantic headers, a recognizable search/filter toolbar, counts and appropriate empty states. Retain all information through details even when mobile hides secondary columns. Provide keyboard-operable overflow and visible scroll affordances.
- State vocabulary: Installed / Not installed; Running / Stopped; Verified / Unverified; Managed here / Detected existing; Saved draft / Applied. Do not conflate installation, permission, process state and health.
- Forms: visible labels, correct input types, named controls, concise hints, pending labels such as “Saving…”, field errors, preserved input and clear completion. Confirm navigation away from unsaved configuration wherever needed, including existing file and VPN editors.
- Feedback: distinguish initial loading, refreshing existing data, stale data, permission restriction, missing dependency, empty inventory and request failure. Show a retry action where appropriate. Persistent failures must not disappear with a short-lived toast.
- Confirmations: show resource and scope, use the action's name, retain existing approvals, and visually distinguish destructive/disruptive actions. Do not add additional modal steps to routine reads.
- Jobs: show requested operation, resource, progress/output and final result. Reopen active jobs using existing job IDs during the current session. Do not promise cancellation without backend support.
- Accessibility: visible focus, skip link, meaningful dialog names, keyboard navigation, non-color state labels, reduced motion and WCAG 2.2 AA verification. Live metrics should not create repetitive screen-reader announcements.
- Motion: short, purposeful menu/dialog transitions only; respect reduced motion. Avoid animating layout dimensions or adding a chart library for the current small sample count without evidence of need.

## 8. Implementation sequence and protection boundaries

1. **Baseline and foundations:** save before views and interaction cases; establish tokens, typography, spacing, buttons, forms, notices and tables. Keep the current plain JavaScript/CSS stack.
2. **Shell and accessibility:** deep links, keyboard flow, dialog naming/focus, mobile drawer and predictable tab navigation. Confirm permission-based visibility still matches current roles.
3. **Highest-use operations:** Docker/Compose, Websites/Runtimes and Files. Apply shared patterns without removing capabilities or changing request payloads.
4. **Host and identity tools:** Firewall, Terminal, Cloudflare, WireGuard, Readiness, LDAP and SSO configuration. Preserve all security and recovery behavior.
5. **Overview and release QA:** chart accessibility, data freshness, both themes, responsive checks, long-data cases and regression review. Update UI documentation to match the resulting interface.

Implementation is limited to the presentation layer, local routing state and UI documentation. Preserve `src/`, API endpoints and payloads, authentication/cookies, roles, business rules, root-service behavior, networking commands, validation, backups and transaction mechanics. Any requirement that truly needs a backend change must be separated and reviewed explicitly rather than hidden inside the redesign.

Use no framework migration, new UI dependency or new runtime CDN as a prerequisite. Centralize repeated render helpers and styles incrementally rather than rewriting the entire application in one pass.

## 9. Acceptance and regression checklist

- All existing backend tests pass; the last prior application validation had 59 passing tests. They were not rerun merely to install skills or write this plan.
- No endpoint, payload, authorization or service behavior changes in a UI-only diff.
- Every existing action remains reachable; unavailable actions explain permission/dependency/ownership limitations.
- Browser Back/Forward, refresh and direct links restore the intended permitted page/subpage. Authentication is checked before rendering protected content.
- Desktop: 1280 and 1440px; tablet: 768 and 1024px; phone: 390px with a 320px reflow check; 200% zoom. Page chrome must not overflow horizontally. Full data tables may scroll within a labeled region.
- Text contrast at least 4.5:1 for normal text; relevant UI boundaries/focus indicators at least 3:1. Test all states in both themes, including disabled/read-only distinctions.
- Touch controls at least 44 × 44px as the design target; no critical operation depends only on hover or a tiny icon.
- Keyboard-only checks cover sign-in, navigation, filters, tables, menus, dialogs, errors, editors and terminal controls. Verify focus is visible and not obscured; use a screen reader for labels, errors and state changes.
- Live updates preserve focused row controls, selection, filters and scroll. Pause does not falsify freshness or interfere with the server's independent VPN rollback timer.
- Loading, empty, missing-runtime, restricted, external/read-only, stale and failed states have explicit cases. Use fixtures for failures instead of changing the host.
- Names/domains/paths/IPv6 addresses of realistic long lengths wrap or disclose fully without hiding actions.
- Regression scenarios include password change/recovery, Viewer and Operator restrictions, Compose update review, file stale-save handling, website publish/rollback, terminal cleanup and WireGuard confirmation/rollback. Use isolated fixtures or disposable hosts for mutations; no production workload is a visual-test fixture.
- No secrets in screenshots, local/session storage, URLs or logs. UI preferences and non-secret route state may be stored.
- Capture before/after screens at matching sizes and compare each completed phase before deployment.

## 10. How the installed guidance informed this plan

Frontend Design informed the compact token system, deliberate typography, removal of decorative copy and a restrained direction suited to a server operator. The product's existing preferences take precedence over marketing-oriented design suggestions.

Web Design Guidelines informed checks for semantic controls, accessible naming and focus, URL state, form feedback and responsive behavior. Fresh rules were retrieved from the [Vercel guidelines source](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) during this review. The location-based findings above are the review output; implementation details are this plan's recommendations.

UI/UX Pro Max informed touch sizing, typography, error-summary handling and live-chart alternatives. Its system-wide search returned a marketing “Hero + Features + CTA” pattern, and a narrowed product search did not produce a verified server-administration match. Those product-layout suggestions were rejected. This plan's operator-console layout is project-specific design judgment; the verified chart and form guidance was used selectively. The application uses plain HTML/CSS/JavaScript, so no React, Next.js or Tailwind implementation guidance was assumed.
