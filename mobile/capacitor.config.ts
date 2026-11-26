import type { CapacitorConfig } from "@capacitor/cli";

// 🔴 appId ده **هوية التطبيق على المتجرين، ومصدره اللستة المنشورة مش الدومين**.
// التطبيق منشور فعلًا باسم الحزمة ده على الاتنين: Google Play (Raa Chat ·
// DataLifeAI · 2.0.5 · +١٠٠٠ تحميل) وApp Store (1.7) — فأي اسم غيره معناه تطبيق
// منفصل بلستة جديدة، والمستخدمون الحاليون مايوصلهمش التحديث أبدًا.
// **ومينفعش يتغيّر بعد أول رفع.**
// واتغيّر مرتين بالغلط: ١٩ أكتوبر ٢٠٢٦ لـ`com.raachateg.app` (اشتقاقًا من الدومين
// بالمقلوب، على فرضية «مفيش تطبيق منشور» اللي طلعت غلط)، ورجع هنا في ٢٦ نوفمبر
// ٢٠٢٦ للاسم المنشور. **الدومين مالوش دعوة باسم الحزمة** — `raachateg.com` هو
// عنوان الـAPI والموقع وبيفضل زي ما هو.
// و`cap sync` **مابيعيدش تسمية حزمة أندرويد** — فالتغيير بالإيد في خمس حاجات:
// الملف ده · `build.gradle` (namespace + applicationId) · `strings.xml` · **مسار
// الـJava** · و`assets/capacitor.config.json` (ناتج بناء، بيتولّد من الملف ده).
// ومحمي بحارس في `server/test/androidBuild.test.ts` بيقرا الـappId من هنا ويتأكد
// إن كل الملفات دي متسقة معاه.
const config: CapacitorConfig = {
  appId: "com.datalife.raachat",
  appName: "رع شات",
  webDir: "../dist",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#14100F" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;
