/* Drawing the battlefield: isometric ground, scenery, stand-in buildings, the artkit unit sprites with their crews,
   cover, effects, fog and the markers in the game world (decorators, rings, capture points, sector lines).
   World metres -> screen: sx = (x - y) * 22k, sy = (x + y) * 11k, the same frame the art was exported in
   (55 artkit units a metre at 0.4 px a unit = 22 px a metre at zoom k = 1). */
const RENDER = (() => {
  const ZOOM_MIN = .3;                     // how far out the camera goes (was .55)
  const PXM = 22, VZ = 24;                 // ground px per metre along an axis, screen px per metre of height
  const TEAM = ['#4aa3ff', '#ff5a4a'], TEAM_D = ['#1c4f86', '#86241c'];
  const R = { opt: { shadows: true, corpses: true }, cam: { x: 40, y: 160, k: 1 }, W: 1, H: 1, ctx: null, lib: {}, ground: null, fogC: null, mem: new Map(), sprites: {}, hover: null };

  /* ---------------- camera ---------------- */
  /* world (x, y, z above the ground) -> screen, and back. The ground is drawn flat: height is painted into the ground
     texture as relief shading (see shadeGround) rather than lifted, which keeps the flat painted look of the game. The
     height rules (sight, cover, speed) use the true terrain all the same. */
  function toScreen(x, y, z) { const c = R.cam, k = c.k; return [((x - y) - (c.x - c.y)) * PXM * k + R.W / 2, ((x + y) - (c.x + c.y)) * PXM * .5 * k + R.H / 2 - (z || 0) * VZ * k]; }
  function toWorld(sx, sy) { const c = R.cam, k = c.k; const a = (sx - R.W / 2) / (PXM * k) + (c.x - c.y), b = (sy - R.H / 2) / (PXM * .5 * k) + (c.x + c.y); return [(a + b) / 2, (b - a) / 2]; }
  function clampCam(G) { const c = R.cam; c.x = U.clamp(c.x, 5, G.map.w - 5); c.y = U.clamp(c.y, 5, G.map.h - 5); c.k = U.clamp(c.k, ZOOM_MIN, 1.6); }

  /* ---------------- one-off art: ground texture, trees, props, icons ---------------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function noise2(seed) {
    const r = U.rng(seed), N = 64, g = new Float32Array(N * N); for (let i = 0; i < g.length; i++) g[i] = r();
    return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, s = t => t * t * (3 - 2 * t);
      const v = (a, b) => g[((b % N + N) % N) * N + ((a % N + N) % N)];
      return U.lerp(U.lerp(v(xi, yi), v(xi + 1, yi), s(fx)), U.lerp(v(xi, yi + 1), v(xi + 1, yi + 1), s(fx)), s(fy)); };
  }
  /* Painted ground tiles (art/ground/*.jpg, sources in styles/ww2/tiles/): flat seamless squares, each covering TILE_M
     metres. loadGround() fetches them at start-up; without them (a missing file, or no browser) the flat stand-in
     ground below is drawn instead, so nothing else depends on them. */
  const GROUND_TILES = ['ground_dry_grass', 'ground_dry_grass_patchy', 'ground_dry_grass_scorched', 'ground_green_grass',
    'ground_white_road', 'ground_white_road_alt', 'ground_dirt', 'ground_dirt_alt', 'field_wheat', 'field_stubble',
    'field_stubble_alt', 'field_ploughed', 'ground_olive_grove', 'crater_earth'];
  const TILE_M = { _: 6, ground_white_road: 6.4, ground_white_road_alt: 6.4, field_ploughed: 7, field_stubble: 6, field_wheat: 5 };
  const ROAD_W = 5.6;                       // gravel width in metres (the old stand-in's middle stroke)
  R.tiles = {};
  function loadGround(base) {
    return Promise.all(GROUND_TILES.map(n => new Promise(res => {
      const im = new Image(); im.onload = () => { R.tiles[n] = im; res(); }; im.onerror = () => res(); im.src = base + n + '.jpg';
    })));
  }
  /* Painted materials the game draws with itself (art/materials/*.jpg, 256 px, sources in styles/ww2/tiles/): house
     walls and roofs, shutters, doors, sandbags, field walls, hedges, crates, rubble. Each covers MAT_M metres. Missing
     ones fall back to the flat colours, so nothing depends on them. */
  const MATS = ['wall_stucco', 'wall_stone', 'stone_dressed', 'roof_tile', 'charred', 'shutter', 'timber', 'sandbag',
    'field_wall', 'hedge_foliage', 'planks', 'rubble', 'steel'];
  const MAT_M = { _: 3, shutter: 1, timber: 1.5, sandbag: 1, planks: 1.6, steel: 1, hedge_foliage: 2.5, rubble: 3 };
  R.mats = {};
  function loadMats(base) {
    return Promise.all(MATS.map(n => new Promise(res => {
      const im = new Image(); im.onload = () => { R.mats[n] = im; res(); }; im.onerror = () => res(); im.src = base + n + '.jpg';
    })));
  }
  /* fill the current path of g (a 2D context) with material n at ppm px a metre; false if the material is missing */
  function matFill(g, n, ppm, ox = 0, oy = 0) {
    const im = R.mats[n]; if (!im) return false;
    const px = Math.max(4, Math.round((MAT_M[n] || MAT_M._) * ppm)), key = n + '@' + px;
    R.matTiles = R.matTiles || {};
    let t = R.matTiles[key];
    if (!t) { t = R.matTiles[key] = canvas(px, px); const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(im, 0, 0, px, px); }
    g.save(); g.translate(ox, oy); g.fillStyle = g.createPattern(t, 'repeat'); g.fill(); g.restore();   // the path keeps its place, the pattern shifts
    return true;
  }
  /* A face atlas: flat faces (walls, roof slopes, gables) painted once in face space at FPM px a metre, packed in one
     canvas, then each drawn through the affine map face -> screen. One texture per house, so the WebGL batcher
     takes it as a single image; bump atlas._gv after repainting. */
  const FPM = 32;
  function atlas(faces) {            // faces: [{w, h}] in metres -> {c, r: [{x, y, w, h}]}
    let y = 2, W = 4; const r = faces.map(f => { const w = Math.ceil(f.w * FPM), h = Math.ceil(f.h * FPM), o = { x: 2, y, w, h }; y += h + 4; W = Math.max(W, w + 4); return o; });
    return { c: canvas(W, y), r };
  }
  /* draw atlas rect rc onto the main context: face origin O (world x, y, z), u and v unit world directions */
  function drawFace(c, A, rc, O, u, v) {
    const [ox, oy] = toScreen(...O), [ux, uy] = toScreen(O[0] + u[0], O[1] + u[1], O[2] + u[2]), [vx, vy] = toScreen(O[0] + v[0], O[1] + v[1], O[2] + v[2]);
    c.setTransform((ux - ox) / FPM, (uy - oy) / FPM, (vx - ox) / FPM, (vy - oy) / FPM, ox, oy);
    c.drawImage(A.c, rc.x + .5, rc.y + .5, rc.w - 1, rc.h - 1, .5, .5, rc.w - 1, rc.h - 1);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  /* Prop art (art/props.json, made by tools/build_props.py from models/defences.py and models/terrain.py): field
     defences, walls, hedges, trees and rock as sprite strips, one frame per heading, at the unit art's scale (1 sprite
     px = 1 screen px at zoom 1). Line pieces ('len' metres long) are repeated along a cover line; each has 'first',
     'last' and 'solo' versions whose open ends are drawn whole. Without the file the canvas stand-ins below are used. */
  R.props = null;
  function loadProps(base) {
    return fetch(base + 'props.json').then(r => r.ok ? r.json() : null).then(P => {
      if (!P) return;
      const jobs = [];
      const load = rec => jobs.push(new Promise(res => { const im = new Image(); im.onload = () => { rec.img = im; res(); }; im.onerror = () => res(); im.src = base + rec.src; }));
      for (const k in P) { load(P[k]); for (const e in P[k].ends || {}) load(P[k].ends[e]); if (P[k].front) load(P[k].front); }
      return Promise.all(jobs).then(() => { R.props = P; });
    }).catch(() => {});
  }
  /* one prop frame with its origin at screen (sx, sy); ang: world heading in radians; end: 'first' | 'last' | 'solo' */
  function drawProp(c, key, sx, sy, k, ang, end, scale) {
    const P = R.props, r0 = P && P[key]; if (!r0) return false;
    const r = end ? (r0.ends && r0.ends[end]) || r0[end] || r0 : r0; if (!r.img) return false;
    const n = r.headings, i = n === 1 ? 0 : ((Math.round(((ang || 0) * 180 / Math.PI) / r.span * n) % n) + n) % n;
    const [fw, fh] = r.frame, [ax, ay] = r.anchor, s = k * (scale || 1);
    c.drawImage(r.img, i * fw, 0, fw, fh, sx - ax * s, sy - ay * s, fw * s, fh * s);
    return true;
  }
  const hasProp = key => !!(R.props && R.props[key] && R.props[key].img);

  /* Relief shading baked over the ground texture, in the manner of a painted map: slopes turned from the light (upper
     left) take a soft shadow, slopes toward it and the tops a little warm light. Gentle on purpose so it sits with the
     painted ground; the H view shows exact heights. */
  function shadeGround(G, ground, S) {
    const m = G.map; if (!m.hgt) return;
    const P = 2, W = m.w * P, H = m.h * P, sc = canvas(W, H), sg = sc.getContext('2d'), img = sg.createImageData(W, H), d = img.data;
    const L = [-.6, -.45, .66], Ln = Math.hypot(...L), lx = L[0] / Ln, ly = L[1] / Ln, lz = L[2] / Ln, flat = lz;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = (x + .5) / P, wy = (y + .5) / P, h = MAP.hAt(m, wx, wy);
      const dx = (MAP.hAt(m, wx + .7, wy) - MAP.hAt(m, wx - .7, wy)) / 1.4 * 1.6, dy = (MAP.hAt(m, wx, wy + .7) - MAP.hAt(m, wx, wy - .7)) / 1.4 * 1.6;
      const n = Math.hypot(dx, dy, 1), lum = (-dx * lx - dy * ly + lz) / n / flat;
      let r, g, bl, a;
      if (lum < 1) { r = 40; g = 30; bl = 18; a = Math.min(.3, (1 - lum) * .8); }
      else { r = 255; g = 240; bl = 205; a = Math.min(.12, (lum - 1) * .6); }
      if (h > 1.5) { const ta = Math.min(.07, (h - 1.5) * .015); r = r * (1 - ta) + 250 * ta; g = g * (1 - ta) + 232 * ta; bl = bl * (1 - ta) + 185 * ta; a = a + ta * (1 - a); }
      const i = (y * W + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = a * 255;
    }
    sg.putImageData(img, 0, 0);
    const g2 = ground.getContext('2d'); g2.save(); g2.imageSmoothingEnabled = true; g2.drawImage(sc, 0, 0, ground.width, ground.height); g2.restore();
  }
  /* the height view (H): the ground coloured by elevation in 1 m bands, green low to red-brown high, with contours */
  function buildHeightView(G) {
    const m = G.map, P = 4, W = m.w * P, H = m.h * P, c = canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const ramp = [[54, 110, 60], [104, 150, 64], [180, 180, 70], [222, 170, 66], [214, 120, 52], [170, 72, 44], [120, 46, 40]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const wx = (x + .5) / P, wy = (y + .5) / P, h = MAP.hAt(m, wx, wy), b = Math.min(ramp.length - 1, Math.floor(h)), col = ramp[b];
      const edge = Math.floor(MAP.hAt(m, wx + .25, wy)) !== Math.floor(h) || Math.floor(MAP.hAt(m, wx, wy + .25)) !== Math.floor(h);
      const i = (y * W + x) * 4; d[i] = edge ? 30 : col[0]; d[i + 1] = edge ? 24 : col[1]; d[i + 2] = edge ? 16 : col[2]; d[i + 3] = edge ? 190 : 125;
    }
    g.putImageData(img, 0, 0);
    R.heightC = c; R.heightKey = m.seed + ':' + m.w;
  }
  function buildGround(G) {
    // the ground depends only on the map, so a second match on the same map reuses it
    if (R.ground && R.groundKey === G.map.seed + ':' + G.map.w) return;
    R.groundKey = G.map.seed + ':' + G.map.w;
    if (!R.tiles.ground_dry_grass) { R.groundS = 8; buildGroundFlat(G); } else buildGroundPainted(G);
    shadeGround(G, R.ground, R.groundS);
  }
  function buildGroundPainted(G) {
    const m = G.map, S = R.groundS = 12, W = m.w * S, H = m.h * S, c = canvas(W, H), g = c.getContext('2d');
    // a tile pattern at S px a metre (the tile pre-scaled once, so the pattern repeats every TILE_M metres)
    const pat = (n, ctx) => {
      const im = R.tiles[n]; if (!im) return null;
      const px = Math.round((TILE_M[n] || TILE_M._) * S), t = canvas(px, px), tg = t.getContext('2d');
      tg.imageSmoothingQuality = 'high'; tg.drawImage(im, 0, 0, px, px);
      return (ctx || g).createPattern(t, 'repeat');
    };
    // a soft mask from a function of world metres, at 2 px a metre, smoothed up to the ground size
    const mask = fn => {
      const R2 = 2, mw = m.w * R2, mh = m.h * R2, mc = canvas(mw, mh), mg = mc.getContext('2d'), img = mg.createImageData(mw, mh), d = img.data;
      for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const i = (y * mw + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.max(0, Math.min(255, fn((x + .5) / R2, (y + .5) / R2) * 255)); }
      mg.putImageData(img, 0, 0); return mc;
    };
    // paint tile n through a mask onto the ground, at strength alpha
    const layer = (n, mc, alpha = 1) => {
      const p = pat(n); if (!p) return;
      const l = canvas(W, H), lg = l.getContext('2d'); lg.fillStyle = pat(n, lg); lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in'; lg.imageSmoothingQuality = 'high'; lg.drawImage(mc, 0, 0, W, H);
      g.globalAlpha = alpha; g.drawImage(l, 0, 0); g.globalAlpha = 1;
    };
    const n1 = noise2(11), n2 = noise2(23), n3 = noise2(37), n4 = noise2(53);
    const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
    // 1. dry grass everywhere; patchy grass, scorched grass and green patches over it break up the repeat
    g.fillStyle = pat('ground_dry_grass'); g.fillRect(0, 0, W, H);
    layer('ground_dry_grass_patchy', mask((x, y) => ramp(n1(x / 11, y / 11), .5, .72)));
    layer('ground_dry_grass_scorched', mask((x, y) => ramp(n3(x / 16 + 3, y / 16), .6, .8)), .8);
    layer('ground_green_grass', mask((x, y) => ramp(n2(x / 14 + 7, y / 14), .6, .78)), .7);
    // 2. trodden earth: yards round the farmhouses, the capture points and the two bases, with ragged edges
    const yards = [];
    for (const h of m.houses) yards.push([h.x, h.y, Math.max(h.w, h.d) / 2 + 4.5]);
    for (const p of m.points) yards.push([p.x, p.y, p.radius + 1.5]);
    for (const b of m.bases) yards.push([b.x, b.y, 15]);
    const yardMask = mask((x, y) => {
      let v = 0; const wob = (n4(x / 2.2, y / 2.2) - .5) * 3.2;
      for (const [cx, cy, r] of yards) { const dd = Math.hypot(x - cx, y - cy); if (dd < r + 3) v = Math.max(v, ramp(r + wob - dd, 0, 2.2)); }
      return v;
    });
    layer('ground_dirt', yardMask, .95);
    // 3. fields: each kind's tile in its rotated plot, rows along the plot, a darker worn margin round it
    const FIELD = { wheat: ['field_wheat', 1], stubble: ['field_stubble', 1], ploughed: ['field_ploughed', 1], green: ['ground_green_grass', 1],
                    olive: ['ground_olive_grove', .9] };   // a little dry grass shows through under the olives
    for (const f of m.fields) {
      const [n, a] = FIELD[f.kind] || []; const p = n && pat(n);
      g.save(); g.translate(f.x * S, f.y * S); g.rotate(f.rot);
      const w = f.w * S, h = f.h * S;
      if (p) { g.globalAlpha = a; g.fillStyle = p; g.fillRect(-w / 2, -h / 2, w, h); g.globalAlpha = 1; }
      g.strokeStyle = 'rgba(70,56,32,.35)'; g.lineWidth = .6 * S; g.strokeRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
    // 4. roads: a dusty shoulder, then the gravel laid segment by segment so the wheel ruts follow the road
    const roadPat = [pat('ground_white_road'), pat('ground_white_road_alt')], rt = (TILE_M.ground_white_road) * S;
    for (const rd of m.roads) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); rd.forEach(([x, y], i) => i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S));
      g.strokeStyle = 'rgba(150,128,92,.45)'; g.lineWidth = (ROAD_W + 2.4) * S; g.stroke();
      g.strokeStyle = 'rgba(196,180,150,.9)'; g.lineWidth = (ROAD_W + .3) * S; g.stroke();   // joins and bends under the gravel
    }
    let seg = 0;
    for (const rd of m.roads) for (let i = 0; i < rd.length - 1; i++, seg++) {
      const [ax, ay] = rd[i], [bx, by] = rd[i + 1], L = Math.hypot(bx - ax, by - ay) * S, hw = ROAD_W * S / 2;
      g.save(); g.translate(ax * S, ay * S); g.rotate(Math.atan2(by - ay, bx - ax));
      g.beginPath(); g.rect(-hw * .35, -hw, L + hw * .7, 2 * hw); g.clip();
      g.translate(seg * 97 % rt, -rt / 2);                   // centre the tile's ruts on the road; vary where each segment starts
      g.fillStyle = roadPat[seg % 3 === 2 ? 1 : 0] || roadPat[0]; g.fillRect(-rt - hw, 0, L + 2 * rt + 2 * hw, rt);
      g.restore();
    }
    R.ground = c;
  }
  function buildGroundFlat(G) {
    const m = G.map, S = 8, c = canvas(m.w * S, m.h * S), g = c.getContext('2d');
    const n1 = noise2(11), n2 = noise2(23), n3 = noise2(37);
    const img = g.createImageData(c.width, c.height), d = img.data;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const wx = x / S, wy = y / S;
      const a = n1(wx / 9, wy / 9) * .6 + n2(wx / 3, wy / 3) * .3 + n3(wx * 1.3, wy * 1.3) * .1;
      // dry Italian grass: olive-ochre with greener patches
      let r = 132 + a * 46, gg = 128 + a * 38, b = 74 + a * 20;
      const green = n2(wx / 14 + 7, wy / 14);
      if (green > .58) { const t = (green - .58) * 2.2; r -= 28 * t; gg -= 4 * t; b -= 12 * t; }
      const i = (y * c.width + x) * 4; d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // fields
    const fcol = { wheat: ['#c8a85c', '#b8964a'], stubble: ['#b39a62', '#a08850'], green: ['#7f8a46', '#6e7a3c'], ploughed: ['#8a6a46', '#79593a'], olive: ['#8b8752', '#7d7946'] };
    for (const f of m.fields) {
      g.save(); g.translate(f.x * S, f.y * S); g.rotate(f.rot);
      const [c1, c2] = fcol[f.kind]; g.globalAlpha = .55; g.fillStyle = c1; g.fillRect(-f.w * S / 2, -f.h * S / 2, f.w * S, f.h * S);
      g.globalAlpha = .35; g.strokeStyle = c2; g.lineWidth = 3;
      for (let k = -f.h * S / 2 + 6; k < f.h * S / 2; k += 10) { g.beginPath(); g.moveTo(-f.w * S / 2, k); g.lineTo(f.w * S / 2, k); g.stroke(); }
      g.restore();
    }
    g.globalAlpha = 1;
    // roads: dusty white gravel with wheel ruts
    for (const rd of m.roads) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      const path = () => { g.beginPath(); rd.forEach(([x, y], i) => i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)); };
      path(); g.strokeStyle = 'rgba(120,104,72,.55)'; g.lineWidth = 7.4 * S; g.stroke();
      path(); g.strokeStyle = '#c9b48a'; g.lineWidth = 5.6 * S; g.stroke();
      path(); g.strokeStyle = 'rgba(150,128,90,.55)'; g.lineWidth = 3.4 * S; g.setLineDash([]); g.stroke();
      path(); g.strokeStyle = '#d4c197'; g.lineWidth = 2.2 * S; g.stroke();
    }
    // speckle
    const r = U.rng(5);
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < .5 ? 'rgba(70,60,30,.25)' : 'rgba(230,220,170,.2)'; g.fillRect(r() * c.width, r() * c.height, 1 + r() * 2, 1 + r() * 2); }
    R.ground = c;
  }
  function treeSprite(kind, seed) {
    const key = kind + seed % 5; if (R.sprites[key]) return R.sprites[key];
    const r = U.rng(seed % 5 + 3);
    if (kind === 'cypress') {
      const c = canvas(60, 200), g = c.getContext('2d');
      g.fillStyle = '#4a3a24'; g.fillRect(28, 176, 5, 20);
      for (let i = 0; i < 26; i++) {
        const t = i / 26, y = 186 - t * 170, w = 22 * Math.sin(Math.PI * Math.min(1, t * 1.15 + .05)) * (1 - t * .35);
        g.fillStyle = `hsl(${105 + r() * 15},${30 + r() * 10}%,${16 + r() * 10 + (1 - t) * 4}%)`;
        g.beginPath(); g.ellipse(30 + r.range(-3, 3), y, w * .6 + 3, 10, 0, 0, U.TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,220,.08)'; g.beginPath(); g.ellipse(24, 100, 7, 60, 0, 0, U.TAU); g.fill();
      return R.sprites[key] = { c, ax: 30, ay: 192 };
    }
    const c = canvas(150, 140), g = c.getContext('2d');
    g.strokeStyle = '#5b4a33'; g.lineWidth = 6; g.beginPath(); g.moveTo(75, 134); g.quadraticCurveTo(70 + r.range(-8, 8), 100, 75, 72); g.stroke();
    for (let i = 0; i < 46; i++) {
      const a = r() * U.TAU, d = Math.sqrt(r()) * 46, x = 75 + Math.cos(a) * d * 1.25, y = 66 + Math.sin(a) * d * .7 - 8;
      const l = 24 + (y < 60 ? 10 : 0) + r() * 10 - (x > 80 ? 4 : 0);
      g.fillStyle = `hsl(${78 + r() * 18},${18 + r() * 12}%,${l}%)`;
      g.beginPath(); g.ellipse(x, y, 10 + r() * 8, 8 + r() * 5, 0, 0, U.TAU); g.fill();
    }
    return R.sprites[key] = { c, ax: 75, ay: 134 };
  }
  /* cover and crate sprites: painted from the materials (sandbag, field_wall, hedge_foliage, planks, rubble) when they
     loaded, else the flat stand-ins. Drawn at twice the size they are shown at, so they stay crisp zoomed in. */
  function propSprites() {
    if (R.sprites.bag) return;
    propSpritesFlat();
    if (!R.mats.sandbag) return;
    const ell = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, U.TAU); };
    const lit = (g, w, h, top, bot) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `rgba(255,240,210,${top})`); gr.addColorStop(.45, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(20,14,8,${bot})`); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; };
    // sandbag: a stuffed hessian sack, tied ends, seam down the middle
    const bag = canvas(48, 28), g = bag.getContext('2d');
    ell(g, 24, 14, 22, 12); matFill(g, 'sandbag', 40); lit(g, 48, 28, .28, .45);
    g.strokeStyle = 'rgba(55,42,24,.7)'; g.lineWidth = 1.5; ell(g, 24, 14, 22, 12); g.stroke();
    g.strokeStyle = 'rgba(55,42,24,.35)'; g.beginPath(); g.moveTo(5, 13); g.quadraticCurveTo(24, 17, 43, 13); g.stroke();
    R.sprites.bag = bag;
    // field wall: dry-laid stone, a row of blocks with a top course
    const stone = canvas(48, 32), s2 = stone.getContext('2d');
    s2.beginPath(); s2.moveTo(2, 6); s2.lineTo(10, 2); s2.lineTo(38, 2); s2.lineTo(46, 6); s2.lineTo(46, 30); s2.lineTo(2, 30); s2.closePath(); matFill(s2, 'field_wall', 60); lit(s2, 48, 32, .25, .5);
    s2.fillStyle = 'rgba(20,14,8,.18)'; s2.fillRect(2, 20, 44, 10); s2.strokeStyle = 'rgba(45,38,28,.55)'; s2.lineWidth = 1.2; s2.stroke();
    R.sprites.stone = stone;
    // rubble: broken masonry and plaster in a heap
    const rub = canvas(48, 32), rg = rub.getContext('2d'), rr2 = U.rng(21);
    rg.beginPath(); rg.moveTo(1, 30); for (let i = 0; i <= 8; i++) rg.lineTo(2 + i * 5.5, 30 - Math.sin(i / 8 * Math.PI) * (16 + rr2() * 8)); rg.lineTo(47, 30); rg.closePath(); matFill(rg, 'rubble', 70); lit(rg, 48, 32, .2, .5);
    for (let i = 0; i < 5; i++) { rg.beginPath(); rg.rect(6 + rr2() * 34, 10 + rr2() * 14, 5 + rr2() * 5, 3 + rr2() * 3); matFill(rg, 'stone_dressed', 60); rg.strokeStyle = 'rgba(40,32,24,.5)'; rg.stroke(); }
    R.sprites.rubble = rub;
    // hedge: clumps of foliage, sun on top, dark underneath
    const hedge = canvas(60, 52), hg = hedge.getContext('2d'), rh = U.rng(9);
    hg.beginPath(); for (let i = 0; i < 16; i++) { const x = 12 + rh() * 36, y = 16 + rh() * 24; hg.moveTo(x + 12, y); hg.ellipse(x, y, 12, 10, 0, 0, U.TAU); }
    matFill(hg, 'hedge_foliage', 50); lit(hg, 60, 52, .22, .55);
    hg.globalCompositeOperation = 'source-atop'; for (let i = 0; i < 10; i++) { hg.fillStyle = `rgba(${rh() < .5 ? '255,240,180,.10' : '10,14,4,.22'})`; ell(hg, 10 + rh() * 40, 12 + rh() * 28, 6, 5); hg.fill(); } hg.globalCompositeOperation = 'source-over';
    R.sprites.hedge = hedge;
    // ammunition / fuel crate: planks, darker side, rope handle
    const crate = canvas(48, 44), cg = crate.getContext('2d');
    cg.beginPath(); cg.rect(4, 12, 40, 28); matFill(cg, 'planks', 36); cg.fillStyle = 'rgba(20,14,8,.25)'; cg.fill();
    cg.beginPath(); cg.rect(4, 4, 40, 12); matFill(cg, 'planks', 36, 7, 3); cg.fillStyle = 'rgba(255,240,210,.12)'; cg.fill();
    cg.strokeStyle = 'rgba(40,28,14,.75)'; cg.lineWidth = 2; cg.strokeRect(4, 4, 40, 36); cg.beginPath(); cg.moveTo(4, 16); cg.lineTo(44, 16); cg.moveTo(10, 16); cg.lineTo(10, 40); cg.moveTo(38, 16); cg.lineTo(38, 40); cg.stroke();
    R.sprites.crate = crate;
  }
  function propSpritesFlat() {
    const bag = canvas(24, 14), g = bag.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 14); gr.addColorStop(0, '#d2c49c'); gr.addColorStop(1, '#8e8060');
    g.fillStyle = gr; g.beginPath(); g.ellipse(12, 7, 11, 6, 0, 0, U.TAU); g.fill(); g.strokeStyle = 'rgba(60,50,30,.6)'; g.lineWidth = 1; g.stroke();
    R.sprites.bag = bag;
    const stone = canvas(24, 16), s = stone.getContext('2d');
    s.fillStyle = '#b3a993'; s.fillRect(1, 1, 22, 14); s.fillStyle = '#958b76'; s.fillRect(1, 10, 22, 5); s.strokeStyle = 'rgba(50,45,35,.6)'; s.strokeRect(1, 1, 22, 14);
    R.sprites.stone = stone;
    const hedge = canvas(30, 26), h = hedge.getContext('2d'); const rr = U.rng(9);
    for (let i = 0; i < 16; i++) { h.fillStyle = `hsl(${90 + rr() * 20},28%,${18 + rr() * 12}%)`; h.beginPath(); h.ellipse(6 + rr() * 18, 8 + rr() * 12, 6, 5, 0, 0, U.TAU); h.fill(); }
    R.sprites.hedge = hedge;
    const trap = canvas(30, 30), t = trap.getContext('2d'); t.strokeStyle = '#4b4b4b'; t.lineWidth = 3.5;
    [[4, 26, 26, 6], [4, 6, 26, 26], [15, 2, 15, 28]].forEach(([a, b, c2, d]) => { t.beginPath(); t.moveTo(a, b); t.lineTo(c2, d); t.stroke(); });
    t.strokeStyle = '#8a8a8a'; t.lineWidth = 1; [[4, 26, 26, 6], [4, 6, 26, 26]].forEach(([a, b, c2, d]) => { t.beginPath(); t.moveTo(a, b - 1); t.lineTo(c2, d - 1); t.stroke(); });
    R.sprites.trap = trap;
    const crate = canvas(24, 22), cg = crate.getContext('2d'); cg.fillStyle = '#7a6440'; cg.fillRect(2, 6, 20, 14); cg.fillStyle = '#93784c'; cg.fillRect(2, 2, 20, 6); cg.strokeStyle = 'rgba(40,30,15,.7)'; cg.strokeRect(2, 2, 20, 18);
    R.sprites.crate = crate;
  }

  /* ---------------- decorator icons ---------------- */
  const GLYPHS = {
    wrench: g => { g.lineWidth = 3; g.beginPath(); g.moveTo(-6, 6); g.lineTo(4, -4); g.stroke(); g.beginPath(); g.arc(5, -5, 4, 0, U.TAU); g.stroke(); },
    rifle: g => { g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, 5); g.lineTo(8, -5); g.stroke(); g.fillRect(-8, 3, 5, 4); },
    elite: g => { g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, 5); g.lineTo(8, -5); g.stroke(); g.beginPath(); g.moveTo(-6, -6); g.lineTo(0, -1); g.lineTo(6, -6); g.stroke(); },
    mg: g => { g.lineWidth = 3; g.beginPath(); g.moveTo(-8, -2); g.lineTo(8, -2); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(-2, -2); g.lineTo(-6, 7); g.moveTo(-2, -2); g.lineTo(2, 7); g.stroke(); },
    mortar: g => { g.lineWidth = 3; g.beginPath(); g.moveTo(-3, 7); g.lineTo(5, -7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.moveTo(-8, 7); g.lineTo(6, 7); g.stroke(); },
    rocket: g => { g.lineWidth = 4; g.beginPath(); g.moveTo(-8, 5); g.lineTo(8, -5); g.stroke(); g.beginPath(); g.arc(8, -5, 2.5, 0, U.TAU); g.fill(); },
    sniper: g => { g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 6, 0, U.TAU); g.moveTo(-9, 0); g.lineTo(9, 0); g.moveTo(0, -9); g.lineTo(0, 9); g.stroke(); },
    atgun: g => { g.lineWidth = 3; g.beginPath(); g.moveTo(-7, 5); g.lineTo(8, -6); g.stroke(); g.beginPath(); g.arc(-3, 6, 3, 0, U.TAU); g.stroke(); },
    jeep: g => { g.fillRect(-8, -3, 16, 6); g.beginPath(); g.arc(-5, 4, 2.5, 0, U.TAU); g.arc(5, 4, 2.5, 0, U.TAU); g.fill(); },
    halftrack: g => { g.fillRect(-8, -4, 16, 6); g.fillRect(-8, 3, 11, 3); g.beginPath(); g.arc(6, 4, 2.5, 0, U.TAU); g.fill(); },
    armoredcar: g => { g.fillRect(-8, -2, 16, 6); g.fillRect(-4, -6, 8, 4); g.beginPath(); g.arc(-5, 5, 2.5, 0, U.TAU); g.arc(5, 5, 2.5, 0, U.TAU); g.fill(); },
    lighttank: g => { g.fillRect(-8, 0, 16, 6); g.fillRect(-4, -4, 8, 4); g.fillRect(3, -3, 6, 2); },
    tank: g => { g.fillRect(-9, 0, 18, 7); g.fillRect(-5, -5, 10, 5); g.fillRect(4, -4, 8, 2); },
    td: g => { g.beginPath(); g.moveTo(-9, 7); g.lineTo(9, 7); g.lineTo(7, -1); g.lineTo(-7, -3); g.closePath(); g.fill(); g.fillRect(4, -4, 8, 2); },
    house: g => { g.beginPath(); g.moveTo(-8, 0); g.lineTo(0, -8); g.lineTo(8, 0); g.closePath(); g.fill(); g.fillRect(-6, 0, 12, 7); },
    infantry: g => { g.beginPath(); g.arc(0, -6, 3, 0, U.TAU); g.fill(); g.fillRect(-3, -3, 6, 10); },
    shield: g => { g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, -7); g.lineTo(6, 2); g.lineTo(0, 8); g.lineTo(-6, 2); g.closePath(); g.fill(); },
  };
  function decoIcon(glyph, slot, state) {
    const key = 'deco:' + glyph + slot + state; if (R.sprites[key]) return R.sprites[key];
    const c = canvas(36, 44), g = c.getContext('2d');
    g.translate(18, 22);
    g.fillStyle = state === 'sel' ? '#f2f2f2' : slot < 0 ? '#2a2a26' : slot === 1 ? '#2a1414' : '#141c24';
    g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-15, -16); g.lineTo(15, -16); g.lineTo(15, 6); g.lineTo(0, 19); g.lineTo(-15, 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = (TEAM[slot] || '#b0ab9a'); g.fillRect(-15, -16, 30, 5);
    g.translate(0, 2); g.fillStyle = g.strokeStyle = state === 'sel' ? '#111' : (TEAM[slot] || '#b0ab9a');
    (GLYPHS[glyph] || GLYPHS.infantry)(g);
    return R.sprites[key] = c;
  }
  R.decoIcon = decoIcon; R.GLYPHS = GLYPHS; R.TEAM = TEAM;

  /* ---------------- per-frame ---------------- */
  function init(canvasEl, lib, G) {
    R.G = G;
    R.canvas = canvasEl; R.lib = lib;
    if (!R.ctx) R.ctx = (typeof GLCanvas !== 'undefined' ? GLCanvas.create(canvasEl) : canvasEl.getContext('2d'));   // one context per page
    R.fogImg = null; R.mem = new Map();
    buildGround(G); propSprites();
    R.fogC = canvas(G.map.w / FOG.C, G.map.h / FOG.C);
    R.cam.x = G.map.bases[0].x + 16; R.cam.y = G.map.bases[0].y - 16;
    buildSectorEdges(G);
  }
  function resize(w, h, dpr) { R.W = w; R.H = h; R.dpr = dpr; }

  function buildSectorEdges(G) {
    const m = G.map, gw = m.secW, gh = m.secH, s = m.SEC, out = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const a = m.sectorGrid[y * gw + x];
      if (x + 1 < gw) { const b = m.sectorGrid[y * gw + x + 1]; if (a !== b) out.push({ a, b, x0: (x + 1) * s, y0: y * s, x1: (x + 1) * s, y1: (y + 1) * s, nx: 1, ny: 0 }); }
      if (y + 1 < gh) { const b = m.sectorGrid[(y + 1) * gw + x]; if (a !== b) out.push({ a, b, x0: x * s, y0: (y + 1) * s, x1: (x + 1) * s, y1: (y + 1) * s, nx: 0, ny: 1 }); }
    }
    R.secEdges = out;
  }

  function updateFogCanvas(G, slot) {
    const P = G.players[slot], c = R.fogC, g = c.getContext('2d'), gw = c.width, gh = c.height;
    if (!R.fogImg) R.fogImg = g.createImageData(gw, gh);
    const d = R.fogImg.data;
    for (let i = 0; i < gw * gh; i++) { const v = P.vis[i]; d[i * 4] = 8; d[i * 4 + 1] = 10; d[i * 4 + 2] = 14; d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 110 : 190; }
    g.putImageData(R.fogImg, 0, 0);
  }

  /* Crater sprites: discs of crater_earth with a soft edge, a few variants cut from different parts of the tile,
     drawn on a plain 2D canvas once (the frame context may be WebGL, which has no patterns). One sprite spans a
     4 m crater, so the tile keeps about the ground's scale (TILE_M metres a tile). */
  function craterSprites() {
    if (R.craterSpr !== undefined) return R.craterSpr;
    const im = R.tiles.crater_earth; if (!im) return null;
    const P = 128, D = 4, tile = Math.round(TILE_M._ / D * P), out = [];
    for (let v = 0; v < 4; v++) {
      const s = canvas(P, P), g = s.getContext('2d'), t = canvas(tile, tile);
      t.getContext('2d').drawImage(im, 0, 0, tile, tile);
      g.save(); g.translate(-(v * 53 % tile), -(v * 97 % tile)); g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, P + tile, P + tile); g.restore();
      const rg = g.createRadialGradient(P / 2, P / 2, P * .22, P / 2, P / 2, P / 2);
      rg.addColorStop(0, 'rgba(0,0,0,.95)'); rg.addColorStop(.6, 'rgba(0,0,0,.8)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = rg; g.fillRect(0, 0, P, P);
      out.push(s);
    }
    return (R.craterSpr = out);
  }
  function frame(G, ui, alpha) {
    R.G = G;
    const c = R.ctx, k = R.cam.k;
    FOG.view.all = !!ui.noFog; FOG.view.slot = ui.fogSide || 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#20231c'; c.fillRect(0, 0, R.W, R.H);
    // ground: tilted tiles that follow the terrain, back to front (texture px at R.groundS px a metre)
    drawFlat(c, k, R.ground, R.groundS || 8);
    if (ui.heightView) { if (R.heightKey !== G.map.seed + ':' + G.map.w) buildHeightView(G); drawFlat(c, k, R.heightC, 4); }
    const vis = (x, y, pad) => { const [sx, sy] = toScreen(x, y); return sx > -pad && sx < R.W + pad && sy > -pad && sy < R.H + pad * 1.5; };
    // craters: a soft dark stain, then churned earth (crater_earth) inside it
    c.fillStyle = 'rgba(58,46,30,.55)';
    for (const cr of G.map.craters) { if (!vis(cr.x, cr.y, 80)) continue; const [sx, sy] = toScreen(cr.x, cr.y); c.beginPath(); c.ellipse(sx, sy, cr.r * 31 * k, cr.r * 15.5 * k, 0, 0, U.TAU); c.fill(); }
    const cs = craterSprites();
    if (cs) {                                  // laid flat on the ground through the same iso transform as the tiles
      const [ox, oy] = toScreen(0, 0);
      c.setTransform(PXM * k, PXM * .5 * k, -PXM * k, PXM * .5 * k, ox, oy);
      for (const cr of G.map.craters) {
        if (!vis(cr.x, cr.y, 80)) continue; const rr = cr.r * .9;
        c.drawImage(cs[(Math.round(cr.x * 7 + cr.y * 13) % cs.length + cs.length) % cs.length], cr.x - rr, cr.y - rr, 2 * rr, 2 * rr);
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    c.strokeStyle = 'rgba(30,24,16,.4)'; c.lineWidth = 1.5 * k;
    for (const cr of G.map.craters) { if (!vis(cr.x, cr.y, 80)) continue; const [sx, sy] = toScreen(cr.x, cr.y); c.beginPath(); c.ellipse(sx, sy - 1, cr.r * 27 * k, cr.r * 13 * k, 0, 0, U.TAU); c.stroke(); }
    drawSectorLines(G, c, k);
    drawPoints(G, c, k);
    // shadows of everything that moves, then all objects back to front
    const list = [];
    R.under = [];                                         // squads and vehicles shown this frame (trees over them fade)
    for (const e of G.ents) if (!e.dead && (e.type === 'squad' || e.type === 'vehicle') && FOG.shown(G, e)) R.under.push(e);
    for (const t of G.map.trees) if (vis(t.x, t.y, 160)) list.push({ d: t.x + t.y, f: () => drawTree(c, t, k) });
    const shadows = [];
    for (const h of G.map.houses) {
      if (h.pit) { if (!h.dead && vis(h.x, h.y, 120) && FOG.shownAt(G, h.x, h.y, h.owner)) { list.push({ d: h.x + h.y - 2.2, f: () => drawPit(G, c, h, k, false) }); list.push({ d: h.x + h.y + 1.6, f: () => drawPit(G, c, h, k, true) }); } continue; }
      if (!((!h.dead || houseArt(h)) && vis(h.x, h.y, 260))) continue;
      list.push({ d: h.x + h.y + (h.w + h.d) * .25, f: () => drawHouse(c, h, k) });
      if (houseArt(h)) { const [nx, ny] = toScreen(h.x + h.w / 2, h.y + h.d / 2); shadows.push(() => ArtKit.drawShadow(c, R.lib, h.art, houseState(h), nx, ny, k)); }
    }
    for (const cv of G.map.covers) if (cv.alive && vis((cv.ax + cv.bx) / 2, (cv.ay + cv.by) / 2, 100)) { if (!coverPieces(G, c, cv, k, list)) list.push({ d: (cv.ax + cv.bx + cv.ay + cv.by) / 2, f: () => drawCover(c, cv, k) }); }
    for (const w of G.wrecks || []) if (vis(w.x, w.y, 200)) list.push({ d: w.x + w.y, f: () => drawWreck(G, c, w, k) });
    for (const d of G.drops || []) if (vis(d.x, d.y, 120) && FOG.shownAt(G, d.x, d.y)) list.push({ d: d.x + d.y, f: () => drawDrop(G, c, d, k, ui) });
    if (R.opt.corpses) for (const cp of G.corpses || []) if (vis(cp.x, cp.y, 60) && FOG.shownAt(G, cp.x, cp.y)) list.push({ d: cp.x + cp.y - .5, f: () => drawCorpse(G, c, cp, k) });
    for (const e of G.ents) {
      if (e.dead) continue;
      if (!FOG.shown(G, e)) continue;
      if (e.type === 'building') { if (vis(e.x, e.y, 300)) list.push({ d: e.x + e.y + (e.w + e.d) * .2, f: () => drawBuilding(G, c, e, k, ui) }); continue; }
      if (e.type === 'vehicle') { if (vis(e.x, e.y, 200)) { list.push({ d: e.x + e.y, f: () => drawVehicle(G, c, e, k) }); shadows.push(() => drawVehicleShadow(G, c, e, k)); } continue; }
      if (e.type === 'squad') {
        if (!vis(e.x, e.y, 120)) continue;
        drawSquadParts(G, e, k, list, shadows);
      }
    }
    if (R.opt.shadows) for (const s of shadows) s();
    list.sort((a, b) => a.d - b.d);
    for (const o of list) o.f();
    drawProjectiles(G, c, k);
    drawFx(G, c, k);
    drawSmoke(G, c, k);
    // fog
    if (!ui.noFog) {
      drawFlat(c, k, R.fogC, 1 / FOG.C);
    }
    drawOverlay(G, c, k, ui);
    if (c.endFrame) c.endFrame();
  }

  /* a ground-plane image (S px a metre) with the iso transform, in one draw */
  function drawFlat(c, k, img, S) {
    const [ox, oy] = toScreen(0, 0);
    c.setTransform(PXM * k / S, PXM * .5 * k / S, -PXM * k / S, PXM * .5 * k / S, ox, oy);
    c.drawImage(img, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------------- ground markers ---------------- */
  function drawSectorLines(G, c, k) {
    const m = G.map, col = s => { const S = m.sectors[s]; return S.owner === 0 ? 'rgba(74,163,255,.75)' : S.owner === 1 ? 'rgba(255,90,74,.75)' : null; };
    c.lineWidth = 2 * k;
    for (const e of R.secEdges) {
      const A = m.sectors[e.a], B = m.sectors[e.b];
      if (A.owner === B.owner) { if (A.owner === -1) continue; if (A.base < 0 && B.base < 0) continue; }
      for (const [s, sgn] of [[e.a, -1], [e.b, 1]]) {
        const cc = col(s); if (!cc) continue;
        const ox = e.nx * .45 * sgn, oy = e.ny * .45 * sgn;
        const [x0, y0] = toScreen(e.x0 + ox, e.y0 + oy), [x1, y1] = toScreen(e.x1 + ox, e.y1 + oy);
        if (x1 < -20 || x0 > R.W + 20 || y0 < -20 || y0 > R.H + 20) continue;
        c.strokeStyle = cc; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      }
    }
    // base boundary: black and white dashes
    c.setLineDash([6 * k, 6 * k]); c.lineWidth = 2.5 * k;
    for (const e of R.secEdges) {
      const A = m.sectors[e.a], B = m.sectors[e.b]; if (A.base < 0 && B.base < 0) continue;
      const [x0, y0] = toScreen(e.x0, e.y0), [x1, y1] = toScreen(e.x1, e.y1);
      if (x1 < -20 || x0 > R.W + 20 || y0 < -20 || y0 > R.H + 20) continue;
      c.strokeStyle = 'rgba(15,15,15,.8)'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.setLineDash([]);
  }
  function drawPoints(G, c, k) {
    for (const p of G.map.points) {
      const [sx, sy] = toScreen(p.x, p.y); if (sx < -200 || sx > R.W + 200 || sy < -200 || sy > R.H + 200) continue;
      const rx = p.radius * 31.1 * k, ry = p.radius * 15.55 * k;
      const col = p.owner === 0 ? TEAM[0] : p.owner === 1 ? TEAM[1] : '#f2f2f2';
      c.lineWidth = 2.5 * k; c.strokeStyle = col; c.setLineDash([14 * k, 6 * k, 3 * k, 6 * k]);
      c.beginPath(); c.ellipse(sx, sy, rx, ry, 0, 0, U.TAU); c.stroke(); c.setLineDash([]);
      // capture progress
      if (p.owner < 0 && p.cap > 0 && p.capSide >= 0) { c.strokeStyle = TEAM[p.capSide]; c.lineWidth = 5 * k; c.beginPath(); c.ellipse(sx, sy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + U.TAU * p.cap); c.stroke(); }
      else if (p.owner >= 0 && p.cap < 1) { c.strokeStyle = TEAM[p.owner]; c.lineWidth = 5 * k; c.beginPath(); c.ellipse(sx, sy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + U.TAU * p.cap); c.stroke(); }
      // pole and type prop
      const [tx, ty] = toScreen(p.x, p.y, 5.5);
      c.strokeStyle = '#d8d8d8'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx, ty); c.stroke();
      const flagH = p.owner >= 0 ? 5.4 : p.cap > 0 ? 1 + 4.4 * p.cap : 0;
      if (flagH > 0) { const fcol = p.owner >= 0 ? TEAM[p.owner] : TEAM[p.capSide]; const [fx, fy] = toScreen(p.x, p.y, flagH); c.fillStyle = fcol; c.fillRect(fx, fy, 16 * k, 10 * k); }
      if (p.type === 'munitions' || p.type === 'fuel') {
        c.drawImage(R.sprites.crate, sx - 22 * k, sy - 14 * k, 24 * k, 22 * k); c.drawImage(R.sprites.crate, sx - 6 * k, sy - 6 * k, 24 * k, 22 * k);
        if (p.type === 'fuel') { c.fillStyle = '#3d5a2c'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(sx + (12 + i * 9) * k, sy - 4 * k, 4 * k, 7 * k, 0, 0, U.TAU); c.fill(); } }
      }
    }
  }

  /* ---------------- scenery ---------------- */
  function drawTree(c, t, k) {
    const [sx, sy] = toScreen(t.x, t.y);
    const key = t.kind === 'olive' ? 'olive_' + (t.seed % 4) : 'cypress_' + (t.seed % 2);
    if (hasProp(key)) {
      const s = k * t.s * (t.kind === 'olive' ? .85 : 1);
      c.fillStyle = 'rgba(20,24,10,.26)'; c.beginPath(); c.ellipse(sx + 14 * s, sy + 5 * s, (t.kind === 'olive' ? 58 : 20) * s, (t.kind === 'olive' ? 26 : 9) * s, 0, 0, U.TAU); c.fill();
      // a crown with men under or behind it is drawn see-through, so they stay visible (as CoH3 fades foliage)
      const fade = t.kind === 'olive' && R.under && R.under.some(p => Math.abs(p.x - t.x) < 4 && Math.abs(p.y - t.y) < 4 && p.x + p.y < t.x + t.y + 1.5);
      if (fade) c.globalAlpha = .5;
      drawProp(c, key, sx, sy, k, 0, null, t.s * (t.kind === 'olive' ? .85 : 1));
      if (fade) c.globalAlpha = 1;
      return;
    }
    const sp = treeSprite(t.kind, t.seed), s = .55 * k * t.s;
    c.fillStyle = 'rgba(20,24,10,.28)'; c.beginPath(); c.ellipse(sx + 10 * s, sy + 3 * s, (t.kind === 'olive' ? 50 : 16) * s, (t.kind === 'olive' ? 22 : 8) * s, 0, 0, U.TAU); c.fill();
    c.drawImage(sp.c, sx - sp.ax * s, sy - sp.ay * s, sp.c.width * s, sp.c.height * s);
  }
  function box(c, x0, y0, x1, y1, z0, z1, top, left, right) {
    const P = (x, y, z) => toScreen(x, y, z);
    // faces seen from the camera: +x side (right) and +y side (left)
    const f = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y, z], i) => { const [sx, sy] = P(x, y, z); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.closePath(); c.fill(); };
    f([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], right);
    f([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], left);
    if (top) f([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top);
  }
  /* a fighting position: the far half before the men in it, the near half after (so its parapet hides their legs);
     drawn faint while it is dug, with the holder's flag on a short pole once someone is in it */
  function drawPit(G, c, h, k, front) {
    const [sx, sy] = toScreen(h.x, h.y), a = h.built < 1 ? .35 + h.built * .45 : 1;
    if (a < 1) c.globalAlpha = a;
    if (!drawProp(c, h.prop, sx, sy, k, h.face, front ? 'front' : null) && !front) {
      c.fillStyle = '#8f8366'; c.beginPath(); c.ellipse(sx, sy, h.w / 2 * 31 * k, h.w / 2 * 15.5 * k, 0, 0, U.TAU); c.fill();
      c.fillStyle = '#2c2822'; c.beginPath(); c.ellipse(sx, sy, h.w / 3 * 31 * k, h.w / 3 * 15.5 * k, 0, 0, U.TAU); c.fill();
    }
    c.globalAlpha = 1;
    if (front && h.occ != null) {
      const o = G.byId.get(h.occ);
      if (o && !o.dead && FOG.shown(G, o)) {
        const bx = h.x - Math.cos(h.face) * h.w * .42, by = h.y - Math.sin(h.face) * h.w * .42;
        const [px, py] = toScreen(bx, by, .6), [qx, qy] = toScreen(bx, by, 2.4);
        c.strokeStyle = '#ddd'; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(px, py); c.lineTo(qx, qy); c.stroke();
        c.fillStyle = TEAM[o.owner]; c.fillRect(qx, qy, 11 * k, 7 * k);
      }
    }
  }
  /* Farmhouses: the artkit sprites (art/scenery/, tools/build_scenery.py) in three stages: intact, 'damaged' under 60%
     health (roof holed, a breach in the end wall; still garrisonable), 'ruined' once collapsed (its rubble outline is the
     cover). Without the art the painted stand-in further down shows (or, without the materials, the flat one below). */
  const houseArt = h => h.art && R.lib[h.art] ? h.art : null;
  const houseState = h => h.dead ? 'ruined' : h.hp / h.maxHp < .6 ? 'damaged' : 'normal';
  function drawHouseFlag(c, h, k, ridge) {
    // occupied: the occupier's flag on the ridge (enemy flags only once the house has been seen)
    if (h.occ == null || !R.G) return;
    const o = R.G.byId.get(h.occ);
    if (o && !o.dead && FOG.shown(R.G, o)) {
      const [px, py] = toScreen(h.x, h.y, ridge), [qx, qy] = toScreen(h.x, h.y, ridge + 3.2);
      c.strokeStyle = '#ddd'; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(px, py); c.lineTo(qx, qy); c.stroke();
      c.fillStyle = TEAM[o.owner]; c.fillRect(qx, qy, 15 * k, 10 * k);
    }
  }
  function drawHouseFlat(c, h, k) {
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = h.y - h.d / 2, y1 = h.y + h.d / 2, H = 4.2;
    const wall = h.wall === 'stone' ? ['#a89c84', '#8d8270'] : ['#d9c9a4', '#b9a884'];
    const [sx, sy] = toScreen(h.x, h.y); c.fillStyle = 'rgba(20,18,10,.3)'; c.beginPath(); c.ellipse(sx + 18 * k, sy + 8 * k, (h.w + h.d) * 17 * k, (h.w + h.d) * 7 * k, 0, 0, U.TAU); c.fill();
    box(c, x0, y0, x1, y1, 0, H, null, wall[1], wall[0]);
    // windows and a door
    const win = (x, y, z, face) => { const P2 = face === 'x' ? [[x, y - .5, z], [x, y + .5, z], [x, y + .5, z + 1.1], [x, y - .5, z + 1.1]] : [[x - .5, y, z], [x + .5, y, z], [x + .5, y, z + 1.1], [x - .5, y, z + 1.1]]; c.beginPath(); P2.forEach(([a, b, zz], i) => { const [px, py] = toScreen(a, b, zz); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); c.fill(); };
    c.fillStyle = '#3c3428';
    for (let y = y0 + 1.6; y < y1 - .8; y += 2.6) win(x1 + .01, y, 2.2, 'x');
    for (let x = x0 + 1.6; x < x1 - .8; x += 2.6) win(x, y1 + .01, 2.2, 'y');
    // battle damage: scorched walls below 60%, a broken roof below 30%
    const hf = h.hp / h.maxHp;
    if (hf < .6) { c.fillStyle = `rgba(30,24,18,${(.6 - hf) * .9})`; const P2 = [[x1 + .02, y0, 0], [x1 + .02, y1, 0], [x1 + .02, y1, H], [x1 + .02, y0, H]]; c.beginPath(); P2.forEach(([a, b, z], i) => { const [px, py] = toScreen(a, b, z); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); c.fill(); const P3 = [[x0, y1 + .02, 0], [x1, y1 + .02, 0], [x1, y1 + .02, H], [x0, y1 + .02, H]]; c.beginPath(); P3.forEach(([a, b, z], i) => { const [px, py] = toScreen(a, b, z); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); c.fill(); }
    // gable roof along the long side
    const roof = h.roof === 'slate' ? ['#6f6a66', '#57524e', '#807a75'] : ['#b5643c', '#934c2c', '#c87850'];
    if (hf < .3) { roof[0] = '#3a2c22'; roof[2] = '#4a382a'; }
    const along = h.w >= h.d, ridge = H + 2.2;
    const P = (x, y, z) => toScreen(x, y, z);
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y, z], i) => { const [a, b] = P(x, y, z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.closePath(); c.fill(); };
    if (along) {
      poly([[x1 + .3, y0 - .3, H], [x1 + .3, y1 + .3, H], [x1 + .3, h.y, ridge]], wall[0]);
      poly([[x0 - .3, h.y, ridge], [x1 + .3, h.y, ridge], [x1 + .3, y1 + .3, H], [x0 - .3, y1 + .3, H]], roof[0]);
      poly([[x0 - .3, y0 - .3, H], [x1 + .3, y0 - .3, H], [x1 + .3, h.y, ridge], [x0 - .3, h.y, ridge]], roof[2]);
    } else {
      poly([[x0 - .3, y1 + .3, H], [x1 + .3, y1 + .3, H], [h.x, y1 + .3, ridge]], wall[1]);
      poly([[h.x, y0 - .3, ridge], [h.x, y1 + .3, ridge], [x1 + .3, y1 + .3, H], [x1 + .3, y0 - .3, H]], roof[2]);
      poly([[x0 - .3, y0 - .3, H], [h.x, y0 - .3, ridge], [h.x, y1 + .3, ridge], [x0 - .3, y1 + .3, H]], roof[0]);
    }
    drawHouseFlag(c, h, k, ridge);
  }
  /* ---- farmhouses, painted: stucco or stone walls with dressed quoins or a plinth, shuttered windows, a plank door,
     terracotta or slate roofs; scorching and roof holes as the house is ground down. Each house is painted once into
     its own face atlas (repainted when its damage stage changes) and drawn as flat faces through the iso map. */
  const HOUSE_H = 4.2, RIDGE = 2.2;
  function houseFaces(h) {
    const along = h.w >= h.d, L = along ? h.w : h.d, D = along ? h.d : h.w, sl = Math.hypot(D / 2 + .3, RIDGE);
    return { along, L, D, sl, faces: [{ w: h.d, h: HOUSE_H }, { w: h.w, h: HOUSE_H }, { w: D + .6, h: RIDGE }, { w: L + .6, h: sl }, { w: L + .6, h: sl }] };
  }
  function houseStage(h) { const hf = h.hp / h.maxHp; return hf >= .6 ? 0 : Math.min(7, 1 + Math.floor((.6 - hf) * 12)); }
  function paintHouse(h, art) {
    const F = art.F, A = art.A, g = A.c.getContext('2d'), M = FPM, r = U.rng(h.id * 31 + 7), hf = h.hp / h.maxHp;
    const stone = h.wall === 'stone', wallMat = stone ? 'wall_stone' : 'wall_stucco';
    const shutterTint = ['#6f7d5c', '#7d6650', '#8c8a78', '#5f6f6a'][h.id % 4];
    g.clearRect(0, 0, A.c.width, A.c.height);
    const scorch = (rc, amt, n) => {                 // charred blotches over a face
      if (amt <= 0 || !R.mats.charred) return;
      const t = canvas(rc.w, rc.h), tg = t.getContext('2d');
      for (let i = 0; i < n; i++) {
        const x = r() * rc.w, y = rc.h * (.2 + r() * .9), rr = (1.2 + r() * 2.2) * M, gr = tg.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); tg.fillStyle = gr; tg.fillRect(0, 0, rc.w, rc.h);
      }
      tg.globalCompositeOperation = 'source-in'; tg.beginPath(); tg.rect(0, 0, rc.w, rc.h); matFill(tg, 'charred', M);
      g.globalAlpha = Math.min(.9, amt); g.drawImage(t, rc.x, rc.y); g.globalAlpha = 1;
    };
    const rect = (x, y, w, hh) => { g.beginPath(); g.rect(x, y, w, hh); };
    // one wall face: Lu metres long, windows every 2.6 m on the upper floor, a door on the long front
    const wall = (rc, Lu, shade, door) => {
      g.save(); g.translate(rc.x, rc.y); rect(0, 0, rc.w, rc.h); g.clip();
      g.beginPath(); g.rect(0, 0, rc.w, rc.h); if (!matFill(g, wallMat, M)) { g.fillStyle = stone ? '#a89c84' : '#d9c9a4'; g.fill(); }
      // stucco: a dressed-stone plinth; stone: dressed quoins up both corners
      if (stone) for (let z = 0, i = 0; z < HOUSE_H; z += .42, i++) for (const x0 of [0, Lu - (i % 2 ? .45 : .7)]) { rect(x0 * M, (HOUSE_H - z - .42) * M, (i % 2 ? .45 : .7) * M, .42 * M); matFill(g, 'stone_dressed', M, 0, (i % 3) * 7); g.strokeStyle = 'rgba(60,50,38,.35)'; g.lineWidth = 1; g.stroke(); }
      else { rect(0, (HOUSE_H - .45) * M, Lu * M, .45 * M); matFill(g, 'stone_dressed', M); g.fillStyle = 'rgba(40,32,22,.25)'; g.fillRect(0, (HOUSE_H - .47) * M, Lu * M, 2); }
      // windows: dark opening, stone sill, a shutter each side
      for (let u = 1.6; u < Lu - .8; u += 2.6) {
        const x = (u - .5) * M, y = (HOUSE_H - 3.3) * M, w = M, hh = 1.1 * M;
        g.fillStyle = hf < .6 ? '#1c1712' : '#2e281f'; g.fillRect(x, y, w, hh);
        g.fillStyle = 'rgba(150,140,120,.35)'; g.fillRect(x + w / 2 - 1, y, 2, hh); g.fillRect(x, y + hh * .45, w, 2);
        rect(x - 3, y + hh, w + 6, .14 * M); matFill(g, 'stone_dressed', M);
        for (const sx of [x - .5 * M, x + w]) {
          if (hf < .3 && r() < .5) continue;               // blown off
          rect(sx, y, .5 * M, hh); if (matFill(g, 'shutter', M)) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = shutterTint; g.fill(); g.restore(); } else { g.fillStyle = shutterTint; g.fill(); }
          g.strokeStyle = 'rgba(30,26,20,.5)'; g.lineWidth = 1; g.strokeRect(sx + .5, y + .5, .5 * M - 1, hh - 1);
        }
      }
      if (door) {
        const x = (Lu / 2 - .6) * M, y = (HOUSE_H - 2.1) * M;
        g.fillStyle = 'rgba(60,50,38,.6)'; g.fillRect(x - 3, y - 3, 1.2 * M + 6, 2.1 * M + 3);
        rect(x, y, 1.2 * M, 2.1 * M); if (!matFill(g, 'timber', M)) { g.fillStyle = '#5a4430'; g.fill(); }
        g.fillStyle = 'rgba(20,16,10,.5)'; g.fillRect(x + .6 * M - 1, y, 2, 2.1 * M);
      }
      // light: shade the face turned from the sun, darken under the eaves and at the foot
      if (shade) { g.fillStyle = `rgba(20,16,10,${shade})`; g.fillRect(0, 0, rc.w, rc.h); }
      let gr = g.createLinearGradient(0, 0, 0, .6 * M); gr.addColorStop(0, 'rgba(20,14,8,.35)'); gr.addColorStop(1, 'rgba(20,14,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, rc.w, .6 * M);
      gr = g.createLinearGradient(0, rc.h - .7 * M, 0, rc.h); gr.addColorStop(0, 'rgba(30,24,14,0)'); gr.addColorStop(1, 'rgba(30,24,14,.3)'); g.fillStyle = gr; g.fillRect(0, rc.h - .7 * M, rc.w, .7 * M);
      g.restore();
      scorch(rc, (.6 - hf) * 2.8, 3 + Math.round(Lu / 3));
    };
    wall(A.r[0], h.d, 0, !F.along);
    wall(A.r[1], h.w, .2, F.along);
    // gable: the wall material in a triangle
    { const rc = A.r[2], W = rc.w, Hh = rc.h; g.save(); g.translate(rc.x, rc.y); g.beginPath(); g.moveTo(0, Hh); g.lineTo(W, Hh); g.lineTo(W / 2, 0); g.closePath();
      if (!matFill(g, wallMat, M)) { g.fillStyle = stone ? '#a89c84' : '#d9c9a4'; g.fill(); }
      g.fillStyle = `rgba(20,16,10,${F.along ? 0 : .2})`; g.fill();
      g.globalCompositeOperation = 'source-atop'; const gr = g.createLinearGradient(0, Hh - .5 * M, 0, Hh); gr.addColorStop(0, 'rgba(20,14,8,0)'); gr.addColorStop(1, 'rgba(20,14,8,.3)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
      g.restore(); }
    // roof slopes: terracotta (or slate) courses along the ridge, a ridge cap, a dark eave line
    const roof = (rc, shade) => {
      g.save(); g.translate(rc.x, rc.y); rect(0, 0, rc.w, rc.h); g.clip();
      g.beginPath(); g.rect(0, 0, rc.w, rc.h);
      if (matFill(g, 'roof_tile', M)) { if (h.roof === 'slate') { g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fill(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#8e8e96'; g.fill(); g.globalCompositeOperation = 'source-over'; } }
      else { g.fillStyle = h.roof === 'slate' ? '#6f6a66' : '#b5643c'; g.fill(); }
      g.fillStyle = 'rgba(70,40,24,.55)'; g.fillRect(0, 0, rc.w, .22 * M); g.fillStyle = 'rgba(255,230,200,.12)'; g.fillRect(0, .22 * M, rc.w, 2);
      g.fillStyle = 'rgba(20,12,6,.55)'; g.fillRect(0, rc.h - 3, rc.w, 3);
      if (shade) { g.fillStyle = `rgba(20,14,8,${shade})`; g.fillRect(0, 0, rc.w, rc.h); }
      if (hf < .3) {                                       // holes: the rafters show through
        for (let i = 0, n = 1 + Math.floor((.3 - hf) * 10); i < n; i++) {
          const cx = (.15 + r() * .7) * rc.w, cy = (.25 + r() * .55) * rc.h, rx = (.9 + r() * 1.1) * M, ry = (.6 + r() * .8) * M;
          g.beginPath(); for (let j = 0; j < 9; j++) { const a = j / 9 * U.TAU, q = .7 + r() * .45; g.lineTo(cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q); } g.closePath();
          g.fillStyle = '#16110c'; g.fill(); g.save(); g.clip();
          for (let x = cx - rx; x < cx + rx; x += .6 * M) { g.beginPath(); g.rect(x, 0, .14 * M, rc.h); if (!matFill(g, 'timber', M)) { g.fillStyle = '#4a3828'; g.fill(); } }
          g.restore();
        }
      }
      g.restore();
      scorch(rc, hf < .6 ? (.6 - hf) * 1.4 : 0, 3);
    };
    roof(A.r[3], F.along ? .14 : 0);
    roof(A.r[4], F.along ? 0 : .14);
    A.c._gv = (A.c._gv | 0) + 1;
  }
  function paintedHouse(h) {
    const st = houseStage(h); let art = R.mem.get(h);
    if (!art || !art.A) { const F = houseFaces(h); art = { F, A: atlas(F.faces), st: -1 }; R.mem.set(h, art); }
    if (art.st !== st) { art.st = st; paintHouse(h, art); }
    return art;
  }
  function drawHouse(c, h, k) {
    const art = houseArt(h);
    if (art) {
      const [nx, ny] = toScreen(h.x + h.w / 2, h.y + h.d / 2);      // the footprint's near corner, where artkit anchors a still
      ArtKit.drawStatic(c, R.lib, art, houseState(h), nx, ny, k);
      if (!h.dead) drawHouseFlag(c, h, k, 6.4);
      return;
    }
    if (!R.mats.wall_stucco || !R.mats.roof_tile) return drawHouseFlat(c, h, k);
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = h.y - h.d / 2, y1 = h.y + h.d / 2, H = HOUSE_H, ridge = H + RIDGE;
    const [sx, sy] = toScreen(h.x, h.y); c.fillStyle = 'rgba(20,18,10,.3)'; c.beginPath(); c.ellipse(sx + 18 * k, sy + 8 * k, (h.w + h.d) * 17 * k, (h.w + h.d) * 7 * k, 0, 0, U.TAU); c.fill();
    const { F, A } = paintedHouse(h), down = [0, 0, -1], s = F.sl, rz = -RIDGE / s;
    drawFace(c, A, A.r[0], [x1, y0, H], [0, 1, 0], down);
    drawFace(c, A, A.r[1], [x0, y1, H], [1, 0, 0], down);
    if (F.along) {
      const dy = (h.d / 2 + .3) / s;
      drawFace(c, A, A.r[2], [x1 + .3, y0 - .3, ridge], [0, 1, 0], down);
      drawFace(c, A, A.r[3], [x0 - .3, h.y, ridge], [1, 0, 0], [0, dy, rz]);
      drawFace(c, A, A.r[4], [x0 - .3, h.y, ridge], [1, 0, 0], [0, -dy, rz]);
    } else {
      const dx = (h.w / 2 + .3) / s;
      drawFace(c, A, A.r[2], [x0 - .3, y1 + .3, ridge], [1, 0, 0], down);
      drawFace(c, A, A.r[4], [h.x, y0 - .3, ridge], [0, 1, 0], [dx, 0, rz]);
      drawFace(c, A, A.r[3], [h.x, y0 - .3, ridge], [0, 1, 0], [-dx, 0, rz]);
    }
    // occupied: the occupier's flag on the ridge (enemy flags only once the house has been seen)
    drawHouseFlag(c, h, k, ridge);
  }
  /* Cover drawn from prop art, a piece at a time, each piece sorted by its own depth so a man behind a long wall is
     hidden by the bit in front of him and not by the whole line. Returns false when there is no art for this kind. */
  function coverKey(G, cv) {
    if (cv.kind === 'wire') { const side = cv.owner >= 0 && G.players[cv.owner] ? G.players[cv.owner].side : 'us'; return 'wire_' + side; }
    return { sandbags: 'sandbags', wall: 'wall', hedge: 'hedge', tanktrap: 'tanktrap_0' }[cv.kind] || null;
  }
  function coverPieces(G, c, cv, k, list) {
    const key = coverKey(G, cv); if (!key || !hasProp(key)) return false;
    const L = Math.hypot(cv.bx - cv.ax, cv.by - cv.ay), ang = Math.atan2(cv.by - cv.ay, cv.bx - cv.ax);
    const alpha = cv.built < 1 ? .35 + cv.built * .4 : 1;
    if (cv.kind === 'tanktrap') {                         // free-standing hedgehogs, about one per 2 m
      const n = Math.max(1, Math.round(L / 2));
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n, x = cv.ax + (cv.bx - cv.ax) * t, y = cv.ay + (cv.by - cv.ay) * t, v = 'tanktrap_' + ((cv.id * 7 + i) % 3);
        list.push({ d: x + y, f: () => { const [sx, sy] = toScreen(x, y); if (alpha < 1) c.globalAlpha = alpha; drawProp(c, v, sx, sy, k, 0); c.globalAlpha = 1; } });
      }
      return true;
    }
    const P = R.props[key], n = Math.max(1, Math.round(L / P.len));
    const fi = ((Math.round((ang * 180 / Math.PI) / P.span * P.headings) % P.headings) + P.headings) % P.headings;
    // the pieces are cut for a line running along the frame's +x from 'first' to 'last'; when the frame shown points
    // the other way along this line (the same picture turned 180 degrees), the ends swap
    const flip = Math.cos(ang - fi * P.span / P.headings * Math.PI / 180) < 0;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, x = cv.ax + (cv.bx - cv.ax) * t, y = cv.ay + (cv.by - cv.ay) * t;
      const end = n === 1 ? 'solo' : i === 0 ? 'first' : i === n - 1 ? 'last' : null;
      const e2 = end === 'first' && flip ? 'last' : end === 'last' && flip ? 'first' : end;
      const kk = cv.kind === 'hedge' && (i + cv.id) % 2 ? 'hedge_b' : key;
      list.push({ d: x + y, f: () => { const [sx, sy] = toScreen(x, y); if (alpha < 1) c.globalAlpha = alpha; drawProp(c, kk, sx, sy, k, ang, e2); c.globalAlpha = 1; } });
    }
    return true;
  }
  function drawCover(c, cv, k) {
    const L = Math.hypot(cv.bx - cv.ax, cv.by - cv.ay);
    const a = cv.built < 1 ? .35 + cv.built * .4 : 1;
    if (a < 1) c.globalAlpha = a;
    if (cv.kind === 'sandbags' || cv.kind === 'wall') {
      const sp = cv.kind === 'wall' ? R.sprites.stone : R.sprites.bag, step = cv.kind === 'wall' ? .9 : .65, rows = cv.kind === 'wall' ? 2 : 2;
      const n = Math.max(1, Math.round(L / step));
      for (let r = 0; r < rows; r++) for (let i = 0; i <= n; i++) {
        if (r && i === n) continue;
        const t = (i + (r ? .5 : 0)) / n, x = cv.ax + (cv.bx - cv.ax) * t, y = cv.ay + (cv.by - cv.ay) * t;
        const [sx, sy] = toScreen(x, y, r * .35 + .05), s = k * (cv.kind === 'wall' ? .85 : .8);
        c.drawImage(sp, sx - 12 * s, sy - 9 * s, 24 * s, (cv.kind === 'wall' ? 16 : 14) * s);
      }
    } else if (cv.kind === 'hedge') {
      const n = Math.max(1, Math.round(L / 1.1));
      for (let i = 0; i <= n; i++) { const t = i / n, [sx, sy] = toScreen(cv.ax + (cv.bx - cv.ax) * t, cv.ay + (cv.by - cv.ay) * t); c.drawImage(R.sprites.hedge, sx - 18 * k, sy - 26 * k, 36 * k, 30 * k); }
    } else if (cv.kind === 'tanktrap') {
      const n = Math.max(1, Math.round(L / 1.6));
      for (let i = 0; i <= n; i++) { const t = i / n, [sx, sy] = toScreen(cv.ax + (cv.bx - cv.ax) * t, cv.ay + (cv.by - cv.ay) * t); c.drawImage(R.sprites.trap, sx - 15 * k, sy - 24 * k, 30 * k, 30 * k); }
    } else if (cv.kind === 'wire') {
      c.strokeStyle = 'rgba(70,64,56,.9)'; c.lineWidth = 1.2 * k;
      const n = Math.max(2, Math.round(L / .5));
      c.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n, [sx, sy] = toScreen(cv.ax + (cv.bx - cv.ax) * t, cv.ay + (cv.by - cv.ay) * t, .45 + Math.sin(i * 2.1) * .25); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }
      c.stroke();
      for (let i = 0; i <= n; i += 3) { const t = i / n, [sx, sy] = toScreen(cv.ax + (cv.bx - cv.ax) * t, cv.ay + (cv.by - cv.ay) * t), [tx, ty] = toScreen(cv.ax + (cv.bx - cv.ax) * t, cv.ay + (cv.by - cv.ay) * t, 1); c.strokeStyle = '#5a4a32'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx, ty); c.stroke(); }
    } else if (cv.kind === 'rubble') {
      const hs = cv.house != null && R.G && R.G.map.houses[cv.house];
      if (hs && houseArt(hs)) { if (a < 1) c.globalAlpha = 1; return; }   // a collapsed farmhouse: its ruin sprite shows the rubble
      const n = Math.max(1, Math.round(L / .7)), r = U.rng(cv.id * 7 + 3);
      for (let i = 0; i <= n; i++) { const t = i / n, j = r() - .5, [sx, sy] = toScreen(cv.ax + (cv.bx - cv.ax) * t + j * .5, cv.ay + (cv.by - cv.ay) * t - j * .5, r() * .5); const s2 = k * (.7 + r() * .5); c.globalAlpha = .9; c.drawImage(R.sprites.rubble || R.sprites.stone, sx - 12 * s2, sy - 9 * s2, 24 * s2, 16 * s2); }
      c.globalAlpha = 1;
    } else if (cv.kind === 'wreck') { /* drawn with its wreck */ }
    if (a < 1) c.globalAlpha = 1;
  }

  /* ---------------- player buildings: stand-ins until the buildings are modelled ---------------- */
  /* player buildings' walls, painted: plank huts tinted to the side's colour; the HQ faced with field stone */
  function buildingWalls(c, b, side, x0, y0, x1, y1, H, wallCol) {
    if (!R.mats.planks) return false;
    let art = R.mem.get(b);
    const key = side + ':' + b.w + ':' + b.d + ':' + H;
    if (!art || art.key !== key) {
      const A = atlas([{ w: b.d, h: H }, { w: b.w, h: H }]), g = A.c.getContext('2d'), mat = b.def.retreat ? 'field_wall' : 'planks';
      [[A.r[0], wallCol[1], 0], [A.r[1], wallCol[0], .18]].forEach(([rc, col, shade]) => {
        g.save(); g.translate(rc.x, rc.y); g.beginPath(); g.rect(0, 0, rc.w, rc.h); matFill(g, mat, FPM);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = col; g.fill(); g.globalCompositeOperation = 'source-over';
        g.globalAlpha = .55; g.fillStyle = col; g.fill(); g.globalAlpha = 1;          // keep the side colour readable
        if (shade) { g.fillStyle = `rgba(20,16,10,${shade})`; g.fill(); }
        const gr = g.createLinearGradient(0, rc.h - .6 * FPM, 0, rc.h); gr.addColorStop(0, 'rgba(20,14,8,0)'); gr.addColorStop(1, 'rgba(20,14,8,.3)'); g.fillStyle = gr; g.fillRect(0, 0, rc.w, rc.h);
        g.restore();
      });
      A.c._gv = 1; art = { key, A }; R.mem.set(b, art);
    }
    drawFace(c, art.A, art.A.r[0], [x1, y0, H], [0, 1, 0], [0, 0, -1]);
    drawFace(c, art.A, art.A.r[1], [x0, y1, H], [1, 0, 0], [0, 0, -1]);
    return true;
  }
  function drawBuilding(G, c, b, k, ui) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, y0 = b.y - b.d / 2, y1 = b.y + b.d / 2, side = G.players[b.owner].side;
    const H = (b.def.retreat ? 3.2 : 4.6) * Math.max(.08, b.built);
    const [sx, sy] = toScreen(b.x, b.y);
    c.fillStyle = 'rgba(15,15,10,.3)'; c.beginPath(); c.ellipse(sx + 20 * k, sy + 8 * k, (b.w + b.d) * 17 * k, (b.w + b.d) * 7 * k, 0, 0, U.TAU); c.fill();
    if (b.built < 1) {
      // scaffold: posts and rails rising with progress
      c.strokeStyle = '#8b6e45'; c.lineWidth = 2 * k;
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { const [a1, b1] = toScreen(x, y), [a2, b2] = toScreen(x, y, 5); c.beginPath(); c.moveTo(a1, b1); c.lineTo(a2, b2); c.stroke(); }
      box(c, x0 + .4, y0 + .4, x1 - .4, y1 - .4, 0, H, null, side === 'us' ? '#6d6a55' : '#6a6458', side === 'us' ? '#86826a' : '#827b6c');
      for (let z = 1.5; z < 5; z += 1.5) { c.beginPath(); [[x0, y1], [x1, y1], [x1, y0]].forEach(([x, y], i) => { const [a2, b2] = toScreen(x, y, z); i ? c.lineTo(a2, b2) : c.moveTo(a2, b2); }); c.stroke(); }
      return;
    }
    const wall = side === 'us' ? ['#7c7a5e', '#94916f'] : ['#77705f', '#90897a'];
    if (b.def.retreat) {
      // HQ: dug-in command post, low and armoured, sandbags and a radio mast (reference board 08, item 9)
      box(c, x0, y0, x1, y1, 0, H, side === 'us' ? '#6a6c52' : '#5f5a4a', wall[0], wall[1]); buildingWalls(c, b, side, x0, y0, x1, y1, H, wall);
      box(c, b.x - 2.5, b.y - 2, b.x + 1.5, b.y + 2, H, H + .9, side === 'us' ? '#58593f' : '#4f4b3c', wall[0], wall[1]);
      for (let x = x0 + .6; x <= x1; x += .65) { const [px, py] = toScreen(x, y1 + .5, .25); c.drawImage(R.sprites.bag, px - 10 * k, py - 7 * k, 20 * k, 12 * k); }
      for (let y = y0 + .6; y <= y1; y += .65) { const [px, py] = toScreen(x1 + .5, y, .25); c.drawImage(R.sprites.bag, px - 10 * k, py - 7 * k, 20 * k, 12 * k); }
      const [m0x, m0y] = toScreen(x0 + 2, y0 + 2, H), [m1x, m1y] = toScreen(x0 + 2, y0 + 2, H + 7);
      c.strokeStyle = '#333'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(m0x, m0y); c.lineTo(m1x, m1y); c.stroke();
      c.fillStyle = '#555'; c.beginPath(); c.ellipse(m1x, m1y + 6 * k, 9 * k, 5 * k, -.4, 0, U.TAU); c.fill();
    } else {
      if (!buildingWalls(c, b, side, x0, y0, x1, y1, H, wall)) box(c, x0, y0, x1, y1, 0, H, null, wall[0], wall[1]);
      const roof = side === 'us' ? ['#58603e', '#6b7449'] : ['#5b5145', '#6e6253'];
      // corrugated barrel roof
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI, a1 = (i + 1) / n * Math.PI, rr = b.d / 2;
        const pts = [[x0, b.y - Math.cos(a0) * rr, H + Math.sin(a0) * 2.2], [x1, b.y - Math.cos(a0) * rr, H + Math.sin(a0) * 2.2], [x1, b.y - Math.cos(a1) * rr, H + Math.sin(a1) * 2.2], [x0, b.y - Math.cos(a1) * rr, H + Math.sin(a1) * 2.2]];
        c.fillStyle = i < n / 2 ? roof[0] : roof[1];
        c.beginPath(); pts.forEach(([x, y, z], j) => { const [a, bb] = toScreen(x, y, z); j ? c.lineTo(a, bb) : c.moveTo(a, bb); }); c.closePath(); c.fill();
      }
      // big door on the +y face
      c.fillStyle = '#2f2b22'; c.beginPath(); [[b.x - 2, y1 + .02, 0], [b.x + 2, y1 + .02, 0], [b.x + 2, y1 + .02, 3.4], [b.x - 2, y1 + .02, 3.4]].forEach(([x, y, z], i) => { const [a, bb] = toScreen(x, y, z); i ? c.lineTo(a, bb) : c.moveTo(a, bb); }); c.closePath(); c.fill();
    }
    // team colour pennant
    const [px, py] = toScreen(x1, y1, H + .2), [qx, qy] = toScreen(x1, y1, H + 4);
    c.strokeStyle = '#ddd'; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(px, py); c.lineTo(qx, qy); c.stroke();
    c.fillStyle = TEAM[b.owner]; c.fillRect(qx, qy, 14 * k, 9 * k);
  }

  /* ---------------- units ---------------- */
  const FULL = new Set(['rifleman', 'leader', 'lmg', 'sapper', 'flamethrower', 'sniper', 'assault_trooper', 'rocket_gunner']);
  function memOf(obj) { let m = R.mem.get(obj); if (!m) R.mem.set(obj, m = {}); return m; }
  function drawSquadParts(G, sq, k, list, shadows) {
    const pitH = sq.garrison != null && G.map.houses[sq.garrison] && G.map.houses[sq.garrison].pit ? G.map.houses[sq.garrison] : null;
    if (sq.garrison != null && !pitH) return;   // inside a house: the house shows the flag, muzzle flashes show at the windows
    const sink = pitH ? -.45 : 0;               // in a fighting position the men stand in the dug pit
    const side = G.players[sq.owner].side, alive = sq.models.filter(m => m.alive);
    const deployed = sq.crew && sq.crew.state !== 'packed';
    const lay = deployed ? G.layout && G.layout.weapons[side + '_' + sq.def.crewWeapon] : null;
    // weapon sprite
    if (sq.crew) {
      const cw = sq.def.crewWeapon;
      if (deployed) {
        const key = (sq.weaponSide || side) + '_' + cw, deg = sq.crew.heading * 180 / Math.PI, fireAge = G.t - (sq.cwFireT || -9);
        const clip = fireAge < .5 && R.lib[key] && R.lib[key].m.clips.fire ? 'fire' : 'idle';
        const fr = clip === 'fire' ? Math.min(R.lib[key].m.clips.fire.frames - 1, Math.floor(fireAge * R.lib[key].m.clips.fire.fps)) : 0;
        const [sx, sy] = toScreen(sq.crew.x, sq.crew.y, sink);
        if (!pitH) shadows.push(() => ArtKit.drawUnitShadow(R.ctx, R.lib, key, { clip, frame: fr, heading: deg }, sx, sy, k));
        list.push({ d: sq.crew.x + sq.crew.y, f: () => ArtKit.drawUnit(R.ctx, R.lib, key, { clip, frame: fr, heading: deg }, sx, sy, k) });
      } else if (sq.def.towed && alive.length) {
        // limbered gun pushed by the first two men
        const a = alive[0], b2 = alive[1] || alive[0], mx = (a.x + b2.x) / 2, my = (a.y + b2.y) / 2, h = sq.heading;
        const gx = mx + Math.cos(h) * 2.4, gy = my + Math.sin(h) * 2.4, key = (sq.weaponSide || side) + '_' + cw + '_limbered', deg = h * 180 / Math.PI;
        const mem = memOf(sq); mem.gd = (mem.gd || 0) + Math.hypot(gx - (mem.gx || gx), gy - (mem.gy || gy)); mem.gx = gx; mem.gy = gy;
        const lib = R.lib[key], fr = lib ? ArtKit.frameOf(lib.m, sq.moving ? 'move' : 'idle', G.t, mem.gd * PXM * k, k) : 0;
        const [sx, sy] = toScreen(gx, gy);
        shadows.push(() => ArtKit.drawUnitShadow(R.ctx, R.lib, key, { clip: sq.moving ? 'move' : 'idle', frame: fr, heading: deg }, sx, sy, k));
        list.push({ d: gx + gy, f: () => ArtKit.drawUnit(R.ctx, R.lib, key, { clip: sq.moving ? 'move' : 'idle', frame: fr, heading: deg }, sx, sy, k) });
      }
    }
    alive.forEach((m, idx) => {
      let key = side + '_' + m.sprite, crewUnit = null, rel = 0;
      if (deployed) {
        const slot = SIM.crewSlot(G, sq, idx); crewUnit = slot.unit; rel = slot.rel;
        key = crewUnit ? crewUnit : side + '_rifleman';
      } else if (sq.crew && sq.def.towed && idx < 2) key = side + '_pusher';
      const hop = m.vaultT > 0 ? Math.sin(Math.PI * (1 - m.vaultT / .6)) * .7 : 0;   // the vault: a short hop
      const [sx, sy] = toScreen(m.x, m.y, hop + sink);
      const lib = R.lib[key]; if (!lib) return;
      const mem = memOf(m);
      const full = FULL.has(key.slice(3));
      let pose = null, s = null;
      const aim = deployed && crewUnit ? sq.crew.heading + rel * Math.PI / 180 : (m.since < 3 ? m.aim : m.heading);
      if (full) pose = UnitKit.troopPose(lib, mem, { x: m.x * PXM * k, y: m.y * PXM * k, aim, t: G.t, since: m.since, inside: false, id: m.i + sq.id }, k);
      else {
        const moving = m.vx > .4, clips = lib.m.clips;
        mem.d = (mem.d || 0) + (moving && mem.lx != null ? Math.min(2, Math.hypot(m.x - mem.lx, m.y - mem.ly)) : 0); mem.lx = m.x; mem.ly = m.y;
        let clip = moving && clips.walk ? 'walk' : 'idle';
        if (deployed && m.since < .6 && clips.fire) clip = 'fire';
        const fr = clip === 'walk' ? ArtKit.frameOf(lib.m, 'walk', G.t, mem.d * PXM * k, k) : clip === 'fire' ? Math.min(clips.fire.frames - 1, Math.floor(m.since * clips.fire.fps)) : ArtKit.frameOf(lib.m, 'idle', G.t + m.i * .37, null, k);
        s = { clip, frame: fr, heading: (deployed ? aim : m.heading) * 180 / Math.PI };
      }
      if (!pitH) shadows.push(() => { if (pose) ArtKit.drawUnitShadow(R.ctx, R.lib, key, { clip: pose.lc, frame: pose.lf, heading: aimDeg(lib, pose.lh) }, sx, sy, k); else ArtKit.drawUnitShadow(R.ctx, R.lib, key, s, sx, sy, k); });
      list.push({ d: m.x + m.y, f: () => { if (pose) UnitKit.drawFig(R.ctx, lib, pose, sx, sy, k); else ArtKit.drawUnit(R.ctx, R.lib, key, s, sx, sy, k); } });
    });
  }
  const aimDeg = (lib, h) => lib.m.heading_world_deg[h];
  function vehClip(G, v) { const lib = R.lib[v.def.art]; if (!lib) return null; const fireAge = v.fireT; const firing = fireAge < .45 && lib.m.clips.fire; return { lib, firing, fireAge }; }
  function vehDraw(G, v, k, shadowOnly) {
    const info = vehClip(G, v); if (!info) return;
    const { lib, firing, fireAge } = info, key = v.def.art, mem = memOf(v);
    const moving = v.speed > .2;
    const lower = moving ? 'move' : 'idle', lf = moving ? ArtKit.frameOf(lib.m, 'move', G.t, v.dist * PXM * k, k) : 0;
    const uc = firing ? 'fire' : lower, uf = firing ? Math.min(lib.m.clips.fire.frames - 1, Math.floor(fireAge * lib.m.clips.fire.fps)) : lf;
    const s = { clip: firing && !lib.m.layers.L ? 'fire' : lower, frame: firing && !lib.m.layers.L ? uf : lf, heading: v.heading * 180 / Math.PI, upperClip: uc, upperFrame: uf, upperHeading: v.turret * 180 / Math.PI };
    const [sx, sy] = toScreen(v.x, v.y);
    if (shadowOnly) ArtKit.drawUnitShadow(R.ctx, R.lib, key, s, sx, sy, k);
    else ArtKit.drawUnit(R.ctx, R.lib, key, s, sx, sy, k);
  }
  function drawVehicle(G, c, v, k) { vehDraw(G, v, k, false); }
  function drawVehicleShadow(G, c, v, k) { vehDraw(G, v, k, true); }
  function drawWreck(G, c, w, k) {
    const key = w.art, lib = R.lib[key]; if (!lib) return;
    const [sx, sy] = toScreen(w.x, w.y), s = { clip: 'idle', frame: 0, heading: w.heading * 180 / Math.PI, upperHeading: w.turret * 180 / Math.PI };
    ArtKit.drawUnit(c, R.lib, key, s, sx, sy, k);
    c.globalCompositeOperation = 'multiply'; ArtKit.drawUnit(c, R.lib, key, s, sx, sy, k); ArtKit.drawUnit(c, R.lib, key, s, sx, sy, k); c.globalCompositeOperation = 'source-over';
    // smoke
    const age = G.t - w.t;
    if (age < 60) for (let i = 0; i < 4; i++) {
      const tt = ((G.t * .35 + i * .25) % 1), [px, py] = toScreen(w.x + tt * 2, w.y - tt, 1.5 + tt * 7);
      c.fillStyle = `rgba(50,48,44,${.35 * (1 - tt) * (1 - age / 60)})`; c.beginPath(); c.arc(px, py, (8 + tt * 26) * k, 0, U.TAU); c.fill();
    }
  }
  /* smoke clouds: overlapping soft puffs that drift a little and swell with the cloud */
  function drawSmoke(G, c, k) {
    for (const sm of G.map.smokes || []) {
      if (sm.r < .3) continue;
      const r = U.rng((sm.t0 * 1000) | 0), age = G.t - sm.t0;
      for (let i = 0; i < 14; i++) {
        const a = r() * U.TAU, d = Math.sqrt(r()) * sm.r * .75, z = .6 + r() * 2.4 + age * .03, drift = age * .08;
        const [sx, sy] = toScreen(sm.x + Math.cos(a) * d + drift, sm.y + Math.sin(a) * d - drift, z);
        const pr = (sm.r * .45 + r() * sm.r * .25) * 22 * k;
        c.fillStyle = `rgba(${200 + (i % 3) * 10},${200 + (i % 3) * 10},${195 + (i % 3) * 10},${.16 + .1 * (sm.r / sm.R)})`;
        c.beginPath(); c.ellipse(sx, sy, pr, pr * .7, 0, 0, U.TAU); c.fill();
      }
    }
  }
  /* an abandoned team weapon (its own sprite, unmanned) or a dropped special weapon (a small marker) */
  function drawDrop(G, c, d, k, ui) {
    const [sx, sy] = toScreen(d.x, d.y), hov = ui && ui.hoverDrop === d.id;
    if (d.kind === 'team') {
      const key = d.side + '_' + DATA.SQUADS[d.defId].crewWeapon;
      if (R.lib[key]) { ArtKit.drawUnitShadow(c, R.lib, key, { clip: 'idle', frame: 0, heading: d.heading * 180 / Math.PI }, sx, sy, k); ArtKit.drawUnit(c, R.lib, key, { clip: 'idle', frame: 0, heading: d.heading * 180 / Math.PI }, sx, sy, k); }
    } else {
      c.save(); c.translate(sx, sy); c.rotate(-.5); c.fillStyle = '#2d2a24'; c.fillRect(-11 * k, -1.5 * k, 22 * k, 3 * k); c.fillStyle = '#6b4f2e'; c.fillRect(-11 * k, -1.5 * k, 7 * k, 3 * k); c.restore();
    }
    // a pale ring so it reads as something to pick up
    c.strokeStyle = hov ? 'rgba(255,230,120,.95)' : 'rgba(230,220,180,.55)'; c.lineWidth = (hov ? 2 : 1.2) * k; c.setLineDash([4 * k, 3 * k]);
    c.beginPath(); c.ellipse(sx, sy, (d.kind === 'team' ? 26 : 14) * k, (d.kind === 'team' ? 13 : 7) * k, 0, 0, U.TAU); c.stroke(); c.setLineDash([]);
  }
  function drawCorpse(G, c, cp, k) {
    const key = cp.side + '_' + cp.sprite, lib = R.lib[key];
    const [sx, sy] = toScreen(cp.x, cp.y), age = Math.max(0, G.t - cp.t0);
    if (!lib || !lib.m.clips.die) { c.fillStyle = 'rgba(40,40,30,.5)'; c.beginPath(); c.ellipse(sx, sy, 6 * k, 3 * k, 0, 0, U.TAU); c.fill(); return; }
    const die = lib.m.clips.die, fr = Math.min(die.frames - 1, Math.floor(age * die.fps));
    if (age > 40) c.globalAlpha = Math.max(0, 1 - (age - 40) / 20);
    ArtKit.drawUnit(c, R.lib, key, { clip: 'die', frame: fr, heading: cp.heading * 180 / Math.PI }, sx, sy, k);
    c.globalAlpha = 1;
  }

  /* ---------------- shots and explosions ---------------- */
  function drawProjectiles(G, c, k) {
    for (const p of G.projectiles) {
      const t = U.clamp((G.t - p.t0) / Math.max(.01, (p.land || p.t1) - p.t0), 0, 1);
      const x = U.lerp(p.ax, p.x, t), y = U.lerp(p.ay, p.y, t), z = p.arc ? Math.sin(t * Math.PI) * Math.hypot(p.x - p.ax, p.y - p.ay) * p.arc * .5 : 1.2;
      const [sx, sy] = toScreen(x, y, z);
      if (p.kind === 'grenade') { c.fillStyle = '#222'; c.beginPath(); c.arc(sx, sy, 2.5 * k, 0, U.TAU); c.fill(); }
      else if (p.kind === 'mortar') { c.fillStyle = '#111'; c.beginPath(); c.arc(sx, sy, 2.2 * k, 0, U.TAU); c.fill(); }
      else { c.strokeStyle = p.kind === 'rocket' ? 'rgba(255,190,90,.95)' : 'rgba(255,240,180,.95)'; c.lineWidth = 2.5 * k; const [bx, by] = toScreen(x - (p.x - p.ax) * .04, y - (p.y - p.ay) * .04, z); c.beginPath(); c.moveTo(bx, by); c.lineTo(sx, sy); c.stroke(); }
    }
  }
  function drawFx(G, c, k) {
    for (const f of G.fx) {
      const age = G.t - f.t;
      if (f.kind === 'muzzle') {
        if (!FOG.shownNow(G, f.x, f.y)) continue;
        const [sx, sy] = toScreen(f.x, f.y, f.big ? 1.6 : 1.1); c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(255,210,120,${.9 * (1 - age / .15)})`; c.beginPath(); c.arc(sx, sy, (f.big ? 11 : 3.5) * k, 0, U.TAU); c.fill(); c.globalCompositeOperation = 'source-over';
      } else if (f.kind === 'tracer' || f.kind === 'flame') {
        const [ax, ay] = toScreen(f.ax, f.ay, 1.1), [bx, by] = toScreen(f.bx, f.by, .9);
        c.strokeStyle = f.kind === 'flame' || f.flame ? `rgba(255,140,40,${.8 * (1 - age / f.life)})` : `rgba(255,230,150,${.7 * (1 - age / f.life)})`;
        c.lineWidth = (f.kind === 'flame' ? 5 : 1.4) * k; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      } else if (f.kind === 'boom') {
        const [sx, sy] = toScreen(f.x, f.y), s = f.big || 1;
        const t = age / (f.life || 1.4);
        if (t < .25) { c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,170,60,${1 - t * 4})`; c.beginPath(); c.arc(sx, sy - 6 * k * s, (10 + t * 90) * k * s, 0, U.TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }
        for (let i = 0; i < 5; i++) { const a = i * 1.3 + f.x, r = t * 22 * s * k; c.fillStyle = `rgba(70,62,50,${.5 * (1 - t)})`; c.beginPath(); c.arc(sx + Math.cos(a) * r, sy - t * 30 * k * s + Math.sin(a) * r * .5, (8 + t * 18) * k * s, 0, U.TAU); c.fill(); }
      } else if (f.kind === 'order') {
        const [sx, sy] = toScreen(f.x, f.y), t = age / f.life; c.strokeStyle = f.col; c.globalAlpha = 1 - t; c.lineWidth = 2;
        c.beginPath(); c.ellipse(sx, sy, (14 - t * 8) * k, (7 - t * 4) * k, 0, 0, U.TAU); c.stroke(); c.globalAlpha = 1;
      } else if (f.kind === 'dirt') {
        const [sx, sy] = toScreen(f.x, f.y), t = age / f.life; c.fillStyle = `rgba(120,100,70,${.6 * (1 - t)})`; c.beginPath(); c.arc(sx, sy - t * 8 * k, 3 * k, 0, U.TAU); c.fill();
      } else if (f.kind === 'pen' || f.kind === 'bounce' || f.kind === 'spark') {
        const [sx, sy] = toScreen(f.x, f.y, 1.5), t = age / f.life; c.globalCompositeOperation = 'lighter';
        c.fillStyle = f.kind === 'pen' ? `rgba(255,120,40,${1 - t})` : `rgba(255,255,200,${1 - t})`; c.beginPath(); c.arc(sx, sy, (f.kind === 'pen' ? 16 : 7) * k * (1 + t), 0, U.TAU); c.fill(); c.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* ---------------- overlay: rings, decorators, orders, ghosts ---------------- */
  function drawOverlay(G, c, k, ui) {
    if (ui.cinematic) return;   // the main-menu backdrop: just the battlefield
    const sel = ui.selected;
    // selection rings and order lines
    for (const e of G.ents) {
      if (e.dead || !FOG.shown(G, e)) continue;
      const isSel = sel.has(e.id), hov = ui.hover === e.id;
      if (!isSel && !hov) continue;
      c.strokeStyle = e.owner === 0 ? 'rgba(90,220,255,.95)' : 'rgba(255,110,90,.95)'; c.lineWidth = 1.6 * k;
      if (!isSel) c.setLineDash([3 * k, 3 * k]);
      if (e.type === 'squad') for (const m of e.models) { if (!m.alive) continue; const [sx, sy] = toScreen(m.x, m.y); c.beginPath(); c.ellipse(sx, sy, 13 * k, 6.5 * k, 0, 0, U.TAU); c.stroke(); }
      else if (e.type === 'vehicle') { const [sx, sy] = toScreen(e.x, e.y); c.beginPath(); c.ellipse(sx, sy, e.def.length * 18 * k, e.def.length * 9 * k, 0, 0, U.TAU); c.stroke(); }
      else if (e.type === 'building') { c.beginPath(); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { const [sx, sy] = toScreen(e.x + a * e.w / 2, e.y + b * e.d / 2); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.closePath(); c.stroke(); }
      c.setLineDash([]);
      if (isSel && e.owner === 0) {
        // path
        if (e.path && e.path.length) {
          c.strokeStyle = e.order && e.order.type === 'attackMove' ? 'rgba(255,120,90,.6)' : e.retreating ? 'rgba(255,220,120,.6)' : 'rgba(150,230,255,.55)'; c.setLineDash([5 * k, 5 * k]); c.lineWidth = 1.5 * k;
          c.beginPath(); let [sx, sy] = toScreen(e.x, e.y); c.moveTo(sx, sy); for (const p of e.path) { [sx, sy] = toScreen(p.x, p.y); c.lineTo(sx, sy); } c.stroke(); c.setLineDash([]);
          const end = e.path[e.path.length - 1], [ex, ey] = toScreen(end.x, end.y); c.fillStyle = 'rgba(150,230,255,.8)'; c.beginPath(); c.ellipse(ex, ey, 5 * k, 2.5 * k, 0, 0, U.TAU); c.fill();
        }
        // shift-queued waypoints: a fainter line on from the current destination, a dot at each stop
        if (e.queue && e.queue.length) {
          const from = e.path && e.path.length ? e.path[e.path.length - 1] : e;
          c.strokeStyle = 'rgba(184,240,255,.4)'; c.setLineDash([3 * k, 5 * k]); c.lineWidth = 1.3 * k;
          c.beginPath(); let [qx, qy] = toScreen(from.x, from.y); c.moveTo(qx, qy); for (const q of e.queue) { [qx, qy] = toScreen(q.x, q.y); c.lineTo(qx, qy); } c.stroke(); c.setLineDash([]);
          c.fillStyle = 'rgba(184,240,255,.7)'; for (const q of e.queue) { const [px, py] = toScreen(q.x, q.y); c.beginPath(); c.ellipse(px, py, 4 * k, 2 * k, 0, 0, U.TAU); c.fill(); }
        }
        if (e.type === 'building') { const [rx, ry] = toScreen(e.rally.x, e.rally.y), [tx, ty] = toScreen(e.rally.x, e.rally.y, 2.2); c.strokeStyle = '#ddd'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(rx, ry); c.lineTo(tx, ty); c.stroke(); c.fillStyle = '#5ad6ff'; c.fillRect(tx, ty, 11 * k, 7 * k); }
        // team weapon firing arc
        if (e.type === 'squad' && e.crew && e.crew.state !== 'packed') {
          const w = SIM.weaponOf(e); if (w && w.arc) {
            const half = w.arc / 2 * Math.PI / 180;
            c.strokeStyle = 'rgba(255,214,70,.85)'; c.lineWidth = 2 * k;
            for (const s of [-1, 1]) { const a = e.crew.heading + s * half, [ax, ay] = toScreen(e.crew.x, e.crew.y), [bx, by] = toScreen(e.crew.x + Math.cos(a) * w.rng[2], e.crew.y + Math.sin(a) * w.rng[2]); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
          }
        }
        if (e.order && e.order.type === 'build' && e.buildAt) { const [bx, by] = toScreen(e.buildAt.x, e.buildAt.y); c.strokeStyle = 'rgba(120,255,140,.5)'; c.setLineDash([3, 4]); const [sx, sy] = toScreen(e.x, e.y); c.beginPath(); c.moveTo(sx, sy); c.lineTo(bx, by); c.stroke(); c.setLineDash([]); }
      }
    }
    // move cover preview dots
    if (ui.coverPreview) for (const d of ui.coverPreview) { const [sx, sy] = toScreen(d.x, d.y); c.fillStyle = DATA.COVER[d.cover].colour; c.beginPath(); c.ellipse(sx, sy, 4 * k, 2 * k, 0, 0, U.TAU); c.fill(); }
    // placement ghosts
    if (ui.ghost) drawGhost(G, c, k, ui.ghost);
    // decorators
    for (const e of G.ents) {
      if (e.dead || !FOG.shown(G, e)) continue;
      drawDecorator(G, c, e, k, sel.has(e.id), ui);
    }
    // point icons
    for (const p of G.map.points) {
      const [sx, sy] = toScreen(p.x, p.y, 8.5); if (sx < -40 || sx > R.W + 40 || sy < -40 || sy > R.H + 40) continue;
      pointIcon(c, p, sx, sy, 1, ui.hoverPoint === p.id ? G : null);
    }
  }
  function pointIcon(c, p, sx, sy, s, G) {
    const col = p.owner === 0 ? TEAM[0] : p.owner === 1 ? TEAM[1] : '#d8d8d8';
    c.fillStyle = 'rgba(15,15,15,.75)'; c.beginPath(); c.arc(sx, sy, 12 * s, 0, U.TAU); c.fill();
    c.strokeStyle = col; c.lineWidth = 2 * s; c.stroke();
    c.fillStyle = col; c.strokeStyle = col;
    if (p.type === 'victory') star(c, sx, sy, 7 * s);
    else if (p.type === 'munitions') { for (let i = -1; i <= 1; i++) c.fillRect(sx + i * 4 * s - 1.2 * s, sy - 5 * s, 2.4 * s, 10 * s); }
    else if (p.type === 'fuel') { c.fillRect(sx - 4 * s, sy - 5 * s, 8 * s, 10 * s); c.fillStyle = '#222'; c.fillRect(sx - 2 * s, sy - 3 * s, 4 * s, 2 * s); }
    else { c.fillRect(sx - 4 * s, sy - 4 * s, 8 * s, 8 * s); }
    // held but cut off from its owner's supply: a red slash, and under the full-size icon a NO INCOME tag
    const m = R.G && R.G.map, cut = p.owner >= 0 && m && m.sectors[p.sector] && !m.sectors[p.sector].supplied;
    if (cut) {
      c.strokeStyle = '#ff4a3a'; c.lineWidth = 2.6 * s; c.beginPath(); c.moveTo(sx - 8.5 * s, sy + 8.5 * s); c.lineTo(sx + 8.5 * s, sy - 8.5 * s); c.stroke();
      if (s >= 1) {
        c.font = '700 10px Inter, system-ui, sans-serif'; const tw = c.measureText('NO INCOME').width;
        c.fillStyle = 'rgba(70,14,10,.9)'; c.fillRect(sx - tw / 2 - 4, sy + 14, tw + 8, 14);
        c.fillStyle = '#ffd0c8'; c.textAlign = 'center'; c.fillText('NO INCOME', sx, sy + 25); c.textAlign = 'left';
      }
    }
    if (G) {
      const v = DATA.ECON.point[p.type], pay = (v.mu ? '+' + v.mu + ' munitions ' : '') + (v.fu ? '+' + v.fu + ' fuel' : '');
      const txt = cut ? 'Cut off from supply: no income (' + pay.trim() + ' when connected)' + (p.type === 'victory' ? '  victory point still counts' : '') : pay + (p.type === 'victory' ? '  victory point' : '');
      c.font = '600 12px Inter, system-ui, sans-serif'; const w = c.measureText(txt).width;
      c.fillStyle = 'rgba(40,24,14,.85)'; c.fillRect(sx + 16, sy - 9, w + 10, 18); c.fillStyle = '#ffd9a8'; c.fillText(txt, sx + 21, sy + 4);
    }
  }
  function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
  R.star = star; R.pointIcon = pointIcon;
  function drawDecorator(G, c, e, k, selected, ui) {
    let x, y, z;
    if (e.type === 'squad') { const al = e.models.filter(m => m.alive); if (!al.length) return; x = al.reduce((a, m) => a + m.x, 0) / al.length; y = al.reduce((a, m) => a + m.y, 0) / al.length; z = e.garrison != null ? 9.5 : 3.4; }
    else if (e.type === 'vehicle') { x = e.x; y = e.y; z = 4.6; }
    else { x = e.x - e.w / 2; y = e.y - e.d / 2; z = 7.5; }
    let [sx, sy] = toScreen(x, y, z);
    if (sx < -40 || sx > R.W + 40 || sy < -60 || sy > R.H + 40) return;
    const glyph = e.def.glyph || 'infantry', icon = decoIcon(glyph, e.owner, selected ? 'sel' : 'n');
    const s = .78;
    c.drawImage(icon, sx - 18 * s, sy - 22 * s, 36 * s, 44 * s);
    // vet stars
    if (e.vet) { c.fillStyle = '#ffd34d'; for (let i = 0; i < e.vet; i++) star(c, sx - (e.vet - 1) * 5 + i * 10, sy - 22 * s - 5, 4); }
    if (e.type === 'squad') {
      const n = e.models.filter(m => m.alive).length;
      c.fillStyle = '#111'; c.beginPath(); c.arc(sx - 16 * s, sy - 4 * s, 7, 0, U.TAU); c.fill(); c.strokeStyle = '#ddd'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#eee'; c.font = '700 10px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(String(n), sx - 16 * s, sy - .5 * s); c.textAlign = 'left';
      // cover shield
      const cov = COMBAT.squadCover(G, e);
      if (cov !== 'none') { c.fillStyle = DATA.COVER[cov].colour; c.beginPath(); c.moveTo(sx - 21 * s, sy + 6 * s); c.lineTo(sx - 11 * s, sy + 6 * s); c.lineTo(sx - 12 * s, sy + 13 * s); c.lineTo(sx - 16 * s, sy + 16 * s); c.lineTo(sx - 20 * s, sy + 13 * s); c.closePath(); c.fill(); }
      // suppression / pinned / retreat
      if (e.retreating) { c.fillStyle = '#ffcf5a'; c.beginPath(); c.moveTo(sx + 12, sy + 10); c.lineTo(sx + 20, sy + 4); c.lineTo(sx + 20, sy + 16); c.closePath(); c.fill(); }
      else if (e.suppState) { c.fillStyle = e.suppState === 2 ? '#ff4a3a' : '#ffb03a'; c.font = '800 12px Inter, system-ui'; c.fillText(e.suppState === 2 ? '!!' : '!', sx + 11, sy + 14); }
      if (e.camo) { c.fillStyle = 'rgba(140,220,140,.9)'; c.font = '700 9px Inter'; c.fillText('camo', sx - 12, sy + 33); }
      if (e.crew && (e.crew.state === 'setting' || e.crew.state === 'tearing')) { c.strokeStyle = '#ffd34d'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy - 2, 18 * s, -Math.PI / 2, -Math.PI / 2 + U.TAU * (1 - e.crew.t / ((SIM.weaponOf(e).setup || 2.5)))); c.stroke(); }
      if (e.building) { c.fillStyle = '#8f8'; c.font = '700 9px Inter'; c.fillText('building', sx - 18, sy + 33); }
    }
    // health: squads get one segment a soldier (full slots, lost men shown empty), vehicles one bar, buildings when hurt
    const hcol = f => f > .6 ? '#5c5' : f > .3 ? '#dc4' : '#d43';
    if (e.type === 'squad') {
      const n = e.maxModels, gap = 2, w = Math.max(30, Math.min(44, n * 8)), sw = (w - gap * (n - 1)) / n, x0 = sx - w / 2, y0 = sy + 18;
      c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(x0 - 1, y0 - 1, w + 2, 6);
      for (let i = 0; i < n; i++) {
        const m = e.models[i], f = m && m.alive ? Math.max(0, m.hp / (m.maxHp || e.def.hp)) : 0, x = x0 + i * (sw + gap);
        c.fillStyle = '#3a1512'; c.fillRect(x, y0, sw, 4);
        if (f > 0) { c.fillStyle = hcol(f); c.fillRect(x, y0, sw * f, 4); }
      }
    } else if (e.type === 'vehicle' || (e.type === 'building' && e.hp < e.maxHp)) {
      const w = e.type === 'vehicle' ? 40 : 34, f = Math.max(0, e.hp / e.maxHp);
      c.fillStyle = 'rgba(0,0,0,.75)'; c.fillRect(sx - w / 2 - 1, sy + 17, w + 2, 7);
      c.fillStyle = '#3a1512'; c.fillRect(sx - w / 2, sy + 18, w, 5); c.fillStyle = hcol(f); c.fillRect(sx - w / 2, sy + 18, w * f, 5);
      if (e.type === 'vehicle') { c.fillStyle = 'rgba(0,0,0,.55)'; for (let q = 1; q < 4; q++) c.fillRect(sx - w / 2 + w * q / 4, sy + 18, 1, 5); }
    }
    if (e.type === 'building' && e.built < 1) { const w = 34; c.fillStyle = '#222'; c.fillRect(sx - w / 2, sy + 25, w, 4); c.fillStyle = '#8cf'; c.fillRect(sx - w / 2, sy + 24, w * e.built, 4); }
    // control group
    if (e.owner === 0 && ui.groupOf) { const g = ui.groupOf(e.id); if (g) { c.fillStyle = '#111'; c.fillRect(sx - 6, sy - 40, 12, 13); c.fillStyle = '#eee'; c.font = '700 10px Inter'; c.textAlign = 'center'; c.fillText(g, sx, sy - 30); c.textAlign = 'left'; } }
  }
  function drawGhost(G, c, k, g) {
    if (g.kind === 'building') {
      const def = DATA.BUILDINGS[g.id], ok = !g.err;
      c.fillStyle = ok ? 'rgba(90,220,140,.25)' : 'rgba(255,80,60,.25)'; c.strokeStyle = ok ? '#6f6' : '#f55'; c.lineWidth = 2;
      c.beginPath(); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { const [sx, sy] = toScreen(g.x + a * def.size[0] / 2, g.y + b * def.size[1] / 2); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.closePath(); c.fill(); c.stroke();
      if (g.err) { const [sx, sy] = toScreen(g.x, g.y, 2); c.fillStyle = '#fbb'; c.font = '600 13px Inter'; c.textAlign = 'center'; c.fillText(g.err, sx, sy); c.textAlign = 'left'; }
    } else if (g.kind === 'pit') {
      const ok = !g.err, [sx, sy] = toScreen(g.x, g.y);
      c.globalAlpha = .55; drawProp(c, g.art, sx, sy, k, g.face || 0); drawProp(c, g.art, sx, sy, k, g.face || 0, 'front'); c.globalAlpha = 1;
      c.strokeStyle = ok ? '#6f6' : '#f55'; c.lineWidth = 2; c.beginPath(); c.ellipse(sx, sy, g.r * 31 * k, g.r * 15.5 * k, 0, 0, U.TAU); c.stroke();
      if (g.err) { c.fillStyle = '#fbb'; c.font = '600 13px Inter'; c.textAlign = 'center'; c.fillText(g.err, sx, sy - 30 * k); c.textAlign = 'left'; }
    } else if (g.kind === 'line') {
      const [ax, ay] = toScreen(g.x, g.y), [bx, by] = toScreen(g.x2, g.y2);
      c.strokeStyle = 'rgba(120,255,160,.85)'; c.lineWidth = 4 * k; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    } else if (g.kind === 'target') {
      const [sx, sy] = toScreen(g.x, g.y); c.strokeStyle = g.err ? '#f66' : '#ffcf4a'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(sx, sy, (g.r || 4) * 31 * k, (g.r || 4) * 15.5 * k, 0, 0, U.TAU); c.stroke();
      if (g.err) { c.fillStyle = '#fbb'; c.font = '600 13px Inter'; c.fillText(g.err, sx + 10, sy - 10); }
    } else if (g.kind === 'label') {
      const [lx, ly] = toScreen(g.x, g.y, g.z || 2); c.font = '700 13px Inter, system-ui'; c.textAlign = 'center'; const tw = c.measureText(g.label).width; c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(lx - tw / 2 - 6, ly - 13, tw + 12, 19); c.fillStyle = '#ffe9a8'; c.fillText(g.label, lx, ly + 1); c.textAlign = 'left';
    } else if (g.kind === 'house') {
      const h = g.h; c.strokeStyle = g.ok ? '#6f6' : '#f66'; c.lineWidth = 2; c.fillStyle = g.ok ? 'rgba(90,220,140,.18)' : 'rgba(255,80,60,.18)';
      c.beginPath(); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { const [sx, sy] = toScreen(h.x + a * (h.w / 2 + .4), h.y + b * (h.d / 2 + .4)); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.closePath(); c.fill(); c.stroke();
      const [lx, ly] = toScreen(h.x, h.y, 8.5); c.font = '700 13px Inter, system-ui'; c.textAlign = 'center'; c.fillStyle = 'rgba(0,0,0,.7)'; const tw = c.measureText(g.label).width; c.fillRect(lx - tw / 2 - 6, ly - 13, tw + 12, 19); c.fillStyle = g.ok ? '#bfffbf' : '#ffb3a8'; c.fillText(g.label, lx, ly + 1); c.textAlign = 'left';
    } else if (g.kind === 'face') {
      const [ax, ay] = toScreen(g.x, g.y), [bx, by] = toScreen(g.x + Math.cos(g.a) * 8, g.y + Math.sin(g.a) * 8);
      c.strokeStyle = '#ffd34d'; c.lineWidth = 3; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    }
  }

  /* portrait for the unit panel: the unit's own sprite drawn into a small 2D canvas */
  function portrait(G, e, cv) {
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    const side = (G.players[e.owner] || {}).side || e.def.side;
    let key, s;
    if (e.type === 'vehicle') { key = e.def.art; s = { clip: 'idle', frame: 0, heading: 135, upperHeading: 135 }; }
    else if (e.type === 'squad') { key = side + '_' + (e.def.crewWeapon && e.crew && e.crew.state !== 'packed' ? e.def.crewWeapon : e.def.models[0]); s = { clip: 'idle', frame: 0, heading: 135 }; }
    else return false;
    const lib = R.lib[key]; if (!lib) return false;
    const L = lib.m.layers.L || lib.m.layers.F;
    const infantry = e.type === 'squad' && !(e.def.crewWeapon && e.crew && e.crew.state !== 'packed');
    const sc = infantry ? cv.height / 50 : Math.min(cv.width / L.frame[0], cv.height / L.frame[1]) * .95;
    ArtKit.drawUnit(g, R.lib, key, s, cv.width / 2, cv.height * (infantry ? .9 : .66), sc);
    return true;
  }

  /* Load-time GPU warm-up: draw every sprite page once, off screen, so each one is decoded and uploaded while the
     loading bar is up instead of the first time that unit appears in a fight (a big tank sheet is ~25 MB). */
  function warmList(lib) {
    const out = [];
    for (const key in lib) { const o = lib[key]; for (const k in o.img || {}) if (o.img[k]) out.push(o.img[k]); }
    for (const k in R.sprites) { const v = R.sprites[k], cv = v && (v.c || v); if (cv && cv.width) out.push(cv); }
    if (R.ground) out.push(R.ground);
    for (const key in R.props || {}) { const r = R.props[key]; if (r.img) out.push(r.img); for (const e in r.ends || {}) if (r.ends[e].img) out.push(r.ends[e].img); if (r.front && r.front.img) out.push(r.front.img); }
    return out;
  }
  function warmStep(list, from, budgetBytes) {
    const c = R.ctx; let i = from, bytes = 0;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    while (i < list.length && (bytes < budgetBytes || i === from)) { const b = list[i++]; c.drawImage(b, 0, 0, 1, 1, -8, -8, 1, 1); bytes += (b.width * b.height * 4) || 0; }
    if (c.endFrame) c.endFrame();
    return i;
  }
  const isGL = () => !!(R.ctx && R.ctx.endFrame);

  return Object.assign(R, { loadGround, loadMats, loadProps, drawProp, warmList, warmStep, isGL, buildGround, init, resize, frame, toScreen, toWorld, clampCam, updateFogCanvas, portrait, PXM });
})();
