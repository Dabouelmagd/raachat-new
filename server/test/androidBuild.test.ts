import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { firstPublicOrigin } from "../src/lib/senders.js";

/**
 * حوارس على بناء الـ APK. السبب إن الأعطال هنا **صامتة**: الـ APK يتبني ويتنزّل
 * ويتثبّت، وبعدين يطلع تطبيق ديمو مابيكلّمش السيرفر — أو مفيش صلاحية جهات اتصال
 * فالميزة اللي عايزين نجرّبها هي بالظبط اللي مش هتشتغل.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("بناء الـ APK", () => {
  const wf = () => read(".github/workflows/android.yml");

  /**
   * **أهم حارس.** بناء الواجهة بلا `VITE_API_URL` بيطلّع **بناء الديمو** اللي
   * مابيعملش ولا نداء شبكة — فالـ APK يتثبّت ويفتح ويشتغل بالبيانات التجريبية،
   * ومحدش ياخد باله إن السيرفر مش متصل أصلًا. (نفس درس api-mode في CI.)
   */
  it("بيبني الواجهة بوضع الـ API مش الديمو", () => {
    const s = wf();
    expect(s).toContain("VITE_API_URL");
    expect(s, "لازم يفشل لو العنوان فاضي بدل ما يطلّع بناء ديمو").toContain('test -n "$VITE_API_URL"');
  });

  it("بينسخ الواجهة جوه المشروع وبيتأكد إنها وصلت", () => {
    const s = wf();
    expect(s).toContain("cap sync android");
    expect(s, "فحص إيجابي إن ملفات الواجهة دخلت الـ APK").toContain(
      "android/app/src/main/assets/public/index.html",
    );
  });

  /** `|| true` أو رفع artifact بلا فحص = ملف فاضي بيتنزّل وتتصرف عليه ساعة */
  it("بيفحص الناتج قبل ما يرفعه", () => {
    const s = wf();
    expect(s).toContain("app-debug.apk");
    expect(s, "حجم معقول — أقل من ميجا معناه بناء فاضي").toContain('test "$SIZE" -gt 1000000');
    expect(s, "والواجهة لازم تكون جوه الأرشيف فعلًا").toContain("unzip -l");
    expect(s).not.toMatch(/\|\|\s*true/);
  });

  it("مابيتشغّلش على كل commit توثيق", () => {
    const s = wf();
    expect(s).toContain("paths:");
    expect(s).toContain("workflow_dispatch");
  });

  /** الـ placeholder في المتجر = اسم حزمة غلط **مابيتغيّرش بعد النشر** */
  it("appId اسم حقيقي مش placeholder", () => {
    const cfg = read("mobile/capacitor.config.ts");
    expect(cfg).not.toContain("YOURCOMPANY");
    expect(cfg).toMatch(/appId:\s*"[a-z][a-z0-9.]*\.[a-z][a-z0-9]*"/);
  });

  /**
   * الصلاحيات: من غيرها الميزة بتفشل **بلا رسالة** على الجهاز — وجهات الاتصال
   * بالظبط هي سبب وجود «الأصدقاء» وهي اللي عايزين نجرّبها.
   */
  it("المانيفست فيه صلاحيات جهات الاتصال والمايك والكاميرا والإشعارات", () => {
    const m = read("mobile/android/app/src/main/AndroidManifest.xml");
    for (const p of ["READ_CONTACTS", "RECORD_AUDIO", "CAMERA", "POST_NOTIFICATIONS", "INTERNET"]) {
      expect(m, `صلاحية ناقصة: ${p}`).toContain(`android.permission.${p}`);
    }
  });
});

/**
 * **الفخّ اللي الدالة دي موجودة تمنعه:** الـ APK أصله `https://localhost`
 * (بسبب `androidScheme: "https"`), فلازم يتضاف لـ `CORS_ORIGIN`. و`APP_URL`
 * الفاضي بياخد أصلًا من القايمة — فلو انضاف في **أول** القايمة، كل إيميل تحقق
 * يبقى رابطه `https://localhost` **لكل المستخدمين**. فالاختيار بقى «أول أصل
 * غير محلّي» بدل «أول أصل».
 */
describe("أصل التطبيق المحلي مابيكسرش روابط الإيميل", () => {
  it("بيعدّي localhost مهما كان ترتيبه", () => {
    expect(firstPublicOrigin("https://localhost,https://app.example.com")).toBe("https://app.example.com");
    expect(firstPublicOrigin("http://127.0.0.1:5173, https://app.example.com")).toBe("https://app.example.com");
    expect(firstPublicOrigin("https://app.example.com,https://localhost")).toBe("https://app.example.com");
  });

  it("لو كله محلّي بيرجّع الأول — التطوير المحلي لازم يفضل شغّال", () => {
    expect(firstPublicOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(firstPublicOrigin("")).toBe("");
  });

  /** `localhost.evil.com` **مش** محلّي — لازم يتعامل كأصل عام عادي */
  it("مابيتخدعش باسم فيه localhost جوّاه", () => {
    expect(firstPublicOrigin("https://localhost.evil.com,https://app.example.com")).toBe(
      "https://localhost.evil.com",
    );
  });
});
