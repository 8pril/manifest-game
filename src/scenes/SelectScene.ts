import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '@/config';
import { WEAPON_LIST, type WeaponId } from '@/data/weapons';
import { STATUS_RULES } from '@/engine/status';
import { deliveryOf } from '@/data/weapons';

const DELIVERY_LABEL: Record<string, string> = {
  melee: '근접',
  projectile: '투사체',
  area: '지대',
};

/**
 * 무기 선택 화면.
 *
 * 무기 2종을 골라 왼손과 오른손에 배정한다. 순서대로 두 번 고르며,
 * 첫 선택이 왼손(좌클릭), 두 번째가 오른손(우클릭)이 된다.
 */
export class SelectScene extends Phaser.Scene {
  private picked: WeaponId[] = [];
  private cards: { id: WeaponId; box: Phaser.GameObjects.Rectangle; badge: Phaser.GameObjects.Text }[] =
    [];
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('Select');
  }

  create(): void {
    this.picked = [];
    this.cards = [];

    this.add
      .text(GAME_WIDTH / 2, 92, '무기를 두 개 고르세요', {
        fontSize: '34px',
        color: COLORS.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.hint = this.add
      .text(GAME_WIDTH / 2, 140, '첫 번째 선택이 왼손(좌클릭), 두 번째가 오른손(우클릭)입니다', {
        fontSize: '16px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    this.buildCards();

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 70, '숫자키 1-4 또는 클릭', {
        fontSize: '15px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('키보드 입력을 사용할 수 없습니다.');
    for (const [index, name] of ['ONE', 'TWO', 'THREE', 'FOUR'].entries()) {
      keyboard.on(`keydown-${name}`, () => this.pick(WEAPON_LIST[index].id));
    }
  }

  private buildCards(): void {
    const cardWidth = 250;
    const gap = 24;
    const total = WEAPON_LIST.length * cardWidth + (WEAPON_LIST.length - 1) * gap;
    const startX = (GAME_WIDTH - total) / 2 + cardWidth / 2;

    for (const [index, weapon] of WEAPON_LIST.entries()) {
      const x = startX + index * (cardWidth + gap);
      const y = GAME_HEIGHT / 2 + 10;

      const box = this.add
        .rectangle(x, y, cardWidth, 300, 0x171a26)
        .setStrokeStyle(2, 0x2a2f42)
        .setInteractive({ useHandCursor: true });
      box.on('pointerdown', () => this.pick(weapon.id));

      this.add.text(x, y - 122, `${index + 1}`, { fontSize: '18px', color: COLORS.textDim }).setOrigin(0.5);
      this.add
        .text(x, y - 86, weapon.name, { fontSize: '30px', color: COLORS.text, fontStyle: 'bold' })
        .setOrigin(0.5);
      this.add
        .text(x, y - 50, weapon.concept, { fontSize: '15px', color: COLORS.textDim })
        .setOrigin(0.5);

      this.add.rectangle(x, y - 26, cardWidth - 48, 1, 0x2a2f42);

      const lines = [
        `기본 공격  ${weapon.basic.name} (${DELIVERY_LABEL[deliveryOf(weapon.basic)]})`,
        `발동 스킬  ${weapon.combo.name} (${DELIVERY_LABEL[deliveryOf(weapon.combo)]})`,
        `상태이상    ${STATUS_RULES[weapon.status].label}`,
        '',
        `태그  ${weapon.basic.tags.join('·')}`,
      ];
      this.add
        .text(x, y + 46, lines.join('\n'), {
          fontSize: '13px',
          color: COLORS.textDim,
          align: 'center',
          lineSpacing: 7,
          wordWrap: { width: cardWidth - 32 },
        })
        .setOrigin(0.5);

      const badge = this.add
        .text(x, y + 128, '', { fontSize: '15px', color: COLORS.accentText, fontStyle: 'bold' })
        .setOrigin(0.5);

      this.cards.push({ id: weapon.id, box, badge });
    }
  }

  private pick(id: WeaponId): void {
    if (this.picked.includes(id)) return;
    this.picked.push(id);

    const card = this.cards.find((c) => c.id === id);
    if (card) {
      card.box.setStrokeStyle(2, COLORS.accent);
      card.badge.setText(this.picked.length === 1 ? '왼손' : '오른손');
    }

    if (this.picked.length === 1) {
      this.hint.setText('오른손 무기를 고르세요');
      return;
    }

    this.scene.start('Play', { left: this.picked[0], right: this.picked[1] });
  }
}
