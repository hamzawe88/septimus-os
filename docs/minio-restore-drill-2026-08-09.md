# MinIO Restore Drill

- Started (UTC): 2026-08-08T23:18:33Z
- Source bucket: septimus-drive
- Isolation: temporary MinIO container with fresh test-only credentials
- Objects compared by key, size, and ETag: 25
- Object-backup RPO during this controlled drill: 0 seconds
- Backup duration: 0.515 seconds
- Measured object-store RTO (bucket create + restore + inventory validation): 2.203 seconds
- Result: PASS — restored inventory matched the source
