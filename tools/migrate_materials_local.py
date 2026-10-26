"""User-approved local-only additive migration, with a private backup first.

Uses the application's existing local configuration without printing credentials.
Never connects to a non-loopback host or applies a rollback over user data.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
config = next(c for c in ET.parse(root / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
configured = {e.get('name'): e.get('value') for e in config.findall('.//env')}
if configured.get('DB_HOST', '127.0.0.1') not in ('localhost', '127.0.0.1') or configured.get('DB_NAME', 'campus_ai') != 'campus_ai':
    raise SystemExit('Not the approved local campus_ai database. Nothing changed.')
port = int(configured.get('DB_PORT', '3306'))
if not 1024 <= port <= 65535:
    raise SystemExit('Invalid local port. Nothing changed.')
env = os.environ.copy()
env['MYSQL_PWD'] = configured.get('DB_PASSWORD', '')
connection = ['--host=127.0.0.1', f'--port={port}', f"--user={configured.get('DB_USERNAME', 'root')}"]
def query(sql, timeout=20):
    result = subprocess.run(['/usr/local/mysql/bin/mysql', *connection, '--batch', '--skip-column-names', 'campus_ai'], input=sql, text=True, capture_output=True, env=env, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'Local database operation failed (exit {result.returncode}); no alternate credentials attempted')
    return result.stdout.strip()

tables = ['student_course_schedules', 'student_course_schedule_versions', 'knowledge_submissions', 'campus_canteen_merchants', 'contact_messages']
checksum_sql = 'CHECKSUM TABLE ' + ','.join(f'`{t}`' for t in tables) + ' EXTENDED;'
size = int(query("SELECT COALESCE(SUM(data_length+index_length),0) FROM information_schema.tables WHERE table_schema=DATABASE()"))
if size > 2 * 1024**3 or shutil.disk_usage(root).free < max(1024**3, size * 3):
    raise SystemExit('Backup size/free space requires manual review. Nothing changed.')
migrations = [root / 'deploy/migrations' / name for name in ['V20261019__material_receipts.sql', 'V20261019__private_materials.sql', 'V20261019__personal_schedule_history.sql']]
before = query(checksum_sql)
if not args.apply:
    print(json.dumps({'target': 'loopback/campus_ai', 'approximateDatabaseBytes': size, 'migrations': [p.name for p in migrations], 'writeApplied': False}))
    raise SystemExit(0)

folder = root / '.local/runtime' / ('materials-backup-20261019-' + uuid.uuid4().hex[:8])
folder.mkdir(mode=0o700)
backup = folder / 'campus_ai-before.sql'
fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'wb') as output:
    result = subprocess.run(['/usr/local/mysql/bin/mysqldump', *connection, '--single-transaction', '--quick', '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF', '--routines', '--triggers', 'campus_ai'], stdout=output, stderr=subprocess.PIPE, env=env, timeout=90)
if result.returncode or backup.stat().st_size < 100:
    raise SystemExit(f'Backup incomplete; no migration applied. Partial artifact retained privately at {folder}')
digest = hashlib.sha256()
with backup.open('rb') as data:
    for block in iter(lambda: data.read(1024 * 1024), b''):
        digest.update(block)
receipt = {'createdAt': datetime.now(timezone.utc).isoformat(), 'target': 'loopback/campus_ai', 'backup': str(backup), 'backupBytes': backup.stat().st_size, 'backupSha256': digest.hexdigest(), 'backupPermissions': oct(backup.stat().st_mode & 0o777), 'migrationApplied': False, 'migrations': []}
record = folder / 'receipt.json'
def save_receipt():
    record.write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
    record.chmod(0o600)
save_receipt()
try:
    for path in migrations:
        query(path.read_text(), timeout=30)
        receipt['migrations'].append({'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        save_receipt()
    after = query(checksum_sql)
    receipt['existingTableChecksumsUnchanged'] = before == after
    receipt['migrationApplied'] = True
    receipt['newTableCount'] = int(query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('material_command_receipts','private_material_quota','private_material_files','personal_schedule_terms','personal_schedule_history')"))
    receipt['newPrivateRows'] = int(query('SELECT (SELECT COUNT(*) FROM private_material_files)+(SELECT COUNT(*) FROM personal_schedule_terms)+(SELECT COUNT(*) FROM personal_schedule_history)+(SELECT COUNT(*) FROM material_command_receipts)'))
    save_receipt()
except Exception:
    receipt['error'] = 'Migration not fully confirmed; retain backup and inspect receipt. No destructive rollback attempted.'
    save_receipt()
    raise
print(json.dumps({'receipt': str(record), 'backupBytes': receipt['backupBytes'], 'backupSha256': receipt['backupSha256'], 'existingTableChecksumsUnchanged': receipt['existingTableChecksumsUnchanged'], 'newTableCount': receipt['newTableCount'], 'newPrivateRows': receipt['newPrivateRows']}, ensure_ascii=False))
