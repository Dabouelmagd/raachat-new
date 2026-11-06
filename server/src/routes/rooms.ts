import { Router } from "express";
import { z } from "zod";
import { assertClean } from "../lib/contentFilter.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { forbidden, HttpError, notFound, wrap } from "../lib/errors.js";
import { ADULT_AGE, isAdult } from "../lib/age.js";
import { peerKey } from "../rtc.js";

const TEMP = [
  ["المسافر الليلي", "#C9A227"], ["صوت الصحراء", "#F2795C"], ["نجمة النيل", "#E1523E"], ["ساكن الفيوم", "#5B2621"],
  ["حارس المعبد", "#7a4a2a"], ["نسمة الدلتا", "#C9A227"], ["ظل النخيل", "#F2795C"], ["عابر الأهرام", "#E1523E"],
] as const;
const MAX_PER_ROOM = 50;

type P = { userId: string; identity: string; muted: boolean; joinedAt: Date; user: { name: string; color: string } };

/** هوية المشارك: في الوضع المؤقت السيرفر هو اللي بيحدد الاسم، ولا بيتبعت userId الحقيقي لأي حد */
function seat(roomId: string, ownerId: string, p: P) {
  const key = peerKey(roomId, p.userId);
  if (p.identity === "temp") {
    const [name, color] = TEMP[parseInt(key.slice(0, 6), 16) % TEMP.length];
    return { id: key, name, color, muted: p.muted, isHost: false };
  }
  return { id: key, name: p.user.name, color: p.user.color, muted: p.muted, isHost: p.userId === ownerId };
}

export function roomRoutes(ctx: Ctx) {
  const r = Router();
  r.use(requireAuth(ctx));
  const db = ctx.db;
  const include = { participants: { include: { user: { select: { name: true, color: true } } }, orderBy: { joinedAt: "asc" as const } } };

  /**
   * **الهوية المؤقتة ١٨+ وحدها (قرار داليا ٦ نوفمبر ٢٠٢٦).**
   *
   * بند جوجل بلاي (٢٦ أغسطس ٢٠٢٦) يقيس **الوظيفة الأساسية** ويفرض «١٨+ وبس» على
   * التطبيقات التي غرضها تواصل مجهول مع الغرباء. ومحور رع شات ليس ذلك (رسائل مع
   * جهات اتصالك)، لكن الحكم حكمهم — فالقرار: نقصر الهوية المؤقتة على ١٨+ بأنفسنا،
   * ونعلن في المتجر **١٨+ وحدها** بلا ادعاء ١٣–١٧.
   *
   * ⚠️ **والحارس لا يؤثّر على أحد اليوم** — التسجيل ١٨+ من ١٣ أكتوبر و`PATCH /me`
   * يرفض دون ١٨ من ٢٦ أكتوبر، فكل حساب في الإنتاج سنّه محدَّد وبالغ. وجوده لحالة
   * **غير محدَّد السن**: صفّ يدخل القاعدة من خارج هذه المسارات (استرجاع نسخة
   * قديمة · تعديل مباشر في القاعدة) كان سيأخذ **معاملة البالغ في سكوت** — وهو
   * بالظبط سبب بقاء فرع `!isAdult` في `ads.ts` وحارس السن في `/translate`. فشلٌ
   * مقفول على مجموعة فارغة، لا ميزة تُحذف لأنها لا تنفَّذ.
   *
   * **والحكم في السيرفر لا في الواجهة** (نمط حارس المحفظة): لا يُتلفّ من الواجهة،
   * والواجهة تقرأ `tempIdentityAllowed` من نفس الرد فلا تعرض زرارًا ميتًا — ولو
   * تغيّرت القاعدة يومًا، تتغيّر معها بلا نشر واجهة (نمط `topupReady`).
   */
  const tempAllowed = async (me: string) => {
    const u = await db.user.findUnique({ where: { id: me }, select: { birthDate: true } });
    return isAdult(u?.birthDate);
  };

  const view = (room: { id: string; name: string; ownerId: string; participants: P[] }, me: string, temp: boolean) => {
    const mine = room.participants.find((p) => p.userId === me);
    return {
      id: room.id, name: room.name, createdByMe: room.ownerId === me, joined: !!mine, myIdentityMode: (mine?.identity as "real" | "temp" | undefined) ?? null,
      count: room.participants.length, tempIdentityAllowed: temp,
      me: mine ? (mine.identity === "temp" ? { name: seat(room.id, room.ownerId, mine).name, color: seat(room.id, room.ownerId, mine).color } : { name: mine.user.name, color: mine.user.color }) : null,
      participants: room.participants.filter((p) => p.userId !== me).map((p) => seat(room.id, room.ownerId, p)),
    };
  };
  const changed = (id: string) => ctx.io?.to("rooms").emit("room:changed", { id });
  const load = async (id: string) => {
    const room = await db.room.findUnique({ where: { id }, include });
    if (!room || room.closedAt) throw notFound("الغرفة مش موجودة");
    return room;
  };

  r.get("/rooms", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const rooms = await db.room.findMany({ where: { closedAt: null }, include, orderBy: { createdAt: "desc" }, take: 50 });
    const temp = await tempAllowed(me);
    res.json(rooms.map((x) => view(x, me, temp)));
  }));

  r.post("/rooms", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    // اسم الغرفة بيتبث لكل المستخدمين في قايمة الغرف — وكان المكان الوحيد اللي
    // بيتخطّى فلتر الكلمات (الرسايل وأسماء الجروبات والستوري والبروفايل كلهم متفلترين).
    assertClean(ctx, b.name);
    const room = await db.room.create({ data: { name: b.name, ownerId: me }, include });
    changed(room.id);
    res.status(201).json(view(room, me, await tempAllowed(me)));
  }));

  r.post("/rooms/:id/join", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ identity: z.enum(["real", "temp"]) }).parse(req.body);
    // الهوية المؤقتة ١٨+ وحدها — والدخول بالهوية الحقيقية مفتوح زي ما هو (الغرفة
    // نفسها مش خدمة ١٨+، المقصور هو **إخفاء الهوية** اللي بند بلاي بيقيسه).
    const temp = await tempAllowed(me);
    if (b.identity === "temp" && !temp) {
      throw new HttpError(403, "age_restricted", `الدخول بهوية مؤقتة متاح من سن ${ADULT_AGE} سنة — تقدر تدخل بهويتك الحقيقية`);
    }
    const room = await load(String(req.params.id));
    if (!room.participants.some((p) => p.userId === me) && room.participants.length >= MAX_PER_ROOM) throw forbidden("الغرفة مكتملة");
    // مستخدم في غرفة واحدة بس في نفس الوقت
    await db.roomParticipant.deleteMany({ where: { userId: me, roomId: { not: room.id } } });
    await db.roomParticipant.upsert({
      where: { roomId_userId: { roomId: room.id, userId: me } }, update: { identity: b.identity },
      create: { roomId: room.id, userId: me, identity: b.identity },
    });
    changed(room.id);
    res.json(view(await load(room.id), me, temp));
  }));

  r.post("/rooms/:id/leave", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    await db.roomParticipant.deleteMany({ where: { roomId: String(req.params.id), userId: me } });
    changed(String(req.params.id));
    res.status(204).end();
  }));

  r.put("/rooms/:id/mute", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const b = z.object({ muted: z.boolean() }).parse(req.body);
    const n = await db.roomParticipant.updateMany({ where: { roomId: String(req.params.id), userId: me }, data: { muted: b.muted } });
    if (n.count === 0) throw forbidden("لازم تكون داخل الغرفة");
    changed(String(req.params.id));
    res.status(204).end();
  }));

  r.delete("/rooms/:id", wrap(async (req, res) => {
    const me = (req as AuthedRequest).userId;
    const room = await load(String(req.params.id));
    if (room.ownerId !== me) throw forbidden("صاحب الغرفة بس يقدر يقفلها");
    await db.$transaction([db.roomParticipant.deleteMany({ where: { roomId: room.id } }), db.room.update({ where: { id: room.id }, data: { closedAt: new Date() } })]);
    changed(room.id);
    res.status(204).end();
  }));

  return r;
}

