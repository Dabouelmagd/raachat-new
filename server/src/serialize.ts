import { isAdult } from "./lib/age.js";
import type { Db } from "./db.js";

export const publicUser = (u: { id: string; name: string; status: string; color: string; photoUrl: string | null }) => ({
  id: u.id, name: u.name, status: u.status, color: u.color, photo: u.photoUrl ?? undefined,
});

export const meUser = (u: { id: string; name: string; status: string; color: string; photoUrl: string | null; phone: string | null; email: string | null; lang: string; isAdmin: boolean; birthDate?: Date | null; passwordHash?: string | null }) => ({
  ...publicUser(u), phone: u.phone ?? undefined, email: u.email ?? undefined, lang: u.lang, role: u.isAdmin ? "admin" : "user",
  // الواجهة محتاجة تعرف هل الحساب بيدخل بكلمة سر ولا بكود بس (الهاش نفسه مابيخرجش أبدًا)
  hasPassword: !!u.passwordHash,
  // تاريخ الميلاد بيحدد إتاحة خدمات ١٨+؛ null = لسه ما حددش
  birthDate: u.birthDate ? u.birthDate.toISOString().slice(0, 10) : null,
  isAdult: isAdult(u.birthDate),
});

type ThreadRow = Awaited<ReturnType<typeof loadThreadFor>>;
export function loadThreadFor(db: Db, threadId: string) {
  return db.thread.findUnique({ where: { id: threadId }, include: { members: { include: { user: true } } } });
}

/** شكل المحادثة بالنسبة لمستخدم معيّن (الـ dm اسمها اسم الطرف التاني) */
export function threadView(t: NonNullable<ThreadRow>, me: string) {
  const others = t.members.filter((m) => m.userId !== me);
  if (t.type === "dm") {
    const o = others[0]?.user;
    return {
      id: t.id, type: t.type, name: o?.name ?? "—", color: o?.color, photo: o?.photoUrl ?? undefined,
      memberIds: others.map((m) => m.userId), createdByMe: false,
    };
  }
  const myRole = t.members.find((m) => m.userId === me)?.role ?? null;
  if (t.type === "channel") {
    // **المشتركين مابيشوفوش بعض** — القناة بث، مش جروب. فمفيش `memberIds`
    // للقناة أبدًا (العدد بس)، والنشر للمالك والمشرفين.
    return {
      id: t.id, type: t.type, name: t.name ?? "", about: t.about ?? undefined,
      color: t.color ?? undefined, icon: t.icon ?? undefined, photo: t.photoUrl ?? undefined,
      memberIds: [], createdByMe: t.createdById === me, isPublic: t.isPublic,
      memberCount: t.members.length, myRole, canPost: myRole === "owner" || myRole === "admin",
    };
  }
  return {
    id: t.id, type: t.type, name: t.name ?? "", color: t.color ?? undefined, icon: t.icon ?? undefined,
    photo: t.photoUrl ?? undefined, memberIds: others.map((m) => m.userId), createdByMe: t.createdById === me,
    isPublic: t.isPublic, memberCount: t.members.length, myRole, canPost: true,
  };
}

export const messageInclude = {
  author: true, attachment: true, reactions: true,
  // الاستطلاع واختياراته وأصواته في نفس الاستعلام
  poll: { include: { options: { include: { votes: true }, orderBy: { idx: "asc" } } } },
} as const;
export type MsgRow = Awaited<ReturnType<Db["message"]["findFirstOrThrow"]>> & {
  author: { name: string };
  attachment: { name: string; size: number; mime: string; url: string; text: string | null; voiceDuration: number | null; voiceWave: unknown } | null;
  reactions: { userId: string; emoji: string }[];
  poll?: {
    question: string; multi: boolean; closed: boolean; hideVoters: boolean;
    options: { id: string; text: string; idx: number; votes: { userId: string }[] }[];
  } | null;
};

/**
 * `viewer` = المستخدم اللي الرد ده **ليه**.
 *
 * محتاجينه للاستطلاع المخفي بس: هناك مابنبعتش معرّفات المصوّتين خالص، فالواجهة
 * مش قادرة تعرف «أنا صوّت إيه» من الرد — فبنبعت `mine` محسوبة على السيرفر، وهي
 * بطبيعتها **بتختلف من متفرّج للتاني**. فأي بث للاستطلاع المخفي لازم يتسلسل لكل
 * واحد لوحده (شوف `emitMessage` في `routes/messages.ts`)؛ ومن غير `viewer`
 * بترجّع `mine: false` — وده صح للعلني (الواجهة تحسبها من `voterIds`) وغلط
 * للمخفي، فالحارس في مكان واحد مش مبعزق على المسارات.
 */
export function messageView(m: MsgRow, read = false, delivered = false, viewer?: string) {
  const reactions: Record<string, string[]> = {};
  for (const r of m.reactions) (reactions[r.emoji] ??= []).push(r.userId);
  return {
    id: m.id, threadId: m.threadId, authorId: m.authorId, authorName: m.author.name,
    text: m.deleted ? "" : m.text, time: m.createdAt.toISOString(), read, delivered: delivered || read, replyToId: m.replyToId ?? undefined,
    reactions, edited: m.edited, deleted: m.deleted,
    // الاستطلاع العلني: الأصوات بالمعرّفات عشان الواجهة تعرف صوتي أنا ومين صوّت.
    // **والمخفي: `voterIds` مابتخرج من السيرفر خالص** — لا كاملة ولا ناقصة ولا
    // مهشّرة. إخفاؤها في الواجهة بس كان بيبقى ستارة: أي حد يفتح تبويب الشبكة
    // يقرا مين صوّت. (والتهشير مابينفعش كمان: `memberIds` بتتبعت للجروبات،
    // فأي عضو يهشّر معرّفات الأعضاء ويكشف الأصوات كلها.)
    poll: m.poll && !m.deleted
      ? {
          question: m.poll.question, multi: m.poll.multi, closed: m.poll.closed, hideVoters: m.poll.hideVoters,
          options: m.poll.options.map((o) => (m.poll!.hideVoters
            ? { id: o.id, text: o.text, count: o.votes.length, mine: !!viewer && o.votes.some((v) => v.userId === viewer) }
            : { id: o.id, text: o.text, count: o.votes.length, voterIds: o.votes.map((v) => v.userId) })),
        }
      : undefined,
    attachment: m.attachment && !m.deleted
      ? {
          name: m.attachment.name, size: m.attachment.size, mime: m.attachment.mime, url: m.attachment.url,
          text: m.attachment.text ?? undefined,
          voice: m.attachment.voiceDuration != null
            ? { duration: m.attachment.voiceDuration, waveform: (m.attachment.voiceWave as number[]) ?? [] }
            : undefined,
        }
      : undefined,
  };
}
