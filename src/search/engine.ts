import { tr } from "../i18n";
import type { Contact, Message, Story, Thread, VoiceRoom } from "../types";
import { PUBLIC_GROUPS } from "../data/groups";
import { SERVICES, OFFERS } from "../data/services";

/**
 * محرك البحث العميق (محلي للديمو).
 * بيعمل: تطبيع عربي (همزات/ياء/تاء مربوطة/تشكيل/أرقام)، تجذيع خفيف، قواميس مرادفات عربي+إنجليزي،
 * مطابقة تقريبية (typo)، فهم نية السؤال («من مريم»، «جروبات»، «خدمات»…)، وتجميع إجابة من أكتر من نوع.
 * ده نفس شكل الـ API المتوقع من الباك إند (POST /search/ai) — راجع src/search/aiSearch.ts.
 */

export type Kind = "message" | "chat" | "person" | "group" | "room" | "service" | "offer" | "setting" | "story";

export interface Doc {
  id: string;
  kind: Kind;
  title: string;
  body: string;
  meta: string;
  to: string; // مسار الفتح
  threadId?: string;
  contactId?: string;
  sub?: string; // سطر ثانوي للعرض (اسم الشات/المؤلف…)
}

export interface Hit {
  doc: Doc;
  score: number;
  via: "exact" | "synonym" | "fuzzy";
}

export interface SearchContext {
  contacts: Contact[];
  threads: Thread[];
  messages: Message[];
  rooms: VoiceRoom[];
  stories: Story[];
}

// ---------- تطبيع ----------
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stem(w: string): string {
  if (/^[a-z0-9]+$/.test(w)) return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
  let x = w.replace(/^(وال|بال|كال|فال|لل|ال)/, "");
  if (x.length > 4) x = x.replace(/(ات|ان|ين|ون|ها|هم)$/, "");
  if (x.length > 3) x = x.replace(/[هي]$/, "");
  return x.length >= 2 ? x : w;
}

const toks = (s: string) => norm(s).split(" ").filter(Boolean).map(stem);

const STOP = new Set(
  ("في من علي على الي الى عن مع ده دي دا هو هي انا انت اللي لو او و يا ايه ازاي فين امتي ليه عايز عايزه عاوز عاوزه ممكن لقيلي دورلي ابحث دور هات وريني ورني اعرض " +
    "the a an of in on to for with my me is are was show find search where what how get i want need please about and or")
    .split(" ")
    .map((w) => stem(norm(w)))
);

