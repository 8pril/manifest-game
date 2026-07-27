# AI 아트 스펙

작성일: 2026-07-27  
담당: 이미지 생성은 기획 담당, 게임 반영은 개발 담당

지금 게임은 전부 도형(원·사각형)으로 그려져 있다. 이걸 스프라이트로 교체한다.
생성한 이미지를 아래 규칙대로 파일명만 맞춰서 넘기면 개발 쪽에서 붙인다.

> **생성 전에 `docs/concept-brief.md`를 먼저 채워야 한다.**
>
> 아래 프롬프트의 세계관 관련 단어(`swordfighter`, `creature`, `armored brute`,
> `dark carapace` 등)는 **개발 쪽에서 임시로 채워 넣은 값이다.** 원안에 세계관이
> 없어 근거 없이 지어낸 것이므로, 이대로 생성하면 그 임시 단어가 게임의 비주얼
> 정체성으로 굳는다.
>
> 크기·색·파일명·구도 규칙은 확정이니 그대로 쓰면 된다. **바꿔야 하는 것은
> 프롬프트의 명사와 형용사뿐이다.**

## 전제

- **시점: 탑다운.** 위에서 내려다본 각도다. 옆모습이나 3/4 뷰가 아니다.
- **캐릭터와 적은 오른쪽(→)을 보는 자세로 그린다.** 게임이 조준 방향에 따라 이미지를 회전시키므로, 기준 방향이 어긋나면 전부 비뚤어진다.
- **배경 투명 PNG.** 배경색이 칠해져 오면 못 쓴다.
- 배경이 거의 검정(`#0a0b0f`)에 어두운 격자다. **실루엣이 살아야 하므로 외곽이 밝아야 한다.**
- 화면 논리 해상도는 1280×720이고, 아래 표시 크기는 그 기준이다.
- 전투가 벌어지는 영역은 화면 전체가 아니라 `x 24~1256`, `y 100~660` 구간이다. 나머지는 HUD가 쓴다.

## 필요한 이미지

### 캐릭터와 적

| 파일명 | 대상 | 표시 크기 | 권장 캔버스 | 기준 색 |
| --- | --- | --- | --- | --- |
| `player.png` | 플레이어 | 40px | 128×128 | `#6ea8ff` 하늘색 |
| `enemy-chaser.png` | 추적자 | 44px | 128×128 | `#d4574e` 붉은색 |
| `enemy-brute.png` | 중장갑 | 56px | 192×192 | `#b0453d` 짙은 붉은색 |
| `enemy-archer.png` | 사수 | 42px | 128×128 | `#e0b055` 황토색 |
| `enemy-boss.png` | 보스 | 96px | 256×256 | `#ff6b3d` 주황색 |

표시 크기가 작으므로 **디테일보다 실루엣이 중요하다.** 축소했을 때 뭉개지지 않는 단순한 형태로.

표시 크기는 캐릭터가 화면에서 차지하는 지름이다. 권장 캔버스는 그보다 크게 잡아 여유를 두었으니, 캔버스를 꽉 채우지 말고 가장자리에 여백을 남기면 된다.

### 투사체

| 파일명 | 대상 | 표시 크기 | 권장 캔버스 |
| --- | --- | --- | --- |
| `bolt-sword.png` | 검 계열 | 14px | 64×64 |
| `bolt-bow.png` | 활 화살 | 14px | 64×64 |
| `bolt-arcane.png` | 비전 탄 | 14px | 64×64 |
| `bolt-enemy.png` | 적 탄 | 16px | 64×64 |

투사체도 오른쪽을 향하게. 회전해서 쓴다.

### 지대

| 파일명 | 종류 | 기준 색 |
| --- | --- | --- |
| `area-plain.png` | 기본 | `#8b90a3` |
| `area-ignite.png` | 점화 | `#ff6b3d` |
| `area-shock.png` | 감전 | `#ffd23d` |
| `area-chill.png` | 냉각 | `#6ec8ff` |

원형이고 캔버스 256×256. **가운데가 비치고 가장자리로 갈수록 진해지는** 형태가 좋다. 적과 플레이어가 그 위에 올라가므로 너무 불투명하면 안 된다.

실제 표시 지름은 멸검 230px, 균열 파동 300px이고 보조능력에 따라 더 커진다.

### 배경

| 파일명 | 용도 | 캔버스 |
| --- | --- | --- |
| `tile-floor.png` | 바닥 타일 (반복) | 128×128 |

**상하좌우가 이어지는 타일링 패턴**이어야 한다. 이음매가 보이면 못 쓴다. 어둡고 차분하게 — 캐릭터가 묻히면 안 된다.

## 팔레트

