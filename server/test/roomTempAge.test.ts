/**
 * **الهوية المؤقتة في الغرف الصوتية ١٨+ وحدها (قرار داليا ٦ نوفمبر ٢٠٢٦).**
 *
 * بند جوجل بلاي (٢٦ أغسطس ٢٠٢٦) يقيس **الوظيفة الأساسية** ويفرض «١٨+ وبس» على
 * التطبيقات التي غرضها تواصل مجهول مع الغرباء. محور رع شات ليس ذلك، لكن الحكم
 * حكمهم — فالقرار: نقصر الهوية المؤقتة على ١٨+ بأنفسنا، ونعلن **١٨+ وحدها**.
 *
 * 🔴 **والفحص الحاسم أن الرد والمسار لا يختلفان** (نفس درس `topupReady`): لو الرد
 * قال «مسموح» والمسار رفض، المستخدم يدوس الزرار ويرتدّ بلا سبب؛ ولو العكس، يفضل
 * الزرار مخفيًا على حساب مسموح له. فكل حالة تسأل `/rooms` **وتدخل فعلًا**.
 *
 * ⚠️ **ومصدر «غير محدَّد السن» هو القاعدة مباشرةً عن قصد** — بعد ٢٦ أكتوبر ماعادش
 * فيه ولا مسار يُنشئ تاريخًا دون ١٨ (`assertSignupAge` · `assertProfileBirthDate` ·
 * `set-birthdate.sh` كلهم يرفضون)، فالحالة الواقعية الباقية هي صفّ يدخل من خارج
 * المسارات (استرجاع نسخة · تعديل مباشر). نفس ما تعمله اختبارات `wallet.test.ts`
 * و`adsInventory.test.ts` لفرعَيهما.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { startTestEnv } from "./helpers.js";

let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

type Auth = { auth: Record<string, string>; user: { id: string } };

const makeRoom = async (a: Auth, name: string) =>
  (await request(env.app).post("/rooms").set(a.auth).send({ name }).expect(201)).body;

/** قيمة `tempIdentityAllowed` كما تصل الواجهة من قائمة الغرف. */
const flagInList = async (a: Auth, roomId: string) =>
  ((await request(env.app).get("/rooms").set(a.auth).expect(200)).body as { id: string; tempIdentityAllowed?: boolean }[])
    .find((r) => r.id === roomId)?.tempIdentityAllowed;

/** حساب غير محدَّد السن — الحالة الواقعية الباقية (انظر رأس الملف). */
const forgetAge = (a: Auth) =>
  env.ctx.db.user.update({ where: { id: a.user.id }, data: { birthDate: null } });

describe("الهوية المؤقتة ١٨+", () => {
  it("البالغ: الرد بيقول مسموح **والدخول بهوية مؤقتة ينجح فعلًا**", async () => {
    const a = await env.login("01096000001", "بالغة");
    const room = await makeRoom(a, "غرفة البالغين");
    expect(room.tempIdentityAllowed).toBe(true);
    expect(await flagInList(a, room.id)).toBe(true);

    const r = await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "temp" }).expect(200);
    expect(r.body.myIdentityMode).toBe("temp");
    // والاسم من السيرفر مش اسمها الحقيقي — الهوية المؤقتة بتعمل شغلها
    expect(r.body.me?.name).not.toBe("بالغة");
  });

  it("🔴 غير محدَّد السن: الرد بيقول ممنوع **والمسار يرفض ٤٠٣** — الاتنين متفقين", async () => {
    const a = await env.login("01096000002", "مجهولة السن");
    const room = await makeRoom(a, "غرفة الفحص");
    await forgetAge(a);

    expect(await flagInList(a, room.id), "الرد قال مسموح والمسار بيرفض — زرار بيرتدّ").toBe(false);
    const r = await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "temp" }).expect(403);
    expect(r.body.code).toBe("age_restricted");
  });

  it("والدخول بالهوية **الحقيقية** يفضل مفتوحًا له — الغرفة نفسها مش خدمة ١٨+", async () => {
    const a = await env.login("01096000003", "مجهولة كمان");
    const room = await makeRoom(a, "غرفة الهوية الحقيقية");
    await forgetAge(a);

    const r = await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "real" }).expect(200);
    expect(r.body.myIdentityMode).toBe("real");
    expect(r.body.me?.name).toBe("مجهولة كمان");
  });

  it("والرفض مابيسيبش صفّ حضور ولا بيغيّر هوية قايمة", async () => {
    const a = await env.login("01096000004", "اللي بتحاول");
    const room = await makeRoom(a, "غرفة بلا أثر");
    await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "real" }).expect(200);
    await forgetAge(a);

    await request(env.app).post(`/rooms/${room.id}/join`).set(a.auth).send({ identity: "temp" }).expect(403);
    // الحارس **قبل** أي كتابة (درس ترتيب `assertNotRestricted` في مسار التفاعل):
    // رد ٤٠٣ والهوية اتغيّرت في القاعدة = أسوأ من الاتنين.
    const p = await env.ctx.db.roomParticipant.findMany({ where: { roomId: room.id, userId: a.user.id } });
    expect(p).toHaveLength(1);
    expect(p[0]!.identity).toBe("real");
  });

  it("🔴 والواجهة بتقرا المفتاح فعلًا — مفتاح محدش بيقراه بيبوظ في سكوت", () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, "../../src/screens/RoomsScreen.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, ""); // الحكم بعد شيل التعليقات
    expect(src, "الواجهة مش بتقرا tempIdentityAllowed — فبتعرض زرارًا السيرفر بيرفضه")
      .toMatch(/tempIdentityAllowed\s*===\s*false/);
  });
});