// ---------- مرادفات (مفهوم = مجموعة كلمات عربي/إنجليزي) ----------
const CONCEPTS: string[][] = [
  ["فاتوره", "فواتير", "دفع", "ادفع", "سداد", "حساب", "bill", "bills", "pay", "payment", "invoice"],
  ["كهرباء", "نور", "تيار", "electricity", "power", "electric"],
  ["مياه", "ميه", "مايه", "water", "شرب"],
  ["غاز", "gas"],
  ["انترنت", "نت", "واي فاي", "wifi", "internet", "راوتر"],
  ["شحن", "رصيد", "كارت", "recharge", "topup", "top", "credit", "balance"],
  ["موبايل", "محمول", "تليفون", "mobile", "phone", "خط"],
  ["تامين", "قسط", "وثيقه", "insurance", "premium", "policy"],
  ["محفظه", "فلوس", "مبلغ", "جنيه", "wallet", "money", "cash", "egp"],
  ["خصم", "عرض", "عروض", "كود", "كوبون", "تخفيض", "offer", "offers", "discount", "coupon", "promo", "deal"],
  ["ملف", "مرفق", "ورقه", "مستند", "ملفات", "file", "files", "document", "attachment", "doc"],
  ["اجتماع", "ميتنج", "مقابله", "meeting", "call", "مكالمه"],
  ["تصميم", "ديزاين", "design", "ui", "ux", "شعار", "logo"],
  ["مراجعه", "راجع", "review", "check", "فحص"],
  ["غرفه", "غرف", "room", "rooms", "صوتيه", "voice"],
  ["مجموعة", "مجموعه", "مجموعات", "group", "groups", "team", "فريق"],
  ["لغه", "language", "عربي", "english", "انجليزي", "انجليزيه"],
  ["اشعار", "اشعارات", "تنبيه", "notification", "notifications", "alert"],
  ["رنه", "نغمه", "صوت", "ringtone", "sound", "tone", "ring", "اهتزاز", "vibration", "vibrate"],
  ["خصوصيه", "privacy", "امان", "security", "حمايه", "حظر", "block"],
  ["جلسه", "جلسات", "session", "sessions", "جهاز", "device"],
  ["وضع", "فاتح", "داكن", "theme", "dark", "light", "mode", "ثيم"],
  ["صوره", "بروفايل", "profile", "avatar", "حالتي", "status"],
  ["كوره", "ماتش", "football", "match", "soccer"],
  ["اكل", "وصفه", "وصفات", "طبخ", "food", "recipe", "recipes", "مطعم"],
  ["برمجه", "كود", "مطور", "مطورين", "developer", "developers", "code", "coding", "dev"],
  ["شغل", "وظيفه", "work", "job", "jobs", "عمل"],
];
const CONCEPT_OF = new Map<string, number[]>();
CONCEPTS.forEach((group, i) =>
  group.forEach((w) => {
    const k = stem(norm(w));
    CONCEPT_OF.set(k, [...(CONCEPT_OF.get(k) ?? []), i]);
  })
);
const sameConcept = (a: string, b: string) => {
  const x = CONCEPT_OF.get(a);
  const y = CONCEPT_OF.get(b);
  return !!x && !!y && x.some((i) => y.includes(i));
};

const KIND_WORDS: Record<string, Kind> = {};
const addKind = (k: Kind, ws: string[]) => ws.forEach((w) => (KIND_WORDS[stem(norm(w))] = k));
addKind("message", ["رساله", "رسايل", "رسائل", "message", "messages", "كلام"]);
addKind("group", ["مجموعة", "مجموعات", "groups", "group"]);
addKind("room", ["غرفه", "غرف", "room", "rooms"]);
addKind("service", ["خدمه", "خدمات", "service", "services"]);
addKind("person", ["شخص", "اشخاص", "اسم", "contact", "contacts", "people", "person"]);
addKind("setting", ["اعداد", "اعدادات", "setting", "settings"]);
addKind("offer", ["عرض", "عروض", "offer", "offers"]);

// ---------- بناء الفهرس ----------
const SETTINGS = (): Doc[] => {
  const s = (id: string, ar: string, en: string, kwAr: string, kwEn: string, to: string): Doc => ({
    id: `set_${id}`,
    kind: "setting",
    title: tr(ar, en),
    body: tr(kwAr, kwEn),
    meta: `${kwAr} ${kwEn}`,
    to,
    sub: tr("الإعدادات", "Settings"),
  });
  return [
    s("lang", "لغة التطبيق", "App language", "تغيير اللغة عربي إنجليزي", "change language arabic english", "/account"),
    s("theme", "الوضع الفاتح", "Light mode", "الوضع الداكن الفاتح المظهر", "dark light theme appearance", "/account"),
    s("privacy", "الخصوصية والأمان", "Privacy & security", "إخفاء الرقم لقطة الشاشة حظر", "hide phone number screenshot block", "/account"),
    s("notif", "الإشعارات", "Notifications", "تنبيهات الرسائل الجروبات المكالمات", "alerts messages groups calls", "/notifications"),
    s("ring", "رنّة المكالمة", "Call ringtone", "نغمة صوت حجاز النيل المعبد سيستروم جرس", "sound tone hijaz nile temple sistrum bell", "/notifications"),
    s("vib", "الاهتزاز", "Vibration", "اهتزاز الرنة الرسائل", "vibrate ringtone messages", "/notifications"),
    s("sessions", "الجلسات النشطة", "Active sessions", "الأجهزة المتصلة تسجيل خروج جهاز", "connected devices sign out device", "/sessions"),
    s("profile", "الملف الشخصي", "Profile", "الاسم الصورة الحالة البروفايل", "name photo status profile avatar", "/profile"),
  ];
}

