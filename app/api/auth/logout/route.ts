import { NextResponse } from "next/server";
import { sessionCookie } from "@/app/lib/railway-session";
export async function GET() {
  // Relative Location keeps Railway's public hostname instead of internal 0.0.0.0:8080.
  const response = new NextResponse(null, { status: 303, headers: { Location: "/logout" } });
  response.cookies.delete(sessionCookie);
  return response;
}
