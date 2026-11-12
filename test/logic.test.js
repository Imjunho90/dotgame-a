import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSTANTS,
  applyRestart,
  applyStart,
  createInitialState,
  currentDirection,
  displaySeconds,
  parseLevel,
  pressKey,
  releaseAllKeys,
  releaseKey,
  stepAccumulator,
  tick,
} from '../src/logic.js';
import { LEVEL_ROWS } from '../src/levels.js';

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
