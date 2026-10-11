import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Pencil, Trash2 } from "lucide-react";
import { readImage } from "../media/files";
import { Header } from "../components/Header";
import { PhotoEditorSheet } from "../components/PhotoEditorSheet";
import { useT, num } from "../i18n";
import { AVATAR_COLORS, saveProfile, useProfile } from "../store/profile";
import { ADULT_AGE, isAdultDay, todayDay, validBirthDay } from "../age";

export default function ProfileScreen() {
  const t = useT();
  const p = useProfile();
  const nav = useNavigate();
  const [name, setName] = useState(p.name);
  const [status, setStatus] = useState(p.status);
  const [color, setColor] = useState(p.color);
  const [photo, setPhoto] = useState<string | undefined>(p.photo);
  const [birthDate, setBirthDate] = useState(p.birthDate ?? "");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // الصورة المفتوحة في المحرّر
  const fileRef = useRef<HTMLInputElement>(null);
  /** الصورة المختارة بتتفتح في المحرّر الأول (قص دائري/تكبير/تدوير) قبل ما تتحفظ */
  const pick = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    try { setEditing(await readImage(f, 1200)); } catch { /* تجاهل */ }
  };

  /** تاريخ الميلاد اختياري، لكن لو مكتوب لازم يكون صحيح — والسيرفر بيرفض الغلط كمان */
  const badBirth = birthDate !== "" && !validBirthDay(birthDate);

  const save = () => {
    if (badBirth) return;
    saveProfile({ name, status, color, photo, birthDate: birthDate || undefined });
    setSaved(true);
    setTimeout(() => nav("/account"), 700);
  };

  return (
    <div className="flex h-full flex-col">
      <Header title={t("الملف الشخصي", "Profile")} showBack />
      {editing && <PhotoEditorSheet src={editing} onCancel={() => setEditing(null)} onDone={(d) => { setPhoto(d); setEditing(null); }} />}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="my-5 flex flex-col items-center gap-3">
          <div className="relative">
            {photo ? (
              <img src={photo} alt={t("صورتك الشخصية", "Your profile photo")} className="h-24 w-24 rounded-full object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full text-4xl font-extrabold text-white" style={{ background: color }}>
                {(name.trim() || p.name).charAt(0)}
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} aria-label={t("إضافة صورة", "Add photo")}
              className="absolute -bottom-1 -end-1 flex h-9 w-9 items-center justify-center rounded-full bg-rachat-red text-white ring-2 ring-rachat-black">
              <Camera size={16} />
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="flex gap-3 text-xs font-bold">
            <button onClick={() => fileRef.current?.click()} className="text-rachat-coral">{photo ? t("تغيير الصورة", "Change photo") : t("إضافة صورة", "Add photo")}</button>
            {photo && <button onClick={() => setEditing(photo)} className="flex items-center gap-1 text-rachat-gold"><Pencil size={13} /> {t("تعديل", "Edit")}</button>}
            {photo && <button onClick={() => setPhoto(undefined)} className="flex items-center gap-1 text-neutral-500"><Trash2 size={13} /> {t("إزالة", "Remove")}</button>}
          </div>
          <div className="flex gap-2.5" role="radiogroup" aria-label={t("لون الصورة", "Avatar color")}>
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={c === color}
                aria-label={t(`لون ${c}`, `Color ${c}`)}
                onClick={() => setColor(c)}
                className={`flex h-8 w-8 items-center justify-center rounded-full ${c === color ? "ring-2 ring-rachat-papyrus ring-offset-2 ring-offset-rachat-black" : ""}`}
                style={{ background: c }}
              >
                {c === color && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        <label className="mb-1 block text-[11px] font-bold text-neutral-500">{t("الاسم", "Name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30}
          className="mb-4 w-full rounded-xl bg-rachat-card px-3.5 py-3 text-sm text-rachat-papyrus outline-none focus:ring-1 focus:ring-rachat-red" />

        <label className="mb-1 block text-[11px] font-bold text-neutral-500">{t("الحالة", "Status")}</label>
        <input value={status} onChange={(e) => setStatus(e.target.value)} maxLength={60}
          className="mb-1 w-full rounded-xl bg-rachat-card px-3.5 py-3 text-sm text-rachat-papyrus outline-none focus:ring-1 focus:ring-rachat-red" />
        <div className="mb-4 text-end text-[10.5px] text-neutral-500">{num(status.length)}/{num(60)}</div>

        <label htmlFor="rc-birth" className="mb-1 block text-[11px] font-bold text-neutral-500">{t("تاريخ الميلاد", "Date of birth")}</label>
        <input
          id="rc-birth" type="date" value={birthDate} max={todayDay()} dir="ltr"
          onChange={(e) => setBirthDate(e.target.value)}
          aria-invalid={badBirth || undefined}
          aria-describedby="rc-birth-help"
          className={`w-full rounded-xl bg-rachat-card px-3.5 py-3 text-sm text-rachat-papyrus outline-none focus:ring-1 ${badBirth ? "ring-1 ring-rachat-coral" : "focus:ring-rachat-red"}`}
        />
        <p id="rc-birth-help" className="mb-6 mt-1.5 text-[10.5px] leading-[17px] text-neutral-500">
          {badBirth
            ? <span role="alert" className="text-rachat-coral">{t("تاريخ ميلاد غير صحيح", "That date of birth isn't valid")}</span>
            : isAdultDay(birthDate)
              ? t(`التطبيق مفتوح لكل الأعمار. حسابك مفتوح له خدمات ${num(ADULT_AGE)}+ (المحفظة ودفع الفواتير).`, `Raa Chat is open to all ages. Your account has access to ${ADULT_AGE}+ services (wallet and bill payment).`)
              : t(`التطبيق مفتوح لكل الأعمار — الشات والجروبات والغرف والستوري كلها متاحة. تاريخ الميلاد بيتحدد بيه خدمات ${num(ADULT_AGE)}+ بس (المحفظة ودفع الفواتير).`, `Raa Chat is open to all ages — chats, groups, rooms and stories are all available. Your date of birth only decides access to ${ADULT_AGE}+ services (wallet and bill payment).`)}
        </p>

        <button onClick={save} disabled={!name.trim() || badBirth}
          className="w-full rounded-xl bg-gradient-to-br from-rachat-red to-rachat-coral py-3 text-sm font-bold text-white disabled:opacity-40">
          {saved ? t("تم الحفظ ✓", "Saved ✓") : t("حفظ التغييرات", "Save changes")}
        </button>
      </div>
    </div>
  );
}
