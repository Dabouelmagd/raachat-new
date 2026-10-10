import { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { tr, useDir } from "../i18n";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

interface HeaderProps {
  title: string;
  /** undefined = تلقائي (سهم في كل صفحة غير الرئيسية)؛ false = إخفاء */
  showBack?: boolean;
  right?: ReactNode;
}

/**
 * الرأس المشترك لكل الشاشات — راجع القسم 4 من الـ PRD:
 * «شريط علوي أسود عميق يحمل شعار رع شات... وأيقونات البحث والإعدادات
 * بلون أحمر فرعوني عند التفعيل».
 */
export function Header({ title, showBack, right }: HeaderProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dir = useDir();
  // سهم الرجوع تلقائي في أي صفحة غير الرئيسية على الموبايل؛ في الشاشة العريضة القوائم الجانبية من غير سهم
  const wide = typeof matchMedia !== "undefined" && matchMedia("(min-width: 900px)").matches;
  const back = showBack ?? (!wide && pathname !== "/");
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-rachat-black">
      <div className="flex items-center gap-2.5">
        {back ? (
          <button onClick={() => navigate(-1)} className="text-rachat-papyrus">
            <Back size={22} />
          </button>
        ) : (
          <HorusMark />
        )}
        <span className="font-extrabold text-lg">{title}</span>
      </div>
      <div className="flex items-center gap-4 text-rachat-red">{right}</div>
    </div>
  );
}

export function HorusMark({ size = 30 }: { size?: number }) {
  return (
    <img
      src={logo}
      alt={tr("رع شات", "Raa Chat")}
      width={size}
      height={size}
      className="rounded-[22%] object-cover"
      style={{ width: size, height: size }}
    />
  );
}
