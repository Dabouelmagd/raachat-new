# نشر رع شات على سيرفر واحد (Hetzner أو أي VPS)

النتيجة: `https://app.دومينك` (التطبيق) و`https://api.دومينك` (الـ API + WebSocket) بشهادات HTTPS تلقائية، وقاعدة بيانات مش مفتوحة للإنترنت، ونسخ احتياطي يومي.

## ١. قبل ما تبدئي
- سيرفر Ubuntu 22.04/24.04 (٢ vCPU و٤ جيجا رام كفاية للبداية) ودومين.
- في الـ DNS: سجّلين `A` — `app` و`api` — على الـ IP العام للسيرفر.
- حساب Twilio (SMS) و/أو Resend (إيميل) — **من غيرهم محدش هيقدر يسجّل دخول**.

## ٢. تجهيز السيرفر (مرة واحدة)
```bash
# Docker
curl -fsSL https://get.docker.com | sh
# جدار ناري: بس SSH وHTTP/HTTPS (وTURN لو هتفعّليه). مفيش 5432 ولا 4000 أبدًا
ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443 && ufw allow 3478 && ufw allow 49160:49200/udp && ufw --force enable
```
> ملحوظة أمان: Docker بيتخطّى ufw للمنافذ اللي بتنشريها بـ `ports:`. عشان كده الـ compose ده **مش بينشر** DB ولا API — بس Caddy. ماتضيفيش `ports:` لقاعدة البيانات.

## ٣. رفع المشروع وضبط الأسرار
```bash
# من جهازك
rsync -a --exclude node_modules --exclude dist --exclude .env ra-chat-starter/ root@SERVER_IP:/opt/rachat/
# على السيرفر
cd /opt/rachat && cp .env.production.example .env.production && nano .env.production
#   openssl rand -hex 32   → JWT_SECRET
#   openssl rand -hex 24   → POSTGRES_PASSWORD و TURN_SECRET
chmod 600 .env.production
```

## ٤. التشغيل
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
# مع TURN (للمكالمات خلف الشبكات المقفولة):
docker compose -f docker-compose.prod.yml --env-file .env.production --profile turn up -d
```
أول مرة بيعمل migrate للقاعدة تلقائيًا (`prisma migrate deploy`) ويطلب الشهادات من Let's Encrypt (محتاج الـ DNS يكون وصل).

## ٥. تتأكدي إنه شغال
```bash
docker compose -f docker-compose.prod.yml ps                 # كله Up/healthy
curl https://api.دومينك/health                                # {"ok":true}
docker compose -f docker-compose.prod.yml logs api | head     # ابحثي عن تحذيرات ⚠️ (OTP/JWT)
```
افتحي `https://app.دومينك` وسجّلي دخول برقمك. لو الكود ماوصلش: `logs api` هيقول `sms_not_configured` أو `sms_failed`.

