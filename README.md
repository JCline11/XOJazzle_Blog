# XOJazzle Blog

A scrapbook-style editorial blog for books, movies, anime, television,
and personal writing.

The application uses TypeScript ES modules, Express 5, EJS, PostgreSQL,
Prisma 7, PostgreSQL-backed sessions, and Cloudflare R2 image storage.

## Features

- Database-backed homepage, category archives, and published posts.
- Administrator authentication, CSRF protection, and login rate limiting.
- Post and homepage editing with concurrent-edit protection.
- Draft previews and historical slug redirects.
- JPEG, PNG, WebP, HEIC, and HEIF image processing and R2 uploads.
- Metadata, canonical URLs, sitemap, and robots.txt.
- Responsive navigation with an HTML/CSS fallback.
- Database-aware health checks and bounded graceful shutdown.

## Requirements

- Node.js >=24.21.0 and <25.
- npm and the committed package-lock.json.
- PostgreSQL for the application and database tests.
- Installed Chrome/Chromium for browser regression tests.
- R2 configuration when using image uploads.

CI currently tests Node.js 24.21.0 and PostgreSQL 18.

## Local environment

Create a new local application database using your PostgreSQL tools.
Keep it separate from the disposable test database.

For a fresh checkout, copy the example environment file only if .env
does not already exist:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

Edit .env privately. Replace example credentials and configure:

| Variable | Local purpose |
| --- | --- |
| DATABASE_URL | Connection to the intended local application database |
| SESSION_SECRET | Strong random secret satisfying the 32-character validation |
| NODE_ENV | development |
| PORT | Optional; defaults to 3000 |
| SITE_ORIGIN | Optional locally; defaults to the local application origin |
| SHUTDOWN_TIMEOUT_MS | Optional; defaults to 25000 milliseconds |
| TEST_DATABASE_URL | Dedicated database connection for database tests |

The example file also contains R2 and administrator provisioning fields.

Supply unique administrator credentials only for the authorized
provisioning operation. Remove temporary provisioning settings afterward.

.env is ignored by Git. Keep credentials and environment contents out
of commits, logs, screenshots, and issue reports.

## Install and build

From the repository root:

```powershell
npm ci --include=dev --no-audit
npm run build
```

The build validates the Prisma schema, generates Prisma Client,
and checks TypeScript. It does not apply database migrations.

Development dependencies are required for Prisma CLI and TypeScript.
tsx is a runtime dependency.

Prisma Client is generated into src/generated/prisma and is ignored
by Git. Generate it after a fresh installation or schema change.

The installation command suppresses the automatic advisory request.
Run the dedicated dependency check separately:

```powershell
npm audit --audit-level=high
```

## Initialize a new local database

The following commands change the configured application database.
Use them only after confirming DATABASE_URL targets the intended new
local database.

Apply the committed migration history:

```powershell
npx --no-install prisma migrate deploy --config prisma7.config.ts
```

Create starter editorial content for local development:

```powershell
npx --no-install prisma db seed --config prisma7.config.ts
```

The homepage requires a SiteProfile record. A database containing
only the migrated schema is not a complete local content setup.

The seed is not an administrator provisioning command.
Production content initialization requires its own reviewed procedure.

For existing databases or schema changes, follow the
[database migration procedure](docs/database-migrations.md).

## Provision a local administrator

Follow the credential-handling instructions in the
[administrator provisioning runbook](docs/administrator-provisioning.md).

After supplying the intended one-off credentials and confirming the
target database, run:

```powershell
npm run admin:set-password
```

The command creates or updates the administrator with the normalized email
and revokes all sessions in one transaction.

Use unique credentials. There is no default administrator account.

## Start the application

Development mode with automatic restart:

```powershell
npm run dev
```

Normal startup:

```powershell
npm start
```

With the default port:

- Homepage: http://localhost:3000/
- Administrator login: http://localhost:3000/admin/login
- Health check: http://localhost:3000/healthz

The health endpoint checks database connectivity. It does not establish
that content initialization or R2 image operations are working.

## R2 configuration

Image uploads require:

- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- R2_PUBLIC_BASE_URL

The public base URL must be an HTTPS origin suitable for image delivery,
rather than the R2 API endpoint.

