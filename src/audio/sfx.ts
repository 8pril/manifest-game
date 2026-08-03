export type SfxKind = 'attack' | 'hit' | 'death' | 'playerHit' | 'combo' | 'bossWarning' | 'bossImpact' | 'reward';

export interface ToneStep {
  frequency: number;
  duration: number;
  delay: number;
  gain: number;
  type: OscillatorType;
  slideTo?: number;
}

const MASTER_GAIN = 9;

export function sfxPattern(kind: SfxKind): readonly ToneStep[] {
  switch (kind) {
    case 'attack':
      return [{ frequency: 240, slideTo: 360, duration: 0.045, delay: 0, gain: 0.045, type: 'triangle' }];
    case 'hit':
      return [{ frequency: 118, slideTo: 72, duration: 0.04, delay: 0, gain: 0.035, type: 'square' }];
    case 'death':
      return [
        { frequency: 330, slideTo: 165, duration: 0.08, delay: 0, gain: 0.04, type: 'triangle' },
        { frequency: 92, slideTo: 46, duration: 0.12, delay: 0.055, gain: 0.035, type: 'square' },
      ];
    case 'playerHit':
      return [
        { frequency: 174, slideTo: 98, duration: 0.11, delay: 0, gain: 0.055, type: 'sawtooth' },
        { frequency: 73, duration: 0.075, delay: 0.045, gain: 0.04, type: 'square' },
      ];
    case 'combo':
      return [
        { frequency: 392, duration: 0.055, delay: 0, gain: 0.045, type: 'triangle' },
        { frequency: 587, duration: 0.07, delay: 0.045, gain: 0.04, type: 'triangle' },
        { frequency: 784, duration: 0.095, delay: 0.095, gain: 0.035, type: 'sine' },
      ];
    case 'bossWarning':
      return [
        { frequency: 196, slideTo: 156, duration: 0.18, delay: 0, gain: 0.045, type: 'sawtooth' },
        { frequency: 196, slideTo: 130, duration: 0.2, delay: 0.22, gain: 0.04, type: 'sawtooth' },
      ];
    case 'bossImpact':
      return [
        { frequency: 82, slideTo: 44, duration: 0.13, delay: 0, gain: 0.06, type: 'square' },
        { frequency: 123, slideTo: 61, duration: 0.09, delay: 0.018, gain: 0.035, type: 'sawtooth' },
      ];
    case 'reward':
      return [
        { frequency: 523, duration: 0.07, delay: 0, gain: 0.035, type: 'sine' },
        { frequency: 659, duration: 0.08, delay: 0.07, gain: 0.035, type: 'sine' },
        { frequency: 880, duration: 0.16, delay: 0.16, gain: 0.035, type: 'triangle' },
      ];
  }
}

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;

function contextConstructor(): AudioContextConstructor | null {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function getContext(): AudioContext | null {
  if (audioContext) return audioContext;

  const Ctor = contextConstructor();
  if (!Ctor) return null;

  try {
    audioContext = new Ctor();
    return audioContext;
  } catch {
    return null;
  }
}

export function playSfx(kind: SfxKind): void {
  const ctx = getContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }

  const now = ctx.currentTime;
  for (const step of sfxPattern(kind)) {
    const start = now + step.delay;
    const end = start + step.duration;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = step.type;
    oscillator.frequency.setValueAtTime(step.frequency, start);
    if (step.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, step.slideTo), end);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(step.gain * MASTER_GAIN, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}
