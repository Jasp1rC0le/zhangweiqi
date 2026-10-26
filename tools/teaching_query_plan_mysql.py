"""Read-only JDBC diagnosis in an already created task-owned HTTP schema."""
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
schema = sys.argv[1]
if not re.fullmatch(r'campthink_http_20261017_[a-f0-9]{12}', schema):
    raise SystemExit('An explicit synthetic HTTP schema is required')
configuration = next(c for c in ET.parse(root / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
configured = {e.get('name'): e.get('value') for e in configuration.findall('.//env')}
if configured.get('DB_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost'):
    raise SystemExit('Not loopback; no query executed')
port = int(configured.get('DB_PORT', '3306'))
if not 1024 <= port <= 65535:
    raise SystemExit('Invalid local port')
environment = os.environ.copy()
environment.update({'RUN_TEACHING_QUERY_PLAN_MYSQL': 'true', 'HTTP_TEST_MYSQL_SCHEMA': schema, 'HTTP_TEST_MYSQL_PORT': str(port), 'HTTP_TEST_MYSQL_USER': configured.get('DB_USERNAME', 'root'), 'HTTP_TEST_MYSQL_PASSWORD': configured.get('DB_PASSWORD', '')})
result = subprocess.run(['python3', str(root / 'tools/bounded_command.py'), '65', 'mvn', '-q', '-Dtest=TeachingMysqlQueryPlanTest', 'test'], cwd=root / 'campus-ai-server', env=environment, timeout=75)
raise SystemExit(result.returncode)
