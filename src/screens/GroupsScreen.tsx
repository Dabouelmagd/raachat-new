import { Plus, Users, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_ON } from "../api/client";
import { useT, num, loc } from "../i18n";
import { ThreadAvatar } from "../components/ThreadAvatar";
import { Header } from "../components/Header";
import { useAppState, useAppActions } from "../store/AppContext";
import { threadNameClass, UnreadBadge } from "../components/unread";
import { PUBLIC_GROUPS } from "../data/groups";

export default function GroupsScreen() {
  const navigate = useNavigate();
  const tt = useT();
  const { threads } = useAppState();
  const { createGroup, listPublicGroups, joinPublicGroup } = useAppActions();
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof listPublicGroups>>>(null);
  useEffect(() => { if (API_ON) void listPublicGroups().then(setRemote).catch(() => {}); }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = threads.filter((t) => t.type === "group");
  const joined = (name: string) => mine.some((t) => t.name === name);

  return (
    <div className="flex h-full flex-col">
      <Header title={tt("المجموعات", "Groups")} right={<button onClick={() => navigate("/new-group")}><Plus size={22} /></button>} />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <h2 className="mb-2 mt-1 text-sm font-extrabold">{tt("مجموعاتي", "My groups")}</h2>
        <div className="space-y-2">
          {mine.map((t) => (
            <button key={t.id} onClick={() => navigate(`/chat/${t.id}`)}
              className="flex w-full items-center gap-3 rounded-2xl bg-rachat-card p-3 text-start">
              <ThreadAvatar thread={t} />
              <div className="min-w-0 flex-1">
                <div className={threadNameClass(t.unread)} dir="auto">{t.name}</div>
                <div className="flex items-center gap-1 text-[11px] text-neutral-500"><Users size={11} /> {num(t.memberIds.length + 1)} {tt("أعضاء", "members")}</div>
              </div>
              <UnreadBadge count={t.unread} />
            </button>
          ))}
          {mine.length === 0 && <p className="py-4 text-center text-xs text-neutral-500">{tt("لا توجد مجموعات بعد — أنشئ واحدة أو انضمّ من الأسفل", "No groups yet — create one or join below")}</p>}
          <button onClick={() => navigate("/new-group")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-rachat-red/60 py-3 text-sm font-bold text-rachat-coral">
            <Plus size={16} /> {tt("إنشاء مجموعة جديدة", "Create new group")}
          </button>
        </div>

        <h2 className="mb-2 mt-6 text-sm font-extrabold">{tt("اكتشف مجموعات", "Discover groups")}</h2>
        <div className="space-y-2">
          {(API_ON ? (remote ?? []).map((g) => ({ ...g, memberIds: [] as string[], desc: g.desc })) : PUBLIC_GROUPS).map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-rachat-card p-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-extrabold text-rachat-ink ${g.colorClass}`}>{g.initial}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{g.name}</div>
                <div className="truncate text-[11px] text-neutral-400">{g.desc}</div>
                <div className="text-[10.5px] text-neutral-500">{g.members.toLocaleString(loc())} {tt("عضو", "members")}</div>
              </div>
              {(API_ON ? ("joined" in g && g.joined) : joined(g.name)) ? (
                <span className="flex items-center gap-1 text-xs font-bold text-rachat-gold"><Check size={14} /> {tt("منضم", "Joined")}</span>
              ) : (
                <button onClick={() => (API_ON ? void joinPublicGroup(g.id) : createGroup(g.name, g.memberIds))} className="rounded-lg bg-rachat-red px-3.5 py-1.5 text-xs font-extrabold">{tt("انضمام", "Join")}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
