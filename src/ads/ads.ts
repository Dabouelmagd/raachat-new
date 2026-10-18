import { useEffect, useState, useSyncExternalStore } from "react";
import { tr, num } from "../i18n";
import { API_ON, api } from "../api/client";

// ============ بيانات الإعلانات (تجريبية — تُستبدل بنداء API لخادم الإعلانات) ============
export interface Ad {
  id: string;
  advertiser: string;
  headline: string;
  body: string;
  cta: string;
  gradient: string;
  link?: string;
  placements?: string[];
  /** صورة الإعلان (مرفوعة من اللوحة). مفيش صورة = التصميم المتدرّج بالنص وحده. */
  imageUrl?: string;
}

export const ADS: Ad[] = [
  { id: "a1", get advertiser() { return tr("كافيه النيل", "Nile Café"); }, get headline() { return tr("قهوتك الصبحية علينا ☕", "Your morning coffee is on us ☕"); }, get body() { return tr("اطلب أول مشروب واحصل على الثاني مجانًا طوال هذا الأسبوع.", "Order your first drink and get the second free all week."); }, get cta() { return tr("اطلب الآن", "Order now"); }, gradient: "from-[#7a4a2a] to-rachat-black" },
  { id: "a2", get advertiser() { return tr("متجر الفرعون", "Pharaoh Store"); }, get headline() { return tr("خصم ٣٠٪ على الإلكترونيات", "30% off electronics"); }, get body() { return tr("عروض نهاية الأسبوع على الموبايلات والسماعات مع شحن مجاني.", "Weekend deals on phones and headphones with free shipping."); }, get cta() { return tr("تسوّق", "Shop"); }, gradient: "from-rachat-red to-rachat-maroon" },
  { id: "a3", get advertiser() { return tr("أكاديمية سِفر", "Sifr Academy"); }, get headline() { return tr("اتعلم برمجة من الصفر 💻", "Learn to code from scratch 💻"); }, get body() { return tr("دورة مكثفة بالعربي مع مشاريع عملية وشهادة إتمام.", "An intensive course with hands-on projects and a completion certificate."); }, get cta() { return tr("سجّل", "Sign up"); }, gradient: "from-[#2b2118] to-rachat-gold" },
  { id: "a4", get advertiser() { return tr("تأمين الأمان", "Aman Insurance"); }, get headline() { return tr("أمّن عربيتك في دقيقتين", "Insure your car in two minutes"); }, get body() { return tr("قسّط وثيقتك على ١٢ شهر بدون فوايد.", "Pay your policy over 12 months with no interest."); }, get cta() { return tr("اعرف أكتر", "Learn more"); }, gradient: "from-rachat-maroon to-[#14100F]" },
  { id: "a5", get advertiser() { return tr("مطعم ست الحبايب", "Set El-Habayeb Restaurant"); }, get headline() { return tr("وجبة عائلية بسعر خاص 🍗", "Family meal at a special price 🍗"); }, get body() { return tr("٤ أفراد + مشروبات بـ ٢٤٩ ج.م لفترة محدودة.", "4 people + drinks for EGP 249, for a limited time."); }, get cta() { return tr("احجز", "Book"); }, gradient: "from-rachat-coral to-rachat-maroon" },
  // إعلان واحد بصورة **عن قصد**: بناء الديمو مابيعملش ولا نداء شبكة، فمن غير
  // ده مسار الصورة (والرجوع للتصميم النصّي لو ما حمّلتش) مابيظهرش ولا بيتجرّب.
  { id: "a6", get advertiser() { return tr("رحلات واحة", "Waha Trips"); }, get headline() { return tr("إجازة نهاية الأسبوع 🌴", "Weekend getaway 🌴"); }, get body() { return tr("٣ أيام في سيوة شاملة الإقامة والمواصلات.", "3 days in Siwa, accommodation and transport included."); }, get cta() { return tr("احجز رحلتك", "Book your trip"); }, gradient: "from-[#C9A227] to-[#5B2621]", imageUrl: new URL("../assets/wp/pyramid-night.jpg", import.meta.url).href },
];

// ============ الجدول اليومي: ٦ إعلانات في أوقات متفرقة ============
export const ADS_PER_DAY = 6;

// ============ كتالوج الخادم (الحملات المعتمدة الشغّالة النهارده) ============
const GRADS = [
  "from-rachat-red to-rachat-maroon", "from-rachat-gold to-rachat-maroon", "from-rachat-coral to-rachat-maroon",
  "from-[#7a4a2a] to-rachat-black", "from-[#2b2118] to-rachat-gold", "from-rachat-maroon to-[#14100F]",
];
let live: Ad[] = [];
let loaded = !API_ON;
let loadedErr = false;
let catalogP: Promise<void> | null = null;
let catalogDay = "";
/** وضع الباك إند: الكتالوج من الحملات المعتمدة. وضع التجربة: الكتالوج المحلي. بيتحمّل مرة في اليوم. */
export function ensureCatalog(): Promise<void> {
  if (!API_ON) return Promise.resolve();
  if (!catalogP || catalogDay !== dayKey()) {
    catalogDay = dayKey();
    catalogP = api<{ id: string; advertiser: string; headline: string; body: string; cta: string; link: string; grad: number; placements: string[]; imageUrl?: string | null }[]>("/ads/catalog")
      .then((r) => { live = r.map((c) => ({ id: c.id, advertiser: c.advertiser, headline: c.headline, body: c.body, cta: c.cta, link: c.link, placements: c.placements, imageUrl: c.imageUrl ?? undefined, gradient: GRADS[c.grad] ?? GRADS[0] })); loadedErr = false; })
      .catch(() => { live = []; loadedErr = true; catalogP = null; })
      .finally(() => { loaded = true; emit(); });
  }
  return catalogP;
}
/** إعلانات موضع معيّن (modal | banner | services | story) */
export function adsFor(placement: string): Ad[] {
  const src = API_ON ? live : ADS;
  return API_ON ? src.filter((a) => a.placements?.includes(placement)) : src;
}
export function useCatalog(placement?: string) {
  const [, force] = useState(0);
  useEffect(() => { void ensureCatalog().then(() => force((x) => x + 1)); }, []);
  const all = API_ON ? live : ADS;
  return { list: !loaded ? null : placement ? adsFor(placement) : all, err: loadedErr };
}
const seenBanner = new Set<string>();
/** ظهور بانر: مرة واحدة لكل إعلان/موضع في اليوم من الجلسة (السيرفر كمان بيمنع تكرار المستخدم) */
export function trackBanner(adId: string, placement: string, kind: "shown" | "clicked") {
  if (!API_ON) return;
  const k = `${dayKey()}|${kind}|${placement}|${adId}`;
  if (seenBanner.has(k)) return;
  seenBanner.add(k);
  void api("/ads/events", { body: { day: dayKey(), adId, kind, placement } }).catch(() => {});
}
// نوافذ زمنية (ساعة بداية، ساعة نهاية) — داخل كل نافذة يُختار دقيقة عشوائية ثابتة لليوم
const WINDOWS: [number, number][] = [[8, 10], [10, 12], [12, 15], [15, 18], [18, 21], [21, 23]];

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 100000) / 100000; };
}

