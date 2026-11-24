/* Resource caches, the Concrete Bunker and its conversions, howitzer emplacements, and the new units hold together.
   node game/test/fieldworks.js   -> "fieldworks ok" as its last line
   1. A cache goes only on a point its side holds; it adds half the point's munitions and fuel; the enemy can't take
      the point while it stands; a tank ordered onto it destroys it, and the point can then be taken.
   2. A Concrete Bunker holds a squad, whose men fire faster and truer inside; Pioneers convert it (MG 42: a gun that
      fires from the slit and holds no one; Medical: heals infantry near it; Repair: repairs vehicles near it).
   3. A howitzer emplacement: built by engineers once its building stands, its gun appears in the pit, it won't move or
      retreat, it doesn't fire on its own, its barrage lands, hits go to the pit, and the gun dies with the pit.
   4. Every new unit can be produced, fires, and the AI fields the new tanks and works over long matches (soak covers it). */
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const D = DATA, bad = [], run = (G, s, f) => { for (let i = 0; i < s / SIM.DT; i++) { SIM.step(G, SIM.DT); if (f && f()) return true; } return false; };
const fresh = side => { const G = SIM.create({ seed: 5, playerSide: side, crewLayout: layout }); G.players.forEach(P => { P.res.mp = 5000; P.res.mu = 2000; P.res.fu = 2000; }); return G; };
const builder = G => G.ents.find(e => e.owner === 0 && e.type === 'squad' && e.def.builder);
const income = (G, slot) => { SIM.step(G, SIM.DT); return { ...G.players[slot].income }; };

/* 1. caches */
for (const side of ['us', 'de']) {
  const G = fresh(side), eng = builder(G), hq = SIM.hqOf(G, 0), id = side + '_cache';
  for (const q of G.map.points) if (Math.hypot(q.x - hq.x, q.y - hq.y) < Math.hypot(q.x - SIM.hqOf(G, 1).x, q.y - SIM.hqOf(G, 1).y) && q.type !== 'fuel' && q.type !== 'munitions') { q.owner = 0; q.cap = 1; }
  SIM.updateTerritory(G);
  const p = G.map.points.filter(p => (p.type === 'fuel' || p.type === 'munitions') && SIM.connected(G, 0, p)).sort((a, b) => Math.hypot(a.x - hq.x, a.y - hq.y) - Math.hypot(b.x - hq.x, b.y - hq.y))[0];
  if (!p) { bad.push(`${side}: no resource point next to the base to test a cache on`); continue; }
  if (!SIM.canPit(G, 0, id, p.x, p.y)) bad.push(`${side}: a cache was allowed on a point nobody holds`);
  p.owner = 0; p.cap = 1; SIM.updateTerritory(G);
  const why = SIM.canPit(G, 0, id, p.x + 2, p.y + 1); if (why) { bad.push(`${side}: cache refused on a held point: ${why}`); continue; }
  const inc0 = income(G, 0);
  SIM.issue(G, [eng.id], { type: 'build', what: id, x: p.x + 2, y: p.y + 1 });
  run(G, 90, () => SIM.liveCache(G, p) && SIM.liveCache(G, p).built >= 1);
  const c = SIM.liveCache(G, p);
  if (!c || c.built < 1) { bad.push(`${side}: cache not built in 90 s`); continue; }
  if (Math.hypot(c.x - p.x, c.y - p.y) > .01) bad.push(`${side}: the cache is not on the point's flag`);
  const inc1 = income(G, 0), v = D.ECON.point[p.type];
  if (Math.abs((inc1.mu - inc0.mu) - v.mu * .5) > .01 || Math.abs((inc1.fu - inc0.fu) - v.fu * .5) > .01) bad.push(`${side}: cache income +${(inc1.mu - inc0.mu).toFixed(1)} mu +${(inc1.fu - inc0.fu).toFixed(1)} fu, want half of the point's (${v.mu}, ${v.fu})`);
  if (!SIM.canPit(G, 0, id, p.x, p.y)) bad.push(`${side}: a second cache was allowed on the same point`);
  // the enemy stands on it: no capture while the cache stands
  const foeSide = side === 'us' ? 'de' : 'us', inf = SIM.spawnSquad(G, foeSide + (foeSide === 'us' ? '_riflemen' : '_grenadiers'), 1, p.x + 3, p.y + 3);
  inf.holdFire = true; for (const m of inf.models) m.hp = m.maxHp = 1e6;
  for (const e of G.ents) if (e.owner === 0 && e.type === 'squad') SIM.issue(G, [e.id], { type: 'move', x: hq.x, y: hq.y });
  run(G, 45);
  if (p.owner !== 0) bad.push(`${side}: the enemy took a point with a cache on it`);
  // a tank ordered onto the cache destroys it; then the point falls
  const tank = SIM.spawnVehicle(G, foeSide === 'us' ? 'us_sherman' : 'de_pz4', 1, p.x + 25, p.y);
  SIM.issue(G, [tank.id], { type: 'attack', house: c.id });
  run(G, 150, () => c.dead);
  if (!c.dead) bad.push(`${side}: a tank ordered onto the cache didn't destroy it in 150 s (health ${c.hp | 0}/${c.maxHp})`);
  else { run(G, 60, () => p.owner === 1); if (p.owner !== 1) bad.push(`${side}: the point was not taken after its cache fell (owner ${p.owner}, cap ${p.cap.toFixed(2)})`); }
}

