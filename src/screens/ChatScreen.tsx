import { API_ON, ApiError } from "../api/client";
import { setUpdateBlocked } from "../update";
import { Languages, Palette } from "lucide-react";
import { dayLabel, sameDay } from "../timefmt";
import { PharaohEmoji, PHARAOH_KINDS, phaToken } from "../components/PharaohEmoji";
import { OccasionSticker, OCCASIONS, occToken } from "../components/OccasionSticker";
import { CameraSheet } from "../components/CameraSheet";
import { WallpaperSheet } from "../components/WallpaperSheet";
import { useWallpaper, wallpaperStyle } from "../theme/wallpapers";
import { useEffect, useRef, useState } from "react";
import { TranslateSheet } from "../components/Translate";
import { PollSheet } from "../components/PollSheet";
import { msgPreview } from "../components/msgPreview";
import { useTranslate } from "../store/translate";
import { PHRASES } from "../translate/phrases";
import { phraseText } from "../translate/engine";
import { ThreadAvatar } from "../components/ThreadAvatar";
import { useParams, useNavigate } from "react-router-dom";
import { Video, Phone, Paperclip, Smile, Mic, Send, X, Users, LogOut, Image as ImageIcon, FileText, Camera, Trash2, BarChart3, Megaphone } from "lucide-react";
import { Header } from "../components/Header";
import { MessageBubble } from "../components/MessageBubble";
import { useAppState, useAppActions } from "../store/AppContext";
import { Attachment, Message } from "../types";
import { playSound } from "../sound/sounds";
import { useT, useDir, tr, num } from "../i18n";
import { EMOJI_GROUPS } from "../components/emojis";
import { PendingThumb } from "../components/FilePreview";
import { fmtDur, toAttachment } from "../media/files";
import { startRecording, type Recorder } from "../media/recorder";

const MAX_FILE = 10 * 1024 * 1024; // 10MB للديمو

