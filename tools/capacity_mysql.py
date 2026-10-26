"""Run synthetic teaching capacity checks in a new, loopback-only, task-prefixed schema."""
import json
import os
from pathlib import Path
import re
import subprocess
import uuid
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
configuration = next(c for c in ET.parse(root / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
configured = {e.get('name'): e.get('value') for e in configuration.findall('.//env')}
if configured.get('DB_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost'):
    raise SystemExit('Not the known loopback database; no test schema created')
port = int(configured.get('DB_PORT', '3306'))
if not 1024 <= port <= 65535:
    raise SystemExit('Invalid loopback port; no test schema created')
schema = 'campthink_capacity_20261015_' + uuid.uuid4().hex[:12]
if not re.fullmatch(r'campthink_capacity_20261015_[a-f0-9]{12}', schema):
    raise SystemExit('Invalid test identifier')
env = os.environ.copy()
env['MYSQL_PWD'] = configured.get('DB_PASSWORD', '')
creation = subprocess.run(['/usr/local/mysql/bin/mysql', '--host=127.0.0.1', f'--port={port}', f"--user={configured.get('DB_USERNAME', 'root')}", '--batch'],
    input=f'CREATE DATABASE `{schema}` CHARACTER SET utf8mb4;', text=True, env=env, capture_output=True, timeout=10)
if creation.returncode:
    raise SystemExit(f'Isolated schema creation rejected (exit {creation.returncode}); no alternative credentials attempted')
env.pop('MYSQL_PWD', None)
env.update({'RUN_TEACHING_CAPACITY_MYSQL': 'true', 'CAPACITY_TEST_MYSQL_SCHEMA': schema, 'CAPACITY_TEST_MYSQL_PORT': str(port),
    'CAPACITY_TEST_MYSQL_USER': configured.get('DB_USERNAME', 'root'), 'CAPACITY_TEST_MYSQL_PASSWORD': configured.get('DB_PASSWORD', '')})
result = subprocess.run(['python3', str(root / 'tools/bounded_command.py'), '100', 'mvn', '-q', '-Dtest=TeachingMysqlCapacityTest', 'test'],
    cwd=root / 'campus-ai-server', env=env, timeout=110)
receipt = root / '.local/runtime/capacity-mysql-receipt-2026-10-15.json'
receipt.write_text(json.dumps({'schema': schema, 'syntheticOnly': True, 'userDatabaseUnchanged': True, 'testExitCode': result.returncode,
    'retainedForInspection': True}, ensure_ascii=False, indent=2))
print('Synthetic test schema retained for inspection; configured school database was not used as the test target')
raise SystemExit(result.returncode)
