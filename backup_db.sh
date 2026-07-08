#!/bin/bash
# Backup script for Septimus OS Database
# Runs via cron or manual execution

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="./backups"
DB_CONTAINER="septimus-os-db-1"
DB_USER="postgres"

mkdir -p "$BACKUP_DIR"

echo "Starting backup of septimus_db..."
docker exec -t $DB_CONTAINER pg_dump -U $DB_USER septimus_db -F c > "$BACKUP_DIR/septimus_db_$TIMESTAMP.dump"

echo "Backup completed: $BACKUP_DIR/septimus_db_$TIMESTAMP.dump"

# Optional: keep only last 7 days of backups
find $BACKUP_DIR -type f -name "*.dump" -mtime +7 -exec rm {} \;
echo "Old backups cleaned up."
