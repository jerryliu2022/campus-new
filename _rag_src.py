# -*- coding: utf-8 -*-
import json, urllib.request
def post(path, payload):
    req = urllib.request.Request("http://127.0.0.1:8000" + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))
d = post("/api/rag/ask", {"question": "罗慕波住哪个宿舍？", "class_name": "计科2601"})
print("answer:", (d.get("answer") or "")[:100])
for s in d.get("sources", []):
    print("source:", s.get("source"), "| ref:", s.get("ref"), "| detail:", s.get("detail"))
