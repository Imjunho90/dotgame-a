import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTANTS,
  applyRestart,
  applyStart,
  createInitialState,
  currentDirection,
  enemyTileAt,
  stepEnemy,
  displaySeconds,
  parseLevel,
  pressKey,
  releaseAllKeys,
  releaseKey,
  stepAccumulator,
  tick,
} from '../src/logic.js';
import { LEVEL_ROWS } from '../src/levels.js';
import { SPRITES } from '../src/sprites.js';

// Expected values come from GAME_DESIGN.md: 50 ms ticks, 90000 ms, interval 10 ticks, 3 letters.

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => {
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(o);
};

const corridor = parseLevel(['#############', '#S..........#', '###########H#']);
const stub = parseLevel(['#H###', '#.S.#', '#####']);
const pair = parseLevel(['#H###', '#.S.#', '#H###', '#####']);

const playing = (level, patch = {}) => ({ ...createInitialState(level), status: 'playing', ...patch });
const holding = (state, dir) => pressKey(state, dir);
const run = (state, n) => {
  for (let i = 0; i < n; i++) state = tick(state);
  return state;
};

test('start key: ready -> playing without spending time', () => {
  const s = applyStart(createInitialState(corridor));
  assert.equal(s.status, 'playing');
  assert.equal(s.remainingMs, 90000);
});

test('a tap before the start key does not cost a move after it', () => {
  let s = releaseKey(pressKey(createInitialState(corridor), 'right'), 'right');
  s = run(applyStart(s), 1);
  assert.deepEqual(s.snail, { x: 1, y: 1 });
});

test('start key is ignored outside ready', () => {
  const s = playing(corridor);
  assert.equal(applyStart(s), s);
});

test('exactly 1800 decrement ticks: 1799 still playing at 50 ms, 1800 -> lose at 0', () => {
  const a = run(playing(corridor), CONSTANTS.TOTAL_TICKS - 1);
  assert.equal(a.status, 'playing');
  assert.equal(a.remainingMs, 50);
  const b = tick(a);
  assert.equal(b.status, 'lose');
  assert.equal(b.remainingMs, 0);
});

test('A5: the delivery that lands on the tick reaching 0 ms does not count', () => {
  const s = holding(playing(stub, { remainingMs: 50, snail: { x: 2, y: 1 } }), 'left');
  const r = tick(s);
  assert.equal(r.status, 'lose');
  assert.equal(r.lettersRemaining, 1);
  assert.deepEqual(r.snail, { x: 2, y: 1 });
});

test('A4: delivering the last letter with 50 ms left is a win', () => {
  const s = holding(playing(stub, { remainingMs: 100, snail: { x: 2, y: 1 } }), 'left');
  const r = tick(s);
  assert.equal(r.status, 'win');
  assert.equal(r.remainingMs, 50);
  assert.equal(r.lettersRemaining, 0);
});

test('A2: first step is immediate, then one step every 10 ticks, cooldown 9 on move ticks', () => {
  let s = holding(playing(corridor), 'right');
  s = tick(s);
  assert.equal(s.snail.x, 2);
  assert.equal(s.moveCooldown, 9);
  for (let i = 2; i <= 10; i++) {
    s = tick(s);
    assert.equal(s.snail.x, 2, `tick ${i} must not move`);
  }
  s = tick(s);
  assert.equal(s.snail.x, 3);
  assert.equal(s.moveCooldown, 9);
  s = tick(s);
  assert.equal(s.snail.x, 3, 'no move on the tick after a move (no 11-tick drift)');
});

test('A2: mashing the key every tick never beats 2 tiles per second', () => {
  let s = playing(corridor);
  for (let i = 0; i < 60; i++) {
    s = releaseKey(pressKey(s, 'right'), 'right');
    s = tick(s);
  }
  assert.equal(s.snail.x, 1 + 6); // moves on ticks 1, 11, 21, 31, 41, 51
});

test('A2: a sub-tick tap still moves exactly one tile and the latch is spent', () => {
  let s = releaseKey(pressKey(playing(corridor), 'right'), 'right');
  s = run(s, 20);
  assert.equal(s.snail.x, 2);
  assert.equal(s.input.latched, null);
});

