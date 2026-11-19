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
  function buildGround(G) {
    // the ground depends only on the map, so a second match on the same map reuses it
    if (R.ground && R.groundKey === G.map.seed + ':' + G.map.w) return;
    R.groundKey = G.map.seed + ':' + G.map.w;
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
  function propSprites() {
    if (R.sprites.bag) return;
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
    g.fillStyle = state === 'sel' ? '#f2f2f2' : slot === 1 ? '#2a1414' : '#141c24';
    g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-15, -16); g.lineTo(15, -16); g.lineTo(15, 6); g.lineTo(0, 19); g.lineTo(-15, 6); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = TEAM[slot]; g.fillRect(-15, -16, 30, 5);
    g.translate(0, 2); g.fillStyle = g.strokeStyle = state === 'sel' ? '#111' : TEAM[slot];
    (GLYPHS[glyph] || GLYPHS.infantry)(g);
    return R.sprites[key] = c;
  }
  R.decoIcon = decoIcon; R.GLYPHS = GLYPHS; R.TEAM = TEAM;

  /* ---------------- per-frame ---------------- */
  function init(canvasEl, lib, G) {
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

  function frame(G, ui, alpha) {
    const c = R.ctx, k = R.cam.k, me = 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#20231c'; c.fillRect(0, 0, R.W, R.H);
    // ground with the iso transform: texture px (u, v) at 8 px a metre
    const S = 8, [ox, oy] = toScreen(0, 0);
    c.setTransform(PXM * k / S, PXM * .5 * k / S, -PXM * k / S, PXM * .5 * k / S, ox, oy);
    c.drawImage(R.ground, 0, 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const vis = (x, y, pad) => { const [sx, sy] = toScreen(x, y); return sx > -pad && sx < R.W + pad && sy > -pad && sy < R.H + pad * 1.5; };
    // craters
    c.fillStyle = 'rgba(58,46,30,.55)';
    for (const cr of G.map.craters) { if (!vis(cr.x, cr.y, 80)) continue; const [sx, sy] = toScreen(cr.x, cr.y); c.beginPath(); c.ellipse(sx, sy, cr.r * 31 * k, cr.r * 15.5 * k, 0, 0, U.TAU); c.fill(); }
    c.strokeStyle = 'rgba(30,24,16,.4)'; c.lineWidth = 1.5 * k;
    for (const cr of G.map.craters) { if (!vis(cr.x, cr.y, 80)) continue; const [sx, sy] = toScreen(cr.x, cr.y); c.beginPath(); c.ellipse(sx, sy - 1, cr.r * 27 * k, cr.r * 13 * k, 0, 0, U.TAU); c.stroke(); }
    drawSectorLines(G, c, k);
    drawPoints(G, c, k);
    // shadows of everything that moves, then all objects back to front
    const list = [];
    for (const t of G.map.trees) if (vis(t.x, t.y, 160)) list.push({ d: t.x + t.y, f: () => drawTree(c, t, k) });
    for (const h of G.map.houses) if (vis(h.x, h.y, 260)) list.push({ d: h.x + h.y + (h.w + h.d) * .25, f: () => drawHouse(c, h, k) });
    for (const cv of G.map.covers) if (cv.alive && vis((cv.ax + cv.bx) / 2, (cv.ay + cv.by) / 2, 100)) list.push({ d: (cv.ax + cv.bx + cv.ay + cv.by) / 2, f: () => drawCover(c, cv, k) });
    for (const w of G.wrecks || []) if (vis(w.x, w.y, 200)) list.push({ d: w.x + w.y, f: () => drawWreck(G, c, w, k) });
    if (R.opt.corpses) for (const cp of G.corpses || []) if (vis(cp.x, cp.y, 60) && FOG.explored(G, me, cp.x, cp.y)) list.push({ d: cp.x + cp.y - .5, f: () => drawCorpse(G, c, cp, k) });
    const shadows = [];
    for (const e of G.ents) {
      if (e.dead) continue;
      if (!FOG.visible(G, me, e) && !(e.type === 'building')) continue;
      if (e.type === 'building') { if (e.owner !== me && !FOG.explored(G, me, e.x, e.y)) continue; if (vis(e.x, e.y, 300)) list.push({ d: e.x + e.y + (e.w + e.d) * .2, f: () => drawBuilding(G, c, e, k, ui) }); continue; }
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
    // fog
    if (!ui.noFog) {
      const [fx, fy] = toScreen(0, 0), C = FOG.C;
      c.setTransform(PXM * k * C, PXM * .5 * k * C, -PXM * k * C, PXM * .5 * k * C, fx, fy);
      c.drawImage(R.fogC, 0, 0);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    drawOverlay(G, c, k, ui);
    if (c.endFrame) c.endFrame();
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
    const sp = treeSprite(t.kind, t.seed), [sx, sy] = toScreen(t.x, t.y), s = .55 * k * t.s;
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
  function drawHouse(c, h, k) {
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = h.y - h.d / 2, y1 = h.y + h.d / 2, H = 4.2;
    const wall = h.wall === 'stone' ? ['#a89c84', '#8d8270'] : ['#d9c9a4', '#b9a884'];
    const [sx, sy] = toScreen(h.x, h.y); c.fillStyle = 'rgba(20,18,10,.3)'; c.beginPath(); c.ellipse(sx + 18 * k, sy + 8 * k, (h.w + h.d) * 17 * k, (h.w + h.d) * 7 * k, 0, 0, U.TAU); c.fill();
    box(c, x0, y0, x1, y1, 0, H, null, wall[1], wall[0]);
    // windows and a door
    const win = (x, y, z, face) => { const P2 = face === 'x' ? [[x, y - .5, z], [x, y + .5, z], [x, y + .5, z + 1.1], [x, y - .5, z + 1.1]] : [[x - .5, y, z], [x + .5, y, z], [x + .5, y, z + 1.1], [x - .5, y, z + 1.1]]; c.beginPath(); P2.forEach(([a, b, zz], i) => { const [px, py] = toScreen(a, b, zz); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); c.fill(); };
    c.fillStyle = '#3c3428';
    for (let y = y0 + 1.6; y < y1 - .8; y += 2.6) win(x1 + .01, y, 2.2, 'x');
    for (let x = x0 + 1.6; x < x1 - .8; x += 2.6) win(x, y1 + .01, 2.2, 'y');
    // gable roof along the long side
    const roof = h.roof === 'slate' ? ['#6f6a66', '#57524e', '#807a75'] : ['#b5643c', '#934c2c', '#c87850'];
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
    } else if (cv.kind === 'wreck') { /* drawn with its wreck */ }
    if (a < 1) c.globalAlpha = 1;
  }

  /* ---------------- player buildings: stand-ins until the buildings are modelled ---------------- */
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
      box(c, x0, y0, x1, y1, 0, H, side === 'us' ? '#6a6c52' : '#5f5a4a', wall[0], wall[1]);
      box(c, b.x - 2.5, b.y - 2, b.x + 1.5, b.y + 2, H, H + .9, side === 'us' ? '#58593f' : '#4f4b3c', wall[0], wall[1]);
      for (let x = x0 + .6; x <= x1; x += .65) { const [px, py] = toScreen(x, y1 + .5, .25); c.drawImage(R.sprites.bag, px - 10 * k, py - 7 * k, 20 * k, 12 * k); }
      for (let y = y0 + .6; y <= y1; y += .65) { const [px, py] = toScreen(x1 + .5, y, .25); c.drawImage(R.sprites.bag, px - 10 * k, py - 7 * k, 20 * k, 12 * k); }
      const [m0x, m0y] = toScreen(x0 + 2, y0 + 2, H), [m1x, m1y] = toScreen(x0 + 2, y0 + 2, H + 7);
      c.strokeStyle = '#333'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(m0x, m0y); c.lineTo(m1x, m1y); c.stroke();
      c.fillStyle = '#555'; c.beginPath(); c.ellipse(m1x, m1y + 6 * k, 9 * k, 5 * k, -.4, 0, U.TAU); c.fill();
    } else {
      box(c, x0, y0, x1, y1, 0, H, null, wall[0], wall[1]);
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
    const side = G.players[sq.owner].side, alive = sq.models.filter(m => m.alive);
    const deployed = sq.crew && sq.crew.state !== 'packed';
    const lay = deployed ? G.layout && G.layout.weapons[side + '_' + sq.def.crewWeapon] : null;
    // weapon sprite
    if (sq.crew) {
      const cw = sq.def.crewWeapon;
      if (deployed) {
        const key = side + '_' + cw, deg = sq.crew.heading * 180 / Math.PI, fireAge = G.t - (sq.cwFireT || -9);
        const clip = fireAge < .5 && R.lib[key] && R.lib[key].m.clips.fire ? 'fire' : 'idle';
        const fr = clip === 'fire' ? Math.min(R.lib[key].m.clips.fire.frames - 1, Math.floor(fireAge * R.lib[key].m.clips.fire.fps)) : 0;
        const [sx, sy] = toScreen(sq.crew.x, sq.crew.y);
        shadows.push(() => ArtKit.drawUnitShadow(R.ctx, R.lib, key, { clip, frame: fr, heading: deg }, sx, sy, k));
        list.push({ d: sq.crew.x + sq.crew.y, f: () => ArtKit.drawUnit(R.ctx, R.lib, key, { clip, frame: fr, heading: deg }, sx, sy, k) });
      } else if (sq.def.towed && alive.length) {
        // limbered gun pushed by the first two men
        const a = alive[0], b2 = alive[1] || alive[0], mx = (a.x + b2.x) / 2, my = (a.y + b2.y) / 2, h = sq.heading;
        const gx = mx + Math.cos(h) * 2.4, gy = my + Math.sin(h) * 2.4, key = side + '_' + cw + '_limbered', deg = h * 180 / Math.PI;
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
      const [sx, sy] = toScreen(m.x, m.y);
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
      shadows.push(() => { if (pose) ArtKit.drawUnitShadow(R.ctx, R.lib, key, { clip: pose.lc, frame: pose.lf, heading: aimDeg(lib, pose.lh) }, sx, sy, k); else ArtKit.drawUnitShadow(R.ctx, R.lib, key, s, sx, sy, k); });
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
        if (!FOG.seen(G, 0, f.x, f.y)) continue;
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
      if (e.dead || (e.owner !== 0 && !FOG.visible(G, 0, e))) continue;
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
      if (e.dead || e.type === 'building' && e.owner === 1 && !FOG.explored(G, 0, e.x, e.y)) continue;
      if (e.type !== 'building' && !FOG.visible(G, 0, e)) continue;
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
    if (G) {
      const v = DATA.ECON.point[p.type], txt = (v.mu ? '+' + v.mu + ' munitions ' : '') + (v.fu ? '+' + v.fu + ' fuel' : '') + (p.type === 'victory' ? '  victory point' : '');
      c.font = '600 12px Inter, system-ui, sans-serif'; const w = c.measureText(txt).width;
      c.fillStyle = 'rgba(40,24,14,.85)'; c.fillRect(sx + 16, sy - 9, w + 10, 18); c.fillStyle = '#ffd9a8'; c.fillText(txt, sx + 21, sy + 4);
    }
  }
  function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
  R.star = star; R.pointIcon = pointIcon;
  function drawDecorator(G, c, e, k, selected, ui) {
    let x, y, z;
    if (e.type === 'squad') { const al = e.models.filter(m => m.alive); if (!al.length) return; x = al.reduce((a, m) => a + m.x, 0) / al.length; y = al.reduce((a, m) => a + m.y, 0) / al.length; z = 3.4; }
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
    } else if (g.kind === 'line') {
      const [ax, ay] = toScreen(g.x, g.y), [bx, by] = toScreen(g.x2, g.y2);
      c.strokeStyle = 'rgba(120,255,160,.85)'; c.lineWidth = 4 * k; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    } else if (g.kind === 'target') {
      const [sx, sy] = toScreen(g.x, g.y); c.strokeStyle = g.err ? '#f66' : '#ffcf4a'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(sx, sy, (g.r || 4) * 31 * k, (g.r || 4) * 15.5 * k, 0, 0, U.TAU); c.stroke();
      if (g.err) { c.fillStyle = '#fbb'; c.font = '600 13px Inter'; c.fillText(g.err, sx + 10, sy - 10); }
    } else if (g.kind === 'face') {
      const [ax, ay] = toScreen(g.x, g.y), [bx, by] = toScreen(g.x + Math.cos(g.a) * 8, g.y + Math.sin(g.a) * 8);
      c.strokeStyle = '#ffd34d'; c.lineWidth = 3; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    }
  }

  /* portrait for the unit panel: the unit's own sprite drawn into a small 2D canvas */
  function portrait(G, e, cv) {
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    const side = G.players[e.owner].side;
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

  return Object.assign(R, { warmList, warmStep, isGL, buildGround, init, resize, frame, toScreen, toWorld, clampCam, updateFogCanvas, portrait, PXM });
})();
