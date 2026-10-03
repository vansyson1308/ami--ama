import { useState } from 'react';
import { t } from '../i18n';
import { PRICES } from '../lib/content';

const fmt = (n: number) => n.toLocaleString('vi-VN');

export default function Prices() {
  const [offer, setOffer] = useState('');
  const [place, setPlace] = useState(0);
  const snap = new Date(PRICES.snapshot_date + 'T00:00:00+07:00');
  const days = Math.floor((Date.now() - snap.getTime()) / 86400000);
  const ref = PRICES.prices[place].price;
  const o = Number(offer.replace(/[^\d]/g, ''));
  const diff = o - ref;
  return (
    <div className="screen prices">
      <h1>{t('price_title')}</h1>
      <p className="notai">{t('price_not_ai')}</p>
      {days > PRICES.stale_after_days && (
        <p className="warn-box" data-testid="stale">⚠️ {t('price_stale', { days })}</p>
      )}
      <p className="muted">{PRICES.label}</p>
      <table className="ptable">
        <tbody>
          {PRICES.prices.map((p) => (
            <tr key={p.place}>
              <td>{p.place}</td>
              <td className="num">{fmt(p.price)}</td>
            </tr>
          ))}
          <tr>
            <td>{t('price_world')} ({PRICES.world.contract})</td>
            <td className="num">{fmt(PRICES.world.robusta_london_usd_per_ton)} USD/tấn</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        {PRICES.unit} · {t('price_date')}: {snap.toLocaleDateString('vi-VN')} · {t('price_source')}:{' '}
        <a href={PRICES.source.url} target="_blank" rel="noreferrer noopener">{PRICES.source.name}</a>
      </p>
      <label className="field">
        <span>{t('price_offer')}</span>
        <input inputMode="numeric" value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="90.000" data-testid="offer" />
      </label>
      <label className="field">
        <span>{t('price_place')}</span>
        <select value={place} onChange={(e) => setPlace(Number(e.target.value))}>
          {PRICES.prices.map((p, i) => (
            <option key={p.place} value={i}>{p.place}</option>
          ))}
        </select>
      </label>
      {o > 0 && (
        <p className={`diff ${diff < 0 ? 'lower' : 'higher'}`} data-testid="diff">
          {diff === 0
            ? t('price_diff_same')
            : `${diff < 0 ? t('price_diff_lower') : t('price_diff_higher')}: ${fmt(Math.abs(diff))} đ/kg (${((Math.abs(diff) / ref) * 100).toFixed(1)}%)`}
        </p>
      )}
    </div>
  );
}
