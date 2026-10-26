"""Start only an isolated local runtime from a hashed jar, without echoing secrets."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import xml.etree.ElementTree as ET
from private_smtp import apply_to_environment
from runtime_artifact import stage_runtime_artifact

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8081)
parser.add_argument('--skip-migration', action='store_true', help='Reuse the existing local schema for a runtime-only restart')
parser.add_argument('--smtp-config', type=Path, help='Explicit owner-only private SMTP file; incomplete configuration refuses startup')
parser.add_argument('--jar', type=Path, help='Explicit local candidate JAR; requires its full --expected-sha256')
parser.add_argument('--expected-sha256', help='Expected full SHA-256 of the chosen JAR')
options = parser.parse_args()
if not 1024 <= options.port <= 65535:
    raise SystemExit('Use an unprivileged local port between 1024 and 65535')
if options.jar and not options.expected_sha256:
    raise SystemExit('An explicit candidate JAR requires its full --expected-sha256')

root = Path(__file__).resolve().parents[1]
runtime = root / '.local/runtime'
jar = options.jar or root / 'campus-ai-server/target/campus-ai-server-0.0.1-SNAPSHOT.jar'
try:
    immutable, full_digest = stage_runtime_artifact(jar, runtime, options.expected_sha256)
except (OSError, ValueError) as failure:
    raise SystemExit(f'Runtime artifact refused: {failure}') from None
digest = full_digest[:16]
env = os.environ.copy()
configuration = next(c for c in ET.parse(root / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
env.update({item.get('name'): item.get('value') for item in configuration.findall('.//env')})
if options.smtp_config:
    apply_to_environment(env, options.smtp_config)
if env.get('DB_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost') or env.get('DB_NAME', 'campus_ai') != 'campus_ai':
    raise SystemExit('Not the known local database; no migration applied')
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', options.port)) == 0: raise SystemExit(f'{options.port} already in use; no process stopped')
if not options.skip_migration:
    db_env = env.copy(); db_env['MYSQL_PWD'] = env.get('DB_PASSWORD', '')
    sql = (root / 'deploy/migrations/2026-10-11-private-timetables.sql').read_text()
    result = subprocess.run(['/usr/local/mysql/bin/mysql','--host=127.0.0.1',f"--port={env.get('DB_PORT','3306')}",f"--user={env.get('DB_USERNAME','root')}",'campus_ai'], input=sql, text=True, env=db_env, capture_output=True, timeout=20)
    if result.returncode: raise SystemExit('Local additive migration failed; no runtime started')
# Exact origins for this loopback-only development process, not production CORS defaults.
env.update({'SERVER_PORT':str(options.port),'SERVER_ADDRESS':'127.0.0.1',
            'CORS_ALLOWED_ORIGINS':'http://localhost:5173,http://127.0.0.1:5173','SPRING_SQL_INIT_MODE':'never',
            'KNOWLEDGE_SEED_OFFICIAL_SCHOOL':'false','CAREER_SEED_OFFICIAL_CANDIDATES':'false','APP_JOBS_ENABLED':'false',
            'APP_TEACHING_ENABLED':'false','APP_TEACHING_IDENTITY_ENABLED':'false','APP_TEACHING_ROSTER_ENABLED':'false','APP_TEACHING_LIFECYCLE_ENABLED':'false',
            'APP_TEACHING_RESPONSIBILITY_ENABLED':'false','APP_TEACHING_LESSON_CHANGE_ENABLED':'false'})  # Never enables formal teaching or lifecycle writes.
with (runtime / f'timetable-server-{digest}-{options.port}.log').open('ab') as log:
    process = subprocess.Popen(['java','-jar',str(immutable)],cwd=root / 'campus-ai-server',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
print(f'Local timetable runtime pid={process.pid}, port={options.port}, jarSha256={full_digest}; migration={"skipped" if options.skip_migration else "CREATE TABLE IF NOT EXISTS only"}')