export default function ChatScreen() {
  const t = useT();
  const dir = useDir();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { threads, messages, contacts } = useAppState();
  const { sendMessage, receiveMessage, leaveThread, markRead, unsubscribeChannel, loadMessages } = useAppActions();

  const thread = threads.find((t) => t.id === id);
  const threadMessages = messages.filter((m) => m.threadId === id);

  const [draft, setDraft] = useState("");
  /**
   * رسالة ما اتبعتتش. قبل كده `send()` كان بيفضّي الخانة وينادي `sendMessage`
   * **من غير await ولا catch**: أي فشل (مفيش نت · كلمة ممنوعة · الجروب متقيّد ·
   * المرفق كبير) = النص اختفى من الخانة ومن المحادثة ومفيش ولا رسالة خطأ، والوعد
   * المرفوض يروح في اللاشيء. دلوقتي بنمسك الفشل ونسيب النص في الإيد.
   * `certain` = السيرفر ردّ ورفض فعلًا (٤xx) فإعادة المحاولة أمان؛ لو الاتصال
   * نفسه قطع، مش عارفين وصلت ولا لأ وبنقول كده للمستخدم.
   */
  const [failed, setFailed] = useState<{ text: string; replyTo: Message | null; att: Attachment | null; why: string; certain: boolean } | null>(null);
  // التحديث التلقائي مابيعملش reload والمسوّدة لسه مكتوبة — مانضيّعش كلام المستخدم
  useEffect(() => {
    setUpdateBlocked(!!draft.trim() || !!failed);
    return () => setUpdateBlocked(false);
  }, [draft, failed]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [panel, setPanel] = useState<"none" | "emoji" | "attach">("none");
  const [showPoll, setShowPoll] = useState(false);
  /** قناة ومش من حقي أنشر فيها = قراءة بس (الحارس الحقيقي على السيرفر) */
  const readOnly = thread?.type === "channel" && thread.canPost === false;
  const [pending, setPending] = useState<Attachment | null>(null);
  const [fileErr, setFileErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const pickFile = async (f?: File | null) => {
    setPanel("none");
    if (!f) return;
    if (f.size > MAX_FILE) { setFileErr(t("الملف أكبر من ١٠ ميجا", "File is larger than 10 MB")); return; }
    setFileErr("");
    // في الديمو الملف بيتحفظ كرابط مؤقت. مع الباك إند: ارفعيه للتخزين وخدي الرابط.
    setPending(await toAttachment(f));
  };

  // تسجيل الرسائل الصوتية
  const tset = useTranslate();
  const [showTr, setShowTr] = useState(false);
  const [showWp, setShowWp] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [emojiTab, setEmojiTab] = useState<"std" | "pha" | "occ">("std");
  const [emojiGroup, setEmojiGroup] = useState("faces");
  const wp = useWallpaper();
  const [rec, setRec] = useState<{ simulated: boolean; levels: number[]; secs: number } | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const startRec = async () => {
    if (recorder.current) return; // فيه تسجيل شغّال بالفعل
    setPanel("none");
    setFileErr("");
    const r = await startRecording();
    recorder.current = r;
    setRec({ simulated: r.simulated, levels: [], secs: 0 });
    r.onLevel((levels, secs) => setRec((x) => (x ? { ...x, levels, secs } : x)));
  };
  const cancelRec = () => { recorder.current?.cancel(); recorder.current = null; setRec(null); };
  const sendRec = async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    const out = await r.stop();
    setRec(null);
    playSound("send");
    void deliver("", replyTo, {
      name: t("رسالة صوتية", "Voice message"), size: 0, mime: out.mime, url: out.url,
      voice: { duration: out.duration, waveform: out.waveform, simulated: out.simulated },
    });
    setReplyTo(null);
  };
  useEffect(() => () => recorder.current?.cancel(), []);
  // مع الباك إند: علّم المحادثة مقروءة كل ما توصل رسالة جديدة
  const lastMsgId = threadMessages[threadMessages.length - 1]?.id;
  // علامة «مقروءة» في الوضعين: مع السيرفر بتروح له، وفي الديمو بتشيل البولد والعدّاد
  useEffect(() => { if (id) void markRead(id); }, [id, lastMsgId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * رسايل المحادثة عند فتحها. التحميل الأول بيجيب رسايل المحادثات اللي كانت
   * موجودة وقت تشغيل التطبيق بس — فأي محادثة بتدخلها بعد كده (جروب عام انضميتي
   * له · قناة اشتركتي فيها · محادثة جديدة جاية من السوكت) كانت بتبان **فاضية**
   * لحد ما تعملي تحديث للصفحة. (في الديمو ده مابيعملش حاجة.)
   */
  useEffect(() => { if (id) void loadMessages(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // آخر رسالة تتبعت/تتستقبل تظهر دايمًا
  const endRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: firstScroll.current ? "auto" : "smooth" });
    firstScroll.current = false;
  }, [threadMessages.length, pending, panel, rec !== null]);
  const addEmoji = (e: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? pos;
    setDraft(draft.slice(0, pos) + e + draft.slice(end));
  };

  /** الإرسال الوحيد في الشاشة: ينجح أو يسيب النص والمرفق والرد في الإيد. */
  const deliver = async (text: string, rep: Message | null, att: Attachment | null) => {
    try {
      await sendMessage(id, text, rep?.id, att ?? undefined);
      setFailed(null);
    } catch (e) {
      const api = e instanceof ApiError ? e : null;
      setFailed({
        text, replyTo: rep, att,
        why: api?.message || t("لا يوجد اتصال بالخادم", "No connection to the server"),
        certain: !!api,
      });
    }
  };

  const send = () => {
    if (!draft.trim() && !pending) return;
    playSound("send");
    void deliver(draft.trim(), replyTo, pending);
    if (thread?.type === "dm" && !API_ON) {
      // رد تجريبي من الطرف التاني عشان تسمعي نغمة الرسالة
      const name = thread.name;
      setTimeout(() => {
        playSound("message");
        // لو الترجمة شغالة الطرف التاني بيرد بلغته عشان تشوفي الترجمة
        receiveMessage(id, name, tset.on ? phraseText(PHRASES[9], tset.peer) : tr("تمام 👍", "Sounds good 👍"));
      }, 1800);
    }
    setDraft("");
    setReplyTo(null);
    setPending(null);
    setPanel("none");
  };

  const messageById = (mid?: string) => threadMessages.find((m) => m.id === mid);

  const memberNames =
    thread?.type === "group"
      ? thread.memberIds
          .map((mid) => contacts.find((c) => c.id === mid)?.name)
          .filter(Boolean)
          .join(t("، ", ", "))
      : "";

  return (
    <div className="flex h-full flex-col">
      <div onClick={() => (thread?.type === "group" || thread?.type === "channel") && setShowInfo(true)}>
        <Header
          title={thread?.name ?? t("محادثة", "Chat")}
          showBack
          globalActions={false}
          right={
            <>
              <button aria-label={t("الترجمة الفورية", "Live translation")} aria-pressed={tset.on} className={tset.on ? "text-rachat-gold" : ""} onClick={(e) => { e.stopPropagation(); setShowTr(true); }}><Languages size={19} /></button>
              <button aria-label={t("خلفية المحادثة", "Chat wallpaper")} onClick={(e) => { e.stopPropagation(); setShowWp(true); }}><Palette size={19} /></button>
              <button aria-label={t("مكالمة فيديو", "Video call")} onClick={(e) => { e.stopPropagation(); navigate(`/call/${id}?mode=video`); }}><Video size={19} /></button>
              <button aria-label={t("مكالمة صوتية", "Voice call")} onClick={(e) => { e.stopPropagation(); navigate(`/call/${id}?mode=voice`); }}><Phone size={18} /></button>
              {thread?.type === "group" && <Users size={18} />}
              {thread?.type === "channel" && <Megaphone size={18} className="text-rachat-gold" />}
            </>
          }
        />
      </div>

      {showCam && <CameraSheet onClose={() => setShowCam(false)} onDone={(f) => { setShowCam(false); void pickFile(f); }} />}
      {showWp && <WallpaperSheet onClose={() => setShowWp(false)} />}
      {showTr && <TranslateSheet onClose={() => setShowTr(false)} />}
      {showPoll && thread && <PollSheet threadId={thread.id} onClose={() => setShowPoll(false)} />}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2" style={wallpaperStyle(wp)}>
        {threadMessages.map((m, i) => {
          const prev = threadMessages[i - 1];
          const newDay = m.at ? (prev ? (prev.at ? !sameDay(prev.at, m.at) : !sameDay(Date.now(), m.at)) : true) : i === 0;
          return (
            <div key={m.id}>
              {newDay && <div className="my-2 text-center"><span className="rounded-full bg-black/40 px-3 py-0.5 text-[11px] font-bold text-white">{m.at ? dayLabel(m.at) : t("اليوم", "Today")}</span></div>}
              <MessageBubble message={m} replyTo={messageById(m.replyToId)} canReply={!readOnly} onReply={setReplyTo} onVoiceReply={(x) => { setReplyTo(x); void startRec(); }} />
            </div>
          );
        })}
        <div ref={endRef} />
        {threadMessages.length === 0 && (
          <p className="mt-8 text-center text-xs text-neutral-500">{t("لا توجد رسائل بعد — ابدأ المحادثة", "No messages yet — start the conversation")}</p>
        )}
      </div>

      {failed && (
        <div className="border-t border-rachat-coral/50 bg-rachat-coral/10 px-3.5 py-2" role="alert">
          <div className="text-[11px] font-bold text-rachat-coral">{t("لم تُرسَل الرسالة", "Message wasn't sent")}</div>
          <div className="text-xs text-rachat-papyrus">{failed.why}</div>
          {failed.text && <div className="mt-1 truncate text-[11px] text-neutral-400">«{failed.text}»</div>}
          {!failed.certain && (
            <div className="mt-1 text-[11px] text-neutral-400">
              {t("انقطع الاتصال قبل أن يردّ الخادم — وقد تكون وصلت. راجع المحادثة قبل إرسالها مرة أخرى.",
                 "The connection dropped before the server replied — it may have arrived. Check the chat before sending again.")}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => { const f = failed; setFailed(null); void deliver(f.text, f.replyTo, f.att); }}
              className="rounded-lg bg-rachat-coral px-2.5 py-1 text-[11px] font-bold text-white"
            >{t("حاول مرة أخرى", "Try again")}</button>
            {failed.text && (
              <button
                onClick={() => {
                  // مانكتبش فوق حاجة المستخدم كتبها في الوقت ده — نزوّد عليها
                  setDraft((d) => (d.trim() ? `${d.trim()} ${failed.text}` : failed.text));
                  setReplyTo(failed.replyTo);
                  setPending(failed.att);
                  setFailed(null);
                  inputRef.current?.focus();
                }}
                className="rounded-lg border border-rachat-coral/60 px-2.5 py-1 text-[11px] font-bold text-rachat-coral"
              >{t("أعِد النصّ إلى الحقل", "Put the text back")}</button>
            )}
            <button onClick={() => setFailed(null)} aria-label={t("إخفاء", "Dismiss")} className="ms-auto text-neutral-500"><X size={16} /></button>
          </div>
        </div>
      )}

      {replyTo && (
        <div className="flex items-center justify-between border-t border-rachat-maroon/40 bg-rachat-card px-3.5 py-2">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-rachat-coral">{t("الرد على", "Replying to")} {replyTo.authorName}</div>
            <div className="truncate text-xs text-neutral-400" dir="auto">{msgPreview(replyTo, t)}</div>
          </div>
          <button onClick={() => setReplyTo(null)} aria-label={t("إلغاء الرد", "Cancel reply")} className="text-neutral-500">
            <X size={16} />
          </button>
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-3 border-t border-rachat-maroon/40 bg-rachat-card px-3.5 py-2">
          <PendingThumb a={pending} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-rachat-papyrus">{pending.name}</div>
            <div className="text-[11px] text-neutral-500">{t("جاهز للإرسال", "Ready to send")}</div>
          </div>
          <button onClick={() => setPending(null)} aria-label={t("إزالة المرفق", "Remove attachment")} className="text-neutral-500"><X size={16} /></button>
        </div>
      )}
      {fileErr && <p className="bg-rachat-card px-3.5 pb-2 text-[11px] text-rachat-coral" role="alert">{fileErr}</p>}

      {panel === "attach" && (
        <div className="grid grid-cols-4 gap-2 border-t border-rachat-maroon/40 bg-rachat-card px-3.5 py-3">
          {[
            { k: "photo", icon: ImageIcon, label: t("صورة", "Photo"), color: "bg-rachat-red", run: () => photoRef.current?.click() },
            { k: "doc", icon: FileText, label: t("ملف", "File"), color: "bg-rachat-gold text-rachat-ink", run: () => docRef.current?.click() },
            { k: "fx", icon: Video, label: t("فيديو وفلاتر", "Video & filters"), color: "bg-rachat-maroon", run: () => { setPanel("none"); setShowCam(true); } },
            { k: "cam", icon: Camera, label: t("كاميرا", "Camera"), color: "bg-rachat-coral", run: () => camRef.current?.click() },
            { k: "poll", icon: BarChart3, label: t("استطلاع", "Poll"), color: "bg-rachat-gold text-rachat-ink", run: () => { setPanel("none"); setShowPoll(true); } },
          ].map((o) => (
            <button key={o.k} onClick={o.run} className="flex flex-col items-center gap-1.5 rounded-xl bg-rachat-black py-3 text-[11px] font-bold text-rachat-papyrus">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${o.color}`}><o.icon size={19} /></span>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {panel === "emoji" && (
        <div className="border-t border-rachat-maroon/40 bg-rachat-card">
          <div role="tablist" className="flex gap-1.5 px-2.5 pt-2 text-[11px] font-bold">
            <button role="tab" aria-selected={emojiTab === "std"} onClick={() => setEmojiTab("std")} className={`rounded-full px-3 py-1 ${emojiTab === "std" ? "bg-rachat-red text-white" : "bg-rachat-black text-neutral-400"}`}>{t("إيموجي", "Emoji")}</button>
            <button role="tab" aria-selected={emojiTab === "pha"} onClick={() => setEmojiTab("pha")} className={`rounded-full px-3 py-1 ${emojiTab === "pha" ? "bg-rachat-gold text-rachat-ink" : "bg-rachat-black text-neutral-400"}`}>{t("فرعوني 🏺", "Pharaonic 🏺")}</button>
            <button role="tab" aria-selected={emojiTab === "occ"} onClick={() => setEmojiTab("occ")} className={`rounded-full px-3 py-1 ${emojiTab === "occ" ? "bg-rachat-coral text-rachat-ink" : "bg-rachat-black text-neutral-400"}`}>{t("مناسبات 🎉", "Greetings 🎉")}</button>
          </div>
          {emojiTab === "std" ? (
            <div>
              <div role="tablist" aria-label={t("أقسام الإيموجي", "Emoji categories")} className="flex gap-1 overflow-x-auto px-2.5 pt-2">
                {EMOJI_GROUPS.map((g) => (
                  <button key={g.k} role="tab" aria-selected={emojiGroup === g.k} aria-label={t(g.ar, g.en)} onClick={() => setEmojiGroup(g.k)} className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-[18px] leading-7 ${emojiGroup === g.k ? "bg-rachat-red/25 ring-1 ring-rachat-red" : "bg-rachat-black"}`}>{g.icon}</button>
                ))}
              </div>
              {EMOJI_GROUPS.filter((g) => g.k === emojiGroup).map((g) => (
                <div key={g.k}>
                  <p className="px-3 pt-1.5 text-[10.5px] font-bold text-neutral-500">{t(g.ar, g.en)}</p>
                  <div className="grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto px-2.5 pb-2" role="group" aria-label={t(g.ar, g.en)}>
                    {g.list.map((e) => (
                      <button key={e} onClick={() => addEmoji(e)} className="rounded-lg py-1 text-[22px] leading-9 hover:bg-white/5">{e}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : emojiTab === "occ" ? (
            <div className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto px-2.5 py-2" role="group" aria-label={t("ملصقات المناسبات", "Greeting stickers")}>
              {OCCASIONS.map((o) => (
                <button key={o.k} aria-label={o.ar} onClick={() => { playSound("send"); void deliver(occToken(o.k), replyTo, null); setReplyTo(null); setPanel("none"); }} className="flex justify-center rounded-xl p-0.5 hover:bg-white/5"><OccasionSticker kind={o.k} size={104} /></button>
              ))}
            </div>
          ) : (
            <div className="grid max-h-56 grid-cols-4 gap-1 overflow-y-auto px-2.5 py-2" role="group" aria-label={t("ملصقات فرعونية", "Pharaonic stickers")}>
              {PHARAOH_KINDS.map(([k, ar, en]) => (
                <button key={k} aria-label={t(ar, en)} onClick={() => { playSound("send"); void deliver(phaToken(k), replyTo, null); setReplyTo(null); setPanel("none"); }} className="flex justify-center rounded-xl p-1 hover:bg-white/5"><PharaohEmoji kind={k} size={60} /></button>
              ))}
            </div>
          )}
        </div>
      )}

      <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={docRef} type="file" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />

      {rec ? (
        <div className="border-t border-rachat-maroon/40 bg-rachat-black px-3.5 py-3" role="status" aria-live="polite">
          {rec.simulated && (
            <p className="mb-2 text-center text-[10.5px] leading-4 text-neutral-500">
              {t("الميكروفون غير متاح في هذه المعاينة، وهذا تسجيل تجريبي دون صوت. في المتصفح العادي يُسجَّل صوتك فعلًا.", "The microphone isn't available in this preview, so this is a silent demo recording. In a regular browser it records your real voice.")}
            </p>
          )}
          <div className="flex items-center gap-2.5">
            <button onClick={cancelRec} aria-label={t("إلغاء التسجيل", "Cancel recording")} className="flex h-9 w-9 items-center justify-center rounded-full text-rachat-coral"><Trash2 size={19} /></button>
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-rachat-red" />
            <span dir="ltr" className="w-10 shrink-0 text-sm tabular-nums text-rachat-papyrus">{fmtDur(rec.secs)}</span>
            <div className="flex h-8 min-w-0 flex-1 items-center justify-center gap-[2px] overflow-hidden" dir="ltr" aria-hidden>
              {rec.levels.map((h, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-rachat-red/80" style={{ height: `${Math.max(12, Math.round(h * 100))}%` }} />)}
            </div>
            <button onClick={() => void sendRec()} aria-label={t("إرسال الرسالة الصوتية", "Send voice message")} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rachat-red to-rachat-coral text-white">
              <Send size={16} style={dir === "rtl" ? { transform: "scaleX(-1)" } : undefined} />
            </button>
          </div>
        </div>
      ) : readOnly ? (
        /* القناة اللي مش بنشر فيها: مفيش صندوق كتابة خالص — التفاعل بس */
        <div className="flex items-center justify-center gap-2 border-t border-rachat-maroon/40 bg-rachat-black px-3.5 py-4 text-center text-[11.5px] leading-5 text-neutral-400" role="status">
          <Megaphone size={15} className="shrink-0 text-rachat-gold" />
          {t("هذه القناة للقراءة فقط — ويمكنك التفاعل بالإيموجي", "This channel is read-only — you can still react")}
        </div>
      ) : (
      <div className="flex items-center gap-2.5 border-t border-rachat-maroon/40 bg-rachat-black px-3.5 py-3">
        <button aria-label={t("إرفاق ملف", "Attach")} aria-expanded={panel === "attach"} onClick={() => setPanel(panel === "attach" ? "none" : "attach")}
          className={panel === "attach" ? "text-rachat-red" : "text-neutral-500"}><Paperclip size={20} /></button>
        <button aria-label={t("إيموجي", "Emoji")} aria-expanded={panel === "emoji"} onClick={() => setPanel(panel === "emoji" ? "none" : "emoji")}
          className={panel === "emoji" ? "text-rachat-red" : "text-neutral-500"}><Smile size={20} /></button>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={t("اكتب رسالة…", "Type a message…")}
          className="min-w-0 flex-1 rounded-full bg-rachat-card px-3.5 py-2 text-sm text-rachat-papyrus outline-none placeholder:text-neutral-500"
        />
        {draft.trim() || pending ? (
          <button
            onClick={send}
            aria-label={t("إرسال", "Send")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rachat-red to-rachat-coral text-white"
          >
            <Send size={16} style={dir === "rtl" ? { transform: "scaleX(-1)" } : undefined} />
          </button>
        ) : (
          <button onClick={startRec} aria-label={t("تسجيل صوتي", "Voice message")} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rachat-red to-rachat-coral text-white">
            <Mic size={17} />
          </button>
        )}
      </div>
      )}

      {showInfo && thread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
          <div className="w-full max-w-[340px] rounded-2xl bg-rachat-card p-5 text-center">
            <ThreadAvatar thread={thread} className="mx-auto mb-3 h-14 w-14 text-lg" />
            <p className="font-extrabold text-rachat-papyrus">{thread.name}</p>
            {thread.type === "channel" ? (
              <>
                {/* **مفيش أسماء مشتركين** — العدد بس، والسيرفر مابيبعتهمش أصلًا */}
                <p className="mt-1 text-xs text-neutral-500">{num(thread.memberCount ?? 0)} {t("مشترك", "subscribers")}</p>
                {thread.about && <p className="mt-3 text-xs leading-relaxed text-neutral-400" dir="auto">{thread.about}</p>}
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-neutral-500">{num(thread.memberIds.length)} {t("أعضاء", "members")}</p>
                <p className="mt-3 text-xs leading-relaxed text-neutral-400">{memberNames}</p>
              </>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {thread.type === "channel" ? (
                thread.myRole === "owner" ? (
                  <p className="text-[11px] text-neutral-500">{t("أنت صاحب هذه القناة", "You own this channel")}</p>
                ) : (
                  <button
                    onClick={() => { void unsubscribeChannel(thread.id); navigate("/"); }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-rachat-red/15 py-2.5 text-sm font-bold text-rachat-red"
                  >
                    <LogOut size={15} /> {t("إلغاء الاشتراك", "Unsubscribe")}
                  </button>
                )
              ) : (
              <button
                onClick={() => {
                  leaveThread(thread.id);
                  navigate("/");
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-rachat-red/15 py-2.5 text-sm font-bold text-rachat-red"
              >
                <LogOut size={15} /> {t("مغادرة المجموعة", "Leave group")}
              </button>
              )}
              <button onClick={() => setShowInfo(false)} className="text-xs text-neutral-500">
                {t("إغلاق", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
