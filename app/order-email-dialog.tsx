"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { etaFromCutoff } from "@/app/lib/eta";
import { haulierEmail } from "@/app/lib/haulier-email";
import { customsRecipients, haulierRecipients } from "@/app/lib/default-email-recipients";

type EmailRow = { container?: string; size?: string; factory?: string; deliveryTime?: string; date?: string; time?: string; truckType?: string; haulier?: string; rot?: string; ticketBusinessNo?: string };
export type EmailOrder = { booking?: string; businessNo?: string; groupNo?: string; carrier?: string; terminal?: string; destination?: string; vessel?: string; commodity?: string; gateOpen?: string; cutoff?: string; customs?: string; rows: EmailRow[] };
type Audience = "haulier" | "customs" | "carrier";
const labels: Record<Audience, string> = { haulier: "车队", customs: "报关行", carrier: "船公司" };
const detail = (row: EmailRow, index: number) => `${index + 1}. ${row.container || "柜号待定"} / ${row.size || "柜型待定"} | 送柜 ${row.deliveryTime || "待安排"} | 地址 ${row.factory || "待提供"}${row.rot ? ` | ROT ${row.rot}` : ""}`;
function subjectEta(cutoff: string) {
  const next = etaFromCutoff(cutoff);
  if (!next) return "待补";
  const year = /^(\d{4})[-/]/.exec(cutoff)?.[1] || /\d{1,2}[./-]\d{1,2}[./-](\d{4})/.exec(cutoff)?.[1];
  if (!year) return next.replace("/", ".");
  const cutoffMonth = /^\d{4}[-/](\d{1,2})/.exec(cutoff)?.[1] || /^\d{1,2}[./-](\d{1,2})/.exec(cutoff)?.[1];
  const etaYear = Number(year) + (Number(cutoffMonth) === 12 && next.endsWith("/01") ? 1 : 0);
  return `${next.replace("/", ".")}.${etaYear}`;
}
function sizeSummary(rows: EmailRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.size || "柜型待补", (counts.get(row.size || "柜型待补") || 0) + 1);
  return [...counts].map(([size, count]) => `${count}X${size}`).join("+");
}
function draft(order: EmailOrder, audience: Audience) {
  const ref = order.businessNo || order.groupNo || order.booking || "";
  const recipientName = audience === "haulier" ? order.rows[0]?.haulier?.trim() || "车队待补" : order.customs?.trim() || "报关行待补";
  const subject = audience === "carrier" ? `订舱跟进 | ${ref} | ${order.booking || "订舱号待补"}`
    : `(${recipientName}) EXPORT BOOKING ${order.booking || "订舱号待补"} ETA-${subjectEta(order.cutoff || "")} (${sizeSummary(order.rows)}) PKG-${order.destination?.trim() || "目的港待补"} ${order.groupNo?.trim() || "群号待补"}`;
  if (audience === "customs") return { subject, body: `Dear ${order.customs?.trim() || "Customs"} Team,\n\nPlease attach booking fyr & check closing.` };
  if (audience === "haulier") return { subject, body: haulierEmail(order.rows, recipientName).text };
  const common = [`业务编号：${order.businessNo || "待补"}`, `群号：${order.groupNo || "待补"}`, `订舱号：${order.booking || "待补"}`, `船公司：${order.carrier || "待补"}`, `船名：${order.vessel || "待补"}`, `目的港：${order.destination || "待补"}`, `起运码头：${order.terminal || "待补"}`, `柜量：${order.rows.length} 柜`, `开闸：${order.gateOpen || "待补"}`, `截关：${order.cutoff || "待补"}`, `品名：${order.commodity || "待补"}`];
  const salutation = `致 ${order.carrier || "船公司"}：`;
  const ask = "烦请核对本票订舱与船期；如有变更，请回复更新资料。";
  return { subject, body: [salutation, "", ask, "", ...common, "", "货柜安排：", ...order.rows.map(detail), "", "谢谢。"].join("\n") };
}

