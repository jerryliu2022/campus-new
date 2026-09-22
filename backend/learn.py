"""
学习中心后端（/api/learn/*）—— 仅供教学演示，与正式链路隔离
- 独立测试库 data/learn_test.db：表结构与正式 campus.db 完全一致，另物化 rag_students / rag_schedule 便于 SQL 练习
- SQL 控制台：只允许单条 SELECT / INSERT / UPDATE（拒绝 DROP/DELETE/ALTER/ATTACH/PRAGMA）
- 后端代码解释器：从用户代码中提取 db.execute(...) / db_rows(...) 的 SQL 并在测试库顺序执行（教学用安全解释器，不执行任意 Python）
- 全链路演示：返回 SQL + 结果 + 耗时，供前端展示"前端→后端→数据库→前端"的完整链路
- 源码摘录：按白名单读取项目源文件片段，供学习者对照
"""
from __future__ import annotations

import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAG_DATA = DATA / "rag"
TEST_DB = DATA / "learn_test.db"
SOURCE_DB = DATA / "campus.db"

# room_code → 语义名（含真实楼号，如 "B12_CR_F2_113" → "13#学生宿舍·2层113室"）。
# 界面展示一律用真实楼号；内部 B 码只作为主键存在。
def _load_room_names() -> dict:
    try:
        records = json.loads((DATA / "room_anchors.json").read_text(encoding="utf-8"))
        return {r["room_code"]: r["semantic_name"] for r in records.get("rooms", [])}
    except Exception:
        return {}

ROOM_NAMES = _load_room_names()

router = APIRouter(prefix="/api/learn")

# 源码摘录白名单（只读）
SOURCE_WHITELIST = {
    "src/main.jsx", "src/RagPage.jsx", "src/App.jsx", "src/LoginScreen.jsx", "src/WalkController.jsx",
    "backend/main.py", "backend/rag.py", "backend/learn.py",
    "scripts/generate_rag_data.py", "scripts/generate_road_graph.mjs",
    "blender/generate_campus.py", "vite.config.js", "index.html", "README.md",
}

SCHEMA_SQL = [
    "CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, class_name TEXT)",
    "CREATE TABLE IF NOT EXISTS schedule (id INTEGER PRIMARY KEY AUTOINCREMENT, class_name TEXT, course TEXT, teacher TEXT, weekday INTEGER, period INTEGER, location TEXT, weeks TEXT, grade TEXT, major TEXT, course_type TEXT)",
    "CREATE TABLE IF NOT EXISTS dorm_members (name TEXT, class_name TEXT, grade TEXT, building_code TEXT, floor INTEGER, room_number INTEGER, phone TEXT, home_phone TEXT)",
    "CREATE TABLE IF NOT EXISTS room_anchor_overrides (room_code TEXT PRIMARY KEY, semantic_name TEXT NOT NULL, building_code TEXT NOT NULL, anchor_world TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS notices (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL)",
    # 教学用：把项目里以 JSON 存放的 RAG 数据物化为表，便于 SQL 练习（结构对齐 JSON 字段）
    "CREATE TABLE IF NOT EXISTS rag_students (student_id TEXT PRIMARY KEY, name TEXT, gender TEXT, class_name TEXT, counselor TEXT, dorm_room_code TEXT, bed INTEGER, phone TEXT, home_phone TEXT, hometown TEXT)",
    "CREATE TABLE IF NOT EXISTS rag_schedule (id TEXT PRIMARY KEY, class_name TEXT, course TEXT, teacher TEXT, weekday INTEGER, period INTEGER, location TEXT, credit INTEGER, course_type TEXT)",
]


