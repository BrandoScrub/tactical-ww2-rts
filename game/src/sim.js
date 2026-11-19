/* The match simulation: players, squads, vehicles, buildings, orders, movement, territory, economy, production,
   construction, reinforcement, retreat and the victory-point ticker. Combat lives in combat.js. Runs at a fixed
   20 steps a second and knows nothing about drawing. */
const SIM = (() => {
  const DT = 1 / 20;
  const D = DATA;

  function create(opts) {
    const map = MAP.create(opts.seed || 7);
    const G = {
      t: 0, map, ents: [], byId: new Map(), nextId: 1, projectiles: [], fx: [], events: [], over: null,
      players: [], layout: opts.crewLayout || null, rng: U.rng((opts.seed || 7) * 31 + 5),
    };
    const sides = [opts.playerSide || 'us', opts.playerSide === 'de' ? 'us' : 'de'];
    sides.forEach((side, slot) => {
      const F = D.FACTIONS[side];
      G.players.push({ slot, side, F, name: slot === 0 ? 'You' : 'Enemy', ai: slot === 1, res: { ...D.ECON.start }, income: { mp: 0, mu: 0, fu: 0 },
        pop: 0, popCap: D.ECON.popCap, vp: D.ECON.vpStart, vpHeld: 0, autoReinforce: true, upkeep: 0, groups: {}, built: new Set(), vis: null, alerts: [] });
      const b = map.bases[slot];
      const hq = placeBuilding(G, F.hq, slot, b.hq.x, b.hq.y, 1);
      hq.rally = { x: b.hq.x + (slot ? -14 : 14), y: b.hq.y + (slot ? 14 : -14) };
      const s = spawnSquad(G, F.builder, slot, hq.rally.x, hq.rally.y);
      if (slot === 0) G.players[0].groups[1] = [s.id];
    });
    for (const p of G.players) p.vis = new Uint8Array((map.w / 4) * (map.h / 4));
    updateTerritory(G); FOG.update(G);
    return G;
  }

  /* ---------------- entities ---------------- */
  function addEnt(G, e) { e.id = G.nextId++; G.ents.push(e); G.byId.set(e.id, e); return e; }
  const enemyOf = (G, a, b) => a !== b && a >= 0 && b >= 0;

  function formationOffsets(n, R) {
    const out = [], cols = n <= 3 ? n : n <= 6 ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), col = i % cols, w = Math.min(cols, n - row * cols);
      out.push({ f: -row * 2.4 + (R ? R.range(-.5, .5) : 0), s: (col - (w - 1) / 2) * 2.2 + (R ? R.range(-.5, .5) : 0) });
    }
    return out;
  }

  function spawnSquad(G, defId, owner, x, y) {
    const def = D.SQUADS[defId];
    const sq = { type: 'squad', defId, def, owner, x, y, heading: owner ? Math.PI * .75 : -Math.PI * .25, models: [], path: null, order: { type: 'idle' },
      xp: 0, vet: 0, supp: 0, suppState: 0, lastHit: -99, lastFire: -99, cooldowns: {}, upgrades: new Set(), upgrading: null,
      target: null, buildQueue: [], trail: [], spawnT: G.t, retreating: false, reinforceT: 0, slots: null, camo: false, stillT: 0, maxModels: def.models.length };
    const offs = formationOffsets(def.models.length, G.rng);
    const nav = MAP.navGrids(G.map).inf;
    def.models.forEach((spr, i) => { const p = MAP.nearestOpen(nav, G.map, x + offs[i].s * .7, y + offs[i].f * .7); sq.models.push(makeModel(G, sq, i, p.x, p.y)); });
    sq.offsets = offs;
    if (def.crewWeapon) sq.crew = { state: 'packed', t: 0, heading: sq.heading, x, y };
    addEnt(G, sq); popRecount(G);
    return sq;
  }
  function makeModel(G, sq, i, x, y) {
    const def = sq.def;
    let sprite = def.models[i], weapon = def.weapons[i];
    for (const up of sq.upgrades || []) { const u = (def.upgrades || []).find(q => q.id === up); if (u && u.swap && u.swap.index === i) { sprite = u.swap.sprite; weapon = u.swap.weapon; } }
    return { i, x, y, hp: def.hp + vetHp(sq), maxHp: def.hp + vetHp(sq), alive: true, sprite, weapon: def.crewWeapon && i === 0 ? null : weapon,
      cd: G.rng.range(0, 1.5), aimT: 0, heading: sq.heading, aim: sq.heading, since: 99, deadT: 0, vx: 0, vy: 0, cover: 'none', jx: G.rng.range(-.4, .4), jy: G.rng.range(-.4, .4) };
  }
  function vetHp(e) { const vb = vetBonus(e); return vb.hp || 0; }

  function spawnVehicle(G, defId, owner, x, y, heading) {
    const def = D.VEHICLES[defId];
    const v = { type: 'vehicle', defId, def, owner, x, y, heading: heading == null ? (owner ? Math.PI * .75 : -Math.PI * .25) : heading, turret: 0, speed: 0, hp: def.hp, maxHp: def.hp,
      path: null, order: { type: 'idle' }, xp: 0, vet: 0, weapons: def.weapons.map(w => ({ id: w, cd: G.rng.range(0, 2), since: 99, target: null })),
      lastHit: -99, lastFire: -99, dist: 0, fireT: 99, target: null, spawnT: G.t, wreck: false, reverse: false, stuckT: 0 };
    v.turret = v.heading;
    addEnt(G, v); popRecount(G);
    return v;
  }

  function placeBuilding(G, defId, owner, x, y, built) {
    const def = D.BUILDINGS[defId];
    const b = { type: 'building', defId, def, owner, x, y, w: def.size[0], d: def.size[1], hp: def.hp * Math.max(.1, built), maxHp: def.hp, built, queue: [],
      rally: { x: x + (owner ? -10 : 10), y: y + (owner ? 10 : -10) }, lastHit: -99 };
    addEnt(G, b); stampBuilding(G, b, true);
    if (built >= 1) G.players[owner].built.add(defId);
    return b;
  }
  function stampBuilding(G, b, on) {
    const m = G.map;
    for (let y = Math.floor(b.y - b.d / 2); y < Math.ceil(b.y + b.d / 2); y++) for (let x = Math.floor(b.x - b.w / 2); x < Math.ceil(b.x + b.w / 2); x++) {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const k = y * m.w + x;
      if (on) m.block[k] |= MAP.BI | MAP.BV | MAP.BL; else m.block[k] = m.static.block[k];
    }
    m.navDirty = true; m.version++;
  }
  function canPlace(G, owner, defId, x, y) {
    const def = D.BUILDINGS[defId], m = G.map;
    for (let yy = Math.floor(y - def.size[1] / 2); yy < Math.ceil(y + def.size[1] / 2); yy++) for (let xx = Math.floor(x - def.size[0] / 2); xx < Math.ceil(x + def.size[0] / 2); xx++) {
      if (xx < 2 || yy < 2 || xx >= m.w - 2 || yy >= m.h - 2) return 'Off the map';
      if (m.block[yy * m.w + xx] & (MAP.BI | MAP.BV)) return 'Something is in the way';
    }
    const S = MAP.sectorAt(m, x, y);
    if (S.owner !== owner || !S.supplied) return 'Build inside your own connected territory';
    for (const p of m.points) if (U.dist2(x, y, p.x, p.y) < (p.radius + 5) ** 2) return 'Too close to a capture point';
    return null;
  }

  function popRecount(G) {
    for (const p of G.players) { p.pop = 0; p.upkeep = 0; }
    for (const e of G.ents) {
      if (e.dead || e.type === 'building') continue;
      const P = G.players[e.owner]; P.pop += e.def.pop; P.upkeep += e.def.upkeep * (e.type === 'squad' ? e.models.filter(m => m.alive).length / e.maxModels : 1);
    }
    for (const e of G.ents) if (e.type === 'building') for (const q of e.queue) G.players[e.owner].pop += (D.SQUADS[q.unit] || D.VEHICLES[q.unit]).pop;
  }

  /* ---------------- veterancy ---------------- */
  function vetBonus(e) {
    const out = { acc: 1, rof: 1, rAcc: 1, hp: 0, speed: 1 };
    const tbl = e.def.vetBonus || (e.type === 'vehicle' ? [{ acc: 1.15 }, { acc: 1.25, rof: 1.1 }, { hp: 80, rof: 1.25 }] : [{ rAcc: .9 }, { acc: 1.2 }, { hp: 10, rof: 1.2 }]);
    for (let i = 0; i < (e.vet || 0); i++) { const b = tbl[i] || {}; out.acc *= b.acc || 1; out.rof *= b.rof || 1; out.rAcc *= b.rAcc || 1; out.hp += b.hp || 0; }
    return out;
  }
  function addXp(G, e, xp) {
    if (!e || e.dead || e.type === 'building') return;
    e.xp += xp;
    const th = e.def.vet || [1000, 3000, 6000];
    while (e.vet < 3 && e.xp >= th[e.vet]) {
      e.vet++;
      const vb = vetBonus(e);
      if (e.type === 'vehicle') { const add = (vb.hp || 0) - (e.vetHpGiven || 0); e.maxHp += add; e.hp += add; e.vetHpGiven = vb.hp || 0; }
      else for (const m of e.models) { const nm = e.def.hp + (vb.hp || 0); if (m.alive) m.hp += nm - m.maxHp; m.maxHp = nm; }
      event(G, e.owner, 'vet', e.def.name + ' reached veterancy ' + e.vet, e.x, e.y);
    }
  }

  /* ---------------- events (alert feed) ---------------- */
  function event(G, owner, kind, text, x, y) {
    const P = G.players[owner]; if (!P) return;
    const last = P.alerts[P.alerts.length - 1];
    if (last && last.kind === kind && last.text === text && G.t - last.t < 6) { last.t = G.t; last.x = x; last.y = y; return; }
    P.alerts.push({ kind, text, t: G.t, x, y });
    if (P.alerts.length > 30) P.alerts.shift();
  }

  /* ---------------- orders ---------------- */
  function issue(G, ids, o, queue) {
    const ents = ids.map(id => G.byId.get(id)).filter(e => e && !e.dead);
    if (o.type === 'move' || o.type === 'attackMove' || o.type === 'reverse') {
      const units = ents.filter(e => e.type !== 'building'), n = units.length;
      for (const b of ents) if (b.type === 'building') buildingOrder(G, b, o);
      if (!n) return;
      // spread a group round the click so squads don't stack
      const offs = formationOffsets(n, null);
      const cx = units.reduce((a, e) => a + e.x, 0) / n, cy = units.reduce((a, e) => a + e.y, 0) / n;
      const ang = o.face != null && n > 1 ? o.face : Math.atan2(o.y - cy, o.x - cx), ca = Math.cos(ang), sa = Math.sin(ang);
      // give each unit the slot that matches where it stands in the group now, so paths do not cross
      // (greedy on the shape: a unit on the left of the group takes a slot on the left of the formation)
      const rel = units.map(e => { const dx = e.x - cx, dy = e.y - cy, sp = e.type === 'vehicle' ? 3.2 : 4.2; return { f: (dx * ca + dy * sa) / sp, s: (-dx * sa + dy * ca) / sp }; });
      const pairs = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pairs.push([(rel[i].f - offs[j].f) ** 2 + (rel[i].s - offs[j].s) ** 2, i, j]);
      pairs.sort((a, b) => a[0] - b[0]);
      const slotOf = new Array(n).fill(-1), taken = new Array(n).fill(false); let left = n;
      for (const [, i, j] of pairs) { if (slotOf[i] >= 0 || taken[j]) continue; slotOf[i] = j; taken[j] = true; if (!--left) break; }
      const nav = MAP.navGrids(G.map);
      units.forEach((e, i) => {
        const of = offs[slotOf[i]], sp = e.type === 'vehicle' ? 3.2 : 4.2;
        let tx = o.x, ty = o.y;
        if (n > 1) {
          // a slot behind a wall or inside a house is pulled back toward the click, not routed round the obstacle
          const grid = e.type === 'vehicle' ? nav.veh : nav.inf, c = MAP.nearestOpen(grid, G.map, o.x, o.y);
          const p = MAP.clearRun(grid, G.map, c.x, c.y, o.x + (ca * of.f - sa * of.s) * sp, o.y + (sa * of.f + ca * of.s) * sp);
          tx = p.x; ty = p.y;
        }
        orderEnt(G, e, { ...o, x: tx, y: ty, face: o.face != null ? o.face : (n > 1 ? ang : null) }, queue);
      });
      return;
    }
    if (o.type === 'build') {
      // one squad places it and pays; any other selected builders join the same job
      const builders = ents.filter(e => e.type === 'squad' && e.def.builder);
      if (!builders.length) return;
      orderEnt(G, builders[0], o, queue);
      const jobs = builders[0].buildQueue || [];
      for (const b of builders.slice(1)) if (jobs.length) { b.buildQueue = jobs.map(j => ({ ...j })); b.order = { type: 'build' }; b.path = null; b.slots = null; b.retreating = false; }
      return;
    }
    for (const e of ents) orderEnt(G, e, o, queue);
  }
  function orderEnt(G, e, o, queue) {
    if (e.type === 'building') return buildingOrder(G, e, o);
    if (e.retreating && o.type !== 'retreat' && o.type !== 'stop' && o.type !== 'move' && o.type !== 'attackMove') return;
    if (queue && e.order.type !== 'idle' && (o.type === 'move' || o.type === 'attackMove')) { (e.queue = e.queue || []).push(o); return; }
    e.queue = [];
    if (e.type === 'squad' && e.models.some(m => m.alive) && isPinned(e) && o.type !== 'retreat') return;   // pinned squads only retreat
    switch (o.type) {
      case 'stop': e.order = { type: 'idle' }; e.path = null; e.target = null; e.retreating = false; e.forceTarget = null; e.autoRev = false; e.faceTo = null; break;
      case 'move': case 'attackMove': case 'reverse':
        // a team weapon told to go where it already stands just turns to face the new way
        if (e.crew && e.crew.state !== 'packed' && Math.hypot(o.x - e.crew.x, o.y - e.crew.y) < 3) { if (o.face != null && Math.abs(U.angNorm(o.face - e.crew.heading)) > .3) setup(G, e, o.face); return; }
        e.retreating = false; e.forceTarget = null;
        e.order = { type: o.type, x: o.x, y: o.y, face: o.face };
        // a squad standing still starts from where its men are, not from an anchor that lagged behind them
        if (e.type === 'squad' && !e.moving && !(e.crew && e.crew.state !== 'packed')) {
          const al = e.models.filter(m => m.alive);
          if (al.length) { const mx = al.reduce((a, m) => a + m.x, 0) / al.length, my = al.reduce((a, m) => a + m.y, 0) / al.length; if (MAP.walkable(MAP.navGrids(G.map).inf, G.map, mx, my)) { e.x = mx; e.y = my; } }
        }
        setPath(G, e, o.x, o.y);
        if (e.type === 'vehicle') {
          e.faceTo = null;
          // CoH: a short move to a spot behind the vehicle backs up instead of turning round
          const d = Math.hypot(o.x - e.x, o.y - e.y), off = Math.abs(U.angNorm(Math.atan2(o.y - e.y, o.x - e.x) - e.heading));
          e.autoRev = o.type === 'move' && d < 16 && off > 2.2 && e.path && e.path.length === 1;
        }
        if (e.crew && e.crew.state !== 'packed') teardown(G, e);
        if (e.type === 'squad') e.slots = null;
        if (e.buildQueue && e.buildQueue.length && !o.keepBuild) e.buildQueue = [];
        break;
      case 'attack': {
        const t = G.byId.get(o.target); if (!t) return;
        e.retreating = false; e.forceTarget = t.id; e.order = { type: 'attack', target: t.id }; e.path = null; e.slots = null;
        if (e.type === 'squad') e.buildQueue = [];
        break;
      }
      case 'retreat': if (e.type === 'squad') retreat(G, e); else { const hq = hqOf(G, e.owner); if (hq) orderEnt(G, e, { type: 'move', x: hq.rally.x, y: hq.rally.y }); } break;
      case 'build': if (e.type === 'squad' && e.def.builder) startBuild(G, e, o); break;
      case 'repair': if (e.type === 'squad' && e.def.builder) { e.order = { type: 'repair', target: o.target }; e.path = null; e.buildQueue = []; } break;
      case 'ability': useAbility(G, e, o); break;
      case 'upgrade': upgradeSquad(G, e, o.id); break;
      case 'setup': if (e.crew) { e.order = { type: 'idle' }; e.path = null; setup(G, e, o.heading); } break;
    }
  }
  function setPath(G, e, x, y) {
    const veh = e.type === 'vehicle';
    e.path = MAP.findPath(G.map, e.x, e.y, x, y, veh); e.pathVer = G.map.version; e.trail = [];
  }
  function hqOf(G, owner) { return G.ents.find(b => b.type === 'building' && b.owner === owner && b.def.retreat && !b.dead); }

  function retreat(G, sq) {
    const hq = hqOf(G, sq.owner); if (!hq) return;
    sq.retreating = true; sq.forceTarget = null; sq.buildQueue = [];
    sq.order = { type: 'retreat', x: hq.x + (sq.owner ? -9 : 9), y: hq.y + (sq.owner ? 9 : -9) };
    if (sq.crew) { sq.crew.state = 'packed'; }
    setPath(G, sq, sq.order.x, sq.order.y); sq.slots = null;
    event(G, sq.owner, 'retreat', sq.def.name + ' retreating', sq.x, sq.y);
  }

  /* ---------------- team weapon set-up ---------------- */
  function weaponOf(sq) { return sq.def.crewWeapon ? D.W[sq.def.weapons[0]] : null; }
  function setup(G, sq, heading) {
    const w = weaponOf(sq); if (!w) return;
    sq.crew.state = 'setting'; sq.crew.t = w.setup || 2.5; sq.crew.heading = heading == null ? sq.heading : heading;
    sq.crew.x = sq.x; sq.crew.y = sq.y; sq.slots = null;
  }
  function teardown(G, sq) {
    const w = weaponOf(sq); if (!w || sq.crew.state === 'tearing' || sq.crew.state === 'packed') return;   // a new order must not restart the pack-up
    sq.crew.state = 'tearing'; sq.crew.t = w.teardown || 1.8;
  }
  const crewReady = sq => !sq.crew || sq.crew.state === 'deployed';

  /* ---------------- buildings: production, rally ---------------- */
  function canAfford(P, cost) { return (P.res.mp >= (cost.mp || 0)) && (P.res.mu >= (cost.mu || 0)) && (P.res.fu >= (cost.fu || 0)); }
  function pay(P, cost, sign = 1) { P.res.mp -= sign * (cost.mp || 0); P.res.mu -= sign * (cost.mu || 0); P.res.fu -= sign * (cost.fu || 0); }
  function unitDef(id) { return D.SQUADS[id] || D.VEHICLES[id]; }
  function prodBlock(G, b, unit) {
    const P = G.players[b.owner], u = unitDef(unit);
    if (b.built < 1) return 'Under construction';
    if (!canAfford(P, u.cost)) return 'Not enough resources';
    if (P.pop + u.pop > P.popCap) return 'Population cap reached';
    if (b.queue.length >= 5) return 'Queue full';
    return null;
  }
  function buildingOrder(G, b, o) {
    const P = G.players[b.owner];
    if (o.type === 'produce') {
      if (prodBlock(G, b, o.unit)) return;
      const u = unitDef(o.unit); pay(P, u.cost); b.queue.push({ unit: o.unit, t: 0, total: u.time }); popRecount(G);
    } else if (o.type === 'cancel') {
      const q = b.queue[o.index]; if (!q) return; pay(P, unitDef(q.unit).cost, -1); b.queue.splice(o.index, 1); popRecount(G);
    } else if (o.type === 'rally' || o.type === 'move') { b.rally = { x: o.x, y: o.y }; }
  }
  function stepBuildings(G, dt) {
    for (const b of G.ents) {
      if (b.type !== 'building' || b.dead) continue;
      if (b.built < 1) continue;
      const q = b.queue[0]; if (!q) continue;
      q.t += dt;
      if (q.t >= q.total) {
        b.queue.shift();
        const ang = Math.atan2(b.rally.y - b.y, b.rally.x - b.x);
        const sx = b.x + Math.cos(ang) * (b.w * .5 + 2), sy = b.y + Math.sin(ang) * (b.d * .5 + 2);
        const isV = !D.SQUADS[q.unit], nav = MAP.navGrids(G.map);
        const p = MAP.nearestOpen(isV ? nav.veh : nav.inf, G.map, sx, sy);   // vehicles need ground a vehicle can use
        const e = isV ? spawnVehicle(G, q.unit, b.owner, p.x, p.y, ang) : spawnSquad(G, q.unit, b.owner, p.x, p.y);
        orderEnt(G, e, { type: 'move', x: b.rally.x + G.rng.range(-3, 3), y: b.rally.y + G.rng.range(-3, 3) });
        event(G, b.owner, 'ready', e.def.name + ' ready', e.x, e.y);
        popRecount(G);
      }
    }
  }

  /* ---------------- construction ---------------- */
  /* o: {type:'build', what: building id | defence id, x, y, x2, y2} */
  function startBuild(G, sq, o) {
    const P = G.players[sq.owner];
    if (D.BUILDINGS[o.what]) {
      const why = canPlace(G, sq.owner, o.what, o.x, o.y) || buildReqMissing(G, sq.owner, o.what);
      if (why) { event(G, sq.owner, 'error', why, o.x, o.y); return; }
      const def = D.BUILDINGS[o.what]; if (!canAfford(P, def.cost)) { event(G, sq.owner, 'error', 'Not enough resources', o.x, o.y); return; }
      pay(P, def.cost);
      const b = placeBuilding(G, o.what, sq.owner, o.x, o.y, 0); b.hp = def.hp * .1;
      sq.buildQueue = [{ kind: 'building', id: b.id }];
    } else if (D.DEFENCES[o.what]) {
      const def = D.DEFENCES[o.what];
      const x2 = o.x2 == null ? o.x + Math.cos(sq.heading + Math.PI / 2) * def.len : o.x2, y2 = o.y2 == null ? o.y + Math.sin(sq.heading + Math.PI / 2) * def.len : o.y2;
      const L = Math.hypot(x2 - o.x, y2 - o.y), n = Math.max(1, Math.round(L / def.len));
      sq.buildQueue = [];
      for (let i = 0; i < n; i++) {
        const ax = o.x + (x2 - o.x) * i / n, ay = o.y + (y2 - o.y) * i / n, bx = o.x + (x2 - o.x) * (i + 1) / n, by = o.y + (y2 - o.y) * (i + 1) / n;
        const c = G.map.addCover(o.what, ax, ay, bx, by, { cover: def.cover, blocksV: def.blocksVehicles, blocksI: false, hp: def.hp, owner: sq.owner, built: 0 });
        c.blocksIWhenBuilt = def.blocksInfantry; c.buildTime = def.time;
        sq.buildQueue.push({ kind: 'cover', id: c.id });
      }
    } else return;
    sq.order = { type: 'build' }; sq.path = null; sq.slots = null; sq.retreating = false;
  }
  function buildReqMissing(G, owner, id) {
    const def = D.BUILDINGS[id], P = G.players[owner];
    for (const r of def.req || []) {
      if (Array.isArray(r)) { if (!r.some(x => P.built.has(x))) return 'Requires ' + r.map(x => D.BUILDINGS[x].name).join(' or '); }
      else if (!P.built.has(r)) return 'Requires ' + D.BUILDINGS[r].name;
    }
    const exists = G.ents.some(b => b.type === 'building' && b.owner === owner && b.defId === id && !b.dead);
    if (exists) return 'Already built';
    return null;
  }
  function stepBuild(G, sq, dt) {
    while (sq.buildQueue.length) {
      const job = sq.buildQueue[0];
      const tgt = job.kind === 'building' ? G.byId.get(job.id) : G.map.covers[job.id];
      if (!tgt || tgt.dead || tgt.alive === false || (job.kind === 'building' ? tgt.built >= 1 : tgt.built >= 1)) { sq.buildQueue.shift(); continue; }
      // stand next to it
      const px = job.kind === 'building' ? tgt.x : (tgt.ax + tgt.bx) / 2, py = job.kind === 'building' ? tgt.y : (tgt.ay + tgt.by) / 2;
      const reach = job.kind === 'building' ? Math.max(tgt.w, tgt.d) / 2 + 3 : 3.5;
      const d = Math.hypot(sq.x - px, sq.y - py);
      // walk in to `reach`, keep working out to reach + 3 m: with one threshold the squad's anchor, drifting toward its
      // men, crossed it back and forth and the engineers flickered between walking and building
      if (d > reach + (sq.building ? 3 : 0)) {
        sq.building = false;
        // a job it cannot reach for 20 s is dropped (the building or wall stays, another squad can finish it)
        sq.reachT = (sq.reachT || 0) + dt; if (sq.reachT > 20) { sq.reachT = 0; sq.buildQueue.shift(); event(G, sq.owner, 'error', 'Engineers cannot reach the construction site', px, py); continue; }
        if (!sq.path || !sq.path.length) { const side = job.kind === 'building' ? nearEdge(sq, tgt) : { x: px - Math.sin(Math.atan2(tgt.by - tgt.ay, tgt.bx - tgt.ax)) * 1.6, y: py + Math.cos(Math.atan2(tgt.by - tgt.ay, tgt.bx - tgt.ax)) * 1.6 }; setPath(G, sq, side.x, side.y); } return true; }
      sq.path = null; sq.building = true; sq.buildAt = { x: px, y: py }; sq.reachT = 0;
      const vb = sq.vet >= 2 ? 1.35 : 1, rate = dt * vb * Math.max(.4, sq.models.filter(m => m.alive).length / sq.maxModels);
      if (job.kind === 'building') {
        tgt.built = Math.min(1, tgt.built + rate / tgt.def.time); tgt.hp = Math.min(tgt.maxHp, tgt.hp + tgt.maxHp * .9 * rate / tgt.def.time);
        if (tgt.built >= 1) { G.players[tgt.owner].built.add(tgt.defId); event(G, tgt.owner, 'built', tgt.def.name + ' complete', tgt.x, tgt.y); }
      } else {
        tgt.built = Math.min(1, tgt.built + rate / tgt.buildTime);
        if (tgt.built >= 1 && tgt.blocksIWhenBuilt) { tgt.blocksI = true; MAP.stampCover(G.map, tgt, true); }
      }
      return true;
    }
    sq.building = false;
    return false;
  }
  function nearEdge(sq, b) {
    const ang = Math.atan2(sq.y - b.y, sq.x - b.x);
    return { x: b.x + Math.cos(ang) * (b.w / 2 + 2), y: b.y + Math.sin(ang) * (b.d / 2 + 2) };
  }
  function stepRepair(G, sq, dt) {
    const t = G.byId.get(sq.order.target);
    if (!t || t.dead || t.hp >= t.maxHp || t.owner !== sq.owner) { sq.order = { type: 'idle' }; sq.building = false; return; }
    // distance to the target's edge: a building is wide, a vehicle a few metres long
    const half = t.type === 'building' ? Math.max(t.w, t.d) / 2 : (t.def.length || 4) / 2, d = Math.hypot(sq.x - t.x, sq.y - t.y) - half;
    // walk in to 5 m, keep working out to 8 m: one threshold made the squad flip between walking and working at 6 m
    if (d > (sq.building ? 8 : 5)) { if (!sq.path || !sq.path.length || sq.repathT < G.t) { const p = t.type === 'building' ? nearEdge(sq, t) : t; setPath(G, sq, p.x, p.y); sq.repathT = G.t + 2; } sq.building = false; return; }
    sq.path = null; sq.building = true; sq.buildAt = { x: t.x, y: t.y };
    t.hp = Math.min(t.maxHp, t.hp + (sq.def.repair || 8) * sq.models.filter(m => m.alive).length / sq.maxModels * dt * (sq.vet >= 2 ? 1.4 : 1));
  }

  /* ---------------- upgrades and abilities ---------------- */
  function upgradeSquad(G, sq, id) {
    const u = (sq.def.upgrades || []).find(x => x.id === id), P = G.players[sq.owner];
    if (!u || sq.upgrades.has(id) || sq.upgrading || !canAfford(P, u.cost)) return;
    if (!nearReinforcePoint(G, sq)) { event(G, sq.owner, 'error', 'Upgrade near a base building', sq.x, sq.y); return; }
    pay(P, u.cost); sq.upgrading = { id, t: 0, total: u.time };
  }
  function useAbility(G, e, o) {
    const ab = D.ABILITIES[o.id], P = G.players[e.owner];
    if (!ab || (e.cooldowns[o.id] || 0) > G.t) return;
    if (!canAfford(P, ab.cost)) { event(G, e.owner, 'error', 'Not enough munitions', e.x, e.y); return; }
    e.order = { type: 'ability', id: o.id, x: o.x, y: o.y }; e.path = null; e.slots = null; e.forceTarget = null;
  }
  function stepAbility(G, e, dt) {
    const o = e.order, ab = D.ABILITIES[o.id], d = Math.hypot(o.x - e.x, o.y - e.y);
    if (ab.minRange && d < ab.minRange) { e.order = { type: 'idle' }; return; }
    if (o.id === 'barrage') {
      if (!crewReady(e)) { if (e.crew.state === 'packed') setup(G, e, Math.atan2(o.y - e.y, o.x - e.x)); return; }
      if (d > ab.range) { e.order = { type: 'move', x: o.x, y: o.y }; setPath(G, e, o.x, o.y); return; }
      e.barrage = { x: o.x, y: o.y, left: ab.shots, t: 0 }; e.cooldowns[o.id] = G.t + ab.cooldown; e.order = { type: 'idle' };
      return;
    }
    if (d > ab.range - 1) { if (!e.path || !e.path.length) setPath(G, e, o.x, o.y); return; }
    e.path = null;
    const thrower = e.models.find(m => m.alive); if (!thrower) return;
    if (!canAfford(G.players[e.owner], ab.cost)) { e.order = { type: 'idle' }; event(G, e.owner, 'error', 'Not enough munitions', e.x, e.y); return; }
    pay(G.players[e.owner], ab.cost); e.cooldowns[o.id] = G.t + ab.cooldown;
    COMBAT.throwGrenade(G, e, thrower, o.x, o.y, ab);
    e.order = { type: 'idle' };
  }

  /* ---------------- movement ---------------- */
  function isPinned(sq) { return sq.suppState === 2 && !sq.retreating; }
  function squadSpeed(sq) {
    let s = sq.def.speed;
    if (sq.retreating) s *= 1.25;
    else if (sq.suppState === 1) s *= .5;
    else if (sq.suppState === 2) s = 0;
    if (sq.crew && sq.crew.state !== 'packed') s = 0;
    return s;
  }
  function stepSquadMove(G, sq, dt) {
    const alive = sq.models.filter(m => m.alive);
    if (!alive.length) return;
    const nav = MAP.navGrids(G.map).inf;
    // the map changed (something built or destroyed somewhere): find a new way only if this one is now blocked,
    // so squads do not re-route, and their men lose the leader's trail, every time a sandbag goes up across the map
    if (sq.path && sq.pathVer !== G.map.version && sq.path.length) {
      if (MAP.pathOpen(nav, G.map, sq.x, sq.y, sq.path)) sq.pathVer = G.map.version;
      else { const end = sq.path[sq.path.length - 1]; setPath(G, sq, end.x, end.y); }
    }
    let moving = false;
    if (sq.path && sq.path.length && !(sq.order.type === 'attackMove' && sq.engageT > G.t)) {
      const sp = squadSpeed(sq) * dt, wp = sq.path[0];
      const dx = wp.x - sq.x, dy = wp.y - sq.y, d = Math.hypot(dx, dy);
      if (sp > 0) {
        moving = true;
        if (d <= sp) { sq.x = wp.x; sq.y = wp.y; sq.path.shift(); }
        else { sq.x += dx / d * sp; sq.y += dy / d * sp; sq.heading = Math.atan2(dy, dx); }
        sq.trail.push({ x: sq.x, y: sq.y }); if (sq.trail.length > 80) sq.trail.shift();
      }
      if (!sq.path.length) arrive(G, sq);
    }
    // slots: where each model stands
    if (!moving && !sq.slots) sq.slots = holdSlots(G, sq);
    const slotsFor = moving ? null : sq.slots;
    const speed = Math.max(1.5, squadSpeed(sq) * 1.15 || (sq.crew && sq.crew.state !== 'packed' ? 3 : 0));
    let k = 0;
    for (const m of sq.models) {
      if (!m.alive) continue;
      let tx, ty;
      if (sq.crew && sq.crew.state !== 'packed') { const p = crewSlot(G, sq, k); tx = p.x; ty = p.y; }
      else if (slotsFor && slotsFor[k]) {
        if (!MAP.walkable(nav, G.map, slotsFor[k].x, slotsFor[k].y)) { const o = MAP.nearestOpen(nav, G.map, slotsFor[k].x, slotsFor[k].y); slotsFor[k].x = o.x; slotsFor[k].y = o.y; }
        tx = slotsFor[k].x; ty = slotsFor[k].y;
      } else {
        const o = sq.offsets[m.i % sq.offsets.length], h = sq.heading;
        tx = sq.x + Math.cos(h) * o.f - Math.sin(h) * o.s + m.jx; ty = sq.y + Math.sin(h) * o.f + Math.cos(h) * o.s + m.jy;
        if (!MAP.walkable(nav, G.map, tx, ty) || !MAP.lineClear(nav, G.map, m.x, m.y, tx, ty)) {
          // follow the leader's trail
          let found = false;
          for (let i = sq.trail.length - 1; i >= 0; i -= 2) { const p = sq.trail[i]; if (MAP.lineClear(nav, G.map, m.x, m.y, p.x, p.y)) { tx = p.x; ty = p.y; found = true; break; } }
          if (!found) { tx = sq.x; ty = sq.y; }
        }
      }
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
      const step = Math.min(d, speed * dt * (d > 6 ? 1.3 : 1));
      if (d > .05) {
        const nx = m.x + dx / d * step, ny = m.y + dy / d * step;
        if (MAP.walkable(nav, G.map, nx, ny) || !MAP.walkable(nav, G.map, m.x, m.y)) { m.x = nx; m.y = ny; }
        else { m.x = U.lerp(m.x, sq.x, .2); m.y = U.lerp(m.y, sq.y, .2); }
        if (step > .01) m.heading = Math.atan2(dy, dx);
      }
      m.vx = step / dt;
      // safety net: a man left inside an obstacle (a building raised on him, a wall built through him) steps out
      if (!MAP.walkable(nav, G.map, m.x, m.y) && !(sq.crew && sq.crew.state !== 'packed')) { m.blockT = (m.blockT || 0) + dt; if (m.blockT > 2) { const o = MAP.nearestOpen(nav, G.map, m.x, m.y); m.x = o.x; m.y = o.y; m.blockT = 0; sq.slots = null; } } else m.blockT = 0;
      k++;
    }
    // keep the squad's anchor on its men when it is not walking a path
    if (!moving && !(sq.crew && sq.crew.state !== 'packed')) {
      const cx = alive.reduce((a, m) => a + m.x, 0) / alive.length, cy = alive.reduce((a, m) => a + m.y, 0) / alive.length;
      sq.x = U.lerp(sq.x, cx, .02); sq.y = U.lerp(sq.y, cy, .02);
    }
    sq.moving = moving;
    sq.stillT = moving ? 0 : sq.stillT + dt;
  }
  function arrive(G, sq) {
    const o = sq.order;
    if (sq.queue && sq.queue.length) { const n = sq.queue.shift(); sq.order = { type: n.type, x: n.x, y: n.y, face: n.face }; setPath(G, sq, n.x, n.y); return; }
    if (o.type === 'move' || o.type === 'attackMove') {
      sq.order = { type: 'idle' };
      if (o.face != null && !sq.crew) sq.heading = o.face;
      if (sq.crew && sq.crew.state === 'packed') setup(G, sq, o.face != null ? o.face : sq.heading);
    }
    if (o.type === 'retreat') { sq.order = { type: 'idle' }; sq.retreating = false; sq.supp = 0; sq.suppState = 0; }
    sq.slots = null;
  }
  /* where each man stands when the squad stops: behind any cover within reach that faces the way it was going */
  function holdSlots(G, sq) {
    const alive = sq.models.filter(m => m.alive), n = alive.length, out = [];
    const fx = Math.cos(sq.heading), fy = Math.sin(sq.heading);
    const cands = [];
    for (const c of MAP.coversNear(G.map, sq.x, sq.y)) {
      if (!c.alive || !c.cover) continue;
      const L = Math.hypot(c.bx - c.ax, c.by - c.ay), nx = -(c.by - c.ay) / L, ny = (c.bx - c.ax) / L;
      const side = (nx * fx + ny * fy) > 0 ? -1 : 1;     // stand on the side away from where we face
      const cnt = Math.max(1, Math.floor(L / 1.4));
      for (let i = 0; i < cnt; i++) {
        const t = (i + .5) / cnt, px = c.ax + (c.bx - c.ax) * t + nx * side * .9, py = c.ay + (c.by - c.ay) * t + ny * side * .9;
        const d = Math.hypot(px - sq.x, py - sq.y);
        if (d < 9 && MAP.walkable(MAP.navGrids(G.map).inf, G.map, px, py)) cands.push({ x: px, y: py, d: d + (c.cover === 'heavy' ? 0 : 3) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < n; i++) {
      if (cands[i] && i < cands.length) { out.push(cands[i]); continue; }
      const o = sq.offsets[i % sq.offsets.length], nav = MAP.navGrids(G.map).inf;
      out.push(MAP.nearestOpen(nav, G.map, sq.x + fx * o.f * .8 - fy * o.s, sq.y + fy * o.f * .8 + fx * o.s));
    }
    return out;
  }
  /* crew positions round a deployed weapon (from art/crew_layout.json, artkit units -> metres) */
  function crewSlot(G, sq, k) {
    const c = sq.crew, h = c.heading, lay = G.layout && G.layout.weapons[(sq.owner >= 0 ? G.players[sq.owner].side : 'us') + '_' + sq.def.crewWeapon];
    const crew = lay ? lay.crew : [];
    let ox, oy;
    if (crew[k]) { ox = crew[k].x / 55; oy = -crew[k].y / 55; }
    else { ox = -2.2 - (k - crew.length) * .4; oy = (k - crew.length) % 2 ? 1.4 : -1.4; }
    return { x: c.x + Math.cos(h) * ox - Math.sin(h) * oy, y: c.y + Math.sin(h) * ox + Math.cos(h) * oy, rel: crew[k] ? crew[k].heading : 0, unit: crew[k] ? crew[k].unit : null };
  }

  function stepVehicleMove(G, v, dt) {
    const def = v.def;
    if (v.path && v.pathVer !== G.map.version && v.path.length) {
      if (MAP.pathOpen(MAP.navGrids(G.map).veh, G.map, v.x, v.y, v.path)) v.pathVer = G.map.version;
      else { const end = v.path[v.path.length - 1]; setPath(G, v, end.x, end.y); }
    }
    // a vehicle found inside an obstacle (a building raised round it, a wreck) is moved to open ground at once
    { const grid = MAP.navGrids(G.map).veh; if (!MAP.walkable(grid, G.map, v.x, v.y)) { const o = MAP.nearestOpen(grid, G.map, v.x, v.y); v.x = o.x; v.y = o.y; if (v.path && v.path.length) { const end = v.path[v.path.length - 1]; setPath(G, v, end.x, end.y); } } }
    let target = null;
    if (v.path && v.path.length && !(v.order.type === 'attackMove' && v.engageT > G.t)) target = v.path[0];
    const accel = def.accel, maxSp = def.speed * (v.vet >= 3 && v.defId === 'us_chaffee' ? 1.33 : 1);
    const grid = MAP.navGrids(G.map).veh, rot = def.rot * Math.PI / 180;
    // the next waypoint already in a straight, clear line: head for it now instead of driving into the corner
    if (target && v.path.length > 1 && (v.skipT = (v.skipT || 0) - dt) <= 0) {
      v.skipT = .2;
      if (MAP.lineClear(grid, G.map, v.x, v.y, v.path[1].x, v.path[1].y)) { v.path.shift(); target = v.path[0]; }
    }
    if (target) {
      const dx = target.x - v.x, dy = target.y - v.y, d = Math.hypot(dx, dy);
      const rev = v.order.type === 'reverse' || v.autoRev;
      const want = Math.atan2(dy, dx) + (rev ? Math.PI : 0);
      v.heading = U.turnTo(v.heading, want, rot * dt);
      const off = Math.abs(U.angNorm(want - v.heading));
      // ease off smoothly with heading error rather than in steps; nearly stop only for a turn on the spot
      let desired = (off > 1.2 ? .15 : U.lerp(1, .35, off / 1.2)) * maxSp * (rev ? .45 : 1);
      if (v.path.length === 1) desired *= Math.min(1, d / 6 + .2);
      else {
        // brake ahead of a sharp corner so the turn is made rolling, not by overshooting and crawling back
        const n = v.path[1], turn = Math.abs(U.angNorm(Math.atan2(n.y - target.y, n.x - target.x) - Math.atan2(dy, dx)));
        const cornerSp = maxSp * U.clamp(1 - turn / 2.4, .3, 1), brake = (v.speed * v.speed - cornerSp * cornerSp) / (2 * accel) + 1;
        if (d < brake) desired = Math.min(desired, cornerSp);
      }
      v.speed = U.approach(v.speed, desired, accel * dt);
      if (d < 1.5 || (d < v.speed * dt * 2)) { v.path.shift(); if (!v.path.length) vehicleArrive(G, v); }
    } else {
      v.speed = U.approach(v.speed, 0, accel * 2 * dt);
      // told to face a way (right-drag): turn there once stopped, unless the gun is busy aiming the hull
      if (v.faceTo != null && v.speed < .3) {
        if (v.order.type === 'attack' || G.t - v.lastFire < 3) v.faceTo = null;
        else { v.heading = U.turnTo(v.heading, v.faceTo, rot * dt); if (Math.abs(U.angNorm(v.faceTo - v.heading)) < .02) v.faceTo = null; }
      }
    }
    if (v.speed > .01) {
      const dir = v.order.type === 'reverse' || v.autoRev ? -1 : 1;
      const nx = v.x + Math.cos(v.heading) * v.speed * dt * dir, ny = v.y + Math.sin(v.heading) * v.speed * dt * dir;
      if (MAP.walkable(grid, G.map, nx, ny) || !MAP.walkable(grid, G.map, v.x, v.y)) { v.x = nx; v.y = ny; v.dist += v.speed * dt; v.stuckT = 0; }
      else {
        // sidestep: try sliding past the corner before giving up
        const st = v.speed * dt * dir; let moved = false;
        for (const a of [.6, -.6, 1.2, -1.2]) { const sx = v.x + Math.cos(v.heading + a) * st, sy = v.y + Math.sin(v.heading + a) * st; if (MAP.walkable(grid, G.map, sx, sy)) { v.x = sx; v.y = sy; v.dist += Math.abs(st); moved = true; break; } }
        if (!moved) { v.speed *= .5; v.stuckT += dt; }
        if (v.stuckT > 1.2 && v.path && v.path.length) { const end = v.path[v.path.length - 1]; const o = MAP.nearestOpen(grid, G.map, v.x + Math.cos(v.heading + Math.PI) * 1.5, v.y + Math.sin(v.heading + Math.PI) * 1.5); if (v.stuckT > 3) { v.x = o.x; v.y = o.y; } setPath(G, v, end.x, end.y); if (v.stuckT > 3) v.stuckT = 0; }
      }
      crush(G, v);
    }
    // vehicles push each other apart
    for (const o of G.ents) {
      if (o === v || o.type !== 'vehicle' || o.dead) continue;
      const dx = v.x - o.x, dy = v.y - o.y, d = Math.hypot(dx, dy), r = (v.def.width + o.def.width) * .6 + 1;
      if (d < r && d > .01) { const push = (r - d) * .5 * dt * 4, px = v.x + dx / d * push, py = v.y + dy / d * push; if (MAP.walkable(MAP.navGrids(G.map).veh, G.map, px, py)) { v.x = px; v.y = py; } }
    }
  }
  function vehicleArrive(G, v) {
    v.autoRev = false;
    if (v.queue && v.queue.length) { const n = v.queue.shift(); v.order = { type: n.type, x: n.x, y: n.y, face: n.face }; setPath(G, v, n.x, n.y); return; }
    if (v.order.type !== 'attack') { if (v.order.face != null && v.order.type !== 'reverse') v.faceTo = v.order.face; v.order = { type: 'idle' }; }
  }
  function crush(G, v) {
    for (const c of MAP.coversNear(G.map, v.x, v.y)) {
      if (!c.alive) continue;
      const can = c.kind === 'wire' || (!v.def.light && (c.kind === 'sandbags' || c.kind === 'hedge'));
      if (!can) continue;
      if (U.segDist2(v.x, v.y, c.ax, c.ay, c.bx, c.by) < (v.def.width * .5 + .3) ** 2) MAP.removeCover(G.map, c);
    }
  }

  /* ---------------- territory, capture, economy ---------------- */
  function updateTerritory(G) {
    const m = G.map;
    for (const S of m.sectors) { if (S.base >= 0) S.owner = S.base; else S.owner = m.points[S.point].owner; S.supplied = false; }
    for (const P of G.players) {
      const start = m.sectors.find(S => S.base === P.slot); if (!start) continue;
      const stack = [start], seen = new Set([start.id]);
      while (stack.length) { const S = stack.pop(); S.supplied = true; for (const n of S.neigh) { const N = m.sectors[n]; if (!seen.has(n) && N.owner === P.slot) { seen.add(n); stack.push(N); } } }
    }
  }
  function canCapture(G, slot, p) {
    const S = G.map.sectors[p.sector];
    for (const n of S.neigh) { const N = G.map.sectors[n]; if (N.owner === slot && N.supplied) return true; }
    return false;
  }
  function stepCapture(G, dt) {
    for (const p of G.map.points) {
      const rate = [0, 0];
      for (const e of G.ents) {
        if (e.dead || e.owner < 0 || e.type === 'building') continue;
        if (e.type === 'squad' && (e.retreating || !e.models.some(m => m.alive) || e.suppState === 2)) continue;
        const mult = e.type === 'squad' ? (e.def.capture || 1) : (e.def.capture || 0);
        if (!mult) continue;
        if (U.dist2(e.x, e.y, p.x, p.y) > p.radius * p.radius) continue;
        rate[e.owner] = Math.max(rate[e.owner], mult * (e.vet >= 1 && e.defId === 'de_pioneers' ? 1.33 : 1));
      }
      if (rate[0] && rate[1]) { p.contested = true; continue; }
      p.contested = false;
      const side = rate[0] ? 0 : rate[1] ? 1 : -1;
      if (side < 0) { if (p.owner < 0 && p.cap > 0) p.cap = Math.max(0, p.cap - dt / D.ECON.captureTime * .5); continue; }
      if (p.owner === side) { p.cap = 1; continue; }
      if (!canCapture(G, side, p)) { p.blocked = side; continue; }
      p.blocked = -1;
      const step = rate[side] * dt / D.ECON.captureTime;
      if (p.owner >= 0) {             // decapture first
        p.cap -= step;
        if (p.cap <= 0) { const lost = p.owner; p.owner = -1; p.cap = 0; p.capSide = side; updateTerritory(G); event(G, lost, 'lost', 'Losing territory!', p.x, p.y); }
      } else {
        if (p.capSide !== side) { p.capSide = side; p.cap = Math.max(0, p.cap - step); if (p.cap > 0) continue; }
        p.cap += step;
        if (p.cap >= 1) { p.cap = 1; p.owner = side; updateTerritory(G); event(G, side, 'captured', (p.type === 'victory' ? 'Victory point' : 'Point') + ' captured', p.x, p.y); }
      }
    }
  }
  function stepEconomy(G, dt) {
    const E = D.ECON;
    for (const P of G.players) {
      const inc = { mp: Math.max(E.baseIncome.mp * .25, E.baseIncome.mp - P.upkeep), mu: E.baseIncome.mu, fu: E.baseIncome.fu };
      for (const p of G.map.points) {
        if (p.owner !== P.slot || !G.map.sectors[p.sector].supplied) continue;
        const v = E.point[p.type]; inc.mu += v.mu; inc.fu += v.fu;
      }
      P.income = inc;
      P.res.mp += inc.mp / 60 * dt; P.res.mu += inc.mu / 60 * dt; P.res.fu += inc.fu / 60 * dt;
    }
    // victory points
    const held = [0, 0];
    for (const p of G.map.points) if (p.type === 'victory' && p.owner >= 0) held[p.owner]++;
    G.players[0].vpHeld = held[0]; G.players[1].vpHeld = held[1];
    const diff = held[0] - held[1];
    if (diff) { const loser = diff > 0 ? 1 : 0; G.players[loser].vp -= Math.abs(diff) * E.vpDrainPerDiff * dt; }
    for (const P of G.players) if (P.vp <= 0 && !G.over) { P.vp = 0; G.over = { winner: 1 - P.slot, reason: 'Victory points' }; }
  }

  /* ---------------- reinforcement, retreat healing, upgrades ---------------- */
  function nearReinforcePoint(G, sq) {
    for (const e of G.ents) {
      if (e.dead || e.owner !== sq.owner) continue;
      if (e.type === 'building' && e.def.reinforce && e.built >= 1 && U.dist2(e.x, e.y, sq.x, sq.y) < (Math.max(e.w, e.d) / 2 + 16) ** 2) return e;
      if (e.type === 'vehicle' && e.def.reinforces && U.dist2(e.x, e.y, sq.x, sq.y) < 12 * 12) return e;
    }
    return null;
  }
  function stepSquadSupport(G, sq, dt) {
    const P = G.players[sq.owner], alive = sq.models.filter(m => m.alive).length;
    const inCombat = G.t - sq.lastHit < 4;
    const rp = (alive < sq.maxModels || sq.upgrading || alive) ? nearReinforcePoint(G, sq) : null;
    if (sq.upgrading) {
      sq.upgrading.t += dt;
      if (sq.upgrading.t >= sq.upgrading.total) {
        const u = sq.def.upgrades.find(x => x.id === sq.upgrading.id); sq.upgrades.add(u.id); sq.upgrading = null;
        if (u.swap) { const m = sq.models[u.swap.index]; if (m) { m.sprite = u.swap.sprite; m.weapon = u.swap.weapon; } }
        event(G, sq.owner, 'upgrade', u.name + ' fitted', sq.x, sq.y);
      }
    }
    if (rp && !inCombat) {
      // heal near base buildings (CoH3 HQs heal with Medical Stations; here every reinforce point heals slowly)
      for (const m of sq.models) if (m.alive && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + (rp.type === 'building' && rp.def.retreat ? 6 : 2) * dt);
      if (alive && alive < sq.maxModels && P.autoReinforce && !sq.retreating) {
        sq.reinforceT += dt;
        const cost = { mp: sq.def.reinforce };
        if (sq.reinforceT >= 4.5 && canAfford(P, cost)) {
          sq.reinforceT = 0; pay(P, cost);
          const dead = sq.models.find(m => !m.alive);
          const i = dead.i, nm = makeModel(G, sq, i, rp.x + G.rng.range(-2, 2), rp.y + G.rng.range(-2, 2));
          const p = MAP.nearestOpen(MAP.navGrids(G.map).inf, G.map, nm.x, nm.y); nm.x = p.x; nm.y = p.y;
          sq.models[sq.models.indexOf(dead)] = nm; sq.slots = null; popRecount(G);
        }
      } else sq.reinforceT = 0;
    } else sq.reinforceT = 0;
  }

  /* ---------------- main step ---------------- */
  function step(G, dt) {
    if (G.over) return;
    G.t += dt;
    for (const e of G.ents) {
      if (e.dead) continue;
      if (e.type === 'squad') {
        if (!e.models.some(m => m.alive)) { kill(G, e); continue; }
        // team weapon timers
        if (e.crew) {
          if (e.crew.state === 'setting') { e.crew.t -= dt; if (e.crew.t <= 0) e.crew.state = 'deployed'; }
          else if (e.crew.state === 'tearing') { e.crew.t -= dt; if (e.crew.t <= 0) { e.crew.state = 'packed'; e.x = e.crew.x; e.y = e.crew.y; } }
        }
        if (e.order.type === 'build') { if (!stepBuild(G, e, dt)) e.order = { type: 'idle' }; }
        else if (e.order.type === 'repair') stepRepair(G, e, dt);
        else e.building = false;
        if (e.order.type === 'ability') stepAbility(G, e, dt);
        stepSquadMove(G, e, dt);
        stepSquadSupport(G, e, dt);
      } else if (e.type === 'vehicle') {
        stepVehicleMove(G, e, dt);
      }
    }
    COMBAT.step(G, dt);
    stepBuildings(G, dt);
    stepCapture(G, dt);
    stepEconomy(G, dt);
    if ((G.t * 4 | 0) !== ((G.t - dt) * 4 | 0)) FOG.update(G);
    if ((G.t | 0) !== ((G.t - dt) | 0)) popRecount(G);
    // lose condition: HQ destroyed or nothing left
    for (const P of G.players) if (!G.over && !hqOf(G, P.slot)) G.over = { winner: 1 - P.slot, reason: 'Headquarters destroyed' };
    // tidy dead entities
    if (G.ents.some(e => e.dead && e.reap < G.t)) { G.ents = G.ents.filter(e => !(e.dead && e.reap < G.t)); }
    if (G.corpses && G.corpses.length > 120) G.corpses.splice(0, G.corpses.length - 120);
  }
  function kill(G, e) {
    if (e.dead) return;
    e.dead = true; e.reap = G.t + .1; e.deadT = G.t;
    if (e.type === 'building') { stampBuilding(G, e, false); G.fx.push({ kind: 'boom', x: e.x, y: e.y, t: G.t, big: 2 }); if (e.def.cost) { const still = G.ents.some(b => b !== e && !b.dead && b.type === 'building' && b.owner === e.owner && b.defId === e.defId); if (!still) G.players[e.owner].built.delete(e.defId); } }
    if (e.type === 'vehicle') {
      G.wrecks = G.wrecks || [];
      const w = { defId: e.defId, art: e.def.art, x: e.x, y: e.y, heading: e.heading, turret: e.turret, t: G.t, side: G.players[e.owner].side };
      G.wrecks.push(w);
      const L = e.def.length * .5, c = Math.cos(e.heading), s = Math.sin(e.heading);
      G.map.addCover('wreck', e.x - c * L, e.y - s * L, e.x + c * L, e.y + s * L, { cover: 'heavy', blocksV: true, hp: 600 });
      G.fx.push({ kind: 'boom', x: e.x, y: e.y, t: G.t, big: 1.5 });
    }
    G.byId.delete(e.id);
    popRecount(G);
  }

  return { DT, create, step, issue, spawnSquad, spawnVehicle, placeBuilding, canPlace, buildReqMissing, prodBlock, canAfford, pay, unitDef, hqOf,
    vetBonus, addXp, event, kill, crewSlot, crewReady, weaponOf, isPinned, updateTerritory, canCapture, nearReinforcePoint, popRecount, setPath, enemyOf, setup, teardown };
})();
if (typeof module !== 'undefined') module.exports = SIM;
