// Weapon profiles, fighting ranges and machine-gun lanes.
// node game/test/ranges.js
//   profiles: every weapon has well-formed [near, mid, far] numbers and every unit can hurt something
//   roles:    each unit's best range and strengths come out as intended (close vs long infantry, tank roles)
//   lanes:    a squad closing on its target never walks into or across a set-up enemy machine gun's lane; when every
//             way closer is covered it calls for help instead
//   capture:  the jeep takes a point
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAPS = require(src('maps.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const D = DATA;
let problems = 0;
const fail = m => { problems++; console.log('PROBLEM: ' + m); };

/* ---- profiles ---- */
for (const [k, w] of Object.entries(D.W)) {
  if (k.includes(':')) continue;
  for (const f of w.kind === 'indirect' ? ['rpm', 'pen', 'rng'] : ['acc', 'rpm', 'pen', 'rng']) if (!Array.isArray(w[f]) || w[f].length !== 3 || w[f].some(x => !(x >= 0))) fail(`${k}.${f} is not three numbers`);
  if (!(w.rng[0] <= w.rng[1] && w.rng[1] < w.rng[2])) fail(`${k}: ranges not in order`);
}
const stub = (id, x = 0, y = 0) => { const d = SIM.unitDef(id); return D.SQUADS[id] ? { type: 'squad', defId: id, def: d, x, y, models: d.weapons.map((w, i) => ({ alive: true, weapon: d.crewWeapon && i === 0 ? null : w })), crew: d.crewWeapon ? { state: 'deployed' } : null } : { type: 'vehicle', defId: id, def: d, x, y }; };
const ids = [...Object.keys(D.SQUADS), ...Object.keys(D.VEHICLES)];
const targets = ['us_riflemen', 'de_grenadiers', 'us_jeep', 'de_222', 'us_sherman', 'de_pz4'].map(t => stub(t));
for (const id of ids) {
  const u = stub(id), w = (u.def.crewWeapon ? [u.def.weapons[0]] : u.def.weapons).map(k => D.W[k]);
  if (w.some(x => x && x.kind === 'indirect')) continue;
  if (!targets.some(t => [5, 15, 30].some(d => COMBAT.unitDps(u, t, d) > 0))) fail(`${id} can hurt nothing`);
}

/* ---- roles ---- */
const plan = (a, b) => { const A = stub(a), B = stub(b, 30, 0); const p = AI.rangePlan(null, A, B, [B]); return p ? p.d : null; };
const dps = (a, b, d) => COMBAT.unitDps(stub(a), stub(b), d);
const checks = [
  ['Riflemen close in on Grenadiers', plan('us_riflemen', 'de_grenadiers') <= 15],
  ['Grenadiers keep Riflemen at long range', plan('de_grenadiers', 'us_riflemen') >= 28],
  ['Panzergrenadiers fight inside 25 m', plan('de_panzergrenadiers', 'us_riflemen') <= 25],
  ['engineers and Pioneers fight close', plan('us_engineers', 'de_grenadiers') <= 12 && plan('de_pioneers', 'us_riflemen') <= 15],
  ['snipers stand off', plan('us_sniper', 'de_grenadiers') >= 40 && plan('de_sniper', 'us_riflemen') >= 40],
  ['tank destroyers stand off', plan('us_m10', 'de_pz4') >= 35],
  ['vehicles keep 12 m off infantry', plan('us_chaffee', 'de_grenadiers') >= 12 && plan('de_pz4', 'us_riflemen') >= 12],
  // share of the other squad's hit points taken per second (Riflemen 6 x 95, Grenadiers 6 x 80)
  ['Grenadiers out-shoot Riflemen at 35 m, Riflemen win under 15 m', dps('de_grenadiers', 'us_riflemen', 35) / 570 > dps('us_riflemen', 'de_grenadiers', 35) / 480 * 1.2 && dps('us_riflemen', 'de_grenadiers', 10) / 480 > dps('de_grenadiers', 'us_riflemen', 10) / 570 * 1.2],
  ['Sherman beats the Chaffee against infantry', dps('us_sherman', 'de_grenadiers', 20) > dps('us_chaffee', 'de_grenadiers', 20)],
  ['Panzer IV beats the Sherman against armour', dps('de_pz4', 'us_sherman', 25) > dps('us_sherman', 'de_pz4', 25) * 1.3],
  ['scout car MG falls off with range', dps('de_222', 'us_riflemen', 35) < dps('de_222', 'us_riflemen', 10) * .7],
];
for (const [what, ok] of checks) { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fail(what); }
for (const id of ['us_riflemen', 'de_grenadiers', 'us_sniper', 'us_m10', 'de_pz4', 'us_mortar']) { const b = AI.bestRange(id); console.log(`  card: ${id}: ${b.vs === 'indirect' ? b.what : Math.round(b.d) + ' m vs ' + b.vs}`); }

/* ---- machine-gun lanes ---- */
const RANGE = { id: 'range', name: 'Firing range', w: 200, h: 200, swell: 0, pointBags: false, bases: MAPS[MAPS.default].bases, points: [{ type: 'victory', x: 100, y: 30 }] };
function world(seed) { const G = SIM.create({ seed, crewLayout: layout, map: RANGE }); G.players.forEach(P => { P.res.mp = 1e5; P.res.mu = 1e5; P.res.fu = 1e5; }); return G; }
const usSlot = G0 => G0.players.findIndex(p => p.side === 'us');
// A: the Grenadiers stand in front of a gun that faces the Riflemen (no way round: they should hold and call for help);
// B: the Grenadiers stand off to the gun's side (a way round its arc exists: they should flank)
const tally = { A: { runs: 0, flanked: 0, held: 0 }, B: { runs: 0, flanked: 0, held: 0 } };
for (const kind of ['A', 'B']) for (const seed of [3, 5, 8, 13]) for (const off of [0, 6, -6]) {
  const G = world(seed), us = usSlot(G), de = 1 - us, y = 100 + off, T = tally[kind];
  const mg = SIM.spawnSquad(G, 'de_hmg', de, 130, y); SIM.setup(G, mg, Math.PI);
  const gren = kind === 'A' ? SIM.spawnSquad(G, 'de_grenadiers', de, 112, y + 4) : SIM.spawnSquad(G, 'de_grenadiers', de, 126, y + 30);
  const rif = kind === 'A' ? SIM.spawnSquad(G, 'us_riflemen', us, 75, y) : SIM.spawnSquad(G, 'us_riflemen', us, 84, y + 32);
  for (let i = 0; i < 5 / SIM.DT; i++) SIM.step(G, SIM.DT);
  if (mg.crew.state !== 'deployed') { fail('test MG did not set up'); continue; }
  const S = {}, vis = [mg, gren];
  const zones = AI.dangerZones(G, rif, vis);
  if (!zones.length) { fail('no lane found for a set-up MG'); continue; }
  if (zones.some(z => AI.inZone(G, z, rif.x, rif.y))) continue;   // started inside: not this test
  T.runs++;
  const moved = AI.engage(G, G.players[us], S, rif, vis, G.map.points);
  if (moved) {
    // the route: the move given, then any queued move (a way round the gun)
    const legs = [rif.order, ...(rif.queue || []).filter(q => q.type === 'move')], steps = 12;
    let bad = false, ax = rif.x, ay = rif.y;
    for (const o of legs) {
      if (zones.some(z => AI.inZone(G, z, o.x, o.y))) bad = true;
      for (let i = 1; i <= steps; i++) for (const z of zones) if (AI.inZone(G, z, ax + (o.x - ax) * i / steps, ay + (o.y - ay) * i / steps)) bad = true;
      ax = o.x; ay = o.y;
    }
    const o = legs[legs.length - 1];
    if (bad) fail(`seed ${seed}/${off}: riflemen sent into the MG lane (${o.x.toFixed(0)}, ${o.y.toFixed(0)})`);
    else T.flanked++;
  } else if (S.call && S.call.id === mg.id) T.held++;
  else fail(`seed ${seed}/${off}: riflemen neither flanked nor called for help`);
}
for (const k of ['A', 'B']) console.log(`MG lane ${k}: ${tally[k].runs} approaches, flanked ${tally[k].flanked}, held and called for help ${tally[k].held}`);
if (tally.A.runs < 6 || tally.B.runs < 6) fail('lane set-ups did not run');
if (tally.B.flanked < tally.B.runs / 2) fail('with a way round the gun, riflemen flanked in fewer than half the runs');

/* ---- the jeep captures ---- */
{
  const G = world(4), us = usSlot(G), p = G.map.points[0];
  const j = SIM.spawnVehicle(G, 'us_jeep', us, p.x, p.y);
  for (let i = 0; i < 40 / SIM.DT && p.owner !== us; i++) SIM.step(G, SIM.DT);
  if (p.owner !== us) fail('the jeep did not capture a point in 40 s'); else console.log('ok   jeep captures');
}
if (problems) { console.log(`${problems} problem(s)`); process.exit(1); }
console.log('ranges: all good');
