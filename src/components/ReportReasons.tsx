import type { ReactNode } from "react";
import { useT } from "../i18n";

/**
 * **منتقي أسباب البلاغ — مصدر واحد** للرسايل والستوري (وأي حاجة بعد كده).
 *
 * قبل كده القايمة كانت مكتوبة جوه `MessageActions` وحدها، و`StoryViewer` كان
 * بيبلّغ بـ`reason: "inappropriate"` **مثبّت** بلا أي اختيار — يعني بعد ما
 * ضفنا سبب «إيذاء طفل» وطابور أولوية في اللوحة (١٥ أكتوبر)، البلاغ على
 * **ستوري** فضل بيروح في طابور السبام. ودي نفس عائلة «الحارس لازم يبقى على كل
 * المسارات»: القاعدة مكتوبة على مسار واحد وناقصة على التاني فتبان مطبّقة.
 *
 * فالقايمة بقت هنا: أي سبب جديد يتضاف **مرة واحدة** ويبان في الاتنين.
 *
 * والقيم لازم تبقى جوّه `REPORT_REASONS` بتاعة السيرفر (`routes/reports.ts`) —
 * أي غلطة إملائية بترجّع ٤٠٠ والمستخدم يشوف فشلًا بلا سبب، فده محمي باختبار
 * بيقارن الملفين.
 */
export const UI_REPORT_REASONS = ["child_safety", "abuse", "spam", "inappropriate", "scam"] as const;
export type ReportReason = (typeof UI_REPORT_REASONS)[number];

export function ReportReasons({ onPick, children }: { onPick: (r: ReportReason) => void; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-rachat-black p-2 text-xs">
      <span className="w-full pb-1 text-neutral-500">{t("سبب الإبلاغ:", "Report reason:")}</span>
      {/* «إيذاء طفل» أول الأسباب وبشكل مميّز — بلاي بتطلب مسار إبلاغ صريح
          لـ CSAE، والسبب ده له طابور أولوية وحد يومي منفصل في السيرفر. */}
      <button
        onClick={() => onPick("child_safety")}
        className="w-full rounded-xl border border-rachat-red bg-rachat-red/20 px-2.5 py-1.5 text-start font-semibold text-rachat-red hover:bg-rachat-red hover:text-white"
      >
        {t("إيذاء طفل أو استغلاله", "Child abuse or exploitation")}
      </button>
      {([["abuse", "إساءة", "Abuse"], ["spam", "مزعجة", "Spam"], ["inappropriate", "غير لائق", "Inappropriate"], ["scam", "احتيال", "Scam"]] as const).map(([k, ar, en]) => (
        <button key={k} onClick={() => onPick(k)} className="rounded-full bg-rachat-maroon/60 px-2.5 py-1 text-neutral-200 hover:bg-rachat-red">
          {t(ar, en)}
        </button>
      ))}
      {children}
    </div>
  );
}
