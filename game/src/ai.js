/* Skirmish AI: plays by the same rules and sees through the same fog as the player. Each second it spends
   resources (units and buildings in tech order), sends squads to the points worth taking or defending, pulls back
   squads and vehicles that are losing, sets up team weapons facing the enemy, throws grenades at enemies in cover
   and points anti-tank units at enemy vehicles. */
const AI = (() => {
  const D = DATA;
  /* unit wishes by phase: [unit, weight]; tech follows FACTIONS[side].buildings */
  const PLAN = {
    de: { early: [['de_grenadiers', 3], ['de_hmg', 2.2], ['de_mortar', 1.2], ['de_pioneers', .4], ['de_bike', .5]], mid: [['de_grenadiers', 2], ['de_hmg', 1.2], ['de_mortar', 1.2], ['de_schreck', 1.5], ['de_222', 2], ['de_pz2', 1.5], ['de_panzergrenadiers', 2], ['de_at_gun', 1.2], ['de_stug', 2], ['de_251', .4], ['de_sniper', .5]], late: [['de_pz4', 3], ['de_stug', 2], ['de_panzergrenadiers', 2], ['de_grenadiers', 1.5], ['de_at_gun', 1], ['de_pz2', 1]] },
    us: { early: [['us_riflemen', 3], ['us_hmg', 2], ['us_mortar', 1.2], ['us_engineers', .4], ['us_jeep', .6]], mid: [['us_riflemen', 2], ['us_hmg', 1.2], ['us_mortar', 1.2], ['us_bazooka', 1.5], ['us_m8', 2], ['us_at_gun', 1.2], ['us_halftrack', .4], ['us_sniper', .5], ['us_chaffee', 1.5]], late: [['us_sherman', 3], ['us_m10', 2], ['us_riflemen', 2], ['us_at_gun', 1], ['us_bazooka', 1]] },
  };
  const CAP = { de_bike: 1, us_jeep: 1, de_mortar: 2, us_mortar: 2, de_hmg: 2, us_hmg: 2, de_sniper: 1, us_sniper: 1, de_251: 1, us_halftrack: 1 };
  /* fighting vehicles (fuel cost, not a transport) wanted before teching to tier 3 and 4: without this the AI saved its
     fuel for the next building for the whole game and never fielded a vehicle */
  const VEH_BEFORE_TECH = [0, 0, 1, 2];
  const isFightingVehicle = def => def && def.armor && (def.cost.fu || 0) > 0 && !def.reinforces;
  /* what can hurt armour: anti-tank guns and rockets, and cannon that go through a light tank's front */
  const isAntiTank = def => !!def && (def.weapons || []).some(x => D.W[x] && (D.W[x].kind === 'at' || (D.W[x].kind === 'cannon' && D.W[x].pen[0] > 150)));
  /* enemy armour seen is remembered this long (s): it drives off, but it is still out there */
  const ARMOUR_MEMORY = 150;
  function step(G, slot) {
    const S = (G.ai || (G.ai = {}))[slot] || (G.ai[slot] = {}), me = G.players[slot];
    if ((S.t || 0) > G.t) return;
    S.t = G.t + 1;
    const mine = G.ents.filter(e => !e.dead && e.owner === slot);
    spend(G, me, mine, S);
    fortify(G, me, mine, S);
    command(G, me, mine, S);
  }

  /* Field works: now and then an idle builder digs a fighting position by a point we hold on the side facing the
     enemy and lays a sandbag line in front of it (CoH3 engineers fortify held points). A few positions at most, and
     only with manpower to spare, so it never starves the army or the tech. */
  const FORT = { every: 20, maxPits: { us: 2, de: 3 }, spare: 120, from: 120 };
  function fortify(G, me, mine, S) {
    // the sandbags that go with a finished position
    for (const e of mine) if (e.fortQueue && e.type === 'squad' && !e.retreating && e.order.type !== 'build' && !e.buildQueue.length) { const o = e.fortQueue; e.fortQueue = null; SIM.issue(G, [e.id], o); }
    // man our empty positions: the nearest machine-gun team, else an infantry squad holding near it
    if ((S.manT || 0) < G.t) {
      S.manT = G.t + 3;
      for (const h of G.map.houses) {
        if (!h.pit || h.dead || h.built < 1 || h.occ != null || h.owner !== me.slot || mine.some(e => e.order && e.order.type === 'garrison' && e.order.house === h.id)) continue;
        const free = e => e.type === 'squad' && !e.retreating && e.garrison == null && !e.def.builder && e.order.type !== 'attack' && e.suppState < 2;
        const near = (e, r) => U.dist2(e.x, e.y, h.x, h.y) < r * r;
        // machine guns take positions through mgPlan (only one that watches the way in); riflemen man the rest, and only
        // when there is something coming
        const threat = G.ents.some(o => !o.dead && o.owner === 1 - me.slot && o.type !== 'building' && U.dist2(o.x, o.y, h.x, h.y) < 55 * 55 && FOG.visible(G, me.slot, o));
        const inf = !threat ? null : mine.filter(e => free(e) && !e.crew && near(e, 18)).sort((a, b) => U.dist2(a.x, a.y, h.x, h.y) - U.dist2(b.x, b.y, h.x, h.y))[0];
        if (inf) SIM.issue(G, [inf.id], { type: 'garrison', house: h.id });
      }
    }
    patchGaps(G, me, mine, S);
    if (G.t < FORT.from || (S.fortT || 0) > G.t) return;
    S.fortT = G.t + FORT.every;
    // a position left half dug (its diggers retreated or died): a free builder goes back and finishes it
    const half = G.map.houses.find(h => h.pit && !h.dead && h.built < 1 && h.owner === me.slot && !mine.some(e => e.buildQueue && e.buildQueue.some(j => j.kind === 'pit' && j.id === h.id)));
    if (half) {
      const b = mine.filter(e => e.type === 'squad' && e.def.builder && !e.retreating && e.order.type !== 'build' && e.order.type !== 'repair' && e.suppState < 1 && G.t - e.lastHit > 8)
        .sort((x, y) => U.dist2(x.x, x.y, half.x, half.y) - U.dist2(y.x, y.y, half.x, half.y))[0];
      if (b) SIM.issue(G, [b.id], { type: 'build', what: half.defId, x: half.x, y: half.y });
      return;                                              // no new one while one is still open
    }
    const id = me.side + '_position', def = D.DEFENCES[id]; if (!def) return;
    const b = mine.find(e => e.type === 'squad' && e.def.builder && !e.retreating && e.order.type !== 'build' && e.order.type !== 'repair' && !e.buildQueue.length && !e.fortQueue && G.t - e.lastHit > 5);
    if (!b || me.res.mp < (def.cost.mp || 0) + FORT.spare) return;
    const pits = G.map.houses.filter(h => h.pit && !h.dead && h.owner === me.slot);
    if (pits.length >= FORT.maxPits[me.side]) return;
    const hq = SIM.hqOf(G, me.slot), foe = SIM.hqOf(G, 1 - me.slot); if (!hq || !foe) return;
    const held = G.map.points.filter(p => p.owner === me.slot && !pits.some(h => U.dist2(h.x, h.y, p.x, p.y) < 20 * 20) && Math.hypot(p.x - hq.x, p.y - hq.y) < 90)
      .sort((a, c) => Math.hypot(a.x - foe.x, a.y - foe.y) - Math.hypot(c.x - foe.x, c.y - foe.y));
    const gun = D.W[me.side === 'us' ? 'm1919' : 'mg42'], R = gun.rng[2] * .9, arcHalf = gun.arc / 2 * Math.PI / 180;
    for (const p of held) {
      // dig where a machine gun in it would see the enemy's way in; skip points where no spot sees it
      const route = approach(G, me.slot, p), ahead = Math.atan2(foe.y - p.y, foe.x - p.x);
      let pick = null;
      for (const off of [0, .6, -.6, 1.1, -1.1, 1.6, -1.6]) for (const r of [p.radius + 4, p.radius + 7]) {
        const a = ahead + off, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (SIM.canPit(G, me.slot, id, x, y)) continue;
        const v = routeView(G, route, x, y, R, arcHalf, false); if (!v || v.watch <= 0) continue;
        const sc = v.watch - Math.abs(off) * .5;
        if (!pick || sc > pick.sc) pick = { x, y, face: v.face, sc };
      }
      if (pick) {
        const { x, y, face } = pick;
        SIM.issue(G, [b.id], { type: 'build', what: id, x, y, face });
        // and a sandbag line 4 m in front of it, across the line of fire
        const fx = x + Math.cos(face) * 4.2, fy = y + Math.sin(face) * 4.2, px = -Math.sin(face) * 3, py = Math.cos(face) * 3;
        const sb = { type: 'build', what: 'sandbags', x: fx - px, y: fy - py, x2: fx + px, y2: fy + py };
        // only on open ground: not into a house, a wall or the position itself
        const nav = MAP.navGrids(G.map).inf; let clear = true;
        for (let t = 0; t <= 1.0001 && clear; t += .125) { const qx = sb.x + (sb.x2 - sb.x) * t, qy = sb.y + (sb.y2 - sb.y) * t; if (!MAP.walkable(nav, G.map, qx, qy) || MAP.houseAt(G.map, qx, qy, 1)) clear = false; }
        if (clear) b.fortQueue = sb;
        return;
      }
    }
  }

  /* Broken sandbag lines: when it is quiet, an idle builder re-lays the pieces shells and tanks knocked out of our own
     lines near the points we hold (a gap is debris of ours with no sandbags standing over it). A few pieces a pass. */
  const PATCH = { every: 15, quiet: 35, nearPoint: 30, max: 3 };
  function patchGaps(G, me, mine, S) {
    if ((S.patchT || 0) > G.t) return;
    S.patchT = G.t + PATCH.every;
    const b = mine.find(e => e.type === 'squad' && e.def.builder && !e.retreating && e.order.type === 'idle' && !e.buildQueue.length && !e.fortQueue && G.t - e.lastHit > 8);
    if (!b) return;
    const foes = G.ents.filter(e => !e.dead && e.owner === 1 - me.slot && e.type !== 'building');
    const gaps = [];
    for (const d of G.map.debris || []) {
      if (d.kind !== 'sandbags' || d.owner !== me.slot || !d.built || d.patched) continue;
      if (!G.map.points.some(p => p.owner === me.slot && U.dist2(p.x, p.y, d.x, d.y) < PATCH.nearPoint * PATCH.nearPoint)) continue;
      if (foes.some(e => U.dist2(e.x, e.y, d.x, d.y) < PATCH.quiet * PATCH.quiet)) continue;
      if (MAP.coversIn(G.map, d.x, d.y, .45).some(c => c.kind === 'sandbags')) { d.patched = true; continue; }
      gaps.push(d); if (gaps.length >= PATCH.max) break;
    }
    if (!gaps.length) return;
    gaps.forEach((d, i) => {
      const h = (d.len || 1) / 2, cx = Math.cos(d.ang) * h, cy = Math.sin(d.ang) * h;
      SIM.issue(G, [b.id], { type: 'build', what: 'sandbags', x: d.x - cx, y: d.y - cy, x2: d.x + cx, y2: d.y + cy }, i > 0);
      d.patched = true;
    });
  }

  function spend(G, me, mine, S) {
    const builders = mine.filter(e => e.type === 'squad' && e.def.builder);
    const buildings = mine.filter(e => e.type === 'building');
    // tech: next building in order, once a few squads are out
    const army = mine.filter(e => e.type !== 'building' && !(e.def && e.def.builder)).length;
    const tech = me.F.buildings, owned = new Set(buildings.map(b => b.defId));
    const next = tech.find(b => !owned.has(b) && !SIM.buildReqMissing(G, me.slot, b));
    const ti = next ? tech.indexOf(next) : -1;
    // fighting vehicles out or on order, and the ones the finished buildings can make
    const queuedUnits = buildings.flatMap(b => b.queue.map(q => q.unit));
    const vehicles = mine.filter(e => e.type === 'vehicle' && isFightingVehicle(e.def)).length + queuedUnits.filter(u => isFightingVehicle(SIM.unitDef(u))).length;
    const vehOpts = PLAN[me.side].mid.concat(PLAN[me.side].late).map(([u]) => u).filter((u, i, a) => a.indexOf(u) === i && isFightingVehicle(SIM.unitDef(u)) && buildings.some(b => b.built >= 1 && b.def.produce.includes(u)));
    const vehShort = vehOpts.length > 0 && ti >= 0 && vehicles < VEH_BEFORE_TECH[ti] && G.t < [0, 0, 600, 840][ti];
    // enemy armour: what is in sight now, remembered for a while
    const armourNow = G.ents.filter(e => !e.dead && e.owner !== me.slot && e.owner >= 0 && e.type === 'vehicle' && e.def.armor && FOG.visible(G, me.slot, e)).length;
    if (armourNow >= (S.armour || 0) || G.t - (S.armourT || 0) > ARMOUR_MEMORY) { S.armour = armourNow; S.armourT = G.t; }
    const enemyV = S.armour || 0;
    // ...and what we have against it. Short of it, an anti-tank unit comes before the next building, before the vehicle
    // being saved for and before more riflemen. (Before: the Motor Pool was kept free for a vehicle the fuel never
    // came for, so the American AI never built an anti-tank gun; and once it began saving 140 fuel for the Tank Depot
    // it bought no vehicle either, for the rest of the match.)
    const antiTank = mine.filter(e => e.type !== 'building' && isAntiTank(e.def)).length + queuedUnits.filter(u => isAntiTank(SIM.unitDef(u))).length;
    let counter = null;
    if (enemyV > 0 && antiTank < Math.min(3, enemyV)) {
      const mpRate = Math.max(60, me.income ? me.income.mp : 240) / 60, fuRate0 = Math.max(1, me.income ? me.income.fu : 6) / 60;
      const wait = u => { const c = SIM.unitDef(u).cost; return Math.max(0, ((c.mp || 0) - me.res.mp) / mpRate, ((c.fu || 0) - me.res.fu) / fuRate0); };
      const opts = [...new Set(buildings.filter(b => b.built >= 1).flatMap(b => b.def.produce))].filter(u => isAntiTank(SIM.unitDef(u)));
      // the one that can be had soonest; of those within 20 s of each other, the one that costs more (the better one)
      if (opts.length) { const w0 = Math.min(...opts.map(wait)); counter = opts.filter(u => wait(u) <= w0 + 20).sort((a, b) => (SIM.unitDef(b).cost.fu || 0) - (SIM.unitDef(a).cost.fu || 0) || (SIM.unitDef(b).cost.mp || 0) - (SIM.unitDef(a).cost.mp || 0))[0]; }
    }
    // the next building's fuel is minutes away and there is no vehicle out: a vehicle now is worth more than a tank later
    const techFuel = next ? (D.BUILDINGS[next].cost.fu || 0) - me.res.fu : 0;
    const techFar = vehOpts.length > 0 && vehicles < 1 && techFuel / (Math.max(1, me.income ? me.income.fu : 6) / 60) > 180;
    const wantTech = next && !vehShort && !techFar && !counter && (army >= [0, 4, 6, 8][ti] || G.t > [0, 220, 330, 480][ti]);
    // base buildings are ordered from the HQ and raise themselves
    const hqB = SIM.hqOf(G, me.slot);
    if (wantTech && hqB && SIM.canAfford(me, D.BUILDINGS[next].cost) && !buildings.some(b => b.built < 1)) {
      const spot = findSpot(G, me.slot, next);
      if (spot) SIM.issue(G, [hqB.id], { type: 'construct', what: next, x: spot.x, y: spot.y });
    }
    // no builder left: replace one first, ahead of everything else (repairs and field works need one)
    const builderQueued = buildings.some(b => b.queue.some(q => SIM.unitDef(q.unit).builder));
    if (!builders.length && !builderQueued) {
      const hqB = buildings.find(b => b.built >= 1 && b.def.produce.includes(me.F.builder));
      if (hqB && !hqB.queue.length && !SIM.prodBlock(G, hqB, me.F.builder)) { SIM.issue(G, [hqB.id], { type: 'produce', unit: me.F.builder }); return; }
    }
    // keep money for tech when it is close, but only what the tech is actually waiting on: saving manpower while fuel is
    // still far short just banks it (the old rule left 200+ manpower idle and starved the army)
    let reserve = { mp: 0, fu: 0 };
    if (wantTech) {
      const c = D.BUILDINGS[next].cost, fuShort = (c.fu || 0) - me.res.fu, fuRate = Math.max(1, me.income ? me.income.fu : 6) / 60;
      reserve = { mp: fuShort > 0 && fuShort / fuRate > 45 ? 0 : (c.mp || 0), fu: c.fu || 0 };
    }
    // saving for a vehicle instead: pick one the buildings can make and keep its fuel (and its manpower once the fuel is
    // nearly there), so infantry spending doesn't eat it
    let saveFor = null;
    if (!wantTech && vehOpts.length && (vehShort || vehicles < 1 + (G.t > 600 ? 2 : 0) + (owned.has(tech[3]) ? 1 : 0))) {
      if (!S.saveFor || !vehOpts.includes(S.saveFor)) S.saveFor = vehOpts[Math.floor(G.rng() * vehOpts.length)];
      saveFor = S.saveFor;
      const c = SIM.unitDef(saveFor).cost, fuShort = (c.fu || 0) - me.res.fu, fuRate = Math.max(1, me.income ? me.income.fu : 6) / 60;
      reserve = { mp: fuShort > 0 && fuShort / fuRate > 30 ? 0 : (c.mp || 0), fu: c.fu || 0 };
    } else S.saveFor = null;
    const phase = G.t < 240 ? 'early' : (owned.has(tech[3]) ? 'late' : 'mid');
    const wishes = PLAN[me.side][phase].concat(phase === 'late' ? PLAN[me.side].mid.map(([u, w]) => [u, w * .4]) : []);
    // the anti-tank unit's manpower comes first; fuel already being kept for a vehicle stays kept
    if (counter) { const c = SIM.unitDef(counter).cost; reserve = { mp: c.mp || 0, fu: Math.max(c.fu || 0, saveFor ? reserve.fu || 0 : 0) }; }
    for (const b of buildings) {
      if (b.built < 1 || b.queue.length >= 1) continue;
      // one anti-tank unit is out and the vehicle being saved for can be paid for now: the vehicle goes first, so a
      // building that makes both (the Motor Pool) doesn't turn out guns only
      const vehNow = saveFor && antiTank >= 1 && b.def.produce.includes(saveFor) && SIM.canAfford(me, SIM.unitDef(saveFor).cost) && !SIM.prodBlock(G, b, saveFor);
      if (counter && b.def.produce.includes(counter) && !vehNow) {
        if (SIM.canAfford(me, SIM.unitDef(counter).cost) && !SIM.prodBlock(G, b, counter)) { SIM.issue(G, [b.id], { type: 'produce', unit: counter }); counter = null; reserve = { mp: 0, fu: saveFor ? reserve.fu || 0 : 0 }; }
        continue;   // this building waits for the anti-tank unit
      }
      if (saveFor && b.def.produce.includes(saveFor)) {
        if (SIM.canAfford(me, SIM.unitDef(saveFor).cost) && !SIM.prodBlock(G, b, saveFor)) { SIM.issue(G, [b.id], { type: 'produce', unit: saveFor }); S.saveFor = null; saveFor = null; reserve = { mp: counter ? reserve.mp : 0, fu: 0 }; }
        continue;   // this building waits for the vehicle
      }
      const opts = wishes.filter(([u]) => b.def.produce.includes(u)).map(([u, w]) => {
        const def = SIM.unitDef(u);
        let ww = w;
        if (enemyV && isAntiTank(def)) ww *= 1 + enemyV;
        // fuel is being kept for something else: don't settle on a unit that needs it (the pick is kept until bought, so
        // a building that picked a vehicle while the fuel was spoken for built nothing at all)
        if ((def.cost.fu || 0) && me.res.fu - def.cost.fu < (reserve.fu || 0) * .8) ww = 0;
        if (def.builder && builders.length + (builderQueued ? 1 : 0) >= (G.t > 300 ? 2 : 1)) ww = 0;
        const have = mine.filter(e => e.defId === u).length + G.ents.filter(x => x.type === 'building' && x.owner === me.slot && x.queue.some(q => q.unit === u)).length;
        const cap = CAP[u] != null ? CAP[u] : 99; if (have >= cap) ww = 0;
        // fewer of what we already have: a mix of infantry, team weapons and vehicles, not one squad type spammed
        ww /= 1 + have * (def.armor ? .35 : .6);
        return [u, ww];
      }).filter(([, w]) => w > 0);
      if (!opts.length) continue;
      // keep the last pick until it is bought: re-rolling every second while saving up meant the cheapest unit in the
      // list was nearly always the one bought (mortars and MGs before riflemen)
      const picks = S.picks || (S.picks = {});
      let pick = opts.some(([u]) => u === picks[b.id]) ? picks[b.id] : null;
      if (!pick) {
        let tot = opts.reduce((a, [, w]) => a + w, 0), r = G.rng() * tot; pick = opts[0][0];
        for (const [u, w] of opts) { r -= w; if (r <= 0) { pick = u; break; } }
        picks[b.id] = pick;
      }
      const def = SIM.unitDef(pick), cost = def.cost;
      const after = { mp: me.res.mp - (cost.mp || 0), fu: me.res.fu - (cost.fu || 0) };
      if (after.mp < (reserve.mp || 0) * .8 || after.fu < (reserve.fu || 0) * .8 && (cost.fu || 0)) continue;
      const block = SIM.prodBlock(G, b, pick);
      if (!block) { SIM.issue(G, [b.id], { type: 'produce', unit: pick }); delete picks[b.id]; }
      else if (block === 'Population cap reached') delete picks[b.id];
    }
    // upgrades with spare munitions
    for (const e of mine) if (e.type === 'squad' && e.def.upgrades && me.res.mu > 120 && !e.upgrading && SIM.nearReinforcePoint(G, e)) {
      const up = e.def.upgrades.find(u => !e.upgrades.has(u.id) && !(u.swap && u.swap.sprite === 'flamethrower' && G.rng() < .7));
      if (up) SIM.issue(G, [e.id], { type: 'upgrade', id: up.id });
    }
  }
  function findSpot(G, slot, defId) {
    const hq = SIM.hqOf(G, slot); if (!hq) return null;
    const dir = slot ? -1 : 1, def = D.BUILDINGS[defId], m = G.map;
    // a clear strip all round, so buildings never box each other in: vehicles from a Motor Pool walled in by the HQ and
    // the Weapon Support Center couldn't drive out
    const PAD = 7;
    const clearAround = (x, y) => {
      for (let yy = Math.floor(y - def.size[1] / 2 - PAD); yy < Math.ceil(y + def.size[1] / 2 + PAD); yy++) for (let xx = Math.floor(x - def.size[0] / 2 - PAD); xx < Math.ceil(x + def.size[0] / 2 + PAD); xx++) {
        if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) return false;
        if (m.block[yy * m.w + xx] & MAP.BV) return false;
      }
      return true;
    };
    for (const padded of [true, false]) for (let r = 16; r < 52; r += 4) for (let a = 0; a < 16; a++) {
      const ang = a / 16 * U.TAU, x = hq.x + Math.cos(ang) * r, y = hq.y + Math.sin(ang) * r;
      // keep behind the HQ (away from the enemy) where possible
      if ((x - y) * dir > (hq.x - hq.y) * dir + 18) continue;
      if (!SIM.canPlace(G, slot, defId, x, y) && !SIM.sealsBase(G, slot, defId, x, y) && (!padded || clearAround(x, y))) return { x, y };
    }
    return null;
  }

  /* Cover the AI moves squads to: a spot a step behind a finished cover segment (sandbags, wall, hedge, rubble, tank
     trap, wreck) that runs across the line of fire from `face`, within r metres of (x, y). Heavy cover beats light;
     nearer beats farther; a spot that walks the squad toward the enemy costs more. Wire gives no cover. */
  const COVER_SEEK = { behind: .85, heavyBonus: 4, advanceCost: .6, react: 10, snap: 9, cooldown: 7 };
  function coverSpot(G, x, y, face, r, fromX, fromY) {
    let best = null, bs = 1e9;
    for (const c of coverSpots(G, x, y, face, r, fromX, fromY)) if (c.score < bs) { bs = c.score; best = c; }
    return best;
  }
  /* every such spot, with its score (lower is better) */
  function coverSpots(G, x, y, face, r, fromX, fromY) {
    const nav = MAP.navGrids(G.map).inf, fx = Math.cos(face), fy = Math.sin(face), seen = new Set(), out = [];
    for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (const c of MAP.coversNear(G.map, x + gx * 8, y + gy * 8)) {
      if (seen.has(c) || !c.alive || !c.cover || c.cover === 'negative' || c.built < 1) continue; seen.add(c);
      const L = Math.hypot(c.bx - c.ax, c.by - c.ay); if (L < .5) continue;
      const nx = -(c.by - c.ay) / L, ny = (c.bx - c.ax) / L, dot = nx * fx + ny * fy;
      if (Math.abs(dot) < .45) continue;                                // running along the line of fire: shields nobody
      const sd = dot > 0 ? -1 : 1, steps = Math.max(1, Math.round(L / 1.5));
      for (let i = 0; i < steps; i++) {
        const t = (i + .5) / steps, px = c.ax + (c.bx - c.ax) * t + nx * sd * COVER_SEEK.behind, py = c.ay + (c.by - c.ay) * t + ny * sd * COVER_SEEK.behind;
        const d = Math.hypot(px - x, py - y); if (d > r || !MAP.walkable(nav, G.map, px, py)) continue;
        const adv = fromX == null ? 0 : Math.max(0, (px - fromX) * fx + (py - fromY) * fy);
        const sc = d + adv * COVER_SEEK.advanceCost - (c.cover === 'heavy' ? COVER_SEEK.heavyBonus : 0);
        out.push({ x: px, y: py, cover: c.cover, score: sc });
      }
    }
    return out;
  }

  /* ---------------- machine guns: hold ground from cover, watching the way the enemy comes ----------------
     CoH3 players put HMGs behind cover (or in a building) beside the points they hold, aimed down the road or gap the
     enemy has to come through. Here: the enemy's walking route to the point (from its HQ) is sampled over its last
     ~70 m; samples where the route is squeezed (houses, walls, hedges either side) count more, as choke points. Each
     candidate spot near the point (behind cover across that route, a free house beside it, or open ground if nothing
     else) scores for cover, for how much of the route it sees inside its range and arc, and for staying near the point.
     The gun faces the middle of what it covers. */
  const MG = { search: 16, routeLen: 70, step: 3, chokeR: 8, every: 40, stay: 6 };
  function approach(G, slot, p) {
    const S = (G.aiRoutes || (G.aiRoutes = {})), key = slot + ':' + p.id, c = S[key];
    if (c && c.t > G.t && c.ver === G.map.version) return c.pts;
    const foe = SIM.hqOf(G, 1 - slot); if (!foe) return [];
    const path = MAP.findPath(G.map, foe.x, foe.y, p.x, p.y, false) || [];
    const nav = MAP.navGrids(G.map).inf, pts = [];
    // walk the route back from the point, a sample every MG.step metres
    let prev = { x: p.x, y: p.y }, run = 0, carry = 0;
    for (let i = path.length - 1; i >= -1 && run < MG.routeLen; i--) {
      const q = i >= 0 ? path[i] : { x: foe.x, y: foe.y }, L = Math.hypot(q.x - prev.x, q.y - prev.y);
      let t = MG.step - carry;
      while (t <= L && run + t < MG.routeLen) {
        const x = prev.x + (q.x - prev.x) * t / L, y = prev.y + (q.y - prev.y) * t / L;
        // how open the ground is across the route: blocked within chokeR either side makes it a choke point
        const ux = (q.x - prev.x) / (L || 1), uy = (q.y - prev.y) / (L || 1);
        let open = 0;
        for (const sd of [-1, 1]) for (let k = 1; k <= MG.chokeR; k++) { if (!MAP.walkable(nav, G.map, x - uy * k * sd, y + ux * k * sd)) break; open++; }
        if (Math.hypot(x - p.x, y - p.y) > p.radius) pts.push({ x, y, w: 1 + Math.max(0, MG.chokeR * 2 - open) / 4 });
        t += MG.step;
      }
      carry = L - (t - MG.step); run += L; prev = q;
    }
    S[key] = { t: G.t + MG.every, ver: G.map.version, pts };
    return pts;
  }
  /* how much of the enemy's way in a gun at (x, y) watches: the route samples it can see within R, weighted, and of
     those the ones inside its arc (a house sees out of every side) */
  function routeView(G, route, x, y, R, half, allRound) {
    let sx = 0, sy = 0, sw = 0;
    const seen = route.filter(q => { const d = Math.hypot(q.x - x, q.y - y); return d < R && d > 3 && MAP.los(G.map, x, y, q.x, q.y); });
    for (const q of seen) { sx += q.x * q.w; sy += q.y * q.w; sw += q.w; }
    if (!sw) return null;
    const face = Math.atan2(sy / sw - y, sx / sw - x);
    const watch = allRound ? sw : seen.reduce((a, q) => a + (Math.abs(U.angNorm(Math.atan2(q.y - y, q.x - x) - face)) <= half ? q.w : 0), 0);
    return { watch, face };
  }
  /* Candidates: spots behind cover, free farmhouses, free fighting positions (any side's, as in CoH3) and the house or
     position this gun already holds. A position is only worth it if the gun can see the way in from it: a pit dug on
     the wrong side of a crest scores nothing for watching and is passed over. */
  function mgPlan(G, me, e, p) {
    const w = SIM.weaponOf(e); if (!w) return null;
    const route = approach(G, me.slot, p); if (!route.length) return null;
    const R = w.rng[2] * .9, half = (w.arc || 60) / 2 * Math.PI / 180;
    // the way the enemy comes from: the route a little out from the point
    const mid = route[Math.min(route.length - 1, 6)], toward = Math.atan2(mid.y - p.y, mid.x - p.x);
    const cands = coverSpots(G, p.x, p.y, toward, p.radius + MG.search).map(c => ({ x: c.x, y: c.y, cover: c.cover, kind: 'spot' }));
    for (const h of G.map.houses) {
      if (h.dead || (h.occ != null && h.occ !== e.id) || h.built < 1 || U.dist2(h.x, h.y, p.x, p.y) >= (p.radius + MG.search) ** 2) continue;
      cands.push({ x: h.x, y: h.y, cover: 'garrison', kind: h.pit ? 'pit' : 'house', h });
    }
    cands.push({ x: p.x - Math.cos(toward) * 6, y: p.y - Math.sin(toward) * 6, cover: 'none', kind: 'spot' });
    // where it is set up now, if near the point: it stays unless somewhere clearly better
    if (e.crew && e.crew.state === 'deployed' && e.garrison == null && U.dist2(e.crew.x, e.crew.y, p.x, p.y) < (p.radius + MG.search) ** 2) {
      const sc = COMBAT.squadCover(G, e);
      cands.push({ x: e.crew.x, y: e.crew.y, cover: sc, kind: 'here' });
    }
    const nav = MAP.navGrids(G.map).inf;
    let best = null, bs = -1e9;
    for (const c of cands) {
      if (c.kind === 'spot' && !MAP.walkable(nav, G.map, c.x, c.y)) continue;
      const v = routeView(G, route, c.x, c.y, R, half, c.kind === 'house'); if (!v) continue;
      const cov = c.cover === 'heavy' || c.cover === 'garrison' ? 9 : c.cover === 'light' ? 6 : 0;
      const far = Math.max(0, Math.hypot(c.x - p.x, c.y - p.y) - p.radius - 4);
      const score = v.watch * 1.4 + cov - far * .8 + ((c.h && c.h.id === e.garrison) || c.kind === 'here' ? MG.stay : 0);
      if (score > bs) { bs = score; best = { ...c, face: v.face, score }; }
    }
    return best;
  }

  /* ---------------- vehicles: fall back to be repaired ----------------
     Below FIX.low health (or FIX.crit with an engine or gun critical), a vehicle breaks off, backs away from armour or guns in front of it, then
     drives to the repair spot behind the HQ and waits there; the nearest engineers come and fix it. It returns to the
     fight at FIX.done. An immobilised one stays and fights, and engineers go to it when the ground round it is clear. */
  const FIX = { low: .25, crit: .4, done: .92, backOff: 14, spotSpace: 6 };
  function repairSpot(G, slot, v) {
    const hq = SIM.hqOf(G, slot); if (!hq) return null;
    const ax = hq.rally.x - hq.x, ay = hq.rally.y - hq.y, L = Math.hypot(ax, ay) || 1;
    // beside the HQ, off to one side of where new units walk out, a slot per vehicle so they don't pile up
    const k = (v.id % 3) - 1, px = -ay / L, py = ax / L;
    const x = hq.x + ax / L * (hq.w * .5 + 6) + px * (10 + k * FIX.spotSpace), y = hq.y + ay / L * (hq.d * .5 + 6) + py * (10 + k * FIX.spotSpace);
    return MAP.nearestOpen(MAP.navGrids(G.map).veh, G.map, x, y, MAP.mainRegion(G.map, true));
  }
  function vehicleFix(G, me, e, visibleEnemies) {
    const crit = e.crit && (e.crit.engine || e.crit.gun);
    if (!e.fixing && (e.hp < e.maxHp * FIX.low || (crit && e.hp < e.maxHp * FIX.crit))) { e.fixing = true; e.backT = 0; }
    if (!e.fixing) return false;
    if (e.hp >= e.maxHp * FIX.done && !e.crit) { e.fixing = false; return false; }
    if (e.crit && e.crit.engine === 2) return true;                 // can't move: it fights where it is until repaired
    const spot = repairSpot(G, me.slot, e); if (!spot) return false;
    const d = Math.hypot(spot.x - e.x, spot.y - e.y);
    if (d < 8) { if (e.order.type !== 'idle' && e.order.type !== 'attack') SIM.issue(G, [e.id], { type: 'stop' }); return true; }
    // armour or anti-tank in front: back off first, front plate toward them
    const threat = visibleEnemies.find(o => U.dist2(o.x, o.y, e.x, e.y) < 45 * 45 && (o.type === 'vehicle' || (SIM.weaponOf(o) && SIM.weaponOf(o).kind === 'at') || (o.models && o.models.some(m => m.alive && m.weapon && D.W[m.weapon].kind === 'at'))));
    if (threat && !e.backT) {
      const away = Math.atan2(e.y - threat.y, e.x - threat.x), bx = e.x + Math.cos(away) * FIX.backOff, by = e.y + Math.sin(away) * FIX.backOff;
      const q = MAP.nearestOpen(MAP.navGrids(G.map).veh, G.map, bx, by, MAP.mainRegion(G.map, true));
      e.backT = G.t + 6; SIM.issue(G, [e.id], { type: 'reverse', x: q.x, y: q.y }); return true;
    }
    if (e.order.type === 'reverse' && e.backT > G.t) return true;
    if (e.order.type !== 'move' || Math.hypot(e.order.x - spot.x, e.order.y - spot.y) > 3) SIM.issue(G, [e.id], { type: 'move', x: spot.x, y: spot.y });
    return true;
  }

  function command(G, me, mine, S) {
    const slot = me.slot, enemy = 1 - slot, pts = G.map.points;
    const hq = SIM.hqOf(G, slot); if (!hq) return;
    const enemyHq = SIM.hqOf(G, enemy);
    const visibleEnemies = G.ents.filter(e => !e.dead && e.owner === enemy && e.type !== 'building' && FOG.visible(G, slot, e));
    // value of each point to us
    const goals = pts.map(p => {
      let v = p.type === 'victory' ? 3.2 : p.type === 'fuel' ? 2.4 : p.type === 'munitions' ? 2 : 1.3;
      if (p.owner === slot) v *= .45; else if (p.owner === enemy) v *= 1.15;
      if (!SIM.connected(G, slot, p) && p.type !== 'victory') v *= .5;   // a cut-off point pays nothing (victory points still count)
      const threat = visibleEnemies.filter(e => U.dist2(e.x, e.y, p.x, p.y) < 30 * 30).length;
      if (p.owner === slot && threat) v *= 2.5;
      return { p, v, assigned: 0, takers: 0 };
    });
    const units = mine.filter(e => e.type !== 'building');
    // Only infantry and vehicles with `capture` (the Kettenkrad's stand-in) can take a point; a jeep, armoured car or
    // tank can't (CoH3). Those go only to points we hold or points our own capturers are taking, as escort, and don't
    // count as the point's taker (a jeep counted as one kept squads away while it sat on a point it could never take).
    const canCapture = e => e.type === 'squad' || !!e.def.capture;
    for (const g of goals) g.takers = units.filter(e => canCapture(e) && !e.retreating && (U.dist2(e.x, e.y, g.p.x, g.p.y) < (g.p.radius + 4) ** 2 ||
      e.order && e.order.x != null && U.dist2(e.order.x, e.order.y, g.p.x, g.p.y) < (g.p.radius + 4) ** 2)).length;
    for (const e of units) {
      // pull back when losing
      if (e.type === 'squad') {
        const al = e.models.filter(m => m.alive).length;
        if (!e.retreating && ((al <= Math.ceil(e.maxModels / (e.def.builder ? 2 : 3)) || e.def.builder && al < e.maxModels && G.t - e.lastHit < 3) && G.t - e.lastHit < 5 || e.suppState === 2 && G.rng() < .3)) { SIM.issue(G, [e.id], { type: 'retreat' }); continue; }
        if (e.retreating) continue;
        // just back from a retreat: wait to refill
        if (al < e.maxModels && SIM.nearReinforcePoint(G, e) && me.res.mp > e.def.reinforce) { if (e.order.type !== 'idle') SIM.issue(G, [e.id], { type: 'stop' }); continue; }
      } else if (e.type === 'vehicle' && vehicleFix(G, me, e, visibleEnemies)) continue;
      if (e.def.builder && (e.order.type === 'build' || e.order.type === 'repair')) continue;
      // repair: a vehicle falling back for it (wherever it is, if the ground round it is clear), else any damaged one near
      if (e.def.builder) {
        const safe = v => !visibleEnemies.some(o => U.dist2(o.x, o.y, v.x, v.y) < 25 * 25);
        const taken = v => units.filter(b => b !== e && b.order.type === 'repair' && b.order.target === v.id).length;
        const hurt = units.filter(v => v.type === 'vehicle' && v.hp < v.maxHp && (v.fixing ? U.dist2(v.x, v.y, e.x, e.y) < 110 * 110 : v.hp < v.maxHp * .7 && U.dist2(v.x, v.y, e.x, e.y) < 40 * 40) && safe(v) && taken(v) < 2)
          .sort((a, b) => (b.fixing ? 1 : 0) - (a.fixing ? 1 : 0) || U.dist2(a.x, a.y, e.x, e.y) - U.dist2(b.x, b.y, e.x, e.y))[0];
        if (hurt) { SIM.issue(G, [e.id], { type: 'repair', target: hurt.id }); continue; }
      }
      // anti-tank: go for visible vehicles
      const atWeapon = e.type === 'squad' ? e.models.some(m => m.alive && m.weapon && D.W[m.weapon].kind === 'at') || (SIM.weaponOf(e) && SIM.weaponOf(e).kind === 'at') : D.W[e.def.weapons[0]].kind === 'cannon' && D.W[e.def.weapons[0]].pen[0] >= 150;
      if (atWeapon) {
        const tv = visibleEnemies.filter(v => v.type === 'vehicle').sort((a, b) => U.dist2(a.x, a.y, e.x, e.y) - U.dist2(b.x, b.y, e.x, e.y))[0];
        if (tv && U.dist2(tv.x, tv.y, e.x, e.y) < 60 * 60) { if (e.order.type !== 'attack' || e.order.target !== tv.id) { if (e.crew) { if (e.crew.state === 'packed') SIM.issue(G, [e.id], { type: 'setup', heading: Math.atan2(tv.y - e.y, tv.x - e.x) }); } else SIM.issue(G, [e.id], { type: 'attack', target: tv.id }); } continue; }
      }
      // team weapons: a gun still packed and walking stops and sets up when enemy infantry come into its range, instead
      // of walking into them (it only set up on arrival before)
      if (e.crew && e.crew.state === 'packed' && e.order.type !== 'retreat') {
        const cw = SIM.weaponOf(e);
        if (cw && cw.kind !== 'at') {
          const far = cw.rng[2] * (cw.kind === 'indirect' ? .95 : .85), near = cw.minRange || 0;
          const tgt = visibleEnemies.filter(o => o.type === 'squad' && !o.retreating).map(o => ({ o, d: Math.hypot(o.x - e.x, o.y - e.y) })).filter(t => t.d < far && t.d > near + 3).sort((a, b) => a.d - b.d)[0];
          if (tgt) {
            const face = Math.atan2(tgt.o.y - e.y, tgt.o.x - e.x);
            // a machine gun ducks behind cover a few steps away first, and sets up there on arrival; in the open only if there is none
            if (cw.kind === 'mg') {
              if ((e.mgCoverT || 0) > G.t && e.order.type === 'move') continue;
              const sp = coverSpot(G, e.x, e.y, face, 9, e.x, e.y);
              if (sp && Math.hypot(sp.x - e.x, sp.y - e.y) > 1.5 && Math.hypot(tgt.o.x - sp.x, tgt.o.y - sp.y) > near + 3) { e.mgCoverT = G.t + 6; SIM.issue(G, [e.id], { type: 'move', x: sp.x, y: sp.y, face: Math.atan2(tgt.o.y - sp.y, tgt.o.x - sp.x) }); continue; }
            }
            SIM.issue(G, [e.id], { type: 'setup', heading: face }); continue;
          }
        }
      }
      // a set-up machine gun with enemy infantry in its reach keeps firing: no new orders move it off its gun
      if (e.crew && e.crew.state !== 'packed' && COMBAT.isMg(e) && e.garrison == null) {
        const cw = SIM.weaponOf(e);
        if (visibleEnemies.some(o => o.type === 'squad' && !o.retreating && U.dist2(o.x, o.y, e.crew.x, e.crew.y) < (cw.rng[2] + 5) ** 2)) continue;
      }
      // grenades at enemies in cover
      if (e.type === 'squad' && e.def.abilities && (me.res.mu > 40 || e.crew)) {   // the HE barrage is free
        const ab = e.def.abilities.find(a => a !== 'barrage' && a !== 'breach' && !D.ABILITIES[a].smoke && (e.cooldowns[a] || 0) < G.t);
        if (ab) {
          const A = D.ABILITIES[ab];
          const tgt = visibleEnemies.find(o => o.type === 'squad' && U.dist2(o.x, o.y, e.x, e.y) < (A.range - 2) ** 2 && U.dist2(o.x, o.y, e.x, e.y) > ((A.minRange || 6) + 1) ** 2 && (COMBAT.squadCover(G, o) === 'heavy' || o.def.crewWeapon));
          if (tgt && G.rng() < .5) { const m = tgt.models.find(q => q.alive); SIM.issue(G, [e.id], { type: 'ability', id: ab, x: m.x, y: m.y }); continue; }
        }
        // smoke off an enemy machine gun that has us suppressed
        if (e.def.abilities.includes('smokeGrenade') && e.suppState >= 1 && (e.cooldowns.smokeGrenade || 0) < G.t && me.res.mu >= 30) {
          const mg = visibleEnemies.find(o => o.type === 'squad' && o.crew && o.crew.state === 'deployed' && SIM.weaponOf(o).kind === 'mg' && U.dist2(o.x, o.y, e.x, e.y) < 24 * 24);
          if (mg) { SIM.issue(G, [e.id], { type: 'ability', id: 'smokeGrenade', x: mg.crew.x, y: mg.crew.y }); continue; }
        }
        if (e.def.abilities.includes('smokeBarrage') && (e.cooldowns.smokeBarrage || 0) < G.t && e.crew && e.crew.state === 'deployed' && me.res.mu >= 40) {
          const mg = visibleEnemies.find(o => o.type === 'squad' && o.crew && o.crew.state === 'deployed' && SIM.weaponOf(o).kind === 'mg' && units.some(f => f.type === 'squad' && f.suppState === 2 && U.dist2(f.x, f.y, o.x, o.y) < 40 * 40) && U.dist2(o.x, o.y, e.x, e.y) < 85 * 85 && U.dist2(o.x, o.y, e.x, e.y) > 30 * 30);
          if (mg) { SIM.issue(G, [e.id], { type: 'ability', id: 'smokeBarrage', x: mg.crew.x, y: mg.crew.y }); continue; }
        }
        // breach an enemy garrison close by
        if (e.def.abilities.includes('breach') && (e.cooldowns.breach || 0) < G.t && me.res.mu >= 30) {
          const gs = visibleEnemies.find(o => o.type === 'squad' && o.garrison != null && U.dist2(o.x, o.y, e.x, e.y) < 35 * 35);
          if (gs && G.rng() < .6) { SIM.issue(G, [e.id], { type: 'ability', id: 'breach', x: gs.x, y: gs.y }); continue; }
        }
        if (e.def.abilities.includes('barrage') && (e.cooldowns.barrage || 0) < G.t && e.crew && e.crew.state === 'deployed') {
          // a set-up machine gun first, then other team weapons, then squads that have sat in cover or a building for a few seconds
          const A = D.ABILITIES.barrage, cx = e.crew.x, cy = e.crew.y;
          const inReach = o => o.type === 'squad' && !o.retreating && !o.moving && U.dist2(o.x, o.y, cx, cy) < (A.range - 2) ** 2 && U.dist2(o.x, o.y, cx, cy) > ((A.minRange || 25) + 2) ** 2;
          const tgt = visibleEnemies.find(o => inReach(o) && COMBAT.isMg(o)) || visibleEnemies.find(o => inReach(o) && COMBAT.isTeam(o)) || visibleEnemies.find(o => inReach(o) && (o.coverT || 0) >= COMBAT.MORTAR.dugIn);
          if (tgt) { SIM.issue(G, [e.id], { type: 'ability', id: 'barrage', x: tgt.x, y: tgt.y }); continue; }
        }
        // nothing worth shelling in reach, but an enemy machine gun or dug-in squad in sight a little further: move up behind it to range
        if (e.crew && SIM.weaponOf(e) && SIM.weaponOf(e).kind === 'indirect' && (e.mortarT || 0) < G.t && !(e.crew.state === 'deployed' && G.t - e.lastFire < 6)) {
          const w = SIM.weaponOf(e), at = e.crew.state !== 'packed' ? e.crew : e;
          const prey = visibleEnemies.map(o => ({ o, d: Math.hypot(o.x - at.x, o.y - at.y) })).map(t => ({ ...t, s: t.o.type === 'squad' && !t.o.moving && !t.o.retreating ? (COMBAT.isMg(t.o) ? t.d - 90 : COMBAT.isTeam(t.o) ? t.d - 45 : (t.o.coverT || 0) >= COMBAT.MORTAR.dugIn ? t.d - 25 : null) : null })).filter(t => t.s != null).sort((a, b) => a.s - b.s);
          const inRange = prey.some(t => t.d <= w.rng[2] * .95 && t.d > (w.minRange || 0) + 2);
          const t = prey[0];
          if (!inRange && t && t.d < w.rng[2] + 45 && !visibleEnemies.some(o => U.dist2(o.x, o.y, at.x, at.y) < 25 * 25)) {
            const home = Math.atan2(hq.y - t.o.y, hq.x - t.o.x), R = w.rng[2] * .78;
            const q = MAP.nearestOpen(MAP.navGrids(G.map).inf, G.map, t.o.x + Math.cos(home) * R, t.o.y + Math.sin(home) * R);
            e.mortarT = G.t + 15;
            SIM.issue(G, [e.id], { type: 'move', x: q.x, y: q.y, face: Math.atan2(t.o.y - q.y, t.o.x - q.x) }); continue;
          }
        }
      }
      // crew abandoned guns and pick up dropped weapons nearby when no enemy is close to them
      if (SIM.canPickUp(e) && e.order.type !== 'pickup' && G.drops && G.drops.length && G.rng() < .5) {
        const d = G.drops.find(d => U.dist2(d.x, d.y, e.x, e.y) < 22 * 22 && (d.kind === 'team' ? e.models.filter(m => m.alive).length >= 3 : (e.picked || 0) < 2) && FOG.seen(G, slot, d.x, d.y) && !visibleEnemies.some(o => U.dist2(o.x, o.y, d.x, d.y) < 15 * 15));
        if (d) { SIM.issue(G, [e.id], { type: 'pickup', drop: d.id }); continue; }
      }
      // climb into abandoned vehicles nearby
      if (SIM.canPickUp(e) && e.order.type !== 'recrew' && e.models.filter(m => m.alive).length >= 3 && G.rng() < .5) {
        const v = G.ents.find(v => !v.dead && v.type === 'vehicle' && v.owner < 0 && U.dist2(v.x, v.y, e.x, e.y) < 25 * 25 && FOG.seen(G, slot, v.x, v.y) && !visibleEnemies.some(o => U.dist2(o.x, o.y, v.x, v.y) < 15 * 15));
        if (v) { SIM.issue(G, [e.id], { type: 'recrew', target: v.id }); continue; }
      }
      // a garrison mostly holds its house
      if (e.garrison != null && G.rng() > .04) continue;
      // caught in the open in a fight: take the nearest cover across the line of fire (CoH3 players do this all game)
      if (e.type === 'squad' && !e.crew && e.garrison == null && !(e.def.builder && e.order.type === 'build') && (e.coverT || 0) < G.t &&
          (G.t - e.lastHit < 3 || G.t - e.lastFire < 3) && e.suppState < 2) {
        const sc = COMBAT.squadCover(G, e);
        if (sc === 'none' || sc === 'negative') {
          let foe = null, fd = 1e9; for (const o of visibleEnemies) { const d = U.dist2(o.x, o.y, e.x, e.y); if (d < fd) { fd = d; foe = o; } }
          if (foe && fd < 60 * 60) {
            const face = Math.atan2(foe.y - e.y, foe.x - e.x);
            // taking a point: stay inside its circle
            const cap = pts.find(p => p.owner !== slot && Math.hypot(p.x - e.x, p.y - e.y) < p.radius + 2);
            let spot = coverSpot(G, e.x, e.y, face, COVER_SEEK.react, e.x, e.y);
            if (spot && cap && Math.hypot(spot.x - cap.x, spot.y - cap.y) > cap.radius - .8) spot = null;
            e.coverT = G.t + COVER_SEEK.cooldown;
            if (spot) { SIM.issue(G, [e.id], { type: 'move', x: spot.x, y: spot.y, face }); continue; }
          }
        }
      }
      // holding a fighting position: stay in it while enemies are near (a machine gun also while the point it guards
      // is ours). Without this the goal picker sent the squad off to another point and the manning rule put the next
      // squad in, over and over (46 changes of occupant in one position in a 15-minute match).
      if (e.type === 'squad' && e.garrison != null && G.map.houses[e.garrison] && G.map.houses[e.garrison].pit) {
        const h = G.map.houses[e.garrison];
        const guarded = pts.some(p => p.owner !== enemy && U.dist2(p.x, p.y, h.x, h.y) < 26 * 26);
        // a machine gun keeps the position by a point we hold; anyone else stays only while there is an enemy near
        if (guarded && e.crew || visibleEnemies.some(o => U.dist2(o.x, o.y, h.x, h.y) < 45 * 45)) continue;
      }
      // busy moving or fighting: let it be, but re-target now and then
      const busy = (e.path && e.path.length) || e.order.type === 'attack' || (e.crew && e.crew.state !== 'packed' && G.t - e.lastFire < 8) || (G.t - e.lastFire < 3);
      if (busy && G.rng() > .08) continue;
      // a set-up gun stays put while it has enemies in reach; otherwise it moves on now and then
      if (e.crew && e.crew.state !== 'packed') {
        const cw = SIM.weaponOf(e), reach = cw ? cw.rng[2] : 40;
        if (visibleEnemies.some(o => U.dist2(o.x, o.y, e.crew.x, e.crew.y) < reach * reach) || G.rng() > .05) continue;
      }
      // pick a goal: high value, near, not already crowded
      let best = null, bs = -1e9;
      const capper = canCapture(e);
      for (const g of goals) {
        if (!capper && g.p.owner !== slot && !g.takers) continue;
        const d = Math.hypot(g.p.x - e.x, g.p.y - e.y);
        // builders take only points close to home: losing the only builder stalls the whole tech tree
        if (e.def.builder && Math.hypot(g.p.x - hq.x, g.p.y - hq.y) > 75) continue;
        const isMg = e.crew && e.def.crewWeapon === 'tripod_mg';
        const s = g.v * 40 - d * .35 - g.assigned * 25 + (e.type === 'vehicle' && g.p.type === 'victory' ? 20 : 0) + (isMg ? (g.p.owner === slot ? 35 : g.p.owner === enemy ? -25 : 0) : 0);
        if (s > bs) { bs = s; best = g; }
      }
      if (!best) continue;
      if (capper) { best.assigned++; best.takers++; }
      const p = best.p;
      // team weapons sit a little back from the point, facing the enemy
      const toward = enemyHq ? Math.atan2(enemyHq.y - p.y, enemyHq.x - p.x) : 0;
      let tx = p.x + G.rng.range(-4, 4), ty = p.y + G.rng.range(-4, 4);
      if (e.crew) { tx = p.x - Math.cos(toward) * 8; ty = p.y - Math.sin(toward) * 8; }
      if (!(e.crew && e.def.crewWeapon === 'tripod_mg') && e.garrison != null && G.map.houses[e.garrison] && G.map.houses[e.garrison].pit && U.dist2(e.x, e.y, p.x, p.y) < 25 * 25) continue;   // already holding it from a position
      // a machine gun: behind cover, in a house or in a fighting position by the point, whichever watches most of the
      // enemy's way in (a position or house it already holds gets a bonus, so it doesn't hop about)
      if (e.crew && e.def.crewWeapon === 'tripod_mg') {
        const plan = mgPlan(G, me, e, p);
        if (plan && plan.h && plan.h.id === e.garrison) continue;
        if (plan && plan.kind === 'here') { if (Math.abs(U.angNorm(plan.face - e.crew.heading)) > .5) SIM.issue(G, [e.id], { type: 'setup', heading: plan.face }); continue; }
        if (plan) {
          if (plan.h) { SIM.issue(G, [e.id], { type: 'garrison', house: plan.h.id }); continue; }
          if (U.dist2(plan.x, plan.y, e.crew.state !== 'packed' ? e.crew.x : e.x, e.crew.state !== 'packed' ? e.crew.y : e.y) < 2.5 * 2.5) { if (e.crew.state !== 'packed' && Math.abs(U.angNorm(plan.face - e.crew.heading)) > .5) SIM.issue(G, [e.id], { type: 'setup', heading: plan.face }); continue; }
          SIM.issue(G, [e.id], { type: 'move', x: plan.x, y: plan.y, face: plan.face }); continue;
        }
      }
      // infantry sometimes hold the point from a house beside it
      if (e.type === 'squad' && !e.def.builder && !e.crew && G.rng() < .3) {
        const h = G.map.houses.find(h => !h.dead && h.occ == null && !(h.built < 1) && U.dist2(h.x, h.y, p.x, p.y) < 14 * 14);
        if (h) { SIM.issue(G, [e.id], { type: 'garrison', house: h.id }); continue; }
      }
      // infantry stop behind cover near the point when there is some, rather than on open ground
      // (a point still to take: only cover inside its capture circle, or the squad would sit outside it and never take it)
      if (e.type === 'squad' && !e.crew) { const sp = coverSpot(G, p.x, p.y, toward, p.owner === slot ? p.radius + COVER_SEEK.snap : p.radius - 1); if (sp && (p.owner === slot || Math.hypot(sp.x - p.x, sp.y - p.y) < p.radius - .8)) { tx = sp.x; ty = sp.y; } }
      if (U.dist2(tx, ty, e.x, e.y) < 6 * 6) continue;   // already there
      SIM.issue(G, [e.id], { type: e.crew ? 'move' : 'attackMove', x: tx, y: ty, face: toward });
    }
  }
  return { step, mgPlan, approach, repairSpot };
})();
if (typeof module !== 'undefined') module.exports = AI;
