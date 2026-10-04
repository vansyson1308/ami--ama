import advice from '../../content/advice.vi.json';
import prices from '../../content/prices.vi.json';
import questions from '../../content/questions.vi.json';
import type { Question } from '../ml/differential';

// The app may ONLY show advice text from content/advice.vi.json (fixed answer library).
export interface Card {
  title: string;
  see: string[];
  why: string[];
  goal: string[];
  do: string[];
  safety: string;
  audio_text: string;
  sources: { name: string; url?: string }[];
}

export const ADVICE = advice as unknown as {
  version: string;
  review_status: string;
  global_safety: string;
  cards: Record<string, Card>;
  ui_prompts: Record<string, string>;
};
export const PRICES = prices;
// v1.1 tell-apart questions (draft, pending expert review — review_status shown in About/Evidence).
export const QUESTIONS = questions as unknown as { version: string; review_status: string; weights_note: string; questions: Question[] };
// Reference photo per candidate class for the "Phân biệt" panel (bundled test-split samples, see public/samples/CREDITS.md).
export const REF_PHOTO: Record<string, string> = {
  healthy: '/samples/00_healthy.jpg',
  rust: '/samples/02_rust.jpg',
  red_spider_mite: '/samples/04_red_spider_mite.jpg',
  leaf_miner: '/samples/06_leaf_miner.jpg',
  cercospora: '/samples/07_cercospora.jpg',
  phoma: '/samples/08_phoma.jpg',
};

export function card(id: string): Card {
  return ADVICE.cards[id] ?? ADVICE.cards.uncertain;
}
