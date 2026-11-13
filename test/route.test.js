import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ENEMY_MOVE_INTERVAL_TICKS,
  checkInvariants,
  enemyCycleTicks,
  enemyIndexAt,
  extractGridBlock,
  humanWitness,
  parseGrid,
  patrolOf,
  replayWithEnemy,
  shortestRoute,
  shortestRouteWithEnemy,
} from '../tools/route.mjs';
import { CONSTANTS } from '../src/logic.js';

const designText = readFileSync(fileURLToPath(new URL('../GAME_DESIGN.md', import.meta.url)), 'utf8');
const realRows = extractGridBlock(designText);

// Expected values below are hand-computed on paper (see comments), not taken from the solver.

test('fixture: single house at the end of a straight corridor', () => {
  // S at (1,1); H at (5,1); the nearest delivering tile is (4,1): 3 steps.
  const grid = parseGrid(['#######', '#S...H#', '#######']);
  const r = shortestRoute(grid);
  assert.equal(r.steps, 3);
  assert.equal(r.seconds, 1.5);
});

test('fixture: forced backtrack, both ends must be visited', () => {
  // S (2,1). H1 (1,0) needs tile (1,1); H2 (5,0) needs tile (5,1).
  // Left first: 1 + 4 = 5. Right first: 3 + 4 = 7. Minimum 5.
  const grid = parseGrid(['#H###H#', '#.S...#', '#######']);
  const r = shortestRoute(grid);
  assert.equal(r.steps, 5);
  assert.deepEqual(r.order, [
    { house: 1, step: 1 },
    { house: 2, step: 5 },
  ]);
});

test('fixture: one tile adjacent to two houses delivers both at once', () => {
  // S (2,1); tile (1,1) touches H (1,0) and H (1,2): one step delivers both.
  const grid = parseGrid(['#H###', '#.S.#', '#H###', '#####']);
  const r = shortestRoute(grid);
  assert.equal(r.steps, 1);
  assert.deepEqual(r.order, [
    { house: 1, step: 1 },
    { house: 2, step: 1 },
  ]);
});

test('fixture: house walled off from S is unreachable', () => {
  const grid = parseGrid(['#######', '#S.#.H#', '#######']);
  assert.equal(shortestRoute(grid), null);
});

test('fixture: house tiles block movement', () => {
  // The corridor is closed by an H at (3,1); the far side cannot be reached,
  // so the H at (5,1) cannot be delivered.
  const grid = parseGrid(['#######', '#S.H.H#', '#######']);
  assert.equal(shortestRoute(grid), null);
});

test('GAME_DESIGN.md chapter 5 grid satisfies every invariant', () => {
  assert.deepEqual(checkInvariants(parseGrid(realRows)), []);
});

test('GAME_DESIGN.md chapter 5 grid shortest route is 80 steps = 40.0 s', () => {
  const r = shortestRoute(parseGrid(realRows));
  assert.equal(r.steps, 80);
  assert.equal(r.seconds, 40.0);
});

test('recorded chapter 5 values equal the solver output and sit in range', () => {
  const steps = Number(designText.match(/^- 측정 최단 칸수: (\d+)\s*$/m)[1]);
  const seconds = designText.match(/^- 측정 최단 시간\(초\): ([\d.]+)\s*$/m)[1];
  const r = shortestRoute(parseGrid(realRows));
  assert.equal(steps, r.steps);
  assert.equal(seconds, r.seconds.toFixed(1));
  assert.ok(steps >= 76 && steps <= 84);
});

test('invariant violations are detected', () => {
  const mutate = (fn) => {
    const rows = realRows.map((r) => r.split(''));
    fn(rows);
    return checkInvariants(parseGrid(rows.map((r) => r.join(''))));
  };
  assert.ok(mutate((r) => { r[0][5] = '.'; }).some((m) => m.includes('border')));
  assert.ok(mutate((r) => { r[2][1] = 'S'; }).some((m) => m.includes('S count')));
  assert.ok(mutate((r) => { r[1][1] = 'S'; r[6][1] = '.'; }).some((m) => m.includes('S is 4-adjacent')));
  assert.ok(mutate((r) => { r[5][1] = '#'; }).length > 0);
  assert.ok(mutate((r) => { r[2][1] = 'H'; }).some((m) => m.includes('H count')));
});

const recorded = (label) => Number(designText.match(new RegExp(`^- ${label.replace(/[()]/g, '\\$&')}: (\\d+)\\s*$`, 'm'))[1]);
const realGrid = parseGrid(realRows);
const patrol = patrolOf(realGrid);

test('enemy constants in tools match the chapter 7 table', () => {
  assert.equal(ENEMY_MOVE_INTERVAL_TICKS, CONSTANTS.ENEMY_MOVE_INTERVAL_TICKS);
});

test('patrol is the 9 tiles (13,1)..(13,9); pockets are dead-end leaves; 78 walkable tiles', () => {
  assert.equal(patrol.length, 9);
  assert.deepEqual(patrol[0], { x: 13, y: 1 });
  assert.deepEqual(patrol[8], { x: 13, y: 9 });
  assert.equal(realRows.join('').split('').filter((c) => c !== '#' && c !== 'H').length, 78);
  assert.equal(realRows[3][14], '.');
  assert.equal(realRows[7][14], '.');
});

