import { createDb, type Db } from "./db.js";

/**
 * بيانات تجريبية على قاعدة بيانات حقيقية: نفس شخصيات واجهة الديمو + محادثاتهم.
 * آمنة للتكرار (upsert). لو مرّرتي `meContact` (رقم أو إيميل حساب موجود) بيتضاف
 * للجروب وبيتعمل له محادثة فردية عشان قائمة الشاتات عنده ماتبقاش فاضية.
 */
export const DEMO_PHONES = ["01000000000", "01000000001", "01000000002", "01000000003", "01000000004", "01000000005"];

export async function seedDemo(db: Db, meContact?: string) {
  const people = [
    { phone: "01000000000", name: "كريم الشناوي", status: "متاح للدردشة", color: "#E1523E" },
    { phone: "01000000001", name: "مريم عبد الله", status: "", color: "#E1523E" },
    { phone: "01000000002", name: "يوسف كامل", status: "", color: "#F2795C" },
    { phone: "01000000003", name: "نور الهدى", status: "", color: "#C9A227" },
    { phone: "01000000004", name: "أحمد فتحي", status: "", color: "#7a4a2a" },
    { phone: "01000000005", name: "سارة منير", status: "", color: "#5B2621" },
  ];
  const users = [];
  for (const p of people) {
    users.push(await db.user.upsert({ where: { phone: p.phone }, update: {}, create: { ...p, wallet: { create: { balance: "1250.00" } } } }));
  }
  const [karim, mariam, youssef, nour, ahmed, sara] = users;

  const dm = async (a: string, b: string) => {
    const dmKey = [a, b].sort().join(":");
    return db.thread.upsert({
      where: { dmKey }, update: {},
      create: { type: "dm", dmKey, createdById: a, members: { create: [{ userId: a }, { userId: b }] } },
    });
  };
  const say = async (threadId: string, lines: [string, string][]) => {
    if ((await db.message.count({ where: { threadId } })) > 0) return;
    await db.message.createMany({ data: lines.map(([authorId, text]) => ({ threadId, authorId, text })) });
  };

  const d1 = await dm(karim.id, mariam.id);
  await say(d1.id, [[mariam.id, "عامل إيه؟ جهزت حاجتك؟"], [karim.id, "أيوه تقريبًا خلصت، هبعتلك دلوقتي"], [mariam.id, "تمام، اشوفك بكرة إن شاء الله 🙌"]]);

  let work = await db.thread.findFirst({ where: { type: "group", name: "مجموعة الشغل 💼" } });
  if (!work) {
    work = await db.thread.create({
      data: {
        type: "group", name: "مجموعة الشغل 💼", color: "#C9A227", createdById: karim.id,
        members: { create: [{ userId: karim.id, role: "owner" }, ...[mariam, youssef, ahmed].map((u) => ({ userId: u.id }))] },
      },
    });
    await say(work.id, [[karim.id, "صباح الخير يا جماعة ☀️"], [youssef.id, "صباح النور، الاجتماع الساعة كام؟"], [ahmed.id, "١١ بإذن الله"]]);
  }

  for (const [name, icon, color] of [["مطوّرين عرب 👨‍💻", "code", "#E1523E"], ["عشّاق الكورة ⚽", "trophy", "#C9A227"], ["وصفات وأكل 🍲", "food", "#F2795C"], ["رواد أعمال مصر 🚀", "briefcase", "#7a4a2a"]] as const) {
    if (!(await db.thread.findFirst({ where: { type: "group", name } }))) {
      await db.thread.create({ data: { type: "group", name, icon, color, isPublic: true, createdById: nour.id, members: { create: [{ userId: nour.id, role: "owner" }, { userId: sara.id }] } } });
    }
  }
  for (const [code, service, percent, maxOff] of [["RA10", "elec,water", 10, "30"], ["NET15", "net,landline", 15, "50"], ["TOP5", "topup,mobile", 5, "15"]] as const) {
    await db.offer.upsert({ where: { code }, update: {}, create: { code, service, percent, maxOff } });
  }

  let linked: string | null = null;
  if (meContact) {
    const t = meContact.trim();
    const me = await db.user.findFirst({ where: t.includes("@") ? { email: t.toLowerCase() } : { phone: t } });
    if (me && me.id !== karim.id) {
      const mine = await dm(mariam.id, me.id);
      await say(mine.id, [[mariam.id, "أهلًا بيك في رع شات! 👋"], [mariam.id, "جرّب تبعت ملصق فرعوني من زرار الإيموجي 🏺"]]);
      await db.membership.upsert({ where: { threadId_userId: { threadId: work.id, userId: me.id } }, update: {}, create: { threadId: work.id, userId: me.id } });
      linked = me.name;
    }
  }
  return { users: users.length, linked };
}

/** يمسح البيانات التجريبية ومحادثاتها (الحسابات الحقيقية ما بتتمسّش). */
export async function unseedDemo(db: Db) {
  const ids = (await db.user.findMany({ where: { phone: { in: DEMO_PHONES } }, select: { id: true } })).map((u) => u.id);
  if (!ids.length) return { users: 0, threads: 0 };
  const threads = (await db.thread.findMany({ where: { members: { some: { userId: { in: ids } } } }, select: { id: true } })).map((t) => t.id);
  await db.$transaction([
    db.message.deleteMany({ where: { threadId: { in: threads } } }),
    db.membership.deleteMany({ where: { threadId: { in: threads } } }),
    db.thread.deleteMany({ where: { id: { in: threads } } }),
    db.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return { users: ids.length, threads: threads.length };
}

if (process.argv[1]?.includes("seed-demo")) {
  const db = createDb(process.env.DATABASE_URL!);
  const run = process.env.REMOVE === "1" ? unseedDemo(db) : seedDemo(db, process.env.ME);
  run.then((r) => { console.log(JSON.stringify(r)); return db.$disconnect(); })
     .catch((e) => { console.error(e); process.exit(1); });
}
