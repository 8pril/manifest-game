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

> **2026-08-03 정정: 시점 요구가 틀렸다.**
>
> 이 문서는 `게임이 조준 방향에 따라 이미지를 회전시키므로 완전한 탑다운이어야 한다`고
> 적고 있었다. **코드를 확인해 보니 캐릭터와 적을 회전시키는 코드가 없다.**
> `PlayScene.ts`에서 플레이어는 원, 적은 사각형으로 그려지고 어느 쪽도 회전하지 않는다.
> 회전하는 것은 조준선과 화면 밖 적을 가리키는 화살표뿐이다.
> 개발 쪽에서 코드를 확인하지 않고 쓴 가정이었고, 그 한 줄이 시점을 잘못 묶고 있었다.
>
> 톤 참고인 아이작도 **바닥과 방은 위에서 보고 캐릭터는 정면/3-4 뷰**로 그린다.
> 완전한 탑다운은 40px에서 옷도 장비도 안 보이는 덩어리가 된다. 실제로 뽑아 비교한 결과다.

## 전제

- **시점: 3/4 뷰.** 바닥과 방은 위에서 내려다보지만 캐릭터는 살짝 비스듬한 각도로 그린다.
  옷과 장비가 읽혀야 한다. 완전한 탑다운(정수리만 보이는 각도)은 쓰지 않는다.
- **캐릭터와 적은 오른쪽(→)을 보는 자세로 그린다.** 회전은 하지 않고, 왼쪽을 볼 때는
  코드에서 좌우 반전(`setFlipX`)한다. 기준 방향이 섞이면 반전이 어긋난다.
- **모든 스프라이트의 시점과 화풍이 같아야 한다.** 3/4 뷰에서는 이게 가장 중요하다.
  캐릭터마다 각도나 붓질이 다르면 한 화면에서 따로 논다.
  **`assets-raw/player.png`를 화풍 기준으로 삼는다.**
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
| `enemy-boss.png` | 문지기 (첫 보스) | 136px | 320×320 | `#ff6b3d` 주황색 |
| `enemy-boss2.png` | 무너진 문 (최종 보스) | 156px | 320×320 | `#8f7cff` 보라색 |
| `npc-keeper.png` | 마을 관리인 NPC | 38×58px (세로형) | 128×192 | `#8ea4ff` 연보라 |
| `drop-item.png` | 보스 바닥 드랍 | 32px | 96×96 | `#ffd166` 금색 |

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

## 사운드 — **작업 불필요**

효과음은 2026-08-01에 **코드로 합성하는 방식(WebAudio)으로 구현 완료**했다.
공격·명중·처치·플레이어 피격·콤보 발동·보스 예고·보스 충격·보상 획득 소리가 이미 난다.

에셋 파일을 만들지 않는다. 외부 사운드를 쓰면 출처와 라이선스를 제출물에 적어야 하는데,
합성 방식은 그 위험이 아예 없다. 수치는 `src/audio/sfx.ts`에서 조정한다.

배경음만 우선순위 낮은 선택 항목으로 남는다. 넣는다면 반복 가능한 30초 내외 루프 하나.

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

`facing right`, `transparent background`, `no shadow`, 캔버스 크기는
게임 코드가 요구하는 조건이므로 **세계관과 무관하게 그대로 둬야 한다.**

캐릭터·적 프롬프트는 아래 **공통 꼬리말**을 그대로 붙인다. 화풍이 갈리는 것을 막는
장치이므로 항목마다 바꾸지 않는다. 투사체·지대·바닥은 화면에 눕는 요소라 탑다운 그대로다.

