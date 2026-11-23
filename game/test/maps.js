// Every map in maps.js is playable and fair enough: node game/test/maps.js. Houses have art and stand clear of roads,
// points and bases; every point can be reached on foot and by vehicle from both HQs; the walk from each base to its
// nearest munitions, fuel and victory points, and to all victory points, is close for both sides (MAP.check).
const path = require('path'), src = p => path.join(__dirname, '..', 'src', p);
global.U = require(src('util.js')); global.MAPS = require(src('maps.js')); global.MAP = require(src('map.js'));
let bad = 0;
for (const id of Object.keys(MAPS)) {
  if (id === 'default') continue;
  const t = Date.now(), m = MAP.create(7, MAPS[id]), r = MAP.check(m, MAPS[id]);
  console.log(`${id} (${MAPS[id].name}): ${m.houses.length} houses, ${m.points.length} points, ${m.trees.length} trees, ${m.covers.length} cover pieces, checked in ${Date.now() - t} ms`);
  r.sides.forEach((S, i) => console.log(`  base ${i + 1}: nearest standard ${Math.round(S.nearest.standard)} m, munitions ${Math.round(S.nearest.munitions)} m, fuel ${Math.round(S.nearest.fuel)} m, VP ${Math.round(S.nearest.victory)} m; all VPs ${Math.round(S.vpWalk)} m; points nearer: ${Object.entries(S.near).map(([k, v]) => k + ' ' + v).join(', ')}`));
  for (const w of r.warn) console.log('  balance: ' + w);
  for (const p of r.problems) { console.log('  FAIL ' + p); bad++; }
  if (r.warn.length) { console.log('  FAIL the halves are not balanced (see above)'); bad++; }
}
console.log(bad ? `${bad} problems` : 'maps ok'); process.exit(bad ? 1 : 0);