export function OrderEmailDialog({ order, onClose }: { order: EmailOrder | null; onClose: () => void }) {
  const [audience, setAudience] = useState<Audience>("haulier");
  const [selectedHaulier, setSelectedHaulier] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [emailDirectory, setEmailDirectory] = useState<Record<Audience, Record<string, string[]>>>({ haulier: {}, customs: {}, carrier: {} });
  useEffect(() => { if (!order) return; let live = true; fetch("/api/options", { cache: "no-store" }).then(response => response.ok ? response.json() as Promise<{ emailDirectory?: Record<Audience, Record<string, string[]>> }> : Promise.reject()).then(data => { if (live && data.emailDirectory) setEmailDirectory(data.emailDirectory); }).catch(() => {}); return () => { live = false; }; }, [order]);
  const hauliers = [...new Set(order?.rows.map(row => row.haulier?.trim()).filter((name): name is string => !!name) || [])];
  const activeHaulier = hauliers.includes(selectedHaulier) ? selectedHaulier : hauliers[0] || "";
  const activeOrder = order && audience === "haulier" ? { ...order, rows: order.rows.filter(row => row.haulier?.trim() === activeHaulier) } : order;
  const haulierDraft = audience === "haulier" && activeHaulier && activeOrder ? haulierEmail(activeOrder.rows, activeHaulier) : null;
  const recipientAddresses = to.split(/[;,]/).map(address => address.trim());
  const recipientsValid = recipientAddresses.length > 0 && recipientAddresses.every(address => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(address));
  useEffect(() => {
    if (!order) return;
    const next = draft(activeOrder || order, audience);
    const name = audience === "customs" ? order.customs?.trim() || "" : audience === "haulier" ? activeHaulier : order.carrier?.trim() || "";
    const recipients = emailDirectory[audience][name.toLocaleLowerCase()] || (audience === "customs" ? customsRecipients[name.toUpperCase()] : audience === "haulier" ? haulierRecipients[name.toUpperCase()] : undefined);
    setTo((recipients || []).join(", "));
    setSubject(next.subject);
    setBody(next.body);
    setCopyNotice("");
  }, [order, audience, activeHaulier, emailDirectory]);
  const copyHaulierBody = async () => {
    if (!haulierDraft) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw Error("Rich clipboard unavailable");
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([haulierDraft.html], { type: "text/html" }), "text/plain": new Blob([haulierDraft.text], { type: "text/plain" }) })]);
      setCopyNotice("排版内容已复制。打开邮箱后，在正文按 Ctrl+V 粘贴，再检查颜色和字体。");
    } catch { setCopyNotice("浏览器未允许复制。请选中下方预览并手动复制，再粘贴到邮箱正文。"); }
  };
  const openEmail = () => {
    if (!recipientsValid || !subject.trim() || (audience === "haulier" && !activeHaulier)) return;
    window.location.href = `mailto:${recipientAddresses.join(",")}?subject=${encodeURIComponent(subject)}${audience === "haulier" ? "" : `&body=${encodeURIComponent(body)}`}`;
  };
  return <Dialog open={!!order} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>业务邮件 · {order?.booking}</DialogTitle><DialogDescription>选择收件方、检查资料，再用你的邮箱发送。邮箱打开后请确认收件人与附件；本站无法读取实际发送结果。</DialogDescription></DialogHeader>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">{(["haulier", "customs", "carrier"] as const).map(kind => <Button key={kind} type="button" variant={audience === kind ? "default" : "outline"} onClick={() => setAudience(kind)} className={audience === kind ? "bg-[#0b756f] hover:bg-[#08645f]" : ""}>给{labels[kind]}</Button>)}</div>
        {audience === "customs" && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">发送给报关行前，请在 Foxmail 或 Outlook 邮件中手动添加 booking PDF 附件。</p>}
        {audience === "haulier" && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">发给车队前，请在邮件中手动附上 Booking PDF、ROT 和 CMO，并核对日期、地址与柜量。</p>}
        {audience === "haulier" && <label className="block text-sm font-medium">选择车队<select value={activeHaulier} onChange={event => setSelectedHaulier(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-[#d6e1e6] bg-white px-3 text-sm"><option value="">{hauliers.length ? "选择车队" : "请先在二级给货柜分配车队"}</option>{hauliers.map(name => <option key={name} value={name}>{name} · {order?.rows.filter(row => row.haulier?.trim() === name).length} 柜</option>)}</select><span className="mt-1 block text-[#647c88]">主题和正文只包含所选车队的货柜。</span></label>}
        <label className="block text-sm font-medium">收件人邮箱<Input type="email" multiple required value={to} onChange={event => setTo(event.target.value)} placeholder="多个邮箱用逗号隔开" className="mt-1" /></label>
        <label className="block text-sm font-medium">邮件主题<Input value={subject} onChange={event => setSubject(event.target.value)} className="mt-1" /></label>
        {audience === "haulier" ? <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">车队邮件正文预览</span><Button type="button" variant="outline" onClick={() => void copyHaulierBody()} disabled={!haulierDraft}>复制排版内容</Button></div><div className="max-h-80 overflow-auto rounded-md border border-[#d6e1e6] bg-white p-4 text-sm" dangerouslySetInnerHTML={{ __html: haulierDraft?.html || "请先选择车队" }} />{copyNotice && <p role="status" className="text-sm text-[#0b756f]">{copyNotice}</p>}<p className="text-sm text-[#647c88]">先复制排版内容，再打开邮箱，在邮件正文粘贴。邮件软件的文字模式无法通过链接保留颜色。</p></div>
          : <label className="block text-sm font-medium">邮件内容<textarea value={body} onChange={event => setBody(event.target.value)} rows={16} className="mt-1 w-full rounded-md border border-[#d6e1e6] bg-white p-3 text-sm leading-6" /></label>}
        {audience === "carrier" && <p className="text-sm text-[#647c88]">需要附送柜单时，请先从订单的“送柜单”下载，再在邮箱中添加附件。</p>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>返回</Button><Button onClick={openEmail} disabled={!recipientsValid || !subject.trim() || (audience === "haulier" && !activeHaulier)} className="bg-[#0b756f] hover:bg-[#08645f]">打开邮箱发送</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
