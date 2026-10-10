import { useEffect, useRef, useState } from "react";
import { getSocket } from "../api/socket";
import { API_ON } from "../api/client";
import { getIceServers, getLocalMedia, type MediaFail } from "./ice";

type Sig = { type: "offer" | "answer"; sdp: string } | { candidate: RTCIceCandidateInit };
interface Peer { pc: RTCPeerConnection; audio: HTMLAudioElement; queue: RTCIceCandidateInit[] }

/**
 * صوت الغرفة (mesh: كل واحد متصل بكل واحد — مناسب لحد ~٨ أشخاص).
 * الداخل الجديد هو اللي بيبعت offer للموجودين، فمفيش glare. الـ peerId مشتق في السيرفر (مش userId).
 */
export function useRoomAudio(roomId: string | undefined, muted: boolean) {
  const [status, setStatus] = useState<"idle" | "connecting" | "on" | MediaFail | "full">("idle");
  const local = useRef<MediaStream | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!API_ON || !roomId) return;
    const sock = getSocket();
    if (!sock) return;
    let alive = true;
    const peers = new Map<string, Peer>();
    let ice: RTCIceServer[] = [];

    const drop = (id: string) => {
      const p = peers.get(id); if (!p) return;
      p.pc.close(); p.audio.srcObject = null; p.audio.remove(); peers.delete(id);
    };
    const make = (id: string): Peer => {
      const pc = new RTCPeerConnection({ iceServers: ice });
      const audio = document.createElement("audio");
      audio.autoplay = true; audio.setAttribute("playsinline", ""); audio.style.display = "none";
      document.body.appendChild(audio);
      local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
      pc.ontrack = (e) => { audio.srcObject = e.streams[0]; void audio.play().catch(() => {}); };
      pc.onicecandidate = (e) => { if (e.candidate) sock.emit("rtc:signal", { roomId, to: id, data: { candidate: e.candidate.toJSON() } }); };
      pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") drop(id); };
      const p = { pc, audio, queue: [] as RTCIceCandidateInit[] };
      peers.set(id, p);
      return p;
    };
    const flush = async (p: Peer) => { for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch(() => {}); };

    const onSignal = async (m: { roomId: string; from: string; data: Sig }) => {
      if (m.roomId !== roomId || !alive) return;
      try {
        if ("candidate" in m.data) {
          const p = peers.get(m.from);
          if (!p) return;
          if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.data.candidate).catch(() => {}); else p.queue.push(m.data.candidate);
        } else if (m.data.type === "offer") {
          const p = peers.get(m.from) ?? make(m.from);
          await p.pc.setRemoteDescription(m.data);
          await flush(p);
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          sock.emit("rtc:signal", { roomId, to: m.from, data: { type: "answer", sdp: p.pc.localDescription!.sdp } });
        } else if (m.data.type === "answer") {
          const p = peers.get(m.from);
          if (p) { await p.pc.setRemoteDescription(m.data); await flush(p); }
        }
      } catch { /* إشارة تالفة — نتجاهلها */ }
    };
    const onLeft = (m: { roomId: string; peerId: string }) => { if (m.roomId === roomId) drop(m.peerId); };
    sock.on("rtc:signal", onSignal);
    sock.on("rtc:peer-left", onLeft);

    (async () => {
      setStatus("connecting");
      const media = await getLocalMedia(false);
      if (!alive) { if ("stream" in media) media.stream.getTracks().forEach((t) => t.stop()); return; }
      if ("error" in media) { setStatus(media.error); return; }
      local.current = media.stream;
      media.stream.getAudioTracks().forEach((t) => (t.enabled = !mutedRef.current));
      ice = await getIceServers();
      sock.emit("rtc:join", { roomId }, async (r: { me?: string; peers?: string[]; error?: string }) => {
        if (!alive) return;
        if (r.error || !r.peers) { setStatus(r.error === "full" ? "full" : "other"); return; }
        setStatus("on");
        for (const id of r.peers) {
          const p = make(id);
          await p.pc.setLocalDescription(await p.pc.createOffer());
          sock.emit("rtc:signal", { roomId, to: id, data: { type: "offer", sdp: p.pc.localDescription!.sdp } });
        }
      });
    })();

    return () => {
      alive = false;
      sock.off("rtc:signal", onSignal);
      sock.off("rtc:peer-left", onLeft);
      sock.emit("rtc:leave", { roomId });
      [...peers.keys()].forEach(drop);
      local.current?.getTracks().forEach((t) => t.stop());
      local.current = null;
      setStatus("idle");
    };
  }, [roomId]);

  useEffect(() => { local.current?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }, [muted]);
  return status;
}
