export const sessionCookie = "topasia_session";
type Session = { id: string; name: string; exp: number; version: 2; authVersion?:number };

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw Error("SESSION_SECRET must be at least 32 characters");
  return value;
}

async function signature(payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return Buffer.from(bytes).toString("base64url");
}

export async function createSession(id: string, name: string, authVersion=0) {
  const payload = Buffer.from(JSON.stringify({ id, name, exp: Date.now() + 7 * 24 * 60 * 60 * 1000, version: 2, authVersion } satisfies Session)).toString("base64url");
  return payload + "." + await signature(payload);
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 2048) return null;
  const [payload, received, extra] = token.split(".");
  if (!payload || !received || extra) return null;
  const expected = await signature(payload);
  if (received.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    return (data.authVersion===undefined||(Number.isSafeInteger(data.authVersion)&&data.authVersion>=0)) && data.version === 2 && typeof data.id === "string" && /^railway:[\p{L}\p{N} ._-]{2,80}$/u.test(data.id) && typeof data.name === "string" && data.name.length > 0 && data.name.length <= 80 && Number.isFinite(data.exp) && data.exp > Date.now() ? data : null;
  } catch { return null; }
}
