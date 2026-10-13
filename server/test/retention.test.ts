import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { retentionSweep } from "../src/lib/retention.js";

/**
 * الصفحات القانونية بتوعد بمدد حذف، والكود مكان مفيهوش ولا وظيفة حذف مجدولة:
 * الستوري بتتخبّى بعد ٢٤ ساعة والصف باقي، وأكواد التحقق (وفيها رقم التليفون صريح)
 * بتتجاهل بس مابتتمسحش. الاختبار ده بيثبّت إن الحذف بيحصل فعلًا — **وإن التجربة
 * الجافة مابتمسحش حاجة** (ودي أهم حاجة: الوضع الافتراضي في الإنتاج).
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

const ago = (ms: number) => new Date(Date.now() - ms);
const DAY = 86_400_000;

describe("الحذف التلقائي (مدد الاحتفاظ المنشورة)", () => {
  it("بيمسح اللي عدّى مدته بس — والتجربة الجافة مابتمسحش ولا صف", async () => {
    const db = env.ctx.db;
    const a = await env.login("01080000001", "سارة");
    // التطبيق بقى ١٨+ فمفيش حساب قاصر ينشأ من التسجيل أصلًا — إنما «مجهول السن»
    // (الحسابات القديمة) لسه بياخد معاملة الأقل من ١٨ تحوّطًا، وده اللي بيتفحص هنا.
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });

    // كود تحقق قديم (ساعتين) وكود لسه جديد
    await db.otpCode.createMany({ data: [
      { channel: "phone", target: "01099999991", codeHash: "h1", expiresAt: ago(2 * 3600_000), createdAt: ago(2 * 3600_000) },
      { channel: "phone", target: "01099999992", codeHash: "h2", expiresAt: new Date(Date.now() + 300_000) },
    ] });

    // ستوري منتهية (امبارح) وستوري شغالة
    const old = await db.story.create({ data: { authorId: a.user.id, colorFrom: "#111", colorTo: "#222", caption: "قديمة", expiresAt: ago(DAY), createdAt: ago(2 * DAY) } });
    const live = await db.story.create({ data: { authorId: a.user.id, colorFrom: "#111", colorTo: "#222", caption: "شغالة", expiresAt: new Date(Date.now() + DAY) } });
    await db.storySeen.create({ data: { storyId: old.id, userId: a.user.id } });

    // حدث إعلان لمستخدم من غير تاريخ ميلاد (= أقل من ١٨ تحوّطًا) عمره ٣ أيام
    await db.adEvent.create({ data: { userId: a.user.id, adKey: "banner", kind: "shown", createdAt: ago(3 * DAY) } });
    // ومعرّف مستعار قديم
    await db.adEvent.create({ data: { userId: "anon:xyz", adKey: "banner", kind: "clicked", createdAt: ago(3 * DAY) } });
    // وحدث جديد لازم يفضل
    await db.adEvent.create({ data: { userId: a.user.id, adKey: "banner", kind: "shown" } });

    // ── تجربة جافة: بتعدّ ومابتمسحش
    const before = {
      otp: await db.otpCode.count(), stories: await db.story.count(), ads: await db.adEvent.count(),
    };
    const dry = await retentionSweep(env.ctx, "dry");
    expect(dry.otp).toBe(1);
    expect(dry.stories).toBe(1);
    expect(dry.minorAdEvents).toBe(2);
    expect(await db.otpCode.count()).toBe(before.otp);     // مفيش حذف
    expect(await db.story.count()).toBe(before.stories);
    expect(await db.adEvent.count()).toBe(before.ads);

    // ── الحذف الفعلي
    const wet = await retentionSweep(env.ctx, "on");
    expect(wet.otp).toBe(1);
    expect(wet.stories).toBe(1);
    expect(wet.minorAdEvents).toBe(2);
    // ملحوظة: env.login نفسه بيعمل كود تحقق (جديد)، فبنفحص بالتارجت مش بالعدد الكلي
    expect(await db.otpCode.count({ where: { target: "01099999991" } })).toBe(0); // القديم اتمسح
    expect(await db.otpCode.count({ where: { target: "01099999992" } })).toBe(1); // الجديد فضل
    expect(await db.story.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.story.findUnique({ where: { id: live.id } })).not.toBeNull();
    expect(await db.storySeen.count({ where: { storyId: old.id } })).toBe(0); // بالـ cascade
    expect(await db.adEvent.count()).toBe(1);                        // الحديث بس

    // تشغيل تاني على نضافة = أصفار (مش بيمسح حاجة غلط)
    expect(await retentionSweep(env.ctx, "on")).toMatchObject({ otp: 0, stories: 0, minorAdEvents: 0 });
  });

  it("صورة الستوري بتتمسح من القرص — إلا لو فيه صف تاني بيستخدم نفس الملف", async () => {
    const db = env.ctx.db;
    const a = await env.login("01080000002");
    const b = await env.login("01080000003"); // لازم طرف تاني عشان نعمل محادثة
    const dir = path.resolve(env.ctx.config.UPLOAD_DIR);
    const mk = (name: string) => { const p = path.join(dir, name); fs.writeFileSync(p, "x"); return p; };

    // ملف خاص بستوري منتهية → يتمسح
    const lone = "a".repeat(32) + ".png";
    const lonePath = mk(lone);
    await db.story.create({ data: { authorId: a.user.id, colorFrom: "#1", colorTo: "#2", imageUrl: `/uploads/${lone}`, expiresAt: ago(DAY) } });

    // ملف نفسه مستخدم في مرفق رسالة → **مايتمسحش** (المستخدم بيبعت imageUrl من عنده)
    const shared = "b".repeat(32) + ".png";
    const sharedPath = mk(shared);
    const th = await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] }).expect(201);
    const msg = await db.message.create({ data: { threadId: th.body.id, authorId: a.user.id, text: "مع مرفق" } });
    await db.attachment.create({ data: { messageId: msg.id, name: "p.png", size: 1, mime: "image/png", url: `/uploads/${shared}` } });
    await db.story.create({ data: { authorId: a.user.id, colorFrom: "#1", colorTo: "#2", imageUrl: `/uploads/${shared}`, expiresAt: ago(DAY) } });

    const r = await retentionSweep(env.ctx, "on");
    expect(r.storyFiles).toBe(1);
    expect(fs.existsSync(lonePath)).toBe(false);   // اتمسح
    expect(fs.existsSync(sharedPath)).toBe(true);  // لسه مستخدم في مرفق
  });

  it("المدد في الكود مطابقة للمنشور في سياسة الخصوصية", () => {
    const src = fs.readFileSync(path.resolve("src/lib/retention.ts"), "utf8");
    const privacy = fs.readFileSync(path.resolve("../public/legal/privacy.html"), "utf8");
    // سنتان للبلاغات، ويومين لسجل إعلانات الأقل من ١٨ — الأرقام دي منشورة للمستخدم
    expect(src).toContain("REPORT_YEARS = 2");
    expect(src).toContain("MINOR_AD_DAYS = 2");
    expect(privacy).toMatch(/سنتان|سنتين/);
    expect(privacy).toMatch(/يومان|يومين/);
    expect(privacy).toMatch(/٢٤ ساعة/); // الستوري
  });
});
