import React, { useState } from "react";
import { Card, Kpi, Table, Pill, Switch, n, egp, useAdmin } from "./ui.jsx";

const FLAGS = [
  ["calls", "المكالمات الصوتية", true], ["video", "مكالمات الفيديو", true], ["rooms", "الغرف الصوتية", true],
  ["stealth", "وضع الهوية المؤقتة", true], ["wallet", "المحفظة ودفع الفواتير", true], ["stories", "Stories اليومية", true],
  ["email", "التسجيل بالإيميل", true], ["ads", "عرض الإعلانات", true],
];
export function Settings() {
  const { act } = useAdmin();
  const [flags, setFlags] = useState(Object.fromEntries(FLAGS.map(([k, , v]) => [k, v])));
  const [s, setS] = useState({ otp: "sms", otpExpiry: 5, otpTries: 5, groupMax: 256, editWindow: 15, maint: false, minVer: "1.4.0" });
  return (
    <div className="grid two">
      <Card title="ميزات التطبيق (تشغيل / إيقاف)">
        <div className="list">
          {FLAGS.map(([k, label]) => (
            <div className="li" key={k}><span className="t">{label}</span>
              <Switch on={flags[k]} label={label} onChange={(v) => { setFlags({ ...flags, [k]: v }); act(`${v ? "فعّل" : "أوقف"} ميزة ${label}`); }} /></div>
          ))}
        </div>
      </Card>
      <Card title="التحقق والحدود">
        <div className="form">
          <label className="f">قناة إرسال OTP<select id="so" className="inp" value={s.otp} onChange={(e) => setS({ ...s, otp: e.target.value })}><option value="sms">رسالة SMS</option><option value="email">إيميل</option><option value="both">الاثنان</option></select></label>
          <label className="f">صلاحية الكود (دقيقة)<input id="se" className="inp" type="number" min="1" value={s.otpExpiry} onChange={(e) => setS({ ...s, otpExpiry: e.target.value })} /></label>
          <label className="f">أقصى محاولات<input id="st" className="inp" type="number" min="1" value={s.otpTries} onChange={(e) => setS({ ...s, otpTries: e.target.value })} /></label>
          <label className="f">أقصى أعضاء في الجروب<input id="sg" className="inp" type="number" min="2" value={s.groupMax} onChange={(e) => setS({ ...s, groupMax: e.target.value })} /></label>
          <label className="f">مهلة تعديل الرسالة (دقيقة)<input id="sw" className="inp" type="number" min="0" value={s.editWindow} onChange={(e) => setS({ ...s, editWindow: e.target.value })} /></label>
          <label className="f">أقل إصدار مطلوب<input id="sv" className="inp" dir="ltr" value={s.minVer} onChange={(e) => setS({ ...s, minVer: e.target.value })} /></label>
        </div>
        <div className="li" style={{ marginTop: 12 }}><div><div className="t">وضع الصيانة</div><div className="s">يوقف التطبيق للمستخدمين ويعرض رسالة صيانة</div></div>
          <Switch on={s.maint} label="وضع الصيانة" onChange={(v) => { setS({ ...s, maint: v }); act(`${v ? "فعّل" : "أوقف"} وضع الصيانة`); }} /></div>
        <button className="btn pri" style={{ marginTop: 10 }} onClick={() => act("حفظ إعدادات التحقق والحدود")}>حفظ الإعدادات</button>
      </Card>
    </div>
  );
}
