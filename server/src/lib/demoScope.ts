/**
 * **نطاق مسح البيانات التجريبية — إيه اللي **فعلًا** هيتمسح.**
 *
 * `unseedDemo` مابيمسحش الحسابات التجريبية وبس: بيجمع **كل محادثة أي حساب
 * تجريبي عضو فيها** وبيمسح رسايلها وعضوياتها والمحادثة نفسها — **مهما كان مين
 * كمان فيها**. وده مش فرض نظري:
 *
 *   - `seedDemo` بـ`ME=<إيميلك>` بيربط **حسابًا حقيقيًا** بمحادثة فردية مع مريم
 *     **وبيضيفه لجروب «مجموعة الشغل 💼»**.
 *   - و`seedDemo` بيعمل **٤ جروبات عامة** (`isPublic`) مالكها حساب تجريبي —
 *     وأي مستخدم حقيقي انضم لواحد منها من «اكتشف جروبات» بقى عضوًا في محادثة
 *     هتتمسح، **ورسايله فيها هتتمسح معاها**.
 *
 * فالرقم اللي يهمّ قبل أي مسح مش «كام حساب تجريبي» — هو **كام حساب حقيقي جوه
 * المحادثات اللي هتروح**. والدالة دي **بتقول** بس؛ المسح نفسه في
 * `unseedDemo` والقرار في `scripts/seed-demo.sh` — لأن الحذف مابيرجعش.
 */
import type { Db } from "../db.js";
import { DEMO_PHONES } from "../seed-demo.js";

export type DemoThreadScope = {
  id: string;
  type: string;
  name: string | null;
  isPublic: boolean;
  messages: number;
  members: number;
  /** أعضاء المحادثة اللي **مش** حسابات تجريبية — دول اللي بيتأثروا بالمسح */
  realMembers: number;
};

export type DemoScope = {
  /** الحسابات التجريبية الموجودة فعلًا في القاعدة (ممكن تكون أقل من القايمة) */
  demoUsers: { id: string; phone: string | null; name: string }[];
  threads: DemoThreadScope[];
  /** مجموع الرسايل في كل المحادثات اللي هتتمسح */
  messages: number;
  /** معرّفات الحسابات الحقيقية اللي عضوة في أي محادثة هتتمسح (بلا تكرار) */
  realMemberIds: string[];
};

/** يقرا نطاق المسح من القاعدة. **قراءة بحتة — مابيكتبش ولا بيمسح حاجة.** */
export async function demoScope(db: Db): Promise<DemoScope> {
  const demoUsers = await db.user.findMany({
    where: { phone: { in: DEMO_PHONES } },
    select: { id: true, phone: true, name: true },
    orderBy: { phone: "asc" },
  });
  const demoIds = demoUsers.map((u) => u.id);
  if (!demoIds.length) return { demoUsers: [], threads: [], messages: 0, realMemberIds: [] };

  // نفس شرط `unseedDemo` بالحرف: أي محادثة فيها عضوية لحساب تجريبي
  const rows = await db.thread.findMany({
    where: { members: { some: { userId: { in: demoIds } } } },
    select: {
      id: true,
      type: true,
      name: true,
      isPublic: true,
      members: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
  });

  const demo = new Set(demoIds);
  const realMemberIds = new Set<string>();
  const threads: DemoThreadScope[] = rows.map((t) => {
    const real = t.members.map((m) => m.userId).filter((id) => !demo.has(id));
    for (const id of real) realMemberIds.add(id);
    return {
      id: t.id,
      type: String(t.type),
      name: t.name,
      isPublic: Boolean(t.isPublic),
      messages: t._count.messages,
      members: t.members.length,
      realMembers: real.length,
    };
  });

  return {
    demoUsers,
    threads,
    messages: threads.reduce((n, t) => n + t.messages, 0),
    realMemberIds: [...realMemberIds],
  };
}
