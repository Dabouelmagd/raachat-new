import { useT, num } from "../i18n";
import { VoiceRoom } from "../types";

/**
 * تمييز الغرفة الصوتية اللي **فيها ناس دلوقتي** — مصدر واحد للشاشتين.
 *
 * 🔴 ليه مصدر واحد (٢٦ أكتوبر ٢٠٢٦، بطلب داليا «ميزيها»): اسم الغرفة بيتعرض في
 * **مكانين** — `RoomsScreen` (شاشة «الغرف») و`ChatsScreen` تبويب «الغرف» — وكان
 * `font-bold` **دايمًا** في الاتنين. نفس بالظبط اللي حصل في «جروباتي» و«قنواتي»
 * قبلها بساعات: شكل مكتوب في مكانين بيفترق، وواحد منهم يُنسى.
 */

/**
 * 🔴 والإشارة هي **الحضور الحيّ** مش «بيتكلم» — والفرق مهم:
 *
 * `RoomParticipant.speaking` موجود في `types.ts` و**السيرفر عمره ما بيضبطه**
 * (صفر نتيجة في `server/src/`) ومفيش ولا ملف في `src/` بيقراه — يعني حقل ميت.
 * فلو بنينا التمييز عليه، الشارة **عمرها ما كانت هتظهر في الإنتاج** ومفيش ولا
 * خطأ يقول كده — نفس عطل `adsFor("story")` بالظبط.
 *
 * والحضور إشارة **حقيقية وموثوقة**: `count` من `GET /rooms` = صفوف الحضور
 * الحيّة، وشغل «أشباح الغرف» (١٢ أكتوبر) بيضمن إنها حيّة فعلًا — بتتمسح أول ما
 * العملية تقوم وبتتكنس كل دقيقة لأي مستخدم مالوش سوكت متصل. فالنصّ بيقول
 * «دلوقتي» عن حضور، ومابيدّعيش كلامًا إحنا مش شايفينه.
 */
export const liveCount = (r: Pick<VoiceRoom, "count" | "participants">) =>
  r.count ?? r.participants.length;

/**
 * ⚠️ والغرفة الفاضية حالة حقيقية في الإنتاج مش فرضًا: `GET /rooms` بيرجّع كل
 * غرفة `closedAt: null` **بلا أي فلتر على عدد الحضور**، فالغرفة بتفضل مفتوحة
 * بعد ما الكل يخرج منها. يعني الفرق بين الحيّة والفاضية بيبان فعلًا للمستخدم.
 */

/**
 * 🔴 والفرق **بولد مقابل عادي** (٤٠٠ ↔ ٧٠٠) مش «بولد مقابل أبولد»: درس نفس
 * اليوم — `font-bold` (٧٠٠) جنب `font-extrabold` (٨٠٠) فرق **مابيتشافش بالعين**
 * خصوصًا في الخطّ العربي.
 *
 * ⚠️ ومفيش `truncate` هنا عن قصد: الشاشتان تخطيطهما مختلف، والـ`truncate`
 * محتاج أب `min-w-0` — فكل شاشة بتضيفه مع تخطيطها.
 */
export const roomNameClass = (count: number) =>
  `text-sm ${count > 0 ? "font-bold text-white" : "font-normal text-rachat-papyrus"}`;

/**
 * شارة «فيها ناس دلوقتي». بترجّع `null` على الفاضية — فالفاضية مالهاش شارة
 * فاضية ولا رقم صفر.
 *
 * والحكم للاختبار ولقارئ الشاشة من `aria-label` مش من اللون ولا النقطة
 * المتحرّكة — ده نفس درس علامات الرسالة (١٨ أكتوبر): الوصف بيتغيّر مع المعنى
 * مش مع التنسيق.
 */
export function LiveBadge({ count }: { count: number }) {
  const tx = useT();
  if (count <= 0) return null;
  return (
    <span
      aria-label={tx("يوجد أشخاص الآن", "People in here now")}
      className="flex shrink-0 items-center gap-1 rounded-full bg-rachat-red/20 px-2 py-0.5 text-[11px] font-extrabold text-rachat-coral"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rachat-coral" />
      {num(count)} {tx("الآن", "live")}
    </span>
  );
}

/**
 * سطر الحالة تحت الاسم. الفاضية بتقول إنها فاضية صريح بدل «٠ مشارك» —
 * الصفر بيتقرا كأنه عطل.
 */
export function roomStatusText(
  tx: (ar: string, en: string) => string,
  count: number,
  joined: boolean,
) {
  if (joined) return tx("أنت داخل الغرفة", "You're in this room");
  if (count > 0) return tx("اضغط للانضمام", "Tap to join");
  return tx("فارغة — انضمّ وابدأ الحديث", "Empty — join and start talking");
}
