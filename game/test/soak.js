// Soak test: many AI-vs-AI matches with invariant checks. Prints every problem found, once per kind.
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const problems = new Map(), note = (k, d) => { if (!problems.has(k)) problems.set(k, { n: 0, d }); problems.get(k).n++; };
const games = +(process.argv[2] || 8), mins = +(process.argv[3] || 18);
const results = [];
for (let g = 0; g < games; g++) {
  const side = g % 2 ? 'de' : 'us', seed = 7;
  const G = SIM.create({ seed: seed + g * 0, playerSide: side, crewLayout: layout });
  G.rng = U.rng(1000 + g);
  const still = new Map(); let worst = 0;
  while (G.t < mins * 60 && !G.over) {
    const t0 = process.hrtime.bigint();
    try { AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT); } catch (e) { note('exception: ' + e.message, e.stack.split('\n').slice(1, 3).join(' | ')); break; }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6; if (ms > worst) worst = ms;
    if ((G.t * 20 | 0) % 20) continue;   // checks once a second
    const nav = MAP.navGrids(G.map);
    for (const P of G.players) {
      for (const k in P.res) if (!isFinite(P.res[k])) note('resource not finite', k);
      if (P.res.mp < -1 || P.res.mu < -1 || P.res.fu < -1) note('negative resources', JSON.stringify(P.res));
      if (P.pop > P.popCap + 15) note('pop over cap', P.pop);
    }
    for (const e of G.ents) {
      if (e.dead) continue;
      if (!isFinite(e.x) || !isFinite(e.y)) note('entity position NaN', e.defId);
      if (e.x < 0 || e.y < 0 || e.x > 200 || e.y > 200) note('entity off map', e.defId);
      if (e.type === 'squad') {
        for (const m of e.models) if (m.alive) {
          if (!isFinite(m.x) || !isFinite(m.hp)) note('model NaN', e.defId);
          const k = e.id + ':' + m.i;   // consecutive seconds inside an obstacle (men standing in a fighting position they hold are meant to be)
          if (!MAP.walkable(nav.inf, G.map, m.x, m.y) && !(e.crew && e.crew.state !== 'packed') && !(e.garrison != null && G.map.houses[e.garrison].pit)) { still.set(k, (still.get(k) || 0) + 1); if (still.get(k) === 8) note('model stuck in blocked ground 8s', e.defId + ' at ' + m.x.toFixed(1) + ',' + m.y.toFixed(1)); } else still.delete(k);
          if (Math.hypot(m.x - e.x, m.y - e.y) > 30 && !(e.crew && e.crew.state !== 'packed')) note('model strayed > 30 m from squad', e.defId);
        }
        // a squad with a path that has not moved for 20 s
        const key = 'p' + e.id, pos = (e.x | 0) + ',' + (e.y | 0);
        if (e.path && e.path.length && !e.retreating && e.suppState === 0 && G.t - e.lastFire > 3 && !(e.order.type === 'attackMove' && e.engageT > G.t)) { const s = still.get(key); if (s && s.pos === pos) { s.n++; if (s.n === 25) note('squad not moving along its path 25s', e.defId + ' order ' + e.order.type); } else still.set(key, { pos, n: 0 }); } else still.delete(key);
      }
      if (e.type === 'vehicle') {
        if (!MAP.walkable(nav.veh, G.map, e.x, e.y)) { const k = 'v' + e.id; still.set(k, (still.get(k) || 0) + 1); if (still.get(k) === 10) note('vehicle in blocked ground 10s', e.defId); } else still.delete('v' + e.id);
        const key = 'q' + e.id, pos = (e.x | 0) + ',' + (e.y | 0);
        if (e.path && e.path.length && G.t - e.lastFire > 3 && !(e.order.type === 'attackMove' && e.engageT > G.t)) { const s = still.get(key); if (s && s.pos === pos) { s.n++; if (s.n === 20) note('vehicle not moving along its path 20s', e.defId); } else still.set(key, { pos, n: 0 }); }
      }
      if (e.type === 'building' && e.built < 1 && G.t - (e.spawnT || 0) > 240) { }
    }
  }
  const P = G.players;
  results.push(`${side} ${U.fmtTime(G.t)} ${G.over ? 'winner ' + P[G.over.winner].side + ' (' + G.over.reason + ')' : 'no result'} vp ${P.map(p => p.vp | 0).join('/')} worst step ${worst.toFixed(1)} ms`);
}
console.log(results.join('\n'));
console.log(problems.size ? [...problems].map(([k, v]) => `PROBLEM x${v.n}: ${k} -- ${v.d}`).join('\n') : 'no problems');
