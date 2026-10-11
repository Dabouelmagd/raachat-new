import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError, bad, wrap } from "../lib/errors.js";
import { ADULT_AGE, FULL_CAPACITY_AGE, YOUNG_LIMITS, isAdult, walletLimits } from "../lib/age.js";

/** الطلب بعد ما الحارس يحسب سقوف السن مرة واحدة (بدل استعلام في كل مسار) */
type WalletRequest = AuthedRequest & { rcLimits?: typeof YOUNG_LIMITS | null };

const MAX_FAILS = 5;
const LOCK_MIN = 15;
const SERVICES = ["insurance", "elec", "water", "gas", "net", "landline", "mobile", "topup", "tv", "other"] as const;

const hashPin = (pin: string) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString("hex")}:${crypto.scryptSync(pin, salt, 32).toString("hex")}`;
};
const checkPin = (pin: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  const h = crypto.scryptSync(pin, Buffer.from(salt, "hex"), 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, "hex"));
};
const money = (n: unknown) => Number(n);
const Pin = z.string().regex(/^\d{4}$/, "الرقم السري 4 أرقام");

export function walletRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  const db = ctx.db;

  /**
   * المحفظة خدمة ١٨+: التعاقدات المالية مع القاصر مشكلة قانونية.
   * الحارس على السيرفر عشان ميتلفّش من الواجهة، ومحدود بمسارات /wallet بس
   * (الراوتر ده متركّب على الجذر، فـ r.use من غير مسار كان بيقفل باقي التطبيق).
   * تاريخ ميلاد غير محدد = مقفول (الأحوط)، والرسالة بتفرّق بين الحالتين.
   */
  r.use("/wallet", wrap(async (req, _res, next) => {
    const u = await db.user.findUnique({ where: { id: (req as AuthedRequest).userId }, select: { birthDate: true } });
    if (!u?.birthDate) throw new HttpError(403, "birth_date_required", "حدّد تاريخ ميلادك من الملف الشخصي عشان تستخدم المحفظة");
    if (!isAdult(u.birthDate)) throw new HttpError(403, "age_restricted", `المحفظة ودفع الفواتير متاحين من سن ${ADULT_AGE} سنة`);
    (req as WalletRequest).rcLimits = walletLimits(u.birthDate); // null = ٢١+ بلا سقوف
    next();
  }));

  /** سقوف الفئة ١٨–٢١ (مادة ١١١ مدني: تصرفاتها المالية قابلة للإبطال، فنقلّل حجم التعرّض) */
  const limitsOf = (req: unknown) => (req as WalletRequest).rcLimits ?? null;
  const capTx = (req: unknown, amount: number) => {
    const L = limitsOf(req);
    if (L && amount > L.tx) {
      throw new HttpError(403, "young_tx_limit", `أقصى مبلغ للعملية ${L.tx} جنيه لحد سن ${FULL_CAPACITY_AGE} سنة`);
    }
  };
  /** مجموع الفواتير في الشهر الميلادي الحالي (بالتوقيت العالمي) */
  async function billsThisMonth(userId: string) {
    const n = new Date();
    const from = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
    const agg = await db.walletTx.aggregate({ _sum: { amount: true }, where: { userId, kind: "bill", createdAt: { gte: from } } });
    return money(agg._sum.amount ?? 0);
  }

  async function ensureWallet(userId: string) {
    return db.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
  }
  const txView = (t: { id: string; kind: string; service: string | null; amount: unknown; discount: unknown; ref: string; createdAt: Date }) => ({
    id: t.id, kind: t.kind, service: t.service, amount: money(t.amount), discount: money(t.discount), ref: t.ref, at: t.createdAt.toISOString(),
  });

  /** الخصم يتحسب على السيرفر دايمًا (العميل مش مصدر الحقيقة) */
  async function discountFor(code: string | undefined, service: string, amount: number) {
    if (!code) return { discount: 0, code: undefined as string | undefined };
    const o = await db.offer.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!o || !o.active) throw bad("invalid_code", "كود غير صحيح");
    if (o.service && !o.service.split(",").includes(service)) throw bad("code_not_applicable", "الكود ده مش لنفس الخدمة");
    const d = Math.min(+(amount * o.percent / 100).toFixed(2), money(o.maxOff));
    return { discount: d, code: o.code };
  }

  r.get("/wallet", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const w = await ensureWallet(me);
    const txs = await db.walletTx.findMany({ where: { userId: me }, orderBy: { createdAt: "desc" }, take: 50 });
    const L = limitsOf(req);
    res.json({
      balance: money(w.balance), currency: w.currency, hasPin: !!w.pinHash, txns: txs.map(txView),
      // الواجهة بتعرض السقوف للمستخدم؛ null = مفيش سقوف
      limits: L ? { ...L, monthUsed: await billsThisMonth(me) } : null,
    });
  }));

  r.get("/wallet/offers", wrap(async (_req, res) => {
    const l = await db.offer.findMany({ where: { active: true } });
    res.json(l.map((o) => ({ code: o.code, service: o.service, percent: o.percent, max: money(o.maxOff) })));
  }));

  r.put("/wallet/pin", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ pin: Pin, currentPin: Pin.optional() }).parse(req.body);
    const w = await ensureWallet(me);
    if (w.pinHash) {
      if (!b.currentPin || !checkPin(b.currentPin, w.pinHash)) throw new HttpError(403, "bad_pin", "الرقم السري الحالي غير صحيح");
    }
    await db.wallet.update({ where: { userId: me }, data: { pinHash: hashPin(b.pin), pinFails: 0, pinLockedUntil: null } });
    res.status(204).end();
  }));

  // شحن المحفظة: في production لازم بوابة دفع حقيقية (لسه مش متوصّلة) — في التطوير رصيد تجريبي
  r.post("/wallet/topup", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    if (ctx.config.NODE_ENV === "production") throw new HttpError(501, "no_gateway", "شحن المحفظة محتاج بوابة دفع (غير متوصّلة بعد)");
    const b = z.object({ amount: z.number().positive().max(10000) }).parse(req.body);
    capTx(req, b.amount);
    const w0 = await ensureWallet(me);
    const L = limitsOf(req);
    if (L && money(w0.balance) + b.amount > L.balance) {
      throw new HttpError(403, "young_balance_limit", `أقصى رصيد في المحفظة ${L.balance} جنيه لحد سن ${FULL_CAPACITY_AGE} سنة`);
    }
    const [, tx] = await db.$transaction([
      db.wallet.update({ where: { userId: me }, data: { balance: { increment: b.amount.toFixed(2) } } }),
      db.walletTx.create({ data: { userId: me, kind: "topup", amount: b.amount.toFixed(2), ref: "RC-" + crypto.randomInt(100000, 999999) + crypto.randomInt(10, 99) } }),
    ]);
    res.status(201).json(txView(tx));
  }));

  r.post("/wallet/quote", wrap(async (req, res) => {
    const b = z.object({ service: z.enum(SERVICES), amount: z.number().positive().max(100000), code: z.string().max(20).optional() }).parse(req.body);
    const { discount } = await discountFor(b.code, b.service, b.amount);
    res.json({ amount: b.amount, discount, total: +(b.amount - discount).toFixed(2) });
  }));

  r.post("/wallet/pay", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({
      service: z.enum(SERVICES), account: z.string().min(3).max(40), amount: z.number().positive().max(100000),
      code: z.string().max(20).optional(), pin: Pin, idempotencyKey: z.string().min(8).max(64),
    }).parse(req.body);

    // إعادة نفس الطلب (ضغطة مزدوجة / إعادة محاولة) ترجّع نفس العملية بدون خصم تاني
    const dup = await db.walletTx.findUnique({ where: { userId_idemKey: { userId: me, idemKey: b.idempotencyKey } } });
    if (dup) { const w = await ensureWallet(me); res.json({ ...txView(dup), balance: money(w.balance) }); return; }

    const w = await ensureWallet(me);
    if (!w.pinHash) throw new HttpError(403, "no_pin", "اضبط الرقم السري الأول");
    if (w.pinLockedUntil && w.pinLockedUntil > new Date()) throw new HttpError(429, "pin_locked", "الرقم السري مقفول مؤقتًا، حاول بعد شوية");
    if (!checkPin(b.pin, w.pinHash)) {
      const fails = w.pinFails + 1;
      await db.wallet.update({ where: { userId: me }, data: fails >= MAX_FAILS ? { pinFails: 0, pinLockedUntil: new Date(Date.now() + LOCK_MIN * 60_000) } : { pinFails: fails } });
      throw new HttpError(403, "bad_pin", "الرقم السري غير صحيح");
    }
    const { discount, code } = await discountFor(b.code, b.service, b.amount);
    const total = +(b.amount - discount).toFixed(2);

    // سقوف ١٨–٢١: على المبلغ المدفوع فعلًا (بعد الخصم) وعلى مجموع الشهر
    capTx(req, total);
    const L = limitsOf(req);
    if (L) {
      const used = await billsThisMonth(me);
      if (used + total > L.month) {
        throw new HttpError(403, "young_month_limit", `أقصى فواتير في الشهر ${L.month} جنيه لحد سن ${FULL_CAPACITY_AGE} سنة (المستخدم: ${used})`);
      }
    }

    try {
      const tx = await db.$transaction(async (t) => {
        // خصم ذري: ينجح بس لو الرصيد كافي (مفيش سباق بين طلبين)
        const upd = await t.$executeRaw`UPDATE "Wallet" SET "balance" = "balance" - ${total}, "pinFails" = 0 WHERE "userId" = ${me} AND "balance" >= ${total}`;
        if (upd === 0) throw new HttpError(402, "insufficient", "الرصيد غير كافي");
        return t.walletTx.create({ data: { userId: me, kind: "bill", service: b.service, amount: total.toFixed(2), discount: discount.toFixed(2), ref: "RC-" + crypto.randomInt(100000, 999999) + crypto.randomInt(10, 99), idemKey: b.idempotencyKey } });
      });
      const nw = await ensureWallet(me);
      res.status(201).json({ ...txView(tx), balance: money(nw.balance), code });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") { // سباق على نفس المفتاح
        const d = await db.walletTx.findUnique({ where: { userId_idemKey: { userId: me, idemKey: b.idempotencyKey } } });
        if (d) { const nw = await ensureWallet(me); res.json({ ...txView(d), balance: money(nw.balance) }); return; }
      }
      throw e;
    }
  }));

  return r;
}