test('A2: walls, houses and the map edge block movement and cost no cooldown', () => {
  let s = holding(playing(corridor), 'up');
  s = tick(s);
  assert.deepEqual(s.snail, { x: 1, y: 1 });
  assert.equal(s.moveCooldown, 0);
  // turning right is available on the very next tick
  s = tick(releaseKey(pressKey(s, 'right'), 'up'));
  assert.equal(s.snail.x, 2);
});

test('input: LIFO stack falls back to the previous still-held direction', () => {
  let s = playing(corridor);
  s = pressKey(s, 'left');
  s = pressKey(s, 'up');
  assert.equal(currentDirection(s.input), 'up');
  s = releaseKey(s, 'up');
  assert.equal(currentDirection(s.input), 'left');
  s = releaseKey(s, 'left');
  assert.equal(currentDirection(s.input), 'up', 'nothing held: the latched tap is used');
});

test('blur: a lost keyup cannot leave the snail walking by itself', () => {
  let s = pressKey(playing(corridor), 'right');
  s = releaseAllKeys(s);
  s = run(s, 30);
  assert.deepEqual(s.snail, { x: 1, y: 1 });
  assert.deepEqual(s.input, { stack: [], latched: null });
});

test('A3: stepping next to an undelivered house delivers it', () => {
  const level = parseLevel(LEVEL_ROWS);
  const s = holding(playing(level, { snail: { x: 1, y: 2 } }), 'up');
  const r = tick(s);
  assert.deepEqual(r.snail, { x: 1, y: 1 });
  assert.deepEqual(r.delivered, [true, false, false]);
  assert.equal(r.lettersRemaining, 2);
});

test('A3: revisiting a delivered house changes nothing but position and timers', () => {
  const level = parseLevel(LEVEL_ROWS);
  const s = holding(
    playing(level, { snail: { x: 1, y: 2 }, delivered: [true, false, false], lettersRemaining: 2 }),
    'up',
  );
  const r = tick(s);
  assert.deepEqual(r.delivered, [true, false, false]);
  assert.equal(r.lettersRemaining, 2);
});

test('two houses touched by one tile are both delivered in the same tick', () => {
  const s = holding(playing(pair, { snail: { x: 2, y: 1 } }), 'left');
  const r = tick(s);
  assert.deepEqual(r.delivered, [true, true]);
  assert.equal(r.lettersRemaining, 0);
  assert.equal(r.status, 'win');
});

test('A7: R after win or lose returns to a fresh ready state; ignored while playing', () => {
  const won = tick(holding(playing(stub, { snail: { x: 2, y: 1 } }), 'left'));
  assert.equal(won.status, 'win');
  assert.deepEqual(applyRestart(won), createInitialState(stub));
  const lost = tick(playing(stub, { remainingMs: 50 }));
  assert.equal(lost.status, 'lose');
  assert.deepEqual(applyRestart(lost), createInitialState(stub));
  const p = playing(stub);
  assert.equal(applyRestart(p), p);
  assert.equal(applyRestart(createInitialState(stub)).status, 'ready');
});

test('tick does nothing outside playing', () => {
  const s = createInitialState(corridor);
  assert.equal(tick(s), s);
});

test('displaySeconds rounds up: 90000->90, 89999->90, 1->1, 0->0', () => {
  assert.equal(displaySeconds(90000), 90);
  assert.equal(displaySeconds(89999), 90);
  assert.equal(displaySeconds(1), 1);
  assert.equal(displaySeconds(0), 0);
});

test('stepAccumulator: 50 ms per tick, dt capped at 400, at most 8 ticks, remainder < 50', () => {
  assert.deepEqual(stepAccumulator(0, 50), { accMs: 0, ticks: 1 });
  assert.deepEqual(stepAccumulator(0, 49), { accMs: 49, ticks: 0 });
  assert.deepEqual(stepAccumulator(49, 1), { accMs: 0, ticks: 1 });
  assert.deepEqual(stepAccumulator(0, 100000), { accMs: 0, ticks: 8 });
  assert.deepEqual(stepAccumulator(49, 400), { accMs: 49, ticks: 8 });
});

