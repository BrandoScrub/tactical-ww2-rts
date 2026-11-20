/* Fog of war on 4 m cells. 2 = seen now, 1 = seen before. Sight is true line of sight: houses, cypress trees and the
   cores of olive groves block it, so what is behind them stays hidden (CoH3 "truesight"). */
const FOG = (() => {
  const C = 4;
  function update(G) {
    const m = G.map, gw = m.w / C, gh = m.h / C;
    for (const P of G.players) {
      const v = P.vis;
      for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
      for (const e of G.ents) {
        if (e.dead || e.owner !== P.slot) continue;
        let sight, eyes;
        if (e.type === 'building') { sight = e.built >= 1 ? 30 : 12; eyes = [e]; }
        else if (e.type === 'vehicle') { sight = e.def.sight; eyes = [e]; }
        else { sight = e.def.sight; const al = e.models.filter(q => q.alive); eyes = al.length ? [al[0], al[al.length - 1]] : []; }
        // high ground sees further: +1.5 m of sight per metre above the valley floor, up to +9 m
        for (const s of eyes) reveal(G, v, s.x, s.y, sight + Math.min(9, MAP.hAt(G.map, s.x, s.y) * 1.5), gw, gh);
      }
    }
  }
  function reveal(G, v, x, y, r, gw, gh) {
    const m = G.map, cx0 = Math.max(0, Math.floor((x - r) / C)), cx1 = Math.min(gw - 1, Math.floor((x + r) / C));
    const cy0 = Math.max(0, Math.floor((y - r) / C)), cy1 = Math.min(gh - 1, Math.floor((y + r) / C));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cy * gw + cx; if (v[k] === 2) continue;
      const px = cx * C + C / 2, py = cy * C + C / 2;
      if (U.dist2(px, py, x, y) > r * r) continue;
      if (U.dist2(px, py, x, y) < 64 || losOpen(m, x, y, px, py)) v[k] = 2;
    }
  }
  /* sight passes into the first blocking cell (you see the wall of a house) but not past it */
  function losOpen(m, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d);
    for (let i = 1; i < n - 2; i++) {
      const x = (ax + (bx - ax) * i / n) | 0, y = (ay + (by - ay) * i / n) | 0;
      if (m.block[y * m.w + x] & 4) return false;
    }
    return !MAP.smokeBlocks(m, ax, ay, bx, by) && MAP.terrainClear(m, ax, ay, bx, by, 1.7, .3);
  }
  function seen(G, slot, x, y) {
    const P = G.players[slot], gw = G.map.w / C;
    const cx = U.clamp((x / C) | 0, 0, gw - 1), cy = U.clamp((y / C) | 0, 0, G.map.h / C - 1);
    return P.vis[cy * gw + cx] === 2;
  }
  function explored(G, slot, x, y) {
    const P = G.players[slot], gw = G.map.w / C;
    return P.vis[U.clamp((y / C) | 0, 0, G.map.h / C - 1) * gw + U.clamp((x / C) | 0, 0, gw - 1)] > 0;
  }
  /* can `slot` see entity e? snipers hidden in cover need someone within 10 m */
  function visible(G, slot, e) {
    if (e.owner === slot) return true;
    if (e.type === 'building') return explored(G, slot, e.x, e.y);
    if (e.type === 'squad') {
      if (e.camo) { for (const o of G.ents) if (!o.dead && o.owner === slot && o.type !== 'building' && U.dist2(o.x, o.y, e.x, e.y) < 100) return true; return false; }
      for (const m of e.models) if (m.alive && seen(G, slot, m.x, m.y)) return true;
      return false;
    }
    return seen(G, slot, e.x, e.y);
  }
  /* What the screen shows. view.slot is whose fog is drawn (0 normally; either side when watching the AI) and
     view.all shows everything (no fog). Only drawing and picking use these; the game rules use visible/seen. */
  const view = { slot: 0, all: false };
  const shown = (G, e) => view.all || visible(G, view.slot, e);
  const shownAt = (G, x, y, owner) => view.all || owner === view.slot || explored(G, view.slot, x, y);
  const shownNow = (G, x, y) => view.all || seen(G, view.slot, x, y);
  return { update, seen, explored, visible, view, shown, shownAt, shownNow, C };
})();
if (typeof module !== 'undefined') module.exports = FOG;
