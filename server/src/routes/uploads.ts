import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express, { Router } from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import type { Ctx } from "../context.js";
import { bad, wrap } from "../lib/errors.js";

const INLINE = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm)|audio\/(mpeg|ogg|webm|wav|mp4)|application\/pdf)$/;

/**
 * رفع الملفات على القرص المحلي (UPLOAD_DIR). للإنتاج: بدّليها بـ S3/R2/Supabase Storage
 * وارجعي نفس الشكل {name,size,mime,url}. الأسماء عشوائية (مش قابلة للتخمين).
 */
export function uploadRoutes(ctx: Ctx) {
  const dir = path.resolve(ctx.config.UPLOAD_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10)),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  const r = Router();
  r.post("/uploads", requireAuth(ctx), upload.single("file"), wrap(async (req, res) => {
    const f = req.file;
    if (!f) throw bad("no_file", "مفيش ملف");
    res.status(201).json({ name: f.originalname, size: f.size, mime: f.mimetype, url: `${ctx.config.PUBLIC_URL}/uploads/${f.filename}` });
  }));
  // الملفات اللي مش صور/فيديو/صوت/PDF بتتنزّل ولا بتتفتح داخل المتصفح (منع XSS)
  r.use("/uploads", express.static(dir, {
    index: false, dotfiles: "deny",
    setHeaders(res, file) {
      const ext = path.extname(file).toLowerCase();
      const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".pdf": "application/pdf" } as Record<string, string>)[ext];
      if (mime && INLINE.test(mime)) res.setHeader("Content-Type", mime);
      else { res.setHeader("Content-Type", "application/octet-stream"); res.setHeader("Content-Disposition", "attachment"); }
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }));
  return r;
}
