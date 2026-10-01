import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { checkImportRows, importColumns, type ImportRow } from "@/app/lib/import-template";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as { rows?: ImportRow[] };
    const rows = body.rows;
    const keys = importColumns.map(([key]) => key);
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100 || rows.some(row =>
      !row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== keys.length ||
      keys.some(key => typeof row[key] !== "string" || row[key].length > 1000) || Object.keys(row).some(key => !keys.includes(key as typeof keys[number]))
    )) return Response.json({ error: "导入资料格式不正确" }, { status: 400 });
    const db = database();
    const bookings = [...new Set(rows.map(row => row.booking.trim()))];
    const existing = await db.prepare("SELECT data FROM deliveries WHERE json_extract(data, '$.booking') IN (" + bookings.map(() => "?").join(",") + ")")
      .bind(...bookings).all<{ data: string }>();
    const errors = checkImportRows(rows, existing.results.map(item => JSON.parse(item.data) as ImportRow));
    if (errors.length) return Response.json({ error: errors.slice(0, 8).join("；") }, { status: 409 });
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const key = [row.booking, row.groupNo, row.businessNo].map(value => value.trim().toLowerCase()).join("\u0000");
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    const groupNumbers = [...new Set(rows.map(row => row.groupNo.trim()))];
    const linked = await db.prepare("SELECT name, customer, currency, settlement FROM directory_options WHERE kind = 'groupNo' AND lower(name) IN (" + groupNumbers.map(() => "?").join(",") + ")").bind(...groupNumbers.map(value => value.toLowerCase())).all<{ name: string; customer: string | null; currency: string | null; settlement: string | null }>();
    const byGroup = new Map(linked.results.map(item => [item.name.toLowerCase(), item]));
    const now = Date.now(), records: Array<{ id: string; data: Record<string, string> }> = [];
    for (const group of groups.values()) {
      const orderId = crypto.randomUUID();
      for (const row of group) {
        records.push({ id: crypto.randomUUID(), data: {
          ...row, vgm: row.gateIn.trim() ? "done" : "", customer: row.customer || byGroup.get(row.groupNo.trim().toLowerCase())?.customer || "", currency: byGroup.get(row.groupNo.trim().toLowerCase())?.currency || "", settlement: byGroup.get(row.groupNo.trim().toLowerCase())?.settlement || "", terminal: row.terminal.toUpperCase(), size: row.size || "40HQ", status: row.status || "待安排",
          quantity: String(group.length), orderId, ownerId: user.userId, ownerEmail: user.email, ownerName: user.displayName,
        } });
      }
    }
    await db.batch(records.map((record, index) => db.prepare("INSERT INTO deliveries (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(record.id, JSON.stringify(record.data), now + index, now)));
    return Response.json({ rows: records.map(record => ({ id: record.id, ...record.data, mine: true })), orders: groups.size });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "导入失败，请重试" }, { status: 500 });
  }
}
