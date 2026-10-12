import { notify } from "../sound/notify";
import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { API_ON, api, closePollApi, createChannelApi, createPollApi, ensureUploaded, listChannelsApi, setPinned as setPinnedApi, subscribeChannelApi, unsubscribeChannelApi, uploadBlob, useSession, votePollApi } from "../api/client";
import { mapContact, mapMessage, mapStory, mapThread, type ApiMessage, type ApiStory, type ApiThread, type ApiUser } from "../api/mappers";
import { connectSocket } from "../api/socket";
import { setProfileFromServer } from "./profile";
import { setCalls } from "./calls";
import { Attachment, Contact, Thread, Message, VoiceRoom, Story, RoomParticipant } from "../types";
import { tr, loc } from "../i18n";
import { CONTACTS, DEMO_CHANNELS, demoChannelPosts, INITIAL_THREADS, INITIAL_MESSAGES, INITIAL_ROOMS, INITIAL_STORIES } from "./seed";

/**
 * طبقة حالة وهمية (mock) تحاكي شكل استدعاءات API حقيقية.
 * كل الدوال في `actions` أسفل الملف هي نقاط الاستبدال المتوقعة لاحقًا:
 * بدّل جسم كل دالة بنداء fetch/GraphQL حقيقي بدل dispatch المحلي،
 * والواجهات (الشاشات) لن تحتاج أي تعديل لأنها تتعامل مع `actions` فقط.
 */

interface AppState {
  contacts: Contact[];
  threads: Thread[];
  messages: Message[];
  rooms: VoiceRoom[];
  stories: Story[];
}

const emptyState: AppState = { contacts: [], threads: [], messages: [], rooms: [], stories: [] };
const initialState: AppState = API_ON ? emptyState : {
  contacts: CONTACTS,
  threads: INITIAL_THREADS,
  messages: INITIAL_MESSAGES,
  rooms: INITIAL_ROOMS,
  stories: INITIAL_STORIES,
};

type Action =
  | { type: "HYDRATE"; contacts: Contact[]; threads: Thread[]; messages: Message[]; stories: Story[] }
  | { type: "UPSERT_THREAD"; thread: Thread }
  | { type: "MARK_READ"; threadId: string }
  | { type: "SET_PINNED"; threadId: string; pinned: boolean }
  | { type: "UPSERT_MESSAGE"; message: Message }
  | { type: "UPSERT_STORY"; story: Story }
  | { type: "SET_ROOMS"; rooms: VoiceRoom[] }
  | { type: "SEND_MESSAGE"; threadId: string; text: string; replyToId?: string; attachment?: Attachment }
  | { type: "RECEIVE_MESSAGE"; threadId: string; authorName: string; text: string }
  | { type: "EDIT_MESSAGE"; messageId: string; text: string }
  | { type: "DELETE_MESSAGE"; messageId: string }
  | { type: "TOGGLE_REACTION"; messageId: string; emoji: string }
  | { type: "CREATE_POLL"; threadId: string; question: string; options: string[]; multi: boolean }
  | { type: "VOTE_POLL"; messageId: string; optionIds: string[] }
  | { type: "CLOSE_POLL"; messageId: string }
  | { type: "CREATE_CHANNEL"; id: string; name: string; about?: string }
  | { type: "SUBSCRIBE_CHANNEL"; id: string }
  | { type: "CREATE_DM"; contactId: string; id: string }
  | { type: "CREATE_GROUP"; name: string; memberIds: string[]; look?: GroupLook }
  | { type: "LEAVE_THREAD"; threadId: string }
  | { type: "CREATE_ROOM"; id: string; name: string }
  | { type: "JOIN_ROOM"; roomId: string; identityMode: "real" | "temp" }
  | { type: "LEAVE_ROOM"; roomId: string }
  | { type: "TOGGLE_MUTE"; roomId: string }
  | { type: "SIMULATE_PARTICIPANT_JOIN"; roomId: string; participant: RoomParticipant }
  | { type: "ADD_STORY"; caption: string; colorFrom: string; colorTo: string; image?: string }
  | { type: "MARK_STORY_SEEN"; storyId: string };

export interface GroupLook { color?: string; icon?: string; photo?: string }

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

