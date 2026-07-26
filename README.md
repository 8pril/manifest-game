# NAN 2026 예선 제출작

무기와 보조능력을 조합해 매 판 다른 빌드를 만드는 웹 기반 2D 탑다운 액션 로그라이트.

NHN **NAN 2026 (Next AI Network) Game × AI Hackathon** 사전 과제 제출물입니다.

## 플레이

브라우저에서 바로 실행됩니다. 설치가 필요 없습니다.

- **플레이 링크: https://8pril.github.io/nan2026-game/**

| 입력 | 동작 |
| --- | --- |
| WASD | 이동 |
| 마우스 이동 | 조준 |
| 좌클릭 | 왼손 무기 공격 |
| 우클릭 | 오른손 무기 공격 |
| Space | 대시 (대시 중 무적) |
| 1 - 4 | 무기 선택 / 보조능력 선택 |
| R | 재시작 |

한 판은 무기 2종을 고르는 것으로 시작합니다. 기본 공격이 명중하면 콤보가 쌓이고,
5콤보에서 다음 공격이 그 무기의 발동 스킬로 바뀝니다. 웨이브를 정리할 때마다
보조능력을 하나씩 골라 스킬에 붙입니다.

데스크톱 브라우저(Chrome, Safari)를 권장합니다. 모바일 브라우저에서도 화면은 맞춰지지만 조작은 키보드·마우스 기준으로 설계되었습니다.

## 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입 검사 + 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 확인 (http://localhost:4173)
npm run test     # 테스트 156개
npm run typecheck
```

Node 20.19 이상이 필요합니다.

### 개발용 진입 파라미터

`?scene=<이름>`으로 특정 씬부터 시작할 수 있습니다. 타이틀을 건너뛰고 반복 확인할 때 사용합니다.

```
http://localhost:5173/?scene=Play          특정 씬부터 시작
http://localhost:5173/?scene=Play&wave=3   특정 웨이브부터 시작
```

## 기술 스택

- Vite + TypeScript
- Phaser 4
- GitHub Pages 배포

Phaser를 쓰는 이유는 이 게임이 투사체와 지대 엔티티를 대량으로 생성하기 때문입니다. 충돌 처리와 스프라이트 풀링을 직접 만들지 않아도 됩니다.

## 구조

```
src/
  main.ts          게임 부트스트랩, 씬 등록
  config.ts        논리 해상도 및 색상 토큰
  engine/          렌더링과 분리된 순수 전투 로직
    tags.ts        태그 체계. 보조능력 장착 가능 여부를 결정
    modifiers.ts   증가/감소 합산 후 증폭/감폭 곱연산
    support.ts     스킬과 보조능력, 거동 우선순위
    projectile.ts  관통 > 연쇄 > 갈래 > 튕겨쏘기
    melee.ts       부채꼴 근접 판정
    area.ts        지대 생성·틱·만료
    status.ts      상태이상 4종
  data/            콘텐츠. 전용 코드 없이 데이터로만 정의된다
    weapons.ts     무기 4종과 스킬
    supports.ts    보조능력 15종
  game/            한 판의 진행 규칙
    run.ts         상태 기계 (전투 / 선택 / 승리 / 패배)
    loadout.ts     무기 2종과 스킬별 보조능력
    waves.ts       웨이브 구성
    enemy.ts       적 정의
    combo.ts       콤보 게이지
    offer.ts       3택1 추첨
  scenes/          Phaser 씬. 상태를 그리고 입력을 전달한다
docs/              기획 및 진행 문서
```

보조능력 15종은 전용 코드를 갖지 않습니다. 투사체 조합 엔진, 지대 엔진,
범용 수정자 파이프라인 세 가지의 조합으로 표현되며, 새 보조능력을 추가하는 일은
`data/supports.ts`에 항목을 하나 더 넣는 일입니다.

## 문서

- [예선 요구사항 및 실행 플랜](docs/preliminary-requirements-and-plan.md)
- [예선 빌드 스코프](docs/game-scope.md)
- [액션 트래커](docs/action-tracker.md)
- [AI 활용 기록 로그](docs/ai-usage-log.md)

## 라이선스 및 출처

외부 에셋과 오픈소스 출처는 사용 시점에 기록하며, 최종 제출 시 AI 활용 기술 문서에 정리합니다.
