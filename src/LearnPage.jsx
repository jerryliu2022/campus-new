import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  Atom,
  BookOpen,
  Braces,
  Check,
  Copy,
  Database,
  FlaskConical,
  GraduationCap,
  Layers,
  Monitor,
  Play,
  RotateCcw,
  Server,
  Sparkles,
  SquareStack,
} from "lucide-react";
import "./learn.css";
import { roomFriendly } from "./labels.js";

/**
 * 学习中心（/learn 免登录）
 * 面向零基础：按 前端 / 后端 / 数据库 / RAG / 3D建模 五个模块拆解项目知识点，
 * 每个知识点标注归属类型与源码出处，并附「可直接运行验证」的示例。
 * 说明：本文件只新增页面与交互，不改动项目既有 3D 首页与 /rag 页面。
 */

const MODULES = [
  { key: "chain", label: "0 · 全链路演示", icon: Sparkles, desc: "前端→后端→数据库→前端，一次跑通" },
  { key: "frontend", label: "1 · 前端", icon: Monitor, desc: "HTML/CSS/JS/React/fetch" },
  { key: "backend", label: "2 · 后端", icon: Server, desc: "FastAPI 路由/参数/鉴权/静态托管" },
  { key: "database", label: "3 · 数据库", icon: Database, desc: "SQLite 表结构/SQL/后端如何操作" },
  { key: "rag", label: "4 · RAG 问答", icon: FlaskConical, desc: "检索增强/管道/溯源/评测" },
  { key: "threeD", label: "5 · 3D 建模", icon: SquareStack, desc: "场景/建筑/材质/动画/交互/GLB" },
];

const TYPE_META = {
  frontend: { label: "前端", cls: "tag-frontend" },
  backend: { label: "后端", cls: "tag-backend" },
  database: { label: "数据库", cls: "tag-database" },
  rag: { label: "RAG", cls: "tag-rag" },
  "3d": { label: "3D建模", cls: "tag-3d" },
  full: { label: "全链路", cls: "tag-full" },
};

// 演示班级从生产数据动态拉取（/api/rag/classes，随 data/rag 重新生成自动同步）；
// 兜底列表保证离线时教学示例依然可跑。
const FALLBACK_CLASSES = [
  "计科2501", "计科2502", "计科2503",
  "计科2601", "计科2602", "计科2603",
];

// 全站共享：拉生产班级清单（一次请求全页复用）
let _classCache = null;
function useClassList() {
  const [classes, setClasses] = React.useState(_classCache || FALLBACK_CLASSES);
  React.useEffect(() => {
    if (_classCache) return;
    api("/api/rag/classes")
      .then((payload) => {
        if (Array.isArray(payload?.all) && payload.all.length) {
          _classCache = payload.all;
          setClasses(payload.all);
        }
      })
      .catch(() => {});
  }, []);
  return classes;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const detail = data?.detail;
    // FastAPI 422 校验错误是数组，转成可读文本（教学展示更友好）
    const message = Array.isArray(detail)
      ? detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join("；")
      : detail || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

/* ============ 通用：类型徽标 + 源码出处 ============ */
function LessonHead({ lesson }) {
  const meta = TYPE_META[lesson.type] || TYPE_META.full;
  return (
    <div className="learn-lesson-head">
      <div className="learn-lesson-title">
        <span className={`learn-tag ${meta.cls}`}>{meta.label}</span>
        <h3>{lesson.title}</h3>
      </div>
      <div className="learn-source">源码出处：<code>{lesson.source}</code></div>
      <p className="learn-desc">{lesson.desc}</p>
    </div>
  );
}

/* ============ 通用：带行号的真实源码 + 逐条解释 + SQL 词法解释 ============ */
function CodeBlock({ code, startLine }) {
  return (
    <div className="learn-source-view">
      {code.split(String.fromCharCode(10)).map((line, i) => (
        <div className="learn-source-line" key={i}>
          <span className="learn-lineno">{startLine + i}</span>
          <span className="learn-srccode">{line || " "}</span>
        </div>
      ))}
    </div>
  );
}

function NotesList({ notes, title }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="learn-notes">
      <p className="learn-notes-title">{title || "代码解释"}</p>
      {notes.map((n, i) => (
        <div className="learn-note-item" key={i}>
          <span className="learn-note-lines">{n.lines}</span>
          <span>{n.text}</span>
        </div>
      ))}
    </div>
  );
}

const SOURCE_FILES = [
  "backend/main.py", "backend/rag.py", "backend/learn.py",
  "src/RagPage.jsx", "src/App.jsx", "src/main.jsx",
  "scripts/generate_rag_data.py", "scripts/generate_road_graph.mjs",
  "blender/generate_campus.py", "vite.config.js", "index.html",
];

/** 显示项目真实源码（可切换文件与行范围），并附逐条解释 */
function SourceViewer({ file, start, end, notes, title }) {
  const [state, setState] = useState({ file, start, end });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  async function load(next) {
    const cfg = next || state;
    setError("");
    try {
      setData(await api(`/api/learn/source?file=${encodeURIComponent(cfg.file)}&start=${cfg.start}&end=${cfg.end}`));
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line
  const update = (patch) => setState((prev) => ({ ...prev, ...patch }));
  return (
    <div className="learn-runner">
      <div className="learn-controls">
        <select value={state.file} onChange={(e) => update({ file: e.target.value })}>
          {SOURCE_FILES.map((f) => <option key={f}>{f}</option>)}
        </select>
        <input type="number" min="1" value={state.start} onChange={(e) => update({ start: Number(e.target.value) })} style={{ width: 92 }} />
        <span className="learn-dim">—</span>
        <input type="number" min="1" value={state.end} onChange={(e) => update({ end: Number(e.target.value) })} style={{ width: 92 }} />
        <button onClick={() => load()}><Play size={14} /> 读取真实源码</button>
        {data && <span className="learn-note">第 {data.start}–{data.end} 行 / 共 {data.total_lines} 行</span>}
      </div>
      {error && <p className="learn-error">{error}</p>}
      {data && <CodeBlock code={data.code} startLine={data.start} />}
      <NotesList notes={notes} title={title || "这段源码在做什么"} />
    </div>
  );
}

const SQL_GLOSSARY = [
  { label: "SELECT", test: (q) => /(^|\s)select\b/i.test(q), text: "SELECT：选择要返回的列（字段），SQL 的第一段决定「看哪些数据」。" },
  { label: "FROM", test: (q) => /\bfrom\b/i.test(q), text: "FROM：指定数据来自哪张表，例如 rag_students（学生表）、rag_schedule（排课表）。" },
  { label: "WHERE", test: (q) => /\bwhere\b/i.test(q), text: "WHERE：行过滤条件，只保留满足条件的记录（=、LIKE、IN 等）。" },
  { label: "JOIN", test: (q) => /\bjoin\b/i.test(q), text: "JOIN … ON：把两张表按共同字段连起来。本项目学生表与排课表靠 class_name（班级）关联。" },
  { label: "GROUP BY", test: (q) => /\bgroup\s+by\b/i.test(q), text: "GROUP BY：按某列分组，常配合聚合函数做「每班多少人」这类统计。" },
  { label: "ORDER BY", test: (q) => /\border\s+by\b/i.test(q), text: "ORDER BY：排序输出（默认升序，DESC 为降序）。" },
  { label: "LIMIT", test: (q) => /\blimit\b/i.test(q), text: "LIMIT：限制返回行数，避免一次返回过多数据。" },
  { label: "COUNT()", test: (q) => /\bcount\s*\(/i.test(q), text: "COUNT()：聚合函数，统计行数；COUNT(*) 统计所有行，COUNT(DISTINCT 列) 统计去重后的个数。" },
  { label: "-- 注释", test: (q) => q.includes("--"), text: "-- 到行尾是 SQL 注释，数据库会忽略它。学习时把「这行在干嘛」写在注释里，回头看得懂。" },
  { label: "INSERT INTO", test: (q) => /^\s*insert\b/i.test(q), text: "INSERT INTO：插入新行，需给出列名与 VALUES；项目里用 INSERT OR REPLACE 实现「有则替换、无则插入」。" },
  { label: "UPDATE", test: (q) => /^\s*update\b/i.test(q), text: "UPDATE：修改已有行的字段，必须用 WHERE 限定范围，否则会误改全表。" },
  { label: "SET", test: (q) => /\bset\b/i.test(q), text: "SET：UPDATE 语句中指定「改成什么值」。" },
  { label: "HAVING", test: (q) => /\bhaving\b/i.test(q), text: "HAVING：对 GROUP BY 分组结果再过滤（WHERE 过滤行、HAVING 过滤组）。" },
];

function SqlExplained({ sql, note }) {
  const hits = SQL_GLOSSARY.filter((g) => g.test(sql));
  return (
    <div className="learn-notes">
      <p className="learn-notes-title">这条 SQL 的解释</p>
      {note && (
        <div className="learn-note-item">
          <span className="learn-note-lines">本课重点</span>
          <span>{note}</span>
        </div>
      )}
      {hits.map((h) => (
        <div className="learn-note-item" key={h.label}>
          <span className="learn-note-lines">{h.label}</span>
          <span>{h.text}</span>
        </div>
      ))}
      {hits.length === 0 && <p className="learn-note">（未识别到常见 SQL 关键字，可对照左侧表结构理解）</p>}
    </div>
  );
}

/* ============ 0. 全链路演示 ============ */
function ChainDemo() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const classList = useClassList();
  const [cls, setCls] = useState("计科2501");
  const [error, setError] = useState("");

  async function run() {
    setBusy(true); setError("");
    try {
      setResult(await api(`/api/learn/demo/chain?class_name=${encodeURIComponent(cls)}`));
    } catch (e) { setError(e.message); }
    setBusy(false);
  }
  useEffect(() => { run(); /* 首次自动演示 */ }, []); // eslint-disable-line

  return (
    <div className="learn-runner">
      <div className="learn-steps">
        <div className="learn-step"><b>① 前端</b>fetch('/api/learn/demo/chain')</div>
        <div className="learn-step"><b>② 后端</b>FastAPI 接收请求 → 组装 SQL</div>
        <div className="learn-step"><b>③ 数据库</b>SQLite 执行 SELECT 返回行</div>
        <div className="learn-step"><b>④ 后端</b>结果转 JSON 响应</div>
        <div className="learn-step"><b>⑤ 前端</b>setState 渲染到页面</div>
      </div>
      <div className="learn-controls">
        <select value={cls} onChange={(e) => setCls(e.target.value)}>
          {classList.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button onClick={run} disabled={busy}><Play size={14} /> 运行全链路</button>
      </div>
      {error && <p className="learn-error">{error}</p>}
      {result && (
        <div className="learn-result">
          <p className="learn-note">请求：{result.request.method} {result.request.path}　参数：class_name={cls}</p>
          <pre className="learn-sql">后端执行的 SQL：{result.sql}{"\n"}参数绑定：{JSON.stringify(result.params)}</pre>
          <p className="learn-note">数据库返回 {result.row_count} 行，耗时 {result.elapsed_ms} ms；前端渲染前 5 行：</p>
          <ul className="learn-display-list">{result.display.map((d, i) => <li key={i}>{d}</li>)}</ul>
          <details><summary>查看后端返回的原始 JSON</summary><pre className="learn-json">{JSON.stringify(result.rows, null, 1)}</pre></details>
          <p className="learn-note">对照源码：{result.source_refs.join("　|　")}</p>
        </div>
      )}
    </div>
  );
}

/* ============ 通用：一键复制代码（方便学习者拿出去单独建 .html 文件跑） ============ */
function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "已复制" : "复制代码"}
    </button>
  );
}

/* ============ 前端：iframe 运行器 ============ */
function HtmlRunner({ lesson }) {
  const [code, setCode] = useState(lesson.html);
  const [srcDoc, setSrcDoc] = useState(lesson.html);
  return (
    <div className="learn-runner">
      <div className="learn-editor-row">
        <textarea className="learn-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
        <div className="learn-preview">
          <iframe title={lesson.title} srcDoc={srcDoc} sandbox="allow-scripts allow-same-origin" />
        </div>
      </div>
      <div className="learn-controls">
        <button onClick={() => setSrcDoc(code)}><Play size={14} /> 运行代码</button>
        <button className="ghost" onClick={() => { setCode(lesson.html); setSrcDoc(lesson.html); }}><RotateCcw size={14} /> 重置</button>
        <CopyButton text={code} />
        <span className="learn-note">改代码 → 运行，右侧立即看到效果；也可以点「复制代码」贴进一个 .html 文件双击打开</span>
      </div>
      <NotesList notes={lesson.notes} title="这段前端代码在做什么" />
    </div>
  );
}

/* ============ 前端：页面内真实 React 演示 ============ */
function ReactCounterDemo() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  return (
    <div className="learn-demo-box">
      <p>useState 状态演示：<b>{count}</b></p>
      <div className="learn-controls">
        <button onClick={() => setCount(count + 1)}>count + 1</button>
        <button className="ghost" onClick={() => setCount(0)}>归零</button>
      </div>
      <p className="learn-note">受控输入（value + onChange）：当前输入「{text || "（空）"}」</p>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入试试" />
    </div>
  );
}

function ReactListDemo() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("未加载");
  async function load() {
    setStatus("加载中…");
    try {
      const data = await api("/api/learn/demo/chain?class_name=计科2501");
      setRows(data.rows);
      setStatus(`已加载 ${data.rows.length} 行`);
    } catch (e) { setStatus("失败：" + e.message); }
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="learn-demo-box">
      <p className="learn-note">useEffect + fetch + map 渲染列表 —— 状态：{status}</p>
      <div className="learn-table-wrap">
        <table className="learn-table">
          <thead><tr><th>课程</th><th>教师</th><th>星期</th><th>大节</th><th>教室</th></tr></thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.id}><td>{r.course}</td><td>{r.teacher}</td><td>周{r.weekday}</td><td>第{r.period}节</td><td>{roomFriendly(r.location)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="learn-controls">
        <button onClick={load}><Play size={14} /> 重新加载</button>
        <span className="learn-note">点一次就会重新发一次请求：状态先变「加载中…」，拿到数据后 setRows 再触发重画。</span>
      </div>
    </div>
  );
}

/* ============ 前端：迷你 JSX 转译器 ============ */
/*
 * 为什么需要它？
 * 浏览器只认识 JavaScript，不认识 JSX。平时 Vite 是在「构建时」把 JSX 编译成 JS 的，
 * 但学习中心要让学习者「改完代码立刻运行」，必须在「运行时」编译，所以这里手写了一个迷你转译器。
 *
 * 它只做一件事：把 JSX 换成 React.createElement 的调用（别名 h）
 *    <div className="box">你好 {n}</div>   →   h("div", { "className": "box" }, "你好 ", (n))
 * 其余的普通 JavaScript（变量、函数、if、for、模板字符串……）原样保留，交给浏览器自己解析。
 */
const JSX_HOOK_NAMES = ["useState", "useEffect", "useMemo", "useRef", "useCallback"];

// 出现在 `<` 前面的关键字，说明后面的 `<` 是 JSX 的开始（而不是「小于号」比较运算）
const JSX_KEYWORDS = new Set([
  "return", "typeof", "case", "delete", "void", "new", "in", "of",
  "do", "else", "yield", "await", "instanceof", "throw",
]);
// 出现在 `<` 前面的这些符号，同样说明后面是 JSX（如 `=>`、`(`、`,`、`&&`、`||`、`{` 之后）
const JSX_PREV_OK = new Set(["(", ",", "{", "[", "=", ":", "?", "}", ";", "&", "|", "!", "+", "*", "%", "^", "~", ">"]);

/** 算出下标 idx 在第几行（用于把报错定位到行） */
function jsxLineOf(src, idx) {
  let n = 1;
  for (let k = 0; k < idx && k < src.length; k++) if (src[k] === "\n") n++;
  return n;
}

/** 从字符串开头（' 或 "）一直跳过去，返回结束位置；顺便处理反斜杠转义 */
function jsxSkipString(src, i) {
  const quote = src[i];
  let k = i + 1;
  while (k < src.length) {
    if (src[k] === "\\") { k += 2; continue; }
    if (src[k] === quote) return k + 1;
    k++;
  }
  throw new Error(`第 ${jsxLineOf(src, i)} 行：字符串没有闭合（少了配对的引号）`);
}

/** 从模板字符串（`）开头跳过去，内部 ${} 里的括号也要配对 */
function jsxSkipTemplate(src, i) {
  let k = i + 1;
  while (k < src.length) {
    const c = src[k];
    if (c === "\\") { k += 2; continue; }
    if (c === "`") return k + 1;
    if (c === "$" && src[k + 1] === "{") {
      k += 2;
      let depth = 1;
      while (k < src.length && depth > 0) {
        const d = src[k];
        if (d === "'" || d === '"') { k = jsxSkipString(src, k); continue; }
        if (d === "`") { k = jsxSkipTemplate(src, k); continue; }
        if (d === "{") depth++;
        else if (d === "}") depth--;
        k++;
      }
      continue;
    }
    k++;
  }
  throw new Error(`第 ${jsxLineOf(src, i)} 行：模板字符串没有闭合（少了反引号）`);
}

/** 取 `<` 之前最近的一个「词」，用来判断这个 `<` 是 JSX 还是小于号 */
function jsxPrevToken(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return "";
  if (/[A-Za-z0-9_$]/.test(src[j])) {
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(src[k])) k--;
    return src.slice(k + 1, j + 1);
  }
  return src[j];
}

/** 判断 src[i]（值为 '<'）是不是 JSX 的开始 */
function jsxStartsAt(src, i) {
  const next = src[i + 1];
  if (!next || !/[A-Za-z_$>]/.test(next)) return false;
  const prev = jsxPrevToken(src, i);
  if (prev === "") return true;                      // 文件/括号开头
  if (JSX_KEYWORDS.has(prev)) return true;           // return <div>
  return JSX_PREV_OK.has(prev);                      // ( , { = => && || …
}

/** 读取一对花括号 { ... }，返回 [结束位置, 里面的表达式（已递归转译过 JSX）] */
function jsxReadBraced(src, j) {
  let k = j + 1;
  let depth = 1;
  while (k < src.length) {
    const c = src[k];
    if (c === "'" || c === '"') { k = jsxSkipString(src, k); continue; }
    if (c === "`") { k = jsxSkipTemplate(src, k); continue; }
    if (c === "/" && src[k + 1] === "/") {
      const e = src.indexOf("\n", k);
      k = e === -1 ? src.length : e;
      continue;
    }
    if (c === "/" && src[k + 1] === "*") {
      const e = src.indexOf("*/", k + 2);
      k = e === -1 ? src.length : e + 2;
      continue;
    }
    if (c === "{") { depth++; k++; continue; }
    if (c === "}") {
      depth--;
      if (depth === 0) break;
      k++;
      continue;
    }
    if (c === "<" && jsxStartsAt(src, k)) { k = jsxParseElement(src, k)[0]; continue; } // 跳过嵌套 JSX
    k++;
  }
  if (k >= src.length) throw new Error(`第 ${jsxLineOf(src, j)} 行：「{」没有对应的「}」`);
  return [k + 1, transformJsx(src.slice(j + 1, k))];
}

