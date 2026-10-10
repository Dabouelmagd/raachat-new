import { createContext, useContext } from "react";

/** تسجيل الخروج — يوفّره App ويستخدمه الحساب. مع الباك إند الحقيقي يلغي الجلسة على الخادم. */
export const LogoutContext = createContext<() => void>(() => {});
export const useLogout = () => useContext(LogoutContext);
