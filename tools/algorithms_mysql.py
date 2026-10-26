"""Verify algorithms against a fresh loopback-only synthetic MySQL schema, never the school schema."""
import os
from pathlib import Path
import re
import subprocess
import uuid
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
config = next(c for c in ET.parse(root / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
configured = {e.get('name'): e.get('value') for e in config.findall('.//env')}
if configured.get('DB_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost'):
    raise SystemExit('Non-loopback configured DB; no schema created')
port = int(configured.get('DB_PORT', '3306'))
if not 1024 <= port <= 65535:
    raise SystemExit('Invalid port; no schema created')
schema = 'campthink_algorithms_20261016_' + uuid.uuid4().hex[:12]
if not re.fullmatch(r'campthink_algorithms_20261016_[a-f0-9]{12}', schema):
    raise SystemExit('Invalid test schema identifier')
env = os.environ.copy()
env['MYSQL_PWD'] = configured.get('DB_PASSWORD', '')
creation = subprocess.run(['/usr/local/mysql/bin/mysql', '--host=127.0.0.1', f'--port={port}', f"--user={configured.get('DB_USERNAME', 'root')}", '--batch'], input=f'CREATE DATABASE `{schema}` CHARACTER SET utf8mb4;', text=True, env=env, capture_output=True, timeout=10)
if creation.returncode:
    raise SystemExit(f'Isolated schema creation denied (exit {creation.returncode}); no alternative credentials attempted')
env.pop('MYSQL_PWD', None)
env.update({'RUN_TEACHING_ALGORITHMS_MYSQL': 'true', 'ALGORITHM_TEST_MYSQL_SCHEMA': schema, 'ALGORITHM_TEST_MYSQL_PORT': str(port), 'ALGORITHM_TEST_MYSQL_USER': configured.get('DB_USERNAME', 'root'), 'ALGORITHM_TEST_MYSQL_PASSWORD': configured.get('DB_PASSWORD', '')})
print(f'Synthetic schema: {schema}; retained for inspection; school schema is not a test target', flush=True)
result = subprocess.run(['python3', str(root / 'tools/bounded_command.py'), '100', 'mvn', '-q', '-Dtest=TeachingMysqlAlgorithmsTest', 'test'], cwd=root / 'campus-ai-server', env=env, timeout=110)
raise SystemExit(result.returncode)
