import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { analyze, loadSession, type Analysis } from '../ml/model';

interface Sample {
  file: string;
  source: string;
  credit: string;
}

export default function Samples({ onAnalysis }: { onAnalysis: (a: Analysis, photo: string) => void }) {
  const [list, setList] = useState<Sample[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch('/samples/samples.json').then((r) => r.json()).then(setList);
    loadSession().catch(() => undefined);
  }, []);
  const run = async (s: Sample) => {
    setBusy(s.file);
    try {
      const url = `/samples/${s.file}`;
      onAnalysis(await analyze(url), url);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="screen samples">
      <h1>{t('samples_title')}</h1>
      <div className="grid">
        {list.map((s, i) => (
          <button key={s.file} className="sample" onClick={() => run(s)} disabled={!!busy} data-testid={`sample-${i}`}>
            <img src={`/samples/${s.file}`} alt={`${t('samples_title')} ${i + 1}`} />
            {busy === s.file && <span className="spin">{t('cap_working')}</span>}
          </button>
        ))}
      </div>
      <p className="muted small">{t('samples_note')}</p>
    </div>
  );
}
