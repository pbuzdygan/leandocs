# Configuration

LeanDocs is configured with environment variables. With Docker Compose, put them in a `.env` file next to `compose.yaml`; the compose file passes them to the container. Without Docker, set them in the environment of `node dist/main.js` (or in `.env` for `pnpm dev`).

Invalid values stop the server at startup with a message that names the variable. LeanDocs never starts with a setting it does not understand.

## Quick reference

| Variable                | Default             | Values                                                 | Purpose                                            |
| ----------------------- | ------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `DATA_DIR`              | `./data` (`/data`¹) | a folder path                                          | Where documentation and app data are stored        |
| `PORT`                  | `8080`              | 1–65535                                                | Port the server listens on                         |
| `HOST`                  | `0.0.0.0`           | an address                                             | Address the server listens on                      |
| `SESSION_COOKIE_SECURE` | `false`             | `true` / `false`                                       | **Set `true` behind HTTPS**                        |
| `PUBLIC_ORIGIN`         | empty               | `https://docs.example.com`                             | The one address browsers use to reach LeanDocs     |
| `AUTH_MODE`             | `local`             | `local`, `proxy`, `none`                               | How people sign in                                 |
| `PROXY_TRUSTED_IPS`     | empty               | 1–32 IP addresses, comma-separated                     | `AUTH_MODE=proxy` only                             |
| `PROXY_AUTH_HEADER`     | empty               | `remote-user` or an `x-…` header                       | `AUTH_MODE=proxy` only                             |
| `PROXY_AUTH_USER`       | empty               | one user name                                          | `AUTH_MODE=proxy` only                             |
| `MAX_UPLOAD_SIZE`       | `52428800` (50 MiB) | 1–1073741824 bytes                                     | Largest attachment or imported attachment          |
| `WATCH_MODE`            | `native`            | `native`, `poll`, `off`                                | How changes made outside LeanDocs are noticed      |
| `ASSIGN_MISSING_IDS`    | `true`              | `true` / `false`                                       | Add a document id to Markdown files that have none |
| `LOG_LEVEL`             | `info`              | `fatal` `error` `warn` `info` `debug` `trace` `silent` | How much the server logs                           |
| `WEB_DIST_DIR`          | unset (`/app/web`¹) | a folder path                                          | Built web app to serve; unset in development       |

¹ Set by the Docker image. You do not need to change it.

Boolean values accept `true`/`false`, `1`/`0` and `yes`/`no`.

Compose-only variables (they configure the container, not LeanDocs):

| Variable         | Default                      | Purpose                                                            |
| ---------------- | ---------------------------- | ------------------------------------------------------------------ |
| `LEANDOCS_TAG`   | `latest`                     | Image tag to run (`compose.yaml`): `1.0.0`, `latest`, `dev_latest` |
| `LEANDOCS_IMAGE` | `ghcr.io/pbuzdygan/leandocs` | Image to run (`compose.yaml`), e.g. a mirror                       |
| `LEANDOCS_PORT`  | `8080`                       | Port on the host                                                   |
| `LEANDOCS_BIND`  | `0.0.0.0`                    | Host address to listen on; `127.0.0.1` keeps it local to the host  |
| `LEANDOCS_UID`   | `1000`                       | User id the container runs as (`id -u`)                            |
| `LEANDOCS_GID`   | `1000`                       | Group id the container runs as (`id -g`)                           |

## Storage

`DATA_DIR` contains everything LeanDocs keeps:

```text
data/
  content/           your documentation: Markdown files, folders and <name>.assets/ attachments
    _templates/      document templates (plain Markdown; created once, edit freely)
    _trash/          deleted documents and folders until the trash is emptied
  system/
    app.db           account, sessions, pins and the search index (SQLite)
    auth.initialized marks that the administrator account was created
    mfa.key          encryption key for authenticator-app sign-in
```

`content/` is the source of truth. You can read, edit, copy or put it under Git with any tool, and LeanDocs notices the changes (see `WATCH_MODE`). The search index in `app.db` can be rebuilt from `content/` at any time (Settings › Index). The account, sessions, pins and settings in `app.db` cannot be rebuilt.

**Back up the whole data folder.** Keep `app.db`, `auth.initialized` and `mfa.key` from the same moment together. If `auth.initialized` exists without its `app.db`, LeanDocs refuses to start instead of offering a new administrator account to whoever opens the page first. Restore with file permissions kept (`cp -a`, `rsync -a`, `tar -p`): `auth.initialized` and `mfa.key` must stay readable only by their owner.

With Docker, the container runs as UID/GID 1000 by default. Set `LEANDOCS_UID`/`LEANDOCS_GID` to your own ids, so the files in `./data` belong to you and you can edit them directly.

## Network and HTTPS

The server speaks plain HTTP. For anything beyond your own computer, put an HTTPS reverse proxy in front of it, for example Nginx Proxy Manager, and set:

```dotenv
SESSION_COOKIE_SECURE=true
PUBLIC_ORIGIN=https://docs.example.com
```

- **`SESSION_COOKIE_SECURE=true`** makes the browser send the sign-in cookie only over HTTPS. It also tells LeanDocs that the browser address starts with `https://`. Without it (and without `PUBLIC_ORIGIN`), LeanDocs behind HTTPS rejects every save as a cross-site request. Do not set it if you open LeanDocs over plain `http://`: sign-in would then stop working.
- **`PUBLIC_ORIGIN`** is the exact address in the browser, without a path (`https://docs.example.com`, or `https://docs.example.com:8443` with a non-standard port). When it is set, the LeanDocs API only answers requests addressed to that host. This blocks access through other host names that point at the same server. Recommended for every deployment with a domain.
- The proxy must pass the original `Host` header (Nginx Proxy Manager does). For live updates when files change, it must not buffer responses of `/api/v1/events`. LeanDocs asks for this with `X-Accel-Buffering: no`, which Nginx-based proxies respect.
- `LEANDOCS_BIND=127.0.0.1` (Docker) or `HOST=127.0.0.1` (without Docker) keeps the plain HTTP port reachable only from the same machine. Use it when the proxy runs on the same host.

## Authentication

### `AUTH_MODE=local` (default)

LeanDocs has one administrator account, created on the first visit. Sign-in uses a password (at least 15 characters). In Settings › Security you can change it and add an authenticator app. Use this mode with an ordinary HTTPS proxy such as Nginx Proxy Manager.

### `AUTH_MODE=proxy`

Use this mode only with an authentication gateway (for example oauth2-proxy or Authelia) that signs the user in and then forwards an identity header that clients cannot set themselves. LeanDocs then has no login of its own and trusts the header only under these conditions:

- **`PROXY_TRUSTED_IPS`:** the request comes directly from one of these addresses (exact IPs, no ranges). In Docker, this is the address of the gateway container or host as seen by the LeanDocs container.
- **`PROXY_AUTH_HEADER`:** the request carries exactly one header with this name. Allowed names are `remote-user` or a dedicated `x-…` header; `x-forwarded-*` and `x-leandocs-*` are refused.
- **`PROXY_AUTH_USER`:** the header value is exactly this user.

Example:

```dotenv
AUTH_MODE=proxy
PROXY_TRUSTED_IPS=172.20.0.5
PROXY_AUTH_HEADER=x-auth-request-user
PROXY_AUTH_USER=owner@example.com
```

Sign-out and two-factor sign-in are handled by the gateway. A local account created earlier is kept, for a later return to `local`.

### `AUTH_MODE=none`

This mode turns sign-in off. **Anyone who can reach the server can read, edit and delete all documentation.** Use it only on a private, trusted network or for a single-user machine. Settings shows a permanent warning, and the server logs one at startup.

## Uploads

`MAX_UPLOAD_SIZE` is the largest single attachment in bytes. The same limit applies to pictures and files copied by an import. Allowed types are PNG, JPEG, WebP, SVG, PDF, TXT, YAML, JSON and ZIP. File contents are checked against their type. One import request accepts up to 10,000 files and 256 MiB of documents and attachments. Larger libraries can be imported folder by folder.

When a reverse proxy has its own upload limit (Nginx: `client_max_body_size`), set it at least as high. Imports send many files in one request, so allow more for them.

## Changes made outside LeanDocs

- **`native`** (default): the operating system reports file changes, and LeanDocs updates within about a second. Open documents refresh, or show a conflict while you edit.
- **`poll`:** checks the files every second. Use it when native events do not arrive, which is common on network shares (NFS, SMB) and some Docker Desktop or VM mounts.
- **`off`:** no background watching. LeanDocs re-reads the folder when pages load, so changes still appear, but open pages do not update by themselves.

`ASSIGN_MISSING_IDS=true` adds an `id` (and missing `title`, `created`, `updated`) to the front matter of Markdown files that have none, the first time LeanDocs sees them. Only those lines are added; the rest of the file stays byte for byte the same. With `false`, such files get a temporary id that changes when the file moves, so links by id and pins do not follow a move.

## Logging

Logs are JSON lines on standard output (`docker compose logs`). `info` reports startup, external changes, warnings and errors. `debug` and `trace` also log every request with its method and address (URLs include search terms), but never request bodies, cookies or passwords.

## Example: Nginx Proxy Manager

```dotenv
# .env next to compose.yaml
LEANDOCS_TAG=1.0.0
LEANDOCS_UID=1000
LEANDOCS_GID=1000
SESSION_COOKIE_SECURE=true
PUBLIC_ORIGIN=https://docs.example.com
AUTH_MODE=local
```

In Nginx Proxy Manager, add a proxy host for `docs.example.com` that forwards to `http://<docker-host>:8080`, and enable SSL with "Force SSL". The [deployment guide](deployment.md) has the full steps.