def build_test_db() -> dict:
    """从正式库 + RAG JSON 重建测试库（结构与正式库一致）"""
    if TEST_DB.exists():
        TEST_DB.unlink()
    db = sqlite3.connect(TEST_DB)
    for statement in SCHEMA_SQL:
        db.execute(statement)

    copied: dict[str, int] = {}
    if SOURCE_DB.exists():
        src = sqlite3.connect(SOURCE_DB)
        src.row_factory = sqlite3.Row
        for table in ("users", "schedule", "dorm_members", "room_anchor_overrides", "notices"):
            try:
                rows = src.execute(f"SELECT * FROM {table}").fetchall()
            except sqlite3.OperationalError:
                continue
            if rows:
                placeholders = ",".join("?" * len(rows[0].keys()))
                db.executemany(f"INSERT OR REPLACE INTO {table} VALUES ({placeholders})", [tuple(r) for r in rows])
            copied[table] = len(rows)
        src.close()

    students_file = RAG_DATA / "students.json"
    if students_file.exists():
        rows = json.loads(students_file.read_text(encoding="utf-8"))
        db.executemany(
            "INSERT OR REPLACE INTO rag_students VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(s["student_id"], s["name"], s["gender"], s["class_name"], s["counselor"], s["dorm_room_code"], s["bed"], s["phone"], s["home_phone"], s["hometown"]) for s in rows],
        )
        copied["rag_students"] = len(rows)
    schedule_file = RAG_DATA / "schedule.json"
    if schedule_file.exists():
        rows = json.loads(schedule_file.read_text(encoding="utf-8"))
        db.executemany(
            "INSERT OR REPLACE INTO rag_schedule VALUES (?,?,?,?,?,?,?,?,?)",
            [(r["id"], r["class_name"], r["course"], r["teacher"], r["weekday"], r["period"], r["location"], r["credit"], r["course_type"]) for r in rows],
        )
        copied["rag_schedule"] = len(rows)
    db.commit()
    db.close()
    return {"test_db": str(TEST_DB.name), "copied": copied}


def connect() -> sqlite3.Connection:
    if not TEST_DB.exists():
        build_test_db()
    db = sqlite3.connect(TEST_DB)
    db.row_factory = sqlite3.Row
    return db


FORBIDDEN = ("drop", "delete", "alter", "attach", "detach", "pragma", "vacuum", "create", "load_extension")


def guard_sql(sql: str) -> str:
    text = re.sub(r"--.*?$|/\*.*?\*/", " ", sql, flags=re.S | re.M).strip()
    if not text:
        raise HTTPException(400, "SQL 不能为空")
    stripped = text.rstrip().rstrip(";")
    if ";" in stripped:
        raise HTTPException(400, "教学控制台只允许单条语句")
    first = stripped.lower()
    if not (first.startswith("select") or first.startswith("insert") or first.startswith("update")):
        raise HTTPException(400, "只允许 SELECT / INSERT / UPDATE")
    for word in FORBIDDEN:
        if re.search(rf"\b{word}\b", stripped, re.I):
            raise HTTPException(400, f"教学控制台禁止 {word.upper()}")
    return stripped


def run_sql(sql: str) -> dict:
    statement = guard_sql(sql)
    db = connect()
    started = time.perf_counter()
    try:
        cursor = db.execute(statement)
        if statement.lower().startswith("select"):
            rows = [dict(r) for r in cursor.fetchall()]
            columns = [d[0] for d in cursor.description or []]
            db.close()
            return {"kind": "select", "columns": columns, "rows": rows, "row_count": len(rows), "elapsed_ms": round((time.perf_counter() - started) * 1000, 2), "sql": statement, "affected": 0}
        db.commit()
        affected = cursor.rowcount
        db.close()
        return {"kind": "write", "columns": [], "rows": [], "row_count": 0, "affected": affected, "elapsed_ms": round((time.perf_counter() - started) * 1000, 2), "sql": statement}
    except sqlite3.Error as exc:
        db.close()
        raise HTTPException(400, f"SQL 执行失败：{exc}") from exc


class SqlBody(BaseModel):
    sql: str


class CodeBody(BaseModel):
    code: str


@router.get("/health")
def learn_health():
    db = connect()
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    counts = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in tables if not t.startswith("sqlite_")}
    db.close()
    return {"status": "ok", "test_db": TEST_DB.name, "tables": counts}


@router.post("/reset")
def reset():
    return {"status": "rebuilt", **build_test_db()}


@router.get("/schema")
def schema():
    db = connect()
    out = []
    for name in [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]:
        columns = [{"name": r[1], "type": r[2], "pk": bool(r[5])} for r in db.execute(f"PRAGMA table_info({name})").fetchall()]
        count = db.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        out.append({"table": name, "columns": columns, "row_count": count})
    db.close()
    return {"tables": out}


@router.get("/table/{name}")
def table_preview(name: str, limit: int = 15):
    db = connect()
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    if not exists:
        db.close()
        raise HTTPException(404, f"表不存在：{name}")
    rows = [dict(r) for r in db.execute(f"SELECT * FROM {name} LIMIT ?", (min(limit, 100),)).fetchall()]
    columns = [d[0] for d in db.execute(f"SELECT * FROM {name} LIMIT 1").description or []]
    db.close()
    return {"table": name, "columns": columns, "rows": rows}


