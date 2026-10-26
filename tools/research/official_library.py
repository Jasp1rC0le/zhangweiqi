#!/usr/bin/env python3
"""Build/search the offline evidence library; never connects to production or models.

Build: official_library.py build
Search: official_library.py search 电费 --as-of 2026-10-04
Admin import preview (no network): official_library.py export --school-id <real ID>
"""
import argparse
import hashlib
import json
import sqlite3
from datetime import date, datetime, time, timedelta
from pathlib import Path
from admissions_library import ADMISSIONS, admissions_records, load_admissions

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "docs/research"
REGISTER = DATA / "official-source-register-2026-10-04.json"
CARDS = DATA / "campus-knowledge-cards-2026-10-04.json"
DATABASE = DATA / "campus-official-library-2026-10-04.sqlite3"


def load_and_validate():
    register = json.loads(REGISTER.read_text(encoding="utf-8"))
    cards = json.loads(CARDS.read_text(encoding="utf-8"))
    sources = register["sources"]
    assert len({s["id"] for s in sources}) == len(sources), "duplicate source ID"
    assert len({s["url"] for s in sources}) == len(sources), "duplicate source URL"
    lookup = {s["id"]: s for s in sources}
    assert register["school"] == cards["school"]
    for s in sources:
        assert s["evidence"] in register["evidenceDefinitions"]
        assert s["status"] in register["statusDefinitions"]
        assert s["url"].startswith("https://")
        assert not s["publishedAt"] or date.fromisoformat(s["publishedAt"]) <= date.fromisoformat(s["checkedAt"])
    assert len({c["id"] for c in cards["cards"]}) == len(cards["cards"])
    for c in cards["cards"]:
        assert c["sourceIds"]
        assert date.fromisoformat(c["reviewAfter"]) >= date.fromisoformat(cards["checkedAt"])
        if c["validThrough"]:
            date.fromisoformat(c["validThrough"])
        for sid in c["sourceIds"]:
            s = lookup[sid]
            assert s["scope"] == "campus", "operations must never enter student answers"
            assert s["status"] in {"directory", "dated_reference"}, "historical or uncertain source"
            assert s["evidence"] in {"page_text", "index_only", "pdf_visual"}
    for item in cards["pendingQuestions"]:
        assert all(sid in lookup for sid in item["sourceIds"])
    return register, cards


