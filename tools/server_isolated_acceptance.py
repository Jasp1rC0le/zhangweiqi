"""Explicit, loopback-only synthetic acceptance install; never a production upgrader."""
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import secrets
import socket
import subprocess
import tarfile
import time
import urllib.request

BASE = Path('/home/ubuntu/campthink-acceptance-20261017')
ARCHIVE = Path('/home/ubuntu/campthink-preflight-20261017-U2DQVR/free-20261017T030224Z-qL3S5P.tar.gz')
ARCHIVE_SHA = 'faf565b3ffa4edaffef1b4c5cc131ba4a0b42672066a106fcaea569815da1f56'
JAR_SHA = '36491b84907bfdd2e34f37ca6f21992cc3ecdbffa0e1f58f177dfb16cb8f0f19'
API_UNIT = 'campthink-acceptance-20261017-api'
WEB_UNIT = 'campthink-acceptance-20261017-web'
MIGRATIONS = [
    'V20261004__ai_spend.sql', 'V20261009__contact_submission_keys.sql',
    '2026-10-11-private-timetables.sql', '2026-10-14-teaching-attendance.sql',
    '2026-10-15-teaching-identities.sql', '2026-10-15-teaching-rosters.sql',
    '2026-10-15-teaching-lifecycle.sql', '2026-10-15-teaching-capacity-indexes.sql',
    '2026-10-17-teaching-reenrollment.sql', '2026-10-17-teaching-course-mode-reviews.sql',
    '2026-10-17-teaching-evidence-index.sql', '2026-10-17-teaching-management-audit-index.sql',
    '2026-10-17-teaching-roster-query-index.sql',
]


