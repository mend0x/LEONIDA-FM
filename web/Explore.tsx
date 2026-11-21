import { useState } from 'react';
import {
  Activity,
  AudioLines,
  BookOpen,
  Check,
  CircleHelp,
  Disc3,
  ExternalLink,
  Headphones,
  Heart,
  Library,
  ListMusic,
  Music2,
  Radio,
  RadioTower,
  Search,
  Share2,
  SlidersHorizontal,
  Tv,
  Video,
} from 'lucide-react';
import type { Station, Preferences, Catalog, Health, Track, Source, Language } from './types';
import { Eyebrow, StationCard, IconButton, Toggle, PlayGlyph, SimpleDialog, type T } from './ui';
import type { Playback, RadioEngine } from './audio';
export function PageHead({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <Eyebrow>
        <span className="accent-line" />
        {kicker}
      </Eyebrow>
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
const confNames: Record<string, [string, string]> = {
  OFFICIAL: ['Official', 'Oficial'],
  REPORTED: ['Documented', 'Documentada'],
  UNVERIFIED: ['Unverified', 'Sin verificar'],
  COMMUNITY: ['Community', 'Comunidad'],
};
function Conf({ s, t }: { s: string; t: T }) {
  const c = confNames[s] || confNames.UNVERIFIED;
  return (
    <span className={`confidence confidence-${s}`}>
      {s === 'OFFICIAL' ? <Check size={12} /> : <CircleHelp size={12} />} {t(...c)}
    </span>
  );
}
function LinkOut({ url, children }: { url?: string; children: React.ReactNode }) {
  return url && /^https:\/\//.test(url) ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="out-link">
      {children}
      <ExternalLink size={13} />
    </a>
  ) : null;
}
export function Directory({
  catalog,
  sel,
  p,
  t,
  tune,
  fav,
  nav,
}: {
  catalog: Catalog;
  sel: Station;
  p: Preferences;
  t: T;
  tune: (s: Station) => void;
  fav: (s: string) => void;
  nav: (p: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'saved' | 'recent'>('all');
  const [query, setQuery] = useState('');
  let stations = catalog.stations.filter((s) =>
    `${s.name} ${s.genre} ${s.genreEs} ${s.hosts.join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  if (filter === 'saved') stations = stations.filter((s) => p.favorites.includes(s.slug));
  if (filter === 'recent')
    stations = stations
      .filter((s) => p.recent.includes(s.slug))
      .sort((a, b) => p.recent.indexOf(a.slug) - p.recent.indexOf(b.slug));
  return (
    <>
      <PageHead
        kicker={t('Frequency directory', 'Directorio de frecuencias')}
        title={t('Station explorer', 'Explorar emisoras')}
      >
        {t(
          'Find a frequency by station, genre or host.',
          'Busca una frecuencia por emisora, género o presentador.',
        )}
      </PageHead>
      <div className="filterbar">
        <div className="tabs" aria-label={t('Filter stations', 'Filtrar emisoras')}>
          {(
            [
              ['all', t('All stations', 'Todas')],
              ['saved', t('Favorites', 'Favoritas')],
              ['recent', t('Recently tuned', 'Recientes')],
            ] as const
          ).map(([v, k]) => (
            <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}>
              {k}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label={t('Search stations', 'Buscar emisoras')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search stations', 'Buscar emisoras')}
          />
        </label>
      </div>
      <div className="directory-grid">
        {stations.map((s) => (
          <StationCard
            key={s.slug}
            s={s}
            index={catalog.stations.indexOf(s)}
            selected={s.slug === sel.slug}
            tune={() => tune(s)}
            t={t}
            lang={p.language}
            favorite={p.favorites.includes(s.slug)}
            onFavorite={() => fav(s.slug)}
            detail={() => nav('/stations/' + s.slug)}
          />
        ))}
      </div>
      {!stations.length && (
        <p className="empty">
          {filter === 'saved'
            ? t(
                'Save a station with its heart button to find it here.',
                'Guarda una emisora con el corazón para encontrarla aquí.',
              )
            : t('No stations match this filter.', 'Ninguna emisora coincide con el filtro.')}
        </p>
      )}
      {p.showExpanded && catalog.expanded.length > 0 && (
        <section className="section-panel">
          <h2>{t('Unconfirmed signals', 'Señales sin confirmar')}</h2>
          <p>
            {t(
              'Fan listings awaiting publisher confirmation.',
              'Emisoras citadas por aficionados, pendientes de confirmación oficial.',
            )}
          </p>
          <div className="expanded-list">
            {catalog.expanded
              .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
              .map((s) => (
                <div key={s.slug}>
                  <span>{s.name}</span>
                  <Conf s={s.confidence} t={t} />
                </div>
              ))}
          </div>
        </section>
      )}
    </>
  );
}
export function MusicExplorer({
  catalog,
  station,
  pause,
  t,
  initialFilter,
}: {
  catalog: Catalog;
  station?: Station;
  pause: () => void;
  t: T;
  initialFilter?: string;
}) {
  const [filter, setFilter] = useState(initialFilter || 'all'),
    [query, setQuery] = useState(''),
    [video, setVideo] = useState<Track | null>(null);
  const [confidence, showConfidence] = useState('all');
  const tracks = (station ? [station] : catalog.stations)
    .filter((s) => filter === 'all' || s.slug === filter)
    .flatMap((s) => s.tracks.map((track) => ({ station: s, track })))
    .filter(
      (x) =>
        (confidence === 'all' || x.track.confidence === confidence) &&
        `${x.track.title} ${x.track.artist} ${x.station.name}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
  return (
    <>
      {!station && (
        <PageHead
          kicker={t('GTA VI music explorer', 'Explorador musical GTA VI')}
          title={t('Music library', 'Biblioteca musical')}
        >
          {t(
            'Explore documented songs, station previews and artist recordings.',
            'Explora canciones documentadas, adelantos por emisora y grabaciones de artistas.',
          )}
        </PageHead>
      )}
      {station ? (
        <div className="section-heading small-gap">
          <ListMusic size={22} />
          <h2>{t('Documented tracks', 'Canciones documentadas')}</h2>
          <span className="count">{tracks.length}</span>
        </div>
      ) : (
        <div className="filterbar wrap">
          <label className="search">
            <Search size={17} />
            <input
              aria-label={t('Find track or artist', 'Buscar canción o artista')}
              placeholder={t('Track or artist', 'Canción o artista')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="select-label">
            {t('Station', 'Emisora')}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">{t('All stations', 'Todas las emisoras')}</option>
              {catalog.stations.map((s) => (
                <option value={s.slug} key={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="select-label">
            {t('Evidence', 'Evidencia')}
            <select value={confidence} onChange={(e) => showConfidence(e.target.value)}>
              <option value="all">{t('All evidence', 'Todas las fuentes')}</option>
              {Object.entries(confNames).map(([v, n]) => (
                <option key={v} value={v}>
                  {t(...n)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="track-list">
        {tracks.map(({ station: s, track: x }) => (
          <article className="track-row" key={s.slug + x.title}>
            <img src={s.art} alt="" loading="lazy" />
            <div className="track-id">
              <strong>{x.title}</strong>
              <span>{x.artist}</span>
            </div>
            {!station && <span className="track-station">{s.name}</span>}
            <div className="track-evidence">
              <Conf s={x.confidence} t={t} />
              <LinkOut url={x.sourceUrl}>{t('Source', 'Fuente')}</LinkOut>
            </div>
            <div className="track-links">
              {x.youtubeId && (
                <button
                  className="mini-action"
                  onClick={() => {
                    pause();
                    setVideo(x);
                  }}
                >
                  <Video size={15} />
                  {t('Watch', 'Ver vídeo')}
                </button>
              )}
              <LinkOut url={x.spotifyUrl}>Spotify</LinkOut>
            </div>
          </article>
        ))}
      </div>
      {!tracks.length && (
        <p className="empty">
          {t('No tracks match this search.', 'Ninguna canción coincide con tu búsqueda.')}
        </p>
      )}
      {video && (
        <SimpleDialog title={video.title} onClose={() => setVideo(null)}>
          <p>{video.artist}</p>
          <iframe
            title={video.title + ' · YouTube'}
            className="music-embed"
            src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?rel=0`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <div className="embed-links">
            <LinkOut url={video.youtubeUrl}>{t('Open on YouTube', 'Abrir en YouTube')}</LinkOut>
            <LinkOut url={video.spotifyUrl}>Spotify</LinkOut>
          </div>
        </SimpleDialog>
      )}
    </>
  );
}
/** Podcast entries are editorial references, not bundled copyrighted episode audio. */
export function PodcastExplorer({
  catalog,
  t,
  nav,
}: {
  catalog: Catalog;
  t: T;
  nav: (path: string) => void;
}) {
  const shows = catalog.stations.flatMap((station) =>
    (station.shows ?? []).map((show) => ({ station, show })),
  );
  return (
    <>
      <PageHead
        kicker={t('Leonida talk & podcasts', 'Charlas y podcasts de Leonida')}
        title={t('Podcasts', 'Podcasts')}
      >
        {t(
          'Documented programmes, their sources and honest audio availability.',
          'Programas documentados, sus fuentes y disponibilidad real de audio.',
        )}
      </PageHead>
      <div className="podcast-grid">
        {shows.map(({ station, show }) => (
          <article key={station.slug + show.id} className="podcast-show">
            <img src={station.art} alt="" loading="lazy" />
            <div>
              <span className="podcast-kicker">
                {station.name} ·{' '}
                {show.status === 'REPORTED'
                  ? t('Reported', 'Documentado por terceros')
                  : t('Official', 'Oficial')}
              </span>
              <h2>{show.title}</h2>
              <p className="podcast-host">{show.host}</p>
              <p>{show.description}</p>
              <p className="podcast-unavailable">
                {t(
                  'No authorized complete episodes available for streaming at present.',
                  'No hay episodios completos disponibles con autorización para reproducirlos aquí.',
                )}
              </p>
              <div className="inline-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => nav('/stations/' + station.slug)}
                >
                  {t('See station', 'Ver emisora')}
                </button>
                <LinkOut url={show.sourceUrl}>{t('Source', 'Fuente')}</LinkOut>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!shows.length && (
        <p className="empty">
          {t('No verified shows currently listed.', 'Todavía no hay programas documentados.')}
        </p>
      )}
    </>
  );
}
export function Detail({
  s,
  catalog,
  t,
  lang,
  tune,
  share,
  fav,
  saved,
  pause,
}: {
  s: Station;
  catalog: Catalog;
  t: T;
  lang: Language;
  tune: () => void;
  share: () => void;
  fav: () => void;
  saved: boolean;
  pause: () => void;
}) {
  return (
    <>
      <div className="detail-cover">
        <img src={s.art} alt="" />
        <div>
          <Eyebrow>
            <Radio size={15} />
            {lang === 'en' ? s.genre : s.genreEs}
          </Eyebrow>
          <h1>{s.name}</h1>
          <p>{lang === 'en' ? s.description : s.descriptionEs}</p>
          <div className="inline-actions">
            <button className="primary" onClick={tune}>
              <PlayGlyph size={17} />
              {t('Tune in', 'Sintonizar')}
            </button>
            <IconButton label={t('Favorite', 'Favorita')} active={saved} onClick={fav}>
              <Heart size={19} fill={saved ? 'currentColor' : 'none'} />
            </IconButton>
            <IconButton label={t('Share station', 'Compartir emisora')} onClick={share}>
              <Share2 size={19} />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="facts">
        <div>
          <Eyebrow>{t('On the mic', 'Al micrófono')}</Eyebrow>
          <b>{s.hosts.join(' & ') || '—'}</b>
        </div>
        <div>
          <Eyebrow>{t('Station evidence', 'Evidencia de la emisora')}</Eyebrow>
          <Conf s={s.confidence} t={t} />
        </div>
        <div>
          <Eyebrow>{t('Publisher preview', 'Adelanto del editor')}</Eyebrow>
          <LinkOut url={s.officialUrl}>Rockstar Games</LinkOut>
        </div>
      </div>
      {Boolean(s.shows?.length) && (
        <section className="section-panel">
          <h2>
            <Headphones size={20} /> {t('Documented podcasts', 'Podcasts documentados')}
          </h2>
          {s.shows?.map((show) => (
            <div className="station-show" key={show.id}>
              <h3>{show.title}</h3>
              <p>{show.host}</p>
              <p>
                {t(
                  'Episodes not available to stream here.',
                  'Los episodios no están disponibles para reproducirlos aquí.',
                )}
              </p>
              <LinkOut url={show.sourceUrl}>{t('Source', 'Fuente')}</LinkOut>
            </div>
          ))}
        </section>
      )}
      {s.tracks.length > 0 && <MusicExplorer catalog={catalog} station={s} t={t} pause={pause} />}
      <section className="section-panel">
        <h2>{t('Sources', 'Fuentes')}</h2>
        <div className="source-links">
          {s.evidence.map((e) => {
            const r = catalog.references.find((a) => a.id === e);
            return (
              r && (
                <LinkOut key={e} url={r.url}>
                  {r.name}
                </LinkOut>
              )
            );
          })}
        </div>
      </section>
    </>
  );
}
export function Settings({
  p,
  patch,
  t,
  onDrive,
  onKeys,
  onStatus,
}: {
  p: Preferences;
  patch: (p: Partial<Preferences>) => void;
  t: T;
  onDrive: () => void;
  onKeys: () => void;
  onStatus: () => void;
}) {
  const options = (
    id: string,
    label: string,
    value: string,
    items: [string, string][],
    onChange: (v: string) => void,
    hint?: string,
  ) => (
    <div className="setting-row">
      <div>
        <label htmlFor={id}>
          <strong>{label}</strong>
        </label>
        {hint && <p>{hint}</p>}
      </div>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {items.map(([v, k]) => (
          <option value={v} key={v}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <>
      <PageHead
        kicker={t('Receiver controls', 'Controles del receptor')}
        title={t('Settings', 'Ajustes')}
      />
      <div className="settings-grid">
        <section className="section-panel">
          <h2>
            <Headphones />
            {t('Playback', 'Reproducción')}
          </h2>
          <div className="mode-picks">
            {(['soundtrack', 'radio'] as const).map((m) => (
              <button
                key={m}
                data-testid={'music-mode-' + m}
                className={p.musicMode === m ? 'chosen' : ''}
                aria-pressed={p.musicMode === m}
                onClick={() => patch({ musicMode: m })}
              >
                {m === 'soundtrack' ? <Disc3 /> : <RadioTower />}
                <b>
                  {m === 'soundtrack'
                    ? t('GTA VI · Project songs', 'GTA VI · Canciones del proyecto')
                    : t('Free real radios', 'Radios reales gratuitas')}
                </b>
              </button>
            ))}
          </div>
          <p className="subtle">
            {t(
              'GTA VI plays audio files installed in canciones/<station>/ on your PC. Real radios are independent streams from Radio Browser. No official songs are bundled.',
              'GTA VI reproduce archivos instalados en canciones/<emisora>/ de tu ordenador. Radios reales utiliza señales independientes de Radio Browser. No se incluyen canciones comerciales.',
            )}
          </p>
          <button className="text-button" onClick={onStatus}>
            <Activity size={16} />
            {t('Broadcast status', 'Estado de emisión')}
          </button>
          <div className="setting-row">
            <label htmlFor="master-volume">
              <strong>{t('Master volume', 'Volumen general')}</strong>
            </label>
            <input
              id="master-volume"
              className="settings-volume"
              type="range"
              min="0"
              max="100"
              value={Math.round(p.volume * 100)}
              onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
            />
          </div>
          {options(
            'stream-quality',
            t('Live stream quality', 'Calidad del directo'),
            p.quality,
            [
              ['auto', t('Automatic', 'Automática')],
              ['lowest', t('Lowest bitrate', 'Menor tasa')],
              ['highest', t('Highest bitrate', 'Mayor tasa')],
            ],
            (v) => patch({ quality: v as Preferences['quality'] }),
            t(
              'For independently authorized live streams only; this does not affect YouTube tracks.',
              'Solo para emisiones en directo autorizadas; no afecta a las canciones de YouTube.',
            ),
          )}
          <Toggle
            label={t('Interface sounds', 'Sonidos de interfaz')}
            value={p.sounds}
            onChange={() => patch({ sounds: !p.sounds })}
          />
          <Toggle
            label={t('Track notifications', 'Avisos de canción')}
            value={p.notices}
            onChange={() => patch({ notices: !p.notices })}
          />
          {options(
            'viz',
            t('Visualizer', 'Visualizador'),
            p.visualizer,
            [
              ['reactive', t('Audio reactive', 'Reactivo al audio')],
              ['ambient', t('Ambient', 'Ambiental')],
              ['off', t('Off / save power', 'Apagado / ahorro')],
            ],
            (v) => patch({ visualizer: v as Preferences['visualizer'] }),
          )}
        </section>
        <section className="section-panel">
          <h2>
            <SlidersHorizontal />
            {t('Interface', 'Interfaz')}
          </h2>
          {options(
            'lang',
            t('Language', 'Idioma'),
            p.language,
            [
              ['en', 'English'],
              ['es', 'Español'],
            ],
            (v) => patch({ language: v as Language }),
          )}
          {options(
            'motion',
            t('Motion', 'Movimiento'),
            p.motion,
            [
              ['system', t('Follow device', 'Según dispositivo')],
              ['reduce', t('Reduced', 'Reducido')],
            ],
            (v) => patch({ motion: v as Preferences['motion'] }),
          )}
          <Toggle
            label={t('Compact player', 'Reproductor compacto')}
            value={p.compact}
            onChange={() => patch({ compact: !p.compact })}
          />
          <Toggle
            label={t('Show unconfirmed stations', 'Mostrar emisoras sin confirmar')}
            value={p.showExpanded}
            onChange={() => patch({ showExpanded: !p.showExpanded })}
          />
          <button className="text-button" onClick={onDrive}>
            <Tv size={16} />
            {t('Open drive mode', 'Abrir modo coche')}
          </button>
        </section>
        <section className="section-panel">
          <h2>
            <Radio />
            {t('Tuning controls', 'Sintonización')}
          </h2>
          {options(
            'selector',
            t('Preferred selector', 'Selector preferido'),
            p.selector,
            [
              ['dial', t('Station dial', 'Dial')],
              ['wheel', t('Radio wheel', 'Rueda')],
            ],
            (v) => patch({ selector: v as Preferences['selector'] }),
          )}
          <Toggle
            label={t('Confirm wheel on release', 'Confirmar al soltar')}
            value={p.confirmOnRelease}
            onChange={() => patch({ confirmOnRelease: !p.confirmOnRelease })}
          />
          {options(
            'pad-confirm',
            t('Gamepad confirm', 'Confirmar en mando'),
            String(p.gamepadConfirm),
            Array.from({ length: 16 }, (_, i) => [String(i), t('Button ', 'Botón ') + i]),
            (v) =>
              patch({
                gamepadConfirm: Number(v),
                ...(Number(v) === p.gamepadCancel ? { gamepadCancel: p.gamepadConfirm } : {}),
              }),
          )}
          {options(
            'pad-back',
            t('Gamepad cancel', 'Cancelar en mando'),
            String(p.gamepadCancel),
            Array.from({ length: 16 }, (_, i) => [String(i), t('Button ', 'Botón ') + i]),
            (v) =>
              patch({
                gamepadCancel: Number(v),
                ...(Number(v) === p.gamepadConfirm ? { gamepadConfirm: p.gamepadCancel } : {}),
              }),
          )}
          <button className="text-button" onClick={onKeys}>
            {t('Keyboard & controller guide', 'Guía de teclado y mando')}
          </button>
        </section>
      </div>
    </>
  );
}
export function Status({
  t,
  health,
  online,
  engine,
  playback,
  sources,
  refresh,
}: {
  t: T;
  health: Health[];
  online: boolean | null;
  engine: RadioEngine;
  playback: Playback;
  sources: Source[];
  refresh: () => void;
}) {
  const d = engine.diagnostics();
  const labels: Record<string, string> = {
    disabled: t('Disabled', 'Deshabilitada'),
    unconfigured: t('Not configured', 'Sin configurar'),
    unknown: t('Unknown', 'Desconocida'),
    active: t('Connected', 'Conectada'),
    online: t('Connected', 'Conectada'),
    unavailable: t('Unavailable', 'No disponible'),
    offline: t('Offline', 'Sin conexión'),
    stale: t('Stale', 'Desactualizada'),
    error: t('Source error', 'Error de fuente'),
    no_source: t('No active source', 'Sin fuente activa'),
  };
  return (
    <>
      <PageHead
        kicker={t('Network diagnostics', 'Diagnóstico de red')}
        title={t('Broadcast status', 'Estado de emisión')}
      />
      <div className="facts">
        <div>
          <Eyebrow>API</Eyebrow>
          <b>
            {online === null
              ? t('Checking', 'Comprobando')
              : online
                ? t('Online', 'En línea')
                : t('Offline', 'Sin conexión')}
          </b>
        </div>
        <div>
          <Eyebrow>{t('Receiver', 'Receptor')}</Eyebrow>
          <b>{playback.state.toUpperCase()}</b>
        </div>
        <div>
          <Eyebrow>{t('Buffer / retries', 'Búfer / reintentos')}</Eyebrow>
          <b>
            {d.buffer.toFixed(1)} s / {d.attempts}
          </b>
        </div>
        <button className="secondary" onClick={refresh}>
          {t('Refresh status', 'Actualizar estado')}
        </button>
      </div>
      <div className="status-grid">
        {health.map((s) => (
          <article className="status-station" key={s.slug}>
            <RadioTower />
            <h3>{s.name}</h3>
            <dl>
              <dt>{t('Free audio', 'Audio gratuito')}</dt>
              <dd>
                {t(
                  'Radio Browser (independent stations)',
                  'Radio Browser (emisoras independientes)',
                )}
              </dd>
              <dt>{t('Live broadcast', 'Emisión en directo')}</dt>
              <dd>{labels[s.liveStatus] || s.liveStatus}</dd>
            </dl>
          </article>
        ))}
      </div>
      <section className="section-panel">
        <h2>
          <Activity />
          {t('Current receiver', 'Receptor actual')}
        </h2>
        <p>
          {t('Configured source types', 'Tipos de fuente configurados')} ·{' '}
          {sources.map((s) => s.type).join(', ') || '—'}
        </p>
        <p>
          {t('Last playback issue', 'Última incidencia de reproducción')} ·{' '}
          {d.issue || t('None', 'Ninguna')}
        </p>
        <p>
          {t(
            'Live listener totals and transfer rates are available in the operator’s gateway metrics.',
            'El operador puede consultar los oyentes y la transferencia en las métricas de su servidor.',
          )}
        </p>
      </section>
    </>
  );
}
export function About({ t, catalog, nav }: { t: T; catalog: Catalog; nav: (p: string) => void }) {
  return (
    <>
      <PageHead
        kicker={t('Independent radio project', 'Proyecto de radio independiente')}
        title={t('About Leonida FM', 'Sobre Leonida FM')}
      >
        {t(
          'An independent fan project inspired by the music culture of Grand Theft Auto VI. Unaffiliated with Rockstar Games or Take-Two.',
          'Proyecto independiente de aficionados inspirado en la cultura musical de Grand Theft Auto VI, sin afiliación con Rockstar Games ni Take-Two.',
        )}
      </PageHead>
      <div className="settings-grid">
        <section className="section-panel">
          <h2>
            <Music2 />
            {t('What you hear', 'Lo que escuchas')}
          </h2>
          <p>
            {t(
              'The dial connects to free, independent radio streams selected by genre through Radio Browser. Those streams are not the GTA VI soundtrack and may contain broadcaster advertising.',
              'El dial conecta con radios independientes gratuitas del mismo género mediante Radio Browser. No son la banda sonora de GTA VI y pueden incluir anuncios de la emisora.',
            )}
          </p>
          <p>
            {t(
              'If a stream is unreachable, Leonida tries other online stations. The catalog of documented GTA VI songs remains informational; full copyrighted tracks require authorized playback rights.',
              'Si una señal falla, Leonida intenta otras emisoras. El catálogo de canciones de GTA VI es informativo: las grabaciones comerciales completas requieren autorización.',
            )}
          </p>
        </section>
        <section className="section-panel">
          <h2>
            <BookOpen />
            {t('Editorial evidence', 'Fuentes editoriales')}
          </h2>
          <p>
            {t(
              'Station identities, preview track credits and third-party listings carry individual evidence labels. Last catalog review: 18 November 2026.',
              'Las emisoras, los créditos de los adelantos y las referencias de terceros se verifican por separado. Última revisión del catálogo el 18 de noviembre de 2026.',
            )}
          </p>
          <div className="source-links">
            {catalog.references
              .filter((r) => ['rockstar-music', 'rockstar-newswire', 'gtabase'].includes(r.id))
              .map((r) => (
                <LinkOut key={r.id} url={r.url}>
                  {r.name}
                </LinkOut>
              ))}
          </div>
        </section>
        <section className="section-panel">
          <h2>
            <AudioLines />
            {t('Credits & privacy', 'Créditos y privacidad')}
          </h2>
          <p>
            {t(
              'Rockstar imagery loads from Rockstar Games; the station directory comes from Radio Browser; audio connects directly to independent broadcasters. Preferences remain on your device, and providers may see your IP address.',
              'Las imágenes se cargan desde Rockstar; el directorio viene de Radio Browser y el audio de emisoras independientes. Tus ajustes permanecen en el dispositivo y las fuentes pueden recibir tu IP.',
            )}
          </p>
          <button className="text-button" onClick={() => nav('/admin')}>
            <Library size={16} />
            {t('Operator studio', 'Estudio de administración')}
          </button>
        </section>
      </div>
    </>
  );
}
