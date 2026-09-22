# -*- coding: utf-8 -*-
import json
ra = json.load(open("E:/practice-examples/competition/campus-new/data/room_anchors.json", encoding="utf-8"))
for r in ra["rooms"][:6]:
    print(r["room_code"], "->", r["semantic_name"])
dorms = [r for r in ra["rooms"] if r["room_code"].startswith("B12")]
for r in dorms[:3]:
    print(r["room_code"], "->", r["semantic_name"])
