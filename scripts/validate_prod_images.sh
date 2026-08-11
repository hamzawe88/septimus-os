#!/usr/bin/env bash
set -euo pipefail

image_vars=(
  ALPINE_IMAGE POSTGRES_IMAGE REDIS_IMAGE NATS_IMAGE MINIO_IMAGE MINIO_MC_IMAGE
  CLAMAV_IMAGE DRIVE_IMAGE BACKEND_IMAGE AI_SIDECAR_IMAGE CENTRIFUGO_IMAGE
  YJS_IMAGE FRONTEND_IMAGE LANGFUSE_IMAGE LANGFUSE_POSTGRES_IMAGE CADDY_IMAGE
)

failed=0
for variable in "${image_vars[@]}"; do
  value="${!variable:-}"
  if [[ -z "$value" ]]; then
    echo "$variable is required" >&2
    failed=1
    continue
  fi
  if [[ ! "$value" =~ ^[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
    echo "$variable must be an immutable image@sha256:<64 lowercase hex> reference" >&2
    failed=1
  fi
done

if [[ "$failed" != "0" ]]; then
  exit 1
fi

echo "Production image policy passed: ${#image_vars[@]} immutable digest references"
