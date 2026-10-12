import type { Message } from "../types";
import { phaKind } from "./PharaohEmoji";
import { occKind } from "./OccasionSticker";

type T = (ar: string, en: string) => string;

/**
 * سطر المعاينة بتاع رسالة — المستخدَم في اقتباس الرد، وشريط «الرد على»،
 * وإعادة التوجيه، وقايمة الخيارات.
 *
 * **السبب:** الرسالة اللي نصّها فاضي (صوت · استطلاع · مرفق · ملصق) كانت
 * بتعرض اقتباس **فاضي** — ومع «الرد بالصوت» ده بقى الحالة الشائعة، فالمستخدم
 * يشوف مربع رد مالوش معنى.
 */
export function msgPreview(m: Message, t: T): string {
  if (m.deleted) return t("تم حذف الرسالة", "Message deleted");
  if (m.poll) return `📊 ${m.poll.question}`;
  if (m.attachment?.voice) return t("🎤 رسالة صوتية", "🎤 Voice message");
  if (m.text && phaKind(m.text)) return t("🏺 ملصق فرعوني", "🏺 Pharaonic sticker");
  if (m.text && occKind(m.text)) return t("🎉 ملصق تهنئة", "🎉 Greeting sticker");
  if (m.text) return m.text;
  if (m.attachment) return `📎 ${m.attachment.name}`;
  return t("رسالة", "Message");
}
