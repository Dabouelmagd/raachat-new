import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Delete, Loader2 } from "lucide-react";
import { Header } from "../components/Header";
import { SERVICES, OFFERS, mockInquiry } from "../data/services";
import { payBill, payBillApi, quoteApi, useWallet, Txn } from "../store/wallet";
import { API_ON } from "../api/client";
import { useT, loc, num } from "../i18n";
import { useIsAdult } from "../store/profile";
import { AgeLock } from "../components/AgeLock";
import { notify } from "../sound/notify";

// PIN التجربة — يُستبدل بمصادقة حقيقية (PIN/بصمة) من الباك إند
const MOCK_PIN = "1234";
const fmt = (n: number) => n.toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Step = "account" | "review" | "pin" | "receipt";

export default function PayScreen() {
  const { key = "" } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const svc = SERVICES.find((s) => s.key === key);
  const { balance, hasPin } = useWallet();
  const adult = useIsAdult();

  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState("");
  const [topup, setTopup] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [discount, setDiscount] = useState(0);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [txn, setTxn] = useState<Txn | null>(null);

  if (!svc) return <Header title={t("خدمة غير موجودة", "Service not found")} showBack />;
  // قفل ١٨+ كمان على الشاشة نفسها، لو حد جه عليها برابط مباشر
  if (!adult) return (
    <div className="flex h-full flex-col">
      <Header title={svc.label} showBack />
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-8"><AgeLock /></div>
    </div>
  );

  const total = +(amount - discount).toFixed(2);
  const accountOk = account.replace(/\D/g, "").length >= 6 && (!svc.amounts || topup);

  const inquire = () => {
    setLoading(true);
    setTimeout(() => {
      setAmount(svc.amounts ? topup! : mockInquiry(account));
      setDiscount(0); setCode(""); setOfferMsg("");
      setLoading(false);
      setStep("review");
    }, 900);
  };

  const applyCode = async () => {
    if (API_ON) {
      try {
        const q = await quoteApi(svc.key, amount, code.trim());
        setDiscount(q.discount);
        setOfferMsg(t(`تم تطبيق الخصم: وفّرت ${fmt(q.discount)} ج.م`, `Discount applied: you saved ${fmt(q.discount)} EGP`));
      } catch { setDiscount(0); setOfferMsg(t("كود غير صحيح أو مش لنفس الخدمة", "Invalid code or not for this service")); }
      return;
    }
    const o = OFFERS.find((x) => x.code === code.trim().toUpperCase());
    if (!o) { setDiscount(0); setOfferMsg(t("كود غير صحيح", "Invalid code")); return; }
    if (!o.appliesTo.includes(svc.key)) { setDiscount(0); setOfferMsg(t("الكود ده مش لنفس الخدمة", "This code doesn't apply to this service")); return; }
    const d = Math.min(+(amount * o.percent / 100).toFixed(2), o.max);
    setDiscount(d);
    setOfferMsg(t(`تم تطبيق الخصم: وفّرت ${fmt(d)} ج.م`, `Discount applied: you saved ${fmt(d)} EGP`));
  };

  const press = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next); setError("");
    if (next.length === 4) {
      setTimeout(async () => {
        if (API_ON) {
          const r = await payBillApi({ service: svc.key, account, amount, code: discount > 0 ? code : undefined, pin: next, title: svc.label });
          if (!r.txn) {
            setPin("");
            setError(
              r.error === "pin" ? t("الرقم السري غير صحيح", "Incorrect PIN")
              : r.error === "locked" ? t("الرقم السري مقفول مؤقتًا، حاول بعد شوية", "PIN temporarily locked, try again later")
              : r.error === "balance" ? t("الرصيد غير كافي", "Insufficient balance")
              // سقوف الفئة ١٨–٢١ — رسالة السيرفر بتحدد السقف اللي اتعدّى
              : r.error === "limit" ? (r.message ?? t("العملية فوق السقف المسموح لسنك", "This is above the limit allowed for your age"))
              : t("حصل خطأ، حاول تاني", "Something went wrong, try again"));
            return;
          }
          setTxn(r.txn); setStep("receipt");
          notify(t("تم الدفع بنجاح", "Payment successful"), `${svc.label} · ${total.toLocaleString(loc())} ${t("ج.م", "EGP")}`);
          return;
        }
        if (next !== MOCK_PIN) { setPin(""); setError(t("الرقم السري غير صحيح", "Incorrect PIN")); return; }
        const paid = payBill(svc.label + (svc.key === "topup" ? "" : ""), total);
        if (!paid) { setPin(""); setError(t("الرصيد غير كافي", "Insufficient balance")); return; }
        setTxn(paid); setStep("receipt");
        notify(t("تم الدفع بنجاح", "Payment successful"), `${svc.label} · ${total.toLocaleString(loc())} ${t("ج.م", "EGP")}`);
      }, 250);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title={svc.label} showBack />
      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2">
        {step === "account" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-400">{svc.biller}</p>
            <label className="text-xs font-bold text-neutral-300">{svc.field}</label>
            <input dir="ltr" inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value)}
              placeholder={svc.hint}
              className="rounded-xl bg-rachat-card px-4 py-3.5 text-left outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-red" />
            {svc.amounts && (
              <>
                <label className="text-xs font-bold text-neutral-300">{t("قيمة الشحن", "Top-up amount")}</label>
                <div className="grid grid-cols-4 gap-2">
                  {svc.amounts.map((a) => (
                    <button key={a} onClick={() => setTopup(a)}
                      className={`rounded-xl py-3 text-sm font-extrabold ${topup === a ? "bg-rachat-red" : "bg-rachat-card"}`}>{num(a)}</button>
                  ))}
                </div>
              </>
            )}
            <button disabled={!accountOk || loading} onClick={inquire}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-rachat-red py-3.5 font-extrabold disabled:opacity-40">
              {loading && <Loader2 size={18} className="animate-spin" />} {svc.amounts ? t("متابعة", "Continue") : t("استعلام عن الفاتورة", "Check bill")}
            </button>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-rachat-card p-4 text-sm">
              <Row k={t("الخدمة", "Service")} v={svc.biller} />
              <Row k={svc.field} v={account} ltr />
              <Row k={t("قيمة الفاتورة", "Bill amount")} v={`${fmt(amount)} ${t("ج.م", "EGP")}`} />
              {discount > 0 && <Row k={t("الخصم", "Discount")} v={`${fmt(discount)} ${t("ج.م خصم", "EGP off")}`} accent />}
              <div className="my-2 border-t border-rachat-maroon/40" />
              <Row k={t("الإجمالي", "Total")} v={`${fmt(total)} ${t("ج.م", "EGP")}`} bold />
            </div>
            <div className="flex gap-2">
              <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("كود الخصم", "Discount code")}
                className="min-w-0 flex-1 rounded-xl bg-rachat-card px-4 py-3 text-left outline-none ring-1 ring-rachat-maroon/50 focus:ring-rachat-gold" />
              <button onClick={applyCode} className="rounded-xl bg-rachat-gold px-4 font-extrabold text-rachat-ink">{t("تطبيق", "Apply")}</button>
            </div>
            {offerMsg && <p className={`text-xs ${discount > 0 ? "text-rachat-gold" : "text-rachat-coral"}`}>{offerMsg}</p>}
            <p className="text-xs text-neutral-500">{t("رصيد المحفظة", "Wallet balance")}: {fmt(balance)} {t("ج.م", "EGP")}</p>
            <button onClick={() => setStep("pin")} className="rounded-xl bg-rachat-red py-3.5 font-extrabold">
              {t("ادفع", "Pay")} {fmt(total)} {t("ج.م", "EGP")}
            </button>
          </div>
        )}

        {step === "pin" && (
          <div className="flex flex-col items-center gap-6 pt-6">
            <p className="text-sm text-neutral-300">{t("اكتب الرقم السري لتأكيد الدفع", "Enter your PIN to confirm payment")}</p>
            <div className="flex gap-3" dir="ltr">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-4 w-4 rounded-full ${pin.length > i ? "bg-rachat-red" : "bg-rachat-card ring-1 ring-rachat-maroon"}`} />
              ))}
            </div>
            {error && <p className="text-sm text-rachat-coral">{error}</p>}
            {API_ON ? (!hasPin && <p className="text-[11px] text-rachat-gold">{t("أول مرة: اختار رقم سري من ٤ أرقام هيتحفظ لمحفظتك", "First time: choose a 4-digit PIN for your wallet")}</p>) : <p className="text-[11px] text-neutral-600">{t("رقم التجربة", "Demo PIN")}: <span className="font-extrabold text-rachat-gold">{MOCK_PIN}</span></p>}
            <div className="grid w-64 grid-cols-3 gap-3" dir="ltr">
              {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d, i) =>
                d === "" ? <span key={i} /> : (
                  <button key={i} onClick={() => (d === "⌫" ? setPin(pin.slice(0, -1)) : press(d))}
                    className="flex h-14 items-center justify-center rounded-full bg-rachat-card text-xl font-extrabold active:bg-rachat-maroon">
                    {d === "⌫" ? <Delete size={20} /> : d}
                  </button>
                ))}
            </div>
          </div>
        )}

        {step === "receipt" && txn && (
          <div className="flex flex-col items-center gap-4 pt-4">
            <CheckCircle2 size={56} className="text-rachat-gold" />
            <h2 className="text-xl font-extrabold">{t("تم الدفع بنجاح", "Payment successful")}</h2>
            <div className="w-full rounded-2xl bg-rachat-card p-4 text-sm">
              <Row k={t("الخدمة", "Service")} v={svc.biller} />
              <Row k={svc.field} v={account} ltr />
              <Row k={t("المبلغ المدفوع", "Amount paid")} v={`${fmt(txn.amount)} ${t("ج.م", "EGP")}`} bold />
              <Row k={t("رقم العملية", "Transaction no.")} v={txn.ref} ltr />
              <Row k={t("التاريخ", "Date")} v={new Date().toLocaleDateString(loc())} />
            </div>
            <button onClick={() => navigate("/services", { replace: true })} className="w-full rounded-xl bg-rachat-red py-3.5 font-extrabold">{t("تم", "Done")}</button>
            <p className="text-[11px] text-neutral-600">{t("إيصال تجريبي — غير صالح كإثبات دفع حقيقي", "Demo receipt — not valid as proof of real payment")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, ltr, bold, accent }: { k: string; v: string; ltr?: boolean; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-neutral-400">{k}</span>
      <span dir={ltr ? "ltr" : undefined} className={`${bold ? "text-base font-extrabold" : "font-bold"} ${accent ? "text-rachat-gold" : ""}`}>{v}</span>
    </div>
  );
}
