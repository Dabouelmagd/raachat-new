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

/** بيشغّل السكربت فعلًا. `resolve` = الأسماء اللي `getent` بيلاقيها */
function run(env: Record<string, string>, resolve: string[], runningDomain?: string): Run {
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
    expect(r.certbot).not.toContain("--expand");
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
});
