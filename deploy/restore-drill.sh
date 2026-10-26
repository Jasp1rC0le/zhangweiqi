#!/usr/bin/env bash
# Imports only into a NEW explicitly named drill database. Never drops or overwrites a database.
# Legacy DB-only format; this does not restore private originals or prove app readiness.
set -euo pipefail
source "$(dirname "$0")/backup-common.sh"
umask 077
if [[ $# != 4 ]]; then
  echo 'Usage: bash restore-drill.sh /secure/mysql-drill.cnf /private/age.key /backup/job-dir campthink_restore_UNIQUE' >&2
  exit 2
fi
credentials=$1
identity=$2
backup_job=$3
restore_db=$4
[[ "$restore_db" =~ ^campthink_restore_[A-Za-z0-9_]+$ && ${#restore_db} -le 64 ]] || { echo 'Drill database must use campthink_restore_ prefix' >&2; exit 2; }
for private_file in "$credentials" "$identity"; do
  [[ "$private_file" = /* && -f "$private_file" && ! -L "$private_file" ]] || exit 2
  [[ "$(file_mode "$private_file")" =~ ^(400|600)$ ]] || { echo 'Private files must have mode 400 or 600' >&2; exit 2; }
done
[[ "$backup_job" = /* && -f "$backup_job/database.sql.gz.age" && -f "$backup_job/SHA256SUMS" ]] || exit 2
for tool in mysql gzip age; do command -v "$tool" >/dev/null; done
verify_backup "$backup_job"
# Authenticate and completely decompress before creating any database. Only plaintext in the pipe.
age -d -i "$identity" "$backup_job/database.sql.gz.age" | gzip -t
exists=$(mysql --defaults-extra-file="$credentials" -Nse "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='$restore_db'")
[[ "$exists" = 0 ]] || { echo 'Refusing to overwrite an existing database' >&2; exit 2; }
mysql --defaults-extra-file="$credentials" -e "CREATE DATABASE $restore_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
started=$SECONDS
trap 'echo "Drill failed; keep isolated drill database for investigation. Production was not targeted." >&2' ERR
age -d -i "$identity" "$backup_job/database.sql.gz.age" | gzip -d \
  | mysql --defaults-extra-file="$credentials" "$restore_db"
table_count=$(mysql --defaults-extra-file="$credentials" -Nse "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$restore_db'")
[[ "$table_count" -ge 54 ]] || { echo 'Schema incomplete: current release requires at least 54 core tables. Keep old restores isolated; do not apply migrations without approval.' >&2; exit 1; }
receipt_table=$(mysql --defaults-extra-file="$credentials" -Nse "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$restore_db' AND table_name='contact_submission_keys'")
[[ "$receipt_table" = 1 ]] || { echo 'Schema incomplete: feedback retry receipt table is missing' >&2; exit 1; }
material_tables=$(mysql --defaults-extra-file="$credentials" -Nse "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$restore_db' AND table_name IN ('material_command_receipts','private_material_files','private_material_quota','personal_schedule_terms','personal_schedule_history')")
[[ "$material_tables" = 5 ]] || { echo 'Schema incomplete: material/history tables are missing' >&2; exit 1; }
mysql --defaults-extra-file="$credentials" "$restore_db" -e \
  "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS projects FROM student_projects; SELECT COUNT(*) AS conversations FROM ai_conversations; SELECT COUNT(*) AS attempts FROM ai_provider_attempts;"
echo "DB-only import passed in $((SECONDS-started)) seconds; isolated database: $restore_db; originals and current application readiness not verified"
echo 'Next: point an isolated backend at this DB with outbound model/SMTP keys removed; verify login, export and owner isolation.'
echo 'No production data was overwritten. Delete the drill DB only after explicit review; it contains personal data.'