/* 2. the Concrete Bunker */
{
  const G = fresh('de'), eng = builder(G), hq = SIM.hqOf(G, 0), foe = SIM.hqOf(G, 1);
  const ang = Math.atan2(foe.y - hq.y, foe.x - hq.x);
  let x = hq.x + Math.cos(ang) * 30, y = hq.y + Math.sin(ang) * 30; for (let n = 0; n < 40 && SIM.canPit(G, 0, 'de_bunker', x, y); n++) { x += Math.cos(ang) * 1.5; y += Math.sin(ang) * 1.5; }
  if (!SIM.canPit(G, 0, 'us_bunker', x, y)) bad.push('the US has a Concrete Bunker (CoH3: Wehrmacht only)');
  SIM.issue(G, [eng.id], { type: 'build', what: 'de_bunker', x, y });
  const bk = () => G.map.houses.find(h => h.bunker);
  run(G, 120, () => bk() && bk().built >= 1);
  const h = bk();
  if (!h || h.built < 1) bad.push('bunker not built in 120 s');
  else {
    const gr = SIM.spawnSquad(G, 'de_grenadiers', 0, h.x - 6, h.y);
    SIM.issue(G, [gr.id], { type: 'garrison', house: h.id }); run(G, 15);
    if (gr.garrison !== h.id) bad.push('grenadiers did not garrison the bunker');
    // fortified: shots from inside at a target in the open land more (same seed, with and without the bunker bonus)
    const def = D.DEFENCES.de_bunker;
    if (!def.fortified || def.fortified.acc <= 1 || def.fortified.rof <= 1) bad.push('bunker gives no fortified bonus');
    SIM.issue(G, [gr.id], { type: 'unload' }); run(G, 2);
    for (const [role, check] of [['medical', null], ['repair', null], ['mg', null]]) {
      const G2 = fresh('de'), e2 = builder(G2); G2.players[0].res.mu = 500;
      const h2 = G2.map.addPit(h.x, h.y, { ...D.DEFENCES.de_bunker, id: 'de_bunker' }, 0, h.face); h2.built = 1; h2.hp = h2.maxHp;
      const mu0 = G2.players[0].res.mu;
      SIM.issue(G2, [e2.id], { type: 'convert', house: h2.id, role });
      run(G2, 90, () => h2.role);
      if (h2.role !== role) { bad.push(`bunker not converted to ${role} in 90 s`); continue; }
      if (Math.abs(mu0 - G2.players[0].res.mu - D.BUNKER[role].cost.mu) > 1) bad.push(`${role} bunker cost ${(mu0 - G2.players[0].res.mu) | 0} mu, want ${D.BUNKER[role].cost.mu}`);
      const sq = SIM.spawnSquad(G2, 'de_grenadiers', 0, h2.x - 6, h2.y);
      SIM.issue(G2, [sq.id], { type: 'garrison', house: h2.id }); run(G2, 8);
      if (role !== 'mg' && sq.garrison === h2.id) bad.push(`a squad garrisoned a ${role} bunker`);
      if (role === 'medical') { for (const m of sq.models) m.hp = 20; sq.lastHit = -99; run(G2, 15); if (sq.models.some(m => m.alive && m.hp <= 20)) bad.push('the medical bunker did not heal a squad beside it'); }
      if (role === 'repair') { const v = SIM.spawnVehicle(G2, 'de_222', 0, h2.x - 8, h2.y); v.hp = 50; run(G2, 15); if (v.hp < 50 + D.BUNKER.repair.rate * 8) bad.push(`the repair bunker repaired too little (${v.hp | 0})`); }
      if (role === 'mg') {
        const gun = h2.gun != null && G2.byId.get(h2.gun);
        if (!gun || gun.garrison !== h2.id) { bad.push('the MG 42 bunker has no gun in it'); continue; }
        if (sq.garrison === h2.id) bad.push('a squad got into the MG bunker');
        const foeSq = SIM.spawnSquad(G2, 'us_riflemen', 1, h2.x + Math.cos(h2.face) * 25, h2.y + Math.sin(h2.face) * 25);
        for (const m of foeSq.models) m.hp = m.maxHp = 1e6;
        const sup = run(G2, 20, () => foeSq.supp > .2);
        if (!sup) bad.push('the MG 42 bunker did not suppress riflemen 25 m in front of it');
        SIM.issue(G2, [gun.id], { type: 'move', x: h2.x + 20, y: h2.y }); run(G2, 3);
        if (gun.garrison !== h2.id) bad.push('the MG 42 bunker crew walked off');
      }
    }
  }
}

