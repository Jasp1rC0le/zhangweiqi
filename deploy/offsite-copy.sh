#!/usr/bin/env bash
# Only ciphertext and its exact checksum are allowed across hosts. No deletion or key transfer.
set -euo pipefail
umask 077
source "$(dirname "$0")/backup-common.sh"
[[ $# = 3 ]] || { echo 'Usage: bash offsite-copy.sh /absolute/backup-job SSH_CONFIG_ALIAS /remote/private-directory' >&2; exit 2; }
job=$1; destination=$2; remote_root=$3
[[ "$destination" =~ ^[A-Za-z][A-Za-z0-9_-]+$ ]] || { echo 'Use a configured SSH alias, not a URL or inline credentials' >&2; exit 2; }
[[ "$remote_root" =~ ^/[A-Za-z0-9_/-]+$ && "$remote_root" != / && "$remote_root" != */../* && "$remote_root" != */.. ]] || exit 2
verify_backup "$job"
name=$(basename "$job")
[[ "$name" =~ ^backup-[A-Za-z0-9_-]+$ ]] || exit 2
remote_job="$remote_root/$name"
ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10)
# Remote parent must already exist and be private; a repeated job is rejected, never overwritten.
ssh "${ssh_options[@]}" "$destination" "test -d '$remote_root' && test ! -L '$remote_root' && test \"\$(stat -c %a '$remote_root')\" = 700 && umask 077 && mkdir '$remote_job'"
scp "${ssh_options[@]}" "$job/database.sql.gz.age" "$job/SHA256SUMS" "$destination:$remote_job/"
ssh "${ssh_options[@]}" "$destination" "cd '$remote_job' && chmod 600 database.sql.gz.age SHA256SUMS && sha256sum --check SHA256SUMS"
echo 'Ciphertext copied and remote checksum verified. This is NOT a successful offsite restore drill.'
echo 'Run restore-drill.sh on a separate isolated host with the offline key; do not place that key on the source host.'