test('tick is deterministic and never mutates a deep-frozen input', () => {
  const frozen = deepFreeze(holding(playing(corridor), 'right'));
  const a = tick(frozen);
  const b = tick(frozen);
  assert.deepEqual(a, b);
  assert.equal(frozen.snail.x, 1);
});

// --- goal-2: enemy movement (no collision yet) ---

const real = parseLevel(LEVEL_ROWS);

test('real level patrol is column 13, rows 1..9; ready enemy sits on the top tile moving down', () => {
  assert.equal(real.patrol.length, 9);
  assert.deepEqual(enemyTileAt(real, 0), { x: 13, y: 1 });
  assert.deepEqual(enemyTileAt(real, 8), { x: 13, y: 9 });
  assert.deepEqual(createInitialState(real).enemy, { index: 0, dirSign: 1, cooldown: 0 });
});

test('runtime enemy timeline over 1800 ticks equals the chapter 7 occupancy table', () => {
  let s = { ...createInitialState(real), status: 'playing' };
  for (let t = 1; t <= 1799; t++) {
    s = tick(s);
    const m = Math.floor((t - 1) / 20) + 1;
    const r = m % 16;
    assert.equal(s.enemy.index, r <= 8 ? r : 16 - r, `tick ${t}`);
  }
  // table spot checks: 1~20 idx 1, 141~160 idx 8, 161 idx 7, 301~320 idx 0, 321 idx 1
  const at = (n) => {
    let x = { ...createInitialState(real), status: 'playing' };
    for (let i = 0; i < n; i++) x = tick(x);
    return x.enemy.index;
  };
  assert.deepEqual([at(1), at(20), at(21), at(141), at(160), at(161), at(301), at(320), at(321)], [1, 1, 2, 8, 8, 7, 0, 0, 1]);
});

test('enemy flips on arrival without pausing and never leaves the patrol', () => {
  let e = { index: 7, dirSign: 1, cooldown: 0 };
  e = stepEnemy(e, 9);
  assert.deepEqual(e, { index: 8, dirSign: 1, cooldown: 19 });
  for (let i = 0; i < 19; i++) e = stepEnemy(e, 9);
  assert.equal(e.cooldown, 0);
  e = stepEnemy(e, 9);
  assert.deepEqual(e, { index: 7, dirSign: -1, cooldown: 19 });
});

test('enemy does nothing in ready, win and lose; start key tick does not move it', () => {
  const s0 = createInitialState(real);
  assert.deepEqual(tick(s0).enemy, s0.enemy);
  assert.deepEqual(applyStart(s0).enemy, s0.enemy);
  const win = { ...s0, status: 'win' };
  assert.equal(tick(win), win);
});

test('enemy overlap changes nothing yet: snail and timer behave as before', () => {
  const lvl = parseLevel(['#####', '#S.H#', '#####']);
  const s = { ...createInitialState(lvl), status: 'playing', enemy: { index: 0, dirSign: 1, cooldown: 5 } };
  assert.deepEqual(tick(s).snail, s.snail);
  assert.equal(tick(s).remainingMs, 90000 - 50);
});

test('the win tick does not move the enemy (7장 규칙 2 ④)', () => {
  let s = { ...createInitialState(parseLevel(['#H####', '#.S..#', '######'])), status: 'playing' };
  s = { ...s, enemy: { index: 3, dirSign: 1, cooldown: 0 } };
  s = tick(pressKey(s, 'left'));
  assert.equal(s.status, 'win');
  assert.deepEqual(s.enemy, { index: 3, dirSign: 1, cooldown: 0 });
});

test('enemy sprite is 16x16, palette-only, and differs from the snail and house sprites', () => {
  assert.equal(SPRITES.enemy.length, 16);
  assert.notDeepEqual(SPRITES.enemy, SPRITES.snail);
  assert.notDeepEqual(SPRITES.enemy, SPRITES.house);
  const used = new Set(SPRITES.enemy.flat());
  assert.ok(!used.has(4), 'green is the snail colour');
});
