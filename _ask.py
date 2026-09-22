import json, urllib.request
def post(path, payload, token=None):
    req = urllib.request.Request("http://127.0.0.1:8000" + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    if token: req.add_header("Authorization", "Bearer " + token)
    return json.load(urllib.request.urlopen(req))
login = post("/api/login", {"username": "student", "password": "campus123"})
tok = login["access_token"]
print("login ok:", login["user"])
for q in ["从16#学生宿舍到湖畔怎么走", "北侧山林步道怎么走", "从28#学生宿舍到400米田径场怎么走"]:
    d = post("/api/query", {"query": q}, tok)
    route = d.get("route") or {}
    nodes = route.get("node_ids", []) if isinstance(route, dict) else []
    print(q, "->", (d.get("answer") or "")[:66].replace("\n", " "), "| path:", len(nodes), "nodes")
