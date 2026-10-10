import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth.js";
import type { Ctx } from "../context.js";
import { iceServers } from "../rtc.js";

export function rtcRoutes(ctx: Ctx) {
  const r = Router();
  r.get("/rtc/config", requireAuth(ctx), (req, res) => {
    res.json({ iceServers: iceServers(ctx, (req as AuthedRequest).userId) });
  });
  return r;
}
