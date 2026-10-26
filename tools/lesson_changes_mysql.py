"""Opt-in loopback synthetic lesson-change rehearsal; never target the school schema."""
import os
from pathlib import Path
import re
import subprocess
import uuid
import xml.etree.ElementTree as ET

root=Path(__file__).resolve().parents[1]
configuration=next(c for c in ET.parse(root/'.idea/workspace.xml').findall('.//configuration') if c.get('name')=='CampusAiApplication')
configured={e.get('name'):e.get('value') for e in configuration.findall('.//env')}
if configured.get('DB_HOST','127.0.0.1') not in ('127.0.0.1','localhost'):
    raise SystemExit('Not the existing loopback configuration; no database created')
port=int(configured.get('DB_PORT','3306'))
if not 1024<=port<=65535:
    raise SystemExit('Invalid loopback port')
schema='campthink_lesson_20261018_'+uuid.uuid4().hex[:12]
assert re.fullmatch(r'campthink_lesson_20261018_[a-f0-9]{12}',schema)
environment=os.environ.copy();environment['MYSQL_PWD']=configured.get('DB_PASSWORD','')
result=subprocess.run(['/usr/local/mysql/bin/mysql','--host=127.0.0.1',f'--port={port}',f"--user={configured.get('DB_USERNAME','root')}",'--batch'],input=f'CREATE DATABASE `{schema}` CHARACTER SET utf8mb4;',text=True,env=environment,capture_output=True,timeout=10)
if result.returncode:
    raise SystemExit(f'Synthetic database creation denied (exit {result.returncode}); no alternate credentials attempted')
environment.pop('MYSQL_PWD',None)
environment.update({'RUN_LESSON_CHANGE_MYSQL':'true','LESSON_TEST_MYSQL_SCHEMA':schema,'LESSON_TEST_MYSQL_PORT':str(port),'LESSON_TEST_MYSQL_USER':configured.get('DB_USERNAME','root'),'LESSON_TEST_MYSQL_PASSWORD':configured.get('DB_PASSWORD','')})
print(f'Synthetic schema {schema}; retained for review, never the school schema',flush=True)
result=subprocess.run(['python3',str(root/'tools/bounded_command.py'),'110','mvn','-q','-Dtest=TeachingMysqlLessonChangeTest','test'],cwd=root/'campus-ai-server',env=environment,timeout=120)
raise SystemExit(result.returncode)
