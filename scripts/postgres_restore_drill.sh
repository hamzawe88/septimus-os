#!/usr/bin/env bash
set -euo pipefail

# Isolated logical restore drill for the local Compose PostgreSQL service.
# The source database is read-only throughout. A uniquely named temporary
# database and a private temporary directory are always removed on exit.

source_db="${POSTGRES_DB:-septimus_db}"
db_user="${POSTGRES_USER:-postgres}"
restore_db="septimus_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$"
drill_dir="$(mktemp -d "${TMPDIR:-/tmp}/septimus-pg-restore.XXXXXX")"
dump_file="$drill_dir/septimus.dump"
source_manifest="$drill_dir/source.tsv"
restore_manifest="$drill_dir/restore.tsv"
report_file="${RESTORE_DRILL_REPORT:-}"
restore_created=0

if [[ ! "$restore_db" =~ ^septimus_restore_drill_[0-9_]+$ ]]; then
  echo "Refusing unsafe restore database name: $restore_db" >&2
  exit 1
fi

cleanup() {
  if [[ "$restore_created" == "1" ]]; then
    docker compose exec -T db dropdb --if-exists --force -U "$db_user" "$restore_db" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$drill_dir"
}
trap cleanup EXIT INT TERM

now_ms() {
  python3 -c 'import time; print(time.time_ns() // 1_000_000)'
}

manifest() {
  local database="$1"
  local output="$2"
  : > "$output"
  while IFS= read -r table; do
    [[ -n "$table" ]] || continue
    count="$(docker compose exec -T db psql -X -A -t -U "$db_user" -d "$database" \
      -c "SELECT count(*) FROM public.\"${table}\";" </dev/null)"
    printf '%s\t%s\n' "$table" "$count" >> "$output"
  done < <(docker compose exec -T db psql -X -A -t -U "$db_user" -d "$database" -c \
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")
}

drill_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
backup_started_ms="$(now_ms)"
docker compose exec -T db pg_dump -U "$db_user" -d "$source_db" \
  --format=custom --no-owner --no-acl > "$dump_file"
docker compose exec -T db pg_restore --list < "$dump_file" >/dev/null
backup_finished_ms="$(now_ms)"

manifest "$source_db" "$source_manifest"
source_hash="$(shasum -a 256 "$source_manifest" | awk '{print $1}')"
dump_hash="$(shasum -a 256 "$dump_file" | awk '{print $1}')"
dump_bytes="$(wc -c < "$dump_file" | tr -d ' ')"

restore_started_ms="$(now_ms)"
docker compose exec -T db createdb -U "$db_user" "$restore_db"
restore_created=1
docker compose exec -T db pg_restore -U "$db_user" -d "$restore_db" \
  --no-owner --no-acl --exit-on-error < "$dump_file"
manifest "$restore_db" "$restore_manifest"
restore_hash="$(shasum -a 256 "$restore_manifest" | awk '{print $1}')"

if ! diff -u "$source_manifest" "$restore_manifest"; then
  echo "Restore validation failed: table row counts differ" >&2
  exit 1
fi

restore_finished_ms="$(now_ms)"
backup_seconds="$(python3 -c "print(round(($backup_finished_ms-$backup_started_ms)/1000, 3))")"
rto_seconds="$(python3 -c "print(round(($restore_finished_ms-$restore_started_ms)/1000, 3))")"
table_count="$(wc -l < "$source_manifest" | tr -d ' ')"

report="$(cat <<REPORT
# PostgreSQL Restore Drill

- Started (UTC): $drill_started
- Source database: $source_db
- Isolation: temporary database $restore_db
- Backup format: PostgreSQL custom, no owner/ACL
- Dump bytes: $dump_bytes
- Dump SHA-256: $dump_hash
- Tables compared: $table_count
- Source manifest SHA-256: $source_hash
- Restored manifest SHA-256: $restore_hash
- Logical-backup RPO during this controlled drill: 0 seconds
- Backup duration: $backup_seconds seconds
- Measured database RTO (create + restore + row-count validation): $rto_seconds seconds
- Result: PASS — every public table row count matched
REPORT
)"

printf '%s\n' "$report"
if [[ -n "$report_file" ]]; then
  printf '%s\n' "$report" > "$report_file"
fi
