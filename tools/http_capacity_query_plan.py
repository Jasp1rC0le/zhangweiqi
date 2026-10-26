"""Read-only comparison of two authorized-count query shapes in a task-owned schema."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
schema = sys.argv[1]
if not re.fullmatch(r'campthink_http_20261017_[a-f0-9]{12}', schema):
    raise SystemExit('Only the explicitly named synthetic HTTP schema is allowed')
configuration = next(c for c in ET.parse(root / '.idea/workspace.xml').findall('.//configuration') if c.get('name') == 'CampusAiApplication')
configured = {e.get('name'): e.get('value') for e in configuration.findall('.//env')}
if configured.get('DB_HOST', '127.0.0.1') not in ('127.0.0.1', 'localhost'):
    raise SystemExit('Not loopback; no query executed')
port = int(configured.get('DB_PORT', '3306'))
if not 1024 <= port <= 65535:
    raise SystemExit('Invalid local port')
environment = os.environ.copy()
environment['MYSQL_PWD'] = configured.get('DB_PASSWORD', '')
command = ['/usr/local/mysql/bin/mysql', '--host=127.0.0.1', f'--port={port}', f"--user={configured.get('DB_USERNAME', 'root')}", f'--database={schema}', '--batch', '--raw', '--skip-column-names']
base = " FROM teaching_attendance a JOIN teaching_lessons l ON l.id=a.lesson_id JOIN teaching_courses c ON c.id=l.course_id JOIN teaching_classes b ON b.id=l.class_id LEFT JOIN users u ON u.id=c.teacher_id AND u.school_id=l.school_id WHERE l.school_id=1 AND l.starts_at>='2026-10-12 00:00:00' AND l.starts_at<'2026-10-19 00:00:00'"
row_scope = "EXISTS(SELECT 1 FROM teaching_attendance_scopes r WHERE r.lesson_id=a.lesson_id AND r.student_id=a.student_id AND r.school_id=1 AND r.withdrawn=FALSE AND EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=r.school_id AND g.user_id=2 AND g.view_role='SECRETARY' AND g.scope_key=r.college))"
lesson_scope = "EXISTS(SELECT 1 FROM teaching_attendance a WHERE a.lesson_id=l.id AND " + row_scope + ")"
queries = {}
for name, where in [('nested', ' AND ' + lesson_scope), ('member_scope_once', '')]:
    queries[name] = "SELECT /*+ MAX_EXECUTION_TIME(3000) */ a.status,COUNT(*) AS total" + base + where + " AND l.cancelled=FALSE AND " + row_scope + " GROUP BY a.status"
overlap_from = " FROM teaching_attendance_scopes shared_member JOIN teaching_attendance_scopes other_member ON other_member.student_id=shared_member.student_id AND other_member.school_id=shared_member.school_id AND other_member.withdrawn=FALSE JOIN teaching_lessons l ON l.id=shared_member.lesson_id AND l.school_id=shared_member.school_id JOIN teaching_lessons other ON other.id=other_member.lesson_id AND other.school_id=other_member.school_id"
overlap_where = " WHERE l.school_id=1 AND l.starts_at>='2026-10-12 00:00:00' AND l.starts_at<'2026-10-19 00:00:00' AND l.cancelled=FALSE AND other.id<>l.id AND other.cancelled=FALSE AND other.starts_at<l.ends_at AND other.ends_at>l.starts_at AND shared_member.school_id=1 AND shared_member.withdrawn=FALSE AND EXISTS(SELECT 1 FROM teaching_grants g WHERE g.school_id=shared_member.school_id AND g.user_id=2 AND g.view_role='SECRETARY' AND g.scope_key=shared_member.college)"
queries['overlap_member_join'] = "SELECT /*+ MAX_EXECUTION_TIME(3000) */ COUNT(DISTINCT l.id)" + overlap_from + overlap_where
queries['overlap_student_join_order'] = "SELECT /*+ MAX_EXECUTION_TIME(3000) JOIN_ORDER(shared_member,other_member,l,other) */ COUNT(DISTINCT l.id)" + overlap_from + overlap_where
results = {}
for name, query in queries.items():
    plan = subprocess.run(command, input='EXPLAIN FORMAT=TREE ' + query + ';', text=True, env=environment, capture_output=True, timeout=8)
    began = time.monotonic()
    read = subprocess.run(command, input=query + ';', text=True, env=environment, capture_output=True, timeout=8)
    results[name] = {'planExitCode': plan.returncode, 'plan': plan.stdout, 'exitCode': read.returncode, 'elapsedMillis': round((time.monotonic() - began) * 1000), 'aggregateRows': read.stdout, 'errorCodeOnly': re.search(r'ERROR (\d+)', read.stderr).group(1) if re.search(r'ERROR (\d+)', read.stderr) else None}
print(json.dumps({'schema': schema, 'readOnly': True, 'syntheticOnly': True, 'queries': results}, ensure_ascii=False))
