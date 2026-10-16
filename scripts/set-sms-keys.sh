#!/usr/bin/env bash
# يشغّل تسجيل الدخول/التسجيل **برقم الموبايل**: بيضبط مجمّع SMS مصري (أي مزوّد)،
# **بعد ما يبعت رسالة حقيقية وتأكّدي إنها وصلت**.
#
#   على السيرفر:  cd /opt/rachat && bash scripts/set-sms-keys.sh
#   للإلغاء:      bash scripts/set-sms-keys.sh --off
#
# مابيطبعش ولا قيمة سر. ومابيكتبش في .env.production غير بعد تأكيدك إن الرسالة وصلت.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
ENVF=.env.production
[ -f "$ENVF" ] || { echo "❌ مفيش $ENVF"; exit 1; }

put() { # put KEY VALUE — بيكتب/بيستبدل سطر في .env.production من غير ما يطبع القيمة
  python3 - "$1" "$2" <<'PY'
import sys,re
k,v=sys.argv[1],sys.argv[2]; p='.env.production'; s=open(p).read()
s = re.sub(rf'^{k}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{k}=', s, re.M) else s+("" if s.endswith("\n") or not s else "\n")+f"{k}={v}\n"
open(p,'w').write(s)
PY
  chmod 600 "$ENVF"
}

if [ "${1:-}" = "--off" ]; then
  put SMS_HTTP ""
  $DC up -d api >/dev/null
  echo "✅ الـ SMS اتوقف. خيار «رقم الموبايل» هيتقفل لوحده في شاشة الدخول (/auth/channels)."
  exit 0
fi

# فحص قبلي **قبل** أي إرسالة مدفوعة: هل compose بيمرّر SMS_HTTP للـ api أصلًا؟
# (درس RETENTION: المفتاح في .env.production ومش في `environment:` = مابيوصلش
# للعملية خالص.) لو ناقص، نقف هنا من غير ما نصرف رسالة ولا وقت.
if ! $DC config 2>/dev/null | grep -q "SMS_HTTP"; then
  echo "❌ compose مش بيمرّر SMS_HTTP للـ api — أي ضبط هيتكتب ومايوصلش."
  echo "   الحل: ضيفي السطر ده جوه environment: بتاعة الـ api في docker-compose.prod.yml"
  echo "   (سطر واحد، إضافة بس، جنب TWILIO_FROM):"
  echo ""
  echo "      SMS_HTTP: \${SMS_HTTP:-}"
  echo ""
  exit 1
fi

cat <<'INFO'
محتاجة من لوحة المزوّد (SMS Misr · OSSN · Digital Planets · E3melBusiness · Infobip…):
  1) عنوان الـ API (https://…)
  2) أسماء الحقول وقيمها زي ما هي في مستنداته (اسم المستخدم · كلمة السر/التوكن · اسم المرسل المعتمد)
  3) **علامة النجاح** في الرد (مثال عند SMS Misr: 1901) — دي أهم حاجة:
     أغلب المجمّعات بترجّع HTTP 200 وكود خطأ في الجسم، فمن غير العلامة دي هنقول
     «اتبعتت» على رسالة عمرها ما خرجت.
INFO
echo
read -rp "عنوان الـ API: " URL
[ -n "$URL" ] || { echo "❌ لازم عنوان"; exit 1; }
case "$URL" in https://*) ;; *) echo "❌ العنوان لازم https://"; exit 1;; esac
read -rp "الطريقة [POST]: " METHOD; METHOD=${METHOD:-POST}
read -rp "الصيغة form/json/query [form]: " FORMAT; FORMAT=${FORMAT:-form}
read -rp "علامة النجاح في الرد (مثال 1901): " OK
[ -n "$OK" ] || { echo "❌ لازم علامة نجاح — من غيرها الفحص مابيفحصش حاجة"; exit 1; }
echo
echo "الحقول: اكتبي كل حقل في سطر بشكل  اسم=قيمة"
echo "  وللرقم استخدمي {to} (01xxxxxxxxx) أو {to20} (201…) أو {to+} (+201…)"
echo "  وللنص {text} (نص الرسالة كامل) أو {code} (الكود لوحده لو عندك قالب جاهز)"
echo "  مثال:  username=myuser   ·   Mobile={to}   ·   Message={text}"
echo "اكتبي سطر فاضي لما تخلصي:"
PAIRS=()
while IFS= read -rp "> " line; do
  [ -z "$line" ] && break
  case "$line" in *=*) PAIRS+=("$line");; *) echo "   ⚠️ لازم شكل اسم=قيمة";; esac
