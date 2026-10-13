/** أنواع `bannedcheck.mjs` — عشان اختبارات السيرفر تستورده و`tsc --noEmit` يعدّي. */
export declare const norm: (s: string) => string;
export declare const MIN_LEN: number;
export declare const INNOCENT: string[];
export declare function parseList(text: string): { words: string[]; problems: string[] };
export declare function falsePositives(
  words: string[],
  samples?: string[],
): { word: string; sentence: string }[];
