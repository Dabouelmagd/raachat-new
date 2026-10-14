/** ملصقات إيموجي بلبس فرعوني (نمس + كوبرا + عقد الأوسخ). بتتبعت كنص [[pha:النوع]] وبتتعرض كصورة. الرسومات متولّدة بالذكاء الصناعي (Canva). */
import smile from "../assets/pha/smile.png";
import laugh from "../assets/pha/laugh.png";
import love from "../assets/pha/love.png";
import wink from "../assets/pha/wink.png";
import cool from "../assets/pha/cool.png";
import cry from "../assets/pha/cry.png";
import angry from "../assets/pha/angry.png";
import wow from "../assets/pha/wow.png";
import kiss from "../assets/pha/kiss.png";
import sleep from "../assets/pha/sleep.png";
import think from "../assets/pha/think.png";
import thumbs from "../assets/pha/thumbs.png";
import cleo from "../assets/pha/cleo.png";
import nefer from "../assets/pha/nefer.png";
import anubis from "../assets/pha/anubis.png";
import sphinx from "../assets/pha/sphinx.png";
import eye from "../assets/pha/eye.png";
import scarab from "../assets/pha/scarab.png";

export const PHARAOH_KINDS: [string, string, string][] = [
  ["smile", "مبتسم", "Smile"], ["laugh", "بيضحك", "Laugh"], ["love", "بيحب", "Love"], ["wink", "غمزة", "Wink"],
  ["cool", "كول", "Cool"], ["cry", "بيعيّط", "Cry"], ["angry", "غضبان", "Angry"], ["wow", "مندهش", "Wow"],
  ["kiss", "بوسة", "Kiss"], ["sleep", "نايم", "Sleep"], ["think", "بيفكر", "Thinking"], ["thumbs", "تمام", "Thumbs up"],
  // ملكات مصريات (بطلب داليا ١٢ أكتوبر) — اتصمّموا في Canva بنفس أسلوب الباقي
  ["cleo", "كليوباترا", "Cleopatra"], ["nefer", "نفرتيتي", "Nefertiti"],
  // رموز مصرية (بطلب داليا ١٤ أكتوبر) — نفس المصدر والأسلوب
  ["anubis", "أنوبيس", "Anubis"], ["sphinx", "أبو الهول", "Sphinx"],
  ["eye", "عين حورس", "Eye of Horus"], ["scarab", "جعران", "Scarab"],
];

const IMG: Record<string, string> = { smile, laugh, love, wink, cool, cry, angry, wow, kiss, sleep, think, thumbs, cleo, nefer, anubis, sphinx, eye, scarab };

const TOKEN = /^\[\[pha:([a-z]+)\]\]$/;
export const phaKind = (text: string): string | null => {
  const m = TOKEN.exec(text.trim());
  return m && PHARAOH_KINDS.some(([k]) => k === m[1]) ? m[1] : null;
};
export const phaToken = (k: string) => `[[pha:${k}]]`;

export function PharaohEmoji({ kind, size = 88 }: { kind: string; size?: number }) {
  return <img src={IMG[kind] ?? smile} width={size} height={size} alt="pharaoh emoji" draggable={false} style={{ objectFit: "contain" }} />;
}
