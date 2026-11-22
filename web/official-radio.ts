import type { PlayerState } from './audio';
import type { ListeningMode, Station, Track } from './types';

/**
 * The primary provider connects directly to free independent HTTPS radio streams
 * from Radio Browser. This is genre-matched music, not GTA VI's licensed tracks.
 * Legacy YouTube / yt-dlp adapters remain optional; local files stay on-device.
 */
type VideoState = -1 | 0 | 1 | 2 | 3 | 5;
interface EmbeddedPlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
}
interface YouTubeAPI {
  Player: new (
    element: HTMLElement,
    config: {
      host: string;
      width: number;
      height: number;
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady: (event: { target: EmbeddedPlayer }) => void;
        onStateChange: (event: { data: VideoState }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => EmbeddedPlayer;
}
declare global {
  interface Window {
    YT?: YouTubeAPI;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let loader: Promise<YouTubeAPI> | undefined;
function youtubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!loader) {
    loader = new Promise<YouTubeAPI>((resolve, reject) => {
      const prior = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prior?.();
        if (window.YT?.Player) resolve(window.YT);
        else reject(new Error('YouTube iframe API unavailable'));
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => reject(new Error('Could not load YouTube'));
      document.head.appendChild(script);
    }).catch((error: unknown) => {
      loader = undefined;
      throw error;
    });
  }
  return loader;
}
export type MusicProvider = 'radio-browser' | 'project' | 'youtube' | 'local' | 'yt-dlp';
interface ProjectSong {
  filename: string;
  url: string;
  title: string;
  artist: string;
  confidence: Track['confidence'];
  catalogMatched: boolean;
}
interface ProjectManifest {
  station: string;
  songs: ProjectSong[];
  totalCatalog: number;
  available: number;
  matched: number;
  missing: { artist: string; title: string }[];
}
interface CommunityStream {
  id: string;
  name: string;
  url: string;
  codec: string;
  bitrate: number;
  homepage: string | null;
  tags: string;
}
export interface MusicPlayback {
  state: PlayerState;
  issue: string;
  attempts: number;
  kind: 'demo'; // Legacy preference key, currently meaning real external/local music.
  track: Track | null;
  index: number;
  total: number;
  started: boolean;
  provider: MusicProvider;
  videoUrl: string;
  localAvailable: number;
  resolverAvailable: boolean;
  streamHomepage: string;
  libraryAvailable: number;
  libraryCatalogTotal: number;
  libraryMatched: number;
}
const initial: MusicPlayback = {
  state: 'idle',
  issue: '',
  attempts: 0,
  kind: 'demo',
  track: null,
  index: 0,
  total: 0,
  started: false,
  provider: 'radio-browser',
  videoUrl: '',
  localAvailable: 0,
  resolverAvailable: false,
  streamHomepage: '',
  libraryAvailable: 0,
  libraryCatalogTotal: 0,
  libraryMatched: 0,
};
const CLOUDFLARE_MODE = import.meta.env?.VITE_LEONIDA_CLOUDFLARE === '1';
const PAGES_MODE = import.meta.env?.VITE_LEONIDA_PAGES === '1' || CLOUDFLARE_MODE;
const validVideoId = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id);
export function videoCandidates(track: Track): string[] {
  return [...new Set([track.youtubeId, ...(track.youtubeAlternates || [])])].filter(
    (id): id is string => typeof id === 'string' && validVideoId(id),
  );
}
const allowedAudio = (file: File) =>
  file.type.startsWith('audio/') || /\.(?:mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(file.name);

export class OfficialRadio {
  private listeners = new Set<() => void>();
  private snapshot: MusicPlayback = initial;
  private player: EmbeddedPlayer | null = null;
  private localPlayer: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private container: HTMLElement | null = null;
  private tracks: Track[] = [];
  private uploaded = new Map<string, File[]>();
  private listeningMode: ListeningMode = 'radio';
  private projectSongs: ProjectSong[] = [];
  private projectObjectUrls: string[] = [];
  private projectStation = '';
  private projectMatched = 0;
  private currentIndex = 0;
  private alternateIndex = 0;
  private blockedVideos = new Set<string>();
  private station: Station | null = null;
  private generation = 0;
  private wanted = false;
  private volume = 0.65;
  private muted = false;
  private provider: MusicProvider = 'radio-browser';
  private communityStreams: CommunityStream[] = [];
  private communityStation = '';
  private communityFailures = 0;
  private requestAbort: AbortController | null = null;
  private resolverAvailable = false;
  private watchdog: ReturnType<typeof setTimeout> | undefined;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  get intent() {
    return this.wanted;
  }
  get currentTrack(): Track | null {
    if (this.provider === 'radio-browser') {
      const stream = this.communityStreams[this.currentIndex];
      return stream
        ? {
            title: stream.name,
            artist: 'Radio independiente en directo · no es música de GTA VI',
            confidence: 'COMMUNITY',
            evidence: ['https://www.radio-browser.info/'],
          }
        : null;
    }
    if (this.provider === 'project') {
      const song = this.projectSongs[this.currentIndex];
      return song
        ? { title: song.title, artist: song.artist, confidence: song.confidence, evidence: [] }
        : null;
    }
    if (this.provider === 'local') {
      const file = this.localFiles()[this.currentIndex];
      return file
        ? {
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Local file',
            confidence: 'COMMUNITY',
            evidence: [],
          }
        : null;
    }
    return this.tracks[this.currentIndex] || null;
  }
  private localFiles() {
    return this.uploaded.get(this.station?.slug || '') || [];
  }
  attach = (node: HTMLElement | null) => {
    if (node === this.container) return;
    if (!node) this.release();
    this.container = node;
  };
  setVolume(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.localPlayer) {
      this.localPlayer.volume = volume;
      this.localPlayer.muted = muted;
    }
    this.applyVolume();
  }
  private applyVolume() {
    if (!this.player) return;
    try {
      this.player.setVolume(Math.round(this.volume * 100));
      if (this.muted || this.volume === 0) this.player.mute();
      else this.player.unMute();
    } catch {
      // Provider API may not yet be ready.
    }
  }
  setLocalResolverAvailable(available: boolean) {
    // Never switch away from the free radio stream automatically.
    this.resolverAvailable = available;
    if (!available && this.provider === 'yt-dlp') {
      this.provider = 'radio-browser';
      this.wanted = false;
      this.release();
      this.emit('paused', 'Local yt-dlp is offline. Free radio is available instead.');
    } else this.emit(this.snapshot.state, this.snapshot.issue);
  }
  private videoId(): string {
    return (
      videoCandidates(this.tracks[this.currentIndex] || ({} as Track))[this.alternateIndex] || ''
    );
  }
  private emit(state: PlayerState, issue = '') {
    const id = this.provider === 'youtube' || this.provider === 'yt-dlp' ? this.videoId() : '';
    const stream =
      this.provider === 'radio-browser' ? this.communityStreams[this.currentIndex] : null;
    this.snapshot = {
      state,
      issue,
      attempts:
        this.provider === 'radio-browser' ? this.communityFailures : this.blockedVideos.size,
      kind: 'demo',
      track: this.currentTrack,
      index: this.currentIndex,
      total:
        this.provider === 'project'
          ? this.projectSongs.length
          : this.provider === 'radio-browser'
            ? this.communityStreams.length
            : this.provider === 'local'
              ? this.localFiles().length
              : this.tracks.length,
      started: this.snapshot.started || this.wanted,
      provider: this.provider,
      videoUrl: id ? 'https://www.youtube.com/watch?v=' + id : '',
      localAvailable: this.localFiles().length,
      resolverAvailable: this.resolverAvailable,
      streamHomepage: stream?.homepage || '',
      libraryAvailable: this.projectSongs.length,
      libraryCatalogTotal: this.station?.tracks?.length || 0,
      libraryMatched: this.projectMatched,
    };
    for (const fn of this.listeners) fn();
  }
  private release() {
    ++this.generation;
    clearTimeout(this.watchdog);
    this.watchdog = undefined;
    this.requestAbort?.abort();
    this.requestAbort = null;
    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // A third-party iframe may already have been removed.
      }
      this.player = null;
    }
    if (this.localPlayer) {
      this.localPlayer.pause();
      this.localPlayer.removeAttribute('src');
      this.localPlayer.load();
      this.localPlayer.remove();
      this.localPlayer = null;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.container?.replaceChildren();
  }
  /** Explicit user-selected mode. Never silently replace GTA tracks with unrelated radio. */
  setListeningMode(mode: ListeningMode, play = this.wanted) {
    if (
      mode === this.listeningMode &&
      this.provider === (mode === 'soundtrack' ? 'project' : 'radio-browser')
    )
      return;
    this.listeningMode = mode;
    this.provider = mode === 'soundtrack' ? 'project' : 'radio-browser';
    this.currentIndex = 0;
    this.wanted = play;
    if (this.station) void this.load();
  }
  tune(station: Station, play = true) {
    this.release();
    this.station = station;
    // Fan/secondary listings are never silently presented as confirmed in-game tracks.
    this.tracks = station.tracks.filter(
      (track) => track.confidence === 'OFFICIAL' && videoCandidates(track).length,
    );
    // Fast HTTPS radio is the default: no YouTube, yt-dlp or subscription required.
    this.provider = this.listeningMode === 'soundtrack' ? 'project' : 'radio-browser';
    this.disposeProjectUrls();
    this.projectSongs = [];
    this.projectStation = '';
    this.projectMatched = 0;
    this.communityStreams = [];
    this.communityStation = '';
    this.communityFailures = 0;
    this.blockedVideos.clear();
    this.currentIndex = 0;
    this.alternateIndex = 0;
    this.wanted = play;
    if (play) void this.load();
    else this.emit(this.currentTrack ? 'idle' : 'unavailable');
  }
  private disposeProjectUrls() {
    this.projectObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.projectObjectUrls = [];
  }

  /** No selected file is uploaded or stored on the server. */
  importFiles(files: File[]): number {
    if (!this.station) return 0;
    const accepted = files.filter(allowedAudio).slice(0, 100);
    if (!accepted.length) return 0;
    this.uploaded.set(this.station.slug, accepted);
    this.provider = 'local';
    this.currentIndex = 0;
    this.alternateIndex = 0;
    this.wanted = true;
    void this.load();
    return accepted.length;
  }
  selectProvider(provider: MusicProvider) {
    if (provider === 'local' && !this.localFiles().length) return;
    if (provider === 'project') this.listeningMode = 'soundtrack';
    if (provider === 'radio-browser') this.listeningMode = 'radio';
    if (provider === 'yt-dlp' && !this.resolverAvailable) return;
    if (provider === this.provider) return;
    this.provider = provider;
    this.currentIndex = 0;
    this.alternateIndex = 0;
    this.blockedVideos.clear();
    this.communityFailures = 0;
    this.wanted = true;
    void this.load();
  }
  play() {
    if (!this.station) return;
    this.wanted = true;
    if (
      this.provider !== 'local' &&
      (this.snapshot.state === 'unavailable' || this.snapshot.state === 'error')
    ) {
      this.blockedVideos.clear();
      this.communityFailures = 0;
      if (this.provider === 'project') {
        // Files may have been copied while the app was open; rescan on retry.
        this.projectStation = '';
      }
      if (this.provider === 'radio-browser') {
        this.communityStreams = [];
        this.communityStation = '';
        this.currentIndex = 0;
      }
      this.alternateIndex = 0;
      void this.load();
      return;
    }
    if (this.localPlayer) {
      void this.localPlayer.play().catch(() => {
        this.wanted = false;
        this.emit('error', 'Local audio could not start. Check the file format.');
      });
    } else if (this.player) {
      try {
        this.player.playVideo();
        this.emit('preparing');
      } catch {
        void this.load();
      }
    } else void this.load();
  }
  refreshProjectLibrary() {
    if (this.provider !== 'project') return;
    this.projectStation = '';
    this.disposeProjectUrls();
    this.currentIndex = 0;
    this.wanted = true;
    void this.load();
  }
  pause() {
    this.wanted = false;
    try {
      this.player?.pauseVideo();
      this.localPlayer?.pause();
    } catch {
      // The video may still be initializing.
    }
    this.emit('paused');
  }
  stop() {
    this.wanted = false;
    this.release();
    this.emit('idle');
  }
  nextTrack(delta: number) {
    const length =
      this.provider === 'project'
        ? this.projectSongs.length
        : this.provider === 'radio-browser'
          ? this.communityStreams.length
          : this.provider === 'local'
            ? this.localFiles().length
            : this.tracks.length;
    if (length < 2) return;
    this.currentIndex = (this.currentIndex + delta + length) % length;
    if (this.provider === 'radio-browser') this.communityFailures = 0;
    this.alternateIndex = 0;
    if (this.snapshot.state === 'unavailable' || this.snapshot.state === 'error')
      this.blockedVideos.clear();
    this.wanted = true;
    void this.load();
  }
  private nextAvailableVideo(): boolean {
    if (!this.tracks.length) return false;
    const initialIndex = this.currentIndex;
    for (let count = 0; count < this.tracks.length; count++) {
      const ids = videoCandidates(this.tracks[this.currentIndex]);
      const start = this.currentIndex === initialIndex ? this.alternateIndex + 1 : 0;
      for (let i = start; i < ids.length; i++) {
        if (!this.blockedVideos.has(ids[i])) {
          this.alternateIndex = i;
          return true;
        }
      }
      this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
      this.alternateIndex = -1;
    }
    return false;
  }
  private async load() {
    this.release();
    const mine = this.generation;
    if (
      (!this.currentTrack && this.provider !== 'radio-browser' && this.provider !== 'project') ||
      !this.container
    ) {
      this.wanted = false;
      this.emit('unavailable', 'No playable source is configured for this station.');
      return;
    }
    this.emit('preparing');
    if (this.provider === 'radio-browser') {
      await this.loadCommunityRadio(mine);
      return;
    }
    if (this.provider === 'project') {
      await this.loadProjectLibrary(mine);
      return;
    }
    if (this.provider === 'local') {
      const file = this.localFiles()[this.currentIndex];
      if (!file || !this.container) return;
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'auto';
      audio.className = 'local-audio';
      audio.setAttribute('aria-label', 'Local audio file');
      this.objectUrl = URL.createObjectURL(file);
      audio.src = this.objectUrl;
      audio.volume = this.volume;
      audio.muted = this.muted;
      audio.onplaying = () => {
        if (mine !== this.generation) return;
        this.wanted = true;
        this.emit('playing');
      };
      audio.onwaiting = () => mine === this.generation && this.emit('buffering');
      audio.onpause = () => {
        if (mine === this.generation && !audio.ended) {
          this.wanted = false;
          this.emit('paused');
        }
      };
      audio.onended = () => {
        if (mine !== this.generation) return;
        if (this.localFiles().length > 1 && this.wanted) this.nextTrack(1);
        else {
          this.wanted = false;
          this.emit('paused');
        }
      };
      audio.onerror = () => {
        if (mine !== this.generation) return;
        this.wanted = false;
        this.emit('error', 'This audio file could not be decoded. Try MP3 or AAC.');
      };
      this.localPlayer = audio;
      this.container.appendChild(audio);
      if (this.wanted)
        void audio.play().catch(() => {
          if (mine !== this.generation) return;
          this.wanted = false;
          this.emit('paused', 'Press play on the audio controls to start listening.');
        });
      return;
    }
    const videoId = this.videoId();
    if (!videoId) {
      this.wanted = false;
      this.emit('unavailable', 'No YouTube video is available for this station.');
      return;
    }
    if (this.provider === 'yt-dlp') {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'auto';
      audio.className = 'local-audio';
      audio.setAttribute('aria-label', 'Local yt-dlp audio player');
      audio.src = '/api/local-audio/stream/' + encodeURIComponent(videoId);
      audio.volume = this.volume;
      audio.muted = this.muted;
      audio.onplaying = () => {
        if (mine !== this.generation) return;
        this.wanted = true;
        this.emit('playing');
      };
      audio.onwaiting = () => {
        if (mine === this.generation) this.emit('buffering');
      };
      audio.onpause = () => {
        if (mine === this.generation && !audio.ended) {
          this.wanted = false;
          this.emit('paused');
        }
      };
      audio.onended = () => {
        if (mine !== this.generation) return;
        if (this.tracks.length > 1 && this.wanted) this.nextTrack(1);
        else {
          this.wanted = false;
          this.emit('paused');
        }
      };
      audio.onerror = () => {
        if (mine !== this.generation) return;
        this.blockedVideos.add(videoId);
        // Keep skips bounded to avoid hammering YouTube when extractor setup is broken.
        if (this.blockedVideos.size < 3 && this.nextAvailableVideo()) {
          void this.load();
        } else {
          this.wanted = false;
          this.release();
          this.emit(
            'unavailable',
            'Local yt-dlp could not play these tracks. Update yt-dlp or use your audio files.',
          );
        }
      };
      this.localPlayer = audio;
      this.container.appendChild(audio);
      if (this.wanted)
        void audio.play().catch(() => {
          if (mine !== this.generation) return;
          this.wanted = false;
          this.emit('paused', 'Press Play inside the audio player to start listening.');
        });
      return;
    }
    try {
      const YT = await youtubeAPI();
      if (this.generation !== mine || !this.wanted || !this.container) return;
      const target = document.createElement('div');
      target.setAttribute('data-testid', 'official-video');
      this.container.appendChild(target);
      this.player = new YT.Player(target, {
        host: 'https://www.youtube-nocookie.com',
        width: 272,
        height: 204,
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: location.origin,
        },
        events: {
          onReady: ({ target: player }) => {
            if (mine !== this.generation) return;
            this.player = player;
            this.applyVolume();
            if (this.wanted) player.playVideo();
            // Some provider failures do not trigger onError. Never auto-skip on
            // timeout: user interaction or autoplay may still be required.
            this.watchdog = setTimeout(() => {
              if (mine !== this.generation || this.snapshot.state === 'playing') return;
              this.wanted = false;
              this.emit(
                'paused',
                'The video did not start. Press play inside YouTube or choose another song.',
              );
            }, 16000);
          },
          onStateChange: ({ data }) => {
            if (mine !== this.generation) return;
            if (data === 1) {
              this.wanted = true;
              clearTimeout(this.watchdog);
              this.emit('playing');
            }
            if (data === 3) this.emit('buffering');
            if (data === 2) {
              this.wanted = false;
              this.emit('paused');
            }
            if (data === 0 && this.wanted) {
              if (this.tracks.length > 1) this.nextTrack(1);
              else {
                this.wanted = false;
                this.emit('paused');
              }
            }
          },
          onError: ({ data }) => {
            if (mine !== this.generation) return;
            clearTimeout(this.watchdog);
            if (data === 153) {
              this.wanted = false;
              this.emit('error', 'YouTube error 153: referrer identification was rejected.');
              return;
            }
            if (![2, 5, 100, 101, 150].includes(data)) {
              this.wanted = false;
              this.emit('error', 'YouTube error ' + data + '. Try another source.');
              return;
            }
            this.blockedVideos.add(videoId);
            if (this.nextAvailableVideo()) void this.load();
            else {
              this.wanted = false;
              this.alternateIndex = 0;
              this.release();
              this.emit(
                'unavailable',
                'YouTube has no embeddable videos left for this station (last error ' + data + ').',
              );
            }
          },
        },
      });
    } catch {
      if (mine !== this.generation) return;
      this.wanted = false;
      this.emit(
        'error',
        'Could not load the YouTube player. Check your connection or content blocker.',
      );
    }
  }
  /** Fast, first-party playback of audio stored in canciones/<slug>/ on this PC. */
  private async loadProjectLibrary(mine: number) {
    if (!this.station || !this.container) return;
    if (this.projectStation !== this.station.slug) {
      const controller = new AbortController();
      this.requestAbort = controller;
      try {
        if (PAGES_MODE && !CLOUDFLARE_MODE) {
          const { readPersonalSongs } = await import('./personal-library');
          const songs = await readPersonalSongs(this.station.slug);
          if (mine !== this.generation || controller.signal.aborted) return;
          this.disposeProjectUrls();
          this.projectSongs = songs.map((song) => {
            const url = URL.createObjectURL(song.blob);
            this.projectObjectUrls.push(url);
            const label = song.name.replace(/\.[^/.]+$/, '');
            const separator = label.indexOf(' - ');
            return {
              filename: song.name,
              url,
              artist: separator >= 0 ? label.slice(0, separator) : this.station!.name,
              title: separator >= 0 ? label.slice(separator + 3) : label,
              confidence: 'COMMUNITY' as const,
              catalogMatched: false,
            };
          });
          this.projectMatched = this.projectSongs.length;
        } else {
          const manifestUrl = CLOUDFLARE_MODE
            ? '/library/' + encodeURIComponent(this.station.slug) + '.json'
            : '/api/song-library/' + encodeURIComponent(this.station.slug);
          const response = await fetch(manifestUrl, {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!response.ok) throw new Error('Library HTTP ' + response.status);
          const manifest = (await response.json()) as ProjectManifest;
          if (mine !== this.generation || controller.signal.aborted) return;
          this.projectSongs = manifest.songs.filter(
            (s) => typeof s.url === 'string' && s.url.startsWith('/canciones/') &&
              typeof s.title === 'string' && typeof s.artist === 'string',
          );
          this.projectMatched = manifest.matched;
        }
        this.projectStation = this.station.slug;
        if (this.currentIndex >= this.projectSongs.length) this.currentIndex = 0;
      } catch {
        if (mine !== this.generation || controller.signal.aborted) return;
        this.wanted = false;
        this.emit('unavailable', CLOUDFLARE_MODE ? 'Online GTA VI library unavailable; please contact the beta administrator.' : PAGES_MODE ? 'Cannot read the browser library. Import a canciones folder.' : 'Cannot read canciones folder. Check the local server.');
        return;
      } finally {
        if (this.requestAbort === controller) this.requestAbort = null;
      }
    }
    if (mine !== this.generation || !this.container) return;
    const song = this.projectSongs[this.currentIndex];
    if (!song) {
      this.wanted = false;
      this.emit(
        'unavailable',
        CLOUDFLARE_MODE ? 'No GTA VI tracks are published for this station.' : PAGES_MODE ? 'No songs imported for ' + this.station.slug + '. Import the canciones folder from Sources & options.' : 'No audio files in canciones/' + this.station.slug + '/. Add your MP3 or M4A songs.',
      );
      return;
    }
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'auto';
    audio.className = 'local-audio';
    audio.setAttribute('aria-label', 'GTA VI music from project folder');
    audio.src = song.url;
    audio.loop = this.projectSongs.length === 1;
    audio.volume = this.volume;
    audio.muted = this.muted;
    audio.onplaying = () => {
      if (mine !== this.generation) return;
      this.wanted = true;
      this.emit('playing');
    };
    audio.onwaiting = () => mine === this.generation && this.emit('buffering');
    audio.onpause = () => {
      if (mine === this.generation && !audio.ended) {
        this.wanted = false;
        this.emit('paused');
      }
    };
    audio.onended = () => {
      if (mine !== this.generation) return;
      if (this.wanted && this.projectSongs.length > 1) this.nextTrack(1);
      else if (!audio.loop) {
        this.wanted = false;
        this.emit('paused');
      }
    };
    audio.onerror = () => {
      if (mine !== this.generation) return;
      this.wanted = false;
      this.emit('error', 'Audio file could not be decoded. Use MP3/M4A or check its contents.');
    };
    this.localPlayer = audio;
    this.container.appendChild(audio);
    this.emit('preparing');
    if (this.wanted)
      void audio.play().catch(() => {
        if (mine !== this.generation) return;
        this.wanted = false;
        this.emit('paused', 'Press Play to allow the browser to start audio.');
      });
  }

  /** External live radios selected by genre. These are NOT Rockstar's game stations. */
  private async loadCommunityRadio(mine: number) {
    if (!this.station || !this.container) return;
    if (this.communityStation !== this.station.slug || !this.communityStreams.length) {
      const controller = new AbortController();
      this.requestAbort = controller;
      try {
        const result = PAGES_MODE
          ? { stations: await (await import('./browser-radio')).findLiveStations(this.station.slug, controller.signal) }
          : await (async () => {
              const response = await fetch(
                '/api/free-radio/stations/' + encodeURIComponent(this.station!.slug),
                { signal: controller.signal },
              );
              if (!response.ok) throw new Error('Radio directory returned HTTP ' + response.status);
              return (await response.json()) as { stations?: CommunityStream[] };
            })();
        if (mine !== this.generation || !this.wanted) return;
        if (!Array.isArray(result.stations) || !result.stations.length)
          throw new Error('No compatible HTTPS stations were found');
        this.communityStreams = result.stations
          .filter(
            (item) =>
              item &&
              typeof item.url === 'string' &&
              item.url.startsWith('https://') &&
              typeof item.name === 'string',
          )
          .slice(0, 12);
        if (!this.communityStreams.length) throw new Error('No compatible HTTPS radio sources');
        this.communityStation = this.station.slug;
        this.currentIndex = 0;
      } catch (error) {
        if (mine !== this.generation || controller.signal.aborted) return;
        this.wanted = false;
        this.emit(
          'unavailable',
          'Free radio directory unreachable. Check internet or try again. ' +
            (error instanceof Error ? error.message : ''),
        );
        return;
      } finally {
        if (this.requestAbort === controller) this.requestAbort = null;
      }
    }
    if (mine !== this.generation || !this.wanted || !this.container) return;
    const entry = this.communityStreams[this.currentIndex];
    if (!entry) {
      this.wanted = false;
      this.emit('unavailable', 'No free radio stream is available for this station.');
      return;
    }
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'auto';
    audio.className = 'local-audio';
    audio.setAttribute('aria-label', 'Independent internet radio ' + entry.name);
    audio.src = entry.url;
    audio.volume = this.volume;
    audio.muted = this.muted;
    let hasPlayed = false;
    const failed = () => {
      if (mine !== this.generation) return;
      clearTimeout(this.watchdog);
      this.communityFailures++;
      if (this.communityFailures < this.communityStreams.length) {
        this.currentIndex = (this.currentIndex + 1) % this.communityStreams.length;
        void this.load();
      } else {
        this.wanted = false;
        this.release();
        this.emit(
          'unavailable',
          'All independent radios for this genre failed. Retry later or import your own audio.',
        );
      }
    };
    audio.onplaying = () => {
      if (mine !== this.generation) return;
      hasPlayed = true;
      clearTimeout(this.watchdog);
      this.wanted = true;
      this.emit('playing');
    };
    audio.onwaiting = () => {
      if (mine === this.generation) this.emit('buffering');
    };
    audio.onpause = () => {
      if (mine === this.generation && !audio.ended) {
        this.wanted = false;
        this.emit('paused');
      }
    };
    audio.onerror = failed;
    audio.onended = failed;
    this.localPlayer = audio;
    this.container.appendChild(audio);
    this.emit('buffering');
    this.watchdog = setTimeout(() => {
      if (mine === this.generation && !hasPlayed && this.wanted) failed();
    }, 9000);
    if (this.wanted)
      void audio.play().catch((error: unknown) => {
        if (mine !== this.generation) return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          clearTimeout(this.watchdog);
          this.wanted = false;
          this.emit('paused', 'Press Play to allow the browser to start audio.');
        } else failed();
      });
  }

  destroy() {
    this.wanted = false;
    this.release();
    this.disposeProjectUrls();
    this.listeners.clear();
  }
}
