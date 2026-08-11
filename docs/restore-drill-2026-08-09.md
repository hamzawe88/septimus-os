# PostgreSQL Restore Drill

- Started (UTC): 2026-08-08T23:17:05Z
- Source database: septimus_db
- Isolation: temporary database septimus_restore_drill_20260808231705_55892
- Backup format: PostgreSQL custom, no owner/ACL
- Dump bytes: 6940055
- Dump SHA-256: 6512a9df94fe08c432916ce5ac6ab3e7c52fad7af65404e9252748321ac79aa2
- Tables compared: 72
- Source manifest SHA-256: 6233b27a2fc0365c4c2afb17a158c549fa93a21085634b1ae860fa504e1a63a5
- Restored manifest SHA-256: 6233b27a2fc0365c4c2afb17a158c549fa93a21085634b1ae860fa504e1a63a5
- Logical-backup RPO during this controlled drill: 0 seconds
- Backup duration: 0.823 seconds
- Measured database RTO (create + restore + row-count validation): 8.109 seconds
- Result: PASS — every public table row count matched
