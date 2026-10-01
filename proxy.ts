import {accountFromToken} from "@/app/lib/account-access";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookie } from "@/app/lib/railway-session";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path === "/register" || path === "/logout" || path.startsWith("/api/auth/")) return NextResponse.next();
  if (await accountFromToken(request.cookies.get(sessionCookie)?.value)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const target = new URL("/login", request.url);
  target.searchParams.set("return_to", path + request.nextUrl.search);
  return NextResponse.redirect(target);
}
export const config = { matcher: ["/((?!_next|favicon.ico|favicon.svg|vendor/).*)"] };
