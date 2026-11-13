// Pure game logic. No DOM, no canvas, no clock, no randomness.
// Every number here comes from GAME_DESIGN.md chapter 7 (checked by test/design-sync.test.js).

export const CONSTANTS = Object.freeze({
  TICK_MS: 50,
  TOTAL_MS: 90000,
  TOTAL_TICKS: 1800,
  MOVE_INTERVAL_TICKS: 10,
  MOVE_COOLDOWN_RELOAD: 9,
  TILE_PX: 16,
  GRID_COLS: 16,
  GRID_ROWS: 12,
  LETTERS: 3,
  MAX_FRAME_TICKS: 8,
  MAX_DT_MS: 400,
  SKY_DAY_ABOVE_MS: 45000,
  SKY_SUNSET_ABOVE_MS: 18000,
  SUN_X_MIN: 8,
  SUN_X_MAX: 232,
  ALPHA_THRESHOLD: 128,
  ENEMY_MOVE_INTERVAL_TICKS: 20,
  ENEMY_MOVE_COOLDOWN_RELOAD: 19,
  ENEMY_START_COOLDOWN: 0,
});

const C = CONSTANTS;

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ dx: 0, dy: -1 }),
  down: Object.freeze({ dx: 0, dy: 1 }),
  left: Object.freeze({ dx: -1, dy: 0 }),
  right: Object.freeze({ dx: 1, dy: 0 }),
});

/** rows: string[] (GAME_DESIGN.md chapter 5 block) -> level. Houses are indexed in reading order. */
export function parseLevel(rows) {
  const houses = [];
  let start = null;
  const patrolEnds = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === 'P') patrolEnds.push({ x, y });
      if (row[x] === 'H') houses.push({ x, y });
      if (row[x] === 'S') start = { x, y };
    }
  });
  // Patrol = the two 'P' ends and every tile between them (same column, top to bottom).
  const patrol = [];
  if (patrolEnds.length === 2) {
    for (let y = patrolEnds[0].y; y <= patrolEnds[1].y; y++) patrol.push({ x: patrolEnds[0].x, y });
  }
  return { rows, width: rows[0].length, height: rows.length, houses, start, patrol };
}

/** Floor, start, and patrol tiles are walkable. Walls, houses, and anything outside the grid are not. */
export function isWalkable(level, x, y) {
  if (y < 0 || y >= level.height || x < 0 || x >= level.width) return false;
  const c = level.rows[y][x];
  return c === '.' || c === 'S' || c === 'P';
}

export function createInitialState(level) {
  return {
    level,
    status: 'ready',
    remainingMs: C.TOTAL_MS,
    lettersRemaining: level.houses.length,
    snail: { x: level.start.x, y: level.start.y },
    moveCooldown: 0,
    delivered: level.houses.map(() => false),
    enemy: { index: 0, dirSign: 1, cooldown: C.ENEMY_START_COOLDOWN },
    loseCause: null,
    input: { stack: [], latched: null },
  };
}

/** ready + start key: switch to playing without spending time. Other statuses are unchanged. */
export function applyStart(state) {
  if (state.status !== 'ready') return state;
  return { ...state, status: 'playing', input: { stack: state.input.stack, latched: null } };
}

/** win/lose + R: back to ready. playing/ready ignore it. */
export function applyRestart(state) {
  if (state.status !== 'win' && state.status !== 'lose') return state;
  return createInitialState(state.level);
}

/** Press: the direction goes on top of the LIFO stack and is latched for one tick. */
export function pressKey(state, dir) {
  const stack = state.input.stack.filter((d) => d !== dir);
  stack.push(dir);
  return { ...state, input: { stack, latched: dir } };
}

export function releaseKey(state, dir) {
  const stack = state.input.stack.filter((d) => d !== dir);
  return { ...state, input: { stack, latched: state.input.latched } };
}

/** Window lost focus: every key counts as released and the latch is dropped. */
export function releaseAllKeys(state) {
  return { ...state, input: { stack: [], latched: null } };
}

/** Most recent still-held direction, else the latched sub-tick tap, else null. */
export function currentDirection(input) {
  if (input.stack.length > 0) return input.stack[input.stack.length - 1];
  return input.latched;
}

/** Mark every undelivered house 4-adjacent to (x, y) as delivered, in index order. */
export function deliverAdjacent(level, delivered, x, y) {
  const next = delivered.slice();
  let count = 0;
  level.houses.forEach((h, i) => {
    if (next[i]) return;
    if (Math.abs(h.x - x) + Math.abs(h.y - y) === 1) {
      next[i] = true;
      count++;
    }
  });
  return { delivered: next, count };
}

/**
 * One 50 ms tick. Order (GAME_DESIGN.md 7장 규칙 2, 5):
 * 1) remainingMs -= 50; 2) remainingMs <= 0 => lose, no move or delivery;
 * 3) move (cooldown 0 + direction), reload cooldown to 9 on success, else decrement;
 * 4) deliver; 5) win only if every letter is delivered and remainingMs > 0 (ends the tick);
 * 6) enemy step (규칙 12), then contact check (규칙 13) => lose with loseCause 'caught'.
 */
