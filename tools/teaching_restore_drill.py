"""Round-trip ONLY a verified task-owned synthetic teaching schema; never restore sessions.

This is not the school's archive, encrypted/off-host backup, or a full-site restore.
The source and new destination are retained. No existing database is overwritten.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MYSQL = '/usr/local/mysql/bin/mysql'
DUMP = '/usr/local/mysql/bin/mysqldump'
SOURCE_PATTERN = re.compile(r'campthink_http_20261017_[a-f0-9]{12}')
TARGET_PATTERN = re.compile(r'campthink_restore_20261017_[a-f0-9]{12}')
TABLE_PATTERN = re.compile(r'(?:teaching_[a-z_]+|users|auth_sessions|student_course_schedule_versions|student_course_schedules)')
MAX_BYTES = 64 * 1024 * 1024


def identifier(value, pattern):
    if not pattern.fullmatch(value or ''):
        raise ValueError('Only the explicit task-prefixed synthetic identifier is permitted')
    return value


def validate_dump(content, source):
    identifier(source, SOURCE_PATTERN)
    if not content or len(content) > MAX_BYTES:
        raise ValueError('Empty or oversized synthetic snapshot')
    sql = content.decode('utf-8', errors='strict')
    forbidden = r'(?im)^\s*(?:USE\s|(?:CREATE|DROP|ALTER)\s+DATABASE\b|DROP\s+TABLE\b|GRANT\s|REVOKE\s|(?:CREATE|ALTER)\s+USER\b|SET\s+@@GLOBAL\b|SOURCE\s|LOAD\s+DATA\b)'
    if re.search(forbidden, sql) or re.search(r'(?i)`' + re.escape(source) + r'`\s*\.', sql):
        raise ValueError('Snapshot contains a cross-database or destructive directive')
    if re.search(r'(?im)^\s*(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+`?auth_sessions`?\b', sql):
        raise ValueError('Login sessions must not be backed up or restored')
    return hashlib.sha256(content).hexdigest()


def configured_client():
    config = next(c for c in ET.parse(ROOT / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
    values = {e.get('name'): e.get('value') for e in config.findall('.//env')}
    if values.get('DB_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost'):
        raise ValueError('Not the configured loopback database; no operation executed')
    port = int(values.get('DB_PORT', '3306'))
    if not 1024 <= port <= 65535:
        raise ValueError('Invalid local database port')
    env = os.environ.copy()
    env['MYSQL_PWD'] = values.get('DB_PASSWORD', '')
    args = ['--no-defaults', '--host=127.0.0.1', f'--port={port}', f"--user={values.get('DB_USERNAME', 'root')}"]
    return args, env, values, port


def verify_readback(receipt, target):
    identifier(target, TARGET_PATTERN)
    required = ('actualLoopbackTcpHttp', 'actualJwtAndDbSession', 'signedMissingSession401',
                'newSessionRevocation401', 'teacher702Secretary400Counselor100', 'studentCrossView403AndNonmember404')
    if receipt.get('schema') != target or any(receipt.get(key) is not True for key in required):
        raise ValueError('Application receipt does not verify this restored schema')
    if receipt.get('restoredOldSessions') != 0 or receipt.get('freshSyntheticSessions') != 5:
        raise ValueError('Unexpected restored or newly issued session evidence')
    return receipt


def run(source, verify_http=True):
    identifier(source, SOURCE_PATTERN)  # Before configuration or database access.
    previous = json.loads((ROOT / '.local/runtime/teaching-mysql-http-2026-10-17.json').read_text())
    if previous.get('schema') != source or previous.get('registeredUsers') != 10025:
        raise ValueError('Source is not the exact retained synthetic HTTP evidence schema')
    args, env, values, port = configured_client()

    def query(sql, schema=None, timeout=15):
        command = [MYSQL] + args + ['--batch', '--raw', '--skip-column-names', '--local-infile=0']
        if schema:
            command.append('--database=' + schema)
        reply = subprocess.run(command, input=sql, text=True, env=env, capture_output=True, timeout=timeout)
        if reply.returncode:
            code = re.search(r'ERROR (\d+)', reply.stderr)
            raise RuntimeError('Synthetic database operation failed; MySQL code=' + (code.group(1) if code else 'unavailable'))
        return reply.stdout.strip()

    invalid = int(query("SELECT COUNT(*) FROM users WHERE username IS NULL OR username NOT LIKE 'http-demo-%' OR password_hash IS NOT NULL", source))
    if invalid or query('SELECT COUNT(*) FROM users', source) != '10025':
        raise ValueError('Synthetic account markers do not match; no snapshot created')
    executable = sum(int(query(f"SELECT COUNT(*) FROM information_schema.{table} WHERE {column}='{source}'"))
                     for table, column in [('views', 'TABLE_SCHEMA'), ('triggers', 'TRIGGER_SCHEMA'), ('routines', 'ROUTINE_SCHEMA'), ('events', 'EVENT_SCHEMA')])
    if executable:
        raise ValueError('Unexpected executable schema objects; no snapshot created')
    names = query(f"SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA='{source}' ORDER BY TABLE_NAME").splitlines()
    if not names or any(not TABLE_PATTERN.fullmatch(name) for name in names) or 'auth_sessions' not in names:
        raise ValueError('Unexpected schema contents; no snapshot created')
    if query(f"SELECT COUNT(*) FROM information_schema.tables WHERE TABLE_SCHEMA='{source}' AND ENGINE<>'InnoDB'") != '0':
        raise ValueError('Synthetic snapshot requires transactional InnoDB tables')

    def manifest(schema):
        data = {}
        for table in names:
            count = int(query(f'SELECT COUNT(*) FROM `{table}`', schema))
            checksum = None if table == 'auth_sessions' else query(f'CHECKSUM TABLE `{table}` EXTENDED', schema).split('\t')[-1]
            if checksum == 'NULL':
                raise ValueError('Unsupported table checksum; cannot claim integrity')
            data[table] = {'rows': count, 'checksum': checksum}
        return data

    before = manifest(source)
    runtime = ROOT / '.local/runtime'
    job = Path(tempfile.mkdtemp(prefix='synthetic-teaching-restore-20261017-', dir=runtime))
    os.chmod(job, 0o700)
    snapshot = job / 'synthetic-teaching.sql'
    began = time.monotonic()
    dump_flags = ['--single-transaction', '--quick', '--skip-lock-tables', '--skip-add-locks', '--skip-add-drop-table',
                  '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', '--skip-triggers',
                  '--no-create-db', '--skip-comments', '--skip-dump-date']
    with snapshot.open('xb') as output:
        os.chmod(snapshot, 0o600)
        for suffix in [[f'--ignore-table={source}.auth_sessions', source], ['--no-data', source, 'auth_sessions']]:
            dumped = subprocess.run([DUMP] + args + dump_flags + suffix, stdout=output, stderr=subprocess.PIPE, env=env, timeout=45)
            if dumped.returncode:
                raise RuntimeError('Synthetic dump failed; partial file retained privately, not imported')
    digest = validate_dump(snapshot.read_bytes(), source)
    after = manifest(source)
    if before != after:
        raise RuntimeError('Source changed during snapshot; no target created')
    target = identifier('campthink_restore_20261017_' + uuid.uuid4().hex[:12], TARGET_PATTERN)
    # No IF NOT EXISTS and no DROP: a collision must fail before import.
    query(f'CREATE DATABASE `{target}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
    restore_began = time.monotonic()
    if validate_dump(snapshot.read_bytes(), source) != digest:
        raise RuntimeError('Snapshot changed after preparation; target retained empty')
    with snapshot.open('rb') as input_file:
        restored = subprocess.run([MYSQL] + args + ['--local-infile=0', '--database=' + target], stdin=input_file,
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=60)
    if restored.returncode:
        raise RuntimeError('Restore failed; isolated target retained, source was not targeted')
    restore_millis = round((time.monotonic() - restore_began) * 1000)
    restored_manifest = manifest(target)
    for table in names:
        expected = {'rows': 0, 'checksum': None} if table == 'auth_sessions' else before[table]
        if restored_manifest[table] != expected:
            raise RuntimeError('Restored synthetic table differs: ' + table)
    evidence = {'source': source, 'restoredSchema': target, 'syntheticOnly': True, 'schoolSchemaTargeted': False,
                'existingDatabaseOverwritten': False, 'sourceRowsChanged': False, 'tables': len(names),
                'snapshotBytes': snapshot.stat().st_size, 'snapshotSha256': digest, 'snapshotPath': str(snapshot),
                'artifactDirectoryMode': '700', 'snapshotMode': '600', 'allDataTableCountsAndChecksumsMatch': True,
                'oldLoginSessionsExcluded': before['auth_sessions']['rows'], 'restoredOldLoginSessions': 0,
                'restoreMillis': restore_millis, 'tableManifest': restored_manifest,
                'notEncryptedOrOffsiteBackup': True, 'notFullSiteOrSchoolArchive': True,
                'existingAgeBackupScriptsNotExecuted': True, 'applicationReadback': 'not requested'}
    private_manifest = job / 'manifest.json'
    private_manifest.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    os.chmod(private_manifest, 0o600)
    if verify_http:
        child_env = env.copy()
        child_env.pop('MYSQL_PWD', None)
        child_env.update({'RUN_TEACHING_RESTORE_MYSQL': 'true', 'RESTORE_TEST_MYSQL_SCHEMA': target,
                          'RESTORE_TEST_MYSQL_PORT': str(port), 'RESTORE_TEST_MYSQL_USER': values.get('DB_USERNAME', 'root'),
                          'RESTORE_TEST_MYSQL_PASSWORD': values.get('DB_PASSWORD', '')})
        verified = subprocess.run(['python3', str(ROOT / 'tools/bounded_command.py'), '100', 'mvn', '-q',
                                   '-Dtest=TeachingMysqlRestoreDrillTest', 'test'], cwd=ROOT / 'campus-ai-server', env=child_env, timeout=110)
        if verified.returncode:
            raise RuntimeError('Restored application readback failed; artifacts and target retained, not certified')
        evidence['applicationReadback'] = verify_readback(json.loads((runtime / 'teaching-mysql-restored-http-2026-10-17.json').read_text()), target)
    # Session issuance happens only on the restored DB; source remains identical.
    if manifest(source) != before:
        raise RuntimeError('Source changed before drill completion; investigate instead of claiming pass')
    evidence['elapsedMillis'] = round((time.monotonic() - began) * 1000)
    private_manifest.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    receipt = runtime / 'teaching-restore-drill-2026-10-17.json'
    receipt.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    os.chmod(receipt, 0o600)
    print(json.dumps({k: v for k, v in evidence.items() if k not in ('tableManifest', 'applicationReadback')}, ensure_ascii=False))
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--structure-only', action='store_true')
    options = parser.parse_args()
    run(options.source, not options.structure_only)
