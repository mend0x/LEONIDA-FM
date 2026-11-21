import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import {
  AudioLines,
  ChevronDown,
  CircleDot,
  Disc3,
  Mountain,
  Radio,
  Skull,
  Speaker,
  TreePalm,
  X,
  Zap,
} from 'lucide-react';
import type { Station } from './types';
import { dialPoint, sectorAtVector, sectorPath, stepIndex } from './wheel-geometry.mjs';
import './wheel.css';
import { wheelSound } from './wheel-sound';

export interface WheelProps {
  stations: Station[];
  selected: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
  language: 'en' | 'es';
  confirmOnRelease: boolean;
  gamepadConfirm?: number;
  gamepadCancel?: number;
  sounds?: boolean;
  muted?: boolean;
  volume?: number;
}

type CursorGesture = { pointerId: number; start: number; x: number; y: number; moved: boolean };

const words = {
  en: {
    title: 'Radio wheel',
    close: 'Close radio wheel',
    preview: 'Preview',
    choose: 'Choose a station',
    tune: 'Tune in',
    list: 'Station list',
    empty: 'No stations available',
    click: 'Point to preview. Click a sector to tune in.',
    release: 'Hold, drag to a station and release to tune in.',
    tip: 'Select',
    enter: 'Tune',
    cancel: 'Close',
    region: 'Station sectors',
  },
  es: {
    title: 'Rueda de emisoras',
    close: 'Cerrar la rueda',
    preview: 'Selección',
    choose: 'Elige una emisora',
    tune: 'Sintonizar',
    list: 'Lista de emisoras',
    empty: 'No hay emisoras disponibles',
    click: 'Apunta para explorar. Pulsa un sector para sintonizar.',
    release: 'Mantén pulsado, arrastra hasta una emisora y suelta.',
    tip: 'Elegir',
    enter: 'Sintonizar',
    cancel: 'Cerrar',
    region: 'Sectores de emisoras',
  },
} as const;

function stationIcon(slug: string) {
  if (slug.includes('flash')) return Zap;
  if (slug.includes('cocoteo')) return TreePalm;
  if (slug.includes('country')) return Mountain;
  if (slug.includes('chamber')) return Skull;
  if (slug.includes('dirty')) return Speaker;
  if (slug.includes('afro')) return Disc3;
  return Radio;
}

const ticks = Array.from({ length: 72 }, (_, index) => {
  const angle = (index * Math.PI) / 36;
  const major = index % 6 === 0;
  const start = dialPoint(angle, major ? 208 : 211);
  const end = dialPoint(angle, 214);
  return (
    <line
      key={index}
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      opacity={major ? 0.9 : 0.45}
    />
  );
});

interface WheelControls {
  count: number;
  current: () => number;
  preview: (index: number) => void;
  confirm: () => void;
  cancel: () => void;
  confirmOnRelease: boolean;
}

