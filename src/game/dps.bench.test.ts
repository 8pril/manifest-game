import { describe, it, expect } from 'vitest';
import { WEAPON_LIST, attackIntervalFor, basicSkillsOf, deliveryOf, type Weapon } from '@/data/weapons';
import { resolveSkill, type Support } from '@/engine/support';
import { projectileDamageMultiplier } from '@/engine/projectile';
import { findSupport } from '@/data/supports';
import type { Skill } from '@/engine/support';

/**
 * 기본스킬 후보 계측기.
 *
 * 브라우저 없이 데이터와 엔진 규칙만으로 초당 피해를 계산한다. 헤드리스 플레이는
 * 느리고 잘 깨져서 밸런스 판단에 쓸 수 없었다. 여기서 나오는 값은 "적이 계속 맞고
 * 있을 때"의 상한이며, 첫 소켓 후보가 기본 공격 수준인지 판단하는 데 쓴다.
 *
 * 지대형의 핵심은 **겹침**이다. 지속시간 동안 여러 장이 남아 각자 틱을 돌리므로
 * 실효 피해가 발동 주기에 반비례해 뛴다.
 */

/** 한 스킬이 대상 하나에게 주는 초당 피해. intervalMs 마다 반복해서 낸다고 본다. */
function dps(skill: Skill, supports: readonly Support[], intervalMs: number): number {
  const { stats } = resolveSkill(skill, supports);
  const interval = intervalMs / 1000;

  if (deliveryOf(skill) === 'area') {
    const tick = stats.tickInterval ?? 0.5;
    const duration = stats.duration ?? 1;
    // 동시에 살아 있는 지대 수. 이만큼 피해가 곱해진다.
    const overlap = duration / interval;
    return overlap * ((stats.damage ?? 0) / tick);
  }

  // 엔진과 같은 규칙을 쓴다. 여기서 선형으로 곱하면 벤치가 게임에 없는 값을 재게 된다.
  const count = Math.max(1, Math.round(stats.projectileCount ?? 1));
  return ((stats.damage ?? 0) * count * projectileDamageMultiplier(count)) / interval;
}

function basicDps(weapon: Weapon): number {
  return dps(weapon.basic, [], weapon.cooldown);
}

/** 옛 콤보스킬을 첫 소켓에 끼웠을 때의 초당 피해. */
function oldComboSkillCandidate(weapon: Weapon): Skill {
  return basicSkillsOf(weapon)[1];
}

function socketDps(weapon: Weapon, supports: readonly Support[] = []): number {
  const skill = oldComboSkillCandidate(weapon);
  return dps(skill, supports, attackIntervalFor(weapon, skill));
}

const table = WEAPON_LIST.map((weapon) => ({
  name: weapon.name,
  kind: deliveryOf(oldComboSkillCandidate(weapon)),
  basic: Math.round(basicDps(weapon)),
  awakened: Math.round(socketDps(weapon)),
  ratio: socketDps(weapon) / basicDps(weapon),
}));

describe('강화기술 대체 발동 — 초당 피해', () => {
  it('표를 남긴다', () => {
    const lines = table.map(
      (r) => `  ${r.name.padEnd(3)} ${r.kind.padEnd(10)} 기본 ${String(r.basic).padStart(4)} → 소켓 ${String(r.awakened).padStart(4)}  (${r.ratio.toFixed(2)}배)`,
    );
    console.log('\n[옛 콤보스킬을 기본스킬로 쓸 때 초당 피해]\n' + lines.join('\n') + '\n');
    expect(table).toHaveLength(4);
  });

  it('첫 소켓 후보 가치가 무기 사이에 크게 벌어지지 않아야 한다', () => {
    const ratios = table.map((r) => r.ratio);
    const spread = Math.max(...ratios) / Math.min(...ratios);
    console.log(`  소켓 배율 최대/최소 = ${spread.toFixed(1)}배 차이`);
    expect(spread, '무기마다 기본스킬 후보 가치가 너무 다르면 픽이 한쪽으로 쏠린다').toBeLessThan(1.7);
  });

  it('단일 대상 피해가 기본 공격의 0.75~1.25배 안에 있다', () => {
    const outliers = table
      .filter((r) => r.ratio < 0.75 || r.ratio > 1.25)
      .map((r) => `${r.name} ${r.ratio.toFixed(2)}배`);
    expect(outliers, '첫 소켓 후보는 기본 공격 수준이어야 한다').toEqual([]);
  });
});

/**
 * 동시에 때리는 적 수.
 *
 * 단일 대상 비교는 지대형에 불리하다. 지대는 반경 안의 적 전부를 때리고
 * 근접은 부채꼴 안만 때리므로, 덮는 넓이가 곧 동시 타격 수가 된다.
 * 투사체형은 발수가 정해져 있어 적이 늘어도 총 피해가 늘지 않는다
 * (5발이 5명에게 나뉠 뿐이다).
 */
function coverage(skill: Skill, supports: readonly Support[]): number {
  const { stats } = resolveSkill(skill, supports);
  if (deliveryOf(skill) === 'area') {
    const r = stats.areaRadius ?? 100;
    return Math.PI * r * r;
  }
  if (deliveryOf(skill) === 'melee') {
    const r = (stats.meleeRange ?? 100) + 20; // 적 반지름만큼 더 닿는다
    return ((stats.meleeArc ?? 1.7) * r * r) / 2;
  }
  return 0; // 투사체는 발수로 상한이 정해진다
}

