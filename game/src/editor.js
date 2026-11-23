/* Map editor (main menu > Map editor). Draws and edits a map definition, the same data maps.js holds and MAP.create
   builds the game map from. Seen from above, turned like the minimap: base 1 on the left, base 2 on the right.
   Works with a mouse or a finger: tap to place, tap points then Done for lines and fields, drag a selected thing to
   move it, drag empty ground (or two fingers, or the right / middle button) to pan, pinch or wheel to zoom.
   Mirror places a turned copy (half a turn about the centre) for the other side. Check builds the map the way the
   game does and lists what would break it and how fair the halves are. The working map is kept in this browser;
   Export gives the JSON (to send for building the map in) and a picture of it; Play starts a match on it.
   A reference picture can be laid under the map to trace over, and notes and freehand sketches drawn on top. */
const EDITOR = (() => {
  const $ = s => document.querySelector(s);
  const KEY = 'tw2-editor-map', IMGKEY = 'tw2-editor-image';
  const SQ = Math.SQRT1_2;
  const FOOT = [[9, 7], [9, 6], [8, 6], [7, 7], [7, 6], [6, 6]];          // farmhouse art footprints (map.js HOUSE_ART)
  const FIELD_COL = { wheat: '#c9a95b', stubble: '#b49c66', ploughed: '#86643f', green: '#7c8a45', olive: '#8a8a58' };
  const POINT_COL = { standard: '#e8e4d8', munitions: '#e57a54', fuel: '#8fca5a', victory: '#e6b450' };
  const NOTE_COL = ['#ff4d4d', '#ffd24d', '#4dd2ff', '#ffffff', '#111111'];
  /* tools: what a tap does. line: tap points then Done (poly: a closed field). */
  const TOOLS = [
    { id: 'select', label: 'Select', hint: 'Tap a thing to select it; drag it to move it, or drag its corner dots. Drag empty ground to pan.' },
    { id: 'road', label: 'Road', list: 'roads', line: 2, hint: 'Tap along the road, then Done. White gravel road.' },
    { id: 'track', label: 'Track', list: 'roads', line: 2, hint: 'Tap along the lane, then Done. Narrow dirt farm track.' },
    { id: 'field', label: 'Field', list: 'fields', line: 3, poly: true, hint: 'Tap the corners of the field, then Done. Olive fields get olive trees in rows.' },
    { id: 'house', label: 'House', list: 'houses', hint: 'Tap to place a farmhouse. Pick its size below; Turn swaps it round.' },
    { id: 'wall', label: 'Wall', list: 'walls', line: 2, hint: 'Tap along the wall, then Done. Stone wall: heavy cover, stops vehicles.' },
    { id: 'hedge', label: 'Hedge', list: 'hedges', line: 2, hint: 'Tap along the hedgerow, then Done. Light cover, stops vehicles.' },
    { id: 'sandbags', label: 'Bags', list: 'sandbags', line: 2, hint: 'Tap along the sandbag line, then Done. Heavy cover.' },
    { id: 'treeline', label: 'Tree row', list: 'treelines', line: 2, hint: 'Tap along a row of trees, then Done (cypress lines along lanes).' },
    { id: 'tree', label: 'Tree', list: 'trees', hint: 'Tap to plant a single tree.' },
    { id: 'hill', label: 'Hill', list: 'hills', hint: 'Tap to raise a hill; set its size and height below.' },
    { id: 'point', label: 'Point', list: 'points', hint: 'Tap to place a capture point; pick its kind below.' },
    { id: 'crater', label: 'Crater', list: 'craters', hint: 'Tap to place a shell crater (light cover).' },
    { id: 'base', label: 'Base', list: 'bases', hint: 'Tap to move a base. Base 1 is the left one.' },
    { id: 'note', label: 'Note', list: 'notes', hint: 'Tap to pin a text note (not in the game: for showing what you want).' },
    { id: 'sketch', label: 'Sketch', list: 'notes', hint: 'Draw freehand with a finger or the mouse (not in the game: for showing what you want).' },
    { id: 'erase', label: 'Erase', hint: 'Tap a thing to remove it.' },
  ];
  /* what can be set on each kind of thing (the tool's settings, or the selected thing's) */
  const PROPS = {
    roads: [['kind', 'Kind', ['road', 'track']]],
    fields: [['kind', 'Crop', ['wheat', 'stubble', 'ploughed', 'green', 'olive']], ['rot', 'Rows', 'angle']],
    houses: [['size', 'Size', 'size'], ['turn', 'Turn', 'turn']],
    trees: [['kind', 'Tree', ['olive', 'cypress']]],
    treelines: [['kind', 'Tree', ['cypress', 'olive']], ['gap', 'Spacing m', [4, 5, 6, 8, 10]]],
    hills: [['r', 'Size m', [6, 8, 10, 13, 16, 20, 25, 30]], ['h', 'Height m', [1, 2, 3, 4, 5, 6, 8]]],
    points: [['type', 'Kind', ['standard', 'munitions', 'fuel', 'victory']]],
    craters: [['r', 'Size m', [1.5, 2, 2.5, 3]]],
    bases: [['slot', 'Base', [0, 1]]],
    notes: [['text', 'Text', 'text'], ['color', 'Colour', NOTE_COL]],
  };
  const LINE_LISTS = ['roads', 'fields', 'walls', 'hedges', 'sandbags', 'treelines'];

  let def = null, cv = null, g = null, cam = { u: 0, v: 0, k: 3 }, tool = 'select', sel = null, draft = null, dirty = true, open_ = false;
  let mirror = false, grid = true, undo = [], redo = [], img = null, imgOpt = { alpha: .5, mode: 'map', turn: 0 }, check = null, shown = false;
  const opt = { road: { kind: 'road' }, track: { kind: 'track' }, field: { kind: 'wheat', rot: 0 }, house: { w: 9, d: 7 }, tree: { kind: 'olive' },
    treeline: { kind: 'cypress', gap: 5 }, hill: { r: 13, h: 4 }, point: { type: 'standard' }, crater: { r: 2 }, base: { slot: 0 }, note: { color: NOTE_COL[0], text: 'Note' }, sketch: { color: NOTE_COL[0] } };

  /* ---------------- the map data ---------------- */
  function blank() {
    return { id: 'custom', name: 'My map', w: 200, h: 200, swell: .35, bases: [{ x: 30, y: 170 }, { x: 170, y: 30 }], points: [], roads: [], fields: [], houses: [],
      walls: [], hedges: [], sandbags: [], trees: [], treelines: [], hills: [], craters: [], notes: [] };
  }
  function tidy(d) {
    const b = blank();
    for (const k in b) if (d[k] == null) d[k] = b[k];
    return d;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  function load() {
    try { const s = localStorage.getItem(KEY); if (s) return tidy(JSON.parse(s)); } catch (e) {}
    return tidy(clone(MAPS[MAPS.default]));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(def)); } catch (e) {} }
  function change() { undo.push(JSON.stringify(def)); if (undo.length > 80) undo.shift(); redo.length = 0; }
  function changed() { save(); check = null; dirty = true; panel(); }
  function doUndo() { if (!undo.length) return; redo.push(JSON.stringify(def)); def = JSON.parse(undo.pop()); sel = null; changed(); }
  function doRedo() { if (!redo.length) return; undo.push(JSON.stringify(def)); def = JSON.parse(redo.pop()); sel = null; changed(); }
  /* the editor's working map, as a definition the game can play (notes left in: the game ignores them) */
  function current() { return def ? clone(def) : load(); }
  function hasSaved() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }

  /* ---------------- view ---------------- */
  const toS = (x, y) => [cv.width / 2 + ((x - y) * SQ - cam.u) * cam.k, cv.height / 2 + ((x + y - def.w) * SQ - cam.v) * cam.k];
  const toW = (sx, sy) => { const u = (sx - cv.width / 2) / cam.k + cam.u, v = (sy - cv.height / 2) / cam.k + cam.v; return [(u + v) * SQ + def.w / 2, (v - u) * SQ + def.h / 2]; };
  function fit() {
    const span = def.w * Math.SQRT2;
    cam.u = 0; cam.v = 0; cam.k = Math.min((cv.width - 20) / span, (cv.height - 20) / span);
  }
  function resize() { if (!cv) return; const r = devicePixelRatio > 1 ? 1.5 : 1; cv.width = innerWidth * r; cv.height = innerHeight * r; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; cv.dpr = r; dirty = true; }

  /* ---------------- drawing ---------------- */
  const ptsOf = it => Array.isArray(it) ? it : it.pts;
  function path(P, close) { g.beginPath(); P.forEach(([x, y], i) => { const [a, b] = toS(x, y); i ? g.lineTo(a, b) : g.moveTo(a, b); }); if (close) g.closePath(); }
  function draw(ctx, forPicture) {
    g = ctx; const k = cam.k, W = def.w, H = def.h;
    g.fillStyle = '#202219'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    // ground
    path([[0, 0], [W, 0], [W, H], [0, H]], true); g.fillStyle = '#8f8458'; g.fill();
    // reference picture under everything
    if (img && imgOpt.alpha > 0) {
      g.save(); g.globalAlpha = imgOpt.alpha;
      if (imgOpt.mode === 'map') {                  // the picture covers the map square, turned with it
        const [ox, oy] = toS(0, 0), [ax, ay] = toS(W, 0), [bx, by] = toS(0, H);
        g.setTransform(g.getTransform().multiply(new DOMMatrix([(ax - ox) / img.width, (ay - oy) / img.width, (bx - ox) / img.height, (by - oy) / img.height, ox, oy])));
        if (imgOpt.turn) { g.translate(img.width / 2, img.height / 2); g.rotate(imgOpt.turn * Math.PI / 2); g.translate(-img.width / 2, -img.height / 2); }
        g.drawImage(img, 0, 0);
      } else {                                      // upright over the map's outline
        const [lx] = toS(0, H), [rx] = toS(W, 0), [, ty] = toS(0, 0), [, by2] = toS(W, H), s = Math.min((rx - lx) / img.width, (by2 - ty) / img.height);
        g.translate((lx + rx) / 2, (ty + by2) / 2); g.rotate(imgOpt.turn * Math.PI / 2); g.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
      }
      g.restore();
    }
    // hills: soft rises with a ring where they end
    for (const h of def.hills) {
      const [x, y] = toS(h.x, h.y), r = h.r * 1.6 * k, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(240,225,170,${Math.min(.5, h.h * .08)})`); gr.addColorStop(1, 'rgba(240,225,170,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(70,58,30,.45)'; g.setLineDash([4, 4]); g.lineWidth = 1; g.beginPath(); g.arc(x, y, h.r * k, 0, 7); g.stroke(); g.setLineDash([]);
      if (k > 1.5) label(`${h.h} m`, x, y, '#4a3d20');
    }
    // grid every 10 m
    if (grid && !forPicture) {
      g.strokeStyle = 'rgba(0,0,0,.09)'; g.lineWidth = 1;
      for (let i = 10; i < W; i += 10) { path([[i, 0], [i, H]]); g.stroke(); path([[0, i], [W, i]]); g.stroke(); }
    }
    // fields
    for (const f of def.fields) {
      path(f.pts, true); g.fillStyle = FIELD_COL[f.kind] || '#888'; g.globalAlpha = .9; g.fill(); g.globalAlpha = 1;
      g.save(); path(f.pts, true); g.clip();
      const [cx, cy] = toS(...centroid(f.pts)), a = (f.rot || 0) + Math.PI / 4;   // rows: rot in world, turned 45 degrees on screen
      g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = 1;
      const step = Math.max(3, 3 * k), L = 300 * k;
      for (let t = -L; t < L; t += step) { g.beginPath(); g.moveTo(cx + Math.cos(a) * -L - Math.sin(a) * t, cy + Math.sin(a) * -L + Math.cos(a) * t); g.lineTo(cx + Math.cos(a) * L - Math.sin(a) * t, cy + Math.sin(a) * L + Math.cos(a) * t); g.stroke(); }
      if (f.kind === 'olive') { g.fillStyle = 'rgba(60,80,40,.7)'; for (let t = -L; t < L; t += 7 * k) for (let s = -L; s < L; s += 6.5 * k) { const px = cx + Math.cos(a) * s - Math.sin(a) * t, py = cy + Math.sin(a) * s + Math.cos(a) * t; g.beginPath(); g.arc(px, py, 1.6 * k, 0, 7); g.fill(); } }
      g.restore();
      path(f.pts, true); g.strokeStyle = 'rgba(60,45,25,.6)'; g.lineWidth = 1; g.stroke();
    }
    // roads: tracks under roads
    for (const kind of ['track', 'road']) for (const r of def.roads) if ((r.kind === 'track') === (kind === 'track')) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      path(r.pts); g.strokeStyle = kind === 'track' ? '#7a5f3e' : '#9c8a62'; g.lineWidth = (kind === 'track' ? 5.2 : 7.6) * k; g.stroke();
      path(r.pts); g.strokeStyle = kind === 'track' ? '#a88a62' : '#ddd0ad'; g.lineWidth = (kind === 'track' ? 3.6 : 5.6) * k; g.stroke();
    }
    // craters
    for (const c of def.craters) { const [x, y] = toS(c.x, c.y); g.fillStyle = 'rgba(70,50,30,.75)'; g.beginPath(); g.arc(x, y, c.r * k, 0, 7); g.fill(); }
    // cover lines
    const line = (list, col, w, dash) => { for (const l of def[list]) { path(ptsOf(l)); g.strokeStyle = col; g.lineWidth = Math.max(2, w * k); g.setLineDash(dash ? dash.map(d => d * k) : []); g.stroke(); } g.setLineDash([]); };
    line('hedges', '#2f5a22', 1.8); line('walls', '#7d776c', 1.1); line('sandbags', '#c2a66c', 1, [1, .6]);
    // trees
    const treeDot = (t, x, y) => { g.fillStyle = t === 'cypress' ? '#1f3d1c' : '#4c6630'; g.beginPath(); g.arc(x, y, (t === 'cypress' ? 1.2 : 2) * k, 0, 7); g.fill(); };
    for (const t of def.trees) { const [x, y] = toS(t.x, t.y); treeDot(t.kind, x, y); }
    for (const tl of def.treelines) {
      const P = tl.pts, gap = tl.gap || 5;
      for (let i = 0; i < P.length - 1; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / gap)); for (let j = i ? 1 : 0; j <= n; j++) { const [x, y] = toS(ax + (bx - ax) * j / n, ay + (by - ay) * j / n); treeDot(tl.kind, x, y); } }
    }
    // houses: walls, ridge line, size
    for (const h of def.houses) {
      const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = h.y - h.d / 2, y1 = h.y + h.d / 2, ok = FOOT.some(([a, b]) => Math.max(h.w, h.d) === a && Math.min(h.w, h.d) === b);
      path([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true); g.fillStyle = ok ? '#b8664a' : '#ff00aa'; g.fill(); g.strokeStyle = '#3b2518'; g.lineWidth = 1.5; g.stroke();
      const along = h.w > h.d || (h.w === h.d && !h.turn);
      path(along ? [[x0 + .8, h.y], [x1 - .8, h.y]] : [[h.x, y0 + .8], [h.x, y1 - .8]]); g.strokeStyle = 'rgba(255,220,190,.7)'; g.stroke();
    }
    // capture points
    for (const p of def.points) {
      const [x, y] = toS(p.x, p.y), r = (p.type === 'victory' ? 8 : 6.5) * k;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = POINT_COL[p.type]; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = POINT_COL[p.type]; g.beginPath(); g.arc(x, y, Math.max(7, 2.2 * k), 0, 7); g.fill();
      label({ standard: 'S', munitions: 'M', fuel: 'F', victory: 'VP' }[p.type], x, y, '#111', Math.max(9, 2.4 * k));
    }
    // bases: HQ, the flat ground round it (40 m) and the space to keep clear (34 m)
    def.bases.forEach((b, i) => {
      const [x, y] = toS(b.x, b.y), col = i ? '#ff5a4a' : '#4aa3ff';
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.arc(x, y, 40 * k, 0, 7); g.stroke(); g.setLineDash([]);
      g.globalAlpha = .12; g.fillStyle = col; g.beginPath(); g.arc(x, y, 34 * k, 0, 7); g.fill(); g.globalAlpha = 1;
      g.fillStyle = col; g.fillRect(x - 5 * k, y - 5 * k, 10 * k, 10 * k);
      label('Base ' + (i + 1), x, y, '#fff', Math.max(11, 3 * k));
    });
    // notes and sketches
    for (const n of def.notes) {
      if (n.pts) { path(n.pts); g.strokeStyle = n.color || NOTE_COL[0]; g.lineWidth = Math.max(2.5, .9 * k); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
      else { const [x, y] = toS(n.x, n.y); g.font = `700 ${Math.max(12, 3.2 * k) | 0}px Inter, system-ui, sans-serif`; const w = g.measureText(n.text || '').width; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x - 3, y - Math.max(12, 3.2 * k) - 2, w + 6, Math.max(12, 3.2 * k) + 7); g.fillStyle = n.color || NOTE_COL[0]; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(n.text || '', x, y); }
    }
    if (forPicture) return;
    // the line being drawn
    if (draft) {
      const P = draft.pts;
      if (P.length) { path(P, draft.poly && P.length > 2); g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([6, 4]); g.stroke(); g.setLineDash([]); }
      for (const [x, y] of P) { const [a, b] = toS(x, y); g.fillStyle = '#fff'; g.beginPath(); g.arc(a, b, 5, 0, 7); g.fill(); }
    }
    // selection
    if (sel) {
      const it = def[sel.list][sel.i]; if (!it) { sel = null; return; }
      g.strokeStyle = '#ffe14d'; g.lineWidth = 2;
      if (LINE_LISTS.includes(sel.list) || (sel.list === 'notes' && it.pts)) {
        path(ptsOf(it), sel.list === 'fields'); g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
        for (const [x, y] of ptsOf(it)) { const [a, b] = toS(x, y); g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(a, b, 7, 0, 7); g.fill(); g.strokeStyle = '#000'; g.stroke(); }
      } else {
        const [x, y] = toS(it.x, it.y), r = Math.max(14, (it.r || (it.w ? Math.max(it.w, it.d) / 1.4 : 8)) * k + 4);
        g.beginPath(); g.arc(x, y, r, 0, 7); g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
      }
    }
    // problems from the last check
    if (check) for (const s of check.marks || []) { const [x, y] = toS(s[0], s[1]); g.strokeStyle = '#ff3b3b'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 12, 0, 7); g.stroke(); }
  }
  function label(t, x, y, col, size) { g.font = `800 ${(size || 11) | 0}px Inter, system-ui, sans-serif`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); }
  const centroid = P => { let x = 0, y = 0; for (const p of P) { x += p[0] / P.length; y += p[1] / P.length; } return [x, y]; };
  function frame() { if (!open_) return; requestAnimationFrame(frame); if (!dirty) return; dirty = false; draw(cv.getContext('2d')); }

  /* ---------------- finding things under a tap ---------------- */
  function hit(wx, wy) {
    const tol = 9 / cam.k + .8;
    const segNear = P => { for (let i = 0; i < P.length - 1; i++) if (U.segDist2(wx, wy, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]) < tol * tol) return true; return false; };
    const order = [['notes', n => n.pts ? segNear(n.pts) : Math.hypot(wx - n.x, wy - n.y) < tol + 4], ['bases', b => Math.hypot(wx - b.x, wy - b.y) < 6 + tol],
      ['points', p => Math.hypot(wx - p.x, wy - p.y) < 4 + tol], ['houses', h => Math.abs(wx - h.x) < h.w / 2 + tol * .4 && Math.abs(wy - h.y) < h.d / 2 + tol * .4],
      ['trees', t => Math.hypot(wx - t.x, wy - t.y) < 2 + tol * .5], ['craters', c => Math.hypot(wx - c.x, wy - c.y) < c.r + tol * .5],
      ['walls', l => segNear(l)], ['hedges', l => segNear(l)], ['sandbags', l => segNear(l)], ['treelines', l => segNear(l.pts)], ['roads', r => segNear(r.pts)],
      ['hills', h => Math.abs(Math.hypot(wx - h.x, wy - h.y) - h.r) < tol || Math.hypot(wx - h.x, wy - h.y) < tol], ['fields', f => MAP.inPoly(f.pts, wx, wy)]];
    for (const [list, f] of order) for (let i = def[list].length - 1; i >= 0; i--) if (f(def[list][i])) return { list, i };
    return null;
  }
  function vertexAt(sx, sy) {
    if (!sel) return -1; const it = def[sel.list][sel.i]; if (!it || !(LINE_LISTS.includes(sel.list) || (sel.list === 'notes' && it.pts))) return -1;
    const P = ptsOf(it); for (let i = 0; i < P.length; i++) { const [a, b] = toS(P[i][0], P[i][1]); if (Math.hypot(a - sx, b - sy) < 16 * (cv.dpr || 1)) return i; }
    return -1;
  }

  /* ---------------- placing and moving ---------------- */
  const r1 = n => Math.round(n * 2) / 2;
  const inMap = (x, y) => x >= 2 && y >= 2 && x <= def.w - 2 && y <= def.h - 2;
  const turned = (x, y) => [def.w - x, def.h - y];
  function addItem(list, it) {
    def[list].push(it);
    if (mirror && list !== 'notes' && list !== 'bases') {
      const c = clone(it);
      if (c.pts) c.pts = c.pts.map(p => turned(...p)); else if (Array.isArray(c)) c.forEach((p, i) => { c[i] = turned(...p); }); else [c.x, c.y] = turned(c.x, c.y);
      def[list].push(c);
    }
    sel = { list, i: def[list].length - (mirror && list !== 'notes' && list !== 'bases' ? 2 : 1) };
  }
  function place(wx, wy) {
    if (!inMap(wx, wy)) return;
    const x = r1(wx), y = r1(wy), o = opt[tool];
    change();
    switch (tool) {
      case 'house': addItem('houses', { x, y, w: o.w, d: o.d, ...(o.turn ? { turn: 1 } : {}) }); break;
      case 'tree': addItem('trees', { kind: o.kind, x, y }); break;
      case 'hill': addItem('hills', { x, y, r: o.r, h: o.h }); break;
      case 'point': addItem('points', { type: o.type, x, y }); break;
      case 'crater': addItem('craters', { x, y, r: o.r }); break;
      case 'note': addItem('notes', { x, y, text: o.text || 'Note', color: o.color }); break;
      case 'base': {
        const s = +o.slot; def.bases[s] = { x, y };
        if (mirror) { const [a, b] = turned(x, y); def.bases[1 - s] = { x: a, y: b }; }
        sel = { list: 'bases', i: s }; break;
      }
    }
    changed();
  }
  function finishDraft() {
    if (!draft) return;
    const T = TOOLS.find(t => t.id === draft.tool), P = draft.pts;
    if (P.length >= T.line) {
      change();
      const o = opt[draft.tool];
      if (T.list === 'roads') addItem('roads', { kind: o.kind, pts: P });
      else if (T.list === 'fields') addItem('fields', { kind: o.kind, pts: P, rot: o.rot || 0 });
      else if (T.list === 'treelines') addItem('treelines', { kind: o.kind, pts: P, gap: o.gap });
      else addItem(T.list, P);
      changed();
    }
    draft = null; dirty = true; panel();
  }
  function moveSel(dx, dy, vi, base) {
    const it = def[sel.list][sel.i];
    if (vi >= 0) { const P = ptsOf(it); P[vi] = [r1(base[vi][0] + dx), r1(base[vi][1] + dy)]; }
    else if (it.x != null) { it.x = r1(base.x + dx); it.y = r1(base.y + dy); }
    else { const P = ptsOf(it); P.forEach((p, i) => { P[i] = [r1(base[i][0] + dx), r1(base[i][1] + dy)]; }); }
    check = null; dirty = true;
  }
  function erase(s) { if (s.list === 'bases') { flash('Bases can be moved, not removed'); return; } change(); def[s.list].splice(s.i, 1); sel = null; changed(); }

  /* ---------------- pointer input (mouse and touch) ---------------- */
  const ptrs = new Map(); let gest = null;
  function down(e) {
    cv.setPointerCapture(e.pointerId);
    const r = cv.dpr || 1, sx = e.clientX * r, sy = e.clientY * r;
    ptrs.set(e.pointerId, { x: sx, y: sy });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, k: cam.k, u: cam.u, v: cam.v }; if (draft && draft.tool === 'sketch') draft = null; return; }
    if (ptrs.size > 2) return;
    const [wx, wy] = toW(sx, sy);
    gest = { sx, sy, wx, wy, moved: false, button: e.button, u: cam.u, v: cam.v };
    if (e.button === 1 || e.button === 2) { gest.pan = true; return; }
    if (tool === 'sketch') { draft = { tool: 'sketch', pts: [[r1(wx), r1(wy)]] }; gest.sketch = true; return; }
    if (tool === 'select') {
      const vi = vertexAt(sx, sy);
      if (vi >= 0) { change(); gest.drag = { vi, base: clone(ptsOf(def[sel.list][sel.i])) }; return; }
      const h = hit(wx, wy);
      if (h && sel && h.list === sel.list && h.i === sel.i) { change(); const it = def[sel.list][sel.i]; gest.drag = { vi: -1, base: it.x != null ? { x: it.x, y: it.y } : clone(ptsOf(it)) }; return; }
      gest.pick = h; gest.pan = true; return;
    }
    gest.pan = true;                                 // other tools: a drag pans, a tap places
  }
  function move(e) {
    if (!ptrs.has(e.pointerId)) return;
    const r = cv.dpr || 1, sx = e.clientX * r, sy = e.clientY * r; ptrs.set(e.pointerId, { x: sx, y: sy });
    if (!gest) return;
    if (gest.pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.k = U.clamp(gest.k * d / Math.max(1, gest.d), .5, 40);
      cam.u = gest.u + (gest.mx - cv.width / 2) / gest.k - (mx - cv.width / 2) / cam.k; cam.v = gest.v + (gest.my - cv.height / 2) / gest.k - (my - cv.height / 2) / cam.k;
      dirty = true; return;
    }
    if (Math.hypot(sx - gest.sx, sy - gest.sy) > 8 * r) gest.moved = true;
    if (gest.sketch) { const [wx, wy] = toW(sx, sy), L = draft.pts[draft.pts.length - 1]; if (Math.hypot(wx - L[0], wy - L[1]) > 1.2) draft.pts.push([r1(wx), r1(wy)]); dirty = true; return; }
    if (gest.drag) { const [wx, wy] = toW(sx, sy); moveSel(wx - gest.wx, wy - gest.wy, gest.drag.vi, gest.drag.base); return; }
    if (gest.pan && gest.moved) { cam.u = gest.u - (sx - gest.sx) / cam.k; cam.v = gest.v - (sy - gest.sy) / cam.k; dirty = true; }
  }
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (!gest) return;
    if (gest.pinch) { if (!ptrs.size) gest = null; return; }
    const G2 = gest; gest = null;
    if (G2.sketch) { if (draft && draft.pts.length > 1) { change(); def.notes.push({ pts: draft.pts, color: opt.sketch.color }); changed(); } draft = null; dirty = true; return; }
    if (G2.drag) { if (!G2.moved) undo.pop(); else changed(); return; }
    if (G2.moved || G2.button === 1 || G2.button === 2) return;
    // a tap
    const { wx, wy } = G2, T = TOOLS.find(t => t.id === tool);
    if (tool === 'select') { sel = G2.pick; dirty = true; panel(); return; }
    if (tool === 'erase') { const h = hit(wx, wy); if (h) erase(h); return; }
    if (T.line) { if (!inMap(wx, wy)) return; if (!draft || draft.tool !== tool) draft = { tool, pts: [], poly: !!T.poly }; draft.pts.push([r1(wx), r1(wy)]); dirty = true; panel(); return; }
    place(wx, wy);
  }
  function wheel(e) {
    e.preventDefault(); const r = cv.dpr || 1, sx = e.clientX * r, sy = e.clientY * r, before = [(sx - cv.width / 2) / cam.k + cam.u, (sy - cv.height / 2) / cam.k + cam.v];
    cam.k = U.clamp(cam.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), .5, 40);
    cam.u = before[0] - (sx - cv.width / 2) / cam.k; cam.v = before[1] - (sy - cv.height / 2) / cam.k; dirty = true;
  }
  function key(e) {
    if (!open_ || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
    if (e.key === 'Enter') finishDraft();
    else if (e.key === 'Escape') { if (draft) draft = null; else sel = null; dirty = true; panel(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) erase(sel);
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.shiftKey ? doRedo() : doUndo(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { doRedo(); e.preventDefault(); }
  }

  /* ---------------- panels ---------------- */
  function tools() {
    const box = $('#ed-tools'); box.innerHTML = '';
    for (const t of TOOLS) { const b = document.createElement('button'); b.textContent = t.label; b.dataset.tool = t.id; b.className = t.id === tool ? 'on' : ''; b.onclick = () => { if (draft && draft.tool !== t.id) finishDraft(); tool = t.id; sel = null; tools(); panel(); dirty = true; }; box.appendChild(b); }
  }
  /* the settings strip: the selected thing's, else the tool's */
  function panel() {
    const box = $('#ed-props'); box.innerHTML = '';
    const T = TOOLS.find(t => t.id === tool), add = el => { box.appendChild(el); return el; };
    const btn = (txt, f, cls) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = f; if (cls) b.className = cls; return add(b); };
    const span = txt => { const s = document.createElement('span'); s.textContent = txt; return add(s); };
    $('#ed-hint').textContent = draft ? (draft.poly ? `${draft.pts.length} corners. Tap more, then Done.` : `${draft.pts.length} points. Tap more, then Done.`) : T.hint;
    if (draft) { btn('Done', finishDraft, 'go'); btn('Back one', () => { draft.pts.pop(); if (!draft.pts.length) draft = null; dirty = true; panel(); }); btn('Cancel', () => { draft = null; dirty = true; panel(); }); }
    let it = null, list = T.list, o = opt[tool];
    if (sel) { it = def[sel.list][sel.i]; list = sel.list; o = it; span(({ roads: 'Road', fields: 'Field', houses: 'House', walls: 'Wall', hedges: 'Hedge', sandbags: 'Sandbags', treelines: 'Tree row', trees: 'Tree', hills: 'Hill', points: 'Point', craters: 'Crater', bases: 'Base', notes: 'Note' })[list] + ':'); }
    if (!it && !o) return;
    const set = (k, v) => { if (it) { change(); it[k] = v; changed(); } else { o[k] = v; panel(); } };
    for (const [k, name, kind] of PROPS[list] || []) {
      if (list === 'bases' && it) continue;
      if (list === 'notes' && it && it.pts && k === 'text') continue;
      if (kind === 'size') {
        const s = document.createElement('select');
        for (const [a, b] of FOOT) { const op = document.createElement('option'); op.value = a + 'x' + b; op.textContent = `${a} x ${b} m`; s.appendChild(op); }
        s.value = Math.max(o.w, o.d) + 'x' + Math.min(o.w, o.d);
        s.onchange = () => { const [a, b] = s.value.split('x').map(Number), along = o.w >= o.d; if (it) change(); o.w = along ? a : b; o.d = along ? b : a; if (it) changed(); else panel(); };
        span(name); add(s);
      } else if (kind === 'turn') {
        btn('Turn', () => { if (it) change(); if (o.w === o.d) o.turn = o.turn ? 0 : 1; else [o.w, o.d] = [o.d, o.w]; if (it) changed(); else panel(); });
      } else if (kind === 'angle') {
        span(name); const s = document.createElement('input'); s.type = 'range'; s.min = 0; s.max = 180; s.step = 15; s.value = Math.round((o.rot || 0) * 180 / Math.PI);
        s.onchange = () => set('rot', +s.value * Math.PI / 180); add(s);
      } else if (kind === 'text') {
        const s = document.createElement('input'); s.type = 'text'; s.value = o.text || ''; s.placeholder = 'note text'; s.onchange = () => set('text', s.value); add(s);
      } else if (k === 'color') {
        span(name); for (const c of kind) { const b = btn('', () => set('color', c), 'sw' + (o.color === c ? ' on' : '')); b.style.background = c; }
      } else {
        span(name); const s = document.createElement('select');
        for (const v of kind) { const op = document.createElement('option'); op.value = v; op.textContent = list === 'bases' ? `Base ${+v + 1}` : String(v); s.appendChild(op); }
        s.value = String(o[k]); s.onchange = () => set(k, typeof kind[0] === 'number' ? +s.value : s.value); add(s);
      }
    }
    if (tool === 'sketch' && !it) { span('Colour'); for (const c of NOTE_COL) { const b = btn('', () => { opt.sketch.color = c; panel(); }, 'sw' + (opt.sketch.color === c ? ' on' : '')); b.style.background = c; } }
    if (it && list !== 'bases') btn('Delete', () => erase(sel), 'warn');
  }
  function status() {
    $('#ed-mirror').classList.toggle('on', mirror); $('#ed-grid').classList.toggle('on', grid);
    $('#ed-name').value = def.name || '';
  }

  /* ---------------- check, files, play ---------------- */
  function runCheck() {
    const out = $('#ed-out'); let html = '';
    try {
      const m = MAP.create(7, clone(def)), r = MAP.check(m, def);
      check = { marks: [] };
      for (const p of r.problems) { const mm = /\((\d+), (\d+)\)/.exec(p); if (mm) check.marks.push([+mm[1], +mm[2]]); }
      html += `<b>${r.problems.length ? r.problems.length + ' problem' + (r.problems.length > 1 ? 's' : '') : 'Playable'}</b>`;
      if (r.problems.length) html += '<ul>' + r.problems.map(p => `<li class="bad">${esc(p)}</li>`).join('') + '</ul>';
      html += `<div class="dim">${m.houses.length} houses, ${m.points.length} points, ${m.trees.length} trees</div>`;
      if (r.sides.length) {
        const n = (S, t) => S.nearest[t] == null ? '-' : Math.round(S.nearest[t]) + ' m';
        html += '<table><tr><th>Walk from</th><th>Base 1</th><th>Base 2</th></tr>' + ['standard', 'munitions', 'fuel', 'victory'].map(t => `<tr><td>nearest ${t}</td><td>${n(r.sides[0], t)}</td><td>${n(r.sides[1], t)}</td></tr>`).join('')
          + `<tr><td>all VPs</td><td>${Math.round(r.sides[0].vpWalk)} m</td><td>${Math.round(r.sides[1].vpWalk)} m</td></tr>`
          + `<tr><td>points nearer</td><td>${Object.values(r.sides[0].near).reduce((a, b) => a + b, 0)}</td><td>${Object.values(r.sides[1].near).reduce((a, b) => a + b, 0)}</td></tr></table>`;
      }
      html += r.warn.length ? '<div>Balance:</div><ul>' + r.warn.map(w => `<li class="warn">${esc(w)}</li>`).join('') + '</ul>' : '<div class="ok">The two halves are balanced.</div>';
    } catch (err) { html = `<b class="bad">Could not build the map: ${esc(err.message)}</b>`; }
    out.innerHTML = html; out.classList.remove('hide'); dirty = true;
  }
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
  const fileName = ext => (def.name || 'map').replace(/[^\w-]+/g, '_').toLowerCase() + '.' + ext;
  function picture() {                               // the whole map, notes included, at a fixed size
    const c = document.createElement('canvas'); c.width = c.height = 2000;
    const keep = { ...cam }, kcv = cv; cv = c; cam.u = 0; cam.v = 0; cam.k = 1980 / (def.w * Math.SQRT2);
    draw(c.getContext('2d'), true); cv = kcv; Object.assign(cam, keep); dirty = true;
    return c;
  }
  function filesPanel() {
    const out = $('#ed-out');
    out.innerHTML = `<b>Map files</b><div class="dim">Send me the JSON (or paste it) and the picture, and I can build the map from them.</div>
      <div class="row2"><button id="ed-xjson">Download JSON</button><button id="ed-xcopy">Copy JSON</button><button id="ed-xpng">Download picture</button></div>
      <textarea id="ed-json" spellcheck="false"></textarea>
      <div class="row2"><button id="ed-ximport">Load this JSON</button><label class="filebtn">Open JSON file<input type="file" id="ed-xfile" accept=".json,application/json"></label></div>
      <b>Start from</b><div class="row2"><button id="ed-xnew">Blank map</button>${Object.keys(MAPS).filter(k => k !== 'default').map(k => `<button data-map="${k}">${esc(MAPS[k].name)}</button>`).join('')}</div>
      <b>Reference picture</b><div class="dim">Lay a picture under the map to trace over (kept in this browser only).</div>
      <div class="row2"><label class="filebtn">Choose picture<input type="file" id="ed-ximg" accept="image/*"></label><button id="ed-ximgmode">${imgOpt.mode === 'map' ? 'Fit: map square' : 'Fit: upright'}</button><button id="ed-ximgturn">Turn picture</button><button id="ed-ximgoff">Remove</button></div>
      <div class="row2"><span>Opacity</span><input type="range" id="ed-ximga" min="0" max="1" step=".05" value="${imgOpt.alpha}"></div>`;
    out.classList.remove('hide');
    const ta = $('#ed-json'); ta.value = JSON.stringify(def);
    const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
    on('#ed-xjson', () => download(fileName('json'), new Blob([JSON.stringify(def, null, 1)], { type: 'application/json' })));
    on('#ed-xcopy', () => { ta.select(); try { navigator.clipboard.writeText(ta.value).then(() => flash('Copied the map JSON'), () => { document.execCommand('copy'); flash('Copied the map JSON'); }); } catch (e) { document.execCommand('copy'); flash('Copied the map JSON'); } });
    on('#ed-xpng', () => picture().toBlob(b => download(fileName('png'), b)));
    on('#ed-ximport', () => { try { const d = JSON.parse(ta.value); if (!d.bases || !d.points) throw new Error('not a map (no bases or points)'); change(); def = tidy(d); sel = null; changed(); status(); fit(); flash('Map loaded'); } catch (e) { flash('Could not read that JSON: ' + e.message); } });
    $('#ed-xfile').onchange = ev => { const f = ev.target.files[0]; if (!f) return; f.text().then(t => { ta.value = t; $('#ed-ximport').click(); }); };
    on('#ed-xnew', () => { change(); def = blank(); sel = null; changed(); status(); fit(); });
    out.querySelectorAll('[data-map]').forEach(b => { b.onclick = () => { change(); def = tidy(clone(MAPS[b.dataset.map])); sel = null; changed(); status(); fit(); }; });
    $('#ed-ximg').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { setImage(rd.result); try { localStorage.setItem(IMGKEY, rd.result); } catch (e) { flash('Picture too big to keep after closing; it shows for now'); } }; rd.readAsDataURL(f); };
    on('#ed-ximgmode', () => { imgOpt.mode = imgOpt.mode === 'map' ? 'upright' : 'map'; saveImgOpt(); filesPanel(); dirty = true; });
    on('#ed-ximgturn', () => { imgOpt.turn = (imgOpt.turn + 1) % 4; saveImgOpt(); dirty = true; });
    on('#ed-ximgoff', () => { img = null; try { localStorage.removeItem(IMGKEY); } catch (e) {} dirty = true; });
    $('#ed-ximga').oninput = ev => { imgOpt.alpha = +ev.target.value; saveImgOpt(); dirty = true; };
  }
  function setImage(src) { const im = new Image(); im.onload = () => { img = im; dirty = true; }; im.src = src; }
  function saveImgOpt() { try { localStorage.setItem(IMGKEY + '-opt', JSON.stringify(imgOpt)); } catch (e) {} }
  function playPanel() {
    const out = $('#ed-out');
    out.innerHTML = `<b>Play this map</b><div class="dim">Starts a match on the map as it is now.</div>
      <div class="row2"><button data-play="us">Skirmish as US</button><button data-play="de">Skirmish as Wehrmacht</button><button data-play="watch">Watch AI</button></div>`;
    out.classList.remove('hide');
    out.querySelectorAll('[data-play]').forEach(b => { b.onclick = () => {
      const m = MAP.create(7, clone(def)), r = MAP.check(m, def);
      if (r.problems.length) { runCheck(); flash('Fix the problems first'); return; }
      const p = b.dataset.play; close(); MAIN.start(p === 'watch' ? 'us' : p, p === 'watch' ? 'spectate' : 'skirmish', clone(def));
    }; });
  }
  let flashT = 0;
  function flash(t) { const f = $('#ed-flash'); f.textContent = t; f.classList.remove('hide'); clearTimeout(flashT); flashT = setTimeout(() => f.classList.add('hide'), 2600); }

  /* ---------------- open / close ---------------- */
  function bind() {
    if (shown) return; shown = true;
    cv = $('#edcv');
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('dblclick', () => finishDraft());
    addEventListener('keydown', key); addEventListener('resize', () => { if (open_) resize(); });
    const on = (id, f) => { $(id).onclick = f; };
    on('#ed-back', () => { close(); MAIN.toMain(); });
    on('#ed-undo', doUndo); on('#ed-redo', doRedo);
    on('#ed-mirror', () => { mirror = !mirror; status(); flash(mirror ? 'Mirror on: new things get a turned copy for the other side' : 'Mirror off'); });
    on('#ed-grid', () => { grid = !grid; status(); dirty = true; });
    on('#ed-fit', () => { fit(); dirty = true; });
    const toggle = f => () => { const out = $('#ed-out'); if (!out.classList.contains('hide') && out.dataset.p === f.name) { out.classList.add('hide'); return; } out.dataset.p = f.name; f(); };
    on('#ed-check', toggle(runCheck)); on('#ed-files', toggle(filesPanel)); on('#ed-play', toggle(playPanel));
    $('#ed-name').onchange = ev => { change(); def.name = ev.target.value || 'My map'; changed(); };
    try { const s = localStorage.getItem(IMGKEY); if (s) setImage(s); Object.assign(imgOpt, JSON.parse(localStorage.getItem(IMGKEY + '-opt') || '{}')); } catch (e) {}
  }
  function open() {
    bind(); def = def || load(); open_ = true; resize(); if (!open.fitted) { fit(); open.fitted = true; }
    $('#ed-out').classList.add('hide'); tools(); panel(); status(); dirty = true; requestAnimationFrame(frame);
  }
  function close() { open_ = false; draft = null; }
  return { open, close, current, hasSaved, isOpen: () => open_, _state: () => ({ def, tool, sel, draft, cam }), _setTool: t => { tool = t; tools(); panel(); }, toScreen: (x, y) => { const [a, b] = toS(x, y); return [a / (cv.dpr || 1), b / (cv.dpr || 1)]; } };
})();
if (typeof module !== 'undefined') module.exports = EDITOR;
