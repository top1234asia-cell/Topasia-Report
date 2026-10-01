import { redirect } from "next/navigation";
import { currentAccount } from "@/app/lib/account-access";

export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };
export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const account = await currentAccount();
  if (!account) return null;
  return { userId: account.id, displayName: account.name, email: account.id.slice("railway:".length) + "@railway.local", fullName: account.name };
}
export async function requireChatGPTUser(returnTo: string) {
  const user = await getChatGPTUser();
  if (!user) redirect("/login?return_to=" + encodeURIComponent(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/"));
  return user;
}
