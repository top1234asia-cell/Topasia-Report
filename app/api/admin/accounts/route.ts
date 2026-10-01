import { NextResponse } from "next/server";
import { currentAccount } from "@/app/lib/account-access";
import { database } from "@/db/raw";

export async function GET() {
  const account = await currentAccount();
  if (!account || account.role !== "admin") return NextResponse.json({ error: "只有管理员可以查看注册申请" }, { status: 403 });
  const result = await database().prepare("SELECT id, name, status, role, created_at AS createdAt FROM accounts ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC").all();
  return NextResponse.json({ accounts: result.results });
}
export async function PATCH(request: Request) {
  const admin = await currentAccount();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "只有管理员可以批准账号" }, { status: 403 });
  const data = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  if (typeof data?.id !== "string" || !["approved", "rejected"].includes(String(data.status))) return NextResponse.json({ error: "申请资料不正确" }, { status: 400 });
  const target = await database().prepare("SELECT id, role, status FROM accounts WHERE id = ?").bind(data.id).first<{ id: string; role: string; status: string }>();
  if (!target || target.role === "admin" || !["pending", "rejected"].includes(target.status)) return NextResponse.json({ error: "该账号无法修改审批状态" }, { status: 409 });
  await database().prepare("UPDATE accounts SET status = ? WHERE id = ?").bind(data.status, data.id).run();
  return NextResponse.json({ ok: true });
}