function nowLabel() {
  return new Intl.DateTimeFormat(loc(), { hour: "numeric", minute: "2-digit" }).format(new Date());
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, contacts: action.contacts, threads: action.threads, messages: action.messages, stories: action.stories };
    case "SET_ROOMS":
      return { ...state, rooms: action.rooms };
    case "MARK_READ":
      // فتح المحادثة = الاسم يرجع خط عادي والعدّاد يختفي
      return { ...state, threads: state.threads.map((t) => (t.id === action.threadId && t.unread ? { ...t, unread: 0 } : t)) };
    case "SET_PINNED":
      // **العلم بس** — الترتيب بيتعمل وقت العرض (ChatsScreen) عشان فك التثبيت
      // يرجّع المحادثة لمكانها الأصلي بدل ما تفضل فوق
      return { ...state, threads: state.threads.map((t) => (t.id === action.threadId ? { ...t, pinned: action.pinned } : t)) };
    case "UPSERT_THREAD": {
      const has = state.threads.some((t) => t.id === action.thread.id);
      return { ...state, threads: has ? state.threads.map((t) => (t.id === action.thread.id ? action.thread : t)) : [action.thread, ...state.threads] };
    }
    case "UPSERT_MESSAGE": {
      const m = action.message;
      const has = state.messages.some((x) => x.id === m.id);
      const messages = has ? state.messages.map((x) => (x.id === m.id ? m : x)) : [...state.messages, m];
      // المحادثة اللي فيها نشاط جديد بتطلع فوق
      const t = state.threads.find((x) => x.id === m.threadId);
      const threads = !has && t ? [t, ...state.threads.filter((x) => x.id !== t.id)] : state.threads;
      return { ...state, messages, threads };
    }
    case "UPSERT_STORY": {
      const has = state.stories.some((x) => x.id === action.story.id);
      return { ...state, stories: has ? state.stories.map((x) => (x.id === action.story.id ? action.story : x)) : [action.story, ...state.stories] };
    }
    case "SEND_MESSAGE": {
      const msg: Message = {
        id: uid("m"),
        threadId: action.threadId,
        authorId: "me",
        authorName: tr("أنت", "You"),
        text: action.text,
        time: nowLabel(),
        at: Date.now(),
        replyToId: action.replyToId,
        reactions: {},
        attachment: action.attachment,
      };
      return { ...state, messages: [...state.messages, msg] };
    }
    case "CREATE_CHANNEL": {
      const t: Thread = {
        id: action.id, type: "channel", name: action.name, about: action.about,
        colorClass: "bg-rachat-gold", initial: [...action.name][0] ?? "ق",
        memberIds: [], createdByMe: true, memberCount: 1, myRole: "owner", canPost: true,
      };
      return { ...state, threads: [t, ...state.threads] };
    }
    case "SUBSCRIBE_CHANNEL": {
      const found = DEMO_CHANNELS.find((c) => c.id === action.id);
      if (!found || state.threads.some((t) => t.id === action.id)) return state;
      const t: Thread = {
        id: found.id, type: "channel", name: found.name, about: found.about, colorClass: found.colorClass,
        initial: found.initial, memberIds: [], memberCount: found.members + 1, myRole: "member", canPost: false,
      };
      // منشورات القناة بتظهر بعد الاشتراك (زي ما بتتحمّل من السيرفر)
      return { ...state, threads: [t, ...state.threads], messages: [...state.messages, ...demoChannelPosts(found.id)] };
    }
    case "CREATE_POLL": {
      const msg: Message = {
        id: uid("m"), threadId: action.threadId, authorId: "me", authorName: tr("أنت", "You"),
        text: "", time: nowLabel(), at: Date.now(), reactions: {},
        poll: {
          question: action.question, multi: action.multi, closed: false,
          options: action.options.map((text, i) => ({ id: `o${i}_${uid("p")}`, text, voterIds: [] })),
        },
      };
      return { ...state, messages: [...state.messages, msg] };
    }
    case "VOTE_POLL":
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== action.messageId || !m.poll || m.poll.closed) return m;
          const options = m.poll.options.map((o) => ({
            ...o,
            // صوتي القديم بيتشال من كل الاختيارات الأول — الاختيار الواحد استبدال مش إضافة
            voterIds: action.optionIds.includes(o.id)
              ? [...o.voterIds.filter((v) => v !== "me"), "me"]
              : o.voterIds.filter((v) => v !== "me"),
          }));
          return { ...m, poll: { ...m.poll, options } };
        }),
      };
    case "CLOSE_POLL":
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.messageId && m.poll ? { ...m, poll: { ...m.poll, closed: true } } : m)),
      };
    case "RECEIVE_MESSAGE": {
      const msg: Message = {
        id: uid("m"),
        threadId: action.threadId,
        authorId: "other",
        authorName: action.authorName,
        text: action.text,
        time: nowLabel(),
        at: Date.now(),
        reactions: {},
      };
      return { ...state, messages: [...state.messages, msg] };
    }
    case "EDIT_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId ? { ...m, text: action.text, edited: true } : m
        ),
      };
    case "DELETE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.messageId ? { ...m, deleted: true, text: "" } : m
        ),
      };
    case "TOGGLE_REACTION": {
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== action.messageId) return m;
          const current = m.reactions[action.emoji] ?? [];
          const already = current.includes("me");
          const nextList = already ? current.filter((id) => id !== "me") : [...current, "me"];
          const reactions = { ...m.reactions, [action.emoji]: nextList };
          if (nextList.length === 0) delete reactions[action.emoji];
          return { ...m, reactions };
        }),
      };
    }
    case "CREATE_DM": {
      const existing = state.threads.find((t) => t.type === "dm" && t.memberIds[0] === action.contactId);
      if (existing) return state;
      const contact = state.contacts.find((c) => c.id === action.contactId);
      if (!contact) return state;
      const thread: Thread = {
        id: action.id,
        type: "dm",
        name: contact.name,
        colorClass: contact.colorClass,
        initial: contact.initial,
        memberIds: [contact.id],
      };
      return { ...state, threads: [thread, ...state.threads] };
    }
    case "CREATE_GROUP": {
      const thread: Thread = {
        id: uid("t"),
        type: "group",
        name: action.name,
        colorClass: "bg-rachat-gold",
        initial: action.name.trim()[0] ?? tr("ج", "G"),
        memberIds: action.memberIds,
        createdByMe: true,
        ...action.look,
      };
      return { ...state, threads: [thread, ...state.threads] };
    }
    case "LEAVE_THREAD":
      return {
        ...state,
        threads: state.threads.filter((t) => t.id !== action.threadId),
        messages: state.messages.filter((m) => m.threadId !== action.threadId),
      };
    case "CREATE_ROOM": {
      const room: VoiceRoom = {
        id: action.id,
        name: action.name,
        createdByMe: true,
        joined: false,
        myIdentityMode: null,
        participants: [],
      };
      return { ...state, rooms: [room, ...state.rooms] };
    }
    case "JOIN_ROOM":
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.roomId ? { ...r, joined: true, myIdentityMode: action.identityMode } : r
        ),
      };
    case "LEAVE_ROOM":
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.roomId ? { ...r, joined: false, myIdentityMode: null } : r
        ),
      };
    case "TOGGLE_MUTE":
      // ملاحظة: التحكم الفعلي في المايك يتم عبر MediaStreamTrack.enabled
      // على مستوى مكوّن الغرفة نفسه (WebRTC) — هذا يمثل الحالة فقط.
      return state;
    case "SIMULATE_PARTICIPANT_JOIN":
      return {
        ...state,
        rooms: state.rooms.map((r) =>
          r.id === action.roomId
            ? { ...r, participants: [...r.participants, action.participant] }
            : r
        ),
      };
    case "ADD_STORY": {
      const story: Story = {
        id: uid("s"),
        authorId: "me",
        authorName: tr("أنت", "You"),
        colorFrom: action.colorFrom,
        colorTo: action.colorTo,
        caption: action.caption,
        image: action.image,
        seen: true,
        time: tr("الآن", "Now"),
      };
      return { ...state, stories: [story, ...state.stories] };
    }
    case "MARK_STORY_SEEN":
      return {
        ...state,
        stories: state.stories.map((s) => (s.id === action.storyId ? { ...s, seen: true } : s)),
      };
    default:
      return state;
  }
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<React.Dispatch<Action> | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const session = useSession();
  const meId = session?.meId;

  // وضع الباك إند: تحميل البيانات أول ما نسجّل دخول + اتصال لحظي (Socket.IO)
  useEffect(() => {
    if (!API_ON) return;
    if (!meId) {
      dispatch({ type: "HYDRATE", contacts: [], threads: [], messages: [], stories: [] });
      return;
    }
    let alive = true;
    let sock: Awaited<ReturnType<typeof connectSocket>> = null;
    (async () => {
      try {
        const loadRooms = () => api<VoiceRoom[]>("/rooms").then((rooms) => alive && dispatch({ type: "SET_ROOMS", rooms })).catch(() => {});
        const [me, users, threads, stories, calls] = await Promise.all([
          api<Parameters<typeof setProfileFromServer>[0]>("/me"),
          api<ApiUser[]>("/users"),
          api<ApiThread[]>("/threads"),
          api<ApiStory[]>("/stories"),
          api<Parameters<typeof setCalls>[0]>("/calls"),
        ]);
        const msgs = (await Promise.all(threads.map((t) => api<ApiMessage[]>(`/threads/${t.id}/messages?limit=50`)))).flat();
        if (!alive) return;
        setProfileFromServer(me);
        setCalls(calls);
        dispatch({ type: "HYDRATE", contacts: users.map(mapContact), threads: threads.map(mapThread), messages: msgs.map(mapMessage), stories: stories.map(mapStory) });
        await loadRooms();
        sock = await connectSocket();
        if (!alive) { sock?.close(); return; }
        const upMsg = (m: ApiMessage) => dispatch({ type: "UPSERT_MESSAGE", message: mapMessage(m) });
        sock?.on("message:new", upMsg);
        sock?.on("message:updated", upMsg);
        sock?.on("message:deleted", upMsg);
        sock?.on("thread:new", (t: ApiThread) => dispatch({ type: "UPSERT_THREAD", thread: mapThread(t) }));
        sock?.on("room:changed", () => void loadRooms());
        sock?.on("notice", (n: { title: string; body: string }) => notify(n.title, n.body, true));
        sock?.on("thread:removed", (t: { id: string }) => dispatch({ type: "LEAVE_THREAD", threadId: t.id }));
        sock?.on("thread:updated", (t: ApiThread) => dispatch({ type: "UPSERT_THREAD", thread: mapThread(t) }));
      } catch (e) {
        console.error("تحميل البيانات فشل:", e);
      }
    })();
    return () => { alive = false; sock?.close(); };
  }, [meId]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error("useAppState must be used inside <AppProvider>");
  return ctx;
}