done
[ ${#PAIRS[@]} -gt 0 ] || { echo "❌ مفيش حقول"; exit 1; }

# الهيدرات: لازمة لأي مزوّد مصادقته في الهيدر مش في الحقول — Twilio وPlivo
# (`Basic …`) وواتساب (`Bearer …`). من غير السؤال ده المزوّدين دول مايقدروش
# يعدّوا من المسار الآمن ده خالص (الرسالة الحقيقية + تأكيد الوصول).
echo
echo "هيدرات (لو مصادقة مزوّدك في الهيدر) — نفس الشكل اسم=قيمة، وسطر فاضي للتخطّي:"
echo "  مثال Twilio:  Authorization=Basic <الناتج من base64 لـ SID:TOKEN>"
HEADS=()
while IFS= read -rp "h> " line; do
  [ -z "$line" ] && break
  case "$line" in *=*) HEADS+=("$line");; *) echo "   ⚠️ لازم شكل اسم=قيمة";; esac
done

# JSON + base64 (base64 عشان كلمة السر لو فيها $ أو # ماتتكسرش في .env/compose)
SPEC=$(python3 - "$URL" "$METHOD" "$FORMAT" "$OK" "${#PAIRS[@]}" "${PAIRS[@]}" "${HEADS[@]}" <<'PY'
import base64,json,sys
url,method,fmt,ok,npairs,*rest = sys.argv[1:]
n=int(npairs)
def kv(items):
    out={}
    for p in items:
        k,_,v = p.partition("=")
        k=k.strip()
        if k: out[k]=v.strip()
    return out
params=kv(rest[:n]); headers=kv(rest[n:])
spec={"url":url,"method":method.upper(),"format":fmt,"params":params,"ok":ok}
if headers: spec["headers"]=headers
print(base64.b64encode(json.dumps(spec,ensure_ascii=False).encode()).decode())
PY
)

echo
read -rp "رقم موبايل مصري نبعتله رسالة تجربة (01xxxxxxxxx): " TESTTO
[ -n "$TESTTO" ] || { echo "❌ لازم رقم — التحقق بإرسالة حقيقية"; exit 1; }
echo "↪ بنبعت رسالة واحدة حقيقية (بتكلّف سعر رسالة واحدة)…"
if ! $DC run --rm --no-deps -T -e SMS_HTTP="$SPEC" --entrypoint node api \
      --input-type=module - "$TESTTO" < scripts/lib/smssend.mjs; then
  echo
  echo "❌ المزوّد مارضيش — **مفيش حاجة اتكتبت**. صحّحي الحقول أو علامة النجاح وجرّبي تاني."
  exit 1
fi

echo
echo "⚠️ «المزوّد قال نجحت» مش كفاية: لو علامة النجاح غلط هي بتطابق رد خطأ."
read -rp "وصلتك الرسالة على $TESTTO فعلًا؟ (yes/no): " GOT
case "$GOT" in
  y|Y|yes|YES|نعم|ايوه|أيوه) ;;
  *) echo "❌ تمام — **مفيش حاجة اتكتبت** والـ SMS فاضل متوقف. لو الرد كان نجاح والرسالة ما وصلتش، الغالب اسم المرسل مش معتمد عند المزوّد."; exit 1;;
esac

put SMS_HTTP "$SPEC"
echo "↪ إعادة تشغيل الـ API…"
$DC up -d api >/dev/null
sleep 5

# فحص إيجابي جوه الكونتينر الشغّال: المفتاح **وصل للعملية** والمواصفة مقبولة
# (درس RETENTION: المفتاح في الملف ومش في `environment:` = مابيوصلش خالص)
if ! $DC exec -T api node -e '
import("/app/dist/lib/sms.js").then((m) => {
  const s = m.parseSmsSpec(process.env.SMS_HTTP);
  if (!s) { console.error("❌ SMS_HTTP مش واصل للكونتينر — لازم يتضاف في environment: بتاعة الـ api في docker-compose.prod.yml"); process.exit(1); }
  console.log(`✅ المواصفة واصلة للـ API: ${new URL(s.url).host} · ${Object.keys(s.params).length} حقل · علامة النجاح مضبوطة`);
}).catch((e) => { console.error("❌ " + e.message); process.exit(1); });
'; then
  exit 1
fi
echo "✅ تسجيل الدخول برقم الموبايل اتفتح. خيار «رقم الموبايل» بيرجع لوحده في شاشة الدخول من غير نشر واجهة."
