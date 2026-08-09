# NAN 2026 예선 제출작

검 하나로 시작해 보스 드랍과 마을 장비 설정으로 양손 무기 조합을 확장하는 웹 기반 2D 탑다운 핵앤슬래시.

NHN **NAN 2026 (Next AI Network) Game × AI Hackathon** 사전 과제 제출물입니다.

## 플레이

브라우저에서 바로 실행됩니다. 설치가 필요 없습니다.

- **플레이 링크: https://8pril.github.io/nan2026-game/**

| 입력 | 동작 |
| --- | --- |
| WASD | 이동 |
| 마우스 이동 | 조준 |
| 좌클릭 | 왼손 무기 공격 |
| 우클릭 **또는 Shift** | 오른손 무기 공격 |
| Space | 대시 (대시 중 무적) |
| F | 마을 NPC 대화 |
| R (누르고 있기) | 무기 교체 링 메뉴 (첫 보스 이후 해금) |
| Shift+R (일시정지·결과 화면) | 저장 기록 지우고 처음부터 |
| P | 일시정지 메뉴 |

한 판은 **검 1종**으로 시작합니다. 오른손은 비어 있어 처음에는 검 기본 공격만 나갑니다.

**콤보는 기본 규칙이 아니라 고르는 것입니다.** 콤보를 읽는 연계를 마을에서 무기에
붙인 경우에만 콤보가 돌아갑니다. 붙이지 않은 무기는 계속 기본 공격만 씁니다.

그리고 **콤보는 양손을 오갈 때 쌓입니다.** 조건과 효과는 연계마다 다릅니다.

| 연계 | 조건 | 효과 |
| --- | --- | --- |
| 콤보 개방 | 직전에 반대손으로 명중 | 이 무기가 강화기술로 나간다 |
| 연결 가속 | 양손 콤보 합계 6 이상 | 이 무기 피해 30% 증폭 |
| 연계 방출 | 이 무기 콤보 5 | 전체 콤보를 소모하고 반대손 피해 80% 증폭 |

방을 정리하면 보상이 **바닥에 떨어집니다.** 가까이 가면 자동으로 얻고, 줍기 전에는
출구가 열리지 않습니다. 첫 보스 이후에는 마을 방에서 NPC에게 `F`로 말을 걸어 무기별
강화기술과 보조형스킬을 배치합니다.

게임 시스템이 진행 중에 강제로 화면을 덮거나 멈추지 않는 것을 원칙으로 삼았습니다.
화면을 덮는 것은 전부 플레이어가 직접 연 것입니다.

데스크톱 브라우저(Chrome, Safari)를 권장합니다. 모바일 브라우저에서도 화면은 맞춰지지만 조작은 키보드·마우스 기준으로 설계되었습니다.

