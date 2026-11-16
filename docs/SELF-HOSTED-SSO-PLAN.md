> Historical design note. SSO/Vault hosting was retired. This document is not current setup guidance; see README.md and COMPONENT-DEPLOYMENT.md.

# Shared, self-hosted sign-in — Keycloak selected

The selected provider is Keycloak, prioritizing OIDC/SAML compatibility and identity administration. Run one shared identity provider for the hosted applications. Do not create a separate provider or user directory for every website. Keep the panel's local administrator and its MFA available as emergency access if the SSO service is unavailable.

## Resource-first option: Authelia

For a single server, use one Authelia service with a local file user database, SQLite persistent storage and its built-in memory session provider. No LDAP, Redis or separate SQL server is required for this single-instance design. Memory sessions mean that restarting the service ends existing SSO sessions; high availability would require a different deployment.

Integrate compatible applications using OpenID Connect authorization code flow with PKCE and exact callback URLs. Use OpenResty's auth_request integration for browser access protection where an application cannot use OIDC. An access gate does not automatically authenticate the user inside an application. Applications with explicit trusted-header authentication can use it only when their upstream is reachable exclusively through a proxy which strips and overwrites identity headers. Never trust browser-supplied identity headers.

Authelia's OIDC provider is OpenID Certified, but its own documentation still labels the feature as open beta. It does not provide every protocol or every enterprise identity-management feature. Confirm the protocol requirements for each proposed application before treating this as the final provider choice.

## Broader identity option: Keycloak

Use one Keycloak instance and one isolated PostgreSQL database with dedicated credentials. It supports OIDC and SAML and has a broader identity administration UI. This adds a JVM service and database overhead. Reusing an existing PostgreSQL server is possible only with a separately permissioned database and compatible backup/upgrade arrangements; never share the application's own database credentials or schemas.

## Planned panel workflow

1. Select the provider and review detected Docker/OpenResty prerequisites.
2. Enter an SSO HTTPS hostname, the domains it may protect, and email/SMTP settings for account verification and recovery.
3. Review a generated private deployment, pinned upstream images, storage locations and resource limits. Validate configuration before starting it.
4. Start the identity service on a private loopback listener. Configure and verify the HTTPS proxy before offering remote SSO.
5. Enroll users and MFA in the identity provider. Keep local panel administrator recovery independent. Do not synchronize or reuse panel password hashes.
6. Add each application with the correct integration type, allowed users/groups, exact callback URLs and minimum scopes. Generate independent secrets per application.
7. Test successful login, rejection, logout, MFA, backup restoration and direct-upstream bypass. Do not expose an application merely because an SSO client has been registered.

Default proxy policy must deny unlisted hosts. API endpoints, webhooks, monitoring and automation clients need explicit service authentication or narrowly scoped exclusions; a browser redirect should not silently break them. Preserve current websites until each integration is reviewed and tested.

Measure actual steady-state RAM, CPU, storage and sign-in load before setting final limits. A process memory limit is a cap, not an estimate of normal use. Avoid deploying both providers by default.

## Current implementation status

The panel has local accounts and TOTP MFA. LDAP support has been removed. Keycloak hosting controls now prepare private deployment files, generate independent random database/bootstrap credentials, pin official image digests, build an optimized production-mode image, and manage start/stop/restart, logs, resource readings and HTTPS issuer verification. The private PostgreSQL database has no published port; Keycloak binds only loopback. A fresh server-panel realm disables self-registration and requires new users to configure TOTP. Create a permanent Keycloak administrator and delete the temporary bootstrap administrator before connecting real users. The panel can remove its saved startup secret afterward.

Panel OIDC browser sign-in is not enabled by hosting Keycloak. Users and client configuration are administered in Keycloak; local panel accounts remain independent. Actual public hosting requires a user-supplied HTTPS hostname and proxy/certificate setup. No real SSO instance has been started by this development change. A disposable Keycloak/PostgreSQL stack was tested and removed. The PostgreSQL Docker volume is not part of the existing panel-file backup verification; add database backup/recovery qualification before production use. SMTP recovery and SAML application configuration are handled in the Keycloak console, not fabricated by the installer.

Native SSO support depends on each target application and edition. In particular, n8n's native OIDC feature currently requires Enterprise; a proxy gate cannot unlock that feature.

References:
- https://www.authelia.com/configuration/session/introduction/
- https://www.authelia.com/configuration/storage/sqlite/
- https://www.authelia.com/configuration/identity-providers/openid-connect/provider/
- https://www.authelia.com/integration/proxies/nginx/
- https://www.keycloak.org/documentation
- https://docs.n8n.io/administer/manage-users-and-access/verify-user-identity/use-oidc.md
