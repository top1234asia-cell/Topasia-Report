import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { customsRecipients, haulierRecipients } from "@/app/lib/default-email-recipients";

type Kind = "customs" | "haulier" | "carrier" | "groupNo";
const kinds: Kind[] = ["customs", "haulier", "carrier", "groupNo"];
const validKind = (value: unknown): value is Kind => kinds.includes(value as Kind);
type Saved = { id: string; kind: Kind; name: string; customer: string | null; currency: string | null; settlement: string | null; creationType?: string; collaborator?: string; emails: string | null };
const emailKinds: Kind[] = ["customs", "haulier", "carrier"];
const normalizedEmails = (input: unknown): string | null => {
  const addresses = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\s,;]+/).filter(Boolean) : null;
  if (!addresses || addresses.length > 30 || addresses.some(address => typeof address !== "string" || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(address.trim()))) return null;
  const clean = addresses.map(address => (address as string).trim());
  if (new Set(clean.map(address => address.toLowerCase())).size !== clean.length || clean.join(", ").length > 3000) return null;
  return clean.join(", ");
};
const validTerms = (kind: Kind, currency: unknown, settlement: unknown) => (kind === "groupNo" || (currency === undefined && settlement === undefined)) && (currency === undefined || (typeof currency === "string" && (currency === "" || /^[A-Z]{3}$/.test(currency)))) && (settlement === undefined || (typeof settlement === "string" && ["", "月结", "票结"].includes(settlement)));
const validWorkflow=(kind:Kind,type:unknown,partner:unknown)=>type===undefined&&partner===undefined||kind==="groupNo"&&["常规建单","结算协同"].includes(type as string)&&(type==="常规建单"?(partner===undefined||partner===""):["香港协同","顶亚协同"].includes(partner as string));
async function saveWorkflow(id:string,type:unknown,partner:unknown){if(type===undefined)return;await database().prepare("UPDATE directory_options SET creation_type = ?, collaborator = ? WHERE id = ?").bind(type,type==="结算协同"?partner: "",id).run();}
const cleanCustomer = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 200) : "";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const [saved, used, pairs] = await Promise.all([
      database().prepare("SELECT id, kind, name, customer, currency, settlement, creation_type AS creationType, collaborator, emails FROM directory_options WHERE kind IN ('customs', 'haulier', 'carrier', 'groupNo') ORDER BY name").all<Saved>(),
      database().prepare("SELECT 'customs' AS kind, trim(json_extract(data, '$.customs')) AS name FROM deliveries WHERE json_extract(data, '$.customs') IS NOT NULL UNION SELECT 'haulier', trim(json_extract(data, '$.haulier')) FROM deliveries WHERE json_extract(data, '$.haulier') IS NOT NULL UNION SELECT 'carrier', trim(json_extract(data, '$.carrier')) FROM deliveries WHERE json_extract(data, '$.carrier') IS NOT NULL UNION SELECT 'groupNo', trim(json_extract(data, '$.groupNo')) FROM deliveries WHERE json_extract(data, '$.groupNo') IS NOT NULL").all<{ kind: Kind; name: string }>(),
      database().prepare("SELECT trim(json_extract(data, '$.groupNo')) AS groupNo, min(trim(json_extract(data, '$.customer'))) AS customer FROM deliveries WHERE trim(coalesce(json_extract(data, '$.groupNo'), '')) != '' AND trim(coalesce(json_extract(data, '$.customer'), '')) != '' GROUP BY lower(trim(json_extract(data, '$.groupNo'))) HAVING count(DISTINCT lower(trim(json_extract(data, '$.customer')))) = 1").all<{ groupNo: string; customer: string }>(),
    ]);
    const result: Record<Kind, string[]> = { customs: [], haulier: [], carrier: [], groupNo: [] };
    for (const item of [...(saved.results || []), ...(used.results || [])]) {
      const name = item.name?.trim();
      if (validKind(item.kind) && name && !result[item.kind].some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) result[item.kind].push(name);
    }
    for (const [kind, defaults] of [["customs", customsRecipients], ["haulier", haulierRecipients]] as const) {
      for (const name of Object.keys(defaults)) if (!result[kind].some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) result[kind].push(name);
    }
    for (const kind of kinds) result[kind].sort((a, b) => a.localeCompare(b, "zh"));
    const emailDirectory: Record<string, Record<string, string[]>> = {
      customs: Object.fromEntries(Object.entries(customsRecipients).map(([name, addresses]) => [name.toLocaleLowerCase(), addresses])),
      haulier: Object.fromEntries(Object.entries(haulierRecipients).map(([name, addresses]) => [name.toLocaleLowerCase(), addresses])),
      carrier: {},
    };
    for (const item of saved.results || []) if (emailKinds.includes(item.kind) && item.emails !== null) emailDirectory[item.kind][item.name.toLocaleLowerCase()] = item.emails.split(", ").filter(Boolean);
    const groupCustomers: Record<string, string> = {};
    const groupTerms: Record<string, { currency: string; settlement: string; creationType?: string; collaborator?: string }> = {};
    for (const pair of pairs.results || []) groupCustomers[pair.groupNo.toLocaleLowerCase()] = pair.customer;
    for (const item of saved.results || []) if (item.kind === "groupNo") {
      if (item.customer?.trim()) groupCustomers[item.name.toLocaleLowerCase()] = item.customer.trim();
      groupTerms[item.name.toLocaleLowerCase()] = { currency: item.currency || "", settlement: item.settlement || "", creationType: item.creationType || "常规建单", collaborator: item.collaborator || "" };
    }
    return Response.json(new URL(request.url).searchParams.has("details") ? { options: result, saved: saved.results || [], groupCustomers, groupTerms, emailDirectory } : { ...result, groupCustomers, groupTerms, emailDirectory });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "选项读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const { kind, name, customer, currency, settlement, creationType, collaborator, emails } = await request.json() as { kind?: unknown; name?: unknown; customer?: unknown; currency?: unknown; settlement?: unknown; creationType?: unknown; collaborator?: unknown; emails?: unknown };
    if (!validKind(kind) || typeof name !== "string" || !name.trim() || name.trim().length > 100) return Response.json({ error: "请输入有效名称（最多100字）" }, { status: 400 });
    if (customer !== undefined && (kind !== "groupNo" || typeof customer !== "string" || customer.trim().length > 200)) return Response.json({ error: "客户名称无效" }, { status: 400 });
    if (!validWorkflow(kind,creationType,collaborator)) return Response.json({error:"请选择有效建单方式及协同方"},{status:400});
    if (!validTerms(kind, currency, settlement)) return Response.json({ error: "币种或结算方式无效" }, { status: 400 });
    const cleanedEmails = emails === undefined ? undefined : normalizedEmails(emails);
    if (cleanedEmails === null || (emails !== undefined && !emailKinds.includes(kind))) return Response.json({ error: "请输入有效邮箱，多个邮箱可用逗号或换行分隔（最多30个）" }, { status: 400 });
    const cleaned = name.trim().replace(/\s+/g, " ");
    const existing = await database().prepare("SELECT id, name, customer, currency, settlement, creation_type AS creationType, collaborator, emails FROM directory_options WHERE kind = ? AND lower(name) = lower(?) LIMIT 1").bind(kind, cleaned).first<{ id: string; name: string; customer: string | null; currency: string | null; settlement: string | null; creationType?: string; collaborator?: string; emails: string | null }>();
    if (existing) {
      if ((kind === "groupNo" && (customer !== undefined || currency !== undefined || settlement !== undefined)) || cleanedEmails !== undefined) await database().prepare("UPDATE directory_options SET customer = CASE WHEN ? THEN ? ELSE customer END, currency = CASE WHEN ? THEN ? ELSE currency END, settlement = CASE WHEN ? THEN ? ELSE settlement END, emails = CASE WHEN ? THEN ? ELSE emails END WHERE id = ?").bind(kind === "groupNo" && customer !== undefined ? 1 : 0, cleanCustomer(customer), currency !== undefined ? 1 : 0, currency || "", settlement !== undefined ? 1 : 0, settlement || "", cleanedEmails !== undefined ? 1 : 0, cleanedEmails || "", existing.id).run();
      await saveWorkflow(existing.id,creationType,collaborator);
      return Response.json({ id: existing.id, kind, name: existing.name, customer: kind === "groupNo" && customer !== undefined ? cleanCustomer(customer) : existing.customer });
    }
    const id = crypto.randomUUID();
    await database().prepare("INSERT OR IGNORE INTO directory_options (id, kind, name, customer, currency, settlement, emails, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, kind, cleaned, kind === "groupNo" ? cleanCustomer(customer) : null, kind === "groupNo" ? currency || "" : null, kind === "groupNo" ? settlement || "" : null, cleanedEmails ?? null, Date.now()).run();
    await saveWorkflow(id,creationType,collaborator);
    return Response.json({ id, kind, name: cleaned });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "新增失败，请重试" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const { id, name, customer, currency, settlement, creationType, collaborator, emails } = await request.json() as { id?: unknown; name?: unknown; customer?: unknown; currency?: unknown; settlement?: unknown; creationType?: unknown; collaborator?: unknown; emails?: unknown };
    if (typeof id !== "string" || typeof name !== "string" || !name.trim() || name.trim().length > 100) return Response.json({ error: "请输入有效名称（最多100字）" }, { status: 400 });
    const current = await database().prepare("SELECT kind FROM directory_options WHERE id = ?").bind(id).first<{ kind: Kind }>();
    if (!current) return Response.json({ error: "资料不存在" }, { status: 404 });
    if (customer !== undefined && (current.kind !== "groupNo" || typeof customer !== "string" || customer.trim().length > 200)) return Response.json({ error: "客户名称无效" }, { status: 400 });
    if (!validWorkflow(current.kind,creationType,collaborator)) return Response.json({error:"请选择有效建单方式及协同方"},{status:400});
    if (!validTerms(current.kind, currency, settlement)) return Response.json({ error: "币种或结算方式无效" }, { status: 400 });
    const cleanedEmails = emails === undefined ? undefined : normalizedEmails(emails);
    if (cleanedEmails === null || (emails !== undefined && !emailKinds.includes(current.kind))) return Response.json({ error: "请输入有效邮箱，多个邮箱可用逗号或换行分隔（最多30个）" }, { status: 400 });
    const cleaned = name.trim().replace(/\s+/g, " ");
    const duplicate = await database().prepare("SELECT id FROM directory_options WHERE kind = ? AND lower(name) = lower(?) AND id != ?").bind(current.kind, cleaned, id).first();
    if (duplicate) return Response.json({ error: "名称已存在" }, { status: 409 });
    await database().prepare("UPDATE directory_options SET name = ?, customer = CASE WHEN ? THEN ? ELSE customer END, currency = CASE WHEN ? THEN ? ELSE currency END, settlement = CASE WHEN ? THEN ? ELSE settlement END, emails = CASE WHEN ? THEN ? ELSE emails END WHERE id = ?").bind(cleaned, customer !== undefined && current.kind === "groupNo" ? 1 : 0, cleanCustomer(customer), currency !== undefined ? 1 : 0, currency || "", settlement !== undefined ? 1 : 0, settlement || "", cleanedEmails !== undefined ? 1 : 0, cleanedEmails || "", id).run();
    await saveWorkflow(id,creationType,collaborator);
    return Response.json({ id, kind: current.kind, name: cleaned });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "修改失败，请重试" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const { id } = await request.json() as { id?: unknown };
    if (typeof id !== "string") return Response.json({ error: "资料编号无效" }, { status: 400 });
    await database().prepare("DELETE FROM directory_options WHERE id = ?").bind(id).run();
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "删除失败，请重试" }, { status: 500 });
  }
}
