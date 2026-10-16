import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * **بصمة النسخة للتحديث التلقائي.**
 *
 * اللوحة بتتبني **ملف واحد** (`viteSingleFile`): الـ JS والـ CSS بيتدمجوا جوه
 * `index.html` نفسه، فالناتج ملف واحد ومفيش `<script src>` خارجي خالص. يعني
 * طريقة التطبيق (مقارنة اسم ملف الـ JS اللي فيه بصمة Vite) **مستحيلة هنا** —
 * وأي نسخة منها بتسكت من غير أي خطأ.
 *
 * فالبصمة بتتحدّد وقت البناء: ثابت `__BUILD__` بيتحقن جوه الحزمة، و**نفس**
 * القيمة بتتكتب في `version.txt` جنب الملف الواحد. فاللوحة الشغّالة تقدر تسأل
 * السيرفر «إيه آخر نسخة منشورة؟» وتقارنها باللي هي مبنية منه فعلًا — والفرق
 * معناه إن فيه نشرة جديدة.
 *
 * ليه ملف برّه الحزمة: الملف الواحد اللي المتصفح محمّله من الكاش مابيعرفش
 * يقول «أنا قديم». لازم حاجة **السيرفر** هو اللي بيردّ بيها.
 */
const BUILD = Date.now().toString(36);

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: "rachat-build-id",
      generateBundle() {
        // مش مشاور عليه من الـ HTML، فالـ singlefile مابيدمجوش — وبيفضل ملف
        // حقيقي في `dist` وبعدها في `/srv-admin` جوه صورة Caddy.
        this.emitFile({ type: "asset", fileName: "version.txt", source: BUILD });
      },
    },
  ],
  build: { outDir: "dist" },
});
