// أنواع البيانات المشتركة — هي نفسها الشكل المتوقع لاحقًا من الـ API الحقيقي
// (راجع src/store لطبقة الحالة الوهمية الحالية، وREADME لخطة الربط بباك إند حقيقي)

export type ThreadType = "dm" | "group";

export interface Contact {
  id: string;
  name: string;
  initial: string;
  colorClass: string; // Tailwind bg-* class
}

export interface Thread {
  id: string;
  type: ThreadType;
  name: string;
  colorClass: string;
  initial: string;
  memberIds: string[]; // لأعضاء الجروب فقط، غير مستخدمة في dm
  createdByMe?: boolean;
  color?: string; // لون الجروب (hex)
  icon?: string; // مفتاح أيقونة من GROUP_ICONS
  photo?: string; // صورة الجروب (data URL / رابط)
  /** رسايل لسه ما اتقرتش — الاسم بيبقى **بولد** وجنبه الرقم */
  unread?: number;
  /** مثبّتة فوق القايمة — **خاص بيّا**، الطرف التاني مايعرفش */
  pinned?: boolean;
}

export interface Attachment {
  name: string;
  size: number; // bytes
  mime: string;
  url: string; // مؤقت (blob) في الديمو؛ مع الباك إند: رابط ملف مرفوع على التخزين
  text?: string; // أول جزء من محتوى الملفات النصية للمعاينة
  voice?: { duration: number; waveform: number[]; simulated?: boolean }; // رسالة صوتية
}

export interface Message {
  id: string;
  threadId: string;
  authorId: string; // "me" أو معرّف جهة اتصال
  authorName: string;
  text: string;
  time: string;
  at?: number; // وقت الإرسال بالملّي ثانية (لفواصل الأيام والتاريخ الكامل)
  read?: boolean;
  /** وصلت لجهاز الطرف التاني (✓✓ رمادي). القراءة (✓✓ أزرق) في `read` */
  delivered?: boolean;
  replyToId?: string;
  reactions: Record<string, string[]>; // emoji -> [authorIds]
  edited?: boolean;
  deleted?: boolean;
  /** مميّزة بنجمة **عندي أنا بس** — مفيش حد تاني بيشوفها */
  starred?: boolean;
  attachment?: Attachment;
  /** استطلاع — الرسالة نفسها نصّها فاضي والمحتوى كله هنا */
  poll?: Poll;
}

export interface PollOption {
  id: string;
  text: string;
  /** مين صوّت للاختيار ده — ظاهر لأعضاء المحادثة (زي واتساب) */
  voterIds: string[];
}

export interface Poll {
  question: string;
  /** يسمح بأكتر من إجابة */
  multi: boolean;
  /** اتقفل من صاحبه — مفيش تصويت جديد */
  closed: boolean;
  options: PollOption[];
}

export interface RoomParticipant {
  id: string;
  name: string;
  color: string;
  muted?: boolean;
  speaking?: boolean;
  isHost?: boolean;
}

export interface VoiceRoom {
  id: string;
  name: string;
  createdByMe: boolean;
  participants: RoomParticipant[];
  joined: boolean;
  myIdentityMode: "real" | "temp" | null;
  me?: { name: string; color: string } | null; // هويتي في الغرفة (من السيرفر)
  count?: number;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  colorFrom: string;
  colorTo: string;
  caption: string;
  seen: boolean;
  time: string;
  image?: string; // صورة الستوري (data URL)
}
