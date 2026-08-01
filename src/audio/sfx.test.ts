import { describe, expect, it } from 'vitest';
import { playSfx, sfxPattern, type SfxKind } from './sfx';

const KINDS: SfxKind[] = ['attack', 'hit', 'death', 'playerHit', 'combo', 'bossWarning', 'bossImpact', 'reward'];

describe('sfxPattern', () => {
  it('defines a playable pattern for every game event sound', () => {
    for (const kind of KINDS) {
      const pattern = sfxPattern(kind);
      expect(pattern.length).toBeGreaterThan(0);

      for (const step of pattern) {
        expect(step.frequency).toBeGreaterThan(0);
        expect(step.duration).toBeGreaterThan(0);
        expect(step.delay).toBeGreaterThanOrEqual(0);
        expect(step.gain).toBeGreaterThan(0);
        expect(step.gain).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('does not throw when WebAudio is unavailable', () => {
    expect(() => playSfx('reward')).not.toThrow();
  });
});
