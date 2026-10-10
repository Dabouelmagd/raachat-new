/** فلاتر الكاميرا: تأثير لوني على الصورة + عناصر مرسومة (إطار/غطاء رأس/زخارف) فوق الفيديو.
 *  بتترسم على canvas فبتتسجّل جوّه الفيديو والصورة نفسها. مفيش تتبّع وجه؛ العناصر ثابتة على الإطار. */
export interface CamFilter {
  id: string;
  ar: string;
  en: string;
  emoji: string;
  css: string; // ctx.filter
  tint?: [string, number]; // طبقة لون فوق الصورة
  draw?: (c: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
}

const GOLD = "#C9A227";
const BLUE = "#1d4e9e";

function stripedLappets(c: CanvasRenderingContext2D, w: number, h: number, a: string, b: string, topH = 0.14) {
  // غطاء رأس بخطوط: حزام علوي + جانبين متدليين
  const stripe = h * 0.02;
  const bands = (x: number, wd: number, y0: number, y1: number) => {
    for (let y = y0, i = 0; y < y1; y += stripe, i++) { c.fillStyle = i % 2 ? a : b; c.fillRect(x, y, wd, stripe + 0.5); }
  };
  c.save();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h * topH); c.quadraticCurveTo(w / 2, h * (topH + 0.08), 0, h * topH); c.closePath(); c.clip();
  bands(0, w, 0, h * (topH + 0.1));
  c.restore();
  bands(0, w * 0.16, h * topH, h * 0.58);
  bands(w * 0.84, w * 0.16, h * topH, h * 0.58);
  c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(w * 0.16 - 2, h * topH, 3, h * 0.44); c.fillRect(w * 0.84 - 1, h * topH, 3, h * 0.44);
}

function collar(c: CanvasRenderingContext2D, w: number, h: number) {
  // عقد «الأوسخ» الفرعوني في أسفل الإطار
  const cx = w / 2, cy = h + h * 0.02;
  const cols = [GOLD, "#2ba6a0", "#c0392b", GOLD, "#1d4e9e"];
  for (let i = 0; i < cols.length; i++) {
    c.beginPath(); c.arc(cx, cy, w * (0.46 - i * 0.045), Math.PI, 2 * Math.PI);
    c.lineWidth = w * 0.04; c.strokeStyle = cols[i]; c.setLineDash([w * 0.025, w * 0.012]); c.stroke();
  }
  c.setLineDash([]);
}

function turban(c: CanvasRenderingContext2D, w: number, h: number, fill: string, fold: string, size = 1) {
  const cx = w / 2, cy = h * 0.11, rx = w * 0.36 * size, ry = h * 0.1 * size;
  c.fillStyle = fill; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = fold; c.lineWidth = 2.5;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(cx + i * rx * 0.28 - rx * 0.1, cy - ry * 0.9); c.quadraticCurveTo(cx + i * rx * 0.32 + rx * 0.2, cy, cx + i * rx * 0.28 - rx * 0.1, cy + ry * 0.9); c.stroke(); }
  c.fillStyle = fill; c.beginPath(); c.ellipse(cx + rx * 0.9, cy + ry * 1.4, rx * 0.16, ry * 0.9, 0.5, 0, Math.PI * 2); c.fill(); // طرف اللفّة
}

function emojiRow(c: CanvasRenderingContext2D, w: number, y: number, items: string[], size: number, t: number) {
  c.font = `${size}px serif`; c.textAlign = "center"; c.textBaseline = "middle";
  items.forEach((e, i) => c.fillText(e, (w / (items.length + 1)) * (i + 1), y + Math.sin(t / 500 + i) * 4));
}

