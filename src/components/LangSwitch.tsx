import { LANGS, setLang, useLang, type Lang } from "../i18n";

const NAMES: Record<Lang, string> = { ar: "العربية", en: "English", zh: "中文", fr: "Français" };

/** مبدّل اللغة: عربي / English / 中文 / Français */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const opts = LANGS.map((id) => ({ id, label: NAMES[id] }));
  return (
    <div role="radiogroup" aria-label="Language / اللغة" className={`inline-grid grid-cols-4 gap-1 rounded-xl bg-rachat-card p-1 ${className}`}>
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={lang === o.id}
          onClick={() => setLang(o.id)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${lang === o.id ? "bg-rachat-red text-white" : "text-neutral-400"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
