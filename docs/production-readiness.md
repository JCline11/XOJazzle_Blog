# Production readiness review

Status: Local checks passed. Release preparation and staging
verification remain required before deployment approval.

## Runtime and build

- The supported Node range is >=24.21.0 <25.
- The local verification runtime was Node v24.21.0.
- The application starts with npm start.
- tsx is a runtime dependency.
- npm run build validates the Prisma schema, generates Prisma Client,
  and checks TypeScript. It does not emit a compiled application.
- A clean deployment build must install development dependencies
  because the Prisma CLI and TypeScript are build dependencies.
- Prisma Client must be generated during the deployment build.
- No clean installation or generation was performed in this review.

Proposed future Render settings, subject to release preparation:

- Build command: npm ci --include=dev && npm run build
- Start command: npm start
- HTTP health check path: /healthz
- NODE_ENV: production
- Port: use the platform-provided PORT

These settings have not been applied to a Render service.

## Configuration and HTTP security

- Startup validates the PostgreSQL URL and session secret.
- Production requires an explicit HTTPS SITE_ORIGIN.
- Production validates the required R2 configuration.
- Production R2 image delivery requires a custom public domain.
- Production enables trust proxy with a hop count of one.
- Session cookies use Secure in production, HttpOnly, and SameSite=Lax.
- Existing tests cover forwarded HTTPS and HTTP cookie behavior.
- Canonical origin generation uses SITE_ORIGIN rather than request
  host headers.
- Helmet and CSP are enabled.
- Administrator responses use private caching and indexing headers.
- Unexpected HTTP errors return a generic response with an error ID.
- Server error reporting restricts output to approved diagnostic fields.

The proxy assumptions, cookies, HTTPS origin, and public image domain
must also be verified through the actual staging service.

## Health and database limits

- /healthz runs before session middleware.
- It performs a read-only database query.
- It returns 200 when the query succeeds and 503 when it fails.
- The health query has a 1,000 ms client query timeout.
- The shared pool has a 2,000 ms connection acquisition timeout.
- Application database connections set statement_timeout to 10,000 ms.
- Application database connections set lock_timeout to 3,000 ms.
- Focused integration tests verify effective PostgreSQL settings,
  statement cancellation, lock cancellation, and subsequent queries.

These limits do not establish a deadline for an entire HTTP request
or remove ambiguity after a connection is lost during a write.

## Upload resource controls

- Each uploaded image is limited to 5 MiB.
- Images are limited to 25,000,000 pixels.
- Processed images have a maximum edge of 1,920 pixels.
- Each process admits at most two upload requests at once.
- Each process runs at most one image-processing worker at once.
- Homepage forms accept up to five images.
- Image processing has a 30,000 ms timeout per image.
- Each R2 upload or deletion has a 30,000 ms operation deadline.
- Upload slots remain reserved while controller work continues,
  including after a browser disconnect.

Previous profiling evidence, not rerun during this review:

- Platform: Windows x64, Node v24.21.0.
- Three sequential runs were measured for each scenario.
- Maximum measured process RSS:
  - JPEG: 130.6 MiB.
  - PNG: 126.2 MiB.
  - HEIC fixture: 250.3 MiB.
  - Homepage JPEG scenario: 161.4 MiB.
  - Homepage HEIC scenario: 262.9 MiB.

Homepage scenarios retain ten input buffers and process five images
sequentially. The profiler does not run the complete Express application,
Prisma, sessions, or R2 operations. Its HEIC fixture does not establish
the maximum memory cost of every accepted HEIC image.

These measurements do not establish a sufficient hosting memory limit.
Full application memory and upload behavior require Linux staging checks.

## Shutdown behavior and limits

- SIGTERM and SIGINT start shutdown once.
- Shutdown stops accepting new work and waits for tracked handlers
  and HTTP connections before resource cleanup.
- Cleanup closes the session store, R2 clients, Prisma, and the pool.
- SHUTDOWN_TIMEOUT_MS defaults to 25,000 ms.
- The configuration accepts values from 1,000 through 240,000 ms.
- Exceeding the application deadline forces a failed exit.

The application budget must remain below the platform shutdown
allowance, with time reserved for cleanup.

A multi-image request can outlast the shutdown budget because processing,
storage, and compensating cleanup have separate operation limits.
Graceful completion of every accepted upload is not guaranteed.
Forced termination can interrupt compensating cleanup.

Staging must verify upload interruption, shutdown behavior, and recovery.
Increasing the shutdown budget alone does not establish those guarantees.

## Verification performed for this review

Passed:

- npm run typecheck
- npm test: 192 tests
- npm run prisma:validate
- node --test --test-concurrency=1 test/integration/postgres-timeouts.test.ts:
  3 tests
- git diff --check

The focused database tests used the guarded local test database.
They did not change stored application records.

The complete database, seed, slug, and browser suites were not rerun
during this review. Historical results are not new verification.

## Remaining release and staging gates

Milestone 2: Repeatable releases and recovery

- Establish CI and the complete release verification procedure.
- Define safe migration and administrator provisioning procedures.
- Define PostgreSQL and R2 backup and recovery procedures.
- Document deployment, rollback limits, and recovery.
- Correct outdated README instructions.

Milestone 3: Staging deployment

- Choose hosting and database resources.
- Verify a clean Linux build, generated Prisma Client, and startup.
- Verify effective Node version and database timeout settings.
- Verify external port access and database-aware health checks.
- Verify actual proxy behavior, secure cookies, and HTTPS origin.
- Configure isolated staging data, secrets, and R2 image delivery.
- Measure complete application memory during representative uploads.
- Verify SIGTERM delivery, shutdown timing, and interrupted uploads.

Milestone 4: Staging acceptance

- Complete functional, security, accessibility, device, and performance
  acceptance checks.

Deployment remains subject to explicit authorization.