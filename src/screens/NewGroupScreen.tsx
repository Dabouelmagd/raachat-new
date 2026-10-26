import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Check, Infinity as InfinityIcon, Pencil, Search, Trash2 } from "lucide-react";
import { readImage } from "../media/files";
import { GROUP_COLORS, GROUP_ICONS, ThreadAvatar } from "../components/ThreadAvatar";
import { useT, num } from "../i18n";
import { Header } from "../components/Header";
import { PhotoEditorSheet } from "../components/PhotoEditorSheet";
import { useAppState, useAppActions } from "../store/AppContext";

export default function NewGroupScreen() {
  const navigate = useNavigate();
  const t = useT();
  const { contacts } = useAppState();
  const { createGroup } = useAppActions();
  const [selected, setSelected] = useState<string[]>([]);
  const [step, setStep] = useState<"pick" | "name">("pick");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [icon, setIcon] = useState<string | undefined>();
  const [photo, setPhoto] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null); // الصورة المفتوحة في المحرّر
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => contacts.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())), [contacts, q]);
  const allShown = shown.length > 0 && shown.every((c) => selected.includes(c.id));
  const toggleAll = () =>
    setSelected((s) => (allShown ? s.filter((id) => !shown.some((c) => c.id === id)) : [...new Set([...s, ...shown.map((c) => c.id)])]));
  /** الصورة المختارة بتتفتح في المحرّر الأول (قص دائري/تكبير/تدوير) قبل ما تتحفظ */
  const pickPhoto = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    try { setEditing(await readImage(f, 1200)); } catch { /* تجاهل */ }
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const finish = () => {
    if (!name.trim() || selected.length === 0) return;
    createGroup(name.trim(), selected, { color, icon: photo ? undefined : icon, photo });
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col">
      {editing && <PhotoEditorSheet src={editing} onCancel={() => setEditing(null)} onDone={(d) => { setPhoto(d); setEditing(null); }} />}
      <Header title={step === "pick" ? t("أعضاء المجموعة", "Group members") : t("اسم المجموعة", "Group name")} showBack />

      {step === "pick" ? (
        <>
          <div className="flex-1 overflow-y-auto px-4">
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-rachat-card px-3 py-2">
              <Search size={15} className="text-neutral-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ابحث في جهات الاتصال", "Search contacts")} className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-600" />
            </div>
            <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-neutral-500">
              <span>{t("اختر أعضاء المجموعة", "Choose group members")} ({num(selected.length)} {t("محدد", "selected")})</span>
              <button onClick={toggleAll} className="font-bold text-rachat-coral">{allShown ? t("إلغاء تحديد الكل", "Deselect all") : t("تحديد الكل", "Select all")}</button>
            </div>
            <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-rachat-gold/10 px-2.5 py-1.5 text-[11px] text-rachat-gold">
              <InfinityIcon size={14} /> {t("لا يوجد حدّ أقصى لعدد أعضاء المجموعة", "There is no limit on the number of group members")}
            </p>
            {shown.map((c) => {
              const active = selected.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="mb-2 flex w-full items-center gap-3 rounded-xl bg-rachat-card px-3.5 py-2.5"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full font-bold text-rachat-ink ${c.colorClass}`}>
                    {c.initial}
                  </div>
                  <span className="flex-1 text-start text-sm text-rachat-papyrus">{c.name}</span>
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                      active ? "border-rachat-red bg-rachat-red" : "border-neutral-600"
                    }`}
                  >
                    {active && <Check size={12} className="text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="p-4">
            <button
              disabled={selected.length === 0}
              onClick={() => setStep("name")}
              className="w-full rounded-xl bg-gradient-to-br from-rachat-red to-rachat-coral py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {t("التالي", "Next")} ({num(selected.length)})
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
          <div className="mb-5 flex flex-col items-center gap-2">
            <div className="relative">
              <ThreadAvatar thread={{ color, icon: photo ? undefined : icon, photo, colorClass: "", initial: name.trim()[0] ?? "؟" }} className="h-24 w-24 text-4xl" />
              <button onClick={() => fileRef.current?.click()} aria-label={t("إضافة صورة", "Add photo")} className="absolute -bottom-1 -end-1 flex h-9 w-9 items-center justify-center rounded-full bg-rachat-red text-white ring-2 ring-rachat-black"><Camera size={16} /></button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            {photo && <button onClick={() => setEditing(photo)} className="flex items-center gap-1 text-xs font-bold text-rachat-gold"><Pencil size={13} /> {t("تعديل الصورة", "Edit photo")}</button>}
            {photo && <button onClick={() => setPhoto(undefined)} className="flex items-center gap-1 text-xs font-bold text-neutral-500"><Trash2 size={13} /> {t("إزالة الصورة", "Remove photo")}</button>}
          </div>
          <label className="mb-2 text-[11px] text-neutral-500">{t("اسم المجموعة", "Group name")}</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("مثال: رحلة العين السخنة 🏖️", "e.g. Ain Sokhna trip 🏖️")}
            className="mb-5 rounded-xl bg-rachat-card px-3.5 py-3 text-sm text-rachat-papyrus outline-none placeholder:text-neutral-600"
          />
          <label className="mb-2 text-[11px] text-neutral-500">{t("اللون", "Color")}</label>
          <div className="mb-5 flex flex-wrap items-center gap-2.5">
            {GROUP_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`${t("لون", "Color")} ${c}`} className={`flex h-8 w-8 items-center justify-center rounded-full ${color === c ? "ring-2 ring-rachat-papyrus" : ""}`} style={{ background: c }}>
                {color === c && <Check size={14} className="text-white" />}
              </button>
            ))}
            <label className="flex h-8 cursor-pointer items-center rounded-full bg-rachat-card px-3 text-[11px] font-bold text-neutral-400">
              {t("لون مخصص", "Custom")}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="ms-2 h-5 w-5 cursor-pointer border-0 bg-transparent p-0" />
            </label>
          </div>
          <label className="mb-2 text-[11px] text-neutral-500">{t("الأيقونة", "Icon")}</label>
          <div className="mb-6 flex flex-wrap gap-2">
            <button onClick={() => { setIcon(undefined); }} className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2 text-xs font-bold ${!icon ? "bg-rachat-red text-white" : "bg-rachat-card text-neutral-400"}`}>{t("الحرف", "Letter")}</button>
            {Object.entries(GROUP_ICONS).map(([k, I]) => (
              <button key={k} onClick={() => { setIcon(k); setPhoto(undefined); }} aria-label={k} className={`flex h-10 w-10 items-center justify-center rounded-xl ${icon === k && !photo ? "bg-rachat-red text-white" : "bg-rachat-card text-neutral-400"}`}><I size={18} /></button>
            ))}
          </div>
          <button
            disabled={!name.trim()}
            onClick={finish}
            className="mt-auto w-full rounded-xl bg-gradient-to-br from-rachat-red to-rachat-coral py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {t("إنشاء المجموعة", "Create group")}
          </button>
        </div>
      )}
    </div>
  );
}
