/* The skirmish map: an Italian farm valley fought over between two bases. Generated from a seed, mirrored across
   the x = y diagonal so both sides get the same ground. World units are metres; +x runs down-right on screen and +y
   down-left, so the two bases sit at the left and right of the view and the victory points run down the middle.

   Grids are 1 m cells. Flags in `block`: 1 stops infantry, 2 stops vehicles, 4 blocks sight. `area` holds ground
   cover: 0 none, 1 light, 2 heavy, 3 negative (none on this map; roads are open ground). Cover objects (walls, sandbags, wire, tank traps) are
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

    /* ---- elevation (CoH3: height extends sight, hides what is behind a crest, and shooting down ignores cover) ----
       Heights on the corner grid of the 1 m cells, in metres. Built from hills listed for one half and mirrored across
       the x = y diagonal, so both sides get the same ground, plus a gentle symmetric swell. Bases stay flat. */
    const HW = W + 1;
    m.hgt = new Float32Array(HW * (H + 1));
    const hills = [
      { x: 100, y: 100, r: 20, h: 4.5 },      // the rise under the central victory point
      { x: 62, y: 118, r: 15, h: 6 },         // a hill over the munitions point and the road junction
      { x: 108, y: 160, r: 12, h: 4 },        // a knoll by the fuel point
      { x: 36, y: 92, r: 11, h: 3.5 },        // a low hill on the outer flank
    ];
    const allHills = hills.concat(hills.filter(h => h.x !== h.y).map(h => ({ ...h, x: h.y, y: h.x })));
    const swell = (x, y) => { const a = x + y, b = Math.abs(x - y); return .55 * Math.sin(a * .045 + 1.3) * Math.cos(b * .06) + .35 * Math.sin(b * .09 + .4); };
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      let h = Math.max(0, swell(x, y) + .5);
      for (const k of allHills) { const d2 = ((x - k.x) ** 2 + (y - k.y) ** 2) / (k.r * k.r); if (d2 < 4) h += k.h * Math.exp(-d2 * 1.6) * (1 - d2 / 4); }
      // bases flat (they ramp up from 40 m out)
      let flat = 1; for (const b of m.bases) { const d = Math.hypot(x - b.x, y - b.y); flat = Math.min(flat, U.clamp((d - 40) / 18, 0, 1)); }
      m.hgt[y * HW + x] = h * flat;
    }
    // level pads under houses (set where each house goes, below)
    m.flatPad = (cx, cy, w, d) => {
      const pad = 2.5, x0 = Math.floor(cx - w / 2 - pad), x1 = Math.ceil(cx + w / 2 + pad), y0 = Math.floor(cy - d / 2 - pad), y1 = Math.ceil(cy + d / 2 + pad);
      const hc = hAt(m, cx, cy);
      for (let y = Math.max(0, y0 - 3); y <= Math.min(H, y1 + 3); y++) for (let x = Math.max(0, x0 - 3); x <= Math.min(W, x1 + 3); x++) {
        const dx = Math.max(0, x0 - x, x - x1), dy = Math.max(0, y0 - y, y - y1), t = U.clamp(1 - Math.hypot(dx, dy) / 3, 0, 1);
        const i = y * HW + x; m.hgt[i] = m.hgt[i] + (hc - m.hgt[i]) * t;
      }
    };

    /* ---- houses: farmsteads and a hamlet round the centre ---- */
    const halfHouses = [
      { x: 90, y: 116, w: 9, d: 7 }, { x: 80, y: 106, w: 6, d: 6 }, { x: 64, y: 70, w: 8, d: 6 }, { x: 128, y: 156, w: 9, d: 6 },
      { x: 30, y: 122, w: 7, d: 6 }, { x: 62, y: 152, w: 8, d: 6 }, { x: 100, y: 140, w: 6, d: 8 }, { x: 46, y: 84, w: 7, d: 7 },
    ];
    // the farmhouse art for each footprint (tools/build_scenery.py; the long side is the ridge). '_r' is the same house
    // turned so its ridge runs along y; square ones use it for the mirrored copy, so the two halves differ.
    const HOUSE_ART = { '9x7': 'farmhouse_stair', '6x6': 'cottage', '8x6': 'farmhouse_long', '9x6': 'farmhouse_tower', '7x6': 'farmhouse_small', '7x7': 'farmhouse_square' };
    const STAIR_ART = new Set(['farmhouse_stair', 'farmhouse_tower', 'farmhouse_long']);
    const addHouse = (h, mirror) => {
      const house = { id: m.houses.length, x: h.x, y: h.y, w: h.w, d: h.d, hp: 1200, maxHp: 1200, occ: null, dead: false, roof: R.pick(['tile', 'tile', 'slate']), wall: R.pick(['stucco', 'stone', 'stucco']) };
      const art = HOUSE_ART[Math.max(h.w, h.d) + 'x' + Math.min(h.w, h.d)];
      if (art) house.art = art + (h.w < h.d || (h.w === h.d && mirror) ? '_r' : '');
      m.houses.push(house); m.flatPad(h.x, h.y, h.w, h.d);
      for (let y = Math.floor(h.y - h.d / 2); y < Math.ceil(h.y + h.d / 2); y++) for (let x = Math.floor(h.x - h.w / 2); x < Math.ceil(h.x + h.w / 2); x++)
        if (inside(x, y)) m.block[idx(x, y)] |= BI | BV | BL;
      // the outside stair (models/scenery.py farmhouse(stair=True)) stands 1.2 m out from the long +y wall, from 0.4 m
      // to w*0.62 + 1.4 m along it; turned houses ('_r') carry it on +x, running from the far end. It blocks men (not
      // sight) and stays standing when the house collapses, as in the ruin art. Vehicles already keep 2 m off the walls;
      // blocking them too grew every stair house by another 2 m for vehicles and squeezed the lanes between houses.
      if (art && STAIR_ART.has(art)) {
        const L = Math.max(h.w, h.d), a0 = .4, a1 = L * .62 + 1.4;
        const r = house.art.endsWith('_r'), x0 = h.x - h.w / 2, y0 = h.y - h.d / 2;
        const box = r ? [x0 + h.w, x0 + h.w + 1.2, y0 + L - a1, y0 + L - a0] : [x0 + a0, x0 + a1, y0 + h.d, y0 + h.d + 1.2];
        house.stair = box;
        for (let y = Math.floor(box[2]); y < Math.ceil(box[3]); y++) for (let x = Math.floor(box[0]); x < Math.ceil(box[1]); x++)
          if (inside(x, y) && x + .5 >= box[0] && x + .5 <= box[1] && y + .5 >= box[2] && y + .5 <= box[3]) m.block[idx(x, y)] |= BI;   // cells whose centre is on the stair
      }
    };
    for (const h of halfHouses) { addHouse(h); addHouse({ ...h, x: h.y, y: h.x, w: h.d, d: h.w }, true); }

    /* ---- cover segments ---- */
    const addCover = (kind, ax, ay, bx, by, opts = {}) => {
      const c = { id: m.covers.length, kind, ax, ay, bx, by, hp: opts.hp || 400, maxHp: opts.hp || 400, cover: opts.cover || null,
        blocksV: !!opts.blocksV, blocksI: !!opts.blocksI, owner: opts.owner == null ? -1 : opts.owner, built: opts.built == null ? 1 : opts.built, alive: true };
      m.covers.push(c); bucketAdd(m, c); stampCover(m, c, true);
      return c;
    };
    m.addCover = addCover;
    /* a fighting position (sandbagged pit or stone nest): garrisoned like a house, but low: it blocks movement, not
       sight, and is built by engineers (built 0..1). face: the way its firing notch points. */
    m.addPit = (x, y, def, owner, face) => {
      const h = { id: m.houses.length, x, y, w: def.size, d: def.size, hp: def.hp * .1, maxHp: def.hp, occ: null, dead: false,
        pit: true, defId: def.id, prop: def.art, owner, face, built: 0 };
      m.houses.push(h);
      const r = def.size / 2 - .2;
      for (let yy = Math.floor(y - r); yy < Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx < Math.ceil(x + r); xx++)
        if (inside(xx, yy) && U.dist2(xx + .5, yy + .5, x, y) <= r * r) m.block[idx(xx, yy)] |= BI | BV;
      m.navDirty = true; m.version++;
      return h;
    };
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

    /* ---- roads are open ground (no cover), as on CoH3's Italian maps, where negative cover is rare. The 'negative'
       cover type stays for ground that should have it (none on this map yet). ---- */

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
    return terrainClear(m, ax, ay, bx, by) && !smokeBlocks(m, ax, ay, bx, by);
  }
  /* ground height (m) at a point: bilinear on the corner grid */
  function hAt(m, x, y) {
    if (!m.hgt) return 0;
    const HW = m.w + 1, fx = U.clamp(x, 0, m.w - .001), fy = U.clamp(y, 0, m.h - .001), x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * HW + x0, g = m.hgt;
    return (g[i] * (1 - tx) + g[i + 1] * tx) * (1 - ty) + (g[i + HW] * (1 - tx) + g[i + HW + 1] * tx) * ty;
  }
  /* a crest between two points hides one from the other: eyes 1.7 m up, aim 1.2 m up the target */
  const EYE = 1.7, AIM = 1.2;
  function terrainClear(m, ax, ay, bx, by, eye, aim) {
    if (!m.hgt) return true;
    const za = hAt(m, ax, ay) + (eye == null ? EYE : eye), zb = hAt(m, bx, by) + (aim == null ? AIM : aim);
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d);
    for (let i = 2; i < n - 1; i++) { const t = i / n; if (hAt(m, ax + (bx - ax) * t, ay + (by - ay) * t) > za + (zb - za) * t + .05) return false; }
    return true;
  }
  /* smoke: a sight line through the thick of a cloud is blocked; men inside a cloud see and are seen only close by */
  function smokeBlocks(m, ax, ay, bx, by) {
    if (!m.smokes || !m.smokes.length) return false;
    for (const s of m.smokes) {
      const r = s.r * .8; if (r <= .5) continue;
      if (U.segDist2(s.x, s.y, ax, ay, bx, by) > r * r) continue;
      if (Math.hypot(bx - ax, by - ay) < 7) continue;
      return true;
    }
    return false;
  }
  function inSmoke(m, x, y) { for (const s of m.smokes || []) if (U.dist2(x, y, s.x, s.y) < (s.r * .8) ** 2) return true; return false; }

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

  /* ---- houses: which one is at a point, and collapse into rubble (CoH3 buildings are destructible) ---- */
  function houseAt(m, x, y, pad) { const p = pad || 0; for (const h of m.houses) if (!h.dead && Math.abs(x - h.x) <= h.w / 2 + p && Math.abs(y - h.y) <= h.d / 2 + p) return h; return null; }
  function collapseHouse(m, h) {
    if (h.dead) return; h.dead = true; h.hp = 0; h.occ = null;
    if (h.pit) {                                          // a fighting position just caves in: nothing left standing
      for (let y = Math.floor(h.y - h.d / 2); y < Math.ceil(h.y + h.d / 2); y++) for (let x = Math.floor(h.x - h.w / 2); x < Math.ceil(h.x + h.w / 2); x++)
        if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.block[y * m.w + x] = (m.block[y * m.w + x] & ~(BI | BV)) | (m.static.block[y * m.w + x] & (BI | BV));
      m.navDirty = true; m.version++; return;
    }
    for (let y = Math.floor(h.y - h.d / 2); y < Math.ceil(h.y + h.d / 2); y++) for (let x = Math.floor(h.x - h.w / 2); x < Math.ceil(h.x + h.w / 2); x++)
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.block[y * m.w + x] &= ~(BI | BV | BL);
    // the walls fall into knee-high rubble: heavy cover along the old outline, passable on foot, a tank can push through
    const x0 = h.x - h.w / 2 + .4, x1 = h.x + h.w / 2 - .4, y0 = h.y - h.d / 2 + .4, y1 = h.y + h.d / 2 - .4;
    for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]) m.addCover('rubble', ax, ay, bx, by, { cover: 'heavy', hp: 500 }).house = h.id;
    m.navDirty = true; m.version++;
  }

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
  /* nearest open spot; with reach (from mainRegion) only ground joined to the rest of the map counts */
  function nearestOpen(grid, m, x, y, reach) {
    const ok = (xx, yy) => walkable(grid, m, xx, yy) && (!reach || reach[(yy | 0) * m.w + (xx | 0)]);
    if (ok(x, y)) return { x, y };
    for (let r = 1; r < (reach ? 60 : 30); r++) for (let a = 0; a < 16; a++) {
      const xx = x + Math.cos(a / 16 * U.TAU) * r, yy = y + Math.sin(a / 16 * U.TAU) * r;
      if (ok(xx, yy)) return { x: xx, y: yy };
    }
    return reach ? nearestOpen(grid, m, x, y) : { x, y };
  }
  /* cells joined to the open ground nearest the map centre (the main battlefield), flood-filled on a nav grid */
  function regionOf(grid, m) {
    const W = m.w, n = W * m.h, reach = new Uint8Array(n);
    const c = nearestOpen(grid, m, m.w / 2, m.h / 2), start = (c.y | 0) * W + (c.x | 0);
    if (grid[start]) return reach;
    const stack = [start]; reach[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      if (x > 0 && !grid[i - 1] && !reach[i - 1]) { reach[i - 1] = 1; stack.push(i - 1); }
      if (x < W - 1 && !grid[i + 1] && !reach[i + 1]) { reach[i + 1] = 1; stack.push(i + 1); }
      if (y > 0 && !grid[i - W] && !reach[i - W]) { reach[i - W] = 1; stack.push(i - W); }
      if (y < m.h - 1 && !grid[i + W] && !reach[i + W]) { reach[i + W] = 1; stack.push(i + W); }
    }
    return reach;
  }
  function mainRegion(m, vehicle) {
    const nav = navGrids(m), k = vehicle ? 'reachVeh' : 'reachInf';   // cached on the nav grids, rebuilt with them
    return nav[k] || (nav[k] = regionOf(vehicle ? nav.veh : nav.inf, m));
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

  return { hAt, terrainClear, smokeBlocks, inSmoke, houseAt, collapseHouse, create, coverAt, coversNear, los, sectorAt, findPath, navGrids, walkable, lineClear, clearRun, pathOpen, nearestOpen, mainRegion, removeCover, stampCover, stampCrater, BI, BV, BL };
})();
if (typeof module !== 'undefined') module.exports = MAP;
