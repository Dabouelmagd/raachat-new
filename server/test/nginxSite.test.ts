/**
 * **`scripts/add-nginx-site.sh` — متشغّل فعلًا مش متقروء.**
 *
 * الاختبار بيشغّل السكربت نفسه على مجلدات مؤقتة ببدائل لـ`getent`/`nginx`/
 * `systemctl`/`certbot` (الأخير بيسجّل مُعاملاته)، فالحكم على **اللي طلع**:
 * إعداد نجنكس المولَّد ومُعاملات certbot — مش على شكل النصّ.
 *
 * ليه موجود (١٩ أكتوبر ٢٠٢٦): `docs/domain-switch.md` كان بيوعد إن «الدومين
 * القديم يفضل شغّال شهرًا على الأقل»، والقالب فيه `server_name` **واحد** من
 * `__DOMAIN__` — فتشغيل السكربت بالدومين الجديد كان **بيوقّف القديم في نفس
 * اللحظة**. والأهم إن الواجهة المبنية عنوان الـAPI متبنّي جوّاها، والـAPK كمان،
 * فالتحويل الفوري بيكسرهم.
 *
 * 🔴 والفحص الحاسم على `proxy_set_header Host`: Caddy الداخلي بيوجّه **بالاسم**
 * و`DOMAIN` عنده قيمة واحدة، فبلوك الدومين القديم لازم يحوّل الـ Host للاسم
 * الجديد. لو عدّى بـ`$host` (زي البلوك الأساسي)، نجنكس يقبل الطلب وCaddy
 * مايلاقيش الموقع — **الدومين القديم يبان مضبوطًا وهو مكسور**.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NEW = "raachateg.com";
const OLD = "kenoz.org";

type Run = { code: number; out: string; conf: string; certbot: string[] };

type Opts = {
  runningDomain?: string;
  /** رد `curl` على الموقع التعريفي — الافتراضي صفحة سليمة */
  curlCode?: string;
  curlBody?: string;
  /** محتوى موقع نجنكس تاني مزروع في sites-enabled (اختبار تضارب الأسماء) */
  otherSite?: string;
};

/** بيشغّل السكربت فعلًا. `resolve` = الأسماء اللي `getent` بيلاقيها */
function run(env: Record<string, string>, resolve: string[], opts: Opts | string = {}): Run {
  const o: Opts = typeof opts === "string" ? { runningDomain: opts } : opts;
  const { runningDomain, curlCode = "200", curlBody = "<h1>رع شات</h1>", otherSite } = o;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rachat-nginx-"));
  const bin = path.join(dir, "bin");
  const enabled = path.join(dir, "sites-enabled");
  const confd = path.join(dir, "conf.d");
  for (const d of [bin, enabled, confd]) fs.mkdirSync(d);
  const conf = path.join(dir, "rachat");
  const cbLog = path.join(dir, "certbot.args");
  const mainConf = path.join(dir, "nginx.conf");
  fs.writeFileSync(mainConf, "http { }\n");

  const envFile = path.join(dir, "env");
  fs.writeFileSync(
    envFile,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );

  const stub = (name: string, body: string) => {
    const p = path.join(bin, name);
    fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(p, 0o755);
  };
  // getent hosts <name> — بيلاقي الأسماء المطلوبة بس
  stub("getent", `for n in ${resolve.join(" ")}; do [ "$2" = "$n" ] && exit 0; done\nexit 1`);
  stub("nginx", "exit 0");
  stub("systemctl", "exit 0");
  // certbot بيسجّل مُعاملاته سطرًا سطرًا عشان نحكم عليها
  stub("certbot", `for a in "$@"; do echo "$a" >> ${cbLog}; done\nexit 0`);
  // docker بيحكي عن الدومين اللي Caddy الشغّال عليه؛ بلا قيمة = مفيش حاويات
  stub("docker", runningDomain ? `echo ${runningDomain}` : "exit 1");
  // curl الفحص الإيجابي للموقع التعريفي: بيكتب الجسم في -o وبيطبع كود الحالة
  stub(
    "curl",
    `out=""
while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; esac; shift; done
[ -n "$out" ] && printf '%s' ${JSON.stringify(curlBody)} > "$out"
printf '%s' ${JSON.stringify(curlCode)}`,
  );
  if (otherSite) fs.writeFileSync(path.join(enabled, "someone-else"), otherSite);

  const r = spawnSync("bash", [path.join(ROOT, "scripts/add-nginx-site.sh")], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RACHAT_ENV_FILE: envFile,
      RACHAT_NGINX_CONF: conf,
      RACHAT_NGINX_ENABLED: enabled,
      RACHAT_NGINX_CONFD: confd,
      RACHAT_NGINX_MAIN: mainConf,
    },
  });
  return {
    code: r.status ?? -1,
    out: (r.stdout || "") + (r.stderr || ""),
    conf: fs.existsSync(conf) ? fs.readFileSync(conf, "utf8") : "",
    certbot: fs.existsSync(cbLog) ? fs.readFileSync(cbLog, "utf8").trim().split("\n") : [],
  };
}

