/* Combat: target choice, firing, hit and penetration rolls, directional cover, suppression, explosions, indirect fire,
   grenades and veterancy experience. One rule serves every weapon: hit chance = accuracy at that range x the
   target's target size x cover x movement x veterancy x suppression. Vehicles roll penetration against the armour
   of the face that was hit (front, side or rear). */
const COMBAT = (() => {
  const D = DATA;

  function step(G, dt) {
    for (const e of G.ents) {
      if (e.dead) continue;
      if (e.type === 'squad') { stepSuppression(G, e, dt); squadFire(G, e, dt); }
      else if (e.type === 'vehicle') vehicleFire(G, e, dt);
    }
    stepProjectiles(G, dt);
    stepSmoke(G);
    // tidy effects
    if (G.fx.length > 400) G.fx.splice(0, G.fx.length - 400);
    G.fx = G.fx.filter(f => G.t - f.t < (f.life || 3));
  }

  /* ---------------- suppression ---------------- */
  function squadCover(G, sq) {
    const al = sq.models.filter(m => m.alive); if (!al.length) return 'none';
    const order = { heavy: 3, garrison: 3, light: 2, none: 1, negative: 0 }, n = {};
    for (const m of al) n[m.cover] = (n[m.cover] || 0) + 1;
    let best = 'none', bc = -1; for (const k in n) if (n[k] > bc || (n[k] === bc && order[k] > order[best])) { best = k; bc = n[k]; }
    return best;
  }
  function stepSuppression(G, sq, dt) {
    const S = D.SUPP, cov = D.COVER[squadCover(G, sq)] || D.COVER.none;
    sq.supp = Math.max(0, sq.supp - S.recover * cov.recover * dt * (sq.retreating ? 3 : 1));
    if (sq.suppState === 2) { if (sq.supp < S.pinned - .15) sq.suppState = 1; }
    else if (sq.suppState === 1) { if (sq.supp >= S.pinned) { sq.suppState = 2; SIM.event(G, sq.owner, 'pinned', sq.def.name + ' pinned!', sq.x, sq.y); } else if (sq.supp < S.suppressed - .05) sq.suppState = 0; }
    else if (sq.supp >= S.suppressed) sq.suppState = 1;
    if (sq.retreating) sq.suppState = Math.min(sq.suppState, 0);
    // pinned squads stop where they are
    if (sq.suppState === 2 && sq.path && sq.path.length && !sq.retreating) { sq.path = null; sq.order = { type: 'idle' }; }
  }
  function addSupp(G, sq, amount, sx, sy) {
    if (sq.retreating || sq.type !== 'squad') return;
    const al = sq.models.filter(m => m.alive); if (!al.length) return;
    let ck = sq.garrison != null ? 'garrison' : MAP.coverAt(G.map, al[0].x, al[0].y, sx, sy);
    if ((ck === 'light' || ck === 'heavy') && MAP.hAt(G.map, sx, sy) - MAP.hAt(G.map, al[0].x, al[0].y) >= HIGH) ck = 'none';
    const cov = D.COVER[ck] || D.COVER.none;
    sq.supp = Math.min(D.SUPP.cap, sq.supp + amount * cov.supp * (sq.def.crewWeapon ? .5 : 1));
  }

  /* ---------------- targets ---------------- */
  function maxRangeOf(e) {
    if (e.type === 'vehicle') return Math.max(...e.def.weapons.map(w => D.W[w].rng[2]));
    let r = 0; for (const m of e.models) if (m.alive && m.weapon) r = Math.max(r, D.W[m.weapon].rng[2]);
    const cw = SIM.weaponOf(e); if (cw) r = Math.max(r, cw.rng[2]);
    return r || 35;
  }
  const isLight = v => v.type === 'vehicle' && v.def.armor[0] < 25;
  function candidates(G, e) {
    if (e.candT > G.t) return e.cands || [];
    e.candT = G.t + .4 + G.rng() * .15;
    const out = [], R = maxRangeOf(e) + 6;
    for (const o of G.ents) {
      if (o.dead || o.owner === e.owner || (o.owner < 0 && e.forceTarget !== o.id)) continue;
      if (o.type === 'building' && e.forceTarget !== o.id) continue;
      const d2 = U.dist2(o.x, o.y, e.x, e.y); if (d2 > R * R) continue;
      if (!FOG.visible(G, e.owner, o)) continue;
      out.push({ e: o, d: Math.sqrt(d2) });
    }
    out.sort((a, b) => a.d - b.d);
    e.cands = out;
    return out;
  }
  /* pick the nearest suitable target for a weapon from position (x, y) */
  function pick(G, e, w, x, y, cands, arcCentre, arcHalf) {
    const force = e.forceTarget ? G.byId.get(e.forceTarget) : null;
    const ok = o => {
      if (!o || o.dead) return false;
      if (w.noVehicles && o.type !== 'squad') return false;
      if (w.kind === 'at' && o.type !== 'vehicle' && !(o.type === 'squad' && o.def.crewWeapon && force === o)) return false;
      if (w.kind === 'small' || w.kind === 'mg' || w.kind === 'flame' || w.kind === 'sniper') if (o.type === 'vehicle' && !isLight(o)) return false;
      if (o.type === 'building' && !(w.kind === 'cannon' || w.kind === 'at' || w.kind === 'indirect')) return false;
      // a garrison is shot at through the windows: aim at the nearest man in a window this shooter can see
      let ox = o.x, oy = o.y;
      if (o.garrison != null && w.kind !== 'indirect') { const wm = windowTarget(G, o, x, y); if (!wm) return false; ox = wm.x; oy = wm.y; }
      const d = Math.hypot(ox - x, oy - y);
      if (d > w.rng[2] + (o.type === 'building' ? Math.max(o.w, o.d) / 2 : 0) || (w.minRange && d < w.minRange)) return false;
      if (arcHalf != null) { const a = Math.abs(U.angNorm(Math.atan2(o.y - y, o.x - x) - arcCentre)); if (a > arcHalf) return false; }
      if (w.kind !== 'indirect' && o.garrison == null && !MAP.los(G.map, x, y, o.x, o.y) && o.type !== 'building') return false;
      return true;
    };
    if (force && ok(force)) return force;
    // cannons and AT prefer vehicles; everything else prefers infantry
    const wantV = w.kind === 'cannon' || w.kind === 'at';
    let best = null, bs = 1e9;
    for (const c of cands) {
      if (!ok(c.e)) continue;
      let s = c.d;
      if (wantV && c.e.type !== 'vehicle') s += 60;
      if (!wantV && c.e.type === 'vehicle') s += 40;
      if (c.e.type === 'squad' && c.e.retreating) s += 15;
      if (s < bs) { bs = s; best = c.e; }
    }
    return best;
  }
  /* height bands (CoH3): a shooter 2.5 m or more above the target fires down over its cover */
  const HIGH = 2.5;
  function highGround(G, from, to) { return MAP.hAt(G.map, from.x, from.y) - MAP.hAt(G.map, to.x, to.y) >= HIGH; }
  function windowTarget(G, sq, x, y) {
    let best = null, bd = 1e9;
    for (const m of sq.models) { if (!m.alive) continue; const d = U.dist2(m.x, m.y, x, y); if (d < bd && MAP.los(G.map, x, y, m.x, m.y)) { bd = d; best = m; } }
    return best;
  }
  function aimPoint(G, t, x, y) {
    if (t.type === 'squad' && t.garrison != null) return windowTarget(G, t, x, y);
    if (t.type === 'squad') { const al = t.models.filter(m => m.alive); if (!al.length) return null; let b = al[0], bd = 1e9; for (const m of al) { const d = U.dist2(m.x, m.y, x, y) + G.rng() * 30; if (d < bd) { bd = d; b = m; } } return b; }
    return t;
  }

  /* ---------------- squads firing ---------------- */
  function squadFire(G, sq, dt) {
    const alive = sq.models.filter(m => m.alive);
    for (const m of alive) { m.since += dt; m.cover = sq.garrison != null ? 'garrison' : MAP.coverAt(G.map, m.x, m.y); }
    // how long the squad has sat still in cover (garrisons and positions count): mortars look for dug-in targets
    if (alive.length) { const sc = squadCover(G, sq); sq.coverT = !sq.moving && (sc === 'light' || sc === 'heavy' || sc === 'garrison') ? (sq.coverT || 0) + dt : 0; }
    if (!alive.length || sq.retreating || sq.suppState === 2 || sq.building) return;
    sq.camo = !!(sq.def.camoInCover && sq.stillT > 2 && G.t - sq.lastFire > 4 && alive[0].cover !== 'none' && alive[0].cover !== 'negative');
    const cands = candidates(G, sq);
    // attack orders: close the distance
    if (sq.order.type === 'attack') {
      const t = G.byId.get(sq.order.target);
      if (!t || t.dead || !FOG.visible(G, sq.owner, t)) { sq.order = { type: 'idle' }; sq.forceTarget = null; }
      else {
        const R = maxRangeOf(sq) * .85, d = Math.hypot(t.x - sq.x, t.y - sq.y);
        if (sq.crew) { if (sq.crew.state === 'packed' && d <= R) SIM.setup(G, sq, Math.atan2(t.y - sq.y, t.x - sq.x)); }
        if (d > R || !MAP.los(G.map, sq.x, sq.y, t.x, t.y)) { if (!sq.path || !sq.path.length || sq.repathT < G.t) { SIM.setPath(G, sq, t.x, t.y); sq.repathT = G.t + 1.5; } }
        else if (sq.path && sq.path.length && !sq.crew) { sq.path = null; sq.slots = null; }
      }
    }
    const vb = SIM.vetBonus(sq);
    let fired = false;
    // the crew weapon
    const cw = SIM.weaponOf(sq);
    if (cw) {
      const c = sq.crew;
      if (c.state === 'deployed' && !sq.barrage) {
        sq.cwCd = (sq.cwCd || 0) - dt;
        const arcHalf = cw.arc ? cw.arc / 2 * Math.PI / 180 : null;
        let t = cw.kind === 'indirect' ? pickMortarTarget(G, sq, cw, cands) : pick(G, sq, cw, c.x, c.y, cands, c.heading, arcHalf);
        if (!t && cw.arc && sq.order.type === 'idle') {
          const out = pick(G, sq, cw, c.x, c.y, cands, 0, null);
          if (out) { sq.pivotT = (sq.pivotT || 0) + dt; if (sq.pivotT > 1.5) { sq.pivotT = 0; c.state = 'setting'; c.t = (cw.setup || 2.5) * .8; c.heading = Math.atan2(out.y - c.y, out.x - c.x); } }
        } else sq.pivotT = 0;
        if (t && sq.cwCd <= 0) {
          const d = Math.hypot(t.x - c.x, t.y - c.y), rpm = U.profile(w3(cw.rpm), cw.rng, d) * vb.rof;
          sq.cwCd = 60 / rpm;
          const gunner = alive[0];
          if (cw.kind === 'indirect') lobShell(G, sq, c, cw, t.x, t.y);
          else fireWeapon(G, sq, { x: c.x, y: c.y }, cw, t, vb, false, gunner);
          gunner.since = 0; gunner.aim = Math.atan2(t.y - c.y, t.x - c.x); fired = true;
          sq.cwFireT = G.t;
        }
      } else if (c.state === 'packed' && sq.order.type === 'idle' && (!sq.path || !sq.path.length)) {
        const t = pick(G, sq, cw, sq.x, sq.y, cands, 0, null);
        if (t) SIM.setup(G, sq, Math.atan2(t.y - sq.y, t.x - sq.x));
      }
      if (sq.barrage && c.state === 'deployed') {
        const b = sq.barrage; b.t -= dt;
        if (b.t <= 0 && b.left > 0) { lobShell(G, sq, c, cw, b.x, b.y, true, b.smoke); b.left--; b.t = b.smoke ? 1.2 : 2.2; alive[0].since = 0; fired = true; }
        if (b.left <= 0) sq.barrage = null;
      }
    }
    // personal weapons
    for (const m of alive) {
      if (!m.weapon) continue;
      if (sq.crew && sq.crew.state !== 'packed' && m === alive[0]) continue;
      const w = D.W[m.weapon];
      m.cd -= dt;
      if (m.cd > 0) continue;
      const t = pick(G, sq, w, m.x, m.y, cands, null, null);
      if (!t) { m.cd = .25; m.aimT = 0; continue; }
      if (w.aim) { m.aimT += .25; if (m.aimT < w.aim) { m.cd = .25; m.aim = Math.atan2(t.y - m.y, t.x - m.x); continue; } m.aimT = 0; }
      const d = Math.hypot(t.x - m.x, t.y - m.y), rpm = U.profile(w3(w.rpm), w.rng, d) * vb.rof * (sq.suppState === 1 ? .7 : 1);
      m.cd = 60 / rpm * U.lerp(.85, 1.15, G.rng());
      fireWeapon(G, sq, m, w, t, vb, sq.moving, m);
      if (sq.order.type === 'attackMove') sq.engageT = G.t + 1.5;
      m.since = 0; m.aim = Math.atan2(t.y - m.y, t.x - m.x); fired = true;
    }
    if (fired) sq.lastFire = G.t;
  }
  const w3 = a => a;
  /* Mortars (auto-fire): shells take seconds to land, so only targets that stay put. First a set-up machine gun (shell it
     off its position), then other set-up team weapons, then squads that have sat in cover or a building for DUG_IN seconds,
     then anything else that has stood still that long; stopped vehicles last. Squads that only just stopped are left. */
  const MORTAR = { dugIn: 4.5, mg: 90, team: 45, cover: 25, vehicle: 15 };
  function isTeam(o) { return o.type === 'squad' && o.def.crewWeapon && o.crew && o.crew.state !== 'packed'; }
  function isMg(o) { if (!isTeam(o)) return false; const w = SIM.weaponOf(o); return !!(w && w.kind === 'mg'); }
  function mortarScore(o, d) {
    if (o.type === 'vehicle') return o.speed > 1 ? null : d + MORTAR.vehicle;
    if (o.type !== 'squad' || o.moving || o.retreating) return null;
    if (isMg(o)) return d - MORTAR.mg;
    if (isTeam(o)) return d - MORTAR.team;
    if ((o.coverT || 0) >= MORTAR.dugIn) return d - MORTAR.cover;
    if ((o.stillT || 0) >= MORTAR.dugIn) return d;
    return null;
  }
  function pickMortarTarget(G, sq, w, cands) {
    let best = null, bs = 1e9;
    for (const c of cands) {
      const o = c.e; if (o.type === 'building') continue;
      if (c.d < w.minRange || c.d > w.rng[2]) continue;
      const s = mortarScore(o, c.d);
      if (s != null && s < bs) { bs = s; best = o; }
    }
    return best;
  }

  /* ---------------- vehicles firing ---------------- */
  function vehicleFire(G, v, dt) {
    if (v.owner < 0) return;                                   // abandoned: nobody inside
    const shocked = v.crit && v.crit.shockT > G.t, gunOut = v.crit && v.crit.gun;
    const cands = candidates(G, v), vb = SIM.vetBonus(v);
    if (v.order.type === 'attack') {
      const t = G.byId.get(v.order.target);
      if (!t || t.dead || !FOG.visible(G, v.owner, t)) { v.order = { type: 'idle' }; v.forceTarget = null; }
      else {
        const R = maxRangeOf(v) * .85, d = Math.hypot(t.x - v.x, t.y - v.y);
        if (d > R || !MAP.los(G.map, v.x, v.y, t.x, t.y)) { if (!v.path || !v.path.length || v.repathT < G.t) { SIM.setPath(G, v, t.x, t.y); v.repathT = G.t + 2; } }
        else if (v.path && v.path.length) v.path = null;
      }
    }
    v.fireT += dt;
    const main = D.W[v.weapons[0].id];
    v.weapons.forEach((ws, i) => {
      const w = D.W[ws.id]; ws.cd -= dt; ws.since += dt;
      if (shocked || (i === 0 && gunOut)) { ws.cd = Math.max(ws.cd, .5); if (i === 0 && gunOut) return; }
      const turret = w.turret || (i > 0 && !w.arc);
      const t = pick(G, v, w, v.x, v.y, cands, turret ? null : v.heading, turret ? null : (w.arc || 30) / 2 * Math.PI / 180);
      if (i === 0) {
        // the main gun steers the turret, or the hull when it has none and nothing else to do
        const any = t || (!turret ? pick(G, v, w, v.x, v.y, cands, null, null) : null);
        if (any) {
          const want = Math.atan2(any.y - v.y, any.x - v.x);
          if (main.turret) v.turret = U.turnTo(v.turret, want, 38 * Math.PI / 180 * dt * (v.vet >= 1 && v.defId === 'us_chaffee' ? 1.35 : 1));
          else if ((!v.path || !v.path.length) && v.order.type !== 'reverse') v.heading = U.turnTo(v.heading, want, v.def.rot * Math.PI / 180 * dt);
        } else if (main.turret) v.turret = U.turnTo(v.turret, v.heading, 25 * Math.PI / 180 * dt);
        if (!main.turret) v.turret = v.heading;
      }
      if (!t || ws.cd > 0) return;
      if (i === 0 && main.turret) { const want = Math.atan2(t.y - v.y, t.x - v.x); if (Math.abs(U.angNorm(want - v.turret)) > .08) return; }
      const d = Math.hypot(t.x - v.x, t.y - v.y), rpm = U.profile(w.rpm, w.rng, d) * vb.rof;
      ws.cd = 60 / rpm * U.lerp(.9, 1.1, G.rng());
      const from = muzzle(v, i);
      fireWeapon(G, v, from, w, t, vb, v.speed > .5, null);
      if (v.order.type === 'attackMove' && i === 0) v.engageT = G.t + 2;
      ws.since = 0; if (i === 0) v.fireT = 0;
      v.lastFire = G.t;
    });
  }
  function muzzle(v, i) {
    const a = i === 0 ? v.turret : v.heading, L = i === 0 ? v.def.length * .55 : v.def.length * .3;
    return { x: v.x + Math.cos(a) * L, y: v.y + Math.sin(a) * L };
  }

  /* ---------------- one shot ---------------- */
  function fireWeapon(G, src, from, w, t, vb, moving, model) {
    const tm = aimPoint(G, t, from.x, from.y); if (!tm) return;
    const d = Math.hypot(tm.x - from.x, tm.y - from.y);
    G.fx.push({ kind: 'muzzle', x: from.x, y: from.y, t: G.t, big: w.kind === 'cannon' || w.kind === 'at' ? 1 : 0, life: .15 });
    let acc = U.profile(w.acc, w.rng, d) * vb.acc * (moving ? (w.moveAcc || .5) : 1) * (src.suppState === 1 ? .5 : 1);
    if (MAP.inSmoke(G.map, tm.x, tm.y) || MAP.inSmoke(G.map, from.x, from.y)) acc *= .5;   // firing into or out of smoke
    if (t.type === 'squad') {
      let cover = w.ignoresCover ? 'none' : t.garrison != null ? 'garrison' : MAP.coverAt(G.map, tm.x, tm.y, from.x, from.y);
      if ((cover === 'light' || cover === 'heavy') && highGround(G, from, tm)) cover = 'none';   // shooting down over the wall
      const C = D.COVER[cover] || D.COVER.none, tvb = SIM.vetBonus(t);
      let rAcc = tvb.rAcc * (t.retreating ? .6 : 1) * (t.crew && t.crew.state === 'deployed' && t.def.setupRAcc ? t.def.setupRAcc : 1) * (t.suppState === 2 ? 1.25 : 1);
      const p = Math.min(.98, acc * (t.def.targetSize || 1) * C.acc * rAcc);
      // suppression lands whether or not the round hits
      if (w.supp) {
        const sps = U.lerp(w.supp, w.suppFar || w.supp, U.clamp((d - w.rng[0]) / Math.max(1, w.rng[2] - w.rng[0]), 0, 1));
        const per = sps * 60 / U.profile(w.rpm, w.rng, d);
        addSupp(G, t, per, from.x, from.y);
        if (w.suppRadius) for (const o of G.ents) if (o !== t && o.type === 'squad' && !o.dead && o.owner === t.owner && U.dist2(o.x, o.y, tm.x, tm.y) < w.suppRadius * w.suppRadius) addSupp(G, o, per * .5, from.x, from.y);
      }
      if (w.kind === 'small' || w.kind === 'mg' || w.kind === 'sniper' || w.kind === 'flame') {
        if (G.rng() < (w.kind === 'mg' ? .25 : .12)) G.fx.push({ kind: 'tracer', ax: from.x, ay: from.y, bx: tm.x + (G.rng() - .5), by: tm.y + (G.rng() - .5), t: G.t, life: .12, flame: w.kind === 'flame' });
        if (w.kind === 'flame') G.fx.push({ kind: 'flame', ax: from.x, ay: from.y, bx: tm.x, by: tm.y, t: G.t, life: .3 });
        if (G.rng() < p) damageModel(G, t, tm, w.dmg * C.dmg, src);
        else if (G.rng() < .2) G.fx.push({ kind: 'dirt', x: tm.x + G.rng.range(-1.5, 1.5), y: tm.y + G.rng.range(-1.5, 1.5), t: G.t, life: .5 });
      } else {
        // shell at infantry: a direct hit or a near miss, both explode
        let ix = tm.x, iy = tm.y;
        if (G.rng() >= p) { const r = .8 + d * .06 + G.rng() * 2, a = G.rng() * U.TAU; ix += Math.cos(a) * r; iy += Math.sin(a) * r; }
        G.projectiles.push({ kind: 'shell', ax: from.x, ay: from.y, x: ix, y: iy, t0: G.t, t1: G.t + d / 260, w, src: src.id, owner: src.owner, direct: true });
      }
      return;
    }
    if (t.type === 'vehicle') {
      const p = Math.min(.95, acc * t.def.targetSize * (t.speed > 1 ? .85 : 1));
      const hit = G.rng() < p;
      const ax = hit ? t.x : t.x + G.rng.range(-3, 3), ay = hit ? t.y : t.y + G.rng.range(-3, 3);
      if (w.kind === 'small' || w.kind === 'mg') {
        if (G.rng() < .2) G.fx.push({ kind: 'tracer', ax: from.x, ay: from.y, bx: ax, by: ay, t: G.t, life: .12 });
        if (!hit) return;
        const armor = facingArmor(t, from.x, from.y), pen = U.profile(w.pen, w.rng, d);
        if (G.rng() < pen / armor) damageVehicle(G, t, w.dmg, src);
        else if (G.rng() < .1) G.fx.push({ kind: 'spark', x: t.x, y: t.y, t: G.t, life: .2 });
        return;
      }
      G.projectiles.push({ kind: w.kind === 'at' ? 'rocket' : 'shell', ax: from.x, ay: from.y, x: ax, y: ay, t0: G.t, t1: G.t + d / (w.kind === 'at' && w.name.match(/Bazooka|Panzerschreck/) ? 70 : 280),
        w, src: src.id, owner: src.owner, vs: t.id, hit, fx: from.x, fy: from.y, d });
      return;
    }
    if (t.type === 'building') {
      G.projectiles.push({ kind: 'shell', ax: from.x, ay: from.y, x: t.x + G.rng.range(-t.w / 3, t.w / 3), y: t.y + G.rng.range(-t.d / 3, t.d / 3), t0: G.t, t1: G.t + d / 260, w, src: src.id, owner: src.owner, vsB: t.id });
    }
  }
  function facingArmor(v, sx, sy) {
    const rel = Math.abs(U.angNorm(Math.atan2(sy - v.y, sx - v.x) - v.heading));
    const a = v.def.armor;
    return rel < 0.96 ? a[0] : rel > 2.18 ? a[2] : a[1];   // front within 55 degrees, rear beyond 125
  }

  /* ---------------- indirect fire and grenades ---------------- */
  /* smoke: a cloud that swells to full size in about two seconds, holds, then thins away */
  function popSmoke(G, x, y, S) {
    (G.map.smokes = G.map.smokes || []).push({ x, y, r: 0, R: S.radius, t0: G.t, life: S.life });
    G.fx.push({ kind: 'muzzle', x, y, t: G.t, big: 0, life: .2 });
  }
  function stepSmoke(G) {
    const m = G.map; if (!m.smokes || !m.smokes.length) return;
    for (const s of m.smokes) { const age = G.t - s.t0; s.r = s.R * Math.min(1, age / 2) * (age > s.life - 5 ? Math.max(0, (s.life - age) / 5) : 1); }
    m.smokes = m.smokes.filter(s => G.t - s.t0 < s.life);
  }
  function lobShell(G, sq, from, w, x, y, barrage, smoke) {
    const d = Math.hypot(x - from.x, y - from.y), sc = U.profile(w.scatter, w.rng, d) * (barrage ? 1 : 1);
    const a = G.rng() * U.TAU, r = Math.sqrt(G.rng()) * sc * .5;
    G.projectiles.push({ kind: 'mortar', ax: from.x, ay: from.y, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, t0: G.t, t1: G.t + (w.flight || 3), w, src: sq.id, owner: sq.owner, arc: 1, smoke: smoke || null });
    G.fx.push({ kind: 'muzzle', x: from.x, y: from.y, t: G.t, big: 1, life: .2, up: true });
  }
  function throwGrenade(G, sq, m, x, y, ab) {
    const d = Math.hypot(x - m.x, y - m.y), a = G.rng() * U.TAU, r = G.rng() * Math.min(2, d * .08);
    G.projectiles.push({ kind: 'grenade', ax: m.x, ay: m.y, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, t0: G.t, t1: G.t + ab.fuse + d / 18, land: G.t + d / 18, ab, src: sq.id, owner: sq.owner, arc: .4 });
    m.since = 0; m.aim = Math.atan2(y - m.y, x - m.x);
  }
  function stepProjectiles(G, dt) {
    const keep = [];
    for (const p of G.projectiles) {
      if (G.t < p.t1) { keep.push(p); continue; }
      const src = G.byId.get(p.src);
      if (p.kind === 'grenade' && p.ab.smoke) popSmoke(G, p.x, p.y, p.ab.smoke);
      else if (p.kind === 'mortar' && p.smoke) popSmoke(G, p.x, p.y, p.smoke);
      else if (p.kind === 'grenade') explode(G, p.x, p.y, p.ab.dmg, p.ab.aoe, 20, src, p.owner, 1);
      else if (p.kind === 'mortar') explode(G, p.x, p.y, p.w.dmg, p.w.aoe, p.w.pen[0], src, p.owner, 1.2);
      else if (p.vs) {
        const v = G.byId.get(p.vs);
        if (v && !v.dead && p.hit) {
          const armor = facingArmor(v, p.fx, p.fy), pen = U.profile(p.w.pen, p.w.rng, p.d) * (src && src.type && src.vet >= 2 && src.type === 'vehicle' ? 1.2 : 1);
          if (G.rng() < Math.min(1, pen / armor)) { damageVehicle(G, v, p.w.dmg, src); G.fx.push({ kind: 'pen', x: v.x, y: v.y, t: G.t, life: .8 }); }
          else { G.fx.push({ kind: 'bounce', x: v.x, y: v.y, t: G.t, life: .5 }); if (v.owner >= 0) SIM.event(G, v.owner, 'deflect', 'Shot deflected', v.x, v.y); }
        } else G.fx.push({ kind: 'boom', x: p.x, y: p.y, t: G.t, big: .4, life: 1 });
      } else if (p.vsB) {
        const b = G.byId.get(p.vsB); if (b && !b.dead) damageBuilding(G, b, p.w.dmg * (p.w.kind === 'at' ? .5 : 1), src);
        G.fx.push({ kind: 'boom', x: p.x, y: p.y, t: G.t, big: .6, life: 1 });
      } else explode(G, p.x, p.y, p.w.dmg, p.w.aoe || 1.5, p.w.pen[0], src, p.owner, .8);
    }
    G.projectiles = keep;
  }
  /* explosion: damage falls from full at the centre to a tenth at the edge; heavy cover between halves it */
  function explode(G, x, y, dmg, radius, pen, src, owner, size) {
    G.fx.push({ kind: 'boom', x, y, t: G.t, big: size, life: 1.4 });
    if (G.rng() < .5) { const c = { x, y, r: .9 + radius * .25 }; G.map.craters.push(c); MAP.stampCrater(G.map, c); G.map.craterVer = (G.map.craterVer || 0) + 1; }
    for (const e of G.ents) {
      if (e.dead) continue;
      if (e.type === 'squad') {
        let any = false;
        for (const m of e.models) {
          if (!m.alive) continue;
          const r = Math.hypot(m.x - x, m.y - y); if (r > radius) continue;
          any = true;
          const C = D.COVER[MAP.coverAt(G.map, m.x, m.y, x, y)] || D.COVER.none;
          const f = Math.max(.1, 1 - r / radius);
          damageModel(G, e, m, dmg * f * (C === D.COVER.heavy ? .5 : 1) * (e.retreating ? .7 : 1), src);
        }
        if (any && e.owner !== owner) addSupp(G, e, .25 * size, x, y);
      } else if (e.type === 'vehicle') {
        const r = Math.hypot(e.x - x, e.y - y); if (r > radius + e.def.length / 2) continue;
        if (G.rng() < Math.min(1, pen / e.def.armor[2])) damageVehicle(G, e, dmg * .4 * Math.max(.2, 1 - r / (radius + 2)), src);
      } else if (e.type === 'building') {
        if (Math.abs(e.x - x) < e.w / 2 + radius && Math.abs(e.y - y) < e.d / 2 + radius) damageBuilding(G, e, dmg * .5, src);
      }
    }
    // dropped weapons and abandoned guns can be wrecked
    for (const d of G.drops || []) if (U.dist2(d.x, d.y, x, y) < radius * radius) d.hp -= dmg * .5;
    // houses take blast damage (half the blast; small arms never hurt them), and collapse at zero
    for (const h of G.map.houses) if (!h.dead && Math.abs(h.x - x) < h.w / 2 + radius && Math.abs(h.y - y) < h.d / 2 + radius) SIM.damageHouse(G, h, dmg * .5, src);
    // cover objects take blast damage
    for (const c of MAP.coversNear(G.map, x, y)) {
      if (!c.alive) continue;
      if (U.segDist2(x, y, c.ax, c.ay, c.bx, c.by) < radius * radius) { c.hp -= dmg * .6; if (c.hp <= 0) MAP.removeCover(G.map, c); }
    }
  }

  /* ---------------- damage ---------------- */
  function hurtEvent(G, e) {
    if (G.t - e.lastHit > 10) {
      const what = e.type === 'vehicle' ? 'Vehicle under attack!' : e.type === 'building' ? 'Base under attack!' : 'Infantry under attack!';
      SIM.event(G, e.owner, 'attack', what, e.x, e.y);
    }
    e.lastHit = G.t;
  }
  function xpFor(G, src, t, dmg) {
    if (!src || src.dead || src.owner === t.owner) return;
    const cost = (t.def.cost && t.def.cost.mp || 200) + (t.def.cost && t.def.cost.fu || 0) * 2;
    const total = t.type === 'squad' ? t.def.hp * t.maxModels : t.maxHp;
    SIM.addXp(G, src, dmg / total * cost * 1.4);
  }
  function damageModel(G, sq, m, dmg, src) {
    if (!m.alive || dmg <= 0) return;
    m.hp -= dmg; hurtEvent(G, sq); xpFor(G, src, sq, Math.min(dmg, m.hp + dmg));
    if (m.hp <= 0) {
      m.alive = false; m.deadT = G.t;
      (G.corpses = G.corpses || []).push({ x: m.x, y: m.y, heading: m.heading, sprite: m.sprite, side: G.players[sq.owner].side, t0: G.t, id: G.rng() * 1000 | 0 });
      sq.slots = null;
      SIM.onModelDeath(G, sq, m);
      if (!sq.models.some(q => q.alive)) { SIM.event(G, sq.owner, 'lost', sq.def.name + ' lost', sq.x, sq.y); if (src) xpFor(G, src, sq, sq.def.hp); }
    }
  }
  /* Vehicle criticals (CoH3): a solid hit can damage or wreck the engine, knock out the main gun or shock the crew;
     the lower the health, the likelier. A killing blow can instead make the crew bail out, leaving the vehicle
     abandoned (neutral) for either side to recrew. Repairing to 90% clears the criticals. */
  const CRIT = { base: .035, low: .22, minDmg: 30, minDmgLight: 12, shock: 6, abandon: .22, abandonHp: .08,
    names: { engine1: 'Engine damaged', engine2: 'Immobilised', gun: 'Main gun destroyed', shock: 'Crew shocked' } };
  function rollCrit(G, v, dmg) {
    if (dmg < (v.def.light ? CRIT.minDmgLight : CRIT.minDmg)) return;
    const hf = Math.max(0, v.hp / v.maxHp);
    if (G.rng() > CRIT.base + CRIT.low * (1 - hf)) return;
    const c = v.crit || (v.crit = { engine: 0, gun: false, shockT: 0 }), r = G.rng();
    let what;
    if (r < .45) { if (c.engine >= 2) return; c.engine = c.engine === 1 && hf < .5 ? 2 : 1; what = c.engine === 2 ? 'engine2' : 'engine1'; }
    else if (r < .65) { if (c.gun || D.W[v.weapons[0].id].kind === 'small') return; c.gun = true; what = 'gun'; }
    else { c.shockT = G.t + CRIT.shock; what = 'shock'; }
    SIM.event(G, v.owner, 'lost', v.def.name + ': ' + CRIT.names[what], v.x, v.y);
  }
  function damageVehicle(G, v, dmg, src) {
    if (v.dead) return;
    v.hp -= dmg; hurtEvent(G, v); xpFor(G, src, v, Math.min(dmg, v.hp + dmg));
    if (v.hp <= 0) {
      if (v.owner >= 0 && v.hp > -dmg * .6 && G.rng() < CRIT.abandon) { SIM.abandonVehicle(G, v); return; }
      SIM.event(G, v.owner, 'lost', v.def.name + ' destroyed', v.x, v.y); SIM.kill(G, v); return;
    }
    rollCrit(G, v, dmg);
  }
  function damageBuilding(G, b, dmg, src) {
    if (b.dead) return;
    b.hp -= dmg; hurtEvent(G, b);
    if (b.hp <= 0) { SIM.event(G, b.owner, 'lost', b.def.name + ' destroyed', b.x, b.y); SIM.kill(G, b); }
  }

  return { MORTAR, mortarScore, isMg, isTeam, HIGH, highGround, CRIT, step, throwGrenade, facingArmor, squadCover, maxRangeOf, explode, damageModel };
})();
if (typeof module !== 'undefined') module.exports = COMBAT;
