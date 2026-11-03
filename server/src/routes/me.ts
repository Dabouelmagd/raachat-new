import { Router } from "express";
import { assertClean } from "../lib/contentFilter.js";
import { z } from "zod";
import { consumeOtp, normalizeTarget, requestOtp, requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError, bad, notFound, wrap } from "../lib/errors.js";
import { meUser, publicUser } from "../serialize.js";
import { assertProfileBirthDate } from "../lib/age.js";
import { eraseUser } from "../lib/eraseUser.js";

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export function meRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  r.get("/me", wrap(async (req, res) => {
    const u = await ctx.db.user.findUnique({ where: { id: (req as AuthedRequest).userId } });
    if (!u) throw notFound();
    res.json(meUser(u));
  }));
  r.patch("/me", wrap(async (req, res) => {
    const b = z.object({
      name: z.string().trim().min(1).max(60).optional(),
      status: z.string().max(60).optional(),
      color: Color.optional(),
      photoUrl: z.string().max(500).nullable().optional(),
      lang: z.enum(["ar", "en", "zh", "fr"]).optional(),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(req.body);
    assertClean(ctx, b.name, b.status);
    const { birthDate, ...rest } = b;
    const data: Record<string, unknown> = { ...rest };
    const me = (req as AuthedRequest).userId;
    if (birthDate !== undefined) {
      // 🔴 كان `validBirthDate` وحده — فكل تاريخ صالح يُحفَظ، بما فيه تاريخ أقلّ من ١٨.
      // الحارس الآن يرفض الأقلّ من ١٨ ولا يحذف شيئًا (قرار داليا ٢٦ أكتوبر ٢٠٢٦)،
      // والقاعدة من **نفس مصدر** حارس إنشاء الحساب في `lib/age.ts`.
      //
      // 🔴 والرفض على **التغيير** لا على القيمة المرسلة: الواجهة تحمّل التاريخ المخزَّن
      // في الحقل وترسله مع كل حفظ، فلو رفضنا القيمة كما هي لصار صاحب صفٍّ مخزَّن دون
      // ١٨ (من استرجاع نسخة أو تعديل مباشر في القاعدة — المصدر الواقعي الوحيد له)
      // **عاجزًا عن تعديل اسمه أو صورته** إلى الأبد، وهو حجزٌ لم تطلبه داليا:
      // القرار كان «ارفض تاريخًا أقلّ من ١٨ **بدون حذف**»، لا «اقفل الحساب».
      const cur = await ctx.db.user.findUnique({ where: { id: me }, select: { birthDate: true } });
      const same = !!cur?.birthDate && cur.birthDate.toISOString().slice(0, 10) === birthDate;
      if (!same) data.birthDate = assertProfileBirthDate(birthDate);
    }
    const u = await ctx.db.user.update({ where: { id: me }, data });
    res.json(meUser(u));
  }));
  // بحث في المستخدمين (لبدء دردشة/إضافة أعضاء)
  r.get("/users", wrap(async (req, res) => {
    const q = z.string().trim().max(100).default("").parse(req.query.q ?? "");
    const me = (req as AuthedRequest).userId;
    const users = await ctx.db.user.findMany({
      where: {
        id: { not: me }, modStatus: { not: "deleted" },
        // البحث بالرقم على **المتحقَّق بس** — نفس سبب المطابقة في `contacts.ts`:
        // رقم مكتوب بالإيد مايخلّيش صاحبه يتلاقى بالرقم ده.
        ...(q
          ? { OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { AND: [{ phone: { contains: q } }, { phoneVerifiedAt: { not: null } }] },
              { email: { contains: q.toLowerCase() } },
            ] }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    res.json(users.map(publicUser));
  }));

  /** حق الاطلاع والحصول على نسخة (قانون حماية البيانات الشخصية ١٥١/٢٠٢٠): كل بيانات المستخدم بصيغة JSON */
  r.get("/me/export", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const db = ctx.db;
    const u = await db.user.findUnique({ where: { id: me } });
    if (!u) throw notFound();
    const [sessions, messages, stories, calls, wallet, txs, reports, blocks, pushSubs, memberships, adEvents] = await Promise.all([
      db.session.findMany({ where: { userId: me }, select: { device: true, createdAt: true, lastUsed: true, revokedAt: true } }),
      db.message.findMany({ where: { authorId: me }, orderBy: { createdAt: "asc" }, take: 50000, select: { id: true, threadId: true, text: true, edited: true, deleted: true, createdAt: true, attachment: { select: { name: true, size: true, mime: true, url: true } } } }),
      db.story.findMany({ where: { authorId: me }, select: { id: true, caption: true, imageUrl: true, createdAt: true, expiresAt: true } }),
      db.callLog.findMany({ where: { userId: me }, orderBy: { at: "asc" }, select: { threadId: true, mode: true, dir: true, at: true, dur: true } }),
      db.wallet.findUnique({ where: { userId: me }, select: { balance: true, currency: true } }),
      db.walletTx.findMany({ where: { userId: me }, orderBy: { createdAt: "asc" }, select: { kind: true, service: true, amount: true, discount: true, ref: true, refundedAt: true, createdAt: true } }),
      db.report.findMany({ where: { reporterId: me }, select: { kind: true, reason: true, note: true, status: true, createdAt: true } }),
      db.block.findMany({ where: { blockerId: me }, select: { blockedId: true, createdAt: true } }),
      db.pushSub.count({ where: { userId: me } }),
      db.membership.findMany({ where: { userId: me }, select: { threadId: true, role: true, joinedAt: true } }),
      db.adEvent.findMany({ where: { userId: me }, select: { adKey: true, kind: true, createdAt: true } }),
    ]);
    res.setHeader("Content-Disposition", 'attachment; filename="rachat-my-data.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      notice: "نسخة من بياناتك الشخصية لدى رع شات بناءً على طلبك (قانون حماية البيانات الشخصية رقم 151 لسنة 2020).",
      profile: { id: u.id, name: u.name, phone: u.phone, email: u.email, status: u.status, color: u.color, photoUrl: u.photoUrl, lang: u.lang, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt },
      sessions, memberships, messages, stories, calls,
      wallet: wallet ? { balance: Number(wallet.balance), currency: wallet.currency } : null,
      walletTransactions: txs.map((t) => ({ ...t, amount: Number(t.amount), discount: Number(t.discount) })),
      reportsFiled: reports, blockedUsers: blocks, pushSubscriptions: pushSubs, adEvents,
    });
  }));

  /* ---------- حذف الحساب (في أي وقت) ----------
     1) POST /me/delete/otp  → كود تأكيد على رقم/إيميل الحساب نفسه
     2) DELETE /me {code, forfeitBalance?} → إخفاء هوية نهائي. الرصيد لو موجود لازم يتأكد التنازل عنه صراحة. */
  // 🔴 **الإيميل الأول مش الرقم.** الكود بقى بيتوصّل على الإيميل دايمًا (الـSMS
  // موقوف)، فلو فضلنا نرجّع `channel: "phone"` و`hint` برقم الموبايل كنا بنقول
  // للمستخدم «بعتنا الكود على 012•••••11» والكود رايح لإيميله — كلام غلط على
  // الشاشة. والرقم فاضل كبديل أخير عشان الحساب اللي مالوش إيميل يتكشف صريح تحت.
  const contactOf = (u: { phone: string | null; email: string | null }) => (u.email ? ({ channel: "email", target: u.email } as const) : u.phone ? ({ channel: "phone", target: u.phone } as const) : null);
  /** الحساب اللي مالوش إيميل مفيش مكان نبعت له الكود — **خطأ صريح مش نجاح ساكت**. */
  const needEmail = (u: { email: string | null }) => {
    if (!u.email) {
      throw new HttpError(409, "email_required",
        "الحساب ده مالوش إيميل، والكود بيتوصّل على الإيميل. أضِف إيميلك من شاشة الحساب الأول.");
    }
  };
  const mask = (t: string) => (t.includes("@") ? t.replace(/^(.).*(@.*)$/, "$1•••$2") : t.slice(0, 3) + "•••••" + t.slice(-2));

  /**
   * ربط رقم موبايل بالحساب — **اسم بديل للدخول وبس**.
   *
   * الرقم مابيتأكّدش بـSMS (موقوف)، فبيتخزّن `phoneVerifiedAt = NULL` ومابيدخلش
   * مطابقة جهات الاتصال ولا البحث (شوفي `contacts.ts`). واللي بيحمي الخطوة دي هو
   * **كود على إيميل الحساب**: إضافة اسم دخول جديد إجراء حسّاس، فجلسة مسروقة
   * مايكفيهاش إنها جلسة — لازم توصل للإيميل كمان. نفس نمط حذف الحساب تحت.
   *
   * الخطوة الأولى من الواجهة: `POST /auth/otp/request {channel:"email", target:<إيميلك>}`.
   */
  r.post("/me/phone", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ phone: z.string().min(6).max(32), code: z.string().min(4).max(10) }).parse(req.body ?? {});
    const u = await ctx.db.user.findUnique({ where: { id: me }, select: { email: true } });
    if (!u) throw notFound();
    needEmail(u);
    const phone = normalizeTarget("phone", b.phone);
    if (!/^(\+?\d{8,15})$/.test(phone)) throw bad("invalid_phone", "رقم غير صحيح");
    await consumeOtp(ctx, "email", u.email!, b.code);
    // الرقم على حساب تاني: **مابناخدوش منه**. والرد بيقول «محجوز» عن قصد — من
    // غيره المستخدم مايفهمش ليه الحفظ فشل. وده بيكشف إن الرقم مسجَّل عندنا،
    // وهو نفس تنازل «الإيميل مستخدم» في التسجيل ولا مفيش طريق نشرح بيه الفشل.
    const taken = await ctx.db.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken && taken.id !== me) throw new HttpError(409, "phone_taken", "الرقم ده مربوط بحساب تاني");
    try {
      await ctx.db.user.update({ where: { id: me }, data: { phone, phoneVerifiedAt: null } });
    } catch {
      // تسابق على نفس الرقم بين الفحص فوق والكتابة — القيد الفريد هو الحكم.
      throw new HttpError(409, "phone_taken", "الرقم ده مربوط بحساب تاني");
    }
    const fresh = await ctx.db.user.findUnique({ where: { id: me } });
    res.json(meUser(fresh!));
  }));

  r.delete("/me/phone", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    await ctx.db.user.update({ where: { id: me }, data: { phone: null, phoneVerifiedAt: null } });
    const fresh = await ctx.db.user.findUnique({ where: { id: me } });
    res.json(meUser(fresh!));
  }));

  /**
   * إضافة إيميل لحساب **مالوش إيميل** — بيفكّ حبسة الحسابات القديمة اللي اتعملت
   * بالرقم وبس: دي ماكانتش تقدر تدخل أصلًا من ١٣ أكتوبر (الـSMS موقوف)، ومن غير
   * إيميل مفيش مكان نبعت لها كود.
   *
   * و**تغيير إيميل موجود مش مدعوم عن قصد** — ده مسار سيطرة على الحساب: جلسة
   * مسروقة تبدّل الإيميل وتملك الحساب للأبد. تغييره يستلزم كودًا على القديم
   * والجديد، وده قرار منفصل.
   */
  r.post("/me/email", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ email: z.string().min(5).max(200), code: z.string().min(4).max(10) }).parse(req.body ?? {});
    const u = await ctx.db.user.findUnique({ where: { id: me }, select: { email: true } });
    if (!u) throw notFound();
    if (u.email) throw new HttpError(409, "email_set", "الحساب له إيميل بالفعل، وتغييره مش متاح من هنا");
    const email = normalizeTarget("email", b.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) throw bad("invalid_email", "إيميل غير صحيح");
    // الكود على **الإيميل الجديد** — هو الإثبات الوحيد الممكن إن صاحب الحساب
    // بيملك العنوان ده فعلًا.
    await consumeOtp(ctx, "email", email, b.code);
    const taken = await ctx.db.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== me) throw new HttpError(409, "email_taken", "الإيميل ده مربوط بحساب تاني");
    try {
      await ctx.db.user.update({ where: { id: me }, data: { email } });
    } catch {
      throw new HttpError(409, "email_taken", "الإيميل ده مربوط بحساب تاني");
    }
    const fresh = await ctx.db.user.findUnique({ where: { id: me } });
    res.json(meUser(fresh!));
  }));

  r.post("/me/delete/otp", wrap(async (req, res) => {
    const u = await ctx.db.user.findUnique({ where: { id: (req as AuthedRequest).userId }, include: { wallet: { select: { balance: true } } } });
    const c = u && contactOf(u);
    if (!u || !c) throw notFound();
    needEmail(u);
    await requestOtp(ctx, c.channel, c.target);
    res.json({ channel: c.channel, hint: mask(c.target), balance: Number(u.wallet?.balance ?? 0) });
  }));

  r.delete("/me", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ code: z.string().min(4).max(10), forfeitBalance: z.boolean().default(false) }).parse(req.body ?? {});
    const db = ctx.db;
    const u = await db.user.findUnique({ where: { id: me }, include: { wallet: { select: { balance: true } }, staff: true } });
    const c = u && contactOf(u);
    if (!u || !c) throw notFound();
    const owners = ctx.config.OWNER_CONTACTS.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (x.includes("@") ? x.toLowerCase() : normalizeTarget("phone", x)));
    if (u.staff || owners.includes(c.target)) throw new HttpError(409, "staff_member", "الحساب ده من فريق الإدارة. اطلب من المالك يشيلك من الفريق الأول.");
    const balance = Number(u.wallet?.balance ?? 0);
    if (balance > 0 && !b.forfeitBalance) throw new HttpError(409, "wallet_balance", `في محفظتك رصيد ${balance} ج.م هيضيع مع حذف الحساب. اصرفه الأول أو أكّد التنازل عنه.`);
    await consumeOtp(ctx, c.channel, c.target, b.code); // بعد فحص الشروط عشان الكود ما يتحرقش على خطأ

    await eraseUser(ctx, me, { id: me, name: "المستخدم (حذف ذاتي)", action: "حذف حساب" });
    res.status(204).end();
  }));
  return r;
}
