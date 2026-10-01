"use client";
import { useState } from "react";

type Event = { at: number; actor: string; email: string; role: string; action: string; changes: Array<{ container: string; field: string; before: string; after: string }> };
export function OrderAudit({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fetchEvents = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/order-audit?orderId=" + encodeURIComponent(orderId), { cache: "no-store" });
      const data = await response.json() as { events?: Event[]; error?: string };
      if (!response.ok) throw Error(data.error || "日志读取失败");
      setEvents(data.events || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "日志读取失败"); }
    finally { setLoading(false); }
  };
  return <details className="mt-3 rounded-lg border border-[#dce5ea] bg-white p-3 text-sm" onToggle={event => { if (event.currentTarget.open) void fetchEvents(); }}><summary className="cursor-pointer font-semibold text-[#0b756f]">操作日志 · 点击查看</summary>{loading && <p className="mt-2">正在读取…</p>}{error && <p role="alert" className="mt-2 text-red-700">{error}</p>}{!loading && !error && <div className="mt-2 max-h-72 overflow-y-auto">{events.length ? events.map((item, index) => <details key={`${item.at}-${index}`} className="border-t py-2"><summary className="cursor-pointer">{new Date(item.at).toLocaleString("zh-MY", { timeZone: "Asia/Kuala_Lumpur" })} · {item.actor}（{item.role}）· {item.action} · {item.changes.length} 项</summary><div className="mt-1 space-y-1 pl-4 text-[#536b78]">{item.changes.map((change, i) => <p key={i} className="break-words">{change.container} · {change.field}：{change.before} → {change.after}</p>)}</div></details>) : <p className="py-2 text-[#708491]">暂无操作记录。</p>}</div>}</details>;
}
