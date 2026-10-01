import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { delegatedOwners, isOwnOrder } from "@/app/lib/delegation";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  const key = new URL(request.url).searchParams.get("orderId") || "";
  if (!key || key.length > 250) return Response.json({ error: "订单无效" }, { status: 400 });
  try {
    const db = database();
    const records = key.startsWith("legacy:")
      ? await db.prepare("SELECT id, data FROM deliveries WHERE json_extract(data, '$.orderId') IS NULL LIMIT 1000").all<{ id: string; data: string }>()
      : await db.prepare("SELECT id, data FROM deliveries WHERE json_extract(data, '$.orderId') = ? LIMIT 1").bind(key).all<{ id: string; data: string }>();
    const entries = records.results.filter(record => { const data = JSON.parse(record.data); return String(data.orderId || `legacy:${data.booking || record.id}:${data.customer || ""}`) === key; });
    const delegates = await delegatedOwners(user.userId);
    if (!entries.some(record => { const data = JSON.parse(record.data); return isOwnOrder(data, user) || delegates.has(String(data.ownerId || "")); })) return Response.json({ error: "没有查看该订单日志的权限" }, { status: 403 });
    const rows = await db.prepare("SELECT emails, created_at FROM directory_options WHERE kind = 'orderAudit' AND customer = ? ORDER BY created_at DESC LIMIT 100").bind(key).all<{ emails: string | null; created_at: number }>();
    return Response.json({ events: rows.results.map(row => ({ ...JSON.parse(row.emails || "{}"), at: row.created_at })) });
  } catch (error) { console.error(error); return Response.json({ error: "日志暂时无法读取" }, { status: 500 }); }
}
