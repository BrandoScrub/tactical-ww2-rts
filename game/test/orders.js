// Orders and unit behaviour check (no browser): queued orders, capture-point orders, queued builds, engineers repairing
// vehicles, the AI pulling damaged vehicles back, mortar target choice and where the AI sets up machine guns.
// node game/test/orders.js     prints one line per check and "orders ok" when all pass
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
let bad = 0;
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) bad++; };
const game = () => SIM.create({ seed: 7, playerSide: 'us', crewLayout: layout });
const run = (G, secs, ai) => { for (let i = 0; i < secs * 20 && !G.over; i++) { if (ai) for (const s of ai) AI.step(G, s); SIM.step(G, SIM.DT); } };
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) < r;
const houses = G => G.map.houses.filter(h => !h.pit && !h.dead);

/* 1. queued orders: move, then garrison a house, then move on; each waits for the one before */
{
  const G = game(), hq = SIM.hqOf(G, 0), h = houses(G).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
  const sq = SIM.spawnSquad(G, 'us_riflemen', 0, h.x + 14, h.y + 2);
  const a = { x: h.x + 10, y: h.y - 8 }, b = { x: h.x - 12, y: h.y + 10 };
  SIM.issue(G, [sq.id], { type: 'move', x: a.x, y: a.y });
  SIM.issue(G, [sq.id], { type: 'garrison', house: h.id }, true);
  SIM.issue(G, [sq.id], { type: 'move', x: b.x, y: b.y }, true);
  check('queue holds two orders behind the first', sq.queue.length === 2, sq.queue.map(q => q.type).join(','));
  let wasIn = false; for (let i = 0; i < 60 * 20 && !(wasIn && sq.garrison == null && !sq.queue.length && sq.order.type === 'idle' && !(sq.path && sq.path.length)); i++) { SIM.step(G, SIM.DT); if (sq.garrison === h.id || G.players[0].alerts.some(a => a.kind === 'garrison')) wasIn = true; }
  check('queued garrison happened', wasIn);
  check('then walked on to the last stop', near(sq, b, 4), Math.hypot(sq.x - b.x, sq.y - b.y).toFixed(1) + ' m');
  // a plain order clears the queue
  SIM.issue(G, [sq.id], { type: 'move', x: a.x, y: a.y }); SIM.issue(G, [sq.id], { type: 'move', x: b.x, y: b.y }, true); SIM.issue(G, [sq.id], { type: 'move', x: a.x, y: a.y });
  check('an unqueued order clears the queue', !sq.queue.length);
  // a retreat drops the queue
  SIM.issue(G, [sq.id], { type: 'move', x: b.x, y: b.y }, true); SIM.issue(G, [sq.id], { type: 'retreat' });
  check('retreat clears the queue', !sq.queue.length && sq.retreating);
}
/* 2. a point's icon: the squads spread inside the circle and take it */
{
  const G = game(), hq = SIM.hqOf(G, 0);
  const p = G.map.points.filter(q => q.owner < 0).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
  const s1 = SIM.spawnSquad(G, 'us_riflemen', 0, hq.rally.x, hq.rally.y), s2 = SIM.spawnSquad(G, 'us_riflemen', 0, hq.rally.x + 4, hq.rally.y), s3 = SIM.spawnSquad(G, 'us_engineers', 0, hq.rally.x, hq.rally.y + 4);
  SIM.issue(G, [s1.id, s2.id, s3.id], { type: 'move', x: p.x, y: p.y, point: p.id });
  const inside = [s1, s2, s3].every(s => s.path && s.path.length && Math.hypot(s.path[s.path.length - 1].x - p.x, s.path[s.path.length - 1].y - p.y) < p.radius);
  check('every squad sent inside the point circle', inside);
  for (let i = 0; i < 150 * 20 && p.owner !== 0; i++) SIM.step(G, SIM.DT);
  check('the point is taken', p.owner === 0, 't ' + G.t.toFixed(0) + ' s');
}
/* 3. queued builds: two sandbag lines and a fighting position, all paid for at once, built in order */
{
  const G = game(), hq = SIM.hqOf(G, 0), P = G.players[0];
  const eng = G.ents.find(e => e.type === 'squad' && e.owner === 0 && e.def.builder);
  P.res.mp = 1000;
  const x = hq.rally.x + 6, y = hq.rally.y - 6;
  SIM.issue(G, [eng.id], { type: 'build', what: 'sandbags', x, y, x2: x + 6, y2: y });
  SIM.issue(G, [eng.id], { type: 'build', what: 'sandbags', x, y: y - 6, x2: x + 6, y2: y - 6 }, true);
  SIM.issue(G, [eng.id], { type: 'build', what: 'us_position', x: x + 3, y: y + 8 }, true);
  const n = eng.buildQueue.length;
  check('queued jobs added behind the first', n >= 3, n + ' jobs');
  run(G, 150);
  const built = G.map.covers.filter(c => c.kind === 'sandbags' && c.owner === 0 && c.built >= 1).length, pit = G.map.houses.some(h => h.pit && h.owner === 0 && h.built >= 1);
  check('all of them built', built >= 2 && pit, built + ' sandbag pieces, position ' + pit);
}
/* 4. engineers idle by a damaged vehicle repair it */
{
  const G = game(), hq = SIM.hqOf(G, 0);
  const eng = G.ents.find(e => e.type === 'squad' && e.owner === 0 && e.def.builder);
  const v = SIM.spawnVehicle(G, 'us_m8', 0, eng.x + 6, eng.y + 2); v.hp = v.maxHp * .4;
  run(G, 4);
  check('idle engineers start repairing a damaged vehicle beside them', eng.order.type === 'repair' && eng.order.target === v.id, eng.order.type);
  run(G, 90);
  check('and finish it', v.hp >= v.maxHp - 1, Math.round(v.hp) + '/' + v.maxHp);
}
/* 5. the AI pulls a badly damaged vehicle back and its engineers come and fix it */
{
  const G = game(), slot = 1, hq = SIM.hqOf(G, slot);
  const p = G.map.points.sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[3];
  const v = SIM.spawnVehicle(G, 'de_222', slot, p.x, p.y); v.hp = v.maxHp * .3;
  run(G, 3, [slot]);
  check('AI keeps a vehicle at 30% in the fight', !v.fixing);
  v.hp = v.maxHp * .2; run(G, 3, [slot]);
  check('AI marks a vehicle under 25% for repair', !!v.fixing);
  const spot = AI.repairSpot(G, slot, v), d0 = Math.hypot(v.x - spot.x, v.y - spot.y);
  let d1 = d0; for (let i = 0; i < 60 * 20 && v.fixing; i++) { AI.step(G, slot); SIM.step(G, SIM.DT); d1 = Math.min(d1, Math.hypot(v.x - spot.x, v.y - spot.y)); }
  // it drives back toward the spot by its HQ (the engineers may meet it on the way)
  check('it falls back toward the repair spot by its HQ', d1 < d0 - 15 || d1 < 14, d0.toFixed(0) + ' m -> ' + d1.toFixed(0) + ' m at closest');
  run(G, 120, [slot]);
  check('the AI\'s engineers repair it and it goes back out', v.hp > v.maxHp * .9 && !v.fixing, Math.round(v.hp / v.maxHp * 100) + '%');
}
/* 6. mortar targets: a set-up machine gun before a nearer dug-in squad; a squad that only just stopped is left alone */
{
  const G = game(), w = DATA.W.mortar81;
  const mg = { type: 'squad', def: DATA.SQUADS.de_hmg, crew: { state: 'deployed' }, moving: false, stillT: 1, coverT: 0, models: [] };
  const dug = { type: 'squad', def: DATA.SQUADS.de_grenadiers, moving: false, stillT: 9, coverT: 9, models: [] };
  const fresh = { type: 'squad', def: DATA.SQUADS.de_grenadiers, moving: false, stillT: 1.5, coverT: 1.5, models: [] };
  const open = { type: 'squad', def: DATA.SQUADS.de_grenadiers, moving: false, stillT: 6, coverT: 0, models: [] };
  const sMg = COMBAT.mortarScore(mg, 80), sDug = COMBAT.mortarScore(dug, 40), sFresh = COMBAT.mortarScore(fresh, 35), sOpen = COMBAT.mortarScore(open, 45);
  check('mortar: machine gun first even when further', sMg < sDug, sMg + ' vs ' + sDug);
  check('mortar: squad in cover over 4.5 s is a target', sDug != null);
  check('mortar: squad that just stopped is not', sFresh == null);
  check('mortar: dug-in squad before one standing in the open', sDug < sOpen);
}
/* 7. the AI's machine guns: from cover (or a house) by a point, aimed down the enemy's way in */
{
  let withCover = 0, total = 0;
  for (const seed of [7, 19, 31]) {
    const G = SIM.create({ seed, playerSide: 'us', crewLayout: layout });
    for (const slot of [0, 1]) {
      const me = G.players[slot], hq = SIM.hqOf(G, slot);
      const mg = SIM.spawnSquad(G, me.side + '_hmg', slot, hq.rally.x, hq.rally.y);
      for (const p of G.map.points) {
        const plan = AI.mgPlan(G, me, mg, p); if (!plan) continue;
        total++; if (plan.cover !== 'none') withCover++;
      }
      SIM.kill(G, mg);
    }
  }
  check('machine-gun spots by points are in cover or a house', withCover / total >= .7, withCover + ' of ' + total);
}
/* 8. AI against AI still plays out: no errors, machine guns mostly set up in cover */
{
  let mgT = 0, mgCov = 0;
  for (const seed of [5, 23]) {
    const G = SIM.create({ seed, playerSide: seed === 5 ? 'us' : 'de', crewLayout: layout });
    while (G.t < 600 && !G.over) {
      AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT);
      for (const e of G.ents) if (!e.dead && e.type === 'squad' && e.crew && e.crew.state === 'deployed' && SIM.weaponOf(e).kind === 'mg') { mgT++; const c = COMBAT.squadCover(G, e); if (c !== 'none' && c !== 'negative') mgCov++; }
    }
  }
  check('AI machine guns set up in cover most of the time', mgCov / Math.max(1, mgT) >= .5, Math.round(mgCov / Math.max(1, mgT) * 100) + '% of set-up time');
}
/* 9. base buildings: ordered from the HQ, they raise themselves; engineers can't build them */
{
  const G = game(), P = G.players[0], hq = SIM.hqOf(G, 0), id = P.F.buildings[0];
  const eng = G.ents.find(e => e.type === 'squad' && e.owner === 0 && e.def.builder);
  P.res.mp = 2000; P.res.fu = 500;
  let spot = null; for (let r = 18; r < 40 && !spot; r += 3) for (let a = 0; a < 24 && !spot; a++) { const x = hq.x + Math.cos(a / 24 * U.TAU) * r, y = hq.y + Math.sin(a / 24 * U.TAU) * r; if (!SIM.canPlace(G, 0, id, x, y)) spot = { x, y }; }
  SIM.issue(G, [eng.id], { type: 'build', what: id, x: spot.x, y: spot.y });
  check('engineers cannot build a base building', !G.ents.some(e => e.type === 'building' && e.defId === id));
  SIM.issue(G, [hq.id], { type: 'construct', what: id, x: spot.x, y: spot.y });
  const b = G.ents.find(e => e.type === 'building' && e.defId === id);
  check('the HQ orders it', !!b && b.built < 1);
  SIM.kill(G, eng);
  run(G, DATA.BUILDINGS[id].time + 1);
  check('it builds itself with no engineers', b.built >= 1 && P.built.has(id));
}
console.log(bad ? bad + ' problems' : 'orders ok');
process.exit(bad ? 1 : 0);
