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
| Space | 대시 |
| 1 / 2 / 3 | 보조능력 선택 |
| R | 재시작 |

데스크톱 브라우저(Chrome, Safari)를 권장합니다. 모바일 브라우저에서도 화면은 맞춰지지만 조작은 키보드·마우스 기준으로 설계되었습니다.

## 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 타입 검사 + 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 확인 (http://localhost:4173)
npm run typecheck
```

Node 20.19 이상이 필요합니다.

### 개발용 진입 파라미터

`?scene=<이름>`으로 특정 씬부터 시작할 수 있습니다. 타이틀을 건너뛰고 반복 확인할 때 사용합니다.

```
http://localhost:5173/?scene=Play
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
  scenes/
    BootScene.ts   타이틀
    PlayScene.ts   플레이 루프
docs/              기획 및 진행 문서
```

## 문서

- [예선 요구사항 및 실행 플랜](docs/preliminary-requirements-and-plan.md)
- [예선 빌드 스코프](docs/game-scope.md)
- [액션 트래커](docs/action-tracker.md)
- [AI 활용 기록 로그](docs/ai-usage-log.md)

## 라이선스 및 출처

외부 에셋과 오픈소스 출처는 사용 시점에 기록하며, 최종 제출 시 AI 활용 기술 문서에 정리합니다.