게임에 이미 쓰이는 색이다. 여기서 크게 벗어나면 UI와 따로 논다.

| 용도 | 색 |
| --- | --- |
| 배경 | `#0a0b0f` |
| 격자선 | `#1b1e2b` |
| 플레이어 | `#6ea8ff` |
| 강조 (조준선·카드 테두리) | `#ffa159` |
| 본문 텍스트 | `#e6e8ef` |
| 보조 텍스트 | `#8b90a3` |
| 체력바 | `#6ee7a8` |

무기 색도 이미 정해져 있다. 검 `#c9d1e8` / 활 `#9ae6a0` / 비전 `#b08bff` / 방패 `#ffc55c`.

## 프롬프트 초안

**세계관 단어는 임시값이다.** `docs/concept-brief.md`가 채워지면 이 절을 다시 쓴다.
지금은 구조만 참고할 것. `top-down view`, `facing right`, `transparent background`,
`no shadow`, 캔버스 크기는 세계관과 무관하게 유지해야 하는 부분이다.

**플레이어**
```
top-down view of a lone swordfighter game sprite, seen directly from above,
facing right, compact silhouette, glowing cyan-blue accents (#6ea8ff),
dark armor, clean readable shape, transparent background, no shadow,
centered, game asset, 128x128
```

**추적자**
```
top-down view of a small aggressive creature game sprite, seen directly from
above, facing right, hunched forward, dull red tone (#d4574e), simple bold
silhouette readable at small size, transparent background, no shadow, 128x128
```

**중장갑**
```
top-down view of a heavy armored brute game sprite, seen directly from above,
facing right, broad and bulky, dark red plating (#b0453d), thick shoulders,
simple readable silhouette, transparent background, no shadow, 192x192
```

**사수**
```
top-down view of a ranged archer creature game sprite, seen directly from
above, facing right, slender, holding a bow forward, ochre yellow (#e0b055),
simple readable silhouette, transparent background, no shadow, 128x128
```

**보스**
```
top-down view of a large menacing boss creature game sprite, seen directly
from above, facing right, imposing mass, burning orange core (#ff6b3d),
dark carapace, dramatic but readable silhouette, transparent background,
no shadow, 256x256
```

**투사체 (색만 바꿔 반복)**
```
top-down view of a small glowing projectile, pointing right, elongated
teardrop shape, bright core with soft outer glow, color #9ae6a0,
transparent background, centered, 64x64
```

**지대 (색만 바꿔 반복)**
```
top-down circular ground effect, seen from directly above, soft ring of
energy, translucent center, brighter toward the edge, color #ff6b3d,
transparent background, centered, 256x256
```

**바닥 타일**
```
seamless tileable dark floor texture, top-down view, very dark blue-grey
(#0a0b0f base), subtle worn metal panel pattern, low contrast, no strong
features, seamless on all four edges, 128x128
```

## 검수 기준

넘기기 전에 확인할 것.

- [ ] 배경이 투명한가 (흰색·검정으로 칠해져 있지 않은가)
- [ ] 위에서 내려다본 각도인가 (옆모습·3/4 뷰가 섞이지 않았는가)
- [ ] 오른쪽을 보고 있는가
- [ ] 표시 크기로 줄였을 때 형태가 알아보이는가
- [ ] 어두운 배경 위에서 묻히지 않는가
- [ ] 바닥 타일은 네 방향으로 이음매 없이 반복되는가
- [ ] 캐릭터 크기 비율이 표의 표시 크기와 대략 맞는가

## 넘기는 방법

`assets-raw/` 폴더를 만들어 위 파일명 그대로 넣고 커밋하면 된다. 개발 쪽에서 게임에 반영한다.

크기가 정확하지 않아도 된다. 비율만 맞으면 코드에서 맞춘다.

## 출처 기록

**제출물 4번(AI 활용 기술 문서)에 생성 출처를 반드시 적어야 한다.** 만들면서 아래를 같이 남겨 두면 나중에 찾아 헤매지 않는다.

| 파일 | 사용 도구 | 생성일 | 최종 프롬프트 | 사람이 수정한 부분 |
| --- | --- | --- | --- | --- |
| | | | | |

시도했다가 버린 결과와 버린 이유도 적어 두면 문서가 훨씬 두꺼워진다. 이 대회는 결과물만이 아니라 **AI를 어떻게 다뤘는지**를 보기 때문이다.

## 우선순위

시간이 모자라면 위에서부터. 아래는 없어도 게임은 돌아간다.

1. 플레이어, 적 4종 — 이것만 바뀌어도 인상이 크게 달라진다
2. 바닥 타일 — 배경이 채워지면 완성도가 올라간다
3. 투사체
4. 지대 — 지금 반투명 원도 충분히 읽힌다