## ٦. التحديث / الرجوع
```bash
rsync … (نفس أمر الرفع) && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
الـ migrations بتتطبق تلقائيًا. **خدي نسخة احتياطية قبل أي تحديث فيه migration** (تحت).

## ٧. النسخ الاحتياطي والاسترجاع
- تلقائي كل ٢٤ ساعة في volume `backups` (قاعدة البيانات `.dump` + الملفات `.tgz`، آخر ١٤ نسخة).
- **انسخيها بره السيرفر** (النسخ على نفس السيرفر مش حماية من ضياع السيرفر): مثلًا `rsync` أسبوعي لجهازك أو Hetzner Storage Box.
```bash
# نسخة فورية
docker compose -f docker-compose.prod.yml exec backup sh -c 'pg_dump -h db -U rachat -Fc rachat > /backups/manual.dump'
# استرجاع (بيمسح الموجود!)
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U rachat -d rachat --clean --if-exists < db-XXXX.dump
```
**جرّبي الاسترجاع مرة على سيرفر تجريبي** قبل ما تحتاجيه فعلًا.

## ٨. اللي لازم تعرفيه (ماتجرّبش هنا)
- الـ Dockerfiles وملف الـ compose اتفحصوا بدون Docker daemon: بنيت نفس الخطوات يدويًا (تثبيت، build، تشغيل `dist` بحزم الإنتاج بس، بناء الواجهة) وشغّلت الـ API فعلاً على PostgreSQL وطلع `/health` سليم وCORS صح — لكن **`docker compose up` نفسه ما اتجرّبش**، ولا Caddy (إعداد `Caddyfile` اتكتب بدون تشغيل). لو أول تشغيل فيه خطأ، ابعتيلي رسالة `logs` وأصلحه.
- `prisma migrate deploy` ما اتجرّبش (تحميل محرك Prisma محجوب عندي). الـ migrations SQL اتطبقت مباشرة على PostgreSQL ونجحت، لكن بعد أول تشغيل على سيرفر فيه إنترنت شغّلي مرة: `docker compose … exec api npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` — لو رجّع فروقات يبقى فيه اختلاف بين الـ SQL والـ schema وأصلحه قبل أي migration جديد.
- شحن المحفظة (بوابة دفع) وتكامل الفواتير مع جهة حقيقية لسه ناقصين — راجعي `server/README.md`.
- الحالة اللحظية (مكالمات/غرف) في ذاكرة instance واحد؛ ماتشغّليش أكتر من نسخة API قبل إضافة Redis.

## إشعارات Push (اختياري بس مهم للمكالمات)
```bash
cd server && npm install && npm run vapid    # أو: docker run --rm node:22 npx -y web-push generate-vapid-keys
```
حطي `VAPID_PUBLIC` و`VAPID_PRIVATE` في `.env` ثم `docker compose -f docker-compose.prod.yml up -d`. من غيرهم السيرفر بيشتغل عادي والإشعارات متوقفة (هتشوفي تحذير في اللوج).
بعدها كل مستخدم يفعّلها من: الحساب ← الإشعارات ← «إشعارات الجهاز».

## لوحة الإدارة والفريق (admin.دومينك)
- أضيفي سجل DNS ثالث: `admin` → نفس IP السيرفر (مع `app` و`api`). الشهادة بتتعمل تلقائي.
- حطي رقمك/إيميلك في `OWNER_CONTACTS` بملف `.env`. أول مرة تدخلي `https://admin.دومينك` بنفس الرقم والكود بتبقي **مالك** بكل الصلاحيات.
- من «الفريق والصلاحيات» أضيفي مساعدين (مدير، إداري، محاسب، مشرف محتوى، دعم فني) أو أنشئي أدوار جديدة، وخصّصي صلاحيات كل شخص. العضو بيدخل بنفس رقمه وكود التحقق، ومفيش كلمات سر.
- كل إجراء إداري بيتسجّل في «سجل المراجعة». المالك مينفعش يتوقف أو يتعدّل من اللوحة.
- الأقسام المتوصّلة بالسيرفر دلوقتي: المستخدمون، المدفوعات (مع الاسترداد)، العروض، الإعلانات (خريطة المخزون والحجز)، الفريق والصلاحيات، سجل المراجعة. الباقي (البلاغات، الغرف، الإشعارات، الإعدادات) لسه تجريبي.

## دخول مباشر للوحة من التطبيق
- أعضاء الفريق بيشوفوا أيقونة «لوحة التحكم» (درع) في الشريط الجانبي بنسخة الويب وفي شاشة الحساب. الضغط عليها بيفتح `admin.DOMAIN` مسجّل دخول بدون كود تحقق.
- بيشتغل بتذكرة لمرة واحدة صالحة ٦٠ ثانية (`POST /admin/handoff` ثم `POST /auth/handoff/exchange`) بتتحط في `#h=` في العنوان وبتتشال منه فورًا، وبتتفحص صلاحية الموظف وحالة الحساب وقت التبديل.
- في اللوحة خانة «تذكرني على الجهاز ده» (مفعّلة افتراضيًا): مفعّلة = الجلسة بتفضل بعد قفل المتصفح (تجديد تلقائي ٣٠ يوم)، ومقفولة = بتخلص بقفل التبويب.
- العنوان بيتحدد من `VITE_ADMIN_URL` (متضبط في docker-compose على `https://admin.${DOMAIN}`).
