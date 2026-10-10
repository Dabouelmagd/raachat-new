import type { ReactNode } from "react";
import { Users, Heart, Briefcase, Gamepad2, Music, BookOpen, Coffee, Plane, Camera, Star, Home, Code2, Trophy, Utensils, type LucideIcon } from "lucide-react";
import type { Thread } from "../types";

/** أيقونات متاحة للجروب (المفتاح بيتخزّن في Thread.icon) */
export const GROUP_ICONS: Record<string, LucideIcon> = {
  users: Users, heart: Heart, briefcase: Briefcase, game: Gamepad2, music: Music, book: BookOpen,
  coffee: Coffee, plane: Plane, camera: Camera, star: Star, home: Home, code: Code2, trophy: Trophy, food: Utensils,
};
export const GROUP_COLORS = ["#E1523E", "#F2795C", "#C9A227", "#5B2621", "#7a4a2a", "#2E7D6B", "#2F6DB5", "#6B4BB5", "#B5477A", "#3A322D", "#14B8A6", "#84CC16"];

/** صورة المحادثة/الجروب: صورة مرفوعة > أيقونة > الحرف الأول. اللون من color أو colorClass */
export function ThreadAvatar({
  thread, className = "h-11 w-11 text-base", children,
}: { thread: Pick<Thread, "photo" | "icon" | "color" | "colorClass" | "initial">; className?: string; children?: ReactNode }) {
  const Icon = thread.icon ? GROUP_ICONS[thread.icon] : undefined;
  const bg = thread.color ? { background: thread.color } : undefined;
  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center rounded-full font-extrabold ${thread.color ? "text-white" : `text-rachat-ink ${thread.colorClass}`} ${className}`}
      style={bg}
    >
      {thread.photo ? (
        <img src={thread.photo} alt="" className="h-full w-full rounded-full object-cover" />
      ) : Icon ? (
        <Icon className="h-[48%] w-[48%]" />
      ) : (
        thread.initial
      )}
      {children}
    </div>
  );
}
