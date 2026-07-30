# AI 아트 스펙

작성일: 2026-07-27  
담당: 이미지 생성은 기획 담당, 게임 반영은 개발 담당

지금 게임은 전부 도형(원·사각형)으로 그려져 있다. 이걸 스프라이트로 교체한다.
생성한 이미지를 아래 규칙대로 파일명만 맞춰서 넘기면 개발 쪽에서 붙인다.

> **2026-07-30 갱신: 생성을 시작해도 된다.**
>
> 기획 담당이 `docs/concept-brief.md`를 채웠고, 아래 프롬프트를 그 내용으로
> 다시 썼다. 이전에 개발 쪽에서 임시로 지어냈던 단어(`a lone swordfighter`,
> `armored brute`, `dark carapace` 등)는 전부 버렸다.
>
> 제목만 아직 미정인데, 아트 생성을 막지 않는다.

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
| `enemy-chaser.png` | 사냥개 | 40px | 128×128 | `#d4574e` 붉은색 |
| `enemy-brute.png` | 껍데기 | 56px | 192×192 | `#b0453d` 짙은 붉은색 |
| `enemy-archer.png` | 몰이꾼 | 42px | 128×128 | `#e0b055` 황토색 |
| `enemy-boss.png` | 문지기 (보스) | 136px | 320×320 | `#ff6b3d` 주황색 |

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

## 사운드

이미지와 같은 성격의 에셋 작업이라 여기 함께 둔다. **같은 노력 대비 체감 변화가 가장 큰 항목이다.** 지금 게임에는 소리가 하나도 없다.

짧은 효과음 위주로, 길어야 1초 안쪽. 형식은 `.mp3` 또는 `.ogg`, 모노면 충분하다.

| 파일명 | 언제 나는 소리 | 길이 |
| --- | --- | --- |
| `sfx-swing.mp3` | 근접 무기 휘두름 (검·방패) | 0.2초 |
| `sfx-shoot.mp3` | 투사체 발사 (활·비전) | 0.2초 |
| `sfx-hit.mp3` | 적 명중. 가장 자주 난다 | 0.15초 |
| `sfx-kill.mp3` | 적 처치 | 0.3초 |
| `sfx-burst.mp3` | 상처 폭발 | 0.5초 |
| `sfx-slam.mp3` | 벽 충돌 | 0.4초 |
| `sfx-combo.mp3` | 콤보 발동 스킬 사용 | 0.4초 |
| `sfx-hurt.mp3` | 플레이어 피격 | 0.3초 |
| `sfx-pick.mp3` | 보조능력 선택 | 0.3초 |
| `sfx-win.mp3` / `sfx-lose.mp3` | 승리 / 패배 | 1초 |

주의할 점이 하나 있다. **`sfx-hit`는 초당 수십 번 날 수 있다.** 다중투사체 빌드에서는 더 심하다. 길거나 존재감이 큰 소리를 쓰면 금방 귀에 거슬리므로, 짧고 건조한 소리여야 한다. 나머지는 상대적으로 드물게 나므로 조금 더 존재감이 있어도 된다.

배경음은 우선순위가 낮다. 넣는다면 반복 가능한 30초 내외 루프 하나면 충분하다.

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

## 프롬프트

기획 담당의 세계관 답변(`docs/concept-brief.md`)을 반영한 것이다.

`top-down view`, `facing right`, `transparent background`, `no shadow`, 캔버스 크기는
게임 코드가 요구하는 조건이므로 **세계관과 무관하게 그대로 둬야 한다.**

> **참고작을 프롬프트에 이름으로 넣지 말 것.**
>
> 톤 참고가 '아이작'이지만 `in the style of The Binding of Isaac`처럼 쓰면
> 특정 상용 작품의 화풍을 그대로 모사하게 된다. 대회 제출물에는 위험하다.
> 아래처럼 **그 작품이 주는 성질을 단어로 풀어서** 넣었다 —
> `hand-drawn`, `grimy`, `muted`, `unsettling`, `dungeon`.

**플레이어** — 현대인 + 양팔의 실체화 장비

```
top-down view of a game sprite: a person in modern everyday clothing
(hoodie and pants), seen directly from above, facing right, wearing bulky
glove-like gauntlets on both forearms, faint cyan-blue energy at the hands
(#6ea8ff), compact readable silhouette, hand-drawn grimy texture, muted
palette, transparent background, no shadow, centered, 128x128
```

**현대 복장과 이세계의 대비가 이 게임의 가장 강한 훅이다.** 판타지 갑옷이나
로브가 섞여 들어오면 다시 뽑는다. 후드티·재킷·운동화 같은 것이 보여야 한다.

**사냥개** — 개 형태

```
top-down view of a game sprite: a gaunt dog-like beast seen directly from
above, facing right, four legs, lean and hunched, dull red tone (#d4574e),
hand-drawn grimy texture, unsettling but simple bold silhouette readable at
small size, transparent background, no shadow, 128x128
```

**껍데기** — 속이 빈 갑옷

```
top-down view of a game sprite: a suit of heavy plate armor standing upright
and holding a spear, seen directly from above, facing right, broad and bulky,
HOLLOW AND EMPTY INSIDE with nothing but darkness where a body would be,
dark red plating (#b0453d), hand-drawn grimy texture, transparent background,
no shadow, 192x192
```

