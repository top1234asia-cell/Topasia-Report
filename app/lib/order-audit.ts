import { database } from "@/db/raw";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type Entry = { id: string; data: Record<string, unknown> };
const groupKey = (data: Record<string, unknown>, id: string) => String(data.orderId || `legacy:${data.booking || id}:${data.customer || ""}`);
const compact = (input: unknown) => {
  if (input === null || input === undefined || input === "") return "—";
  if (typeof input === "object") return "资料已更新";
  return String(input).slice(0, 120);
};
export async function recordOrderAudit(before: Entry[], after: Entry[], actor: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>, action: string) {
  const old = new Map(before.map(item => [item.id, item.data]));
  const next = new Map(after.map(item => [item.id, item.data]));
  const events = new Map<string, Array<{ container: string; field: string; before: string; after: string }>>();
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    const prior = old.get(id), current = next.get(id);
    if (JSON.stringify(prior) === JSON.stringify(current)) continue;
    const source = current || prior || {};
    const key = groupKey(source, id);
    const changes = events.get(key) || [];
    const fields = new Set([...Object.keys(prior || {}), ...Object.keys(current || {})]);
    for (const field of fields) {
      if (["ownerId", "ownerEmail", "sortOrder", "exportRef", "financeHistory", "financeContainerHistory"].includes(field)) continue;
      if (JSON.stringify(prior?.[field]) === JSON.stringify(current?.[field])) continue;
      changes.push({ container: String(source.container || source.size || id).slice(0, 40), field, before: compact(prior?.[field]), after: compact(current?.[field]) });
    }
    events.set(key, changes);
  }
  const now = Date.now();
  for (const [key, changes] of events) {
    const role = before.some(item => groupKey(item.data, item.id) === key && item.data.ownerId === actor.userId) || after.some(item => groupKey(item.data, item.id) === key && item.data.ownerId === actor.userId) ? "负责人" : "带班";
    await database().prepare("INSERT INTO directory_options (id, kind, name, customer, emails, created_at) VALUES (?, 'orderAudit', ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), key, JSON.stringify({ actor: actor.displayName, email: actor.email, role, action, changes: changes.slice(0, 200) }), now).run();
  }
}
export async function auditSnapshot(ids: string[]): Promise<Entry[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)].slice(0, 150);
  const rows = await database().prepare("SELECT id, data FROM deliveries WHERE id IN (" + unique.map(() => "?").join(",") + ")").bind(...unique).all<{ id: string; data: string }>();
  return rows.results.map(row => ({ id: row.id, data: JSON.parse(row.data) }));
}
export function idsFromMutation(input: Record<string, unknown>): string[] {
  const nested = [input.ownerChange, input.detachTicket, input.etpUpdate, input.portCheckFailure].filter(item => item && typeof item === "object") as Array<{ ids?: unknown }>;
  return [input.id, ...(Array.isArray(input.ids) ? input.ids : []), ...(Array.isArray(input.splitItems) ? input.splitItems.map(item => item?.id) : []), ...nested.flatMap(item => Array.isArray(item.ids) ? item.ids : [])].filter((id): id is string => typeof id === "string");
}
