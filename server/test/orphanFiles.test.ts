import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { startTestEnv } from "./helpers.js";
import { FILE_COLUMNS, MIN_AGE_MS, fileNameOf, findOrphans } from "../src/lib/orphanFiles.js";
import { eraseUser } from "../src/lib/eraseUser.js";

/**
 * **الملف اليتيم بيانات شخصية فاضلة بعد «المحو».** `privacy.html` بيوعد بالمسح،
 * والمرفق اللي صفّه اتمسح لسه قاعد على القرص — فالوعد مايكتملش من غيره.
 *
 * وأخطر حاجة في الملف ده مش «بيلاقي اليتيم» — هي **إنه مايمسحش اللي مش يتيم**:
 * استعلام بايظ أو عمود اتغيّر اسمه بيخلّي كل ملفات المستخدمين تبان يتيمة.
 */
let env: Awaited<ReturnType<typeof startTestEnv>>;
beforeAll(async () => { env = await startTestEnv(); }, 120_000);
afterAll(async () => { await env?.stop(); }, 60_000);

let tmp = "";
const mkdir = async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "orph-"));
  return tmp;
};
/** بيكتب ملفًا وبيخلّي عمره `ageMs` (عشان نعدّي نافذة الأمان أو نقع فيها) */
const write = async (dir: string, name: string, ageMs = MIN_AGE_MS * 2) => {
  const p = path.join(dir, name);
  await fs.writeFile(p, "x".repeat(16));
  const t = new Date(Date.now() - ageMs);
  await fs.utimes(p, t, t);
  return p;
};
const run = (dir: string) => findOrphans({ db: env.ctx.db as never, fs, path }, dir);