def run(args, stdin=None, timeout=30):
    result = subprocess.run(args, input=stdin, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        # Never print subprocess input, credentials, SQL or potentially sensitive stderr.
        raise RuntimeError('Acceptance command failed: ' + args[0] + ' exit ' + str(result.returncode))
    return result.stdout


def sql(text, database=None):
    if database is not None and not re.fullmatch(r'campthink_accept_20261017_[a-f0-9]{12}', database):
        raise RuntimeError('Refusing non-synthetic write target')
    args = ['sudo', '-n', 'mysql', '--connect-timeout=5', '--batch', '--raw', '--skip-column-names']
    return run(args + ([database] if database else []), text, 45)


def private(path, data):
    with path.open('x', encoding='utf-8') as file:
        os.chmod(path, 0o600)
        file.write(data)


def metadata(database):
    if database != 'campus_ai' and not re.fullmatch(r'campthink_accept_20261017_[a-f0-9]{12}', database):
        raise RuntimeError('Unexpected metadata schema')
    columns = sql("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COALESCE(COLUMN_DEFAULT,'<NULL>'),EXTRA,COALESCE(COLLATION_NAME,'') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='" + database + "' ORDER BY TABLE_NAME,ORDINAL_POSITION;")
    indexes = sql("SELECT TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX,COLUMN_NAME,NON_UNIQUE,INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='" + database + "' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;")
    foreign = sql("SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='" + database + "' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION;")
    return {key: [row.split('\t') for row in value.splitlines()] for key, value in [('columns', columns), ('indexes', indexes), ('foreignKeys', foreign)]}


def unit(name, command, environment=None):
    args = ['sudo', '-n', 'systemd-run', '--unit=' + name, '--collect', '--property=User=ubuntu',
            '--property=WorkingDirectory=' + str(BASE), '--property=UMask=0077',
            '--property=NoNewPrivileges=true', '--property=PrivateTmp=true',
            '--property=ProtectSystem=strict', '--property=ProtectHome=read-only',
            '--property=ReadWritePaths=' + str(BASE), '--property=IPAddressDeny=any',
            '--property=IPAddressAllow=localhost', '--property=MemoryMax=' + ('768M' if name == API_UNIT else '192M')]
    if environment:
        args.append('--property=EnvironmentFile=' + str(environment))
    run(args + command)


def install():
    if platform.system() != 'Linux' or Path.home() != Path('/home/ubuntu'):
        raise RuntimeError('Only the explicitly approved Ubuntu acceptance host is supported')
    os.umask(0o077)
    if BASE.exists():
        raise RuntimeError('Acceptance path already exists; inspect rather than overwrite or recreate')
    for port in (18080, 18081):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != ARCHIVE_SHA:
        raise RuntimeError('Release archive checksum mismatch')
    run(['sudo', '-n', 'true'])
    BASE.mkdir(mode=0o700)
    release = BASE / 'free-20261017T030224Z-qL3S5P'
    with tarfile.open(ARCHIVE) as archive:
        for item in archive.getmembers():
            target = (BASE / item.name).resolve()
            if not target.is_relative_to(BASE) or not (item.isfile() or item.isdir()):
                raise RuntimeError('Unexpected archive entry')
        content = [item for item in archive.getmembers() if not any(part.startswith('._') for part in Path(item.name).parts)]
        archive.extractall(BASE, members=content, filter='data')
    for row in (release / 'SHA256SUMS').read_text().splitlines():
        digest, relative = row.split(None, 1)
        path = (release / relative.lstrip('*')).resolve()
        if not path.is_relative_to(release) or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Release member checksum mismatch')
    if hashlib.sha256((release / 'server.jar').read_bytes()).hexdigest() != JAR_SHA:
        raise RuntimeError('JAR checksum mismatch')
    schema = 'campthink_accept_20261017_' + secrets.token_hex(6)
    dbuser = 'ctacc17_' + secrets.token_hex(4)
    password = secrets.token_hex(32)
    sql('CREATE DATABASE `' + schema + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
    sql((release / 'schema-new-database-only.sql').read_text(), schema)
    for migration in MIGRATIONS:
        sql((release / 'deploy/migrations' / migration).read_text(), schema)
    tables = int(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + schema + "';").strip())
    if tables != 70:
        raise RuntimeError('Expected 70 acceptance tables')
    # Replace the new empty schema's fixture school only; never touch campus_ai.
    sql("UPDATE schools SET name='Campthink隔离模拟学校',code='ACCEPTANCE_SIM_ONLY'; INSERT INTO schools(name,code) VALUES('隔离外校','ACCEPTANCE_OTHER');", schema)
    sql("CREATE USER '" + dbuser + "'@'localhost' IDENTIFIED BY '" + password + "'; GRANT SELECT,INSERT,UPDATE,DELETE ON `" + schema + "`.* TO '" + dbuser + "'@'localhost';")
    old, target = metadata('campus_ai'), metadata(schema)
    old_tables = {row[0] for row in old['columns']}
    differences = {key: {'currentOnly': [r for r in old[key] if r not in target[key]],
                         'targetOnlyOnExistingTables': [r for r in target[key] if r[0] in old_tables and r not in old[key]]}
                   for key in old}
    private(BASE / 'schema-differences.json', json.dumps(differences, ensure_ascii=False, indent=2))
    env = {
        'DB_HOST': '127.0.0.1', 'DB_PORT': '3306', 'DB_NAME': schema, 'DB_USERNAME': dbuser,
        'DB_PASSWORD': password, 'JWT_SECRET': secrets.token_hex(48),
        'SPRING_PROFILES_ACTIVE': 'pilot-4g', 'SERVER_PORT': '18081', 'SERVER_ADDRESS': '127.0.0.1',
        'SPRING_SQL_INIT_MODE': 'never', 'APP_JOBS_ENABLED': 'false',
        'APP_TEACHING_ENABLED': 'true', 'APP_TEACHING_IDENTITY_ENABLED': 'true',
        'APP_TEACHING_ROSTER_ENABLED': 'true', 'APP_TEACHING_LIFECYCLE_ENABLED': 'true',
        'KNOWLEDGE_SEED_OFFICIAL_SCHOOL': 'false', 'CAREER_SEED_OFFICIAL_CANDIDATES': 'false',
        'KNOWLEDGE_SEMANTIC_ENABLED': 'false', 'KNOWLEDGE_RERANK_ENABLED': 'false',
        'DEEPSEEK_API_KEY': '', 'KIMI_API_KEY': '', 'GLM_API_KEY': '', 'BOCHA_API_KEY': '',
        'DEEPSEEK_BASE_URL': 'http://127.0.0.1:9', 'KIMI_BASE_URL': 'http://127.0.0.1:9',
        'GLM_BASE_URL': 'http://127.0.0.1:9', 'WEB_SEARCH_ENABLED': 'false',
        'AUTH_SECURE_COOKIES': 'false', 'CORS_ALLOWED_ORIGINS': 'http://127.0.0.1:18080',
        'PUBLIC_WEB_URL': 'http://127.0.0.1:18080', 'PRIVACY_POLICY_APPROVED': 'false',
        'PRIVACY_PROCESSORS_CONFIRMED': 'false', 'PRIVACY_RETENTION_CONFIRMED': 'false',
    }
    private(BASE / 'acceptance.env', ''.join(key + '=' + value + '\n' for key, value in env.items()))
    private(BASE / 'Caddyfile', '{\n admin off\n auto_https off\n}\nhttp://127.0.0.1:18080 {\n bind 127.0.0.1\n header X-Campthink-Environment "isolated-synthetic-acceptance"\n handle /api/* {\n reverse_proxy 127.0.0.1:18081\n }\n handle {\n root * ' + str(release / 'web') + '\n try_files {path} /index.html\n file_server\n }\n}\n')
    manifest = {'schema': schema, 'dbUser': dbuser, 'release': str(release), 'jarSha256': JAR_SHA,
                'apiUnit': API_UNIT, 'webUnit': WEB_UNIT, 'api': 'http://127.0.0.1:18081',
                'web': 'http://127.0.0.1:18080', 'syntheticOnly': True, 'formalPolicyApproval': False,
                'tables': tables, 'productionDatabaseMigrated': False, 'publicRouteAdded': False}
    private(BASE / 'manifest.json', json.dumps(manifest, indent=2))
    unit(API_UNIT, ['/usr/bin/java', '-XX:ActiveProcessorCount=2', '-Xms128m', '-Xmx512m', '-jar', str(release / 'server.jar')], BASE / 'acceptance.env')
    unit(WEB_UNIT, ['/usr/bin/caddy', 'run', '--config', str(BASE / 'Caddyfile'), '--adapter', 'caddyfile'])
    print(json.dumps({'phase': 'units-started', **manifest}), flush=True)
    for _ in range(60):
        try:
            with urllib.request.urlopen(manifest['web'] + '/api/health/ready', timeout=2) as response:
                if json.load(response).get('status') == 'READY':
                    private(BASE / 'ready.json', json.dumps({'status': 'READY', 'checkedAtEpoch': int(time.time())}))
                    print('ISOLATED_ACCEPTANCE_READY; production service and public route were not changed', flush=True)
                    return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise RuntimeError('Acceptance did not become ready; inspect only its two units, do not restart production')


if __name__ == '__main__':
    install()
