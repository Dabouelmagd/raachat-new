/**
 * **صورة الإعلان لازم تكون من رفعنا — مش رابطًا خارجيًا.**
 *
 * الإعلان بيتعرض لكل المستخدمين بعد **مراجعة** واعتماد. ولو الصورة رابط على
 * سيرفر المعلن:
 *   1. **المراجعة تبقى بلا معنى** — المعلن يبدّل الصورة بعد الموافقة وإحنا
 *      عرضنا حاجة محدش شافها. ده أخطرها.
 *   2. **كل مستخدم بيشوف الإعلان بيسلّم عنوانه (IP) ومتصفحه** لسيرفر الطرف
 *      التالت — وده نقل بيانات شخصية لجهة غير معلنة في سياسة الخصوصية.
 *   3. الرابط يموت فيظهر الإعلان مكسورًا، أو يبقى بطيئًا ومحدش يقدر يصلّحه.
 *
 * فالمقبول: ملف مرفوع عندنا من `POST /uploads` — يعني `/uploads/<اسم>` أو
 * `<PUBLIC_URL>/uploads/<اسم>` (لو الملفات على دومين تاني). وأي حاجة تانية
 * بتترفض من أول الطريق.
 */

/**
 * أسماء الملفات اللي `POST /uploads` بيطلّعها: hex + امتداد **صورة**.
 *
 * الامتداد مش تزيّد: `POST /uploads` بيقبل **أي** نوع ملف (الفلتر الموجود هناك
 * بيحكم طريقة العرض بس مش القبول) — فملف PDF أو فيديو ينفع يتحقن هنا ويطلع
 * عند المستخدم `<img>` مكسورة. والامتداد هو اللي إحنا بنولّده بأنفسنا من اسم
 * الملف الأصلي، فهو مش مدخلًا حرًّا من المعلن.
 */
const NAME = /^[A-Za-z0-9_-]{8,80}\.(png|jpe?g|webp|gif)$/i;

/**
 * `true` لو الرابط ملف مرفوع عندنا. `publicUrl` = `config.PUBLIC_URL`
 * (فاضي = الملفات على نفس الدومين بمسار نسبي).
 */
export function isOwnUpload(url: string, publicUrl: string): boolean {
  const u = url.trim();
  if (!u || u.includes("\\") || u.includes("..") || /\s/.test(u)) return false;

  // مسار نسبي: لازم يبدأ بشرطة واحدة بالظبط (`//host/...` ده رابط خارجي)
  if (u.startsWith("/")) {
    if (u.startsWith("//")) return false;
    return NAME.test(trimPrefix(u, "/uploads/"));
  }

  // رابط كامل: لازم يكون بادئته PUBLIC_URL بالحرف
  const base = publicUrl.trim().replace(/\/+$/, "");
  if (!base) return false;
  if (!u.startsWith(`${base}/uploads/`)) return false;
  return NAME.test(trimPrefix(u, `${base}/uploads/`));
}

/** يرجّع اللي بعد البادئة، أو نصًّا فاضيًا لو البادئة مش موجودة في الأول. */
function trimPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : "";
}