@router.post("/sql")
def sql_console(body: SqlBody):
    return run_sql(body.sql)


SQL_CALL = re.compile(r"(?:db|conn|connection|cursor|cur)\s*\.\s*(?:execute|executemany)\s*\(\s*(?:f?)(['\"])(.+?)\1", re.S)
DBROWS_CALL = re.compile(r"db_rows\s*\(\s*(?:f?)(['\"])(.+?)\1", re.S)


@router.post("/run-python")
def run_backend_code(body: CodeBody):
    """教学用安全解释器：提取代码中的 SQL 并「按源码先后顺序」执行（不执行任意 Python）

    为什么不能直接跑用户写的 Python：那等于给页面开了一个任意代码执行入口。
    这里的做法是只做「词法提取 + 顺序重放」：
      1. 用正则找出 db.execute("...") / db_rows("...") 里的 SQL 字符串字面量；
      2. 连同它在源码中的字符位置、行号一起记下来；
      3. 按源码位置排序后逐条送到测试库执行（SQL 仍走 guard_sql 的只读/写白名单）。
    因此语句顺序与学习者写的代码完全一致 —— 先 SELECT 再 INSERT 再 SELECT 的
    「写入后回查」模式才能正确演示。
    """
    code = body.code
    hits: list[tuple[int, str, str]] = []
    for match in SQL_CALL.finditer(code):
        hits.append((match.start(), "db.execute", match.group(2).strip()))
    for match in DBROWS_CALL.finditer(code):
        hits.append((match.start(), "db_rows", match.group(2).strip()))
    if not hits:
        raise HTTPException(
            400,
            "未识别到 db.execute(\"...\") 或 db_rows(\"...\") 里的 SQL 字符串。"
            "教学解释器只重放这类「直接写死的 SQL 字面量」，请把 SQL 写成字符串再传入。",
        )
    # 按在源码里出现的先后顺序执行，而不是先跑完所有 execute 再跑 db_rows
    hits.sort(key=lambda item: item[0])

    steps = []
    for position, origin, statement in hits:
        line_no = code.count("\n", 0, position) + 1
        try:
            result = run_sql(statement)
            steps.append({"origin": origin, "line": line_no, "ok": True, **result})
        except HTTPException as exc:
            steps.append({"origin": origin, "line": line_no, "ok": False, "error": exc.detail, "sql": statement})
    return {
        "steps": steps,
        "count": len(steps),
        "note": "教学解释器：按源码顺序提取并执行代码中的 SQL（运行在测试库 learn_test.db），用于演示后端如何操作数据库",
    }


@router.get("/demo/chain")
def demo_chain(class_name: str = "计科2501"):
    """全链路演示：前端 → 后端 → SQLite → JSON → 前端渲染"""
    sql = ("SELECT id, class_name, course, teacher, weekday, period, location "
           "FROM rag_schedule WHERE class_name = ? ORDER BY weekday, period LIMIT 5")
    started = time.perf_counter()
    db = connect()
    rows = [dict(r) for r in db.execute(sql, (class_name,)).fetchall()]
    total = db.execute("SELECT COUNT(*) FROM rag_schedule WHERE class_name = ?", (class_name,)).fetchone()[0]
    db.close()
    elapsed = round((time.perf_counter() - started) * 1000, 2)
    labels = ["周一", "周二", "周三", "周四", "周五"]
    return {
        "request": {"method": "GET", "path": "/api/learn/demo/chain", "params": {"class_name": class_name}},
        "sql": sql,
        "params": [class_name],
        "rows": rows,
        "row_count": total,
        "elapsed_ms": elapsed,
        "display": [f"{labels[r['weekday'] - 1]} 第{r['period']}大节 {r['course']} · {r['teacher']} @ {ROOM_NAMES.get(r['location'], r['location'])}" for r in rows],
        "source_refs": ["backend/main.py · db_rows()/init_db()", "backend/rag.py · tool_schedule()", "src/RagPage.jsx · api()/ask()"],
    }


@router.get("/source")
def source_excerpt(file: str, start: int = 1, end: int = 60):
    if file not in SOURCE_WHITELIST:
        raise HTTPException(403, "该文件不在教学源码白名单内")
    path = ROOT / file
    if not path.exists():
        raise HTTPException(404, f"文件不存在：{file}")
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    start = max(1, start)
    end = min(len(lines), max(start, end))
    return {"file": file, "start": start, "end": end, "total_lines": len(lines), "code": "\n".join(lines[start - 1:end])}
