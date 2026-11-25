/* The units added with their own art on 2026-11-24 work in the game.
   node game/test/newunits.js   -> "newunits ok" as its last line
   1. Every one has art, a building that makes it, and (armed ones) hurts something in front of it.
   2. The Kettenkrad is unarmed, never crashes the fight step, and takes a point.
   3. The Flak 30 sets up and hurts infantry in its arc; packed, it has a towed sprite and a crew layout.
   4. The Nebelwerfer never fires on its own; its barrage lobs six rockets that land round the target; it refuses a
      target inside its minimum range.
   5. The dozer Sherman breaks a tank trap in front of its blade; a plain Sherman beside one does not.
   6. Casemate guns (Marder, Brummbaer) turn the hull to fire at a target to the side. */
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAPS = require(src('maps.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const art = path.join(__dirname, '..', '..', 'art');
const layout = JSON.parse(fs.readFileSync(path.join(art, 'crew_layout.json'))), assets = JSON.parse(fs.readFileSync(path.join(art, 'assets.json')));
const D = DATA, bad = [], run = (G, s, f) => { for (let i = 0; i < s / SIM.DT; i++) { SIM.step(G, SIM.DT); if (f && f()) return true; } return false; };
// flat open ground to shoot across, as game/test/teamweapons.js uses
const RANGE = { id: 'range', name: 'Firing range', w: 200, h: 200, swell: 0, pointBags: false, bases: MAPS[MAPS.default].bases, points: [{ type: 'victory', x: 100, y: 100 }] };
const fresh = side => { const G = SIM.create({ seed: 9, playerSide: side, crewLayout: layout, map: RANGE }); G.players.forEach(P => { P.res.mp = 5000; P.res.mu = 2000; P.res.fu = 2000; }); return G; };
const NEW = ['us_hellcat', 'us_dozer', 'de_kettenkrad', 'de_221', 'de_marder', 'de_wirbelwind', 'de_brummbaer', 'de_flak30', 'de_nebel'];
const hpOf = e => e.type === 'vehicle' ? e.hp : e.models.reduce((a, m) => a + (m.alive ? m.hp : 0), 0);
const spot = G => { const a = SIM.hqOf(G, 0), b = SIM.hqOf(G, 1); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

/* 1 */
for (const id of NEW) {
  const def = SIM.unitDef(id), sq = !!D.SQUADS[id];
  if (!def) { bad.push(`${id}: no data`); continue; }
  if (!Object.values(D.BUILDINGS).some(b => (b.produce || []).includes(id))) bad.push(`${id}: no building makes it`);
  const key = sq ? def.side + '_' + def.crewWeapon : def.art;
  if (!assets[key]) bad.push(`${id}: no art for ${key}`);
  if (sq && def.towed && !assets[key + '_limbered']) bad.push(`${id}: no towed sprite ${key}_limbered`);
  if (sq && !(layout.weapons[key] && layout.weapons[key].crew.length)) bad.push(`${id}: no crew layout for ${key}`);
  if (sq) for (const c of layout.weapons[key] ? layout.weapons[key].crew : []) if (!assets[c.unit]) bad.push(`${id}: crew sprite ${c.unit} missing`);
  if (!sq && !def.weapons.length) continue;
  if (sq) continue;                                                     // team weapons: 3 and 4
  const G = fresh(def.side), c = spot(G);
  const e = SIM.spawnVehicle(G, id, 0, c.x - 10, c.y, 0);
  const foe = def.side === 'us' ? 'de' : 'us';
  const t = (id === 'de_wirbelwind' || id === 'de_221' || id === 'us_dozer' || id === 'de_brummbaer') ? SIM.spawnSquad(G, foe + (foe === 'us' ? '_riflemen' : '_grenadiers'), 1, c.x + 12, c.y)
    : SIM.spawnVehicle(G, foe === 'us' ? 'us_m8' : 'de_222', 1, c.x + 14, c.y, Math.PI);
  if (t.type === 'vehicle') { t.weapons = []; t.hp = t.maxHp = 5000; } else { t.models.forEach(m => { m.hp = m.maxHp = 600; m.weapon = null; }); }
  const h0 = hpOf(t); run(G, 25);
  if (!(hpOf(t) < h0)) bad.push(`${id}: did no damage in 25 s to a target 22 m in front of it`);
}

/* 2. Kettenkrad */
{
  const G = fresh('de'), k = SIM.spawnVehicle(G, 'de_kettenkrad', 0, 60, 60, 0);
  const p = G.map.points.find(p => p.owner !== 0) || G.map.points[0]; p.owner = -1; p.cap = 0;
  SIM.issue(G, [k.id], { type: 'move', x: p.x, y: p.y });
  try { run(G, 90, () => p.owner === 0); } catch (err) { bad.push('Kettenkrad: the game threw: ' + err.message); }
  if (p.owner !== 0) bad.push(`Kettenkrad did not take a point in 90 s (owner ${p.owner}, cap ${p.cap})`);
  if (k.def.weapons.length) bad.push('Kettenkrad is armed (CoH3: unarmed)');
  for (let i = 0; i < 200; i++) { AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT); }   // and the AI copes with an unarmed vehicle
}

/* 3. Flak 30 */
{
  const G = fresh('de'), c = spot(G), f = SIM.spawnSquad(G, 'de_flak30', 0, c.x - 12, c.y);
  SIM.issue(G, [f.id], { type: 'setup', heading: 0 }); run(G, 6);
  if (f.crew.state !== 'deployed') bad.push('Flak 30 did not set up in 6 s (' + f.crew.state + ')');
  const t = SIM.spawnSquad(G, 'us_riflemen', 1, c.x + 18, c.y); t.models.forEach(m => { m.hp = m.maxHp = 400; m.weapon = null; });
  const h0 = hpOf(t); run(G, 15);
  if (!(hpOf(t) < h0)) bad.push('Flak 30 did not hurt riflemen 30 m in front of it');
  const side = SIM.spawnSquad(G, 'us_riflemen', 1, c.x - 12, c.y + 30); side.models.forEach(m => { m.hp = m.maxHp = 400; m.weapon = null; });
  t.models.forEach(m => m.alive = false); SIM.step(G, SIM.DT);
  const s0 = hpOf(side); run(G, 1.5);
  if (hpOf(side) < s0) bad.push('Flak 30 hit a squad 90 degrees outside its arc at once (no arc)');
}

/* 4. Nebelwerfer */
{
  const G = fresh('de'), c = spot(G), n = SIM.spawnSquad(G, 'de_nebel', 0, c.x - 50, c.y);
  SIM.issue(G, [n.id], { type: 'setup', heading: 0 }); run(G, 6);
  const t = SIM.spawnSquad(G, 'us_riflemen', 1, c.x + 30, c.y); t.models.forEach(m => { m.hp = m.maxHp = 2000; m.weapon = null; });
  const mine = () => G.projectiles.filter(q => q.src === n.id).length;
  if (run(G, 20, () => mine() > 0)) bad.push('Nebelwerfer fired on its own');
  let shots = 0, seen = new Set(), far = 0;
  SIM.issue(G, [n.id], { type: 'ability', id: 'nebelBarrage', x: t.x, y: t.y });
  run(G, 30, () => { for (const q of G.projectiles) if (q.src === n.id && !seen.has(q)) { seen.add(q); shots++; if (Math.hypot(q.x - t.x, q.y - t.y) > 30) far++; } return false; });
  if (shots !== D.ABILITIES.nebelBarrage.shots) bad.push(`Nebelwerfer barrage fired ${shots} rockets, want ${D.ABILITIES.nebelBarrage.shots}`);
  if (far) bad.push(`${far} rockets aimed more than 30 m off the target`);
  if (!((n.cooldowns.nebelBarrage || 0) > G.t)) bad.push('Nebelwerfer barrage not recharging after it fired');
  const G2 = fresh('de'), n2 = SIM.spawnSquad(G2, 'de_nebel', 0, c.x, c.y); SIM.issue(G2, [n2.id], { type: 'setup', heading: 0 }); run(G2, 6);
  SIM.issue(G2, [n2.id], { type: 'ability', id: 'nebelBarrage', x: c.x + 20, y: c.y }); run(G2, 8);
  if (G2.projectiles.some(q => q.src === n2.id) || n2.barrage) bad.push('Nebelwerfer fired inside its minimum range (60 m)');
}

/* 5. the dozer blade */
{
  for (const [id, want] of [['us_dozer', true], ['us_sherman', false]]) {
    const G = fresh('us'), c = spot(G), v = SIM.spawnVehicle(G, id, 0, c.x, c.y, 0);
    const L = v.def.length / 2 + 1.0;
    const tr = G.map.addCover('tanktrap', c.x + L, c.y - 1, c.x + L, c.y + 1, { cover: 'heavy', blocksV: true, hp: D.DEFENCES.tanktrap.hp, owner: 1, built: 1 });
    SIM.issue(G, [v.id], { type: 'move', x: c.x + 0.6, y: c.y }); run(G, 6);
    const gone = !tr.alive || tr.php.some(h => h <= 0);
    if (gone !== want) bad.push(`${id}: tank trap in front of it ${gone ? 'broke' : 'stood'} (want ${want ? 'broken' : 'standing'})`);
  }
}

/* 6. casemate guns turn the hull */
for (const id of ['de_marder', 'de_brummbaer']) {
  const G = fresh('de'), c = spot(G), v = SIM.spawnVehicle(G, id, 0, c.x, c.y, 0);
  const t = SIM.spawnVehicle(G, 'us_m8', 1, c.x, c.y + 20, 0); t.weapons = []; t.hp = t.maxHp = 5000;
  const h0 = t.hp; run(G, 30);
  if (!(t.hp < h0)) bad.push(`${id}: never hit a target 90 degrees to its side (the hull should turn)`);
}

for (const b of bad) console.log('PROBLEM', b);
console.log(bad.length ? bad.length + ' problems' : 'newunits ok');
process.exit(bad.length ? 1 : 0);