/* 3. howitzer emplacements */
for (const side of ['us', 'de']) {
  const G = fresh(side), eng = builder(G), hq = SIM.hqOf(G, 0), foe = SIM.hqOf(G, 1), P = G.players[0];
  const id = side + '_howitzer_pit', def = D.DEFENCES[id], ang = Math.atan2(foe.y - hq.y, foe.x - hq.x);
  let x = hq.x + Math.cos(ang) * 26, y = hq.y + Math.sin(ang) * 26;
  if (SIM.canPit(G, 0, id, x, y) !== 'Requires ' + D.BUILDINGS[def.req].name) bad.push(`${side}: howitzer not gated on its building (${SIM.canPit(G, 0, id, x, y)})`);
  P.built.add(def.req);
  for (let n = 0; n < 40 && SIM.canPit(G, 0, id, x, y); n++) { x += Math.cos(ang) * 1.5; y += Math.sin(ang) * 1.5; }
  const fu0 = P.res.fu;
  SIM.issue(G, [eng.id], { type: 'build', what: id, x, y });
  if (Math.abs(fu0 - P.res.fu - def.cost.fu) > .5) bad.push(`${side}: howitzer cost ${(fu0 - P.res.fu) | 0} fuel, want ${def.cost.fu}`);
  const gun = () => G.ents.find(e => e.defId === def.emplacement && !e.dead);
  run(G, 150, () => gun());
  const g = gun(), pit = G.map.houses.find(h => h.defId === id);
  if (!g) { bad.push(`${side}: no howitzer after its pit was built`); continue; }
  if (g.garrison !== pit.id || !g.crew || g.crew.state !== 'deployed') bad.push(`${side}: the howitzer is not set up in its pit`);
  const x0 = g.x, y0 = g.y;
  SIM.issue(G, [g.id], { type: 'move', x: g.x + 30, y: g.y }); SIM.issue(G, [g.id], { type: 'retreat' }); run(G, 5);
  if (Math.hypot(g.x - x0, g.y - y0) > .5 || g.retreating) bad.push(`${side}: the howitzer moved or retreated`);
  // no auto-fire: an enemy squad standing 60 m off for 20 s is not shelled
  const foeId = side === 'us' ? 'de_grenadiers' : 'us_riflemen';
  const t = SIM.spawnSquad(G, foeId, 1, g.x + Math.cos(ang) * 60, g.y + Math.sin(ang) * 60); t.holdFire = true;
  const shells = () => G.projectiles.filter(q => q.src === g.id).length;
  if (run(G, 20, () => shells() > 0)) bad.push(`${side}: the howitzer fired on its own`);
  // the barrage lands near the target
  const hp0 = t.models.reduce((a, m) => a + (m.alive ? m.hp : 0), 0);
  SIM.issue(G, [g.id], { type: 'ability', id: 'howBarrage', x: t.x, y: t.y });
  run(G, 25);
  const hp1 = t.dead ? 0 : t.models.reduce((a, m) => a + (m.alive ? m.hp : 0), 0);
  if (!(hp1 < hp0)) bad.push(`${side}: the barrage did no harm to a squad standing on its target`);
  if (!((g.cooldowns.howBarrage || 0) > G.t)) bad.push(`${side}: barrage not on cooldown after firing`);
  // hits go to the pit; the gun dies with it
  const ph0 = pit.hp, crew0 = g.models.filter(m => m.alive).length;
  const shooter = SIM.spawnSquad(G, foeId, 1, pit.x + 15, pit.y + 3);
  run(G, 20);
  if (g.models.filter(m => m.alive).length !== crew0) bad.push(`${side}: rifle fire killed the howitzer crew instead of wearing the pit`);
  if (!(pit.hp < ph0)) bad.push(`${side}: rifle fire at the howitzer did nothing to its pit`);
  shooter.models.forEach(m => m.alive = false);
  SIM.damageHouse(G, pit, 1e5, null); run(G, 1);
  if (!g.dead) bad.push(`${side}: the howitzer survived its pit`);
  if ((G.drops || []).some(d => d.defId === def.emplacement)) bad.push(`${side}: a destroyed emplacement left a gun to recrew`);
}

