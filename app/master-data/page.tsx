"use client";

import { useEffect, useState } from "react";

type Kind = "haulier" | "customs" | "carrier" | "groupNo";
type Saved = { id: string; kind: Kind; name: string; customer: string | null; currency: string | null; settlement: string | null; emails: string | null };
type Data = { saved: Saved[]; options: Record<Kind, string[]>; groupCustomers: Record<string, string>; groupTerms: Record<string, { currency: string; settlement: string }>; emailDirectory: Record<string, Record<string, string[]>> };
const labels: Record<Kind, string> = { haulier: "车队", customs: "报关行", carrier: "船公司", groupNo: "群号" };
const kinds: Kind[] = ["haulier", "customs", "carrier", "groupNo"];
const empty: Data = { saved: [], options: { haulier: [], customs: [], carrier: [], groupNo: [] }, groupCustomers: {}, groupTerms: {}, emailDirectory: { haulier: {}, customs: {}, carrier: {} } };

const emailPattern = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const addressesFrom = (value: string | null | undefined) => value ? value.split(/[,;\n]+/).map(address => address.trim()).filter(Boolean) : [];

function EmailFields({ addresses, onChange, label }: { addresses: string[]; onChange: (addresses: string[]) => void; label: string }) {
  const update = (index: number, value: string) => onChange(addresses.map((address, position) => position === index ? value : address));
  return <div className="w-full space-y-2 rounded-md border border-[#dce5ea] bg-[#f8fbfc] p-3">
    <p className="text-sm font-medium">{label} <span className="font-normal text-[#647c88]">（每格一个邮箱）</span></p>
    {addresses.map((address, index) => <div key={index} className="flex items-start gap-2"><div className="min-w-0 flex-1"><input aria-label={`邮箱 ${index + 1}`} type="email" value={address} onChange={event => update(index, event.target.value)} placeholder="name@example.com" className="w-full rounded-md border border-[#ccdce3] bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#0b756f]" />{address && !emailPattern.test(address.trim()) && <span className="text-xs text-red-700">请检查此邮箱格式</span>}</div><button type="button" aria-label={`删除邮箱 ${index + 1}`} onClick={() => onChange(addresses.filter((_, position) => position !== index))} className="rounded-md border border-[#ccdce3] px-3 py-2 text-sm text-red-700 hover:bg-red-50">删除</button></div>)}
    <button type="button" disabled={addresses.length >= 30} onClick={() => onChange([...addresses, ""])} className="rounded-md border border-[#b7d5d1] bg-white px-3 py-2 text-sm font-semibold text-[#0b756f] disabled:opacity-50">＋ 添加一个邮箱</button>
  </div>;
}

