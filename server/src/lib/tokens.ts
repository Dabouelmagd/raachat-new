import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = () => crypto.randomBytes(32).toString("base64url");

export interface AccessClaims { sub: string; sid: string }

export function signAccess(c: AccessClaims, secret: string, ttlMin: number): string {
  return jwt.sign(c, secret, { expiresIn: `${ttlMin}m` });
}
export function verifyAccess(token: string, secret: string): AccessClaims {
  const p = jwt.verify(token, secret);
  if (typeof p === "string" || !p.sub || !(p as any).sid) throw new Error("bad token");
  return { sub: String(p.sub), sid: String((p as any).sid) };
}