def build():
    register, cards = load_and_validate()
    admissions = load_admissions()
    admission_rows = admissions_records(admissions)
    # Only replace this generated local artifact. No server database access.
    stage = DATABASE.with_suffix(".building.sqlite3")
    if stage.exists():
        raise FileExistsError(f"Unfinished build exists: {stage}")
    con = sqlite3.connect(stage)
    try:
        con.execute("PRAGMA foreign_keys=ON")
        con.executescript("""
        CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sources(id TEXT PRIMARY KEY, scope TEXT NOT NULL, category TEXT NOT NULL,
          title TEXT NOT NULL, url TEXT NOT NULL UNIQUE, published_at TEXT, checked_at TEXT NOT NULL,
          evidence TEXT NOT NULL, status TEXT NOT NULL, summary TEXT NOT NULL,
          limitation TEXT NOT NULL, original_json TEXT NOT NULL);
        CREATE TABLE knowledge_cards(id TEXT PRIMARY KEY, category TEXT NOT NULL, question TEXT NOT NULL,
          keywords TEXT NOT NULL, answer TEXT NOT NULL, boundary TEXT NOT NULL,
          review_after TEXT NOT NULL, valid_through TEXT, checked_at TEXT NOT NULL);
        CREATE TABLE card_sources(card_id TEXT REFERENCES knowledge_cards(id),
          source_id TEXT REFERENCES sources(id), PRIMARY KEY(card_id,source_id));
        CREATE TABLE pending_questions(question TEXT PRIMARY KEY, source_ids TEXT NOT NULL, reason TEXT NOT NULL);
        CREATE TABLE admissions_sources(id TEXT PRIMARY KEY, access TEXT NOT NULL, original_json TEXT NOT NULL);
        CREATE TABLE admissions_records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, admission_year INTEGER NOT NULL,
          region TEXT NOT NULL, exam_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
          source_id TEXT NOT NULL REFERENCES admissions_sources(id), access TEXT NOT NULL, received_at TEXT NOT NULL);
        CREATE TABLE admissions_issues(id TEXT PRIMARY KEY, status TEXT NOT NULL, original_json TEXT NOT NULL);
        CREATE VIRTUAL TABLE source_search USING fts5(id UNINDEXED, title, summary, limitation, tokenize='trigram');
        CREATE VIRTUAL TABLE card_search USING fts5(id UNINDEXED, question, keywords, answer, boundary, tokenize='trigram');
        CREATE VIEW campus_sources AS SELECT * FROM sources WHERE scope='campus';
        CREATE VIEW operations_sources AS SELECT * FROM sources WHERE scope='operations';
        """)
        for key, value in {"school":register["school"], "checked_at":register["checkedAt"],
                           "library_kind":"offline_research_not_production_rag",
                           "register_sha256":hashlib.sha256(REGISTER.read_bytes()).hexdigest(),
                           "cards_sha256":hashlib.sha256(CARDS.read_bytes()).hexdigest(),
                           "admissions_sha256":hashlib.sha256(ADMISSIONS.read_bytes()).hexdigest()}.items():
            con.execute("INSERT INTO metadata VALUES (?,?)", (key, value))
        for s in register["sources"]:
            con.execute("INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", (
                s["id"],s["scope"],s["category"],s["title"],s["url"],s["publishedAt"],s["checkedAt"],
                s["evidence"],s["status"],s["summary"],s["limitation"],json.dumps(s,ensure_ascii=False)))
            con.execute("INSERT INTO source_search VALUES (?,?,?,?)", (s["id"],s["title"],s["summary"],s["limitation"]))
        for c in cards["cards"]:
            words = " ".join(c["keywords"])
            con.execute("INSERT INTO knowledge_cards VALUES (?,?,?,?,?,?,?,?,?)", (
                c["id"],c["category"],c["question"],words,c["answer"],c["boundary"],c["reviewAfter"],
                c["validThrough"],cards["checkedAt"]))
            con.executemany("INSERT INTO card_sources VALUES (?,?)", [(c["id"],s) for s in c["sourceIds"]])
            con.execute("INSERT INTO card_search VALUES (?,?,?,?,?)", (c["id"],c["question"],words,c["answer"],c["boundary"]))
        for p in cards["pendingQuestions"]:
            con.execute("INSERT INTO pending_questions VALUES (?,?,?)", (p["question"],json.dumps(p["sourceIds"]),p["reason"]))
        for source in admissions['sources']:
            con.execute('INSERT INTO admissions_sources VALUES (?,?,?)',
                        (source['id'], source['access'], json.dumps(source, ensure_ascii=False)))
        con.executemany('INSERT INTO admissions_records VALUES (?,?,?,?,?,?,?,?,?,?)', admission_rows)
        for issue in admissions['issues']:
            con.execute('INSERT INTO admissions_issues VALUES (?,?,?)',
                        (issue['id'], issue['status'], json.dumps(issue, ensure_ascii=False)))
        assert con.execute("PRAGMA foreign_key_check").fetchall() == []
        assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        con.commit()
    finally:
        con.close()
    stage.replace(DATABASE)
    return {"database":str(DATABASE), "sources":len(register["sources"]), "cards":len(cards["cards"]),
            "pending":len(cards["pendingQuestions"]), "admissionsRecords":len(admission_rows),
            "admissionsIssues":len(admissions['issues']), "productionWritten":False}


