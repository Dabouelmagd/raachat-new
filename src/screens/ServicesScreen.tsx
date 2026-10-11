import { Bell, Zap, Droplet, Flame, Wifi, CreditCard, Smartphone, Phone, ShieldCheck, Tag, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { SERVICES, OFFERS } from "../data/services";
import { SponsoredCard } from "../ads/SponsoredCard";
import { useWallet, refreshWallet } from "../store/wallet";
import { useIsAdult } from "../store/profile";
import { AgeLock } from "../components/AgeLock";
import { API_ON, api } from "../api/client";
import { useT, loc } from "../i18n";
import { Scarab } from "../components/PharaohIcons";

export const ICONS: Record<string, typeof Zap> = {
  elec: Zap, water: Droplet, gas: Flame, net: Wifi, topup: CreditCard,
  mobile: Smartphone, landline: Phone, insurance: ShieldCheck,
};

const fmt = (n: number) => n.toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ServicesScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { balance, txns } = useWallet();
  const adult = useIsAdult();
  const [copied, setCopied] = useState("");

  const copy = (code: string) => {
    try { navigator.clipboard.writeText(code).catch(() => {}); } catch {}
    setCopied(code);
    setTimeout(() => setCopied(""), 1500);
  };

  // خدمات ١٨+: القاصر (أو اللي لسه ما حددش تاريخ ميلاده) يشوف القفل بدل المحفظة والفواتير
  if (!adult) {
    return (
      <div className="flex h-full flex-col">
        <Header title={t("الخدمات", "Services")} />
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-8"><AgeLock /></div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header title={t("الخدمات", "Services")} right={<Bell size={19} />} />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div data-rc-theme="dark" className="text-rachat-papyrus mb-5 rounded-2xl bg-gradient-to-br from-rachat-black via-[#2b2118] to-rachat-gold p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] text-[#d8c896]">{t("محفظتك · كنز الملوك", "Your wallet · Kings' Treasure")}</div>
              <div className="mt-1 text-2xl font-extrabold">{fmt(balance)} <span className="text-sm">{t("ج.م", "EGP")}</span></div>
              {API_ON && import.meta.env.DEV && (
                <button onClick={() => void api("/wallet/topup", { body: { amount: 500 } }).then(refreshWallet)} className="mt-2 rounded-lg bg-rachat-gold/25 px-2.5 py-1 text-[10.5px] font-bold">{t("+٥٠٠ رصيد تجريبي (تطوير فقط)", "+500 test credit (dev only)")}</button>
              )}
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rachat-gold/20">
              <Scarab size={17} className="text-rachat-gold" />
            </div>
          </div>
        </div>

        <h2 className="mb-2 text-sm font-extrabold">{t("ادفع فواتيرك", "Pay your bills")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {SERVICES.map((s) => {
            const Icon = ICONS[s.key];
            return (
              <button key={s.key} onClick={() => navigate(`/pay/${s.key}`)}
                className="flex flex-col items-center gap-1.5 rounded-xl bg-rachat-card py-3 active:scale-95">
                <Icon size={20} className="text-rachat-red" />
                <span className="text-[10.5px]">{s.label}</span>
              </button>
            );
          })}
        </div>

        <h2 className="mb-2 mt-6 flex items-center gap-1.5 text-sm font-extrabold"><Tag size={14} className="text-rachat-gold" /> {t("العروض والخصومات", "Offers & discounts")}</h2>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {OFFERS.map((o) => (
            <div key={o.code} className={`w-56 shrink-0 rounded-2xl bg-gradient-to-br ${o.gradient} p-3.5`}>
              <div className="text-sm font-extrabold leading-5">{o.title}</div>
              <div className="mt-0.5 text-[11px] text-white/80">{o.desc}</div>
              <button onClick={() => copy(o.code)}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-black/30 px-2.5 py-1.5 text-xs font-extrabold" dir="ltr">
                {copied === o.code ? <Check size={13} /> : <Copy size={13} />} {o.code}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6" />
        <SponsoredCard index={4} placement="services" />
        <h2 className="mb-2 mt-4 text-sm font-extrabold">{t("آخر العمليات", "Recent transactions")}</h2>
        <div className="space-y-2">
          {txns.slice(0, 5).map((x) => (
            <div key={x.id} className="flex items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3">
              <div>
                <div className="text-sm font-bold">{x.title}</div>
                <div className="text-[11px] text-neutral-500">{x.date} · <span dir="ltr">{x.ref}</span></div>
              </div>
              <div className="flex items-center gap-1 text-sm font-extrabold text-rachat-coral"><span>−</span><span>{fmt(x.amount)}</span><span className="text-[10px] font-bold">{t("ج.م", "EGP")}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
