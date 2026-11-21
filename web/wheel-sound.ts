/** Original synthesized radio wheel UI cues. No Rockstar samples or external assets. */
type Cue = 'open' | 'preview' | 'confirm' | 'close';
let context: AudioContext | null = null;
let lastPreview = 0;

export function wheelSound(cue: Cue, enabled: boolean, muted: boolean, volume = 0.65) {
  if (!enabled || muted || volume <= 0 || typeof window === 'undefined') return;
  const now = performance.now();
  if (cue === 'preview' && now - lastPreview < 65) return;
  if (cue === 'preview') lastPreview = now;
  try {
    const Constructor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return;
    context ??= new Constructor();
    const ctx = context;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const t = ctx.currentTime + 0.002;
    const duration =
      cue === 'open' ? 0.19 : cue === 'close' ? 0.1 : cue === 'confirm' ? 0.2 : 0.055;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.11, 0.045 * volume), t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = cue === 'preview' ? 'square' : 'triangle';
    const start = cue === 'open' ? 280 : cue === 'close' ? 650 : cue === 'confirm' ? 430 : 950;
    const end = cue === 'open' ? 790 : cue === 'close' ? 230 : cue === 'confirm' ? 930 : 590;
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(end, t + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cue === 'preview' ? 2100 : 3000;
    osc.connect(filter).connect(gain);
    osc.start(t);
    osc.stop(t + duration + 0.01);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  } catch {
    // Disabled Web Audio must never prevent station selection.
  }
}
