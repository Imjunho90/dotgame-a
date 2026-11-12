import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_ROWS } from '../src/levels.js';
import { CONSTANTS, createInitialState, deliverAdjacent, isWalkable, parseLevel, pressKey, tick } from '../src/logic.js';
import { checkInvariants, deliverMask, parseGrid, shortestRoute, walkable } from '../tools/route.mjs';

const level = parseLevel(LEVEL_ROWS);
const grid = parseGrid(LEVEL_ROWS);

test('levels.js grid satisfies every chapter 5 invariant', () => {
  assert.deepEqual(checkInvariants(grid), []);
});

test('levels.js has 16 columns, 12 rows, 3 houses in reading order, S at (1,6)', () => {
  assert.equal(level.width, CONSTANTS.GRID_COLS);
  assert.equal(level.height, CONSTANTS.GRID_ROWS);
  assert.deepEqual(level.houses, [
    { x: 1, y: 0 },
    { x: 6, y: 5 },
    { x: 14, y: 10 },
  ]);
  assert.deepEqual(level.start, { x: 1, y: 6 });
});

test('runtime walkability matches the tools model on every tile (and outside the grid)', () => {
  for (let y = -1; y <= level.height; y++) {
    for (let x = -1; x <= level.width; x++) {
      assert.equal(isWalkable(level, x, y), walkable(grid, x, y), `tile (${x},${y})`);
    }
  }
});

test('runtime delivery matches the tools model for every tile and every delivered mask', () => {
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      for (let mask = 0; mask < 8; mask++) {
        const delivered = [0, 1, 2].map((i) => Boolean(mask & (1 << i)));
        const r = deliverAdjacent(level, delivered, x, y);
        const expected = deliverMask(grid, x, y, mask);
        const got = r.delivered.reduce((m, d, i) => m | (d ? 1 << i : 0), 0);
        assert.equal(got, expected, `tile (${x},${y}) mask ${mask}`);
      }
    }
  }
});

test('playing the shortest route through tick() wins: 80 moves, one every 10 ticks', () => {
  const route = shortestRoute(grid);
  assert.equal(route.moves.length, 80);
  let state = { ...createInitialState(level), status: 'playing' };
  let ticks = 0;
  for (const move of route.moves) {
    state = pressKey(state, move);
    state = tick(state);
    ticks++;
    if (state.status !== 'playing') break;
    for (let i = 1; i < CONSTANTS.MOVE_INTERVAL_TICKS; i++) {
      state = tick(state);
      ticks++;
    }
  }
  assert.equal(state.status, 'win');
  assert.equal(state.lettersRemaining, 0);
  // moves land on ticks 1, 11, ..., 1 + 10*79 = 791; far below the 1800-tick budget
  assert.equal(ticks, 1 + CONSTANTS.MOVE_INTERVAL_TICKS * 79);
  assert.ok(state.remainingMs > 0);
});