/**
 * JSX 里标签之间的文本怎么处理？
 * 规则和 Babel 一致：按行拆开，非首行去掉行首空白、非末行去掉行尾空白，
 * 空白行丢弃，剩下的用单个空格连接。这样才能做到「缩进不影响显示」。
 */
function jsxNormalizeText(text) {
  const lines = text.split("\n");
  const out = [];
  lines.forEach((line, idx) => {
    let l = line;
    if (idx !== 0) l = l.replace(/^\s+/, "");
    if (idx !== lines.length - 1) l = l.replace(/\s+$/, "");
    if (l !== "") out.push(l);
  });
  return out.join(" ");
}

/** 解析子节点：文本、{表达式}、嵌套标签，直到遇到 </结束标签> */
function jsxParseChildren(src, j, openTag, openAt) {
  const kids = [];
  let text = "";
  const flush = () => {
    const norm = jsxNormalizeText(text);   // 折叠空白，让缩进不影响显示
    if (norm) kids.push(JSON.stringify(norm));
    text = "";
  };
  while (true) {
    if (j >= src.length) throw new Error(`第 ${jsxLineOf(src, openAt)} 行：<${openTag || ">"}> 没有闭合（缺少结束标签）`);
    if (src[j] === "<" && src[j + 1] === "/") {          // 结束标签
      flush();
      j += 2;
      while (j < src.length && src[j] !== ">") j++;
      return [j + 1, kids];
    }
    if (src[j] === "<") { flush(); const [stop, node] = jsxParseElement(src, j); kids.push(node); j = stop; continue; }
    if (src[j] === "{") { flush(); const [stop, expr] = jsxReadBraced(src, j); kids.push(`(${expr})`); j = stop; continue; }
    text += src[j];
    j++;
  }
}

/** 解析一个元素（含 Fragment <>...</>），返回 [结束位置, 生成的 h(...) 代码] */
function jsxParseElement(src, i) {
  if (src[i + 1] === ">") {                              // Fragment：<> ... </>
    const [stop, kids] = jsxParseChildren(src, i + 2, ">", i);
    return [stop, `h(React.Fragment, null${kids.length ? ", " + kids.join(", ") : ""})`];
  }
  let j = i + 1;
  let tag = "";
  while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j])) { tag += src[j]; j++; }
  if (!tag) throw new Error(`第 ${jsxLineOf(src, i)} 行：标签名不合法`);
  // 小写开头（且不含点号）是 HTML 标签 → 变成字符串；大写开头或 A.B 形式是组件 → 保持变量引用
  const tagExpr = /^[a-z]/.test(tag) && !tag.includes(".") ? JSON.stringify(tag) : tag;

  const props = [];
  let selfClose = false;
  while (true) {
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === "/" && src[j + 1] === ">") { j += 2; selfClose = true; break; }   // 自闭合
    if (src[j] === ">") { j++; break; }
    if (j >= src.length) throw new Error(`第 ${jsxLineOf(src, i)} 行：标签 <${tag}> 缺少「>」`);
    if (src[j] === "{") {                                // {...props} 展开
      const [stop, expr] = jsxReadBraced(src, j);
      props.push(`...(${expr})`);
      j = stop;
      continue;
    }
    let name = "";
    while (j < src.length && !/[\s=/>]/.test(src[j])) { name += src[j]; j++; }
    if (!name) throw new Error(`第 ${jsxLineOf(src, j)} 行：属性名不合法`);
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === "=") {
      j++;
      while (j < src.length && /\s/.test(src[j])) j++;
      const v = src[j];
      if (v === '"' || v === "'") {                      // 属性="字符串"
        const stop = jsxSkipString(src, j);
        props.push(`${JSON.stringify(name)}: ${src.slice(j, stop)}`);
        j = stop;
      } else if (v === "{") {                            // 属性={表达式}
        const [stop, expr] = jsxReadBraced(src, j);
        props.push(`${JSON.stringify(name)}: ${expr}`);
        j = stop;
      } else {                                           // 属性=裸值（罕见），原样保留
        let raw = "";
        while (j < src.length && !/[\s>]/.test(src[j])) { raw += src[j]; j++; }
        props.push(`${JSON.stringify(name)}: ${raw}`);
      }
    } else {
      props.push(`${JSON.stringify(name)}: true`);        // 只写名字的属性 = true（如 disabled）
    }
  }
  const propStr = props.length ? `{ ${props.join(", ")} }` : "null";
  if (selfClose) return [j, `h(${tagExpr}, ${propStr})`];
  const [stop, kids] = jsxParseChildren(src, j, tag, i);
  return [stop, `h(${tagExpr}, ${propStr}${kids.length ? ", " + kids.join(", ") : ""})`];
}

/** 模板字符串：内部 ${...} 里可能出现 JSX，也要转译 */
function jsxTransformTemplate(src, i) {
  let k = i + 1;
  let out = "`";
  while (k < src.length) {
    const c = src[k];
    if (c === "\\") { out += src.slice(k, k + 2); k += 2; continue; }
    if (c === "`") return [k + 1, out + "`"];
    if (c === "$" && src[k + 1] === "{") {
      out += "${";
      k += 2;
      const start = k;
      let depth = 1;
      while (k < src.length && depth > 0) {
        const d = src[k];
        if (d === "'" || d === '"') { k = jsxSkipString(src, k); continue; }
        if (d === "`") { k = jsxSkipTemplate(src, k); continue; }
        if (d === "{") depth++;
        else if (d === "}") { depth--; if (depth === 0) break; }
        k++;
      }
      out += transformJsx(src.slice(start, k)) + "}";
      k++;
      continue;
    }
    out += c;
    k++;
  }
  throw new Error(`第 ${jsxLineOf(src, i)} 行：模板字符串没有闭合（少了反引号）`);
}

