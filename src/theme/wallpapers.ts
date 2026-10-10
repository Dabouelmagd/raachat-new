import { useSyncExternalStore, type CSSProperties } from "react";

/** خلفيات الشات: بلاطات SVG مكررة بزخارف فرعونية فوق لون/تدرج أساسي. */
const M: Record<string, string> = {
  ankh: '<ellipse cx="12" cy="7" rx="3.3" ry="4.6"/><path d="M12 11.6V23M6.5 15.5h11"/>',
  eye: '<path d="M2 11c4-5.5 12-5.5 16 0-4 4.5-12 4.5-16 0z"/><circle cx="10" cy="11" r="2.3"/><path d="M10 15.5v3.5l-3 3M14 15c2.2 1 4 3 4 5.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22M5 5l2.4 2.4M16.6 16.6L19 19M19 5l-2.4 2.4M7.4 16.6L5 19"/>',
  lotus: '<path d="M12 21c-4.5 0-7.5-3-8.5-8.5 3.2 0 6.2 2.2 8.5 5.5 2.3-3.3 5.3-5.5 8.5-5.5C19.5 18 16.5 21 12 21z"/><path d="M12 18C8.8 15 8.8 8.5 12 3c3.2 5.5 3.2 12 0 15z"/>',
  pyramid: '<path d="M2 20L12 4l10 16z"/><path d="M12 4v16M7 12h10"/>',
  scarab: '<ellipse cx="12" cy="13.5" rx="5" ry="6"/><path d="M12 7.5v12M7 11.5l-4.5-3M17 11.5l4.5-3M7 15.5l-4.5 3M17 15.5l4.5 3M9.5 7.5L8 4M14.5 7.5L16 4"/>',
  feather: '<path d="M12 2c5 4.5 5 12.5 0 20-5-7.5-5-15.5 0-20z"/><path d="M12 2v20M12 8.5l3.5-2M12 13l3.5-2M12 8.5l-3.5-2M12 13l-3.5-2"/>',
  cartouche: '<rect x="3" y="6.5" width="18" height="11" rx="5.5"/><path d="M18 4.5v15M8 12h5"/>',
  was: '<path d="M8 3h4v3c0 3-1.5 4-1.5 8V21M10.5 21h-3M12 3l3 1"/><path d="M16 17c1.5 1 2.5 2 4 4"/>',
  zig: '<path d="M1 14l4-6 4 6 4-6 4 6 4-6 2 3"/>',
};

export interface Wallpaper {
  id: string;
  ar: string;
  en: string;
  /** لون/تدرج الخلفية */
  base: string;
  motifs: string[];
  stroke: string;
  opacity: number;
  /** صورة خلفية كاملة (بتتغطّى بطبقة غامقة خفيفة عشان القراءة) */
  photo?: string;
}

const img = (n: string) => new URL(`../assets/wp/${n}.jpg`, import.meta.url).href;

