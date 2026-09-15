import React, { Component, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// 独立 RAG 问答页（免登录，路由 /rag）与学习中心（免登录，路由 /learn）
const RagPage = lazy(() => import("./RagPage"));
const LearnPage = lazy(() => import("./LearnPage"));

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("智慧校园界面初始化失败", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="root-error-screen">
        <div className="root-error-panel">
          <span className="eyebrow">APPLICATION RECOVERY</span>
          <h1>校园界面未能完成加载</h1>
          <p>
            系统已拦截异常，登录状态和浏览器不会丢失。重新载入后可继续进入校园。
          </p>
          <code>{this.state.error?.message || "未知运行时错误"}</code>
          <button type="button" onClick={() => window.location.reload()}>
            重新载入系统
          </button>
        </div>
      </main>
    );
  }
}

function Root() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/rag")
    return (
      <Suspense fallback={<div className="rag-loading">正在加载 RAG 问答系统…</div>}>
        <RagPage />
      </Suspense>
    );
  if (path === "/learn")
    return (
      <Suspense fallback={<div className="rag-loading">正在加载学习中心…</div>}>
        <LearnPage />
      </Suspense>
    );
  return <App />;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <Root />
    </RootErrorBoundary>
  </React.StrictMode>,
);
