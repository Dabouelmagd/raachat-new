import { useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "../i18n";
import { useAppState } from "../store/AppContext";
import { StoryViewer } from "./StoryViewer";
import { AddStorySheet } from "./AddStorySheet";

/**
 * شريط "القصص" أعلى شاشة الدردشات — هذا هو تنفيذ قسم "نشر المحتوى"
 * (منشورات/Stories يومية) اللي اتحدد في نطاق هذه المرحلة.
 */
export function StoriesBar() {
  const t = useT();
  const { stories } = useAppState();
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const openIndex = stories.findIndex((s) => s.id === openStoryId);

  return (
    <div className="flex gap-3 overflow-x-auto px-3 pb-3 pt-1">
      <button aria-label={t("إضافة قصة", "Add story")} onClick={() => setShowAdd(true)} className="flex flex-shrink-0 flex-col items-center gap-1">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-rachat-maroon">
          <Plus size={20} className="text-rachat-coral" />
        </div>
        <span className="text-[10px] text-neutral-400">{t("قصتك", "Your story")}</span>
      </button>

      {stories.map((s) => (
        <button
          key={s.id}
          onClick={() => setOpenStoryId(s.id)}
          className="flex flex-shrink-0 flex-col items-center gap-1"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full p-[2px]"
            style={{
              background: s.seen
                ? "#3a322d"
                : `linear-gradient(135deg, ${s.colorFrom}, ${s.colorTo})`,
            }}
          >
            <div
              className="flex h-full w-full items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: s.image ? `center / cover url(${s.image})` : `linear-gradient(135deg, ${s.colorFrom}, ${s.colorTo})` }}
            >
              {!s.image && s.authorName[0]}
            </div>
          </div>
          <span className="max-w-[56px] truncate text-[10px] text-neutral-400">
            {s.authorId === "me" ? t("أنت", "You") : s.authorName.split(" ")[0]}
          </span>
        </button>
      ))}

      {openIndex >= 0 && (
        <StoryViewer startIndex={openIndex} onClose={() => setOpenStoryId(null)} />
      )}
      {showAdd && <AddStorySheet onClose={() => setShowAdd(false)} />}
    </div>
  );
}
