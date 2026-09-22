import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Database,
  FileSearch,
  FlaskConical,
  GraduationCap,
  Layers,
  MapPinned,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import { buildingBadge, roomFriendly } from "./labels";

/**
 * 独立 RAG 问答页（免登录 /rag）
 * - 左：源数据浏览器（students/schedule/timetable/training_plan/validation），可搜索核对
 * - 中：问答（回答附 sources 溯源，点击跳到对应源数据）
 * - 右：班级视角选择 + 内置评测集一键回归 + 工具清单
 */
// 班级清单从生产数据动态拉取（/api/rag/classes，随 data/rag 重新生成自动同步）；
// 这里只保留接口失败时的兜底。
const FALLBACK_CLASSES = [
  "计科2501", "计科2502", "计科2503", "计科2504", "计科2505", "计科2506",
  "计科2601", "计科2602", "计科2603", "计科2604", "计科2605", "计科2606",
];
const DATA_TABS = [
  { key: "students", label: "学生与宿舍", icon: GraduationCap },
  { key: "schedule", label: "课表", icon: Layers },
  { key: "timetable", label: "作息(夏/冬)", icon: MapPinned },
  { key: "training_plan", label: "培养方案", icon: FileSearch },
  { key: "validation", label: "数据校验", icon: ShieldCheck },
];

const QUICK = [
  "计科2501明天第一节课在哪？",
  "从宿舍到明天上午所有教室怎么走？",
  "会计2601今天下午有什么课？",
  "第3大节几点下课",
  "会计2601班的培养方案是什么",
];

async function api(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`请求失败 ${response.status}`);
  return response.json();
}

