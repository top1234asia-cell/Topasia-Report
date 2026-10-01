import { NextResponse } from "next/server";
import { ensureAdmin } from "@/app/lib/admin-account";
import { validName, verifyPassword } from "@/app/lib/account-password";
import { createSession, sessionCookie } from "@/app/lib/railway-session";
import { database } from "@/db/raw";

export async function POST(request: Request) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) return NextResponse.json({ error: "请在 Railway Variables 设置 SESSION_SECRET（至少 32 个字符）" }, { status: 503 });
  const input = await request.json().catch(() => null) as { name?: unknown; password?: unknown } | null;
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const attempt = typeof input?.password === "string" ? input.password : "";
  if (!validName(name) || !attempt || attempt.length > 128) return NextResponse.json({ error: "请填写账号和密码" }, { status: 400 });
  try {
    if (name.toLowerCase() === "admin") {
      try { await ensureAdmin(); } catch { return NextResponse.json({ error: "原有 admin 账号已存在：请将 Railway 的 ADMIN_PASSWORD 设为该账号当前密码，再重新部署" }, { status: 503 }); }
    }
    const account = await database().prepare("SELECT id, name, password_hash AS hash, password_salt AS salt, status, role, auth_version AS authVersion FROM accounts WHERE name = ? COLLATE NOCASE").bind(name).first<{ id: string; name: string; hash: string; salt: string; status: string; role: string; authVersion:number }>();
    if (!account || !await verifyPassword(attempt, account.salt, account.hash)) return NextResponse.json({ error: "账号或密码不正确" }, { status: 401 });
    if (account.status !== "approved") return NextResponse.json({ error: account.status === "pending" ? "账号等待管理员批准" : "账号未获批准，请联系管理员" }, { status: 403 });
    const response = NextResponse.json({ ok: true, role: account.role });
    response.cookies.set(sessionCookie, await createSession(account.id, account.name,account.authVersion), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 });
    return response;
  } catch (error) { console.error(error); return NextResponse.json({ error: "登录失败，请查看网站服务的部署日志" }, { status: 500 }); }
}
