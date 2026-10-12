import { tr } from "../i18n";
import { Contact, Thread, Message, VoiceRoom, Story } from "../types";

// جهات اتصال متاحة لبدء دردشة جديدة أو إضافتها لجروب
export const CONTACTS: Contact[] = [
  { id: "u1", get name() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get initial() { return tr("م", "M"); }, colorClass: "bg-rachat-red" },
  { id: "u2", get name() { return tr("يوسف كامل", "Youssef Kamel"); }, get initial() { return tr("ي", "Y"); }, colorClass: "bg-rachat-coral" },
  { id: "u3", get name() { return tr("نور الهدى", "Nour El-Hoda"); }, get initial() { return tr("ن", "N"); }, colorClass: "bg-rachat-maroon" },
  { id: "u4", get name() { return tr("أحمد فتحي", "Ahmed Fathy"); }, get initial() { return tr("أ", "A"); }, colorClass: "bg-rachat-gold" },
  { id: "u5", get name() { return tr("سارة منير", "Sara Mounir"); }, get initial() { return tr("س", "S"); }, colorClass: "bg-[#7a4a2a]" },
  { id: "u6", get name() { return tr("كريم عادل", "Karim Adel"); }, get initial() { return tr("ك", "K"); }, colorClass: "bg-rachat-coral" },
];

export const INITIAL_THREADS: Thread[] = [
  { id: "t1", type: "dm", get name() { return tr("مريم عبد الله", "Mariam Abdallah"); }, colorClass: "bg-rachat-red", get initial() { return tr("م", "M"); }, memberIds: ["u1"] },
  { id: "t2", type: "group", get name() { return tr("مجموعة الشغل 💼", "Work Group 💼"); }, colorClass: "bg-rachat-gold", get initial() { return tr("ش", "W"); }, memberIds: ["u1", "u2", "u4"] },
  { id: "t3", type: "dm", get name() { return tr("يوسف كامل", "Youssef Kamel"); }, colorClass: "bg-rachat-coral", get initial() { return tr("ي", "Y"); }, memberIds: ["u2"] },
  { id: "t4", type: "group", get name() { return tr("فريق التصميم", "Design Team"); }, colorClass: "bg-[#7a4a2a]", get initial() { return tr("ف", "D"); }, memberIds: ["u3", "u5", "u6"] },
  // محادثة «الحالات الصعبة» — **عن قصد**: اسم طويل جدًا في العنوان، ورسايل فيها
  // رابط طويل وكلمة إنجليزية بلا مسافات. المحتوى ده هو اللي بيكسّر العرض على
  // الموبايل (الصفحة تبقى أعرض من الشاشة فالرسايل تتقص من الناحية التانية)،
  // ومن غيره الاختبار مابيشوفش العطل. اتبلّغ من الإنتاج في ١٢ أكتوبر.
  { id: "t5", type: "group", get name() { return tr("nsw-bity& : ḥmt nswt 👑 : مجموعة باسم طويل جدًا للاختبار", "nsw-bity& : ḥmt nswt 👑 : a very long group name for testing"); }, colorClass: "bg-rachat-maroon", get initial() { return tr("ن", "N"); }, memberIds: ["u1", "u2", "u3"] },
];

