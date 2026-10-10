import type { Attachment } from "../types";

/** أنواع الملفات اللي ليها معاينة */
export type FileKind = "image" | "video" | "audio" | "pdf" | "text" | "other";

const TEXT_EXT = /\.(txt|md|csv|json|xml|yml|yaml|log|js|jsx|ts|tsx|css|html|htm|py|sql|ini|env|sh)$/i;

export function kindOf(a: Pick<Attachment, "mime" | "name">): FileKind {
  if (a.mime.startsWith("image/")) return "image";
  if (a.mime.startsWith("video/")) return "video";
  if (a.mime.startsWith("audio/")) return "audio";
  if (a.mime === "application/pdf" || /\.pdf$/i.test(a.name)) return "pdf";
  if (a.mime.startsWith("text/") || a.mime === "application/json" || a.mime === "application/xml" || TEXT_EXT.test(a.name)) return "text";
  return "other";
}

/** اسم نوع الملف للعرض (Word / Excel …) */
export function labelOf(a: Pick<Attachment, "mime" | "name">): string {
  const ext = (a.name.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", ppt: "PowerPoint", pptx: "PowerPoint",
    zip: "ZIP", rar: "RAR", pdf: "PDF", csv: "CSV", txt: "TXT", json: "JSON", md: "Markdown",
  };
  return map[ext] ?? (ext ? ext.toUpperCase() : "FILE");
}

export const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** بيجهّز المرفق: رابط مؤقت + أول جزء من النص للملفات النصية (للمعاينة) */
export async function toAttachment(f: File): Promise<Attachment> {
  const a: Attachment = { name: f.name, size: f.size, mime: f.type || "application/octet-stream", url: URL.createObjectURL(f) };
  if (kindOf(a) === "text" && f.size <= 512 * 1024) {
    try {
      a.text = (await f.text()).slice(0, 6000);
    } catch {
      /* تجاهل */
    }
  }
  return a;
}

/** صورة مصغّرة كـ data URL (للبروفايل والستوري عشان تفضل خفيفة) */
export function readImage(f: File, maxDim = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}
