import { Ankh, Cartouche, Lotus, Pyramids, Scarab } from "./PharaohIcons";
import { Megaphone } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useT } from "../i18n";

// الدردشات، الجروبات، الغرف، الخدمات، الحساب
const items = [
  { to: "/", label: ["الدردشات", "Chats"], icon: Cartouche, end: true },
  { to: "/groups", label: ["الجروبات", "Groups"], icon: Pyramids, end: false },
  { to: "/rooms", label: ["الغرف", "Rooms"], icon: Lotus, end: false },
  { to: "/services", label: ["الخدمات", "Services"], icon: Scarab, end: false },
  { to: "/ads", label: ["الإعلانات", "Ads"], icon: Megaphone, end: false },
  { to: "/account", label: ["الحساب", "Account"], icon: Ankh, end: false },
];

export function BottomNav() {
  const t = useT();
  return (
    <div className="flex border-t border-rachat-maroon/40 bg-rachat-black px-1.5 pb-3 pt-2">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className="flex flex-1 flex-col items-center gap-1 py-1"
        >
          {({ isActive }) => (
            <>
              <item.icon
                size={21}
                strokeWidth={isActive ? 2.4 : 1.8}
                className={isActive ? "text-rachat-red" : "text-neutral-500"}
              />
              <span
                className={`text-[10.5px] ${
                  isActive ? "font-bold text-rachat-red" : "font-medium text-neutral-500"
                }`}
              >
                {t(item.label[0], item.label[1])}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
