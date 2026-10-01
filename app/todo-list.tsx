"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Todo = { id: string; owner: string; groupNo: string; matter: string; urgent: number; createdAt: number; completedAt: number | null };
const sortTodos = (items: Todo[]) => [...items].sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || b.urgent - a.urgent || b.createdAt - a.createdAt);
const localDate = (timestamp: number) => new Date(timestamp).toLocaleString("zh-CN", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function TodoList({ userName, groupNos, onCreateOrder }: { userName: string; groupNos: string[]; onCreateOrder: (groupNo: string) => void }) {
  const [items, setItems] = useState<Todo[]>([]);
  const [owner, setOwner] = useState("");
  const [groupNo, setGroupNo] = useState("");
  const [matter, setMatter] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<Todo | null>(null);
  useEffect(() => { if (userName && !owner) setOwner(userName); }, [userName]);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/todos", { cache: "no-store" });
        if (!response.ok) throw Error("待办读取失败，请刷新页面重试");
        const data = await response.json() as Todo[];
        if (mounted) { setItems(sortTodos(data)); setError(""); }
      } catch (cause) { if (mounted) setError(cause instanceof Error ? cause.message : "待办读取失败"); }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 20000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [busy]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, groupNo, matter, urgent }) });
      const result = await response.json() as Todo & { error?: string };
      if (!response.ok) throw Error(result.error || "待办保存失败");
      setItems(previous => sortTodos([result, ...previous])); setGroupNo(""); setMatter(""); setUrgent(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "待办保存失败"); }
    finally { setBusy(false); }
  }

  async function finish(item: Todo) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) });
      const result = await response.json() as { completedAt?: number; error?: string };
      if (!response.ok || !result.completedAt) throw Error(result.error || "完成待办失败");
      setItems(previous => sortTodos(previous.map(current => current.id === item.id ? { ...current, completedAt: result.completedAt! } : current)));
      setCompleted(item);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "完成待办失败"); }
    finally { setBusy(false); }
  }

  const pending = items.filter(item => !item.completedAt);
  const history = items.filter(item => !!item.completedAt);
  return <section className="mb-4 rounded-xl border border-[#dce5ea] bg-white shadow-sm" aria-label="待办列表">
    <details>
      <summary className="cursor-pointer px-4 py-3 text-base font-semibold text-[#254656]">待办列表 <span className="ml-2 rounded-full bg-[#e6f4f1] px-2 py-0.5 text-sm text-[#0b756f]">{pending.length} 项未完成</span></summary>
      <div className="border-t border-[#e3ebee] p-4">
        <form onSubmit={add} className="grid gap-3 md:grid-cols-[minmax(120px,1fr)_minmax(120px,1fr)_minmax(220px,2fr)_auto_auto] md:items-end">
          <label className="text-sm font-medium">负责人<input required maxLength={120} value={owner} onChange={event => setOwner(event.target.value)} placeholder="负责人" className="mt-1 block h-10 w-full rounded-md border border-[#d6e1e6] px-3" /></label>
          <label className="text-sm font-medium">群号<input required maxLength={100} list="todo-group-options" value={groupNo} onChange={event => setGroupNo(event.target.value)} placeholder="群号" className="mt-1 block h-10 w-full rounded-md border border-[#d6e1e6] px-3" /></label>
          <label className="text-sm font-medium">事情<input required maxLength={2000} value={matter} onChange={event => setMatter(event.target.value)} placeholder="需要处理的事情" className="mt-1 block h-10 w-full rounded-md border border-[#d6e1e6] px-3" /></label>
          <label className="flex h-10 items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={urgent} onChange={event => setUrgent(event.target.checked)} className="size-4 accent-[#b84235]" />紧急</label>
          <Button disabled={busy} type="submit" className="bg-[#0b756f] hover:bg-[#08645f]">新增待办</Button>
        </form>
        <datalist id="todo-group-options">{groupNos.map(name => <option key={name} value={name} />)}</datalist>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#f3f7f8] text-[#43606d]"><tr>{["负责人", "群号", "事情", "创建时间", "是否紧急", "操作"].map(label => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{pending.map(item => <tr key={item.id} className="border-t border-[#e3ebee]"><td className="px-3 py-3">{item.owner}</td><td className="px-3 py-3 font-medium">{item.groupNo}</td><td className="max-w-[450px] whitespace-pre-wrap break-words px-3 py-3">{item.matter}</td><td className="whitespace-nowrap px-3 py-3">{localDate(item.createdAt)}</td><td className="px-3 py-3">{item.urgent ? <span className="rounded bg-red-50 px-2 py-1 font-semibold text-red-700">紧急</span> : "—"}</td><td className="px-3 py-3"><Button disabled={busy} variant="outline" size="sm" onClick={() => void finish(item)}>完成</Button></td></tr>)}</tbody></table>{!pending.length && <p className="border-t border-[#e3ebee] px-3 py-5 text-sm text-[#708491]">目前没有待办事项。</p>}</div>
        {!!history.length && <details className="mt-3 border-t border-[#e3ebee] pt-3"><summary className="cursor-pointer text-sm text-[#59717d]">已完成 · {history.length} 项</summary><div className="mt-2 space-y-2">{history.map(item => <div key={item.id} className="flex flex-wrap gap-x-4 gap-y-1 rounded bg-[#f3f7f8] px-3 py-2 text-sm text-[#536b78]"><span>{item.owner}</span><span>{item.groupNo}</span><span className="min-w-0 flex-1 break-words">{item.matter}</span><span>{item.completedAt ? localDate(item.completedAt) : ""}</span></div>)}</div></details>}
      </div>
    </details>
    <Dialog open={!!completed} onOpenChange={open => { if (!open) setCompleted(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>待办已完成</DialogTitle><DialogDescription>是否为群号 {completed?.groupNo} 新增订单？</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setCompleted(null)}>暂不新增</Button><Button className="bg-[#0b756f] hover:bg-[#08645f]" onClick={() => { const group = completed?.groupNo; setCompleted(null); if (group) onCreateOrder(group); }}>新增订单</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
