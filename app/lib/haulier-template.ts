"use client";
import type { DeliveryOrder } from "@/app/lib/delivery-order-export";

export const templateNames = ["VIVA", "TT", "LT", "GREEN", "SSH", "LY", "TANJONG", "PS", "VF", "C Plus", "BS", "MTH", "SW", "TKH"] as const;
export function templateCapacity(name: string): number { return name === "MTH" ? 1 : name === "VF" || name === "C Plus" ? 5 : 6; }
export type TemplateExtras = { requestedBy: string; commodity: string; voyage: string; depot: string; businessType: string; trip: string };
const aliases: Record<string, string[]> = {
  VIVA: ["VIVA"], TT: ["TT", "TT GLOBAL"], LT: ["LT"], GREEN: ["GREEN"], SSH: ["SSH"], LY: ["LY"],
  TANJONG: ["TANJONG"], PS: ["PS"], VF: ["VF"], "C Plus": ["C PLUS", "C+"], BS: ["BS"], MTH: ["MTH"], SW: ["SW"], TKH: ["TKH"],
};
export function vendorTemplate(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9+]+/g, " ").trim();
  return Object.entries(aliases).find(([, names]) => names.some(name => normalized === name || normalized.startsWith(name + " ")))?.[0] || null;
}

type ZipPart = { name: string; data: Uint8Array };
const utf8 = new TextEncoder(), decoder = new TextDecoder();
function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function u16(view: DataView, at: number, value: number) { view.setUint16(at, value, true); }
function u32(view: DataView, at: number, value: number) { view.setUint32(at, value, true); }
async function unpack(buffer: ArrayBuffer): Promise<ZipPart[]> {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer); let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw Error("模板压缩包无效");
  const count = view.getUint16(end + 10, true); let pos = view.getUint32(end + 16, true);
  const result: ZipPart[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw Error("模板目录无效");
    const method = view.getUint16(pos + 10, true), size = view.getUint32(pos + 20, true), nameLength = view.getUint16(pos + 28, true), extraLength = view.getUint16(pos + 30, true), commentLength = view.getUint16(pos + 32, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    const local = view.getUint32(pos + 42, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const compressed = bytes.subarray(start, start + size);
    let data: Uint8Array;
    if (method === 0) data = compressed.slice();
    else if (method === 8) {
      const stream = new Blob([Uint8Array.from(compressed)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw Error("模板压缩方式不支持");
    result.push({ name, data }); pos += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}
function pack(parts: ZipPart[]): Uint8Array {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const part of parts) {
    const name = utf8.encode(part.name), crc = crc32(part.data);
    const head = new Uint8Array(30 + name.length), h = new DataView(head.buffer);
    u32(h, 0, 0x04034b50); u16(h, 4, 20); u16(h, 6, 0x0800); u32(h, 14, crc); u32(h, 18, part.data.length); u32(h, 22, part.data.length); u16(h, 26, name.length); head.set(name, 30);
    const entry = new Uint8Array(46 + name.length), e = new DataView(entry.buffer);
    u32(e, 0, 0x02014b50); u16(e, 4, 20); u16(e, 6, 20); u16(e, 8, 0x0800); u32(e, 16, crc); u32(e, 20, part.data.length); u32(e, 24, part.data.length); u16(e, 28, name.length); u32(e, 42, offset); entry.set(name, 46);
    chunks.push(head, part.data); central.push(entry); offset += head.length + part.data.length;
  }
  const directory = central.reduce((n, b) => n + b.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  u32(e, 0, 0x06054b50); u16(e, 8, parts.length); u16(e, 10, parts.length); u32(e, 12, directory); u32(e, 16, offset);
  const output = new Uint8Array(offset + directory + end.length); let at = 0;
  for (const part of [...chunks, ...central, end]) { output.set(part, at); at += part.length; }
  return output;
}
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function writeCells(xml: string, input: Record<string, string | number>): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw Error("模板 XML 无效");
  const sheetData = doc.getElementsByTagNameNS(ns, "sheetData")[0];
  if (!sheetData) throw Error("模板工作表不完整");
  for (const [address, value] of Object.entries(input)) {
    const rowIndex = address.match(/\d+$/)?.[0];
    if (!rowIndex) continue;
    let row = [...sheetData.getElementsByTagNameNS(ns, "row")].find(item => item.getAttribute("r") === rowIndex);
    if (!row) { row = doc.createElementNS(ns, "row"); row.setAttribute("r", rowIndex); sheetData.appendChild(row); }
    let cell = [...row.getElementsByTagNameNS(ns, "c")].find(item => item.getAttribute("r") === address);
    if (!cell) { cell = doc.createElementNS(ns, "c"); cell.setAttribute("r", address); row.appendChild(cell); }
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    if (typeof value === "number") { cell.removeAttribute("t"); const v = doc.createElementNS(ns, "v"); v.textContent = String(value); cell.appendChild(v); }
    else { cell.setAttribute("t", "inlineStr"); const is = doc.createElementNS(ns, "is"), t = doc.createElementNS(ns, "t"); t.textContent = value; is.appendChild(t); cell.appendChild(is); }
  }
  return new XMLSerializer().serializeToString(doc);
}
export async function exportVendorTemplate(order: DeliveryOrder, jobNo: string, extras: TemplateExtras) {
  const template = vendorTemplate(order.haulier);
  if (!template) throw Error("此车队没有对应模板");
  if (order.rows.length > templateCapacity(template)) throw Error(`此车队模板每份最多 ${templateCapacity(template)} 柜，请拆分后导出`);
  const response = await fetch("/templates/haulier-rot.xlsx", { cache: "force-cache" });
  if (!response.ok) throw Error("无法读取车队模板");
  const parts = await unpack(await response.arrayBuffer());
  const workbook = parts.find(part => part.name === "xl/workbook.xml"), rels = parts.find(part => part.name === "xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw Error("车队模板结构不完整");
  const bookDoc = new DOMParser().parseFromString(decoder.decode(workbook.data), "application/xml");
  const relationDoc = new DOMParser().parseFromString(decoder.decode(rels.data), "application/xml");
  const sheets = [...bookDoc.getElementsByTagNameNS(ns, "sheet")];
  const selected = sheets.find(sheet => sheet.getAttribute("name") === template);
  const all = sheets.find(sheet => sheet.getAttribute("name") === "ALL");
  if (!selected || !all) throw Error("车队工作表不存在");
  const resolve = (sheet: Element) => {
    const rid = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const relation = [...relationDoc.getElementsByTagName("Relationship")].find(item => item.getAttribute("Id") === rid);
    const target = relation?.getAttribute("Target") || "";
    return target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  };
  const allPart = parts.find(part => part.name === resolve(all));
  if (!allPart) throw Error("模板输入表不存在");
  for (const sheet of sheets) { if (sheet === selected) sheet.removeAttribute("state"); else sheet.setAttribute("state", "hidden"); }
  const view = bookDoc.getElementsByTagNameNS(ns, "workbookView")[0];
  if (view) view.setAttribute("activeTab", String(sheets.indexOf(selected)));
  const calc = bookDoc.getElementsByTagNameNS(ns, "calcPr")[0] || bookDoc.createElementNS(ns, "calcPr");
  calc.setAttribute("fullCalcOnLoad", "1"); calc.setAttribute("forceFullCalc", "1"); if (!calc.parentNode) bookDoc.documentElement.appendChild(calc);
  workbook.data = utf8.encode(new XMLSerializer().serializeToString(bookDoc));
  const twenty = order.rows.filter(row => row.size.startsWith("20")).length;
  const inputs: Record<string, string | number> = {
    D2: extras.requestedBy, D3: jobNo, D4: extras.businessType, D6: order.groupNo, D7: order.booking, D8: twenty,
    D9: order.rows.length - twenty, D10: [...new Set(order.rows.map(row => row.size.slice(0, 2)))].join("/"),
    D11: [...new Set(order.rows.map(row => row.size))].join("/"), D12: extras.commodity, D13: order.terminal, D14: "EXP", D15: extras.trip,
    D16: order.vessel, D17: extras.voyage, D18: order.eta, D19: order.destination, D20: extras.depot,
    D21: [...new Set(order.rows.map(row => row.factory).filter(Boolean))].join("\n"), D22: order.customs, D23: order.haulier,
    D24: order.carrier, D25: order.carrier, D26: [...new Set(order.rows.map(row => row.truckType).filter(Boolean))].join(" / "),
  };
  order.rows.forEach((row, i) => { inputs[`D${27 + i}`] = [row.deliveryTime, row.container, row.size, row.truckType, row.remark].filter(Boolean).join("  ·  "); });
  for (let i = order.rows.length; i < 6; i++) inputs[`D${27 + i}`] = "";
  allPart.data = utf8.encode(writeCells(decoder.decode(allPart.data), inputs));
  // Pre-existing cached formula values refer to the blank source and must be recalculated by Excel.
  const vendorPart = parts.find(part => part.name === resolve(selected));
  if (vendorPart) {
    const doc = new DOMParser().parseFromString(decoder.decode(vendorPart.data), "application/xml");
    for (const cell of [...doc.getElementsByTagNameNS(ns, "c")]) if (cell.getElementsByTagNameNS(ns, "f").length) {
      for (const cached of [...cell.getElementsByTagNameNS(ns, "v")]) cached.remove();
    }
    vendorPart.data = utf8.encode(new XMLSerializer().serializeToString(doc));
  }
  const bytes = pack(parts), filename = [template, order.booking, order.ticket].map(value => value.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")).join("_") + ".xlsx";
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
