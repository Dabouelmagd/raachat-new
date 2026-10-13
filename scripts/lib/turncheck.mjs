#!/usr/bin/env node
/**
 * فحص TURN حقيقي: بيعمل **Allocate** على السيرفر ببيانات مؤقتة محسوبة بنفس
 * طريقة `--use-auth-secret`، ويطلب عنوان ترحيل فعلي.
 *
 * ليه مكتوب بإيدينا بدل `turnutils_uclient`: الأدوات دي خياراتها بتختلف بين
 * الإصدارات، و«الأمر عدّى» مش دليل إن المصادقة نجحت. هنا النجاح = رد
 * **Allocate Success (0x0103)** فيه عنوان مرحّل — فحص إيجابي على الحاجة نفسها.
 * ومفيش أي تبعية: dgram + crypto من Node.
 *
 * التشغيل:
 *   TURN_HOST=kenoz.org TURN_SECRET=… node turncheck.mjs
 * متغيرات اختيارية: TURN_PORT (3478) · TURN_USER (turncheck) · TURN_TIMEOUT_MS (4000)
 * الخروج: 0 = نجح · 1 = فشل (والسبب بيتطبع).
 */
import dgram from "node:dgram";
import crypto from "node:crypto";

const HOST = process.env.TURN_HOST || "127.0.0.1";
const PORT = Number(process.env.TURN_PORT || 3478);
const SECRET = process.env.TURN_SECRET || "";
const USER = process.env.TURN_USER || "turncheck";
const TIMEOUT = Number(process.env.TURN_TIMEOUT_MS || 4000);
const COOKIE = 0x2112a442;

if (!SECRET) { console.error("❌ مفيش TURN_SECRET"); process.exit(1); }

/** نفس اللي السيرفر بيعمله في `iceServers()`: اسم بوقت انتهاء + base64 HMAC-SHA1 */
const username = `${Math.floor(Date.now() / 1000) + 600}:${USER}`;
const password = crypto.createHmac("sha1", SECRET).update(username).digest("base64");

const pad4 = (n) => (n % 4 === 0 ? 0 : 4 - (n % 4));
function attr(type, value) {
  const b = Buffer.alloc(4 + value.length + pad4(value.length));
  b.writeUInt16BE(type, 0);
  b.writeUInt16BE(value.length, 2); // الطول الحقيقي، والحشو مش محسوب فيه
  value.copy(b, 4);
  return b;
}
function message(type, tid, attrs, key) {
  let body = Buffer.concat(attrs);
  const head = (len) => {
    const h = Buffer.alloc(20);
    h.writeUInt16BE(type, 0); h.writeUInt16BE(len, 2); h.writeUInt32BE(COOKIE, 4); tid.copy(h, 8);
    return h;
  };
  if (!key) return Buffer.concat([head(body.length), body]);
  // MESSAGE-INTEGRITY: الـ HMAC محسوب على الرسالة والطول **شامل** الخاصية نفسها
  const withLen = Buffer.concat([head(body.length + 24), body]);
  const mac = crypto.createHmac("sha1", key).update(withLen).digest();
  body = Buffer.concat([body, attr(0x0008, mac)]);
  return Buffer.concat([head(body.length), body]);
}
function parse(buf) {
  const out = { type: buf.readUInt16BE(0), attrs: new Map() };
  let i = 20;
  const end = 20 + buf.readUInt16BE(2);
  while (i + 4 <= end && i + 4 <= buf.length) {
    const t = buf.readUInt16BE(i), len = buf.readUInt16BE(i + 2);
    out.attrs.set(t, buf.subarray(i + 4, i + 4 + len));
    i += 4 + len + pad4(len);
  }
  return out;
}
const REQUESTED_TRANSPORT = attr(0x0019, Buffer.from([17, 0, 0, 0])); // UDP
const errText = (m) => {
  const e = m.attrs.get(0x0009);
  if (!e) return "";
  return `${e[2] * 100 + e[3]} ${e.subarray(4).toString("utf8")}`;
};

const sock = dgram.createSocket("udp4");
const send = (buf) => new Promise((res, rej) => sock.send(buf, PORT, HOST, (e) => (e ? rej(e) : res())));
const next = () => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`مفيش رد من ${HOST}:${PORT} خلال ${TIMEOUT}ms (منفذ مقفول أو السيرفر مش سامع)`)), TIMEOUT);
  sock.once("message", (m) => { clearTimeout(t); res(parse(m)); });
  sock.once("error", (e) => { clearTimeout(t); rej(e); });
});

try {
  // ١) Allocate من غير بيانات → المفروض يرد 401 مع realm وnonce
  const tid1 = crypto.randomBytes(12);
  await send(message(0x0003, tid1, [REQUESTED_TRANSPORT]));
  const first = await next();
  const realmB = first.attrs.get(0x0014), nonceB = first.attrs.get(0x0015);
  if (first.type !== 0x0113 || !realmB || !nonceB) {
    console.error(`❌ رد غير متوقع على أول Allocate: type=0x${first.type.toString(16)} ${errText(first)}`);
    process.exit(1);
  }
  const realm = realmB.toString("utf8");

  // ٢) إعادة الطلب ببيانات كاملة. مفتاح التكامل للبيانات طويلة المدى = MD5(user:realm:pass)
  const key = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest();
  const tid2 = crypto.randomBytes(12);
  await send(message(0x0003, tid2, [
    REQUESTED_TRANSPORT,
    attr(0x0006, Buffer.from(username, "utf8")),
    attr(0x0014, realmB),
    attr(0x0015, nonceB),
  ], key));
  const res = await next();
  if (res.type !== 0x0103) {
    const why = errText(res) || `type=0x${res.type.toString(16)}`;
    console.error(`❌ المصادقة أو الترحيل فشلوا: ${why} (realm=${realm}) — راجعي TURN_SECRET`);
    process.exit(1);
  }
  // عنوان الترحيل (XOR-RELAYED-ADDRESS) — الدليل إن السيرفر فتح منفذ فعلًا
  const rel = res.attrs.get(0x0016);
  if (!rel || rel.length < 8) { console.error("❌ Allocate نجح بس بلا عنوان ترحيل"); process.exit(1); }
  const port = rel.readUInt16BE(2) ^ (COOKIE >>> 16);
  const ip = [...rel.subarray(4, 8)].map((b, i) => b ^ ((COOKIE >>> (24 - 8 * i)) & 0xff)).join(".");
  console.log(`✅ TURN allocate ok — relay ${ip}:${port} (realm=${realm})`);
  process.exit(0);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
} finally {
  sock.close();
}
