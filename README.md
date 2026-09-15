# 岳阳学院智慧校园数字孪生

这是一个以公开规划、建成实景和 16 张真实沙盘多角度照片为依据的校园数字孪生工程，包含 React Three Fiber 交互界面、Blender 5.1 可编辑源场景、GLB 资产、房间锚点、室外避障路网和 FastAPI 服务。

## 运行

> 完整的启动、访问与排错说明见 [`docs/启动与访问说明.md`](docs/启动与访问说明.md)。

后端与前端**各开一个终端、都在项目根目录执行、两个都要运行**：

```powershell
# 终端 1 —— 后端 :8000（必须写全 python38 路径，PATH 里的 python 是 3.13，依赖版本不符）
cd /d E:\practice-examples\competition\campus-new
"E:\program file\python\python38\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# 终端 2 —— 前端 :4175（不要用 npm run dev，它不带端口，会落到 5173 与另一项目冲突）
cd /d E:\practice-examples\competition\campus-new
npx vite --host 0.0.0.0 --port 4175
```

三个入口：

| 页面 | 地址 | 登录 |
|---|---|---|
| 3D 数字孪生主页 | <http://localhost:4175/> | 需要，学生 `student/campus123`、辅导员 `counselor/campus123`、管理员 `admin/admin123` |
| 独立 RAG 问答页 | <http://localhost:4175/rag> | 免登录 |
| 学习中心 | <http://localhost:4175/learn> | 免登录 |

浏览器只访问 `4175` 即可，`/api/**` 由 Vite 开发服务器反向代理到 `127.0.0.1:8000`。登录后可以进入“校园漫游”，点击画面锁定视角，使用 `WASD` 行走、`Shift` 跑步、`Space` 跳跃；Rapier 地面和建筑碰撞会阻止穿模。

时空问答通过 FastAPI `/api/query` 接口完成，并先读取服务器系统日期；路径服务使用 `road_graph.json` 运行 Dijkstra。生产构建后，也可以由 FastAPI 在 `8000` 端口直接托管 `dist`。

## 公开规划依据

`data/public_sources.json` 记录了规划公示、国企建设进展与岳阳市城乡建设协会资料中的可核对数据。已采用的尺度包括一期净用地约 `281809.42㎡`、一期总建筑面积约 `255079.163㎡`，项目总体规划约 `1565亩`、总建筑面积约 `51.88万㎡`、规划办学规模 `15000人`。一期单体编号、中央高层与弧形综合体的建成外观由 2024 年“年度精品工程”资料约束，相对布局再由 16 张沙盘照片校准。

公开信息只能约束项目四至、总体规模、单体清单与可见外观。当前建筑间距、平面尺寸、树木数量、遮挡区域和房间划分属于多视角照片估算；单体竣工尺寸与完整室内仍需竣工图、CAD/GIS 或现场测绘，工程不会把估算值标成官方实测值。

## Blender 5.1 生成

本机 Blender 5.1.2 路径为 `E:\program files (x86)\Blender 5.1\blender.exe`。重新生成 `.blend`、GLB 和 JSON：

```powershell
node scripts\generate_road_graph.mjs
& 'E:\program files (x86)\Blender 5.1\blender.exe' -b --python blender\generate_campus.py
```

输出文件：

- `blender/yueyang_campus.blend`：可继续编辑的 Blender 5.1 场景，包含建筑立面、U 形单体、弧形图书馆、LOD2 房间、树阵、路灯、地形、湖泊、运动场和照片参考图层。
- `public/assets/yueyang_campus.glb`：Web 端资产。
- `data/room_anchors.json`：630 个可拾取房间单元锚点，统一使用米制、Y 轴向上、校园地理中心为原点。
- `data/road_graph.json`：48 个节点、56 条室外边，每条边带 geometry、距离和通行时间，`indoor=false`。
- `renders/campus-preview.png`：Blender 总览渲染，用于和来源照片做构图复核。

## 路网校验

```powershell
node scripts\validate_road_graph.mjs
```

生成脚本使用 A* 网格为主干节点和每栋建筑入口自动布线；校验脚本逐段采样道路几何，检查是否进入建筑外扩 footprint，并拒绝任何 `indoor=true` 的边。

## 参考照片

`public/assets/photo-overview.jpg`、`photo-sports.jpg`、`photo-center.jpg` 来自用户提供的真实沙盘照片，用于比例、色彩、道路与植被布局复核；Blender 中的 `参考图_真实沙盘照片` 集合可单独隐藏或显示。

`public/assets/official/annual_project_01.png` 与 `annual_project_02.png` 来自岳阳市城乡建设协会“年度精品工程丨岳阳学院项目一期”，用于校准中央高层、弧形综合体、玻璃竖梃、深色基座和建筑配色。来源链接与证据类型记录在 `data/public_sources.json`。

## 独立 RAG 问答系统（免登录 · /rag）

在 3D 数字孪生之外提供一个**独立的 RAG 问答与数据溯源页面**（无需登录，直接访问 http://localhost:4175/rag）：

