import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Heart,
  RadioTower,
  Check,
  Play,
  Crosshair,
  X,
} from 'lucide-react';
import type { Language, Station } from './types';
import type { RadioEngine } from './audio';
export type T = (en: string, es: string) => string;
export function Brand() {
  return (
    <span className="brand">
      <svg viewBox="0 0 43 39" width="39" height="35" fill="none" aria-hidden="true">
        <g fill="currentColor" transform="skewX(-14)">
          <path d="M7 16h5v10H7zM15 9h5v24h-5zM23 3h5v31h-5zM31 11h5v17h-5zM39 15h4v9h-4z" />
        </g>
      </svg>
      <b>
        LEONIDA <em>FM</em>
      </b>
    </span>
  );
}
export function IconButton({
  label,
  children,
  active = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`icon-btn ${active ? 'on' : ''} ${props.className || ''}`}
    >
      {children}
    </button>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}
export const stationStyle = (s: Station) => ({ '--station': s.color }) as CSSProperties;
export function Wordmark({ station: s }: { station: Station }) {
  const content: Record<string, ReactNode> = {
    'flash-fm': (
      <>
        FLASH <small>FM</small>
      </>
    ),
    'cocoteo-fm': (
      <>
        Cocoteo <small>FM</small>
      </>
    ),
    'back-country': (
      <>
        BACK COUNTRY <small>RADIO</small>
      </>
    ),
    'the-chamber': (
      <>
        THE CHAMBER <small>106.6</small>
      </>
    ),
    'dirty-south': (
      <>
        DIRTY SOUTH <small>CLASSICS</small>
      </>
    ),
    'afro-bank': (
      <>
        AFRO BANK <small>FM</small>
      </>
    ),
  };
  return (
    <span aria-hidden="true" className={`sleeve-mark mark-${s.slug}`}>
      {content[s.slug] || s.shortName}
    </span>
  );
}
export function StationCard({
  s,
  index,
  selected,
  tune,
  t,
  lang,
  favorite,
  onFavorite,
  detail,
}: {
  s: Station;
  index: number;
  selected: boolean;
  tune: () => void;
  t: T;
  lang: Language;
  favorite: boolean;
  onFavorite: () => void;
  detail?: () => void;
}) {
  return (
    <article className={`station-card ${selected ? 'selected' : ''}`} style={stationStyle(s)}>
      <button
        type="button"
        className="card-tune"
        data-testid={`tune-${s.slug}`}
        aria-pressed={selected}
        onClick={tune}
      >
        <span className="sr">{t('Tune to', 'Sintonizar')}</span>
        <span className="card-art">
          <img src={s.art} alt="" width="416" height="416" loading="lazy" />
          <span className="card-film" />
          <span className="ch-number">CH {String(index + 1).padStart(2, '0')}</span>
          <Wordmark station={s} />
        </span>
        <span className="card-caption">
          <strong>{s.name}</strong>
          <span>{lang === 'en' ? s.genre : s.genreEs}</span>
        </span>
      </button>
      <button
        className={`card-heart ${favorite ? 'saved' : ''}`}
        aria-label={`${favorite ? t('Remove favorite', 'Quitar favorito') : t('Save favorite', 'Guardar favorito')} · ${s.name}`}
        aria-pressed={favorite}
        onClick={onFavorite}
      >
        <Heart size={15} fill={favorite ? 'currentColor' : 'none'} />
      </button>
      {selected && (
        <span className="tune-marker" aria-hidden="true">
          <AudioLines size={15} />
        </span>
      )}
      {detail && (
        <button className="card-detail" onClick={detail}>
          {t('Station profile', 'Ficha de emisora')}
        </button>
      )}
    </article>
  );
}
export function StationDial({
  stations,
  selected,
  t,
  lang,
  tune,
  step,
  favorites,
  toggleFav,
  onWheel,
  onExplorer,
}: {
  stations: Station[];
  selected: Station;
  t: T;
  lang: Language;
  tune: (s: Station) => void;
  step: (n: number) => void;
  favorites: string[];
  toggleFav: (s: string) => void;
  onWheel: () => void;
  onExplorer: () => void;
}) {
  const strip = useRef<HTMLDivElement>(null),
    touch = useRef<{ x: number; y: number } | null>(null),
    suppress = useRef(false);
  useEffect(() => {
    const parent = strip.current;
    const node = parent?.querySelector<HTMLElement>('.selected');
    if (!parent || !node || parent.scrollWidth <= parent.clientWidth) return;
    const target =
      node.offsetLeft - parent.offsetLeft - (parent.clientWidth - node.clientWidth) / 2;
    parent.scrollTo({ left: target, behavior: 'instant' });
  }, [selected.slug]);
  return (
    <section className="dial-section" aria-labelledby="dial-title">
      <div className="section-row">
        <div className="section-heading">
          <span className="section-icon">
            <RadioTower size={22} />
          </span>
          <h2 id="dial-title">{t('Station dial', 'Dial de emisoras')}</h2>
          <span className="count">{String(stations.length).padStart(2, '0')}</span>
        </div>
        <div className="dial-tools">
          <button className="text-button" onClick={onWheel}>
            <Crosshair size={15} />
            {t('Radio wheel', 'Rueda de radio')}
          </button>
          <span className="tool-rule" />
          <IconButton label={t('Previous station', 'Emisora anterior')} onClick={() => step(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <IconButton label={t('Next station', 'Siguiente emisora')} onClick={() => step(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <div
        className="dial-strip"
        data-testid="dial-swipe"
        ref={strip}
        onTouchStart={(e) => {
          const p = e.touches[0];
          touch.current = { x: p.clientX, y: p.clientY };
          suppress.current = false;
        }}
        onTouchEnd={(e) => {
          const p = e.changedTouches[0],
            a = touch.current;
          touch.current = null;
          if (!a) return;
          const x = p.clientX - a.x,
            y = p.clientY - a.y;
          if (Math.abs(x) > 38 && Math.abs(x) > Math.abs(y) * 1.4) {
            suppress.current = true;
            step(x < 0 ? 1 : -1);
            window.setTimeout(() => {
              suppress.current = false;
            }, 350);
          }
        }}
        onClickCapture={(e) => {
          if (suppress.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {stations.map((s, i) => (
          <StationCard
            key={s.slug}
            s={s}
            index={i}
            selected={s.slug === selected.slug}
            tune={() => tune(s)}
            t={t}
            lang={lang}
            favorite={favorites.includes(s.slug)}
            onFavorite={() => toggleFav(s.slug)}
          />
        ))}
      </div>
      <button className="explore-mobile text-button" onClick={onExplorer}>
        {t('Browse all stations', 'Ver todas las emisoras')}
      </button>
    </section>
  );
}
export function Visualizer({
  engine,
  kind,
  moving,
  small = false,
  label,
}: {
  engine: RadioEngine;
  kind: 'off' | 'ambient' | 'reactive';
  moving: boolean;
  small?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const count = small ? 23 : 49,
      buffer = new Uint8Array(64);
    let frame = 0,
      last = 0;
    const reduced =
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.motion === 'reduce';
    const draw = (stamp: number) => {
      if (stamp - last > 70 || !last) {
        last = stamp;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const anal = engine.analyser;
        const active = !!anal && moving && kind === 'reactive';
        if (active) anal.getByteFrequencyData(buffer);
        for (let i = 0; i < count; i++) {
          const baseline = (Math.sin(i * 0.63) * 0.22 + Math.sin(i * 1.57) * 0.14 + 0.64) * 0.48;
          const level = active
            ? Math.max(0.08, buffer[Math.floor((i * buffer.length) / count)] / 255)
            : moving && kind === 'ambient' && !reduced
              ? baseline + 0.19 * Math.sin(i * 0.9 + stamp / 350)
              : baseline;
          const h = Math.max(2, level * canvas.height * (small ? 0.97 : 1));
          ctx.fillStyle = small ? '#f99988' : i < count * 0.64 ? '#ef9d92' : '#bc72a1';
          ctx.fillRect(
            (i * canvas.width) / count,
            (canvas.height - h) / 2,
            Math.max(2, (canvas.width / count) * 0.52),
            h,
          );
        }
      }
      if (moving && !reduced && !document.hidden && kind !== 'off')
        frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      last = 0;
      draw(performance.now());
    };
    restart();
    document.addEventListener('visibilitychange', restart);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [engine, kind, moving, small]);
  return kind === 'off' ? null : (
    <canvas
      className={small ? 'viz-small' : 'viz'}
      ref={ref}
      width={small ? 115 : 392}
      height={small ? 31 : 67}
      role="img"
      aria-label={label}
    />
  );
}
export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        {hint && <p>{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={value}
        className="toggle"
        onClick={onChange}
      >
        <span>{value && <Check size={11} />}</span>
      </button>
    </div>
  );
}
export function PlayGlyph({ size = 20 }: { size?: number }) {
  return <Play size={size} strokeWidth={1.8} fill="currentColor" aria-hidden="true" />;
}
export function SimpleDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const before = document.activeElement as HTMLElement | null;
    d?.showModal();
    return () => {
      d?.close();
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="simple-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-inner">
        <div className="dialog-head">
          <h2>{title}</h2>
          <IconButton label="Close / Cerrar" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function LocalTime({ lang }: { lang: Language }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <span>
      {new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: lang === 'en',
        timeZone: 'America/New_York',
      }).format(now)}
    </span>
  );
}
