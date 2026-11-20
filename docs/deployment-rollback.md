# Deployment and rollback procedure

Status: Procedure for review. Hosting resources and service settings
have not been configured through this document.

Staging deployment, production deployment, configuration changes,
and rollback each require authorization for the intended operation.

## Release inputs

Identify and record:

- Target environment.
- Exact application commit.
- Passing CI run for that commit.
- Pending migration names.
- Compatible previous application revision.
- Configuration references, without secret values.
- Recovery readiness appropriate to the operation.
- Operator and authorization.

CI passing for an older commit does not verify a newer release candidate.

## Proposed service settings

These settings must be verified during staging configuration:

| Setting | Intended value |
| --- | --- |
| Runtime | Node.js |
| Build command | npm ci --include=dev --no-audit && npm run build |
| Start command | npm start |
| HTTP health check | /healthz |
| Application environment | NODE_ENV=production |
| Port | Platform-provided PORT |
| Automatic deployment | Off until explicitly authorized |
| Persistent application data | PostgreSQL and R2 |

Align the hosting Node version with the tested version and package.json
engine range. Record the actual selected version.

The build requires development dependencies because Prisma CLI and
TypeScript are build tools. tsx is a runtime dependency.

npm run build validates the schema, generates Prisma Client, and checks
TypeScript. The application starts from TypeScript through tsx.

The installation command suppresses the duplicate automatic npm audit.
Dependency auditing remains a required CI check.

Treat the service filesystem as ephemeral.

## Migration operation

Use one controlled release operation to run:

```text
npx --no-install prisma migrate deploy --config prisma7.config.ts
```

A supported platform pre-deploy hook is suitable when available.
Otherwise, select a controlled release job before deployment.

Keep migrations separate from ordinary builds and application startup.
Ensure that the migration environment contains the Prisma CLI.

Follow the database migration procedure for SQL review, rehearsals,
existing-data compatibility, and failure handling.

The old application may still serve requests after migrations run.
Every release must account for that overlap.

## Runtime configuration

Store real values in approved environment and secret configuration.
Document variable names and requirements without copying secret values.

| Variable | Requirement |
| --- | --- |
| NODE_ENV | production for both hosted staging and production |
| PORT | Platform-provided integer port |
| DATABASE_URL | Approved PostgreSQL connection for this environment |
| SESSION_SECRET | Strong random secret satisfying the 32-character validation |
| SITE_ORIGIN | Explicit HTTPS origin for this application environment |
| SHUTDOWN_TIMEOUT_MS | Reviewed shutdown budget in milliseconds |
| R2_ACCOUNT_ID | Correct 32-character hexadecimal account identifier |
| R2_ACCESS_KEY_ID | Credential scoped to the intended resources |
| R2_SECRET_ACCESS_KEY | Matching secret credential |
| R2_BUCKET_NAME | Correct environment-specific live bucket |
| R2_PUBLIC_BASE_URL | HTTPS custom public image origin |

SITE_ORIGIN must be an origin without credentials, a query, fragment,
or application path.

Production validation rejects an R2 API endpoint as the public image
origin and rejects r2.dev delivery domains.

Keep SESSION_SECRET stable across ordinary releases.
Intentional secret rotation needs its own session-impact review.

Use separate staging and production databases, image storage, and secrets.
Use synthetic staging content until an approved data-handling plan exists.

ADMIN_EMAIL and ADMIN_PASSWORD belong to authorized one-off provisioning.
TEST_DATABASE_URL and CHROME_PATH belong to testing.
They are not normal web-service credentials.

## Shutdown configuration

The application defaults to a 25,000 ms shutdown budget.
Its accepted range is 1,000 through 240,000 ms.

Keep the application budget below the platform's configured allowance,
with time reserved for cleanup.

Verify actual SIGTERM delivery, request draining, and resource cleanup
during staging.

Multi-image processing, R2 operations, and compensating cleanup can
outlast the budget. Increasing the timeout does not guarantee completion
of every accepted operation.

