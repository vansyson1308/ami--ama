// Case packet image ("phiếu hỏi"): built offline on a canvas, JPEG < 400 KB, for Zalo/SMS/any app.
import { t } from '../i18n';
import { fmtDate } from '../components';
import { QUESTIONS } from './content';
import type { LogEntry } from './store';

const W = 720;
const MAX_BYTES = 400 * 1024;
const ANS = { yes: 'dif_yes', no: 'dif_no', unsure: 'dif_unsure' } as const;

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function resultLine(e: LogEntry): string {
  if (e.kind === 'not_coffee') return t('case_not_coffee');
  if (e.cardId === 'not_disease_nutrition') return `${t('case_nutrition')} (${t('assisted_conf')})`;
  if (e.assisted) return `${e.name} (${t('assisted_conf')})`;
  if (e.kind === 'abstain')
    return e.maybe.length >= 2 ? t('case_maybe', { a: e.maybe[0], b: e.maybe[1] }) : e.maybe.length ? `${t('res_maybe')} ${e.maybe[0]}` : t('ask_unknown');
  return `${e.name} (${e.conf})`;
}

export async function buildCaseImage(e: LogEntry): Promise<Blob> {
  const photos = (e.photos?.length ? e.photos : e.thumb ? [e.thumb] : []).slice(0, 3);
  const qText = Object.fromEntries(QUESTIONS.questions.map((q) => [q.id, q.text]));
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = '22px system-ui, sans-serif';
  // text block first, to size the canvas
  const lines: { text: string; bold?: boolean }[] = [];
  lines.push({ text: `${fmtDate(e.ts)}${e.nLeaves && e.nLeaves > 1 ? ' · ' + t('log_leaves', { n: e.nLeaves }) : ''}` });
  lines.push({ text: `${t('case_result')}: ${resultLine(e)}`, bold: true });
  if (e.answers && Object.keys(e.answers).length) {
    lines.push({ text: t('case_answers'), bold: true });
    for (const [qid, a] of Object.entries(e.answers)) lines.push({ text: `• ${qText[qid] ?? qid} → ${t(ANS[a])}` });
  }
  if (e.lat != null && e.lng != null) lines.push({ text: `${t('case_loc')}: ${e.lat}, ${e.lng}` });
  if (e.note) lines.push({ text: `${t('log_note')}: ${e.note}` });
  const wrapped: { text: string; bold?: boolean }[] = [];
  for (const l of lines) for (const w of wrap(ctx, l.text, W - 48)) wrapped.push({ text: w, bold: l.bold });
  const photoH = photos.length ? 220 : 0;
  const H = 70 + (photoH ? photoH + 20 : 0) + wrapped.length * 32 + 70;
  c.width = W;
  c.height = H;
  ctx.fillStyle = '#faf6ef';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1f5130';
  ctx.fillRect(0, 0, W, 56);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(t('case_title'), 24, 38);
  let y = 70;
  if (photos.length) {
    const size = Math.min(220, (W - 48 - (photos.length - 1) * 12) / photos.length);
    let x = 24;
    for (const src of photos) {
      const img = await loadImg(src);
      if (img) ctx.drawImage(img, x, y, size, size);
      x += size + 12;
    }
    y += photoH + 20;
  }
  ctx.fillStyle = '#1b1b1b';
  for (const l of wrapped) {
    ctx.font = `${l.bold ? 'bold ' : ''}22px system-ui, sans-serif`;
    y += 32;
    ctx.fillText(l.text, 24, y);
  }
  ctx.fillStyle = '#555';
  ctx.font = 'italic 20px system-ui, sans-serif';
  ctx.fillText(t('case_footer'), 24, H - 24);
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', q));
    if (blob && (blob.size <= MAX_BYTES || q === 0.4)) return blob;
  }
  throw new Error('case image');
}
