import type { Ctx } from "../context.js";

/** كتالوج الصلاحيات — مفتاح ثابت + تسمية عربية. أي صلاحية جديدة تتضاف هنا بس. */
export const CATALOG = [
  { key: "users.view", group: "المستخدمون", label: "عرض المستخدمين" },
  { key: "users.manage", group: "المستخدمون", label: "إيقاف/حظر/تفعيل الحسابات" },
  // محو نهائي مابيرجعش — **مش في أي دور جاهز** عن قصد: المالك بس، أو دور يمنحه
  // المالك صراحةً. لازم للوفاء بوعد الشروط والخصوصية بمحو بيانات القاصر فورًا.
  { key: "users.erase", group: "المستخدمون", label: "محو بيانات حساب نهائيًا (لا رجعة)" },
  // سجل أدلة بلاغات إيذاء الأطفال — **مش في أي دور جاهز** عن قصد، زي `users.erase`.
  // المحتوى ده مادة يجرّم القانون حيازتها، فالوصول له محصور في المالك أو دور
  // يمنحه المالك صراحةً، وكل تسليم بيتسجّل في سجل المراجعة برقم الطلب الرسمي.
  { key: "evidence.manage", group: "المحتوى", label: "سجل أدلة بلاغات إيذاء الأطفال (تسليم للجهات)" },
  { key: "finance.view", group: "المالية", label: "عرض المدفوعات والمعاملات" },
  { key: "finance.refund", group: "المالية", label: "استرداد المعاملات" },
  { key: "finance.offers", group: "المالية", label: "إدارة العروض والخصومات" },
  { key: "ads.view", group: "الإعلانات", label: "عرض الإعلانات" },
  { key: "ads.manage", group: "الإعلانات", label: "إضافة/اعتماد/إيقاف الإعلانات" },
  { key: "content.view", group: "المحتوى", label: "عرض البلاغات والغرف والجروبات" },
  { key: "content.moderate", group: "المحتوى", label: "معالجة البلاغات وإغلاق الغرف وتقييد الجروبات" },
  { key: "notifications.send", group: "الإشعارات", label: "إرسال إشعارات للمستخدمين" },
  { key: "audit.view", group: "الإدارة", label: "عرض سجل المراجعة" },
  { key: "team.view", group: "الإدارة", label: "عرض الفريق والأدوار" },
  { key: "team.manage", group: "الإدارة", label: "إدارة الفريق والأدوار والصلاحيات" },
  { key: "settings.manage", group: "الإدارة", label: "إعدادات التطبيق" },
] as const;
export type Perm = (typeof CATALOG)[number]["key"];
export const ALL_PERMS: string[] = CATALOG.map((c) => c.key);
export const isPerm = (k: string): k is Perm => ALL_PERMS.includes(k);

/** الأدوار الجاهزة — بتتنشئ أول مرة بس، والمالك يعدّلها بعد كده من اللوحة (التعديل بيفضل). */
export const PRESET_ROLES: { key: string; name: string; permissions: Perm[] }[] = [
  { key: "manager", name: "مدير", permissions: ["users.view", "users.manage", "finance.view", "finance.offers", "ads.view", "ads.manage", "content.view", "content.moderate", "notifications.send", "audit.view", "team.view"] },
  { key: "admin", name: "إداري", permissions: ["users.view", "users.manage", "content.view", "content.moderate", "notifications.send"] },
  { key: "accountant", name: "محاسب", permissions: ["users.view", "finance.view", "finance.refund", "finance.offers", "audit.view"] },
  { key: "moderator", name: "مشرف محتوى", permissions: ["users.view", "content.view", "content.moderate"] },
  { key: "support", name: "دعم فني", permissions: ["users.view", "content.view", "finance.view"] },
];

const seeded = new WeakSet<object>();
export async function ensurePresetRoles(ctx: Ctx) {
  if (seeded.has(ctx)) return;
  for (const r of PRESET_ROLES) {
    await ctx.db.staffRole.upsert({ where: { key: r.key }, update: {}, create: { key: r.key, name: r.name, permissions: r.permissions, system: true } });
  }
  seeded.add(ctx);
}

/** الصلاحيات الفعلية = (صلاحيات الدور + الإضافية) − المسحوبة. المالك = كل حاجة. */
export function effectivePerms(s: { isOwner: boolean; grant: string[]; revoke: string[]; role?: { permissions: string[] } | null }): string[] {
  if (s.isOwner) return [...ALL_PERMS];
  const set = new Set([...(s.role?.permissions ?? []), ...s.grant]);
  for (const r of s.revoke) set.delete(r);
  return ALL_PERMS.filter((p) => set.has(p));
}
