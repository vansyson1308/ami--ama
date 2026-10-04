import { createStore, del, get, set, clear } from 'idb-keyval';

// Everything stays in this browser's IndexedDB. No network, no analytics.
const db = createStore('ami-ama', 'kv');

export interface Contact {
  name: string;
  phone: string;
}

export interface Settings {
  onboarded: boolean;
  savePhotos: boolean;
  useGps: boolean;
  officerPhone: string; // v1.0 field; migrated into contacts[0]
  contacts: Contact[]; // v1.1: up to 2 helper contacts (HTX, cán bộ khuyến nông, đại lý…)
}

export interface LogEntry {
  id: string;
  ts: number;
  kind: 'predict' | 'abstain' | 'not_coffee';
  cardId: string;
  name: string; // vi_name of the top class, or '' when uncertain
  maybe: string[]; // vi_names of top-2 when abstaining
  conf: string; // confidence words shown to the user
  top: { key: string; p: number }[];
  thumb?: string;
  lat?: number;
  lng?: number;
  note: string;
  shared: boolean;
  model: string;
  // v1.1 (all optional — v1.0 entries load unchanged)
  photos?: string[]; // thumbnails of the leaves of this check (only with photo consent)
  nLeaves?: number;
  reason?: 'quality' | 'not_coffee' | 'ambiguous' | 'unknown';
  answers?: Record<string, 'yes' | 'no' | 'unsure'>;
  posterior?: Record<string, number>;
  assisted?: boolean;
  followUpAt?: number;
  parentId?: string;
  pending?: boolean;
  expertLabel?: string;
  expertNote?: string;
}

const DEFAULTS: Settings = { onboarded: false, savePhotos: false, useGps: false, officerPhone: '', contacts: [] };

export async function getSettings(): Promise<Settings> {
  const s = { ...DEFAULTS, ...((await get<Partial<Settings>>('settings', db)) ?? {}) };
  // migrate v1.0 officerPhone -> contacts[0]
  if (!s.contacts?.length && s.officerPhone) s.contacts = [{ name: 'Cán bộ khuyến nông', phone: s.officerPhone }];
  return s;
}

export async function saveSettings(s: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...s };
  await set('settings', next, db);
  return next;
}

export async function getLog(): Promise<LogEntry[]> {
  return (await get<LogEntry[]>('log', db)) ?? [];
}

async function putLog(log: LogEntry[]) {
  await set('log', log, db);
}

export async function addEntry(e: LogEntry) {
  await putLog([e, ...(await getLog())]);
}

export async function getEntry(id: string): Promise<LogEntry | undefined> {
  return (await getLog()).find((e) => e.id === id);
}

export async function updateEntry(id: string, patch: Partial<LogEntry>) {
  await putLog((await getLog()).map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export async function deleteEntry(id: string) {
  await putLog((await getLog()).filter((e) => e.id !== id));
}

export async function deleteLog() {
  await del('log', db);
}

export async function deleteAll() {
  await clear(db);
}
