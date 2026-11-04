# رع شات — لفّة الموبايل (Capacitor)

المشروعان (`android/` و`ios/`) **مولَّدان ومحفوظان في git**، وأذوناتهما وأسماء
حزمتهما مضبوطة. فمفيش «طبّق الملف ده بإيدك» — كان فيه ملفّا لصق يدوي
(`android-manifest-snippet.xml` و`ios-infoplist-snippet.xml`) واتشالوا عن قصد:
ملف المفروض حد ينقله بإيده **بيتنسى في سكوت**، والمشروع بيتبني من غيره ومفيش
حاجة تقول إنه ما اتطبّقش. القيم في ملفاتها الحقيقية ومحميّة باختبارات
(`server/test/androidBuild.test.ts` و`server/test/iosBuild.test.ts`).

## أندرويد — للمتجر

البناء على **GitHub** مش من هنا (`dl.google.com` و`maven.google.com` محجوبان في
بيئة Claude). الوظيفة `.github/workflows/android.yml`:

- **APK للتجربة** على جهاز: بتتبني على كل push بيخصّ التطبيق، وبتنزل من
  Releases (`apk-latest` → `raachat.apk`). موقَّعة بمفتاح تصحيح — **مش للمتجر**.
- **AAB لبلاي**: شغّلي الوظيفة يدويًا و`aab = true` → artifact `raachat-aab`.
  محتاجة ٤ أسرار في GitHub Secrets: `ANDROID_KEYSTORE_B64` ·
  `ANDROID_KEYSTORE_PASSWORD` · `ANDROID_KEY_ALIAS` · `ANDROID_KEY_PASSWORD`.
  التفاصيل وخطوات توليد المفتاح في `docs/mobile-stores.md`.

`targetSdk`/`compileSdk` = **36** (مطلوب من بلاي)، وAGP 8.9.2.

## iOS — للمتجر

البناء **لازم Mac + Xcode** (مفيش طريق تاني: `xcodebuild` و`pod` مش موجودين
هنا). الخطوات في `docs/mobile-stores.md`. باختصار على الماك:

```bash
cd mobile && npm ci
cd .. && VITE_API_URL=https://api.raachateg.com \
  VITE_SITE_URL=https://app.raachateg.com \
  VITE_PUBLIC_SITE=https://raachateg.com npx vite build
cd mobile && npx cap sync ios
cd ios/App && pod install
npm run open:ios   # → Product > Archive
```

### 🔴 أصل التطبيق على iOS `capacitor://localhost`

مش `https://localhost` زي أندرويد، و**`iosScheme: "https"` مابيشتغلش**: Capacitor
بيرفضها في سكوت ويرجع للافتراضي (`WKWebView.handlesURLScheme("https")` بترجّع
true فالشرط بيفشل — في `CAPInstanceDescriptor.swift`). فالأصل لازم يتضاف لـ
`CORS_EXTRA` في `.env.production`، وإلا التطبيق يفتح ويبان شغّالًا و**مفيش ولا
رسالة تتحمّل ومفيش ولا خطأ**.

## الإشعارات

Web Push مابيشتغلش جوه WKWebView على iOS (ولا في الـAPK على أندرويد). المطلوب
إشعارات أصلية: `@capacitor/push-notifications` + FCM (أندرويد) + APNs (iOS)،
والسيرفر يبعت عبر FCM HTTP v1. حاليًا بيبعت Web Push بس
(`server/src/lib/push.ts`) — محتاج جدول `DeviceToken` ومرسل FCM. لسه ما اتعملش.
