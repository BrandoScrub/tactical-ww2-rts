// AI behaviour check: runs AI-vs-AI games and reports what each side built and how it used its team weapons.
// node game/test/aistats.js [games=6] [minutes=18]
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const games = +(process.argv[2] || 6), mins = +(process.argv[3] || 18);
const tot = { us: {}, de: {} }, add = (s, k, v = 1) => tot[s][k] = (tot[s][k] || 0) + v;
const wins = { us: 0, de: 0, draw: 0 };
for (let g = 0; g < games; g++) {
  const G = SIM.create({ seed: 11 + g * 13, playerSide: g % 2 ? 'de' : 'us', crewLayout: layout });
  const seen = new Set(), firstV = {}, tw = {};
  while (G.t < mins * 60 && !G.over) {
    AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT);
    for (const e of G.ents) {
      if (e.dead || e.owner < 0 || e.type === 'building') continue;
      const s = G.players[e.owner].side;
      if (!seen.has(e.id)) { seen.add(e.id); add(s, 'built ' + e.defId.split('_').slice(1).join('_'));
        if (e.type === 'vehicle' && (e.def.cost.fu || 0) > 0 && firstV[s] == null) firstV[s] = G.t; }
      if (e.crew) { const k = e.def.crewWeapon === 'mortar' ? 'mortar' : e.def.crewWeapon === 'tripod_mg' ? 'mg' : 'at';
        const t = tw[e.id] || (tw[e.id] = { s, k, life: 0, dep: 0, fire: 0, last: e.lastFire });
        t.life += SIM.DT; if (e.crew.state === 'deployed') t.dep += SIM.DT;
        if (e.lastFire !== t.last) { t.fire++; t.last = e.lastFire; } }
    }
  }
  for (const s of ['us', 'de']) { add(s, 'games'); add(s, 'firstFuelVehicleMin', firstV[s] != null ? firstV[s] / 60 : mins); }
  for (const t of Object.values(tw)) { add(t.s, t.k + ' life', t.life); add(t.s, t.k + ' deployed', t.dep); add(t.s, t.k + ' bursts', t.fire); }
  const vp = G.players.map(p => p.vp);
  if (G.over) wins[G.players[G.over.winner] ? G.players[G.over.winner].side : 'draw']++; else if (Math.abs(vp[0] - vp[1]) > 0) wins[vp[0] > vp[1] ? G.players[0].side : G.players[1].side]++;
  if (G.barrages) add('us', 'x', 0);
}
for (const s of ['us', 'de']) {
  const T = tot[s], n = T.games;
  const built = Object.keys(T).filter(k => k.startsWith('built ')).sort().map(k => `${k.slice(6)} ${(T[k] / n).toFixed(1)}`).join(', ');
  console.log(`${s}: per game built: ${built}`);
  console.log(`   first fuel vehicle at min ${(T.firstFuelVehicleMin / n).toFixed(1)} (avg; ${mins} = never)`);
  for (const k of ['mg', 'mortar', 'at']) if (T[k + ' life']) console.log(`   ${k}: deployed ${(100 * T[k + ' deployed'] / T[k + ' life']).toFixed(0)}% of life, ${(T[k + ' bursts'] / (T[k + ' life'] / 60)).toFixed(1)} shots/min alive`);
}
console.log('ahead at end / won:', JSON.stringify(wins));
