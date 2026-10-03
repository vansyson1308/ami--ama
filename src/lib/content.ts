import advice from '../../content/advice.vi.json';
import prices from '../../content/prices.vi.json';

// The app may ONLY show advice text from content/advice.vi.json (fixed answer library).
export interface Card {
  title: string;
  see: string[];
  why: string[];
  goal: string[];
  do: string[];
  safety: string;
  audio_text: string;
  sources: { name: string; url: string }[];
}

export const ADVICE = advice as unknown as {
  version: string;
  review_status: string;
  global_safety: string;
  cards: Record<string, Card>;
  ui_prompts: Record<string, string>;
};
export const PRICES = prices;

export function card(id: string): Card {
  return ADVICE.cards[id] ?? ADVICE.cards.uncertain;
}
