// Faction balance check: AI against AI on the default map, each faction on each side of it in turn.
// node game/test/balance.js [games=8] [minutes=20] [firstSeed=101] [--json]
// Reports per faction: wins (or ahead on VP at the time limit), how matches ended, VP left, points held, income,
// manpower/fuel spent, men and vehicles lost, kills by the killer's unit type, and what was built.
// Also checks that units which can't capture (vehicles without `capture`) don't sit on points that aren't theirs.
const path = require('path'), fs = require('fs');
const src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.DATA = require(src('data.js')); global.MAP = require(src('map.js'));
global.FOG = require(src('fog.js')); global.COMBAT = require(src('combat.js')); global.SIM = require(src('sim.js')); global.AI = require(src('ai.js'));
const layout = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'art', 'crew_layout.json')));
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), json = process.argv.includes('--json');
const games = +(args[0] || 8), mins = +(args[1] || 20), seed0 = +(args[2] || 101);
const D = DATA;
const blank = () => ({ games: 0, won: 0, hq: 0, vpWin: 0, aheadAtTime: 0, vp: 0, pts: 0, inc: { mp: 0, mu: 0, fu: 0 }, menLost: 0, vehLost: 0,
  killsBy: {}, built: {}, idleOnPoint: 0, capOnPoint: 0, firstFuelVeh: 0, sampleN: 0 });
const tot = { us: blank(), de: blank() };
const canCapture = e => e.type === 'squad' || !!(e.def.capture);
for (let g = 0; g < games; g++) {
  const G = SIM.create({ seed: seed0 + g * 17, playerSide: g % 2 ? 'de' : 'us', crewLayout: layout });
  const side = s => G.players[s].side, seen = new Set(), firstV = {};
  const T = [tot[side(0)], tot[side(1)]];
  G.stats = { pin() {}, kill(G, src, sq) {
    if (!sq || sq.owner < 0) return;
    T[sq.owner].menLost++;
    if (src && src.owner >= 0 && src.owner !== sq.owner) { const k = src.defId.split('_').slice(1).join('_'); T[src.owner].killsBy[k] = (T[src.owner].killsBy[k] || 0) + 1; }
  } };
  const vehAlive = new Map();
  let nextSample = 30;
  while (G.t < mins * 60 && !G.over) {
    AI.step(G, 0); AI.step(G, 1); SIM.step(G, SIM.DT);
    for (const e of G.ents) {
      if (e.owner < 0 || e.type === 'building') continue;
      if (!seen.has(e.id) && !e.dead) {
        seen.add(e.id); const k = e.defId.split('_').slice(1).join('_'); T[e.owner].built[k] = (T[e.owner].built[k] || 0) + 1;
        if (e.type === 'vehicle') vehAlive.set(e.id, e.owner);
        if (e.type === 'vehicle' && (e.def.cost.fu || 0) > 0 && firstV[e.owner] == null) firstV[e.owner] = G.t;
      }
      if (e.dead) continue;
      // a unit that can't capture parked inside a point that isn't ours, with nothing of ours there taking it
      if (!canCapture(e) && !(e.path && e.path.length)) {
        const p = G.map.points.find(p => p.owner !== e.owner && U.dist2(e.x, e.y, p.x, p.y) < p.radius * p.radius);
        if (p && !G.ents.some(o => !o.dead && o.owner === e.owner && o !== e && canCapture(o) && U.dist2(o.x, o.y, p.x, p.y) < p.radius * p.radius)) T[e.owner].idleOnPoint += SIM.DT;
        else if (p) T[e.owner].capOnPoint += SIM.DT;
      }
    }
    for (const [id, o] of vehAlive) { const v = G.ents.find(e => e.id === id); if (!v || v.dead || v.owner !== o) { T[o].vehLost++; vehAlive.delete(id); } }
    if (G.t >= nextSample) {
      nextSample += 30;
      for (const P of G.players) { const t = T[P.slot]; t.sampleN++; t.pts += G.map.points.filter(p => p.owner === P.slot).length; for (const r of ['mp', 'mu', 'fu']) t.inc[r] += P.income[r]; }
    }
  }
  const vp = G.players.map(p => p.vp);
  for (const P of G.players) { const t = T[P.slot]; t.games++; t.vp += P.vp; t.firstFuelVeh += firstV[P.slot] != null ? firstV[P.slot] / 60 : mins; }
  let w = -1;
  if (G.over) { w = G.over.winner; T[w][/Head/.test(G.over.reason) ? 'hq' : 'vpWin']++; }
  else if (vp[0] !== vp[1]) { w = vp[0] > vp[1] ? 0 : 1; T[w].aheadAtTime++; }
  if (w >= 0) T[w].won++;
  if (!json) console.log(`game ${g + 1}: seed ${seed0 + g * 17}, US on ${G.players[0].side === 'us' ? 'left' : 'right'}: ${w < 0 ? 'draw' : side(w).toUpperCase() + (G.over ? ' won (' + G.over.reason + ')' : ' ahead')} at ${U.fmtTime(G.t)}, VP us ${vp[G.players[0].side === 'us' ? 0 : 1] | 0} / de ${vp[G.players[0].side === 'us' ? 1 : 0] | 0}`);
}
if (json) { console.log(JSON.stringify(tot)); process.exit(0); }
for (const s of ['us', 'de']) {
  const t = tot[s], n = t.games, sN = t.sampleN || 1;
  console.log(`\n${s.toUpperCase()}: won ${t.won}/${n} (HQ ${t.hq}, VP to 0 ${t.vpWin}, ahead at ${mins} min ${t.aheadAtTime}); VP left avg ${(t.vp / n).toFixed(0)}`);
  console.log(`  points held avg ${(t.pts / sN).toFixed(1)}; income/min avg mp ${(t.inc.mp / sN).toFixed(0)} mu ${(t.inc.mu / sN).toFixed(0)} fu ${(t.inc.fu / sN).toFixed(1)}; first fuel vehicle min ${(t.firstFuelVeh / n).toFixed(1)}`);
  console.log(`  lost per game: men ${(t.menLost / n).toFixed(1)}, vehicles ${(t.vehLost / n).toFixed(1)}`);
  const kb = Object.entries(t.killsBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(', ');
  console.log(`  kills per game by unit: ${kb}`);
  console.log(`  built per game: ${Object.entries(t.built).sort().map(([k, v]) => `${k} ${(v / n).toFixed(1)}`).join(', ')}`);
  console.log(`  non-capturing vehicles on points not theirs: alone ${(t.idleOnPoint / n).toFixed(0)} s/game, with a capturer ${(t.capOnPoint / n).toFixed(0)} s/game`);
}
