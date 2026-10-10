import { API_ON } from "../api/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Sparkles, MessageSquare, User, Users, Mic, Receipt, Tag, Settings as Cog, Image as ImageIcon, History, Check, Loader2 } from "lucide-react";
import { Header } from "../components/Header";
import { useLang, useT } from "../i18n";
import { useAppActions, useAppState } from "../store/AppContext";
import { aiSearch, type SearchResponse } from "../search/aiSearch";
import { highlightParts, SUGGESTIONS, type Doc, type Kind } from "../search/engine";

const RKEY = "rachat-recent-search";
const loadRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RKEY) || "[]"); } catch { return []; }
};
const saveRecent = (list: string[]) => {
  try { localStorage.setItem(RKEY, JSON.stringify(list.slice(0, 6))); } catch { /* تجاهل */ }
};

const KIND_ICON: Record<Kind, typeof Search> = {
  message: MessageSquare, chat: MessageSquare, person: User, group: Users, room: Mic,
  service: Receipt, offer: Tag, setting: Cog, story: ImageIcon,
};

type Filter = "all" | "message" | "person" | "group" | "room" | "service" | "setting";

export default function SearchScreen() {
  const t = useT();
  const lang = useLang();
  const nav = useNavigate();
  const state = useAppState();
  const { createDm } = useAppActions();
  const [q, setQ] = useState("");
  const [deep, setDeep] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [res, setRes] = useState<SearchResponse | null>(null);
  const [step, setStep] = useState(-1); // خطوات «التفكير» في البحث العميق
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const seq = useRef(0);

  const kindLabel: Record<Kind, string> = {
    message: t("رسائل", "Messages"), chat: t("محادثات", "Chats"), person: t("أشخاص", "People"), group: t("جروبات", "Groups"),
    room: t("غرف", "Rooms"), service: t("خدمات", "Services"), offer: t("عروض", "Offers"), setting: t("إعدادات", "Settings"), story: t("ستوري", "Stories"),
  };
  const filters: { id: Filter; label: string; kinds?: Kind[] }[] = [
    { id: "all", label: t("الكل", "All") },
    { id: "message", label: t("رسائل", "Messages"), kinds: ["message", "chat"] },
    { id: "person", label: t("أشخاص", "People"), kinds: ["person"] },
    { id: "group", label: t("جروبات", "Groups"), kinds: ["group"] },
    { id: "room", label: t("غرف", "Rooms"), kinds: ["room"] },
    { id: "service", label: t("خدمات وعروض", "Services & offers"), kinds: ["service", "offer"] },
    { id: "setting", label: t("إعدادات", "Settings"), kinds: ["setting"] },
  ];
  const steps = [
    t("فهم السؤال", "Understanding the question"),
    t("البحث في الرسائل والجهات", "Searching chats & contacts"),
    t("البحث في الخدمات والإعدادات", "Searching services & settings"),
    t("تجميع الإجابة", "Composing the answer"),
  ];

  useEffect(() => {
    const query = q.trim();
    if (!query) { setRes(null); setStep(-1); return; }
    const my = ++seq.current;
    const kinds = filters.find((f) => f.id === filter)?.kinds;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = async () => {
      const r = await aiSearch(query, state, { deep, kinds });
      if (my === seq.current) { setRes(r); setStep(-1); }
    };
    if (deep) {
      // محاكاة لمراحل البحث العميق (الباك إند الحقيقي بيرجّعها كـ stream)
      setStep(0);
      [1, 2, 3].forEach((s) => timers.push(setTimeout(() => my === seq.current && setStep(s), s * 280)));
      timers.push(setTimeout(run, 4 * 280));
    } else {
      timers.push(setTimeout(run, 120));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, deep, filter, state.messages.length, state.threads.length]);

  const commit = (text: string) => {
    const v = text.trim();
    if (!v) return;
    const next = [v, ...recent.filter((x) => x !== v)];
    setRecent(next);
    saveRecent(next);
  };

  const open = (d: Doc) => {
    commit(q);
    if (d.kind === "person" && d.contactId) {
      const c = state.contacts.find((x) => x.id === d.contactId);
      const th = state.threads.find((x) => x.type === "dm" && x.name === c?.name);
      if (th) nav(`/chat/${th.id}`);
      else { void Promise.resolve(createDm(d.contactId)).then((tid) => nav(API_ON ? `/chat/${tid}` : "/")); }
      return;
    }
    nav(d.to);
  };

  const grouped = useMemo(() => {
    const m = new Map<Kind, Doc[]>();
    (res?.results ?? []).forEach((h) => m.set(h.doc.kind, [...(m.get(h.doc.kind) ?? []), h.doc]));
    return Array.from(m.entries());
  }, [res]);

  const topic = res?.interpretation.topic ?? [];
  const expandedAll = res?.interpretation.expanded ?? [];
  const expanded = expandedAll.filter((w) => (lang === "ar" ? /[\u0600-\u06FF]/.test(w) : /^[a-z]/i.test(w)));
  const busy = step >= 0;

  return (
    <div className="flex h-full flex-col">
      <Header title={t("البحث", "Search")} showBack />
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-2xl bg-rachat-card px-3.5 ring-1 ring-rachat-maroon/50 focus-within:ring-rachat-red">
          <Search size={17} className="shrink-0 text-neutral-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit(q)}
            placeholder={deep ? t("اسأل أي حاجة… «فاتورة الكهرباء»", "Ask anything… “electricity bill”") : t("ابحث في الرسائل والأشخاص والخدمات", "Search chats, people and services")}
            aria-label={t("بحث", "Search")}
            className="min-w-0 flex-1 bg-transparent py-3 text-sm text-rachat-papyrus outline-none placeholder:text-neutral-500"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label={t("مسح", "Clear")} className="text-neutral-500"><X size={16} /></button>
          )}
        </div>

        <button
          role="switch"
          aria-checked={deep}
          onClick={() => setDeep(!deep)}
          className={`mt-2.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start ${deep ? "bg-gradient-to-br from-rachat-red/20 to-rachat-gold/10 ring-1 ring-rachat-gold/40" : "bg-rachat-card"}`}
        >
          <Sparkles size={16} className={deep ? "text-rachat-gold" : "text-neutral-500"} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-extrabold text-rachat-papyrus">{t("بحث عميق بالذكاء الاصطناعي", "Deep AI search")}</span>
            <span className="block text-[10.5px] leading-4 text-neutral-500">{t("بيفهم سؤالك ومرادفاته، ويدوّر في كل حاجة، ويلخّصلك الإجابة", "Understands your question and synonyms, searches everything and summarizes")}</span>
          </span>
          <span className={`relative h-5 w-9 shrink-0 rounded-full ${deep ? "bg-rachat-red" : "bg-neutral-500/60"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-rachat-cream transition-all ${deep ? "right-0.5" : "left-0.5"}`} />
          </span>
        </button>

        <div className="-mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist" aria-label={t("تصفية", "Filter")}>
          {filters.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${filter === f.id ? "bg-rachat-red text-white" : "bg-rachat-card text-neutral-400"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {!q.trim() && (
          <div className="pt-2">
            {recent.length > 0 && (
              <>
                <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-neutral-500">
                  <span className="flex items-center gap-1.5"><History size={13} /> {t("عمليات بحث سابقة", "Recent searches")}</span>
                  <button onClick={() => { setRecent([]); saveRecent([]); }} className="text-rachat-coral">{t("مسح", "Clear")}</button>
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {recent.map((r) => (
                    <button key={r} onClick={() => setQ(r)} className="rounded-full bg-rachat-card px-3 py-1.5 text-xs text-rachat-papyrus">{r}</button>
                  ))}
                </div>
              </>
            )}
            <p className="mb-2 text-[11px] font-bold text-neutral-500">{t("جرّب تسأل", "Try asking")}</p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS().map((s) => (
                <button key={s} onClick={() => setQ(s)} className="flex items-center gap-2.5 rounded-xl bg-rachat-card px-3.5 py-3 text-start text-xs text-rachat-papyrus">
                  <Sparkles size={14} className="shrink-0 text-rachat-gold" /> {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {q.trim() && busy && (
          <div className="mt-2 rounded-2xl bg-rachat-card p-3.5" role="status" aria-live="polite">
            {steps.map((s, i) => (
              <div key={s} className={`flex items-center gap-2 py-1 text-xs ${i <= step ? "text-rachat-papyrus" : "text-neutral-600"}`}>
                {i < step ? <Check size={13} className="text-emerald-400" /> : i === step ? <Loader2 size={13} className="animate-spin text-rachat-gold" /> : <span className="h-[13px] w-[13px]" />}
                {s}
              </div>
            ))}
          </div>
        )}

        {q.trim() && !busy && res && (
          <>
            {deep && res.answer && (
              <div className="mt-2 rounded-2xl bg-gradient-to-br from-rachat-red/20 to-rachat-gold/10 p-3.5 ring-1 ring-rachat-gold/40">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-rachat-gold"><Sparkles size={13} /> {t("الإجابة", "Answer")}</div>
                <p className="text-[13px] leading-6 text-rachat-papyrus">{res.answer}</p>
                {(res.interpretation.kinds.length > 0 || res.interpretation.person || expanded.length > 0) && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10.5px]">
                    {res.interpretation.person && <span className="rounded-full bg-black/30 px-2 py-0.5 text-rachat-papyrus">{t("من", "From")}: {res.interpretation.person}</span>}
                    {res.interpretation.kinds.map((k) => <span key={k} className="rounded-full bg-black/30 px-2 py-0.5 text-rachat-papyrus">{t("النوع", "Type")}: {kindLabel[k]}</span>)}
                    {expanded.length > 0 && <span className="rounded-full bg-black/30 px-2 py-0.5 text-neutral-400">{t("كلمات مرتبطة", "Related terms")}: {expanded.slice(0, 5).join(lang === "ar" ? "، " : ", ")}</span>}
                  </div>
                )}
              </div>
            )}

            <p className="mb-1 mt-3 text-[11px] text-neutral-500">
              {res.results.length > 0
                ? t(`${res.results.length} نتيجة · ${res.tookMs} م.ث`, `${res.results.length} ${res.results.length === 1 ? "result" : "results"} · ${res.tookMs} ms`)
                : t("مفيش نتائج", "No results")}
            </p>

            {grouped.map(([kind, docs]) => {
              const Icon = KIND_ICON[kind];
              return (
                <div key={kind} className="mb-3">
                  <p className="mb-1.5 mt-2 flex items-center gap-1.5 text-[11px] font-bold text-neutral-500"><Icon size={13} /> {kindLabel[kind]}</p>
                  {docs.slice(0, filter === "all" ? 4 : 20).map((d) => (
                    <button key={d.id} onClick={() => open(d)} className="mb-1.5 flex w-full items-start gap-3 rounded-xl bg-rachat-card px-3.5 py-2.5 text-start">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rachat-maroon/50 text-rachat-red"><Icon size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold leading-5 text-rachat-papyrus">
                          {highlightParts(d.title, topic, expandedAll).map((p, i) => p.hit ? <mark key={i} className="rounded bg-rachat-gold/30 px-0.5 text-inherit">{p.t}</mark> : <span key={i}>{p.t}</span>)}
                        </span>
                        {d.sub && <span className="block truncate text-[11px] text-neutral-500">{d.sub}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}

            {res.results.length === 0 && (
              <div className="mt-6 text-center text-xs text-neutral-500">
                {!deep && <button onClick={() => setDeep(true)} className="mt-2 rounded-full bg-rachat-red px-4 py-2 font-bold text-white">{t("جرّب البحث العميق", "Try deep search")}</button>}
              </div>
            )}
            <p className="mt-4 text-center text-[10px] leading-4 text-neutral-600">
              {t("نسخة الديمو بتبحث في بياناتها المحلية. الباك إند هيوصّلها بنموذج لغوي وبحث دلالي حقيقي.", "The demo searches its local data. The backend will connect a real language model and semantic search.")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
