import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Parameter = string | number | bigint | null | Uint8Array;
function normalize(value: unknown): Parameter {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value instanceof Uint8Array) return value;
  throw Error("Unsupported SQLite parameter");
}
type QueryResult<T> = { results: T[]; success: true };
type BoundStatement = {
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: true; meta: { changes: number; last_row_id: number | bigint } }>;
};

let instance: DatabaseSync | undefined;

function connection(): DatabaseSync {
  if (instance) return instance;
  const path = process.env.SQLITE_PATH || "/data/topasia.sqlite";
  if (process.env.RAILWAY_DEPLOYMENT_ID) {
    const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    if (!mount || !(path === mount || path.startsWith(mount.replace(/\/$/, "") + "/"))) {
      throw Error("Railway 未挂载保存资料的 Volume，或 SQLITE_PATH 不在 Volume 内。请在服务添加 /data Volume，并设置 SQLITE_PATH=/data/topasia.sqlite。");
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 10000 });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  const migrations = ["0000_bizarre_tusk.sql", "0001_fine_adam_destine.sql", "0002_overconfident_celestials.sql", "0003_boring_wraith.sql", "0004_bent_pandemic.sql", "0005_accounts.sql", "0006_account_approvals.sql", "0007_currency_settlement.sql", "0008_admin_sessions.sql"];
  for (const name of migrations) {
    if (db.prepare("SELECT 1 FROM __migrations WHERE name = ?").get(name)) continue;
    const sql = readFileSync(join(process.cwd(), "drizzle", name), "utf8").replaceAll("--> statement-breakpoint", "\n");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)").run(name, Date.now());
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  instance = db;
  return db;
}

function statement(sql: string, parameters: Parameter[] = []): BoundStatement & { bind(...values: unknown[]): BoundStatement } {
  const bound = (values: Parameter[]): BoundStatement => ({
    async all<T>() { return { results: connection().prepare(sql).all(...values) as T[], success: true }; },
    async first<T>() { return (connection().prepare(sql).get(...values) as T | undefined) ?? null; },
    async run() {
      const result = connection().prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: result.lastInsertRowid } };
    },
  });
  return { ...bound(parameters), bind: (...values: unknown[]) => bound(values.map(normalize)) };
}

export function database() {
  return {
    prepare(sql: string) { return statement(sql); },
    async batch(items: BoundStatement[]) {
      const db = connection();
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const item of items) results.push(await item.run());
        db.exec("COMMIT");
        return results;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}
