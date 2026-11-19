/* The skirmish map: an Italian farm valley fought over between two bases. Generated from a seed, mirrored across
   the x = y diagonal so both sides get the same ground. World units are metres; +x runs down-right on screen and +y
   down-left, so the two bases sit at the left and right of the view and the victory points run down the middle.

   Grids are 1 m cells. Flags in `block`: 1 stops infantry, 2 stops vehicles, 4 blocks sight. `area` holds ground
   cover: 0 none, 1 light, 2 heavy, 3 negative (open road). Cover objects (walls, sandbags, wire, tank traps) are
   segments, kept in a coarse bucket grid for fast lookup; their cover only counts against fire that crosses them. */
const MAP = (() => {
  const W = 200, H = 200, SEC = 2;                   // sector grid: 2 m cells
  const BI = 1, BV = 2, BL = 4;

  function create(seed) {
    const R = U.rng(seed || 7);
    const m = {
      w: W, h: H, block: new Uint8Array(W * H), area: new Uint8Array(W * H), road: new Uint8Array(W * H),
      covers: [], coverBuckets: new Map(), houses: [], trees: [], craters: [], fields: [], roads: [], points: [], sectors: [],
      sectorGrid: null, bases: [], navDirty: true, version: 0, seed: seed || 7,
    };
    const idx = (x, y) => y * W + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const mir = p => ({ ...p, x: p.y, y: p.x });

    /* ---- bases: side A (left of screen) and side B (right) ---- */
    m.bases = [{ slot: 0, x: 30, y: 170, hq: { x: 30, y: 170 } }, { slot: 1, x: 170, y: 30, hq: { x: 170, y: 30 } }];

    /* ---- roads (symmetric polylines) ---- */
    m.roads = [
      [[14, 186], [46, 154], [70, 134], [100, 100], [134, 70], [154, 46], [186, 14]],
      [[52, 196], [98, 172], [145, 145], [172, 98], [196, 52]],
      [[4, 148], [28, 100], [55, 55], [100, 28], [148, 4]],
      [[70, 134], [92, 160], [118, 158], [145, 145]],
      [[134, 70], [160, 92], [158, 118], [145, 145]],
      [[70, 134], [52, 110], [44, 82], [55, 55]],
      [[134, 70], [110, 52], [82, 44], [55, 55]],
    ];
    const roadW = 3.2;
    for (const rd of m.roads) for (let i = 0; i < rd.length - 1; i++) {
      const [ax, ay] = rd[i], [bx, by] = rd[i + 1];
      const x0 = Math.floor(Math.min(ax, bx) - 4), x1 = Math.ceil(Math.max(ax, bx) + 4), y0 = Math.floor(Math.min(ay, by) - 4), y1 = Math.ceil(Math.max(ay, by) + 4);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) {
        const d = Math.sqrt(U.segDist2(x + .5, y + .5, ax, ay, bx, by));
        if (d < roadW) m.road[idx(x, y)] = Math.max(m.road[idx(x, y)], d < roadW - 1 ? 2 : 1);
      }
    }

    /* ---- capture points ---- */
    const halfPoints = [
      { type: 'standard', x: 52, y: 146 }, { type: 'standard', x: 80, y: 176 }, { type: 'munitions', x: 50, y: 112 },
      { type: 'fuel', x: 112, y: 172 }, { type: 'standard', x: 84, y: 132 },
    ];
    let pid = 0;
    const addPoint = p => { m.points.push({ id: pid++, type: p.type, x: p.x, y: p.y, owner: -1, cap: 0, capSide: -1, radius: p.type === 'victory' ? 8 : 6.5 }); };
    for (const p of halfPoints) { addPoint(p); addPoint(mir(p)); }
    addPoint({ type: 'victory', x: 100, y: 100 }); addPoint({ type: 'victory', x: 58, y: 58 }); addPoint({ type: 'victory', x: 142, y: 142 });

    /* ---- reserved ground: bases, points, roads stay clear of scenery ---- */
    const clear = (x, y) => {
      for (const b of m.bases) if (U.dist2(x, y, b.x, b.y) < 44 * 44) return false;
      for (const p of m.points) if (U.dist2(x, y, p.x, p.y) < 12 * 12) return false;
      if (inside(x | 0, y | 0) && m.road[idx(x | 0, y | 0)]) return false;
      return x > 3 && y > 3 && x < W - 3 && y < H - 3;
    };

    /* ---- farm fields (ground decoration, a few with low walls on one edge) ---- */
    const fieldPal = ['wheat', 'stubble', 'green', 'ploughed', 'olive'];
    for (let i = 0; i < 26; i++) {
      const x = R.range(8, 190), y = R.range(8, 190);
      if (y < x - 8) continue;                       // generate the A half, mirror below
      const f = { x, y, w: R.range(14, 30), h: R.range(12, 26), kind: R.pick(fieldPal), rot: R.pick([0, 0, 0.3, -0.3]) };
      m.fields.push(f); if (Math.abs(x - y) > 10) m.fields.push({ ...f, x: y, y: x, w: f.h, h: f.w, rot: -f.rot });
    }

    /* ---- houses: farmsteads and a hamlet round the centre ---- */
    const halfHouses = [
      { x: 90, y: 116, w: 9, d: 7 }, { x: 80, y: 106, w: 6, d: 6 }, { x: 64, y: 70, w: 8, d: 6 }, { x: 128, y: 156, w: 9, d: 6 },
      { x: 30, y: 122, w: 7, d: 6 }, { x: 62, y: 152, w: 8, d: 6 }, { x: 100, y: 140, w: 6, d: 8 }, { x: 46, y: 84, w: 7, d: 7 },
    ];
    const addHouse = h => {
      const house = { id: m.houses.length, x: h.x, y: h.y, w: h.w, d: h.d, hp: 1200, maxHp: 1200, roof: R.pick(['tile', 'tile', 'slate']), wall: R.pick(['stucco', 'stone', 'stucco']) };
      m.houses.push(house);
      for (let y = Math.floor(h.y - h.d / 2); y < Math.ceil(h.y + h.d / 2); y++) for (let x = Math.floor(h.x - h.w / 2); x < Math.ceil(h.x + h.w / 2); x++)
        if (inside(x, y)) m.block[idx(x, y)] |= BI | BV | BL;
    };
    for (const h of halfHouses) { addHouse(h); addHouse({ ...h, x: h.y, y: h.x, w: h.d, d: h.w }); }

    /* ---- cover segments ---- */
    const addCover = (kind, ax, ay, bx, by, opts = {}) => {
      const c = { id: m.covers.length, kind, ax, ay, bx, by, hp: opts.hp || 400, maxHp: opts.hp || 400, cover: opts.cover || null,
        blocksV: !!opts.blocksV, blocksI: !!opts.blocksI, owner: opts.owner == null ? -1 : opts.owner, built: opts.built == null ? 1 : opts.built, alive: true };
      m.covers.push(c); bucketAdd(m, c); stampCover(m, c, true);
      return c;
    };
    m.addCover = addCover;
    /* field walls and hedges stay out of the bases, so there is open ground to build on */
    const nearBase = (ax, ay, bx, by) => m.bases.some(b => U.segDist2(b.x, b.y, ax, ay, bx, by) < 50 * 50);
    const addBoth = (kind, ax, ay, bx, by, opts) => {
      if (!nearBase(ax, ay, bx, by)) addCover(kind, ax, ay, bx, by, opts);
      if (Math.abs(ax - ay) + Math.abs(bx - by) > 4 && !nearBase(ay, ax, by, bx)) addCover(kind, ay, ax, by, bx, opts);
    };

    /* stone walls along field edges and lanes */
    const halfWalls = [
      [[56, 162], [70, 150]], [[34, 136], [48, 136]], [[66, 120], [74, 108]], [[96, 150], [110, 150]], [[118, 182], [130, 170]],
      [[22, 108], [34, 104]], [[74, 92], [70, 80]], [[104, 128], [114, 120]], [[40, 172], [52, 182]], [[86, 186], [96, 178]],
    ];
    for (const [[ax, ay], [bx, by]] of halfWalls) addBoth('wall', ax, ay, bx, by, { cover: 'heavy', blocksV: true, hp: 900 });
    /* hedgerows: light cover, block vehicles */
    const halfHedges = [[[20, 160], [32, 168]], [[60, 132], [56, 124]], [[100, 162], [92, 168]], [[34, 92], [40, 100]], [[118, 136], [126, 128]]];
    for (const [[ax, ay], [bx, by]] of halfHedges) addBoth('hedge', ax, ay, bx, by, { cover: 'light', blocksV: true, hp: 300 });
    /* sandbags ringing the points, as on the reference boards (map-placed, heavy cover) */
    for (const p of m.points) {
      const n = p.type === 'victory' ? 3 : p.type === 'standard' ? 1 : 2;
      const base = R.range(0, U.TAU);
      for (let k = 0; k < n; k++) {
        const a = base + k * U.TAU / n, r = p.radius + 3.5, span = .55;
        const pts = [];
        for (let s = 0; s <= 3; s++) { const t = a - span + 2 * span * s / 3; pts.push([p.x + Math.cos(t) * r, p.y + Math.sin(t) * r]); }
        for (let s = 0; s < 3; s++) {
          const [ax, ay] = pts[s], [bx, by] = pts[s + 1];
          if (inside(ax | 0, ay | 0) && inside(bx | 0, by | 0)) addCover('sandbags', ax, ay, bx, by, { cover: 'heavy', hp: 220 });
        }
      }
    }

    /* ---- trees: olive groves and cypress lines; groves are light cover and stop vehicles ---- */
    for (let g = 0; g < 16; g++) {
      const cx = R.range(10, 190), cy = R.range(10, 190);
      if (cy < cx + 6) continue;
      const n = R.int(6, 16), rad = R.range(6, 13);
      for (let i = 0; i < n; i++) {
        const a = R.range(0, U.TAU), r = Math.sqrt(R()) * rad, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (!clear(x, y) || !clear(y, x)) continue;
        const t = { x, y, kind: R() < .75 ? 'olive' : 'cypress', s: R.range(.85, 1.2), seed: R.int(0, 1e6) };
        m.trees.push(t); m.trees.push({ ...t, x: y, y: x, seed: t.seed + 1 });
      }
    }
    for (const t of m.trees) {
      const r = t.kind === 'olive' ? 2 : 1;
      for (let y = Math.floor(t.y - r); y <= Math.ceil(t.y + r); y++) for (let x = Math.floor(t.x - r); x <= Math.ceil(t.x + r); x++)
        if (inside(x, y) && U.dist2(x + .5, y + .5, t.x, t.y) <= r * r) { m.block[idx(x, y)] |= BV; m.area[idx(x, y)] = Math.max(m.area[idx(x, y)], 1); if (t.kind === 'cypress' || U.dist2(x + .5, y + .5, t.x, t.y) < 1) m.block[idx(x, y)] |= BL; }
    }

    /* ---- craters: light cover ---- */
    for (let i = 0; i < 24; i++) {
      const x = R.range(30, 170), y = R.range(30, 170);
      if (y < x || !clear(x, y)) continue;
      const c = { x, y, r: R.range(1.6, 2.8) }; m.craters.push(c); m.craters.push({ ...c, x: y, y: x });
    }
    for (const c of m.craters) stampCrater(m, c);

    /* ---- roads are negative cover where not otherwise covered ---- */
    for (let i = 0; i < W * H; i++) if (m.road[i] === 2 && !m.area[i]) m.area[i] = 3;

    /* ---- map edge ---- */
    for (let i = 0; i < W; i++) for (const j of [0, 1, H - 2, H - 1]) { m.block[idx(i, j)] |= BI | BV; m.block[idx(j, i)] |= BI | BV; }

    buildSectors(m);
    m.static = { block: m.block.slice() };
    return m;
  }

  function stampCrater(m, c) {
    for (let y = Math.floor(c.y - c.r); y <= Math.ceil(c.y + c.r); y++) for (let x = Math.floor(c.x - c.r); x <= Math.ceil(c.x + c.r); x++)
      if (x >= 0 && y >= 0 && x < m.w && y < m.h && U.dist2(x + .5, y + .5, c.x, c.y) <= c.r * c.r) { const i = y * m.w + x; if (m.area[i] !== 2) m.area[i] = 1; }
  }

  /* ---- cover segment bookkeeping ---- */
  const BK = 8;
  function bucketKeys(c) {
    const out = [];
    const x0 = Math.floor((Math.min(c.ax, c.bx) - 3) / BK), x1 = Math.floor((Math.max(c.ax, c.bx) + 3) / BK);
    const y0 = Math.floor((Math.min(c.ay, c.by) - 3) / BK), y1 = Math.floor((Math.max(c.ay, c.by) + 3) / BK);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(x + y * 1000);
    return out;
  }
  function bucketAdd(m, c) { for (const k of bucketKeys(c)) { let b = m.coverBuckets.get(k); if (!b) m.coverBuckets.set(k, b = []); b.push(c); } }
  function coversNear(m, x, y) { const b = m.coverBuckets.get(Math.floor(x / BK) + Math.floor(y / BK) * 1000); return b || []; }
  /* mark (or clear) the cells a segment stops movement in */
  function stampCover(m, c, on) {
    if (!c.blocksV && !c.blocksI) return;
    const len = Math.hypot(c.bx - c.ax, c.by - c.ay), n = Math.max(1, Math.ceil(len * 2));
    const flag = (c.blocksV ? BV : 0) | (c.blocksI ? BI : 0);
    for (let i = 0; i <= n; i++) {
      const x = Math.floor(c.ax + (c.bx - c.ax) * i / n), y = Math.floor(c.ay + (c.by - c.ay) * i / n);
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const k = y * m.w + x;
      if (on) m.block[k] |= flag;
      else m.block[k] = (m.block[k] & ~flag) | (m.static.block[k] & flag);
    }
    m.navDirty = true; m.version++;
  }
  function removeCover(m, c) {
    c.alive = false; stampCover(m, c, false);
    for (const k of bucketKeys(c)) { const b = m.coverBuckets.get(k); if (b) { const i = b.indexOf(c); if (i >= 0) b.splice(i, 1); } }
    // re-stamp neighbours that share cells
    for (const o of m.covers) if (o.alive && o !== c && (o.blocksV || o.blocksI) && U.segDist2(o.ax, o.ay, c.ax, c.ay, c.bx, c.by) < 9) stampCover(m, o, true);
  }

  /* Cover a model at (x, y) gets against fire from (sx, sy): the best of ground cover under it and any cover segment
     within 1.6 m that lies between it and the shooter. Elevated or flanking shooters get no segment cover. */
  function coverAt(m, x, y, sx, sy) {
    let best = 'none';
    const i = (y | 0) * m.w + (x | 0), a = m.area[i] || 0;
    if (a === 1) best = 'light'; else if (a === 3) best = 'negative';
    if (sx == null) {
      for (const c of coversNear(m, x, y)) if (c.alive && c.cover && c.built >= 1 && U.segDist2(x, y, c.ax, c.ay, c.bx, c.by) < 1.6 * 1.6) { if (c.cover === 'heavy') return 'heavy'; best = 'light'; }
      return best;
    }
    for (const c of coversNear(m, x, y)) {
      if (!c.alive || !c.cover || c.built < 1) continue;
      if (U.segDist2(x, y, c.ax, c.ay, c.bx, c.by) > 1.6 * 1.6) continue;
      // the segment must be between: the shot line from shooter to a point just past the model crosses it
      const dx = x - sx, dy = y - sy, L = Math.hypot(dx, dy) || 1;
      const px = x + dx / L * .4, py = y + dy / L * .4, qx = x - dx / L * 2.4, qy = y - dy / L * 2.4;
      if (U.segX(qx, qy, px, py, c.ax, c.ay, c.bx, c.by)) { if (c.cover === 'heavy') return 'heavy'; if (best !== 'heavy') best = 'light'; }
    }
    return best;
  }

  /* line of sight on the 1 m grid (houses, cypress and grove cores block) */
  function los(m, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d);
    for (let i = 1; i < n; i++) {
      const x = (ax + (bx - ax) * i / n) | 0, y = (ay + (by - ay) * i / n) | 0;
      if (m.block[y * m.w + x] & BL) return false;
    }
    return true;
  }

  /* ---- sectors: Voronoi of the points (plus a base sector round each HQ) on a 2 m grid ---- */
  const BASE_R = 54;   // a base sector reaches at most this far from its HQ (CoH3 bases are a compact block round the HQ)
  function buildSectors(m) {
    const gw = m.w / SEC, gh = m.h / SEC, g = new Int16Array(gw * gh);
    const seeds = [];
    m.bases.forEach((b, i) => { seeds.push({ x: b.x, y: b.y, base: i, w: .28 }); });
    m.points.forEach(p => seeds.push({ x: p.x, y: p.y, point: p.id, w: 1 }));
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const wx = x * SEC + SEC / 2, wy = y * SEC + SEC / 2;
      let best = -1, bd = 1e18;
      seeds.forEach((s, i) => { const r2 = U.dist2(wx, wy, s.x, s.y); if (s.base != null && r2 > BASE_R * BASE_R) return; const d = r2 * s.w; if (d < bd) { bd = d; best = i; } });
      g[y * gw + x] = best;
    }
    m.sectors = seeds.map((s, i) => ({ id: i, x: s.x, y: s.y, base: s.base == null ? -1 : s.base, point: s.point == null ? -1 : s.point, neigh: new Set(), owner: s.base == null ? -1 : s.base, cells: 0, cx: 0, cy: 0 }));
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const s = g[y * gw + x], S = m.sectors[s]; S.cells++; S.cx += x * SEC + 1; S.cy += y * SEC + 1;
      if (x + 1 < gw && g[y * gw + x + 1] !== s) { S.neigh.add(g[y * gw + x + 1]); m.sectors[g[y * gw + x + 1]].neigh.add(s); }
      if (y + 1 < gh && g[(y + 1) * gw + x] !== s) { S.neigh.add(g[(y + 1) * gw + x]); m.sectors[g[(y + 1) * gw + x]].neigh.add(s); }
    }
    for (const S of m.sectors) { S.cx /= S.cells; S.cy /= S.cells; }
    m.points.forEach(p => { p.sector = m.sectors.findIndex(S => S.point === p.id); });
    m.sectorGrid = g; m.secW = gw; m.secH = gh; m.SEC = SEC;
  }
  const sectorAt = (m, x, y) => m.sectors[m.sectorGrid[U.clamp((y / SEC) | 0, 0, m.secH - 1) * m.secW + U.clamp((x / SEC) | 0, 0, m.secW - 1)]];

  /* ---- navigation: A* on the 1 m grid, vehicles on a grid with obstacles grown by their clearance ---- */
  function navGrids(m) {
    if (!m.navDirty && m.nav) return m.nav;
    const n = m.w * m.h, inf = new Uint8Array(n), veh = new Uint8Array(n);
    for (let i = 0; i < n; i++) inf[i] = m.block[i] & BI ? 1 : 0;
    // vehicles: grow obstacles by 2 cells
    const vb = new Uint8Array(n); for (let i = 0; i < n; i++) vb[i] = (m.block[i] & (BV | BI)) && (m.block[i] & BV) ? 1 : 0;
    const R = 2;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (vb[y * m.w + x]) {
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + 1) continue;
        const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h) veh[yy * m.w + xx] = 1;
      }
    }
    m.nav = { inf, veh }; m.navDirty = false;
    return m.nav;
  }
  function walkable(grid, m, x, y) { return x >= 0 && y >= 0 && x < m.w && y < m.h && !grid[(y | 0) * m.w + (x | 0)]; }
  function lineClear(grid, m, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d * 2));   // at least one step: a zero-length line is clear if its point is
    for (let i = 0; i <= n; i++) if (!walkable(grid, m, ax + (bx - ax) * i / n, ay + (by - ay) * i / n)) return false;
    return true;
  }
  /* the farthest point on the line from a toward b that can be reached in a straight line (a itself if blocked at once) */
  function clearRun(grid, m, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 2);
    let lx = ax, ly = ay;
    for (let i = 1; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; if (!walkable(grid, m, x, y)) break; lx = x; ly = y; }
    return { x: lx, y: ly };
  }
  /* is a path still open from (x, y) through all its waypoints? (after the map changes, most paths still are) */
  function pathOpen(grid, m, x, y, path) {
    for (const p of path) { if (!lineClear(grid, m, x, y, p.x, p.y)) return false; x = p.x; y = p.y; }
    return true;
  }
  /* nearest walkable cell to (x, y) */
  function nearestOpen(grid, m, x, y) {
    if (walkable(grid, m, x, y)) return { x, y };
    for (let r = 1; r < 30; r++) for (let a = 0; a < 16; a++) {
      const xx = x + Math.cos(a / 16 * U.TAU) * r, yy = y + Math.sin(a / 16 * U.TAU) * r;
      if (walkable(grid, m, xx, yy)) return { x: xx, y: yy };
    }
    return { x, y };
  }
  function findPath(m, ax, ay, bx, by, vehicle) {
    const nav = navGrids(m), grid = vehicle ? nav.veh : nav.inf, W = m.w;
    const s = nearestOpen(grid, m, ax, ay), e = nearestOpen(grid, m, bx, by);
    if (lineClear(grid, m, s.x, s.y, e.x, e.y)) return [{ x: e.x, y: e.y }];
    const sx = s.x | 0, sy = s.y | 0, ex = e.x | 0, ey = e.y | 0;
    const n = W * m.h, gS = new Float32Array(n).fill(1e9), from = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const open = new U.Heap(), h = (x, y) => { const dx = Math.abs(x - ex), dy = Math.abs(y - ey); return Math.max(dx, dy) + .414 * Math.min(dx, dy); };
    const si = sy * W + sx, ei = ey * W + ex;
    gS[si] = 0; open.push(h(sx, sy), si);
    let found = false, it = 0, bestI = si, bestH = h(sx, sy);
    while (open.size && it++ < 60000) {
      const cur = open.pop(); if (closed[cur]) continue; closed[cur] = 1;
      if (cur === ei) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      const hh = h(cx, cy); if (hh < bestH) { bestH = hh; bestI = cur; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue;
        const ni = ny * W + nx; if (grid[ni] || closed[ni]) continue;
        if (dx && dy && (grid[cy * W + nx] || grid[ny * W + cx])) continue;
        const cost = gS[cur] + (dx && dy ? 1.414 : 1) + (m.road[ni] ? -.15 : 0);
        if (cost < gS[ni]) { gS[ni] = cost; from[ni] = cur; open.push(cost + h(nx, ny), ni); }
      }
    }
    let k = found ? ei : bestI; const cells = [];
    while (k !== -1 && k !== si) { cells.push(k); k = from[k]; }
    cells.reverse();
    const raw = cells.map(c => ({ x: c % W + .5, y: ((c / W) | 0) + .5 }));
    if (found) raw.push({ x: e.x, y: e.y });
    // string-pull
    const out = []; let ox = s.x, oy = s.y, i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      while (j > i && !lineClear(grid, m, ox, oy, raw[j].x, raw[j].y)) j--;
      out.push(raw[j]); ox = raw[j].x; oy = raw[j].y; i = j + 1;
    }
    return out.length ? out : [{ x: e.x, y: e.y }];
  }

  return { create, coverAt, coversNear, los, sectorAt, findPath, navGrids, walkable, lineClear, clearRun, pathOpen, nearestOpen, removeCover, stampCover, stampCrater, BI, BV, BL };
})();
if (typeof module !== 'undefined') module.exports = MAP;