/**
 * نقطة الاستبدال الرئيسية لربط باك إند حقيقي: استبدل جسم أي دالة هنا
 * بنداء API فعلي (مع تحديث الحالة محليًا بشكل متفائل عند الحاجة).
 */
export function useAppActions() {
  const dispatch = useContext(DispatchCtx);
  if (!dispatch) throw new Error("useAppActions must be used inside <AppProvider>");
  return useMemo(() => (API_ON ? { ...mockActions(dispatch), ...apiActions(dispatch) } : mockActions(dispatch)), [dispatch]);
}

type D = React.Dispatch<Action>;

function mockActions(dispatch: D) {
  return {
    sendMessage: (threadId: string, text: string, replyToId?: string, attachment?: Attachment): void | Promise<void> =>
      dispatch({ type: "SEND_MESSAGE", threadId, text, replyToId, attachment }),
    /** محاكاة رسالة واردة — مع الباك إند الحقيقي تيجي من WebSocket */
    receiveMessage: (threadId: string, authorName: string, text: string) =>
      dispatch({ type: "RECEIVE_MESSAGE", threadId, authorName, text }),
    editMessage: (messageId: string, text: string): void | Promise<void> => dispatch({ type: "EDIT_MESSAGE", messageId, text }),
    deleteMessage: (messageId: string): void | Promise<void> => dispatch({ type: "DELETE_MESSAGE", messageId }),
    toggleReaction: (messageId: string, emoji: string): void | Promise<void> => dispatch({ type: "TOGGLE_REACTION", messageId, emoji }),
    createDm: (contactId: string): string | Promise<string> => {
      const id = uid("t");
      dispatch({ type: "CREATE_DM", contactId, id });
      return id;
    },
    createGroup: (name: string, memberIds: string[], look?: GroupLook): void | Promise<void> =>
      dispatch({ type: "CREATE_GROUP", name, memberIds, look }),
    leaveThread: (threadId: string): void | Promise<void> => dispatch({ type: "LEAVE_THREAD", threadId }),
    markRead: (threadId: string): void | Promise<void> => dispatch({ type: "MARK_READ", threadId }),
    setPinned: (threadId: string, pinned: boolean): void | Promise<void> => dispatch({ type: "SET_PINNED", threadId, pinned }),
    createChannel: (name: string, about?: string): string | Promise<string> => {
      const id = uid("ch");
      dispatch({ type: "CREATE_CHANNEL", id, name, about });
      return id;
    },
    listChannels: (): Promise<Thread[] | null> => Promise.resolve(null),
    subscribeChannel: (id: string): void | Promise<void> => dispatch({ type: "SUBSCRIBE_CHANNEL", id }),
    unsubscribeChannel: (id: string): void | Promise<void> => dispatch({ type: "LEAVE_THREAD", threadId: id }),
    createPoll: (threadId: string, question: string, options: string[], multi: boolean): void | Promise<void> =>
      dispatch({ type: "CREATE_POLL", threadId, question, options, multi }),
    votePoll: (messageId: string, optionIds: string[]): void | Promise<void> => dispatch({ type: "VOTE_POLL", messageId, optionIds }),
    closePoll: (messageId: string): void | Promise<void> => dispatch({ type: "CLOSE_POLL", messageId }),
    listPublicGroups: (): Promise<{ id: string; name: string; desc: string; members: number; initial: string; colorClass: string; joined: boolean; color?: string; icon?: string }[] | null> => Promise.resolve(null),
    joinPublicGroup: (_id: string): Promise<void> => Promise.resolve(),
    createRoom: (name: string): string | Promise<string> => {
      const id = uid("r");
      dispatch({ type: "CREATE_ROOM", id, name });
      return id;
    },
    joinRoom: (roomId: string, identityMode: "real" | "temp"): void | Promise<void> => dispatch({ type: "JOIN_ROOM", roomId, identityMode }),
    leaveRoom: (roomId: string): void | Promise<void> => dispatch({ type: "LEAVE_ROOM", roomId }),
    toggleMute: (roomId: string, _muted?: boolean): void | Promise<void> => dispatch({ type: "TOGGLE_MUTE", roomId }),
    simulateParticipantJoin: (roomId: string, participant: RoomParticipant) =>
      dispatch({ type: "SIMULATE_PARTICIPANT_JOIN", roomId, participant }),
    addStory: (caption: string, colorFrom: string, colorTo: string, image?: string): void | Promise<void> =>
      dispatch({ type: "ADD_STORY", caption, colorFrom, colorTo, image }),
    markStorySeen: (storyId: string): void | Promise<void> => dispatch({ type: "MARK_STORY_SEEN", storyId }),
  };
}