export function buildIndex(ctx: SearchContext): Doc[] {
  const docs: Doc[] = [];
  const threadName = (id: string) => ctx.threads.find((t) => t.id === id)?.name ?? "";
  ctx.messages
    .filter((m) => !m.deleted)
    .forEach((m) =>
      docs.push({
        id: m.id,
        kind: "message",
        title: m.text || m.attachment?.name || "",
        body: m.attachment ? `${m.attachment.name} ${tr("ملف مرفق", "attachment file")}` : "",
        meta: `${m.authorName} ${threadName(m.threadId)}`,
        to: `/chat/${m.threadId}`,
        threadId: m.threadId,
        sub: [m.authorName, threadName(m.threadId) !== m.authorName ? threadName(m.threadId) : "", m.time].filter(Boolean).join(" · "),
      })
    );
  ctx.threads.forEach((t) =>
    docs.push({
      id: t.id,
      kind: "chat",
      title: t.name,
      body: t.type === "group" ? tr("مجموعة", "group") : tr("محادثة", "chat"),
      meta: "",
      to: `/chat/${t.id}`,
      threadId: t.id,
      sub: t.type === "group" ? tr("مجموعة", "Group") : tr("محادثة", "Chat"),
    })
  );
  ctx.contacts.forEach((c) =>
    docs.push({ id: c.id, kind: "person", title: c.name, body: "", meta: "", to: "/", contactId: c.id, sub: tr("جهة اتصال", "Contact") })
  );
  PUBLIC_GROUPS.forEach((g) =>
    docs.push({ id: g.id, kind: "group", title: g.name, body: g.desc, meta: "", to: "/groups", sub: tr("مجموعة عامة", "Public group") })
  );
  ctx.rooms.forEach((r) =>
    docs.push({
      id: r.id,
      kind: "room",
      title: r.name,
      body: r.participants.map((p) => p.name).join(" "),
      meta: tr("غرفة صوتية", "voice room"),
      to: "/rooms",
      sub: tr("غرفة صوتية", "Voice room"),
    })
  );
  ctx.stories.forEach((s) =>
    docs.push({ id: s.id, kind: "story", title: s.caption, body: "", meta: s.authorName, to: "/", sub: `${tr("قصص", "Story")} · ${s.authorName}` })
  );
  SERVICES.forEach((s) =>
    docs.push({ id: `svc_${s.key}`, kind: "service", title: s.label, body: s.biller, meta: `${s.field} ${s.hint} فاتورة دفع bill payment`, to: `/pay/${s.key}`, sub: tr("خدمة دفع", "Payment service") })
  );
  OFFERS.forEach((o) =>
    docs.push({
      id: `off_${o.code}`,
      kind: "offer",
      title: o.title,
      body: o.desc,
      meta: `${o.code} ${o.appliesTo.join(" ")} خصم عرض discount offer off`,
      to: "/services",
      sub: `${tr("عرض", "Offer")} · ${o.code}`,
    })
  );
  docs.push(...SETTINGS());
  return docs;
}

// ---------- فهم السؤال ----------
export interface Interpretation {
  topic: string[];
  kinds: Kind[];
  person?: string;
  expanded: string[];
}

function levenshtein1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function parseQuery(q: string, contacts: Contact[]) {
  let rest = norm(q);
  let person: Contact | undefined;
  const m = rest.match(/(?:^| )(?:من|from|by)\s+(\S+)/);
  if (m) {
    const nm = m[1];
    person = contacts.find((c) => norm(c.name).split(" ").some((w) => stem(w) === stem(nm) || w.startsWith(nm)));
    if (person) rest = rest.replace(m[0], " ");
  }
  const kinds: Kind[] = [];
  const topic: string[] = [];
  rest.split(" ").filter(Boolean).forEach((w) => {
    const s = stem(w);
    if (KIND_WORDS[s]) { kinds.push(KIND_WORDS[s]); return; }
    if (STOP.has(s)) return;
    topic.push(s);
  });
  return { topic, kinds: Array.from(new Set(kinds)), person };
}

