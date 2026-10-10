import "dotenv/config";
import { createDb, type Db } from "../src/db.js";

/** بيانات تجريبية للتطوير (نفس الشخصيات الموجودة في واجهة الديمو). آمنة للتكرار. */
export async function seed(db: Db) {
  const people = [
    { phone: "01000000000", name: "كريم الشناوي", status: "متاح للدردشة", color: "#E1523E", isAdmin: true },
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

  const dmKey = [karim.id, mariam.id].sort().join(":");
  const dm = await db.thread.upsert({
    where: { dmKey }, update: {},
    create: { type: "dm", dmKey, createdById: karim.id, members: { create: [{ userId: karim.id }, { userId: mariam.id }] } },
  });
  if ((await db.message.count({ where: { threadId: dm.id } })) === 0) {
    await db.message.createMany({
      data: [
        { threadId: dm.id, authorId: mariam.id, text: "عامل إيه؟ جهزت حاجتك؟" },
        { threadId: dm.id, authorId: karim.id, text: "أيوه تقريبًا خلصت، هبعتلك دلوقتي" },
        { threadId: dm.id, authorId: mariam.id, text: "تمام، اشوفك بكرة إن شاء الله 🙌" },
      ],
    });
  }
  if (!(await db.thread.findFirst({ where: { type: "group", name: "مجموعة الشغل 💼" } }))) {
    await db.thread.create({
      data: {
        type: "group", name: "مجموعة الشغل 💼", color: "#C9A227", createdById: karim.id,
        members: { create: [{ userId: karim.id, role: "owner" }, ...[mariam, youssef, ahmed].map((u) => ({ userId: u.id }))] },
      },
    });
  }
  for (const [name, icon, color] of [["مطوّرين عرب 👨‍💻", "code", "#E1523E"], ["عشّاق الكورة ⚽", "trophy", "#C9A227"], ["وصفات وأكل 🍲", "food", "#F2795C"], ["رواد أعمال مصر 🚀", "briefcase", "#7a4a2a"]] as const) {
    if (!(await db.thread.findFirst({ where: { type: "group", name } }))) {
      await db.thread.create({ data: { type: "group", name, icon, color, isPublic: true, createdById: nour.id, members: { create: [{ userId: nour.id, role: "owner" }, { userId: sara.id }] } } });
    }
  }
  for (const [code, service, percent, maxOff] of [["RA10", "elec,water", 10, "30"], ["NET15", "net,landline", 15, "50"], ["TOP5", "topup,mobile", 5, "15"]] as const) {
    await db.offer.upsert({ where: { code }, update: {}, create: { code, service, percent, maxOff } });
  }
  return { users: users.length };
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const db = createDb(process.env.DATABASE_URL!);
  seed(db).then((r) => { console.log("seed ok", r); return db.$disconnect(); }).catch((e) => { console.error(e); process.exit(1); });
}
