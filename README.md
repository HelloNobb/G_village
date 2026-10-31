# G village

도시 외곽 작은 동네의 하루를 걷는 탑다운 2D 마을 생활 시뮬레이션 (Phaser 3 + Vite).
**실제 한국 시간**에 맞춰 하늘과 조명이 바뀌고, 주민 다섯 명이 각자의 스케줄대로 일하고 쉬고 산책합니다.

- 플레이: https://hellonobb.github.io/G_village/
- 세계관·인물 기준 문서: [`docs/characters.md`](docs/characters.md)
- 설계 문서: [`PLAN.md`](PLAN.md)

## 조작

| | PC | 모바일 |
|---|---|---|
| 이동 | 방향키 / WASD, 클릭한 곳으로 이동 | 화면 드래그(조이스틱), 탭한 곳으로 이동 |
| 말걸기 / 대화 넘기기 | Space / E | 💬 버튼(항상 보임), 주민 탭, 화면 두 번 탭 |
| 노크 | 주민 집 문 앞에서 Space | 집을 탭 / 문 앞에서 💬 |
| 빠른 이동 | 미니맵 클릭 | 미니맵 탭 |
| 메뉴 | Esc / 메뉴 | 메뉴 |

화면 구성: 테두리 안 게임 화면(왼쪽 위 시계·하늘, 오른쪽 위 실시간 미니맵) + 오른쪽 패널(**지금 마을에서** = 주민별 현재 위치, **마을 소식** = 스케줄 변화·가게 영업·해 뜨고 짐·주민끼리 나눈 대화). 좁은 화면에서는 패널이 게임 아래로 내려갑니다.

- 주민이 **집 안에 있을 때만** 노크에 대답합니다. 밖에 있는 주민에게는 어디서든 바로 말을 걸 수 있습니다.
- 주민마다 하루 첫 대화에서 친밀도가 오르고(메뉴에서 확인), 친해질수록 말투가 편해지거나 다른 이야기를 합니다.
- 진행 상태(이름·위치·친밀도·본 대사)는 브라우저 localStorage에 저장됩니다. 메뉴 → 저장 초기화.

## 실행

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run validate
```

`validate`는 데이터 JSON을 검사합니다(문법, 스폿·루트·주민 참조, 시간 형식, 대사 id 중복, **금지어**). GitHub Actions에서도 빌드 전에 실행되어, 실패하면 배포가 멈춥니다.

### 시간 테스트 (디버그)

주소 뒤에 붙이면 됩니다. 이때 `` ` `` 키로 주민 상태 패널을 켜고 끕니다.

- `?t=2026-11-01T21:30` — 그 시각(KST)부터 시작
- `&speed=60` — 60배속
- `?debug=1` — 실제 시간 그대로 디버그 패널만

예: `http://localhost:5173/?t=2026-11-03T21:00&speed=10` (화요일 밤 바)

## 배포

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 검증 → 빌드 → GitHub Pages 배포를 합니다.
(처음 한 번: 저장소 Settings → Pages → Source = **GitHub Actions**)

---

## 데이터 직접 고치기

코드를 건드리지 않고 `public/data/` 안의 JSON만 고쳐서 push하면 반영됩니다. 모든 JSON에 `"_note"`(메모) 필드를 써도 게임은 무시합니다.

| 파일 | 내용 |
|------|------|
| `dialogue/<주민>.json` | 말걸기 대사 (`fin`, `daisy`, `som`, `shu`, `di`, `kkamangi`) |
| `ambient.json` | 주민끼리 대화, 길에서 스칠 때 인사 |
| `schedules.json` | 주민 스케줄 |
| `places.json` | 장소 이름, 가게 영업시간 |
| `map.json` | 맵(글자 그림), 건물, 스폿, 산책 루트, 가로등 |
| `npcs.json` | 주민 이름·직업·집·이름표 색 |
| `daylight.json` | 월별 일출·일몰 |
| `news.json` | 오른쪽 '마을 소식' 문구 (`{name:이}` = 받침에 맞는 조사) |

### 대사 한 줄 형식

```json
{
  "id": "fin.cafe.morning.01",
  "when": { "place": "cafe", "activity": "work", "timeBand": "morning" },
  "pages": ["어서 오세요! 오늘은 곰돌이 쿠키가 제일 먼저 구워졌어요.", "하나 맛보실래요?"]
}
```

- `id`: 아무 이름이나, 단 **전체에서 겹치면 안 됨**.
- `pages`: 대화창 한 페이지씩. `{player}` = 플레이어 이름, `{time}` = "오후 3시", `{weekday}` = "토요일".
- `narration: true` 를 넣으면 이름 없이 (행동 묘사)로 나옵니다.
- `once: true` 면 평생 한 번만, `priority` 숫자를 주면 더 자주 뽑힙니다.

**`when` 조건** — 적은 것만 검사하고, 적은 조건이 많을수록(구체적일수록) 우선합니다.

