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
> **2026-08-10 갱신:** 제목은 `MANIFEST: LOST ECHOES`로 확정됐다.
> 제목 글자는 배경 이미지에 굽지 않고 게임에서 별도로 렌더링한다.

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
| `enemy-boss-warden.png` | 제단지기 (윗길 보스) | 144px | 320×320 | `#6be0a0` 연녹색 |
| `enemy-boss-glutton.png` | 굴의 포식자 (아랫길 보스) | 172px | 320×320 | `#d9a441` 호박색 |
| `npc-keeper.png` | 마을 관리인 NPC | 38×58px (세로형) | 128×192 | `#8ea4ff` 연보라 |
| `drop-item.png` | 보스 바닥 드랍 | 32px | 96×96 | `#ffd166` 금색 |
| `key-upper.png` | 윗길 열쇠 | 30px | 96×96 | `#9ae6a0` 연녹색 |
| `key-lower.png` | 아랫길 열쇠 | 30px | 96×96 | `#ffc55c` 호박색 |
| `potion.png` | HUD 충전형 물약 | 26×42px (세로형) | 59×96 | `#ff4054` 붉은색 |

### 손에 든 무기

캐릭터가 어느 무기를 들었는지 그림으로 보여준다. HUD 글자와 공격 이펙트 색만으로는
`양손에 서로 다른 무기를 실체화한다`는 정체성이 화면에 드러나지 않았다.

| 파일명 | 대상 | 표시 크기 | 권장 캔버스 | 기준 색 |
| --- | --- | --- | --- | --- |
| `weapon-sword.png` | 검 | 34px | 128×128 | `#c9d1e8` |
| `weapon-bow.png` | 활 | 34px | 128×128 | `#9ae6a0` |
| `weapon-arcane.png` | 비전 | 34px | 128×128 | `#b08bff` |
| `weapon-shield.png` | 방패 | 34px | 128×128 | `#ffc55c` |

**손·팔·사람이 함께 그려지면 못 쓴다.** 코드가 캐릭터의 손 위치에 얹고 조준 방향으로
돌리기 때문에, 무기만 단독으로 오른쪽을 향해 누워 있어야 한다.

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

실제 표시 지름은 멸검 164px, 균열 파동 300px이고 보조능력에 따라 더 커진다.

### 배경

| 파일명 | 용도 | 캔버스 |
| --- | --- | --- |
| `tile-floor.png` | 바닥 타일 (반복) | 128×128 |
| `tile-wall.png` | 벽 타일 (반복) | 192×38 (가로로 긴 띠) |
| `lore-stone.png` | 방 서술 오브젝트 | 128×101 |