Development startup does not require R2 configuration, but upload
operations do. Production startup validates all required R2 settings
and requires a custom public image domain.

Uploaded images are processed before storage. Existing third-party image
URLs are preserved when no replacement is submitted.

Keep staging and production storage and credentials separate.

## Main verification commands

```powershell
npm run typecheck
npm run prisma:validate
npm test
npm audit --audit-level=high
```

The main test suite uses mocks for application database interactions.
Build first so the generated Prisma Client is available.

## Database test setup

Create a dedicated local PostgreSQL database named xojazzle_test.
Configure TEST_DATABASE_URL privately.

The guard requires:

- A PostgreSQL URL using a loopback host.
- The database name xojazzle_test.
- No URL query parameters or fragment.
- A database different from the configured application database.

These suites create, seed, and delete records. Use only the dedicated
disposable database.

Prepare its schema:

```powershell
npx --no-install prisma migrate deploy --config test/prisma.config.ts
```

Start with a migrated schema containing no application records.
The suites manage their own fixtures.

Run the database suites sequentially:

```powershell
npm run test:integration
npm run test:seed
npm run test:slugs
```

If an interrupted test run leaves records behind, inspect the dedicated
test database before choosing a cleanup procedure.

## Browser regression checks

Install Chrome/Chromium, or set CHROME_PATH to its executable.

```powershell
npm run test:browser
```

The harness uses Node's built-in APIs and an isolated temporary browser
profile. It does not download a browser or another browser-testing package.

Tests load the real public templates, stylesheets, and navigation script
with local fixtures and system-font fallbacks. They do not require database
or R2 access.

Coverage includes:

- Navigation with disabled, failed, and interrupted JavaScript.
- Keyboard interaction, Escape handling, and resizing.
- Short and maximum-length hero content at 320, 390, 540, 768,
  1024, and 1280 CSS pixels.

Short hero copy keeps the overlapping scrapbook layout when its container
has at least 540 CSS pixels available. Narrower containers and longer copy
use the growing layout. Layout selection works without JavaScript.

If Chrome cannot start, inspect the captured startup stderr and confirm
that the execution environment permits headless browser operation.

## Complete suite and CI

After preparing the disposable test database and browser:

```powershell
npm run test:all
```

This runs the main, integration, seed, slug, and browser suites in order.

The GitHub Actions workflow installs locked dependencies, builds the
application, applies migrations to a disposable PostgreSQL service,
runs all suites, and audits dependencies.

CI uses synthetic credentials and mocked R2 operations.
Production credentials do not belong in the test workflow.

## Image resource profiling

Run the isolated profiler when reviewing upload resource requirements:

```powershell
node src/scripts/profile-image-resources.ts
```

It measures JPEG, PNG, HEIC, and homepage scenarios without database
or R2 access.

These isolated measurements do not establish the complete application's
hosting memory requirements. Verify those in staging.

## Project layout

| Location | Purpose |
| --- | --- |
| src/server.ts | HTTP startup, signals, and resource cleanup |
| src/app.ts | Express middleware, routes, and error handling |
| src/config/ | Environment, session, and upload configuration |
| src/routes/ | Public and administrator routes |
| src/controllers/ | Request handling and rendering |
| src/services/ | Content, authentication, editing, and storage workflows |
| src/views/pages/ | EJS page templates |
| src/views/partials/ | Shared EJS components |
| src/workers/image.worker.ts | Image validation and conversion |
| public/css/ | Public and administrator styles |
| public/js/ | Navigation, uploads, and editor interactions |
| prisma/ | Schema, committed migrations, and local starter seed |
| test/ | Main, database, seed, slug, and browser tests |
| docs/ | Readiness and operational procedures |

## Operations and deployment

Review the relevant procedure before changing an environment:

- [Production readiness](docs/production-readiness.md)
- [Database migrations](docs/database-migrations.md)
- [Administrator provisioning](docs/administrator-provisioning.md)
- [Backup and recovery](docs/backup-recovery.md)
- [Deployment and rollback](docs/deployment-rollback.md)

Render staging is the planned deployment target.
Hosting configuration, recovery tooling, and restore rehearsals remain
subject to their documented setup and verification gates.

Deployments, production data operations, and recovery require explicit
authorization. An application rollback does not reverse database changes
or restore deleted R2 objects.