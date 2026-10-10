import type { Ctx } from "../context.js";

export interface AppSettings { maintenance: boolean; maintenanceMessage: string; registrationOpen: boolean }
export const DEFAULT_SETTINGS: AppSettings = { maintenance: false, maintenanceMessage: "التطبيق في صيانة قصيرة، هنرجع بعد شوية.", registrationOpen: true };

const cache = new WeakMap<Ctx, { at: number; v: AppSettings }>();
const TTL = 3000;

export async function getSettings(ctx: Ctx): Promise<AppSettings> {
  const hit = cache.get(ctx);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const rows = await ctx.db.appSetting.findMany();
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const v: AppSettings = {
    maintenance: m.get("maintenance") === "true",
    maintenanceMessage: m.get("maintenanceMessage") ?? DEFAULT_SETTINGS.maintenanceMessage,
    registrationOpen: m.has("registrationOpen") ? m.get("registrationOpen") === "true" : DEFAULT_SETTINGS.registrationOpen,
  };
  cache.set(ctx, { at: Date.now(), v });
  return v;
}

export async function saveSettings(ctx: Ctx, patch: Partial<AppSettings>) {
  for (const [k, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    await ctx.db.appSetting.upsert({ where: { key: k }, create: { key: k, value: String(val) }, update: { value: String(val) } });
  }
  cache.delete(ctx);
  return getSettings(ctx);
}
