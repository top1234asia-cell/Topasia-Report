"use client";
import { useState, type FormEvent } from "react";
export default function RegisterPage() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmation) { setError("两次输入的密码不一致"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
      const raw = await response.text();
      let result: { error?: string } = {};
      try { result = JSON.parse(raw) as { error?: string }; } catch { /* Service may restart. */ }
      if (!response.ok) throw Error(result.error || `注册失败（HTTP ${response.status}）`);
      location.assign("/login?registered=1");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "注册失败"); setBusy(false); }
  }
  const input = "mt-1 h-11 w-full rounded-md border border-[#cbdbe0] px-3";
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7f9] px-4 py-8 text-[#152d3a]"><form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[#dce5ea] bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">注册账号</h1><p className="mt-1 text-sm text-[#647b88]">提交申请后，管理员批准才能登录</p><label className="mt-6 block text-sm font-medium">账号<input autoComplete="username" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} className={input} /></label><label className="mt-4 block text-sm font-medium">密码（至少 12 个字符）<input type={visible ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className={input} /></label><label className="mt-4 block text-sm font-medium">确认密码<input type={visible ? "text" : "password"} autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} className={input} /></label><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />显示密码</label>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}<button disabled={busy} className="mt-5 h-11 w-full rounded-md bg-[#0b756f] font-semibold text-white disabled:opacity-50">{busy ? "注册中…" : "提交注册申请"}</button><a href="/login" className="mt-4 block text-center text-sm text-[#0b756f] hover:underline">已有账号？返回登录</a></form></main>;
}
