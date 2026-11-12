// Self-contained route solver for GAME_DESIGN.md chapter 5 grid.
// Pure module: no DOM, no fs, no imports from src/.

export const WALL = '#';
export const FLOOR = '.';
export const START = 'S';
export const HOUSE = 'H';
export const GRID_COLS = 16;
export const GRID_ROWS = 12;
export const TILE_PER_SECOND = 2;
export const RANGE_MIN_STEPS = 76;
export const RANGE_MAX_STEPS = 84;

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
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === HOUSE) houses.push({ x, y });
      if (rows[y][x] === START) starts.push({ x, y });
    }
  }
  return { rows, width, height, houses, starts, start: starts[0] ?? null };
}

export function cellAt(grid, x, y) {
  if (y < 0 || y >= grid.height) return WALL;
  const row = grid.rows[y];
  if (x < 0 || x >= row.length) return WALL;
  return row[x];
}

/** Walkable = floor or start. Walls and houses block movement. */
export function walkable(grid, x, y) {
  const c = cellAt(grid, x, y);
  return c === FLOOR || c === START;
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
    if (/[^#.SH]/.test(r)) v.push(`row ${y} has a character outside #.SH`);
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
  return v;
}
