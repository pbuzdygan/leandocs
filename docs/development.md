# Development

## Prerequisites

- **Node.js 24 LTS, minimum 24.7.0 (built-in Argon2id)** (see `.nvmrc`)
- **pnpm** through corepack. The version is pinned in `package.json` → `packageManager`.

```bash
corepack enable          # needs write access to Node's bin dir; otherwise:
# corepack enable --install-directory ~/.local/bin   (and make sure it is on PATH)
pnpm install
```

> If `corepack enable` is not possible, every command also works as `corepack pnpm <cmd>`. Note that the root scripts call `pnpm` internally, so `pnpm` must be on `PATH` for `pnpm typecheck`, `pnpm dev` and `pnpm build`.

## Preview the UI

There are two ways to look at the current interface. Both show the same app.

**1. Docker Compose** (closest to production; no Node.js needed). The image is built from this repository:

```bash
mkdir -p data/content
cp -r examples/demo-content/. data/content/     # optional sample documentation
docker compose -f compose_local_build.yaml up --build -d   # http://localhost:8080
```

Optional `.env` next to the compose file: `LEANDOCS_PORT=8090` if 8080 is taken, and `LEANDOCS_UID`/`LEANDOCS_GID` (output of `id -u` / `id -g`) so the files in `./data` stay owned by you. After pulling new code, run the same command again. Stop with `docker compose -f compose_local_build.yaml down`. `compose.yaml` is the production file: it runs the published image instead of building one. A plain `docker compose up` therefore pulls from GHCR. Both files use the same project and service names, so switching between them replaces the container but keeps `./data`. Your documents in `./data/content` are plain files and stay where they are.

**2. Development server** (hot reload while coding; needs Node 24 + pnpm):

```bash
DATA_DIR=./data pnpm dev    # http://localhost:5173 (API on PORT, default 8080)
```

## Everyday commands

| Command                             | What it does                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Fastify server (`tsx watch`, port `PORT`, default 8080) and the Vite dev server on http://localhost:5173, which proxies `/api` to the server |
| `pnpm lint`                         | ESLint (flat config, `eslint.config.js`)                                                                                                     |
| `pnpm typecheck`                    | `tsc` in every workspace package                                                                                                             |
| `pnpm test`                         | Vitest, all projects (`shared`, `server`, `web`)                                                                                             |
| `pnpm test:watch`                   | Vitest in watch mode                                                                                                                         |
| `pnpm build`                        | Builds web (`apps/web/dist`), then server (`apps/server/dist`, bundled with tsup)                                                            |
| `pnpm start`                        | Runs the built server (set `WEB_DIST_DIR=apps/web/dist` to serve the UI too)                                                                 |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                                                                     |

If port 8080 is busy: `PORT=9000 pnpm dev` (the Vite proxy follows `PORT`, or set `LEANDOCS_API_URL`).

## Environment variables

Every setting, with defaults and allowed values, is in [configuration.md](configuration.md); `.env.example` lists them for local use. Notes for development:

- `pnpm dev` keeps data in `DATA_DIR` (default `./data`). Use a separate folder (`DATA_DIR=./data-dev`) to keep test documents away from the Docker preview.
- `WEB_DIST_DIR` stays unset: Vite serves the web app on port 5173 and proxies `/api` to `PORT` (or `LEANDOCS_API_URL`).
- Keep `SESSION_COOKIE_SECURE=false` over plain `http://localhost`.
- `LOG_LEVEL=debug` logs every request.

## External reverse proxy and authentication gateway

For **Nginx Proxy Manager providing HTTPS and routing**, keep `AUTH_MODE=local` and set
`SESSION_COOKIE_SECURE=true`. LeanDocs handles account setup/login; your existing NPM handles
TLS and forwarding. LeanDocs does not build, install or run another proxy. Browser traffic must
use the HTTPS hostname; keep the backend accessible only where intended. Preserve the browser's
Host header in NPM. Set `PUBLIC_ORIGIN=https://docs.example.com` to pin your chosen public origin
(replace the example with your domain); this also rejects alternate API hosts. The health endpoint
remains available for internal container checks. Forwarded headers do not determine the origin.

Select `AUTH_MODE=proxy` only when your gateway actually authenticates and authorizes the user
and **overwrites** the identity header with that verified identity on every forwarded request.
An ordinary proxy host or an unverified client header is insufficient. Example environment:

```dotenv
AUTH_MODE=proxy
PROXY_TRUSTED_IPS=192.0.2.10
PROXY_AUTH_HEADER=x-auth-request-user
PROXY_AUTH_USER=owner@example.com
```

Replace the example IP with the gateway's direct connection IP **as seen by LeanDocs**, and the
header/identity with your gateway's output. `PROXY_TRUSTED_IPS` is a comma-separated list of
1–32 exact IPv4/IPv6 addresses; no hostnames, CIDR, wildcards or automatic trust of Docker
networks. IPv4-mapped IPv6 addresses are recognized. The header may be `remote-user` or a
dedicated `x-` name; forwarded and LeanDocs protocol headers are rejected. The user is one
case-sensitive ASCII identity (1–256 characters, no whitespace or commas), not a list/group.
Missing or invalid settings stop startup. Compose passes these variables through from `.env`.

The gateway must strip/replace the chosen header supplied by clients. Restrict backend network
access so callers cannot bypass it. A shared upstream proxy IP alone cannot prove the end-user
identity: the header must come from successful gateway authentication. Forwarded IP chains,
forwarded scheme headers and local cookies do not grant proxy-mode access. Health, setup status
and session status remain public; content/attachments require the configured identity.

Proxy mode needs no local account and sets no application session cookie. Each request checks
the peer and exact authorized identity again. Local credential endpoints are disabled; existing
accounts/sessions remain stored for a later return to local mode. The UI displays the gateway
user, skips local setup, and shows gateway instructions when access is missing. Sign-out and MFA
belong to your external gateway. General CSRF protection and security headers apply; production deployment and release validation remain in Phases 14–15.
See [ADR-0013](adr/0013-trusted-proxy-authentication.md).

## Deliberately disable login for a private installation

Set `AUTH_MODE=none` only when everyone who can reach the application should be allowed to
read, edit and delete documentation. Missing/empty `AUTH_MODE` still selects `local`; invalid
values stop startup. Settings shows a persistent warning in every section and startup logs warn.
There is no toggle in Settings and no automatic fallback when local/proxy authentication fails.

None mode skips account creation and login. `/login` opens documentation; `/setup` explains that
authentication is disabled. The API reports mode `none` with no user and creates no session
cookie. Local setup/login/logout POSTs are disabled. Existing accounts/sessions are preserved;
select `AUTH_MODE=local` and restart to require the existing account again. Normal validation,
path restrictions, upload limits and Markdown sanitization still apply. General CSRF protection also applies in this mode.

For the owner's public Nginx Proxy Manager deployment, keep `AUTH_MODE=local` and
`SESSION_COOKIE_SECURE=true`. HTTPS alone does not restrict who can edit documentation.
See [ADR-0014](adr/0014-deliberate-unauthenticated-mode.md).

## CSRF protocol for API clients

Every API mutation (POST/PUT/PATCH/DELETE, including uploads and index rebuilds) requires one
`X-LeanDocs-CSRF` header. First GET `/api/v1/auth/session` and use its `csrfToken`; local mode
also requires the session cookie, and proxy mode requires the verified gateway identity.
For login use the anonymous token, then fetch a new token after login. Tokens from another local
session are rejected. Proxy and none tokens change after restart. Setup uses its separate
`X-LeanDocs-Setup-Token` from GET `/api/v1/auth/setup`; local credential mutations remain
unavailable in proxy/none mode.

The browser client obtains a fresh session token before each content mutation, including multipart
uploads. A failed mutation is reported without automatic replay. API scripts should likewise fetch
fresh status, preserve cookies where applicable, and send the token in the header, never the body
or query string. Requests without browser Origin/Referer metadata still require the token.

Cross-site and same-site-but-different-origin browser mutations are rejected before body parsing.
If supplied, Origin must match the configured `PUBLIC_ORIGIN` (or the request Host and scheme);
Referer is checked when Origin is absent. `SESSION_COOKIE_SECURE=true` selects HTTPS for this
fallback behind NPM. No cross-origin access policy is enabled. CSRF does not authenticate callers:
none mode still grants full access to anyone who can reach the application. See
[ADR-0015](adr/0015-general-csrf-protection.md).

## Browser security headers

