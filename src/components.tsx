import { useRef, useState } from 'react';
import { t } from './i18n';
import { audioSources, speakFallback } from './lib/audio';
import { ADVICE, type Card } from './lib/content';

export function Listen({ id, text, label }: { id: string; text: string; label?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const play = async () => {
    const a = ref.current;
    if (!a) return speakFallback(text);
    if (!a.paused) {
      a.pause();
      a.currentTime = 0;
      return;
    }
    try {
      await a.play();
    } catch {
      speakFallback(text);
    }
  };
  return (
    <>
      <button className="btn listen" onClick={play} aria-label={label ?? t('listen')}>
        {playing ? '⏸' : (label ?? t('listen'))}
      </button>
      <audio
        ref={ref}
        preload="none"
        data-testid={`audio-${id}`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => speakFallback(text)}
      >
        {audioSources(id).map((s) => (
          <source key={s.src} src={s.src} type={s.type} />
        ))}
      </audio>
    </>
  );
}

const SECTIONS: [keyof Card, 'sec_see' | 'sec_why' | 'sec_goal' | 'sec_do', string][] = [
  ['see', 'sec_see', '👀'],
  ['why', 'sec_why', '❓'],
  ['goal', 'sec_goal', '🎯'],
  ['do', 'sec_do', '✅'],
];

export function AdviceCard({ c }: { c: Card }) {
  return (
    <div className="steps" data-testid="advice-card">
      {SECTIONS.map(([k, label, icon]) =>
        (c[k] as string[]).length ? (
          <section key={k} className={`step step-${k}`}>
            <h3>
              <span className="icon" aria-hidden>
                {icon}
              </span>{' '}
              {t(label)}
            </h3>
            <ul>
              {(c[k] as string[]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {c.safety && <p className="safety">⚠️ {c.safety}</p>}
      <p className="safety global">{ADVICE.global_safety}</p>
      {c.sources.length > 0 && (
        <details className="sources">
          <summary>{t('res_sources')}</summary>
          <ul>
            {c.sources.map((s) => (
              <li key={s.name}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
