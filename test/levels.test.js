import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_ROWS } from '../src/levels.js';
import { CONSTANTS, createInitialState, deliverAdjacent, isWalkable, parseLevel, pressKey, releaseKey, applyRestart, applyStart, tick } from '../src/logic.js';
import { checkInvariants, deliverMask, humanWitness, parseGrid, shortestRoute, shortestRouteWithEnemy, walkable } from '../tools/route.mjs';

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

const noEnemyLevel = parseLevel(LEVEL_ROWS.map((r) => r.replaceAll('P', '.')));

test('playing the shortest route through tick() on the enemy-free level wins: 80 moves, one every 10 ticks', () => {
  const route = shortestRoute(grid);
  assert.equal(route.moves.length, 80);
  let state = { ...createInitialState(noEnemyLevel), status: 'playing' };
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

// --- goal-3: collision, loseCause, witnesses replayed through tick() ---

const play = (lvl, schedule, until = 1800) => {
  let s = { ...createInitialState(lvl), status: 'playing' };
  let i = 0;
  for (let t = 1; t <= until && s.status === 'playing'; t++) {
    if (i < schedule.length && schedule[i].tick === t) {
      s = pressKey(s, schedule[i].dir);
      i++;
      s = tick(s);
      s = releaseKey(s, schedule[i - 1].dir);
    } else {
      s = tick(s);
    }
    s.tickNo = t;
  }
  return s;
};

test('tick() replays the BFS-minimum witness: win at tick 871 without contact', () => {
  const r = shortestRouteWithEnemy(grid);
  const s = play(level, r.moves);
  assert.equal(s.status, 'win');
  assert.equal(s.tickNo, 871);
  assert.equal(s.loseCause, null);
});

test('tick() replays the human witness: win at 1192, HUD 31, and survives cumulative jitter', () => {
  const s = play(level, humanWitness(grid, 962));
  assert.equal(s.status, 'win');
  assert.equal(s.tickNo, 1192);
  assert.equal(Math.ceil(s.remainingMs / 1000), 31);
  for (let d = 1; d <= 10; d++) {
    let extra = 0;
    const sched = humanWitness(grid, 962).map((m, i) => {
      if (i >= 70) extra = Math.min(29, extra + d);
      return { ...m, tick: m.tick + extra };
    });
    assert.equal(play(level, sched).status, 'win', `jitter ${d}`);
  }
});

test('entering the patrol column one tick early shows caught with time left (A11)', () => {
  const s = play(level, humanWitness(grid, 960));
  assert.equal(s.status, 'lose');
  assert.equal(s.loseCause, 'caught');
  assert.ok(s.remainingMs >= 1);
});

const line = parseLevel(['#######', '###P###', '#S...H#', '###P###', '#######']);

test('same-tile contact loses; follow-behind entry on the leaving tick is safe (13-3)', () => {
  // enemy sits on (3,2) during ticks 1..20; entering at tick 11 is contact.
  const caught = play(line, [{ tick: 1, dir: 'right' }, { tick: 11, dir: 'right' }]);
  assert.equal(caught.loseCause, 'caught');
  const chase = play(line, [{ tick: 1, dir: 'right' }, { tick: 21, dir: 'right' }, { tick: 31, dir: 'right' }]);
  assert.equal(chase.status, 'win');
  assert.equal(chase.tickNo, 31);
});

test('swap-through loses: snail A->B while the enemy B->A on the same tick', () => {
  const col = parseLevel(['#####', '#P###', '#.HS#', '#P###', '#####']);
  assert.equal(col.patrol.length, 3);
  // enemy index 2 -> 1 means (1,3)->(1,2); the snail goes (1,2)->(1,3): a swap, no same-tile overlap.
  let s = { ...createInitialState(col), status: 'playing', snail: { x: 1, y: 2 }, enemy: { index: 2, dirSign: -1, cooldown: 0 } };
  s = tick(pressKey(s, 'down'));
  assert.equal(s.status, 'lose');
  assert.equal(s.loseCause, 'caught');
});

test('4-adjacent is safe: waiting beside the patrol while the enemy passes', () => {
  let x = { ...createInitialState(line), status: 'playing', snail: { x: 2, y: 2 } };
  for (let i = 0; i < 100; i++) x = tick(x); // the enemy passes (3,2) several times next to the snail
  assert.equal(x.status, 'playing');
});

test('time beats contact (synthetic guard, not observable in the real grid)', () => {
  let s = { ...createInitialState(line), status: 'playing', remainingMs: 50, snail: { x: 2, y: 2 } };
  s = tick(pressKey(s, 'right')); // would walk into the enemy on (3,2), but time is up first
  assert.equal(s.status, 'lose');
  assert.equal(s.loseCause, 'time');
});

test('win beats contact (synthetic guard, not observable in the real grid)', () => {
  const col = parseLevel(['#####', '#P###', '#.HS#', '#P###', '#####']);
  let s = { ...createInitialState(col), status: 'playing', snail: { x: 1, y: 1 }, enemy: { index: 0, dirSign: 1, cooldown: 0 } };
  s = tick(pressKey(s, 'down')); // delivers H at (2,2); the enemy would enter (1,2) the same tick
  assert.equal(s.status, 'win');
  assert.equal(s.loseCause, null);
});

test('R after a caught loss returns to ready with the enemy reset; R while playing is ignored', () => {
  const lost = play(level, humanWitness(grid, 960));
  const back = applyRestart(lost);
  assert.equal(back.status, 'ready');
  assert.equal(back.loseCause, null);
  assert.equal(back.remainingMs, 90000);
  assert.deepEqual(back.enemy, { index: 0, dirSign: 1, cooldown: 0 });
  const playing = applyStart(back);
  assert.equal(applyRestart(playing), playing);
});