- **演示数据**（`scripts/generate_rag_data.py` 生成，存于 `data/rag/*.json`）：
  - 6 个班级（计科1班~计科6班）× 60 人 = **360 名学生**，2025 年秋季入学，当前大二上学期（2026-2027-1）
  - **60 间宿舍**（每间 6 人，分性别住宿）：计科N班 → 学生公寓 B1N，宿舍房间码均对应 3D 模型真实房间锚点
  - **培养方案**：8 门必修全班一致 + 每班 2 门不同选修课（各 2 学分），共 25 学分；每 3 个班 1 名辅导员
  - **大二上排课 96 条**：生成器自动保证 班级×大节 / 教师×大节 / 教室×大节 三重不冲突（`data/rag/validation.json` 输出校验报告）
  - **双季作息**：10月1日前夏季作息（下午 14:30 上课），国庆后冬季作息（14:00 上课），问答自动按当前日期选作息
- **问答能力**（`backend/rag.py`，路由 `/api/rag/*`，无鉴权）：
  - 意图解析 → 确定性工具函数检索（课表/作息/学生/宿舍/路径）→ 模板生成，答案**全程携带数据溯源**
  - 时间解析支持：今天/明天/后天/周X/上午/下午/晚上/第N大节；非上课日自动回退下一上课日
  - 路径规划：宿舍起点 → 按大节时间先后排序的多目的地，Dijkstra 室外路径 + 楼内锚点段
  - `/api/rag/eval`：内置评测集一键回归（5/5 通过），`/api/rag/tools` 输出检索工具清单
- **页面**：左侧为源数据浏览器（学生/课表/作息/培养方案/校验报告，可搜索），回答中的溯源徽标点击即在左侧高亮对应源记录

重新生成数据并重启：

```powershell
python scripts\generate_rag_data.py
# 重启 backend 后访问 http://localhost:4175/rag
```

## 开发文档

详见 [`docs/开发迭代记录.md`](docs/开发迭代记录.md)：独立 RAG 问答系统的实现方式总结（五环节流水线、数据体系、检索工具、时间季节解析、溯源与评测）、已知边界，以及"泛化简单问题"的落地方案（实体枚举+聚合算子；中长期 QueryPlan + LLM function calling / 本地语义引擎两条路线）。


## 学习中心（免登录 · /learn）

面向零基础的学习页面（http://localhost:4175/learn），把项目拆成 **前端 / 后端 / 数据库 / RAG / 3D建模** 五个模块共 24 个知识点，每个知识点：
- 标注归属类型（前端/后端/数据库/RAG/3D）与**源码出处**（如 `src/RagPage.jsx · api()`、`backend/main.py · init_db()`）
- 附带**可直接运行验证**的示例：
  - 前端：可在页面内改代码并立即运行的 HTML/CSS/JS 沙箱（iframe），以及页面内真实 React 组件演示
  - 后端：接口测试器（可选 GET/POST、改 URL/请求体，看真实 JSON；缺参数会展示 422 校验、无令牌展示 401）
  - 数据库：SQL 控制台（预置 + 自定义 SQL，单条 SELECT/INSERT/UPDATE，**独立测试库 `data/learn_test.db`，结构与正式库一致**，含 360 学生/96 排课等数据，可一键重置）；以及「后端代码运行器」——写 Python 代码（`db.execute/db_rows`）实时执行并返回每步结果
  - RAG：五环节管道讲解 + 真实提问/评测（12/12）
  - 3D：L1 立方体 → L2 数据生成建筑 → L3 灯光阴影 → L4 动画与点击选中 → 一键加载项目真实 GLB 校园模型（6.4MB）
- 第 0 节为**全链路演示**：一次请求展示 前端 fetch → 后端组装 SQL → SQLite 执行 → JSON 返回 → 前端渲染，并给出耗时与源码对照

教学接口全部在 `/api/learn/*`（`backend/learn.py`），与正式链路隔离；页面代码位于 `src/LearnPage.jsx` + `src/learn.css`（仅新增文件，未改动 3D 首页与 /rag 页面）。


### 学习中心增强：源码展示与代码解释（每次迭代）

- 每个模块都新增「后端 / 建模源码精读」知识点：直接用项目**真实源码**（带行号）讲解，可自由切换文件与行范围（白名单只读接口 `/api/learn/source`）
- 所有出现的代码都配**逐条解释**：
  - 前端课：每条示例下方列出「这段前端代码在做什么」（按行/语法点对应）
  - 后端课：`SourceViewer` 展示真实 `backend/*.py` 片段 + 逐段解释（路由装饰器、参数绑定、事务 commit、JWT 签名等）
  - 数据库课：SQL 控制台对当前语句做**关键字词法解释**（SELECT/FROM/WHERE/GROUP BY/ORDER BY/LIMIT/COUNT/INSERT/UPDATE/SET/HAVING）
  - RAG / 3D 课：ask 管道、评测集、Blender `cube()`、`CampusModel` 动画与点击链路逐段解释
- 知识点总数：24 → **29**（新增每个模块的后端/源码精读课）
