import { t } from '../i18n';
import { fmtDate } from '../components';
import type { LogEntry } from './store';

export function entryMessage(e?: LogEntry): string {
  if (!e) return t('ask_general');
  const name = e.kind === 'predict' ? e.name : e.maybe.length ? `${t('ask_unknown')}: ${e.maybe.join('/')}` : t('ask_unknown');
  const loc = e.lat != null && e.lng != null ? `${e.lat},${e.lng}` : t('log_gps_none');
  const msg = t('ask_tpl', { date: fmtDate(e.ts), name, conf: e.conf || t('res_conf_low'), loc });
  return e.note ? `${msg} ${t('log_note')}: ${e.note}` : msg;
}

export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
}

export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type });
}

export async function shareText(text: string, thumb?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      const data: ShareData = { text };
      if (thumb) {
        const f = await dataUrlToFile(thumb, 'la-ca-phe.jpg');
        if (navigator.canShare?.({ files: [f] })) data.files = [f];
      }
      await navigator.share(data);
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