export default function MasterData() {
  const [data, setData] = useState<Data>(empty);
  const [kind, setKind] = useState<Kind>("haulier");
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [currency, setCurrency] = useState("");
  const [settlement, setSettlement] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [draftEmails, setDraftEmails] = useState<string[]>([]);
  const [draftCustomer, setDraftCustomer] = useState("");
  const [draftCurrency, setDraftCurrency] = useState("");
  const [draftSettlement, setDraftSettlement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  async function refresh() {
    const response = await fetch("/api/options?details=1", { cache: "no-store" });
    if (!response.ok) throw Error("资料读取失败，请刷新页面重试。");
    setData(await response.json() as Data);
  }
  useEffect(() => { void refresh().catch(err => setError(err.message)); }, []);
  const validEmails = (addresses: string[]) => addresses.every(address => emailPattern.test(address.trim())) && new Set(addresses.map(address => address.trim().toLowerCase())).size === addresses.length;
  async function submit(method: "POST" | "PATCH" | "DELETE", payload: object) {
    if ("emails" in payload && Array.isArray(payload.emails) && !validEmails(payload.emails)) { setError("请逐一检查邮箱格式，并移除重复邮箱或空白格。"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/options", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw Error(result.error || "保存失败，请重试。");
      await refresh();
      setName(""); setCustomer(""); setCurrency(""); setSettlement(""); setEmails([]); setEditing("");
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败，请重试。"); }
    finally { setBusy(false); }
  }
  const saved = data.saved.filter(item => item.kind === kind);
  const historical = data.options[kind].filter(value => !saved.some(item => item.name.toLocaleLowerCase() === value.toLocaleLowerCase()));
  return <main className="min-h-screen bg-[#f4f8fa] text-[#142638]">
    <nav className="bg-[#142638] px-5 py-3 text-white"><div className="mx-auto flex max-w-5xl items-center justify-between"><strong>物流 · 基础信息</strong><a href="/" className="rounded-md border border-[#709cbb] px-3 py-2 text-sm hover:bg-[#30455b]">返回订单 →</a></div></nav>
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold">基础信息</h1><p className="mt-2 text-sm text-[#647c88]">集中维护常用资料，订单填写时可直接选用。已有订单不会随基础信息的修改或删除而变动。</p>
      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="资料类别">{kinds.map(item => <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => { setKind(item); setError(""); setEditing(""); }} className={`rounded-md px-4 py-2 text-sm font-semibold ${kind === item ? "bg-[#0b756f] text-white" : "border border-[#d0dfe5] bg-white text-[#31505f] hover:bg-[#e9f5f2]"}`}>{labels[item]} <span className="ml-1 opacity-70">{data.options[item].length}</span></button>)}</div>
      <section className="mt-5 rounded-xl border border-[#dce5ea] bg-white p-5 shadow-sm" role="tabpanel">
        <h2 className="text-lg font-semibold">{labels[kind]}</h2>
        <form className="mt-4 flex max-w-xl flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (name.trim()) void submit("POST", { kind, name, ...(kind === "groupNo" ? { customer, currency, settlement } : { emails }) }); }}><input aria-label={`新增${labels[kind]}`} value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder={`输入${labels[kind]}名称`} className="min-w-0 flex-1 rounded-md border border-[#ccdce3] px-3 py-2 outline-none focus:ring-2 focus:ring-[#0b756f]" />{kind !== "groupNo" && <EmailFields addresses={emails} onChange={setEmails} label="对应邮箱" />}{kind === "groupNo" && <><input aria-label="对应客户" value={customer} onChange={event => setCustomer(event.target.value)} maxLength={200} placeholder="对应客户名称" className="min-w-0 flex-1 rounded-md border border-[#ccdce3] px-3 py-2 outline-none focus:ring-2 focus:ring-[#0b756f]" /><select aria-label="币种" value={currency} onChange={event => setCurrency(event.target.value)} className="rounded-md border border-[#ccdce3] px-3 py-2"><option value="">选择币种</option>{["MYR", "USD", "CNY", "SGD", "EUR"].map(code => <option key={code}>{code}</option>)}</select><select aria-label="结算方式" value={settlement} onChange={event => setSettlement(event.target.value)} className="rounded-md border border-[#ccdce3] px-3 py-2"><option value="">选择结算方式</option><option>月结</option><option>票结</option></select></>}<button disabled={busy || !name.trim()} className="rounded-md bg-[#0b756f] px-4 py-2 font-semibold text-white disabled:opacity-50">新增</button></form>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 divide-y divide-[#e3ebee] border-t border-[#e3ebee]">{saved.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 py-3">{editing === item.id ? <form className="flex flex-1 flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (draft.trim()) void submit("PATCH", { id: item.id, name: draft, ...(kind === "groupNo" ? { customer: draftCustomer, currency: draftCurrency, settlement: draftSettlement } : { emails: draftEmails }) }); }}><input aria-label="修改名称" autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={100} className="min-w-40 flex-1 rounded-md border border-[#ccdce3] px-3 py-2" />{kind !== "groupNo" && <EmailFields addresses={draftEmails} onChange={setDraftEmails} label="对应邮箱" />}{kind === "groupNo" && <><input aria-label="修改对应客户" value={draftCustomer} onChange={event => setDraftCustomer(event.target.value)} maxLength={200} placeholder="对应客户名称" className="min-w-40 flex-1 rounded-md border border-[#ccdce3] px-3 py-2" /><select aria-label="币种" value={draftCurrency} onChange={event => setDraftCurrency(event.target.value)} className="rounded-md border border-[#ccdce3] px-3 py-2"><option value="">选择币种</option>{["MYR", "USD", "CNY", "SGD", "EUR"].map(code => <option key={code}>{code}</option>)}</select><select aria-label="结算方式" value={draftSettlement} onChange={event => setDraftSettlement(event.target.value)} className="rounded-md border border-[#ccdce3] px-3 py-2"><option value="">选择结算方式</option><option>月结</option><option>票结</option></select></>}<button disabled={busy || !draft.trim()} className="text-sm font-semibold text-[#0b756f] disabled:opacity-50">保存</button><button type="button" onClick={() => setEditing("")} className="text-sm text-[#718793]">取消</button></form> : <><span className="min-w-0 flex-1 break-words font-medium">{item.name}{kind !== "groupNo" && <span className="mt-1 block break-all text-sm font-normal text-[#647c88]">{(item.emails !== null ? addressesFrom(item.emails) : data.emailDirectory[kind]?.[item.name.toLocaleLowerCase()] || []).length ? (item.emails !== null ? addressesFrom(item.emails) : data.emailDirectory[kind]?.[item.name.toLocaleLowerCase()] || []).map((address, index) => <span key={address + index} className="block">{address}</span>) : "尚未设置邮箱"}</span>}{kind === "groupNo" && <span className="ml-3 text-sm font-normal text-[#647c88]">→ {item.customer || data.groupCustomers[item.name.toLocaleLowerCase()] || "未设置客户"} · {item.currency || "币种待填"} · {item.settlement || "结算方式待填"}</span>}</span><button className="text-sm text-[#0b756f] hover:underline" onClick={() => { setEditing(item.id); setDraft(item.name); setDraftCustomer(item.customer || data.groupCustomers[item.name.toLocaleLowerCase()] || ""); setDraftCurrency(item.currency || ""); setDraftSettlement(item.settlement || ""); setDraftEmails(item.emails !== null ? addressesFrom(item.emails) : data.emailDirectory[kind]?.[item.name.toLocaleLowerCase()] || []); }}>修改</button><button disabled={busy} className="text-sm text-red-700 hover:underline disabled:opacity-50" onClick={() => { if (window.confirm(`从基础信息中删除“${item.name}”？已有订单不会改变。`)) void submit("DELETE", { id: item.id }); }}>删除</button></>}</div>)}</div>
        {!saved.length && <p className="py-5 text-sm text-[#718793]">暂无手动添加的{labels[kind]}。</p>}
        {historical.length > 0 && <div className="mt-5 rounded-md bg-[#f4f8fa] p-4"><h3 className="font-semibold">已有名单与订单中使用过</h3><p className="mt-1 text-xs text-[#718793]">已提供过的邮箱显示在名称后。点击加入后，可在上方修改和增加邮箱。</p><div className="mt-3 flex flex-wrap gap-2">{historical.map(value => <button key={value} disabled={busy} onClick={() => void submit("POST", { kind, name: value, ...(kind === "groupNo" ? { customer: data.groupCustomers[value.toLocaleLowerCase()] || "", currency: data.groupTerms[value.toLocaleLowerCase()]?.currency || "", settlement: data.groupTerms[value.toLocaleLowerCase()]?.settlement || "" } : { emails: data.emailDirectory[kind]?.[value.toLocaleLowerCase()] || [] }) })} className="rounded-md border border-[#c8dce1] bg-white px-3 py-1.5 text-sm text-[#31505f] hover:bg-[#e9f5f2] disabled:opacity-50">＋ {value}{kind === "groupNo" && data.groupCustomers[value.toLocaleLowerCase()] ? ` → ${data.groupCustomers[value.toLocaleLowerCase()]}` : ""}{kind !== "groupNo" && data.emailDirectory[kind]?.[value.toLocaleLowerCase()] && <span className="ml-2 text-[#647c88]">{data.emailDirectory[kind][value.toLocaleLowerCase()].map((address, index) => <span key={address + index} className="block break-all">{address}</span>)}</span>}</button>)}</div></div>}
      </section>
    </div>
  </main>;
}