def search(query, as_of, scope="campus", archive=False):
    if not query.strip():
        raise ValueError("query must not be blank")
    date.fromisoformat(as_of)
    con = sqlite3.connect(f"file:{DATABASE}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    try:
        # LIKE with escaped wildcards also handles two-character Chinese terms which trigram MATCH cannot.
        term = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        answer_rows = []
        if scope == "campus":
            answer_rows = con.execute(r"""SELECT * FROM knowledge_cards
              WHERE (question||' '||keywords||' '||answer) LIKE ? ESCAPE '\'
              AND checked_at<=? AND review_after>=? AND (valid_through IS NULL OR valid_through>=?)
              ORDER BY id""", (term,as_of,as_of,as_of)).fetchall()
        evidence_rows = con.execute(r"""SELECT id,title,url,scope,evidence,status,summary,limitation
          FROM sources WHERE scope=? AND (title||' '||summary||' '||limitation) LIKE ? ESCAPE '\'
          ORDER BY id""", (scope,term)).fetchall() if archive else []
        answers = []
        for row in answer_rows:
            item = dict(row)
            item["sources"] = [dict(s) for s in con.execute("""SELECT s.id,s.url FROM sources s
              JOIN card_sources cs ON s.id=cs.source_id WHERE cs.card_id=?""", (row["id"],))]
            answers.append(item)
        pending = con.execute(r"SELECT * FROM pending_questions WHERE question LIKE ? ESCAPE '\'", (term,)).fetchall() if scope == "campus" else []
        # User estimates and uploaded plans are archive-only, never silently promoted into public answers.
        admission_rows = con.execute(r"""SELECT r.*,s.original_json AS provenance FROM admissions_records r
          JOIN admissions_sources s ON s.id=r.source_id
          WHERE (r.title||' '||r.content) LIKE ? ESCAPE '\' AND r.received_at<=? ORDER BY r.id""",
          (term,as_of)).fetchall() if archive and scope == 'campus' else []
        return {"asOf":as_of, "scope":scope, "answerCards":answers,
                "pendingQuestions":[dict(p) for p in pending],
                "admissionsReference": [dict(r) for r in admission_rows],
                "referenceOnly": [dict(r) for r in evidence_rows],
                "notice":"原始资料检索结果含历史/待核验内容，不得直接作为确定答案" if archive else
                         "无结果时不猜测；可用 --archive 查研究线索"}
    finally:
        con.close()


def export(school_id, as_of):
    if school_id <= 0:
        raise ValueError("school ID must be a verified positive integer")
    today = date.fromisoformat(as_of)
    register, pack = load_and_validate()
    sources = {s["id"]:s for s in register["sources"]}
    by_source = {}
    for c in pack["cards"]:
        if today < date.fromisoformat(pack["checkedAt"]) or today > date.fromisoformat(c["reviewAfter"]):
            continue
        if c["validThrough"] and today > date.fromisoformat(c["validThrough"]):
            continue
        refs = [sources[s] for s in c["sourceIds"]]
        last_usable = min(date.fromisoformat(c["reviewAfter"]), date.fromisoformat(c["validThrough"] or c["reviewAfter"]))
        expiry = datetime.combine(last_usable+timedelta(days=1),time()).isoformat()
        content = f"问题：{c['question']}\n{c['answer']}\n适用边界：{c['boundary']}\n核验日期：{pack['checkedAt']}\n" \
                  f"复核日期：{c['reviewAfter']}（本站复核安排，非学校官方有效期）\n来源：" + \
                  "；".join(s["url"] for s in refs)
        # Backend rejects two published documents from one source URL. Merge cards from that page;
        # the earliest review/expiry wins so no merged section silently outlives its own limit.
        if refs[0]["url"] in by_source:
            existing = by_source[refs[0]["url"]]
            existing["content"] += "\n\n" + content
            existing["expiresAt"] = min(existing["expiresAt"],expiry)
            existing["title"] = refs[0]["title"] + "公开事实问答"
            continue
        by_source[refs[0]["url"]] = {"schoolId":school_id, "title":c["question"], "category":c["category"],
            "sourceDepartment":"天津中德应用技术大学公开官网", "sourceUrl":refs[0]["url"],
            "publishedAt":f"{refs[0]['publishedAt']}T00:00:00" if refs[0]["publishedAt"] else None,
            "expiresAt":expiry, "content":content}
    result = list(by_source.values())
    # Shape is accepted by the existing batch-import endpoint; caller must still authenticate as admin.
    if len(result) > 20:
        raise ValueError("split into batches of at most 20 before importing")
    return result


def export_admissions(school_id, as_of):
    """Explicit administrator-review preview; no inferred official URL or internal FAQ."""
    if school_id <= 0:
        raise ValueError('school ID must be a verified positive integer')
    pack = load_admissions()
    if date.fromisoformat(as_of) < date.fromisoformat(pack['receivedAt']):
        return []
    sources = {s['id']: s for s in pack['sources']}
    result = []
    for row in admissions_records(pack):
        record_id, kind, year, region, exam, title, content, source_id, access, received = row
        if source_id not in {'A03', 'A04'}:
            continue  # Official results use the separate verified public export.
        source = sources[source_id]
        provenance = source.get('filename', '用户本轮明确确认的咨询文字，未独立核验全部数字')
        result.append({'schoolId': school_id, 'title': f'{year}年{region}·{title}',
                       'category': '招生计划档案' if kind == 'uploaded_plan' else '招生历史咨询',
                       'sourceDepartment': '用户提供资料（需管理员审核）', 'sourceUrl': None,
                       'publishedAt': None, 'expiresAt': None,
                       'content': content + f'\n资料编号：{record_id}\n资料来源：{provenance}\n收录日期：{received}（不是发布日期）'
                       '\n仅供对应年份资料查询；不能作为当前招生通知或录取保证。不得称为已核实公众号原文。'})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("build")
    s = sub.add_parser("search")
    s.add_argument("query")
    s.add_argument("--as-of", default=date.today().isoformat())
    s.add_argument("--scope", choices=["campus","operations"], default="campus")
    s.add_argument("--archive", action="store_true")
    e = sub.add_parser("export")
    e.add_argument("--school-id", type=int, required=True)
    e.add_argument("--as-of", default=date.today().isoformat())
    a = sub.add_parser('export-admissions', help='招生历史资料管理员审阅预览，不发布')
    a.add_argument('--school-id', type=int, required=True)
    a.add_argument('--as-of', default=date.today().isoformat())
    args = parser.parse_args()
    if args.command == "build":
        result = build()
    elif args.command == "search":
        result = search(args.query,args.as_of,args.scope,args.archive)
    elif args.command == 'export-admissions':
        result = export_admissions(args.school_id, args.as_of)
    else:
        result = export(args.school_id,args.as_of)
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
