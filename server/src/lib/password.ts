import crypto from "node:crypto";
import { bad } from "./errors.js";

/**
 * كلمات السر بـ scrypt من `node:crypto` — **بدون أي مكتبة جديدة** (مفيش تبعية
 * زيادة في صورة الإنتاج ولا تثبيت على السيرفر).
 *
 * الشكل المخزّن: `scrypt$<N>$<salt b64>$<hash b64>` — فيه الإعدادات جوّاه، فلو
 * زوّدنا التكلفة بعدين، كلمات السر القديمة تفضل تتحقّق صح.
 */
const N = 16384; // cost (2^14)
const KEYLEN = 64;
const MIN = 8;

const derive = (password: string, salt: Buffer, n: number) =>
  new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, KEYLEN, { N: n, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) => (e ? reject(e) : resolve(key))),
  );

/** بيرمي 400 لو كلمة السر قصيرة. الحد الأدنى ٨ حروف (مفيش حد أقصى غير حجم الطلب). */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN) throw bad("weak_password", `كلمة السر لازم تكون ${MIN} حروف على الأقل`);
  const salt = crypto.randomBytes(16);
  const key = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [kind, nStr, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !nStr || !saltB64 || !hashB64) return false;
  const n = Number(nStr);
  if (!Number.isInteger(n) || n < 1024) return false;
  const expected = Buffer.from(hashB64, "base64");
  const key = await derive(password, Buffer.from(saltB64, "base64"), n);
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/**
 * نفس تكلفة التحقّق لكن على قيمة وهمية. بنناديها لما الحساب مش موجود أو مالوش
 * كلمة سر، عشان زمن الرد مايفرّقش بين «الإيميل ده مش مسجّل» و«كلمة السر غلط» —
 * من غير كده الرد السريع بيبقى كشف للحسابات الموجودة.
 */
export async function wastePasswordTime(password: string): Promise<void> {
  await derive(password, Buffer.alloc(16), N).catch(() => undefined);
}
