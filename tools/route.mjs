// Self-contained route solver for GAME_DESIGN.md chapter 5 grid.
// Pure module: no DOM, no fs, no imports from src/.

export const WALL = '#';
export const FLOOR = '.';
export const START = 'S';
export const HOUSE = 'H';
export const PATROL = 'P';
export const GRID_COLS = 16;
export const GRID_ROWS = 12;
export const TILE_PER_SECOND = 2;
export const RANGE_MIN_STEPS = 76;
export const RANGE_MAX_STEPS = 84;
export const TOTAL_TICKS = 1800;
export const MOVE_INTERVAL_TICKS = 10;
export const ENEMY_MOVE_INTERVAL_TICKS = 20;

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Extract the first fenced block that follows the "## 5장" heading. */
export function extractGridBlock(markdown) {
  const lines = markdown.split(/\r?\n/);
  const head = lines.findIndex((l) => /^##\s*5장/.test(l));
  if (head < 0) throw new Error('5장 heading not found');
  let i = head + 1;
  while (i < lines.length && !lines[i].startsWith('```')) {
    if (/^##\s/.test(lines[i])) throw new Error('5장 has no fenced grid block');
    i++;
  }
  if (i >= lines.length) throw new Error('5장 has no fenced grid block');
  const rows = [];
  for (i += 1; i < lines.length && !lines[i].startsWith('```'); i++) rows.push(lines[i]);
  if (i >= lines.length) throw new Error('5장 grid block is not closed');
  return rows;
}

/** rows: string[] -> grid object. Houses are indexed in reading order. */
export function parseGrid(rows) {
  const height = rows.length;
  const width = height > 0 ? rows[0].length : 0;
  const houses = [];
  const starts = [];
  const patrolEnds = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === PATROL) patrolEnds.push({ x, y });
      if (rows[y][x] === HOUSE) houses.push({ x, y });
      if (rows[y][x] === START) starts.push({ x, y });
    }
  }
  return { rows, width, height, houses, starts, patrolEnds, start: starts[0] ?? null };
}

export function cellAt(grid, x, y) {
  if (y < 0 || y >= grid.height) return WALL;
  const row = grid.rows[y];
  if (x < 0 || x >= row.length) return WALL;
  return row[x];
}

/** Walkable = floor, start, or patrol tile. Walls and houses block movement; the enemy is not terrain. */
export function walkable(grid, x, y) {
  const c = cellAt(grid, x, y);
  return c === FLOOR || c === START || c === PATROL;
}

/** Deliver every undelivered house 4-adjacent to (x, y). Returns the new mask. */
export function deliverMask(grid, x, y, mask) {
  let next = mask;
  for (let i = 0; i < grid.houses.length; i++) {
    if (next & (1 << i)) continue;
    const h = grid.houses[i];
    if (Math.abs(h.x - x) + Math.abs(h.y - y) === 1) next |= 1 << i;
  }
  return next;
}

/**
 * BFS over (x, y, deliveredMask). Returns
 * { steps, seconds, order: [{house, step}], moves: ('up'|'right'|'down'|'left')[] } or null if unreachable.
 */
