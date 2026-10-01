export type HaulierEmailRow = { factory?: string; deliveryTime?: string; date?: string; time?: string; size?: string; truckType?: string };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const colored = (value: string) => `<strong style="background-color:#fff29b;color:#b42318;font-weight:700;padding:3px 5px">${escapeHtml(value)}</strong>`;

export function haulierEmail(rows: HaulierEmailRow[], haulier: string) {
  const batches = new Map<string, { date: string; time: string; address: string; truckType: string; size: string; count: number }>();
  for (const row of rows) {
    const scheduled = (row.deliveryTime || [row.date, row.time].filter(Boolean).join(" ")).trim();
    const dateMatch = /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/.exec(scheduled);
    const rawTime = /\b(\d{1,2}):([0-5]\d)\b/.exec(scheduled) || /\b(\d{1,2})\s*(AM|PM)\b/i.exec(scheduled);
    const date = dateMatch?.[0] || (rawTime ? scheduled.replace(rawTime[0], "").trim() : scheduled) || "送柜时间待定";
    const time = rawTime ? rawTime[2]?.toUpperCase() === "AM" || rawTime[2]?.toUpperCase() === "PM" ? `${rawTime[1]}${rawTime[2].toUpperCase()}` : `${rawTime[1]}:${rawTime[2]}` : "9AM";
    const address = row.factory?.trim() || "工厂地址待补";
    const truckType = row.truckType?.trim() || "卡车类型待补";
    const size = row.size?.trim() || "柜型待补";
    const key = JSON.stringify([date, time, address.toLowerCase(), truckType.toLowerCase(), size.toLowerCase()]);
    const batch = batches.get(key);
    if (batch) batch.count++;
    else batches.set(key, { date, time, address, truckType, size, count: 1 });
  }
  const sections = [...batches.values()];
  const introduction = "Please arrange to export container as below detail:";
  const text = [`Dear ${haulier} team,`, "", introduction, "", ...sections.flatMap(batch => [batch.truckType, `${batch.date} ${batch.count}X${batch.size} ${batch.time}`, "Deliver:", batch.address, ""]), "Please be sure t pick up UPGRADE CONTAINER 32.5 tons"].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1f2937">Dear ${escapeHtml(haulier)} team,<br><br>${introduction}<br><br>${sections.map(batch => `${colored(batch.truckType)}<br>${escapeHtml(batch.date)} ${escapeHtml(`${batch.count}X${batch.size}`)} <strong style="color:#b42318">${escapeHtml(batch.time)}</strong><br>Deliver:<br>${escapeHtml(batch.address).replace(/\n/g, "<br>")}<br><br>`).join("")}${colored("Please be sure t pick up UPGRADE CONTAINER 32.5 tons")}</div>`;
  return { text, html };
}
