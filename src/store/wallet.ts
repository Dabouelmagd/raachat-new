import { useSyncExternalStore } from "react";
import { tr } from "../i18n";
import { API_ON, api, useSession } from "../api/client";
import { useEffect } from "react";

// متجر محفظة تجريبي — يُستبدل بنداءات الباك إند (رصيد + سجل عمليات) عند الربط
export interface Txn { id: string; title: string; amount: number; date: string; ref: string }
interface WalletState { balance: number; txns: Txn[]; hasPin?: boolean }

let state: WalletState = API_ON ? { balance: 0, txns: [] } : {
  balance: 1240,
  txns: [
    { id: "t0", get title() { return tr("فاتورة كهرباء", "Electricity bill"); }, amount: 186.5, get date() { return tr("أمس", "Yesterday"); }, ref: "RC-482913" },
    { id: "t1", get title() { return tr("شحن رصيد", "Mobile top-up"); }, amount: 50, get date() { return tr("منذ ٣ أيام", "3 days ago"); }, ref: "RC-482377" },
  ],
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

interface ApiTx { id: string; kind: string; service: string | null; amount: number; ref: string; at: string }
const toTxn = (t: ApiTx): Txn => ({
  id: t.id, amount: t.amount, ref: t.ref,
  title: t.kind === "topup" ? tr("شحن المحفظة", "Wallet top-up") : t.service ?? tr("فاتورة", "Bill"),
  date: new Date(t.at).toLocaleDateString(),
});

export async function refreshWallet() {
  const w = await api<{ balance: number; hasPin: boolean; txns: ApiTx[] }>("/wallet");
  state = { balance: w.balance, hasPin: w.hasPin, txns: w.txns.map(toTxn) };
  emit();
}

export function useWallet() {
  const session = useSession();
  useEffect(() => { if (API_ON && session) void refreshWallet().catch(() => {}); }, [session?.meId]); // eslint-disable-line react-hooks/exhaustive-deps
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f); },
    () => state
  );
}

/** دفع حقيقي عبر السيرفر (الخصم والرصيد والـ PIN كلهم بيتحققوا هناك) */
export async function payBillApi(p: { service: string; account: string; amount: number; code?: string; pin: string; title: string }): Promise<{ txn?: Txn; error?: "pin" | "locked" | "balance" | "other" }> {
  try {
    if (!state.hasPin) { await api("/wallet/pin", { method: "PUT", body: { pin: p.pin } }); state = { ...state, hasPin: true }; }
    const key = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random()).replace(/[^\w-]/g, "").slice(0, 40).padEnd(8, "0");
    const r = await api<ApiTx & { balance: number }>("/wallet/pay", { body: { service: p.service, account: p.account, amount: p.amount, code: p.code || undefined, pin: p.pin, idempotencyKey: key } });
    await refreshWallet();
    return { txn: { ...toTxn(r), title: p.title, date: tr("الآن", "Just now") } };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { error: code === "bad_pin" ? "pin" : code === "pin_locked" ? "locked" : code === "insufficient" ? "balance" : "other" };
  }
}

export async function quoteApi(service: string, amount: number, code: string) {
  return api<{ discount: number }>("/wallet/quote", { body: { service, amount, code } });
}

export function payBill(title: string, amount: number): Txn | null {
  if (amount > state.balance) return null;
  const txn: Txn = {
    id: "t" + Date.now(),
    title,
    amount,
    date: tr("الآن", "Just now"),
    ref: "RC-" + Math.floor(100000 + Math.random() * 900000),
  };
  state = { balance: +(state.balance - amount).toFixed(2), txns: [txn, ...state.txns] };
  emit();
  return txn;
}
