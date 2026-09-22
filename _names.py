# -*- coding: utf-8 -*-
import json
lay = json.load(open("E:/practice-examples/competition/campus-new/data/campus_layout.json", encoding="utf-8"))
for b in lay["buildings"]:
    print(b["id"], b["name"])