describe("الملفات اليتيمة", () => {
  it("بيلاقي الملف اللي صفّه اتمسح، وبيسيب اللي لسه مشاور عليه", async () => {
    const dir = await mkdir();
    const a = await env.login("01065100001", "صاحبة صورة");
    const keep = "keep-photo.jpg";
    const dead = "dead-attachment.bin";
    await write(dir, keep);
    await write(dir, dead);
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { photoUrl: `https://x.test/uploads/${keep}` } });

    const r = await run(dir);
    expect(r.abort, r.abort).toBeUndefined();
    expect(r.orphans.map((o) => o.name)).toEqual([dead]);
    expect(r.bytes).toBe(16);
  });

  /**
   * الحالة الحقيقية مش النظرية: الواجهة بترفع الملف **الأول** وبعدين تبعت
   * الرسالة اللي بتعمل صفّ `Attachment`. فبين الخطوتين الملف بلا صفّ — ومسحه
   * ساعتها يضيّع مرفق مستخدم بيبعته في اللحظة دي.
   */
  it("الملف الجديد مابيتحسبش يتيمًا مهما كان بلا صفّ", async () => {
    const dir = await mkdir();
    await write(dir, "just-uploaded.jpg", 60_000); // عمره دقيقة
    const r = await run(dir);
    expect(r.orphans).toEqual([]);
    expect(r.tooNew).toBe(1);
  });

  /**
   * 🔴 **الحالة الكارثية.** لو الاستعلام بوّظ أو عمود اتغيّر اسمه، المراجع
   * بترجع صفر و**كل** ملفات المستخدمين تبان يتيمة. ومن النتيجة لوحدها مفيش
   * طريق نفرّق بين ده وبين قاعدة فاضية فعلًا — فالوقوف هو السلوك الصح، مش
   * المسح. (ده الفرق بين تنضيف وبين مسح كل مرفقات التطبيق.)
   */
  it("صفر مرجع مع وجود ملفات = وقوف، مش «كله يتيم»", async () => {
    const dir = await mkdir();
    await write(dir, "a.jpg");
    await write(dir, "b.jpg");
    const blind = {
      user: { findMany: async () => [] },
      thread: { findMany: async () => [] },
      attachment: { findMany: async () => [] },
      story: { findMany: async () => [] },
    };
    const r = await findOrphans({ db: blind as never, fs, path }, dir);
    expect(r.abort, "لازم يقف — صفر مرجع مع وجود ملفات").toBeTruthy();
    expect(r.referenced).toBe(0);
    // والملفات لسه مكانها: الدالة **مابتمسحش** أصلًا، القرار برّه
    await expect(fs.stat(path.join(dir, "a.jpg"))).resolves.toBeTruthy();
  });

  /**
   * إعادة التوجيه بتعمل مرفقًا جديدًا بـ**نفس** الرابط المرفوع (مفيش رفع تاني).
   * فحذف الرسالة الأصلية **مايخلّيش** الملف يتيمًا — لسه فيه صفّ تاني بيشاور
   * عليه. الحكم لازم يبقى على «مفيش ولا مرجع» مش على «صفّ اتمسح».
   */
  it("ملف مشاور عليه من أكتر من صفّ مابيبقاش يتيمًا لما واحد يتمسح", async () => {
    const dir = await mkdir();
    const a = await env.login("01065100002", "أ");
    const b = await env.login("01065100003", "ب");
    const t = (await request(env.app).post("/threads").set(a.auth).send({ type: "dm", memberIds: [b.user.id] })).body;
    const name = "shared.png";
    await write(dir, name);
    const url = `https://x.test/uploads/${name}`;
    const att = { name, size: 16, mime: "image/png", url };
    const m1 = (await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: "", attachment: att }).expect(201)).body;
    await request(env.app).post(`/threads/${t.id}/messages`).set(a.auth).send({ text: "", attachment: att }).expect(201);

    expect((await run(dir)).orphans).toEqual([]);
    await request(env.app).delete(`/messages/${m1.id}`).set(a.auth).expect(204);
    expect((await run(dir)).orphans, "لسه فيه صفّ تاني بيشاور على نفس الملف").toEqual([]);
  });

  /**
   * الحالة اللي البند موجود عشانها: المستخدم بيمحو حسابه، `eraseUser` بتمسح
   * الصفوف — والملف على القرص **بيفضل**. يعني بيانات شخصية فاضلة بعد «المحو»،
   * والسياسة بتوعد بالعكس.
   */
  it("محو الحساب بيسيب صورته على القرص — ودي الحالة اللي بندوّر عليها", async () => {
    const dir = await mkdir();
    const a = await env.login("01065100005", "هتمحو حسابها");
    const name = "erased-avatar.jpg";
    await write(dir, name);
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { photoUrl: `https://x.test/uploads/${name}` } });
    expect((await run(dir)).orphans, "لسه الحساب موجود").toEqual([]);

    // `eraseUser` هي **نفس** الترانزاكشن اللي الحذف الذاتي والمحو الإداري
    // بيستخدموها — فالفحص على الآلية الحقيقية مش على مسار HTTP بكود تأكيد.
    await eraseUser(env.ctx, a.user.id, { id: "test", name: "اختبار", action: "erase" });
    const after = await run(dir);
    expect(after.orphans.map((o) => o.name), "بعد المحو الملف بقى يتيمًا").toEqual([name]);
  });

  it("بياخد الاسم من الرابط الكامل والنسبي ومعاه query", () => {
    expect(fileNameOf("https://api.kenoz.org/uploads/ab-12.jpg")).toBe("ab-12.jpg");
    expect(fileNameOf("/uploads/ab-12.jpg?v=2")).toBe("ab-12.jpg");
    expect(fileNameOf("")).toBeNull();
    expect(fileNameOf(null)).toBeNull();
  });

  /**
   * **حارس:** أي عمود جديد بيشاور على ملف لازم يتضاف في `findOrphans` — وإلا
   * الملفات اللي بيشاور عليها تبان يتيمة **وتتمسح وهي مستخدَمة**. الفحص بيقرا
   * `schema.prisma` ويقارن بالقايمة المعلنة.
   */
  it("مفيش عمود ملفات في المخطط غايب عن الفحص", async () => {
    const schema = await fs.readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const models = schema.split(/^model\s+/m).slice(1);
    const found: string[] = [];
    for (const m of models) {
      const model = m.slice(0, m.indexOf(" ")).trim();
      for (const line of m.split("\n")) {
        const f = line.trim().match(/^(\w*(?:[Uu]rl|Photo|Image))\s+String/);
        if (f && /url|photo|image/i.test(f[1])) found.push(`${model}.${f[1]}`);
      }
    }
    expect(found.length, "مفيش ولا عمود اتلقى — الفحص نفسه بايظ").toBeGreaterThan(0);
    for (const col of found) {
      expect(FILE_COLUMNS as readonly string[], `عمود ملفات مش متفحوص: ${col}`).toContain(col);
    }
  });
});

/**
 * **السكربت نفسه لازم يتشغّل فعلًا.** درس `set-birthdate`: الدالة عدّت في
 * الاختبارات وهي سليمة، والسكربت وقع في أول تشغيل حقيقي على السيرفر
 * (`Cannot find module '.prisma/client/default'`). فالفحص هنا بيشغّل
 * `orphanprobe.mjs` كأمر على قاعدة حقيقية ومجلد حقيقي.
 */