// ---------- مطابقة ----------
type MatchKind = 0 | "exact" | "synonym" | "fuzzy";
function matchToken(q: string, dt: string[], deep: boolean): { w: number; kind: MatchKind } {
  let best = 0;
  let kind: MatchKind = 0;
  for (const d of dt) {
    let w = 0;
    let k: MatchKind = 0;
    if (d === q) { w = 1; k = "exact"; }
    else if (q.length >= 3 && d.length >= 3 && (d.startsWith(q) || q.startsWith(d))) { w = 0.75; k = "exact"; }
    else if (deep && sameConcept(q, d)) { w = 0.6; k = "synonym"; }
    else if (deep && q.length >= 4 && d.length >= 4 && levenshtein1(q, d)) { w = 0.5; k = "fuzzy"; }
    if (w > best) { best = w; kind = k; }
    if (best === 1) break;
  }
  return { w: best, kind };
}

export function runSearch(
  docs: Doc[],
  ctx: SearchContext,
  query: string,
  opts: { deep: boolean; kinds?: Kind[] }
): { hits: Hit[]; interp: Interpretation } {
  const { topic, kinds: wantKinds, person } = parseQuery(query, ctx.contacts);
  const expanded = new Set<string>();
  if (opts.deep) {
    topic.forEach((t) => (CONCEPT_OF.get(t) ?? []).forEach((i) => CONCEPTS[i].forEach((w) => expanded.add(w))));
  }
  const interp: Interpretation = { topic, kinds: wantKinds, person: person?.name, expanded: Array.from(expanded).slice(0, 8) };
  const allowed = new Set<Kind>([...(opts.kinds ?? []), ...wantKinds]);
  const hits: Hit[] = [];
  const df: number[] = topic.map(() => 0);
  const cand: { doc: Doc; per: { w: number; k: MatchKind }[] }[] = [];

  for (const doc of docs) {
    if (allowed.size && !allowed.has(doc.kind)) continue;
    if (person) {
      if (doc.kind !== "message" && doc.kind !== "story" && doc.kind !== "person" && doc.kind !== "chat") continue;
      if (doc.kind === "person" && doc.contactId !== person.id) continue;
      if (doc.kind === "chat" && norm(doc.title) !== norm(person.name)) continue;
      if ((doc.kind === "message" || doc.kind === "story") && !norm(doc.meta).includes(norm(person.name).split(" ")[0])) continue;
    }
    if (!topic.length) {
      // سؤال بدون موضوع: نوع فقط أو شخص فقط
      if (person || wantKinds.length) hits.push({ doc, score: 1, via: "exact" });
      continue;
    }
    const tTitle = toks(doc.title);
    const tBody = toks(doc.body);
    const tMeta = toks(doc.meta);
    const per = topic.map((q) => {
      const x = matchToken(q, tTitle, opts.deep);
      const y = matchToken(q, tBody, opts.deep);
      const z = matchToken(q, tMeta, opts.deep);
      const w = Math.max(x.w * 3, y.w * 1.6, z.w * 1);
      const k = x.w * 3 >= y.w * 1.6 && x.w * 3 >= z.w ? x.kind : y.w * 1.6 >= z.w ? y.kind : z.kind;
      return { w, k };
    });
    per.forEach((p, i) => { if (p.w > 0) df[i]++; });
    cand.push({ doc, per });
    continue;
  }
  const N = Math.max(1, docs.length);
  const idf = df.map((d) => Math.log(1 + N / (1 + d)));
  for (const { doc, per } of cand) {
    let sum = 0, matched = 0, via: Hit["via"] = "exact";
    per.forEach((p, i) => {
      if (p.w <= 0) return;
      matched++;
      sum += p.w * idf[i];
      if (p.k === "fuzzy") via = "fuzzy";
      else if (p.k === "synonym" && via !== "fuzzy") via = "synonym";
    });
    const coverage = matched / topic.length;
    if (opts.deep ? coverage < 0.5 : coverage < 1) continue;
    let score = sum * (0.35 + 0.65 * coverage);
    if (doc.kind === "service" || doc.kind === "setting" || doc.kind === "offer") score *= 1.15;
    if (doc.kind === "message") score *= 0.95;
    hits.push({ doc, score, via });
  }
  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, 40), interp };
}

