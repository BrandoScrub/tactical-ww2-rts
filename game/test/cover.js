// Cover check: runs AI-vs-AI games and reports how units use cover and the field works the AI builds.
// node game/test/cover.js [games=6] [minutes=18]
//   in fights:     share of infantry man-seconds under fire (hit or shot at in the last 3 s) in heavy / light / no cover,
//                  judged against the nearest visible enemy, the way the game rolls it
//   field works:   fighting positions and sandbag lines built, how long positions were held and by what, shots fired
//                  from them, and how many men were lost in them against how many were put in
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const games = +(process.argv[2] || 6), mins = +(process.argv[3] || 18);
const T = { us: {}, de: {} }, add = (s, k, v = 1) => T[s][k] = (T[s][k] || 0) + v;
const wins = { us: 0, de: 0, draw: 0 };
let problems = 0;
for (let g = 0; g < games; g++) {
  const G = SIM.create({ seed: 11 + g * 13, playerSide: g % 2 ? 'de' : 'us', crewLayout: layout });
  const side = o => G.players[o].side, held = new Map(), lastFire = new Map();
  while (G.t < mins * 60 && !G.over) {
    AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT);
    for (const e of G.ents) {
      if (e.dead || e.owner < 0 || e.type !== 'squad') continue;
      const s = side(e.owner);
      const shot = G.t - (e.lastHit || -99) < 3;
      if (!shot || e.retreating) continue;
      let foe = null, fd = 1e9;
      for (const o of G.ents) if (!o.dead && o.owner === 1 - e.owner && o.type !== 'building' && FOG.visible(G, e.owner, o)) { const d = U.dist2(o.x, o.y, e.x, e.y); if (d < fd) { fd = d; foe = o; } }
      for (const m of e.models) {
        if (!m.alive) continue;
        const c = e.garrison != null ? (G.map.houses[e.garrison].pit ? 'pit' : 'house') : foe ? MAP.coverAt(G.map, m.x, m.y, foe.x, foe.y) : MAP.coverAt(G.map, m.x, m.y);
        add(s, 'fire ' + c, SIM.DT); add(s, 'fire all', SIM.DT);
      }
    }
    for (const h of G.map.houses) {
      if (!h.pit) continue;
      const s = side(h.owner);
      if (!held.has(h)) { held.set(h, true); add(s, 'pits'); }
      if (h.dead) { if (!h.counted) { h.counted = true; add(s, 'pits destroyed'); } continue; }
      if (h.built < 1) continue;
      add(s, 'pit time', SIM.DT);
      const o = h.occ != null ? G.byId.get(h.occ) : null;
      if (o && !o.dead) {
        const k = o.crew ? 'hmg' : 'inf', os = side(o.owner);
        add(os, 'pit held ' + k + (o.owner !== h.owner ? ' (taken)' : ''), SIM.DT);
        if (o.lastFire !== lastFire.get(o.id)) { lastFire.set(o.id, o.lastFire); add(os, 'pit bursts'); }
        const al = o.models.filter(m => m.alive).length;
        if (o.pitN != null && al < o.pitN) add(os, 'pit men lost', o.pitN - al);
        if (o.pitN == null) add(os, 'pit men in', al);
        o.pitN = al;
        // a man in a position must stand inside its parapet
        for (const m of o.models) if (m.alive && Math.hypot(m.x - h.x, m.y - h.y) > h.w / 2 - .3) { if (problems++ < 5) console.log('PROBLEM: a man outside the position he holds', o.defId, Math.hypot(m.x - h.x, m.y - h.y).toFixed(2)); }
      }
    }
    for (const e of G.ents) if (e.type === 'squad' && e.garrison == null) e.pitN = null;
  }
  for (const c of G.map.covers) if (c.owner >= 0 && c.kind === 'sandbags') add(side(c.owner), 'sandbag pieces');
  for (const s of ['us', 'de']) add(s, 'games');
  const vp = G.players.map(p => p.vp);
  if (G.over) wins[G.players[G.over.winner] ? G.players[G.over.winner].side : 'draw']++; else if (vp[0] !== vp[1]) wins[vp[0] > vp[1] ? G.players[0].side : G.players[1].side]++; else wins.draw++;
}
const pc = (a, b) => b ? (100 * a / b).toFixed(0) + '%' : '-';
for (const s of ['us', 'de']) {
  const t = T[s], n = t.games;
  console.log(`${s}: under fire: heavy ${pc(t['fire heavy'] || 0, t['fire all'])}, light ${pc(t['fire light'] || 0, t['fire all'])}, none ${pc(t['fire none'] || 0, t['fire all'])}, negative ${pc(t['fire negative'] || 0, t['fire all'])}, house ${pc(t['fire house'] || 0, t['fire all'])}, position ${pc(t['fire pit'] || 0, t['fire all'])}`);
  console.log(`   field works per game: positions ${((t.pits || 0) / n).toFixed(1)} (destroyed ${((t['pits destroyed'] || 0) / n).toFixed(1)}), sandbag pieces ${((t['sandbag pieces'] || 0) / n).toFixed(1)}`);
  const ht = Object.keys(t).filter(k => k.startsWith('pit held')).map(k => `${k.slice(9)} ${pc(t[k], t['pit time'] || 0)}`).join(', ');
  console.log(`   positions held: ${ht || 'never'} of the time they stood (own and taken); bursts from them ${((t['pit bursts'] || 0) / n).toFixed(0)}/game; men lost in them ${t['pit men lost'] || 0} of ${t['pit men in'] || 0} put in`);
}
console.log('ahead at end / won:', JSON.stringify(wins));
console.log(problems ? problems + ' problems' : 'no problems');
