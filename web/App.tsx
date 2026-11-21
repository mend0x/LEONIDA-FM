import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Activity,
  CarFront,
  Check,
  CircleDot,
  Disc3,
  Expand,
  Grid2X2,
  Heart,
  Headphones,
  Info,
  Keyboard,
  Library,
  MapPin,
  Menu,
  Pause,
  Radio,
  RadioTower,
  Settings2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { RadioEngine } from './audio';
import { OfficialRadio } from './official-radio';
import { RadioDock } from './RadioDock';
import { ListeningModeToggle } from './ListeningModeToggle';
import { StationRibbon } from './StationRibbon';
import { featuredStations } from './station-selection';
import { wheelSound } from './wheel-sound';
import { originalPrograms, seed, useNetwork, useReceiverKeys } from './hooks';
import { adjacent, markFavorite, readPreferences, savePreferences } from './preferences';
import {
  Brand,
  Eyebrow,
  IconButton,
  LocalTime,
  PlayGlyph,
  SimpleDialog,
  Visualizer,
  Wordmark,
  stationStyle,
  type T,
} from './ui';
import type { Preferences, Station } from './types';
const Wheel = lazy(() => import('./Wheel').then((m) => ({ default: m.Wheel })));
const Directory = lazy(() => import('./Explore').then((m) => ({ default: m.Directory }))),
  MusicExplorer = lazy(() => import('./Explore').then((m) => ({ default: m.MusicExplorer }))),
  PodcastExplorer = lazy(() => import('./Explore').then((m) => ({ default: m.PodcastExplorer }))),
  Detail = lazy(() => import('./Explore').then((m) => ({ default: m.Detail }))),
  Settings = lazy(() => import('./Explore').then((m) => ({ default: m.Settings }))),
  Status = lazy(() => import('./Explore').then((m) => ({ default: m.Status }))),
  About = lazy(() => import('./Explore').then((m) => ({ default: m.About }))),
  Admin = lazy(() => import('./Studio'));
const actualPath = () => location.pathname.replace(/\/+$/, '') || '/';
function initialPrefs() {
  const p = readPreferences(),
    link = actualPath().match(/^\/radio\/([a-z0-9-]+)$/);
  // Migrate the old private-broadcast preference to the two-mode listener UI.
  if (p.mode === 'live') p.mode = 'demo';
  if (link) p.slug = link[1];
  return p;
}
const stationHeadline = (s: Station) =>
  s.slug === 'back-country'
    ? ['Back Country', 'Radio.']
    : s.slug === 'the-chamber'
      ? ['The Chamber', '106.6']
      : s.slug === 'dirty-south'
        ? ['Dirty South', 'Classics.']
        : s.name.includes(' ')
          ? [s.name.split(' ').slice(0, -1).join(' '), s.name.split(' ').at(-1) + '.']
          : [s.name, ''];