export const WALLPAPERS: Wallpaper[] = [
  { id: "nile", ar: "ليل النيل", en: "Nile night", base: "linear-gradient(180deg,#0e1b24,#12262f)", motifs: ["ankh", "lotus", "eye"], stroke: "#C9A227", opacity: 0.16 },
  { id: "ra", ar: "غروب رع", en: "Ra sunset", base: "linear-gradient(160deg,#3a1511,#7a2a1e 60%,#a8452c)", motifs: ["sun", "feather", "sun"], stroke: "#F5C46B", opacity: 0.2 },
  { id: "papyrus", ar: "بردية", en: "Papyrus", base: "#efe3c8", motifs: ["cartouche", "scarab", "ankh"], stroke: "#7a5a2e", opacity: 0.2 },
  { id: "lapis", ar: "لازورد", en: "Lapis", base: "linear-gradient(180deg,#0b1f4a,#13306b)", motifs: ["eye", "was", "ankh"], stroke: "#D8B84A", opacity: 0.22 },
  { id: "dunes", ar: "كثبان وأهرامات", en: "Dunes", base: "linear-gradient(180deg,#e9cf9c,#d9b574)", motifs: ["pyramid", "sun", "pyramid"], stroke: "#8a5a22", opacity: 0.22 },
  { id: "emerald", ar: "زمرد", en: "Emerald", base: "linear-gradient(180deg,#0c2a22,#12382d)", motifs: ["scarab", "feather", "lotus"], stroke: "#D9C16A", opacity: 0.18 },
  { id: "royal", ar: "أسود وذهب", en: "Black & gold", base: "#120e0d", motifs: ["zig", "cartouche", "zig"], stroke: "#C9A227", opacity: 0.2 },
  { id: "rose", ar: "وردي النيل", en: "Nile rose", base: "linear-gradient(180deg,#f6dcd3,#efc3b4)", motifs: ["lotus", "ankh", "lotus"], stroke: "#a3443a", opacity: 0.2 },
  { id: "p-eye-cosmos", ar: "عين حورس الكونية", en: "Cosmic Eye of Horus", base: "#000", motifs: [], stroke: "#000", opacity: 0, photo: img("eye-cosmos") },
  { id: "p-eye-gold", ar: "عين حورس الذهبية", en: "Golden Eye of Horus", base: "#000", motifs: [], stroke: "#000", opacity: 0, photo: img("eye-gold") },
  { id: "p-temple", ar: "معبد الشمس", en: "Sun temple", base: "#000", motifs: [], stroke: "#000", opacity: 0, photo: img("temple") },
  { id: "p-hiero-black", ar: "هيروغليفية ذهبية", en: "Gold hieroglyphs", base: "#000", motifs: [], stroke: "#000", opacity: 0, photo: img("hiero-black") },
  { id: "p-pyramid", ar: "هرم تحت النجوم", en: "Pyramid under stars", base: "#000", motifs: [], stroke: "#000", opacity: 0, photo: img("pyramid-night") },
  { id: "p-corridor", ar: "ممر المعبد", en: "Temple corridor", base: "#000", motifs: [], stroke: "#000", opacity: 0, photo: img("corridor") },
  { id: "plain", ar: "سادة", en: "Plain", base: "transparent", motifs: [], stroke: "#000", opacity: 0 },
];

function tile(w: Wallpaper): string {
  if (!w.motifs.length) return "";
  const pos = [[14, 14, 0], [78, 70, 12], [20, 92, -10]];
  const g = w.motifs
    .map((k, i) => {
      const [x, y, r] = pos[i % pos.length];
      return `<g transform="translate(${x} ${y}) rotate(${r} 17 17) scale(1.4)">${M[k]}</g>`;
    })
    .join("");
  const dots = `<circle cx="64" cy="22" r="1.5"/><circle cx="108" cy="44" r="1.5"/><circle cx="52" cy="120" r="1.5"/><circle cx="118" cy="110" r="1.5"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140"><g fill="none" stroke="${w.stroke}" stroke-opacity="${w.opacity}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${g}</g><g fill="${w.stroke}" fill-opacity="${w.opacity}">${dots}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function wallpaperStyle(id: string): CSSProperties {
  const w = WALLPAPERS.find((x) => x.id === id) ?? WALLPAPERS[0];
  if (w.photo) return { backgroundImage: `linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38)), url("${w.photo}")`, backgroundSize: "cover", backgroundPosition: "center" };
  const t = tile(w);
  const bg = w.base.startsWith("linear") ? w.base : `linear-gradient(${w.base},${w.base})`;
  if (w.id === "plain") return {};
  return { backgroundImage: t ? `${t}, ${bg}` : bg, backgroundSize: t ? "140px 140px, cover" : "cover" };
}

const KEY = "rachat-wallpaper";
let cur = "nile";
try { cur = localStorage.getItem(KEY) || "nile"; } catch { /* ignore */ }
const subs = new Set<() => void>();
export function setWallpaper(id: string) {
  cur = id;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  subs.forEach((f) => f());
}
export function useWallpaper(): string {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur);
}
