import { describe, expect, it } from 'vitest';
import { weaponOf } from '@/data/weapons';
import { snapshotAttackSource, type AttackSource } from '@/game/attack-source';

describe('snapshotAttackSource', () => {
  it('발동 뒤 장비와 수치가 바뀌어도 당시 손과 콤보 기준을 보존한다', () => {
    const comboStats = { comboGain: 1.5, comboDuration: 10 };
    const input: AttackSource = {
      weapon: weaponOf('bow'),
      hand: 'left',
      comboStats,
      tracksCombo: true,
      empower: { id: 17, more: 0.8, attacksLeft: 3, secondsLeft: 6, source: '연계 방출' },
      comboRules: [{
        ownerHand: 'right',
        trigger: { reads: 'total', required: 6 },
        effect: { kind: 'empower', hand: 'self', more: 0.3 },
        supportName: '연결 가속',
      }],
    };
    const snapshot = snapshotAttackSource(input);

    input.weapon = weaponOf('shield');
    input.hand = 'right';
    input.tracksCombo = false;
    input.empower!.more = 0.3;
    input.empower!.attacksLeft = 1;
    input.comboRules[0]!.trigger.required = 9;
    comboStats.comboGain = 9;
    comboStats.comboDuration = 1;

    expect(snapshot.weapon.id).toBe('bow');
    expect(snapshot.hand).toBe('left');
    expect(snapshot.tracksCombo).toBe(true);
    expect(snapshot.empower).toMatchObject({ id: 17, more: 0.8, attacksLeft: 3, secondsLeft: 6 });
    expect(snapshot.comboStats).toEqual({ comboGain: 1.5, comboDuration: 10 });
    expect(snapshot.comboRules[0]).toMatchObject({
      ownerHand: 'right',
      trigger: { reads: 'total', required: 6 },
      supportName: '연결 가속',
    });
  });
});
