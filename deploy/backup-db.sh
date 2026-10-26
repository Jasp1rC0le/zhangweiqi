#!/usr/bin/env bash
# Linux server. No password on argv, no unencrypted dump on disk.
# Legacy DB-only format. Use app-backup.mjs for DB + private originals.
set -euo pipefail
source "$(dirname "$0")/backup-common.sh"
umask 077
if [[ $# != 4 ]]; then
  echo 'Usage: bash backup-db.sh /secure/mysql-backup.cnf DB_NAME /secure/backups AGE_PUBLIC_RECIPIENT' >&2
  exit 2
fi
credentials=$1
database=$2
backup_dir=$3
recipient=$4
[[ "$credentials" = /* && -f "$credentials" && ! -L "$credentials" ]] || { echo 'Credentials must be an existing absolute non-symlink file' >&2; exit 2; }
[[ "$database" =~ ^[A-Za-z][A-Za-z0-9_]{0,63}$ ]] || { echo 'Invalid database identifier' >&2; exit 2; }
[[ "$backup_dir" = /* && "$backup_dir" != / ]] || { echo 'Use an explicit private backup directory' >&2; exit 2; }
[[ "$(file_mode "$credentials")" =~ ^(400|600)$ ]] || { echo 'Credentials must have mode 400 or 600' >&2; exit 2; }
for tool in mysqldump gzip age mktemp; do command -v "$tool" >/dev/null; done
mkdir -p "$backup_dir"
[[ ! -L "$backup_dir" && "$(file_mode "$backup_dir")" = 700 ]] || { echo 'Backup directory must be non-symlink and mode 700' >&2; exit 2; }
job_dir=$(mktemp -d "$backup_dir/backup-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
trap 'echo "Backup failed; inspect private job directory, do not use partial output" >&2' ERR
mysqldump --defaults-extra-file="$credentials" --single-transaction --quick --no-tablespaces \
  --set-gtid-purged=OFF --column-statistics=0 --hex-blob "$database" \
  | gzip | age -r "$recipient" -o "$job_dir/database.sql.gz.age.partial"
mv "$job_dir/database.sql.gz.age.partial" "$job_dir/database.sql.gz.age"
(cd "$job_dir" && sha256_file database.sql.gz.age > SHA256SUMS)
echo "Encrypted backup complete: $job_dir"
echo 'Copy ciphertext and checksum off-host. Retain the private decryption key separately.'