export default function RagPage() {
  const [messages, setMessages] = useState([
    {
      from: "ai",
      text: "校园 RAG 问答系统已就绪（免登录演示）。数据：133 个班 7004 名学生（2025级+2026级）、1168 间宿舍、1849 条排课、311 名教师、144 门课程，夏季/冬季双作息。回答均附数据溯源，可在左侧核对源数据。",
      sources: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [classList, setClassList] = useState(FALLBACK_CLASSES);
  const [viewClass, setViewClass] = useState("计科2501");
  const [busy, setBusy] = useState(false);

  // 源数据面板
  const [tab, setTab] = useState("students");
  const [dataSource, setDataSource] = useState({ students: [], schedule: [], timetable: null, training_plan: null, validation: null });
  const [filter, setFilter] = useState("");

  // 评测
  const [evalResult, setEvalResult] = useState(null);
  const [tools, setTools] = useState([]);
  const listRef = useRef(null);

  // 首页加载源数据（按需加载，避免一次性拉取所有数据）
  const loadTab = async (key) => {
    if (dataSource[key] && (Array.isArray(dataSource[key]) ? dataSource[key].length : true)) return;
    try {
      const data = await api(`/api/rag/data/${key}`);
      setDataSource((prev) => ({ ...prev, [key]: data }));
    } catch (error) {
      setDataSource((prev) => ({ ...prev, [key]: { error: error.message } }));
    }
  };

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  useEffect(() => {
    // 班级清单以生产数据为准：随 data/rag 重新生成自动同步，不再硬编码
    api("/api/rag/classes")
      .then((payload) => {
        const list = payload?.all;
        if (Array.isArray(list) && list.length) {
          setClassList(list);
          setViewClass((current) =>
            list.includes(current) ? current : list[0],
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api("/api/rag/tools").then((payload) => setTools(payload.tools || [])).catch(() => {});
  }, []);

  async function ask(question) {
    const text = (question ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { from: "user", text }]);
    try {
      const payload = await api("/api/rag/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, class_name: viewClass }),
      });
      setMessages((m) => [
        ...m,
        {
          from: "ai",
          text: payload.answer,
          sources: payload.sources || [],
          intent: payload.intent,
          route: payload.route || null,
          routeStops: payload.route_stops || null,
        },
      ]);
    } catch (error) {
      setMessages((m) => [...m, { from: "ai", text: `查询失败：${error.message}` }]);
    }
    setBusy(false);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
  }

  function jumpToSource(source) {
    const key = source.source.replace(".json", "");
    setTab(key);
    setFilter(source.ref || "");
  }

  async function runEval() {
    setEvalResult("running");
    try {
      setEvalResult(await api("/api/rag/eval"));
    } catch (error) {
      setEvalResult({ error: error.message });
    }
  }

  const filtered = useMemo(() => {
    const current = dataSource[tab];
    if (!Array.isArray(current)) return current;
    const keyword = filter.trim();
    if (!keyword) return current.slice(0, 400);
    return current
      .filter((row) => JSON.stringify(row).includes(keyword))
      .slice(0, 400);
  }, [dataSource, tab, filter]);

  return (
    <div className="rag-shell">
      <header className="rag-topbar">
        <div className="rag-brand">
          <div className="rag-mark"><Bot size={20} /></div>
          <div>
            <b>岳阳学院 · RAG 问答系统</b>
            <small>免登录演示 / 7004 名学生 · 133 班级 · 双季作息 · 溯源检索</small>
          </div>
        </div>
        <div className="rag-top-actions">
          <span className="rag-pill">2026-2027 学年第一学期 · 19 周</span>
          <span className="rag-pill">2025级（大二）· 2026级（大一）</span>
          <button className="rag-pill rag-pill-btn" onClick={() => (window.location.href = "/")}>
            返回 3D 首页 →
          </button>
        </div>
      </header>

      <main className="rag-layout">
        {/* 左：源数据浏览器 */}
        <aside className="rag-data">
          <div className="rag-panel-head">
            <Database size={15} /> 数据来源
            <small>SOURCE OF TRUTH</small>
          </div>
          <div className="rag-tabs">
            {DATA_TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} className={tab === key ? "rag-tab active" : "rag-tab"} onClick={() => setTab(key)}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <div className="rag-filter">
            <Search size={13} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="搜索姓名/班级/房间/课程…"
            />
          </div>
          <div className="rag-data-body">
            {tab === "students" &&
              Array.isArray(filtered) &&
              filtered.map((s) => (
                <div className="rag-row" key={s.student_id}>
                  <b>{s.name}</b>
                  <span>{s.student_id}</span>
                  <span>{s.class_name}</span>
                  <span className="rag-dim">{roomFriendly(s.dorm_room_code)} · {s.bed}号床</span>
                </div>
              ))}
            {tab === "schedule" &&
              Array.isArray(filtered) &&
              filtered.map((r) => (
                <div className="rag-row" key={r.id}>
                  <b>{r.class_name}</b>
                  <span>周{["一", "二", "三", "四", "五"][r.weekday - 1]} 第{r.period}大节</span>
                  <span>{r.course} · {r.teacher}</span>
                  <span className="rag-dim">{roomFriendly(r.location)}</span>
                </div>
              ))}
            {tab === "timetable" && dataSource.timetable && (
              <div className="rag-timetable">
                <p className="rag-note">学期 {dataSource.timetable.semester.start} 起 {dataSource.timetable.semester.weeks} 周；{dataSource.timetable.semester.national_day_split} 起切换冬季作息</p>
                {["summer", "winter"].map((regime) => (
                  <div key={regime} className="rag-regime">
                    <b>{dataSource.timetable[regime].label}</b>
                    {[1, 2, 3, 4, 5].map((p) => (
                      <div className="rag-row" key={p}>
                        <span>第{p}大节</span>
                        <span className="rag-dim">{dataSource.timetable[regime][p].join(" – ")}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {tab === "training_plan" && dataSource.training_plan && (
              <div className="rag-plan">
                {(() => {
                  // 2026-09-20 起培养方案结构：{ semester, summary, classes, dorm_allocation }
                  // classes[class] = { grade_label, major, college, counselor, student_count, courses[] }
                  const plan = dataSource.training_plan;
                  const summary = plan.summary || {};
                  const entries = Object.entries(plan.classes || {});
                  const keyword = filter.trim();
                  const rows = (keyword
                    ? entries.filter(([cls, info]) =>
                        `${cls} ${info.major} ${info.college} ${info.counselor}`.includes(keyword),
                      )
                    : entries
                  ).slice(0, 120);
                  return (
                    <>
                      <p className="rag-note">
                        {plan.semester?.name || "本学期"} · {summary.classes || entries.length} 个班 /{" "}
                        {summary.students || "—"} 名学生 / {summary.teachers || "—"} 名教师 /{" "}
                        {summary.courses || "—"} 门课程（可搜索班级/专业/学院/辅导员）
                      </p>
                      {rows.map(([cls, info]) => {
                        const dorm = (plan.dorm_allocation || {})[cls];
                        const male = dorm?.male_rooms?.length || 0;
                        const female = dorm?.female_rooms?.length || 0;
                        return (
                          <div className="rag-row" key={cls}>
                            <b>{cls}</b>
                            <span>
                              {info.major} · {info.grade_label} · {info.student_count} 人
                            </span>
                            <span className="rag-dim">
                              {info.college} · 辅导员 {info.counselor} · {info.courses?.length || 0} 门课
                              {dorm ? ` · 宿舍 男${dorm.building_male?.map(buildingBadge).join("/")} ${male}间 女${dorm.building_female?.map(buildingBadge).join("/")} ${female}间` : ""}
                            </span>
                          </div>
                        );
                      })}
                      {rows.length === 0 && <p className="rag-note">无匹配班级</p>}
                    </>
                  );
                })()}
              </div>
            )}
            {tab === "validation" && dataSource.validation && (
              <div className="rag-validation">
                {Object.entries(dataSource.validation.checks).map(([name, state]) => (
                  <div className="rag-row" key={name}>
                    <b className={state === "PASS" ? "rag-pass" : "rag-fail"}>{state}</b>
                    <span>{name}</span>
                  </div>
                ))}
                <p className="rag-note">学生 {dataSource.validation.students} 人 / 宿舍 {dataSource.validation.dorm_rooms} 间 / 排课 {dataSource.validation.schedule_rows} 条 / 冲突 {dataSource.validation.violations.length} 处</p>
              </div>
            )}
            {Array.isArray(filtered) && filtered.length === 0 && <p className="rag-note">无匹配记录</p>}
          </div>
        </aside>

        {/* 中：问答 */}
        <section className="rag-chat">
          <div className="rag-panel-head">
            <Bot size={15} /> 智能问答
            <small>回答附数据溯源</small>
          </div>
          <div className="rag-view">
            视角班级：
            <select
              value={viewClass}
              onChange={(event) => setViewClass(event.target.value)}
              aria-label="视角班级"
              style={{
                background: "#0d2233",
                color: "#d7e6e2",
                border: "1px solid rgba(122,168,180,.35)",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 13,
              }}
            >
              {classList.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
            <small style={{ marginLeft: 8, opacity: 0.65 }}>
              共 {classList.length} 个班 · 与生产数据同步
            </small>
          </div>
          <div className="rag-messages" ref={listRef}>
            {messages.map((message, i) => (
              <div key={i} className={`rag-message ${message.from}`}>
                <div className="rag-bubble">
                  {message.text}
                  {message.route && (
                    <div className="rag-route">
                      <b>路径规划</b> {message.route.distance_m} m · 步行 {message.route.walking_minutes} 分钟 · {message.route.nodes.length} 节点 · 终点含室内段
                      <div className="rag-stops">
                        {(message.routeStops || []).map((stop, j) => (
                          <span key={j}>{j + 1}. {stop.label}（{stop.reason}）</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {message.sources?.length > 0 && (
                    <div className="rag-sources">
                      <Database size={12} /> 数据溯源：
                      {message.sources.map((source, j) => (
                        <button key={j} onClick={() => jumpToSource(source)} title={source.detail || ""}>
                          {source.source} · {source.ref}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="rag-message ai"><div className="rag-bubble rag-typing">检索源数据中…</div></div>}
          </div>
          <div className="rag-quick">
            {QUICK.map((q) => (
              <button key={q} onClick={() => ask(q)}>{q}</button>
            ))}
          </div>
          <div className="rag-input">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && ask()}
              placeholder="例如：计科2602周五下午有什么课？罗慕波住在哪？"
            />
            <button onClick={() => ask()} disabled={busy}>
              <Send size={15} />
            </button>
          </div>
        </section>

        {/* 右：评测与工具 */}
        <aside className="rag-side">
          <div className="rag-panel-head">
            <FlaskConical size={15} /> 检索评测
            <small>EVALS</small>
          </div>
          <button className="rag-eval-btn" onClick={runEval}>运行内置评测集（12 条）</button>
          {evalResult === "running" && <p className="rag-note">评测运行中…</p>}
          {evalResult && evalResult.results && (
            <div className="rag-eval-body">
              <b className={evalResult.passed === evalResult.total ? "rag-pass" : "rag-fail"}>
                {evalResult.passed}/{evalResult.total} · 通过率 {Math.round(evalResult.rate * 100)}%
              </b>
              {evalResult.results.map((row) => (
                <div className="rag-row" key={row.q}>
                  <b className={row.pass ? "rag-pass" : "rag-fail"}>{row.pass ? "PASS" : "FAIL"}</b>
                  <span>{row.q}</span>
                  <span className="rag-dim">{row.actual_intent}</span>
                </div>
              ))}
            </div>
          )}
          <div className="rag-panel-head" style={{ marginTop: 18 }}>
            <Database size={15} /> 检索工具（function calling）
          </div>
          <div className="rag-tools">
            {tools.map((tool) => (
              <div className="rag-row" key={tool.name}>
                <b>{tool.name}</b>
                <span className="rag-dim">{tool.description}</span>
              </div>
            ))}
            {tools.length === 0 && <p className="rag-note">加载中…</p>}
          </div>
          <p className="rag-note">方法论：意图解析 → 确定性工具检索 → 模板生成 + 溯源。作息按日期自动切换夏季/冬季，保证上课时间回答准确。</p>
        </aside>
      </main>
    </div>
  );
}
