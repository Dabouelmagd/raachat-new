// فحص الموقع التعريفي القائم بذاته — زي ما نجنكس هيقدّمه بالظبط، بلا أي غلاف.
// بيخرج بـ٢ على أي خلل.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";

const FILE = process.argv[2];
const WIDTHS = [320, 390, 430, 768, 1280];

const browser = await chromium.launch();
const fail = [];
const log = [];

for (const w of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: 900 },
    deviceScaleFactor: 2,
    locale: "ar-EG",
    isMobile: w <= 430,
    hasTouch: w <= 430,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(pathToFileURL(FILE).href);
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const nav = [...document.querySelectorAll(".topnav.t-ar a")];
    const tds = [...document.querySelectorAll("#ar .tablewrap table tbody td")];
    const wrapEl = document.querySelector("#ar .tablewrap");
    return {
      // لو الـviewport meta مش شغّال، ده بيطلع ٩٨٠ على الموبايل
      layoutWidth: de.clientWidth,
      quirks: document.compatMode !== "CSS1Compat",
      charset: document.characterSet,
      // نصّ عربي معروف — لو الترميز غلط مش هيطابق
      arabicOk: (document.querySelector("#ar h1")?.textContent || "").includes("فرعونية"),
      enHidden: document.getElementById("en")?.getBoundingClientRect().height === 0,
      navVisible: nav.filter(vis).length,
      tdsVisible: tds.filter(vis).length,
      tdsClipped: tds.filter((e) => e.scrollWidth > e.clientWidth + 1).length,
      tableDisplay: getComputedStyle(wrapEl.querySelector("table")).display,
      wrapHidden: wrapEl.scrollWidth - wrapEl.clientWidth,
      overflow: Math.max(0, de.scrollWidth - de.clientWidth),
      licence: document.body.textContent.includes("المجلس الأعلى لتنظيم الإعلام"),
      title: document.title,
    };
  });

  if (m.quirks) fail.push(`${w}: الصفحة في quirks mode — doctype ناقص`);
  if (m.layoutWidth !== w) fail.push(`${w}: نافذة التخطيط ${m.layoutWidth} — meta viewport مش شغّال`);
  if (!/^utf-8$/i.test(m.charset)) fail.push(`${w}: الترميز ${m.charset} مش UTF-8`);
  if (!m.arabicOk) fail.push(`${w}: النصّ العربي مش مقروء — مشكلة ترميز`);
  if (!m.enHidden) fail.push(`${w}: القسم الإنجليزي ظاهر مع العربي — [hidden] مش شغّال`);
  if (m.navVisible !== 7) fail.push(`${w}: ${m.navVisible} روابط في البانر مش ٧`);
  if (m.tdsVisible !== 24) fail.push(`${w}: ${m.tdsVisible} خانة ظاهرة في جدول المواضع مش ٢٤`);
  if (m.tdsClipped) fail.push(`${w}: ${m.tdsClipped} خانة مقصوصة في جدول المواضع`);
  if (m.overflow) fail.push(`${w}: زيادة أفقية ${m.overflow}px`);
  if (!m.licence) fail.push(`${w}: سطر الترخيص مش موجود`);
  if (errs.length) fail.push(`${w}: ${errs.length} خطأ جافاسكربت — ${errs[0]}`);
  if (w <= 430) {
    if (m.tableDisplay !== "block") fail.push(`${w}: جدول المواضع لسه جدولًا مش كروت`);
    if (m.wrapHidden) fail.push(`${w}: جدول المواضع بيتمرّر أفقيًا (${m.wrapHidden}px مخفي)`);
  }

  log.push(
    `${String(w).padStart(5)}  تخطيط ${m.layoutWidth}  ${m.quirks ? "quirks" : "standards"}` +
      `  ${m.charset}  روابط ${m.navVisible}/7  خانات ${m.tdsVisible}/24  زيادة ${m.overflow}` +
      `  ${m.tableDisplay}`,
  );
  await ctx.close();
}

await browser.close();
console.log(log.join("\n"));
if (fail.length) {
  console.error("\n❌ " + fail.join("\n❌ "));
  process.exit(2);
}
console.log("\n✅ الموقع القائم بذاته سليم على كل العروض.");
