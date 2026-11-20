/* Boot, menus and the main loop. The simulation runs at a fixed 20 steps a second; drawing runs every frame.
   Start-up loads everything before the main menu appears: all unit art (decoded to bitmaps), the battlefield
   (map, ground texture, sectors) and every sprite page uploaded to the GPU, so a match starts at once and nothing
   loads in the middle of a fight. The main menu draws that battlefield behind it with a slow camera drift. */
const MAIN = (() => {
  const ART = (window.ART_BASE || '../art/');
  let G = null, BG = null, lib = {}, layout = null, assets = null, inMenu = true, last = 0, acc = 0, hudT = 0, mmT = 0, fogT = -1, fogSlot = 0, speed = 1, side = 'us';
  let screen = 'boot', back = 'main', ready = false, mode = 'skirmish';
  const $ = s => document.querySelector(s);
  const CINE = { selected: new Set(), hover: null, noFog: true, cinematic: true };

  /* ---------------- settings (kept in this browser) ---------------- */
  const QUALITY = { high: { shadows: true, corpses: true }, balanced: { shadows: true, corpses: false }, low: { shadows: false, corpses: false } };
  const set = { ctl: 'auto', quality: 'high', fps: false, speed: 1 };
  try { Object.assign(set, JSON.parse(localStorage.getItem('tw2-settings') || '{}')); const c = localStorage.getItem('tw2-ctl'); if (c && !localStorage.getItem('tw2-settings')) set.ctl = c; } catch (e) {}
  const save = () => { try { localStorage.setItem('tw2-settings', JSON.stringify(set)); } catch (e) {} };
  function applySettings() {
    Object.assign(RENDER.opt, QUALITY[set.quality] || QUALITY.high);
    speed = +set.speed || 1;
    $('#fps').classList.toggle('hide', !set.fps);
    applyLayout();
  }

  /* ---------------- screens ---------------- */
  function show(name) {
    screen = name;
    for (const id of ['boot', 'mainmenu', 'skirmish', 'howto', 'settings', 'deploy', 'pausemenu', 'end']) $('#' + id).classList.toggle('hide', id !== (name === 'main' ? 'mainmenu' : name));
    inMenu = name !== 'game';
    document.body.classList.toggle('menus', !G || name === 'main' || name === 'skirmish' || name === 'howto' || (name === 'settings' && back !== 'pausemenu'));
  }
  function menu(open) { if (!G) return; show(open ? 'pausemenu' : 'game'); }

  /* ---------------- boot: load everything up front ---------------- */
  function bar(f, text) { $('#bootbar i').style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%'; if (text) $('#bootstatus').textContent = text; }
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  async function boot() {
    try {
      bar(.02, 'Loading unit list…');
      [assets, layout] = await Promise.all([fetch(ART + 'assets.json').then(r => r.json()), fetch(ART + 'crew_layout.json').then(r => r.json())]);
      const keys = Object.keys(assets); let done = 0;
      bar(.04, `Loading unit art 0 / ${keys.length}`);
      await new Promise(res => {
        for (const k of keys) ArtKit.load(ART, { [k]: assets[k] }, lib, () => { done++; bar(.04 + .66 * done / keys.length, `Loading unit art ${done} / ${keys.length}`); if (done === keys.length) res(); });
      });
      bar(.70, 'Loading buildings…');      // map buildings (tools/build_scenery.py); without them the drawn stand-ins show
      const scenery = await fetch(ART + 'scenery.json').then(r => r.ok ? r.json() : {}, () => ({}));
      await new Promise(res => { if (!Object.keys(scenery).length) res(); else ArtKit.load(ART, scenery, lib, () => res()); });
      // base buildings (tools/build_bases.py), as base_<key>; their flags take the players' colours
      const bases = await fetch(ART + 'bases.json').then(r => r.ok ? r.json() : {}, () => ({}));
      const bkeys = {}; for (const k in bases) bkeys['base_' + k] = bases[k];
      await new Promise(res => { if (!Object.keys(bkeys).length) res(); else ArtKit.load(ART, bkeys, lib, () => res()); });
      const bl = {}; for (const k in bkeys) if (lib[k]) bl[k] = lib[k];
      ArtKit.teams(bl, [[74, 163, 255], [255, 90, 74]]);
      bar(.71, 'Loading ground textures…'); await Promise.all([RENDER.loadGround(ART + 'ground/'), RENDER.loadMats(ART + 'materials/'), RENDER.loadProps(ART)]);
      bar(.72, 'Building the battlefield…'); await frame();
      BG = SIM.create({ seed: 7, playerSide: 'us', crewLayout: layout });
      RENDER.init($('#view'), lib, BG); resize();
      bar(.78, 'Preparing textures…'); await frame();
      const list = RENDER.warmList(lib); let i = 0;
      while (i < list.length) { i = RENDER.warmStep(list, i, 48 * 1048576); bar(.78 + .21 * i / list.length, `Preparing textures ${i} / ${list.length}`); await frame(); }
      bar(1, 'Ready');
      ready = true;
      $('#rendinfo').textContent = RENDER.isGL() ? 'Renderer: WebGL 2 (GPU batched)' : 'Renderer: 2D canvas (WebGL 2 unavailable; lower settings help)';
      document.querySelectorAll('[data-needs-ready]').forEach(b => { b.disabled = false; });
      show('main');
      RENDER.cam.k = .62; RENDER.cam.x = 70; RENDER.cam.y = 150;
    } catch (err) { bar(0, 'Could not load the game: ' + err.message); console.error(err); }
  }

  /* ---------------- a match ---------------- */
  /* mode: 'skirmish' (1v1 against the AI), 'sandbox' (the same with 10,000 of everything, for testing)
     or 'spectate' (AI against AI, no orders; fog off to start, the bar under the score turns it on for either side) */
  function start(s, m) {
    if (!ready) return;
    side = s || side; mode = m || mode;
    const spec = mode === 'spectate';
    show('deploy'); $('#deploy p').textContent = spec ? 'AI against AI · Farm valley, Italy 1944' : (side === 'us' ? 'US Forces' : 'Wehrmacht') + (mode === 'sandbox' ? ' · Sandbox' : '') + ' · Farm valley, Italy 1944';
    speed = +set.speed || 1;
    setTimeout(() => {   // one frame for the overlay to show
      G = SIM.create({ seed: 7, playerSide: side, crewLayout: layout, mode });
      document.body.classList.toggle('spectate', spec);
      window.G = G; acc = 0; fogT = -1;
      const canvas = $('#view');
      RENDER.init(canvas, lib, G);
      HUD.init(G, canvas);
      HUD.ui.selected = spec ? new Set() : new Set(G.ents.filter(e => e.owner === 0 && e.type === 'squad').map(e => e.id));
      HUD.ui.paused = false; HUD.ui.noFog = spec; HUD.ui.fogSide = 0; HUD.ui.mode = null;
      resize();
      applyLayout.zoomed = false; applyLayout();
      show('game');
      if (spec) { RENDER.cam.x = G.map.w / 2; RENDER.cam.y = G.map.h / 2; HUD.flash('Watching the AI. Speed and fog are under the score; − folds that bar. Space pauses.'); }
      else if (mode === 'sandbox') HUD.flash('Sandbox: 10,000 manpower, munitions and fuel to test with.');
      else HUD.flash(side === 'us' ? 'US Forces: take the victory points. Order base buildings from the HQ; they build themselves.' : 'Wehrmacht: take the victory points. Order base buildings from the HQ; they build themselves.');
    }, 30);
  }
  function toMain() {
    G = null; window.G = null; HUD.ui.paused = false; HUD.ui.noFog = false; HUD.ui.fogSide = 0; speed = +set.speed || 1;
    document.body.classList.remove('spectate');
    RENDER.init($('#view'), lib, BG);
    RENDER.cam.k = .62; RENDER.cam.x = 70; RENDER.cam.y = 150;
    show('main');
  }

  /* touch mode: chosen in settings, or automatic for coarse pointers and small screens */
  let rotOk = false;
  const isTouch = () => set.ctl === 'touch' || (set.ctl === 'auto' && ((matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(innerWidth, innerHeight) < 500));
  function applyLayout() {
    const m = isTouch(), b = document.body;
    b.classList.toggle('mobile', m);
    b.classList.toggle('portrait', m && innerHeight > innerWidth && !rotOk);
    const s = m ? Math.min(1, innerWidth / 1060, innerHeight / 640) : 1;
    document.documentElement.style.setProperty('--s', Math.max(.45, s).toFixed(3));
    if (m && RENDER.cam && G && !applyLayout.zoomed) { RENDER.cam.k = .8; applyLayout.zoomed = true; }
  }
  function resize() { const c = $('#view'); c.width = innerWidth; c.height = innerHeight; RENDER.resize(innerWidth, innerHeight, 1); applyLayout(); }
  addEventListener('resize', resize);

  /* ---------------- main loop ---------------- */
  let fpsN = 0, fpsT = 0, slow = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    fpsN++; fpsT += dt; if (fpsT >= .5) { if (set.fps) $('#fps').textContent = Math.round(fpsN / fpsT) + ' fps · ' + (RENDER.isGL() ? 'WebGL' : '2D'); fpsN = 0; fpsT = 0; }
    if (!G) {
      // menu backdrop: the battlefield, drifting; drawn at half rate to spare phones
      if (!BG || !ready || (slow ^= 1)) return;
      RENDER.cam.x += dt * 2 * 1.6; RENDER.cam.y -= dt * 2 * 1.6;
      if (RENDER.cam.x > 150) { RENDER.cam.x = 70; RENDER.cam.y = 150; }
      RENDER.frame(BG, CINE, 1);
      return;
    }
    if (!inMenu && !HUD.ui.paused && !G.over) {
      acc += dt * speed;
      let n = 0;
      while (acc >= SIM.DT && n++ < 8) { snap(G); AI.step(G, 1); if (G.spectate) AI.step(G, 0); SIM.step(G, SIM.DT); acc -= SIM.DT; }
      if (n > 8) acc = 0;
    }
    HUD.tick(dt);
    if ((HUD.ui.fogSide || 0) !== fogSlot) { fogSlot = HUD.ui.fogSide || 0; fogT = -1; }
    if (G.t !== fogT && ((G.t * 4) | 0) !== ((fogT * 4) | 0)) { RENDER.updateFogCanvas(G, fogSlot); fogT = G.t; }
    const a = inMenu || HUD.ui.paused || G.over ? 1 : Math.min(1, acc / SIM.DT);
    lerpIn(G, a); try { RENDER.frame(G, HUD.ui, a); } finally { lerpOut(G); }
    HUD.drawSelectBox();
    hudT -= dt; if (hudT <= 0) { HUD.update(); hudT = .1; }
    mmT -= dt; if (mmT <= 0) { HUD.drawMinimap(); mmT = .2; }
    if (G.over && !G.overShown) { G.overShown = true; showEnd(); }
  }
  /* Smooth drawing between simulation steps: remember where things were before each step, draw them partway
     from there to where they are now, then put the true values back so nothing outside drawing sees the blend. */
  const EK = ['x', 'y', 'heading', 'turret'], MK = ['x', 'y', 'heading'];
  function keep(o, keys) { const p = o.pv || (o.pv = [0, 0, 0, 0]); for (let i = 0; i < keys.length; i++) p[i] = o[keys[i]]; o.pvOk = true; }
  function snap(G) {
    for (const e of G.ents) {
      if (e.dead || e.type === 'building') continue;
      keep(e, EK);
      if (e.models) for (const m of e.models) keep(m, MK);
      if (e.crew) keep(e.crew, MK);
    }
  }
  const saved = [];   // objects whose drawn values were blended, restored after drawing
  function blend(o, keys, a) {
    const p = o.pv; if (!o.pvOk) return;
    if (Math.abs(o.x - p[0]) + Math.abs(o.y - p[1]) > 4) return;   // a jump (spawn, teleport): draw where it is
    const r = o.rv || (o.rv = [0, 0, 0, 0]);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], v = o[k]; r[i] = v;
      if (v == null || p[i] == null) continue;
      o[k] = i < 2 ? p[i] + (v - p[i]) * a : p[i] + U.angNorm(v - p[i]) * a;
    }
    saved.push(o, keys);
  }
  function lerpIn(G, a) {
    saved.length = 0;
    if (a >= 1) return;
    // positions and facings only: the clock stays put, so nothing is ever drawn at a time before it happened
    for (const e of G.ents) {
      if (e.dead || e.type === 'building') continue;
      blend(e, EK, a);
      if (e.models) for (const m of e.models) if (m.alive) blend(m, MK, a);
      if (e.crew) blend(e.crew, MK, a);
    }
  }
  function lerpOut(G) {
    for (let i = 0; i < saved.length; i += 2) { const o = saved[i], keys = saved[i + 1], r = o.rv; for (let j = 0; j < keys.length; j++) o[keys[j]] = r[j]; }
    saved.length = 0;
  }
  function showEnd() {
    const won = G.over.winner === 0, e = $('#end'), W = G.players[G.over.winner];
    e.querySelector('h2').textContent = G.spectate ? (W ? W.F.name + ' win' : 'Draw') : won ? 'Victory' : 'Defeat';
    e.querySelector('p').textContent = G.over.reason + ' at ' + U.fmtTime(G.t) + '.';
    show('end');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const on = (id, f) => $(id).addEventListener('click', f);
    const skirmish = m => { mode = m; $('#sk-mode').textContent = m === 'sandbox' ? 'Sandbox: you start with 10,000 manpower, munitions and fuel. The AI plays normally.' : ''; $('#sk-mode').style.display = m === 'sandbox' ? '' : 'none'; $('#skirmish h2').textContent = m === 'sandbox' ? 'Sandbox' : 'Skirmish'; show('skirmish'); };
    on('#mm-skirmish', () => skirmish('skirmish'));
    on('#mm-sandbox', () => skirmish('sandbox'));
    on('#mm-watch', () => start('us', 'spectate'));
    on('#mm-howto', () => show('howto'));
    on('#mm-settings', () => { back = 'main'; show('settings'); });
    on('#start', () => start('us', mode));
    on('#start2', () => start('de', mode));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => show(b.dataset.back === 'auto' ? back : b.dataset.back)));
    on('#resume', () => menu(false));
    on('#p-settings', () => { back = 'pausemenu'; show('settings'); });
    on('#quit', () => toMain());
    on('#again', () => toMain());
    on('#rematch', () => start(side, mode));
    // settings
    const bindSel = (id, key, cast) => { const el = $(id); el.value = String(set[key]); el.addEventListener('change', () => { set[key] = cast ? cast(el.value) : el.value; save(); applySettings(); }); };
    bindSel('#ctl', 'ctl'); bindSel('#quality', 'quality'); bindSel('#speed', 'speed', Number);
    $('#showfps').checked = !!set.fps; $('#showfps').addEventListener('change', ev => { set.fps = ev.target.checked; save(); applySettings(); });
    on('#rotok', () => { rotOk = true; applyLayout(); });
    applySettings();
    show('boot');
    last = performance.now(); requestAnimationFrame(loop);
    boot();
  });
  return { menu, inMenu: () => inMenu, start, screen: () => screen, speed: () => speed, setSpeed: x => { speed = x; } };
})();