function fmt(s: number) {
  return Math.floor(s / 60) + ':' + String(Math.floor(s) % 60).padStart(2, '0');
}
export default function App() {
  const [p, setP] = useState(initialPrefs),
    [path, setPath] = useState(actualPath),
    [wheel, setWheel] = useState(false),
    [previewSlug, setPreviewSlug] = useState<string | null>(null),
    [dialog, setDialog] = useState<'keys' | 'menu' | 'share' | null>(null),
    [shareUrl, setShareUrl] = useState(''),
    [toast, setToast] = useState('');
  const [engine] = useState(() => {
    const e = new RadioEngine();
    e.setData(originalPrograms);
    return e;
  });
  const [official] = useState(() => new OfficialRadio());
  useEffect(() => {
    let active = true;
    fetch('/api/local-audio/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (!active || !status) return;
        official.setLocalResolverAvailable(Boolean(status.available));
      })
      .catch(() => {
        // The optional local resolver is not required for free radio playback.
      });
    return () => {
      active = false;
    };
  }, [official]);
  const network = useNetwork(p.slug, engine),
    list = network.catalog.stations;
  const selected = list.find((s) => s.slug === p.slug) || list[0] || seed.stations[0];
  const wheelStations = featuredStations(list, p.recent, selected.slug);
  const previewStation = list.find((station) => station.slug === previewSlug) ?? selected;
  const livePlayback = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const musicPlayback = useSyncExternalStore(official.subscribe, official.getSnapshot);
  const playback = p.mode === 'live' ? livePlayback : musicPlayback;
  const playing = playback.state === 'playing',
    busy = ['preparing', 'buffering', 'reconnecting'].includes(playback.state);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) tick((x) => x + 1);
    }, 800);
    return () => clearInterval(id);
  }, []);
  const t: T = (en, es) => (p.language === 'es' ? es : en);
  const patch = (v: Partial<Preferences>) => setP((old) => ({ ...old, ...v }));
  const toastTimer = useRef(0);
  function notify(message: string) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3400);
  }
  useEffect(() => {
    savePreferences(p);
    engine.setVolume(p.volume, p.muted);
    official.setVolume(p.volume, p.muted);
    engine.setQuality(p.quality);
    document.documentElement.lang = p.language;
    document.documentElement.dataset.motion = p.motion;
  }, [p, engine, official]);
  const initialListeningMode = useRef(false);
  if (!initialListeningMode.current) {
    official.setListeningMode(p.musicMode, false);
    initialListeningMode.current = true;
  }
  const lastTune = useRef('');
  const modeKey = p.mode + ':' + selected.slug;
  useEffect(() => {
    if (lastTune.current !== modeKey) {
      lastTune.current = modeKey;
      if (p.mode === 'live') {
        official.stop();
        engine.tune(selected, 'live', false, network.sources[selected.slug]);
      } else {
        engine.pause();
        official.tune(selected, false);
      }
    }
  }, [modeKey, selected, p.mode, network.sources, engine, official]);
  useEffect(() => {
    const handle = () => {
      const dest = actualPath();
      setPath(dest);
      setWheel(false);
      setDialog(null);
      setPreviewSlug(null);
      const slug = dest.match(/^\/radio\/([a-z0-9-]+)$/)?.[1];
      if (slug) setP((old) => ({ ...old, slug }));
    };
    window.addEventListener('popstate', handle);
    return () => window.removeEventListener('popstate', handle);
  }, []);
  const nav = useCallback((dest: string, options: { preserveScroll?: boolean } = {}) => {
    if (actualPath() !== dest) {
      history.pushState(null, '', dest);
      setPath(dest);
      // Changing the tuned frequency is not a page navigation. Keep the dial
      // where the listener left it; ordinary page navigation still starts at top.
      if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (dest !== '/' && !dest.startsWith('/radio/')) setPreviewSlug(null);
    setDialog(null);
  }, []);
  const tune = (s: Station, play = true) => {
    if (play && p.mode === 'live') engine.unlock();
    lastTune.current = p.mode + ':' + s.slug;
    if (p.mode === 'live') engine.tune(s, 'live', play, network.sources[s.slug]);
    else official.tune(s, play);
    if (p.sounds && play && !wheel) wheelSound('confirm', true, p.muted, p.volume);
    setP((old) => ({
      ...old,
      slug: s.slug,
      recent: [s.slug, ...old.recent.filter((x) => x !== s.slug)].slice(0, 8),
    }));
    setWheel(false);
    setPreviewSlug(null);
    nav('/radio/' + s.slug, { preserveScroll: path === '/' || path.startsWith('/radio/') });
  };
  const previewStep = (delta: number) => {
    if (!list.length) return;
    const next = adjacent(
      list,
      list.findIndex((s) => s.slug === previewStation.slug),
      delta,
    );
    setPreviewSlug(next.slug);
    wheelSound('preview', p.sounds, p.muted, p.volume);
  };
  const step = (n: number) => {
    if (list.length)
      tune(
        adjacent(
          list,
          list.findIndex((s) => s.slug === selected.slug),
          n,
        ),
        (p.mode === 'live' ? engine.intent : official.intent) || path === '/',
      );
  };
  const toggle = () => {
    const player = p.mode === 'live' ? engine : official;
    if (player.intent) {
      player.pause();
      return;
    }
    player.play();
    if (p.sounds) engine.tone();
  };
  const fav = (slug: string) =>
    setP((old) => ({ ...old, favorites: markFavorite(old.favorites, slug) }));
  const openWheel = () => {
    setDialog(null);
    setWheel(true);
    wheelSound('open', p.sounds, p.muted, p.volume);
  };
  const connected = useReceiverKeys(
    !wheel && !dialog,
    (key) => {
      if (document.querySelector('dialog[open]')) return;
      const onDial = path === '/' || path.startsWith('/radio/');
      if (key === 'arrowleft') {
        if (onDial) previewStep(-1);
        else step(-1);
      }
      if (key === 'arrowright') {
        if (onDial) previewStep(1);
        else step(1);
      }
      if (key === 'enter' && onDial) tune(previewStation, true);
      if (key === ' ') {
        if (onDial && previewSlug) tune(previewStation, true);
        else toggle();
      }
      if (key === 'm') patch({ muted: !p.muted });
      if (key === 'w') openWheel();
      if (key === '?') setDialog('keys');
    },
    p.gamepadConfirm,
    p.gamepadCancel,
  );
  const scheduled = p.mode === 'live' ? engine.schedule() : null,
    program = scheduled?.current;
  const live = network.health.find((h) => h.slug === selected.slug) as
    | ((typeof network.health)[number] & { current?: { title?: string; artist?: string } | null })
    | undefined;
  const currentTitle = p.mode === 'demo' ? musicPlayback.track?.title : live?.current?.title,
    artist = p.mode === 'demo' ? musicPlayback.track?.artist : live?.current?.artist;
  useEffect(() => {
    document.title = (path.startsWith('/radio/') ? selected.name + ' · ' : '') + 'Leonida FM';
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTitle || selected.name,
        artist: artist || selected.name,
        album: selected.name,
        artwork: [
          {
            src: new URL(selected.art, location.origin).href,
            sizes: '416x416',
            type: selected.art.includes('.png') ? 'image/png' : 'image/jpeg',
          },
        ],
      });
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch {}
  }, [currentTitle, artist, selected.name, selected.art, playing, path]);
  const mediaActions = useRef({ step, toggle });
  mediaActions.current = { step, toggle };
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const pairs: [MediaSessionAction, () => void][] = [
      ['play', () => (p.mode === 'live' ? engine.play() : official.play())],
      ['pause', () => (p.mode === 'live' ? engine.pause() : official.pause())],
      ['previoustrack', () => mediaActions.current.step(-1)],
      ['nexttrack', () => mediaActions.current.step(1)],
    ];
    for (const [a, fn] of pairs)
      try {
        navigator.mediaSession.setActionHandler(a, fn);
      } catch {}
    return () => {
      for (const [a] of pairs)
        try {
          navigator.mediaSession.setActionHandler(a, null);
        } catch {}
    };
  }, [engine, official, p.mode]);
  const previousTitle = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      p.notices &&
      playing &&
      previousTitle.current &&
      currentTitle &&
      currentTitle !== previousTitle.current
    )
      notify(currentTitle);
    previousTitle.current = currentTitle;
  }, [p.notices, playing, currentTitle]);
  async function share(s: Station) {
    const url = location.origin + '/radio/' + s.slug;
    try {
      if (navigator.share) {
        await navigator.share({ title: s.name + ' · Leonida FM', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      notify(t('Station link copied', 'Enlace copiado'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setShareUrl(url);
        setDialog('share');
      }
    }
  }
  const immersive = async () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        notify(
          t(
            'Fullscreen is unavailable in this browser',
            'Pantalla completa no disponible en este navegador',
          ),
        );
      }
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else nav('/drive');
  };
  const playerStatus: Record<string, string> = {
    idle: t('Ready to tune', 'Lista para sintonizar'),
    preparing: t('Tuning in', 'Sintonizando'),
    buffering: t('Buffering', 'Cargando audio'),
    playing: t('Playing', 'Reproduciendo'),
    paused: t('Paused', 'En pausa'),
    reconnecting: t('Reconnecting', 'Reconectando'),
    unavailable:
      p.mode === 'demo'
        ? p.musicMode === 'soundtrack'
          ? t('Add songs to canciones folder', 'Añade canciones a la carpeta canciones')
          : t('No free signal available', 'No hay señal disponible')
        : t('No active broadcast', 'Sin emisión activa'),
    error: t('Signal lost', 'Señal perdida'),
  };
  const radio = path.startsWith('/radio/'),
    home = path === '/',
    detail = path.startsWith('/stations/')
      ? list.find((s) => s.slug === path.split('/')[2])
      : undefined;
  const navItems = [
    { url: '/', label: t('On air', 'En antena'), icon: Radio },
    { url: '/stations', label: t('Stations', 'Emisoras'), icon: Grid2X2 },
    { url: '/music', label: t('Music library', 'Biblioteca'), icon: Library },
    { url: '/podcasts', label: t('Podcasts', 'Podcasts'), icon: Headphones },
  ];
  const title = stationHeadline(selected);
  const modeLabel =
    p.mode === 'live'
      ? t('Licensed private broadcast', 'Emisión privada autorizada')
      : p.musicMode === 'soundtrack'
        ? t('GTA VI · local collection', 'GTA VI · colección local')
        : t('Real radios · independent live', 'Radios reales · directo independiente');
  const isError = playback.state === 'unavailable' || playback.state === 'error';
  const switchMusicMode = (next: Preferences['musicMode']) => {
    if (next === p.musicMode) {
      if (
        p.mode === 'demo' &&
        musicPlayback.provider !== (next === 'soundtrack' ? 'project' : 'radio-browser')
      )
        official.setListeningMode(next, true);
      return;
    }
    // Keep a single source active; changes never navigate or scroll.
    if (p.mode === 'demo') official.setListeningMode(next, true);
    patch({ musicMode: next });
  };
  const changeMode = (v: Partial<Preferences>) => {
    if (v.musicMode) {
      switchMusicMode(v.musicMode);
      if (Object.keys(v).length === 1) return;
    }
    if (v.mode && v.mode !== p.mode) {
      if (v.mode === 'live') {
        official.stop();
        engine.tune(selected, 'live', false, network.sources[selected.slug]);
      } else {
        engine.pause();
        official.setListeningMode(p.musicMode, false);
        official.tune(selected, false);
      }
      lastTune.current = v.mode + ':' + selected.slug;
    }
    patch(v);
  };
  const onEnter = () => {
    tune(selected, true);
    if (p.selector === 'wheel') openWheel();
  };
  const navLink = (dest: string, label: string, Icon: typeof Radio, active = false) => (
    <a
      key={dest}
      href={dest}
      className={active ? 'nav-link active' : 'nav-link'}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          nav(dest);
        }
      }}
    >
      <Icon size={16} />
      {label}
    </a>
  );
  return (
    <div className={`app ${path === '/drive' ? 'drive' : ''}`}>
      <a className="skip" href="#main">
        {t('Skip to content', 'Saltar al contenido')}
      </a>
      <header className="topbar">
        <div className="top-inner">
          <a
            href="/"
            aria-label="Leonida FM"
            className="brand-link"
            onClick={(e) => {
              e.preventDefault();
              nav('/');
            }}
          >
            <Brand />
          </a>
          <nav aria-label={t('Main navigation', 'Navegación principal')}>
            {navItems.map((item) =>
              navLink(
                item.url,
                item.label,
                item.icon,
                item.url === '/' ? home || radio : path.startsWith(item.url),
              ),
            )}
          </nav>
          <div className="header-tools">
            <button className="network-chip" onClick={() => nav('/status')}>
              <span className={network.online === true ? 'dot green' : 'dot neutral'} />
              {network.online === true
                ? t('System online', 'Sistema en línea')
                : network.online === false
                  ? t('Offline mode', 'Modo sin conexión')
                  : t('Connecting', 'Conectando')}
            </button>
            <span className="tool-rule" />
            <IconButton label={t('Settings', 'Ajustes')} onClick={() => nav('/settings')}>
              <SlidersHorizontal size={18} />
            </IconButton>
            <IconButton
              label={t('Open navigation', 'Abrir navegación')}
              className="menu-btn"
              onClick={() => setDialog('menu')}
            >
              <Menu size={21} />
            </IconButton>
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={(home || radio ? 'home-content' : 'sub-content') + ' container'}
      >
        {p.mode === 'demo' && (
          <ListeningModeToggle
            mode={p.musicMode}
            language={p.language}
            onChange={switchMusicMode}
          />
        )}
        {home || (radio && list.some((s) => s.slug === path.split('/')[2])) ? (
          <>
            <section
              className={`hero ${radio ? 'radio-hero' : ''}`}
              style={stationStyle(selected)}
              aria-labelledby="hero-title"
            >
              <picture className="hero-bg">
                <source
                  media="(max-width: 600px)"
                  srcSet="https://www.rockstargames.com/VI/_next/static/media/Jason_Lucia_Rooftop_landscape.0c6p5do~-8~7..jpg?akim=1&imdensity=1&imwidth=3840"
                />
                <img
                  src="https://www.rockstargames.com/VI/_next/static/media/Vice_City_27.0d2e~w_r93hmh.jpg?akim=1&imdensity=1&imwidth=3840"
                  alt=""
                  fetchPriority="high"
                  width="1536"
                  height="1024"
                />
              </picture>
              <div className="hero-shade" />
              <div className="hero-body">
                <div className="hero-label">
                  <RadioTower size={15} />
                  <span>
                    {home ? t('Leonida radio network', 'Red de radio de Leonida') : modeLabel}
                  </span>
                </div>
                <h1 id="hero-title">
                  {home ? (
                    <>
                      {t('TUNE INTO', 'SINTONIZA')}
                      <br />
                      <em>LEONIDA.</em>
                    </>
                  ) : (
                    <>
                      {title[0]}
                      <br />
                      <em>{title[1]}</em>
                    </>
                  )}
                </h1>
                <p className="hero-description">
                  {home
                    ? t('The city never stops broadcasting.', 'La ciudad nunca deja de emitir.')
                    : isError
                      ? playerStatus[playback.state]
                      : p.mode === 'demo'
                        ? currentTitle
                          ? currentTitle + ' · ' + (artist || '')
                          : t(
                              p.musicMode === 'soundtrack'
                                ? 'Play tracks installed in canciones/'
                                : 'Free live stations in the same genre',
                              p.musicMode === 'soundtrack'
                                ? 'Escucha los archivos guardados en canciones/'
                                : 'Radios gratuitas del mismo género',
                            )
                        : currentTitle ||
                          t('Track information unavailable', 'Sin datos de canción')}
                </p>
                <div className="hero-actions">
                  {home ? (
                    <button className="primary" onClick={onEnter} data-testid="enter">
                      <PlayGlyph size={17} />
                      {t('Enter the frequency', 'Entrar en la frecuencia')}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      onClick={
                        isError && p.mode === 'live'
                          ? () => {
                              changeMode({ mode: 'demo' });
                              official.play();
                            }
                          : toggle
                      }
                    >
                      {playing || busy ? (
                        <Pause size={17} fill="currentColor" />
                      ) : (
                        <PlayGlyph size={17} />
                      )}{' '}
                      {isError && p.mode === 'live'
                        ? t('Play real tracks', 'Escuchar canciones reales')
                        : playing || busy
                          ? t('Pause signal', 'Pausar señal')
                          : t('Play signal', 'Escuchar señal')}
                    </button>
                  )}
                  <button className="hero-secondary" data-testid="wheel-open" onClick={openWheel}>
                    <CircleDot size={18} />
                    {t('Radio wheel', 'Rueda de radio')}
                  </button>
                </div>
              </div>
              {radio && (
                <div className="hero-sleeve" key={selected.slug} aria-hidden="true">
                  <div className="vinyl-disc" />
                  <div className="jacket">
                    <img src={selected.art} alt="" />
                    {selected.artProvenance !== 'original_placeholder' && (
                      <Wordmark station={selected} />
                    )}
                  </div>
                </div>
              )}
              <div className="location-tag">
                <MapPin size={15} />
                <div>
                  <strong>VICE CITY, LEONIDA</strong>
                  <span>
                    <LocalTime lang={p.language} /> ET
                  </span>
                </div>
              </div>
            </section>
            <StationRibbon
              stations={list}
              selected={selected}
              preview={previewSlug ? previewStation : null}
              language={p.language}
              tune={(s) => tune(s, true)}
              step={step}
              onWheel={openWheel}
              onExplorer={() => nav('/stations')}
            />
            {radio && (
              <section className="receiver-detail">
                <div>
                  <Eyebrow>
                    <Disc3 size={14} />
                    {p.mode === 'demo'
                      ? t(
                          p.musicMode === 'soundtrack'
                            ? 'GTA VI music on this computer'
                            : 'Independent radio, matching genre',
                          p.musicMode === 'soundtrack'
                            ? 'Canciones de GTA VI en este ordenador'
                            : 'Radio independiente del mismo género',
                        )
                      : modeLabel}
                  </Eyebrow>
                  <h2>
                    {currentTitle || t('Track information unavailable', 'Sin datos de canción')}
                  </h2>
                  <p>
                    {p.mode === 'demo'
                      ? t(
                          p.musicMode === 'soundtrack'
                            ? 'Songs detected in the local canciones folder'
                            : 'Live external radio · not the official GTA VI soundtrack',
                          p.musicMode === 'soundtrack'
                            ? 'Canciones detectadas en la carpeta local canciones'
                            : 'Radio externa en directo · no es la banda sonora oficial de GTA VI',
                        )
                      : playerStatus[playback.state]}
                  </p>
                </div>
                <Visualizer
                  engine={engine}
                  kind={p.visualizer}
                  moving={playing}
                  label={t('Audio visualization', 'Visualización de audio')}
                />
                <button className="secondary" onClick={() => nav('/stations/' + selected.slug)}>
                  <Info size={16} />
                  {t('Station profile', 'Ficha de emisora')}
                </button>
              </section>
            )}
          </>
        ) : (
          <Suspense fallback={<p className="empty">{t('Tuning in…', 'Sintonizando…')}</p>}>
            {path === '/stations' ? (
              <Directory
                catalog={network.catalog}
                sel={selected}
                p={p}
                t={t}
                tune={(s) => tune(s)}
                fav={fav}
                nav={nav}
              />
            ) : detail ? (
              <Detail
                s={detail}
                catalog={network.catalog}
                t={t}
                lang={p.language}
                tune={() => tune(detail)}
                share={() => void share(detail)}
                fav={() => fav(detail.slug)}
                saved={p.favorites.includes(detail.slug)}
                pause={() => {
                  engine.pause();
                  official.pause();
                }}
              />
            ) : path === '/music' ? (
              <MusicExplorer
                catalog={network.catalog}
                t={t}
                pause={() => {
                  engine.pause();
                  official.pause();
                }}
              />
            ) : path === '/podcasts' ? (
              <PodcastExplorer catalog={network.catalog} t={t} nav={nav} />
            ) : path === '/settings' ? (
              <Settings
                p={p}
                patch={changeMode}
                t={t}
                onDrive={() => nav('/drive')}
                onKeys={() => setDialog('keys')}
                onStatus={() => nav('/status')}
              />
            ) : path === '/status' ? (
              <Status
                t={t}
                health={network.health}
                online={network.online}
                engine={engine}
                playback={playback}
                refresh={network.refresh}
                sources={network.sources[selected.slug] || []}
              />
            ) : path === '/about' ? (
              <About catalog={network.catalog} t={t} nav={nav} />
            ) : path === '/admin' ? (
              <Admin t={t} refresh={network.refresh} />
            ) : path === '/drive' ? (
              <section className="drive-face" style={stationStyle(selected)}>
                <Eyebrow>
                  <CarFront size={18} />
                  {t('Drive mode', 'Modo coche')}
                </Eyebrow>
                <h1>{selected.name}</h1>
                <p>
                  {modeLabel} · {currentTitle || playerStatus[playback.state]}
                </p>
                <div className="drive-controls">
                  <IconButton label={t('Previous station', 'Anterior')} onClick={() => step(-1)}>
                    <SkipBack />
                  </IconButton>
                  <button className="primary" onClick={toggle}>
                    {playing ? <Pause /> : <PlayGlyph />}
                    {playing ? t('Pause', 'Pausa') : t('Play', 'Escuchar')}
                  </button>
                  <IconButton label={t('Next station', 'Siguiente')} onClick={() => step(1)}>
                    <SkipForward />
                  </IconButton>
                </div>
                <p className="subtle">
                  {t(
                    'Use screen controls only while parked.',
                    'Usa los controles de pantalla con el vehículo estacionado.',
                  )}
                </p>
                <button className="text-button" onClick={() => nav('/radio/' + selected.slug)}>
                  {t('Exit drive mode', 'Salir del modo coche')}
                </button>
              </section>
            ) : (
              <section className="page-head">
                <h1>{t('Signal not found', 'Señal no encontrada')}</h1>
                <button className="primary" onClick={() => nav('/')}>
                  {t('Back to the dial', 'Volver al dial')}
                </button>
              </section>
            )}
          </Suspense>
        )}
      </main>
      <footer className="site-foot container">
        <span>{t('Independent fan radio.', 'Radio independiente de aficionados.')}</span>
        <div>
          {navLink('/about', t('About & credits', 'Acerca de'), Info)}
          <button onClick={() => setDialog('keys')}>
            <Keyboard size={14} />
            {t('Controls', 'Controles')}
          </button>
          <button onClick={() => nav('/status')}>
            <Activity size={14} />
            {t('Status', 'Estado')}
          </button>
        </div>
      </footer>
      <RadioDock
        radio={official}
        playback={musicPlayback}
        station={selected}
        mode={p.mode}
        musicMode={p.musicMode}
        onMusicModeChange={switchMusicMode}
        language={p.language}
        onNotice={notify}
      />
      <aside
        className={`player-bar ${p.compact ? 'compact' : ''}`}
        aria-label={t('Radio player', 'Reproductor de radio')}
      >
        <div className="player-inner">
          <div className="now-info">
            <button
              className="thumb"
              aria-label={t('Station profile', 'Ficha de emisora')}
              onClick={() => nav('/stations/' + selected.slug)}
            >
              <img src={selected.art} alt="" />
            </button>
            <div>
              <span className="now-kicker">
                <span className={playing ? 'dot green' : 'dot pink'} />
                {modeLabel}
              </span>
              <strong data-testid="player-station">{selected.name}</strong>
            </div>
            <IconButton
              className="player-heart"
              label={t('Favorite station', 'Guardar emisora favorita')}
              active={p.favorites.includes(selected.slug)}
              onClick={() => fav(selected.slug)}
            >
              <Heart
                size={17}
                fill={p.favorites.includes(selected.slug) ? 'currentColor' : 'none'}
              />
            </IconButton>
          </div>
          <div className="transport">
            <IconButton label={t('Previous station', 'Anterior emisora')} onClick={() => step(-1)}>
              <SkipBack fill="currentColor" size={18} />
            </IconButton>
            <button
              data-testid="play"
              className="play-round"
              aria-label={
                playing || busy
                  ? t('Pause radio', 'Pausar radio')
                  : t('Play radio', 'Escuchar radio')
              }
              onClick={toggle}
            >
              {playing || busy ? <Pause size={22} fill="currentColor" /> : <PlayGlyph size={22} />}
            </button>
            <IconButton label={t('Next station', 'Próxima emisora')} onClick={() => step(1)}>
              <SkipForward fill="currentColor" size={18} />
            </IconButton>
          </div>
          <div className="play-right">
            <div className="signal-block" data-testid="audio-state" data-state={playback.state}>
              <Visualizer
                small
                engine={engine}
                kind={p.visualizer}
                moving={playing}
                label={
                  playing && p.mode === 'live' && p.visualizer === 'reactive'
                    ? t('Audio-reactive spectrum', 'Espectro de audio')
                    : t('Ambient display', 'Indicador ambiental')
                }
              />
              <span>
                {isError || busy
                  ? playerStatus[playback.state]
                  : p.mode === 'demo'
                    ? musicPlayback.provider === 'radio-browser'
                      ? t('Real live stream', 'Emisión real en directo')
                      : musicPlayback.provider === 'project'
                        ? t('Project music files', 'Archivos del proyecto')
                        : t('Local audio', 'Audio local')
                    : playerStatus[playback.state]}
              </span>
            </div>
            <span className="tool-rule" />
            <IconButton
              data-testid="mute"
              label={p.muted ? t('Unmute', 'Activar sonido') : t('Mute', 'Silenciar')}
              aria-pressed={p.muted}
              onClick={() => patch({ muted: !p.muted })}
            >
              {p.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </IconButton>
            <input
              data-testid="volume"
              className="volume"
              aria-label={t('Volume', 'Volumen')}
              type="range"
              min="0"
              max="100"
              value={Math.round(p.volume * 100)}
              onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
              style={{
                background: `linear-gradient(90deg,#ff9c8e ${p.volume * 100}%,#403747 ${p.volume * 100}%)`,
              }}
            />
            <IconButton
              className="full-btn"
              label={t('Fullscreen', 'Pantalla completa')}
              onClick={() => void immersive()}
            >
              <Expand size={17} />
            </IconButton>
          </div>
        </div>
        {radio && p.mode === 'live' && playing && scheduled && (
          <div className="track-progress" aria-label={fmt(scheduled.offset)}>
            <i style={{ width: (scheduled.offset / (program?.duration || 1)) * 100 + '%' }} />
          </div>
        )}
      </aside>
      <span role="status" aria-live="polite" className="sr">
        {selected.name} · {playerStatus[playback.state]}
      </span>
      {toast && (
        <div role="status" className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      {wheel && (
        <Suspense fallback={null}>
          <Wheel
            stations={wheelStations}
            selected={
              wheelStations.some((s) => s.slug === selected.slug)
                ? selected.slug
                : wheelStations[0]?.slug || selected.slug
            }
            onSelect={(slug) => {
              const s = list.find((item) => item.slug === slug);
              if (s) tune(s, true);
            }}
            onClose={() => setWheel(false)}
            language={p.language}
            confirmOnRelease={p.confirmOnRelease}
            gamepadConfirm={p.gamepadConfirm}
            gamepadCancel={p.gamepadCancel}
            sounds={p.sounds}
            muted={p.muted}
            volume={p.volume}
          />
        </Suspense>
      )}
      {dialog === 'menu' && (
        <SimpleDialog title={t('Navigation', 'Navegación')} onClose={() => setDialog(null)}>
          <div className="mobile-nav">
            {[
              ...navItems,
              { url: '/settings', label: t('Settings', 'Ajustes'), icon: Settings2 },
              { url: '/status', label: t('Broadcast status', 'Estado de emisión'), icon: Activity },
              { url: '/about', label: t('About & credits', 'Acerca de'), icon: Info },
              { url: '/drive', label: t('Drive mode', 'Modo coche'), icon: CarFront },
            ].map((item) => navLink(item.url, item.label, item.icon))}
          </div>
        </SimpleDialog>
      )}
      {dialog === 'keys' && (
        <SimpleDialog
          title={t('Tuning controls', 'Controles de sintonización')}
          onClose={() => setDialog(null)}
        >
          <dl className="key-list">
            {[
              [
                '← / →',
                t(
                  'Browse stations without interrupting audio',
                  'Explorar emisoras sin cortar el audio',
                ),
              ],
              ['Enter', t('Tune the highlighted station', 'Sintonizar emisora resaltada')],
              ['W', t('Open or close wheel', 'Abrir o cerrar la rueda')],
              ['Esc', t('Close selection', 'Cerrar selección')],
              [t('Space', 'Espacio'), t('Play or pause', 'Reproducir o pausar')],
              ['M', t('Mute', 'Silenciar')],
              ['D-pad', t('Change station', 'Cambiar emisora')],
              [t('Stick', 'Palanca'), t('Point inside the wheel', 'Apuntar dentro de la rueda')],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>
                  <kbd>{k}</kbd>
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            {connected
              ? t('Gamepad connected', 'Mando conectado')
              : t(
                  'No gamepad detected. Press a controller button to connect.',
                  'No se detecta mando. Pulsa un botón del mando para conectarlo.',
                )}
          </p>
        </SimpleDialog>
      )}
      {dialog === 'share' && (
        <SimpleDialog
          title={t('Share station', 'Compartir emisora')}
          onClose={() => setDialog(null)}
        >
          <input
            readOnly
            value={shareUrl}
            aria-label={t('Station link', 'Enlace de emisora')}
            onFocus={(e) => e.target.select()}
          />
        </SimpleDialog>
      )}
    </div>
  );
}
