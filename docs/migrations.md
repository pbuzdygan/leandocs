# Database migrations

`system/app.db` is a SQLite file. It holds two kinds of data:

- **Derived data:** the document index, tags, aliases, links and full-text search. All of it can be rebuilt from `content/` at any time (ADR-0003).
- **App data:** settings, pins, the account, sessions and MFA. It cannot be rebuilt and must survive every upgrade (ADR-0019).

## How it works

- `db/migrations.ts` holds an ordered list of migrations. The schema version is stored in the database file itself (`PRAGMA user_version`).
- Every start runs `migrate()` before the app opens: all migrations above the stored version are applied in order. Each migration and its version bump run in one transaction, so a failure leaves the database at the previous version with nothing half applied.
- There is no manual step. Updating LeanDocs means starting the new version on the same data folder ([deployment](deployment.md#updating)), and the log shows `Migrated` with the applied steps.
- **Forward only.** A database with a newer schema than the running code is refused at startup (`SchemaVersionError`) and left untouched. Going back to an older LeanDocs version means restoring the backup taken before the update.
- Before migrating, startup checks the file (`quick_check`). A damaged or unreadable database stops startup and is never replaced (ADR-0019).

## Rules for changing the schema

1. **Never edit, reorder or remove a released migration.** Released databases never run it again, so the change would never reach them. `db/upgrade.test.ts` fingerprints the schema each released migration creates and fails when one changes.
2. Add the change as a new migration at the end with the next version number, and give it a short name.
3. **App data must survive.** Create or alter app tables in place; never drop and recreate them. SQLite needs the table rebuild procedure (`CREATE new` → `INSERT … SELECT` → `DROP old` → `ALTER … RENAME`) inside the same migration.
4. **Derived data may be reset** when its shape changes: empty the derived tables in the migration (migration 2 does this), and the next start re-indexes every file.
5. Add tests: the new migration on a database with data from the previous version (see `db/upgrade.test.ts`, which upgrades every released version with settings, pins, account and sessions), plus whatever the feature needs.
6. When the version ships, add its fingerprint to `RELEASED_SCHEMAS` in `db/upgrade.test.ts`. The test prints the value.

## Released schema versions

| Version | Change                                                     | Data kept on upgrade |
| ------- | ---------------------------------------------------------- | -------------------- |
| 1       | Document index, tags, aliases, full-text search, settings  | —                    |
| 2       | Document links; empties the derived index for a re-index   | settings             |
| 3       | Pinned documents                                           | all                  |
| 4       | Administrator account and sessions                         | all                  |
| 5       | Authenticator-app sign-in (MFA) and one-use recovery codes | all                  |