## 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입 검사 + 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 확인 (http://localhost:4173)
npm run test     # 테스트 296개
npm run typecheck
```

Node 20.19 이상이 필요합니다.

### 개발용 진입 파라미터

특정 방이나 무기로 바로 시작할 수 있습니다. **방 번호는 1부터입니다.**

```
http://localhost:5173/?wave=2                  첫 문지기 방부터 시작
http://localhost:5173/?left=bow&right=arcane   무기를 지정해서 시작
http://localhost:5173/?town=1                  첫 마을부터 시작
http://localhost:5173/?combo=1                 콤보 연계를 미리 장착 (콤보 빌드)
http://localhost:5173/?combo=combo-release     콤보 연계를 골라서 장착
http://localhost:5173/?scene=Play              타이틀을 건너뛴다
```

`combo=1`은 콤보 유무를 비교할 때 씁니다. 콤보는 첫 보스가 주는 연계를 마을에서
붙여야 켜지므로, 그냥은 방 두 개를 클리어해야 확인할 수 있습니다.

`left`, `right`, `wave`, `town`, `combo`를 지정하면 저장된 진행을 무시합니다. `town`은 첫 마을 진입을
우선하므로 `wave`와 함께 쓰면 `wave`는 무시됩니다.

## 기술 스택

- Vite + TypeScript
- Phaser 4
- GitHub Pages 배포

Phaser를 쓰는 이유는 이 게임이 투사체와 지대 엔티티를 대량으로 생성하기 때문입니다. 충돌 처리와 스프라이트 풀링을 직접 만들지 않아도 됩니다.

효과음은 에셋 파일 없이 WebAudio로 그때그때 합성합니다. 외부 에셋 라이선스 문제가 생기지 않습니다.

## 구조

```
src/
  main.ts          게임 부트스트랩, 씬 등록
  config.ts        논리 해상도 및 색상 토큰
  debug.ts         개발 빌드에서만 상태를 노출 (헤드리스 검증용)
  engine/          렌더링과 분리된 순수 전투 로직. Phaser를 import 하지 않는다
    tags.ts        태그 체계. 보조형스킬 장착 가능 여부를 결정
    modifiers.ts   증가/감소 합산 후 증폭/감폭 곱연산
    support.ts     스킬과 보조형스킬, 거동 우선순위
    projectile.ts  관통 > 연쇄 > 갈래 > 튕겨쏘기. 다발 피해 보정
    melee.ts       부채꼴 근접 판정
    area.ts        지대 생성·틱·만료
    status.ts      상태이상 4종
    knockback.ts   넉백과 벽 충돌
  data/            콘텐츠. 전용 코드 없이 데이터로만 정의된다
    weapons.ts     무기 4종과 스킬
    supports.ts    보조형스킬
    skills.ts      스킬 정의
    lore.ts        방 오브젝트 서술 텍스트
  game/            한 판의 진행 규칙
    run.ts         상태 기계 (전투 / 마을 / 승리 / 패배)
    rooms.ts       방 구성과 방별 보상
    progression.ts 해금과 장비 설정 상태
    progress-storage.ts  localStorage 저장·복원
    loadout.ts     양손 무기와 스킬별 보조형스킬
    enemy.ts       적 정의와 보스 패턴
    combo.ts       콤보 게이지
    crowd-control.ts  보스 CC 면역 규칙
    dps.bench.test.ts 무기별 각성 배율 계측
  audio/
    sfx.ts         절차형 WebAudio 효과음
  scenes/          Phaser 씬. 상태를 그리고 입력을 전달한다
docs/              기획 및 진행 문서
```

보조형스킬은 전용 코드를 갖지 않습니다. 투사체 조합 엔진, 지대 엔진,
범용 수정자 파이프라인 세 가지의 조합으로 표현되며, 새 보조형스킬을 추가하는 일은
`data/supports.ts`에 항목을 하나 더 넣는 일입니다.

`engine/`은 Phaser를 import 하지 않습니다. 전투 규칙을 브라우저 없이 테스트로 고정하기 위해서입니다.

## 문서

- [예선 요구사항 및 실행 플랜](docs/preliminary-requirements-and-plan.md)
- [기획 원형 구현 플랜](docs/full-concept-implementation-plan.md)
- [예선 빌드 스코프](docs/game-scope.md)
- [플레이 테스트 요청](docs/playtest-brief.md)
- [액션 트래커](docs/action-tracker.md)
- [AI 활용 기록 로그](docs/ai-usage-log.md)

## 라이선스 및 출처

외부 에셋과 오픈소스 출처는 사용 시점에 기록하며, 최종 제출 시 AI 활용 기술 문서에 정리합니다.
현재 게임 내 이미지는 OpenAI `gpt-image-1`로 생성한 원본을 `assets-raw/`에 보관하고,
게임용 축소본을 `public/sprites/`에서 사용합니다. 생성 프롬프트와 출처 기록은
`docs/art-spec.md`에 정리되어 있습니다. 효과음은 에셋 파일 없이 WebAudio로 합성합니다.
