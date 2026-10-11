import { createContext, useContext, type ReactNode } from "react";
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
/** القائمة الجانبية في الشاشة العريضة ثابتة ومش صفحة اتنقلنا لها، فمالهاش سهم رجوع. */
const NoBackContext = createContext(false);
export const SideList = ({ children }: { children: ReactNode }) => <NoBackContext.Provider value={true}>{children}</NoBackContext.Provider>;

export function Header({ title, showBack, right }: HeaderProps) {
  const inSideList = useContext(NoBackContext);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dir = useDir();
  // سهم الرجوع في أي صفحة غير الرئيسية (موبايل وشاشة عريضة)
  const back = showBack ?? (!inSideList && pathname !== "/");
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  /** لو مفيش تاريخ تصفّح (فتحت الصفحة برابط مباشر أو بعد Refresh) نرجع للرئيسية بدل ما الزرار ما يعملش حاجة */
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === "number" && idx > 0) navigate(-1);
    else navigate("/");
  };
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-rachat-black">
      <div className="flex items-center gap-2.5">
        {back ? (
          <button onClick={goBack} aria-label={tr("رجوع", "Back")} title={tr("رجوع", "Back")} className="-m-1 p-1 text-rachat-papyrus">
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
