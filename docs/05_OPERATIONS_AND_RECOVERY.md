# 05. Operations, Backup, and Recovery

This is the production operations baseline for Septimus OS. Commands below are
examples; use the deployment's secret manager and backup platform rather than
placing credentials in shell history or source control.

## Service-level objectives

- Target RPO: 15 minutes for PostgreSQL, 24 hours for MinIO objects.
- Target RTO: 4 hours for a full regional restore.
- Restore drills: monthly in an isolated environment.
- Backup retention: 7 daily, 4 weekly, and 12 monthly restore points, adjusted
  to legal and customer-data retention requirements.

## What must be backed up

1. PostgreSQL, including application rows, `schema_migrations`, Langfuse data,
   roles, and extension metadata.
2. MinIO buckets (`septimus-drive` and any deployment-specific buckets),
   including object versions when versioning is enabled.
3. Named volumes that contain private uploads, Yjs persistence, ClamAV
   signatures, Caddy state, and NATS JetStream state.
4. Deployment configuration from the secret manager. Secrets must be exported
   separately, encrypted with a different backup key, and never added to Git.

Redis is treated as disposable cache/session-support state unless a deployment
explicitly enables durable Redis-backed features. PostgreSQL `auth_sessions`
remains the authoritative login-session store.

## PostgreSQL backup

Use an encrypted object-store destination and a dedicated least-privilege backup
role. Prefer continuous WAL archiving plus a daily logical or physical base
backup. A logical verification example is:

```bash
pg_dump --format=custom --no-owner --no-acl --file=septimus.dump "$DB_DSN"
pg_restore --list septimus.dump
```

Do not write an unencrypted dump to a shared workstation. Hash every artifact,
record its size and PostgreSQL version, and alert if a scheduled backup is
missing or unexpectedly small.

## MinIO and volume backup

- Enable bucket versioning and server-side encryption.
- Replicate objects to a separate failure domain using an account that cannot
  delete the source.
- Snapshot Docker volumes only after application-consistent coordination.
- Back up object metadata and PostgreSQL in the same recovery window; Drive
  rows without matching objects must be detected during restore verification.

## Restore drill

For a safe local verification against the running development stack, use:

```bash
make restore-drill-postgres
make restore-drill-minio
```

Both commands restore only into uniquely named temporary resources, compare
the restored inventory with the live source, and remove their temporary
database/container and private dump directory on exit. Set
`RESTORE_DRILL_REPORT=docs/<approved-report>.md` when an auditable measurement
should be retained. These logical drills complement, rather than replace, the
full regional recovery exercise below.

1. Provision a clean, isolated network with no outbound customer integrations.
2. Restore PostgreSQL and MinIO to new volumes.
3. Set fresh test-only `JWT_SECRET`, `SETTINGS_ENC_KEY`, internal tokens, and
   integration credentials. Production encryption keys are supplied only by the
   controlled recovery procedure.
4. Start the stack and verify migrations complete exactly once.
5. Run health checks and the Playwright signup/session/Drive/CRM E2E suite.
6. Sample authenticated document and Drive downloads and confirm tenant
   isolation, malware status, and audit records.
7. Compare row counts, object counts, newest timestamps, and checksums against
   the backup manifest.
8. Record actual RPO/RTO, discrepancies, and remediation owners.

For CRM restores, compare legacy source counts with
`crm_legacy_record_links`, verify every target belongs to the same workspace,
and run the Customer 360 and quote-conversion API checks. Never delete legacy
source rows during the initial restore; the migration ledger makes replay safe.

## Monitoring and alerts

Alert on repeated container restarts, unhealthy services, migration failures,
ClamAV signature age, failed scans, PostgreSQL replication/WAL lag, MinIO
capacity, NATS consumer lag, authentication-rate-limit spikes, webhook signature
failures, and AI budget-limit events. Logs must redact tokens, cookies, payment
credentials, workflow secrets, and customer document contents.

## Safe deployment sequence

1. Back up and verify the current database and object store.
2. Run `make validate-prod-images`, then validate the Compose configuration.
3. Build application images and run all static/unit/integration checks.
4. Recreate containers without deleting named volumes.
5. Wait for every configured health check.
6. Run browser E2E and authenticated API/Drive smoke tests.
7. Review error logs and retain the previous immutable image set for rollback.

Never use `docker compose down -v` during a normal deployment or rollback.
