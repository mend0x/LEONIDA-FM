import { Disc3, RadioTower } from 'lucide-react';
import type { Language, ListeningMode } from './types';
import './listening-mode.css';

/** Explicit source choice, shared by the hero and dock. Neither choice changes station. */
export function ListeningModeToggle({
  mode,
  language,
  onChange,
  compact = false,
}: {
  mode: ListeningMode;
  language: Language;
  onChange: (mode: ListeningMode) => void;
  compact?: boolean;
}) {
  const es = language === 'es';
  return (
    <div
      className={'listening-mode-toggle' + (compact ? ' listening-mode-compact' : '')}
      role="group"
      aria-label={es ? 'Fuente de música' : 'Music source'}
    >
      <button
        type="button"
        onClick={() => onChange('soundtrack')}
        className={mode === 'soundtrack' ? 'active' : ''}
        aria-pressed={mode === 'soundtrack'}
        data-testid="mode-soundtrack"
      >
        <Disc3 size={17} aria-hidden="true" />
        <span>{es ? 'GTA VI · Canciones' : 'GTA VI · Soundtrack'}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('radio')}
        className={mode === 'radio' ? 'active' : ''}
        aria-pressed={mode === 'radio'}
        data-testid="mode-radio"
      >
        <RadioTower size={17} aria-hidden="true" />
        <span>{es ? 'Radios reales' : 'Live radio'}</span>
      </button>
    </div>
  );
}
