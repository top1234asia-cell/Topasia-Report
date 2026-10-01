"use client";
import { useEffect, useState, type FormEvent } from "react";
export default function AccountPage() {
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch("/api/account").then(r => r.json() as Promise<{ account?: {name:string}; error?:string }>).then(result => { if (result.account) setName(result.account.name); else setMessage(result.error || "请先登录"); }).catch(() => setMessage("无法读取账号")); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (newPassword !== confirmation) { setMessage("两次输入的新密码不一致"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, currentPassword, newPassword }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "保存失败");
      setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setMessage("账号资料已更新");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(false); }
  }
  const cls = "mt-1 h-11 w-full rounded-md border border-[#cbdbe0] px-3";
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f7f9] px-4 text-[#152d3a]"><form onSubmit={submit} className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">账号设置</h1><p className="mt-1 text-sm text-[#647b88]">可修改账号名称及密码，历史业务仍保留。</p><label className="mt-5 block text-sm">账号<input required value={name} onChange={event => setName(event.target.value)} className={cls} /></label><label className="mt-4 block text-sm">当前密码<input type={visible ? "text" : "password"} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className={cls} /></label><label className="mt-4 block text-sm">新密码（不修改可留空）<input type={visible ? "text" : "password"} value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={12} className={cls} /></label><label className="mt-4 block text-sm">确认新密码<input type={visible ? "text" : "password"} value={confirmation} onChange={event => setConfirmation(event.target.value)} className={cls} /></label><label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} />显示密码</label>{message && <p role="status" className="mt-3 text-sm">{message}</p>}<button disabled={busy} className="mt-5 h-11 w-full rounded-md bg-[#0b756f] font-semibold text-white disabled:opacity-50">保存修改</button><a href="/" className="mt-4 block text-center text-sm text-[#0b756f]">返回工作台</a></form></main>;
}
