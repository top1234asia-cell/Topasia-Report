"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type ImportContainer = { id: string; container: string; size: string; weight: string; exportRef: string };
export type Transshipment = { enabled: true; importBl: string; imports: ImportContainer[] };
export type ExportContainer = { ref: string; container: string; size: string; weight: string };

export const readTransshipment = (value?: string): Transshipment => {
  try {
    const saved = JSON.parse(value || "") as Partial<Transshipment>;
    if (saved.enabled === true && Array.isArray(saved.imports)) return { enabled: true, importBl: typeof saved.importBl === "string" ? saved.importBl : "", imports: saved.imports.filter(item => item && typeof item.id === "string").map(item => ({ id: item.id, container: String(item.container || ""), size: String(item.size || ""), weight: String(item.weight || ""), exportRef: String(item.exportRef || "") })) };
  } catch { /* older orders have no transfer data */ }
  return { enabled: true, importBl: "", imports: [] };
};

const inputClass = "h-8 w-full min-w-0 rounded-md border border-[#cbdce2] bg-white px-2 text-xs";
const validWeight = (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
const formatted = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });

export function TransshipmentEditor({ value, exports, onDraft, onSave, saving = false, editable = true }: {
  value: string;
  exports: ExportContainer[];
  onDraft?: (value: string, exportWeights: Record<string, string>) => void;
  onSave?: (value: string, exportWeights: Record<string, string>) => void;
  saving?: boolean;
  editable?: boolean;
}) {
  const [draft, setDraft] = useState(() => readTransshipment(value));
  const [weights, setWeights] = useState<Record<string, string>>(() => Object.fromEntries(exports.map(item => [item.ref, item.weight])));
  const [changed, setChanged] = useState(false);
  const exportSignature = JSON.stringify(exports);
  useEffect(() => {
    if (changed && value === JSON.stringify(draft) && exports.every(item => (weights[item.ref] || "") === (item.weight || ""))) setChanged(false);
    else if (!changed) { setDraft(readTransshipment(value)); setWeights(Object.fromEntries(exports.map(item => [item.ref, item.weight]))); }
  }, [value, exportSignature, changed]);
  const update = (next: Transshipment, nextWeights = weights) => { setDraft(next); setWeights(nextWeights); setChanged(true); onDraft?.(JSON.stringify(next), nextWeights); };
  const assigned = (ref: string) => draft.imports.filter(item => item.exportRef === ref);
  const sum = (items: ImportContainer[]) => items.reduce((total, item) => total + (validWeight(item.weight) ? Number(item.weight) : 0), 0);
  const totalImport = sum(draft.imports);
  const totalExport = exports.reduce((total, item) => total + (validWeight(weights[item.ref] || "") ? Number(weights[item.ref]) : 0), 0);
  const incomplete = draft.imports.some(item => item.weight && !validWeight(item.weight)) || Object.values(weights).some(weight => weight && !validWeight(weight));
  return <div className="w-full max-w-[1040px] min-w-0 rounded-lg border border-[#c4dadc] bg-[#f5fbfb] p-3 text-xs"><fieldset disabled={!editable} className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center gap-2"><label className="shrink-0 font-medium">进口提单号</label><input aria-label="进口提单号" value={draft.importBl} onChange={event => update({ ...draft, importBl: event.target.value })} className={inputClass + " max-w-xs flex-1"} placeholder="填写进口提单号" /></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] table-fixed border-collapse text-left"><thead><tr className="text-[#31505f]"><th className="p-1">进口柜号</th><th className="w-24 p-1">进口柜型</th><th className="w-32 p-1">进口重量 (kg)</th><th className="w-48 p-1">对应出口柜</th><th className="w-12 p-1">操作</th></tr></thead><tbody>{draft.imports.map(item => <tr key={item.id} className="border-t border-[#dce5ea]"><td className="p-1"><input aria-label="进口柜号" value={item.container} onChange={event => update({ ...draft, imports: draft.imports.map(current => current.id === item.id ? { ...current, container: event.target.value } : current) })} className={inputClass} /></td><td className="p-1"><select aria-label="进口柜型" value={item.size} onChange={event => update({ ...draft, imports: draft.imports.map(current => current.id === item.id ? { ...current, size: event.target.value } : current) })} className={inputClass}><option value="">选择柜型</option>{["20GP", "40GP", "40HQ", "20TK", "40TK", "20OT", "40OT", "其他"].map(size => <option key={size}>{size}</option>)}</select></td><td className="p-1"><input aria-label="进口重量 kg" type="number" min="0" step="any" value={item.weight} onChange={event => update({ ...draft, imports: draft.imports.map(current => current.id === item.id ? { ...current, weight: event.target.value } : current) })} className={inputClass} /></td><td className="p-1"><select aria-label="对应出口柜" value={item.exportRef} onChange={event => update({ ...draft, imports: draft.imports.map(current => current.id === item.id ? { ...current, exportRef: event.target.value } : current) })} className={inputClass}><option value="">选择出口柜</option>{exports.map((item, index) => <option key={item.ref} value={item.ref}>{item.container || `出口柜 ${index + 1}`} · {item.size || "柜型待填"}</option>)}</select></td><td className="p-1"><button type="button" className="text-red-700 hover:underline" onClick={() => update({ ...draft, imports: draft.imports.filter(current => current.id !== item.id) })}>删除</button></td></tr>)}</tbody></table></div>
    <Button type="button" size="sm" variant="outline" onClick={() => update({ ...draft, imports: [...draft.imports, { id: crypto.randomUUID(), container: "", size: "", weight: "", exportRef: "" }] })}>＋ 添加进口柜</Button>
    <div className="overflow-x-auto"><table className="w-full min-w-[640px] table-fixed border-collapse text-left"><thead><tr className="text-[#31505f]"><th className="p-1">出口柜</th><th className="p-1">对应进口柜</th><th className="w-32 p-1">进口合计 (kg)</th><th className="w-32 p-1">出口重量 (kg)</th><th className="w-40 p-1">重量差：出口－进口 (kg)</th></tr></thead><tbody>{exports.map((item, index) => { const linked = assigned(item.ref); const inbound = sum(linked); const outbound = weights[item.ref] || ""; return <tr key={item.ref} className="border-t border-[#dce5ea]"><td className="p-1">{item.container || `出口柜 ${index + 1}`} · {item.size || "柜型待填"}</td><td className="p-1">{linked.map(source => source.container || "柜号待填").join("、") || "未对应"}</td><td className="p-1">{linked.length ? formatted(inbound) : "—"}</td><td className="p-1"><input aria-label={`出口柜 ${index + 1} 重量 kg`} type="number" min="0" step="any" value={outbound} onChange={event => update(draft, { ...weights, [item.ref]: event.target.value })} className={inputClass} /></td><td className="p-1 font-semibold text-[#0b756f]">{linked.length && validWeight(outbound) && linked.every(source => validWeight(source.weight)) ? formatted(Number(outbound) - inbound) : "待填写"}</td></tr>; })}</tbody></table></div>
    <p className="font-semibold leading-5 text-[#31505f]">进口总重量：{formatted(totalImport)} kg　出口总重量：{formatted(totalExport)} kg　差额：{draft.imports.length && exports.every(item => validWeight(weights[item.ref] || "")) && draft.imports.every(item => validWeight(item.weight)) ? formatted(totalExport - totalImport) + " kg" : "待填写"}</p>
    {onSave && <Button type="button" disabled={saving || incomplete || !changed} onClick={() => onSave(JSON.stringify(draft), weights)}>{saving ? "保存中…" : "保存转口资料"}</Button>}
  </fieldset></div>;
}
