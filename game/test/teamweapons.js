// Team weapons, field defences and blasts: range tests with set numbers, then AI-vs-AI tallies.
// node game/test/teamweapons.js [games=4] [minutes=16]
//   range:   how fast each machine gun suppresses and pins a squad in the open, behind a hedge and behind sandbags; two
//            squads charging one gun; mortars against a dug-in MG and a squad behind sandbags (with ranging in);
//            sandbag lines breaking into pieces under fire and tanks flattening only what they drive over
//   AI:      men killed by MGs and mortars, squads pinned by MGs, sandbag pieces lost and re-laid
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAPS = require(src('maps.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const games = +(process.argv[2] || 4), mins = +(process.argv[3] || 16);
let problems = 0;
const fail = msg => { problems++; console.log('PROBLEM: ' + msg); };
const alive = e => e.models.filter(m => m.alive).length;
// the set-piece tests below need flat open ground to shoot across: a bare firing range with the usual two bases
const RANGE = { id: 'range', name: 'Firing range', w: 200, h: 200, swell: 0, pointBags: false, bases: MAPS[MAPS.default].bases, points: [{ type: 'victory', x: 100, y: 100 }] };
function world(seed) { const G = SIM.create({ seed, crewLayout: layout, map: RANGE }); G.players.forEach(P => { P.res.mp = 1e5; P.res.mu = 1e5; P.res.fu = 1e5; }); return G; }
// a row of open ground, clear of cover and sight blockers, from x0 to x1
function openRow(G, x0, x1) {
  for (let y = 20; y < 180; y += 2) {
    let ok = true;
    for (let dy = -6; dy <= 6; dy += 2) if (!MAP.los(G.map, x0, y + dy, x1, y + dy)) ok = false;
    for (let x = x0 - 2; x <= x1 + 2 && ok; x += 1) for (let dy = -6; dy <= 6; dy += 3) if (MAP.coverAt(G.map, x, y + dy) !== 'none' || !MAP.walkable(MAP.navGrids(G.map).inf, G.map, x, y + dy)) ok = false;
    if (ok) return y;
  }
  return null;
}
function run(G, secs, each) { const end = G.t + secs; while (G.t < end) { SIM.step(G, SIM.DT); if (each && each() === false) break; } }
const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
const f1 = v => v == null ? 'never' : v.toFixed(1) + ' s';

/* ---- machine guns ---- */
console.log('machine guns (time from the first shot, 32 m, squad standing still):');
const LIMIT = { de_hmg: { open: 6, light: 12 }, us_hmg: { open: 8, light: 16 } };
for (const mg of ['de_hmg', 'us_hmg']) {
  const row = {};
  for (const where of ['open', 'light', 'heavy']) {
    const sup = [], pin = [];
    for (const seed of [7, 9, 11]) {
      const G = world(seed); FOG.visible = FOG.visible;   // real sight
      const y = openRow(G, 50, 95); if (y == null) { fail('no open row on seed ' + seed); continue; }
      const M = SIM.spawnSquad(G, mg, 1, 85, y); SIM.setup(G, M, Math.PI); run(G, 4);
      const S = SIM.spawnSquad(G, mg === 'de_hmg' ? 'us_riflemen' : 'de_grenadiers', 0, 53, y);
      S.models.forEach(m => m.weapon = null);        // the target only takes fire
      if (where !== 'open') { const kind = where === 'light' ? 'hedge' : 'sandbags', x = Math.max(...S.models.map(m => m.x)) + .7; G.map.addCover(kind, x, y - 8, x, y + 8, { cover: where, hp: 300 }); }
      run(G, 1.5);                                   // men settle in
      let t0 = null, ts = null, tp = null;
      run(G, 25, () => { if (t0 == null && M.cwFireT) t0 = G.t; if (t0 != null && ts == null && S.suppState >= 1) ts = G.t - t0; if (t0 != null && tp == null && S.suppState === 2) tp = G.t - t0; if (tp != null || S.dead) return false; });
      sup.push(ts); pin.push(tp);
    }
    const ok = v => v.filter(x => x != null);
    row[where] = { sup: ok(sup).length ? avg(ok(sup)) : null, pin: ok(pin).length === pin.length ? avg(pin) : null, pinned: ok(pin).length };
    console.log(`  ${mg} ${where.padEnd(5)}: suppressed after ${f1(row[where].sup)}, pinned after ${f1(row[where].pin)} (${row[where].pinned}/3 pinned in 25 s)`);
  }
  if (row.open.pin == null || row.open.pin > LIMIT[mg].open) fail(`${mg} pins a squad in the open too slowly`);
  if (row.light.pin == null || row.light.pin > LIMIT[mg].light) fail(`${mg} pins a squad behind a hedge too slowly`);
  if (row.heavy.pin != null && row.heavy.pin < row.open.pin * 2) fail(`${mg}: sandbags hardly slow pinning`);
}
// two squads charging one gun from 40 m: both should be pinned before they reach it
{
  let both = 0, closest = 1e9;
  for (const seed of [7, 9, 11]) {
    const G = world(seed), y = openRow(G, 55, 100); if (y == null) continue;
    const M = SIM.spawnSquad(G, 'us_hmg', 1, 95, y); SIM.setup(G, M, Math.PI); run(G, 4);
    const A = SIM.spawnSquad(G, 'de_grenadiers', 0, 55, y - 4), B = SIM.spawnSquad(G, 'de_grenadiers', 0, 55, y + 4);
    SIM.issue(G, [A.id], { type: 'move', x: 92, y: y - 2 }); SIM.issue(G, [B.id], { type: 'move', x: 92, y: y + 2 });
    run(G, 20, () => { for (const S of [A, B]) if (!S.dead) closest = Math.min(closest, Math.hypot(S.x - M.x, S.y - M.y)); });
    if (A.suppState === 2 && B.suppState === 2) both++;
  }
  console.log(`  two squads charging an M1919 from 40 m: both pinned in ${both}/3, closest they got ${closest.toFixed(0)} m`);
  if (both < 2 || closest < 8) fail('an MG does not stop two squads charging it');
}

/* ---- mortars ---- */
console.log('mortars (50 m, 60 s, target in sight):');
const vis = FOG.visible, rangedIn = [];
for (const [mo, tgt, cover] of [['de_mortar', 'us_hmg', null], ['us_mortar', 'de_hmg', null], ['us_mortar', 'de_grenadiers', 'sandbags']]) {
  const kills = [], shells = [], miss = [], firstMiss = [], lastMiss = [];
  for (const seed of [7, 9, 11, 13]) {
    const G = world(seed), y = openRow(G, 45, 100); if (y == null) continue;
    FOG.visible = () => true;
    const M = SIM.spawnSquad(G, mo, 1, 100, y); SIM.setup(G, M, Math.PI);
    const S = SIM.spawnSquad(G, tgt, 0, 50, y); S.models.forEach(m => m.weapon = null); if (S.crew) SIM.setup(G, S, Math.PI);
    if (cover) G.map.addCover(cover, 52.5, y - 6, 52.5, y + 6, { cover: 'heavy', hp: 220 });
    let n = 0; const mm = [];
    run(G, 60, () => { for (const p of G.projectiles) if (p.kind === 'mortar' && !p.seen) { p.seen = 1; n++; mm.push(Math.hypot(p.x - S.x, p.y - S.y)); } });
    FOG.visible = vis;
    kills.push(S.maxModels - alive(S)); shells.push(n); miss.push(avg(mm));
    if (mm.length >= 4) { firstMiss.push(avg(mm.slice(0, 2))); lastMiss.push(avg(mm.slice(-2))); }
  }
  console.log(`  ${mo} vs ${tgt}${cover ? ' behind ' + cover : ''}: ${avg(kills).toFixed(1)} men killed from ${avg(shells).toFixed(1)} shells; first two shells land ${avg(firstMiss).toFixed(1)} m off, the last two ${avg(lastMiss).toFixed(1)} m`);
  if (!cover && avg(kills) < 2) fail(`${mo} hardly hurts a set-up machine gun`);
  rangedIn.push(avg(firstMiss) - avg(lastMiss));
}
if (avg(rangedIn) <= .1) fail('mortars do not range in');

/* ---- sandbags breaking up ---- */
console.log('field defences:');
{
  const G = world(7), y = openRow(G, 40, 100);
  const c = G.map.addCover('sandbags', 60, y - 4, 60, y + 4, { cover: 'heavy', hp: 220, owner: 0 });
  const n0 = c.php.length;
  // mortar shells walked onto the middle of the line
  for (let i = 0; i < 6; i++) COMBAT.explode(G, 60 + (i % 2 ? .4 : -.4), y + (i % 3 - 1) * .3, 100, 3, 20, null, 1, 1.2, 'mortar');
  const lines = G.map.covers.filter(o => o.alive && o.kind === 'sandbags' && Math.abs(o.ax - 60) < .01 && Math.abs(o.bx - 60) < .01);
  const left = lines.reduce((s, o) => s + o.php.length, 0), debris = (G.map.debris || []).filter(d => d.kind === 'sandbags').length;
  console.log(`  six mortar shells on an 8 m sandbag line: ${n0 - left} of ${n0} pieces gone, ${lines.length} pieces of line left standing, ${debris} debris heaps`);
  if (left >= n0) fail('mortar shells did not break a sandbag line');
  if (!lines.length) fail('a few shells wiped out the whole 8 m line');
  if (lines.length < 2) fail('a shell in the middle did not split the line in two');
  if (debris !== n0 - left) fail('a lost piece left no debris');
  // the gap lets men through, the ends still give heavy cover from the front
  const ends = lines.map(o => MAP.coverAt(G.map, 59.2, (o.ay + o.by) / 2, 90, (o.ay + o.by) / 2));
  if (ends.some(k => k !== 'heavy' && k !== 'light')) fail('what is left of the line gives no cover');
  if (MAP.coverAt(G.map, 59.2, y, 90, y) === 'heavy') fail('the gap still gives heavy cover');
  // a worn piece gives less cover
  const w = G.map.addCover('sandbags', 70, y - 2, 70, y + 2, { cover: 'heavy', hp: 220 });
  w.php[1] = 220 * (MAP.WORN - .1);
  const kWorn = MAP.coverAt(G.map, 69.2, w.ay + 1.5, 90, w.ay + 1.5), kWhole = MAP.coverAt(G.map, 69.2, w.ay + 3.5, 90, w.ay + 3.5);
  console.log(`  a worn piece gives ${kWorn} cover, a whole one ${kWhole}`);
  if (kWorn !== 'light' || kWhole !== 'heavy') fail('worn sandbags should drop to light cover');
}
{
  const G = world(7), y = openRow(G, 55, 85);
  const c = G.map.addCover('sandbags', 70, y - 6, 70, y + 6, { cover: 'heavy', hp: 220 });
  const n0 = c.php.length;
  const T = SIM.spawnVehicle(G, 'us_sherman', 0, 60, y, 0);
  SIM.issue(G, [T.id], { type: 'move', x: 80, y });
  run(G, 15);
  const lines = G.map.covers.filter(o => o.alive && o.kind === 'sandbags' && Math.abs(o.ax - 70) < .01);
  const left = lines.reduce((s, o) => s + o.php.length, 0);
  console.log(`  a Sherman driving through a 12 m sandbag line flattens ${n0 - left} pieces, ${lines.length} stretches stay standing`);
  if (n0 - left < 1 || n0 - left > 5) fail('a tank should flatten only the sandbags it drives over');
  if (Math.hypot(T.x - 80, T.y - y) > 4) fail('the tank did not get through the sandbag line');
}
{
  const G = world(7), n0 = G.fx.length;
  COMBAT.explode(G, 100, 100, 100, 3, 20, null, 1, 1.2, 'mortar');
  const boom = G.fx.find(f => f.kind === 'boom');
  if (!boom || !boom.seed || !boom.src) fail('explosions carry no seed or kind for the effect');
  if (!G.map.scorch || !G.map.scorch.length) fail('explosions leave no scorch');
  if (!(G.shake > 0)) fail('explosions do not shake the camera');
}

/* ---- AI against AI ---- */
const T = { us: {}, de: {} }, add = (s, k, v = 1) => T[s][k] = (T[s][k] || 0) + v;
for (let g = 0; g < games; g++) {
  const G = SIM.create({ seed: 11 + g * 13, playerSide: g % 2 ? 'de' : 'us', crewLayout: layout });
  const side = o => G.players[o].side;
  const role = e => e && e.def && (e.def.crewWeapon === 'tripod_mg' ? 'MG' : e.def.crewWeapon === 'mortar' ? 'mortar' : null);
  G.stats = {
    kill(G, src, sq) { if (src && src.owner >= 0) { add(side(src.owner), 'men killed'); const r = role(src); if (r) add(side(src.owner), 'killed by ' + r); } },
    pin(G, sq) { const by = G.byId.get(sq.suppBy); if (by && by.owner >= 0) { add(side(by.owner), 'pins'); const r = role(by); if (r) add(side(by.owner), 'pins by ' + r); } },
  };
  let laid = 0;
  while (G.t < mins * 60 && !G.over) { AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT); }
  for (const d of G.map.debris || []) if (d.kind === 'sandbags' && d.owner >= 0) { add(side(d.owner), 'sandbag pieces lost'); if (d.patched) add(side(d.owner), 'gaps re-laid'); }
  for (const e of G.ents) if (e.crew) { const r = role(e); if (r) add(side(e.owner), r + ' teams alive at end'); }
}
console.log(`AI vs AI, ${games} x ${mins} min (totals):`);
for (const s of ['us', 'de']) console.log('  ' + s + ': ' + Object.entries(T[s]).sort().map(([k, v]) => `${k} ${v}`).join(', '));
const tot = k => (T.us[k] || 0) + (T.de[k] || 0);
if (tot('men killed') === 0) fail('no one died in AI vs AI');
console.log(problems ? problems + ' problems' : 'no problems');
