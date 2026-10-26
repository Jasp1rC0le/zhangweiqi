"""Opt-in native quota correctness, fresh task-owned loopback schema only."""
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
    raise SystemExit('Not the configured loopback environment; no database created')
port = int(configured.get('DB_PORT', '3306'))
if not 1024 <= port <= 65535:
    raise SystemExit('Invalid loopback port')
schema = 'campthink_material_quota_20261020_' + uuid.uuid4().hex[:12]
assert re.fullmatch(r'campthink_material_quota_20261020_[a-f0-9]{12}', schema)
environment = os.environ.copy()
environment['MYSQL_PWD'] = configured.get('DB_PASSWORD', '')
result = subprocess.run(
    ['/usr/local/mysql/bin/mysql', '--host=127.0.0.1', f'--port={port}', f"--user={configured.get('DB_USERNAME', 'root')}", '--batch'],
    input=f'CREATE DATABASE `{schema}` CHARACTER SET utf8mb4;', text=True, env=environment, capture_output=True, timeout=10)
if result.returncode:
    raise SystemExit(f'Synthetic schema creation denied (exit {result.returncode}); no alternate credentials tried')
environment.pop('MYSQL_PWD', None)
environment.update({
    'RUN_PRIVATE_MATERIAL_QUOTA_MYSQL': 'true', 'PRIVATE_MATERIAL_QUOTA_MYSQL_SCHEMA': schema,
    'PRIVATE_MATERIAL_QUOTA_MYSQL_PORT': str(port),
    'PRIVATE_MATERIAL_QUOTA_MYSQL_USER': configured.get('DB_USERNAME', 'root'),
    'PRIVATE_MATERIAL_QUOTA_MYSQL_PASSWORD': configured.get('DB_PASSWORD', ''),
})
print(f'Synthetic schema {schema}; retained for review, never the school schema', flush=True)
result = subprocess.run(
    ['python3', str(root / 'tools/bounded_command.py'), '80', 'mvn', '-q', '-Dtest=PrivateMaterialMysqlQuotaTest', 'test'],
    cwd=root / 'campus-ai-server', env=environment, timeout=90)
raise SystemExit(result.returncode)