**출구는 아트를 쓰지 않는다.** 위에서 내려다보는 시점에서 출구는 문짝이 아니라 벽이 끊긴
자리다. 벽 띠를 출구 높이만큼 끊고 그 틈을 색 사각형이 채운다. 자세한 경위는
[버린 결과와 이유](#버린-결과와-이유) 참고.

벽은 **판정 경계 안쪽 24px 띠**에만 그린다. 카메라가 방 밖으로 나가지 않으므로
그보다 두껍게 그릴 자리가 없다. 바닥보다 밝고 구조가 분명해야 경계가 읽힌다.

**정사각형이 아니라 가로로 긴 띠여야 한다.** 정사각 타일을 쓰면 띠 두께보다 타일이 커서
가로 벽과 세로 벽이 타일의 서로 다른 부분을 잘라 쓰게 되고, 네 면의 돌 크기가 달라진다.
세로 벽은 같은 띠를 90도 돌려 쓴다.

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

첫 시도는 그냥 갑옷 기사로 나왔다. **아래가 실제로 채택된 재생성 프롬프트다.**
`속이 비어 있다`를 한 번만 말하면 무시되므로 세 군데(투구·목·겨드랑이)를 따로 지정했고,
받침 그림자가 딸려 오길래 `no ground, no pedestal`도 넣었다.

```
a game sprite of an EMPTY suit of heavy plate armor holding a spear. THERE
IS NO PERSON INSIDE. The helmet visor is a black void, the neck gorget opens
onto pure darkness, and a gap between the breastplate and pauldron shows
there is nothing but shadow within. The armor stands by itself, hollow and
animated. Broad and bulky, dark red plating (#b0453d),
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, no ground, no pedestal, centered
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

> 기획 답변에 **"보스는 한 종류로 하면 절대 안될듯"**이 있었다. 예선 빌드는 **보스 4종**이다.
> `enemy-boss.png`(문지기), `enemy-boss2.png`(무너진 문), `enemy-boss-warden.png`(제단지기),
> `enemy-boss-glutton.png`(굴의 포식자).

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

**윗길 보스 제단지기** — 가늘고 날카롭게, 연녹색

```
a game sprite of a tall gaunt altar sentinel, several times larger than a
human, lean angular armoured frame with long blade-like limbs, poised to
lunge, pale green light glowing through the seams of its plating (#6be0a0),
sharp narrow silhouette that reads as fast and dangerous, the whole creature
fits inside the canvas with a small margin, nothing cropped, no ground,
no rock, no scenery,
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

**아랫길 보스 굴의 포식자** — 크고 둔중하게, 호박색

```
a game sprite of an enormous bloated cave devourer, far bulkier and heavier
than any other creature, sagging armoured hide in thick slabs, squat and low,
dull amber light glowing between the folds (#d9a441), massive rounded
silhouette that reads as slow and unkillable, the whole creature fits inside
the canvas with a small margin, nothing cropped, no ground, no rock,
no scenery,
three-quarter overhead view: the floor is seen from above but the figure is
drawn at a slight tilt so clothing and gear stay readable, facing right,
thick dark hand-drawn outline, chalky grimy texture, muted desaturated
palette, bold silhouette readable at 40 pixels, transparent background,
no shadow, centered
```

> **보스 4종은 실루엣으로 갈려야 한다.** 제단지기는 가늘고 각지게, 포식자는 크고
> 둥글게 잡았다. 40픽셀로 줄였을 때 색을 빼고도 어느 쪽인지 알 수 있어야 한다.
> `nothing cropped, no ground, no rock, no scenery`를 넣은 이유는 첫 시도에서
> 바닥 바위가 함께 그려지고 사지가 캔버스 밖으로 잘렸기 때문이다.

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

**HUD 충전형 물약** — 실제 충전량은 코드에서 병 내부 액체로 그린다

아트 자체에 액체가 차 있으면 `potionCharge`와 충돌한다. 병은 비어 있어야 하고,
빨간 충전 상태는 `PlayScene`이 아래에서 위로 채운다.

이 아트에는 다른 스프라이트에 없는 조건이 둘 있다.

**안쪽이 투명하게 뚫려 있어야 한다.** 액체를 병보다 **뒤에** 깔아야 유리에 담긴 것처럼
보이고 테두리와 코르크가 살아남는데, 안쪽이 불투명하면 뒤에 깐 액체가 아예 안 보인다.
처음 생성본이 그랬다. 눈으로는 비어 보여도 안쪽에 흐린 유리색이 덮여 있었다.
**알파 히스토그램으로 확인한다** — 병 중앙 픽셀의 알파가 0이어야 한다.

**테두리가 밝아야 한다.** 안쪽을 뚫으면 병은 윤곽선만 남는다. 어두운 던전 팔레트에
맞춰 어두운 선으로 뽑으면 26px에서 사라진다. 재생성본은 윤곽 밝기를 38→125로 올렸다.

```
A small EMPTY healing potion bottle icon for a dark top-down fantasy action game HUD.
The bottle is drawn as an OUTLINE ONLY: a bright light-grey glass rim, a short neck, a cork stopper, and a metal collar.
IMPORTANT: the entire inside of the glass must be a fully transparent CUT-OUT — pure alpha 0, not white, not grey, not tinted glass, not frosted. The game draws the red charge fill BEHIND the bottle and it must show through.
No liquid, no half-filled potion, no red fluid, no glowing contents, no colored fill, no shading inside the glass.
The outline must be bright enough to read against a dark background at 26 pixels wide.
Centered on transparent background, no floor, no shadow, no text, no watermark.
```

병 안쪽 폭은 `PlayScene`이 **스프라이트를 행마다 훑어서** 잰다(`potionBodySpans`).
숫자를 손으로 적어 두면 아트를 다시 뽑을 때마다 다시 맞춰야 하고, 실제로 폭을 고정한
사각형으로 채웠을 때 병이 좁아지는 목과 바닥에서 액체가 유리 밖으로 삐져나왔다.

**열쇠** — 봉인된 문을 여는 두 개

윗길과 아랫길에서 하나씩 나온다. **한 벌로 읽혀야 한다.**

처음에는 손잡이 모양까지 갈랐는데(윗길은 뾰족한 제단 아치, 아랫길은 거친 굴 입구),
그러면 한 문을 여는 짝이 아니라 **서로 상관없는 두 아이템**으로 보였다. 인벤토리에서
`2개 중 2개 모았다`가 한눈에 안 들어온다.

열쇠로 플레이어가 하는 일은 **둘 다 모으기** 하나뿐이다. 어느 쪽을 쓸지 고르지 않으므로
모양까지 가를 이유가 없다. 어디서 얻었는지는 칸에 붙는 이름이 말한다.

그래서 **실루엣은 하나로 두고 발광 색만 가른다.**

```
a game sprite of a single ornate key, slender and angular, its bow shaped
like a pointed altar arch, pale green light glowing along the shaft
(#9ae6a0), the whole key fits inside the canvas with a margin, nothing
cropped, no ground, no keyhole, no chain, just the key,
three-quarter overhead view, thick dark hand-drawn outline, chalky grimy
texture, bold silhouette readable at 32 pixels, transparent background,
no shadow, centered
```

`key-lower.png`는 새로 생성하지 않고 이 원본에서 파생한다. 그래야 실루엣이 정확히
같다. **채도가 있는 픽셀만** 목표 색조(`#ffc55c`)로 옮기고 무채색인 돌과 외곽선은
건드리지 않는다. 채도 문턱은 0.12를 썼다.

> **배경에 알파 1~47짜리 옅은 안개가 깔려 나왔다.** 눈으로는 거의 안 보이는데
> 여백 잘라내기가 캔버스 전체를 내용으로 읽어 통째로 무력화된다. 알파 60 미만을
> 0으로 깎고 잘라냈다. 실제 그림은 200 이상이 대부분이라 외곽선은 안 갉힌다.
> **투명도는 눈이 아니라 알파 히스토그램으로 확인한다.**

**손에 든 무기 4종**

```
<무기 설명>,
the weapon lies flat pointing to the right, seen from a three-quarter
overhead angle, thick dark hand-drawn outline, chalky grimy texture, muted
desaturated palette, bold silhouette readable at 30 pixels, transparent
background, no shadow, no hand, no arm, no person, just the weapon, centered
```

`<무기 설명>`에 넣은 것:

| 무기 | 설명 |
| --- | --- |
| 검 | `a short heavy sword blade with a plain crossguard, pale steel (#c9d1e8), conjured look with a faint glow along the edge` |
| 활 | `a simple recurve bow with the string drawn, pale green energy (#9ae6a0), conjured look` |
| 비전 | `a floating arcane focus: a jagged violet crystal shard wrapped in faint runes (#b08bff), conjured look` |
| 방패 | `a broad round shield seen edge-on tilted forward, amber metal with a heavy rim (#ffc55c), conjured look` |

`no hand, no arm, no person, just the weapon`이 핵심이다. 이게 없으면 손이 딸려 와서
캐릭터의 손 위에 또 손이 얹힌다.

**투사체 (색만 바꿔 반복)**
색 부분만 바꿔 4번 돌린다. 검 `#c9d1e8 pale steel` / 활 `#9ae6a0 pale green` /
비전 `#b08bff violet` / 적 `#e0b055 ochre yellow`.

```
a small glowing projectile for a top-down game, seen from directly above,
pointing right, elongated teardrop shape, bright core with soft outer glow,
color <색>, hand-drawn chalky texture, transparent background, no shadow,
centered
```

**지대 (색만 바꿔 반복)**
```
a circular ground effect seen from directly above, a soft ring of energy
lying flat on the floor, translucent and mostly empty in the middle,
brighter toward the outer edge, color <색>, hand-drawn chalky texture,
transparent background, no shadow, centered, perfectly circular
```

**콤보 링**

```
a circular halo band seen from directly above, lying flat, perfectly circular,
a soft thick gradient: faint at the inner edge and bright at the outer edge,
like a ring of light on the floor, no hard outline, the inside is completely
empty and fully transparent, PURE WHITE only with no colour at all so it can
be tinted, transparent background, no shadow, centered, fills the canvas
```

무기 색으로 틴트해서 쓰므로 **반드시 무채색**이어야 한다. 색이 섞여 있으면 틴트가 탁해진다.

**벽 타일**

```
a seamless horizontally tileable stone dungeon wall texture seen from directly
above, a narrow band of stacked heavy stone blocks with deep dark mortar gaps,
lighter and more structured than the floor so the room edge is obvious,
cool grey-blue stone, hand-drawn chalky texture, the pattern must tile
seamlessly on the left and right edges, no objects, no perspective, flat
```

따뜻한 갈색 계열로 나오면 다시 뽑는다. 게임 팔레트가 차가운 어두운 색이라 따로 논다.

**바닥 타일**

장소는 "현대인이 끌려온 이세계"이고 인상은 던전 쪽이다.
금속 패널 같은 현대적·SF적 재질은 쓰지 않는다.

```
a seamless tileable dark dungeon floor texture seen from directly above,
very dark blue-grey base (#0a0b0f), worn cracked stone slabs with grime
settled in the seams, hand-drawn chalky texture, low contrast, no strong
focal features, no objects, the pattern must tile seamlessly on all four
edges
```

바닥은 **캐릭터를 받쳐주는 배경이지 주인공이 아니다.** 무늬가 눈에 띄면 다시 뽑는다.

**바닥 장식물**

방마다 종류와 개수를 다르게 깔아 "다른 곳"으로 읽히게 하는 소품이다. 충돌 판정은 없다.
공통 꼬리말은 아래를 쓴다.

```
seen from DIRECTLY ABOVE looking straight down at the floor, orthographic
top-down, NO PERSPECTIVE, no side of the object is visible, it lies flat on
the ground, hand-drawn chalky texture, muted desaturated palette, cool dark
blue-grey dungeon tones, thick dark outline, bold silhouette readable at 60
pixels, transparent background, no floor beneath it, no shadow, centered
```

| 파일 | 앞에 붙이는 내용 |
| --- | --- |
| `prop-rubble.png` | `A scattered pile of broken stone rubble and chunks of masonry lying on a dungeon floor, irregular clustered heap, a few larger slabs among smaller fragments` |
| `prop-pillar.png` | `The broken stump of a stone pillar, snapped off near the floor so only the round base and a jagged cross-section remain, seen from above as a rough circle with a cracked ring of stone around a broken core` |
| `prop-bones.png` | `A small scatter of old bones and a cracked skull lying on a dungeon floor, bleached pale grey-yellow, loosely spread, not a neat pile, the bones do not touch each other` + 아래 투명 배경 강화 문구 |
| `prop-brazier.png` | `A dead cold brazier: a squat bowl of BLACK WROUGHT IRON with a riveted rim, standing on THREE SPLAYED IRON LEGS that stick out from under the bowl like a tripod, so its outline is not a plain circle. Looking straight down into the bowl we see only cold grey ash and dead black charcoal. THE FIRE IS OUT: no flames, no glowing embers, no orange light, no heat, nothing is burning. Dark iron, NOT stone, no masonry, no grey stone ring` |
| `prop-brazier-candidate.png` | `A small extinguished stone brazier lying on a dungeon floor, a low broken circular stone fire bowl with cold dark ash inside, no flame, no ember glow, no orange light, no red light, no yellow light, harmless environment decoration, not a danger marker` |

**생성 직후에는 셋 다 바닥보다 훨씬 밝아 장식이 주인공이 됐다.** 벽 타일 때와 같이
코드로 밝기를 낮춰 가라앉혔다. 장식물은 눈에 띄면 안 되고, 있는 줄 알면 된다.

뼈는 **`background: transparent`를 줬는데도 뼈 뒤에 회색 판이 깔려 나왔다.** 바닥에 놓으면
네모난 타일처럼 보인다. 흩어진 물체는 사이사이가 다 뚫려 있어야 해서 모델이 배경을
채우려 드는 것으로 보인다. 아래를 덧붙여 다시 뽑아 해결했다.

```
CUTOUT ON A FULLY TRANSPARENT BACKGROUND: there must be NO backing panel,
NO tile, NO rectangle, NO patch of ground behind the bones. Only the bones
themselves are drawn. Everything between and around the bones is empty and
transparent.
```

**투명 픽셀 비율을 숫자로 확인한다.** 눈으로만 보면 어두운 배경판을 놓친다.
현재 잔해 45%, 기둥 27%, 뼈 75%, 화톳불 30%. 흩어진 물체인데 비율이 낮으면 배경이 깔린 것이다.

**밝기도 눈이 아니라 숫자로 맞춘다.** 불투명 픽셀의 평균 밝기를 재서 네 소품을 같은 층에
앉힌다. 기준은 바닥 타일 25.6이고 소품은 **30 근처**다. 처음에는 눈대중으로 계수를 정했다가
뼈가 44.7(너무 밝아 혼자 떠오름), 화톳불이 19.7(바닥보다 어두워 구멍처럼 보임)로 어긋났다.
계수만 고쳐 잔해 30.4 / 기둥 30.8 / 뼈 30.1 / 화톳불 29.3으로 맞췄다.

**소품끼리 실루엣이 겹치지 않아야 한다.** 종류를 늘려도 형태가 같으면 같은 것을 두 번 깐
셈이다. 화톳불 첫 후보가 기둥과 똑같은 회색 돌 원반이라 60px에서 구분이 안 됐다.
재질을 돌에서 **철**로 바꾸고 다리를 뻗은 삼발이로 만들어 갈랐다.

**타이틀 배경**

```
Key art for a dark fantasy top-down dungeon game. A colossal ruined stone
doorway looms in silhouette, its lintel cracked and its frame broken, violet
light bleeding from the gap where the door should be. A tiny hooded figure
with one sword stands far below it, dwarfed. Heavy stone, deep shadow,
hand-drawn painterly chalky texture, thick dark outlines, muted desaturated
palette, cool dark blue-grey dungeon tones with one accent light source,
cinematic wide key art, ABSOLUTELY NO TEXT, no letters, no words, no title,
no logo, no signature, no watermark, the centre and lower half must stay dark
and uncluttered so title text can be placed on top
```

제목 글자는 **그림에 굽지 않고 코드로 얹는다.** 제목이 바뀌어도 이미지를 다시 안 뽑는다.
`no text` 계열 지시를 길게 넣은 것은 이미지 모델이 키 아트에 뜻 없는 글자를 그려 넣기 때문이다.

**아이콘**

```
A bold simple app icon, square. A cracked stone archway seen head-on, reduced
to a heavy silhouette, with a single narrow slit of violet light glowing in
its centre. EXTREMELY SIMPLIFIED, only two or three shapes, massive thick
forms, very high contrast: near-black stone (#0a0b0f) against a violet glow
(#8f7cff), dark navy background. Must stay readable when shrunk to 16 pixels.
Flat, centered, fills the frame, no text, no letters, no border, no perspective
```

16px에서 형태가 남는지 **줄여서 눈으로 확인한 뒤** 채택했다. 모델이 요청하지 않은
둥근 사각 배지 여백을 그려 넣어, 그만큼 잘라내고 썼다.

**방 오브젝트**

```
a small broken stone tablet half buried in the floor with faint scratched marks
on it, seen from directly above, something a player would want to walk over and
inspect, compact and low to the ground, a faint pale glow in the carved marks,
hand-drawn chalky texture, muted desaturated palette, cool grey-blue stone tones
matching a dark dungeon, bold silhouette readable at small size, transparent
background, no shadow, centered
```

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

모두 **OpenAI `gpt-image-1`** 로 API를 직접 호출해 생성했다. 손으로 그린 부분은 없다.

**아래 표의 `최종 프롬프트`가 가리키는 것은 이 문서 `## 프롬프트` 절의 문구이고,
그 문구는 실제로 API에 보낸 것과 글자까지 같다.** 생성하면서 즉석에서 고친 부분이
있었는데(껍데기 재생성, 투사체·지대·바닥, 무기 4종) 2026-08-04에 전부 문서로 옮겼다.
문서와 실제가 다르면 제출물의 출처 기록이 틀린 기록이 된다.

호출 설정:

```
POST https://api.openai.com/v1/images/generations
model=gpt-image-1  size=1024x1024  background=transparent  output_format=png  n=1
```

`background=transparent`가 핵심이다. `gpt-image-2`는 이 옵션을 지원하지 않아 쓰지 못했다.
생성 결과는 1024px 원본을 `assets-raw/`에 두고, 게임용 축소본만 `public/sprites/`에 넣는다.

| 파일 | 사용 도구 | 생성일 | 최종 프롬프트 | 사람이 수정한 부분 |
| --- | --- | --- | --- | --- |
| `player.png` | gpt-image-1 | 2026-08-03 | 이 문서 `플레이어` 항목 | 없음 |
| `enemy-chaser.png` | gpt-image-1 | 2026-08-03 | 이 문서 `사냥개` 항목 | 없음 |
| `enemy-archer.png` | gpt-image-1 | 2026-08-03 | 이 문서 `몰이꾼` 항목 | 없음 |
| `enemy-brute.png` | gpt-image-1 | 2026-08-03 | 이 문서 `껍데기` 항목 (재생성본) | 없음 |
| `enemy-boss.png` | gpt-image-1 | 2026-08-03 | 이 문서 `보스` 항목 | 없음 |
| `enemy-boss2.png` | gpt-image-1 | 2026-08-03 | 이 문서 `최종 보스 무너진 문` 항목 | 없음 |
| `enemy-boss-warden.png` | gpt-image-1 | 2026-08-10 | 이 문서 `윗길 보스 제단지기` 항목 | 없음 |
| `enemy-boss-glutton.png` | gpt-image-1 | 2026-08-10 | 이 문서 `아랫길 보스 굴의 포식자` 항목 | 없음 |
| `npc-keeper.png` | gpt-image-1 | 2026-08-03 | 이 문서 `마을 관리인 NPC` 항목 | 없음 |
| `drop-item.png` | gpt-image-1 | 2026-08-03 | 이 문서 `바닥 드랍 아이템` 항목 | 없음 |
| `potion.png` | gpt-image-1 | 2026-08-10 (안쪽 뚫린 판으로 재생성) | 이 문서 `HUD 충전형 물약` 항목 | 알파 60 미만 제거 후 크롭, 윤곽 밝기 38→125. 실제 충전량은 코드가 병 뒤에 표시 |
| `key-upper.png` | gpt-image-1 | 2026-08-10 | 이 문서 `열쇠` 항목 | 없음 |
| `key-lower.png` | **`key-upper.png`에서 파생** | 2026-08-10 | 이 문서 `열쇠` 항목 (색조만 이동) | 없음 |
| `bolt-sword.png` | gpt-image-1 | 2026-08-03 | 이 문서 `투사체` 항목, 색 `#c9d1e8` | 없음 |
| `bolt-bow.png` | gpt-image-1 | 2026-08-03 | 이 문서 `투사체` 항목, 색 `#9ae6a0` | 없음 |
| `bolt-arcane.png` | gpt-image-1 | 2026-08-03 | 이 문서 `투사체` 항목, 색 `#b08bff` | 없음 |
| `bolt-enemy.png` | gpt-image-1 | 2026-08-03 | 이 문서 `투사체` 항목, 색 `#e0b055` | 없음 |
| `tile-floor.png` | gpt-image-1 | 2026-08-03 | 이 문서 `바닥 타일` 항목 | 없음 |
| `area-*.png` 4종 | gpt-image-1 | 2026-08-03 | 이 문서 `지대` 항목 | **게임에 반영하지 않음** (아래 참고) |
| `combo-ring.png` | gpt-image-1 | 2026-08-06 | 아래 `콤보 링` 항목 | 없음 |
| `tile-wall.png` | gpt-image-1 | 2026-08-06 | 아래 `벽 타일` 항목 | 밝기를 0.72배로 낮춤 |
| `weapon-sword.png` | gpt-image-1 | 2026-08-04 | 이 문서 `손에 든 무기 4종` 항목 | 없음 |
| `weapon-bow.png` | gpt-image-1 | 2026-08-04 | 이 문서 `손에 든 무기 4종` 항목 | 없음 |
| `weapon-arcane.png` | gpt-image-1 | 2026-08-04 | 이 문서 `손에 든 무기 4종` 항목 | 없음 |
| `weapon-shield.png` | gpt-image-1 | 2026-08-04 | 이 문서 `손에 든 무기 4종` 항목 | 없음 |
| `lore-stone.png` | gpt-image-1 | 2026-08-06 | 아래 `방 오브젝트` 항목 | 없음 |
| `title-bg.jpg` | gpt-image-1 | 2026-08-06 | 아래 `타이틀 배경` 항목 | 16:9로 자름, JPEG로 저장(PNG 2.1MB → 214KB) |
| `favicon.ico` / `icon-*.png` | gpt-image-1 | 2026-08-06 | 아래 `아이콘` 항목 | 모델이 넣은 배지 여백을 잘라냄 |
| `prop-rubble.png` | gpt-image-1 | 2026-08-06 | 아래 `바닥 장식물` 항목 | 밝기 0.52배, 채도 0.85배 |
| `prop-pillar.png` | gpt-image-1 | 2026-08-06 | 아래 `바닥 장식물` 항목 | 밝기 0.58배, 채도 0.85배 |
| `prop-bones.png` | gpt-image-1 | 2026-08-07 | 아래 `바닥 장식물` 항목 | 밝기 0.34배, 채도 0.55배 |
| `prop-brazier.png` | gpt-image-1 | 2026-08-07 | 아래 `바닥 장식물` 항목 | 밝기 0.92배, 채도 0.80배 |
| `prop-brazier-candidate.png` | gpt-image-1 | 2026-08-06 | 아래 `바닥 장식물` 항목 | 후보만 생성. 게임 미반영. 밝기 0.55배, 채도 0.85배 |

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
| 지대 4종 | 반영 안 함 | 요구는 `가운데가 비치고 가장자리로 갈수록 진해지는` 원판이었는데 **가운데가 완전히 뚫린 도넛**이 나왔다. 지대는 `이 범위가 위험하다`를 알리는 표시인데 정작 범위 안이 안 보인다. 냉각은 튜브처럼 입체로 그려져 바닥에 눕지도 않았다. 현재의 반투명 원이 더 정확해서 그대로 뒀다. `가운데가 비치는 원판`은 이미지 모델이 잘 못 만드는 형태다 |
| `exit-door.png` | 반영 안 함 | **시점이 맞지 않았다.** 프롬프트에 `seen from directly above **and slightly in front**`를 넣은 것이 직접 원인으로, 문틀·상인방·문짝을 정면에서 본 그림이 나왔다. 이 맵은 천장에서 내려다보는 시점이다. 크기와 위치를 아무리 맞춰도 벽 위에 얹힌 별개 물체로 보였고, 폭(58px)이 벽 두께(24px)보다 넓어 방 안으로 34px 튀어나왔다. 위에서 본 출구는 문짝이 아니라 **벽이 끊긴 통로**다. 그래서 그림을 버리고 벽 띠를 출구 자리에서 끊는 방식으로 바꿨다. 아트를 넣을 자리인지부터 판단해야 한다는 사례다 |
| 불타는 화톳불 | 재생성 | 그림도 시점도 정확했지만 **색이 문제였다.** 타는 숯이 `#ff6b3d`로 나왔는데 이 색은 게임에서 **화염 지대**를 뜻한다. 바닥에 깔린 주황색 원은 플레이어에게 "여기 밟으면 아프다"로 읽힌다. 장식이 게임플레이를 오해시키면 안 된다. 다른 색으로 바꾸려 해도 남은 색이 전부 다른 지대나 무기에 이미 쓰여서(충격 `#ffd23d`, 냉각 `#6ec8ff`, 비전 `#b08bff`, 방패 `#ffc55c`) 색을 피하는 대신 **불을 껐다.** `THE FIRE IS OUT: no flames, no glowing embers, no orange light`로 다시 뽑아 채택했다 |
| 돌로 된 화톳불 | 재생성 | 불을 끈 두 번째 후보는 색 충돌이 없었지만 **기둥과 실루엣이 겹쳤다.** 둘 다 회색 돌 원반이라 60px에서 같은 그림이었다. 종류를 늘려도 형태가 같으면 소용이 없다. 재질을 `BLACK WROUGHT IRON`으로 못 박고 `THREE SPLAYED IRON LEGS ... so its outline is not a plain circle`로 실루엣을 갈라 세 번째에 채택했다 |
| 체인 장식물 (`prop-chain`) | 반영 안 함 | **바닥에 깔린 원은 이 게임에서 지대를 뜻한다.** 완벽한 원형 고리로 나와서 지대와 헷갈리고, 원형 띠인 콤보 링과도 겹친다. 던전 바닥에 체인이 가지런한 원으로 놓일 이유도 없다. 흐트러진 형태로 다시 뽑을 수는 있으나, 이미 네 종이 있어 종류를 더 늘릴 이유가 없어 버렸다 |
| 꺼진 화로 후보 (`prop-brazier-candidate`) | 후보 보류 | 이전 실패를 피하려고 `no flame`, `no ember glow`, `no orange/red/yellow light`, `not a danger marker`를 넣어 다시 뽑았다. 위험 색은 사라졌지만 아직 실제 방 위에서 장식으로 읽히는지 확인하지 않았다. |
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
