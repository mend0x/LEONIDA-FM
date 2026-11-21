import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, CircleDot, Headphones, RadioTower } from 'lucide-react';
import type { Language, Station } from './types';
import { stationIndex, stationPreview } from './station-selection';
import './station-ribbon.css';

/** GTA VI-inspired keyboard frequency strip, independent of the audio player. */
export function StationRibbon({
  stations,
  selected,
  preview,
  language,
  tune,
  step,
  onWheel,
  onExplorer,
}: {
  stations: Station[];
  selected: Station;
  preview: Station | null;
  language: Language;
  tune: (s: Station) => void;
  step: (delta: number) => void;
  onWheel: () => void;
  onExplorer: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastSwipeAt = useRef(0);
  const highlighted = preview ?? selected;
  const index = stationIndex(stations, highlighted.slug);
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  useEffect(() => {
    const container = listRef.current;
    const card = container?.querySelector<HTMLElement>('[data-highlighted="true"]');
    if (!container || !card || container.scrollWidth <= container.clientWidth) return;
    // Scroll only the horizontal strip; never scroll the document on tune.
    // Instant scrolling keeps quick keyboard browsing predictable.
    const left =
      card.offsetLeft - container.offsetLeft - (container.clientWidth - card.clientWidth) / 2;
    container.scrollTo({ left: Math.max(0, left), behavior: 'instant' });
    // Move keyboard focus to the previewed tile without shifting the page.
    // Native Enter can then activate that exact tile accessibly.
    if (preview) card.focus({ preventScroll: true });
  }, [highlighted.slug, stations.length, preview]);

  function move(delta: number) {
    step(delta);
  }

  function finishTouch(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const end = event.changedTouches[0];
    const deltaX = end.clientX - start.x;
    const deltaY = end.clientY - start.y;
    // A deliberate horizontal gesture tunes exactly one station; ordinary
    // vertical scrolling and small taps are left to the browser.
    if (Math.abs(deltaX) >= 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      lastSwipeAt.current = Date.now();
      move(deltaX < 0 ? 1 : -1);
    }
  }

  return (
    <section className="receiver-select" aria-labelledby="receiver-select-title">
      <div className="receiver-select-head">
        <div className="receiver-label">
          <RadioTower size={17} />
          <h2 id="receiver-select-title">{t('All frequencies', 'Todas las frecuencias')}</h2>
          <span className="receiver-count">{stations.length}</span>
        </div>
        <div className="receiver-header-actions">
          <button type="button" onClick={onWheel} className="receiver-wheel-btn">
            <CircleDot size={15} /> {t('Recent wheel', 'Rueda recientes')}
          </button>
          <button type="button" onClick={onExplorer} className="receiver-browse-btn">
            {t('Directory', 'Directorio')}
          </button>
        </div>
      </div>
      <div className="receiver-rail-wrap">
        <button
          className="receiver-edge prev"
          type="button"
          onClick={() => move(-1)}
          aria-label={t('Previous station', 'Emisora anterior')}
          title={t('Previous station · Left arrow', 'Emisora anterior · Flecha izquierda')}
        >
          <ChevronLeft size={25} />
        </button>
        <div
          className="receiver-rail"
          ref={listRef}
          aria-label={t('All GTA VI stations', 'Todas las emisoras de GTA VI')}
          data-testid="dial-swipe"
          data-station-ribbon="all-stations"
          onTouchStart={(event) => {
            if (event.touches.length === 1) {
              touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            }
          }}
          onTouchEnd={finishTouch}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
          onClickCapture={(event) => {
            // Browsers may synthesize a click after a swipe. Do not tune a
            // second, unintended station when that synthetic click arrives.
            if (Date.now() - lastSwipeAt.current < 450) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          role="group"
        >
          {stations.map((station, pos) => (
            <button
              key={station.slug}
              type="button"
              className={`receiver-tile ${station.slug === highlighted.slug ? 'active' : ''} ${station.slug === selected.slug ? 'tuned' : ''}`}
              data-testid={`tune-${station.slug}`}
              data-ribbon-station={station.slug}
              aria-label={`${t('Tune', 'Sintonizar')}: ${station.name}`}
              aria-current={station.slug === selected.slug ? 'true' : undefined}
              aria-pressed={station.slug === highlighted.slug}
              data-highlighted={station.slug === highlighted.slug ? 'true' : undefined}
              title={`${pos + 1}. ${station.name} · ${station.genre}`}
              onClick={() => {
                tune(station);
              }}
            >
              <img
                src={station.art}
                alt=""
                loading={Math.abs(index - pos) > 3 ? 'lazy' : 'eager'}
              />
              {station.kind === 'talk' && (
                <Headphones size={15} className="receiver-podcast-mark" aria-hidden="true" />
              )}
              {station.artProvenance === 'original_placeholder' && (
                <span className="receiver-concept-mark" aria-hidden="true">
                  *
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          className="receiver-edge next"
          type="button"
          onClick={() => move(1)}
          aria-label={t('Next station', 'Emisora siguiente')}
          title={t('Next station · Right arrow', 'Emisora siguiente · Flecha derecha')}
        >
          <ChevronRight size={25} />
        </button>
      </div>
      <div className="receiver-controller" aria-hidden="true">
        <kbd className="receiver-trigger" aria-label={t('Left arrow', 'Flecha izquierda')}>
          ←
        </kbd>
        <div className="receiver-progress">
          <div
            style={{ width: `${stations.length ? (100 * (index + 1)) / stations.length : 0}%` }}
          />
        </div>
        <kbd className="receiver-trigger" aria-label={t('Right arrow', 'Flecha derecha')}>
          →
        </kbd>
      </div>
      <div className="receiver-selection" aria-live="polite">
        <strong>{highlighted.name}</strong>
        <span className="receiver-selection-genre">
          {language === 'es' ? highlighted.genreEs : highlighted.genre}
        </span>
        <span className="receiver-selection-track">{stationPreview(highlighted, language)}</span>
        {highlighted.confidence !== 'OFFICIAL' && (
          <span className="receiver-selection-evidence">
            {t(
              'GTABase listing · not publisher-confirmed',
              'Listado GTABase · sin confirmación editorial de Rockstar',
            )}
          </span>
        )}
      </div>
      <div className="receiver-keyboard-hint">
        <kbd>←</kbd> <kbd>→</kbd> {t('browse', 'explorar')}
        <span aria-hidden="true">·</span>
        <kbd>Enter</kbd> {t('tune', 'sintonizar')}
        {preview && (
          <span className="receiver-pending">
            {t('Preview only · audio unchanged', 'Preselección · el audio no cambia')}
          </span>
        )}
      </div>
      <p className="receiver-footnote">
        {t(
          'Artwork marked * is original placeholder art. Radio streams are independently sourced, not GTA VI recordings.',
          'Las portadas marcadas con * son provisionales. El audio procede de radios independientes, no de grabaciones de GTA VI.',
        )}
      </p>
    </section>
  );
}