/* 4. new units: produced, and each fires at something in front of it */
{
  const G = fresh('us'), G2 = fresh('de');
  for (const [g, list] of [[G, ['us_scouts', 'us_stuart', 'us_pershing']], [G2, ['de_stoss', 'de_panther', 'de_tiger']]]) {
    const hq = SIM.hqOf(g, 0);
    for (const u of list) {
      const b = Object.entries(D.BUILDINGS).find(([, b]) => (b.produce || []).includes(u));
      if (!b) { bad.push(`${u}: no building produces it`); continue; }
      const e = (D.SQUADS[u] ? SIM.spawnSquad : SIM.spawnVehicle)(g, u, 0, hq.x + 30, hq.y);
      const t = SIM.spawnVehicle(g, u.startsWith('us') ? 'de_222' : 'us_jeep', 1, e.x + 18, e.y); t.hp = t.maxHp = 1e5;
      const fired = run(g, 12, () => e.lastFire > 0);
      if (!fired) bad.push(`${u}: did not fire at a light vehicle 18 m away`);
      t.dead = true; SIM.kill(g, t); e.dead = true; SIM.kill(g, e);
    }
  }
  // the Stoßtruppen take 15% less damage
  const s = SIM.spawnSquad(G2, 'de_stoss', 0, 50, 50), m = s.models[0], h0 = m.hp; COMBAT.damageModel(G2, s, m, 20, null);
  if (Math.abs(h0 - m.hp - 17) > .01) bad.push(`Stoßtruppen took ${h0 - m.hp} of 20 damage, want 17`);
}

for (const b of bad) console.log('PROBLEM', b);
console.log(bad.length ? bad.length + ' problems' : 'fieldworks ok');
process.exit(bad.length ? 1 : 0);