export function shortestRoute(grid) {
  if (!grid.start || grid.houses.length === 0) return null;
  const full = (1 << grid.houses.length) - 1;
  const key = (x, y, m) => (m * grid.height + y) * grid.width + x;
  const startMask = deliverMask(grid, grid.start.x, grid.start.y, 0);
  const parent = new Map();
  const startKey = key(grid.start.x, grid.start.y, startMask);
  parent.set(startKey, null);
  let frontier = [{ x: grid.start.x, y: grid.start.y, m: startMask }];
  let steps = 0;
  const info = (k, x, y, m) => ({ k, x, y, m });
  const meta = new Map([[startKey, info(startKey, grid.start.x, grid.start.y, startMask)]]);
  let found = startMask === full ? startKey : null;
  while (found === null && frontier.length > 0) {
    steps++;
    const next = [];
    for (const cur of frontier) {
      const ck = key(cur.x, cur.y, cur.m);
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!walkable(grid, nx, ny)) continue;
        const nm = deliverMask(grid, nx, ny, cur.m);
        const nk = key(nx, ny, nm);
        if (parent.has(nk)) continue;
        parent.set(nk, ck);
        meta.set(nk, info(nk, nx, ny, nm));
        if (nm === full) {
          found = nk;
          break;
        }
        next.push({ x: nx, y: ny, m: nm });
      }
      if (found !== null) break;
    }
    frontier = next;
  }
  if (found === null) return null;
  const path = [];
  for (let k = found; k !== null; k = parent.get(k)) path.push(meta.get(k));
  path.reverse();
  const order = [];
  for (let s = 1; s < path.length; s++) {
    const gained = path[s].m & ~path[s - 1].m;
    for (let i = 0; i < grid.houses.length; i++) {
      if (gained & (1 << i)) order.push({ house: i + 1, step: s });
    }
  }
  const moves = [];
  for (let s = 1; s < path.length; s++) {
    const dx = path[s].x - path[s - 1].x;
    const dy = path[s].y - path[s - 1].y;
    moves.push(dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up');
  }
  const total = path.length - 1;
  return { steps: total, seconds: total / TILE_PER_SECOND, order, moves };
}

/** 5장 invariants for the real 16x12 map. Returns a list of violation strings. */
export function checkInvariants(grid) {
  const v = [];
  if (grid.height !== GRID_ROWS) v.push(`rows ${grid.height} != ${GRID_ROWS}`);
  grid.rows.forEach((r, y) => {
    if (r.length !== GRID_COLS) v.push(`row ${y} length ${r.length} != ${GRID_COLS}`);
    if (/[^#.SHP]/.test(r)) v.push(`row ${y} has a character outside #.SHP`);
  });
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.rows[y].length; x++) {
      const border = y === 0 || y === grid.height - 1 || x === 0 || x === grid.rows[y].length - 1;
      if (border && walkable(grid, x, y)) v.push(`border (${x},${y}) is walkable`);
    }
  }
  if (grid.starts.length !== 1) v.push(`S count ${grid.starts.length} != 1`);
  if (grid.houses.length !== 3) v.push(`H count ${grid.houses.length} != 3`);
  grid.houses.forEach((h, i) => {
    const open = DIRS.some(([dx, dy]) => walkable(grid, h.x + dx, h.y + dy));
    if (!open) v.push(`H${i + 1} has no walkable 4-neighbour`);
    if (grid.start && Math.abs(h.x - grid.start.x) + Math.abs(h.y - grid.start.y) === 1) {
      v.push(`S is 4-adjacent to H${i + 1}`);
    }
  });
  // single connected component of walkable tiles
  if (grid.start) {
    const seen = new Set();
    const stack = [[grid.start.x, grid.start.y]];
    seen.add(`${grid.start.x},${grid.start.y}`);
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const k = `${nx},${ny}`;
        if (walkable(grid, nx, ny) && !seen.has(k)) {
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
    }
    let total = 0;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.rows[y].length; x++) if (walkable(grid, x, y)) total++;
    }
    if (seen.size !== total) v.push(`walkable tiles not one component (${seen.size}/${total})`);
  }
  const route = shortestRoute(grid);
  if (route === null) v.push('not every H is deliverable from S');
  v.push(...checkTreeInvariants(grid), ...checkPatrolInvariants(grid));
  return v;
}

/** Walkable tiles form an acyclic connected graph (a tree) with exactly two branch tiles (the dodge-pocket mouths). */
function checkTreeInvariants(grid) {
  const v = [];
  let tiles = 0;
  let edges = 0;
  let branches = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.rows[y].length; x++) {
      if (!walkable(grid, x, y)) continue;
      tiles++;
      let degree = 0;
      for (const [dx, dy] of DIRS) if (walkable(grid, x + dx, y + dy)) degree++;
      edges += degree;
      if (degree >= 3) branches++;
      if (degree > 3) v.push(`(${x},${y}) has degree ${degree}`);
    }
  }
  edges /= 2;
  if (edges !== tiles - 1) v.push(`walkable graph is not a tree (tiles ${tiles}, edges ${edges})`);
  if (branches !== 2) v.push(`branch tiles ${branches} != 2`);
  return v;
}