The production server applies CSP and security headers to HTML, static assets, API responses and
errors. Scripts load only from the application origin; inline scripts and event handlers are blocked.
Mermaid and the UI require inline styles, which are allowed without changing HTML sanitization.
Bundled fonts can use same-origin files or data URLs; external font hosts are blocked.
Application framing, embedded frames/objects, foreign connections and foreign form submissions are
blocked. Markdown images may use local, data or HTTP(S) URLs; authored external images still contact
their hosts, but the application sends no referrer. SVG downloads retain their stricter sandbox.

For HTTPS through NPM, `SESSION_COOKIE_SECURE=true` also emits one-year HSTS without affecting
subdomains or requesting preload. NPM should force HTTP to HTTPS and pass application headers
through. Do not add a second CSP without checking compatibility: browsers enforce both policies.
Forwarded scheme headers do not enable HSTS. Plain HTTP development does not emit HSTS or force
HTTPS. Vite serves its own development HTML/HMR; production CSP is verified against the built app.
No additional proxy is created. See [ADR-0016](adr/0016-security-headers-and-csp.md).

## Local sign-in rate limits

Local login admits up to five attempts per direct connection IP and ten across all IPs in a rolling
60-second window. Unknown usernames, successful logins and concurrent attempts share the budget;
changing usernames, cookies or forwarded IP headers does not reset it. Rejected retries do not
extend the wait. A throttled response reports how many seconds remain in both the error and
`Retry-After`; busy password verification reports a one-second retry. The login form displays the
message, clears the password and sends no automatic retry. Existing sessions and content stay usable.

Behind ordinary NPM, sign-ins share the proxy's direct-IP budget. No new trusted-forwarded-IP
configuration or `PROXY_AUTH_*` setting is needed for local login. In proxy authentication mode,
login limits and MFA belong to the external authenticating gateway; none mode has no local login.
The reviewed thresholds are constants in `auth/rate-limit.ts`, with no disable switch or extra service.
State is bounded in memory, expires after a minute, and resets on server restart. MFA verification
shares the account/peer budget and adds bounded challenge limits (P11-11). See
[ADR-0017](adr/0017-login-rate-limiting.md).

## Tests

### Local test artifacts and Git

Keep `e2e/` and `*.test.ts` / `*.test.tsx` files in Git: these are test source code.
The browser tests create disposable `.e2e-data/`, `.e2e-proxy-data/`,
`.e2e-none-data/` and `.e2e-mfa-data/` folders containing test documents,
SQLite databases and, in local-auth modes, authentication state. Each test server
recreates its own folder on startup; these folders are never application backups.
Playwright writes screenshots, traces and saved login cookies to `test-results/`.
These outputs are ignored by Git and excluded from the Docker build context,
as are `test_results/`, `playwright-report/`, local caches and temporary output.
You may remove the test output folders when browser tests and their servers are stopped;
the next run recreates them. Keep the application's `data/` folder and `.env` private.

Before the first commit, inspect `git status --short --untracked-files=all` and
`git ls-files --others --exclude-standard`. After staging, inspect
`git diff --cached --stat` and `git diff --cached --name-only`.
Ignore rules do not remove files already tracked by Git. Brand exports, sample
documents and `pnpm-lock.yaml` are intentional repository assets.

The attachment and editor-feedback browser tests use `e2e/document-fixture.ts`
to create documents and move them to trash during teardown, including after failed
assertions. This lets retries and repeated runs reuse their fixed filenames.
Keep file reads and save assertions inside the test, before teardown. These tests
also wait for editor readiness and attachment deletion responses; a modal can hide
background elements from accessibility locators before a mutation has finished.

Fresh installations open `/setup` to create the administrator, confirm the actual content folder
and finish setup. Use a username with 1–64 ASCII letters/digits/dots/underscores/hyphens (starting
with a letter or digit) and a password with at least 15 characters, up to 1024 UTF-8 bytes.
Setup does not overwrite an existing account. Ready opens `/login`; sign in to access documentation.
Use the user menu to sign out. Sessions last eight hours and survive server restarts; logout
revokes the current session. New passwords use Argon2id; scrypt accounts upgrade on successful login.
No additional database migration is required for the hash change.
The setup token changes on server restart; reload an open setup form after restarting.

