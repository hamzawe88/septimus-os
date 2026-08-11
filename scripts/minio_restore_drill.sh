#!/usr/bin/env bash
set -euo pipefail

drill_dir="$(mktemp -d "${TMPDIR:-/tmp}/septimus-minio-restore.XXXXXX")"
container_name="septimus-minio-restore-drill-$(date -u +%Y%m%d%H%M%S)-$$"
report_file="${RESTORE_DRILL_REPORT:-}"
test_user="restore-drill"
test_password="restore-drill-password-2026"

if [[ ! "$container_name" =~ ^septimus-minio-restore-drill-[0-9-]+$ ]]; then
  echo "Refusing unsafe drill container name: $container_name" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf -- "$drill_dir"
}
trap cleanup EXIT INT TERM

now_ms() {
  python3 -c 'import time; print(time.time_ns() // 1_000_000)'
}

db_container="$(docker compose ps -q db)"
network_name="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$db_container")"
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
backup_started_ms="$(now_ms)"

# Reuse the Compose mc service so source credentials are injected by Compose
# and never printed or copied into the report.
docker compose run --rm --no-deps \
  -v "$drill_dir:/drill" --entrypoint /bin/sh minio-create-buckets -c '
    set -eu
    /usr/bin/mc alias set source http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
    /usr/bin/mc mirror --overwrite source/septimus-drive /drill/objects >/dev/null
    /usr/bin/mc ls --recursive --json source/septimus-drive > /drill/source.jsonl
  '
backup_finished_ms="$(now_ms)"

restore_started_ms="$(now_ms)"
mkdir -p "$drill_dir/restored-data"
docker run -d --name "$container_name" --network "$network_name" \
  -e "MINIO_ROOT_USER=$test_user" -e "MINIO_ROOT_PASSWORD=$test_password" \
  -v "$drill_dir/restored-data:/data" minio/minio server /data >/dev/null

ready=0
for _ in $(seq 1 30); do
  if docker run --rm --network "$network_name" --entrypoint /bin/sh minio/mc -c \
    "/usr/bin/mc alias set restored http://$container_name:9000 '$test_user' '$test_password' >/dev/null && /usr/bin/mc ready restored >/dev/null" \
    >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != "1" ]]; then
  echo "Isolated MinIO did not become ready within 30 seconds" >&2
  exit 1
fi

docker run --rm --network "$network_name" -v "$drill_dir:/drill" \
  --entrypoint /bin/sh minio/mc -c "
    set -eu
    /usr/bin/mc alias set restored http://$container_name:9000 '$test_user' '$test_password' >/dev/null
    /usr/bin/mc mb --ignore-existing restored/septimus-drive >/dev/null
    /usr/bin/mc mirror --overwrite /drill/objects restored/septimus-drive >/dev/null
    /usr/bin/mc ls --recursive --json restored/septimus-drive > /drill/restored.jsonl
  "

object_count="$(python3 - "$drill_dir/source.jsonl" "$drill_dir/restored.jsonl" <<'PY'
import json
import sys

def inventory(path):
    rows = []
    with open(path, encoding="utf-8") as stream:
        for line in stream:
            item = json.loads(line)
            rows.append((item.get("key"), item.get("size"), item.get("etag")))
    return sorted(rows)

source = inventory(sys.argv[1])
restored = inventory(sys.argv[2])
if source != restored:
    raise SystemExit(f"MinIO inventory mismatch: source={len(source)} restored={len(restored)}")
print(len(source))
PY
)"
restore_finished_ms="$(now_ms)"
backup_seconds="$(python3 -c "print(round(($backup_finished_ms-$backup_started_ms)/1000, 3))")"
rto_seconds="$(python3 -c "print(round(($restore_finished_ms-$restore_started_ms)/1000, 3))")"

report="$(cat <<REPORT
# MinIO Restore Drill

- Started (UTC): $started
- Source bucket: septimus-drive
- Isolation: temporary MinIO container with fresh test-only credentials
- Objects compared by key, size, and ETag: $object_count
- Object-backup RPO during this controlled drill: 0 seconds
- Backup duration: $backup_seconds seconds
- Measured object-store RTO (bucket create + restore + inventory validation): $rto_seconds seconds
- Result: PASS — restored inventory matched the source
REPORT
)"

printf '%s\n' "$report"
if [[ -n "$report_file" ]]; then
  printf '%s\n' "$report" > "$report_file"
fi
