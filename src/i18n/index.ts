import vi from './vi.json';
import bdq from './bdq.json';

// Language packs: same keys as vi.json. Empty values fall back to Vietnamese.
// bdq (Bahnar) is a stub with empty values until a native speaker translates it — see docs/LANGUAGE.md.
export type StrKey = keyof typeof vi;
const packs: Record<string, Partial<Record<StrKey, string>>> = { vi, bdq };
let lang = 'vi';

export function setLang(l: string) {
  if (packs[l]) lang = l;
}

export function t(key: StrKey, vars?: Record<string, string | number>): string {
  let s = packs[lang]?.[key] || vi[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
