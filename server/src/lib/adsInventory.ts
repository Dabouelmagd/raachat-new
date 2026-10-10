import crypto from "node:crypto";
import type { Ctx } from "../context.js";
import { HttpError } from "./errors.js";

/** حالات الحملة اللي بتحجز مخزون (pending = حجز مؤقت لحد الموافقة) */
export const HOLD = ["pending", "approved", "paused"] as const;

/** أسعار افتراضية مبنية على سوق مصر: متوسط CPM لإعلانات ميتا ≈ ٢٫٩$ ≈ ١٥٠ ج.م لكل ألف ظهور (سعر صرف ~٥٢).
 *  البانر بسعر قريب من ١٥٠ ج.م/ألف، والنافذة الكاملة والستوري بعلاوة لأنهم أعلى انتباهًا. dailyImpressions تقدير لازم يتعدّل بالأرقام الفعلية. */
export const MARKET_CPM_EGP = 150;
export const DEFAULT_PLACEMENTS = [
  { key: "modal", name: "نافذة كاملة عند الدخول", kind: "modal", width: 1080, height: 1920, slots: 4, pricePerDay: "400", dailyImpressions: 1000, sort: 1, note: "شاشة كاملة 9:16، زر إغلاق متأخر" },
  { key: "banner", name: "بانر الدردشات", kind: "banner", width: 1200, height: 300, slots: 3, pricePerDay: "150", dailyImpressions: 1000, sort: 2, note: "أعلى قائمة الدردشات، يدور بين المعلنين" },
  { key: "services", name: "بانر الخدمات", kind: "banner", width: 1200, height: 300, slots: 3, pricePerDay: "120", dailyImpressions: 800, sort: 3, note: "أعلى شاشة الخدمات والمحفظة" },
  { key: "story", name: "إعلان بين الستوريز", kind: "story", width: 1080, height: 1920, slots: 2, pricePerDay: "250", dailyImpressions: 1000, sort: 4, note: "ستوري ممول بين القصص" },
] as const;

export const GIFT_MONTHS: Record<number, number> = { 1: 30, 3: 90, 6: 180, 12: 365 };
const GIFT_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newGiftCode() {
  const pick = (n: number) => Array.from({ length: n }, () => GIFT_ALPHA[crypto.randomInt(GIFT_ALPHA.length)]).join("");
  return `RA-${pick(4)}-${pick(4)}`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: string) => {
  if (!DAY.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
};
/** تاريخ النهارده بتوقيت القاهرة */
export const todayCairo = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
export const addDays = (s: string, n: number) => new Date(+new Date(s + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const dayCount = (from: string, to: string) => Math.round((+new Date(to + "T00:00:00Z") - +new Date(from + "T00:00:00Z")) / 864e5) + 1;

export const MAX_CAMPAIGN_DAYS = 366;

/** أول استخدام: لو مفيش مواضع، نزرع الافتراضية (الأسعار والسعات قابلة للتعديل من اللوحة) */
export async function ensureDefaultPlacements(ctx: Ctx) {
  if ((await ctx.db.adPlacement.count()) > 0) return;
  await ctx.db.adPlacement.createMany({ data: DEFAULT_PLACEMENTS.map((p) => ({ ...p })), skipDuplicates: true });
}

export interface Occupancy { held: number; booked: number; blocked: boolean }

/** الإشغال لكل (موضع، يوم) في الفترة. excludeCampaignId لتعديل حملة موجودة بدون ما تتعارض مع نفسها. */
export async function occupancy(ctx: Ctx, placementIds: string[], from: string, to: string, excludeCampaignId?: string) {
  const [bookings, blocks] = await Promise.all([
    ctx.db.adBooking.findMany({
      where: { placementId: { in: placementIds }, campaign: { status: { in: [...HOLD] }, startDate: { lte: to }, endDate: { gte: from }, ...(excludeCampaignId ? { id: { not: excludeCampaignId } } : {}) } },
      select: { placementId: true, campaign: { select: { id: true, status: true, startDate: true, endDate: true } } },
    }),
    ctx.db.adBlock.findMany({ where: { placementId: { in: placementIds }, fromDate: { lte: to }, toDate: { gte: from } } }),
  ]);
  const map = new Map<string, Occupancy>();
  const cell = (pid: string, day: string) => {
    const k = pid + "|" + day;
    let c = map.get(k);
    if (!c) { c = { held: 0, booked: 0, blocked: false }; map.set(k, c); }
    return c;
  };
  for (const b of bookings) {
    const a = b.campaign.startDate > from ? b.campaign.startDate : from, z = b.campaign.endDate < to ? b.campaign.endDate : to;
    for (const d of daysBetween(a, z)) { const c = cell(b.placementId, d); if (b.campaign.status === "pending") c.held++; else c.booked++; }
  }
  for (const b of blocks) {
    const a = b.fromDate > from ? b.fromDate : from, z = b.toDate < to ? b.toDate : to;
    for (const d of daysBetween(a, z)) cell(b.placementId, d).blocked = true;
  }
  return { get: (pid: string, day: string): Occupancy => map.get(pid + "|" + day) ?? { held: 0, booked: 0, blocked: false } };
}

export interface Conflict { key: string; name: string; day: string; reason: "inactive" | "blocked" | "full" }

/** يرجّع كل موضع فيه تعارض (أول يوم تعارض + سببه). فاضي = متاح. */
export async function findConflicts(ctx: Ctx, placements: { id: string; key: string; name: string; slots: number; active: boolean }[], from: string, to: string, excludeCampaignId?: string): Promise<Conflict[]> {
  const occ = await occupancy(ctx, placements.map((p) => p.id), from, to, excludeCampaignId);
  const out: Conflict[] = [];
  for (const p of placements) {
    for (const d of daysBetween(from, to)) {
      const o = occ.get(p.id, d);
      const reason = !p.active ? "inactive" : o.blocked ? "blocked" : o.held + o.booked >= p.slots ? "full" : null;
      if (reason) { out.push({ key: p.key, name: p.name, day: d, reason }); break; }
    }
  }
  return out;
}

const WHY = { inactive: "الموضع متوقف", blocked: "الموضع مقفول", full: "مفيش مكان فاضي" } as const;
export function conflictError(c: Conflict[]) {
  return new HttpError(409, "ad_unavailable", "مش متاح: " + c.map((x) => `${x.name} (${WHY[x.reason]} من ${x.day})`).join("، "));
}

/** حجز/تعديل ذري: lock واحد على الإعلانات عشان طلبين متزامنين ما يحجزوش نفس المكان */
export async function withAdsLock<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> {
  return ctx.db.$transaction(async (t) => {
    await t.$executeRaw`SELECT pg_advisory_xact_lock(7001)`;
    return fn();
  }, { timeout: 15000 });
}

export const priceOf = (ps: { pricePerDay: unknown }[], from: string, to: string) =>
  +(ps.reduce((a, p) => a + Number(p.pricePerDay), 0) * dayCount(from, to)).toFixed(2);