/** Tiles from the first P to the second P (same column, straight, all walkable). Null when malformed. */
export function patrolOf(grid) {
  if (grid.patrolEnds.length !== 2) return null;
  const [a, b] = grid.patrolEnds;
  if (a.x !== b.x || b.y <= a.y) return null;
  const tiles = [];
  for (let y = a.y; y <= b.y; y++) tiles.push({ x: a.x, y });
  return tiles;
}

function checkPatrolInvariants(grid) {
  const v = [];
  if (grid.patrolEnds.length !== 2) {
    v.push(`P count ${grid.patrolEnds.length} != 2`);
    return v;
  }
  const tiles = patrolOf(grid);
  if (tiles === null) {
    v.push('P tiles are not two ends of one vertical line');
    return v;
  }
  for (const t of tiles) {
    const c = cellAt(grid, t.x, t.y);
    if (c !== FLOOR && c !== PATROL) v.push(`patrol tile (${t.x},${t.y}) is not a road`);
    if (grid.start && grid.start.x === t.x && grid.start.y === t.y) v.push('patrol overlaps S');
    for (const h of grid.houses) {
      if (Math.abs(h.x - t.x) + Math.abs(h.y - t.y) === 1) v.push(`patrol tile (${t.x},${t.y}) is delivery-adjacent`);
    }
  }
  return v;
}

/** Enemy patrol index at tick t (0 = ready / top tile). 20 ticks per tile, flip on arrival, no end dwell. */
export function enemyIndexAt(t, length) {
  if (t <= 0) return 0;
  const period = 2 * (length - 1);
  const r = (Math.floor((t - 1) / ENEMY_MOVE_INTERVAL_TICKS) + 1) % period;
  return r <= length - 1 ? r : period - r;
}

/** Cycle length in ticks for a patrol of `length` tiles. */
export function enemyCycleTicks(length) {
  return 2 * (length - 1) * ENEMY_MOVE_INTERVAL_TICKS;
}

/**
 * One tick of the shared snail/enemy model. `from` = snail tile before the tick, `to` = after (same when not moving).
 * Returns the outcome in 7장 규칙 2 order: time-lose > win > contact-lose.
 */
function resolveTick(patrol, t, from, to, lettersLeft) {
  if (t >= TOTAL_TICKS) return 'time';
  if (lettersLeft === 0) return 'win';
  const before = patrol[enemyIndexAt(t - 1, patrol.length)];
  const after = patrol[enemyIndexAt(t, patrol.length)];
  if (to.x === after.x && to.y === after.y) return 'caught';
  if (to.x === before.x && to.y === before.y && from.x === after.x && from.y === after.y && (from.x !== to.x || from.y !== to.y)) {
    return 'caught';
  }
  return null;
}

/**
 * Tick-level BFS over (x, y, deliveredMask, cooldown) with the patrol enemy.
 * Returns { tick, moves: [{ tick, dir }] } for the earliest win tick, or null if none before TOTAL_TICKS.
 * Test-only: the minimum may rely on same-tick chase (enter a tile on the tick the enemy leaves it).
 */
export function shortestRouteWithEnemy(grid) {
  const patrol = patrolOf(grid);
  if (!grid.start || !patrol || grid.houses.length === 0) return null;
  const full = (1 << grid.houses.length) - 1;
  const names = ['up', 'right', 'down', 'left'];
  const key = (x, y, m, cd) => ((m * grid.height + y) * grid.width + x) * 10 + cd;
  let layer = new Map([[key(grid.start.x, grid.start.y, 0, 0), { x: grid.start.x, y: grid.start.y, m: 0, cd: 0, parent: null, dir: null, t: 0 }]]);
  for (let t = 1; t < TOTAL_TICKS; t++) {
    const next = new Map();
    for (const s of layer.values()) {
      const options = [null];
      if (s.cd === 0) {
        DIRS.forEach(([dx, dy], i) => {
          if (walkable(grid, s.x + dx, s.y + dy)) options.push(i);
        });
      }
      for (const o of options) {
        let { x, y, m, cd } = s;
        if (o !== null) {
          x += DIRS[o][0];
          y += DIRS[o][1];
          cd = MOVE_INTERVAL_TICKS - 1;
          m = deliverMask(grid, x, y, m);
        } else if (cd > 0) {
          cd--;
        }
        const left = m === full ? 0 : 1;
        const out = resolveTick(patrol, t, { x: s.x, y: s.y }, { x, y }, left);
        const node = { x, y, m, cd, parent: s, dir: o === null ? null : names[o], t };
        if (out === 'win') return reconstruct(node);
        if (out !== null) continue;
        const k = key(x, y, m, cd);
        if (!next.has(k)) next.set(k, node);
      }
    }
    layer = next;
  }
  return null;
}

