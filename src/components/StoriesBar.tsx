import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { num, useT } from "../i18n";
import { useAppState } from "../store/AppContext";
import { StoryViewer } from "./StoryViewer";
import { AddStorySheet } from "./AddStorySheet";
import { SponsoredStory } from "../ads/SponsoredStory";

/**
 * شريط "القصص" أعلى شاشة الدردشات — هذا هو تنفيذ قسم "نشر المحتوى"
 * (منشورات/Stories يومية) اللي اتحدد في نطاق هذه المرحلة.
 */
export function StoriesBar() {
  const t = useT();
  const { stories } = useAppState();
  const [openAuthor, setOpenAuthor] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  /**
   * **دايرة واحدة لكل حساب.** قبل كده كانت دايرة لكل ستوري، فاللي نزّل تلات
   * ستوريز يظهر تلات مرات والشريط يتملى بحساب واحد.
   * الحلقة الملوّنة = عنده حاجة لسه ما اتشافتش، والرقم = عدد ستورياته.
   */
  const groups = useMemo(() => {
    const m = new Map<string, { authorId: string; authorName: string; items: typeof stories; unseen: boolean }>();
    for (const s of stories) {
      const g = m.get(s.authorId) ?? { authorId: s.authorId, authorName: s.authorName, items: [], unseen: false };
      g.items = [...g.items, s];
      if (!s.seen) g.unseen = true;
      m.set(s.authorId, g);
    }
    return [...m.values()];
  }, [stories]);

  return (
    <div className="flex gap-3 overflow-x-auto px-3 pb-3 pt-1">
      <button aria-label={t("إضافة قصة", "Add story")} onClick={() => setShowAdd(true)} className="flex flex-shrink-0 flex-col items-center gap-1">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-rachat-maroon">
          <Plus size={20} className="text-rachat-coral" />
        </div>
        <span className="text-[10px] text-neutral-400">{t("قصتك", "Your story")}</span>
      </button>

      {groups.map((g) => {
        // الغلاف: أول ستوري لسه ما اتشافتش عنده، وإلا أول واحدة
        const cover = g.items.find((s) => !s.seen) ?? g.items[0];
        return (
          <button
            key={g.authorId}
            onClick={() => setOpenAuthor(g.authorId)}
            aria-label={`${g.authorName} — ${g.items.length}`}
            className="flex flex-shrink-0 flex-col items-center gap-1"
          >
            <div
              className="relative flex h-14 w-14 items-center justify-center rounded-full p-[2px]"
              style={{ background: g.unseen ? `linear-gradient(135deg, ${cover.colorFrom}, ${cover.colorTo})` : "#3a322d" }}
            >
              <div
                className="flex h-full w-full items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: cover.image ? `center / cover url(${cover.image})` : `linear-gradient(135deg, ${cover.colorFrom}, ${cover.colorTo})` }}
              >
                {!cover.image && g.authorName[0]}
              </div>
              {g.items.length > 1 && (
                <span className="absolute -top-0.5 end-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-rachat-black px-1 text-[9px] font-bold text-rachat-gold ring-1 ring-rachat-black">
                  {num(g.items.length)}
                </span>
              )}
            </div>
            <span className="max-w-[56px] truncate text-[10px] text-neutral-400">
              {g.authorId === "me" ? t("أنت", "You") : g.authorName.split(" ")[0]}
            </span>
          </button>
        );
      })}

      {/* الستوري الممول في آخر الشريط ومتعلّم بـ«إعلان» — مش وسط ستوريز الناس */}
      <SponsoredStory />

      {openAuthor && <StoryViewer authorId={openAuthor} onClose={() => setOpenAuthor(null)} />}
      {showAdd && <AddStorySheet onClose={() => setShowAdd(false)} />}
    </div>
  );
}
