# ADR-0026: Setup token only for the operator

- **Status:** Accepted
- **Date:** 2026-10-15
- **Deciders:** owner (recorded by @claude-code)
- **Related:** PROJECT_SPEC §52; UI_SPEC §90; ADR-0010, ADR-0019; [security review, third pass](../security-review.md#third-pass)
- **Supersedes:** the token delivery and the storage path in the setup status of ADR-0010

## Context

ADR-0010 returned the process-local setup token from the public `GET /api/v1/auth/setup`. The token protected setup against cross-site requests, but anyone who could reach a new installation could read it and create the administrator account. The Compose files listen on all host addresses by default, so a fresh deployment on a reachable host stayed open until the owner created the account. The same response revealed the resolved content folder to anonymous callers.

## Decision

- While no account exists and authentication is local, every server start creates a new random 32-byte token and gives it only to the operator: in the server log at `warn` level, and in `system/setup-token` in the data folder (mode 0600, created exclusively without following links). The file is for operators who cannot read the log, for example with `LOG_LEVEL=error`.
- `GET /api/v1/auth/setup` returns only `required` (plus `authMode` outside local mode). The content folder is returned by the successful `POST`, which the storage step of the setup page shows.
- The setup page asks for the token next to the account fields. The token is kept in component state only and is not stored in the browser.
- The token file is removed after the account is created, and at every start: an old file is replaced while setup is open and removed otherwise.
- `POST` keeps the rest of ADR-0010: custom header, JSON only, no cross-site requests, one creation at a time, never replacing an account.

## Alternatives considered

- **Listen on `127.0.0.1` by default in Compose:** rejected as the only measure. It breaks reverse proxies on other hosts and Docker networks for existing users, and does not protect deployments that publish the port anyway.
- **Token in the log only:** rejected. With `LOG_LEVEL=error`, `fatal` or `silent` the owner could not finish setup, and tests would need a hook into the server.
- **Fixed token from an environment variable:** rejected. It adds a long-lived secret to `.env` and Compose that is easy to leave unchanged.

## Consequences

The owner needs access to the server log or data folder for the first run, which every Docker deployment already has. The log of a fresh installation contains a credential that stops working once the account exists; old log lines are useless after a restart because each start issues a new token. Restoring a backup that contains an account never issues a token.

## Security, migration and rollback

- **Security:** First-run account creation requires access to the host's logs or data folder. The baseline rule against secrets in logs has a deliberate exception here: a one-time bootstrap credential, valid only before the account exists, shown to the operator who started the server.
- **Migration:** none. Installations with an account are unaffected. An installation started before this change without an account gets the token at its next start.
- **Rollback:** return the token in the status again; there is no stored state besides the file, which is ignored by older versions.

## Verification

`apps/server/src/auth/setup.test.ts` (log, private file, symbolic link, other modes), `apps/server/src/api/setup.test.ts` (public status, new token per start, removal after setup), web `auth/Setup.test.tsx`, the `setup` browser test, and the Docker checks, which read the token from the data folder and require it in the container log.
