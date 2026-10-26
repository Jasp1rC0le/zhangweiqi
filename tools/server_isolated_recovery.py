"""Structure-only migration rehearsal and old-JAR compatibility on synthetic data."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.request

BASE = Path('/home/ubuntu/campthink-acceptance-20261017')


def command(args, text=None, timeout=30):
    done = subprocess.run(args, input=text, text=True, capture_output=True, timeout=timeout)
    if done.returncode:
        raise RuntimeError('Isolated rehearsal command failed: ' + args[0] + ' exit ' + str(done.returncode))
    return done.stdout


def mysql(text, db=None):
    if db and not re.fullmatch(r'campthink_(accept|upgrade)_20261017_[a-f0-9]{12}', db):
        raise RuntimeError('Not a synthetic target')
    return command(['sudo', '-n', 'mysql', '--connect-timeout=5', '--batch', '--raw', '--skip-column-names'] + ([db] if db else []), text)


def metadata(db):
    pieces = ["SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COALESCE(COLUMN_DEFAULT,'<NULL>'),EXTRA,COALESCE(COLLATION_NAME,'') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME,ORDINAL_POSITION;",
              "SELECT TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX,COLUMN_NAME,NON_UNIQUE,INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='" + db + "' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;",
              "SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='" + db + "' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION;"]
    return [set(mysql(query).splitlines()) for query in pieces]


def migration_files(release):
    # macOS resource-fork metadata is not executable SQL.
    return [release / 'schema-new-database-only.sql'] + sorted(p for p in (release / 'deploy/migrations').glob('*.sql') if not p.name.startswith('.'))


def recover():
    os.umask(0o077)
    manifest = json.loads((BASE / 'manifest.json').read_text())
    target = manifest['schema']
    assert re.fullmatch(r'campthink_accept_20261017_[a-f0-9]{12}', target)
    release = Path(manifest['release'])
    assert release.parent == BASE
    receipt = BASE / 'recovery-results.json'
    if receipt.exists():
        print('Existing completed recovery receipt; not a new execution: ' + receipt.read_text(), flush=True)
        return
    diff = json.loads((BASE / 'schema-differences.json').read_text())
    assert all(not rows for group in diff.values() for rows in group.values())
    old_schema = Path('/home/ubuntu/campthink-preflight-20261017-U2DQVR/current-schema.sql').read_text()
    assert not re.search(r'(?im)^\s*(USE |CREATE DATABASE|INSERT INTO)', old_schema)
    current_tables = set(mysql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='campus_ai';").splitlines())
    target_tables = set(mysql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + target + "';").splitlines())
    missing = target_tables - current_tables
    assert len(current_tables) == 28 and len(target_tables) == 70 and len(missing) == 42
    order = []
    files = migration_files(release)
    for file in files:
        for name in re.findall(r'CREATE TABLE IF NOT EXISTS\s+([a-z_]+)', file.read_text(), re.I):
            if name in missing and name not in order:
                order.append(name)
    assert set(order) == missing
    ddl = []
    for name in order:
        row = mysql('SHOW CREATE TABLE `' + target + '`.`' + name + '`;')
        ddl.append(row.split('\t', 1)[1].strip() + ';')
    upgrade = '\n\n'.join(ddl)
    assert not re.search(r'(?im)^\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE|ALTER)\s', upgrade)
    plan = BASE / 'additive-42-tables-reviewed.sql'
    with plan.open('x') as out:
        out.write('-- STRUCTURE-ONLY REHEARSAL. Not approval to apply against school data.\n' + upgrade + '\n')
    rehearsal = 'campthink_upgrade_20261017_' + secrets.token_hex(6)
    mysql('CREATE DATABASE `' + rehearsal + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
    mysql(old_schema, rehearsal)
    mysql(upgrade, rehearsal)
    exact = metadata(rehearsal) == metadata(target)
    assert exact, 'Rehearsed columns/indexes/foreign keys differ from target'
    print('PASS migration structure-only 28 -> 70 tables; no DML on production', flush=True)
    old_jar = Path('/opt/campus-ai/app.jar')
    expected = 'a9a795a5481cfb55ddbf0a505b782408ee4e9ae914497817506de1e3578009aa'
    digest = command(['sudo', '-n', 'sha256sum', str(old_jar)]).split()[0]
    assert digest == expected
    old_copy = BASE / 'rollback-old-server.jar'
    command(['sudo', '-n', 'install', '-o', 'ubuntu', '-g', 'ubuntu', '-m', '600', str(old_jar), str(old_copy)])
    assert hashlib.sha256(old_copy.read_bytes()).hexdigest() == expected
    before = mysql('SELECT COUNT(*) FROM teaching_attendance_audit;', target)
    probe = 'campthink-acceptance-20261017-rollback-probe'
    try:
        command(['sudo', '-n', 'systemd-run', '--unit=' + probe, '--collect', '--property=User=ubuntu',
                 '--property=WorkingDirectory=' + str(BASE), '--property=EnvironmentFile=' + str(BASE / 'acceptance.env'),
                 '--property=NoNewPrivileges=true', '--property=PrivateTmp=true', '--property=UMask=0077',
                 '--property=MemoryMax=448M', '--property=IPAddressDeny=any', '--property=IPAddressAllow=localhost',
                 '/usr/bin/java', '-XX:ActiveProcessorCount=1', '-Xms64m', '-Xmx256m', '-jar', str(old_copy),
                 '--server.address=127.0.0.1', '--server.port=18082', '--spring.sql.init.mode=never',
                 '--server.tomcat.threads.max=16', '--app.jobs.enabled=false'])
        ready = False
        for _ in range(45):
            try:
                with urllib.request.urlopen('http://127.0.0.1:18082/api/health/ready', timeout=2) as response:
                    ready = json.load(response)['status'] == 'READY'
                if ready:
                    break
            except (OSError, ValueError):
                pass
            time.sleep(1)
        assert ready, 'Old JAR did not become ready against the synthetic upgraded DB'
        assert before == mysql('SELECT COUNT(*) FROM teaching_attendance_audit;', target)
        print('PASS old JAR starts against upgraded synthetic schema; audit rows retained', flush=True)
    finally:
        command(['sudo', '-n', 'systemctl', 'stop', probe])
    for port in (18080, 8080):
        with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/health/ready', timeout=5) as response:
            assert json.load(response)['status'] == 'READY'
    result = {'rehearsalSchema': rehearsal, 'currentTables': 28, 'targetTables': 70,
              'addedTables': 42, 'columnsIndexesForeignKeysMatch': exact,
              'upgradeSha256': hashlib.sha256(plan.read_bytes()).hexdigest(),
              'oldJarCompatibilityReady': True, 'oldJarSha256': expected,
              'syntheticAuditRowsRetained': int(before), 'probeStopped': True,
              'productionDatabaseMigrated': False, 'productionDataBackupOrRestorePerformed': False,
              'newAcceptanceAndOriginalServiceReady': True, 'checkedAtEpoch': int(time.time())}
    with (BASE / 'recovery-results.json').open('x') as file:
        json.dump(result, file, indent=2)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    recover()
