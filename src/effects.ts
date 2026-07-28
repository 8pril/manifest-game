import Phaser from 'phaser';

/**
 * 전투 피드백 이펙트.
 *
 * 규칙상으로는 일어나고 있지만 화면에 아무것도 안 나오던 사건들을 보이게 한다.
 * 상처 폭발, 낙인 소모, 벽 충돌은 모두 피해 숫자만 바뀌고 연출이 없어서
 * 플레이어가 무슨 일이 일어났는지 알 수 없었다.
 *
 * 전부 Phaser 도형과 트윈으로만 만든다. 아트 에셋에 의존하지 않으므로
 * 나중에 스프라이트가 들어와도 이 파일만 고치면 된다.
 */

/** 명중 지점에서 퍼져 나가는 링. 무언가 터졌다는 신호. */
export function ring(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  options: { from?: number; to?: number; duration?: number; width?: number } = {},
): void {
  const { from = 8, to = 90, duration = 340, width = 3 } = options;

  const circle = scene.add.circle(x, y, from).setStrokeStyle(width, color).setDepth(12);
  scene.tweens.add({
    targets: circle,
    radius: to,
    alpha: 0,
    duration,
    ease: 'Cubic.easeOut',
    onUpdate: () => circle.setStrokeStyle(width, color),
    onComplete: () => circle.destroy(),
  });
}

/**
 * 대상 위치에 짧게 번쩍이는 판.
 * 적 오브젝트를 직접 건드리지 않는다. 그 순간 적이 죽어 파괴될 수 있기 때문이다.
 */
export function flash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  color = 0xffffff,
): void {
  const rect = scene.add.rectangle(x, y, size, size, color, 0.85).setDepth(11);
  scene.tweens.add({
    targets: rect,
    alpha: 0,
    scale: 1.35,
    duration: 160,
    ease: 'Quad.easeOut',
    onComplete: () => rect.destroy(),
  });
}

/**
 * 위로 떠오르며 사라지는 전투 문구.
 *
 * 모든 타격에 띄우면 화면이 숫자로 덮이므로, 규칙이 발동해 평소보다 큰 피해가
 * 들어갔을 때만 쓴다. "왜 갑자기 크게 들어갔지"에 답하는 것이 목적이다.
 *
 * 숫자만 띄우지 않고 규칙 이름을 함께 적는다. 플레이어는 40이 큰 값인지
 * 판단할 기준이 없으므로 수치보다 원인이 중요하다. 부호는 쓰지 않는다.
 * 적 위에 뜨는 `+`는 관습상 회복이나 보호막으로 읽힌다.
 */
export function floatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  const label = scene.add
    .text(x, y - 10, text, { fontSize: '20px', color, fontStyle: 'bold' })
    .setOrigin(0.5)
    .setDepth(25);

  scene.tweens.add({
    targets: label,
    y: y - 52,
    alpha: 0,
    duration: 700,
    ease: 'Quad.easeOut',
    onComplete: () => label.destroy(),
  });
}

/**
 * 벽 충돌처럼 묵직한 사건에 쓰는 충격.
 * 카메라 확대가 걸려 있어 흔들림을 세게 주면 멀미가 나므로 약하게만 준다.
 */
export function impact(scene: Phaser.Scene, x: number, y: number, color = 0xffffff): void {
  ring(scene, x, y, color, { from: 10, to: 70, duration: 260, width: 4 });
  scene.cameras.main.shake(120, 0.003);
}