/** بلوكات `server { … }` المولَّدة، كل واحد بأسمائه وقيمة الـ Host اللي بيبعتها */
function blocks(conf: string) {
  return conf
    .split(/^server \{$/m)
    .slice(1)
    .map((b) => {
      const body = b.slice(0, b.indexOf("\n}"));
      const names = /server_name ([^;]+);/.exec(body)?.[1].trim().split(/\s+/) ?? [];
      const host = /proxy_set_header Host ([^;]+);/.exec(body)?.[1].trim() ?? "";
      return { names, host, body };
    });
}

const allNames = (d: string) => ["app", "api", "admin"].map((h) => `${h}.${d}`);

describe("add-nginx-site.sh", () => {
  it("بلا OLD_DOMAIN: الدومين الجديد وحده، وشهادة لتلات أسماء بس", () => {
    const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, allNames(NEW));
    expect(r.out).toContain("✅");
    expect(r.code).toBe(0);
    const bs = blocks(r.conf);
    expect(bs).toHaveLength(1);
    expect(bs[0].names).toEqual(allNames(NEW));
    // البلوك الأساسي بيعدّي الاسم زي ما هو — ده الصح لأنه نفس DOMAIN بتاع Caddy
    expect(bs[0].host).toBe("$host");
    expect(r.conf).not.toContain(OLD);
    const d = r.certbot.filter((a) => a === "-d").length;
    expect(d).toBe(3);
    // `--expand` بقى دايمًا (٢٠ أكتوبر ٢٠٢٦). كان مشروطًا بـOLD_DOMAIN، والشرط
    // ده ضيّق: أي إضافة اسم لشهادة قايمة بتفشل في الوضع غير التفاعلي من غيره،
    // وإضافة الدومين المجرّد للموقع التعريفي هي بالظبط الحالة دي. وهو بلا أثر
    // لو مفيش شهادة أصلًا.
    expect(r.certbot).toContain("--expand");
    expect(r.certbot).toContain(`app.${NEW}`);
  });

  it("مع OLD_DOMAIN: الدومينان في نجنكس، والشهادة لستة أسماء بـ--expand", () => {
    const r = run(
      { DOMAIN: NEW, OLD_DOMAIN: OLD, LETSENCRYPT_EMAIL: "a@b.com" },
      [...allNames(NEW), ...allNames(OLD)],
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain(`https://app.${OLD}`);
    const bs = blocks(r.conf);
    expect(bs).toHaveLength(4);
    expect(bs[0].names).toEqual(allNames(NEW));
    // كل اسم قديم له بلوك
    expect(bs.slice(1).flatMap((b) => b.names).sort()).toEqual(allNames(OLD).sort());
    const d = r.certbot.filter((a) => a === "-d").length;
    expect(d).toBe(6);
    expect(r.certbot).toContain("--expand");
    for (const n of [...allNames(NEW), ...allNames(OLD)]) expect(r.certbot).toContain(n);
  });

  it("🔴 كل بلوك للدومين القديم بيحوّل الـ Host لنفس خدمته على الدومين الجديد", () => {
    const r = run(
      { DOMAIN: NEW, OLD_DOMAIN: OLD, LETSENCRYPT_EMAIL: "a@b.com" },
      [...allNames(NEW), ...allNames(OLD)],
    );
    for (const b of blocks(r.conf).slice(1)) {
      expect(b.names).toHaveLength(1);
      const sub = b.names[0].split(".")[0];
      // لو عدّى بـ$host، Caddy مايلاقيش الموقع والدومين القديم يبقى مكسورًا في سكوت
      expect(b.host, `بلوك ${b.names[0]} لازم يحوّل الـ Host`).toBe(`${sub}.${NEW}`);
    }
  });

  it("مفيش placeholder فاضل في الإعداد المولَّد", () => {
    const r = run(
      { DOMAIN: NEW, OLD_DOMAIN: OLD, LETSENCRYPT_EMAIL: "a@b.com" },
      [...allNames(NEW), ...allNames(OLD)],
    );
    expect(r.conf).not.toContain("__DOMAIN__");
    expect(r.conf).not.toContain("__OLD_DOMAIN__");
  });

  it("اسم قديم مالوش DNS: بيوقف ويسمّيه قبل أي certbot", () => {
    const r = run({ DOMAIN: NEW, OLD_DOMAIN: OLD, LETSENCRYPT_EMAIL: "a@b.com" }, [
      ...allNames(NEW),
      `app.${OLD}`,
    ]);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(`api.${OLD}`);
    expect(r.certbot).toEqual([]);
  });

  it("OLD_DOMAIN نفس DOMAIN: مرفوض", () => {
    const r = run({ DOMAIN: NEW, OLD_DOMAIN: NEW }, allNames(NEW));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("OLD_DOMAIN");
    expect(r.certbot).toEqual([]);
  });

  it("🔴 Caddy الشغّال لسه على الدومين القديم: بيحذّر إن النشرة الأول", () => {
    const r = run(
      { DOMAIN: NEW, OLD_DOMAIN: OLD, LETSENCRYPT_EMAIL: "a@b.com" },
      [...allNames(NEW), ...allNames(OLD)],
      OLD,
    );
    expect(r.code).toBe(0);
    expect(r.out).toContain("deploy-rachat.sh");
    expect(r.out).toContain(OLD);
  });

  it("Caddy الشغّال على نفس الدومين: مفيش تحذير", () => {
    const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, allNames(NEW), NEW);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("deploy-rachat.sh");
  });

  it("DOMAIN فاضي: مرفوض قبل أي حاجة", () => {
    const r = run({ DOMAIN: "" }, allNames(NEW));
    expect(r.code).not.toBe(0);
    expect(r.certbot).toEqual([]);
  });

  /**
   * الموقع التعريفي على الدومين المجرّد.
   *
   * 🔴 الفرضية اللي الاختبارات دي بتحرسها: الموقع **ملفات ثابتة** ومايمرّش على
   * Caddy. لو بلوكه خرج فيه `proxy_pass`، الطلب يروح لـCaddy الداخلي — وCaddy
   * بيوجّه بالاسم ومايعرفش الدومين المجرّد، فالزائر ياخد صفحة التطبيق أو خطأ.
   */
  describe("الموقع التعريفي (الدومين المجرّد)", () => {
    const apex = (d: string) => [...allNames(d), d];

    it("الدومين المجرّد وwww بيتحلّوا: بلوك ثابت باسمين، وفي الشهادة", () => {
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, [...apex(NEW), `www.${NEW}`]);
      expect(r.code).toBe(0);
      const site = blocks(r.conf).find((b) => b.names.includes(NEW));
      expect(site, "مفيش بلوك للدومين المجرّد").toBeTruthy();
      expect(site!.names).toEqual([NEW, `www.${NEW}`]);
      // 🔴 ثابت مش بروكسي — ده كل الفرق بينه وبين التطبيق
      expect(site!.body).not.toContain("proxy_pass");
      expect(site!.body).toContain("root ");
      expect(site!.body).toContain("charset utf-8");
      expect(r.certbot).toContain("-d");
      expect(r.certbot).toContain(NEW);
      expect(r.certbot).toContain(`www.${NEW}`);
      expect(r.out).toContain("الموقع التعريفي");
    });

    it("www مالوش DNS: الموقع على الدومين المجرّد وحده، وبيقول كده", () => {
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, apex(NEW));
      expect(r.code).toBe(0);
      const site = blocks(r.conf).find((b) => b.names.includes(NEW));
      expect(site!.names).toEqual([NEW]);
      expect(r.certbot).not.toContain(`www.${NEW}`);
      expect(r.out).toContain(`www.${NEW}`);
    });

    it("الدومين المجرّد مالوش DNS: الموقع مابيتضافش، وباقي المواقع زي ما هي", () => {
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, allNames(NEW));
      expect(r.code).toBe(0);
      expect(blocks(r.conf).find((b) => b.names.includes(NEW))).toBeUndefined();
      expect(blocks(r.conf)[0].names).toEqual(allNames(NEW));
      expect(r.certbot).not.toContain(NEW);
    });

    it("🔴 نجنكس مش قادر يقرا المجلد (403): السكربت بيفشل ويسمّي السبب", () => {
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, apex(NEW), {
        curlCode: "403",
      });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("403");
      expect(r.out).toContain("صلاحيات");
    });

    it("🔴 ٢٠٠ بصفحة مش بتاعتنا: مرفوض", () => {
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, apex(NEW), {
        curlBody: "<h1>Welcome to nginx</h1>",
      });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("مش بتاعتنا");
    });

    it("🔴 الاسم محجوز في موقع مشروع تاني: وقوف بلا أي تعديل", () => {
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, apex(NEW), {
        otherSite: `server {\n  server_name ${NEW};\n  root /var/www/other;\n}\n`,
      });
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("محجوز");
      expect(r.certbot).toEqual([]);
    });

    it("🔴 `--expand` دايمًا — مش بس مع OLD_DOMAIN", () => {
      // كان مشروطًا بـOLD_DOMAIN، فإضافة الدومين المجرّد لشهادة قايمة كانت
      // هتفشل في الوضع غير التفاعلي
      const r = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, apex(NEW));
      expect(r.certbot).toContain("--expand");
      const r2 = run({ DOMAIN: NEW, LETSENCRYPT_EMAIL: "a@b.com" }, allNames(NEW));
      expect(r2.certbot).toContain("--expand");
    });
  });
});