describe("السكربت جوه الحاوية", () => {
  const ROOT = path.resolve(import.meta.dirname, "../..");
  const src = () => fsSync.readFileSync(path.join(ROOT, "scripts/lib/orphanprobe.mjs"), "utf8");
  const run = (extra: Record<string, string>) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      const child = execFile("node", ["--import", "tsx", "--input-type=module", "-"],
        { encoding: "utf8", cwd: path.join(ROOT, "server"), env: {
          ...process.env, DATABASE_URL: env.dbUrl, JWT_SECRET: "test-secret-test-secret",
          RC_ORPHAN_LIB: path.join(ROOT, "server/src/lib/orphanFiles.ts"),
          RC_DB_LIB: path.join(ROOT, "server/src/db.ts"),
          RC_CONFIG_LIB: path.join(ROOT, "server/src/config.ts"),
          ...extra,
        } },
        (err, so, se) => resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, out: so + se }));
      child.stdin!.write(src()); child.stdin!.end();
    });

  it("بيطلّع تقرير ومابيمسحش حاجة من غير RC_DELETE", async () => {
    const dir = await mkdir();
    await write(dir, "orphan-report.bin");
    const r = await run({ UPLOAD_DIR: dir });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("orphan-report.bin");
    expect(r.out, "لازم يقول صراحةً إنه ما مسحش").toContain("مفيش حاجة اتمسحت");
    await expect(fs.stat(path.join(dir, "orphan-report.bin")), "الملف لازم يفضل مكانه").resolves.toBeTruthy();
  });

  it("بيمسح فعلًا مع RC_DELETE، وبيتأكد إن الملف راح", async () => {
    const dir = await mkdir();
    const a = await env.login("01065100004", "صاحبة صورة");
    await write(dir, "keep-me.jpg");
    await write(dir, "kill-me.bin");
    await env.ctx.db.user.update({ where: { id: a.user.id }, data: { photoUrl: "https://x.test/uploads/keep-me.jpg" } });

    const r = await run({ UPLOAD_DIR: dir, RC_DELETE: "1" });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("متحقَّق");
    await expect(fs.stat(path.join(dir, "kill-me.bin"))).rejects.toThrow();
    await expect(fs.stat(path.join(dir, "keep-me.jpg")), "المشاور عليه ما يتلمسش").resolves.toBeTruthy();
  });
});

/**
 * **تأكيد المسح: الحكم على سلوكه مش على شكل نصّه.** بناخد كتلة `case` من
 * السكربت نفسه ونشغّلها بـ`sh` بإجابات حقيقية — زي ما `backupLoop.test.ts`
 * بياخد جسم الحلقة من compose.
 *
 * والسبب عطل حقيقي حصل في أول تشغيل: السؤال بالعربي («متأكدة؟») والسكربت
 * كان بيقبل `yes` بس، فداليا كتبت «نعم» والمسح اتلغى. طلب كلمة إنجليزية في
 * سؤال عربي **عيب مش حرص**.
 */
describe("تأكيد المسح", () => {
  const ROOT = path.resolve(import.meta.dirname, "../..");
  const block = () => {
    const src = fsSync.readFileSync(path.join(ROOT, "scripts/orphan-files.sh"), "utf8");
    const a = src.indexOf("# --- confirm-case ---");
    const b = src.indexOf("# --- end confirm-case ---");
    expect(a, "كتلة التأكيد مش موجودة في السكربت").toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    return src.slice(a, b);
  };
  const answer = (ans: string) =>
    new Promise<boolean>((resolve) => {
      execFile("sh", ["-c", `OK='${ans}'\n${block()}\necho PROCEED`.replace(/\\n/g, "\n")],
        { encoding: "utf8" }, (_e, so) => resolve(so.includes("PROCEED")));
    });

  it("بيقبل «نعم» و«أيوه» زي ما بيقبل yes", async () => {
    for (const ok of ["yes", "YES", "نعم", "أيوه", "ايوه"]) {
      expect(await answer(ok), `المفروض يقبل «${ok}»`).toBe(true);
    }
  });

  it("بيرفض الفاضي وأي إجابة تانية — والحذف مابيرجعش", async () => {
    for (const no of ["", "no", "لأ", "y", "ok"]) {
      expect(await answer(no), `المفروض يرفض «${no}»`).toBe(false);
    }
  });
});