/** 主流程：扫描整段代码，只把其中的 JSX 片段替换掉，其余原样输出 */
function transformJsx(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {                 // 行注释：原样保留，不解析里面的 <div>
      const e = src.indexOf("\n", i);
      const stop = e === -1 ? src.length : e;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {                 // 块注释
      const e = src.indexOf("*/", i + 2);
      const stop = e === -1 ? src.length : e + 2;
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") { const stop = jsxSkipString(src, i); out += src.slice(i, stop); i = stop; continue; }
    if (c === "`") { const [stop, inner] = jsxTransformTemplate(src, i); out += inner; i = stop; continue; }
    if (c === "<" && jsxStartsAt(src, i)) {                // 找到 JSX，开始解析
      const [stop, node] = jsxParseElement(src, i);
      out += node;
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 把学习者写的代码编译成「可运行的 React 组件」，返回 { ok, Component } 或 { ok:false, error } */
function compileJsx(source) {
  let js;
  try {
    js = transformJsx(source);
  } catch (e) {
    return { ok: false, error: `转译失败 → ${e.message}` };
  }
  try {
    const factory = new Function(
      "React", "h", ...JSX_HOOK_NAMES,
      `"use strict";\n${js}\nif (typeof App !== "function") throw new Error("找不到入口组件：请把组件命名为 App（首字母大写）");\nreturn App;`,
    );
    const Component = factory(React, React.createElement, useState, useEffect, useMemo, useRef, React.useCallback);
    return { ok: true, Component, js };
  } catch (e) {
    return { ok: false, error: `运行失败 → ${e.message}` };
  }
}

/* 预览区错误边界：学习者的代码报错时，只在这里显示错误，不让整个学习中心白屏 */
class PreviewBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error) {
      return (
        <div className="learn-error">
          组件运行出错 → {this.state.error.message}
          <br />
          <span className="learn-note">常见原因：用了没定义的变量、把 hooks 写在 if 里、渲染时直接改了状态。点「重置示例」可恢复。</span>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 概念讲解卡片：用来讲清「为什么会有这个概念」 */
function WhyBox({ title, children }) {
  return (
    <div className="learn-why">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

/** 前端通用「JSX 代码台」：左边改代码，右边立刻运行，真实 React 组件在跑 */
function JsxRunner({ lesson }) {
  const [code, setCode] = useState(lesson.code);
  const [result, setResult] = useState(() => compileJsx(lesson.code));
  const [runKey, setRunKey] = useState(0);

  function apply(next) {
    setResult(compileJsx(next));
    setRunKey((k) => k + 1);
  }
  function reset() {
    setCode(lesson.code);
    apply(lesson.code);
  }
  const Comp = result.ok ? result.Component : null;

  return (
    <div className="learn-runner">
      {lesson.title ? <p className="learn-lab-title">{lesson.title}</p> : null}
      <div className="learn-editor-row">
        <textarea className="learn-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
        <div className="learn-preview learn-preview-app">
          {Comp ? (
            <PreviewBoundary resetKey={runKey}>
              <Comp key={runKey} />
            </PreviewBoundary>
          ) : (
            <div className="learn-3d-empty">点「运行代码」查看效果</div>
          )}
        </div>
      </div>
      <div className="learn-controls">
        <button onClick={() => apply(code)}><Play size={14} /> 运行代码</button>
        <button className="ghost" onClick={reset}><RotateCcw size={14} /> 重置示例</button>
        <CopyButton text={code} />
        <span className="learn-note">{lesson.hint || "改代码 → 点「运行代码」，右边立刻重画（在跑的是真实 React 组件）"}</span>
      </div>
      {result.error ? <p className="learn-error">{result.error}</p> : null}
      <NotesList title={lesson.notesTitle || "这段代码在做什么"} notes={lesson.notes} />
    </div>
  );
}

/* ============ 后端：接口测试器 ============ */
function ApiTester({ lesson }) {
  const [path, setPath] = useState(lesson.api.path);
  const [method, setMethod] = useState(lesson.api.method);
  const [body, setBody] = useState(lesson.api.body || "");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setResult(null);
    try {
      const data = await api(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body || undefined,
      });
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, error: e.message });
    }
    setBusy(false);
  }
  return (
    <div className="learn-runner">
      <div className="learn-controls">
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {["GET", "POST"].map((m) => <option key={m}>{m}</option>)}
        </select>
        <input className="learn-url" value={path} onChange={(e) => setPath(e.target.value)} />
        <button onClick={run} disabled={busy}><Play size={14} /> 发送请求</button>
      </div>
      {lesson.api.params && (
        <p className="learn-note">可传参数：{lesson.api.params.join("　")}</p>
      )}
      {method === "POST" && (
        <textarea className="learn-code small" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} placeholder="JSON 请求体" />
      )}
      {result && (
        <div className={`learn-result ${result.ok ? "" : "learn-error"}`}>
          <p className="learn-note">{result.ok ? "响应 JSON（真实调用后端）：" : "调用失败："}</p>
          <pre className="learn-json">{JSON.stringify(result.ok ? result.data : result.error, null, 1)}</pre>
        </div>
      )}
    </div>
  );
}

/* ============ 数据库：SQL 控制台 ============ */
function SqlConsole({ lesson }) {
  const [sql, setSql] = useState(lesson.sql.initial);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [schema, setSchema] = useState(null);
  async function run(statement) {
    const text = (statement ?? sql).trim();
    if (!text) return;
    setBusy(true); setError("");
    try {
      const data = await api("/api/learn/sql", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql: text }) });
      setResult(data);
    } catch (e) { setError(e.message); setResult(null); }
    setBusy(false);
  }
  async function loadSchema() {
    try { setSchema(await api("/api/learn/schema")); } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadSchema(); run(lesson.sql.initial); }, []); // eslint-disable-line
  return (
    <div className="learn-runner">
      <div className="learn-sqlbar">
        {(lesson.sql.presets || []).map((preset) => (
          <button key={preset.label} className="learn-preset" onClick={() => { setSql(preset.sql); run(preset.sql); }}>{preset.label}</button>
        ))}
        <button className="learn-preset danger" onClick={async () => { await api("/api/learn/reset", { method: "POST" }); run(lesson.sql.initial); }}>重置测试库</button>
      </div>
      <textarea className="learn-code small" value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />
      <div className="learn-controls">
        <button onClick={() => run()} disabled={busy}><Play size={14} /> 执行 SQL</button>
        <CopyButton text={sql} />
        <span className="learn-note">只允许单条 SELECT / INSERT / UPDATE（运行在测试库 learn_test.db，结构同正式库）</span>
      </div>
      <SqlExplained sql={result?.sql || sql} note={lesson.sql.note} />
      {error && <p className="learn-error">{error}</p>}
      {result && (
        <div className="learn-result">
          <p className="learn-note">
            {result.kind === "select"
              ? `查询返回 ${result.row_count} 行，耗时 ${result.elapsed_ms} ms`
              : `写入成功，影响 ${result.affected} 行，耗时 ${result.elapsed_ms} ms`}
          </p>
          {result.kind === "select" && result.rows.length > 0 && (
            <div className="learn-table-wrap">
              <table className="learn-table">
                <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>{result.columns.map((c) => <td key={c}>{String(row[c])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {schema && (
        <details>
          <summary>测试库表结构（与正式库一致 + 教学物化表）</summary>
          <div className="learn-table-wrap">
            <table className="learn-table">
              <thead><tr><th>表</th><th>字段</th><th>行数</th></tr></thead>
              <tbody>
                {schema.tables.map((t) => (
                  <tr key={t.table}>
                    <td><b>{t.table}</b></td>
                    <td className="learn-dim">{t.columns.map((c) => `${c.name}${c.pk ? "(PK)" : ""}`).join(", ")}</td>
                    <td>{t.row_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/* ============ 数据库：后端代码运行器 ============ */
function PyRunner({ lesson }) {
  const [code, setCode] = useState(lesson.py.code);
  const [steps, setSteps] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setError("");
    try {
      const data = await api("/api/learn/run-python", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      setSteps(data.steps);
    } catch (e) { setError(e.message); setSteps(null); }
    setBusy(false);
  }
  return (
    <div className="learn-runner">
      <textarea className="learn-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
      <div className="learn-controls">
        <button onClick={run} disabled={busy}><Play size={14} /> 运行后端代码</button>
        <button className="ghost" onClick={() => setCode(lesson.py.code)}><RotateCcw size={14} /> 重置</button>
        <span className="learn-note">教学安全解释器：按你代码里的先后顺序，提取并执行 db.execute(...) / db_rows(...) 中的 SQL（在测试库执行，不执行任意 Python）</span>
      </div>
      <NotesList title="这段后端代码在做什么" notes={lesson.py.notes} />
      {error && <p className="learn-error">{error}</p>}
      {steps && steps.map((step, i) => (
        <div key={i} className={`learn-result ${step.ok ? "" : "learn-error"}`}>
          <p className="learn-note">
            第 {i + 1} 条 · 来自你代码的第 {step.line} 行 · {step.origin}
            {step.ok
              ? `：${step.kind === "select" ? `查询返回 ${step.row_count} 行` : `写入影响 ${step.affected} 行`}，耗时 ${step.elapsed_ms} ms`
              : ` 执行失败：${step.error}`}
          </p>
          <pre className="learn-sql">{step.sql}</pre>
          {step.ok && step.kind === "select" && step.rows.length > 0 && (
            <div className="learn-table-wrap">
              <table className="learn-table">
                <thead><tr>{step.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{step.rows.map((row, j) => <tr key={j}>{step.columns.map((c) => <td key={c}>{String(row[c])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============ RAG：问答测试器 ============ */
function RagTester() {
  const [q, setQ] = useState("计科2501周一到周五都有几节课？");
  const [cls, setCls] = useState("计科2501");
  const [result, setResult] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const classList = useClassList();
  async function ask() {
    setBusy(true); setResult(null);
    try {
      setResult(await api("/api/rag/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, class_name: cls }) }));
    } catch (e) { setResult({ answer: "失败：" + e.message, sources: [] }); }
    setBusy(false);
  }
  return (
    <div className="learn-runner">
      <div className="learn-controls">
        <select value={cls} onChange={(e) => setCls(e.target.value)}>{classList.map((c) => <option key={c}>{c}</option>)}</select>
        <input className="learn-url" value={q} onChange={(e) => setQ(e.target.value)} />
        <button onClick={ask} disabled={busy}><Play size={14} /> 提问</button>
        <button className="ghost" onClick={async () => setEvalResult(await api("/api/rag/eval"))}>运行评测集</button>
      </div>
      {result && (
        <div className="learn-result">
          <p><b>意图：</b>{result.intent}</p>
          <pre className="learn-answer">{result.answer}</pre>
          {result.sources?.length > 0 && (
            <p className="learn-note">数据溯源：{result.sources.map((s) => `${s.source}·${s.ref}`).join("　")}</p>
          )}
        </div>
      )}
      {evalResult && (
        <div className="learn-result">
          <p className="learn-note">评测集：{evalResult.passed}/{evalResult.total} 通过（通过率 {Math.round(evalResult.rate * 100)}%）</p>
        </div>
      )}
    </div>
  );
}

/* ============ 3D：知识点总览表 ============ */
const D3_POINTS = [
  ["场景 Scene", "所有三维物体的容器；没有场景就无处安放模型", "每一关都在用", "src/App.jsx · 2071 行 <Canvas>"],
  ["相机 Camera", "决定「从哪里、以多大视角看」，相当于你的眼睛", "L1 默认 / 可写 camera()", "src/App.jsx · 2083 行 <PerspectiveCamera>"],
  ["坐标系", "Y 轴向上，X 是左右，Z 是前后；三轴交点就是原点", "L2", "src/App.jsx · 362 行 y = building.h / 2"],
  ["几何体 Geometry", "物体的形状：盒、圆柱、圆锥、圆环……都是数学描述", "L1 / L3 / L4", "src/App.jsx · 413 行 boxGeometry、346 行 cylinderGeometry"],
  ["位置 / 尺寸 / 旋转", "几何体以「自身中心」定位，position 给的是中心点坐标", "L2 / L4", "blender/generate_campus.py · 84 行 obj.location / obj.scale"],
  ["材质 Material", "表面怎么反光：颜色、金属度、粗糙度、自发光", "L5", "src/App.jsx · 318 行 mat(color, metalness, roughness)"],
  ["灯光 Light", "没有灯，再正确的模型也是一片黑", "L5", "src/App.jsx · 1452-1462 行 环境光/半球光/平行光"],
  ["阴影 Shadow", "光被物体挡住产生的投影，靠 castShadow / receiveShadow 开关", "L5", "src/App.jsx · 1462 行 shadow-mapSize={[1024, 1024]}"],
  ["动画 Animation", "每一帧改一点点属性；必须乘 delta，否则「性能好的机器转得更快」", "L6", "src/App.jsx · 861 行 useFrame、904 行 MathUtils.damp"],
  ["交互 Interaction", "鼠标点击 → 射线拾取到某个物体 → 回调函数改界面状态", "L7", "src/App.jsx · 944 行 onClick 回溯 building_code"],
  ["模型文件 GLB", "Blender 里做好的模型导出成 glb，网页用 useGLTF 加载", "真实模型对比", 'src/App.jsx · 684 行 useGLTF("/assets/yueyang_campus.glb")'],
];

function D3ConceptMap() {
  return (
    <div className="learn-demo-box">
      <div className="learn-table-wrap">
        <table className="learn-table">
          <thead><tr><th>知识点</th><th>一句话解释</th><th>在哪一关动手</th><th>项目里对应的源码</th></tr></thead>
          <tbody>
            {D3_POINTS.map((row) => (
              <tr key={row[0]}>
                <td><b>{row[0]}</b></td>
                <td className="learn-dim">{row[1]}</td>
                <td>{row[2]}</td>
                <td className="learn-dim"><code>{row[3]}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="learn-note">
        一句话总结：<b>几何体</b>决定形状 → <b>位置/旋转</b>决定摆放 → <b>材质 + 灯光</b>决定看起来像什么 →
        <b>相机</b>决定怎么看 → <b>动画</b>让它动起来 → <b>交互</b>让它能被操作。项目里 2000 行的 App.jsx，拆开就是这几件事的反复组合。
      </p>
    </div>
  );
}

/* ============ 3D：加载项目真实 GLB 模型 ============ */
function RealModelViewer() {
  const [show, setShow] = useState(true);
  return (
    <div className="learn-runner">
      <div className="learn-controls">
        <button onClick={() => setShow(!show)}>{show ? "移除模型（对比空场景）" : "加载项目真实 GLB 模型"}</button>
        <span className="learn-note">yueyang_campus.glb · 6.4MB · 由 blender/generate_campus.py 批量生成</span>
      </div>
      <div className="learn-preview learn-preview-3d" style={{ marginTop: 9 }}>
        {/* key 变化 → 重建 Canvas，方便对比「有模型 / 空场景」 */}
        <Canvas key={show ? "with-model" : "empty"} shadows camera={{ position: [0, 340, 520], fov: 45, near: 1, far: 4000 }}>
          <color attach="background" args={["#0b1a28"]} />
          <ambientLight intensity={1.2} />
          <hemisphereLight intensity={0.9} />
          <directionalLight position={[180, 320, 160]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
          {show && (
            <Suspense fallback={<Html center><div className="learn-note">GLB 模型加载中（6.4MB，首次会慢一点）…</div></Html>}>
              <RealCampusModel />
            </Suspense>
          )}
          <OrbitControls enableDamping minDistance={40} maxDistance={2200} />
        </Canvas>
      </div>
      <NotesList title="这一关讲什么" notes={[
        { lines: "两种来源", text: "前面 7 关的模型是「十几行代码现算出来的」；这里的模型是「Blender 提前做好、导出成 glb 文件」的。加载方式不同，但坐标、材质、光照原理完全一样。" },
        { lines: "useGLTF", text: 'useGLTF("/assets/yueyang_campus.glb") 把二进制模型文件解析成 Three.js 的场景树，交给 <primitive object={...} /> 渲染。' },
        { lines: "为什么要克隆", text: "gltf.scene 是模块级缓存，多个页面共用。直接改它会互相污染，所以项目里用 gltf.scene.clone(true) 复制一份再改。" },
        { lines: "包围盒居中", text: "克隆后用 Box3 量出模型的包围盒，把中心移到原点 —— 否则模型可能出现在相机视野外，看起来就是「一片空白」。" },
        { lines: "文件大小", text: "6.4MB 的模型在弱网下会明显卡顿，所以项目做了加载中的占位提示，并另准备了 FallbackCampus 用几何体拼出简易校园兜底。" },
      ]} />
    </div>
  );
}


function RealCampusModel() {
  const gltf = useGLTF("/assets/yueyang_campus.glb");
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    // 让模型包围盒中心落在原点，便于统一相机取景
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    cloned.position.sub(center);
    cloned.position.y += box.getSize(new THREE.Vector3()).y / 2;
    return cloned;
  }, [gltf.scene]);
  return <primitive object={scene} />;
}

/* ================================================================
   3D：可编辑的建模代码台
   左侧写「建模 DSL」代码 → 转译成 JS 真实执行 → 右侧 R3F 立刻渲染。
   DSL 不是凭空造的语言，它就是 blender/generate_campus.py 里
   cube(name, location, scale, mat) 那一行的教学版：
     项目脚本  cube('B01_body', (x, 0, z), (w, h, d), mat)
     这里      box(w, h, d, x, y, z, color)
   ================================================================ */

// 每个建模函数的「位置参数顺序」——用于把 box(2,2,2) 翻译成 {w:2,h:2,d:2}
const MODEL_SIG = {
  ground: ["size", "color", "grid"],
  box: ["w", "h", "d", "x", "y", "z", "color", "metalness", "roughness", "spin", "float", "id"],
  cylinder: ["r", "h", "x", "y", "z", "color", "metalness", "roughness", "spin", "float", "id"],
  cone: ["r", "h", "x", "y", "z", "color", "spin", "float", "id"],
  torus: ["R", "r", "x", "y", "z", "color", "spin", "float", "id"],
  light: ["kind", "intensity", "x", "y", "z", "color"],
  camera: ["x", "y", "z", "fov"],
};
const MODEL_FUNCS = ["box", "cylinder", "cone", "torus", "ground", "light", "camera"];
const MODEL_LIMIT = 300;

/** 去掉行尾注释：遇到引号里的 # 不算注释（颜色值 "#4fc3f7" 不能被截断） */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "#") return line.slice(0, i);
  }
  return line;
}

/** 按「顶层」逗号切分：括号里的逗号（如 range(1, 3)）不切 */
function splitTop(text, separator) {
  const out = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (ch === separator && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 括号是否配平（用于在转译阶段就给出「第 N 行括号没配对」的友好报错） */
function balanced(text) {
  let depth = 0;
  let quote = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0 && !quote;
}

/** 把一次建模调用翻译成「一个对象参数」，位置参数与命名参数都支持 */
function translateCall(statement, lineNo) {
  const match = statement.match(/^([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/);
  if (!match) return statement; // 不是函数调用，原样交给运行时（会报错并指出行号）
  const [, name, rawArgs] = match;
  const sig = MODEL_SIG[name];
  if (!sig) throw new Error(`第 ${lineNo} 行：不支持的建模函数 ${name}()。可用：${MODEL_FUNCS.join(" / ")}`);
  const props = [];
  let slot = 0;
  for (const arg of splitTop(rawArgs, ",")) {
    const kv = arg.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/);
    if (kv) props.push(`"${kv[1]}":(${kv[2]})`);
    else {
      if (slot >= sig.length) throw new Error(`第 ${lineNo} 行：${name}() 最多 ${sig.length} 个参数（${sig.join(", ")}）`);
      props.push(`"${sig[slot]}":(${arg})`);
      slot += 1;
    }
  }
  return `${name}({${props.join(",")}});`;
}

/**
 * 极简转译器：把建模 DSL 翻成 JS。
 * 支持 注释(#) / 变量赋值 / 算术 / for i in range(n) 循环 / 每行多条语句(;)。
 * 返回 { js, marks }：marks[i] 是第 i 行 JS 对应的 DSL 行号，用于报错定位。
 */
function transpileModel(source) {
  const lines = source.split("\n");
  const js = [];
  const marks = [];
  const openIndents = [];
  const emit = (text, lineNo) => {
    js.push(text);
    marks.push(lineNo);
  };

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = stripComment(rawLine).replace(/\t/g, "  ");
    if (!line.trim() || line.trim() === "}") return; // 空行、纯注释、手写的右花括号都跳过
    const indent = rawLine.match(/^ */)[0].length;

    // 缩进回退 → 关闭之前打开的 for 循环
    while (openIndents.length && indent <= openIndents[openIndents.length - 1]) {
      emit("}", lineNo);
      openIndents.pop();
    }

    for (const statement of splitTop(line.trim(), ";")) {
      if (!balanced(statement))
        throw new Error(`第 ${lineNo} 行：括号没有配对，检查 ( ) 是否成对出现`);
      const forMatch = statement.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\s*\(([^)]*)\)\s*:$/);
      if (forMatch) {
        const [, variable, rangeArgs] = forMatch;
        const bounds = splitTop(rangeArgs, ",");
        if (bounds.length === 1) emit(`__mark(${lineNo});for(let ${variable}=0;${variable}<(${bounds[0]});${variable}+=1){`, lineNo);
        else if (bounds.length === 2) emit(`__mark(${lineNo});for(let ${variable}=(${bounds[0]});${variable}<(${bounds[1]});${variable}+=1){`, lineNo);
        else throw new Error(`第 ${lineNo} 行：range() 只支持 range(n) 或 range(起, 止)`);
        openIndents.push(indent);
        continue;
      }
      const assign = statement.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/);
      if (assign && !MODEL_FUNCS.includes(assign[1])) {
        emit(`__mark(${lineNo});let ${assign[1]}=(${assign[2]});`, lineNo);
        continue;
      }
      emit(`__mark(${lineNo});${translateCall(statement, lineNo)}`, lineNo);
    }
  });

  while (openIndents.length) {
    emit("}", lines.length);
    openIndents.pop();
  }
  return { js: js.join("\n"), marks };
}

/** 执行建模代码：把生成的几何体清单交给 React 渲染（只暴露建模函数，拿不到别的东西） */
function runModelCode(source) {
  const { js } = transpileModel(source);
  const ctx = {
    objects: [],
    lights: [],
    ground: null,
    camera: { x: 20, y: 18, z: 26, fov: 45 },
    lastLine: 0,
  };
  const cap = () => {
    if (ctx.objects.length >= MODEL_LIMIT)
      throw new Error(`几何体数量超过上限 ${MODEL_LIMIT} 个（一般是循环次数太大），请减小循环次数`);
  };
  const api = {
    box: (o) => { cap(); ctx.objects.push({ kind: "box", ...o }); },
    cylinder: (o) => { cap(); ctx.objects.push({ kind: "cylinder", ...o }); },
    cone: (o) => { cap(); ctx.objects.push({ kind: "cone", ...o }); },
    torus: (o) => { cap(); ctx.objects.push({ kind: "torus", ...o }); },
    ground: (o) => { ctx.ground = { size: 60, color: "#31473b", grid: 1, ...o }; },
    light: (o) => { ctx.lights.push({ kind: "sun", intensity: 1.5, x: 12, y: 20, z: 10, color: "#ffffff", ...o }); },
    camera: (o) => { ctx.camera = { ...ctx.camera, ...o }; },
  };
  const mark = (n) => { ctx.lastLine = n; };
  try {
    // 这是唯一执行用户代码的地方；参数里只有建模函数，没有 fetch / window / require
    // eslint-disable-next-line no-new-func
    new Function(...MODEL_FUNCS, "__mark", js)(...MODEL_FUNCS.map((name) => api[name]), mark);
  } catch (error) {
    // 用 __mark() 记录的「最后执行到第几行」把报错定位回源码行号
    const where = ctx.lastLine ? `第 ${ctx.lastLine} 行：` : "";
    throw new Error(`${where}${error.message}`);
  }
  if (!ctx.lights.length) {
    // 没写 light() 时给一套默认三点光，保证一定看得见东西
    ctx.lights = [
      { kind: "ambient", intensity: 0.55, color: "#ffffff" },
      { kind: "hemi", intensity: 0.6, color: "#dceae5" },
      { kind: "sun", intensity: 1.9, x: 12, y: 20, z: 10, color: "#ffffff" },
    ];
  }
  return ctx;
}

/** 场景里的一批几何体：逐帧驱动「旋转 / 浮动 / 点击升起」动画 */
function ModelStage({ model, selectedId, onSelect }) {
  const refs = useRef([]);
  useFrame((state, delta) => {
    model.objects.forEach((item, index) => {
      const mesh = refs.current[index];
      if (!mesh) return;
      const isSelected = Boolean(item.id) && item.id === selectedId;
      const targetY =
        (item.y || 0) +
        (isSelected ? 1.6 : 0) +
        (item.float ? Math.sin(state.clock.elapsedTime * 1.5 + index) * item.float : 0);
      // damp = 带阻尼的插值，项目里「点击楼栋弹起」用的同一个函数
      mesh.position.y = THREE.MathUtils.damp(mesh.position.y, targetY, 4, delta);
      if (item.spin) mesh.rotation.y += (delta * item.spin * Math.PI) / 180;
      if (isSelected) mesh.rotation.y += delta * 0.4;
    });
  });
  return (
    <group>
      {model.objects.map((item, index) => {
        const isSelected = Boolean(item.id) && item.id === selectedId;
        return (
          <mesh
            key={index}
            ref={(node) => { refs.current[index] = node; }}
            position={[item.x || 0, item.y || 0, item.z || 0]}
            castShadow
            receiveShadow
            onClick={item.id ? (event) => { event.stopPropagation(); onSelect(item.id); } : undefined}
          >
            {item.kind === "box" ? <boxGeometry args={[item.w || 1, item.h || 1, item.d || 1]} />
              : item.kind === "cylinder" ? <cylinderGeometry args={[item.r || 0.5, item.r || 0.5, item.h || 1, 24]} />
                : item.kind === "cone" ? <coneGeometry args={[item.r || 0.5, item.h || 1, 20]} />
                  : <torusGeometry args={[item.R || 1, item.r || 0.3, 12, 32]} />}
            <meshStandardMaterial
              color={isSelected ? "#ff6464" : item.color || "#cfd8dc"}
              metalness={item.metalness === undefined ? 0.05 : item.metalness}
              roughness={item.roughness === undefined ? 0.7 : item.roughness}
              emissive={isSelected ? "#ff6464" : "#000000"}
              emissiveIntensity={isSelected ? 0.35 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** 3D 建模代码台本体 */
function ModelLab({ levels }) {
  const [level, setLevel] = useState(0);
  const [code, setCode] = useState(levels[0].code);
  const [model, setModel] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [runId, setRunId] = useState(0);

  function run(source) {
    const text = source === undefined ? code : source;
    try {
      setModel(runModelCode(text)); // 转译 + 执行
      setError("");
      setSelected(null);
      setRunId((n) => n + 1);
    } catch (e) {
      setModel(null);
      setError(e.message);
    }
  }

  const current = levels[level];
  return (
    <div className="learn-runner">
      <div className="learn-sqlbar">
        {levels.map((item, index) => (
          <button
            key={item.id}
            className={level === index ? "learn-preset active" : "learn-preset"}
            onClick={() => { setLevel(index); setCode(item.code); run(item.code); }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="learn-editor-row">
        <textarea className="learn-code" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />
        <div className="learn-preview learn-preview-3d">
          {model ? (
            <Canvas
              key={runId}
              shadows
              dpr={[1, 1.5]}
              camera={{ position: [model.camera.x, model.camera.y, model.camera.z], fov: model.camera.fov }}
            >
              <color attach="background" args={["#0b1a28"]} />
              {model.lights.map((light, index) => (light.kind === "ambient" ? (
                <ambientLight key={index} intensity={light.intensity} color={light.color} />
              ) : light.kind === "hemi" ? (
                <hemisphereLight key={index} intensity={light.intensity} color={light.color} groundColor="#324437" />
              ) : (
                <directionalLight
                  key={index}
                  position={[light.x, light.y, light.z]}
                  intensity={light.intensity}
                  color={light.color}
                  castShadow
                  shadow-mapSize={[2048, 2048]}
                />
              )))}
              {model.ground && (
                <>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                    <planeGeometry args={[model.ground.size, model.ground.size]} />
                    <meshStandardMaterial color={model.ground.color} />
                  </mesh>
                  {model.ground.grid ? (
                    <gridHelper args={[model.ground.size, Math.max(2, Math.round(model.ground.size / 2)), "#3d5a6c", "#243642"]} />
                  ) : null}
                </>
              )}
              <ModelStage model={model} selectedId={selected} onSelect={setSelected} />
              <OrbitControls enableDamping />
            </Canvas>
          ) : (
            <div className="learn-3d-empty">改好代码，点「运行代码」看效果</div>
          )}
        </div>
      </div>
      <div className="learn-controls">
        <button onClick={() => run()}><Play size={14} /> 运行代码</button>
        <button className="ghost" onClick={() => { setCode(current.code); run(current.code); }}><RotateCcw size={14} /> 重置本关代码</button>
        <CopyButton text={code} />
        {selected && <button className="ghost" onClick={() => setSelected(null)}>取消选中 {selected}</button>}
      </div>
      <p className="learn-note"><b>{current.title}</b>　·　{current.tip}</p>
      {error && <p className="learn-error">{error}</p>}
      {model && (
        <p className="learn-note">
          本次运行生成 {model.objects.length} 个几何体 · 鼠标左键拖动旋转、滚轮缩放{selected ? ` · 当前选中 ${selected}` : ""}
        </p>
      )}
      <p className="learn-note">源码出处：<code>{current.source}</code></p>
      <NotesList notes={current.notes} title="这一关讲什么" />
      <details className="learn-doc">
        <summary>建模 DSL 速查表（点开对照着改代码）</summary>
        <div className="learn-notes">
          <div className="learn-note-item"><span className="learn-note-lines">注释</span><span><code>#</code> 开头到行尾都是注释，中文随便写</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">box</span><span><code>box(宽, 高, 深, x, y, z, 颜色)</code> —— 立方体，项目里所有楼体、窗带、地面块都用它</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">cylinder</span><span><code>cylinder(半径, 高, x, y, z, 颜色)</code> —— 圆柱，对应脚本里的 cylinder()（树干、旗杆）</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">cone / torus</span><span><code>cone(半径, 高, …)</code> 圆锥树冠；<code>torus(大半径, 小半径, …)</code> 圆环（体育场看台）</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">ground</span><span><code>ground(尺寸, 颜色, 网格1/0)</code> —— 铺一块地面，方便看清楼有没有陷进地里</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">light</span><span><code>light("sun"|"ambient"|"hemi", 强度, x, y, z)</code> —— 太阳/环境光/半球光，不写则用默认三点光</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">camera</span><span><code>camera(x, y, z, fov)</code> —— 相机位置与视野角度，决定「从哪看」</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">变量/运算</span><span><code>h = 6</code> 定义变量；表达式里可直接用 <code>+ - * /</code>，例如 <code>y = h / 2</code></span></div>
          <div className="learn-note-item"><span className="learn-note-lines">for 循环</span><span><code>for i in range(5):</code> 下面缩进的行会重复执行 5 次，i 取 0~4；也支持 <code>range(1, 5)</code></span></div>
          <div className="learn-note-item"><span className="learn-note-lines">材质</span><span>命名参数 <code>metalness=0.8</code>（金属度）、<code>roughness=0.15</code>（粗糙度）</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">动画</span><span>命名参数 <code>spin=60</code>（每秒转 60°）、<code>float=0.5</code>（上下浮动 0.5 米）</span></div>
          <div className="learn-note-item"><span className="learn-note-lines">交互</span><span>命名参数 <code>id="B01"</code> —— 带 id 的物体可以点击，点了会升起 1.6 米并变红高亮</span></div>
        </div>
      </details>
    </div>
  );
}

/* ============ 3D 建模台的分关代码（由易到难） ============ */
const MODEL_LEVELS = [
  {
    id: "m1",
    label: "L1 第一个方块",
    title: "L1　一行代码 = 一个立方体",
    tip: "先认识「几何体 + 位置 + 颜色」这三件套。改颜色或尺寸，点运行看变化。",
    source: "blender/generate_campus.py · cube()（60-92 行）",
    code: `# 以 # 开头的都是注释，中文随便写
# box(宽, 高, 深, x, y, z, 颜色)

ground(60, "#2a3b4d")                 # 铺一块 60x60 的地面，方便看位置
box(2, 2, 2, 0, 1, 0, "#4fc3f7")      # 边长 2 的立方体：y=1 让它的中心离地 1，刚好贴地`,
    notes: [
      { lines: "第 4 行", text: "ground() 只是一块平面地板，它本身不是建筑；有了它才看得出楼的 y 坐标对不对。" },
      { lines: "第 5 行", text: "box(2,2,2) 三个数字是「宽、高、深」（X/Y/Z 三个方向的尺寸），对应 Three.js 的 boxGeometry args=[w,h,d]。" },
      { lines: "第 5 行 y=1", text: "为什么不是 y=0？因为盒子以「自身中心」定位。高 2 的盒子要让底面正好贴地，中心必须在高度一半的位置 = 1。" },
      { lines: "颜色", text: "颜色用 #RRGGBB 十六进制写法，和 CSS 一样；项目里楼体颜色就存在 data/campus_layout.json 的 color 字段。" },
    ],
  },
  {
    id: "m2",
    label: "L2 变量与坐标",
    title: "L2　用变量算坐标：楼为什么不能陷进地里",
    tip: "把高度存进变量，再用 h / 2 算 y —— 这就是项目里最典型的一个坑。",
    source: "src/App.jsx · Building 组件第 339 行 const y = building.h / 2",
    code: `# 三维坐标里 Y 轴向上，X 是左右，Z 是前后
# 立方体以「自身中心」定位，所以楼的 y 必须等于高度的一半

h = 6                                  # 楼高 6 米，先存进变量
ground(70, "#2a3b4d")

box(6, h, 4, -8, h / 2, 0, "#dbe0df")  # 正确：y = h/2 = 3，楼完整站在地面上
box(6, h, 4, 8, 0, 0, "#e08a8a")       # 错误示范：y = 0，楼的下半截埋进地里`,
    notes: [
      { lines: "第 4 行", text: "h = 6 定义变量。变量让「改一处、全场景跟着变」成为可能，项目里楼高也来自数据而不是写死。" },
      { lines: "第 7 行", text: "y 写成 h / 2（=3），楼底面正好落在 y=0 的地面上。项目里 src/App.jsx 第 339 行就是 const y = building.h / 2。" },
      { lines: "第 8 行", text: "把 y 改成 0 试试：楼会下沉一半。项目早期就是这个 bug，调了很久才发现坐标原点在几何体中心。" },
      { lines: "对照脚本", text: "Blender 脚本里同一件事由 cube(name, location, scale, mat) 完成，location 就是 (x, y, z)，scale 是 (w, h, d)。" },
    ],
  },
  {
    id: "m3",
    label: "L3 for 循环批量生成",
    title: "L3　循环：一排楼怎么来的",
    tip: "把重复劳动交给循环。项目的 21 栋楼就是一个数组 + 一个循环生成的，没人手摆。",
    source: "blender/generate_campus.py · building_assets() 遍历建筑清单；src/App.jsx · BUILDINGS.map()",
    code: `ground(90, "#2a3b4d")

# for i in range(5): 下面缩进的 2 行会重复执行 5 次，i 依次是 0,1,2,3,4
for i in range(5):
    height = 3 + i                          # 每栋楼高度递增，模拟不同层数
    box(5, height, 4, -16 + i * 8, height / 2, 0, "#dbe0df")

# 循环外面：再单独放一个体育馆圆环
torus(6, 0.6, 0, 0.6, 18, "#8fb7c9")`,
    notes: [
      { lines: "第 4 行", text: "for i in range(5): 里 range(5) 产出 0~4 共 5 个数，i 是循环变量（字母随便取）。" },
      { lines: "第 5 行", text: "height = 3 + i 让每栋楼高一点；循环里可以正常定义变量和使用算术。" },
      { lines: "第 6 行", text: "-16 + i * 8 让 x 每次右移 8 米，于是 5 栋楼自动排成一排 —— 这就是「数据驱动建模」。" },
      { lines: "第 9 行", text: "torus(大半径, 小半径, x, y, z, 颜色) 画圆环，项目里体育场看台就是一个圆环加一段台阶。" },
      { lines: "对照项目", text: "真实项目更彻底：楼的位置尺寸都放在 data/campus_layout.json，脚本只负责读数据 + 循环生成。" },
    ],
  },
  {
    id: "m4",
    label: "L4 一栋完整的楼",
    title: "L4　一栋真实的楼：楼体 + 每层窗带 + 屋顶",
    tip: "真实建筑不是一个盒子，而是「主楼体 + 一堆装饰几何体」拼出来的。",
    source: "src/App.jsx · Building（338-393 行）窗带循环与 boxGeometry；blender/generate_campus.py · facade_strip() 157-159",
    code: `w = 7                    # 楼宽
d = 4                    # 楼深（前后厚度）
h = 6                    # 楼高，3 层每层 2 米
ground(60, "#2a3b4d")

# ① 主楼体：站在地面上
box(w, h, d, 0, h / 2, 0, "#dbe0df")

# ② 每层贴一条窗带（薄片，贴在正立面 d/2 稍微往外的位置）
for f in range(3):
    box(w - 1, 0.7, 0.1, 0, 1.6 + f * 2, d / 2 + 0.06, "#2a7fc9")

# ③ 屋顶压顶：比楼体略大一圈，显得有层次
box(w + 0.6, 0.3, d + 0.6, 0, h + 0.15, 0, "#b9c6cf")`,
    notes: [
      { lines: "第 7 行", text: "主楼体：w/h/d 三个变量直接决定尺寸，y = h/2 保证贴地。" },
      { lines: "第 10-11 行", text: "窗带是「很扁很薄的盒子」：高 0.7、厚 0.1，z 取 d/2 + 0.06 贴在墙外面一点点，避免和墙体穿模。" },
      { lines: "第 11 行", text: "1.6 + f * 2：f=0/1/2 时窗带高度分别是 1.6 / 3.6 / 5.6，自动分布在每层楼中部。" },
      { lines: "第 14 行", text: "屋顶比楼体大 0.6 米（w + 0.6），形成一圈挑檐，立体感立刻出来。" },
      { lines: "对照项目", text: "src/App.jsx 第 340-358 行用两层循环算每扇窗的位置（floor × 横向序号），思路和这里完全一致，只是窗更密。" },
    ],
  },
  {
    id: "m5",
    label: "L5 材质与灯光",
    title: "L5　材质与灯光：为什么画面看起来「假」",
    tip: "没有灯光，模型再对也看不见；材质参数决定它是混凝土还是玻璃。",
    source: "src/App.jsx · mat() 第 308 行；CampusScene 灯光第 1096-1110 行",
    code: `ground(70, "#31473b", 0)

# 三种灯光各司其职：太阳负责投影，环境光托底，半球光做天光过渡
light("sun", 2.4, 14, 22, 10)         # 平行光 = 太阳，pos 决定阴影方向
light("ambient", 0.45)                # 环境光：均匀补光，避免背光面纯黑
light("hemi", 0.7)                    # 半球光：上方天空色、下方地面色

# 同样是混凝土盒子，改了 metalness/roughness 就变成玻璃幕墙
box(6, 6, 4, -6, 3, 0, "#c9d4d8")
box(6, 6, 4, 6, 3, 0, "#9fb6c4", metalness = 0.85, roughness = 0.12)`,
    notes: [
      { lines: "第 4 行", text: "light(\"sun\", 强度, x, y, z)：kind 用字符串给，对应项目里的 <directionalLight position={[...]} intensity={...} castShadow />。" },
      { lines: "第 5-6 行", text: "环境光和半球光不需要位置，它们从各个方向均匀照亮场景，作用是让暗部不至于死黑。" },
      { lines: "第 9-10 行", text: "metalness（金属度 0~1）越大越像金属/玻璃，roughness（粗糙度 0~1）越小反射越锐利。项目里 mat(color, metalness, roughness) 就是这两项。" },
      { lines: "阴影", text: "只有 light(\"sun\") 会投影（项目里也是只给平行光开 castShadow），物体本身要 receiveShadow 才接得住阴影。" },
      { lines: "对照项目", text: "src/App.jsx 第 308 行 function mat(color, metalness = 0.05, roughness = 0.65) 返回的就是材质节点 —— 默认值 0.05/0.65 是偏哑光的混凝土。" },
    ],
  },
  {
    id: "m6",
    label: "L6 让它动起来",
    title: "L6　动画：旋转与浮动",
    tip: "动画 = 每一帧改一点点。spin 是每秒转多少度，float 是上下浮动多少米。",
    source: "src/App.jsx · CampusModel 的 useFrame（660-712 行）与 THREE.MathUtils.damp",
    code: `ground(70, "#2a3b4d")

# spin = 每秒旋转角度；float = 上下浮动幅度（米）
box(3, 3, 3, -7, 2.5, 0, "#4fc3f7", spin = 60)
box(3, 3, 3, 0, 2.5, 0, "#ffb74d", float = 0.8)
cylinder(1.2, 5, 7, 2.5, 0, "#75d19d", spin = 150)

# 两个一起用也行
cone(1.6, 3, 0, 7, -9, "#81c784", spin = 40, float = 0.5)`,
    notes: [
      { lines: "第 4 行", text: "spin = 60 表示每秒转 60 度（转满一圈 6 秒）。原理是每一帧把 rotation.y 加一点点 —— 和项目里 object.rotation.y += delta * 0.03 同理。" },
      { lines: "第 5 行", text: "float = 0.8 用 sin 函数让 y 上下摆动，形成呼吸感。项目里雨滴、警示灯也用这套正弦动画。" },
      { lines: "阻尼", text: "实现里用了 THREE.MathUtils.damp(当前值, 目标值, 速度, delta)：它不是瞬间跳过去，而是平滑逼近 —— 项目「点击楼栋弹起」用的正是这个函数。" },
      { lines: "delta 的意义", text: "delta 是「距上一帧过了多少秒」。动画必须乘 delta，否则帧率高的机器上物体转得更快。" },
      { lines: "对照项目", text: "src/App.jsx 第 660 行 useFrame((_, delta) => {...}) 每帧遍历整个模型，按选中/高亮状态平滑移动 y —— 就是本关动画的放大版。" },
    ],
  },
  {
    id: "m7",
    label: "L7 点击交互",
    title: "L7　点击交互：像项目首页那样点楼栋",
    tip: "给几何体加 id 就能点击；点中的楼会升起并变红 —— 这是 3D 页面最基本的人机交互。",
    source: "src/App.jsx · Building 的 onClick（397-400 行）、CampusModel 的 onClick（944 行）、liftOf 第 305 行",
    code: `ground(80, "#2a3b4d")

# 带 id 的物体可以点击：点击后升起 1.6 米并高亮变红
box(6, 5, 4, -8, 2.5, 0, "#dbe0df", id = "B01")   # 2#教学楼
box(6, 6, 4, 0, 3, 0, "#d4d8d4", id = "B02")      # 3#教学楼
box(7, 8, 4, 9, 4, 0, "#cbd6d6", id = "B11")      # 学生公寓

# 没有 id 的物体点不动，只能旋转观察
cylinder(0.4, 6, -14, 3, 6, "#8d9aa5")`,
    notes: [
      { lines: "第 4-6 行", text: "id 就是楼栋编号。项目里 B01/B02/B11 这些编号同时是 data/campus_layout.json、room_anchors.json 和数据库里的主键，一套编号串起整个系统。" },
      { lines: "点击后发生什么", text: "本关：y 上升 1.6 米 + 变成红色 + 缓慢自转。项目：选中楼栋抬升 5.5，点「房间 LOD2」再点楼会弹起「一层楼的高度」（liftOf，见 App.jsx 第 305 行），同时显示该楼的房间。" },
      { lines: "为什么要 stopPropagation", text: "3D 场景里点击会穿透多层物体。项目里 onClick 第一行就是 event.stopPropagation()，避免点楼的同时又触发了地面/其他物体的点击。" },
      { lines: "怎么知道点到了哪栋楼", text: "项目不用 id 参数，而是在 Blender 导出时把楼栋编号写进了网格名字（B01_xxx），代码用正则从 object.name 里解析出 building_code。" },
      { lines: "对照项目", text: "src/App.jsx 第 713 行 onClick 里向上回溯找到 building_code，再回调 onSelect 通知 React 更新选中状态 —— 这就是「3D 场景 → 界面状态」的完整链路。" },
    ],
  },
];

/* ============ 课程数据（全部来自项目源码的简化版） ============ */
const LESSONS = {
  chain: [{
    id: "chain-1", module: "chain", type: "full", title: "一次完整的数据之旅", source: "src/RagPage.jsx api() · backend/main.py 路由 · SQLite",
    desc: "点击「运行全链路」，观察一次真实请求如何穿过 前端 → 后端 → 数据库 → 前端，并看到后端真正执行的 SQL、数据库返回的行、耗时与最终渲染。",
    render: () => <ChainDemo />,
  }, {
    id: "chain-2", module: "chain", type: "backend", title: "全链路里的后端代码（项目真实源码）", source: "backend/learn.py · demo_chain()",
    desc: "这就是点「运行全链路」时后端真正执行的代码：接收查询参数 → 连接 SQLite → 参数化查询 → 组装 JSON。可自行切换文件与行号范围浏览整个后端。",
    render: () => <SourceViewer file="backend/learn.py" start={238} end={259} notes={[
      { lines: "238-239", text: "第 238 行是装饰器 @router.get(\"/demo/chain\")，把函数注册成接口；def demo_chain(class_name: str = \"计科2501\") 里的 class_name 就是前端 URL 上的查询参数（?class_name=计科2501），FastAPI 自动帮我们解析并做默认值处理。" },
      { lines: "241-242", text: "SQL 用占位符 ? 表示参数位置，绝不把用户输入直接拼进 SQL —— 这是防 SQL 注入的基本功。" },
      { lines: "244-246", text: "connect() 打开测试库；db.execute(sql, (class_name,)) 把参数安全绑定后执行查询；再单独查一次总行数。" },
      { lines: "248", text: "elapsed = 用 time.perf_counter() 前后相减，得到这条 SQL 的真实耗时，让学习者看到「数据库其实很快」。" },
      { lines: "250-259", text: "把 rows / display / elapsed_ms / source_refs 组装成 dict 返回 —— FastAPI 自动序列化成 JSON，这就是前端 fetch 之后 await res.json() 拿到的东西。" },
    ]} />,
  }],
  frontend: [
    {
      id: "fe-1", module: "frontend", type: "frontend", title: "HTML：网页的骨架", source: "index.html（项目入口，<div id=\"root\"> 挂载 React）",
      desc: "标签=元素，属性=配置。这个页面没有框架，纯 HTML 也能显示内容。改标题文字并点运行试试。",
      render: () => <HtmlRunner lesson={{ title: "HTML 基础", notes: [ { lines: "第 1 行", text: "<!doctype html> 声明这是标准 HTML5 文档，浏览器据此选择解析模式。" }, { lines: "head 段", text: "<meta charset='utf-8'> 声明编码（中文不乱码）；<style> 里写 CSS，控制颜色与间距。" }, { lines: "body 段", text: "<h1> 标题、<p> 段落、<ul><li> 列表 —— 这些「语义标签」让内容自带结构。<!-- 这是 HTML 注释 -->" }, { lines: "button", text: "onclick 是内联事件：点击后执行其中的 JS，用 getElementById 找到 <p id='tip'> 并改文字。" }, { lines: "对照项目", text: "项目的 index.html 只有 <div id='root'>，其余界面由 React 渲染 —— 见 src/main.jsx 的 createRoot。" }], html: `<!doctype html>
<!-- HTML 注释这样写：浏览器不会显示，只给你自己看 -->
<html lang="zh-CN">
  <head>
    <!-- 声明字符编码，中文才不会乱码 -->
    <meta charset='utf-8' />
    <style>
      /* 这里是 CSS：控制「长什么样」 */
      body {
        font-family: system-ui;
        padding: 16px;
        background: #0e2334;
        color: #e8f1fa;
      }
      /* 一级标题颜色 */
      h1 {
        color: #4fc3f7;
      }
    </style>
  </head>
  <body>
    <!-- h1~h6 是标题，p 是段落，ul/li 是无序列表 -->
    <h1>岳阳学院 · 智慧校园</h1>
    <p>这是最朴素的 HTML 页面：标题 h1、段落 p、列表 ul。</p>
    <ul>
      <li>133 个班级 / 7004 名学生</li>
      <li>1168 间宿舍（每间最多 6 人）</li>
      <li>夏季作息 14:30 上课</li>
    </ul>
    <!-- id 是元素的唯一名字，JS 靠它找到这个元素 -->
    <button onclick="document.getElementById('tip').textContent='你点击了按钮！'">点我</button>
    <p id='tip'>（等待点击）</p>
  </body>
</html>` }} />,
    },
    {
      id: "fe-2", module: "frontend", type: "frontend", title: "CSS：布局与样式（Flex / Grid）", source: "src/styles.css · .rag-layout（grid-template-columns 三栏）",
      desc: "本项目三栏布局用的是 Grid，卡片横排用 Flex。拖动浏览器窗口看自适应效果，改 gap/颜色立即生效。",
      render: () => <HtmlRunner lesson={{ title: "CSS 布局", notes: [ { lines: ".layout", text: "display:grid + grid-template-columns:180px 1fr 160px —— 一行三栏，中间自适应。" }, { lines: ".cards", text: "display:flex + flex-wrap:wrap：卡片横向排列，放不下自动换行（响应式）。" }, { lines: "gap / padding", text: "gap 控制子元素间距，padding 控制内边距 —— 比用 margin 更容易对齐。" }, { lines: "视觉", text: "background/border/border-radius 组合出「深色面板 + 圆角卡片」的项目风格。" }, { lines: "对照项目", text: "src/styles.css 的 .rag-layout 用的就是同一套 Grid 三栏布局。" }], html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset='utf-8' />
    <style>
      /* 整页基础样式 */
      body {
        margin: 0;
        font-family: system-ui;
        background: #08131e;
        color: #e8f1fa;
      }
      /* 三栏布局：180px 固定左栏 + 中间自适应 + 160px 固定右栏，1fr 表示「剩下的都给中间」 */
      .layout {
        display: grid;
        grid-template-columns: 180px 1fr 160px;
        gap: 10px;
        padding: 10px;
        height: 100vh;
        box-sizing: border-box;
      }
      /* 面板：深色底 + 半透明描边 + 圆角，这就是项目的视觉风格 */
      .panel {
        background: rgba(255, 255, 255, .06);
        border: 1px solid rgba(120, 180, 235, .25);
        border-radius: 10px;
        padding: 10px;
      }
      /* Flex 横向排列卡片，放不下自动换行（响应式） */
      .cards {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      /* flex:1 1 90px = 可伸可缩、基准宽度 90px */
      .card {
        flex: 1 1 90px;
        background: rgba(79, 195, 247, .12);
        border: 1px solid rgba(79, 195, 247, .35);
        border-radius: 8px;
        padding: 8px;
        text-align: center;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <!-- 拖动浏览器窗口宽度，观察三栏如何自适应 -->
    <div class="layout">
      <div class="panel"><b>左栏</b><p style="font-size: 12px">数据来源</p></div>
      <div class="panel">
        <b>中栏</b>
        <div class="cards">
          <div class="card">计科2501<br>55人</div>
          <div class="card">计科2502<br>55人</div>
          <div class="card">计科2503<br>55人</div>
        </div>
      </div>
      <div class="panel"><b>右栏</b><p style="font-size: 12px">评测</p></div>
    </div>
  </body>
</html>` }} />,
    },
    {
      id: "fe-3", module: "frontend", type: "frontend", title: "JavaScript：变量、数组、函数、循环渲染", source: "src/RagPage.jsx · students.map(...) 列表渲染",
      desc: "后端返回的是 JSON 数组，前端用 map 把「数据」变成「页面元素」。这里是化简后的等价写法。",
      render: () => <HtmlRunner lesson={{ title: "JS 基础", notes: [ { lines: "const classes", text: "用数组存数据：每条记录含 name/students/dorm 字段（真实项目里这份数据来自后端接口）。" }, { lines: "function", text: "函数把「计算逻辑」封装起来：totalStudents() 用 for...of 遍历累加。" }, { lines: "map", text: "map 把「数据数组」映射成「HTML 字符串数组」，再用 join('') 拼成一个字符串。" }, { lines: "innerHTML", text: "把拼好的字符串塞进 <div id='list'>，页面就出现了这些行 —— 这就是最朴素的「数据驱动界面」。" }, { lines: "对照项目", text: "src/RagPage.jsx 里 students.map(...) 渲染学生列表用的是同一思路（React 版本）。" }], html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset='utf-8' />
    <style>
      body {
        font-family: system-ui;
        background: #08131e;
        color: #e8f1fa;
        padding: 14px;
      }
      .row {
        background: rgba(255, 255, 255, .06);
        border-radius: 8px;
        padding: 6px 10px;
        margin: 5px 0;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <h3>用 JS 渲染班级列表</h3>
    <div id="list"></div>
    <script>
      // 数据（真实项目里这份数据来自后端 API）
      const classes = [
        { name: "计科2501", students: 55, dorm: "13#/16#学生宿舍" },
        { name: "计科2502", students: 55, dorm: "13#/16#学生宿舍" },
        { name: "计科2503", students: 55, dorm: "13#/16#学生宿舍" },
      ];
      // 函数：算总人数
      function totalStudents(list) {
        let sum = 0;
        for (const c of list) sum += c.students;
        return sum;
      }
      // 循环 + 模板字符串 → 生成 HTML
      document.getElementById("list").innerHTML =
        classes.map(c => '<div class="row"><b>' + c.name + '</b> · ' + c.students + ' 人 · 宿舍 ' + c.dorm + '</div>').join('');
      document.getElementById("list").innerHTML += '<p>三个班共 ' + totalStudents(classes) + ' 人</p>';
    </script>
  </body>
</html>` }} />,
    },
    {
      id: "fe-4", module: "frontend", type: "frontend", title: "事件与状态：输入框 + 按钮 + 点击响应", source: "src/RagPage.jsx · ask()/onChange/onKeyDown（回车发送）",
      desc: "用户交互 = 事件（click/input/keydown）+ 读取输入值 + 更新页面。这里实现一个迷你问答输入框。",
      render: () => <HtmlRunner lesson={{ title: "事件与状态", notes: [ { lines: "onclick", text: "把函数绑到按钮上，点击即执行 send()。" }, { lines: "addEventListener", text: "监听输入框的 keydown 事件，e.key === 'Enter' 时也触发发送。" }, { lines: "value", text: "document.getElementById('q').value 读取用户输入；发送后置空，实现「清空输入框」。" }, { lines: "innerHTML 追加", text: "新消息插到列表最前面，形成聊天记录不断向上堆叠的效果。" }, { lines: "对照项目", text: "src/RagPage.jsx 的 ask() 与 onKeyDown 就是这个模式：读输入 → 生成消息 → 更新列表。" }], html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset='utf-8' />
    <style>
      body {
        font-family: system-ui;
        background: #08131e;
        color: #e8f1fa;
        padding: 14px;
      }
      .bar {
        display: flex;
        gap: 8px;
      }
      input {
        flex: 1;
        padding: 9px;
        border-radius: 8px;
        border: 1px solid #2c5a7a;
        background: #0f2233;
        color: #e8f1fa;
      }
      button {
        padding: 9px 16px;
        border: 0;
        border-radius: 8px;
        background: #1d5c99;
        color: #fff;
        cursor: pointer;
      }
      .msg {
        background: rgba(79, 195, 247, .12);
        border-radius: 8px;
        padding: 8px 10px;
        margin-top: 10px;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <h3>迷你问答（前端本地模拟）</h3>
    <div class="bar">
      <input id="q" placeholder="问：计科2501有多少人？" />
      <button id="send">发送</button>
    </div>
    <div id="log"></div>
    <script>
      // ① 一份「假知识库」：真实项目里这份答案由后端 /api/rag/ask 返回
      const answers = {
        "计科2501有多少人": "计科2501共有 55 名学生。",
        "第3大节几点下课": "夏季作息 16:10 下课。",
      };

      // ② 发送函数：读输入 → 查知识库 → 往列表最前面插入消息
      function send() {
        const text = document.getElementById("q").value.trim();  // 读输入框的值
        if (!text) return;                                       // 空内容直接返回，不发空消息
        const hit = Object.keys(answers).find((key) => text.includes(key)); // 找一个能匹配上的问题
        const reply = hit ? answers[hit] : "（示例只内置了 2 个问题，试试「计科2501有多少人」）";
        document.getElementById("log").innerHTML =
          '<div class="msg">你：' + text + '</div>' +
          '<div class="msg">答：' + reply + '</div>' +
          document.getElementById("log").innerHTML;              // 新消息拼在最前面，形成聊天记录
        document.getElementById("q").value = "";                 // 发送后清空输入框
      }

      // ③ 两种触发方式：点按钮，或在输入框里按回车
      document.getElementById("send").onclick = send;
      document.getElementById("q").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    </script>
  </body>
</html>` }} />,
    },
    {
      id: "fe-5", module: "frontend", type: "frontend", title: "fetch：前端如何调用后端（真请求，非模拟）", source: "src/RagPage.jsx · api(path, options) 与 ask()",
      desc: "这个页面里的按钮会真的请求项目的后端接口 /api/learn/demo/chain，并把返回的 JSON 渲染出来——这就是前端调用后端的全过程。",
      render: () => <HtmlRunner lesson={{ title: "fetch 调后端", notes: [ { lines: "async/await", text: "async 函数里用 await 等异步结果，代码读起来像同步，避免回调地狱。" }, { lines: "fetch(url)", text: "向同源后端发 GET 请求：/api/learn/demo/chain —— 与项目中 fetch('/api/rag/ask') 同理。" }, { lines: "res.json()", text: "把响应的 JSON 文本解析成 JS 对象，之后就能用 data.sql、data.display 取值。" }, { lines: "map 渲染", text: "data.display.map(...) 把后端返回的字符串数组渲染成一行行列表。" }, { lines: "try/catch", text: "网络或后端出错时进入 catch，向用户显示失败原因而不是白屏。" }], html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset='utf-8' />
    <style>
      body {
        font-family: system-ui;
        background: #08131e;
        color: #e8f1fa;
        padding: 14px;
      }
      button {
        padding: 9px 16px;
        border: 0;
        border-radius: 8px;
        background: #1d5c99;
        color: #fff;
        cursor: pointer;
      }
      pre {
        background: #0f2233;
        border: 1px solid #2c5a7a;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        overflow: auto;
      }
      .li {
        background: rgba(117, 209, 157, .12);
        border-radius: 6px;
        padding: 6px 9px;
        margin: 4px 0;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <h3>点击按钮 → 真实请求后端 → 渲染结果</h3>
    <button id="go">GET /api/learn/demo/chain?class_name=计科2501</button>
    <div id="out"></div>
    <script>
      document.getElementById("go").onclick = async () => {
        document.getElementById("out").innerHTML = "请求中…";
        try {
          const res = await fetch("/api/learn/demo/chain?class_name=计科2501");  // ① 发请求
          const data = await res.json();                                        // ② 解析 JSON
          document.getElementById("out").innerHTML =
            '<p style="font-size: 13px">后端执行的 SQL：</p><pre>' + data.sql + '</pre>' +
            '<p style="font-size: 13px">数据库返回 ' + data.row_count + ' 行，前 5 行：</p>' +
            data.display.map(d => '<div class="li">' + d + '</div>').join('');   // ③ 渲染
        } catch (e) {
          document.getElementById("out").textContent = "失败：" + e.message;
        }
      };
    </script>
  </body>
</html>` }} />,
    },
    {
      id: "fe-6", module: "frontend", type: "frontend",
      title: "React：useState —— 数据一变，界面自己跟着变",
      source: "src/RagPage.jsx · 第 50-70 行（10 个 useState）；src/App.jsx · 选中楼栋的 useState",
      desc: "这是 React 最核心的概念，项目里所有交互都建立在它之上。下面先讲清「为什么会有 useState」，再从最小的例子一路加到真实场景；每个例子都能改代码、点运行、立刻看结果。",
      render: () => (
        <>
          <WhyBox title="为什么需要 useState？—— 先看看没有它的时候">
            <p>早期用 jQuery 写页面时，数据变了要自己去找 DOM 节点改文字，数据和界面得手动保持同步：</p>
            <pre>{`// 老写法（命令式）：既要管数据，又要管界面
let count = 0;
function add() {
  count = count + 1;
  document.getElementById("num").innerText = count;   // 还得手动同步一次
}`}</pre>
            <p>问题在于：<b>同一份数据被存了两份</b> —— 一份在 JS 变量里，一份在页面上。改数据忘了改页面，两边就对不上；页面一复杂，漏改几乎是必然的。</p>
            <p>React 的解法很干脆：<b>页面上不存数据，只留一份 state</b>，界面永远是它算出来的结果 —— <code>界面 = f(state)</code>。你只管改 state，「重画」这件事交给 React。</p>
            <pre>{`// React 写法（声明式）：只管数据，界面自动跟上
const [count, setCount] = useState(0);   // 唯一的一份数据
function add() {
  setCount(count + 1);                   // 只改数据，重画由 React 负责
}`}</pre>
            <table>
              <thead><tr><th>对比项</th><th>老写法</th><th>useState</th></tr></thead>
              <tbody>
                <tr><td>要改几处</td><td className="bad">数据 + 手动改 DOM（两处）</td><td className="good">只改 state（一处）</td></tr>
                <tr><td>忘了同步</td><td className="bad">界面和数据不一致</td><td className="good">不可能，界面由数据算出</td></tr>
                <tr><td>谁负责重画</td><td className="bad">你自己</td><td className="good">React</td></tr>
              </tbody>
            </table>
            <p className="learn-note">一句话：useState 就是「一份会自动驱动界面重画的数据」。项目里所有会变的东西（消息列表、当前班级、加载状态、选中楼栋）都用它存。</p>
          </WhyBox>

          <JsxRunner lesson={{
            title: "例 1 · 最小状态：点一下加一（useState 的三步）",
            hint: "试着把 count + 1 改成 count + 10，或把按钮文字换成「加十」，再点运行。",
            code: `// useState 的三步：
//  ① useState(初始值) 拿到 [值, 改它的函数]
//  ② 在 JSX 里用 {值} 显示出来
//  ③ 事件里调 setXxx，React 自动重画界面
function App() {
  const [count, setCount] = useState(0);   // 初始值 0

  return (
    <div>
      <p>你点了 {count} 次</p>
      <button onClick={() => setCount(count + 1)}>点我 +1</button>
    </div>
  );
}`,
            notes: [
              { lines: "第 7 行", text: "const [count, setCount] = useState(0) —— 数组解构。第一个是「当前值」，第二个是「改它的函数」。名字随便起，社区习惯叫 [xxx, setXxx]。" },
              { lines: "useState(0)", text: "括号里的 0 是初始值，只在组件第一次出现时用一次，之后一直被 React 记着。" },
              { lines: "{count}", text: "单花括号表示「这里放一个 JS 表达式」，React 会把它的值算出来显示。" },
              { lines: "onClick", text: "点击时执行 setCount(count + 1)，React 收到后重新渲染。注意：不能写 count++ 或 count = count + 1 —— 直接改这个变量，React 不知道你改了，界面不会变。" },
            ],
          }} />

          <NotesList title="useState 的三条铁律" notes={[
            { lines: "铁律 1", text: "只在组件函数最外层调用。不能放在 if、for 里面 —— React 依赖「每次渲染调用顺序一致」来记住每个 state，条件调用会让它对不上号。" },
            { lines: "铁律 2", text: "不能直接改 state 变量（count++ 无效）。必须通过 setCount(新值) 告诉 React「它变了」。" },
            { lines: "铁律 3", text: "state 是「快照」。一次渲染里 count 的值从头到尾不变，即使中间调了 setCount，也要等下次渲染才是新值。" },
            { lines: "命名习惯", text: "[值, set值] 这套写法叫「解构赋值」，项目里全部沿用这个命名（count/setCount、busy/setBusy、rows/setRows）。" },
          ]} />

          <JsxRunner lesson={{
            title: "例 2 · 受控输入框：value + onChange 让输入和数据显示一致",
            hint: "先把 onChange 那行注释掉，你会发现输入框变成打不进去字了 —— 这就是「受控」的含义。",
            code: `// 受控输入：输入框显示什么，完全由 state 决定
//   value={text}   输入框「显示 state」
//   onChange       用户输入 → 更新 state
// 两者配合，界面和数据永远一致。
// 项目里所有输入框都是这个写法。
function App() {
  const [text, setText] = useState("");

  return (
    <div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入你的名字"
      />
      <p>你好，{text || "陌生人"}！你输入了 {text.length} 个字</p>
    </div>
  );
}`,
            notes: [
              { lines: "value={text}", text: "输入框显示的内容由 state 决定，而不是浏览器自己记 —— 这叫「受控组件」。" },
              { lines: "onChange", text: "(e) => setText(e.target.value)：e 是事件对象，e.target 是触发事件的输入框，e.target.value 就是用户刚敲进去的内容。" },
              { lines: "两者缺一", text: "只写 value 不写 onChange → 输入框被 state「锁死」，打不进字；只写 onChange 不写 value → 变成非受控，state 和输入框各玩各的，随时可能不一致。" },
              { lines: "{text || \"陌生人\"}", text: "|| 表示「左边为空就取右边」，是常用的兜底写法（空字符串在 JS 里算假值）。" },
              { lines: "对照项目", text: "src/RagPage.jsx 的提问输入框、学习中心的 SQL 编辑框，用的都是这一套。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 3 · 布尔状态：开关与条件渲染",
            hint: "试试把初始值 useState(false) 改成 true，看页面初始状态有什么不同。",
            code: `// 布尔 state 常用来控制「显示 / 隐藏」
// && 的特性：左边为真才返回右边 —— 天生适合做条件渲染
function App() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(!open)}>
        {open ? "收起" : "展开"}课程说明
      </button>
      {open && <p>本数据集包含 133 个班、7004 名学生、1849 条排课记录。</p>}
    </div>
  );
}`,
            notes: [
              { lines: "setOpen(!open)", text: "把布尔值取反：点一下开、再点一下关，两行代码搞定一个开关。" },
              { lines: "三元表达式", text: "{open ? \"收起\" : \"展开\"} —— 条件 ? 真时的值 : 假时的值，是 JSX 里最常用的分支写法。" },
              { lines: "&& 条件渲染", text: "{open && <p>…</p>} 利用短路特性：左边为真才渲染右边，为假直接不渲染这个元素。" },
              { lines: "对照项目", text: "src/RagPage.jsx 里 busy && <span>思考中…</span> 就是这个套路 —— 只有请求中才显示「思考中」。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 4 · 数组状态：待办清单（为什么不能用 push）",
            hint: "把 setList([...list, text]) 改成 list.push(text) 再点「添加」，你会看到界面纹丝不动 —— 这是新手最常踩的坑。",
            code: `// 数组也能当 state，但有一条铁律：
// 不要用 push / splice 直接改原数组，
// 要用「展开运算符造一个新数组」再交给 setter。
// 因为 React 靠「引用变没变」判断要不要重画。
function App() {
  const [list, setList] = useState(["预习 HTML", "复习 CSS"]);
  const [text, setText] = useState("");

  function add() {
    if (!text.trim()) return;
    setList([...list, text]);                      // 新数组 = 旧的全部展开 + 新的一条
    setText("");
  }
  function remove(i) {
    setList(list.filter((item, idx) => idx !== i)); // filter 也返回新数组
  }

  return (
    <div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="加一条任务"
      />
      <button onClick={add}>添加</button>
      <ul>
        {list.map((item, i) => (
          <li key={i}>{item} <button onClick={() => remove(i)}>删除</button></li>
        ))}
      </ul>
      <p className="dim">共 {list.length} 条</p>
    </div>
  );
}`,
            notes: [
              { lines: "useState([...])", text: "初始值可以是一个数组。凡是要「渲染一串东西」，背后通常就是一个数组 state。" },
              { lines: "不可变更新", text: "setList([...list, text])：...list 把原数组展开，再加新的一项，拼成「新数组」。React 比较的是引用，只有换了新数组它才知道要重画。" },
              { lines: "为什么不能用 push", text: "push 改的是原数组本身，引用没变，React 认为「还是同一个数组」，于是不重画。这是本项目里最容易出错的地方。" },
              { lines: "删除", text: "list.filter((item, idx) => idx !== i) —— filter 返回新数组，所以天然适合做删除。" },
              { lines: "key", text: "列表里每一项都要有 key，帮 React 认出「哪一行没变、哪一行是新的」，更新才高效。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 5 · 进阶：新值依赖旧值，一定要用函数式更新",
            hint: "分别点两个按钮，看 count 各涨多少 —— 差别非常直观。",
            code: `// 连续更新同一个 state 时，两种写法结果完全不同，
// 这是新手最容易踩的坑。
// 原因：setState 是异步批处理的，同一轮里连写三次
// setCount(count + 1)，三次读到的 count 都是旧值，所以只 +1。
function App() {
  const [count, setCount] = useState(0);

  function addThreeWrong() {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }
  function addThreeRight() {
    setCount((c) => c + 1);   // 传函数：React 把「最新值」交给你
    setCount((c) => c + 1);
    setCount((c) => c + 1);
  }

  return (
    <div>
      <p>count = {count}</p>
      <button onClick={addThreeWrong}>错误写法 +3（实际只 +1）</button>
      <button onClick={addThreeRight}>正确写法 +3</button>
      <button onClick={() => setCount(0)}>归零</button>
    </div>
  );
}`,
            notes: [
              { lines: "setState 是异步的", text: "React 会把同一个事件里的多次 setState「批处理」合并执行，不会立刻重新渲染。" },
              { lines: "错误写法", text: "连写三次 setCount(count + 1)：这三次读到的 count 都是本轮渲染的旧快照，所以最终只 +1，不是 +3。" },
              { lines: "正确写法", text: "setCount((c) => c + 1)：传一个函数，React 会把「当前最新的值」作为参数交给你，三次都能正确累加。" },
              { lines: "什么时候用", text: "只要新值依赖旧值（+1、追加元素、取反、切换），就用函数式写法，永远安全。项目里 setMessages((m) => [...m, x]) 就是这么写的。" },
            ],
          }} />

          <div className="learn-demo-box">
            <p className="learn-note">下面这个不是代码台，而是<b>学习中心页面自己的真实 React 组件</b> —— 它同样是 useState 驱动的，点一下就会重画。</p>
            <ReactCounterDemo />
          </div>

          <SourceViewer title="项目源码：RagPage.jsx 里真实的状态声明（10 个 useState）" file="src/RagPage.jsx" start={50} end={69} notes={[
            { lines: "50-56", text: "messages：聊天记录数组。初始就放了一条 AI 的欢迎语 —— 状态初始值可以是任何类型（数字、字符串、数组、对象）。" },
            { lines: "57", text: "input：输入框里当前的内容（受控组件，对应例 2）。" },
            { lines: "58-59", text: "classList / viewClass：视角班级清单与当前选中的班。清单从生产数据动态拉取（/api/rag/classes），viewClass 决定所有请求带哪个班级参数。" },
            { lines: "60", text: "busy：是否正在请求中。用来禁用按钮、显示「思考中」（对应例 3 的布尔状态）。" },
            { lines: "63-65", text: "tab / dataSource / filter：一个状态管「当前看哪张表」，一个管「后端拿回来的数据」，一个管「搜索关键词」。三个独立状态各管一摊，这就是 React 的组织方式。" },
            { lines: "68-69", text: "evalResult / tools：评测结果和工具列表。可以看到一个页面用十几个 useState 是很正常的。" },
          ]} />
        </>
      ),
    },
    {
      id: "fe-7", module: "frontend", type: "frontend",
      title: "React：useEffect + fetch + map —— 组件自己把数据取回来",
      source: "src/RagPage.jsx · 第 73-107 行 loadTab() + 三个 useEffect；src/RagPage.jsx · 学生列表 map",
      desc: "组件出现在页面上之后，怎么自动去后端拿数据？这件事不能随手写在组件函数里，于是有了 useEffect。下面先讲清它的来由，再用 5 个可运行的例子把「什么时候跑、跑几次、什么时候要清理」讲透。",
      render: () => (
        <>
          <WhyBox title="为什么需要 useEffect？—— 渲染之外的活儿该放哪">
            <p>React 组件函数有个特点：<b>每次渲染都会从头到尾跑一遍</b>。所以有些事不能随手写在函数体里：</p>
            <table>
              <thead><tr><th>想做的事</th><th>直接写在组件里会怎样</th></tr></thead>
              <tbody>
                <tr><td>组件出现后去后端取数据</td><td className="bad">每次重画都再请求一次，请求会越刷越多</td></tr>
                <tr><td>开定时器 / 监听窗口大小</td><td className="bad">每次重画都新开一个，旧的还清不掉，越堆越多</td></tr>
                <tr><td>手动改 DOM</td><td className="bad">DOM 由 React 管着，你改完可能马上被它覆盖</td></tr>
              </tbody>
            </table>
            <p>这类「渲染之外的活儿」在 React 里叫 <b>副作用</b>。它们需要一个专门的时机 —— <b>渲染完成、页面已经画出来之后</b>。这个时机由 <code>useEffect</code> 提供：</p>
            <pre>{`useEffect(() => {
  // 组件画到页面上之后，才执行这里（发请求 / 开定时器 / 订阅事件）
  return () => {
    // 可选的「清理函数」：下次重跑之前、或组件被移除时执行（关定时器 / 取消订阅）
  };
}, [依赖]);   // 依赖数组决定「什么时候重跑」`}</pre>
            <p className="learn-note">背后是一条原则：组件渲染应该是「纯」的 —— 给同样的 state 就画出同样的界面。发请求、开定时器会让结果变得不确定，所以必须挪出渲染过程，交给 useEffect。</p>
          </WhyBox>

          <JsxRunner lesson={{
            title: "例 1 · 组件出现后自动执行一次（依赖数组写 []）",
            hint: "把第二个参数的 [] 删掉再运行，然后随便改一下代码 —— 你会看到 effect 每次都跑，这就是「不写依赖」的后果。",
            code: `// useEffect 是干什么的？
// React 渲染组件时只该做一件事：算出界面长什么样。
// 发请求、开定时器、改 DOM 这些「渲染之外的活儿」
// 叫「副作用」，它们有专门的安放位置 —— useEffect。
//
// 第二个参数是「依赖数组」，
// 写 [] 表示：只在组件第一次出现时执行一次。
function App() {
  const [msg, setMsg] = useState("还没加载");

  useEffect(() => {
    // 此时组件已经出现在页面上了，这里才适合做副作用
    setTimeout(() => setMsg("数据到啦（模拟请求耗时 0.6 秒）"), 600);
  }, []);

  return <p>{msg}</p>;
}`,
            notes: [
              { lines: "useEffect(函数, 数组)", text: "第一个参数是「渲染完成后要执行的函数」，第二个参数是「依赖数组」，决定它什么时候重新执行。" },
              { lines: "[] 的含义", text: "空数组表示「它不依赖任何东西」→ 只在组件第一次出现时执行一次，之后再也不跑。这就是「组件初始化」的标准写法。" },
              { lines: "setTimeout", text: "这里用一段延迟模拟「请求后端需要时间」。真实项目里这几行就是 await api(\"/api/rag/data/students\")。" },
              { lines: "执行顺序", text: "先渲染出「还没加载」→ 页面画完 → effect 执行 → 0.6 秒后 setMsg → 触发重渲染 → 显示「数据到啦」。整个流程能看得一清二楚。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 2 · 依赖变化就重新执行（[] 里写谁，谁变就跟谁走）",
            hint: "把 return () => clearTimeout(timer) 那一行注释掉，再快速连点几个班级，观察结果会不会乱。",
            code: `// 依赖数组里写谁，谁变了就重新执行一次。
// 下面点按钮改 classNo，
// effect 就会重跑 → 重新「加载」这个班。
// 班级与人数来自生产数据（data/rag/students.json）。
const CLASSES = [
  { name: "计科2501", info: "55 人，宿舍 13#/16#学生宿舍" },
  { name: "计科2502", info: "55 人，宿舍 13#/16#学生宿舍" },
  { name: "计科2601", info: "52 人，宿舍 东南A/25#学生宿舍" },
];

function App() {
  const [classNo, setClassNo] = useState(0);
  const [info, setInfo] = useState("加载中…");

  useEffect(() => {
    setInfo("加载中…");
    const timer = setTimeout(() => {
      setInfo(CLASSES[classNo].name + "：" + CLASSES[classNo].info);
    }, 400);
    // 返回的这个函数叫「清理函数」：
    // 下次依赖变化（或组件被移除）之前，
    // React 会先调它，把上一次没做完的活儿收掉。
    return () => clearTimeout(timer);
  }, [classNo]);

  return (
    <div>
      {CLASSES.map((c, n) => (
        <button key={c.name} onClick={() => setClassNo(n)}>{c.name}</button>
      ))}
      <p>{info}</p>
    </div>
  );
}`,
            notes: [
              { lines: "[classNo]", text: "依赖数组里写了 classNo → classNo 一变，React 就把上一次的 effect 清掉、重新跑一遍。这就是「切换条件自动重新加载」的实现方式。" },
              { lines: "清理函数", text: "effect 里 return 的那个函数叫清理函数。React 会在「下次重跑之前」和「组件被移除时」调用它。" },
              { lines: "为什么必须清理", text: "不清理的话，快速点 计科2501 → 计科2502 → 计科2601 时，前两次的定时器还在跑，它们回来后会依次把 info 改掉，最后屏幕上显示的可能是「计科2502」而不是「计科2601」—— 这就是典型的竞态 bug。" },
              { lines: "对照项目", text: "src/RagPage.jsx 第 83-85 行：useEffect(() => { loadTab(tab); }, [tab]) —— 一模一样，切换标签页就重新取数据。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 3 · 三种依赖写法的对比（本页最重要的知识点）",
            hint: "点几下按钮，盯着两个计数器的数字变化 —— 一个不动，一个每点必涨。",
            code: `// 依赖数组的三种写法，差别巨大：
//   []     只执行一次（组件首次出现）
//   [x]    x 变化时执行
//   不写    每次渲染后都执行（易写成死循环）
function App() {
  const [count, setCount] = useState(0);
  const [onceCount, setOnceCount] = useState(0);
  const [depCount, setDepCount] = useState(0);

  useEffect(() => {
    setOnceCount((n) => n + 1);
  }, []);              // 空数组：只跑一次

  useEffect(() => {
    setDepCount((n) => n + 1);
  }, [count]);         // count 变一次就跑一次

  return (
    <div>
      <p>count = {count}</p>
      <p>依赖 [] 的执行次数：{onceCount}（下面按钮点多少次都不会再涨）</p>
      <p>依赖 [count] 的执行次数：{depCount}（每点一次涨 1）</p>
      <button onClick={() => setCount(count + 1)}>count + 1</button>
    </div>
  );
}`,
            notes: [
              { lines: "[] 只一次", text: "组件首次出现时执行一次，之后无论什么变化都不再执行。用途：初始化加载、注册全局事件。" },
              { lines: "[x] 跟着 x", text: "x 每次变化都重新执行。用途：参数变了重新请求、某个值变了同步到别处。" },
              { lines: "不写依赖", text: "每次渲染完成后都执行。危险在于：如果里面又调用了 setState，就会触发下一轮渲染 → 又是 effect → 死循环。所以极少这么写。" },
              { lines: "空数组 vs 不写", text: "新手最容易混的就是这两个：[] 是「只跑一次」，不写是「每次都跑」，差别巨大。" },
              { lines: "为什么初始是 2", text: "如果看到「依赖 [] 的执行次数」一开始就是 2，不用慌：这是 React 开发模式的「严格模式」故意把 effect 跑两遍，目的是让「忘了写清理函数的副作用」尽早暴露。开关在 src/main.jsx 第 62 行的 StrictMode，打包上线后只会跑一次，不影响实际使用。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 4 · 完整形态：loading 状态 + 手动刷新（useEffect + fetch 的标准结构）",
            hint: "把 setStatus(\"加载中…\") 删掉，再点重新加载，感受一下状态提示的作用。",
            code: `// 把 useEffect 和「加载」拼起来，
// 就是完整的「组件加载后取数据」结构。
// 项目里 RagPage.jsx 的 loadTab() 就是这套写法。
function App() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("未加载");

  async function load() {
    setStatus("加载中…");
    try {
      // 这里用一段延迟代替真实请求，方便你观察「加载中 → 已加载」的过程
      await new Promise((r) => setTimeout(r, 500));
      setRows([
        { id: 1, course: "高等数学", teacher: "王老师" },
        { id: 2, course: "数据结构", teacher: "李老师" },
        { id: 3, course: "操作系统", teacher: "张老师" },
      ]);
      setStatus("已加载 3 行");
    } catch (e) {
      setStatus("失败：" + e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);   // 组件出现后自动加载一次

  return (
    <div>
      <p>{status}</p>
      <ul>
        {(rows || []).map((r) => (
          <li key={r.id}>{r.course} —— {r.teacher}</li>
        ))}
      </ul>
      <button onClick={load}>重新加载</button>
    </div>
  );
}`,
            notes: [
              { lines: "整体结构", text: "这是真实项目里最常见的组件骨架：一个数组状态存数据、一个字符串状态存进度、一个 load() 负责取数、一个 useEffect 负责首次自动取。" },
              { lines: "load() 三步", text: "① 先把状态改成「加载中…」② 等数据回来 ③ 把数据和状态一起更新。用户因此能看见进度，而不是白屏干等。" },
              { lines: "为什么用 try/catch", text: "网络请求随时可能失败（断网、后端没起）。catch 里把错误写进状态，界面上就能给出提示，而不是整个页面崩掉。" },
              { lines: "自动 + 手动", text: "useEffect 让它在组件出现时自动跑一次，按钮又调用同一个 load() 手动刷新 —— 一套逻辑两处使用。" },
              { lines: "对照项目", text: "src/RagPage.jsx 第 66-74 行 loadTab() 就是这个结构，只是把示例里的 setTimeout 换成了 await api(...) 真实请求。" },
            ],
          }} />

          <JsxRunner lesson={{
            title: "例 5 · map：把数组渲染成表格（key 是干什么的）",
            hint: "在 students 数组里加一条新学生数据，看表格会不会自动多一行。",
            code: `// map：把数组变成「一堆 JSX 元素」，
// 这是渲染列表的标准写法。
// key 是每行的唯一编号，React 靠它认出
// 「哪行没变、哪行是新的」，更新才高效。
function App() {
  // 真实学生数据（节选自生产库 rag_students 表，计科2501 班）
  const students = [
    { id: "2025070104", name: "罗慕波", bed: 3 },
    { id: "2025070107", name: "孟愚琴", bed: 6 },
    { id: "2025070110", name: "沈峰", bed: 3 },
  ];

  return (
    <table>
      <thead>
        <tr><th>学号</th><th>姓名</th><th>床号</th><th>结论</th></tr>
      </thead>
      <tbody>
        {students.map((s) => (
          <tr key={s.id}>
            <td>{s.id}</td>
            <td>{s.name}</td>
            <td>{s.bed}</td>
            <td>{s.bed <= 3 ? "下铺" : "上铺"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}`,
            notes: [
              { lines: "map", text: "students.map((s) => <tr>…</tr>)：map 把每个数组元素变成一段 JSX，结果是「一堆 JSX」组成的数组，React 会依次渲染出来。这是渲染列表的标准写法。" },
              { lines: "圆括号", text: "箭头函数返回多行 JSX 时要用 ( ) 把 JSX 包起来，否则 JS 会在换行处自动补分号，导致语法错误。" },
              { lines: "key", text: "key 是每行的唯一标识。React 靠它认出「哪一行没变、哪行是新增的、哪行被删了」，从而只更新变化的部分，而不是整表重画。选业务上唯一的字段（学号）比用数组下标更稳。" },
              { lines: "JSX 里可以写表达式", text: "{s.bed <= 3 ? \"下铺\" : \"上铺\"} —— 花括号里可以放任何 JS 表达式，用它算出要显示的内容。" },
              { lines: "对照项目", text: "src/RagPage.jsx 的学生列表、排课表，学习中心的数据表，全都是 map + key 渲染出来的。" },
            ],
          }} />

          <div className="learn-demo-box">
            <p className="learn-note">下面是<b>学习中心自己的真实组件</b>：它没有用假数据，而是通过 fetch 真的请求后端 <code>/api/learn/demo/chain</code>（走的正是 useEffect + fetch + map 这一套）。</p>
            <ReactListDemo />
          </div>

          <SourceViewer title="项目源码：RagPage.jsx 的 loadTab() 与两个 useEffect" file="src/RagPage.jsx" start={66} end={82} notes={[
            { lines: "66-67", text: "loadTab(key)：参数是标签名（students / schedule…）。第 67 行先判断「这个数据已经加载过就直接返回」，避免重复请求 —— 这是个很实用的优化。" },
            { lines: "69-70", text: "await api(...) 真实请求后端；setDataSource((prev) => ({ ...prev, [key]: data })) 用展开运算符更新对象里的一个字段，其余字段保留 —— 和例 4 的数组不可变更新是一个道理。" },
            { lines: "71-73", text: "catch 里把 error.message 写进状态。这样界面上就能显示错误，不会白屏。" },
            { lines: "83-85", text: "useEffect(() => { loadTab(tab); }, [tab]) —— 依赖 tab：切换标签页时自动重新加载。和例 2 的 [classNo] 完全同构。" },
            { lines: "80-82", text: "useEffect(..., []) —— 空数组，只在页面首次打开时拉取工具列表一次。和例 1 的 [] 完全同构。" },
          ]} />
        </>
      ),
    },
    {
      id: "fe-8", module: "frontend", type: "backend", title: "前端调用的接口，后端是怎么写的", source: "backend/learn.py · @router.get / @router.post 路由声明",
      desc: "前端每一句 fetch 背后，后端都要有一个「路由函数」接住它。下面是 FastAPI 声明路由的真实写法与逐行解释。",
      render: () => <SourceViewer file="backend/learn.py" start={148} end={161} notes={[
        { lines: "148-149", text: "@router.get(\"/health\") 是装饰器：把下面的函数注册成 GET /api/learn/health 接口；router 的 prefix 在文件头声明为 /api/learn。" },
        { lines: "150-155", text: "函数体里查库统计各表行数，return 一个 dict —— FastAPI 会自动序列化成 JSON 响应。" },
        { lines: "157-158", text: '@router.post("/reset") 同理，只是 HTTP 方法换成 POST；教学库可一键重建。' },
      ]} />,
    },
    {
      id: "fe-9", module: "frontend", type: "frontend", title: "页面路由：为什么 / 和 /learn 是同一个网站的两个页面", source: "src/main.jsx · Root() 第 44-59 行；src/main.jsx · lazy 第 7-8 行",
      desc: "这个项目没有用 React Router，而是用最朴素的办法：读 window.location.pathname，是 /learn 就渲染学习中心，是 /rag 就渲染问答页，否则渲染 3D 校园。你现在看的就是这段代码的产物。",
      render: () => (
        <>
          <SourceViewer file="src/main.jsx" start={1} end={9} notes={[
            { lines: "1-4", text: "前 4 行是导入：React、createRoot（把 React 挂到页面上）、App（3D 首页）、全局样式 styles.css。" },
            { lines: "7-8", text: "lazy(() => import(\"./RagPage\")) 叫「按需加载」：只有真的访问 /rag 时才会下载这个页面的代码，首页因此更快。你第一次点「学习中心」会有一瞬间的白屏，就是在下载。" },
          ]} />
          <SourceViewer file="src/main.jsx" start={44} end={59} notes={[
            { lines: "45", text: "window.location.pathname 就是浏览器地址栏里域名后面的那一段，比如 /learn。replace(/\\/+$/, \"\") 用来去掉末尾多余的斜杠，让 /learn/ 也能匹配。" },
            { lines: "46-51", text: "path === \"/rag\" 就渲染问答页。<Suspense fallback={...}> 是配合 lazy 使用的：代码还没下载完时先显示「正在加载 RAG 问答系统…」。" },
            { lines: "52-57", text: "path === \"/learn\" 就渲染学习中心 —— 也就是本页面。整个路由逻辑不到 15 行。" },
            { lines: "58", text: "都不匹配就渲染 <App />，即 3D 校园主站（访问 http://localhost:4175/ 看到的就是它）。" },
            { lines: "61-67", text: "createRoot(document.getElementById(\"root\")) —— 把 React 挂到 index.html 里那个空的 <div id=\"root\"> 上，这一步完成后所有界面都是 JS 画出来的。" },
          ]} />
        </>
      ),
    },
  ],
  backend: [
    {
      id: "be-1", module: "backend", type: "backend", title: "健康检查：最小的后端接口", source: "backend/main.py · @app.get(\"/api/health\")",
      desc: "GET 请求、无参数、返回 JSON。点发送看真实响应（含建筑/房间/路网统计）。",
      render: () => <ApiTester lesson={{ api: { method: "GET", path: "/api/learn/health", params: ["无参数"] } }} />,
    },
    {
      id: "be-2", module: "backend", type: "backend", title: "查询参数与路径参数", source: "backend/rag.py · /data/{kind}；backend/learn.py · /table/{name}?limit=",
      desc: "路径参数写在 URL 路径里（/table/users），查询参数跟在 ? 后面（limit=5）。改 URL 里的表名/行数直接试。",
      render: () => <ApiTester lesson={{ api: { method: "GET", path: "/api/learn/table/rag_students?limit=5", params: ["path 参数：表名（users/schedule/dorm_members/rag_students/rag_schedule/notices）", "query 参数：limit"] } }} />,
    },
    {
      id: "be-3", module: "backend", type: "backend", title: "POST + JSON 请求体 + Pydantic 校验", source: "backend/rag.py · class AskBody(BaseModel) 与 @router.post(\"/ask\")",
      desc: "POST 用请求体传数据。把 question 删掉再发送，会看到 FastAPI 自动返回 422 校验错误——这就是 Pydantic 的作用。",
      render: () => <ApiTester lesson={{ api: { method: "POST", path: "/api/rag/ask", body: '{\n  "question": "计科2601今天下午有什么课？",\n  "class_name": "计科2601"\n}', params: ["question（必填）", "class_name（可选，视角班级）"] } }} />,
    },
    {
      id: "be-4", module: "backend", type: "backend", title: "登录鉴权：JWT 令牌如何工作", source: "backend/main.py · /api/login、sign_token/verify_token、require_admin",
      desc: "先 POST /api/login 拿 token（账号 student/campus123），再把 token 带在 Authorization 头里请求 /api/me。下面的 /api/me 未带令牌会返回 401，这正是鉴权的意义。",
      render: () => <ApiTester lesson={{ api: { method: "GET", path: "/api/me", params: ["需要 Header: Authorization: Bearer <token>（可先用 /api/login 获取）"] } }} />,
    },
    {
      id: "be-5", module: "backend", type: "backend", title: "后端如何读 JSON 数据文件并计算", source: "backend/rag.py · _load()/students()/plan() 与 tool_* 工具函数",
      desc: "后端不只是转发数据库，还会加载 JSON（data/rag/*.json）做统计与规划。这个接口返回测试库各表行数 —— 重置后与生产库同规模：1849 条排课、7004 名学生。",
      render: () => <ApiTester lesson={{ api: { method: "GET", path: "/api/learn/health", params: ["无参数（返回测试库各表行数，可对照正式数据）"] } }} />,
    }, {
      id: "be-6", module: "backend", type: "backend", title: "后端源码精读：建表 → 密码 → JWT 令牌", source: "backend/main.py · init_db() / password_hash() / sign_token() / verify_token()",
      desc: "上一课演示「用」接口，这一课看「写」接口。摘录后端最核心的真实代码并逐段解释。",
      render: () => (
        <>
          <SourceViewer title="① 建表与初始化数据" file="backend/main.py" start={168} end={192} notes={[
            { lines: "168-171", text: "db_conn() 打开数据库（长连接）；CREATE TABLE IF NOT EXISTS 只在表不存在时创建（幂等，可重复运行）；演示账号用 executemany 批量 INSERT OR REPLACE，密码只存 sha256 哈希，不存明文。" },
            { lines: "173-179", text: "课表：先建表再 DELETE 清空，从 SCHEDULE_ROWS（data/rag/schedule.json，1849 条）批量灌入 —— 所以后端每次启动都和生产数据保持一致（幂等重建）。" },
            { lines: "181-187", text: "宿舍成员同样从 STUDENT_ROWS（students.json，7004 人）重建 —— JSON 是数据源，SQLite 是查询层。" },
            { lines: "189-192", text: "房间锚点覆盖表与公告表；公告只在空表时插入一条系统消息（不会重复）。" },
            { lines: "194-208", text: "为 1849 行课表 / 7004 行宿舍建 7 个索引（班级+星期+大节、教师、房间、姓名…），最后 commit + ANALYZE 让查询计划器用上索引 —— 这是接口快的直接原因。" },
          ]} />
          <SourceViewer title="② 签发与校验登录令牌（手写 JWT）" file="backend/main.py" start={217} end={236} notes={[
            { lines: "217-221", text: "sign_token()：header 声明算法 HS256；payload 放用户信息与过期时间 exp；签名用服务端密钥 SECRET 做 HMAC-SHA256。三段都是 URL 安全 Base64。" },
            { lines: "224-227", text: "verify_token()：先检查 Authorization 头是不是 Bearer 开头，否则直接 401「缺少登录令牌」。" },
            { lines: "228-231", text: "拆出三段后重算签名，用 hmac.compare_digest 恒定时间比较（防时序攻击）。" },
            { lines: "232-236", text: "再检查 exp 是否过期；任一步失败即抛 401 —— 所以不带令牌访问 /api/me 会看到「缺少登录令牌」。" },
          ]} />
        </>
      ),
    }, {
      id: "be-7", module: "backend", type: "backend", title: "后端还是网站服务器：静态托管与 SPA 回退", source: "backend/main.py · 第 912-919 行 app.mount / FileResponse / @app.get(\"/{path:path}\")",
      desc: "开发时前端跑在 4175（vite），后端跑在 8000，vite 把 /api 开头的请求转发给后端。上线时只需要后端一个服务：它既发接口，也发网页。这段代码就是「一个服务同时当 API 和网站」的写法。",
      render: () => (
        <>
          <SourceViewer file="backend/main.py" start={912} end={919} notes={[
            { lines: "912", text: "if (ROOT / \"dist\").exists(): —— dist 是前端 npm run build 的产物目录。目录不存在就不挂载，所以开发时后端不会捣乱。" },
            { lines: "913-914", text: "app.mount(\"/assets\", StaticFiles(...))：把 /assets 开头的请求直接映射成磁盘文件。3D 页面里的 6.7MB 模型、照片都通过这里下载。" },
            { lines: "916-919", text: "@app.get(\"/{path:path}\") 是「兜底路由」：任何没被前面 API 匹配到的路径都走它，返回 dist 里对应的文件；找不到文件就返回 index.html。这叫 SPA 回退。" },
            { lines: "为什么需要回退", text: "用户在 /learn 页面刷新浏览器时，浏览器会真的向服务器请求 /learn 这个路径。服务器上没有这个文件，如果不回退到 index.html，就会看到 404 —— 这正是所有单页应用必须处理的坑。" },
          ]} />
          <ApiTester lesson={{ api: { method: "GET", path: "/api/health", params: ["无参数（后端还活着吗？顺便返回建筑数/房间锚点数/路网节点数）"] } }} />
        </>
      ),
    },
  ],
  database: [
    {
      id: "db-1", module: "database", type: "database", title: "SELECT：查数据（入门第一条 SQL）", source: "backend/learn.py · run_sql()；backend/main.py · db_rows(\"SELECT ...\")",
      desc: "SELECT 列 FROM 表 [WHERE 条件]。点预制按钮或自己改 SQL，结果以表格返回。",
      sql: {
        initial: [
          "-- SQL 注释用两个减号开头，数据库会忽略它。先把「这一行在干嘛」写清楚",
          "SELECT student_id,      -- 学号：主键，全校唯一",
          "       name,            -- 姓名",
          "       gender,          -- 性别",
          "       class_name,      -- 班级",
          "       dorm_room_code   -- 宿舍房号（内部码），格式：楼栋_CR_楼层_房间号；B11=界面上的12#学生宿舍",
          "FROM rag_students       -- 学生表：7004 行（133 个班）",
          "LIMIT 10                -- 只取前 10 行，避免一次返回太多数据",
        ].join("\n"),
        note: "SELECT 只决定「看哪些列」，FROM 决定「从哪张表看」，LIMIT 决定「看几行」。把 WHERE 加上就是「只看满足条件的行」。",
        presets: [
          { label: "查前 10 名学生", sql: "SELECT student_id, name, gender, class_name, dorm_room_code FROM rag_students LIMIT 10" },
          { label: "按班级统计人数", sql: "-- COUNT(*) 数行数，GROUP BY 按班级分组\nSELECT class_name, COUNT(*) AS students FROM rag_students GROUP BY class_name" },
          { label: "查某宿舍成员", sql: "-- 一个宿舍住 6 人，房号是关联学生的关键字段\nSELECT name, class_name, bed, phone FROM rag_students WHERE dorm_room_code = 'B11_CR_F1_101'" },
          { label: "查周一课表（计科2501）", sql: "-- weekday: 1=周一 … 5=周五；period: 第几大节\nSELECT period, course, teacher, location FROM rag_schedule WHERE class_name = '计科2501' AND weekday = 1 ORDER BY period" },
        ],
      },
      render: (lesson) => <SqlConsole lesson={lesson} />,
    },
    {
      id: "db-2", module: "database", type: "database", title: "WHERE / GROUP BY / ORDER BY / JOIN 思路", source: "backend/rag.py · tool_schedule() 的过滤排序；backend/main.py · dorm_members 查询",
      desc: "筛选（WHERE）、分组统计（GROUP BY）、排序（ORDER BY）。JOIN 把两张表按共同字段连起来（本项目学生与宿舍通过 dorm_room_code 关联）。",
      sql: {
        initial: [
          "-- r 是给表起的别名，写 r.course 比 rag_schedule.course 省事",
          "SELECT r.class_name,    -- 班级",
          "       r.course,        -- 课程",
          "       r.teacher,       -- 任课教师",
          "       r.location       -- 上课地点（楼栋_CR_楼层_房间号）",
          "FROM rag_schedule r     -- 排课表：96 行，6 个班 × 16 节/周",
          "WHERE r.weekday = 3     -- 只看周三的课",
          "-- 先按班级排，同班再按节次排",
          "ORDER BY r.class_name, r.period",
        ].join("\n"),
      },
      render: (lesson) => <SqlConsole lesson={lesson} />,
    },
    {
      id: "db-3", module: "database", type: "database", title: "INSERT / UPDATE：写入与修改", source: "backend/main.py · notices 插入、room_anchor_overrides 的 INSERT OR REPLACE",
      desc: "写入后校验：先 INSERT 一条公告，再 SELECT 出来确认（测试库可随时重置，不影响正式数据）。",
      sql: {
        initial: "INSERT INTO notices(content, created_by, created_at) VALUES ('学习中心测试公告：今天 14:30 夏季作息上课', 'learn', 1789000000)",
        presets: [
          { label: "插入公告", sql: "INSERT INTO notices(content, created_by, created_at) VALUES ('学习中心测试公告：今天 14:30 夏季作息上课', 'learn', 1789000000)" },
          { label: "查看公告（应看到刚插入的）", sql: "SELECT id, content, created_by FROM notices ORDER BY id DESC LIMIT 5" },
          { label: "更新一条学生电话", sql: "UPDATE rag_students SET phone = '13900000000' WHERE student_id = '2025070104'" },
          { label: "确认更新结果", sql: "SELECT student_id, name, phone FROM rag_students WHERE student_id = '2025070104'" },
        ],
      },
      render: (lesson) => <SqlConsole lesson={lesson} />,
    },
    {
      id: "db-4", module: "database", type: "database", title: "后端代码怎么操作数据库（可自己改代码运行）", source: "backend/main.py · init_db() 建表、db_rows() 查询、save_anchor() 写入、commit()",
      desc: "下面是真实项目里后端操作 SQLite 的代码形态。修改 SQL 后点运行：教学解释器会提取 db.execute/db_rows 里的语句在测试库顺序执行并返回每步结果。",
      py: {
        code: `import sqlite3

# ① 连接数据库：项目里 DB_PATH = ROOT / "data" / "campus.db"
db = sqlite3.connect("data/campus.db")

# ② 查询：SELECT。项目把「连接→执行→取值→关闭」封装成了 db_rows()
rows = db_rows("SELECT class_name, COUNT(*) AS students FROM rag_students GROUP BY class_name")

# ③ 写入：INSERT 之后必须 commit()，否则连接关闭时改动会丢失
db.execute("INSERT INTO notices(content, created_by, created_at) VALUES ('来自后端代码运行器的公告', 'learn', 1789000001)")
db.commit()

# ④ 再查一次，确认刚才那条真的写进去了（按源码顺序执行，所以能看到它）
rows = db_rows("SELECT id, content FROM notices ORDER BY id DESC LIMIT 3")`,
        notes: [
          { lines: "第 4 行", text: "sqlite3.connect(路径) 打开数据库文件。SQLite 是「一个文件就是一个数据库」，不需要单独装服务，所以特别适合课程作业和小型项目。" },
          { lines: "第 7 行", text: "db_rows(...) 是项目自定义的封装（backend/main.py 第 294 行），返回 list[dict]，每行是一个字典，取值用 row[\"class_name\"]。这里演示的 SQL 会真的在测试库跑。" },
          { lines: "第 10-11 行", text: "INSERT 后紧跟 db.commit()。不 commit 的话数据只在内存里，连接一关就没了 —— 这是新手最常见的坑。" },
          { lines: "第 14 行", text: "回查是关键：写操作本身没有返回值，必须再 SELECT 一次才能确认结果。运行器会按你写的先后顺序逐条执行，所以这里能看到刚插入的公告。" },
          { lines: "运行器原理", text: "它不执行任意 Python（那太危险），而是用正则把你的 db.execute(\"...\") / db_rows(\"...\") 里的 SQL 抠出来，记录行号，再按顺序重放到测试库。所以 SQL 必须写成字符串字面量。" },
        ],
      },
      render: (lesson) => (
        <>
          <PyRunner lesson={lesson} />
          <SourceViewer title="① 后端所有查询的公共入口：db_rows()" file="backend/main.py" start={294} end={296} notes={[
            { lines: "294-296", text: "db_rows(sql, args)：把「执行 → 取行 → 转 dict」封装成一个函数并返回 list[dict]，全项目查询都走它。连接本身由 db_conn() 统一管理（长连接 + row_factory）。" },
            { lines: "row_factory", text: "db_conn() 里设置 row_factory = sqlite3.Row（第 285 行），结果可按列名取值（row['class_name']），而不是只能按下标。" },
          ]} />
          <SourceViewer title="② 写入路径与安全控制" file="backend/learn.py" start={101} end={146} notes={[
            { lines: "101", text: "FORBIDDEN 列出危险关键字（drop/delete/alter/attach/pragma…），教学控制台一律拒绝。" },
            { lines: "104-114", text: "guard_sql()：先去掉注释 → 只允许单条语句 → 只放行 SELECT/INSERT/UPDATE → 再扫一遍禁用词。" },
            { lines: "120-137", text: "run_sql()：SELECT 返回「列名 + 行数据」，写操作返回影响行数并记录耗时 —— 前端表格就是这么渲染出来的。" },
            { lines: "196-235", text: "run_backend_code()：上面那个「后端代码运行器」。它用正则把 db.execute(\"...\") / db_rows(\"...\") 里的 SQL 抠出来，连同行号一起记下，再按源码先后顺序重放到测试库。为什么不直接跑 Python？因为那等于给网页开了任意代码执行入口，绝对不能这么干。" },
          ]} />
        </>
      ),
    },
    {
      id: "db-5", module: "database", type: "database", title: "两表关联 JOIN：把学生表和课表连起来", source: "backend/rag.py · tool_schedule() 与 tool_dorm()；backend/main.py · dorm_members 表",
      desc: "真实数据不会都塞在一张表里：学生信息在 rag_students，排课在 rag_schedule，两张表靠 class_name（班级）这个共同字段关联。JOIN 就是「按关联字段把两行拼成一行」。",
      sql: {
        initial: "SELECT s.name, r.weekday, r.period, r.course, r.teacher, r.location\nFROM rag_students s\nJOIN rag_schedule r ON r.class_name = s.class_name\nWHERE s.student_id = '2025070104' AND r.weekday = 1\nORDER BY r.period",
        note: "读法：从 rag_students 取一个学生（别名 s），按 s.class_name = r.class_name 去 rag_schedule（别名 r）里找同一班级的排课，拼成一行。结果是「罗慕波周一的全部课」。",
        presets: [
          { label: "某个学生周一的课（JOIN）", sql: "SELECT s.name, r.weekday, r.period, r.course, r.teacher, r.location\nFROM rag_students s\nJOIN rag_schedule r ON r.class_name = s.class_name\nWHERE s.student_id = '2025070104' AND r.weekday = 1\nORDER BY r.period" },
          { label: "某班每周上几节课（GROUP BY 统计）", sql: "SELECT r.weekday, COUNT(*) AS lessons, COUNT(DISTINCT r.course) AS courses FROM rag_schedule r WHERE r.class_name = '计科2501' GROUP BY r.weekday ORDER BY r.weekday" },
          { label: "三个班各多少人（IN 多值筛选）", sql: "SELECT class_name, COUNT(*) AS students FROM rag_students WHERE class_name IN ('计科2501','计科2502','计科2503') GROUP BY class_name" },
          { label: "字符串函数：姓名大写 / 电话位数", sql: "SELECT UPPER(name) AS upper_name, LENGTH(home_phone) AS phone_digits, hometown FROM rag_students WHERE class_name = '计科2501' LIMIT 4" },
        ],
      },
      render: (lesson) => <SqlConsole lesson={lesson} />,
    },
    {
      id: "db-6", module: "database", type: "database", title: "主键与约束：为什么乱插数据会失败", source: "backend/learn.py · SCHEMA_SQL 的 PRIMARY KEY；backend/main.py · INSERT OR REPLACE 写入锚点",
      desc: "表结构里写死的规则，数据库会强制执行。学号是主键，重复插入同一个学号会被直接拒绝——这正是「脏数据进不来」的原因。先看初始查询，再点「① 重复插入」看报错，最后点「② 确认数据没被污染」。",
      sql: {
        initial: "SELECT student_id, name, class_name FROM rag_students WHERE student_id = '2025070104'",
        note: "初始这条查询用来确认 2025070104 已经存在。接着点「① 重复插入」，数据库会抛 UNIQUE constraint failed，一行都不会被写入 —— 业务代码因此不必自己写重复检查。",
        presets: [
          { label: "① 重复插入（会被拒绝）", sql: "INSERT INTO rag_students(student_id, name, class_name) VALUES ('2025070104', '重复学号', '计科2501')" },
          { label: "② 确认没被污染", sql: "SELECT student_id, name, class_name FROM rag_students WHERE student_id = '2025070104'" },
          { label: "③ 插入一条新公告", sql: "INSERT INTO notices(content, created_by, created_at) VALUES ('事务演示：先插公告', 'learn', 1789000002)" },
          { label: "④ 修改这条公告", sql: "UPDATE notices SET content = '事务演示：公告已被修改' WHERE created_by = 'learn' AND content = '事务演示：先插公告'" },
          { label: "⑤ 回查结果", sql: "SELECT id, content, created_by FROM notices WHERE created_by = 'learn' ORDER BY id DESC LIMIT 3" },
        ],
      },
      render: (lesson) => (
        <>
          <SqlConsole lesson={lesson} />
          <SourceViewer title="约束是写在建表语句里的（教学库与正式库结构完全一致）" file="backend/learn.py" start={37} end={46} notes={[
            { lines: "38", text: "users 表：username TEXT PRIMARY KEY —— 主键意味着唯一且非空，同一个用户名不可能有两条记录。" },
            { lines: "39", text: "schedule 表：id INTEGER PRIMARY KEY AUTOINCREMENT —— 整数主键 + 自增，插入时不用自己给 id，数据库自动分配。" },
            { lines: "41", text: "room_anchor_overrides 表：room_code TEXT PRIMARY KEY —— 每个房间只能有一条锚点覆盖记录，所以正式项目用 INSERT OR REPLACE 写入（存在则替换，不存在则插入）。" },
            { lines: "44-45", text: "rag_students / rag_schedule 是教学专用「物化表」：把项目里以 JSON 存放的数据转成真正的表，字段与 JSON 一一对应，方便你练 SQL。" },
          ]} />
        </>
      ),
    },
  ],
  rag: [
    {
      id: "rag-1", module: "rag", type: "rag", title: "什么是 RAG？本项目为什么这样实现", source: "backend/rag.py 模块头部注释与 ask() 五环节",
      desc: "RAG = 检索增强生成：先检索真实数据，再组织成答案，从而避免「编造」。本项目把检索与推理全放在确定性工具函数里，LLM 只负责理解（可插拔），所以答案可溯源、可评测。",
      render: () => (
        <div className="learn-demo-box">
          <p className="learn-steps-title">五环节管道（对应 backend/rag.py）</p>
          <div className="learn-steps">
            <div className="learn-step"><b>① 意图路由</b>作息 / 宿舍 / 周课量 / 统计 / 课表 / 培养方案</div>
            <div className="learn-step"><b>② 槽位抽取</b>班级、姓名、周几、第N大节、冬季/夏季</div>
            <div className="learn-step"><b>③ 确定性工具</b>tool_schedule / tool_timetable / tool_dorm / tool_route</div>
            <div className="learn-step"><b>④ 时间与季节</b>按日期选夏/冬作息，非上课日回退</div>
            <div className="learn-step"><b>⑤ 回答 + 溯源</b>模板合成 + sources[] 指向源数据</div>
          </div>
        </div>
      ),
    },
    {
      id: "rag-2", module: "rag", type: "rag", title: "实测问答：提问 → 意图 → 答案 → 溯源", source: "backend/rag.py · ask()；src/RagPage.jsx · ask()",
      desc: "直接对真实接口提问。会显示识别出的意图、回答全文和数据溯源（与左侧源数据一一对应）。",
      render: () => <RagTester />,
    },
    {
      id: "rag-3", module: "rag", type: "rag", title: "数据是怎么造的：生成器 + 冲突校验", source: "scripts/generate_rag_data.py · build_schedule()/validation.json",
      desc: "排课必须保证「班级×大节、教师×大节、教室×大节」三重不冲突，宿舍要同性别、容量≤6。生成器内置校验，输出 validation.json（全 PASS）。",
      render: () => <SqlConsole lesson={{ sql: { initial: "SELECT class_name, course, teacher, weekday, period, location FROM rag_schedule WHERE class_name = '计科2501' ORDER BY weekday, period", presets: [
        { label: "看计科2501完整周课表", sql: "SELECT class_name, course, teacher, weekday, period, location FROM rag_schedule WHERE class_name = '计科2501' ORDER BY weekday, period" },
        { label: "查教室冲突（应无结果）", sql: "SELECT location, weekday, period, COUNT(*) AS c FROM rag_schedule WHERE location NOT LIKE 'POI%' GROUP BY location, weekday, period HAVING c > 1" },
        { label: "查教师时间冲突（应无结果）", sql: "SELECT teacher, weekday, period, COUNT(*) AS c FROM rag_schedule GROUP BY teacher, weekday, period HAVING c > 1" },
      ] } }} />,
    },
    {
      id: "rag-4", module: "rag", type: "rag", title: "评测集：如何证明问答是准确的", source: "backend/rag.py · EVAL_CASES 与 /api/rag/eval",
      desc: "12 条带期望值的测试问题，覆盖季节作息、课表、周课量、聚合统计等。每次改代码跑一遍，防止改一处坏一处。",
      render: () => <EvalRunner />,
    }, {
      id: "rag-5", module: "rag", type: "backend", title: "后端 ask 管道源码精读", source: "backend/rag.py · ask() 意图分支与 EVAL_CASES",
      desc: "这是问答系统的心脏：一个函数里完成「解析时间 → 判断意图 → 调工具检索 → 组装答案与溯源」。",
      render: () => (
        <>
          <SourceViewer title="① ask()：从提问到结构化结果的调度中心" file="backend/rag.py" start={491} end={545} notes={[
            { lines: "491-496", text: "ask(body) 接收 AskBody（Pydantic 校验过的请求体），取出 question 与可选的视角班级 class_name；parse_time() 解析今天/明天/周X。" },
            { lines: "498-501", text: "按关键字先判断意图：路线（怎么走/导航）、课表（上课/教室）、作息（几点下课），再查 tool_find_students() 看是不是在问某个人。" },
            { lines: "503-513", text: "regime_of_ask()：作息按日期自动选夏/冬；用户显式问「冬季」则覆盖 —— 保证上课时间回答准确。" },
            { lines: "515 起", text: "宿舍、课表、统计等分支各自调用对应工具函数（tool_schedule/tool_dorm/tool_route…，确定性检索），并把命中的源记录放进 sources[] 做溯源。" },
          ]} />
          <SourceViewer title="② 评测集：用数据证明问答准确" file="backend/rag.py" start={800} end={820} notes={[
            { lines: "800 起", text: "每条用例写明问题、期望意图、期望答案片段；eval_run() 跑一遍统计通过率（当前 12/12）。" },
            { lines: "动态断言", text: "「第3大节几点下课」的期望时刻随夏/冬作息动态生成，避免写死时间导致误判。" },
          ]} />
        </>
      ),
    },
  ],
  threeD: [
    {
      id: "3d-1", module: "threeD", type: "3d", title: "3D 知识点总览：要学的东西一共就这些", source: "src/App.jsx · Canvas / CampusScene / CampusModel；blender/generate_campus.py · 建模脚本",
      desc: "网页 3D 的本质：用代码描述一个三维世界（几何体 + 材质 + 灯光 + 相机），再由显卡每秒钟画 60 次。下面这张表就是全部知识点，后面每一关都会亲手写代码。",
      render: () => <D3ConceptMap />,
    },
    {
      id: "3d-2", module: "threeD", type: "3d", title: "3D 建模代码台：从第一个方块到一整排楼（可改代码）", source: "blender/generate_campus.py · cube() / building_assets()；src/App.jsx · Building / CampusModel",
      desc: "左侧写建模代码，点「运行代码」右侧立刻出效果 —— 代码是真的在浏览器里执行。L1 一行一个方块 → L2 变量与坐标 → L3 for 循环批量生成 → L4 一栋完整的楼 → L5 材质灯光 → L6 动画 → L7 点击交互。七关走完，项目那 500 行建模脚本你就看得懂了。",
      render: () => <ModelLab levels={MODEL_LEVELS} />,
    },
    {
      id: "3d-3", module: "threeD", type: "3d", title: "坐标系与「建筑不陷地」的关键公式", source: "src/App.jsx · Building 第 339 行 const y = building.h / 2；blender/generate_campus.py · cube()",
      desc: "三维坐标 Y 轴向上；盒子几何体以自身中心定位，所以要让楼站在地面上，y 必须等于高度的一半（h/2）。项目早期正因漏了这个偏移导致楼体半埋——这是最典型的坑。",
      render: () => <HtmlRunner lesson={{ title: "坐标系与 h/2", html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset='utf-8' />
    <style>
      body {
        font-family: system-ui;
        background: #08131e;
        color: #e8f1fa;
        padding: 14px;
        font-size: 13px;
      }
      .box {
        display: inline-block;
        vertical-align: bottom;
        background: #4fc3f7;
        width: 40px;
        margin-right: 30px;
      }
    </style>
  </head>
  <body>
    <h3>同一栋楼（h=6），y 取值的两种结果</h3>
    <div style="height: 120px; border-bottom: 2px solid #75d19d; position: relative">
      <div class="box" style="height: 60px; position: absolute; bottom: 0; left: 30px"></div>
      <div class="box" style="height: 60px; position: absolute; bottom: -30px; left: 110px; opacity: .55"></div>
      <span style="position: absolute; bottom: 0; left: 24px">▲</span>
    </div>
    <p style="margin-top: 14px">
      ① y = h/2（正确）：楼完整站在地面上。<br>
      ② y = 0（错误）：楼的中心在地面，下半截埋进地里——这就是"半埋" bug。<br>
      换算：<code>y = h/2 = 6/2 = 3</code>
    </p>
  </body>
</html>` }} />,
    },
    {
      id: "3d-4", module: "threeD", type: "3d", title: "自己写的简化场景 vs 项目真实模型", source: "public/assets/yueyang_campus.glb（Blender 导出）；src/App.jsx · useGLTF（622 行）",
      desc: "上面几关你写的是十来行代码的简化场景；项目的真实校园是 Blender 脚本批量生成后导出的 6.4MB glb 文件，由 useGLTF 加载。加载方式不同，但坐标、材质、动画的原理完全一样。",
      render: () => <RealModelViewer />,
    },
    {
      id: "3d-5", module: "threeD", type: "3d", title: "项目真实模型是怎么造出来的（四步流水线）", source: "scripts/generate_road_graph.mjs → blender/generate_campus.py → src/App.jsx",
      desc: "真实模型不是手工摆的：Blender Python 脚本按 data/campus_layout.json 的建筑数据批量生成立面、窗带、LOD2 房间与锚点，再导出 GLB 给网页加载。项目里 630 个房间锚点（data/room_anchors.json）就是这样产出的。",
      render: () => (
        <div className="learn-demo-box">
          <div className="learn-table-wrap">
            <table className="learn-table">
              <thead><tr><th>环节</th><th>文件</th><th>产物</th></tr></thead>
              <tbody>
                <tr><td>① 生成路网</td><td>scripts/generate_road_graph.mjs</td><td>data/road_graph.json（供问路功能算最短路）</td></tr>
                <tr><td>② Blender 建模</td><td>blender/generate_campus.py</td><td>yueyang_campus.glb + room_anchors.json（630 房间）</td></tr>
                <tr><td>③ 网页加载</td><td>src/App.jsx · useGLTF()</td><td>3D 首页渲染 + 点击拾取 building_code</td></tr>
                <tr><td>④ 动画与交互</td><td>src/App.jsx · useFrame / onClick</td><td>选中上浮、房间显隐、高亮变色</td></tr>
              </tbody>
            </table>
          </div>
          <p className="learn-note">想自己验证：把上面 L1~L7 的代码逐步敲一遍，再回到这一关对比真实模型，你会发现结构是一样的（楼体盒子 + 窗带薄片 + 圆环体育馆）。</p>
        </div>
      ),
    }, {
      id: "3d-6", module: "threeD", type: "3d", title: "建模与动画源码精读（Blender 脚本 + 前端动画）", source: "blender/generate_campus.py · cube()/facade_strip()；src/App.jsx · Building / CampusModel",
      desc: "模型不是手摆的：Blender Python 脚本按数据批量生成几何体；网页端再用 useFrame 驱动动画与交互。两段真实源码逐段解释。",
      render: () => (
        <>
          <SourceViewer title="① Blender 脚本：几何体的最小生成单元" file="blender/generate_campus.py" start={60} end={92} notes={[
            { lines: "60", text: "cube(name, location, scale, mat, bevel...)：封装「新建立方体 → 设位置/尺寸 → 赋材质」，脚本里上千个构件都靠它。这正是建模台里 box() 的原型。" },
            { lines: "61-64", text: "注释说明了坐标系换算：建模数据用 Three.js 的 Y 轴向上，而 Blender 是 Z 轴向上，所以要 (x,y,z) → (x,-z,y)，导出 glTF 时再转回来。" },
            { lines: "66-79", text: "不带圆角时走「手动拼顶点」的快路径：先建一个单位立方体网格并缓存复用，再给每个实例设 location/scale —— 和网页端 boxGeometry args=[w,h,d] 是同一件事。" },
            { lines: "80-91", text: "带圆角时改用 Blender 操作符 primitive_cube_add 并加 Bevel 修改器，让建筑边角柔和，这一步是纯几何数据处理，和「材质/灯光」无关。" },
          ]} />
          <SourceViewer title="② 前端：一个建筑组件 = 楼体 + 窗带 + 点击" file="src/App.jsx" start={361} end={415} notes={[
            { lines: "362", text: "const y = building.h / 2 —— 建模台 L2 讲的就是这一行。它保证楼不陷进地里。" },
            { lines: "363-374", text: "windowRows 与 count 决定窗户密度：层数取 min(floors, 5)，每层窗户数按宽度算 Math.max(3, floor(w/4))。" },
            { lines: "377", text: "窗是一个很薄的小盒子 <boxGeometry args={[1.25,0.9,0.12]} /> —— 建模台 L4 的窗带是它的简化版。" },
            { lines: "405 起", text: "楼体本身：普通楼用 boxGeometry，弧形楼（体育馆）用 cylinderGeometry 加开口角度参数，尺寸都来自 building 数据对象。" },
          ]} />
          <SourceViewer title="③ 前端：加载模型 + 静态合批预处理" file="src/App.jsx" start={684} end={793} notes={[
            { lines: "684", text: "useGLTF(\"/assets/yueyang_campus.glb\") 读取 Blender 导出的模型；下面 traverse 遍历所有网格，用名字正则解析出 building_code。" },
            { lines: "694-746", text: "材质共享：同一栋楼共用同一份材质实例（约 950 份 → 约 200 份），减少 uniform 刷新与 program 切换 —— 这是材质动画快的前提。" },
            { lines: "775-791", text: "实例化合批：同一几何体出现 ≥6 次的类别（树木 606 个 → 5 个批次）合并成 InstancedMesh，并关掉拾取。" },
            { lines: "793-845", text: "几何合批：几何体各不相同的道路/广场（450+ 个）按材质烘焙世界矩阵后 mergeGeometries 合成少数 Mesh —— WebGL geometries 722 → 168，交互期每帧 draw call 953 → 405。" },
          ]} />
          <SourceViewer title="④ 前端：useFrame 驱动动画 + onClick 点击交互" file="src/App.jsx" start={861} end={965} notes={[
            { lines: "861-866", text: "useFrame((_, delta) => {...}) 每帧执行；demand 渲染模式下常态直接早退（0 帧重绘），动画没收敛时 invalidate() 把下一帧续上。" },
            { lines: "834-850", text: "目标高度三层级：liftOf(编号)（= 楼栋自身高度，BUILDING_LIFT 第 299 行）弹起显示内剖、选中抬 5.5、高亮抬 1.5 —— 三个层级让用户一眼分清状态。" },
            { lines: "904", text: "THREE.MathUtils.damp(当前位置, 目标位置, 5.5, delta)：带阻尼的平滑插值，所以楼是「弹起来」而不是「瞬间跳上去」。建模台 L6 用的同一个函数。" },
            { lines: "943-951", text: "onClick 从被点中的网格向上找 building_code，再回调 onSelect 交给 React 改状态；event.delta > 4 判定为拖拽视角、不当作点击 —— 3D 事件 → 界面状态 的完整链路。" },
          ]} />
        </>
      ),
    },
  ],
};

function EvalRunner() {
  const [result, setResult] = useState(null);
  useEffect(() => { api("/api/rag/eval").then(setResult).catch(() => {}); }, []);
  if (!result) return <p className="learn-note">评测运行中…</p>;
  return (
    <div className="learn-demo-box">
      <p><b className={result.passed === result.total ? "learn-pass" : "learn-fail"}>评测结果：{result.passed}/{result.total} 通过（{Math.round(result.rate * 100)}%）</b></p>
      <div className="learn-table-wrap">
        <table className="learn-table">
          <thead><tr><th>结果</th><th>问题</th><th>识别意图</th></tr></thead>
          <tbody>
            {result.results.map((row) => (
              <tr key={row.q}>
                <td className={row.pass ? "learn-pass" : "learn-fail"}>{row.pass ? "PASS" : "FAIL"}</td>
                <td>{row.q}</td>
                <td className="learn-dim">{row.actual_intent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LearnPage() {
  const [module, setModule] = useState("chain");
  const [lessonIndex, setLessonIndex] = useState(0);
  const lessons = LESSONS[module] || [];
  const lesson = lessons[Math.min(lessonIndex, lessons.length - 1)];
  const ModuleIcon = MODULES.find((m) => m.key === module)?.icon || BookOpen;

  return (
    <div className="learn-shell">
      <header className="learn-topbar">
        <div className="learn-brand">
          <div className="learn-mark"><GraduationCap size={20} /></div>
          <div>
            <b>岳阳学院智慧校园 · 学习中心</b>
            <small>零基础拆解项目：前端 / 后端 / 数据库 / RAG / 3D建模 —— 每个知识点都可现场运行验证</small>
          </div>
        </div>
        <div className="learn-top-actions">
          <span className="learn-pill"><Braces size={12} /> {Object.values(LESSONS).flat().length} 个知识点</span>
          <button className="learn-pill learn-pill-btn" onClick={() => (window.location.href = "/rag")}>RAG 问答页 →</button>
          <button className="learn-pill learn-pill-btn" onClick={() => (window.location.href = "/")}>3D 首页 →</button>
        </div>
      </header>
      <main className="learn-layout">
        <aside className="learn-nav">
          {MODULES.map((m) => (
            <button key={m.key} className={module === m.key ? "learn-nav-item active" : "learn-nav-item"} onClick={() => { setModule(m.key); setLessonIndex(0); }}>
              <m.icon size={15} />
              <span><b>{m.label}</b><small>{m.desc}</small></span>
            </button>
          ))}
          <div className="learn-nav-list">
            <p className="learn-nav-title"><ModuleIcon size={13} /> 知识点列表</p>
            {lessons.map((l, i) => (
              <button key={l.id} className={i === lessonIndex ? "learn-lesson-item active" : "learn-lesson-item"} onClick={() => setLessonIndex(i)}>
                {i + 1}. {l.title}
              </button>
            ))}
          </div>
        </aside>
        <section className="learn-content">
          {lesson && (
            <>
              <LessonHead lesson={lesson} />
              {/* key=lesson.id：切换知识点时重建运行器，避免沿用上一课的编辑区/预览状态 */}
              <div key={lesson.id}>{lesson.render(lesson)}</div>
            </>
          )}
          <footer className="learn-footer">
            <span>提示：所有示例都真实调用本项目后端（:8000）与测试库，可放心反复运行；改动只影响教学测试库。</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
