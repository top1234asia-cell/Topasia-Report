import { accountId, hashPassword, verifyPassword } from "@/app/lib/account-password";
import { database } from "@/db/raw";

// Create the first administrator using a secret stored only in Railway Variables.
// Never overwrite an existing administrator password during deployment.
export async function ensureAdmin() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12) return false;
  const db = database();
  const existing = await db.prepare("SELECT id FROM accounts WHERE role = 'admin' LIMIT 1").first();
  if (existing) return true;
  const id = accountId("admin");
  const { hash, salt } = await hashPassword(password);
  const previousAdmin = await db.prepare("SELECT id, password_hash AS hash, password_salt AS salt FROM accounts WHERE id = ?").bind(id).first<{ id: string; hash: string; salt: string }>();
  if (previousAdmin) {
    if (!await verifyPassword(password, previousAdmin.salt, previousAdmin.hash)) throw Error("Existing admin account: set ADMIN_PASSWORD to this account's current password for first login");
    await db.prepare("UPDATE accounts SET role = 'admin', status = 'approved' WHERE id = ?").bind(id).run();
    return true;
  }
  const saved = await db.prepare("INSERT OR IGNORE INTO accounts (id, name, password_hash, password_salt, created_at, role, status) VALUES (?, 'admin', ?, ?, ?, 'admin', 'approved')").bind(id, hash, salt, Date.now()).run();
  return saved.meta.changes > 0;
}