// ---------- تجميع إجابة (محاكاة ذكاء اصطناعي) ----------
export function composeAnswer(query: string, hits: Hit[], interp: Interpretation): string {
  if (!hits.length && interp.person) {
    return tr(
      `لا يوجد ما يطابق من ${interp.person} بعد.`,
      `Nothing matching from ${interp.person} yet.`
    );
  }
  if (!hits.length) {
    return tr(
      `لم أجد ما يطابق «${query}». جرّب كلمات أبسط أو اسم شخص أو خدمة (مثل «كهرباء» أو «ملف مريم»).`,
      `I couldn't find anything matching “${query}”. Try simpler words, a person's name or a service (e.g. “electricity” or “Mariam's file”).`
    );
  }
  const by = (k: Kind) => hits.filter((h) => h.doc.kind === k);
  const parts: string[] = [];
  const svc = by("service")[0];
  const svcKey = svc?.doc.id.replace("svc_", "");
  const off = svc ? by("offer").find((o) => o.doc.meta.split(" ").includes(svcKey!)) : by("offer")[0];
  const msg = by("message")[0];
  const set = by("setting")[0];
  const grp = interp.kinds.includes("group") || interp.kinds.includes("room") ? by("group")[0] ?? by("room")[0] : undefined;
  if (svc) {
    parts.push(
      tr(
        `يمكنك دفع «${svc.doc.title}» مباشرة من المحفظة (${svc.doc.body}).`,
        `You can pay “${svc.doc.title}” straight from your wallet (${svc.doc.body}).`
      )
    );
  }
  if (off) parts.push(tr(`وهناك عرض مناسب: ${off.doc.title} بكود ${off.doc.meta.split(" ")[0]}.`, `A matching offer: ${off.doc.title} with code ${off.doc.meta.split(" ")[0]}.`));
  if (set) parts.push(tr(`هذا الإعداد موجود في: ${set.doc.title}.`, `That setting lives in: ${set.doc.title}.`));
  if (msg) {
    parts.push(
      tr(
        `أقرب رسالة: «${msg.doc.title}» (${msg.doc.sub}).`,
        `Closest message: “${msg.doc.title}” (${msg.doc.sub}).`
      )
    );
  }
  if (grp) parts.push(tr(`ومكان مناسب للنقاش: ${grp.doc.title}.`, `A good place to discuss it: ${grp.doc.title}.`));
  if (!parts.length) parts.push(tr(`وجدت ${hits.length} نتيجة قريبة من «${query}».`, `Found ${hits.length} results close to “${query}”.`));
  if (interp.person) parts.unshift(tr(`قصرتُ النتائج على ${interp.person}.`, `Filtered to ${interp.person}.`));
  return parts.join(" ");
}

// ---------- تظليل ----------
export function highlightParts(text: string, topic: string[], expanded: string[]): { t: string; hit: boolean }[] {
  const wants = new Set([...topic, ...expanded.map((w) => stem(norm(w)))]);
  const out: { t: string; hit: boolean }[] = [];
  text.split(/(\s+)/).forEach((w) => {
    const s = stem(norm(w));
    const hit = !!s && [...wants].some((q) => q === s || (q.length >= 3 && s.length >= 3 && (s.startsWith(q) || q.startsWith(s))));
    out.push({ t: w, hit });
  });
  return out;
}

export const SUGGESTIONS = () => [
  tr("فاتورة الكهرباء", "electricity bill"),
  tr("الملف اللي مريم بعتته", "the file Mariam sent"),
  tr("رسايل من يوسف", "messages from Youssef"),
  tr("عروض الخصم", "discount offers"),
  tr("كيف أغيّر اللغة", "how to change language"),
  tr("غرف صوتية", "voice rooms"),
];
