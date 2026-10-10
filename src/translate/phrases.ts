import type { TLang } from "./engine";

/**
 * جدول عبارات الديمو (عربي / إنجليزي / صيني / فرنسي).
 * الترجمة الحقيقية هتتم من الباك إند (POST /translate) — الجدول ده بس عشان الديمو يبان شغّال.
 * ar بتقبل صياغات متعددة (الأولى هي اللي بتتعرض كترجمة).
 */
export interface Phrase { ar: string[]; en: string; zh: string; fr: string }

export const PHRASES: Phrase[] = [
  { ar: ["مرحبا", "أهلا", "أهلا وسهلا"], en: "Hello", zh: "你好", fr: "Bonjour" },
  { ar: ["السلام عليكم"], en: "Peace be upon you", zh: "愿你平安", fr: "Que la paix soit sur vous" },
  { ar: ["صباح الخير"], en: "Good morning", zh: "早上好", fr: "Bonne matinée" },
  { ar: ["مساء الخير"], en: "Good evening", zh: "晚上好", fr: "Bonsoir" },
  { ar: ["تصبح على خير"], en: "Good night", zh: "晚安", fr: "Bonne nuit" },
  { ar: ["عامل إيه؟", "عامل ايه", "كيف حالك؟", "كيف الحال؟"], en: "How are you?", zh: "你好吗？", fr: "Comment ça va ?" },
  { ar: ["الحمد لله بخير", "الحمد لله تمام"], en: "I'm fine, thank God", zh: "我很好，感谢真主", fr: "Je vais bien, Dieu merci" },
  { ar: ["شكرا", "شكراً", "شكرا لك"], en: "Thank you", zh: "谢谢", fr: "Merci" },
  { ar: ["عفوا", "العفو"], en: "You're welcome", zh: "不客气", fr: "De rien" },
  { ar: ["تمام 👍", "تمام", "ماشي"], en: "Sounds good 👍", zh: "好的 👍", fr: "Ça marche 👍" },
  { ar: ["تمام، اشوفك بكرة إن شاء الله 🙌", "تمام، أشوفك بكرة إن شاء الله"], en: "Great, see you tomorrow 🙌", zh: "太好了，明天见 🙌", fr: "Super, à demain 🙌" },
  { ar: ["عامل إيه؟ جهزت حاجتك؟"], en: "How are you? Is your stuff ready?", zh: "你好吗？东西准备好了吗？", fr: "Ça va ? Tes affaires sont prêtes ?" },
  { ar: ["أيوه تقريبًا خلصت، هبعتلك دلوقتي"], en: "Yes, almost done, I'll send it to you now", zh: "是的，快好了，马上发给你", fr: "Oui, presque fini, je te l'envoie tout de suite" },
  { ar: ["ابعتلي الملف لو سمحت"], en: "Please send me the file", zh: "请把文件发给我", fr: "Envoie-moi le fichier, s'il te plaît" },
  { ar: ["وصلني الملف"], en: "I received the file", zh: "我收到文件了", fr: "J'ai bien reçu le fichier" },
  { ar: ["الاجتماع الساعة خمسة"], en: "The meeting is at five", zh: "会议五点开始", fr: "La réunion est à cinq heures" },
  { ar: ["هتيجي امتى؟"], en: "When are you coming?", zh: "你什么时候来？", fr: "Tu viens quand ?" },
  { ar: ["أنا في الطريق"], en: "I'm on my way", zh: "我在路上", fr: "Je suis en route" },
  { ar: ["بكام ده؟", "بكام ده"], en: "How much is this?", zh: "这个多少钱？", fr: "C'est combien ?" },
  { ar: ["ممكن خصم؟"], en: "Can I get a discount?", zh: "可以打折吗？", fr: "Puis-je avoir une réduction ?" },
  { ar: ["اتفقنا"], en: "Deal", zh: "成交", fr: "Marché conclu" },
  { ar: ["كلمني لما تفضى", "كلمني لما تفضي"], en: "Call me when you're free", zh: "有空给我打电话", fr: "Appelle-moi quand tu es libre" },
  { ar: ["سامعني؟"], en: "Can you hear me?", zh: "你能听到我吗？", fr: "Tu m'entends ?" },
  { ar: ["أيوه سامعك كويس"], en: "Yes, I can hear you well", zh: "是的，我听得很清楚", fr: "Oui, je t'entends bien" },
  { ar: ["الصورة مش واضحة"], en: "The picture isn't clear", zh: "画面不清楚", fr: "L'image n'est pas nette" },
  { ar: ["تشرفت بمعرفتك"], en: "Nice to meet you", zh: "很高兴认识你", fr: "Enchanté" },
  { ar: ["انت منين؟", "إنت منين؟"], en: "Where are you from?", zh: "你是哪里人？", fr: "Tu viens d'où ?" },
  { ar: ["أنا من مصر"], en: "I'm from Egypt", zh: "我来自埃及", fr: "Je viens d'Égypte" },
  { ar: ["أنا من الصين"], en: "I'm from China", zh: "我来自中国", fr: "Je viens de Chine" },
  { ar: ["بتشتغل إيه؟"], en: "What do you do for work?", zh: "你做什么工作？", fr: "Tu fais quoi dans la vie ?" },
  { ar: ["أنا مطور برمجيات"], en: "I'm a software developer", zh: "我是软件开发人员", fr: "Je suis développeur" },
  { ar: ["مع السلامة"], en: "Goodbye", zh: "再见", fr: "Au revoir" },
  { ar: ["مبروك"], en: "Congratulations", zh: "恭喜", fr: "Félicitations" },
  { ar: ["آسف", "أسف"], en: "Sorry", zh: "对不起", fr: "Désolé" },
  { ar: ["أيوه", "نعم"], en: "Yes", zh: "是的", fr: "Oui" },
  { ar: ["لا"], en: "No", zh: "不", fr: "Non" },
  { ar: ["استنى شوية"], en: "Please wait a moment", zh: "请稍等", fr: "Un instant, s'il vous plaît" },
  { ar: ["خلينا نتكلم عن المشروع"], en: "Let's talk about the project", zh: "我们来谈谈这个项目吧", fr: "Parlons du projet" },
  { ar: ["الفاتورة اتدفعت"], en: "The bill has been paid", zh: "账单已付清", fr: "La facture est payée" },
  { ar: ["العرض ممتاز"], en: "The offer is excellent", zh: "报价很好", fr: "L'offre est excellente" },
  { ar: ["الشحن امتى؟"], en: "When will it ship?", zh: "什么时候发货？", fr: "Quand sera-t-il expédié ?" },
  { ar: ["الصوت واضح؟"], en: "Is the sound clear?", zh: "声音清楚吗？", fr: "Le son est-il clair ?" },
  { ar: ["هبعتلك العقد النهارده"], en: "I'll send you the contract today", zh: "我今天把合同发给你", fr: "Je vous envoie le contrat aujourd'hui" },
];

/** جمل مقترحة تتجرّب في الديمو */
export const EXAMPLES = [0, 5, 7, 17, 22, 29];

/** سيناريو مكالمة تجريبي: [مين بيتكلم, رقم العبارة] */
export const CALL_SCRIPT: ["them" | "me", number][] = [
  ["them", 0], ["me", 0], ["them", 5], ["me", 6], ["them", 22], ["me", 23],
  ["them", 29], ["me", 30], ["them", 15], ["me", 20], ["them", 16], ["me", 17], ["them", 32], ["me", 7],
];
export const TLANGS: TLang[] = ["ar", "en", "zh", "fr"];
