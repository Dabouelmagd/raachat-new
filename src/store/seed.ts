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
  { id: "t1", type: "dm", get name() { return tr("مريم عبد الله", "Mariam Abdallah"); }, colorClass: "bg-rachat-red", get initial() { return tr("م", "M"); }, memberIds: ["u1"], unread: 2 },
  { id: "t2", type: "group", get name() { return tr("مجموعة الشغل 💼", "Work Group 💼"); }, colorClass: "bg-rachat-gold", get initial() { return tr("ش", "W"); }, memberIds: ["u1", "u2", "u4"] },
  { id: "t3", type: "dm", get name() { return tr("يوسف كامل", "Youssef Kamel"); }, colorClass: "bg-rachat-coral", get initial() { return tr("ي", "Y"); }, memberIds: ["u2"] },
  // 🔴 جروب فيه رسايل ما اتقرتش **عن قصد** (٢٦ أكتوبر ٢٠٢٦): قبل كده كان `t1`
  // (محادثة فردية) هو الوحيد اللي له `unread`، فالفرق بين «بولد» و«عادي» في
  // **«جروباتي»** و«قنواتي» مكانش بيظهر في بناء الديمو ولا بيتجرّب أصلًا —
  // نفس درس الستوريتين لنفس الحساب. و`t2` بيفضل مقروءًا عشان الاختبار يقارن.
  { id: "t4", type: "group", get name() { return tr("فريق التصميم", "Design Team"); }, colorClass: "bg-[#7a4a2a]", get initial() { return tr("ف", "D"); }, memberIds: ["u3", "u5", "u6"], unread: 3 },
  // محادثة «الحالات الصعبة» — **عن قصد**: اسم طويل جدًا في العنوان، ورسايل فيها
  // رابط طويل وكلمة إنجليزية بلا مسافات. المحتوى ده هو اللي بيكسّر العرض على
  // الموبايل (الصفحة تبقى أعرض من الشاشة فالرسايل تتقص من الناحية التانية)،
  // ومن غيره الاختبار مابيشوفش العطل. اتبلّغ من الإنتاج في ١٢ أكتوبر.
  // قناة مشترك فيها **عن قصد**: «للقراءة بس» ومنع الكتابة لازم يتجرّبوا
  { id: "ch1", type: "channel", get name() { return tr("أخبار رع شات 📣", "Raa Chat News 📣"); }, get about() { return tr("كل جديد في التطبيق", "Everything new in the app"); }, colorClass: "bg-rachat-gold", get initial() { return tr("أ", "R"); }, memberIds: [], memberCount: 1240, myRole: "member", canPost: false, unread: 4 },
  { id: "t5", type: "group", get name() { return tr("nsw-bity& : ḥmt nswt 👑 : مجموعة باسم طويل جدًا للاختبار", "nsw-bity& : ḥmt nswt 👑 : a very long group name for testing"); }, colorClass: "bg-rachat-maroon", get initial() { return tr("ن", "N"); }, memberIds: ["u1", "u2", "u3"] },
];

