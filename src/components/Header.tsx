import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Moon, Search, Sun } from "lucide-react";
import { tr, useDir } from "../i18n";
import { useLocation, useNavigate } from "react-router-dom";
import { setTheme, useTheme } from "../theme/useTheme";
import logo from "../assets/logo.png";

interface HeaderProps {
  title: string;
  /** undefined = تلقائي (سهم في كل صفحة غير الرئيسية)؛ false = إخفاء */
  showBack?: boolean;
  right?: ReactNode;
  /** false = إخفاء زراري البحث والوضع الليلي (شاشة فيها أزرار كتير مثلًا) */
  globalActions?: boolean;
}

/**
 * الرأس المشترك لكل الشاشات — راجع القسم 4 من الـ PRD:
 * «شريط علوي أسود عميق يحمل شعار رع شات... وأيقونات البحث والإعدادات
 * بلون أحمر فرعوني عند التفعيل».
 */
/** القائمة الجانبية في الشاشة العريضة ثابتة ومش صفحة اتنقلنا لها، فمالهاش سهم رجوع. */
const NoBackContext = createContext(false);
export const SideList = ({ children }: { children: ReactNode }) => <NoBackContext.Provider value={true}>{children}</NoBackContext.Provider>;

export function Header({ title, showBack, right, globalActions = true }: HeaderProps) {
  const inSideList = useContext(NoBackContext);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dir = useDir();
  const theme = useTheme();
  const dark = theme === "dark";
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
    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-rachat-black">
      <div className="flex min-w-0 items-center gap-2.5">
        {back ? (
          <button onClick={goBack} aria-label={tr("رجوع", "Back")} title={tr("رجوع", "Back")} className="-m-1 p-1 text-rachat-papyrus">
            <Back size={22} />
          </button>
        ) : (
          <HorusMark />
        )}
        <h1 className="truncate font-extrabold text-lg">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-rachat-red">
        {right}
        {globalActions && pathname !== "/search" && (
          <button onClick={() => navigate("/search")} aria-label={tr("بحث", "Search")} title={tr("بحث", "Search")} className="-m-1 p-1">
            <Search size={19} />
          </button>
        )}
        {globalActions && (
          <button
            onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={dark ? tr("الوضع الفاتح", "Light mode") : tr("الوضع الليلي", "Dark mode")}
            title={dark ? tr("الوضع الفاتح", "Light mode") : tr("الوضع الليلي", "Dark mode")}
            aria-pressed={!dark}
            className="-m-1 p-1"
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        )}
      </div>
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
