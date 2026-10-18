import { describe, expect, it } from "vitest";
import { isOwnUpload } from "../src/lib/adImage.js";
import { FILE_COLUMNS } from "../src/lib/orphanFiles.js";

/**
 * **🔴 ليه صورة الإعلان لازم تكون من رفعنا — وده أهم اختبار في الملف.**
 *
 * الإعلان بيتعرض لكل المستخدمين **بعد مراجعة واعتماد**. ولو الصورة رابط على
 * سيرفر المعلن، يقدر يبدّلها **بعد** الموافقة — فاللي اتعرض للناس حاجة محدش
 * راجعها، و**المراجعة كلها تبقى بلا معنى**. ومعاها: كل مستخدم بيشوف الإعلان
 * بيسلّم عنوانه (IP) لجهة تالتة غير معلنة في سياسة الخصوصية.
 */
describe("صورة الإعلان لازم تكون ملفًا مرفوعًا عندنا", () => {
  const PUB = "https://api.example.com";

  it("بيقبل المسار النسبي واللي ببادئة PUBLIC_URL", () => {
    expect(isOwnUpload("/uploads/a1b2c3d4e5f6.png", "")).toBe(true);
    expect(isOwnUpload("/uploads/a1b2c3d4e5f6.png", PUB)).toBe(true);
    expect(isOwnUpload(`${PUB}/uploads/a1b2c3d4e5f6.jpg`, PUB)).toBe(true);
    expect(isOwnUpload(`${PUB}/uploads/a1b2c3d4e5f6.webp`, `${PUB}/`), "شرطة زايدة في الإعداد").toBe(true);
  });

  it("🔴 بيرفض أي رابط خارجي — ولو مساره فيه uploads", () => {
    for (const u of [
      "https://evil.com/uploads/a1b2c3d4e5f6.png",
      "http://evil.com/uploads/a1b2c3d4e5f6.png",
      "//evil.com/uploads/a1b2c3d4e5f6.png",
      "https://api.example.com.evil.com/uploads/a1b2c3d4e5f6.png",
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
    ]) {
      expect(isOwnUpload(u, PUB), `اتقبل وهو خارجي: ${u}`).toBe(false);
    }
  });

  it("بيرفض الخروج من المجلد والأسماء الغريبة", () => {
    for (const u of [
      "/uploads/../../etc/passwd",
      "/uploads/",
      "/uploads/a b.png",
      "/other/a1b2c3d4e5f6.png",
      "/uploads/sub/a1b2c3d4e5f6.png",
      "a1b2c3d4e5f6.png",
      "",
      "   ",
    ]) {
      expect(isOwnUpload(u, PUB), `اتقبل وهو غلط: ${JSON.stringify(u)}`).toBe(false);
    }
  });

  /** PUBLIC_URL فاضي = الملفات على نفس الدومين، فالرابط الكامل مالوش معنى */
  it("لو PUBLIC_URL فاضي، الرابط الكامل بيترفض", () => {
    expect(isOwnUpload("https://api.example.com/uploads/a1b2c3d4e5f6.png", "")).toBe(false);
  });

  /**
   * `POST /uploads` بيقبل **أي** نوع ملف (الفلتر هناك بيحكم طريقة العرض بس)،
   * فملف PDF أو فيديو مرفوع عندنا بيعدّي فحص الأصل وبيطلع `<img>` مكسورة عند
   * كل المستخدمين. الامتداد اللي إحنا بنولّده هو الحارس الوحيد المتاح.
   */
  it("🔴 بيرفض الملف المرفوع اللي مش صورة", () => {
    for (const ext of ["pdf", "mp4", "webm", "svg", "html", "js"]) {
      expect(isOwnUpload(`/uploads/a1b2c3d4e5f6.${ext}`, ""), ext).toBe(false);
    }
  });

  it("بيقبل امتدادات الصور بأي حالة حروف", () => {
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "PNG", "JPG"]) {
      expect(isOwnUpload(`/uploads/a1b2c3d4e5f6.${ext}`, ""), ext).toBe(true);
    }
  });

  /**
   * من غير السطر ده في `FILE_COLUMNS`، كنس الملفات اليتيمة بيشوف صور الإعلانات
   * **الشغّالة** كأنها بلا مرجع **ويمسحها** — وده بيحصل في سكوت.
   */
  it("🔴 عمود صورة الإعلان متسجّل في أعمدة الملفات", () => {
    expect(FILE_COLUMNS, "كنس الملفات اليتيمة هيمسح صور إعلانات شغّالة").toContain("AdCampaign.imageUrl");
  });
});