Rehearse an interrupted upload before approving production behavior.

## Staging deployment

1. Confirm the target service, release commit, and isolated resources.
2. Confirm passing CI for the exact release.
3. Review configuration and migration compatibility.
4. Obtain authorization for the staging deployment.
5. Build the release and generate Prisma Client.
6. Apply migrations through the selected controlled operation.
7. Start the application and confirm /healthz returns 200.
8. Perform authorized administrator provisioning when required.
9. Initialize staging content through an approved procedure.
10. Run application and operational acceptance checks.
11. Record findings and the deployed revision.

The administrator command does not create homepage or sample content.

A healthy database connection does not prove that required content,
public image delivery, or administrator workflows are ready.

Choose and verify staging access and indexing controls before exposing
content that should not be public.

## Production deployment gates

Before production authorization, require:

- Staging acceptance for the release candidate.
- Verified hosting memory fit and upload behavior.
- Verified HTTPS origin, domain configuration, proxy behavior,
  and secure session cookies.
- Reviewed migration compatibility with existing data.
- Configured backups and a successful isolated recovery rehearsal.
- A suitable current recovery set for the planned operation.
- Verified administrator access and approved production content.
- A known compatible rollback revision.
- Operator access to logs, configuration, and recovery resources.

After authorization, follow the controlled build, migration, startup,
and verification sequence.

Keep required content initialization separate from sample-content seeding.

## Post-deployment verification

- /healthz returns 200.
- Homepage, category pages, and published posts render correctly.
- Administrator login, logout, and private-page behavior work.
- Drafts and previews retain access restrictions.
- Image delivery uses the intended public origin.
- Authorized upload and editing checks behave correctly.
- Slug redirects, canonical URLs, sitemap, and robots.txt are correct.
- Logs show no unexpected database, session, or storage failures.
- Memory and shutdown behavior match the accepted staging evidence.

The health endpoint checks database connectivity.
It does not test R2 writes, content completeness, or all application routes.

Record release identifiers, status codes, and error IDs.
Keep passwords, cookies, connection strings, and environment contents
out of release notes and public issue reports.

## Rollback decision

Determine whether the incident concerns:

- Application code.
- Configuration or credentials.
- Database schema or data.
- R2 objects or public image delivery.

An application rollback does not undo migrations, restore database rows,
or recover deleted image objects.

Proceed with an application rollback only when the selected application
remains compatible with the current database and storage state.

If compatibility is uncertain, restrict writes and prepare a reviewed
forward repair or recovery plan.

## Render rollback configuration review

Confirm that the target deployment's build artifact is still retained.

Render can reuse historical service-specific settings, including
environment variables, start command, and health-check path.
Environment groups have separate rollback behavior.

Inspect the effective configuration before proceeding.
Verify that database credentials, session configuration, R2 credentials,
image origins, and service capacity remain valid.

Do not reintroduce a revoked credential merely to match an older deploy.

A reviewed deployment of an older commit with current approved settings
may be needed when historical configuration is unsuitable.

Verify automatic-deployment settings after rollback and keep them
consistent with the owner's authorization policy.

## Authorized rollback sequence

1. Identify the incident and restrict writes when necessary.
2. Preserve relevant logs and affected resources.
3. Select the compatible application revision and configuration.
4. Confirm the rollback target and obtain authorization.
5. Execute the selected rollback or reviewed redeployment.
6. Verify health, administrator access, public content, and image delivery.
7. Verify the affected workflows and monitor error logs.
8. Record the resulting revision, configuration references, and outcome.

A database or image restoration follows the backup and recovery procedure
and requires separate recovery planning and authorization.

## After rollback

Fix or revert the faulty change in version control.
Keep the repository, deployment configuration, and running service aligned.

Confirm that a later deployment cannot silently reintroduce the fault.

Do not assume that rolling back application code has repaired an
underlying data or storage problem.