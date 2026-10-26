"""Normal HTTP/JWT acceptance with generated synthetic accounts on the approved test DB only."""
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

BASE = Path('/home/ubuntu/campthink-acceptance-20261017')
ROOT = 'http://127.0.0.1:18080'
RUN = 'v2'


def smoke():
    os.umask(0o077)
    manifest = json.loads((BASE / 'manifest.json').read_text())
    schema = manifest['schema']
    assert re.fullmatch(r'campthink_accept_20261017_[a-f0-9]{12}', schema)
    marker = BASE / ('smoke-' + RUN + '-started.json')
    with marker.open('x') as file:
        json.dump({'started': int(time.time()), 'schema': schema}, file)
    results, accounts, tokens = [], {}, {}

    def check(label, passed):
        results.append({'check': label, 'passed': bool(passed)})
        (BASE / ('smoke-' + RUN + '-results.json')).write_text(json.dumps(results, indent=2))
        print(('PASS ' if passed else 'FAIL ') + label, flush=True)
        if not passed:
            raise RuntimeError('Synthetic acceptance failed: ' + label)

    def sql(statement):
        result = subprocess.run(['sudo', '-n', 'mysql', '--connect-timeout=5', '--batch', '--raw', '--skip-column-names', schema], input=statement, text=True, capture_output=True, timeout=10)
        if result.returncode:
            raise RuntimeError('Synthetic fixture SQL failed; no alternate credential attempted')
        return result.stdout.strip()

    def call(actor, method, path, body=None, expected=200, origin=ROOT):
        headers = {'Origin': origin}
        if actor:
            headers['Authorization'] = 'Bearer ' + tokens[actor]
        data = None if body is None else json.dumps(body).encode()
        if data is not None:
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(ROOT + path, data=data, headers=headers, method=method)
        try:
            response = urllib.request.urlopen(request, timeout=10)
        except urllib.error.HTTPError as failure:
            response = failure
        raw = response.read()
        # Credentials/session tokens stay in this process and are never printed or saved.
        check(method + ' ' + path.split('?')[0] + ' status ' + str(expected), response.code == expected)
        if path.startswith('/api/teaching') or path.startswith('/api/admin/teaching'):
            check('private no-store', response.headers.get('Cache-Control') == 'no-store')
        return json.loads(raw) if raw and response.headers.get_content_type() == 'application/json' else raw

    check('isolated header', urllib.request.urlopen(ROOT, timeout=5).headers.get('X-Campthink-Environment') == 'isolated-synthetic-acceptance')
    check('new ready', call(None, 'GET', '/api/health/ready')['status'] == 'READY')
    call(None, 'GET', '/api/teaching/access', expected=401)
    call(None, 'OPTIONS', '/api/teaching/access', expected=403, origin='https://untrusted.example')
    roles = {'admin': 'STUDENT', 'teacher': 'TEACHER', 'otherteacher': 'TEACHER', 'counselor': 'COUNSELOR', 'secretary': 'SECRETARY', 'studentA': 'STUDENT', 'studentB': 'STUDENT', 'studentC': 'STUDENT', 'external': 'STUDENT'}
    password = secrets.token_urlsafe(24)
    for name, role in roles.items():
        user = call(None, 'POST', '/api/users', {'username': 'accept17-' + RUN + '-' + name, 'password': password,
            'nickname': '合成验收-' + name, 'schoolId': 2 if name == 'external' else 1,
            'teachingIdentity': role, 'privacyAccepted': True, 'policyVersion': '2026-10-04'}, expected=201)
        accounts[name] = {'id': user['id'], 'username': user['username']}
        check('registration does not grant platform role', user['role'] == 'STUDENT')
    # This is the single test-fixture platform administrator, in this generated DB only.
    admin_id = int(accounts['admin']['id'])
    sql("UPDATE users SET role='ADMIN' WHERE id=" + str(admin_id) + " AND username='accept17-" + RUN + "-admin';")
    for name, account in accounts.items():
        session = call(None, 'POST', '/api/auth/login', {'username': account['username'], 'password': password})
        tokens[name] = session['token']
    call('teacher', 'GET', '/api/teaching/lessons/page?view=TEACHER&from=2026-10-12&to=2026-10-18', expected=403)
    for name in ('teacher', 'otherteacher', 'counselor', 'secretary'):
        item = call(name, 'GET', '/api/account/teaching-identities')['items'][0]
        check('staff requires approval', item['status'] == 'PENDING')
        approved = call('admin', 'POST', '/api/admin/teaching-identities/' + item['id'] + '/review', {'revision': item['revision'], 'decision': 'APPROVE', 'reason': '隔离模拟验收'})
        check('normal admin review', approved['status'] == 'APPROVED')
    classes = []
    for college, names in [('模拟学院甲-' + RUN, ['studentA', 'studentB']), ('模拟学院乙-' + RUN, ['studentC'])]:
        class_id = str(uuid.uuid4())
        call('admin', 'POST', '/api/admin/teaching/classes', {'id': class_id, 'college': college, 'name': '模拟班-' + college,
            'members': [{'studentNumber': 'SIM17-' + RUN + '-' + n, 'name': '模拟同学-' + n, 'userId': accounts[n]['id']} for n in names]})
        classes.append(class_id)
    call('admin', 'POST', '/api/admin/teaching/grants', {'userId': accounts['counselor']['id'], 'viewRole': 'COUNSELOR', 'scopeKey': classes[0]})
    call('admin', 'POST', '/api/admin/teaching/grants', {'userId': accounts['secretary']['id'], 'viewRole': 'SECRETARY', 'scopeKey': '模拟学院甲-' + RUN})
    today = datetime.now(ZoneInfo('Asia/Shanghai')).date()
    monday = today - timedelta(days=today.weekday())
    dates = '?from=' + monday.isoformat() + '&to=' + (monday + timedelta(days=6)).isoformat()
    for index, cls in enumerate(classes):
        call('admin', 'POST', '/api/admin/teaching/courses', {'id': str(uuid.uuid4()), 'classId': cls,
            'teacherId': accounts['teacher']['id'], 'name': '模拟验收课程' + str(index), 'semester': '隔离模拟学期',
            'firstMonday': monday.isoformat(), 'weekday': today.isoweekday(), 'startTime': '08:30' if index == 0 else '10:20',
            'endTime': '09:15' if index == 0 else '11:05', 'weeks': [1], 'room': '模拟教室' + str(index)})
    teacher = call('teacher', 'GET', '/api/teaching/lessons/page' + dates + '&view=TEACHER&size=1')
    check('teacher complete total under pagination', teacher['total'] == 2 and len(teacher['items']) == 1 and teacher['totalPages'] == 2)
    student = call('studentA', 'GET', '/api/teaching/lessons/page' + dates + '&view=STUDENT')
    check('student sees own one course', student['total'] == 1)
    lesson = student['items'][0]['id']
    leader = call('secretary', 'GET', '/api/teaching/lessons/page' + dates + '&view=SECRETARY')
    counselor = call('counselor', 'GET', '/api/teaching/lessons/page' + dates + '&view=COUNSELOR')
    check('college and counselor member scopes', leader['total'] == counselor['total'] == 1 and leader['summary']['counts']['unknown'] == 2)
    call('studentA', 'GET', '/api/admin/teaching/capabilities', expected=403)
    call('studentC', 'GET', '/api/teaching/lessons/' + lesson + '/page?view=STUDENT', expected=404)
    # Approved identity alone gives no teacher view without an assigned course.
    call('otherteacher', 'GET', '/api/teaching/lessons/' + lesson + '/page?view=TEACHER', expected=403)
    call('external', 'GET', '/api/teaching/lessons/' + lesson + '/page?view=STUDENT', expected=403)
    detail = call('teacher', 'GET', '/api/teaching/lessons/' + lesson + '/page?view=TEACHER&size=1')
    check('roster page total', detail['total'] == 2 and len(detail['detail']['entries']) == 1)
    target = detail['detail']['entries'][0]['studentId']
    mark = {'revision': 0, 'marks': [{'studentId': target, 'status': 'ABSENT'}], 'reason': '', 'finish': False}
    path = '/api/teaching/lessons/' + lesson + '/attendance/page?size=1'
    marked = call('teacher', 'PUT', path, mark)
    check('real attendance write', marked['detail']['lesson']['revision'] == 1 and marked['detail']['entries'][0]['status'] == 'ABSENT')
    call('teacher', 'PUT', path, mark, expected=409)
    mark.update({'revision': 1, 'marks': [{'studentId': target, 'status': 'ON_TIME'}]})
    call('teacher', 'PUT', path, mark, expected=400)
    mark['reason'] = '隔离模拟更正，保留旧记录'
    call('teacher', 'PUT', path, mark)
    audit = call('teacher', 'GET', '/api/teaching/lessons/' + lesson + '/audit?view=TEACHER')
    check('old and corrected attendance preserved', audit['total'] == 2)
    check('database audit effects', sql("SELECT COUNT(*) FROM teaching_attendance_audit WHERE lesson_id='" + lesson + "';") == '2')
    call('teacher', 'POST', '/api/auth/logout', expected=204)
    call('teacher', 'GET', '/api/teaching/access', expected=401)
    env = dict(line.split('=', 1) for line in (BASE / 'acceptance.env').read_text().splitlines())
    process_env = dict(os.environ, MYSQL_PWD=env['DB_PASSWORD'])
    denied = subprocess.run(['mysql', '--host=127.0.0.1', '--user=' + env['DB_USERNAME'], '--connect-timeout=3', '--batch', '-e', 'SELECT COUNT(*) FROM campus_ai.users;'], env=process_env, text=True, capture_output=True, timeout=5)
    check('acceptance DB principal cannot read production users', denied.returncode != 0 and ('denied' in denied.stderr.lower()))
    with urllib.request.urlopen('http://127.0.0.1:8080/api/health/ready', timeout=5) as old:
        check('old service remains READY', json.load(old)['status'] == 'READY')
    for key in tokens:
        tokens[key] = ''
    check('no public activation', manifest['publicRouteAdded'] is False)
    print('SYNTHETIC_HTTP_ACCEPTANCE_PASSED checks=' + str(len(results)) + '; production data not used', flush=True)


if __name__ == '__main__':
    smoke()
