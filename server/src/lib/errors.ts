import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}
export const bad = (code: string, msg?: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = "غير مصرّح") => new HttpError(401, "unauthorized", msg);
export const forbidden = (msg = "ممنوع") => new HttpError(403, "forbidden", msg);
export const notFound = (msg = "غير موجود") => new HttpError(404, "not_found", msg);

/** يلفّ handler غير متزامن عشان الأخطاء توصل لـ error middleware (Express 4) */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ code: "validation", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    return;
  }
  if ((err as { type?: string }).type === "entity.too.large") {
    res.status(413).json({ code: "too_large", message: "الطلب كبير" });
    return;
  }
  console.error(err);
  res.status(500).json({ code: "internal", message: "خطأ داخلي" });
}
