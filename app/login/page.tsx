"use client";
import { useEffect, useState, type FormEvent } from "react";
export default function LoginPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [registered, setRegistered] = useState(false);
  useEffect(() => { setRegistered(new URLSearchParams(location.search).has("registered")); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
      const raw = await response.text();
      let result: { error?: string } = {};
      try { result = JSON.parse(raw) as { error?: string }; } catch { /* Railway may return a non-JSON error while the service restarts. */ }
      if (!response.ok) throw Error(result.error || `网站服务暂时无法登录（HTTP ${response.status}），请检查网站服务的 Variables 和部署日志。`);
      const target = new URLSearchParams(location.search).get("return_to") || "/";
      location.assign(target.startsWith("/") && !target.startsWith("//") ? target : "/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7f9] px-4 text-[#152d3a]"><form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[#dce5ea] bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">送柜计划工作台</h1><p className="mt-1 text-sm text-[#647b88]">Railway 测试版 · 登录</p>{registered && <p role="status" className="mt-3 text-sm text-[#0b756f]">注册申请已提交，请等待管理员批准。</p>}<label className="mt-6 block text-sm font-medium">账号<input autoComplete="username" required maxLength={80} value={name} onChange={event => setName(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-[#cbdbe0] px-3" /></label><label className="mt-4 block text-sm font-medium">密码<input type={visible ? "text" : "password"} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-[#cbdbe0] px-3" /></label><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />显示密码</label>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="mt-5 h-11 w-full rounded-md bg-[#0b756f] font-semibold text-white disabled:opacity-50">{busy ? "登录中…" : "登录"}</button><a href="/register" className="mt-4 block text-center text-sm text-[#0b756f] hover:underline">注册账号</a></form></main>;
}
