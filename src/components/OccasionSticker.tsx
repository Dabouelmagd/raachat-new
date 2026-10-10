/** ملصقات تهاني ومناسبات: فرعون + شكل المناسبة + كلمة بالعربي. بتتبعت كنص [[occ:النوع]]. */
import { PharaohEmoji } from "./PharaohEmoji";

type Occ = { k: string; ar: string; en: string; face: string; props: [string, string]; from: string; to: string; ink?: string };

export const OCCASIONS: Occ[] = [
  { k: "morning", ar: "صباح الخير", en: "Good morning", face: "smile", props: ["☀️", "☕"], from: "#FFD34E", to: "#FF9F43", ink: "#5a2d00" },
  { k: "evening", ar: "مساء الخير", en: "Good evening", face: "wink", props: ["🌙", "✨"], from: "#3b4cca", to: "#1d2466" },
  { k: "night", ar: "تصبحوا على خير", en: "Good night", face: "sleep", props: ["⭐", "🌙"], from: "#243b6b", to: "#0e1a3a" },
  { k: "friday", ar: "جمعة مباركة", en: "Blessed Friday", face: "smile", props: ["🕌", "🌿"], from: "#2e9e6b", to: "#146b46" },
  { k: "ramadan", ar: "رمضان كريم", en: "Ramadan Kareem", face: "smile", props: ["🏮", "🌙"], from: "#6a3fb8", to: "#2c1b66" },
  { k: "eid", ar: "عيد مبارك", en: "Eid Mubarak", face: "laugh", props: ["🎉", "🌙"], from: "#14a085", to: "#0b5e63" },
  { k: "yeartea", ar: "كل سنة وإنت طيب", en: "Happy holiday", face: "love", props: ["🎁", "💛"], from: "#e95b7b", to: "#a52a5a" },
  { k: "birthday", ar: "عيد ميلاد سعيد", en: "Happy birthday", face: "laugh", props: ["🎂", "🎈"], from: "#ff7eb6", to: "#c13a8a" },
  { k: "xmas", ar: "ميلاد مجيد", en: "Merry Christmas", face: "smile", props: ["🎄", "⛄"], from: "#c0392b", to: "#7a1d14" },
  { k: "spring", ar: "شم النسيم", en: "Sham El-Nessim", face: "smile", props: ["🥚", "🌷"], from: "#9be15d", to: "#2fa84f", ink: "#0f3d1b" },
  { k: "mother", ar: "عيد الأم", en: "Mother's Day", face: "love", props: ["💐", "❤️"], from: "#ffa6c9", to: "#e0558f", ink: "#5b0f33" },
  { k: "newyear", ar: "سنة جديدة سعيدة", en: "Happy new year", face: "cool", props: ["🎆", "🥂"], from: "#1c1c3c", to: "#4b2a7a" },
  { k: "congrats", ar: "ألف مبروك", en: "Congratulations", face: "laugh", props: ["🎊", "👏"], from: "#f7b733", to: "#e8590c", ink: "#4a1d00" },
  { k: "thanks", ar: "شكرًا", en: "Thank you", face: "thumbs", props: ["🙏", "🌹"], from: "#4facfe", to: "#2b6fd6" },
  { k: "getwell", ar: "ألف سلامة", en: "Get well soon", face: "cry", props: ["🌹", "🤍"], from: "#8fd3f4", to: "#4b9cd3", ink: "#0d3350" },
  { k: "miss", ar: "وحشتني", en: "I miss you", face: "kiss", props: ["💛", "🫶"], from: "#ff8a65", to: "#d84343" },
];

const TOKEN = /^\[\[occ:([a-z]+)\]\]$/;
export const occKind = (text: string): string | null => {
  const m = TOKEN.exec(text.trim());
  return m && OCCASIONS.some((o) => o.k === m[1]) ? m[1] : null;
};
export const occToken = (k: string) => `[[occ:${k}]]`;

export function OccasionSticker({ kind, size = 140 }: { kind: string; size?: number }) {
  const o = OCCASIONS.find((x) => x.k === kind) ?? OCCASIONS[0];
  const f = size / 140;
  return (
    <div role="img" aria-label={o.ar} style={{
      width: size, height: size, borderRadius: 22 * f, position: "relative", overflow: "hidden", flexShrink: 0,
      background: `linear-gradient(145deg, ${o.from}, ${o.to})`, boxShadow: "inset 0 0 0 2px rgba(255,255,255,.28)",
    }}>
      <span style={{ position: "absolute", top: 5 * f, insetInlineStart: 8 * f, fontSize: 26 * f }}>{o.props[0]}</span>
      <span style={{ position: "absolute", top: 5 * f, insetInlineEnd: 8 * f, fontSize: 26 * f }}>{o.props[1]}</span>
      <div style={{ position: "absolute", top: 18 * f, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <PharaohEmoji kind={o.face} size={84 * f} />
      </div>
      <div style={{
        position: "absolute", left: 6 * f, right: 6 * f, bottom: 6 * f, height: 30 * f, borderRadius: 999,
        background: "rgba(255,255,255,.92)", color: o.ink ?? o.to, display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: (o.ar.length > 11 ? 12 : 14) * f, whiteSpace: "nowrap",
      }}>{o.ar}</div>
    </div>
  );
}
