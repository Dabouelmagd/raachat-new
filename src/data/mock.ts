import { tr } from "../i18n";

// بيانات تجريبية للتطوير فقط — استبدلها لاحقًا بنداءات API الحقيقية
// (راجع القسم 6 من الـ PRD لهيكلة الـ API المقترحة عبر NestJS/Go + GraphQL أو REST)

export interface Chat {
  id: string;
  name: string;
  initial: string;
  colorClass: string; // Tailwind class, e.g. "bg-rachat-red"
  lastMessage: string;
  time: string;
  unread: number;
}

export interface Message {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  read?: boolean;
}

export interface Room {
  id: string;
  name: string;
  listeners: number;
}

export interface ServiceItem {
  key: string;
  label: string;
}

export const chats: Chat[] = [
  { id: "1", get name() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get initial() { return tr("م", "M"); }, colorClass: "bg-rachat-red", get lastMessage() { return tr("تمام، اشوفك بكرة إن شاء الله 🙌", "Great, see you tomorrow 🙌"); }, get time() { return tr("10:42 ص", "10:42 AM"); }, unread: 2 },
  { id: "2", get name() { return tr("مجموعة الشغل 💼", "Work Group 💼"); }, get initial() { return tr("ش", "W"); }, colorClass: "bg-rachat-gold", get lastMessage() { return tr("أحمد: رفعت الملف على المجموعة", "Ahmed: I uploaded the file to the group"); }, get time() { return tr("9:15 ص", "9:15 AM"); }, unread: 0 },
  { id: "3", get name() { return tr("يوسف كامل", "Youssef Kamel"); }, get initial() { return tr("ي", "Y"); }, colorClass: "bg-rachat-coral", get lastMessage() { return tr("صباح الفل ☀️", "Good morning ☀️"); }, get time() { return tr("أمس", "Yesterday"); }, unread: 0 },
];

export const messagesByChat: Record<string, Message[]> = {
  "1": [
    { id: "m1", from: "them", get text() { return tr("عامل إيه؟ جهزت حاجتك؟", "How are you? Is your stuff ready?"); }, time: "10:30" },
    { id: "m2", from: "me", get text() { return tr("أيوه تقريبًا خلصت، هبعتلك دلوقتي", "Yes, almost done, I'll send it to you now"); }, time: "10:35" },
    { id: "m3", from: "them", get text() { return tr("تمام، اشوفك بكرة إن شاء الله 🙌", "Great, see you tomorrow 🙌"); }, time: "10:42" },
  ],
};

export const rooms: Room[] = [
  { id: "r1", get name() { return tr("نقاش كورة الليلة ⚽", "Tonight's Football Talk ⚽"); }, listeners: 214 },
  { id: "r2", get name() { return tr("حكي بنات ☕", "Girls' Chat ☕"); }, listeners: 88 },
  { id: "r3", get name() { return tr("أفكار مشاريع 💡", "Project Ideas 💡"); }, listeners: 42 },
];

export const services: ServiceItem[] = [
  { key: "elec", get label() { return tr("كهرباء", "Electricity"); } },
  { key: "water", get label() { return tr("مياه", "Water"); } },
  { key: "gas", get label() { return tr("غاز", "Gas"); } },
  { key: "net", get label() { return tr("إنترنت", "Internet"); } },
  { key: "topup", get label() { return tr("شحن رصيد", "Top up"); } },
];
