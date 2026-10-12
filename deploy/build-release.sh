#!/usr/bin/env bash
set -euo pipefail
umask 077
repo_root=$(cd "$(dirname "$0")/.." && pwd)
for tool in mvn npm node tar shasum; do command -v "$tool" >/dev/null; done
node --test --test-timeout=15000 "$repo_root/deploy/reconcile-costs.test.mjs" "$repo_root/deploy/schema-contract.test.mjs"
cd "$repo_root/campus-ai-server"
mvn -q verify
cd "$repo_root/campus-ai-web"
npm ci
node --test --test-timeout=15000 tests/*.test.js tests/*.test.mjs
npx eslint src
npm run build
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
for asset in Caddyfile.example campthink.service backup-common.sh backup-db.sh restore-drill.sh offsite-copy.sh reconcile-costs.mjs reconcile-costs.test.mjs schema-contract.test.mjs launch-doctor.mjs tls-smoke.mjs build-release.sh local-smoke.mjs reliability-smoke.mjs; do
  cp "$repo_root/deploy/$asset" "$release_dir/deploy/"
done
cp "$repo_root/deploy/migrations/V20261004__ai_spend.sql" "$release_dir/deploy/migrations/"
cp "$repo_root/deploy/migrations/V20261009__contact_submission_keys.sql" "$release_dir/deploy/migrations/"
cp "$repo_root/deploy/migrations/2026-10-11-private-timetables.sql" "$release_dir/deploy/migrations/"
cp "$repo_root/campus-ai-server/src/main/resources/schema.sql" "$release_dir/schema-new-database-only.sql"
cp "$repo_root/.env.example" "$release_dir/server.env.example"
cp "$repo_root/campus-ai-web/.env.example" "$release_dir/web.env.example"
cp "$repo_root/docs/free-launch-runbook.md" "$release_dir/README.md"
cp "$repo_root/docs/icp-filing-plan.md" "$repo_root/docs/free-launch-acceptance.md" "$release_dir/"
(cd "$release_dir" && find . -type f ! -name SHA256SUMS -exec shasum -a 256 {} + > SHA256SUMS)
tar -czf "$release_dir.tar.gz" -C "$(dirname "$release_dir")" "$(basename "$release_dir")"
shasum -a 256 "$release_dir.tar.gz"
echo "Release candidate built: $release_dir"
echo 'Not a deployment approval. Complete filing, privacy, real-account, HTTPS and restore checks before opening public access.'
