import { auditSnapshot, idsFromMutation, recordOrderAudit } from "@/app/lib/order-audit";
import { delegatedOwners, isOwnOrder, orderAccessBindings, orderAccessPredicate } from "@/app/lib/delegation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { bookingMatches, westportsDate, westportsRangeValid } from "@/app/lib/westports-import";

const legacyOwnerEmail = "limshehong96@gmail.com";
const ownerPredicate = orderAccessPredicate;
const detailFields = ["container", "size", "factory", "deliveryTime", "haulierNotifiedAt", "gateIn", "vgm", "truckType", "haulier", "rot", "remark", "status", "exportWeight"];
const orderFields = ["priority", "sortOrder", "groupNo", "businessNo", "customs", "terminal", "booking", "carrier", "quantity", "gateOpen", "cutoff", "destination", "commodity", "vessel", "customer", "currency", "settlement", "ownerName", "transshipment"];
const validWeight = (weight: string) => weight === "" || (weight.length <= 20 && Number.isFinite(Number(weight)) && Number(weight) >= 0);
const validTransshipment = (value: string) => {
  if (!value) return true;
  if (value.length > 30000) return false;
  try {
    const data = JSON.parse(value) as Record<string, unknown>;
    if (data.enabled !== true || typeof data.importBl !== "string" || data.importBl.length > 200 || !Array.isArray(data.imports) || data.imports.length > 100) return false;
    const imports = data.imports as Record<string, unknown>[];
    return imports.every(item => item && typeof item === "object" && ["id", "container", "size", "weight", "exportRef"].every(key => typeof item[key] === "string" && (item[key] as string).length <= 200) && validWeight(item.weight as string)) && new Set(imports.map(item => item.id)).size === imports.length;
  } catch { return false; }
};
const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status });
const belongsTo = (data: Record<string, unknown>, userId: string, email: string) =>
  data.ownerId === userId || (!data.ownerId && email.toLowerCase() === legacyOwnerEmail);

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("请先登录", 401);
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim() || "";
    const db = database();
    const escapedQuery = query.toLowerCase().replace(/[!%_]/g, character => "!" + character);
    const results = query.length >= 2
      ? await db.prepare("WITH matches AS (SELECT id, json_extract(data, '$.orderId') AS order_id FROM deliveries WHERE lower(data) LIKE ? ESCAPE '!' ORDER BY created_at DESC LIMIT 500) SELECT id, data, created_at FROM deliveries WHERE id IN (SELECT id FROM matches) OR json_extract(data, '$.orderId') IN (SELECT order_id FROM matches WHERE order_id IS NOT NULL) ORDER BY created_at DESC LIMIT 1000").bind("%" + escapedQuery + "%").all()
      : await db.prepare("SELECT id, data, created_at FROM deliveries WHERE " + ownerPredicate + " ORDER BY created_at DESC LIMIT 1000").bind(...orderAccessBindings(user)).all();
    const actingFor = await delegatedOwners(user.userId);
    const rows = (results.results || []).map(result => {
      const data = JSON.parse(String(result.data)) as Record<string, unknown>;
      return { ...data, id: result.id, createdAt: result.created_at, mine: belongsTo(data, user.userId, user.email) || actingFor.has(String(data.ownerId || "")), acting: !belongsTo(data, user.userId, user.email) && actingFor.has(String(data.ownerId || "")), ownerName: data.ownerName || (data.ownerEmail || "历史记录") };
    });
    return Response.json({ rows, user: { id: user.userId, name: user.displayName, email: user.email } });
  } catch (error) {
    console.error(error);
    return errorResponse("暂时无法读取记录", 500);
  }
}

