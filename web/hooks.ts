import { useEffect, useRef, useState } from 'react';
import rawCatalog from '../data/catalog.json';
import rawPrograms from '../data/programs.json';
import type { Catalog, Health, Programs, Source } from './types';
import type { RadioEngine } from './audio';
export const PAGES_MODE = import.meta.env?.VITE_LEONIDA_PAGES === '1' || import.meta.env?.VITE_LEONIDA_CLOUDFLARE === '1';
const base = import.meta.env?.BASE_URL || '/';
export const seed = {
  ...rawCatalog,
  stations: rawCatalog.stations.map((s) => ({
    ...s,
    art: PAGES_MODE && s.art.startsWith('/') ? base + s.art.slice(1) : s.art,
  })),
} as Catalog;
export const originalPrograms = rawPrograms as Programs;
export async function readApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch('/api/' + path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Error(body?.error?.message || String(res.status));
  }
  return res.json();
}
export function useNetwork(slug: string, engine: RadioEngine) {
  const [catalog, setCatalog] = useState(seed),
    [online, setOnline] = useState<boolean | null>(PAGES_MODE ? true : null);
  const [health, setHealth] = useState<Health[]>(() =>
    seed.stations.map((s) => ({
      slug: s.slug,
      name: s.name,
      demoAvailable: true,
      liveAvailable: false,
      liveStatus: 'unknown',
    })),
  );
  const [sources, setSources] = useState<Record<string, Source[]>>({});
  const programs = useRef<Programs>({ ...originalPrograms }),
    [key, update] = useState(0);
  useEffect(() => {
    if (PAGES_MODE) return;
    let active = true;
    const ac = new AbortController();
    async function sync() {
      const start = Date.now();
      try {
        const time = await readApi<{ now: number }>('system/time', { signal: ac.signal });
        if (active) {
          engine.setClock(time.now - (start + Date.now()) / 2);
          setOnline(true);
        }
      } catch {
        if (active) setOnline(false);
      }
    }
    async function refresh() {
      try {
        const [c, h] = await Promise.all([
          readApi<Catalog>('stations?limit=200', { signal: ac.signal }),
          readApi<{ stations: Health[] }>('broadcasts/status', { signal: ac.signal }),
        ]);
        if (active) {
          setCatalog(c);
          setHealth(h.stations);
          setOnline(true);
        }
      } catch {
        if (active) setOnline(false);
      }
    }
    void refresh();
    void sync();
    const timer = setInterval(() => {
      if (!document.hidden) {
        void sync();
        void refresh();
      }
    }, 45000);
    const onlineEvent = () => {
      void sync();
      void refresh();
      engine.resync();
    };
    const offlineEvent = () => setOnline(false);
    const visible = () => {
      if (!document.hidden) onlineEvent();
    };
    window.addEventListener('online', onlineEvent);
    window.addEventListener('offline', offlineEvent);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      ac.abort();
      clearInterval(timer);
      window.removeEventListener('online', onlineEvent);
      window.removeEventListener('offline', offlineEvent);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [engine, key]);
  useEffect(() => {
    if (PAGES_MODE) return;
    let active = true;
    const ac = new AbortController();
    let lastRevision: number | undefined;
    const refresh = async () => {
      try {
        const [s, p] = await Promise.all([
          readApi<{ sources: Source[] }>('stations/' + slug + '/sources', { signal: ac.signal }),
          readApi<{ programs: Programs[string] }>('stations/' + slug + '/schedule', {
            signal: ac.signal,
          }),
        ]);
        if (!active) return;
        setSources((old) => ({ ...old, [slug]: s.sources }));
        engine.setSources(s.sources, slug);
        programs.current = { ...programs.current, [slug]: p.programs };
        engine.setData(programs.current);
      } catch {
        /* Bundled demo data remains usable when offline. */
      }
    };
    void refresh();
    const es = new EventSource('/api/events?station=' + encodeURIComponent(slug));
    const handle = (event: MessageEvent) => {
      try {
        const d = JSON.parse(event.data).stations?.[0];
        if (!d || !active) return;
        if (lastRevision !== undefined && lastRevision !== d.revision) {
          void refresh();
          update((x) => x + 1);
        }
        lastRevision = d.revision;
        if (event.type === 'update') {
          engine.resync();
          if (d.liveStatus === 'online')
            void readApi<{ stations: Health[] }>('broadcasts/status', { signal: ac.signal })
              .then((h) => {
                if (active) setHealth(h.stations);
              })
              .catch(() => {});
        }
      } catch {}
    };
    es.addEventListener('update', handle);
    es.addEventListener('snapshot', handle);
    return () => {
      active = false;
      ac.abort();
      es.close();
    };
  }, [slug, engine, key]);
  return { catalog, online, health, sources, refresh: () => update((x) => x + 1) };
}
export function useReceiverKeys(
  enabled: boolean,
  onKey: (key: string) => void,
  confirmButton: number,
  cancelButton: number,
) {
  const cb = useRef(onKey);
  cb.current = onKey;
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.repeat ||
        e.altKey ||
        e.metaKey ||
        e.ctrlKey ||
        target?.closest('input,textarea,select,[contenteditable=true],dialog')
      )
        return;
      if (e.key === ' ' && target?.closest('button,a')) return;
      // Enter retains native activation for links, buttons and other controls.
      if (e.key === 'Enter' && target?.closest('button,a,[role=button]')) return;
      const key = e.key.toLowerCase();
      if (['arrowright', 'arrowleft', 'enter', ' ', 'm', 'w', 'escape', '?'].includes(key)) {
        e.preventDefault();
        cb.current(key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!navigator.getGamepads) return;
    let timer = 0,
      previous: boolean[] = [];
    let lastId = '';
    const read = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      let pad: Gamepad | undefined;
      try {
        pad = Array.from(navigator.getGamepads()).find((v): v is Gamepad => !!v?.connected);
      } catch {
        return;
      }
      setConnected(!!pad);
      if (pad) {
        const down = pad.buttons.map((b) => b.pressed);
        const id = pad.id + pad.index;
        if (lastId === id && enabled && !document.querySelector('dialog[open]')) {
          for (const [n, k] of [
            [14, 'arrowleft'],
            [15, 'arrowright'],
            [confirmButton, ' '],
            [cancelButton, 'w'],
          ] as const)
            if (down[n] && !previous[n]) cb.current(k);
        }
        lastId = id;
        previous = down;
      } else {
        lastId = '';
        previous = [];
      }
      timer = window.setTimeout(read, pad ? 70 : 1200);
    };
    read();
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('gamepadconnected', read);
      window.removeEventListener('gamepaddisconnected', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, [enabled, confirmButton, cancelButton]);
  return connected;
}