/** لما آخر اتصال للمستخدم يقفل، بنشيله من أي غرفة (مفيش «أشباح» في الغرف) */
export async function cleanupRoomPresence(ctx: Ctx, userId: string) {
  const rows = await ctx.db.roomParticipant.findMany({ where: { userId }, select: { roomId: true } });
  if (rows.length === 0) return;
  await ctx.db.roomParticipant.deleteMany({ where: { userId } });
  for (const x of rows) ctx.io?.to("rooms").emit("room:changed", { id: x.roomId });
}

/**
 * وجود المشارك في غرفة = **اتصال سوكت حيّ**، والاتصالات دي في ذاكرة العملية
 * نفسها. فلما الـ api يقوم من جديد (كل نشر، أو إعادة تشغيل، أو crash) كل الصفوف
 * اللي في القاعدة بتبقى **أشباح**: الغرفة تفضل مليانة ناس مش موجودين، و«مكتملة»
 * تمنع اللي عايز يدخل فعلًا. فأول ما العملية تقوم، الحضور كله يتمسح — محدش ممكن
 * يكون متصل بعملية لسه بتقوم.
 *
 * (لو بقى فيه أكتر من نسخة api شغّالة في نفس الوقت، السطر ده لازم يتغيّر لأنه
 * هيشيل حضور النسخة التانية كمان. دلوقتي فيه كونتينر api واحد.)
 */
export async function clearRoomPresence(ctx: Ctx) {
  const n = await ctx.db.roomParticipant.deleteMany({});
  if (n.count > 0) console.log(`🧽 الغرف: اتمسح ${n.count} حضور قديم من قبل إعادة التشغيل`);
  return n.count;
}

/**
 * كنس دوري: صفّ حضور لمستخدم **مالوش ولا سوكت متصل** = شبح. بيحصل لو الـ
 * `disconnect` ضاع (قطع شبكة مفاجئ، أو العملية ماتت وهي شايلة الصف).
 * بنعتمد على السوكتات الحيّة نفسها مش على وقت الانضمام، فاللي قاعد ساكت في
 * غرفة من ساعتين مابيتشلش.
 */
export async function sweepRoomPresence(ctx: Ctx) {
  if (!ctx.io) return 0;
  const rows = await ctx.db.roomParticipant.findMany({ select: { userId: true, roomId: true } });
  if (rows.length === 0) return 0;
  const ghosts: typeof rows = [];
  for (const row of rows) {
    const live = await ctx.io.in(`user:${row.userId}`).fetchSockets();
    if (live.length === 0) ghosts.push(row);
  }
  if (ghosts.length === 0) return 0;
  await ctx.db.roomParticipant.deleteMany({ where: { userId: { in: ghosts.map((g) => g.userId) } } });
  for (const id of new Set(ghosts.map((g) => g.roomId))) ctx.io.to("rooms").emit("room:changed", { id });
  return ghosts.length;
}

/** بيشغّل الكنس كل دقيقة. بيرجّع دالة إيقاف (للاختبارات). */
export function startRoomSweep(ctx: Ctx, everyMs = 60_000) {
  const t = setInterval(() => { void sweepRoomPresence(ctx).catch((e) => console.error("room sweep failed", e)); }, everyMs);
  t.unref?.();
  return () => clearInterval(t);
}
