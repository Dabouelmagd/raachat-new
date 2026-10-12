import type { Attachment, Contact, Message, Story, Thread } from "../types";
import { loc } from "../i18n";
import { getSession, toAbs } from "./client";

const COLORS = ["bg-rachat-red", "bg-rachat-coral", "bg-rachat-gold", "bg-[#7a4a2a]", "bg-rachat-maroon"];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const initialOf = (n: string) => [...(n.trim() || "؟")][0].toUpperCase();
const me = () => getSession()?.meId ?? "";
const asMe = (id: string) => (id === me() ? "me" : id);

export const fmtTime = (iso: string) => new Intl.DateTimeFormat(loc(), { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export interface ApiUser { id: string; name: string; color?: string }
export function mapContact(u: ApiUser): Contact {
  return { id: u.id, name: u.name, initial: initialOf(u.name), colorClass: COLORS[hash(u.id) % COLORS.length] };
}

export interface ApiThread {
  id: string; type: "dm" | "group"; name: string; color?: string; icon?: string; photo?: string;
  memberIds: string[]; createdByMe?: boolean; isPublic?: boolean; memberCount?: number; joined?: boolean; unread?: number; pinned?: boolean }
export function mapThread(t: ApiThread): Thread {
  return {
    id: t.id, type: t.type, name: t.name, initial: initialOf(t.name), colorClass: COLORS[hash(t.id) % COLORS.length],
    memberIds: t.memberIds, createdByMe: t.createdByMe, color: t.color, icon: t.icon, photo: t.photo ? toAbs(t.photo) : undefined, unread: t.unread, pinned: t.pinned,
  };
}

export interface ApiMessage {
  id: string; threadId: string; authorId: string; authorName: string; text: string; time: string; read?: boolean;
  replyToId?: string; reactions: Record<string, string[]>; edited?: boolean; deleted?: boolean;
  attachment?: { name: string; size: number; mime: string; url: string; text?: string; voice?: { duration: number; waveform: number[] } };
  starred?: boolean;
  delivered?: boolean;
  poll?: { question: string; multi: boolean; closed: boolean; options: { id: string; text: string; voterIds: string[] }[] };
}
export function mapMessage(m: ApiMessage): Message {
  const reactions: Record<string, string[]> = {};
  for (const [e, ids] of Object.entries(m.reactions ?? {})) reactions[e] = ids.map(asMe);
  const a = m.attachment;
  const attachment: Attachment | undefined = a ? { ...a, url: toAbs(a.url) } : undefined;
  return {
    id: m.id, threadId: m.threadId, authorId: asMe(m.authorId), authorName: m.authorName, text: m.text, time: fmtTime(m.time), at: new Date(m.time).getTime(),
    read: m.read, delivered: m.delivered, replyToId: m.replyToId, reactions, edited: m.edited, deleted: m.deleted, starred: m.starred, attachment,
    // معرّفات المصوّتين بتتحوّل لـ "me" زي باقي المعرّفات عشان المقارنة تبقى واحدة
    poll: m.poll ? { ...m.poll, options: m.poll.options.map((o) => ({ ...o, voterIds: o.voterIds.map(asMe) })) } : undefined,
  };
}

export interface ApiStory { id: string; authorId: string; authorName: string; caption: string; colorFrom: string; colorTo: string; image?: string; seen: boolean; time: string }
export function mapStory(s: ApiStory): Story {
  return { id: s.id, authorId: asMe(s.authorId), authorName: s.authorName, caption: s.caption, colorFrom: s.colorFrom, colorTo: s.colorTo, image: s.image ? toAbs(s.image) : undefined, seen: s.seen, time: fmtTime(s.time) };
}