function reconstruct(node) {
  const moves = [];
  for (let n = node; n.parent; n = n.parent) if (n.dir) moves.push({ tick: n.t, dir: n.dir });
  moves.reverse();
  return { tick: node.t, moves };
}

/**
 * Replay a scripted move list [{ tick, dir }] through the same model.
 * Returns { status: 'win' | 'caught' | 'time' | 'invalid', tick }.
 */
export function replayWithEnemy(grid, schedule) {
  const patrol = patrolOf(grid);
  const full = (1 << grid.houses.length) - 1;
  let pos = { x: grid.start.x, y: grid.start.y };
  let mask = 0;
  let cd = 0;
  let i = 0;
  for (let t = 1; t <= TOTAL_TICKS; t++) {
    const from = pos;
    let moved = false;
    if (i < schedule.length && schedule[i].tick === t) {
      const di = ['up', 'right', 'down', 'left'].indexOf(schedule[i].dir);
      const nx = pos.x + DIRS[di][0];
      const ny = pos.y + DIRS[di][1];
      if (cd !== 0 || !walkable(grid, nx, ny)) return { status: 'invalid', tick: t };
      pos = { x: nx, y: ny };
      mask = deliverMask(grid, nx, ny, mask);
      cd = MOVE_INTERVAL_TICKS - 1;
      moved = true;
      i++;
    }
    if (!moved && cd > 0) cd--;
    const out = resolveTick(patrol, t, from, pos, mask === full ? 0 : 1);
    if (out !== null) return { status: out, tick: t };
  }
  return { status: 'time', tick: TOTAL_TICKS };
}

/**
 * Human-reproducible witness: shortest no-enemy route up to the tile left of the patrol column,
 * wait, enter the patrol column on `entryTick`, follow the enemy one tile behind at one tile per 20 ticks,
 * hide in the pocket 3 tiles above H3 until the enemy has passed, then walk down to H3.
 */
export function humanWitness(grid, entryTick) {
  const patrol = patrolOf(grid);
  const route = shortestRoute(grid);
  const top = patrol[0];
  const schedule = [];
  let x = grid.start.x;
  let y = grid.start.y;
  let k = 0;
  for (const dir of route.moves) {
    const di = ['up', 'right', 'down', 'left'].indexOf(dir);
    x += DIRS[di][0];
    y += DIRS[di][1];
    if (x === top.x && y === top.y) break;
    schedule.push({ tick: 1 + MOVE_INTERVAL_TICKS * k, dir });
    k++;
  }
  const h3 = grid.houses[grid.houses.length - 1];
  const pocket = patrol.findIndex((p) => p.y === h3.y - 3);
  const step = ENEMY_MOVE_INTERVAL_TICKS;
  schedule.push({ tick: entryTick, dir: 'right' });
  for (let i = 1; i <= pocket; i++) schedule.push({ tick: entryTick + step * i, dir: 'down' });
  const hideTick = entryTick + step * pocket + MOVE_INTERVAL_TICKS;
  schedule.push({ tick: hideTick, dir: 'right' });
  // The enemy goes down, comes back up and leaves patrol tile `pocket` on entryTick - 1 + step * (cycle/2 * 2 - pocket).
  const leaveTick = entryTick + step * (2 * (patrol.length - 1) - pocket);
  schedule.push({ tick: leaveTick, dir: 'left' });
  for (let i = 1; i <= h3.y - patrol[pocket].y; i++) schedule.push({ tick: leaveTick + MOVE_INTERVAL_TICKS * i, dir: 'down' });
  return schedule;
}