| 키 | 값 |
|----|----|
| `context` | `talk`(기본, 직접 대화) / `knock`(문 노크) / `busy`(주민끼리 대화 중에 말 걸었을 때) |
| `place` | `cafe` `jewelry` `salon` `bar` `bookstore` `plaza` `park` `beach` `residential` `street` `home` |
| `activity` | 스케줄의 activity (예: `work` `bake` `bartend` `buy_latte` `walk_cat` `stargaze` `sleep` …) |
| `timeBand` | `dawn`(5–7) `morning`(7–11) `lunch`(11–14) `afternoon`(14–18) `evening`(18–21) `night`(21–24) `latenight`(0–5) |
| `dayType` | `weekday` / `weekend` |
| `days` | `["mon","wed"]` 처럼 요일 |
| `months` | `[12,1,2]` 처럼 월 |
| `familiarity` | `{ "min": 2 }`, `{ "max": 1 }` (0 처음 · 1 아는 사이 · 2 친한 이웃 · 3 단골 이웃) |
| `with` / `without` | 같은 장소에 그 주민이 있을 때 / 없을 때 (노크: 같은 집 안) |
| `firstMeet` | `true` = 첫 만남 전용 |
| `moving` | `true` = 걸어가는 중일 때 |

여러 값을 배열로 주면 "그중 하나"라는 뜻입니다 (`"timeBand": ["evening", "night"]`).

### 주민끼리 대화

```json
{ "id": "amb.fin_di.latte.01", "participants": ["fin", "di"], "when": { "place": "cafe" }, "cooldownMin": 90,
  "lines": [{ "s": "fin", "t": "디! 오늘도 딸기라떼지?" }, { "s": "di", "t": "…응." }] }
```

참여자 전원이 같은 장소에서 가까이 서 있고, 플레이어 화면 안에 있을 때 가끔 머리 위 말풍선으로 나옵니다. `allowMoving: true`면 걸으면서도 합니다(산책).

### 스케줄 한 줄

```json
{ "days": "weekday", "from": "15:00", "to": "15:30", "at": "cafe.order2", "activity": "buy_latte", "label": "딸기라떼 사러" }
```

- 게임 하루는 **05:00 시작**이라 새벽은 `25:00`(= 01:00)처럼 씁니다.
- `days`: `all` / `weekday` / `weekend` / `mon`… / `["tue","thu"]`. 겹치면 더 구체적인 요일 지정이 이깁니다.
- `at`: `map.json`의 `spots` 이름. `home.<집>`은 집 안(화면에서 사라짐). 배열 + `every`(분)면 번갈아 이동.
- `route`: `map.json`의 `routes` 이름(반복해서 걷기) / `follow`: 다른 주민 따라가기.
- `npm run validate`가 **06~21시엔 누군가 밖을 걷고 있는지, 21시~다음 날 07시(밤·새벽)엔 2명 이상 밖에 있는지** 확인해서 빈 시간을 경고로 알려 줍니다.

### 반드시 지킬 것 (docs/characters.md "구현 시 주의")

- 데이지에게 성별 대명사(그/그녀)를 쓰지 않습니다. **언니·오빠·누나·형 같은 성별 호칭은 누구에게도 쓰지 않습니다.**
- 솜과 슈는 "동거인"으로만 표현합니다 (연인·애인·커플·데이트·자기야 등 금지).
- 주민의 깊은 사정·과거사는 대사로 설명하지 않습니다. 말투와 행동으로만 드러냅니다.

금지어는 `scripts/banned-words.json`에 정규식으로 있고, `npm run validate`와 배포 때 자동 검사됩니다.

---

## 화질

캔버스를 기기 픽셀 비율(최대 2배)로 그리고, 플레이스홀더 그림도 2~3배 해상도로 만든 뒤 줄여서 씁니다(`src/config.js`). 실제 그림을 넣을 때 2배 크기로 그렸다면 manifest 항목에 `"resolution": 2`를 적으면 같은 크기로 보입니다.

## 그림 바꾸기 (플레이스홀더 → 스프라이트)

게임 코드는 **텍스처 키**만 알고, 그게 도형인지 그림인지는 모릅니다. `public/assets/manifest.json`에서 키의 `type`만 바꾸면 됩니다.

```json
"npc.fin": { "type": "spritesheet", "url": "assets/sprites/fin.png", "frameWidth": 32, "frameHeight": 48 }
```

- 캐릭터 시트 프레임 배치: **down 0–2, left 3–5, right 6–8, up 9–11** (각 방향 첫 칸 = 서 있기). 다른 배치면 `"frames": { "down": [0,1,2], "left": [...], ... }` 추가.
- 타일: `"tiles": { "type": "image", "url": "assets/tiles.png", "tileSize": 32 }` — `map.json`의 `legend` 순서대로 타일을 가로로 나열 (`margin`/`spacing` 지정 가능).
- 집 `bld.<집>` / 가게 지붕 `roof.<가게>`: `{ "type": "image", "url": "..." }`. 집 창문 불빛 위치는 `"windows": [{ "x": 30, "y": 90 }]`(이미지 픽셀 좌표).

## 구조

```
src/
  scenes/   BootScene(데이터·그림 로드) · WorldScene(게임)
  systems/  Clock(KST) · DayNight · Pathfinder(A*) · ScheduleSystem · DialogueSystem · AmbientChatSystem · SaveSystem
  entities/ Player · Npc · Pet
  map/      MapBuilder
  art/      PlaceholderFactory · AnimRegistry
  ui/       DialogueBox · Hud · Minimap · NewsFeed · TouchControls · SpeechBubbles · Menu
public/data/  게임 데이터(JSON)
public/assets/manifest.json  텍스처 목록
scripts/validate-data.mjs     데이터 검증
```
