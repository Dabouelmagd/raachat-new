# دليل الاسترجاع — رع شات

> ده الملف اللي بيتقرا **وقت الكارثة**، فمكتوب عشان يتنفّذ خطوة خطوة وإنتي قلقانة
> ومش فاضية تفكري. كل أمر بيتشغّل على السيرفر من `/opt/rachat` إلا لو مكتوب غير كده.
>
> **قبل أي حاجة:** النسخ موجودة في volume `backups` جوه السيرفر، وبتتأكد بـ
> `bash scripts/verify-backup.sh`. ولو السيرفر نفسه ضايع، شوفي الحالة (ب).
>
> آخر تحديث: ١٢ أكتوبر ٢٠٢٦ · **ما اتجرّبش على سيرفر حقيقي** (الخطوات مبنية على
> ملفات المشروع وDEPLOY.md؛ أول تنفيذ فعلي هو اللي يثبّتها).

---

## ٠. أول حاجة: اعرفي إنتي في أنهي حالة

| الأعراض | الحالة | الصفحة |
|---|---|---|
| السيرفر شغّال، لكن داتا ضايعة أو غلط (مسح بالغلط · migration بايظ) | **(أ)** استرجاع في المكان | تحت |
| السيرفر مش موجود / مش بيرد خالص / Hetzner ضيّعته | **(ب)** سيرفر جديد من الصفر | تحت |
| التطبيق واقع بس الداتا سليمة | **مش استرجاع** — شوفي `docker compose logs api` و`bash scripts/monitor.sh` | — |

**متعملي استرجاع وإنتي مش متأكدة.** الاسترجاع بيمسح الموجود. لو مش متأكدة، خدي نسخة
من الحالة الحالية الأول:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backup \
  sh -c 'pg_dump -h db -U rachat -Fc rachat > /backups/before-restore.dump'
```

---

## ١. اللي النسخة الاحتياطية **مش** فيها (اقرا ده قبل الحالة ب)

النسخ فيها **قاعدة البيانات والملفات المرفوعة بس**. مش فيها:

- **`.env.production`** — متجاهل في git عن قصد (فيه أسرار). لو ضاع:
  - `JWT_SECRET` جديد = **كل المستخدمين بيتسجّل خروجهم** ولازم يدخلوا بكود جديد. (الداتا سليمة، بس الجلسات لأ.)
  - لازم تعيدي إدخال مفتاح **Resend** (كود التحقق بالإيميل) بـ `bash scripts/set-otp-keys.sh`.
  - لازم تعيدي توليد **VAPID** لو كان متضبط — وده **بيلغي كل اشتراكات الإشعارات** الموجودة.
  - 🔴 **`EVIDENCE_KEY` حالة خاصة — مفتاح جديد = كل دليل محفوظ في سجل بلاغات إيذاء
    الأطفال مستحيل يتفتح تاني.** والنسخة المستعادة فيها صفوف `Evidence` مشفّرة
    بالمفتاح القديم، فلازم **نفس** المفتاح من مدير كلمات السر (محفوظ هناك باسم
    «رع شات — EVIDENCE_KEY» من ٢٢ أكتوبر ٢٠٢٦). ومن غيره الأدلة ضايعة وهي قدامك
    في القاعدة. حطّيه بالإيد في `.env.production` — **و`set-evidence-key.sh`
    مابيكتبش فوق مفتاح موجود**، فالترتيب: المفتاح الأول وبعدين السكربت للفحص.
  - `POSTGRES_PASSWORD` جديد مفيهوش مشكلة (القاعدة بتتعمل من جديد بالكلمة الجديدة).
- **شهادات Let's Encrypt** — بتتولّد من جديد بـ certbot (مفيش مشكلة، بس محتاجة الـ DNS يكون شاور على السيرفر الجديد).
- **إعدادات نجنكس** — بتتولّد بـ `bash scripts/add-nginx-site.sh`.

> **الأحوط:** احفظي نسخة من `.env.production` في مدير كلمات السر بتاعك (مش في git ومش
> على نفس السيرفر). سطر واحد بيوفّر عليك تسجيل خروج كل المستخدمين.

---

## (أ) السيرفر شغّال والداتا محتاجة استرجاع

### أ-١. شوفي النسخ المتاحة واختاري واحدة

```bash
bash scripts/verify-backup.sh
```

بيوريك كل النسخ بأحجامها وأعمارها، **وبيجرّب يرجّع أحدثها فعلًا** في قاعدة مؤقتة
ويقولك عدد الصفوف — فإنتي عارفة إنها بترجع قبل ما تلمسي الإنتاج.

### أ-٢. وقّفي الـ API (عشان مايكتبش جوه الاسترجاع)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production stop api
```

### أ-٣. رجّعي قاعدة البيانات

حدّدي اسم النسخة من الخطوة أ-١ وحطّيه مكان `db-XXXXXXXX-XXXXXX.dump`:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T backup \
  sh -c 'pg_restore -h db -U rachat -d rachat --clean --if-exists --no-owner /backups/db-XXXXXXXX-XXXXXX.dump'