export function tick(state) {
  if (state.status !== 'playing') return state;
  const remainingMs = state.remainingMs - C.TICK_MS;
  const cleared = { stack: state.input.stack, latched: null };
  if (remainingMs <= 0) {
    return { ...state, remainingMs: 0, status: 'lose', loseCause: 'time', input: cleared };
  }
  let { snail, moveCooldown, delivered, lettersRemaining } = state;
  let moved = false;
  const dir = currentDirection(state.input);
  if (moveCooldown === 0 && dir !== null) {
    const d = DIRECTIONS[dir];
    const nx = snail.x + d.dx;
    const ny = snail.y + d.dy;
    if (isWalkable(state.level, nx, ny)) {
      snail = { x: nx, y: ny };
      moveCooldown = C.MOVE_COOLDOWN_RELOAD;
      moved = true;
      const r = deliverAdjacent(state.level, delivered, nx, ny);
      delivered = r.delivered;
      lettersRemaining -= r.count;
    }
  }
  if (!moved && moveCooldown > 0) moveCooldown -= 1;
  if (lettersRemaining === 0) {
    // Win ends the tick: the enemy does not move (7장 규칙 2 ④).
    return { ...state, remainingMs, status: 'win', snail, moveCooldown, delivered, lettersRemaining, input: cleared };
  }
  const enemy = stepEnemy(state.enemy, state.level.patrol.length);
  const caught = enemyContact(state.level, state.snail, snail, state.enemy, enemy);
  return {
    ...state,
    remainingMs,
    status: caught ? 'lose' : 'playing',
    loseCause: caught ? 'caught' : null,
    snail,
    moveCooldown,
    delivered,
    lettersRemaining,
    enemy,
    input: cleared,
  };
}

/**
 * 7장 규칙 13: same tile after both moved, or a swap-through (snail A->B while the enemy B->A).
 * Entering the tile the enemy leaves on the same tick is not contact (13-3); 4-adjacency is safe.
 */
function enemyContact(level, snailBefore, snailAfter, enemyBefore, enemyAfter) {
  if (level.patrol.length < 2) return false;
  const after = level.patrol[enemyAfter.index];
  const before = level.patrol[enemyBefore.index];
  if (snailAfter.x === after.x && snailAfter.y === after.y) return true;
  const moved = snailBefore.x !== snailAfter.x || snailBefore.y !== snailAfter.y;
  return moved && snailAfter.x === before.x && snailAfter.y === before.y && snailBefore.x === after.x && snailBefore.y === after.y;
}

/** Grid tile of the enemy at patrol `index` (0 = top). */
export function enemyTileAt(level, index) {
  return level.patrol[index];
}

/** 7장 규칙 12: cooldown tick, or flip at the end and move one tile this same tick. */
export function stepEnemy(enemy, patrolLen) {
  if (patrolLen < 2) return enemy; // level without a patrol: no enemy movement
  if (enemy.cooldown > 0) return { ...enemy, cooldown: enemy.cooldown - 1 };
  let { index, dirSign } = enemy;
  if (index + dirSign < 0 || index + dirSign >= patrolLen) dirSign = -dirSign;
  index += dirSign;
  return { index, dirSign, cooldown: C.ENEMY_MOVE_COOLDOWN_RELOAD };
}

/** Sky colour stage from integer remainingMs: > 45000 day, > 18000 sunset, else night. */
export function skyStage(remainingMs) {
  if (remainingMs > C.SKY_DAY_ABOVE_MS) return 'day';
  if (remainingMs > C.SKY_SUNSET_ABOVE_MS) return 'sunset';
  return 'night';
}

/** Sun x in the top lane: SUN_X_MIN at TOTAL_MS, SUN_X_MAX at 0, rounded to whole pixels. */
export function sunX(remainingMs) {
  const elapsed = C.TOTAL_MS - remainingMs;
  return C.SUN_X_MIN + Math.round((elapsed * (C.SUN_X_MAX - C.SUN_X_MIN)) / C.TOTAL_MS);
}

/** Whole seconds shown in the HUD. */
export function displaySeconds(remainingMs) {
  return Math.ceil(remainingMs / 1000);
}

/** Frame accumulator: cap dt, emit at most MAX_FRAME_TICKS ticks, discard the excess. */
export function stepAccumulator(accMs, dtMs) {
  const acc = accMs + Math.min(dtMs, C.MAX_DT_MS);
  const ticks = Math.min(Math.floor(acc / C.TICK_MS), C.MAX_FRAME_TICKS);
  return { accMs: acc - ticks * C.TICK_MS, ticks };
}

/** Pure threshold used by src/text.js: alpha >= threshold => 1, else 0. */
export function alphaMask(alphaArray, threshold) {
  const out = new Uint8Array(alphaArray.length);
  for (let i = 0; i < alphaArray.length; i++) out[i] = alphaArray[i] >= threshold ? 1 : 0;
  return out;
}
