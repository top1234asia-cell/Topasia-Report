import { NextResponse } from "next/server";
import { accountId, hashPassword, validName, validPassword } from "@/app/lib/account-password";
import { database } from "@/db/raw";

export async function POST(request: Request) {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) return NextResponse.json({ error: "请管理员先在 Railway Variables 设置 ADMIN_PASSWORD（至少 12 个字符）" }, { status: 503 });
  const input = await request.json().catch(() => null) as { name?: unknown; password?: unknown } | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!validName(name) || name.toLowerCase() === "admin") return NextResponse.json({ error: "账号需为 2–80 个字符，且不能使用 admin" }, { status: 400 });
  if (!validPassword(password)) return NextResponse.json({ error: "密码需为 12–128 个字符" }, { status: 400 });
  try {
    const { salt, hash } = await hashPassword(password);
    const exists = await database().prepare("SELECT id FROM accounts WHERE name = ? COLLATE NOCASE OR id = ?").bind(name, accountId(name)).first();
    if (exists) return NextResponse.json({ error: "该账号已经注册，请登录或联系管理员" }, { status: 409 });
    await database().prepare("INSERT INTO accounts (id, name, password_hash, password_salt, created_at, role, status) VALUES (?, ?, ?, ?, ?, 'user', 'pending')").bind(accountId(name), name, hash, salt, Date.now()).run();
    return NextResponse.json({ ok: true, message: "注册申请已提交，管理员批准后才能登录" }, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "注册失败，请查看网站服务的部署日志" }, { status: 500 }); }
}