export const INITIAL_MESSAGES: Message[] = [
  { id: "m1", threadId: "t1", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get text() { return tr("عامل إيه؟ جهزت حاجتك؟", "How are you? Is your stuff ready?"); }, time: "10:30", reactions: {} },
  { id: "m2", threadId: "t1", authorId: "me", get authorName() { return tr("أنت", "You"); }, get text() { return tr("أيوه تقريبًا خلصت، هبعتلك دلوقتي", "Yes, almost done, I'll send it to you now"); }, time: "10:35", delivered: true, reactions: {} },
  { id: "m3", threadId: "t1", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get text() { return tr("تمام، متنساش تبعت الملف كمان", "Okay, don't forget to send the file too"); }, time: "10:38", reactions: { "👍": ["me"] } },
  { id: "m4", threadId: "t1", authorId: "me", get authorName() { return tr("أنت", "You"); }, get text() { return tr("ماشي الحال، هبعته وياه", "Sounds good, I'll send it along with it"); }, time: "10:40", read: true, delivered: true, reactions: {} },
  { id: "m5", threadId: "t2", authorId: "u4", get authorName() { return tr("أحمد فتحي", "Ahmed Fathy"); }, get text() { return tr("رفعت الملف على المجموعة", "I uploaded the file to the group"); }, time: "9:15", reactions: {} },
  { id: "m6", threadId: "t2", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, get text() { return tr("تمام، هراجعه بعد شوية", "Okay, I'll review it in a bit"); }, time: "9:20", reactions: {} },
  // **استطلاع في بيانات الديمو عن قصد** — من غير أصوات موجودة، النِّسب والأشرطة
  // و«مين صوّت» مابيظهروش في بناء الديمو ولا بيتجرّبوا. واحد من حساب تاني
  // (فيه أصوات) وواحد مني (عشان زرار «اقفل الاستطلاع» يبان).
  {
    id: "m10", threadId: "t2", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, text: "", time: "9:25", reactions: {},
    poll: {
      get question() { return tr("نعمل اجتماع الفريق إمتى؟", "When should we hold the team meeting?"); },
      multi: false, closed: false, hideVoters: false,
      options: [
        { id: "po1", get text() { return tr("الأحد الصبح", "Sunday morning"); }, count: 1, mine: false, voterIds: ["u4"] },
        { id: "po2", get text() { return tr("الأحد بعد الضهر", "Sunday afternoon"); }, count: 0, mine: false, voterIds: [] },
        { id: "po3", get text() { return tr("الاتنين الصبح", "Monday morning"); }, count: 2, mine: false, voterIds: ["u1", "u2"] },
      ],
    },
  },
  {
    id: "m11", threadId: "t2", authorId: "me", get authorName() { return tr("أنت", "You"); }, text: "", time: "9:30", reactions: {},
    poll: {
      get question() { return tr("إيه الأكل اللي نجيبه؟", "What food should we order?"); },
      multi: true, closed: false, hideVoters: false,
      options: [
        { id: "po4", get text() { return tr("كشري", "Koshari"); }, count: 1, mine: false, voterIds: ["u1"] },
        { id: "po5", get text() { return tr("فراخ مشوية", "Grilled chicken"); }, count: 0, mine: false, voterIds: [] },
      ],
    },
  },
  // واستطلاع **مخفي الأصوات** عن قصد (قرار داليا ١٦ أكتوبر): من غيره الحالة
  // دي مابتظهرش في بناء الديمو ولا بتتجرّب — زي درس الستوريتين لنفس الحساب.
  // `voterIds` **مش موجودة خالص** هنا، زي ما السيرفر بيعمل بالظبط: لو كانت
  // فاضية أو ناقصة يبقى الإخفاء ستارة. وفيه اختيار صوتي أنا عليه عشان علامة ✓
  // في المخفي تتجرّب كمان.
  {
    id: "m12", threadId: "t2", authorId: "u2", get authorName() { return tr("نور حسن", "Nour Hassan"); }, text: "", time: "9:35", reactions: {},
    poll: {
      get question() { return tr("تفضّلوا الاجتماع أونلاين ولا في المكتب؟", "Do you prefer the meeting online or at the office?"); },
      multi: false, closed: false, hideVoters: true,
      options: [
        { id: "po6", get text() { return tr("أونلاين", "Online"); }, count: 4, mine: true },
        { id: "po7", get text() { return tr("في المكتب", "At the office"); }, count: 1, mine: false },
      ],
    },
  },
  { id: "cm1", threadId: "ch1", authorId: "u6", get authorName() { return tr("فريق رع شات", "Raa Chat team"); }, get text() { return tr("نزلنا الاستطلاعات وتثبيت المحادثات 🎉", "Polls and pinned chats are live 🎉"); }, time: "8:10", reactions: { "🎉": ["u1", "u2", "u3"] } },
  { id: "cm2", threadId: "ch1", authorId: "u6", get authorName() { return tr("فريق رع شات", "Raa Chat team"); }, get text() { return tr("وكمان الرد بالصوت وسرعة التشغيل", "And voice replies with playback speed"); }, time: "8:12", reactions: {} },
  // رسايل الحالات الصعبة (t5) — رابط طويل وكلمة بلا مسافات: لو الفقاعة مش
  // بتكسر الكلمة، النص بيوسّع الصفحة كلها والرسايل تتقص على الموبايل.
  { id: "m7", threadId: "t5", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, text: "https://app.example.com/legal/privacy.html?utm_source=raachat&utm_campaign=very-long-link-for-layout-testing-1234567890", time: "7:07", reactions: {} },
  { id: "m8", threadId: "t5", authorId: "me", get authorName() { return tr("أنت", "You"); }, text: "Supercalifragilisticexpialidocious_pneumonoultramicroscopicsilicovolcanoconiosis", time: "7:08", reactions: {} },
  { id: "m9", threadId: "t5", authorId: "u2", get authorName() { return tr("يوسف كامل", "Youssef Kamel"); }, get text() { return tr("هي دي الحاجه الوحيده اللي محدش ليه أكسس عليها علشان تملكين الدومين", "This is the only thing nobody else has access to, so you own the domain"); }, time: "7:08", reactions: {} },
];