export interface Slot { index: number; minutes: number; ad: Ad; shown: boolean }

export function buildSchedule(date = new Date()): { minutes: number; ad: Ad }[] {
  const rnd = seeded(dayKey(date));
  const pool = adsFor("modal");
  if (pool.length === 0) return [];
  const offset = Math.floor(rnd() * pool.length);
  return WINDOWS.map(([a, b], i) => ({
    minutes: Math.round((a + rnd() * (b - a)) * 60),
    ad: pool[(i + offset) % pool.length],
  }));
}

export const fmtTime = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  const ap = h >= 12 ? tr("م", "PM") : tr("ص", "AM");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${num(h12)}:${num(String(mm).padStart(2, "0"))} ${ap}`;
};

// ============ حالة العرض (ما عُرض اليوم) — تُحفظ محليًا؛ تُستبدل بسجل من الخادم ============
interface AdState { day: string; shownIdx: number[]; current: Ad | null; currentSlot: number | null }
let state: AdState = { day: dayKey(), shownIdx: [], current: null, currentSlot: null };
try {
  const raw = localStorage.getItem("rachat-ads");
  if (raw) { const s = JSON.parse(raw); if (s.day === dayKey()) state = { ...state, shownIdx: s.shownIdx ?? [] }; }
} catch {}

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const persist = () => { try { localStorage.setItem("rachat-ads", JSON.stringify({ day: state.day, shownIdx: state.shownIdx })); } catch {} };

const track = (kind: "shown" | "clicked" | "closed", slot: number | null, adId: string | undefined) => {
  if (!API_ON || slot === null || !adId) return;
  void api("/ads/events", { body: { day: dayKey(), slot, adId, kind, placement: "modal" } }).catch(() => {});
};

/** وضع الباك إند: المواعيد اللي اتعرضت النهارده (حتى من جهاز تاني) تتحسب متعرضة */
export async function syncShownFromServer() {
  if (!API_ON) return;
  await ensureCatalog();
  try {
    const r = await api<{ shown: number[] }>(`/ads/today?day=${dayKey()}`);
    state = { ...state, shownIdx: Array.from(new Set([...state.shownIdx, ...r.shown])) };
    persist(); emit();
  } catch { /* تجاهل */ }
}

export function clickAd() {
  track("clicked", state.currentSlot, state.current?.id);
  const l = state.current?.link;
  if (l && /^https:\/\//.test(l)) window.open(l, "_blank", "noopener,noreferrer");
  dismissAd();
}

export function useAdState() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}

function rollDay() {
  if (state.day !== dayKey()) state = { day: dayKey(), shownIdx: [], current: null, currentSlot: null };
}

/** يفحص: هل حان موعد إعلان لم يُعرض؟ يُعرض واحد فقط في كل فحص، والمواعيد الفائتة الأقدم تُعتبر مُفوَّتة. */
export function checkDueAd(now = new Date()) {
  rollDay();
  if (state.current) return;
  const mins = now.getHours() * 60 + now.getMinutes();
  const sched = buildSchedule(now);
  let due = -1;
  sched.forEach((s, i) => { if (s.minutes <= mins && !state.shownIdx.includes(i)) due = i; });
  if (due < 0) return;
  const missed = sched.map((_, i) => i).filter((i) => i < due && !state.shownIdx.includes(i));
  state = { ...state, shownIdx: [...state.shownIdx, ...missed, due], current: sched[due].ad, currentSlot: due };
  track("shown", due, sched[due].ad.id);
  persist(); emit();
}

/** للمعاينة: اعرض الإعلان التالي غير المعروض الآن بغض النظر عن الوقت */
export function showNextAdNow() {
  rollDay();
  if (state.current) return;
  const sched = buildSchedule();
  const next = sched.findIndex((_, i) => !state.shownIdx.includes(i));
  if (next < 0) return;
  state = { ...state, shownIdx: [...state.shownIdx, next], current: sched[next].ad, currentSlot: next };
  track("shown", next, sched[next].ad.id);
  persist(); emit();
}

export function dismissAd() { track("closed", state.currentSlot, state.current?.id); state = { ...state, current: null, currentSlot: null }; emit(); }
export function resetToday() { state = { day: dayKey(), shownIdx: [], current: null, currentSlot: null }; persist(); emit(); }
