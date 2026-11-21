import { scheduleAt } from '../server/schedule.mjs';
import type { Mode, Programs, Schedule, Source, Station, StreamQuality } from './types';
export type PlayerState =
  | 'idle'
  | 'preparing'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'reconnecting'
  | 'unavailable'
  | 'error';
export interface Playback {
  state: PlayerState;
  attempts: number;
  issue: string;
  kind: string;
}
export const retryDelay = (attempt: number, jitter = Math.random()) =>
  Math.min(12000, 600 * 2 ** Math.max(0, attempt - 1)) * (0.85 + 0.3 * jitter);
export function chooseLive(
  sources: Source[],
  audio: HTMLAudioElement,
  skip?: (url: string) => boolean,
  quality: StreamQuality = 'auto',
) {
  let selected: Source | undefined;
  let bestHealth = Infinity;
  let bestBitrate = Infinity;
  // The API supplies operator order. Keep it for ties and streams with no declared bitrate.
  for (const source of sources) {
    if (!source.enabled || !source.url || skip?.(source.url)) continue;
    if (
      source.type !== 'icecast' &&
      !(source.type === 'hls' && audio.canPlayType('application/vnd.apple.mpegurl'))
    )
      continue;
    const healthRank =
      source.health === 'online'
        ? 0
        : source.health === 'offline' || source.health === 'unreachable'
          ? 2
          : 1;
    let bitrateRank = 0;
    if (quality !== 'auto') {
      const bitrate = source.bitrateKbps;
      bitrateRank = bitrate === undefined ? Infinity : quality === 'lowest' ? bitrate : -bitrate;
    }
    if (healthRank < bestHealth || (healthRank === bestHealth && bitrateRank < bestBitrate)) {
      selected = source;
      bestHealth = healthRank;
      bestBitrate = bitrateRank;
    }
  }
  return selected;
}
export class RadioEngine {
  private element: HTMLAudioElement | null = null;
  private generation = 0;
  private wanted = false;
  private attempts = 0;
  private timer = 0;
  private boundary = 0;
  private startup = 0;
  private mediaCleanup: (() => void) | null = null;
  private timeDelta = 0;
  private gain: GainNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private activeUrl = '';
  private activeMode: Mode = 'demo';
  private quality: StreamQuality = 'auto';
  private clockedId = '';
  private volume = 0.65;
  private muted = false;
  private station: Station | null = null;
  private programs: Programs = {};
  private sources: Source[] = [];
  private liveFailures = new Map<string, 'temporary' | 'unsupported'>();
  private listeners = new Set<() => void>();
  private snapshot: Playback = { state: 'idle', attempts: 0, issue: '', kind: 'demo' };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  get media() {
    return this.element;
  }
  get intent() {
    return this.wanted;
  }
  get context() {
    return this.audioContext;
  }
  get now() {
    return Date.now() + this.timeDelta;
  }
  schedule(): Schedule | null {
    return this.station && this.programs[this.station.slug]?.length
      ? (scheduleAt(this.station.slug, this.programs, this.now) as Schedule)
      : null;
  }
  setClock(delta: number) {
    if (Number.isFinite(delta)) {
      this.timeDelta = delta;
      this.resync();
    }
  }
  setData(programs: Programs) {
    this.programs = programs;
    this.resync();
  }
  setSources(sources: Source[], stationSlug?: string) {
    // A late HTTP response for the last station cannot attach its feed to the current dial.
    if (stationSlug && stationSlug !== this.station?.slug) return;
    this.sources = sources;
    this.reconcileLiveSources();
  }
  setQuality(quality: StreamQuality) {
    if (quality === this.quality) return;
    this.quality = quality;
    this.reconcileLiveSources();
  }
  private reconcileLiveSources() {
    if (!this.station || this.activeMode !== 'live') return;
    const probe = this.element ?? document.createElement('audio');
    const available = chooseLive(this.sources, probe, undefined, this.quality);
    if (!available) {
      if (this.snapshot.state !== 'unavailable' || this.wanted) {
        this.wanted = false;
        this.attempts = 0;
        this.clear();
        this.emit('unavailable');
      }
      return;
    }
    if (this.snapshot.state === 'unavailable') {
      this.emit('idle');
      return;
    }
    if (this.element && this.wanted && this.nextLive(probe)?.url !== this.activeUrl) this.connect();
  }
  setVolume(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (!this.element) return;
    this.element.volume = volume;
    this.element.muted = muted;
    if (this.gain) this.gain.gain.value = this.element.volume === volume ? 1 : volume;
  }
  tune(station: Station, mode: Mode, play: boolean, sources: Source[] = []) {
    this.clear();
    this.liveFailures.clear();
    this.station = station;
    this.activeMode = mode;
    this.sources = sources;
    this.attempts = 0;
    this.wanted = play;
    if (play) this.connect();
    else
      this.emit(
        mode === 'live' && !chooseLive(sources, document.createElement('audio'))
          ? 'unavailable'
          : 'idle',
      );
  }
  unlock() {
    try {
      const C =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (C) {
        this.audioContext ??= new C();
        if (this.audioContext.state === 'suspended')
          void this.audioContext.resume().catch(() => {});
      }
    } catch {
      /* Native media remains available. */
    }
  }
  play() {
    if (!this.station) return;
    this.unlock();
    this.wanted = true;
    this.attempts = 0;
    this.liveFailures.clear();
    this.connect();
  }
  pause() {
    this.wanted = false;
    this.attempts = 0;
    this.clear();
    this.emit('paused');
  }
  resync() {
    if (
      !this.wanted ||
      !this.element ||
      this.activeMode !== 'demo' ||
      this.snapshot.state !== 'playing'
    )
      return;
    const entry = this.schedule();
    if (!entry?.current) return;
    if (this.clockedId !== entry.current.id) {
      this.connect();
      return;
    }
    if (Math.abs(this.element.currentTime - entry.offset) > 1.5 && this.element.readyState >= 1)
      try {
        this.element.currentTime = entry.offset;
      } catch {}
    this.planBoundary(entry);
  }
  tone() {
    const ctx = this.audioContext;
    if (!ctx || ctx.state !== 'running' || this.muted || this.volume === 0) return;
    const osc = ctx.createOscillator(),
      v = ctx.createGain();
    osc.frequency.setValueAtTime(580, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(820, ctx.currentTime + 0.055);
    v.gain.setValueAtTime(0.024 * this.volume, ctx.currentTime);
    v.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.075);
    osc.connect(v).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => {
      v.disconnect();
      osc.disconnect();
    };
  }
  private emit(state: PlayerState, issue = '') {
    this.snapshot = { state, issue, attempts: this.attempts, kind: this.activeMode };
    for (const l of this.listeners) l();
  }
  private clear() {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.boundary);
    clearTimeout(this.startup);
    this.mediaCleanup?.();
    this.mediaCleanup = null;
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element.load();
      this.element.remove();
      this.element = null;
    }
    this.sourceNode?.disconnect();
    this.analyser?.disconnect();
    this.gain?.disconnect();
    this.sourceNode = null;
    this.analyser = null;
    this.gain = null;
    this.activeUrl = '';
  }
  private planBoundary(entry: Schedule) {
    clearTimeout(this.boundary);
    this.boundary = window.setTimeout(
      () => {
        if (this.wanted) this.connect();
      },
      Math.max(75, entry.endsAt - this.now + 20),
    );
  }
  private nextLive(audio: HTMLAudioElement) {
    return chooseLive(this.sources, audio, (url) => this.liveFailures.has(url), this.quality);
  }
  private connect() {
    this.clear();
    if (!this.station || !this.wanted) return;
    const el = document.createElement('audio'),
      entry = this.schedule();
    const url = this.activeMode === 'demo' ? entry?.current?.url : this.nextLive(el)?.url;
    if (!url) {
      this.wanted = false;
      this.emit('unavailable');
      return;
    }
    const mine = this.generation;
    const current = () => mine === this.generation && this.wanted;
    this.element = el;
    this.activeUrl = url;
    this.clockedId = entry?.current?.id || '';
    el.dataset.testid = 'radio-audio';
    el.id = 'radio-audio';
    el.preload = 'auto';
    el.hidden = true;
    el.setAttribute('playsinline', '');
    document.body.append(el);
    if (this.activeMode === 'demo' && this.audioContext) {
      try {
        this.sourceNode = this.audioContext.createMediaElementSource(el);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 128;
        this.gain = this.audioContext.createGain();
        this.sourceNode
          .connect(this.analyser)
          .connect(this.gain)
          .connect(this.audioContext.destination);
      } catch {
        this.analyser = null;
      }
    }
    this.setVolume(this.volume, this.muted);
    const onMetadata = () => {
      if (!current() || this.activeMode !== 'demo') return;
      const s = this.schedule();
      if (!s?.current) return;
      if (this.clockedId !== s.current.id) {
        this.connect();
        return;
      }
      try {
        el.currentTime = Math.max(
          0,
          Math.min(
            s.offset,
            Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.03) : s.offset,
          ),
        );
      } catch {}
      this.planBoundary(s);
    };
    const onPlaying = () => {
      if (current()) {
        clearTimeout(this.startup);
        this.attempts = 0;
        this.emit('playing');
      }
    };
    const onWait = () => {
      if (current()) {
        this.emit('buffering');
        clearTimeout(this.startup);
        this.startup = window.setTimeout(() => {
          if (current()) this.failed('timeout');
        }, 12000);
      }
    };
    const onError = () => {
      if (current()) {
        const permanent = el.error?.code === 4 && this.activeMode === 'live';
        this.failed(permanent ? 'unsupported' : 'network', permanent);
      }
    };
    const onEnded = () => {
      if (!current()) return;
      if (this.activeMode !== 'demo') {
        this.failed('ended');
        return;
      }
      if (entry) this.planBoundary(entry);
    };
    el.onloadedmetadata = onMetadata;
    el.onplaying = onPlaying;
    el.onwaiting = onWait;
    el.onstalled = onWait;
    el.onerror = onError;
    el.onended = onEnded;
    this.mediaCleanup = () => {
      el.onloadedmetadata =
        el.onplaying =
        el.onwaiting =
        el.onstalled =
        el.onerror =
        el.onended =
          null;
    };
    el.src = url;
    this.emit('preparing');
    this.startup = window.setTimeout(() => {
      if (current()) this.failed('timeout');
    }, 12000);
    void el.play().catch((error: DOMException) => {
      if (!current() || error.name === 'AbortError') return;
      if (error.name === 'NotAllowedError') {
        this.wanted = false;
        this.clear();
        this.emit('paused', 'gesture');
        return;
      }
      const unsupported = this.activeMode === 'live' && error.name === 'NotSupportedError';
      this.failed(unsupported ? 'unsupported' : 'network', unsupported);
    });
  }
  private failed(issue: string, permanent = false) {
    if (!this.wanted) return;
    if (this.activeMode === 'live' && this.element && this.activeUrl) {
      this.liveFailures.set(this.activeUrl, permanent ? 'unsupported' : 'temporary');
      if (this.nextLive(this.element)) {
        this.connect();
        return;
      }
      // Every eligible URL has been tried once. Retry temporary failures after backoff,
      // while unsupported formats stay excluded until the listener explicitly tries again.
      for (const [url, reason] of this.liveFailures) {
        if (reason === 'temporary') this.liveFailures.delete(url);
      }
      permanent = !this.nextLive(this.element);
    }
    this.clear();
    if (permanent || this.attempts >= 3) {
      this.wanted = false;
      this.emit('error', issue);
      return;
    }
    this.attempts++;
    this.emit('reconnecting', issue);
    this.timer = window.setTimeout(() => this.connect(), retryDelay(this.attempts));
  }
  diagnostics() {
    const e = this.element;
    let buffer = 0;
    if (e?.buffered.length)
      buffer = Math.max(0, e.buffered.end(e.buffered.length - 1) - e.currentTime);
    return {
      buffer,
      source: this.activeUrl,
      attempts: this.attempts,
      state: this.snapshot.state,
      issue: this.snapshot.issue,
    };
  }
  destroy() {
    this.wanted = false;
    this.clear();
    if (this.audioContext) void this.audioContext.close().catch(() => {});
    this.audioContext = null;
    this.listeners.clear();
  }
}