function label(c: CanvasRenderingContext2D, w: number, h: number, text: string, bg: string) {
  c.font = `800 ${Math.round(w * 0.05)}px Cairo, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
  const tw = c.measureText(text).width + w * 0.08, th = w * 0.085, x = w / 2 - tw / 2, y = h * 0.93 - th / 2;
  c.fillStyle = bg; c.beginPath(); c.roundRect(x, y, tw, th, th / 2); c.fill();
  c.fillStyle = "#fff"; c.fillText(text, w / 2, h * 0.93);
}

export const CAM_FILTERS: CamFilter[] = [
  { id: "none", ar: "بدون", en: "None", emoji: "◌", css: "none" },
  {
    id: "pharaoh", ar: "فرعوني", en: "Pharaonic", emoji: "🏺", css: "sepia(.35) saturate(1.3) contrast(1.05)", tint: ["#C9A227", 0.1],
    draw: (c, w, h) => { stripedLappets(c, w, h, GOLD, BLUE); collar(c, w, h); label(c, w, h, "ابن الفراعنة", "rgba(29,78,158,.85)"); },
  },
  {
    id: "fellah", ar: "فلاحي", en: "Fellah", emoji: "🌾", css: "sepia(.3) saturate(1.2) brightness(1.05)", tint: ["#7a9a3a", 0.1],
    draw: (c, w, h, t) => { turban(c, w, h, "#f4efe3", "rgba(120,100,60,.45)", 0.85); emojiRow(c, w, h * 0.84, ["🌾", "🐃", "🌴"], w * 0.11, t); label(c, w, h, "ابن البلد 🌾", "rgba(110,140,50,.9)"); },
  },
  {
    id: "saidi", ar: "صعيدي", en: "Saidi", emoji: "🏜️", css: "sepia(.45) contrast(1.12) saturate(1.1)", tint: ["#b4693a", 0.12],
    draw: (c, w, h, t) => { turban(c, w, h, "#fbfaf6", "rgba(90,80,60,.5)", 1.1); emojiRow(c, w, h * 0.85, ["🏜️", "🐪", "☀️"], w * 0.1, t); label(c, w, h, "يا أبو الصعيدي 🏜️", "rgba(150,70,30,.9)"); },
  },
  {
    id: "alex", ar: "إسكندراني", en: "Alexandrian", emoji: "🌊", css: "saturate(1.15) hue-rotate(-8deg) brightness(1.04)", tint: ["#2aa3d6", 0.14],
    draw: (c, w, h, t) => {
      c.fillStyle = "rgba(20,110,170,.85)";
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, h * (0.88 + k * 0.035) + Math.sin(x / 38 + t / 400 + k) * 7); c.lineTo(w, h); c.closePath(); c.globalAlpha = 0.55; c.fill(); }
      c.globalAlpha = 1;
      c.fillStyle = "rgba(255,255,255,.92)"; // فنار قايتباي
      c.fillRect(w * 0.84, h * 0.7, w * 0.07, h * 0.18); c.fillRect(w * 0.83, h * 0.68, w * 0.09, h * 0.025); c.fillStyle = "#f5c518"; c.fillRect(w * 0.855, h * 0.655, w * 0.03, h * 0.03);
      emojiRow(c, w, h * 0.1, ["🕊️", "⛵", "🕊️"], w * 0.1, t);
      label(c, w, h, "إسكندرية يا جمال 🌊", "rgba(20,110,170,.9)");
    },
  },
  {
    id: "bedouin", ar: "بدوي", en: "Bedouin", emoji: "🐪", css: "sepia(.25) saturate(1.25)", tint: ["#d9a066", 0.1],
    draw: (c, w, h, t) => {
      const sq = w * 0.04;
      const chk = (x: number, y: number, wd: number, ht: number) => { for (let yy = y; yy < y + ht; yy += sq) for (let xx = x; xx < x + wd; xx += sq) { c.fillStyle = (Math.floor(xx / sq) + Math.floor(yy / sq)) % 2 ? "#c0392b" : "#fff"; c.fillRect(xx, yy, sq, sq); } };
      chk(0, 0, w, h * 0.1); chk(0, h * 0.1, w * 0.14, h * 0.4); chk(w * 0.86, h * 0.1, w * 0.14, h * 0.4);
      c.strokeStyle = "#111"; c.lineWidth = 6; c.beginPath(); c.ellipse(w / 2, h * 0.1, w * 0.34, h * 0.025, 0, 0, Math.PI * 2); c.stroke(); // العقال
      emojiRow(c, w, h * 0.85, ["🌵", "🐪", "🌙"], w * 0.11, t); label(c, w, h, "سيد العرب 🐪", "rgba(150,50,40,.9)");
    },
  },
  {
    id: "nubian", ar: "نوبي", en: "Nubian", emoji: "🎨", css: "saturate(1.6) contrast(1.08)", tint: ["#ff7a00", 0.06],
    draw: (c, w, h, t) => {
      const cols = ["#e74c3c", "#f1c40f", "#27ae60", "#2980b9", "#8e44ad", "#e67e22"], tw = w / 14;
      for (let i = 0; i < 14; i++) { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.moveTo(i * tw, 0); c.lineTo(i * tw + tw, 0); c.lineTo(i * tw + tw / 2, tw * 1.1); c.closePath(); c.fill(); c.beginPath(); c.moveTo(i * tw, h); c.lineTo(i * tw + tw, h); c.lineTo(i * tw + tw / 2, h - tw * 1.1); c.closePath(); c.fill(); }
      emojiRow(c, w, h * 0.84, ["🐊", "🌴", "⛵"], w * 0.11, t); label(c, w, h, "أهلاً بيكم في النوبة 🎨", "rgba(41,128,185,.9)");
    },
  },
  {
    id: "night", ar: "ليل النيل", en: "Nile night", emoji: "🌙", css: "brightness(.85) contrast(1.15) saturate(1.1) hue-rotate(10deg)", tint: ["#0b1f4a", 0.28],
    draw: (c, w, h, t) => {
      for (let i = 0; i < 26; i++) { const x = ((i * 97) % 100) / 100 * w, y = ((i * 53) % 55) / 100 * h; c.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t / 600 + i)); c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, 1.8, 0, 7); c.fill(); }
      c.globalAlpha = 1; c.font = `${w * 0.13}px serif`; c.textAlign = "center"; c.fillText("🌙", w * 0.82, h * 0.1); label(c, w, h, "ليلة على النيل 🌙", "rgba(11,31,74,.9)");
    },
  },
];

export function drawFilter(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, f: CamFilter, w: number, h: number, mirror: boolean, t: number) {
  const vw = v.videoWidth || w, vh = v.videoHeight || h;
  const k = Math.max(w / vw, h / vh), dw = vw * k, dh = vh * k;
  ctx.save();
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.filter = f.css;
  ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
  ctx.filter = "none";
  if (f.tint) { ctx.globalAlpha = f.tint[1]; ctx.fillStyle = f.tint[0]; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
  f.draw?.(ctx, w, h, t);
}
