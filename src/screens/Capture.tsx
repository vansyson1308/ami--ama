import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { analyze, loadSession, type Analysis } from '../ml/model';
import { go, type CaptureMode } from '../App';

export default function Capture({ mode, onAnalysis }: { mode: CaptureMode; onAnalysis: (a: Analysis, photo: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSession().catch(() => undefined); // warm up while the farmer frames the photo
  }, []);

  const pick = (f?: File) => {
    if (!f) return;
    setErr('');
    setFile(f);
    setUrl(URL.createObjectURL(f));
  };

  const run = async () => {
    if (!file || !url) return;
    setBusy(true);
    try {
      onAnalysis(await analyze(file), url);
    } catch (e) {
      console.error(e);
      setErr(t('cap_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen capture">
      <h1 data-testid="capture-title">
        {mode.kind === 'add' ? t('chk_leaf_n', { n: mode.n }) : mode.kind === 'follow' ? t('chk_follow') : t('cap_title')}
      </h1>
      {mode.kind === 'add' && <p className="muted">{t('chk_leaf_hint')}</p>}
      <div className="frame">
        {url ? <img src={url} alt="" /> : <div className="frame-empty">🍃</div>}
        <div className="guide">{t('cap_guide')}</div>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={gal} type="file" accept="image/*" hidden data-testid="file-input" onChange={(e) => pick(e.target.files?.[0])} />
      {!file && (
        <>
          <button className="btn primary big" onClick={() => cam.current?.click()}>
            {t('cap_camera')}
          </button>
          <button className="btn secondary wide" onClick={() => gal.current?.click()}>
            {t('cap_gallery')}
          </button>
        </>
      )}
      {file && (
        <>
          <button className="btn primary big" disabled={busy} onClick={run} data-testid="check">
            {busy ? t('cap_working') : t('cap_check')}
          </button>
          <button className="btn secondary wide" disabled={busy} onClick={() => cam.current?.click()}>
            {t('res_retake')}
          </button>
        </>
      )}
      {err && <p className="error">{err}</p>}
      {mode.kind === 'add' && (
        <button className="btn small" onClick={() => go('samples', 'add')} data-testid="add-from-samples">
          {t('chk_more_samples')}
        </button>
      )}
    </div>
  );
}