```
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

> **참고작을 프롬프트에 이름으로 넣지 말 것.**
>
> 톤 참고가 '아이작'이지만 `in the style of The Binding of Isaac`처럼 쓰면
> 특정 상용 작품의 화풍을 그대로 모사하게 된다. 대회 제출물에는 위험하다.
> 아래처럼 **그 작품이 주는 성질을 단어로 풀어서** 넣었다 —
> `hand-drawn`, `grimy`, `muted`, `unsettling`, `dungeon`.

**플레이어** — 현대인 + 양팔의 실체화 장비

```
a game sprite of a person in modern everyday clothing (hoodie, pants,
sneakers), wearing bulky glove-like gauntlets on both forearms with faint
cyan-blue energy at the hands (#6ea8ff),
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**현대 복장과 이세계의 대비가 이 게임의 가장 강한 훅이다.** 판타지 갑옷이나
로브가 섞여 들어오면 다시 뽑는다. 후드티·재킷·운동화 같은 것이 보여야 한다.

**사냥개** — 개 형태

```
a game sprite of a gaunt dog-like beast on four legs, lean and hunched,
unsettling, dull red tone (#d4574e),
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**껍데기** — 속이 빈 갑옷

```
a game sprite of a suit of heavy plate armor standing upright holding a
spear, broad and bulky, HOLLOW AND EMPTY INSIDE with nothing but darkness
where a body would be, visible through the neck gap and helmet slit,
dark red plating (#b0453d),
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**"갑옷 안에 아무것도 없다"가 이 적의 정체다.** 사람이 입고 있는 것처럼 보이면
다시 뽑는다. 목 부분이나 투구 틈으로 빈 어둠이 보여야 한다.

**몰이꾼** — 가죽 장비, 마후라로 가린 하관

```
a game sprite of a lean humanoid archer wearing layered leather gear, the
lower half of the face wrapped in a cloth muffler, holding a bow forward with
throwing knives at the belt, ochre yellow (#e0b055),
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**보스** — 잡몹보다 훨씬 거대

```
a game sprite of a massive looming boss creature, several times larger than
a human, heavy imposing mass, burning orange core glowing through its body
(#ff6b3d), dramatic outline, fills the canvas edge to edge,
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

표시 크기가 사냥개의 **3.4배**(136px vs 40px)다. 캔버스 안에서도 확실히 꽉 차게
그려야 한다. 잡몹과 비슷한 덩치로 나오면 다시 뽑는다.

> 기획 답변에 **"보스는 한 종류로 하면 절대 안될듯"**이 있었고, 예선 빌드는 보스 2종이다.
> `enemy-boss.png`(문지기)와 `enemy-boss2.png`(무너진 문) 두 장이 필요하다.

**최종 보스 무너진 문** — 문 형상, 보라색

```
a game sprite of a colossal ruined stone doorway that has become a creature,
cracked lintel and broken doorframe forming a hulking body, violet light
bleeding from the gap where the door should be (#8f7cff), even larger and
heavier than the other boss,
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**마을 관리인 NPC** — 세로형, 적이 아님을 실루엣으로 구분

```
a game sprite of a calm hooded keeper standing still with hands clasped,
tall and narrow, clearly not hostile, soft pale-violet cloth (#8ea4ff),
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**바닥 드랍 아이템** — 보스가 떨어뜨리는 보상

```
a game sprite of a small floating diamond-shaped shard of golden light
(#ffd166), faceted, softly glowing, resting just above the ground,
three-quarter overhead view, thick dark hand-drawn outline, chalky grimy
texture, bold silhouette readable at 32 pixels, transparent background,
no shadow, centered
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
- [ ] **다른 스프라이트와 시점·화풍이 같은가** (3/4 뷰에서 가장 중요하다. `player.png`가 기준)
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

아래 8종은 모두 **OpenAI `gpt-image-1`** 로 2026-08-03에 생성했다. API를 직접 호출했고
프롬프트는 이 문서의 `## 프롬프트` 절에 있는 것을 그대로 썼다. 손으로 그린 부분은 없다.

| 파일 | 사용 도구 | 생성일 | 최종 프롬프트 | 사람이 수정한 부분 |
| --- | --- | --- | --- | --- |
| `player.png` | gpt-image-1 | 2026-08-03 | 이 문서 `플레이어` 항목 | 없음 |
| `enemy-chaser.png` | gpt-image-1 | 2026-08-03 | 이 문서 `사냥개` 항목 | 없음 |
| `enemy-archer.png` | gpt-image-1 | 2026-08-03 | 이 문서 `몰이꾼` 항목 | 없음 |
| `enemy-brute.png` | gpt-image-1 | 2026-08-03 | 이 문서 `껍데기` 항목 (재생성본) | 없음 |
| `enemy-boss.png` | gpt-image-1 | 2026-08-03 | 이 문서 `보스` 항목 | 없음 |
| `enemy-boss2.png` | gpt-image-1 | 2026-08-03 | 이 문서 `최종 보스 무너진 문` 항목 | 없음 |
| `npc-keeper.png` | gpt-image-1 | 2026-08-03 | 이 문서 `마을 관리인 NPC` 항목 | 없음 |
| `drop-item.png` | gpt-image-1 | 2026-08-03 | 이 문서 `바닥 드랍 아이템` 항목 | 없음 |

게임에 넣기 전 처리(코드로만, 그림은 건드리지 않음):

- 알파 기준으로 여백을 잘라내 표시 크기와 실제 그림 크기를 맞춤
- 원본 1024px → 표시 크기의 4배 수준으로 축소해 `public/sprites/`에 저장
- 원본은 `assets-raw/`에 그대로 보관

### 버린 결과와 이유

**대회는 결과물만이 아니라 AI를 어떻게 다뤘는지를 본다.** 실패한 시도도 근거가 된다.

| 시도 | 결과 | 버린 이유 |
| --- | --- | --- |
| `gpt-image-2`로 생성 | API 오류 | 이 모델은 `background: transparent`를 지원하지 않는다. 투명 배경이 필수라 `gpt-image-1`로 되돌림 |
| 완전한 탑다운 프롬프트 3종 | 1종만 성공 | `STRICT ORTHOGRAPHIC TOP-DOWN`, `NO FACE IS VISIBLE`을 넣으면 진짜 탑다운이 나오지만, 40px로 줄이면 옷도 장비도 안 보이는 덩어리가 된다. 다른 2종은 바닥을 그려 넣거나(투명 배경 파괴) 다시 3/4 뷰로 돌아갔다 |
| 첫 `껍데기` | 재생성 | `속이 비어 있다`는 정체가 안 보이고 그냥 갑옷 기사로 나왔다. 투구 안이 검은 공백이고 목 틈으로 어둠이 보이도록 프롬프트를 강화해 다시 뽑음 |
| 편집 API로 공격 포즈 | 보류 | `images/edits`에 기본 스프라이트를 넣으면 같은 캐릭터·같은 화풍을 유지한 채 포즈만 바꿀 수 있다는 것을 확인했다. 프레임을 따로 생성하면 매번 다른 캐릭터가 나오므로 이 방식이 맞다. 다만 예선 일정상 정적 스프라이트를 먼저 넣기로 함 |

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