describe('덮는 넓이까지 본 비교', () => {
  it('무기별 각성 가치', () => {
    const lines = WEAPON_LIST.map((weapon) => {
      const basic = basicDps(weapon);
      const awakened = socketDps(weapon);
      const basicArea = coverage(weapon.basic, []);
      const comboArea = coverage(oldComboSkillCandidate(weapon), []);
      // 투사체형(넓이 0)은 다중 대상에서 이득이 늘지 않는다.
      const spread = comboArea > 0 && basicArea > 0 ? comboArea / basicArea : 1;
      const single = awakened / basic;
      const swarm = single * spread;
      return `  ${weapon.name.padEnd(3)} 단일 ${single.toFixed(2)}배   무리 ${swarm.toFixed(2)}배   (덮는 넓이 ${spread.toFixed(1)}배)`;
    });
    console.log('\n[옛 콤보스킬 기본스킬 후보가 기본 공격보다 몇 배인가]\n' + lines.join('\n') + '\n');
    expect(lines).toHaveLength(4);
  });
});

describe('지대 겹침이 발동 주기에 반비례하는지', () => {
  it('간격을 1/3로 줄이면 피해가 3배가 된다', () => {
    const sword = WEAPON_LIST.find((w) => w.id === 'sword')!;
    const annihilation = oldComboSkillCandidate(sword);
    const slow = dps(annihilation, [], 900);
    const fast = dps(annihilation, [], 300);
    expect(fast / slow).toBeCloseTo(3, 5);
  });

  it('기본 쿨다운으로 넘기면 지대형이 폭증한다', () => {
    const sword = WEAPON_LIST.find((w) => w.id === 'sword')!;
    const annihilation = oldComboSkillCandidate(sword);
    const correct = dps(annihilation, [], attackIntervalFor(sword, annihilation));
    const naive = dps(annihilation, [], sword.cooldown);
    console.log(`  멸검: 별도 간격 ${Math.round(correct)} vs 기본 쿨다운 ${Math.round(naive)}`);
    expect(naive).toBeGreaterThan(correct * 2.5);
  });
});

describe('마을 기본 세팅을 붙였을 때', () => {
  it('검·활·방패 각성 피해', () => {
    const defaults: Record<string, string[]> = {
      sword: ['earthquake', 'wound-resonance'],
      bow: ['multiple-projectiles', 'wound-seeker'],
      shield: ['earthquake', 'fracture-resonance'],
    };
    const lines: string[] = [];
    for (const weapon of WEAPON_LIST) {
      const ids = defaults[weapon.id];
      if (!ids) continue;
      const supports = ids.map((id) => findSupport(id)!).filter(Boolean);
      const bare = socketDps(weapon);
      const kitted = socketDps(weapon, supports);
      lines.push(`  ${weapon.name} 각성 ${Math.round(bare)} → 세팅 후 ${Math.round(kitted)}  (기본공격 대비 ${(kitted / basicDps(weapon)).toFixed(1)}배)`);
    }
    console.log('\n[마을 기본 세팅]\n' + lines.join('\n') + '\n');
    expect(lines).toHaveLength(3);
  });
});


/**
 * 첫 소켓의 기본스킬은 **곁수정이 아니라 다른 선택**이어야 한다.
 *
 * 더 세기만 하면 안 끼울 이유가 없어 소켓이 고르는 칸이 아니라 반드시 채우는 칸이
 * 된다. 옛 콤보스킬(멸검 등)도 기본스킬 후보로 복귀했으므로, 모든 후보의 총량을
 * 비슷하게 맞춘다.
 */
describe('기본스킬은 기본 공격의 곁수정이 아니다', () => {
  const socketTable = WEAPON_LIST.flatMap((weapon) =>
    basicSkillsOf(weapon).map((skill) => ({
      weapon: weapon.name,
      name: skill.name,
      basic: Math.round(basicDps(weapon)),
      socket: Math.round(dps(skill, [], attackIntervalFor(weapon, skill))),
      ratio: dps(skill, [], attackIntervalFor(weapon, skill)) / basicDps(weapon),
      kind: deliveryOf(skill),
      skill,
    })),
  );

  it('표를 남긴다', () => {
    console.log('\n[기본스킬 — 단일 대상 초당 피해]');
    for (const r of socketTable) {
      console.log(
        `  ${r.weapon.padEnd(3)} ${r.name.padEnd(6)} 기본 ${String(r.basic).padStart(4)} → 소켓 ${String(r.socket).padStart(4)}` +
        `  (${r.ratio.toFixed(2)}배, ${r.kind})`,
      );
    }
    expect(socketTable).toHaveLength(WEAPON_LIST.length * 2);
  });

  it('단일 대상 피해가 기본 공격의 0.75~1.25배 안에 있다', () => {
    const outliers = socketTable
      .filter((r) => r.ratio < 0.75 || r.ratio > 1.25)
      .map((r) => `${r.weapon} ${r.name} ${r.ratio.toFixed(2)}배`);

    expect(outliers, '기본스킬이 곁수정이 되면 소켓이 선택이 아니게 된다').toEqual([]);
  });

  it('무기마다 축이 하나씩 바뀐다', () => {
    // 같은 값을 조금 올린 것이 아니라 성격이 달라져야 고를 이유가 생긴다.
    for (const weapon of WEAPON_LIST) {
      const before = resolveSkill(weapon.basic, []).stats;
      for (const skill of basicSkillsOf(weapon)) {
        const after = resolveSkill(skill, []).stats;
        const changedAxis =
          deliveryOf(skill) !== deliveryOf(weapon.basic)
          || (before.meleeArc !== undefined && after.meleeArc !== before.meleeArc)
          || (before.projectileCount ?? 1) !== (after.projectileCount ?? 1);

        expect(changedAxis, `${weapon.name} ${skill.name}이 수치만 다르다`).toBe(true);
      }
    }
  });
});
