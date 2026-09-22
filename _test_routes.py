# -*- coding: utf-8 -*-
"""全量路径测试：多段课表路径逐段校验 + 最优路径合法性 + 高亮要求。"""
import json, time, urllib.request

BASE = "http://127.0.0.1:8000"
with open("data/road_graph.json", encoding="utf-8") as f:
    G = json.load(f)
EDGES = {(e["from"], e["to"]) for e in G["edges"]} | {(e["to"], e["from"]) for e in G["edges"]}
LEG_COLORS = ["黄", "粉红", "青", "黄绿"]

def post(path, payload, token=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", "Bearer " + token)
    return json.load(urllib.request.urlopen(req, timeout=30))

fails = []

def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + ((" | " + detail) if detail else ""))
    if not ok:
        fails.append(name + " " + detail)

# ---------- 1. 三个学生：课表多段路径 ----------
for user in ("student", "student2", "student3"):
    tok = post("/api/login", {"username": user, "password": "campus123"})["access_token"]
    d = post("/api/query", {"query": "从宿舍到今天所有教室怎么走"}, tok)
    route = d.get("route") or {}
    legs = route.get("legs", [])
    node_ids = route.get("nodes", [])
    check(f"[{user}] intent=schedule_route", d.get("intent") == "schedule_route", d.get("intent") or "")
    check(f"[{user}] 有路径节点", len(node_ids) >= 2, f"{len(node_ids)} nodes, {len(legs)} legs")
    # 每段 node_ids 相邻对必须真实存在于路网（不跨障碍连线的硬约束）
    bad_leg = None
    for i, leg in enumerate(legs):
        ids = leg.get("node_ids") or []
        if leg.get("indoor_hop"):
            continue
        for a, b in zip(ids, ids[1:]):
            if (a, b) not in EDGES:
                bad_leg = f"leg{i} 缺边 {a}->{b}"
                break
        if bad_leg:
            break
    check(f"[{user}] 每段路径边全部存在于路网", bad_leg is None, bad_leg or "")
    # 整条路径同样校验
    bad_all = next((f"{a}->{b}" for a, b in zip(node_ids, node_ids[1:]) if (a, b) not in EDGES), None)
    check(f"[{user}] 整条路径边全部存在于路网", bad_all is None, bad_all or "")
    # 段间衔接：leg[i] 的末节点 == leg[i+1] 的首节点（最近门衔接）
    gap = None
    prev_end = None
    for i, leg in enumerate(legs):
        ids = leg.get("node_ids") or []
        if ids:
            if prev_end is not None and ids[0] != prev_end:
                gap = f"leg{i} 起点不衔接: {prev_end} != {ids[0]}"
            prev_end = ids[-1]
        if gap:
            break
    check(f"[{user}] 段与段通过最近门衔接", gap is None, gap or "")
    # 距离 = 各段之和（同楼换教室段为室内估算，单独列出）
    total_legs = round(sum(l["distance_m"] for l in legs), 1)
    check(f"[{user}] 段距离之和=总距离", abs(total_legs - route.get("distance_m", 0)) < 1.5,
          f"{total_legs} vs {route.get('distance_m')}")
    # 回答文案含分段颜色
    ans = d.get("answer", "")
    ok_color = all(c in ans for i, c in enumerate(LEG_COLORS) if i < len(legs))
    check(f"[{user}] 回答含各段颜色说明", ok_color, ans[-80:].replace("\n", " "))
    # 高亮：源宿舍(橙) + 各教室(morning/afternoon)
    rhs = d.get("room_highlight", [])
    colors = [h.get("color") for h in rhs]
    check(f"[{user}] 源宿舍橙色高亮", "origin" in colors, str(colors))
    need = {"morning" if l["location"].split("_")[0] <= "B03" else "x" for l in []}  # placeholder
    want = {"morning", "afternoon"}
    check(f"[{user}] 教室按上/下午高亮", want & set(colors) != set() or len(legs) <= 1, str(colors))
    print(f"      legs: " + " | ".join(
        f"{l['from']}->{l['to']} {l['distance_m']}m {'indoor_hop' if l.get('indoor_hop') else len(l.get('node_ids') or [])}n"
        for l in legs))
    print(f"      room_highlight: {colors}")
    time.sleep(0.2)

# ---------- 2. 单目的地最优路径抽查 ----------
tok = post("/api/login", {"username": "student", "password": "campus123"})["access_token"]
pairs = [
    "从宿舍到1#教学综合楼怎么走",
    "从宿舍到图书馆怎么走",
    "从2号教学综合楼到11#食堂怎么走",
    "从宿舍到400米田径场怎么走",
    "从16#学生宿舍到湖畔怎么走",
]
for q in pairs:
    d = post("/api/query", {"query": q}, tok)
    r = d.get("route") or {}
    ids = r.get("nodes", [])
    bad = next((f"{a}->{b}" for a, b in zip(ids, ids[1:]) if (a, b) not in EDGES), None)
    check(f"路线[{q}]", bad is None and r.get("distance_m", 0) > 0,
          f"{r.get('distance_m')}m {len(ids)}n {bad or ''}")
    time.sleep(0.2)

# ---------- 3. 高亮要求 ----------
d = post("/api/query", {"query": "我住哪"}, tok)
colors = [h.get("color") for h in d.get("room_highlight", [])]
check("宿舍查询绿色高亮", "dorm" in colors, str(colors))
d = post("/api/query", {"query": "明天有什么课"}, tok)
colors = [h.get("color") for h in d.get("room_highlight", [])]
check("明天的课紫色高亮", colors and all(c == "next" for c in colors), str(colors))
d = post("/api/query", {"query": "今天有什么课"}, tok)
colors = [h.get("color") for h in d.get("room_highlight", [])]
check("今天的课上/下午高亮", set(colors) <= {"morning", "afternoon"} and colors, str(colors))

# ---------- 4. eval ----------
import subprocess
out = subprocess.check_output(["curl", "-s", "--noproxy", "*", BASE + "/api/rag/eval"]).decode("utf-8")
ev = json.loads(out)
check("RAG eval 全过", ev["passed"] == ev["total"], f"{ev['passed']}/{ev['total']}")
for r in ev.get("results", []):
    if not r.get("pass"):
        print("   FAIL case:", r.get("q"))

print("\n==== %s ====" % ("ALL PASS" if not fails else f"{len(fails)} FAILURES"))
for f_ in fails:
    print(" -", f_)
