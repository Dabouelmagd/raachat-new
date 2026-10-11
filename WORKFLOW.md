# ورقة الشغل: Claude ↔ GitHub ↔ سيرفر رع شات

> تتلصق في أول أي محادثة Claude جديدة على المشروع. **مفيش فيها ولا يتحط فيها أي توكن أو كلمة سر.**

## ١. الصورة
```
Claude (بيئة سحابية مؤقتة) ──git push──▶ GitHub (main) ──git pull──▶ سيرفر Hetzner
   يعدّل ويختبر ويعمل commit                مصدر الحقيقة             إنتي بتشغّلي سكربت النشر
```
- Claude مابيدخلش السيرفر (لا SSH ولا باسورد). إنتي مابتعدّليش كود على السيرفر (أي تعديل يدوي بيكسر `git pull`).

## ٢. الأدوار
| مين | بيعمل | مابيعملش |
|---|---|---|
| Claude | يقرا `CLAUDE.md`، يعدّل، يختبر، commit بوصف واضح + push على `main`، يقولك تشغّلي إيه | يلمس السيرفر، يكتب أسرار، يقول «اتنشر» وهو commit بس |
| إنتي | تدّي صلاحية الريبو، تشغّلي أمر النشر، تلصقي الناتج، تجرّبي من المتصفح | تعدّلي كود على السيرفر |
| GitHub | الكود والتاريخ ونقطة الرجوع | — |
| السيرفر | يسحب ويبني ويشغّل | — |

## ٣. صلاحية الريبو لـ Claude
**الأفضل:** ربط الريبو بالجلسة (GitHub connector في claude.ai). الصلاحية بتتحقق من GitHub ومفيش توكن بيتلصق. كل ريبو بيتضاف لوحده.

**البديل (لو الربط مش متاح):** توكن Fine-grained → *Only select repositories* ← ريبو رع شات بس، *Contents: Read and write* (و*Workflows* لو هنلمس `.github/workflows`)، صلاحية أسبوع. التوكن في الرسالة بس، عمره ما يتكتب في ملف أو commit. **Revoke** أول ما الجلسة تخلص. ماتستخدميش Classic token.

## ٤. دورة الشغل الواحدة
1. **إنتي:** تطلبي التعديل.
2. **Claude:** يقرا `CLAUDE.md`، يعدّل، يختبر (§٦)، `git commit` + `git push origin main`، ويقولك: رقم الـ commit، إيه اتجرّب وإيه **ما اتجرّبش**، والأمر اللي هتشغّليه.
3. **إنتي على السيرفر:** تشغّلي أمر النشر (§٥) وتلصقي الناتج كله.
4. **Claude:** يقرا الناتج ويتأكد إن النسخة المنشورة = اللي اتعمل لها push.
5. **إنتي:** تجرّبي من المتصفح (Hard Refresh لو الصفحة ماتحدّثتش).

## ٥. النشر
على السيرفر:
```
cd /opt/rachat && bash scripts/deploy-rachat.sh
```
| اللي اتغيّر | السكربت بيعمل |
|---|---|
| `server/` | بناء وإعادة تشغيل `api` |
| `server/prisma/migrations/` | **نسخة احتياطية للقاعدة أولًا**، وبعدين الـ migration تلقائي مع تشغيل `api` |
| `src/` أو `public/` أو `admin/` أو `package*.json` | بناء `caddy` (الواجهة) |
| docs/ملفات md بس | ولا حاجة |
| `FORCE=1` قبل الأمر | بناء الاتنين حتى لو مفيش تغيير |
- في الآخر بيفحص `https://api.<دومينك>/health` ولو فشل بيطبع آخر ٥٠ سطر لوج.
- الإعداد الأول للسيرفر (Docker، الجدار الناري، DNS، `.env.production`): في `DEPLOY.md`. **السيرفر لازم يكون clone من GitHub** (مش rsync) عشان `git pull` يشتغل: `git clone <رابط الريبو> /opt/rachat` (استخدمي deploy key للقراءة فقط، مش توكن شخصي).

