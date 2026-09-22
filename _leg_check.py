# -*- coding: utf-8 -*-
import json, urllib.request
def post(path, payload, token=None):
    req = urllib.request.Request("http://127.0.0.1:8000" + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    if token: req.add_header("Authorization", "Bearer " + token)
    return json.load(urllib.request.urlopen(req, timeout=30))
tok = post("/api/login", {"username": "student", "password": "campus123"})["access_token"]
d = post("/api/query", {"query": "从宿舍到明天上午所有教室怎么走？"}, tok)
G = json.load(open("data/road_graph.json", encoding="utf-8"))
POS = {n["id"]: n["position"] for n in G["nodes"]}
EDGES = {(e["from"], e["to"]) for e in G["edges"]} | {(e["to"], e["from"]) for e in G["edges"]}
for i, leg in enumerate(d["route"]["legs"]):
    ids = leg.get("node_ids") or []
    print(f"leg{i}: {leg['from']} -> {leg['to']} | {leg['distance_m']}m")
    for a, b in zip(ids, ids[1:]):
        pa, pb = POS[a][:3], POS[b][:3]
        straight = "H" if abs(pa[0]-pb[0]) < 0.01 or abs(pa[2]-pb[2]) < 0.01 else "DIAG!"
        print(f"   {a}({pa[0]:.0f},{pa[2]:.0f}) -> {b}({pb[0]:.0f},{pb[2]:.0f}) {straight} edge={'Y' if (a,b) in EDGES else 'MISSING!'}")
    print("   indoor_pts:", leg.get("indoor_pts"))
    print("   indoor_line:", leg.get("indoor_line"))
