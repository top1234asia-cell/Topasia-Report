export const importColumns = [
  ["groupNo", "群号", "Group No."], ["businessNo", "业务编号", "Job No."],
  ["customs", "报关行", "Customs Agent"], ["terminal", "码头", "Terminal"],
  ["booking", "订舱号", "Booking No."], ["carrier", "船司", "Shipping Line"],
  ["quantity", "柜量", "Containers"], ["gateOpen", "开闸时间", "Gate Opening"],
  ["cutoff", "截关时间", "Cutoff Time"], ["destination", "目的港", "Destination Port"],
  ["vessel", "船名", "Vessel"], ["customer", "客户", "Customer"],
  ["container", "柜号", "Container No."], ["size", "柜型", "Container Type"],
  ["factory", "工厂地址", "Factory Address"], ["deliveryTime", "送柜时间", "Delivery Time"],
  ["gateIn", "进港时间", "Gate In"], ["truckType", "卡车类型", "Truck Type"],
  ["haulier", "车队", "Haulier"], ["rot", "ROT", "ROT"],
  ["remark", "备注", "Remarks"], ["status", "状态", "Status"],
] as const;
export type ImportKey = typeof importColumns[number][0];
export type ImportRow = Record<ImportKey, string>;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (!cell || quoted) quoted = !quoted;
      else throw Error("CSV 引号格式错误");
    } else if (!quoted && (ch === "," || ch === "\n" || ch === "\r")) {
      row.push(cell); cell = "";
      if (ch !== ",") { if (row.some(value => value.trim())) rows.push(row); row = []; if (ch === "\r" && input[i + 1] === "\n") i++; }
    } else cell += ch;
  }
  if (quoted) throw Error("CSV 引号没有结束");
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export function readImportCsv(input: string): ImportRow[] {
  const [headers, ...rows] = parseCsv(input);
  if (!headers) throw Error("文件为空");
  const indexes = importColumns.map(([key, zh, en]) => headers.findIndex(value => ( [key, zh, en] as string[] ).includes(value.trim())));
  if (indexes.some(index => index < 0) || new Set(indexes).size !== indexes.length) throw Error("模板栏目不匹配，请下载最新模板");
  if (!rows.length || rows.length > 100) throw Error("每次请导入 1 至 100 个货柜");
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw Error(`第 ${i + 2} 行的栏目数量不对`);
    return Object.fromEntries(importColumns.map(([key], n) => [key, cells[indexes[n]].trim()])) as ImportRow;
  });
}

export function checkImportRows(rows: ImportRow[], existing: Array<{ booking?: string; groupNo?: string; businessNo?: string }> = []): string[] {
  const errors: string[] = []; const groups = new Map<string, ImportRow[]>();
  const normalize = (value?: string) => (value || "").trim().toLowerCase();
  const identity = (row: ImportRow) => [row.booking, row.groupNo, row.businessNo].map(normalize).join("\u0000");
  rows.forEach((row, i) => {
    const line = i + 2;
    if (!row.booking || !row.groupNo) errors.push(`第 ${line} 行：订舱号和群号必填`);
    if (row.terminal && !["WP", "NP"].includes(row.terminal.toUpperCase())) errors.push(`第 ${line} 行：码头请选择 WP 或 NP`);
    if (row.size && !["20GP", "40HQ", "20TK", "40TK", "40OT", "20OT", "40GP", "其他"].includes(row.size)) errors.push(`第 ${line} 行：柜型不在可选范围`);
    if (row.status && !["待安排", "已安排", "运输中", "已送达", "已取消"].includes(row.status)) errors.push(`第 ${line} 行：状态不在可选范围`);
    const key = identity(row); groups.set(key, [...(groups.get(key) || []), row]);
  });
  for (const [key, group] of groups) {
    if (existing.some(row => identity(row as ImportRow) === key)) errors.push(`订舱号 ${group[0].booking} / 群号 ${group[0].groupNo} 已有同业务编号的订单`);
    const containers = group.map(row => normalize(row.container)).filter(Boolean);
    if (new Set(containers).size !== containers.length) errors.push(`订舱号 ${group[0].booking} 存在重复柜号`);
    for (const row of group) {
      if (importColumns.slice(0, 12).some(([field]) => field !== "quantity" && row[field] !== group[0][field])) errors.push(`订舱号 ${row.booking} 的一级资料在各行不一致`);
      if (row.quantity && (!/^\d+$/.test(row.quantity) || Number(row.quantity) !== group.length)) errors.push(`订舱号 ${row.booking} 的柜量应为 ${group.length}`);
    }
  }
  return [...new Set(errors)];
}
