import { database } from "@/db/raw";

export const legacyOwnerEmail = "limshehong96@gmail.com";
// A delegate has access only while the owner-granted interval is active.
export const orderAccessPredicate = `(json_extract(data, '$.ownerId') = ? OR (json_extract(data, '$.ownerId') IS NULL AND ? = ?) OR EXISTS (SELECT 1 FROM directory_options AS cover WHERE cover.kind = 'delegation' AND cover.name = json_extract(data, '$.ownerId') AND json_extract(cover.emails, '$.delegateId') = ? AND CAST(json_extract(cover.emails, '$.until') AS INTEGER) >= ?))`;
export const orderAccessBindings = (user: { userId: string; email: string }) => [user.userId, user.email.toLowerCase(), legacyOwnerEmail, user.userId, Date.now()];
export async function delegatedOwners(userId: string): Promise<Set<string>> {
  const found = await database().prepare("SELECT name FROM directory_options WHERE kind = 'delegation' AND json_extract(emails, '$.delegateId') = ? AND CAST(json_extract(emails, '$.until') AS INTEGER) >= ?").bind(userId, Date.now()).all<{ name: string }>();
  return new Set(found.results.map(row => row.name));
}
export const isOwnOrder = (data: Record<string, unknown>, user: { userId: string; email: string }) => data.ownerId === user.userId || (!data.ownerId && user.email.toLowerCase() === legacyOwnerEmail);
