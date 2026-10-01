import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";

type Todo = { id: string; owner: string; groupNo: string; matter: string; urgent: number; createdAt: number; completedAt: number | null };
const select = "SELECT id, owner, group_no AS groupNo, matter, urgent, created_at AS createdAt, completed_at AS completedAt FROM todo_items";

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const result = await database().prepare(`${select} ORDER BY completed_at IS NOT NULL, urgent DESC, created_at DESC LIMIT 500`).all<Todo>();
    return Response.json(result.results || []);
  } catch (error) { console.error(error); return Response.json({ error: "待办读取失败" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as { owner?: unknown; groupNo?: unknown; matter?: unknown; urgent?: unknown };
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    const groupNo = typeof body.groupNo === "string" ? body.groupNo.trim() : "";
    const matter = typeof body.matter === "string" ? body.matter.trim() : "";
    if (!owner || !groupNo || !matter || owner.length > 120 || groupNo.length > 100 || matter.length > 2000 || typeof body.urgent !== "boolean") return Response.json({ error: "请填写负责人、群号和事情" }, { status: 400 });
    const id = crypto.randomUUID(), createdAt = Date.now(), urgent = body.urgent ? 1 : 0;
    await database().prepare("INSERT INTO todo_items (id, owner, group_no, matter, urgent, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, owner, groupNo, matter, urgent, createdAt, user.userId).run();
    return Response.json({ id, owner, groupNo, matter, urgent, createdAt, completedAt: null } satisfies Todo, { status: 201 });
  } catch (error) { console.error(error); return Response.json({ error: "待办保存失败" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string" || !body.id || body.id.length > 100) return Response.json({ error: "待办编号无效" }, { status: 400 });
    const completedAt = Date.now();
    const result = await database().prepare("UPDATE todo_items SET completed_at = ?, completed_by = ? WHERE id = ? AND completed_at IS NULL").bind(completedAt, user.userId, body.id).run();
    if (!result.meta.changes) return Response.json({ error: "待办已完成或不存在，请刷新" }, { status: 409 });
    return Response.json({ id: body.id, completedAt });
  } catch (error) { console.error(error); return Response.json({ error: "完成待办失败" }, { status: 500 }); }
}