/**
 * قنوات تجريبية للاكتشاف (في وضع الـ API بتيجي من `GET /channels`).
 * **موجودة عن قصد**: من غير قناة فيها منشورات، شكل القناة «للقراءة بس» ومنع
 * الكتابة مابيظهروش في بناء الديمو ولا بيتجرّبوا.
 */
export interface DemoChannel { id: string; name: string; about: string; members: number; initial: string; colorClass: string }
export const DEMO_CHANNELS: DemoChannel[] = [
  { id: "ch2", get name() { return tr("أخبار التقنية 📱", "Tech News 📱"); }, get about() { return tr("كل جديد في الموبايلات والتطبيقات", "Everything new in phones and apps"); }, members: 8420, get initial() { return tr("أ", "T"); }, colorClass: "bg-rachat-red" },
  { id: "ch3", get name() { return tr("وظائف مصر 💼", "Egypt Jobs 💼"); }, get about() { return tr("فرص شغل جديدة كل يوم", "New job openings every day"); }, members: 15300, get initial() { return tr("و", "J"); }, colorClass: "bg-[#7a4a2a]" },
  { id: "ch4", get name() { return tr("مواعيد الصلاة 🕌", "Prayer Times 🕌"); }, get about() { return tr("مواعيد الصلاة والأذكار اليومية", "Daily prayer times and remembrances"); }, members: 42100, get initial() { return tr("م", "P"); }, colorClass: "bg-rachat-maroon" },
];

/** منشورات تجريبية لقناة بعد الاشتراك فيها */
export const demoChannelPosts = (channelId: string): Message[] => [
  { id: `${channelId}_p1`, threadId: channelId, authorId: "u6", get authorName() { return tr("إدارة القناة", "Channel admin"); }, get text() { return tr("أهلًا بيكم في القناة 👋", "Welcome to the channel 👋"); }, time: "8:00", reactions: {} },
  { id: `${channelId}_p2`, threadId: channelId, authorId: "u6", get authorName() { return tr("إدارة القناة", "Channel admin"); }, get text() { return tr("أول خبر: التحديث الجديد نزل النهارده", "First post: the new update shipped today"); }, time: "8:05", reactions: { "👍": ["u1", "u2"] } },
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
  // 🔴 غرفة **فاضية** عن قصد: من غيرها الفرق بين «فيها ناس دلوقتي» و«فاضية»
  // مستحيل يظهر في بناء الديمو ولا يتجرّب — نفس درس الستوريتين لنفس الحساب
  // ودرس الجروب والقناة اللي فيهم غير مقروء. والغرفة الفاضية حالة حقيقية في
  // الإنتاج كمان: `GET /rooms` بيرجّع كل غرفة مفتوحة بلا فلتر على الحضور.
  {
    id: "r3", get name() { return tr("قعدة الفجر 🌙", "Dawn Hangout 🌙"); }, createdByMe: false, joined: false, myIdentityMode: null,
    participants: [],
  },
];

export const INITIAL_STORIES: Story[] = [
  { id: "s1", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, colorFrom: "#E1523E", colorTo: "#F2795C", get caption() { return tr("صباح الفل من القاهرة ☀️", "Good morning from Cairo ☀️"); }, seen: false, get time() { return tr("قبل ساعتين", "2 hours ago"); } },
  // ستوري تانية لنفس الحساب (u1) — التجميع لكل حساب مابيبانش من غير كده
  { id: "s1b", authorId: "u1", get authorName() { return tr("مريم عبد الله", "Mariam Abdallah"); }, colorFrom: "#C9A227", colorTo: "#E1523E", get caption() { return tr("والقهوة كمان ☕", "And coffee too ☕"); }, seen: false, get time() { return tr("قبل ساعة", "An hour ago"); } },
  { id: "s2", authorId: "u2", get authorName() { return tr("يوسف كامل", "Youssef Kamel"); }, colorFrom: "#14100F", colorTo: "#C9A227", get caption() { return tr("سهرة شغل لحد الفجر 💻", "Working late until dawn 💻"); }, seen: false, get time() { return tr("قبل 5 ساعات", "5 hours ago"); } },
  { id: "s3", authorId: "u3", get authorName() { return tr("نور الهدى", "Nour El-Hoda"); }, colorFrom: "#5B2621", colorTo: "#E1523E", get caption() { return tr("الفاتورة اتدفعت أخيرًا 🎉", "The bill is finally paid 🎉"); }, seen: true, get time() { return tr("أمس", "Yesterday"); } },
];
