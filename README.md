# dotgame-a

달팽이 우체부 — 화면 하나짜리 도트 게임. 기획은 `GAME_DESIGN.md`가 유일한 기준이다.

## 실행

`index.html`을 브라우저로 연다. ES module이 `file://`에서 차단되면 `python3 -m http.server 8000` 후 `http://localhost:8000/index.html`.

## 맵 검증

`node tools/verify-path.mjs` — 5장 격자의 불변식과 최단 경로(80칸, 40.0초)를 검사한다.

## 테스트 명령 (실측, 2026-11-12)

- `node --version` → `v22.23.4`
- 기존 AGENTS.md의 `node --test test/` → 실패(종료 코드 1, `Cannot find module '<경로>/test'`).
- 인자 없는 `node --test` → 종료 코드 0, 테스트 통과. 이 명령으로 AGENTS.md를 바꿨다(사람 위임, GAME_DESIGN.md 부록).
