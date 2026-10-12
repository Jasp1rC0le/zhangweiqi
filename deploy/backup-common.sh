#!/usr/bin/env bash
# Shared validation for Linux production and macOS isolated drills.
file_mode() { if [[ "$(uname -s)" = Darwin ]]; then stat -f %Lp "$1"; else stat -c %a "$1"; fi; }
sha256_file() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }
verify_backup() {
  local job=$1 expected actual filename
  [[ "$job" = /* && -d "$job" && ! -L "$job" && -f "$job/database.sql.gz.age" && ! -L "$job/database.sql.gz.age" && -f "$job/SHA256SUMS" && ! -L "$job/SHA256SUMS" ]] || return 2
  [[ "$(wc -l < "$job/SHA256SUMS" | tr -d ' ')" = 1 ]] || return 2
  IFS=' ' read -r expected filename < "$job/SHA256SUMS"
  [[ "$expected" =~ ^[a-f0-9]{64}$ && "$filename" = database.sql.gz.age ]] || return 2
  actual=$(sha256_file "$job/database.sql.gz.age"); actual=${actual%% *}
  [[ "$actual" = "$expected" ]] || { echo 'Encrypted backup checksum mismatch' >&2; return 1; }
}
