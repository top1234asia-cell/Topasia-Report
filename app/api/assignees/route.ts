import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const records = await database().prepare("SELECT id, name FROM accounts WHERE status = 'approved' ORDER BY name LIMIT 200").all<{ id: string; name: string }>();
    const users = (records.results || []).map(item => ({ id: item.id, email: item.name + "@railway.local", name: item.name }));
    if (!users.some(item => item.id === user.userId)) users.push({ id: user.userId, email: user.email, name: user.displayName });
    users.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    const config = await database().prepare("SELECT emails FROM directory_options WHERE kind = 'delegation' AND name = ?").bind(user.userId).first<{ emails: string | null }>();
    let delegation: { delegateId: string; until: number } | null = null;
    try { if (config?.emails) delegation = JSON.parse(config.emails); } catch { /* invalid legacy entry */ }
    return Response.json({ users, delegation: delegation?.until && delegation.until >= Date.now() ? delegation : null });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "暂时无法读取负责人列表" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as { delegateId?: unknown; endDate?: unknown };
    const db = database();
    if (body.delegateId === "") {
      await db.prepare("DELETE FROM directory_options WHERE kind = 'delegation' AND name = ?").bind(user.userId).run();
      return Response.json({ delegation: null });
    }
    if (typeof body.delegateId !== "string" || !body.delegateId || body.delegateId === user.userId || typeof body.endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) return Response.json({ error: "请选择带班人员及结束日期" }, { status: 400 });
    const until = Date.parse(body.endDate + "T15:59:59.999Z"); // Malaysia 23:59:59 on the selected day.
    if (!Number.isFinite(until) || until < Date.now() || until > Date.now() + 90 * 86400000) return Response.json({ error: "带班结束日期需在未来90天内" }, { status: 400 });
    const target = await db.prepare("SELECT name FROM accounts WHERE id = ? AND status = 'approved' LIMIT 1").bind(body.delegateId).first<{ name: string }>();
    if (!target?.name) return Response.json({ error: "带班人员账号尚未获批准" }, { status: 400 });
    const config = JSON.stringify({ delegateId: body.delegateId, until });
    await db.prepare("INSERT INTO directory_options (id, kind, name, emails, created_at) VALUES (?, 'delegation', ?, ?, ?) ON CONFLICT(kind, name) DO UPDATE SET emails = excluded.emails").bind(crypto.randomUUID(), user.userId, config, Date.now()).run();
    return Response.json({ delegation: { delegateId: body.delegateId, until } });
  } catch (error) { console.error(error); return Response.json({ error: "带班设置未保存" }, { status: 500 }); }
}