```

`--clean --if-exists` بيمسح الجداول الموجودة الأول. تحذيرات عن أدوار (roles) عادية.

### أ-٤. رجّعي الملفات المرفوعة (لو محتاجة)

أسماء الـ volumes الحقيقية الأول — **متخمنيهاش**:

```bash
docker volume ls | grep -i rachat
```

وبعدين (حطّي الأسماء اللي ظهرت مكان `rachat_uploads` و`rachat_backups`، واسم الأرشيف
من أ-١):

```bash
docker run --rm -v rachat_uploads:/u -v rachat_backups:/b alpine \
  sh -c 'rm -rf /u/* && tar -xzf /b/uploads-XXXXXXXX-XXXXXX.tgz -C /u'
```

### أ-٥. شغّلي الـ API واتأكدي

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production start api
```

```bash
bash scripts/monitor.sh
```

لازم تشوفي ١٢ سطر ✅، ومنهم `db: بترد — N مستخدم` بعدد منطقي. وبعدين افتحي التطبيق
وسجّلي دخول بحسابك.

---

## (ب) سيرفر جديد من الصفر

**محتاجة في إيدك:** أحدث `db-*.dump` و`uploads-*.tgz`، وبيانات DNS للدومين.

النسخ خارج السيرفر على **جوجل درايف** في `rachat-drive:raachat-backups` من ٢١
أكتوبر ٢٠٢٦ — بامتداد `.gpg` **ومشفّرة**، فمحتاجة كمان:
- **`BACKUP_KEY`** من مدير كلمات السر. 🔴 **من غيره النسخ بلا قيمة خالص** — مفيش
  نسخة تانية منه في أي مكان، ومش جوه النسخ نفسها.
- **توكن rclone** لحساب درايف (لو السيرفر القديم ضاع، الربط يتعاد من الصفر:
  `docs/backup-offsite.md` القسم ٢).
- **`EVIDENCE_KEY`** من مدير كلمات السر لو فيه أدلة بلاغات محفوظة — شوفي البند
  فوق: مفتاح جديد بيخلّيها مستحيل تتفتح.

التنزيل والفكّ: `docs/backup-offsite.md` قسم «الاسترجاع من درايف». ولو مش عندك
النسخة ولا المفتاح، البند ده هو سبب ضياع الداتا.

1. **جهّزي السيرفر وDocker ونجنكس** — خطوات `DEPLOY.md` قسم ٢ (Docker + جدار ناري:
   SSH وHTTP/HTTPS بس، **مفيش 5432 ولا 4000 أبدًا**).
2. **نزّلي المشروع:**
   ```bash
   git clone https://github.com/Dabouelmagd/raachat-new /opt/rachat && cd /opt/rachat
   ```
3. **جهّزي الأسرار:**
   ```bash
   bash scripts/setup-env.sh
   ```
   ولو عندك نسخة محفوظة من `.env.production` القديم، حطّيها بدل ما تولّدي جديد —
   كده الجلسات والاشتراكات تفضل شغالة (شوف القسم ١).
4. **وجّهي الـ DNS** للسيرفر الجديد (`app` و`api` و`admin`) واستنّي ينتشر، وبعدين:
   ```bash
   bash scripts/add-nginx-site.sh
   ```
5. **شغّلي الخدمات** (القاعدة بتتعمل فاضية والـ migrations بتتطبق):
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```
6. **حطّي ملفات النسخة جوه volume النسخ** (من جهازك):
   ```bash
   scp db-XXXXXXXX-XXXXXX.dump uploads-XXXXXXXX-XXXXXX.tgz root@SERVER:/tmp/
   ```
   وعلى السيرفر:
   ```bash
   docker cp /tmp/db-XXXXXXXX-XXXXXX.dump rachat-backup-1:/backups/
   ```
   ```bash
   docker cp /tmp/uploads-XXXXXXXX-XXXXXX.tgz rachat-backup-1:/backups/
   ```
7. **ارجعي للحالة (أ)** من خطوة أ-٢ لحد أ-٥.
8. **مفاتيح الخدمات:** `bash scripts/set-otp-keys.sh` (Resend)، و`bash scripts/set-vapid.sh`
   لو هتفعّلي الإشعارات (بيلغي الاشتراكات القديمة).
9. **المراقبة:** `bash scripts/install-monitor-cron.sh`.

---

## ٢. بعد أي استرجاع

- [ ] `bash scripts/monitor.sh` — ١٢ سطر ✅
- [ ] دخول فعلي على `app.raachateg.com` بحساب حقيقي
- [ ] اللوحة على `admin.raachateg.com` بتفتح وبتوري أرقام
- [ ] ولو `OLD_DOMAIN` لسه متضبط: `app.kenoz.org` و`api.kenoz.org/health` كمان —
      **الـAPK المثبَّت على التليفونات بيكلّم القديم**، فالاسم ده لوحده هو اللي
      بيثبت إن التطبيق على الأجهزة رجع. والفحص **على كل اسم لوحده** لأن بلوكات
      الدومين القديم تلاتة منفصلة في نجنكس، فنجاح `app` مابيثبتش `api`.
- [ ] `bash scripts/verify-backup.sh` — عشان نتأكد إن النسخ الجديدة بتتولّد صح على الجديد
- [ ] اكتبي في `CLAUDE.md` إيه اللي حصل وإيه اللي اتفقد (لو فيه) — الجلسة الجاية محتاجة تعرف

## ٣. الحسابات التجريبية

لو الاسترجاع من نسخة فيها بيانات تجريبية ومش عايزاها في الإنتاج:

```bash
REMOVE=1 bash scripts/seed-demo.sh
```
