import { tr } from "../i18n";
// جروبات عامة تجريبية للاكتشاف — تُستبدل بنداء API لقائمة الجروبات العامة
export interface PublicGroup { id: string; name: string; desc: string; members: number; initial: string; colorClass: string; memberIds: string[] }
export const PUBLIC_GROUPS: PublicGroup[] = [
  { id: "pg1", get name() { return tr("مطوّرين عرب 👨‍💻", "Arab Developers 👨‍💻"); }, get desc() { return tr("نقاشات البرمجة وفرص الشغل", "Coding discussions and job opportunities"); }, members: 1280, get initial() { return tr("م", "A"); }, colorClass: "bg-rachat-red", memberIds: ["u2", "u6"] },
  { id: "pg2", get name() { return tr("عشّاق الكورة ⚽", "Football Fans ⚽"); }, get desc() { return tr("تحليل المباريات والتوقعات", "Match analysis and predictions"); }, members: 3410, get initial() { return tr("ع", "F"); }, colorClass: "bg-rachat-gold", memberIds: ["u4", "u1"] },
  { id: "pg3", get name() { return tr("وصفات وأكل 🍲", "Recipes & Food 🍲"); }, get desc() { return tr("وصفات بيتي وتجارب مطاعم", "Home recipes and restaurant reviews"); }, members: 956, get initial() { return tr("و", "R"); }, colorClass: "bg-rachat-coral", memberIds: ["u5", "u3"] },
  { id: "pg4", get name() { return tr("رواد أعمال مصر 🚀", "Egypt Entrepreneurs 🚀"); }, get desc() { return tr("أفكار مشاريع ودعم متبادل", "Business ideas and mutual support"); }, members: 2075, get initial() { return tr("ر", "E"); }, colorClass: "bg-[#7a4a2a]", memberIds: ["u6", "u2", "u4"] },
];
