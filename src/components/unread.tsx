import { useT, num } from "../i18n";

/**
 * شكل المحادثة اللي فيها رسايل ما اتقرتش — **مصدر واحد لكل القوايم**.
 *
 * 🔴 ليه مصدر واحد (٢٦ أكتوبر ٢٠٢٦، بطلب داليا «الاسم لما يبعت رسالة يبقى بولد
 * ولما تتفتح يبقى من غير بولد … في الشات وكل الجروبات والغرف»): الفرق كان مكتوب
 * في `ChatsScreen` **لوحده**، و«جروباتي» في `GroupsScreen` و«قنواتي» في
 * `ChannelsScreen` كانوا `font-bold` **دايمًا** بلا أي عدّاد — فاللي بيدخل من
 * الشاشتين دول مابيشوفش **أي** فرق بين المقروء وغيره. نفس درس «الحارس لازم يبقى
 * على كل المسارات»: القاعدة على مسار واحد تبان مطبّقة وهي متخطّاة بخطوة.
 */

/**
 * 🔴 والفرق لازم يكون **بولد مقابل عادي** مش «بولد مقابل أبولد»: اللي كان موجود
 * `font-extrabold` (٨٠٠) للمقروء-لأ و`font-bold` (٧٠٠) للمقروء — فرق ١٠٠ درجة
 * **مابيتشافش بالعين**، خصوصًا في الخطّ العربي. فالمقروء بقى `font-normal`
 * (٤٠٠) والفرق بقى ٣٠٠ درجة.
 *
 * ⚠️ و`truncate text-sm` لازم يفضلوا في أول النصّ — فيه لوكيتورات اختبار
 * (`span.truncate.text-sm` في `unread-ticks.spec.ts`) بتعتمد عليهم.
 */
export const threadNameClass = (unread?: number) =>
  `truncate text-sm ${unread ? "font-bold text-white" : "font-normal text-rachat-papyrus"}`;

/**
 * عدّاد الرسايل اللي ما اتقرتش. بيرجّع `null` لما يكون صفر — فالصفر مابيرسمش
 * شارة فاضية.
 */
export function UnreadBadge({ count }: { count?: number }) {
  const tx = useT();
  if (!count) return null;
  return (
    <span
      aria-label={tx("رسائل غير مقروءة", "Unread messages")}
      className="shrink-0 rounded-full bg-rachat-red px-2 py-0.5 text-[11px] font-extrabold text-white"
    >
      {num(count)}
    </span>
  );
}
