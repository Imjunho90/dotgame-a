import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSTANTS, alphaMask, createInitialState, parseLevel, skyStage, sunX, tick } from '../src/logic.js';
import { LEVEL_ROWS } from '../src/levels.js';

// Expected values come from GAME_DESIGN.md 6장 / 7장 규칙 9: day > 45 s, sunset > 18 s, night otherwise;
// sun x runs 8 -> 232 as the 90 s elapse.

test('A6: skyStage thresholds are exclusive lower bounds on remainingMs', () => {
  assert.equal(skyStage(90000), 'day');
  assert.equal(skyStage(45001), 'day');
  assert.equal(skyStage(45000), 'sunset');
  assert.equal(skyStage(18001), 'sunset');
  assert.equal(skyStage(18000), 'night');
  assert.equal(skyStage(0), 'night');
});

test('A6: sun starts at x=8, is at 120 halfway, ends at 232', () => {
  assert.equal(sunX(90000), 8);
  assert.equal(sunX(45000), 120);
  assert.equal(sunX(0), 232);
});

test('A6: sun x is an integer, never moves left, and stays inside its lane for every tick', () => {
  let prev = -Infinity;
  for (let ms = CONSTANTS.TOTAL_MS; ms >= 0; ms -= CONSTANTS.TICK_MS) {
    const x = sunX(ms);
    assert.ok(Number.isInteger(x));
    assert.ok(x >= prev, `x went left at ${ms}`);
    assert.ok(x >= CONSTANTS.SUN_X_MIN && x <= CONSTANTS.SUN_X_MAX);
    prev = x;
  }
});

test('text threshold: alpha 127 is off, 128 and 255 are on', () => {
  assert.deepEqual(Array.from(alphaMask([0, 127, 128, 255], CONSTANTS.ALPHA_THRESHOLD)), [0, 0, 1, 1]);
});

test('A6: the sky changes on the real tick that crosses 45 s and 18 s', () => {
  const base = { ...createInitialState(parseLevel(LEVEL_ROWS)), status: 'playing' };
  const a = tick({ ...base, remainingMs: 45050 });
  assert.equal(a.remainingMs, 45000);
  assert.equal(skyStage(a.remainingMs), 'sunset');
  assert.equal(skyStage(45050), 'day');
  const b = tick({ ...base, remainingMs: 18050 });
  assert.equal(skyStage(b.remainingMs), 'night');
  assert.equal(skyStage(18050), 'sunset');
});
