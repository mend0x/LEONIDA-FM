import { useId, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Music2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { OfficialRadio, type MusicPlayback } from './official-radio';
import { ListeningModeToggle } from './ListeningModeToggle';
import type { Language, ListeningMode, Mode, Station } from './types';
import './radio-dock.css';

/**
 * This panel owns the *presentation*, never the player lifecycle.
 * The OfficialRadio instance belongs to App; collapsing this panel does not
 * unmount its attachment node and never restarts the live stream.
 */
export function RadioDock({
  radio,
  playback,
  station,
  language,
  mode,
  musicMode,
  onMusicModeChange,
  onNotice,
}: {
  radio: OfficialRadio;
  playback: MusicPlayback;
  station: Station;
  language: Language;
  mode: Mode;
  musicMode: ListeningMode;
  onMusicModeChange: (mode: ListeningMode) => void;
  onNotice: (message: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const t = (en: string, es: string) => (language === 'es' ? es : en);
  const isVideo = playback.provider === 'youtube';
  // YouTube's embedded player must remain visible, not hidden in a background frame.
  const open = isVideo || expanded;
  const isAudio =
    playback.provider === 'radio-browser' ||
    playback.provider === 'project' ||
    playback.provider === 'local' ||
    playback.provider === 'yt-dlp';
  const isPlaying = playback.state === 'playing';
  const wantsAudio = radio.intent;
  const sourceTitle = playback.track?.title || station.name;
  const sourceLabel =
    playback.provider === 'radio-browser'
      ? t('Independent live radio', 'Radio en directo independiente')
      : playback.provider === 'project'
        ? t('GTA VI · Project files', 'GTA VI · Archivos del proyecto')
        : playback.provider === 'local'
          ? t('My audio files', 'Mis archivos de audio')
          : playback.provider === 'yt-dlp'
            ? t('Local music', 'Música local')
            : t('Music via YouTube', 'Música de YouTube');
  const show = mode === 'demo' && playback.started;
  const togglePlay = () => (radio.intent ? radio.pause() : radio.play());
  const chooseLocal = (files: File[]) => {
    const count = radio.importFiles(files);
    if (count) {
      setExpanded(true);
      onNotice(t(`${count} audio files loaded`, `${count} archivos de audio cargados`));
    }
  };
  return (
    <section
      className={`radio-dock${show ? ' radio-dock-visible' : ''}${open ? ' radio-dock-open' : ''}`}
      aria-label={t('Audio source', 'Fuente de audio')}
      data-testid="radio-dock"
      data-expanded={open ? 'true' : 'false'}
    >
      <div className="radio-dock-top">
        <button
          type="button"
          className="radio-dock-expand"
          aria-expanded={open}
          aria-controls={bodyId}
          disabled={isVideo}
          onClick={() => setExpanded((value) => !value)}
          title={
            isVideo
              ? t(
                  'The YouTube player must remain visible',
                  'El reproductor de YouTube debe permanecer visible',
                )
              : undefined
          }
        >
          <Radio size={18} aria-hidden="true" />
          <span className="radio-dock-heading">
            <span className="radio-dock-kicker">{sourceLabel}</span>
            <strong title={sourceTitle}>{sourceTitle}</strong>
          </span>
          {open ? (
            <ChevronDown size={19} aria-hidden="true" />
          ) : (
            <ChevronUp size={19} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="radio-dock-play"
          onClick={togglePlay}
          aria-label={
            wantsAudio ? t('Pause audio', 'Pausar audio') : t('Play audio', 'Reproducir audio')
          }
          title={wantsAudio ? t('Pause', 'Pausar') : t('Play', 'Reproducir')}
        >
          {wantsAudio ? (
            <Pause size={19} fill="currentColor" />
          ) : (
            <Play size={19} fill="currentColor" />
          )}
        </button>
      </div>
      <div className="radio-dock-content" id={bodyId} hidden={!open}>
        {mode === 'demo' && (
          <ListeningModeToggle
            compact
            mode={musicMode}
            language={language}
            onChange={onMusicModeChange}
          />
        )}
        {playback.provider === 'project' && (
          <p className="radio-dock-library-count" data-testid="project-audio-count">
            {t('Files ready', 'Archivos disponibles')}: {playback.libraryAvailable} /{' '}
            {playback.libraryCatalogTotal}
            {playback.libraryAvailable === 0 && (
              <span>
                {t(' — Add MP3/M4A to canciones/', ' — Añade MP3/M4A en canciones/')}
                {station.slug}
              </span>
            )}
          </p>
        )}
        {playback.provider === 'project' && (
          <button
            type="button"
            className="radio-dock-rescan"
            onClick={() => radio.refreshProjectLibrary()}
          >
            <RefreshCw size={14} aria-hidden="true" />{' '}
            {t('Scan canciones folder again', 'Volver a buscar canciones')}
          </button>
        )}
        <div className="radio-dock-source">
          <span className={`radio-dock-light${isPlaying ? ' active' : ''}`} />
          <span>
            {playback.state === 'buffering' || playback.state === 'preparing'
              ? t('Connecting...', 'Conectando...')
              : isPlaying
                ? t('Playing now', 'Sonando ahora')
                : t('Stopped / paused', 'Detenido / en pausa')}
          </span>
          <span className="radio-dock-count">
            {playback.total ? `${playback.index + 1} / ${playback.total}` : '—'}
          </span>
        </div>
        <div
          className={`radio-dock-frame${isAudio ? ' radio-dock-audio-frame' : ''}`}
          ref={radio.attach}
        />
        {isAudio && <p className="radio-dock-source-name">{sourceTitle}</p>}
        <div className="radio-dock-navigation">
          <button
            type="button"
            disabled={playback.total < 2}
            onClick={() => radio.nextTrack(-1)}
            aria-label={t('Previous source', 'Fuente anterior')}
          >
            <SkipBack size={17} /> <span>{t('Previous', 'Anterior')}</span>
          </button>
          <button
            type="button"
            disabled={playback.total < 2}
            onClick={() => radio.nextTrack(1)}
            aria-label={t('Next source', 'Siguiente fuente')}
          >
            <span>{t('Next source', 'Otra señal')}</span> <SkipForward size={17} />
          </button>
        </div>
        {(playback.issue || playback.state === 'unavailable' || playback.state === 'error') && (
          <p className="radio-dock-alert" role="status">
            {playback.issue ||
              t(
                'This source is unavailable. Choose another.',
                'Esta fuente no está disponible. Prueba otra.',
              )}
          </p>
        )}
        {playback.attempts > 0 && !isAudio && (
          <p className="radio-dock-meta">
            {t('Unavailable videos skipped:', 'Vídeos no disponibles omitidos:')}{' '}
            {playback.attempts}
          </p>
        )}
        <details className="radio-dock-options">
          <summary>
            <Music2 size={16} /> {t('Sources & options', 'Fuentes y opciones')}
          </summary>
          <div className="radio-dock-options-body">
            <label className="radio-dock-upload">
              <Upload size={16} /> {t('Import my audio', 'Importar mis canciones')}
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac"
                multiple
                onChange={(event) => {
                  chooseLocal(Array.from(event.currentTarget.files || []));
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {playback.localAvailable > 0 && (
              <button
                type="button"
                onClick={() =>
                  radio.selectProvider(playback.provider === 'local' ? 'radio-browser' : 'local')
                }
              >
                {playback.provider === 'local'
                  ? t('Return to free radio', 'Volver a radio gratis')
                  : t('Listen to my files', 'Escuchar mis archivos')}
              </button>
            )}
            {playback.provider !== 'radio-browser' && (
              <button type="button" onClick={() => onMusicModeChange('radio')}>
                {t('Free internet radio', 'Radio online gratis')}
              </button>
            )}
            {playback.streamHomepage && (
              <a href={playback.streamHomepage} target="_blank" rel="noopener noreferrer">
                {t('Visit the real radio station', 'Visitar la emisora real')}{' '}
                <ExternalLink size={14} />
              </a>
            )}
            {playback.videoUrl && (
              <a href={playback.videoUrl} target="_blank" rel="noopener noreferrer">
                YouTube <ExternalLink size={14} />
              </a>
            )}
          </div>
        </details>
        <p className="radio-dock-disclaimer">
          {playback.provider === 'radio-browser'
            ? t(
                'Independent station in the same genre, not the official GTA VI broadcast.',
                'Radio independiente del mismo género; no es la emisión oficial de GTA VI.',
              )
            : playback.provider === 'project'
              ? t(
                  'Playing files stored in the project canciones folder on this PC.',
                  'Reproduciendo archivos de la carpeta canciones del proyecto en este PC.',
                )
              : playback.provider === 'local'
                ? t(
                    'Your imported files remain on this device.',
                    'Tus archivos permanecen en tu dispositivo.',
                  )
                : t(
                    'Availability depends on the external provider.',
                    'La disponibilidad depende del proveedor externo.',
                  )}
        </p>
      </div>
    </section>
  );
}