export const INITIAL_MESSAGES: Message[] = [
  { id: "m1", threadId: "t1", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get text() { return tr("عامل إيه؟ جهزت حاجتك؟", "How are you? Is your stuff ready?"); }, time: "10:30", reactions: {} },
  { id: "m2", threadId: "t1", authorId: "me", get authorName() { return tr("أنت", "You"); }, get text() { return tr("أيوه تقريبًا خلصت، هبعتلك دلوقتي", "Yes, almost done, I'll send it to you now"); }, time: "10:35", reactions: {} },
  { id: "m3", threadId: "t1", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get text() { return tr("تمام، متنساش تبعت الملف كمان", "Okay, don't forget to send the file too"); }, time: "10:38", reactions: { "👍": ["me"] } },
  { id: "m4", threadId: "t1", authorId: "me", get authorName() { return tr("أنت", "You"); }, get text() { return tr("ماشي الحال، هبعته وياه", "Sounds good, I'll send it along with it"); }, time: "10:40", read: true, reactions: {} },
  { id: "m5", threadId: "t2", authorId: "u4", get authorName() { return tr("أحمد فتحي", "Ahmed Fathy"); }, get text() { return tr("رفعت الملف على المجموعة", "I uploaded the file to the group"); }, time: "9:15", reactions: {} },
  { id: "m6", threadId: "t2", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get text() { return tr("تمام، هراجعه بعد شوية", "Okay, I'll review it in a bit"); }, time: "9:20", reactions: {} },
  // رسايل الحالات الصعبة (t5) — رابط طويل وكلمة بلا مسافات: لو الفقاعة مش
  // بتكسر الكلمة، النص بيوسّع الصفحة كلها والرسايل تتقص على الموبايل.
  { id: "m7", threadId: "t5", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, text: "https://app.kenoz.org/legal/privacy.html?utm_source=raachat&utm_campaign=very-long-link-for-layout-testing-1234567890", time: "7:07", reactions: {} },
  { id: "m8", threadId: "t5", authorId: "me", get authorName() { return tr("أنت", "You"); }, text: "Supercalifragilisticexpialidocious_pneumonoultramicroscopicsilicovolcanoconiosis", time: "7:08", reactions: {} },
  { id: "m9", threadId: "t5", authorId: "u2", get authorName() { return tr("يوسف كامل", "Youssef Kamel"); }, get text() { return tr("هي دي الحاجه الوحيده اللي محدش ليه أكسس عليها علشان تملكين الدومين", "This is the only thing nobody else has access to, so you own the domain"); }, time: "7:08", reactions: {} },
];

export const INITIAL_ROOMS: VoiceRoom[] = [
  {
    id: "r1", get name() { return tr("نقاش كورة الليلة ⚽", "Tonight's Football Talk ⚽"); }, createdByMe: false, joined: false, myIdentityMode: null,
    participants: [
      { id: "u1", get name() { return tr("مريم", "Mariam"); }, color: "#E1523E" },
      { id: "u2", get name() { return tr("يوسف", "Youssef"); }, color: "#F2795C", speaking: true },
      { id: "u3", get name() { return tr("نور", "Nour"); }, color: "#5B2621" },
      { id: "u4", get name() { return tr("أحمد", "Ahmed"); }, color: "#C9A227" },
    ],
  },
  {
    id: "r2", get name() { return tr("حكي بنات ☕", "Girls' Chat ☕"); }, createdByMe: false, joined: false, myIdentityMode: null,
    participants: [
      { id: "u1", get name() { return tr("مريم", "Mariam"); }, color: "#E1523E" },
      { id: "u5", get name() { return tr("سارة", "Sara"); }, color: "#7a4a2a" },
    ],
  },
];

export const INITIAL_STORIES: Story[] = [
  { id: "s1", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, colorFrom: "#E1523E", colorTo: "#F2795C", get caption() { return tr("صباح الفل من القاهرة ☀️", "Good morning from Cairo ☀️"); }, seen: false, get time() { return tr("قبل ساعتين", "2 hours ago"); } },
  // ستوري تانية لنفس الحساب (u1) — التجميع لكل حساب مابيبانش من غير كده
  { id: "s1b", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, colorFrom: "#C9A227", colorTo: "#E1523E", get caption() { return tr("والقهوة كمان ☕", "And coffee too ☕"); }, seen: false, get time() { return tr("قبل ساعة", "An hour ago"); } },
  { id: "s2", authorId: "u2", get authorName() { return tr("يوسف كامل", "Youssef Kamel"); }, colorFrom: "#14100F", colorTo: "#C9A227", get caption() { return tr("سهرة شغل لحد الفجر 💻", "Working late until dawn 💻"); }, seen: false, get time() { return tr("قبل 5 ساعات", "5 hours ago"); } },
  { id: "s3", authorId: "u3", get authorName() { return tr("نور الهدى", "Nour El-Hoda"); }, colorFrom: "#5B2621", colorTo: "#E1523E", get caption() { return tr("الفاتورة اتدفعت أخيرًا 🎉", "The bill is finally paid 🎉"); }, seen: true, get time() { return tr("أمس", "Yesterday"); } },
];
