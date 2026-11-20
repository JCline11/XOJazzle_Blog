# Database migration procedure

Status: Procedure defined for review. Production execution requires
explicit authorization and completed staging and recovery checks.

The commands in this document describe future release operations.
Creating this document does not require running a migration.

## Migration source of truth

- Commit the Prisma schema and every migration directory together.
- Include migration_lock.toml in version control.
- Review migration SQL before release.
- Preserve migrations that have already been applied.
- Express subsequent schema changes through new migrations.
- Never delete migration history to make a deployment pass.

Use migrate dev only against a dedicated development database.
Use migrate deploy to apply committed migrations in staging and production.

Production release procedures must not use migrate reset or db push.
Sample-content seeding and administrator provisioning are separate
operations and are not part of migration deployment.

## Existing configuration

Application migration configuration:

- prisma7.config.ts
- Reads DATABASE_URL, including through dotenv.
- Uses the committed application migration directory.

Disposable CI database configuration:

- test/prisma.config.ts
- Uses the guarded TEST_DATABASE_URL.
- Requires a local database named xojazzle_test.
- Requires the test database to differ from the application database.

Keep the test configuration confined to disposable test environments.

The production migration environment must receive the intended
DATABASE_URL from its secret configuration. A developer's local .env
must not determine the production target.

Verify the target database through the hosting dashboard or approved
secret configuration without printing credentials.

## Before a release

1. Identify the exact release commit and pending migration directories.
2. Confirm that CI passed for the release candidate.
3. Review SQL for destructive changes, new constraints, table locks,
   backfills, and expected execution time.
4. Verify compatibility with the application version currently running.
5. Rehearse migrations in staging.
6. For changes affecting existing data, rehearse against representative,
   sanitized data using the previous schema version.
7. Confirm usable backups and a tested recovery procedure.
8. Confirm that the migration environment contains the Prisma CLI.
9. Obtain authorization for the target environment.

A successful migration into an empty CI database verifies the fresh
installation path. It does not prove that an existing database satisfies
new constraints or that every historical upgrade path is safe.

## Known migration considerations

The hero-fields migration makes nine SiteProfile fields required.
It contains no data backfill.

An older populated database with null values in those fields needs a
separately reviewed staged upgrade and backfill plan. Do not attempt
that upgrade as an unattended one-step deployment.

The slug-registry migration inserts each existing post's current slug
into PostSlug. Rehearsal must verify that registrations are created
and that current and historical URL behavior remains correct.

For a new empty database, the committed migration chain creates the
schema. Initial content and administrator provisioning remain separate.

If a database already contains tables but has no matching Prisma
migration history, stop and prepare a separate baselining plan.

## Authorized release sequence

Use one controlled release job or platform pre-deploy operation.
Do not run migrations independently from every application instance.

Build the exact release commit and generate Prisma Client before
starting the new application version.

Inspect migration status using the application configuration:

```text
npx --no-install prisma migrate status --config prisma7.config.ts
```

Pending migrations can cause a nonzero status exit.
Inspect the output rather than treating every nonzero exit identically.

Proceed only when pending migrations match the reviewed release.
Investigate failed migrations, divergent history, missing files, or
modified applied migrations before continuing.

After the preflight and authorization gates are satisfied, apply
pending migrations:

```text
npx --no-install prisma migrate deploy --config prisma7.config.ts
```

A migration failure must stop the application rollout.

After successful application, inspect status again:

```text
npx --no-install prisma migrate status --config prisma7.config.ts
```

Confirm that the migration history is up to date before starting
the new application version.

Application pool timeouts do not control this CLI operation.
Review migration locking and execution time separately.

## Application compatibility

During a deployment, the previous application version may still serve
requests after the migration runs.

Prefer additive changes that remain compatible with that version.
For incompatible changes, plan a staged expansion, data migration,
application rollout, and later removal of obsolete structures.

Starting an older application version does not reverse database changes.
An application rollback is safe only when that version remains compatible
with the migrated schema.

## Failure and recovery

- Stop the rollout and retain the migration output.
- Preserve the database state for investigation.
- Determine which statements completed and inspect migration history.
- Do not assume that a failed migration changed nothing.
- Do not repeatedly rerun a failed operation without understanding it.
- Do not use migrate resolve merely to obtain a passing status.

Choose a reviewed forward repair or recovery from a verified backup.
Migration-history reconciliation must match the actual repaired schema.

Backup restoration can lose writes made after the recovery point.
Coordinate write restrictions and recovery decisions before restoring.

Recovery commands require a separate, concrete plan and authorization.

## Verification after release

- Migration status reports that the history is up to date.
- The application starts and /healthz succeeds.
- Administrator login and sessions work.
- Affected content and editing workflows behave correctly.
- Slug redirects and public URLs remain correct where relevant.
- Expected content remains present.
- Logs contain no unexpected database failures.

Record the release commit, target environment, applied migration names,
verification results, and any recovery actions without storing secrets.