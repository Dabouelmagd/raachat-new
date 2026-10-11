/** يولّد مفتاحي VAPID (منحنى P-256) بدون أي حزم خارجية. الخرج: "<public> <private>" بترميز base64url. */
const { generateKeyPairSync } = require("crypto");
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ type: "spki", format: "der" }).subarray(-65);      // النقطة غير المضغوطة (65 بايت، تبدأ بـ 0x04)
const prv = privateKey.export({ type: "pkcs8", format: "der" }).subarray(36, 68); // المفتاح الخاص (32 بايت)
const b64 = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
if (pub.length !== 65 || pub[0] !== 4 || prv.length !== 32) { console.error("bad key sizes"); process.exit(1); }
console.log(b64(pub) + " " + b64(prv));
