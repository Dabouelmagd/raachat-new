import { tr } from "../i18n";

export interface Service {
  key: string;
  label: string;
  biller: string;
  field: string;      // اسم حقل رقم الحساب
  hint: string;
  amounts?: number[]; // للشحن: مبالغ جاهزة
}

export const SERVICES: Service[] = [
  { key: "elec", get label() { return tr("كهرباء", "Electricity"); }, get biller() { return tr("شركة توزيع الكهرباء", "Electricity distribution company"); }, get field() { return tr("رقم العداد", "Meter number"); }, get hint() { return tr("مثال: 4821 9033 17", "e.g. 4821 9033 17"); } },
  { key: "water", get label() { return tr("مياه", "Water"); }, get biller() { return tr("شركة مياه الشرب", "Drinking water company"); }, get field() { return tr("رقم الاشتراك", "Subscription number"); }, get hint() { return tr("مثال: 7730218", "e.g. 7730218"); } },
  { key: "gas", get label() { return tr("غاز", "Gas"); }, get biller() { return tr("شركة الغاز الطبيعي", "Natural gas company"); }, get field() { return tr("رقم العميل", "Customer number"); }, get hint() { return tr("مثال: 5509127", "e.g. 5509127"); } },
  { key: "net", get label() { return tr("إنترنت", "Internet"); }, get biller() { return tr("مزود الإنترنت المنزلي", "Home internet provider"); }, get field() { return tr("رقم الخط الأرضي", "Landline number"); }, get hint() { return tr("مثال: 0225551234", "e.g. 0225551234"); } },
  { key: "topup", get label() { return tr("شحن رصيد", "Mobile top-up"); }, get biller() { return tr("شحن رصيد موبايل", "Mobile credit top-up"); }, get field() { return tr("رقم الموبايل", "Mobile number"); }, get hint() { return tr("01xxxxxxxxx", "01xxxxxxxxx"); }, amounts: [10, 25, 50, 100] },
  { key: "mobile", get label() { return tr("فاتورة موبايل", "Mobile bill"); }, get biller() { return tr("فاتورة خط محمول", "Mobile line bill"); }, get field() { return tr("رقم الموبايل", "Mobile number"); }, get hint() { return tr("01xxxxxxxxx", "01xxxxxxxxx"); } },
  { key: "landline", get label() { return tr("تليفون أرضي", "Landline"); }, get biller() { return tr("التليفون الأرضي", "Landline phone"); }, get field() { return tr("رقم التليفون", "Phone number"); }, get hint() { return tr("مثال: 0233334444", "e.g. 0233334444"); } },
  { key: "insurance", get label() { return tr("تأمين", "Insurance"); }, get biller() { return tr("قسط تأمين", "Insurance premium"); }, get field() { return tr("رقم الوثيقة", "Policy number"); }, get hint() { return tr("مثال: PL-203391", "e.g. PL-203391"); } },
];

export interface Offer {
  code: string;
  title: string;
  desc: string;
  percent: number; // نسبة الخصم
  max: number;     // أقصى قيمة خصم بالجنيه
  appliesTo: string[]; // مفاتيح الخدمات
  gradient: string;
}

export const OFFERS: Offer[] = [
  { code: "RA10", get title() { return tr("خصم ١٠٪ على الكهرباء والمياه", "10% off electricity & water"); }, get desc() { return tr("حتى ٣٠ ج.م", "Up to 30 EGP"); }, percent: 10, max: 30, appliesTo: ["elec", "water"], gradient: "from-rachat-red to-rachat-maroon" },
  { code: "NET15", get title() { return tr("١٥٪ على فاتورة الإنترنت", "15% off your internet bill"); }, get desc() { return tr("حتى ٥٠ ج.م", "Up to 50 EGP"); }, percent: 15, max: 50, appliesTo: ["net", "landline"], gradient: "from-rachat-gold to-[#7a5a10]" },
  { code: "TOP5", get title() { return tr("٥٪ على شحن الرصيد", "5% off mobile top-ups"); }, get desc() { return tr("حتى ١٥ ج.م", "Up to 15 EGP"); }, percent: 5, max: 15, appliesTo: ["topup", "mobile"], gradient: "from-rachat-coral to-rachat-maroon" },
];

// استعلام فاتورة تجريبي: مبلغ ثابت مشتق من رقم الحساب. يُستبدل بنداء استعلام حقيقي لمزود الخدمة.
export function mockInquiry(accountNo: string): number {
  const n = accountNo.replace(/\D/g, "").split("").reduce((a, d) => a + +d, 0);
  return +(80 + (n * 7) % 240 + 0.5).toFixed(2);
}
