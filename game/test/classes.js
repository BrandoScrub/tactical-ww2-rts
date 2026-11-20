/* Unit classes and squad-owned weapons hold together.
   node game/test/classes.js   -> "no problems" as its last line */
const D = require('../src/data.js');
const bad = [];
for (const [id, s] of Object.entries(D.SQUADS)) {
  if (!D.CLASSES.infantry[s.cls]) bad.push(`${id}: infantry class '${s.cls}' unknown`);
  const keys = s.weapons.concat((s.upgrades || []).map(u => u.swap && u.swap.weapon));
  for (const k of keys) {
    if (!k) continue;
    const w = D.W[k];
    if (!w) { bad.push(`${id}: weapon ${k} missing`); continue; }
    if (w.squad !== id) bad.push(`${id}: weapon ${k} is not this squad's own copy`);
    if (!D.W[w.base]) bad.push(`${id}: weapon ${k} has no base profile`);
  }
}
for (const [id, v] of Object.entries(D.VEHICLES)) {
  if (!D.CLASSES.vehicle[v.cls]) bad.push(`${id}: vehicle class '${v.cls}' unknown`);
  for (const k of v.weapons) if (!D.W[k]) bad.push(`${id}: weapon ${k} missing`);
}
for (const [k, w] of Object.entries(D.W)) if (!w.type) bad.push(`weapon ${k}: no type`);
const count = (list, key) => Object.values(list).reduce((n, u) => (n[u[key]] = (n[u[key]] || 0) + 1, n), {});
console.log('infantry', JSON.stringify(count(D.SQUADS, 'cls')), 'vehicles', JSON.stringify(count(D.VEHICLES, 'cls')));
bad.forEach(b => console.log('PROBLEM', b));
console.log(bad.length ? `${bad.length} problems` : 'no problems');
process.exit(bad.length ? 1 : 0);
