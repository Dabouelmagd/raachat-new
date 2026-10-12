import { useEffect, useState } from "react";
import { Languages, X, Volume2 } from "lucide-react";
import { num, useT } from "../i18n";
import { setTranslate, useTranslate } from "../store/translate";
import { TLANG_NAMES, translate, type TLang } from "../translate/engine";
import { EXAMPLES, PHRASES, TLANGS } from "../translate/phrases";
import { phraseText } from "../translate/engine";

function LangPick({ value, onChange, label }: { value: TLang; onChange: (l: TLang) => void; label: string }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-[11px] font-bold text-neutral-500">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 rounded-xl bg-rachat-black p-1">
        {TLANGS.map((l) => (
          <button key={l} role="radio" aria-checked={value === l} onClick={() => onChange(l)}
            className={`rounded-lg py-2 text-xs font-bold ${value === l ? "bg-rachat-red text-white" : "text-neutral-400"}`}>
            {TLANG_NAMES[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** نافذة إعدادات الترجمة الفورية (للشات والمكالمات) */
export function TranslateSheet({ onClose, call = false }: { onClose: () => void; call?: boolean }) {
  const t = useT();
  const s = useTranslate();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("الترجمة الفورية", "Live translation")} onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-[380px] overflow-y-auto rounded-t-2xl bg-rachat-card p-5 text-rachat-papyrus sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="flex items-center gap-2 font-extrabold"><Languages size={18} className="text-rachat-coral" /> {t("الترجمة الفورية", "Live translation")}</p>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-neutral-500"><X size={18} /></button>
        </div>

        <button role="switch" aria-checked={s.on} onClick={() => setTranslate({ on: !s.on })}
          className="mb-4 flex w-full items-center justify-between rounded-xl bg-rachat-black px-3.5 py-3">
          <span className="text-sm font-bold">{call ? t("ترجمة المكالمة فورًا", "Translate the call live") : t("ترجمة الرسائل فورًا", "Translate messages live")}</span>
          <span className={`relative h-6 w-11 rounded-full ${s.on ? "bg-rachat-red" : "bg-neutral-700"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white ${s.on ? "right-0.5" : "left-0.5"}`} />
          </span>
        </button>

        <LangPick label={t("لغتي (أقرأ وأسمع بها)", "My language (I read and hear in)")} value={s.mine} onChange={(l) => setTranslate({ mine: l })} />
        <LangPick label={t("لغة الطرف الآخر (تُترجم لها كلماتي)", "Their language (my words are translated to)")} value={s.peer} onChange={(l) => setTranslate({ peer: l })} />

        <button role="switch" aria-checked={s.speak} onClick={() => setTranslate({ speak: !s.speak })}
          className="mb-4 flex w-full items-center justify-between rounded-xl bg-rachat-black px-3.5 py-3">
          <span className="flex items-center gap-2 text-sm font-bold"><Volume2 size={15} /> {t("نطق الترجمة بصوت عالٍ", "Read translations aloud")}</span>
          <span className={`relative h-6 w-11 rounded-full ${s.speak ? "bg-rachat-red" : "bg-neutral-700"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white ${s.speak ? "right-0.5" : "left-0.5"}`} />
          </span>
        </button>

        <div className="rounded-xl border border-dashed border-rachat-gold/50 p-3">
          <p className="mb-1 text-xs font-bold text-rachat-gold">{t("نسخة تجريبية", "Demo version")}</p>
          <p className="mb-2 text-[11px] leading-5 text-neutral-400">
            {t(`الديمو بيترجم حوالي ${num(PHRASES.length)} عبارة شائعة بين العربية والإنجليزية والصينية والفرنسية. الباك إند هيربط محرك ترجمة حقيقي لأي جملة وأي لغة. جرّبي كتابة:`, `The demo translates about ${PHRASES.length} common phrases between Arabic, English, Chinese and French. The backend will connect a real translation engine for any sentence and any language. Try typing:`)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((i) => (
              <span key={i} className="rounded-full bg-rachat-black px-2.5 py-1 text-[11px] text-rachat-papyrus">{phraseText(PHRASES[i], s.mine)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** سطر الترجمة تحت الرسالة */
export function TranslatedLine({ text, to, mine }: { text: string; to: TLang; mine?: boolean }) {
  const t = useT();
  const [out, setOut] = useState<{ text: string | null; same: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    translate(text, to).then((r) => alive && setOut({ text: r.text, same: r.text === text }));
    return () => { alive = false; };
  }, [text, to]);
  if (!out || out.same) return null;
  return (
    <div className={`mt-1.5 border-t pt-1.5 text-[12.5px] leading-5 ${mine ? "border-white/25" : "border-black/15"}`}>
      <span className="mb-0.5 flex items-center gap-0.5 text-[10px] font-bold opacity-70"><Languages size={10} />{TLANG_NAMES[to]}</span>
      {out.text ? <div dir="auto">{out.text}</div> : <span className="text-[11px] italic opacity-60">{t("الترجمة الكاملة تحتاج الباك إند", "Full translation needs the backend")}</span>}
    </div>
  );
}
