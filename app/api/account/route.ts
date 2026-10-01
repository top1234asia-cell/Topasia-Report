import { NextResponse } from "next/server";
import { currentAccount } from "@/app/lib/account-access";
import { hashPassword, validName, validPassword, verifyPassword } from "@/app/lib/account-password";
import { createSession, sessionCookie } from "@/app/lib/railway-session";
import { database } from "@/db/raw";

export async function GET() {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ account: { name: account.name, role: account.role } });
}
export async function PATCH(request: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const data = await request.json().catch(() => null) as { name?: unknown; currentPassword?: unknown; newPassword?: unknown } | null;
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const currentPassword = typeof data?.currentPassword === "string" ? data.currentPassword : "";
  const newPassword = typeof data?.newPassword === "string" ? data.newPassword : "";
  if (!validName(name) || (name.toLowerCase() === "admin" && account.role !== "admin") || (account.role === "admin" && name.toLowerCase() !== "admin")) return NextResponse.json({ error: "账号名称无效" }, { status: 400 });
  if (!currentPassword) return NextResponse.json({ error: "请填写当前密码" }, { status: 400 });
  if (newPassword && !validPassword(newPassword)) return NextResponse.json({ error: "新密码需为 12–128 个字符" }, { status: 400 });
  try {
    const original = await database().prepare("SELECT password_hash AS hash, password_salt AS salt FROM accounts WHERE id = ?").bind(account.id).first<{ hash: string; salt: string }>();
    if (!original || !await verifyPassword(currentPassword, original.salt, original.hash)) return NextResponse.json({ error: "当前密码不正确" }, { status: 403 });
    const duplicate = await database().prepare("SELECT id FROM accounts WHERE name = ? COLLATE NOCASE AND id <> ?").bind(name, account.id).first();
    if (duplicate) return NextResponse.json({ error: "账号名称已被使用" }, { status: 409 });
    if (newPassword) {
      const { hash, salt } = await hashPassword(newPassword);
      await database().prepare("UPDATE accounts SET name = ?, password_hash = ?, password_salt = ?, auth_version=auth_version+1 WHERE id = ?").bind(name, hash, salt, account.id).run();
    } else await database().prepare("UPDATE accounts SET name = ? WHERE id = ?").bind(name, account.id).run();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookie, await createSession(account.id, name,account.authVersion+(newPassword?1:0)), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 });
    return response;
  } catch (error) { console.error(error); return NextResponse.json({ error: "保存失败，请查看部署日志" }, { status: 500 }); }
}