test('enemy timeline: BFS enemy model equals the chapter 7 occupancy table and closed formula', () => {
  assert.equal(enemyIndexAt(0, 9), 0);
  assert.equal(enemyIndexAt(1, 9), 1);
  assert.equal(enemyIndexAt(20, 9), 1);
  assert.equal(enemyIndexAt(21, 9), 2);
  assert.equal(enemyIndexAt(141, 9), 8);
  assert.equal(enemyIndexAt(160, 9), 8);
  assert.equal(enemyIndexAt(161, 9), 7);
  assert.equal(enemyIndexAt(301, 9), 0);
  assert.equal(enemyIndexAt(320, 9), 0);
  assert.equal(enemyIndexAt(321, 9), 1);
  assert.equal(enemyCycleTicks(9), 320);
  for (let t = 1; t <= 1800; t++) {
    assert.equal(enemyIndexAt(t + 320, 9), enemyIndexAt(t, 9), `period at ${t}`);
    const m = Math.floor((t - 1) / 20) + 1;
    const r = m % 16;
    assert.equal(enemyIndexAt(t, 9), r <= 8 ? r : 16 - r, `closed formula at ${t}`);
  }
});

test('enemy BFS fixture: straight corridor with a 3-tile patrol', () => {
  // x=3 column rows 1..3 is the patrol; S (1,2); house H (5,2) delivered from (4,2).
  // Open tiles: (1,2) (2,2) (3,1)(3,2)(3,3) (4,2). Enemy: tick 1..20 at index1=(3,2), 21..40 at index2=(3,3),
  // 41..60 at index1, 61..80 at index0. Snail walk: (2,2) at t1; (3,2) earliest t11 but enemy there -> blocked until
  // it leaves at t21 (same-tick chase allowed) -> (3,2) at t21, (4,2) at t31 => win tick 31.
  const rows = ['#######', '###P###', '#S...H#', '###P###', '#######'];
  const g = parseGrid(rows);
  assert.equal(patrolOf(g).length, 3);
  const r = shortestRouteWithEnemy(g);
  assert.equal(r.tick, 31);
  assert.equal(r.moves.length, 3); // waiting can sit before any move, so only the count and tick are fixed
  assert.equal(replayWithEnemy(g, r.moves).status, 'win');
});

test('replay: entering a tile the enemy occupies is caught', () => {
  const g = parseGrid(['#######', '###P###', '#S...H#', '###P###', '#######']);
  // (3,2) entered at t11 while the enemy occupies it (index 1 during t1..20).
  assert.equal(replayWithEnemy(g, [{ tick: 1, dir: 'right' }, { tick: 11, dir: 'right' }]).status, 'caught');
});

test('human witness wins at 1192 with zero collisions; recorded values match', () => {
  const w = replayWithEnemy(realGrid, humanWitness(realGrid, 962));
  assert.deepEqual(w, { status: 'win', tick: 1192 });
  assert.equal(recorded('사람용 증인 승리 틱'), 1192);
  assert.equal((90000 - 691 * 50) / 1000 > 55, true); // HUD ~56 at arrival
  assert.equal(Math.ceil((90000 - 1192 * 50) / 1000), 31);
});

test('BFS minimum with the enemy: 871 ticks, recorded, replays clean, test-only same-tick chase', () => {
  const r = shortestRouteWithEnemy(realGrid);
  assert.equal(r.tick, 871);
  assert.equal(recorded('적 포함 최소 승리 틱'), 871);
  assert.ok(r.tick < 1800);
  assert.deepEqual(replayWithEnemy(realGrid, r.moves), { status: 'win', tick: 871 });
});

test('recorded first exposure 701 (35.0 s) and worst-case 1512', () => {
  assert.equal(recorded('최초 노출 틱'), 701);
  assert.equal(recorded('위상 최악 상한(틱)'), 1512);
  assert.deepEqual(replayWithEnemy(realGrid, humanWitness(realGrid, 962 + 320)), { status: 'win', tick: 1512 });
});

test('jitter: delaying each witness move by +1..+10 ticks cumulatively (<= 29 total) still wins', () => {
  for (let d = 1; d <= 10; d++) {
    let extra = 0;
    const base = humanWitness(realGrid, 962);
    const schedule = base.map((m, i) => {
      if (i >= 70) extra = Math.min(29, extra + d);
      return { ...m, tick: m.tick + extra };
    });
    const r = replayWithEnemy(realGrid, schedule);
    assert.equal(r.status, 'win', `delay step ${d}: ${JSON.stringify(r)}`);
  }
});

test('entering the patrol column one tick too early is caught', () => {
  // Entry at 960: the enemy is still on (13,1) (occupies 941..960).
  const w = replayWithEnemy(realGrid, humanWitness(realGrid, 960));
  assert.equal(w.status, 'caught');
});

test('patrol and tree invariant violations are detected', () => {
  const mutate = (fn) => {
    const rows = realRows.map((r) => r.split(''));
    fn(rows);
    return checkInvariants(parseGrid(rows.map((r) => r.join(''))));
  };
  assert.ok(mutate((r) => { r[5][12] = '.'; }).some((m) => m.includes('not a tree'))); // loop carve (12,5)
  assert.ok(mutate((r) => { r[1][13] = '.'; }).some((m) => m.includes('P count')));
  assert.ok(mutate((r) => { r[9][13] = '#'; }).some((m) => m.includes('P count')));
  assert.ok(mutate((r) => { r[9][13] = '.'; r[9][12] = 'P'; r[9][11] = '.'; }).length > 0);
  assert.ok(mutate((r) => { r[3][14] = '#'; }).some((m) => m.includes('branch tiles')));
  assert.ok(mutate((r) => { r[10][13] = 'P'; r[9][13] = '.'; }).some((m) => m.includes('delivery-adjacent')));
  assert.ok(mutate((r) => { r[2][13] = 'S'; }).some((m) => m.includes('patrol overlaps S')));
});
