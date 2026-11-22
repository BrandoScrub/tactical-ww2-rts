/* Fighting positions and the AI's answer to armour hold together.
   node game/test/positions.js   -> "positions ok" as its last line
   1. A half-dug position can be finished: a second build order on it resumes the work and costs nothing more.
   2. An AI that has seen enemy armour and has nothing against it orders an anti-tank unit, ahead of the next
      building and of the vehicle it is saving for. */
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const bad = [], run = (G, s, ai) => { for (let i = 0; i < s / SIM.DT; i++) { if (ai) AI.step(G, 1); SIM.step(G, SIM.DT); } };

for (const side of ['us', 'de']) {
  const G = SIM.create({ seed: 5, playerSide: side, crewLayout: layout }), P = G.players[0]; P.res.mp = 1000;
  const hq = SIM.hqOf(G, 0), foe = SIM.hqOf(G, 1), L = Math.hypot(foe.x - hq.x, foe.y - hq.y), ux = (foe.x - hq.x) / L, uy = (foe.y - hq.y) / L;
  const id = side + '_position', eng = G.ents.find(e => e.owner === 0 && e.type === 'squad' && e.def.builder);
  let x = hq.x + ux * 26, y = hq.y + uy * 26; for (let n = 0; n < 40 && SIM.canPit(G, 0, id, x, y); n++) { x += ux * 1.5; y += uy * 1.5; }
  SIM.issue(G, [eng.id], { type: 'build', what: id, x, y }); run(G, 14);
  const h = G.map.houses.find(h => h.pit);
  if (!h || !(h.built > 0 && h.built < 1)) { bad.push(`${side}: position not half dug after 14 s (${h && h.built})`); continue; }
  SIM.issue(G, [eng.id], { type: 'move', x: hq.x + ux * 12, y: hq.y + uy * 12 }); run(G, 12);       // called away
  const b0 = h.built, mp0 = P.res.mp, n0 = G.map.houses.filter(h => h.pit).length;
  if (!SIM.unfinishedPit(G, 0, h.x, h.y)) bad.push(`${side}: the half-dug position is not found`);
  SIM.issue(G, [eng.id], { type: 'build', what: id, x: h.x + .8, y: h.y - .5 }); run(G, 45);
  if (h.built < 1) bad.push(`${side}: the position was not finished after the second order (${b0.toFixed(2)} -> ${h.built.toFixed(2)})`);
  if (G.map.houses.filter(h => h.pit).length !== n0) bad.push(`${side}: a second position was dug instead of finishing the first`);
  if (P.res.mp < mp0) bad.push(`${side}: finishing it was charged again (${mp0 | 0} -> ${P.res.mp | 0} manpower)`);
}

for (const side of ['us', 'de']) {                         // the AI plays `side`; the "player" parks a tank in its view
  const G = SIM.create({ seed: 9, playerSide: side === 'us' ? 'de' : 'us', crewLayout: layout }), A = G.players[1];
  for (const b of A.F.buildings.slice(0, 3)) {            // its first three buildings stand
    const hq = SIM.hqOf(G, 1); let spot = null;
    for (let r = 16; r < 60 && !spot; r += 4) for (let a = 0; a < 16 && !spot; a++) { const x = hq.x + Math.cos(a * Math.PI / 8) * r, y = hq.y + Math.sin(a * Math.PI / 8) * r; if (!SIM.canPlace(G, 1, b, x, y)) spot = { x, y }; }
    if (!spot) { bad.push(`${side}: no room for ${b}`); continue; }
    SIM.placeBuilding(G, b, 1, spot.x, spot.y, 1); A.built.add(b);
  }
  A.res.mp = 600; A.res.fu = 0; G.t = 400;
  const mine = G.ents.find(e => e.owner === 1 && e.type === 'squad');
  const tank = SIM.spawnVehicle(G, side === 'us' ? 'de_pz2' : 'us_chaffee', 0, mine.x + 14, mine.y + 6);
  tank.holdFire = true; tank.hp = tank.maxHp = 1e6;
  let got = null;
  for (let i = 0; i < 60 / SIM.DT && !got; i++) { AI.step(G, 1); SIM.step(G, SIM.DT); A.res.fu = 0;
    const q = G.ents.filter(e => e.owner === 1 && e.type === 'building').flatMap(b => b.queue.map(q => q.unit));
    got = q.find(u => (SIM.unitDef(u).weapons || []).some(w => DATA.W[w] && DATA.W[w].kind === 'at')) || null; }
  if (!got) bad.push(`${side} AI: no anti-tank unit ordered within a minute of seeing a tank (600 manpower, no fuel)`);
}
for (const b of bad) console.log('PROBLEM', b);
console.log(bad.length ? bad.length + ' problems' : 'positions ok');
process.exit(bad.length ? 1 : 0);
