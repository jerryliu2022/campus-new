# -*- coding: utf-8 -*-
import json
lay = json.load(open("E:/practice-examples/competition/campus-new/data/campus_layout.json", encoding="utf-8"))
for b in lay["buildings"]:
    if b["id"] in ("B06", "B03", "B12"):
        print(b["id"], b["name"], "x=%s z=%s w=%s d=%s" % (b["x"], b["z"], b.get("w"), b.get("d")))
ra = json.load(open("E:/practice-examples/competition/campus-new/data/room_anchors.json", encoding="utf-8"))
for r in ra["rooms"]:
    if r["room_code"] in ("B06_CR_F2_103", "B03_CR_F2_101", "B12_CR_F2_113"):
        print(r["room_code"], r["anchor_world"])
g = json.load(open("E:/practice-examples/competition/campus-new/data/road_graph.json", encoding="utf-8"))
for n in g["nodes"]:
    if n["id"] in ("entry_B06", "entry_B03", "entry_B03_back", "entry_B12"):
        print(n["id"], n["position"])
