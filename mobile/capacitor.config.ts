import type { CapacitorConfig } from "@capacitor/cli";

// ⚠️ appId مشتق من دومين التطبيق بالمقلوب (raachateg.com → com.raachateg).
// **مينفعش يتغيّر بعد أول رفع للمتجر** — بعدها اسم تاني معناه تطبيق منفصل بلستة
// جديدة، والمستخدمون الحاليون مايوصلهمش التحديث. اتغيّر في ١٩ أكتوبر ٢٠٢٦ من
// `com.datalifeai.raachat` بقرار داليا، ووقتها مكانش فيه تطبيق منشور فالتغيير بلا تكلفة.
// و`cap sync` **مابيعيدش تسمية حزمة أندرويد** — فالتغيير بالإيد في خمس حاجات:
// الملف ده · `build.gradle` (namespace + applicationId) · `strings.xml` · **مسار
// الـJava** · و`assets/capacitor.config.json` (ناتج بناء، بيتولّد من الملف ده).
// ومحمي بحارس في `server/test/androidBuild.test.ts` بيقرا الـappId من هنا ويتأكد
// إن كل الملفات دي متسقة معاه.
const config: CapacitorConfig = {
  appId: "com.raachateg.app",
  appName: "رع شات",
  webDir: "../dist",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#14100F" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;
