# Backup and recovery procedure

Status: Design for review. Backups have not been configured or restored
as part of this checkpoint.

Production use requires configured backups, an isolated recovery
rehearsal, and approval of the recovery targets.

## Proposed recovery targets

Planning targets for owner review:

- Recovery point objective: lose no more than 24 hours of editorial work.
- Recovery time objective: restore verified service within four hours
  of the service interruption, including response and validation time.
- Retain seven daily recovery sets and four weekly recovery sets.
- Create an additional recovery set before risky migrations or bulk changes.

These are proposed targets, not guarantees of the current infrastructure.
Confirm them against the selected hosting configuration and measured
recovery time before launch.

## What a recovery set contains

A recovery set must include:

- A PostgreSQL backup.
- The R2 objects needed by that database snapshot.
- Object keys, byte lengths, content types, cache-control values,
  relevant metadata, and independently calculated checksums.
- The application commit compatible with the database schema.
- The migration history associated with that application revision.
- A manifest identifying the recovery set and its capture interval.
- Archive checksums and verification results.

Preserve image keys and directory structure exactly.

Track repository-managed public assets through the application revision.
Third-party image URLs are external dependencies and are not protected
by a database or R2 backup.

Do not assume that an S3 ETag is an independently verified content hash.

## Protection and access

Backups contain private drafts, account password hashes, and session data.
Keep archives and manifests private, encrypted, and access restricted.

Keep a protected recovery copy outside the live application's ability
to delete or overwrite it. A separate protected account or encrypted
offline copy can provide that separation.

Limit the application's R2 credentials to the live resources it needs.
Use separate credentials for backup and restoration.

Preserve the ability to access backups and decrypt them if the
application host or its credentials become unavailable.

Keep secrets in the approved secret store or password manager.
Do not commit archives, passwords, encryption keys, or recovery tokens.

## PostgreSQL protection

Verify the selected database provider's actual backup availability,
retention, recovery window, and restoration process.

Use managed recovery as an additional protection layer when available.
Maintain protected logical exports for portability and independent recovery.

Use compatible pg_dump and pg_restore versions.
Record the server and client versions in the recovery manifest.

Configure the intended connection through approved libpq connection
settings and a protected password file or provider-supported mechanism.
pg_dump does not automatically use the application's DATABASE_URL.

Do not place a password-bearing connection URL in command arguments.

Example logical export, for an authorized backup job only:

```text
pg_dump --format=custom --file=blog.dump
```

Use the file option rather than shell redirection for the archive.

Inspect the archive's table of contents:

```text
pg_restore --list blog.dump
```

A readable table of contents and matching archive checksum do not prove
that the database can be restored. A real isolated restore is required.

## R2 protection

Preserve image objects even after the application deletes them from
the live bucket.

A mirror that propagates live deletions is not sufficient recovery history.
Backup retention must cover the oldest retained database recovery point.

Preserve original object keys, bytes, content type, cache-control values,
and relevant metadata. Verify copied bytes using checksums.

Choose and test the export and restore mechanism before production use.
Do not count unverified retention or recovery features as configured backups.

Apply deletion protection and retention controls to the backup destination
as appropriate for the selected design.

Do not let retention cleanup remove the only verified recovery set.

## Capture a coordinated recovery set

1. Confirm the source environment and obtain authorization.
2. Establish an enforced write pause covering editorial changes,
   uploads, image deletion, cleanup work, migrations, and operator tools.
3. Let in-flight operations finish or resolve their outcome.
4. Capture the PostgreSQL backup.
5. Export the required R2 objects and their metadata.
6. Verify that every managed image key referenced by the database
   snapshot exists in the recovery set.
7. Verify archive integrity and object checksums.
8. Record the application revision and capture interval.
9. Store the complete set in the protected backup destination.
10. Resume writes and record the result.

Choose and rehearse the write-pause mechanism before relying on this
procedure. Measure its operational impact during staging.

A provider database recovery point is usable for full-site recovery only
when its referenced image objects are also available and verified.

## Scheduling and monitoring

Before launch, configure an owned backup process that meets the approved
recovery point objective.

Monitor:

- Completion and failure of scheduled backups.
- Age of the latest successful complete recovery set.
- Missing database archives or image objects.
- Integrity verification failures.
- Retention cleanup results.
- Access to the backup destination and decryption material.

Assign a person to respond to failures.
A scheduled job without a successful verified output is not a backup.

## Isolated recovery rehearsal

1. Obtain authorization for the rehearsal.
2. Select a complete recovery set and compatible application revision.
3. Provision a new isolated database and private image restore destination.
4. Confirm that restoration credentials cannot modify live resources.
5. Restore the database into the empty isolated target.
6. Restore images under their original keys and metadata.
7. Verify all referenced managed objects against the manifest.
8. Clear restored sessions before exposing the restored application.
9. Review restored administrator accounts and credential freshness.
10. Start the compatible application with isolated configuration.
11. Run the acceptance checks below and record elapsed recovery time.

Example database restore, after confirming the isolated target:

```text
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname=restore_rehearsal blog.dump
```

The database must already exist and be an approved empty restore target.
Configure its connection and privileges through the approved mechanism.

Do not automatically apply the latest migrations to the restored database.
Validate the recovered application and schema pair first.

Existing image URLs are stored in the database. Changing
R2_PUBLIC_BASE_URL does not rewrite those stored values.

Verify that rehearsal image checks read the isolated restored objects.
Requests that still read the live image domain can conceal missing
or incorrect restored files.

Any test-only URL remapping must affect only the isolated restored copy.

## Acceptance checks

- Migration history matches the selected application revision.
- /healthz succeeds.
- Expected posts, drafts, categories, and homepage records exist.
- Managed image keys resolve to the expected restored bytes.
- Public content, metadata, and slug redirects behave correctly.
- An authorized staging administrator can log in and edit.
- Restored sessions cannot grant access.
- Provisioning and credential rotation work when rehearsed.
- Logs contain no unexpected database or storage failures.
- Measured recovery time meets the approved objective.

A backup is not considered recovery-tested until these checks pass.

## Production incident recovery

- Restrict writes and preserve the affected resources for investigation.
- Identify the last known-good database and image recovery point.
- Assess the editorial work that would be lost.
- Obtain authorization for the recovery and cutover.
- Restore and validate new isolated resources first.
- Clear restored sessions and review administrator credentials.
- Rotate affected credentials when required by the incident.
- Verify database, image-origin, and application configuration together.
- Cut over only after the recovery acceptance checks pass.
- Monitor the recovered service before resuming ordinary writes.

Do not overwrite or delete the original resources during the initial
recovery attempt.

Once writes resume on the recovered database, switching back to the old
database can lose those new writes and requires another reviewed plan.

## Required before production

- Owner-approved recovery objectives and retention.
- Selected database recovery capabilities.
- Protected backup destination and access controls.
- Tested database and R2 export and restore tooling.
- A rehearsed write-pause mechanism.
- Working scheduling and failure notification.
- A successful isolated restore with recorded timings.
- Accessible recovery credentials and decryption material.
- An operator who can execute the procedure.