**"갑옷 안에 아무것도 없다"가 이 적의 정체다.** 사람이 입고 있는 것처럼 보이면
다시 뽑는다. 목 부분이나 투구 틈으로 빈 어둠이 보여야 한다.

**몰이꾼** — 가죽 장비, 마후라로 가린 하관

```
top-down view of a game sprite: a lean humanoid archer seen directly from
above, facing right, wearing layered leather gear, lower face wrapped in a
cloth muffler, holding a bow forward with throwing knives at the belt,
ochre yellow (#e0b055), hand-drawn grimy texture, transparent background,
no shadow, 128x128
```

**보스** — 잡몹보다 훨씬 거대

```
top-down view of a game sprite: a massive looming boss creature seen directly
from above, facing right, several times larger than a human, heavy imposing
mass, burning orange core glowing through its body (#ff6b3d), hand-drawn
grimy texture, dramatic but readable silhouette, transparent background,
no shadow, 320x320
```

표시 크기가 사냥개의 **3.4배**(136px vs 40px)다. 캔버스 안에서도 확실히 꽉 차게
그려야 한다. 잡몹과 비슷한 덩치로 나오면 다시 뽑는다.

> 기획 답변에 **"보스는 한 종류로 하면 절대 안될듯"**이 있다. 예선 빌드는 아직
> 보스 1종이므로 이미지도 1장이다. 보스가 늘어나면 늘어난 수만큼 추가로 필요하다.

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

장소는 "현대인이 끌려온 이세계"이고 인상은 던전 쪽이다.
금속 패널 같은 현대적·SF적 재질은 쓰지 않는다.

```
seamless tileable dark dungeon floor texture, top-down view, very dark
blue-grey base (#0a0b0f), worn cracked stone slabs with grime in the seams,
hand-drawn texture, low contrast, no strong focal features, seamless on all
four edges, 128x128
```

바닥은 **캐릭터를 받쳐주는 배경이지 주인공이 아니다.** 무늬가 눈에 띄면 다시 뽑는다.

## 검수 기준

넘기기 전에 확인할 것.

- [ ] 배경이 투명한가 (흰색·검정으로 칠해져 있지 않은가)
- [ ] 위에서 내려다본 각도인가 (옆모습·3/4 뷰가 섞이지 않았는가)
- [ ] 오른쪽을 보고 있는가
- [ ] 표시 크기로 줄였을 때 형태가 알아보이는가
- [ ] 어두운 배경 위에서 묻히지 않는가
- [ ] 바닥 타일은 네 방향으로 이음매 없이 반복되는가
- [ ] 캐릭터 크기 비율이 표의 표시 크기와 대략 맞는가

세계관에서 어긋나기 쉬운 것들. **이미지 생성기가 가장 자주 무시하는 항목이다.**

- [ ] 플레이어가 **현대 복장**인가 (판타지 갑옷·로브로 바뀌지 않았는가)
- [ ] 플레이어의 **양팔에 실체화 장비**가 보이는가
- [ ] 껍데기의 **속이 비어 있는가** (사람이 입은 것처럼 보이지 않는가)
- [ ] 몰이꾼의 **하관이 가려져** 있는가
- [ ] 사냥개가 **네 발 짐승 형태**인가 (사람 형태로 바뀌지 않았는가)
- [ ] 보스가 잡몹보다 **확연히 거대**한가

## 넘기는 방법

`assets-raw/` 폴더를 만들어 위 파일명 그대로 넣고 커밋하면 된다. 개발 쪽에서 게임에 반영한다.

크기가 정확하지 않아도 된다. 비율만 맞으면 코드에서 맞춘다.

## 출처 기록

**제출물 4번(AI 활용 기술 문서)에 생성 출처를 반드시 적어야 한다.** 만들면서 아래를 같이 남겨 두면 나중에 찾아 헤매지 않는다.

| 파일 | 사용 도구 | 생성일 | 최종 프롬프트 | 사람이 수정한 부분 |
| --- | --- | --- | --- | --- |
| | | | | |

사운드를 생성이 아니라 **무료 음원에서 가져오는 경우에도 출처와 라이선스를 반드시 남겨야 한다.** 요구사항이 `외부 에셋 / 오픈소스 출처`를 명시하고 있고, 라이선스 누락은 실격 사유가 될 수 있다. 사이트 이름, 원본 링크, 라이선스 종류(CC0, CC-BY 등)를 함께 적을 것.

시도했다가 버린 결과와 버린 이유도 적어 두면 문서가 훨씬 두꺼워진다. 이 대회는 결과물만이 아니라 **AI를 어떻게 다뤘는지**를 보기 때문이다.

## 우선순위

시간이 모자라면 위에서부터. 아래는 없어도 게임은 돌아간다.

1. 플레이어, 적 4종 — 이것만 바뀌어도 인상이 크게 달라진다
2. **효과음 중 `hit` / `kill` / `swing` / `shoot` 네 개** — 소리가 하나도 없는 상태라 이 넷만 들어가도 체감이 크게 달라진다
3. 바닥 타일 — 배경이 채워지면 완성도가 올라간다
4. 나머지 효과음
5. 투사체
6. 지대 — 지금 반투명 원도 충분히 읽힌다
7. 배경음
