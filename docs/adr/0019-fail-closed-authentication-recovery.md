# ADR-0019: Fail closed when durable authentication state is lost

- **Status:** Accepted
- **Date:** 2026-10-04
- **Author:** @codex
- **Related:** P11-09; KI-11; PROJECT_SPEC §4.3/49/52/62; ADR-0003/0009/0012/0018

## Context

The original database quarantine/replacement path predates authentication. Replacing a corrupt
`app.db` discards passwords, sessions and MFA, exposing first-run account creation to a new caller.
The document index is rebuildable; authentication data is not. Security review must resolve KI-11
without changing canonical Markdown, adding services or silently resetting security settings.

## Decision

Refuse startup for an existing unreadable, empty or nonregular/symlinked database. Never rename,
delete or automatically replace it or its WAL/SHM files. A newer schema still refuses startup, with
upgrade/restore guidance instead of advice to delete the database. Validate SQLite integrity before
migration. Creating a fresh database is allowed only without evidence of earlier authentication
or unfinished SQLite recovery (initialization marker, MFA key, sidecars or old quarantine files).

Keep a versioned, private `DATA_DIR/system/auth.initialized` marker outside SQLite. Create and
flush it, including its directory entry, before inserting the first account. Adopt it on startup
for existing accounts before registering any routes. A valid marker with no administrator refuses
startup/setup; missing, truncated or replaced databases cannot reopen enrollment. Invalid or
symlinked markers also fail closed. The marker contains no credentials and never enters content.
A crash between marker creation and account insertion deliberately requires offline recovery,
instead of exposing setup. Existing markers are never overwritten or regenerated.

Apply storage validation in every auth mode so switching proxy/none/local cannot silently erase
stored local credentials. Preserve legitimate fresh setup and legacy schema upgrades. There is no
remote recovery/reset endpoint or configuration bypass. Backup/restore includes the marker,
consistent `app.db` and, for MFA, matching `mfa.key`. Restoring an account-bearing older backup
without a marker adopts it; removing all filesystem evidence remains an operator action beyond
application protection. Legacy installations whose database was already deleted without any
remaining artifact cannot be distinguished from a genuinely fresh installation.

Index rebuilding clears only derived tables and retains accounts, sessions, MFA, settings and pins.
Clarify historical database-deletion acceptance/documentation: loss of SQLite never loses Markdown,
but a configured installation needs an auth backup before it may serve those files again.

## Alternatives considered

- Automatic quarantine and fresh setup: reopens account takeover after data failure.
- Treat the MFA encryption key as the only marker: it is created before setup and absent in older
  or nonlocal installations; it cannot reliably identify successful account initialization.
- Move auth to a separate database/service: unnecessary architecture expansion.
- Commit the database first and create the marker later: a crash can leave a configured account
  without persistent evidence outside SQLite.

## Consequences

Corruption requires restoring a matching backup or offline operator repair; availability yields to
keeping access protection. Preserve damaged files for diagnosis. Cold-start integrity checks add
work proportional to the database; performance review follows in Phase 15. First-run account
creation exposed before an owner completes it still requires a private deployment/bootstrap stage.
This decision amends recovery guidance in ADR-0003/0009/0012 and supersedes automatic quarantine
(D-33), while preserving the single SQLite database and filesystem-first content model.
