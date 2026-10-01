import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export function accountId(name: string) { return "railway:" + name.trim().toLocaleLowerCase(); }
export function validName(name: string) { return name.length >= 2 && name.length <= 80 && /^[\p{L}\p{N} ._-]+$/u.test(name); }
export function validPassword(password: string) { return password.length >= 12 && password.length <= 128; }
export function equalSecret(input: string, expected: string) {
  const a = Buffer.from(input), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { salt, hash: hash.toString("hex") };
}
export async function verifyPassword(password: string, salt: string, hash: string) {
  const derived = await hashPassword(password, salt);
  const a = Buffer.from(derived.hash, "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
