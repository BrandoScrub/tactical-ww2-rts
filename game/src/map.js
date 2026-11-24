/* The skirmish map, built from a map definition (maps.js, or one made in the map editor). World units are metres; +x
   runs down-right on screen and +y down-left, so the two bases sit at the left and right of the view.

   Grids are 1 m cells. Flags in `block`: 1 stops infantry, 2 stops vehicles, 4 blocks sight. `area` holds ground
   cover: 0 none, 1 light, 2 heavy, 3 negative (none on this map; roads are open ground). Cover objects (walls, sandbags, wire, tank traps) are
   segments, kept in a coarse bucket grid for fast lookup; their cover only counts against fire that crosses them. */
const MAP = (() => {
  const SEC = 2;                                     // sector grid: 2 m cells
  const BI = 1, BV = 2, BL = 4;
  const MAPDEFS = typeof MAPS !== 'undefined' ? MAPS : require('./maps.js');
  const ROAD_HALF = { road: 3.2, track: 2.1 };        // half widths in metres: white gravel road, dirt farm track
  // the farmhouse art for each footprint (tools/build_scenery.py; the long side is the ridge). '_r' is the same house
  // turned so its ridge runs along y; a square one uses it when the definition says turn.
  const HOUSE_ART = { '9x7': 'farmhouse_stair', '6x6': 'cottage', '8x6': 'farmhouse_long', '9x6': 'farmhouse_tower', '7x6': 'farmhouse_small', '7x7': 'farmhouse_square' };
  const STAIR_ART = new Set(['farmhouse_stair', 'farmhouse_tower', 'farmhouse_long']);
  /* polygon helpers (fields) */
  function inPoly(P, x, y) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function polyEdgeDist(P, x, y) { let d = 1e18; for (let i = 0, j = P.length - 1; i < P.length; j = i++) d = Math.min(d, U.segDist2(x, y, P[j][0], P[j][1], P[i][0], P[i][1])); return Math.sqrt(d); }

  /* Build the playable map from a definition (maps.js; the editor's format). def: a definition object, or the name of
     one in MAPS; default MAPS.default. seed only varies small things (sandbag arcs, tree jitter, house paint). */
  function create(seed, def) {
    if (!def || typeof def === 'string') def = MAPDEFS[def || MAPDEFS.default];
    const W = def.w || 200, H = def.h || 200;
    const R = U.rng(seed || 7);
    const m = {
      w: W, h: H, block: new Uint8Array(W * H), area: new Uint8Array(W * H), road: new Uint8Array(W * H),
      covers: [], coverBuckets: new Map(), houses: [], trees: [], craters: [], fields: [], roads: [], points: [], sectors: [],
      sectorGrid: null, bases: [], navDirty: true, version: 0, seed: seed || 7, id: def.id || 'custom', name: def.name || 'Custom map',
    };
    const idx = (x, y) => y * W + x;
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const pts = a => (a || []).map(p => [+p[0], +p[1]]);

    /* ---- bases: slot 0 (left of screen) and slot 1 (right) ---- */
    m.bases = def.bases.slice(0, 2).map((b, slot) => ({ slot, x: b.x, y: b.y, hq: { x: b.x, y: b.y } }));

    /* ---- roads: white gravel roads and narrower dirt farm tracks ---- */
    m.roads = (def.roads || []).filter(r => r.pts && r.pts.length > 1).map(r => ({ kind: r.kind === 'track' ? 'track' : 'road', pts: pts(r.pts) }));
    for (const rd of m.roads) {
      const roadW = ROAD_HALF[rd.kind];
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const [ax, ay] = rd.pts[i], [bx, by] = rd.pts[i + 1];
        const x0 = Math.floor(Math.min(ax, bx) - 4), x1 = Math.ceil(Math.max(ax, bx) + 4), y0 = Math.floor(Math.min(ay, by) - 4), y1 = Math.ceil(Math.max(ay, by) + 4);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) {
          const d = Math.sqrt(U.segDist2(x + .5, y + .5, ax, ay, bx, by));
          if (d < roadW) m.road[idx(x, y)] = Math.max(m.road[idx(x, y)], d < roadW - 1 ? 2 : 1);
        }
      }
    }

    /* ---- capture points ---- */
    let pid = 0;
    for (const p of def.points || []) m.points.push({ id: pid++, type: p.type, x: p.x, y: p.y, owner: -1, cap: 0, capSide: -1, radius: p.type === 'victory' ? 8 : 6.5 });

    /* ---- reserved ground: bases, points, roads, houses stay clear of trees ---- */
    const clear = (x, y) => {
      for (const b of m.bases) if (U.dist2(x, y, b.x, b.y) < 30 * 30) return false;
      for (const p of m.points) if (U.dist2(x, y, p.x, p.y) < 12 * 12) return false;
      if (inside(x | 0, y | 0) && m.road[idx(x | 0, y | 0)]) return false;
      for (const h of def.houses || []) if (Math.abs(x - h.x) < h.w / 2 + 2.5 && Math.abs(y - h.y) < h.d / 2 + 2.5) return false;
      return x > 3 && y > 3 && x < W - 3 && y < H - 3;
    };

    /* ---- farm fields (ground decoration: crops in rows) ---- */
    m.fields = (def.fields || []).filter(f => f.pts && f.pts.length > 2).map(f => ({ kind: f.kind, pts: pts(f.pts), rot: +f.rot || 0 }));

    /* ---- elevation (CoH3: height extends sight, hides what is behind a crest, and shooting down ignores cover) ----
       Heights on the corner grid of the 1 m cells, in metres: the listed hills over a gentle swell that is the same
       turned half a turn about the centre. Bases stay flat. */
    const HW = W + 1;
    m.hgt = new Float32Array(HW * (H + 1));
    const hills = def.hills || [], amp = def.swell == null ? .35 : +def.swell;
    const swell = (x, y) => { const a = x - W / 2, b = y - H / 2; return amp * (Math.cos(a * .05) * Math.cos(b * .043) + .6 * Math.cos((a + b) * .031)); };
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
      let h = Math.max(0, swell(x, y) + amp);
      for (const k of hills) { const d2 = ((x - k.x) ** 2 + (y - k.y) ** 2) / (k.r * k.r); if (d2 < 4) h += k.h * Math.exp(-d2 * 1.6) * (1 - d2 / 4); }
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

    /* ---- houses ---- */
    const addHouse = h => {
      const house = { id: m.houses.length, x: h.x, y: h.y, w: h.w, d: h.d, hp: 1200, maxHp: 1200, occ: null, dead: false, roof: R.pick(['tile', 'tile', 'slate']), wall: R.pick(['stucco', 'stone', 'stucco']) };
      const art = HOUSE_ART[Math.max(h.w, h.d) + 'x' + Math.min(h.w, h.d)];
      if (art) house.art = art + (h.w < h.d || (h.w === h.d && h.turn) ? '_r' : '');
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
    for (const h of def.houses || []) if (HOUSE_ART[Math.max(h.w, h.d) + 'x' + Math.min(h.w, h.d)]) addHouse(h);

    /* ---- cover segments ---- */
    /* A cover line is made of pieces about PIECE_M[kind] metres long, each with its own health (hp is per piece).
       Blasts and tracks wear pieces down; a piece at zero is gone and the line breaks there (see breakCover). */
    const addCover = (kind, ax, ay, bx, by, opts = {}) => {
      const c = { id: m.covers.length, kind, ax, ay, bx, by, hp: opts.hp || 400, maxHp: opts.hp || 400, cover: opts.cover || null,
        blocksV: !!opts.blocksV, blocksI: !!opts.blocksI, owner: opts.owner == null ? -1 : opts.owner, built: opts.built == null ? 1 : opts.built, alive: true };
      const L = Math.hypot(bx - ax, by - ay), pl = PIECE_M[kind];
      const n = pl ? Math.max(1, Math.round(L / pl)) : 1;
      c.php = opts.php ? opts.php.slice() : new Array(n).fill(c.maxHp);
      m.covers.push(c); bucketAdd(m, c); stampCover(m, c, true);
      return c;
    };
    m.addCover = addCover;
    /* a fighting position (sandbagged pit or stone nest): garrisoned like a house, but low: it blocks movement, not
       sight, and is built by engineers (built 0..1). face: the way its firing notch points. */
    m.addPit = (x, y, def, owner, face) => {
      const h = { id: m.houses.length, x, y, w: def.size, d: def.size, hp: def.hp * .1, maxHp: def.hp, occ: null, dead: false,
        pit: true, defId: def.id, prop: def.art, owner, face, built: 0,
        // field works that are not fighting positions: a cache holds no one; a gun pit holds only its gun; a bunker has a roof
        cache: !!def.cache, bunker: !!def.bunker, roofed: !!def.roofed, noGarrison: !!(def.cache || def.emplacement) };
      m.houses.push(h);
      const r = def.size / 2 - .2;
      for (let yy = Math.floor(y - r); yy < Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx < Math.ceil(x + r); xx++)
        if (inside(xx, yy) && U.dist2(xx + .5, yy + .5, x, y) <= r * r) m.block[idx(xx, yy)] |= BI | BV;
      m.navDirty = true; m.version++;
      return h;
    };
    const addLine = (kind, line, opts) => { const p = pts(line); for (let i = 0; i < p.length - 1; i++) if (Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) > .3) addCover(kind, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], opts); };
    /* stone walls (heavy cover) and hedgerows (light cover); both stop vehicles */
    for (const l of def.walls || []) addLine('wall', l, { cover: 'heavy', blocksV: true, hp: 900 });
    for (const l of def.hedges || []) addLine('hedge', l, { cover: 'light', blocksV: true, hp: 300 });
    for (const l of def.sandbags || []) addLine('sandbags', l, { cover: 'heavy', hp: 220 });
    /* sandbags ringing the points (map-placed, heavy cover): arcs facing the map centre for resource points, three
       even arcs round a victory point, so both sides' points are dug in alike. An arc that would lie on a road is
       turned round the point, a step at a time, until it is clear of it. */
    const onRoad = (x, y) => inside(x | 0, y | 0) && m.road[idx(x | 0, y | 0)] > 0;
    if (def.pointBags !== false) for (const p of m.points) {
      const n = p.type === 'victory' ? 3 : p.type === 'standard' ? 1 : 2, r = p.radius + 3.5, span = .55;
      const base = Math.atan2(H / 2 - p.y, W / 2 - p.x) + (p.type === 'victory' ? Math.PI / 2 : n === 2 ? -Math.PI / 2 * .6 : 0);
      const arcAt = a => { const ps = []; for (let s = 0; s <= 6; s++) { const t = a - span + 2 * span * s / 6; ps.push([p.x + Math.cos(t) * r, p.y + Math.sin(t) * r]); } return ps; };
      const used = [];
      for (let k = 0; k < n; k++) {
        const a0 = base + k * (n === 2 ? Math.PI * .6 : U.TAU / n);
        let a = null;
        for (const step of [0, .25, -.25, .5, -.5, .75, -.75, 1, -1, 1.3, -1.3]) {
          const t = a0 + step, ps = arcAt(t);
          if (ps.every(([x, y]) => inside(x | 0, y | 0) && !onRoad(x, y)) && used.every(u => Math.abs(U.angNorm(u - t)) > span * 2.2)) { a = t; break; }
        }
        if (a == null) continue;
        used.push(a);
        const ps = arcAt(a).filter((_, i) => i % 2 === 0);
        for (let s = 0; s < 3; s++) addCover('sandbags', ps[s][0], ps[s][1], ps[s + 1][0], ps[s + 1][1], { cover: 'heavy', hp: 220 });
      }
    }

    /* ---- trees: olive groves planted in rows in olive fields, cypress lines, single trees; light cover, stop vehicles ---- */
    const tree = (kind, x, y) => { if (clear(x, y)) m.trees.push({ x, y, kind, s: R.range(.85, 1.2), seed: R.int(0, 1e6) }); };
    for (const f of m.fields) if (f.kind === 'olive') {
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [x, y] of f.pts) { const a = x * c + y * s, b = -x * s + y * c; x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b); }
      for (let b = y0 + 3.5; b < y1 - 2; b += 7) for (let a = x0 + 3 + ((b - y0) / 7 & 1) * 3; a < x1 - 2; a += 6.5) {
        const x = a * c - b * s + R.range(-.6, .6), y = a * s + b * c + R.range(-.6, .6);
        if (inPoly(f.pts, x, y) && polyEdgeDist(f.pts, x, y) > 1.8) tree('olive', x, y);
      }
    }
    for (const tl of def.treelines || []) {
      const p = pts(tl.pts), gap = tl.gap || 5;
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, ay] = p[i], [bx, by] = p[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / gap));
        for (let k = i ? 1 : 0; k <= n; k++) tree(tl.kind || 'cypress', ax + (bx - ax) * k / n, ay + (by - ay) * k / n);
      }
    }
    for (const t of def.trees || []) tree(t.kind || 'olive', t.x, t.y);
    for (const t of m.trees) {
      const r = t.kind === 'olive' ? 2 : 1;
      for (let y = Math.floor(t.y - r); y <= Math.ceil(t.y + r); y++) for (let x = Math.floor(t.x - r); x <= Math.ceil(t.x + r); x++)
        if (inside(x, y) && U.dist2(x + .5, y + .5, t.x, t.y) <= r * r) { m.block[idx(x, y)] |= BV; m.area[idx(x, y)] = Math.max(m.area[idx(x, y)], 1); if (t.kind === 'cypress' || U.dist2(x + .5, y + .5, t.x, t.y) < 1) m.block[idx(x, y)] |= BL; }
    }

    /* ---- craters: light cover ---- */
    for (const c of def.craters || []) m.craters.push({ x: c.x, y: c.y, r: c.r || 2 });
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

  /* ---- cover pieces: damage, breaking apart, debris ---- */
  const PIECE_M = { sandbags: 1, wall: 1, hedge: 1, rubble: 1, wire: 2, tanktrap: 2 };   // wrecks are one piece
  const pieceAt = (c, i) => { const n = c.php.length, t = (i + .5) / n; return { x: c.ax + (c.bx - c.ax) * t, y: c.ay + (c.by - c.ay) * t }; };
  /* how worn the piece nearest (x, y) is: its health over full */
  function pieceFrac(c, x, y) {
    const n = c.php.length; if (n === 1) return c.php[0] / c.maxHp;
    const dx = c.bx - c.ax, dy = c.by - c.ay, t = U.clamp(((x - c.ax) * dx + (y - c.ay) * dy) / (dx * dx + dy * dy || 1), 0, .9999);
    return c.php[Math.floor(t * n)] / c.maxHp;
  }
  /* every live cover line within r of (x, y) */
  function coversIn(m, x, y, r) {
    const out = new Set();
    for (const gx of [-r, 0, r]) for (const gy of [-r, 0, r]) for (const c of coversNear(m, x + gx, y + gy)) if (c.alive && U.segDist2(x, y, c.ax, c.ay, c.bx, c.by) < r * r) out.add(c);
    return [...out];
  }
  /* knock dmg off piece i; returns true if that piece is now gone */
  function hurtPiece(c, i, dmg) {
    if (c.php[i] <= 0) return false;
    c.php[i] -= dmg; c.hp = Math.min(...c.php);
    return c.php[i] <= 0;
  }
  /* Pieces at zero are taken out. A finished line splits into the runs of pieces still standing (each run a cover line
     of its own); one still being built is lost whole. Each lost piece leaves debris on the ground. */
  function breakCover(m, c, G) {
    const dead = c.php.map(h => h <= 0);
    if (!dead.some(Boolean)) return;
    for (let i = 0; i < dead.length; i++) if (dead[i]) addDebris(m, c, pieceAt(c, i), G);
    removeCover(m, c);
    if (c.built < 1 || c.kind === 'wreck') return;
    const n = c.php.length;
    for (let i = 0; i < n;) {
      if (dead[i]) { i++; continue; }
      let j = i; while (j + 1 < n && !dead[j + 1]) j++;
      const t0 = i / n, t1 = (j + 1) / n;
      const d = m.addCover(c.kind, c.ax + (c.bx - c.ax) * t0, c.ay + (c.by - c.ay) * t0, c.ax + (c.bx - c.ax) * t1, c.ay + (c.by - c.ay) * t1,
        { cover: c.cover, blocksV: c.blocksV, blocksI: c.blocksI, hp: c.maxHp, owner: c.owner, built: c.built, php: c.php.slice(i, j + 1) });
      d.hp = Math.min(...d.php); if (c.house != null) d.house = c.house; d.blocksIWhenBuilt = c.blocksIWhenBuilt; d.buildTime = c.buildTime; d.from = c.from == null ? c.id : c.from;
      i = j + 1;
    }
  }
  /* what is left of a piece: spilled bags, tumbled stones, torn brush, a twisted picket. Drawn flat on the ground. */
  function addDebris(m, c, p, G) {
    const d = m.debris || (m.debris = []);
    d.push({ kind: c.kind, x: p.x, y: p.y, ang: Math.atan2(c.by - c.ay, c.bx - c.ax), len: Math.hypot(c.bx - c.ax, c.by - c.ay) / c.php.length,
      owner: c.owner, built: c.built >= 1, seed: (c.id * 31 + d.length * 7) & 1023, t: G ? G.t : 0 });
    if (d.length > 400) d.splice(0, d.length - 400);
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

  /* a piece knocked below WORN of its health is a slumped heap: one step less cover (heavy to light, light to none) */
  const WORN = .4;
  function worn(c, k, x, y) { return pieceFrac(c, x, y) >= WORN ? k : k === 'heavy' ? 'light' : 'none'; }
  /* Cover a model at (x, y) gets against fire from (sx, sy): the best of ground cover under it and any cover segment
     within 1.6 m that lies between it and the shooter. Elevated or flanking shooters get no segment cover. */
  function coverAt(m, x, y, sx, sy) {
    let best = 'none';
    const i = (y | 0) * m.w + (x | 0), a = m.area[i] || 0;
    if (a === 1) best = 'light'; else if (a === 3) best = 'negative';
    if (sx == null) {
      for (const c of coversNear(m, x, y)) if (c.alive && c.cover && c.built >= 1 && U.segDist2(x, y, c.ax, c.ay, c.bx, c.by) < 1.6 * 1.6) { const k = worn(c, c.cover, x, y); if (k === 'heavy') return 'heavy'; if (k === 'light') best = 'light'; }
      return best;
    }
    for (const c of coversNear(m, x, y)) {
      if (!c.alive || !c.cover || c.built < 1) continue;
      if (U.segDist2(x, y, c.ax, c.ay, c.bx, c.by) > 1.6 * 1.6) continue;
      // the segment must be between: the shot line from shooter to a point just past the model crosses it
      const dx = x - sx, dy = y - sy, L = Math.hypot(dx, dy) || 1;
      const px = x + dx / L * .4, py = y + dy / L * .4, qx = x - dx / L * 2.4, qy = y - dy / L * 2.4;
      if (U.segX(qx, qy, px, py, c.ax, c.ay, c.bx, c.by)) { const k = worn(c, c.cover, x, y); if (k === 'heavy') return 'heavy'; if (k === 'light' && best !== 'heavy') best = 'light'; }
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


  /* ---- checking a map: is it playable, and how fair are the two halves? (map editor and game/test/maps.js) ---- */
  /* walking (or driving) distance in metres from (x, y) to every cell: Dijkstra over the 8-connected nav grid */
  function distField(m, x, y, vehicle) {
    const nav = navGrids(m), grid = vehicle ? nav.veh : nav.inf, W = m.w, n = W * m.h, D = new Float32Array(n).fill(Infinity);
    const s = nearestOpen(grid, m, x, y), si = (s.y | 0) * W + (s.x | 0), heap = new U.Heap();
    D[si] = 0; heap.push(0, si);
    while (heap.size) {
      const i = heap.pop(), cx = i % W, cy = (i / W) | 0, d = D[i];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= m.h) continue;
        const j = ny * W + nx; if (grid[j]) continue;
        if (dx && dy && (grid[cy * W + nx] || grid[ny * W + cx])) continue;   // no cutting corners
        const nd = d + (dx && dy ? 1.414 : 1);
        if (nd < D[j]) { D[j] = nd; heap.push(nd, j); }
      }
    }
    return D;
  }
  /* nearest reachable distance to anywhere within r of (x, y) */
  function distTo(m, D, x, y, r) {
    let best = Infinity;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++)
      if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && (xx + .5 - x) ** 2 + (yy + .5 - y) ** 2 <= r * r) best = Math.min(best, D[yy * m.w + xx]);
    return best;
  }
  function check(m, def) {
    const problems = [], warn = [], at = (x, y) => `(${Math.round(x)}, ${Math.round(y)})`;
    if (m.bases.length < 2) { problems.push('the map needs two bases'); return { problems, warn, sides: [] }; }
    if (!m.points.some(p => p.type === 'victory')) problems.push('the map has no victory point');
    for (const b of m.bases) if (Math.min(b.x, b.y, m.w - b.x, m.h - b.y) < 18) problems.push(`base at ${at(b.x, b.y)} is closer than 18 m to the map edge`);
    if (def) for (const h of def.houses || []) if (!HOUSE_ART[Math.max(h.w, h.d) + 'x' + Math.min(h.w, h.d)]) problems.push(`house at ${at(h.x, h.y)}: no farmhouse art is ${h.w} x ${h.d} m`);
    for (const h of m.houses) {
      if (h.pit) continue;
      let onRoad = false;
      for (let y = Math.floor(h.y - h.d / 2); y < Math.ceil(h.y + h.d / 2) && !onRoad; y++) for (let x = Math.floor(h.x - h.w / 2); x < Math.ceil(h.x + h.w / 2); x++) if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.road[y * m.w + x] === 2) { onRoad = true; break; }
      if (onRoad) problems.push(`house at ${at(h.x, h.y)} stands on a road`);
      for (const o of m.houses) if (o.id > h.id && !o.pit && Math.abs(o.x - h.x) < (o.w + h.w) / 2 + 1 && Math.abs(o.y - h.y) < (o.d + h.d) / 2 + 1) problems.push(`houses at ${at(h.x, h.y)} and ${at(o.x, o.y)} overlap`);
      for (const p of m.points) if (Math.abs(p.x - h.x) < h.w / 2 + p.radius - 1 && Math.abs(p.y - h.y) < h.d / 2 + p.radius - 1) warn.push(`house at ${at(h.x, h.y)} is inside a point's circle`);
      for (const b of m.bases) if (U.dist2(h.x, h.y, b.x, b.y) < 34 * 34) problems.push(`house at ${at(h.x, h.y)} is inside a base (keep 34 m from the HQ)`);
    }
    for (const c of m.covers) if (c.alive && (c.kind === 'wall' || c.kind === 'hedge')) for (const b of m.bases) if (U.segDist2(b.x, b.y, c.ax, c.ay, c.bx, c.by) < 30 * 30) { problems.push(`a ${c.kind} at ${at(c.ax, c.ay)} is inside a base (keep 30 m from the HQ)`); break; }
    for (const p of m.points) for (const q of m.points) if (q.id > p.id && U.dist2(p.x, p.y, q.x, q.y) < (p.radius + q.radius + 4) ** 2) problems.push(`points at ${at(p.x, p.y)} and ${at(q.x, q.y)} are too close`);
    // reach and distances from each HQ, on foot and by vehicle
    const F = m.bases.map(b => ({ inf: distField(m, b.x, b.y, false), veh: distField(m, b.x, b.y, true) }));
    const sides = m.bases.map(() => ({ points: [], near: { standard: 0, munitions: 0, fuel: 0, victory: 0 } }));   // near: points clearly nearer this base
    for (const p of m.points) {
      const d = F.map(f => ({ inf: distTo(m, f.inf, p.x, p.y, p.radius), veh: distTo(m, f.veh, p.x, p.y, p.radius) }));
      d.forEach((x, i) => {
        if (!isFinite(x.inf)) problems.push(`${p.type} point at ${at(p.x, p.y)}: infantry from base ${i + 1} cannot reach it`);
        else if (!isFinite(x.veh)) problems.push(`${p.type} point at ${at(p.x, p.y)}: vehicles from base ${i + 1} cannot reach it`);
        sides[i].points.push({ id: p.id, type: p.type, inf: x.inf, veh: x.veh });
      });
      if (isFinite(d[0].inf) && isFinite(d[1].inf) && Math.abs(d[0].inf - d[1].inf) > .08 * (d[0].inf + d[1].inf) / 2) sides[d[0].inf < d[1].inf ? 0 : 1].near[p.type]++;   // a point about as far from both is contested
    }
    if (isFinite(distTo(m, F[0].veh, m.bases[1].x, m.bases[1].y, 6)) === false) problems.push('vehicles cannot drive from one base to the other');
    // fairness: per side, the walk to its nearest point of each kind and to every victory point
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    for (const S of sides) {
      S.nearest = {}; for (const t of ['standard', 'munitions', 'fuel', 'victory']) { const ds = S.points.filter(p => p.type === t).map(p => p.inf).sort((a, b) => a - b); S.nearest[t] = ds.length ? ds[0] : null; }
      S.vpWalk = sum(S.points.filter(p => p.type === 'victory').map(p => p.inf));
    }
    const diff = (a, b) => Math.abs(a - b) / Math.max(1, (a + b) / 2);
    for (const t of ['munitions', 'fuel', 'victory']) if (sides[0].nearest[t] != null && diff(sides[0].nearest[t], sides[1].nearest[t]) > .2) warn.push(`nearest ${t} point: ${Math.round(sides[0].nearest[t])} m walk for base 1, ${Math.round(sides[1].nearest[t])} m for base 2`);
    if (diff(sides[0].vpWalk, sides[1].vpWalk) > .12) warn.push(`walk to all victory points: ${Math.round(sides[0].vpWalk)} m for base 1, ${Math.round(sides[1].vpWalk)} m for base 2`);
    for (const t of ['standard', 'munitions', 'fuel', 'victory']) if (sides[0].near[t] !== sides[1].near[t]) warn.push(`${t} points nearer each base: ${sides[0].near[t]} vs ${sides[1].near[t]}`);
    return { problems: [...new Set(problems)], warn: [...new Set(warn)], sides };
  }

  return { check, distField, HOUSE_ART, ROAD_HALF, inPoly, polyEdgeDist, PIECE_M, WORN, pieceAt, pieceFrac, coversIn, hurtPiece, breakCover, hAt, terrainClear, smokeBlocks, inSmoke, houseAt, collapseHouse, create, coverAt, coversNear, los, sectorAt, findPath, navGrids, walkable, lineClear, clearRun, pathOpen, nearestOpen, mainRegion, removeCover, stampCover, stampCrater, BI, BV, BL };
})();
if (typeof module !== 'undefined') module.exports = MAP;