- **Unit tests** sit next to the code: `foo.ts` → `foo.test.ts`.
- **Server/API tests** normally use `buildApp(config)` + `app.inject()`. SSE integration tests use temporary loopback ports to verify real streaming responses and shutdown.
- **Filesystem tests** use a real temp directory (`mkdtemp(os.tmpdir())`) and clean it up in `afterEach`.
- **Web tests** use jsdom + Testing Library (`apps/web/src/test/setup.ts`).
- **End-to-end tests** (Playwright) live in `e2e/` and run against the production build with a fresh data directory (`.e2e-data/`):
  The `setup` project completes first run and login, then writes cookie state under ignored
  `test-results/` before the content tests (project named after the browser, `chromium` by default). A separate `proxy` project checks gateway-mode access on port 18766 using disposable `.e2e-proxy-data/`. A `none` project on port 18767 uses `.e2e-none-data/` to verify anonymous access and the Settings warning. Never commit this state file.
  `e2e/accessibility.spec.ts` scans every screen with axe-core (WCAG AA) and checks focus, keyboard use and reflow; give new screens, menus and dialogs an `expectAccessible` call (see [accessibility.md](accessibility.md)).

  ```bash
  pnpm build
  pnpm exec playwright install --with-deps chromium   # once (needs system libraries)
  pnpm test:e2e
  ```

  **Other browsers (P15-09).** `E2E_BROWSER=firefox` or `E2E_BROWSER=webkit` (Safari's engine) runs the whole suite in that engine; install it first (`pnpm exec playwright install --with-deps firefox webkit`). Run one engine at a time: the tests share fixed document names and each run starts from empty data folders. CI runs all three engines in parallel jobs. Engine differences the tests account for: Firefox ignores `clipboardData` given to a synthetic paste event (set it with `Object.defineProperty`), throws from `form.submit()` when the CSP blocks it, and rejects images with a bad checksum; WebKit does not pass files from hidden folders when a directory is chosen.

  If Chromium cannot start on your machine (missing system libraries, no sudo), run the tests in the official image instead. The version must match `@playwright/test`:

  ```bash
  pnpm build
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD:$PWD" -w "$PWD" mcr.microsoft.com/playwright:v1.63.0-noble \
    node_modules/.bin/playwright test
  ```

  The image contains all three engines; add `-e E2E_BROWSER=firefox` (or `webkit`) after `-e HOME=/tmp` to use another one.

### Performance check

`pnpm test:performance` (P15-07) generates 10,000 documents in a temporary folder, starts the built server (`pnpm build` first) and measures start-up, tree, search, opening, saving, creating, renaming a document linked from 500 others, an external edit, saves during large downloads, an import of 1,000 files, restart and memory. It prints a table and exits with 1 when a result exceeds its budget. `--documents <n>` changes the size (budgets for start-up and import scale with it), `--keep` keeps the folder. It takes about three minutes, needs Linux (memory is read from `/proc`) and is not part of CI because timings depend on the machine; run it after changes to indexing, the scanner, link rewriting or import. Budgets and the last results: [performance.md](performance.md).

## Docker

```bash
docker build -f docker/Dockerfile -t leandocs .
docker run --rm -p 8080:8080 -v "$PWD/data:/data" leandocs
```

The image runs as UID/GID 1000 and stores everything under the `/data` volume. Its healthcheck calls `/api/v1/health`. The runtime is distroless (only Node.js, no shell; [ADR-0024](adr/0024-distroless-runtime-image.md)). Use `docker logs`, look at the data on the host, or run `docker exec <container> /nodejs/bin/node -e "…"`; `docker exec … sh` does not exist.

## Versions

Published images report the **release tag** as their version (D-53): the release workflow passes it as `LEANDOCS_VERSION` (Docker build argument and environment variable of `pnpm build`), so nothing has to be edited before a release. Other builds (development, tests, local images) report the root `package.json` `version`. Either way it reaches the code as `APP_VERSION` from `@leandocs/shared`; the server reports it in `GET /api/v1/health` and its first log line, and the web app shows it with the server's version in Settings › About. The `package.json` versions may lag behind releases; when you do change them, set the same `version` in the root, `apps/server`, `apps/web` and `packages/shared` files (a test enforces this).

## Dependencies

- **Version ranges.** Most dependencies use caret ranges and the lockfile pins exact versions. Security-sensitive parsers and storage libraries are pinned exactly (`@milkdown/kit`, `remark-directive`, `@fastify/multipart`, `better-sqlite3`, `chokidar`, `file-type`, `hast-util-*`, `mdast-util-*` in the server, `otpauth`, `qrcode`, `@tabler/icons-react`); change them deliberately and re-run their round-trip and security tests. Major upgrades (for example TypeScript 7) are separate tasks.
- **Local patches.** `patches/` holds fixes to dependencies, applied by pnpm on install (`patchedDependencies` in `pnpm-workspace.yaml`). `micromark-util-edit-map@1.0.0`: linear-time edits; without it, documents with many quotes or list items parse in quadratic time (100 KiB of quotes took ~7 s) and large documents exhaust memory. Guarded by `packages/shared/src/markdown/performance.test.ts`. When the package is updated, check whether upstream fixed it and drop or re-create the patch (`pnpm patch`).
- **Base images.** `docker/Dockerfile` pins `node:24-bookworm-slim` (build) and `gcr.io/distroless/nodejs24-debian12:nonroot` (runtime) by digest, so the same commit always builds from the same images. Dependabot (`.github/dependabot.yml`) opens a weekly pull request against `dev` with new digests (security fixes in Debian and Node.js 24), grouped with GitHub Actions SHA updates in a second weekly pull request. CI builds and starts the image for every pull request. By hand: `docker buildx imagetools inspect <image:tag>` prints the `Digest` of the multi-platform index; use that one, not a per-platform digest. A new Node.js major or Debian release is a deliberate task, not an automatic update.
- **Updating.** `pnpm update -r` stays within the ranges; then run the full verification, including the browser tests.
- **Audit.** CI and the release workflow run `pnpm audit --audit-level=moderate`, so moderate, high and critical advisories fail the build. Low advisories are reviewed in the dependency audit (P15-01) and recorded in `docs/implementation-status.md` (_Known issues_) when accepted.
- **Licences.** Runtime dependencies are permissive (MIT, ISC, BSD, Apache-2.0, 0BSD, BlueOak, Unlicense; DOMPurify under Apache-2.0 of its dual licence; fonts under OFL-1.1). `elkjs`, which Mermaid uses, is EPL-2.0 and is shipped unmodified. Check `pnpm licenses list --prod` when adding a runtime dependency; no GPL/AGPL/SSPL-style licences.

## Releasing

Images are published to GHCR only by the _Release_ workflow (`.github/workflows/release.yml`), when the owner publishes a GitHub release (D-51). Pushes and pull requests never publish.

| Release tag | Commit must be on | Image tags               | Reported version |
| ----------- | ----------------- | ------------------------ | ---------------- |
| `X.Y.Z`     | `main`            | `X.Y.Z`, `latest`        | `X.Y.Z`          |
| `devX.Y.Z`  | `dev`             | `devX.Y.Z`, `dev_latest` | `devX.Y.Z`       |

1. Push the commit you want to release to `main` or `dev`.
2. On GitHub, create a release with the new tag (`X.Y.Z` or `devX.Y.Z`) on that branch and publish it. No version file has to be changed first.
3. The workflow verifies the code, checks the tag (`scripts/release-tags.mjs`), refuses to overwrite an existing `X.Y.Z`/`devX.Y.Z` image, starts the image and checks its reported version, runs the upgrade check from the channel's current image ([migrations.md](migrations.md#upgrade-check)) and the backup check ([deployment.md](deployment.md#backup-and-restore)), then pushes `linux/amd64` and `linux/arm64` images.

If the workflow refuses a release (malformed tag, wrong branch, version already published), nothing is published. Fix the cause and push it, delete the release **and** its tag on GitHub (re-running the workflow reuses the old commit), then create the release again.

The first push creates the `leandocs` package on GHCR as private; make it public in the package settings so `docker compose pull` works without logging in.

## Layout

See `AGENTS.md` §6 and PROJECT_SPEC §56–58.

## Attachment uploads

`MAX_UPLOAD_SIZE` sets the per-file size limit in bytes (default 52428800; positive integer, maximum 1073741824). Both editors support upload, paste and drop. See [attachments](attachments.md) and [ADR-0008](adr/0008-attachment-upload-and-serving.md).

## External document changes

`WATCH_MODE=native` (default) indexes changed Markdown paths after a 250 ms quiet period, with a
maximum two-second debounce during a stream of events. Folder events reconcile their subtree.
Healthy-watcher tree, search, tag and link reads use that index without rescanning documentation.
Use `WATCH_MODE=poll` for mounts without reliable native events; polling adds up to one second
before the debounce. `WATCH_MODE=off` and watcher failures restore full reconciliation on reads.
Save conflicts always compare actual file bytes, including edits not yet processed by the watcher.

API tests that write files directly and require immediate discovery use the authenticated fixture's
default `WATCH_MODE=off`. Pass `true` as its second argument to test configured watching and wait
for the resulting index update. Startup, explicit rebuilds and app content mutations still reconcile
the whole tree. See [ADR-0020](adr/0020-content-watcher.md).

## External-change event stream

The external-change transport is `GET /api/v1/events`, with normal API authentication. Native
`EventSource` sends the same-origin session cookie; do not put credentials in query parameters.
Listen for `ready` to refetch current data and `content-changed` for external index invalidations.
Reconnect gaps are not replayed. See [ADR-0021](adr/0021-external-change-events.md) for payloads,
authentication renewal and resource limits. Reverse proxies should disable response buffering for
this route and allow idle timeouts longer than the 15-second heartbeat. The response sets
`X-Accel-Buffering: no` for Nginx/Nginx Proxy Manager. The authenticated frontend owns one stream,
refreshes affected views, and resyncs after reconnection. Viewing updates show a notification;
editing updates pause autosave and preserve text in the conflict dialog. If a document was deleted
outside LeanDocs, save a copy to recover the editor text in the content root.

## Optional local two-factor authentication

With `AUTH_MODE=local`, open **Settings › Security**, enter the current password, and scan the QR
code with Microsoft Authenticator or another standard TOTP app. Alternatively enter the manual key
as a time-based account (six digits, 30 seconds). Confirm a code before protection becomes active.
Save the ten recovery codes somewhere safe; each works once and is shown only at activation.
Enabling or disabling protection signs out other sessions and rotates the current session.

Subsequent sign-ins require the password followed by an authenticator or unused recovery code.
The password step alone grants no session or document access. Challenges and enrollment expire
in five minutes, allow at most five verification attempts, and disappear on restart. All password,
factor, recovery and confirmation attempts share the existing rolling login limits; no automatic retry.
Keep server and phone clocks synchronized. A successfully used authenticator time step cannot be
reused; wait for a new code or use an unused recovery code. Disabling requires the current password
and an unused factor. Canceling enrollment discards its pending server secret.

No Microsoft login/service or additional container is involved. Ordinary Nginx Proxy Manager
HTTPS/routing continues to use local authentication and `SESSION_COOKIE_SECURE=true`.
Proxy/none modes disable these local endpoints. MFA is optional; passwords still require 15 characters.

**Back up authentication state:** retain `DATA_DIR/system/auth.initialized`, `DATA_DIR/system/app.db` (with a consistent SQLite
backup or the server stopped) and, when present, `DATA_DIR/system/mfa.key`. The key is a private, non-symlink
32-byte file, created with mode 0600; the marker is also private. Preserve ownership and permissions on restore. Documentation
index rebuilding does not erase users, sessions, MFA configuration or recovery codes. Missing,
invalid or mismatched keys with active MFA fail local-auth startup closed. Restore the matching
backup; never delete the key to reset protection. Losing the authenticator and all recovery codes
has no unauthenticated recovery bypass. See [ADR-0018](adr/0018-local-totp-mfa.md).

Browser MFA coverage uses port 18769 and disposable `.e2e-mfa-data/`, independently of the normal
local/proxy/none projects. Its real rate-limit wait avoids any production test bypass.

## Authentication database recovery

Startup refuses corrupt, empty, nonregular or symlinked databases. Missing or reset databases with evidence of prior authentication also refuse startup in every auth mode. It never quarantines or replaces authentication automatically. `system/auth.initialized` is a private versioned marker, flushed before first account creation; legacy account-bearing databases adopt it on startup. A crash between marker creation and account insertion requires offline operator recovery.

Stop the application and preserve the damaged system files for diagnosis. Restore a consistent SQLite backup with its matching initialization marker and MFA key, preserving ownership and private permissions. A stopped-server backup must include the whole system directory, including any SQLite sidecars. Restart only after the matching state is restored. An older account-bearing backup without a marker can be adopted safely. Rebuild search through Settings after recovery; never delete the database or key as a search repair or MFA reset. There is no unauthenticated reset endpoint.

For content-only migration, initialize a genuinely new installation privately, then import/copy the Markdown content. Complete owner setup before allowing public access. Host operators can deliberately replace all data; application recovery checks cannot defend against removal of every initialization artifact. See [ADR-0019](adr/0019-fail-closed-authentication-recovery.md) and [security review](security-review.md).
