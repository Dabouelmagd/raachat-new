import { CalendarDays, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ADULT_AGE } from "../age";
import { useT, num } from "../i18n";
import { useProfile } from "../store/profile";

/**
 * قفل خدمات ١٨+ (المحفظة ودفع الفواتير).
 * التطبيق نفسه مفتوح لكل الأعمار، فالرسالة بتوضّح ده عشان المستخدم ما يحسّش إنه مطرود.
 * فيه حالتين: تاريخ الميلاد لسه غير محدد (نوجّهه يحدده)، أو أقل من السن (مفيش حاجة يعملها).
 */
export function AgeLock() {
  const t = useT();
  const nav = useNavigate();
  const unset = !useProfile().birthDate;

  return (
    <div className="mx-auto max-w-sm rounded-2xl bg-rachat-card p-6 text-center">
      <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-rachat-black">
        {unset ? <CalendarDays size={24} className="text-rachat-gold" /> : <Lock size={22} className="text-rachat-gold" />}
      </div>
      <p className="text-base font-extrabold text-rachat-papyrus">
        {t(`خدمة من ${num(ADULT_AGE)} سنة`, `A ${ADULT_AGE}+ service`)}
      </p>
      <p className="mt-2 text-[12.5px] leading-[21px] text-neutral-400">
        {unset
          ? t(`المحفظة ودفع الفواتير متاحتان من سنّ ${num(ADULT_AGE)} سنة. حدِّد تاريخ ميلادك من الملف الشخصي لنفتحهما لك.`,
              `The wallet and bill payment are available from age ${ADULT_AGE}. Add your date of birth in your profile to unlock them.`)
          : t(`المحفظة ودفع الفواتير فيهما تعاملات مالية، لذا هما متاحتان من سنّ ${num(ADULT_AGE)} سنة.`,
              `The wallet and bill payment involve financial transactions, so they're available from age ${ADULT_AGE}.`)}
      </p>
      <p className="mt-3 text-[11.5px] leading-5 text-neutral-500">
        {t("وبقيّة رع شات مفتوحة لك كالعادة: الرسائل والمجموعات والغرف الصوتية والمكالمات والقصص.",
          "The rest of Raa Chat is open to you: messages, groups, voice rooms, calls and stories.")}
      </p>
      {unset ? (
        <button onClick={() => nav("/profile")} className="mt-5 w-full rounded-xl bg-gradient-to-br from-rachat-red to-rachat-coral py-3 text-sm font-bold text-white">
          {t("حدِّد تاريخ ميلادك", "Add your date of birth")}
        </button>
      ) : (
        <button onClick={() => nav("/")} className="mt-5 w-full rounded-xl bg-rachat-black py-3 text-sm font-bold text-neutral-300">
          {t("رجوع للدردشات", "Back to chats")}
        </button>
      )}
    </div>
  );
}