### مشاريع تانية على نفس السيرفر (inmisr / homeme / datalife / govme)
**قبل أي `docker compose` على مشروع تاني: اعرفي مكان ملف الـ `.env` بتاعه.** مثلًا مشروع inmisr الـ compose في `/var/www/inmisr/docker/` والـ `.env` في `/var/www/inmisr/`، فلازم:
```
cd /var/www/inmisr/docker && docker compose --env-file ../.env up -d <الخدمة>
```
من غير `--env-file` كل المتغيرات بتبقى فاضية، والحاويات بتتعاد تهيئتها **بكلمات سر فاضية** وبتدخل في حلقة إعادة تشغيل. علامة التحذير: أسطر `WARN ... variable is not set. Defaulting to a blank string`. لو ظهرت، أوقفي وراجعي قبل ما تكملي.

## ٦. الاختبار قبل الـ push
- السيرفر: `cd server && npx vitest run` (٧٨ اختبار لازم يعدّوا).
- الواجهة: `npx tsc -b` + `npx vite build -c vite.single.config.ts` + Playwright على الحساب التجريبي.
- أي اختبار جديد جوه `server/test/` في الريبو.
- Claude يقول بوضوح اللي ما اتجرّبش: موبايل حقيقي، جهات اتصال حقيقية، SMS/إيميل حقيقي، build السيرفر.

## ٧. الأسرار
- `.env.production` على السيرفر بس، متجاهل في git (`.env*` في `.gitignore`).
- القيم بتتكتب على السيرفر بإيدك (`nano .env.production`)، **مش** بتتلصق في المحادثة. أي أمر بيطبع منه يطبع الأسماء بس.
- بعد تعديل `.env.production`: `cd /opt/rachat && docker compose -f docker-compose.prod.yml --env-file .env.production up -d` (من غير `--build`).
- الأسرار: `JWT_SECRET`، `POSTGRES_PASSWORD`، `TWILIO_*`، `RESEND_KEY`، `GOOGLE_TRANSLATE_KEY`، `TURN_SECRET`، `VAPID_PRIVATE`.

## ٨. لما حاجة تقع
| العرَض | السبب الغالب | الحل |
|---|---|---|
| الكود مابيوصلش | OTP مش مضبوط | `docker compose -f docker-compose.prod.yml logs api` وشوفي `sms_not_configured` / `sms_failed` |
| `git pull` رافض | تعديل محلي على السيرفر | السكربت بيرجّع `package-lock.json` لوحده، غير كده ابعتي `git status` |
| 500 على كل POST / CORS | `DOMAIN` غلط في `.env.production` | صلّحي وأعيدي `up -d` |
| الصفحة ماتحدّثتش | كاش المتصفح | Hard Refresh |
| الـ API مش بيرد | خطأ build/تشغيل/migration | ابعتي ناتج السكربت (بيطبع آخر ٥٠ سطر لوج) |
| شهادة HTTPS مش طالعة | الـ A record ماوصلش | تأكدي من `app` و`api` و`admin` على IP السيرفر |
| GitHub رافض الـ push | صلاحية ناقصة | ضيفي الريبو للجلسة |

**الرجوع:** Claude يعمل `git revert` للـ commit المشكلة + push، وإنتي تشغّلي النشر عادي. لو الـ migration غيّر القاعدة: النسخة اللي السكربت أخدها قبل النشر في volume `backups` (`pre-deploy-….dump`) واسترجاعها في `DEPLOY.md` §٧.

## ٩. Claude لازم يسأل قبل
أي حاجة مابترجعش (مسح داتا، migration بيحذف)، بتكلّف فلوس، بتغيّر كلام للعملاء أو الصفحات القانونية، أو مشكلة برّه المطلوب.

## ١٠. أول جلسة (تشيك ليست)
- [ ] ريبو GitHub **خاص** باسم `rachat`، و`.gitignore` موجود (راجعي `git status` قبل أول commit: مفيش `.env`).
- [ ] `CLAUDE.md` و`WORKFLOW.md` و`scripts/deploy-rachat.sh` في الريبو (جاهزين).
- [ ] السيرفر: Docker + clone الريبو في `/opt/rachat` (deploy key) + `.env.production` (من `.env.production.example`).
- [ ] DNS: A records لـ `app` و`api` و`admin` قبل أول تشغيل.
- [ ] Claude ياخد الريبو بالربط (أو توكن fine-grained للريبو ده بس).
- [ ] آخر الجلسة: Revoke لأي توكن اتبعت.