/** نفس الدوال لكن بنداءات الـ API الحقيقية (بتتفعّل لما VITE_API_URL مضبوط) */
function apiActions(dispatch: D) {
  const upMsg = (m: ApiMessage) => dispatch({ type: "UPSERT_MESSAGE", message: mapMessage(m) });
  const prep = async (a: Attachment) => {
    let url = a.url;
    if (!url || url.startsWith("blob:")) {
      const blob = url ? await (await fetch(url)).blob() : new Blob([], { type: "audio/webm" });
      url = (await uploadBlob(blob, a.name)).url;
    } else url = (await ensureUploaded(url, a.name))!;
    return {
      name: a.name, size: Math.round(a.size), mime: a.mime === "audio/simulated" ? "audio/webm" : a.mime, url, text: a.text,
      voice: a.voice ? { duration: Math.round(a.voice.duration), waveform: a.voice.waveform } : undefined,
    };
  };
  return {
    sendMessage: async (threadId: string, text: string, replyToId?: string, attachment?: Attachment) => {
      const m = await api<ApiMessage>(`/threads/${threadId}/messages`, { body: { text, replyToId, attachment: attachment ? await prep(attachment) : undefined } });
      upMsg(m);
    },
    editMessage: async (messageId: string, text: string) => upMsg(await api<ApiMessage>(`/messages/${messageId}`, { method: "PATCH", body: { text } })),
    deleteMessage: async (messageId: string) => {
      await api(`/messages/${messageId}`, { method: "DELETE" });
      dispatch({ type: "DELETE_MESSAGE", messageId });
    },
    toggleReaction: async (messageId: string, emoji: string) => upMsg(await api<ApiMessage>(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, { method: "PUT" })),
    createDm: async (contactId: string) => {
      const t = await api<ApiThread>("/threads", { body: { type: "dm", memberIds: [contactId] } });
      dispatch({ type: "UPSERT_THREAD", thread: mapThread(t) });
      return t.id;
    },
    createGroup: async (name: string, memberIds: string[], look?: GroupLook) => {
      const photoUrl = await ensureUploaded(look?.photo, "group.jpg");
      const t = await api<ApiThread>("/threads", { body: { type: "group", name, memberIds, color: look?.color, icon: look?.icon, photoUrl } });
      dispatch({ type: "UPSERT_THREAD", thread: mapThread(t) });
    },
    leaveThread: async (threadId: string) => {
      await api(`/threads/${threadId}/members/me`, { method: "DELETE" });
      dispatch({ type: "LEAVE_THREAD", threadId });
    },
    markRead: async (threadId: string) => { dispatch({ type: "MARK_READ", threadId }); await api(`/threads/${threadId}/read`, { method: "POST" }); },
    createChannel: async (name: string, about?: string) => {
      const t = mapThread(await createChannelApi(name, about) as ApiThread);
      dispatch({ type: "UPSERT_THREAD", thread: t });
      return t.id;
    },
    listChannels: async () => ((await listChannelsApi()) as ApiThread[]).map(mapThread),
    subscribeChannel: async (id: string) => {
      dispatch({ type: "UPSERT_THREAD", thread: mapThread(await subscribeChannelApi(id) as ApiThread) });
    },
    unsubscribeChannel: async (id: string) => {
      await unsubscribeChannelApi(id);
      dispatch({ type: "LEAVE_THREAD", threadId: id });
    },
    createPoll: async (threadId: string, question: string, options: string[], multi: boolean) => {
      dispatch({ type: "UPSERT_MESSAGE", message: mapMessage(await createPollApi(threadId, question, options, multi) as ApiMessage) });
    },
    votePoll: async (messageId: string, optionIds: string[]) => {
      dispatch({ type: "UPSERT_MESSAGE", message: mapMessage(await votePollApi(messageId, optionIds) as ApiMessage) });
    },
    closePoll: async (messageId: string) => {
      dispatch({ type: "UPSERT_MESSAGE", message: mapMessage(await closePollApi(messageId) as ApiMessage) });
    },
    /** الحد بيتفحص على السيرفر — لو رفض نرجّع الحالة زي ما كانت ونرمي الخطأ للشاشة */
    setPinned: async (threadId: string, pinned: boolean) => {
      dispatch({ type: "SET_PINNED", threadId, pinned });
      try {
        await setPinnedApi(threadId, pinned);
      } catch (e) {
        dispatch({ type: "SET_PINNED", threadId, pinned: !pinned });
        throw e;
      }
    },
    listPublicGroups: async () => {
      const l = await api<(ApiThread & { joined: boolean })[]>("/threads/public");
      return l.map((t) => ({ id: t.id, name: t.name, desc: "", members: t.memberCount ?? 0, initial: mapThread(t).initial, colorClass: mapThread(t).colorClass, joined: t.joined, color: t.color, icon: t.icon }));
    },
    joinPublicGroup: async (id: string) => {
      const t = await api<ApiThread>(`/threads/${id}/join`, { method: "POST" });
      dispatch({ type: "UPSERT_THREAD", thread: mapThread(t) });
    },
    addStory: async (caption: string, colorFrom: string, colorTo: string, image?: string) => {
      const imageUrl = await ensureUploaded(image, "story.jpg");
      const s = await api<ApiStory>("/stories", { body: { caption, colorFrom, colorTo, imageUrl } });
      dispatch({ type: "UPSERT_STORY", story: mapStory(s) });
    },
    createRoom: async (name: string) => (await api<VoiceRoom>("/rooms", { body: { name } })).id,
    joinRoom: async (roomId: string, identityMode: "real" | "temp") => { await api(`/rooms/${roomId}/join`, { body: { identity: identityMode } }); },
    leaveRoom: async (roomId: string) => { await api(`/rooms/${roomId}/leave`, { method: "POST" }); },
    toggleMute: async (roomId: string, muted?: boolean) => { await api(`/rooms/${roomId}/mute`, { method: "PUT", body: { muted: !!muted } }); },
    markStorySeen: async (storyId: string) => {
      dispatch({ type: "MARK_STORY_SEEN", storyId });
      await api(`/stories/${storyId}/seen`, { method: "POST" });
    },
  };
}
