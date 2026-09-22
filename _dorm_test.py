# -*- coding: utf-8 -*-
import json, urllib.request
def post(path, payload, token=None):
    req = urllib.request.Request("http://127.0.0.1:8000" + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    if token: req.add_header("Authorization", "Bearer " + token)
    return json.load(urllib.request.urlopen(req, timeout=30))
tok = post("/api/login", {"username": "student", "password": "campus123"})["access_token"]
d = post("/api/query", {"query": "我的宿舍在哪？"}, tok)
print("intent:", d.get("intent"))
print("highlight:", d.get("highlight"))
print("room_highlight:", d.get("room_highlight"))
d2 = post("/api/query", {"query": "从宿舍到明天上午所有教室怎么走？"}, tok)
print("legs:")
for l in (d2.get("route") or {}).get("legs", []):
    print(" ", l["from"], "->", l["to"], "|", l["reason"], "|", l["distance_m"], "m | nodes:", len(l.get("node_ids") or []), "| indoor_pts:", len(l.get("indoor_pts") or []), "| line:", l.get("indoor_line"))
