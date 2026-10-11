# رع شات (Raa Chat) — مرجع المشروع لـ Claude

اقرا الملف ده أول حاجة في أي جلسة. **مفيش فيه ولا هيتحط فيه أي توكن أو كلمة سر.**

## المشروع
تطبيق شات عربي (رسائل، جروبات، غرف صوتية، مكالمات، ستوري، محفظة، إعلانات، ترجمة).
- الواجهة: React 18 + TS + Vite + Tailwind (`src/`)، نسخة ملف واحد للمعاينة: `npx vite build -c vite.single.config.ts`.
- السيرفر: Node/Express + Prisma 7 + PostgreSQL (`server/`).
- لوحة الإدارة: `admin/` (React + Vite).
- الموبايل: Capacitor (`mobile/`). الصفحات القانونية: `public/legal/` + `scripts/fill-legal.mjs`.
- الاسم: «رع شات» في الصفحات العربية، «Raa Chat» في الإنجليزية.

## الدورة (Claude ↔ GitHub ↔ السيرفر)
Claude يعدّل ويختبر ويعمل commit + push على `main` ← داليا تشغّل `bash scripts/deploy-rachat.sh` على السيرفر ← تلصق الناتج ← Claude يتأكد.
- Claude **مابيدخلش السيرفر** ولا بياخد باسورد/SSH.
- مفيش تعديل يدوي على السيرفر. الرجوع = `git revert` + push + نشر (مفيش `git reset` على السيرفر).
- التفاصيل الكاملة: `WORKFLOW.md`.

## النشر
على السيرفر: `cd /opt/rachat && bash scripts/deploy-rachat.sh`
(Docker Compose: `db` / `api` / `caddy` (الواجهة، داخلي بلا HTTPS) / `backup`، و`turn` اختياري). السكربت بيعمل `git pull --ff-only`، نسخة احتياطية لو فيه migration، وبيبني اللازم بس، وبيفحص الـ API على `127.0.0.1:8085`.
`FORCE=1` لإعادة البناء، `BACKUP=0` لتخطّي النسخة.

## الإنتاج (شغّال)
الدومين المؤقت `kenoz.org` (الباكدج اسمه raachat زي ما هو). التطبيق https://app.kenoz.org · اللوحة https://admin.kenoz.org · الـ API https://api.kenoz.org (فحص `/health`).
المسار على السيرفر `/opt/rachat` (clone من GitHub). شهادات Let's Encrypt عبر certbot، أول إصدار ١١ أكتوبر ٢٠٢٦.
كود التحقق بالإيميل عبر **Resend** (الدومين متحقّق، `EMAIL_FROM=Raa Chat <no-reply@kenoz.org>`) ومُجرَّب بنجاح. **SMS مش شغّال:** Twilio لمصر بيتطلب تسجيل Alphanumeric Sender ID (حوالي ٣ أسابيع)، ومفيش long/short codes لمصر.
المالك `OWNER_CONTACTS=01222139111`. VAPID (إشعارات Push) لسه مش متضبط.

## السيرفر (مشترك)
Hetzner `ubuntu-4gb-fsn1-1`، نجنكس على 80/443 لكل المواقع. رع شات: Docker، Caddy داخلي `127.0.0.1:8085`، ونجنكس بيحوّل له (`deploy/nginx-rachat.conf.template` + `scripts/add-nginx-site.sh`). منافذ محجوزة لمشاريع تانية: 3001-3004 و3010 و8002-8004 و5432 و5672 و6379 و27017-27019. **أي تغيير في نجنكس بسكربت بيعمل `nginx -t` قبل الـ reload، ومنلمسش مواقع المشاريع التانية.**

## الاختبار قبل الـ push
- السيرفر: `cd server && npx vitest run` (لازم يعدّي كله — حاليًا ٧٨). لو الشِل root شغّليه كمستخدم عادي (`runuser -u claude -- env HOME=/home/claude PATH="$PATH" npx vitest run`) لأن postgres المدمج مابيشتغلش كـ root.
- الواجهة: `npx tsc -b` ثم `npx vite build -c vite.single.config.ts`، وPlaywright على `dist-single/index.html` (حساب الديمو: 01000000000 / 123456).
- أي اختبار جديد يتكتب جوه `server/test/` أو `test/` في الريبو (بيئة Claude بتتجدد وأي حاجة برّه بتضيع).
- Claude لازم يقول بوضوح إيه **اللي ما اتجرّبش** (موبايل حقيقي، جهات اتصال حقيقية، Twilio/Resend حقيقي، build السيرفر…).

## الممنوعات
- أي سر في ملف أو commit أو رسالة: `.env*` متجاهل في git. أسماء المفاتيح بس تتطبع، مش القيم.
- لمس `docker-compose.prod.yml` أو `deploy/Caddyfile` بدون طلب صريح، ونشر منفذ `5432` أو `4000` أبدًا.
- تخزين جهات اتصال المستخدمين أو تسجيلها في اللوج (ميزة «الأصدقاء» مطابقة فقط).
- قول «اتنشر» وهو لسه commit.

## Claude يسأل قبل
- أي حاجة **مابترجعش** (مسح داتا، migration بيحذف أعمدة، `prisma migrate reset`).
- أي حاجة **بتكلّف فلوس** (مفتاح API مدفوع، بوابة دفع، SMS).
- أي تغيير في **كلام بيتقال للعملاء** أو في **الصفحات القانونية** (بتحتاج محامي).
- أي مشكلة لقاها برّه المطلوب: يبلّغ الأول ويستنى.

## ردود Claude
أول سطر النتيجة (✅ / ⚠️ / ❌)، سؤال واحد بس في الرسالة، كل أمر في code block لوحده وفوقه مكان التشغيل ("على السيرفر:")، ومفيش placeholder جوه أمر.

## سكربتات السيرفر
`scripts/setup-env.sh` (يجهّز `.env.production` ويولّد الأسرار) · `scripts/set-otp-keys.sh` (مفاتيح Resend/Twilio بدون إظهارها) · `scripts/set-vapid.sh` (مفاتيح إشعارات Push) · `scripts/add-nginx-site.sh` (مواقع نجنكس + certbot) · `scripts/deploy-rachat.sh` (النشر) · `scripts/fill-legal.mjs` (الصفحات القانونية).

## نقاط معروفة
- الصفحات القانونية فيها placeholders لحد ما تتملي `legal.config.json` ويتشغّل `node scripts/fill-legal.mjs`.
- بعد `fill-legal` لازم إعادة بناء `dist-single` قبل النشر كمعاينة.