async function postDelivery(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("请先登录", 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items : [body];
    if (!items.length || items.length > 100 || items.some(item => !item || typeof item !== "object" || Array.isArray(item) || !Object.values(item).every(v => typeof v === "string"))) return errorResponse("货柜资料无效", 400);
    if (items.some(item => { const row = item as Record<string, string>; return !validWeight(row.exportWeight || "") || !validTransshipment(row.transshipment || ""); })) return errorResponse("转口重量或进口柜资料无效", 400);
    if (items.some(item => { const row = item as Record<string, string>; return row.gateIn?.trim() && row.vgm !== "done"; })) return errorResponse("进港前请先完成 VGM", 400);
    const now = Date.now();
    const records = (items as Record<string, string>[]).map((item, index) => {
      const { id: _id, ownerId: _ownerId, ownerEmail: _ownerEmail, ownerName: _ownerName, mine: _mine, ...fields } = item;
      return { id: crypto.randomUUID(), data: { ...fields, ownerId: user.userId, ownerEmail: user.email, ownerName: user.displayName } as Record<string, string>, createdAt: now + index };
    });
    const db = database();
    const orderIds = [...new Set(records.map(record => record.data.orderId).filter(Boolean))];
    if (orderIds.length !== 1) return errorResponse("每次只能保存一票订单", 400);
    const orderId = orderIds[0];
    if (orderId.startsWith("legacy:") && user.email.toLowerCase() !== legacyOwnerEmail) return errorResponse("只能为自己的订单加柜", 403);
    const first = records[0].data;
    if (!first.booking?.trim() || !first.groupNo?.trim() || records.some(record => record.data.booking !== first.booking || record.data.groupNo !== first.groupNo || (record.data.customer || "") !== (first.customer || ""))) return errorResponse("订舱号和群号必填，订单资料必须一致", 400);
    const directory = await db.prepare("SELECT customer, currency, settlement FROM directory_options WHERE kind = 'groupNo' AND lower(name) = lower(?) LIMIT 1").bind(first.groupNo).first<{ customer: string | null; currency: string | null; settlement: string | null }>();
    for (const record of records) {
      if (!record.data.customer && directory?.customer) record.data.customer = directory.customer;
      if (!record.data.currency && directory?.currency) record.data.currency = directory.currency;
      if (!record.data.settlement && directory?.settlement) record.data.settlement = directory.settlement;
    }
    const previous = orderId.startsWith("legacy:")
      ? await db.prepare("SELECT id, data FROM deliveries WHERE (json_extract(data, '$.orderId') IS NULL OR json_extract(data, '$.orderId') = ?) AND json_extract(data, '$.booking') = ? AND json_extract(data, '$.customer') = ?")
        .bind(orderId, first.booking, first.customer).all<{ id: string; data: string }>()
      : await db.prepare("SELECT id, data FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(orderId).all<{ id: string; data: string }>();
    const cover = await delegatedOwners(user.userId);
    if (previous.results.some(item => { const data = JSON.parse(item.data) as Record<string, unknown>; return !isOwnOrder(data, user) && !cover.has(String(data.ownerId || "")); })) return errorResponse("没有该订单的操作权限", 403);
    if (previous.results.length && !isOwnOrder(JSON.parse(previous.results[0].data), user)) {
      const owner = JSON.parse(previous.results[0].data) as Record<string, string>;
      for (const record of records) Object.assign(record.data, { ownerId: owner.ownerId, ownerEmail: owner.ownerEmail, ownerName: owner.ownerName });
    }
    if (previous.results.some(item => { const data = JSON.parse(item.data); return data.completedAt || data.cancelledAt; })) return errorResponse("请先恢复已归档订单再加柜", 400);
    if (previous.results.length) {
      const existing = JSON.parse(previous.results[0].data) as Record<string, unknown>;
      for (const record of records) {
        if (existing.financeProgress && typeof existing.financeProgress === "object") {
          const { invoiceReceived: _received, invoiceChecked: _checked, ...groupProgress } = existing.financeProgress as Record<string, unknown>;
          Object.assign(record.data, { financeProgress: groupProgress });
        }
        if (existing.financeHistory) Object.assign(record.data, { financeHistory: existing.financeHistory });
        if (existing.financeNotes) Object.assign(record.data, { financeNotes: existing.financeNotes });
      }
    }
    const quantity = String(previous.results.length + records.length);
    if (records.some(record => record.data.quantity !== quantity)) return errorResponse("一级柜量必须等于二级货柜数", 400);
    for (const record of records) record.data.quantity = quantity;
    await db.batch([
      ...previous.results.map(item => db.prepare("UPDATE deliveries SET data = json_set(data, '$.quantity', ?), updated_at = ? WHERE id = ?").bind(quantity, now, item.id)),
      ...records.map(record => db.prepare("INSERT INTO deliveries (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(record.id, JSON.stringify(record.data), record.createdAt, now)),
    ]);
    const created = records.map(record => ({ id: record.id, ...record.data, createdAt: record.createdAt, mine: true }));
    return Response.json(Array.isArray(body.items) ? created : created[0]);
  } catch (error) {
    console.error(error);
    return errorResponse("保存失败，请重试", 500);
  }
}

async function patchDelivery(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("请先登录", 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    const db = database();
    if (body.etpUpdate && typeof body.etpUpdate === "object" && !Array.isArray(body.etpUpdate)) {
      const update = body.etpUpdate as Record<string, unknown>;
      const ids = update.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length ||
        typeof update.booking !== "string" || !update.booking.trim() || typeof update.port !== "string" || !["WP", "NP"].includes(update.port) || typeof update.gateOpen !== "string" || typeof update.cutoff !== "string" ||
        !westportsRangeValid(update.gateOpen, update.cutoff, update.port === "NP") || update.gateOpen !== westportsDate(update.gateOpen, update.port === "NP") || update.cutoff !== westportsDate(update.cutoff)) {
        return errorResponse("码头时间资料无效", 400);
      }
      const selected = await db.prepare("SELECT id, data FROM deliveries WHERE id IN (" + ids.map(() => "?").join(",") + ") AND json_extract(data, '$.completedAt') IS NULL AND json_extract(data, '$.cancelledAt') IS NULL AND " + ownerPredicate)
        .bind(...ids, ...orderAccessBindings(user)).all<{ id: string; data: string }>();
      if (selected.results.length !== ids.length) return errorResponse("只能更新自己处理中订单的时间", 403);
      const first = JSON.parse(selected.results[0].data) as Record<string, string>;
      const port = (first.terminal || "").trim().toUpperCase() === "WESTPORTS" ? "WP" : (first.terminal || "").trim().toUpperCase();
      if (!["WP", "NP"].includes(port) || port !== update.port) return errorResponse("码头与订单不一致", 400);
      if (!bookingMatches(first.booking || "", update.booking) || !selected.results.every(item => {
        const data = JSON.parse(item.data) as Record<string, string>;
        return bookingMatches(data.booking || "", first.booking || "") &&
          (data.terminal || "").trim().toUpperCase() === (first.terminal || "").trim().toUpperCase() &&
          (first.orderId ? data.orderId === first.orderId : data.customer === first.customer && !data.orderId);
      })) return errorResponse("订舱号或订单柜资料不一致，请刷新后重试", 409);
      const total = first.orderId
        ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(first.orderId).first<{ count: number }>()
        : await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') IS NULL AND json_extract(data, '$.booking') = ? AND json_extract(data, '$.customer') = ?").bind(first.booking, first.customer || "").first<{ count: number }>();
      if (Number(total?.count) !== ids.length) return errorResponse("订单柜量有变化，请刷新后重试", 409);
      const checkedAt = new Date().toISOString();
      const portSource = port === "WP" ? "Westports ETP" : "Northport CAS-3";
      const previousHistory = Array.isArray(JSON.parse(first.portCheckHistory || "[]")) ? JSON.parse(first.portCheckHistory || "[]") as unknown[] : [];
      const portCheckHistory = JSON.stringify([...previousHistory.slice(-19), { at: checkedAt, result: "success", method: "manual", booking: first.booking, port }]);
      await db.batch(ids.map(id => db.prepare("UPDATE deliveries SET data = json_set(data, '$.gateOpen', ?, '$.cutoff', ?, '$.portCheckedAt', ?, '$.portSource', ?, '$.portLastAttemptAt', ?, '$.portCheckStatus', 'success', '$.portCheckReason', '', '$.portCheckHistory', ?), updated_at = ? WHERE id = ? AND " + ownerPredicate)
        .bind(update.gateOpen, update.cutoff, checkedAt, portSource, checkedAt, portCheckHistory, Date.now(), id, ...orderAccessBindings(user))));
      return Response.json({ gateOpen: update.gateOpen, cutoff: update.cutoff, portCheckedAt: checkedAt, portSource, portCheckHistory });
    }
    if (body.portCheckFailure && typeof body.portCheckFailure === "object" && !Array.isArray(body.portCheckFailure)) {
      const update = body.portCheckFailure as Record<string, unknown>;
      const ids = update.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string") ||
        typeof update.booking !== "string" || !update.booking.trim() || typeof update.reason !== "string" || !update.reason.trim() || update.reason.length > 300) return errorResponse("请填写失败原因", 400);
      const selected = await db.prepare("SELECT id, data FROM deliveries WHERE id IN (" + ids.map(() => "?").join(",") + ") AND json_extract(data, '$.completedAt') IS NULL AND json_extract(data, '$.cancelledAt') IS NULL AND " + ownerPredicate)
        .bind(...ids, ...orderAccessBindings(user)).all<{ id: string; data: string }>();
      if (selected.results.length !== ids.length) return errorResponse("只能记录自己处理中订单", 403);
      const first = JSON.parse(selected.results[0].data) as Record<string, string>;
      const port = (first.terminal || "").trim().toUpperCase() === "WESTPORTS" ? "WP" : (first.terminal || "").trim().toUpperCase();
      if (!["WP", "NP"].includes(port) || !bookingMatches(first.booking || "", update.booking) || selected.results.some(item => {
        const data = JSON.parse(item.data) as Record<string, string>;
        return data.booking !== first.booking || data.terminal !== first.terminal || (first.orderId ? data.orderId !== first.orderId : data.customer !== first.customer || !!data.orderId);
      })) return errorResponse("订单资料不一致", 409);
      const count = first.orderId
        ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(first.orderId).first<{ count: number }>()
        : await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') IS NULL AND json_extract(data, '$.booking') = ? AND json_extract(data, '$.customer') = ?").bind(first.booking, first.customer || "").first<{ count: number }>();
      if (Number(count?.count) !== ids.length) return errorResponse("订单柜量有变化，请刷新后重试", 409);
      const at = new Date().toISOString(), reason = update.reason.trim();
      const previousHistory = Array.isArray(JSON.parse(first.portCheckHistory || "[]")) ? JSON.parse(first.portCheckHistory || "[]") as unknown[] : [];
      const portCheckHistory = JSON.stringify([...previousHistory.slice(-19), { at, result: "failed", method: "manual", booking: first.booking, port, reason }]);
      await db.batch(ids.map(id => db.prepare("UPDATE deliveries SET data = json_set(data, '$.portLastAttemptAt', ?, '$.portCheckStatus', 'failed', '$.portCheckReason', ?, '$.portCheckHistory', ?), updated_at = ? WHERE id = ? AND " + ownerPredicate)
        .bind(at, reason, portCheckHistory, Date.now(), id, ...orderAccessBindings(user))));
      return Response.json({ portLastAttemptAt: at, portCheckStatus: "failed", portCheckReason: reason, portCheckHistory });
    }
    if (body.ownerChange && typeof body.ownerChange === "object" && !Array.isArray(body.ownerChange)) {
      const change = body.ownerChange as { ids?: unknown; targetId?: unknown };
      const ids = change.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string") || typeof change.targetId !== "string" || !change.targetId) return errorResponse("请选择要接收业务的负责人", 400);
      const target = await db.prepare("SELECT id, name FROM accounts WHERE id = ? AND status = 'approved' LIMIT 1").bind(change.targetId).first<{ id: string; name: string }>();
      if (!target) return errorResponse("接收人账号尚未获批准", 400);
      const recipient = { ownerId: target.id, ownerEmail: target.name + "@railway.local", ownerName: target.name };
      if (!recipient.ownerEmail || !recipient.ownerId || recipient.ownerId === user.userId) return errorResponse("请选择另一位有效的负责人", 400);
      const selected = await db.prepare("SELECT id, data FROM deliveries WHERE id IN (" + ids.map(() => "?").join(",") + ") AND " + ownerPredicate).bind(...ids, ...orderAccessBindings(user)).all<{ id: string; data: string }>();
      if (selected.results.length !== ids.length || selected.results.some(item => !isOwnOrder(JSON.parse(item.data), user))) return errorResponse("只能转移自己的订单", 403);
      const first = JSON.parse(selected.results[0].data) as Record<string, string>;
      if (!selected.results.every(item => {
        const row = JSON.parse(item.data) as Record<string, string>;
        return !row.cancelledAt && (first.orderId ? row.orderId === first.orderId : row.booking === first.booking && row.customer === first.customer);
      })) return errorResponse("请选择同一票未退关的订单", 400);
      const total = first.orderId && !first.orderId.startsWith("legacy:")
        ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(first.orderId).first<{ count: number }>()
        : await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.booking') = ? AND coalesce(json_extract(data, '$.customer'), '') = ?").bind(first.booking || "", first.customer || "").first<{ count: number }>();
      if (Number(total?.count) !== ids.length) return errorResponse("订单柜量有变化，请刷新后重试", 409);
      const name = recipient.ownerName || recipient.ownerEmail;
      const now = Date.now();
      await db.batch(ids.map(id => db.prepare("UPDATE deliveries SET data = json_set(data, '$.ownerId', ?, '$.ownerEmail', ?, '$.ownerName', ?), updated_at = ? WHERE id = ? AND " + ownerPredicate).bind(recipient.ownerId, recipient.ownerEmail, name, now, id, ...orderAccessBindings(user))));
      return Response.json({ ok: true, ownerId: recipient.ownerId, ownerEmail: recipient.ownerEmail, ownerName: name });
    }
    if (body.detachTicket && typeof body.detachTicket === "object" && !Array.isArray(body.detachTicket)) {
      const request = body.detachTicket as { ids?: unknown; ticketId?: unknown };
      const ids = request.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== "string") || typeof request.ticketId !== "string" || !request.ticketId) return errorResponse("请选择要拆出的分票", 400);
      const selected = await db.prepare("SELECT id, data FROM deliveries WHERE id IN (" + ids.map(() => "?").join(",") + ") AND " + ownerPredicate).bind(...ids, ...orderAccessBindings(user)).all<{ id: string; data: string }>();
      if (selected.results.length !== ids.length) return errorResponse("只能拆出自己的订单", 403);
      const first = JSON.parse(selected.results[0].data) as Record<string, string>;
      if (!first.orderId || first.orderId.startsWith("legacy:") || first.cancelledAt || !first.ticketBusinessNo?.trim() || selected.results.some(item => {
        const row = JSON.parse(item.data) as Record<string, string>;
        return row.orderId !== first.orderId || row.ticketId !== request.ticketId || row.ticketBusinessNo !== first.ticketBusinessNo || !!row.cancelledAt;
      })) return errorResponse("请在处理中或完成订单中选择同一张分票", 400);
      const all = await db.prepare("SELECT id, data FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(first.orderId).all<{ id: string; data: string }>();
      if (all.results.length <= ids.length || all.results.some(item => {
        const row = JSON.parse(item.data) as Record<string, string>;
        return item.id !== selected.results.find(own => own.id === item.id)?.id && row.ticketId === request.ticketId;
      })) return errorResponse("订单或分票货柜数已变化，请刷新", 409);
      const selectedIds = new Set(ids as string[]), now = Date.now(), newOrderId = crypto.randomUUID();
      await db.batch(all.results.map(item => {
        const row = JSON.parse(item.data) as Record<string, string>;
        const detached = selectedIds.has(item.id);
        const next = detached ? { ...row, orderId: newOrderId, quantity: String(ids.length), businessNo: first.ticketBusinessNo, ticketId: "", ticketName: "", ticketBusinessNo: "", ticketBl: "" } : { ...row, quantity: String(all.results.length - ids.length) };
        return db.prepare("UPDATE deliveries SET data = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(next), now, item.id);
      }));
      return Response.json({ ok: true, orderId: newOrderId, businessNo: first.ticketBusinessNo, quantity: ids.length });
    }
    if (Array.isArray(body.splitItems)) {
      const items = body.splitItems as Array<{ id?: unknown; ticketId?: unknown; ticketName?: unknown; ticketBl?: unknown; ticketBusinessNo?: unknown }>;
      if (!items.length || items.length > 100 || new Set(items.map(item => item.id)).size !== items.length ||
        items.some(item => typeof item.id !== "string" || typeof item.ticketId !== "string" || typeof item.ticketName !== "string" || typeof item.ticketBl !== "string" || typeof item.ticketBusinessNo !== "string")) {
        return errorResponse("分票资料无效", 400);
      }
      const clear = items.every(item => !item.ticketId && !item.ticketName && !item.ticketBl && !item.ticketBusinessNo);
      const ticketIds = new Set(items.map(item => item.ticketId));
      if (!clear && (ticketIds.size < 2 || items.some(item => !item.ticketId || !String(item.ticketName).trim() || !String(item.ticketBusinessNo).trim()))) return errorResponse("每张分票都需要业务编号，每个货柜都要有归属", 400);
      const definitions = new Map<string, string>();
      const businessNumbers = new Map<string, string>();
      for (const item of items) {
        const definition = JSON.stringify([item.ticketName, item.ticketBl, item.ticketBusinessNo]);
        if (definitions.has(String(item.ticketId)) && definitions.get(String(item.ticketId)) !== definition) return errorResponse("同一分票的资料不一致", 400);
        definitions.set(String(item.ticketId), definition);
        const number = String(item.ticketBusinessNo).trim().toLowerCase();
        if (!clear && businessNumbers.has(number) && businessNumbers.get(number) !== item.ticketId) return errorResponse("每张分票需要不同的业务编号", 400);
        businessNumbers.set(number, String(item.ticketId));
      }
      const ids = items.map(item => item.id as string);
      const selected = await db.prepare("SELECT id, data FROM deliveries WHERE id IN (" + ids.map(() => "?").join(",") + ") AND " + ownerPredicate)
        .bind(...ids, ...orderAccessBindings(user)).all<{ id: string; data: string }>();
      if (selected.results.length !== ids.length || selected.results.some(item => !!JSON.parse(item.data).cancelledAt)) return errorResponse("只能为自己的处理中或完成订单分票", 403);
      const first = JSON.parse(selected.results[0].data) as Record<string, string>;
      const legacy = !first.orderId || first.orderId.startsWith("legacy:");
      if (!selected.results.every(result => {
        const data = JSON.parse(result.data) as Record<string, string>;
        return legacy ? first.booking ? (!data.orderId || data.orderId.startsWith("legacy:")) && data.booking === first.booking && data.customer === first.customer : ids.length === 1 : data.orderId === first.orderId;
      })) return errorResponse("请选择同一票订单", 400);
      const total = !legacy
        ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(first.orderId).first<{ count: number }>()
        : first.booking
          ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE (json_extract(data, '$.orderId') IS NULL OR json_extract(data, '$.orderId') LIKE 'legacy:%') AND json_extract(data, '$.booking') = ? AND json_extract(data, '$.customer') = ?").bind(first.booking, first.customer || "").first<{ count: number }>()
          : { count: 1 };
      if (Number(total?.count) !== ids.length) return errorResponse("订单柜量有变化，请刷新后重试", 409);
      await db.batch(items.map(item => db.prepare(clear
        ? "UPDATE deliveries SET data = json_remove(data, '$.ticketId', '$.ticketName', '$.ticketBl', '$.ticketBusinessNo'), updated_at = ? WHERE id = ? AND " + ownerPredicate
        : "UPDATE deliveries SET data = json_set(data, '$.ticketId', ?, '$.ticketName', ?, '$.ticketBl', ?, '$.ticketBusinessNo', ?), updated_at = ? WHERE id = ? AND " + ownerPredicate
      ).bind(...(clear ? [] : [item.ticketId, item.ticketName, item.ticketBl, item.ticketBusinessNo]), Date.now(), item.id, ...orderAccessBindings(user))));
      return Response.json({ ok: true });
    }
    if (Array.isArray(body.ids) && (body.archive === "complete" || body.archive === "restore" || body.archive === "cancel")) {
      const archive = body.archive;
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (archive === "cancel" && (!reason || reason.length > 500)) return errorResponse("请填写不超过500字的退关原因", 400);
      const ids = body.ids as unknown[];
      if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !id)) return errorResponse("订单资料无效", 400);
      const markers = ids.map(() => "?").join(",");
      const selected = await db.prepare("SELECT id, data FROM deliveries WHERE id IN (" + markers + ") AND " + ownerPredicate)
        .bind(...ids, ...orderAccessBindings(user)).all<{ id: string; data: string }>();
      if (selected.results.length !== ids.length) return errorResponse("只能整理自己的订单", 403);
      const first = JSON.parse(selected.results[0].data) as Record<string, string>;
      const legacy = !first.orderId || first.orderId.startsWith("legacy:");
      const sameOrder = selected.results.every(item => {
        const data = JSON.parse(item.data) as Record<string, string>;
        return legacy
          ? first.booking ? (!data.orderId || data.orderId.startsWith("legacy:")) && data.booking === first.booking && data.customer === first.customer : ids.length === 1
          : data.orderId === first.orderId;
      });
      if (!sameOrder) return errorResponse("请选择同一票订单", 400);
      const total = !legacy
        ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE json_extract(data, '$.orderId') = ?").bind(first.orderId).first<{ count: number }>()
        : first.booking
          ? await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE (json_extract(data, '$.orderId') IS NULL OR json_extract(data, '$.orderId') LIKE 'legacy:%') AND json_extract(data, '$.booking') = ? AND json_extract(data, '$.customer') = ?").bind(first.booking, first.customer || "").first<{ count: number }>()
          : { count: 1 };
      if (Number(total?.count) !== ids.length) return errorResponse("订单有新变化，请刷新后重试", 409);
      if (archive !== "restore" && selected.results.some(item => {
        const data = JSON.parse(item.data) as Record<string, string>;
        return !!data.completedAt || !!data.cancelledAt;
      })) return errorResponse("订单已归档，请刷新后重试", 409);
      if (archive === "restore" && selected.results.some(item => {
        const data = JSON.parse(item.data) as Record<string, string>;
        return data.completedAt !== first.completedAt || data.cancelledAt !== first.cancelledAt;
      })) return errorResponse("订单归档状态不一致，请刷新后重试", 409);
      const completedAt = archive === "complete" ? new Date().toISOString() : null;
      const cancelledAt = archive === "cancel" ? new Date().toISOString() : null;
      await db.batch(ids.map(id => db.prepare(
        "UPDATE deliveries SET data = " + (archive === "restore" ? "json_remove(data, '$.completedAt', '$.cancelledAt', '$.cancelReason')" :
          completedAt ? "json_set(json_remove(data, '$.cancelledAt', '$.cancelReason'), '$.completedAt', ?)" :
          "json_set(json_remove(data, '$.completedAt'), '$.cancelledAt', ?, '$.cancelReason', ?)") +
        ", updated_at = ? WHERE id = ? AND " + ownerPredicate
      ).bind(...(completedAt ? [completedAt] : cancelledAt ? [cancelledAt, reason] : []), Date.now(), id, ...orderAccessBindings(user))));
      return Response.json({ completedAt, cancelledAt, cancelReason: cancelledAt ? reason : null });
    }
    if (typeof body.id === "string" && typeof body.field === "string" && typeof body.value === "string") {
      if (!detailFields.includes(body.field)) return errorResponse("字段无效", 400);
      if (body.field === "exportWeight" && !validWeight(body.value)) return errorResponse("出口重量无效", 400);
      if (body.field === "vgm" && !["", "done"].includes(body.value)) return errorResponse("VGM状态无效", 400);
      const before = await db.prepare("SELECT data FROM deliveries WHERE id = ? AND " + ownerPredicate).bind(body.id, ...orderAccessBindings(user)).first<{ data: string }>();
      if (!before) return errorResponse("只能修改自己的订单", 403);
      const current = JSON.parse(before.data) as Record<string, string>;
      if (body.field === "gateIn" && body.value.trim() && current.vgm !== "done") return errorResponse("请先确认已完成 VGM，再填写进港时间", 400);
      if (body.field === "vgm" && !body.value && current.gateIn?.trim()) return errorResponse("货柜已有进港时间，不能取消 VGM", 400);
      const result = await db.prepare("UPDATE deliveries SET data = json_set(data, ?, ?), updated_at = ? WHERE id = ? AND " + ownerPredicate)
        .bind("$." + body.field, body.value, Date.now(), body.id, ...orderAccessBindings(user)).run();
      return result.meta.changes ? Response.json({ ok: true }) : errorResponse("只能修改自己的订单", 403);
    }
    if (Array.isArray(body.ids) && body.shared && typeof body.shared === "object" && !Array.isArray(body.shared)) {
      const ids = body.ids as unknown[];
      const shared = body.shared as Record<string, unknown>;
      if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== "string") || Object.keys(shared).some(key => !orderFields.includes(key) || typeof shared[key] !== "string")) return errorResponse("订单资料无效", 400);
      if (["booking", "groupNo"].some(key => shared[key] !== undefined && !(shared[key] as string).trim())) return errorResponse("订舱号和群号不能为空", 400);
      if (shared.priority !== undefined && shared.priority !== "" && shared.priority !== "urgent") return errorResponse("紧急标记无效", 400);
      if (shared.sortOrder !== undefined && shared.sortOrder !== "" && (!Number.isFinite(Number(shared.sortOrder)) || Math.abs(Number(shared.sortOrder)) > 8000000000000000)) return errorResponse("订单顺序无效", 400);
      if (shared.settlement !== undefined && !["", "月结", "票结"].includes(shared.settlement as string)) return errorResponse("结算方式无效", 400);
      if (shared.currency !== undefined && shared.currency !== "" && !/^[A-Z]{3}$/.test(shared.currency as string)) return errorResponse("币种无效", 400);
      if (shared.ownerName !== undefined && (!(shared.ownerName as string).trim() || (shared.ownerName as string).length > 80)) return errorResponse("负责人名称无效", 400);
      if (shared.transshipment !== undefined && !validTransshipment(shared.transshipment as string)) return errorResponse("转口资料无效", 400);
      if (shared.quantity !== undefined && shared.quantity !== String(ids.length)) return errorResponse("一级柜量必须等于二级货柜数", 400);
      const markers = ids.map(() => "?").join(",");
      const archiveGuard = Object.keys(shared).length === 1 && shared.priority !== undefined ? "" : "json_extract(data, '$.completedAt') IS NULL AND ";
      const count = await db.prepare("SELECT COUNT(*) AS count FROM deliveries WHERE id IN (" + markers + ") AND " + archiveGuard + "json_extract(data, '$.cancelledAt') IS NULL AND " + ownerPredicate)
        .bind(...ids, ...orderAccessBindings(user)).first<{ count: number }>();
      if (Number(count?.count) !== ids.length) return errorResponse("只能修改自己的订单", 403);
      const patch = JSON.stringify(shared);
      await db.batch(ids.map(id => db.prepare("UPDATE deliveries SET data = json_patch(data, ?), updated_at = ? WHERE id = ? AND " + archiveGuard + "json_extract(data, '$.cancelledAt') IS NULL AND " + ownerPredicate)
        .bind(patch, Date.now(), id, ...orderAccessBindings(user))));
      return Response.json({ ok: true });
    }
    return errorResponse("修改资料无效", 400);
  } catch (error) {
    console.error(error);
    return errorResponse("保存失败，请重试", 500);
  }
}