function useWheelGamepad(controls: WheelControls, confirmButton: number, cancelButton: number) {
  const latest = useRef(controls);
  useLayoutEffect(() => {
    latest.current = controls;
  }, [controls]);
  useEffect(() => {
    if (!navigator.getGamepads) return;
    let frame = 0;
    let timer = 0;
    let controller = '';
    let oldButtons: boolean[] = [];
    let lastStick: number | null = null;
    let heldConfirm = false;

    function read() {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      if (document.visibilityState === 'hidden') return;
      let pad: Gamepad | undefined;
      try {
        pad = Array.from(navigator.getGamepads()).find((item): item is Gamepad =>
          Boolean(item?.connected),
        );
      } catch {
        return;
      }
      if (!pad) {
        controller = '';
        heldConfirm = false;
        lastStick = null;
        timer = window.setTimeout(read, 600);
        return;
      }
      const identity = `${pad.index}:${pad.id}`;
      const buttons = pad.buttons.map((button) => button.pressed);
      const fresh = controller !== identity;
      if (fresh) {
        controller = identity;
        oldButtons = buttons;
        lastStick = null;
        heldConfirm = false;
      }
      const pressed = (index: number) => buttons[index] && !oldButtons[index];
      const control = latest.current;
      const sector = sectorAtVector(
        pad.axes[0] ?? 0,
        pad.axes[1] ?? 0,
        control.count,
        lastStick ?? -1,
        { deadZone: 0.32, outerLimit: 1.5 },
      );
      if (sector !== null && sector !== lastStick) control.preview(sector);
      lastStick = sector;
      if (pressed(12) || pressed(14))
        control.preview(stepIndex(control.current(), -1, control.count));
      if (pressed(13) || pressed(15))
        control.preview(stepIndex(control.current(), 1, control.count));
      if (pressed(cancelButton)) control.cancel();
      else if (pressed(confirmButton)) {
        if (control.confirmOnRelease) heldConfirm = true;
        else control.confirm();
      } else if (heldConfirm && oldButtons[confirmButton] && !buttons[confirmButton]) {
        heldConfirm = false;
        control.confirm();
      }
      oldButtons = buttons;
      frame = requestAnimationFrame(read);
    }
    function visibility() {
      controller = '';
      read();
    }
    read();
    window.addEventListener('gamepadconnected', read);
    window.addEventListener('gamepaddisconnected', read);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener('gamepadconnected', read);
      window.removeEventListener('gamepaddisconnected', read);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [confirmButton, cancelButton]);
}

export function Wheel({
  stations,
  selected,
  onSelect,
  onClose,
  language,
  confirmOnRelease,
  gamepadConfirm = 0,
  gamepadCancel = 1,
  sounds = true,
  muted = false,
  volume = 0.65,
}: WheelProps) {
  const copy = words[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState(selected);
  const index = Math.max(
    0,
    stations.findIndex((station) => station.slug === choice),
  );
  const station = stations[index];
  const currentIndex = useRef(index);
  const currentPointer = useRef<CursorGesture | null>(null);
  const closing = useRef(false);
  const closeTimer = useRef(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  useLayoutEffect(() => {
    currentIndex.current = index;
  }, [index]);

  useLayoutEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    const opener = document.activeElement;
    modal.showModal();
    (
      modal.querySelector<SVGElement>('[aria-pressed="true"]') ??
      modal.querySelector<HTMLButtonElement>('button')
    )?.focus();
    return () => {
      window.clearTimeout(closeTimer.current);
      if (modal.open) modal.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  function finish(action: () => void) {
    if (closing.current) return;
    closing.current = true;
    if (dialog.current) dialog.current.dataset.closing = 'true';
    const reduce =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      dialog.current?.closest('[data-motion="reduce"], .reduce-motion');
    if (reduce) action();
    else closeTimer.current = window.setTimeout(action, 105);
  }
  function confirm(at = currentIndex.current) {
    const target = stations[at];
    if (target) {
      wheelSound('confirm', sounds, muted, volume);
      finish(() => onSelect(target.slug));
    }
  }
  function cancel() {
    wheelSound('close', sounds, muted, volume);
    finish(onClose);
  }
  const preview = useCallback(
    (at: number) => {
      if (!stations[at] || closing.current) return;
      if (currentIndex.current !== at) wheelSound('preview', sounds, muted, volume);
      currentIndex.current = at;
      setChoice(stations[at].slug);
    },
    [stations, sounds, muted, volume],
  );
  useWheelGamepad(
    {
      count: stations.length,
      current: () => currentIndex.current,
      preview,
      confirm,
      cancel,
      confirmOnRelease,
    },
    gamepadConfirm,
    gamepadCancel,
  );

  function navigate(event: KeyboardEvent<HTMLDialogElement>) {
    const target = event.target as Element;
    if (event.key === 'Escape' || event.key.toLowerCase() === 'w') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === 'Tab') {
      const elements = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement | SVGElement>(
          'button:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      );
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      event.stopPropagation();
      return;
    }
    if (target.closest('select')) {
      event.stopPropagation();
      return;
    }
    const previous = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (previous || next || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      const at =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? stations.length - 1
            : stepIndex(currentIndex.current, next ? 1 : -1, stations.length);
      preview(at);
      if (stations[at])
        document.getElementById(`sector-${stations[at].slug}`)?.focus({ preventScroll: true });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.stopPropagation();
      if (!target.closest('button')) {
        event.preventDefault();
        confirm();
      }
    } else event.stopPropagation();
  }

  function hit(event: PointerEvent<SVGSVGElement>, previous: number) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
    const y = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
    return sectorAtVector(x, y, stations.length, previous, {
      deadZone: 100 / 220,
      outerLimit: 205 / 220,
    });
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!event.isPrimary || event.button !== 0 || closing.current) return;
    const at = hit(event, -1);
    if (at === null) return;
    preview(at);
    currentPointer.current = {
      pointerId: event.pointerId,
      start: at,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const gesture = currentPointer.current;
    if (
      !event.isPrimary ||
      (event.pointerType === 'touch' && !gesture) ||
      (gesture && gesture.pointerId !== event.pointerId)
    )
      return;
    if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10)
      gesture.moved = true;
    const at = hit(event, currentIndex.current);
    if (at !== null && at !== currentIndex.current) preview(at);
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    const gesture = currentPointer.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    currentPointer.current = null;
    const at = hit(event, confirmOnRelease ? currentIndex.current : -1);
    if (at === null) return;
    if (confirmOnRelease || (!gesture.moved && at === gesture.start)) confirm(at);
  }
  const split = (Math.PI * 2) / Math.max(1, stations.length);
  const compact = stations.length > 9;

  return (
    <dialog
      id="wheel-dialog"
      data-testid="wheel-dialog"
      ref={dialog}
      className="lfm-wheel"
      aria-labelledby="lfm-wheel-title"
      aria-describedby="lfm-wheel-instructions"
      onKeyDown={navigate}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            cancel();
        }
      }}
    >
      <div
        className="lfm-wheel-shell"
        style={{ '--wheel-accent': station?.color ?? '#ff84aa' } as CSSProperties}
      >
        <header className="lfm-wheel-header">
          <div>
            <CircleDot aria-hidden="true" />
            <h2 id="lfm-wheel-title">{copy.title}</h2>
          </div>
          <button
            type="button"
            aria-label={copy.close}
            className="lfm-wheel-dismiss"
            onClick={cancel}
          >
            <X size={20} />
          </button>
        </header>
        <p id="lfm-wheel-instructions" className="lfm-wheel-instructions">
          {confirmOnRelease ? copy.release : copy.click}
        </p>
        <div className="lfm-wheel-stage">
          <svg
            viewBox="0 0 440 440"
            className="lfm-wheel-face"
            role="group"
            aria-label={copy.region}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={() => {
              currentPointer.current = null;
            }}
            onLostPointerCapture={() => {
              currentPointer.current = null;
            }}
          >
            <circle cx="220" cy="220" r="216.5" fill="none" stroke="#53505c" strokeWidth="0.85" />
            <g stroke="#8c8590" strokeWidth="1.4" aria-hidden="true">
              {ticks}
            </g>
            {stations.map((item, i) => {
              const active = i === index;
              const path = sectorPath(i, stations.length, active ? 100 : 105, active ? 205 : 200);
              const label = dialPoint(i * split, 153);
              const id = `wheel-clip-${uid}-${i}`;
              const Icon = stationIcon(item.slug);
              const iconSize = compact ? 23 : 31;
              const short = (item.shortName || item.name).replace(/\s+(?:FM|Radio)$/i, '');
              return (
                <g
                  key={item.slug}
                  id={`sector-${item.slug}`}
                  data-testid={`sector-${item.slug}`}
                  className="lfm-wheel-sector"
                  role="button"
                  tabIndex={active ? 0 : -1}
                  aria-label={item.name}
                  aria-pressed={active}
                  onClick={(event) => {
                    if (event.detail === 0) confirm(i);
                  }}
                >
                  <defs>
                    <clipPath id={id}>
                      <path d={path} />
                    </clipPath>
                  </defs>
                  <path d={path} fill={active ? item.color : '#24232d'} />
                  {item.art && (
                    <image
                      href={item.art}
                      x={label.x - 116}
                      y={label.y - 110}
                      width="232"
                      height="220"
                      preserveAspectRatio="xMidYMid slice"
                      opacity={active ? 0.58 : 0.23}
                      clipPath={`url(#${id})`}
                      aria-hidden="true"
                    />
                  )}
                  <path d={path} fill="#0b0a11" opacity={active ? 0.14 : 0.46} />
                  <path
                    d={path}
                    fill="none"
                    stroke={active ? item.color : '#4a4652'}
                    strokeWidth={active ? 2.7 : 1}
                    className="lfm-wheel-edge"
                  />
                  <g
                    className="lfm-wheel-mark"
                    transform={`translate(${label.x}, ${label.y + (compact ? 0 : -3)})`}
                    pointerEvents="none"
                    aria-hidden="true"
                  >
                    <Icon
                      x={-iconSize / 2}
                      y={compact ? -iconSize / 2 : -25}
                      width={iconSize}
                      height={iconSize}
                      stroke={active ? '#fff8f1' : '#f1e7e7'}
                      strokeWidth={2.3}
                    />
                    {!compact && (
                      <text y="23" textAnchor="middle" className="lfm-wheel-tag">
                        {short.length > 10
                          ? short
                              .split(/\s+/)
                              .map((word) => word[0])
                              .join('')
                              .slice(0, 6)
                          : short}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
            <circle cx="220" cy="220" r="95" fill="none" stroke="#54505c" strokeWidth="1" />
            <circle cx="220" cy="220" r="91" fill="none" stroke="#35313c" strokeDasharray="1 5" />
          </svg>
          <div className="lfm-wheel-center" role="status" aria-live="polite" aria-atomic="true">
            <span>
              <i />
              {copy.preview}
            </span>
            <strong>{station?.name ?? copy.empty}</strong>
            {station && (
              <small>{language === 'es' ? station.genreEs || station.genre : station.genre}</small>
            )}
          </div>
        </div>
        <div className="lfm-wheel-actions">
          <div className="lfm-wheel-select">
            <select
              aria-label={copy.choose}
              value={station?.slug ?? ''}
              disabled={!station}
              onChange={(event) =>
                preview(stations.findIndex((item) => item.slug === event.target.value))
              }
            >
              {!station && <option value="">{copy.empty}</option>}
              {stations.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" size={16} />
          </div>
          <button
            type="button"
            id="wheel-confirm"
            data-testid="wheel-confirm"
            className="lfm-wheel-tune"
            disabled={!station}
            onClick={() => confirm()}
          >
            <AudioLines size={17} />
            {copy.tune}
          </button>
        </div>
        <div className="lfm-wheel-keys" aria-hidden="true">
          <span>
            <kbd>←</kbd>
            <kbd>→</kbd> {copy.tip}
          </span>
          <span>
            <kbd>Enter</kbd> {copy.enter}
          </span>
          <span>
            <kbd>Esc</kbd> {copy.cancel}
          </span>
        </div>
      </div>
    </dialog>
  );
}

export default Wheel;
