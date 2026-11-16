# Image registries and bulk pulls

Docker Engine packages come from signed APT repositories. Container images come from registries. These are separate configuration areas. Updating Docker's packages does not select an image registry or update running application images.

Open Docker → Images → Registries to manage saved image sources. Docker Hub, GitHub Container Registry and Quay are supplied initially. Add a custom registry using a hostname and optional port, plus an optional namespace/repository prefix. Choose a default for new manual image pulls. A prefix such as team/project is prepended to unqualified image references.

Open Pull images, select a source, and enter one image per line (up to 50). Fully qualified addresses such as ghcr.io/team/app:1.0 retain their registry, even when a different source is selected. Docker Hub official images are expanded to docker.io/library/name. Omitted tags resolve explicitly to latest; sha256 digest pins are preserved. The review screen shows every exact address before starting the job. Duplicate resolved references are pulled once.

Pulls run sequentially. Choose whether the batch should continue after a failure. The operation reports succeeded, failed and skipped counts. Any failed pull makes the overall job fail; successfully downloaded images remain. Pulling alone does not recreate containers, restart workloads, change Compose files or edit Docker daemon mirrors. Use the existing reviewed Compose update workflow to redeploy applications.

Private registry sign-in uses docker login with --password-stdin. Tokens are never passed as command-line arguments, returned in source settings, stored in source metadata, or included in panel audit actions. Docker stores credentials for the OS account running the panel (root for the installed service) using its existing DOCKER_CONFIG and credential-helper configuration. If no helper is configured, Docker's standard fallback stores base64-encoded credentials, which are not encryption. Protect that Docker client configuration and include an appropriate credential backup/re-enrollment procedure. It is outside the panel-data backup scope unless explicitly included there.

A registry host has one active Docker sign-in, shared across all saved namespaces for that host and Docker operations using the same OS account/configuration. Signing out affects future private pulls. Removing or changing a saved source does not remove old credentials automatically and never deletes local images or containers. No private account is claimed verified merely because a source was saved; only a successful Docker sign-in records its timestamp, and later token expiry is reported by Docker during a pull.

Existing Compose, website runtime and hosted SSO image addresses are preserved. The manual default does not redirect them, add fallback publishers or disable TLS validation. Custom registries must work with the host's existing Docker TLS/network policy; this feature does not add insecure-registry settings or restart Docker.

All registry settings, sign-in/out, pull-plan previews and batch execution require a panel administrator. Changes and pulls require explicit operation intent, an allowed origin, current settings revisions and confirmation. Image pulls validate the complete list before beginning.

Docker reference: https://docs.docker.com/reference/cli/docker/image/pull/
Credential storage: https://docs.docker.com/reference/cli/docker/login/
