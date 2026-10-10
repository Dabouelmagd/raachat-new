import { API_ON, api } from "../api/client";
import type { Message } from "../types";
import { buildIndex, composeAnswer, runSearch, type Hit, type Interpretation, type Kind, type SearchContext } from "./engine";

/**
 * نقطة الربط مع الباك إند: بدّلي جسم aiSearch بنداء POST /search/ai (راجع openapi.yaml).
 * الباك إند الحقيقي هيعمل: embeddings (pgvector) + BM25 + re-rank بنموذج لغوي، ويرجّع نفس الشكل ده.
 * النسخة دي محلية بالكامل للديمو (من غير أي نموذج لغوي حقيقي).
 */
export interface SearchResponse {
  interpretation: Interpretation;
  answer: string | null; // بس في البحث العميق
  results: Hit[];
  tookMs: number;
}

export async function aiSearch(
  query: string,
  ctx: SearchContext,
  opts: { deep: boolean; kinds?: Kind[] }
): Promise<SearchResponse> {
  const t0 = performance.now();
  // مع الباك إند: رسائل أقدم من اللي اتحمّل في التطبيق بتتجاب من بحث السيرفر وتتدمج في الفهرس المحلي
  if (API_ON && query.trim().length >= 2) {
    try {
      const r = await api<{ messages: { id: string; threadId: string; authorName: string; text: string; at: string }[] }>(`/search?q=${encodeURIComponent(query.trim())}&kinds=message&limit=40`);
      const have = new Set(ctx.messages.map((m) => m.id));
      const extra: Message[] = r.messages.filter((m) => !have.has(m.id)).map((m) => ({
        id: m.id, threadId: m.threadId, authorId: "srv", authorName: m.authorName, text: m.text, reactions: {},
        time: new Date(m.at).toLocaleDateString(),
      }));
      if (extra.length) ctx = { ...ctx, messages: [...ctx.messages, ...extra] };
    } catch { /* نكمّل بالبحث المحلي */ }
  }
  const docs = buildIndex(ctx);
  const { hits, interp } = runSearch(docs, ctx, query, opts);
  return {
    interpretation: interp,
    answer: opts.deep ? composeAnswer(query, hits, interp) : null,
    results: hits,
    tookMs: Math.round(performance.now() - t0),
  };
}
