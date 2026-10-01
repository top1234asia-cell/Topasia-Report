import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { deliveryMonth } from "@/app/lib/haulier-stats";

const pageSize = 200;
const searchable = ["groupNo", "businessNo", "ticketBusinessNo", "booking", "container", "customer", "ownerName", "haulier", "customs", "reconciliationNo"];
const financeSteps = ["invoiceReceived", "invoiceChecked", "costEntered", "billCreated", "billSent", "paymentReceived", "telexReleased"] as const;
const containerSteps: readonly FinanceStep[] = ["invoiceReceived", "invoiceChecked"];
type FinanceStep = typeof financeSteps[number];
type StepRecord = { at: string; by: string };
type FinanceEntry = { id: string; data: Record<string, unknown>; updatedAt: number };
const businessKey = (entry: FinanceEntry) => {
  const data = entry.data;
  const businessNo = String(data.ticketId ? data.ticketBusinessNo || "" : data.businessNo || "").trim();
  return businessNo ? "number:" + businessNo.toLocaleUpperCase() : "unassigned:" + String(data.orderId || data.booking || entry.id);
};
const bulkSteps: FinanceStep[] = ["billCreated", "billSent", "paymentReceived", "telexReleased"];

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(10000, Math.trunc(Number(params.get("page")) || 1)));
    const exportAll = params.get("export") === "1";
    const query = (params.get("q") || "").trim().slice(0, 100);
    const status = params.get("status") || "all";
    if (!["all", "running", "completed", "cancelled"].includes(status)) return Response.json({ error: "状态无效" }, { status: 400 });
    const settlement = params.get("settlement") || "all";
    if (!["all", "月结", "票结", "unset"].includes(settlement)) return Response.json({ error: "结算方式无效" }, { status: 400 });
    const financeStatus = params.get("financeStatus") || "all";
    const board = params.get("board") || "running";
    if (!["running", "done"].includes(board)) return Response.json({ error: "财务分类无效" }, { status: 400 });
    const [selectedStep, selectedState] = financeStatus.split(":");
    if (!["all", "done", "pending"].includes(financeStatus) && (!financeSteps.includes(selectedStep as FinanceStep) || !["done", "pending"].includes(selectedState))) return Response.json({ error: "财务进度无效" }, { status: 400 });
    const requestedMonth = params.get("month") || "latest";
    if (requestedMonth !== "latest" && requestedMonth !== "all" && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(requestedMonth) && requestedMonth !== "undated") return Response.json({ error: "月份无效" }, { status: 400 });
    const db = database();
    const records = await db.prepare("SELECT id, data, created_at, updated_at FROM deliveries ORDER BY created_at DESC, id DESC").all<{ id: string; data: string; created_at: number; updated_at: number }>();
    type Entry = { id: string; createdAt: number; updatedAt: number; month: string; data: Record<string, unknown>; effectiveBusinessNo: string };
    const groups = new Map<string, Entry[]>();
    for (const record of records.results || []) {
      const data = JSON.parse(record.data) as Record<string, unknown>;
      const effectiveBusinessNo = String(data.ticketId ? data.ticketBusinessNo || "" : data.businessNo || "").trim();
      // Orders without a business number remain separate until their number is supplied.
      const key = effectiveBusinessNo ? "number:" + effectiveBusinessNo.toLocaleUpperCase() : "unassigned:" + String(data.orderId || data.booking || record.id);
      const entry: Entry = { id: record.id, createdAt: record.created_at, updatedAt: record.updated_at, data, effectiveBusinessNo, month: deliveryMonth({ deliveryTime: String(data.cutoff || "") }) || "undated" };
      groups.set(key, [...(groups.get(key) || []), entry]);
    }
    const prepared = [...groups].map(([key, entries]) => {
      // A business number belongs to one month even if its containers were delivered on different dates.
      const month = entries.map(entry => entry.month).filter(value => value !== "undated").sort()[0] || "undated";
      const newest = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      const progress = newest.data.financeProgress && typeof newest.data.financeProgress === "object" && !Array.isArray(newest.data.financeProgress) ? newest.data.financeProgress as Record<string, StepRecord> : {};
      const history = Array.isArray(newest.data.financeHistory) ? newest.data.financeHistory : [];
      const notes = newest.data.financeNotes && typeof newest.data.financeNotes === "object" && !Array.isArray(newest.data.financeNotes) ? newest.data.financeNotes : {};
      return { key, entries, month, progress, notes, history, newest };
    }).filter(group => {
      if (status !== "all" && !group.entries.some(entry => status === "cancelled" ? !!entry.data.cancelledAt : status === "completed" ? !!entry.data.completedAt && !entry.data.cancelledAt : !entry.data.completedAt && !entry.data.cancelledAt)) return false;
      return !query || group.entries.some(entry => searchable.some(field => String(entry.data[field] || "").toLowerCase().includes(query.toLowerCase())));
    }).sort((a, b) => b.newest.createdAt - a.newest.createdAt);
    const checked = (group: typeof prepared[number], step: FinanceStep) => containerSteps.includes(step)
      ? group.entries.every(entry => !!((entry.data.financeContainerProgress || entry.data.financeProgress || {}) as Record<string, StepRecord>)[step]?.at)
      : !!group.progress[step]?.at;
    const boardGroups = prepared.filter(group => financeSteps.every(step => checked(group, step)) === (board === "done"));
    const monthGroups = new Map<string, number>();
    for (const group of boardGroups) monthGroups.set(group.month, (monthGroups.get(group.month) || 0) + 1);
    const months = [...monthGroups].sort(([a], [b]) => a === "undated" ? 1 : b === "undated" ? -1 : b.localeCompare(a)).map(([month, count]) => ({ month, count }));
    const selectedMonth = requestedMonth === "latest" ? months[0]?.month || "undated" : requestedMonth;
    const inMonthAll = selectedMonth === "all" ? boardGroups : boardGroups.filter(group => group.month === selectedMonth);
    const settlementCounts = { monthly: inMonthAll.filter(group => group.newest.data.settlement === "月结").length, perTicket: inMonthAll.filter(group => group.newest.data.settlement === "票结").length, unset: inMonthAll.filter(group => !["月结", "票结"].includes(String(group.newest.data.settlement || ""))).length };
    const inMonth = inMonthAll.filter(group => settlement === "all" || (settlement === "unset" ? !["月结", "票结"].includes(String(group.newest.data.settlement || "")) : group.newest.data.settlement === settlement));
    // Counts refer to the selected month and search/status filters, independent of the selected finance card.
    const pendingCounts = Object.fromEntries(financeSteps.map(step => [step, inMonth.filter(group => !checked(group, step)).length])) as Record<FinanceStep, number>;
    const allPending = inMonth.filter(group => financeSteps.some(step => !checked(group, step))).length;
    const matching = inMonth.filter(group => financeStatus === "all" ? true : financeStatus === "pending" ? financeSteps.some(step => !checked(group, step)) : financeStatus === "done" ? financeSteps.every(step => checked(group, step)) : checked(group, selectedStep as FinanceStep) === (selectedState === "done"));
    const ordered = board === "done" ? [...matching].sort((a, b) => b.month.localeCompare(a.month) || b.newest.createdAt - a.newest.createdAt) : matching;
    const rows = (exportAll ? ordered : ordered.slice((page - 1) * pageSize, page * pageSize)).map(group => {
      const first = group.newest.data;
      const fields = ["orderId", "groupNo", "businessNo", "ticketBusinessNo", "customer", "booking", "carrier", "destination", "container", "size", "factory", "deliveryTime", "haulier", "customs", "ownerName", "currency", "settlement", "reconciliationNo", "cutoff", "completedAt", "cancelledAt"];
      const output: Record<string, string | number> = { id: group.newest.id, createdAt: group.newest.createdAt };
      for (const field of fields) output[field] = typeof first[field] === "string" ? first[field] as string : "";
      return { ...output, groupKey: group.key, financeMonth: group.month, reconciliationChecked: group.entries.every(entry => entry.data.reconciliationChecked === true), effectiveBusinessNo: group.newest.effectiveBusinessNo, containerCount: group.entries.length, containers: group.entries.map(entry => ({ id: entry.id, container: String(entry.data.container || ""), size: String(entry.data.size || ""), deliveryTime: String(entry.data.deliveryTime || ""), factory: String(entry.data.factory || ""), booking: String(entry.data.booking || ""), financeProgress: entry.data.financeContainerProgress || entry.data.financeProgress || {}, financeNotes: entry.data.financeContainerNotes || {}, financeHistory: entry.data.financeContainerHistory || [] })), financeProgress: group.progress, financeNotes: group.notes, financeHistory: group.history };
    });
    const numberCounts = new Map<string, number>();
    for (const entries of groups.values()) {
      const numbers = [...new Set(entries.map(entry => String(entry.data.reconciliationNo || "").trim()))];
      if (numbers.length !== 1 || !numbers[0] || !entries.every(entry => entry.data.reconciliationChecked === true)) continue;
      numberCounts.set(numbers[0], (numberCounts.get(numbers[0]) || 0) + 1);
    }
    const reconciliationNumbers = [...numberCounts].sort(([a], [b]) => a.localeCompare(b)).map(([number, count]) => ({ number, count }));
    return Response.json({ rows, total: matching.length, page, pageSize, months, selectedMonth, pendingCounts, allPending, settlementCounts, reconciliationNumbers });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "财务业务暂时无法读取" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as { id?: unknown; step?: unknown; done?: unknown; note?: unknown; reconcile?: { checked?: unknown; number?: unknown }; bulk?: { type?: unknown; ids?: unknown; number?: unknown; month?: unknown; steps?: unknown } };
    if (body.bulk) {
      const bulk = body.bulk;
      if (typeof bulk.number !== "string" || !bulk.number.trim() || bulk.number.trim().length > 100 || !["reconcile", "steps"].includes(String(bulk.type))) return Response.json({ error: "请输入有效的对账号码" }, { status: 400 });
      const number = bulk.number.trim();
      const db = database();
      const records = await db.prepare("SELECT id, data, updated_at FROM deliveries ORDER BY updated_at DESC").all<{ id: string; data: string; updated_at: number }>();
      const groups = new Map<string, FinanceEntry[]>();
      const byId = new Map<string, string>();
      for (const record of records.results || []) {
        const entry = { id: record.id, data: JSON.parse(record.data) as Record<string, unknown>, updatedAt: record.updated_at };
        const key = businessKey(entry);
        groups.set(key, [...(groups.get(key) || []), entry]);
        byId.set(entry.id, key);
      }
      if (bulk.type === "reconcile") {
        if (!Array.isArray(bulk.ids) || !bulk.ids.length || bulk.ids.length > 200 || bulk.ids.some(id => typeof id !== "string" || !byId.has(id))) return Response.json({ error: "所选业务有变化，请刷新后重试" }, { status: 409 });
        const keys = [...new Set((bulk.ids as string[]).map(id => byId.get(id)!))];
        const entries = keys.flatMap(key => groups.get(key) || []);
        if (entries.some(entry => entry.data.reconciliationChecked === true)) return Response.json({ error: "所选业务中已有完成对账的业务；每个业务只能对账一次，请取消选择后重试" }, { status: 409 });
        if (entries.length > 1000) return Response.json({ error: "一次最多处理1000柜，请分批对账" }, { status: 400 });
        const now = Date.now(), at = new Date(now).toISOString();
        await db.batch(entries.map(entry => db.prepare("UPDATE deliveries SET data = json_set(data, '$.reconciliationChecked', json('true'), '$.reconciliationNo', ?, '$.reconciledAt', ?, '$.reconciledBy', ?), updated_at = ? WHERE id = ?").bind(number, at, user.displayName, now, entry.id)));
        return Response.json({ ok: true, groups: keys.length, containers: entries.length, number });
      }
      if (typeof bulk.month !== "string" || bulk.month !== "all" && bulk.month !== "undated" && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(bulk.month) || !Array.isArray(bulk.steps) || !bulk.steps.length || bulk.steps.length > bulkSteps.length || bulk.steps.some(step => !bulkSteps.includes(step as FinanceStep))) return Response.json({ error: "请选择月份和要完成的财务项目" }, { status: 400 });
      const steps = [...new Set(bulk.steps as FinanceStep[])];
      const selected = [...groups.values()].filter(entries => {
        const entryMonth = entries.map(entry => deliveryMonth({ deliveryTime: String(entry.data.cutoff || "") }) || "undated").filter(month => month !== "undated").sort()[0] || "undated";
        return (bulk.month === "all" || entryMonth === bulk.month) && entries.every(entry => entry.data.reconciliationChecked === true && String(entry.data.reconciliationNo || "").trim() === number);
      });
      if (!selected.length) return Response.json({ error: "该月份没有这个号码下已对账的业务" }, { status: 404 });
      const entries = selected.flat();
      if (entries.length > 1000) return Response.json({ error: "一次最多处理1000柜，请缩小月份范围" }, { status: 400 });
      const now = Date.now(), at = new Date(now).toISOString();
      await db.batch(selected.flatMap(group => {
        const newest = [...group].sort((a, b) => b.updatedAt - a.updatedAt)[0].data;
        const progress = { ...(newest.financeProgress && typeof newest.financeProgress === "object" && !Array.isArray(newest.financeProgress) ? newest.financeProgress as Record<string, StepRecord> : {}) };
        const changed = steps.filter(step => !progress[step]?.at);
        for (const step of changed) progress[step] = { at, by: user.displayName || user.email };
        const history = [...(Array.isArray(newest.financeHistory) ? newest.financeHistory as unknown[] : []).slice(-Math.max(0, 100 - changed.length)), ...changed.map(step => ({ step, done: true, action: "status", at, by: user.displayName || user.email }))];
        return group.map(entry => db.prepare("UPDATE deliveries SET data = json_set(data, '$.financeProgress', json(?), '$.financeHistory', json(?)), updated_at = ? WHERE id = ?").bind(JSON.stringify(progress), JSON.stringify(history), now, entry.id));
      }));
      return Response.json({ ok: true, groups: selected.length, containers: entries.length, number, steps });
    }
    if (body.reconcile) {
      if (typeof body.id !== "string" || !body.id || typeof body.reconcile.checked !== "boolean" || typeof body.reconcile.number !== "string" || body.reconcile.number.trim().length > 100 || (body.reconcile.checked && !body.reconcile.number.trim())) return Response.json({ error: "勾选对账前请填写对账号码（最多100字）" }, { status: 400 });
      const db = database();
      const selected = await db.prepare("SELECT data FROM deliveries WHERE id = ?").bind(body.id).first<{ data: string }>();
      if (!selected) return Response.json({ error: "业务不存在" }, { status: 404 });
      const source = JSON.parse(selected.data) as Record<string, unknown>;
      const businessNo = String(source.ticketId ? source.ticketBusinessNo || "" : source.businessNo || "").trim();
      const related = businessNo
        ? await db.prepare("SELECT id, data FROM deliveries WHERE upper(trim(CASE WHEN nullif(json_extract(data, '$.ticketId'), '') IS NOT NULL THEN coalesce(json_extract(data, '$.ticketBusinessNo'), '') ELSE coalesce(json_extract(data, '$.businessNo'), '') END)) = ?").bind(businessNo.toUpperCase()).all<{ id: string; data: string }>()
        : source.orderId && !String(source.orderId).startsWith("legacy:")
          ? await db.prepare("SELECT id, data FROM deliveries WHERE json_extract(data, '$.orderId') = ? AND coalesce(json_extract(data, '$.businessNo'), '') = ''").bind(source.orderId).all<{ id: string; data: string }>()
          : { results: [{ id: body.id, data: selected.data }] };
      if (!related.results.length || related.results.length > 100) return Response.json({ error: "该业务资料有变化，请刷新" }, { status: 409 });
      if (body.reconcile.checked && related.results.some(item => (JSON.parse(item.data) as Record<string, unknown>).reconciliationChecked === true)) return Response.json({ error: "该业务已完成对账，请先取消原对账" }, { status: 409 });
      const checked = body.reconcile.checked, number = body.reconcile.number.trim(), at = checked ? new Date().toISOString() : "";
      await db.batch(related.results.map(item => db.prepare("UPDATE deliveries SET data = json_set(data, '$.reconciliationChecked', json(?), '$.reconciliationNo', ?, '$.reconciledAt', ?, '$.reconciledBy', ?), updated_at = ? WHERE id = ?").bind(checked ? "true" : "false", number, at, checked ? user.displayName : "", Date.now(), item.id)));
      return Response.json({ ok: true, checked, number });
    }
    if (typeof body.id !== "string" || !body.id || !financeSteps.includes(body.step as FinanceStep) || (typeof body.done !== "boolean" && typeof body.note !== "string") || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 1000)))
      return Response.json({ error: "财务处理资料无效" }, { status: 400 });
    const db = database();
    const selected = await db.prepare("SELECT data FROM deliveries WHERE id = ?").bind(body.id).first<{ data: string }>();
    if (!selected) return Response.json({ error: "货柜不存在，请刷新后重试" }, { status: 404 });
    const row = JSON.parse(selected.data) as Record<string, unknown>;
    const effectiveBusinessNo = String(row.ticketId ? row.ticketBusinessNo || "" : row.businessNo || "").trim();
    const orderId = String(row.orderId || "");
    const booking = String(row.booking || "");
    const customer = String(row.customer || "");
    const step = body.step as FinanceStep;
    const perContainer = containerSteps.includes(step);
    const related = perContainer ? { results: [{ id: body.id, data: selected.data, updated_at: 0 }] } : effectiveBusinessNo
      ? await db.prepare("SELECT id, data, updated_at FROM deliveries WHERE upper(trim(CASE WHEN nullif(json_extract(data, '$.ticketId'), '') IS NOT NULL THEN coalesce(json_extract(data, '$.ticketBusinessNo'), '') ELSE coalesce(json_extract(data, '$.businessNo'), '') END)) = ?").bind(effectiveBusinessNo.toUpperCase()).all<{ id: string; data: string; updated_at: number }>()
      : orderId && !orderId.startsWith("legacy:")
        ? await db.prepare("SELECT id, data, updated_at FROM deliveries WHERE json_extract(data, '$.orderId') = ? AND coalesce(json_extract(data, '$.businessNo'), '') = ''").bind(orderId).all<{ id: string; data: string; updated_at: number }>()
        : booking
          ? await db.prepare("SELECT id, data, updated_at FROM deliveries WHERE (json_extract(data, '$.orderId') IS NULL OR json_extract(data, '$.orderId') LIKE 'legacy:%') AND json_extract(data, '$.booking') = ? AND coalesce(json_extract(data, '$.customer'), '') = ? AND coalesce(json_extract(data, '$.businessNo'), '') = ''").bind(booking, customer).all<{ id: string; data: string; updated_at: number }>()
          : { results: [{ id: body.id, data: selected.data, updated_at: 0 }] };
    if (!related.results.length || related.results.length > 100) return Response.json({ error: "订单货柜数量异常，请刷新后重试" }, { status: 409 });
    const current = JSON.parse([...related.results].sort((a, b) => b.updated_at - a.updated_at)[0].data) as Record<string, unknown>;
    const progressKey = perContainer ? "financeContainerProgress" : "financeProgress";
    const noteKey = perContainer ? "financeContainerNotes" : "financeNotes";
    const historyKey = perContainer ? "financeContainerHistory" : "financeHistory";
    const existingProgress = perContainer ? current.financeContainerProgress || current.financeProgress : current.financeProgress;
    const progress = { ...(existingProgress && typeof existingProgress === "object" && !Array.isArray(existingProgress) ? existingProgress as Record<string, StepRecord> : {}) };
    const notes = { ...(current[noteKey] && typeof current[noteKey] === "object" && !Array.isArray(current[noteKey]) ? current[noteKey] as Record<string, string> : {}) };
    if (typeof body.done === "boolean" && !!progress[step] === body.done) return Response.json({ error: "该步骤已由其他人更新，请刷新后重试" }, { status: 409 });
    if (typeof body.done === "boolean") {
      if (body.done) progress[step] = { at: new Date().toISOString(), by: user.displayName || user.email };
      else delete progress[step];
    }
    if (typeof body.note === "string") notes[step] = body.note.trim();
    const history = [...(Array.isArray(current[historyKey]) ? current[historyKey] as unknown[] : []).slice(-99), { step, done: !!progress[step], note: typeof body.note === "string" ? notes[step] : undefined, action: typeof body.note === "string" ? "note" : "status", at: new Date().toISOString(), by: user.displayName || user.email }];
    const now = Date.now();
    await db.batch(related.results.map(item => db.prepare(`UPDATE deliveries SET data = json_set(data, '$.${progressKey}', json(?), '$.${noteKey}', json(?), '$.${historyKey}', json(?)), updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(progress), JSON.stringify(notes), JSON.stringify(history), now, item.id)));
    return Response.json({ progress, notes, history, ids: related.results.map(item => item.id), perContainer });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "财务进度保存失败，请重试" }, { status: 500 });
  }
}
