// Farmhouse art in the renderer, without a browser: node game/test/houses.js. render.js runs against a recording canvas;
// every map house must have art of its footprint, and draw it (with its shadow) in the right stage at the right spot.
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..'), src = p => path.join(ROOT, 'game', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js'));
global.ArtKit = require(path.join(ROOT, 'artkit/runtime/artkit.js'));
const calls = [];
function ctx2d(cv) {
  const noop = () => {}, grad = { addColorStop: noop };
  return new Proxy({ canvas: cv, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createPattern: () => ({ setTransform: noop }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, measureText: () => ({ width: 10 }),
    drawImage: (im, ...a) => { if (cv.main) calls.push({ im, a }); } }, { get: (t, k) => k in t ? t[k] : noop, set: (t, k, v) => (t[k] = v, true) });
}
function mkCanvas(w = 1, h = 1) { const c = { width: w, height: h, style: {} }; c.getContext = () => c._c || (c._c = ctx2d(c)); return c; }
global.document = { createElement: () => mkCanvas() };
global.window = global; global.Image = function () { };
vm.runInThisContext(fs.readFileSync(src('render.js'), 'utf8').replace('const RENDER =', 'global.RENDER ='));
const sc = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/scenery.json'))), lib = {};
for (const k in sc) { const o = { m: sc[k], img: {}, mask: {} }; for (const st in sc[k].states) { o.img['s:' + st] = { tag: k + ':' + st, width: 10, height: 10 }; o.img['h:' + st] = { tag: k + ':' + st + ':shadow', width: 10, height: 10 }; } lib[k] = o; }
const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'crew_layout.json')));
const G = SIM.create({ seed: 7, playerSide: 'us', crewLayout: layout });
const view = mkCanvas(1600, 900); view.main = true;
RENDER.init(view, lib, G); RENDER.resize(1600, 900, 1);
const H = G.map.houses; let bad = 0;
console.log('houses:', H.map(h => `${h.w}x${h.d}:${h.art}`).join(' '));
if (H.some(h => !h.art || !sc[h.art])) { console.log('FAIL a house has no art'); bad++; }
for (const h of H) if (Math.abs(sc[h.art].metres[0] - h.w) > .01 || Math.abs(sc[h.art].metres[1] - h.d) > .01) { console.log('FAIL footprint', h.w, h.d, h.art, sc[h.art].metres); bad++; }
SIM.damageHouse(G, H[0], 600, null);                          // 50%: damaged
SIM.damageHouse(G, H[1], 5000, null);                         // collapsed: ruined
const ui = { selected: new Set(), hover: null, hoverPoint: null, mode: null, page: 'main', ghost: null, coverPreview: null, noFog: true };
for (const [i, want] of [[0, 'damaged'], [1, 'ruined'], [2, 'normal']]) {
  const h = H[i]; RENDER.cam.x = h.x; RENDER.cam.y = h.y; RENDER.cam.k = 1; calls.length = 0;
  RENDER.frame(G, ui, 0);
  const got = calls.filter(c => c.im && c.im.tag && c.im.tag.startsWith(h.art + ':')).map(c => c.im.tag);
  // the sprite's near corner lands on the footprint's near corner (another house with the same art may be in view too)
  const S = sc[h.art].states[want], [nx, ny] = RENDER.toScreen(h.x + h.w / 2, h.y + h.d / 2);
  const sprite = calls.find(c => c.im && c.im.tag === h.art + ':' + want && Math.abs(c.a[0] + S.near_corner[0] - nx) < .01 && Math.abs(c.a[1] + S.near_corner[1] - ny) < .01);
  const ok = sprite && got.includes(h.art + ':' + want + ':shadow'), pos = !!sprite;
  console.log(`house ${i} ${h.art}: want ${want}, drew [${[...new Set(got)].join(', ')}] ${ok && pos ? 'ok' : 'FAIL'}`); if (!(ok && pos)) bad++;
  const rubble = G.map.covers.filter(c => c.house === h.id);
  if (want === 'ruined' && !rubble.length) { console.log('FAIL no rubble cover after collapse'); bad++; }
}
console.log(bad ? `${bad} problems` : "no problems"); process.exit(bad ? 1 : 0);
