"use client";

import { useEffect, useState } from "react";
import { truckCategories } from "@/app/lib/haulier-stats";

type Month = { month: string; total: number; categories: string[]; hauliers: { name: string; count: number; categories: Record<string, number> }[] };

export default function HaulierStats() {
  const [months, setMonths] = useState<Month[]>([]);
  const [selected, setSelected] = useState("");
  const [category, setCategory] = useState("all");
  const [scope,setScope]=useState("own");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("zh");
  useEffect(() => { try { setLanguage(localStorage.getItem("delivery-plan-language") || "zh"); } catch { /* storage unavailable */ } }, []);
  useEffect(() => {
    fetch("/api/haulier-stats", { cache: "no-store" }).then(async response => {
      const result = await response.json() as { months?: Month[]; scope?:string; error?: string };
      if (!response.ok || !result.months) throw Error(result.error || "读取失败");
      setScope(result.scope||"own");setMonths(result.months);
      setSelected(result.months.find(month => month.month !== "undated")?.month || result.months[0]?.month || "");
    }).catch(e => setError(e instanceof Error ? e.message : "读取失败")).finally(() => setLoading(false));
  }, []);
  const en = language === "en";
  const current = months.find(month => month.month === selected);
  const displayedMonths = selected === "all" ? months : current ? [current] : [];
  const extraCategories = [...new Set(months.flatMap(month => month.categories))].filter(item => !truckCategories.includes(item as typeof truckCategories[number]) && item !== "未分类");
  const categoryOptions = [...truckCategories, ...extraCategories, "未分类"];
  const selectedTotal = displayedMonths.reduce((sum, month) => sum + (category === "all" ? month.total : month.hauliers.reduce((subtotal, row) => subtotal + (row.categories[category] || 0), 0)), 0);
  const label = (month: string) => month === "undated" ? (en ? "Date to complete" : "日期待补") : en ? month : `${month.slice(0, 4)}年${Number(month.slice(5))}月`;
  return <main className="min-h-screen bg-[#f4f7f9] text-[#152d3a]">
    <header className="border-b border-[#dce5ea] bg-white px-5 py-4 md:px-9"><div className="mx-auto flex max-w-[1200px] items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-[#0b756f] text-lg font-black text-white">T</div><div><div className="text-lg font-bold">{en ? "Haulier deliveries" : "车队送柜统计"}</div><div className="text-xs text-[#6c8290]">TOPASIA · LOGISTICS</div></div></div></header>
    <nav aria-label={en ? "Logistics navigation" : "物流导航"} className="border-b border-[#dce5ea] bg-[#142638] px-4 py-2 text-white md:px-9"><div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2"><span className="mr-2 text-sm font-semibold">{en ? "Logistics" : "物流"} ▾</span><a href="/" className="rounded-md px-4 py-2 text-sm hover:bg-[#30455b]">{en ? "Excel Mode" : "Excel 模式"}</a><span aria-current="page" className="rounded-md bg-[#3288e6] px-4 py-2 text-sm font-medium">{en ? "Haulier Statistics" : "车队统计"}</span></div></nav>
    <div className="mx-auto max-w-[1200px] px-4 py-7 md:px-9"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-bold">{en ? "Containers by haulier" : "各车队送柜柜数"}</h1><p className="mt-2 text-sm text-[#627c89]">{en ? "Counts use your saved Excel Mode data, by delivery month, haulier and truck type. Each container row counts once; cancelled orders are excluded." : "按 Excel 模式已保存的数据统计，按送柜月份、车队及卡车类型分类；每行货柜计 1 次，退关不计入。"}</p></div>{months.length > 0 && <label className="text-sm font-medium">{en ? "Month" : "选择月份"}<select value={selected} onChange={event => setSelected(event.target.value)} className="ml-2 h-10 rounded-md border border-[#d6e1e6] bg-white px-3"><option value="all">{en ? "All months" : "全部月份"}</option>{months.map(month => <option key={month.month} value={month.month}>{label(month.month)}</option>)}</select></label>}</div>
    {loading ? <p className="rounded-xl bg-white p-6">{en ? "Loading…" : "正在读取…"}</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-6 text-red-700">{error}</p> : !months.length ? <p className="rounded-xl border border-[#dce5ea] bg-white p-8">{en ? "No haulier deliveries recorded yet." : "暂无已指定车队的送柜记录。"}</p> : <>
      <section aria-label={en ? "Truck type filter" : "卡车类型分类"} className="mb-5 rounded-xl border border-[#dce5ea] bg-white p-4"><h2 className="mb-3 font-semibold">{en ? "Truck type" : "卡车类型分类"}</h2><div className="flex flex-wrap gap-2">{["all", ...categoryOptions].map(option => {
        const count = displayedMonths.reduce((sum, month) => sum + (option === "all" ? month.total : month.hauliers.reduce((subtotal, row) => subtotal + (row.categories[option] || 0), 0)), 0);
        return <button key={option} type="button" aria-pressed={category === option} onClick={() => setCategory(option)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${category === option ? "border-[#0b756f] bg-[#0b756f] text-white" : "border-[#cbdbe0] bg-white text-[#31505f] hover:bg-[#e9f5f2]"}`}>{option === "all" ? en ? "All types" : "全部类型" : option === "未分类" && en ? "Unclassified" : option}<span className="ml-2 tabular-nums">{count}</span></button>;
      })}</div></section>
      <p className="mb-2 text-sm text-[#627c89]">{scope==="all"?"管理员：统计全部账号已保存的数据":"统计当前账号已保存的数据"}</p><div className="mb-4 text-sm font-semibold text-[#31505f]">{category === "all" ? en ? "All truck types" : "全部卡车类型" : category === "未分类" && en ? "Unclassified" : category} · {selectedTotal} {en ? "containers" : "柜"}</div>
      <div className="space-y-5">{displayedMonths.map(month => <section key={month.month} className="overflow-hidden rounded-xl border border-[#dce5ea] bg-white shadow-sm"><div className="flex items-center justify-between bg-[#e9f5f2] px-5 py-4"><h2 className="font-semibold">{label(month.month)}</h2><strong>{category === "all" ? month.total : month.hauliers.reduce((sum, row) => sum + (row.categories[category] || 0), 0)} {en ? "containers" : "柜"}</strong></div><HaulierTable rows={month.hauliers} categories={month.categories} category={category} en={en} /></section>)}</div>
    </>}
    <p className="mt-5 text-sm text-[#627c89]">{en ? "Dates without a year or invalid dates appear under Date to complete." : "送柜时间未写年份或日期无法识别的记录，单列在“日期待补”。"}</p></div>
  </main>;
}

function HaulierTable({ rows, categories, category, en }: { rows: Month["hauliers"]; categories: string[]; category: string; en: boolean }) {
  const active = category === "all" ? categories.filter(item => item !== "未分类" || rows.some(row => row.categories[item])) : [category];
  const visibleRows = category === "all" ? rows : rows.filter(row => row.categories[category]);
  return visibleRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-[#e3ebee] text-[#59717d]"><tr><th className="sticky left-0 bg-white px-5 py-3 font-medium">{en ? "Haulier" : "车队"}</th>{active.map(item => <th key={item} className="whitespace-nowrap px-4 py-3 text-right font-medium">{item === "未分类" && en ? "Unclassified" : item}</th>)}<th className="px-5 py-3 text-right font-semibold">{en ? "Total" : "合计"}</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.name} className="border-b border-[#edf1f3] last:border-b-0"><td className="sticky left-0 bg-white px-5 py-3 font-medium">{row.name}</td>{active.map(item => <td key={item} className="px-4 py-3 text-right tabular-nums">{row.categories[item] || "—"}</td>)}<td className="px-5 py-3 text-right font-semibold tabular-nums">{category === "all" ? row.count : row.categories[category]}</td></tr>)}</tbody></table></div> : <p className="px-5 py-6 text-sm text-[#627c89]">{en ? "No deliveries in this category this month." : "该月份此类型暂无送柜记录。"}</p>;
}