async function deleteDelivery(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("请先登录", 401);
  try {
    const { id } = await request.json() as { id?: string };
    if (!id) return errorResponse("记录编号无效", 400);
    const db = database();
    const source = await db.prepare("SELECT data FROM deliveries WHERE id = ? AND json_extract(data, '$.completedAt') IS NULL AND json_extract(data, '$.cancelledAt') IS NULL AND " + ownerPredicate)
      .bind(id, ...orderAccessBindings(user)).first<{ data: string }>();
    if (!source) return errorResponse("只能删除自己的订单", 403);
    const item = JSON.parse(source.data) as Record<string, string>;
    const remaining = item.orderId && !item.orderId.startsWith("legacy:")
      ? await db.prepare("SELECT id FROM deliveries WHERE json_extract(data, '$.orderId') = ? AND id != ? AND " + ownerPredicate).bind(item.orderId, id, ...orderAccessBindings(user)).all<{ id: string }>()
      : await db.prepare("SELECT id FROM deliveries WHERE (json_extract(data, '$.orderId') IS NULL OR json_extract(data, '$.orderId') = ?) AND json_extract(data, '$.booking') = ? AND json_extract(data, '$.customer') = ? AND id != ? AND " + ownerPredicate)
        .bind(item.orderId || "legacy:", item.booking || "", item.customer || "", id, ...orderAccessBindings(user)).all<{ id: string }>();
    const now = Date.now();
    await db.batch([
      db.prepare("DELETE FROM deliveries WHERE id = ? AND " + ownerPredicate).bind(id, ...orderAccessBindings(user)),
      ...remaining.results.map(row => db.prepare("UPDATE deliveries SET data = json_set(data, '$.quantity', ?), updated_at = ? WHERE id = ?").bind(String(remaining.results.length), now, row.id)),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return errorResponse("删除失败，请重试", 500);
  }
}

export async function POST(request: Request) {
  const response = await postDelivery(request);
  if (response.ok) try {
    const actor = await getChatGPTUser();
    const created = await response.clone().json() as { id?: string } | Array<{ id?: string }>;
    const ids = (Array.isArray(created) ? created : [created]).map(item => item.id).filter((id): id is string => !!id);
    if (actor && ids.length) await recordOrderAudit([], await auditSnapshot(ids), actor, "新增货柜／订单");
  } catch (error) { console.error("Unable to record order audit", error); }
  return response;
}
export async function PATCH(request: Request) {
  const payload = await request.clone().json() as Record<string, unknown>;
  const ids = idsFromMutation(payload);
  const before = await auditSnapshot(ids);
  const response = await patchDelivery(request);
  if (response.ok) try {
    const actor = await getChatGPTUser();
    if (actor && ids.length) await recordOrderAudit(before, await auditSnapshot(ids), actor, "修改订单");
  } catch (error) { console.error("Unable to record order audit", error); }
  return response;
}
export async function DELETE(request: Request) {
  const payload = await request.clone().json() as Record<string, unknown>;
  const ids = idsFromMutation(payload);
  const before = await auditSnapshot(ids);
  const response = await deleteDelivery(request);
  if (response.ok) try {
    const actor = await getChatGPTUser();
    if (actor && ids.length) await recordOrderAudit(before, [], actor, "删除货柜");
  } catch (error) { console.error("Unable to record order audit", error); }
  return response;
}
