import { API_ON, api } from "../api/client";

export interface DeviceContact { name: string; phone: string }
export interface Friend { id: string; name: string; color?: string; contactPhone: string }
export interface MatchResult { onApp: Friend[]; notOnApp: string[] }

const KEY = "rachat-contacts-consent";
export const consentGiven = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const consentAsked = () => { try { return localStorage.getItem(KEY) !== null; } catch { return true; } };
export const setConsent = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* تجاهل */ } };

type CapContacts = { requestPermissions(): Promise<{ contacts: string }>; getContacts(o: unknown): Promise<{ contacts: { name?: { display?: string }; phones?: { number?: string }[] }[] }> };
const capPlugin = (): CapContacts | undefined => (window as unknown as { Capacitor?: { Plugins?: { Contacts?: CapContacts } } }).Capacitor?.Plugins?.Contacts;

/** هل الجهاز يقدر يقرا جهات الاتصال (تطبيق موبايل أو متصفح أندرويد بيدعم Contact Picker). */
export const canReadContacts = () => !!capPlugin() || (typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window);

/** أرقام تجريبية للديمو (بدون باك إند) */
const DEMO: DeviceContact[] = [
  { name: "ماما", phone: "01000000001" }, { name: "أحمد زميل الشغل", phone: "01000000002" },
  { name: "سلمى", phone: "01000000003" }, { name: "عمرو الجيم", phone: "01000000004" }, { name: "د. هبة", phone: "01000000005" },
];

export async function readDeviceContacts(): Promise<DeviceContact[]> {
  const cap = capPlugin();
  if (cap) {
    const p = await cap.requestPermissions();
    if (p.contacts !== "granted") throw new Error("denied");
    const r = await cap.getContacts({ projection: { name: true, phones: true } });
    return r.contacts.flatMap((c) => (c.phones ?? []).map((ph) => ({ name: c.name?.display ?? ph.number ?? "", phone: ph.number ?? "" }))).filter((c) => c.phone);
  }
  const nav = navigator as unknown as { contacts?: { select(p: string[], o: { multiple: boolean }): Promise<{ name?: string[]; tel?: string[] }[]> } };
  if (nav.contacts) {
    const r = await nav.contacts.select(["name", "tel"], { multiple: true });
    return r.flatMap((c) => (c.tel ?? []).map((t) => ({ name: c.name?.[0] ?? t, phone: t })));
  }
  if (!API_ON) return DEMO;
  throw new Error("unsupported");
}

const clean = (p: string) => p.replace(/[\s\-().]/g, "");

/** مطابقة مع المسجّلين. السيرفر مش بيخزّن الأرقام. */
export async function matchContacts(list: DeviceContact[]): Promise<MatchResult & { byPhone: Map<string, string> }> {
  const byPhone = new Map(list.map((c) => [clean(c.phone), c.name]));
  const phones = [...byPhone.keys()];
  if (!API_ON) {
    const onApp = phones.filter((p) => /[1-3]$/.test(p)).map((p, i) => ({ id: "demo-" + i, name: byPhone.get(p)!, contactPhone: p }));
    return { onApp, notOnApp: phones.filter((p) => !/[1-3]$/.test(p)), byPhone };
  }
  const out: MatchResult = { onApp: [], notOnApp: [] };
  for (let i = 0; i < phones.length; i += 1000) {
    const r = await api<MatchResult>("/contacts/match", { method: "POST", body: { phones: phones.slice(i, i + 1000) } });
    out.onApp.push(...r.onApp); out.notOnApp.push(...r.notOnApp);
  }
  return { ...out, byPhone };
}
