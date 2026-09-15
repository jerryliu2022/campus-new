import React, { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  GraduationCap,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const accounts = [
  {
    role: "student",
    label: "学生",
    account: "student",
    password: "campus123",
    Icon: GraduationCap,
  },
  {
    role: "teacher",
    label: "教师",
    account: "teacher",
    password: "teacher123",
    Icon: BookOpen,
  },
  {
    role: "counselor",
    label: "辅导员",
    account: "counselor",
    password: "campus123",
    Icon: UserRound,
  },
  {
    role: "admin",
    label: "管理员",
    account: "admin",
    password: "admin123",
    Icon: ShieldCheck,
  },
];

export default function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState(accounts[0]);
  const [account, setAccount] = useState(accounts[0].account);
  const [password, setPassword] = useState(accounts[0].password);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const choose = (entry) => {
    setSelected(entry);
    setAccount(entry.account);
    setPassword(entry.password);
    setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account, password }),
      });
      if (!response.ok) throw new Error("账号或密码错误");
      const payload = await response.json();
      localStorage.setItem("campus_token", payload.access_token);
      onLogin({ ...payload.user, token: payload.access_token });
    } catch (reason) {
      setError(reason.message || "登录服务暂不可用");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-screen">
      <div className="login-photo" aria-hidden="true" />
      <div className="login-brand">
        <span className="login-emblem">
          <Building2 size={24} />
        </span>
        <div>
          <small>YUEYANG COLLEGE</small>
          <b>智慧校园数字孪生</b>
        </div>
      </div>
      <form className="login-panel" onSubmit={submit}>
        <span className="eyebrow">SECURE CAMPUS ACCESS</span>
        <h1>进入岳阳学院</h1>
        <p>
          登录后进入真实比例校园模型，查看课表空间高亮、导航路线与角色化数据。
        </p>
        <div className="account-tabs">
          {accounts.map((entry) => (
            <button
              type="button"
              key={entry.role}
              className={selected.role === entry.role ? "active" : ""}
              onClick={() => choose(entry)}
            >
              <entry.Icon size={16} />
              {entry.label}
            </button>
          ))}
        </div>
        <label>
          <span>校园账号</span>
          <div className="login-input">
            <UserRound size={16} />
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="username"
            />
          </div>
        </label>
        <label>
          <span>登录密码</span>
          <div className="login-input">
            <LockKeyhole size={16} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="login-submit" disabled={busy}>
          {busy ? "正在验证…" : "登录并进入校园"}
          <ArrowRight size={17} />
        </button>
        <div className="login-foot">
          <ShieldCheck size={14} />
          演示账号已预填，身份权限由本地服务签发。
        </div>
      </form>
    </div>
  );
}
