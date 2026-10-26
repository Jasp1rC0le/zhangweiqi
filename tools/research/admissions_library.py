"""Typed admissions archive. Internal originals never enter public knowledge exports."""
import json
from datetime import date, datetime
from pathlib import Path

ADMISSIONS = Path(__file__).resolve().parents[2] / 'docs/research/admissions-2026.json'


def load_admissions():
    pack = json.loads(ADMISSIONS.read_text(encoding='utf-8'))
    validate_admissions(pack)
    return pack


def validate_admissions(pack):
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    received = date.fromisoformat(pack['receivedAt'])
    sources = {s['id']: s for s in pack['sources']}
    require(len(sources) == len(pack['sources']), 'duplicate admissions source')
    general = pack['generalGaokao']
    require(general['sourceId'] in sources, 'missing consultation source')
    require(general['kind'] == 'consultation_estimate', 'consultation is not an admission result')
    require(general['year'] == pack['admissionYear'], 'wrong consultation year')
    require(general['region'] == pack['region'], 'wrong consultation region')
    require(len({g['id'] for g in general['groups']}) == len(general['groups']), 'duplicate group')
    for group in general['groups']:
        require(group['scoreBasis'] and group['advice'], 'missing score basis or advice')
        require(group['hopeAbove'] is None or group['hopeAbove'] >= group['tryAbove'], 'invalid thresholds')
    classified = pack['classifiedAdmissions']
    require(classified['sourceId'] in sources, 'missing plan source')
    require(classified['examType'] == '高职分类考试', 'mixed exam types')
    require(classified['audience'] == '面向中职毕业生', 'missing candidate scope')
    require(classified['year'] == pack['admissionYear'] and classified['region'] == pack['region'], 'wrong plan scope')
    plans = {p['code']: p for p in classified['plans']}
    require(len(plans) == len(classified['plans']), 'duplicate plan code')
    for p in plans.values():
        require(p['seats'] > 0 and p['tuitionCnyPerYear'] > 0 and p['years'] > 0, 'invalid plan units')
        require(p['pages'] and all(1 <= n <= sources[classified['sourceId']]['pageCount'] for n in p['pages']), 'invalid plan page')
    require(sum(p['seats'] for p in plans.values()) == classified['totalSeats'], 'plan total mismatch')
    for level, key in [('本科', 'bachelorSeats'), ('高职', 'vocationalSeats')]:
        require(sum(p['seats'] for p in plans.values() if p['level'] == level) == classified[key], 'level total mismatch')
    results = classified['officialResults']
    require(len({(r['year'], r['programCode']) for r in results}) == len(results), 'duplicate result')
    for r in results:
        require(r['programCode'] in plans, 'unknown program')
        source = sources[r['sourceId']]
        require(source['access'] == 'public' and source['status'] == 'verified', 'unverified public result')
        require(date.fromisoformat(source['publishedAt']).year == r['year'], 'wrong result year')
        require(r['min'] <= r.get('average', r['min']) <= r['max'], 'invalid result range')
    for event in pack['events']:
        require(event['sourceId'] in sources, 'missing event source')
        end = date.fromisoformat(event['date']) if 'date' in event else datetime.fromisoformat(event['end']).date()
        if 'start' in event:
            require(datetime.fromisoformat(event['start']) <= datetime.fromisoformat(event['end']), 'reversed window')
        if event['statusAtIngestion'] == 'ended':
            require(end < received, 'future event marked ended')
    for issue in pack['issues']:
        require(all(s in sources for s in issue['sourceIds']), 'missing issue source')


def admissions_records(pack):
    """Every record carries year, exam and evidence type, including archived estimates."""
    rows = []
    sources = {s['id']: s for s in pack['sources']}

    def add(record_id, kind, year, exam, title, data, source_id, boundary):
        source = sources[source_id]
        content = f'{year}年 · {pack["region"]} · {exam} · {kind}\n{title}\n{boundary}\n' + json.dumps(data, ensure_ascii=False)
        rows.append((record_id, kind, year, pack['region'], exam, title, content, source_id,
                     source['access'], pack['receivedAt']))

    general = pack['generalGaokao']
    for group in general['groups']:
        # Preserve the superseded wording in the canonical audit file, not in retrieval context.
        corrected = {key: value for key, value in group.items() if key != 'expansionStatementRaw'}
        add('G-' + group['id'], 'consultation_estimate', general['year'], '普通高考',
            group['name'] + '历史咨询建议', corrected, general['sourceId'], general['disclaimer'])
    add('G-batch', 'user_reported_batch_line', general['year'], '普通高考', '本科批次线（用户提供）',
        {'batchLineReported': general['batchLineReported']}, general['sourceId'], general['batchLineNote'])
    for event in pack['events']:
        add('E-' + event['id'], 'ended_event', pack['admissionYear'], '普通高考', event['name'],
            event, event['sourceId'], '历史事件，已结束，不表示当前仍可办理；' + event['note'])
    classified = pack['classifiedAdmissions']
    plans = {p['code']: p for p in classified['plans']}
    exam = classified['examType'] + '（' + classified['audience'] + '）'
    for p in plans.values():
        add('P-' + p['code'], 'uploaded_plan', classified['year'], exam,
            p['name'] + ' · ' + p['category'] + '招生计划', p, classified['sourceId'], classified['boundary'])
    for r in classified['officialResults']:
        p = plans[r['programCode']]
        add(f'R-{r["year"]}-{r["programCode"]}', 'official_result', r['year'], exam,
            p['name'] + ' · ' + p['category'] + '实际录取分数', r, r['sourceId'],
            '公开官网实际结果；只适用该年天津分类考试，不是普通高考分数或未来录取保证')
    return rows
