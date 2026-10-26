#!/usr/bin/env bash
set -euo pipefail
umask 077
repo_root=$(cd "$(dirname "$0")/.." && pwd)
for tool in mvn npm node tar shasum python3; do command -v "$tool" >/dev/null; done
node "$repo_root/deploy/release-preflight.mjs" "$repo_root"
bounded() { python3 "$repo_root/tools/bounded_command.py" "$@"; }
# Isolated verification emits bounded synthetic receipts here; a fresh source copy has no runtime folder yet.
mkdir -p "$repo_root/.local/runtime"
bounded 30 node --test --test-timeout=15000 "$repo_root/deploy/reconcile-costs.test.mjs" "$repo_root/deploy/schema-contract.test.mjs" "$repo_root/deploy/app-backup.test.mjs" "$repo_root/deploy/multipart-admission.test.mjs" "$repo_root/deploy/release-preflight.test.mjs" "$repo_root/deploy/smoke-contract.test.mjs" "$repo_root/deploy/caddy-policy.test.mjs"
cd "$repo_root/campus-ai-server"
bounded 180 mvn -q verify
cd "$repo_root/campus-ai-web"
# Run this script in an isolated source copy when the working checkout has a live Vite process.
bounded 120 npm ci --no-audit --no-fund
bounded 90 npm test
bounded 60 npx eslint . --no-cache
bounded 60 npx oxlint . --deny-warnings
bounded 60 npm run build
# Production bundles must not contain design fixtures or source maps.
if find dist -type f \( -name '*.map' -o -name 'design-review.html' \) | read -r unwanted; then
  echo 'Refusing a bundle containing debug assets' >&2; exit 1
fi
mkdir -p "$repo_root/releases"
release_dir=$(mktemp -d "$repo_root/releases/free-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
cp "$repo_root/campus-ai-server/target/campus-ai-server-0.0.1-SNAPSHOT.jar" "$release_dir/server.jar"
cp -R "$repo_root/campus-ai-web/dist" "$release_dir/web"
mkdir -p "$release_dir/deploy/migrations"
# Allowlist deployment assets; never recursively package a directory that may later contain credentials.
for asset in Caddyfile.example caddy-policy.test.mjs campthink.service backup-common.sh backup-db.sh restore-drill.sh offsite-copy.sh app-backup.mjs app-backup.md app-backup.test.mjs multipart-admission.test.mjs release-preflight.mjs release-preflight.test.mjs reconcile-costs.mjs reconcile-costs.test.mjs schema-contract.test.mjs launch-doctor.mjs tls-smoke.mjs build-release.sh local-smoke.mjs reliability-smoke.mjs smoke-contract.mjs smoke-contract.test.mjs; do
  cp "$repo_root/deploy/$asset" "$release_dir/deploy/"
done
# Reviewed source inventory only. Presence in the package never authorizes applying
# every migration to an existing database; the real schema diff remains mandatory.
for migration in V20261004__ai_spend.sql V20261009__contact_submission_keys.sql \
  2026-10-11-private-timetables.sql 2026-10-14-teaching-attendance.sql \
  2026-10-15-teaching-identities.sql 2026-10-15-teaching-rosters.sql \
  2026-10-15-teaching-lifecycle.sql 2026-10-15-teaching-capacity-indexes.sql \
  2026-10-17-teaching-reenrollment.sql 2026-10-17-teaching-course-mode-reviews.sql \
  2026-10-17-teaching-evidence-index.sql 2026-10-17-teaching-management-audit-index.sql \
  2026-10-17-teaching-roster-query-index.sql 2026-10-17-teaching-responsibilities.sql \
  2026-10-18-teaching-lesson-changes.sql V20261019__material_receipts.sql \
  V20261019__private_materials.sql V20261019__personal_schedule_history.sql; do
  cp "$repo_root/deploy/migrations/$migration" "$release_dir/deploy/migrations/"
done
cp "$repo_root/campus-ai-server/src/main/resources/schema.sql" "$release_dir/schema-new-database-only.sql"
cp "$repo_root/.env.example" "$release_dir/server.env.example"
cp "$repo_root/campus-ai-web/.env.example" "$release_dir/web.env.example"
cp "$repo_root/docs/free-launch-runbook.md" "$release_dir/README.md"
cp "$repo_root/docs/icp-filing-plan.md" "$repo_root/docs/free-launch-acceptance.md" "$release_dir/"
(cd "$release_dir" && find . -type f ! -name SHA256SUMS -exec shasum -a 256 {} + > SHA256SUMS)
COPYFILE_DISABLE=1 tar -czf "$release_dir.tar.gz" -C "$(dirname "$release_dir")" "$(basename "$release_dir")"
shasum -a 256 "$release_dir.tar.gz"
echo "Release candidate built: $release_dir"
echo 'Not a deployment approval. Complete filing, privacy, real-account, HTTPS and restore checks before opening public access.'
