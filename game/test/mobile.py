"""Phone check: landscape iPhone viewport with touch. Taps select and order, drag pans, pinch zooms, long-press attack-moves."""
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/game/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        cdp = await ctx.new_cdp_session(pg)
        async def touch(kind, pts):
            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
        async def tap(x, y): await touch('touchStart', [(x, y)]); await pg.wait_for_timeout(60); await touch('touchEnd', [])
        await pg.goto(URL)
        await pg.wait_for_function("!document.querySelector('#start').disabled", timeout=120000)
        await pg.screenshot(path='/tmp/shots/m0-menu.png')
        await pg.tap('#mm-skirmish'); await pg.wait_for_timeout(200); await pg.screenshot(path='/tmp/shots/m0b-skirmish.png'); await pg.tap('#start'); await pg.wait_for_timeout(800)
        await pg.evaluate("() => { HUD.ui.paused = true; }")
        print('mobile class', await pg.evaluate("document.body.className"), await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--s')"))
        await pg.screenshot(path='/tmp/shots/m1-start.png')
        # tap empty ground with the engineers selected -> they move
        sel = await pg.evaluate("() => [...HUD.ui.selected]")
        await tap(600, 150); await pg.wait_for_timeout(300)
        print('after ground tap: order', await pg.evaluate("(ids) => ids.map(id => G.byId.get(id).order.type)", sel))
        # clear, then tap on the engineers to select them
        await pg.evaluate("() => { HUD.ui.selected.clear(); }")
        await pg.wait_for_timeout(200)
        pos = await pg.evaluate("() => { const s = G.ents.find(e => e.type === 'squad' && e.owner === 0); const m = s.models.find(q => q.alive); return RENDER.toScreen(m.x, m.y, .8); }")
        await tap(pos[0], pos[1]); await pg.wait_for_timeout(300)
        print('selected after tap on unit', await pg.evaluate("() => [...HUD.ui.selected].map(id => G.byId.get(id).defId)"))
        # drag pans
        c0 = await pg.evaluate("() => [RENDER.cam.x, RENDER.cam.y]")
        await touch('touchStart', [(500, 200)])
        for i in range(1, 8): await touch('touchMove', [(500 - i * 25, 200 - i * 8)]); await pg.wait_for_timeout(16)
        await touch('touchEnd', [])
        c1 = await pg.evaluate("() => [RENDER.cam.x, RENDER.cam.y]")
        print('pan moved camera', [round(a - b, 1) for a, b in zip(c1, c0)], 'selection kept', await pg.evaluate("() => HUD.ui.selected.size"))
        # pinch zooms
        k0 = await pg.evaluate("() => RENDER.cam.k")
        await touch('touchStart', [(400, 200), (460, 200)])
        for i in range(1, 8): await touch('touchMove', [(400 - i * 12, 200), (460 + i * 12, 200)]); await pg.wait_for_timeout(16)
        await touch('touchEnd', [])
        print('pinch zoom', round(k0, 2), '->', await pg.evaluate("() => +RENDER.cam.k.toFixed(2)"))
        # long-press: attack-move
        await touch('touchStart', [(560, 140)]); await pg.wait_for_timeout(700); await touch('touchEnd', [])
        print('after long-press', await pg.evaluate("() => [...HUD.ui.selected].map(id => G.byId.get(id).order.type)"))
        # command card button by tap (construct page), tooltip by long-press
        await pg.tap('.card .slot:nth-child(12)'); await pg.wait_for_timeout(300)
        print('page after Construct tap', await pg.evaluate("() => HUD.ui.page"))
        await pg.screenshot(path='/tmp/shots/m2-build.png')
        # place a Barracks by touch from the HQ card (base buildings are ordered from the HQ): tap its button, drag the
        # outline to open ground, lift
        await pg.evaluate("() => { HUD.ui.page = 'main'; HUD.ui.selected = new Set([SIM.hqOf(G, 0).id]); }"); await pg.wait_for_timeout(300)
        await pg.tap('.card .slot:nth-child(9)'); await pg.wait_for_timeout(300)
        print('mode after Barracks tap', await pg.evaluate("() => HUD.ui.mode && HUD.ui.mode.type"))
        spot = await pg.evaluate("""() => { const hq = SIM.hqOf(G, 0); RENDER.cam.x = hq.x + 10; RENDER.cam.y = hq.y - 10;
          for (let r = 16; r < 34; r += 2) for (let a = 0; a < 24; a++) { const x = hq.x + Math.cos(a / 24 * U.TAU) * r, y = hq.y + Math.sin(a / 24 * U.TAU) * r; if (!SIM.canPlace(G, 0, 'us_barracks', x, y)) { const s = RENDER.toScreen(x, y); if (s[0] > 300 && s[0] < 600 && s[1] > 80 && s[1] < 230) return s; } } return null; }""")
        print('target spot', spot)
        await pg.wait_for_timeout(200)
        await touch('touchStart', [(422, 164)])
        for i in range(1, 9): await touch('touchMove', [(422 + (spot[0] - 422) * i / 8, 164 + (spot[1] - 164) * i / 8)]); await pg.wait_for_timeout(16)
        await pg.screenshot(path='/tmp/shots/m2b-ghost.png')
        await touch('touchEnd', []); await pg.wait_for_timeout(300)
        print('after drag-place', await pg.evaluate("() => G.ents.filter(e => e.owner === 0 && e.type === 'building').map(b => b.defId + ':' + b.built.toFixed(2))"), 'mode', await pg.evaluate("() => HUD.ui.mode"))
        # and a plain tap on a bad spot (on the HQ) explains itself
        await pg.evaluate("() => { for (const b of G.ents.filter(e => e.type === 'building' && e.owner === 0 && !e.def.retreat)) SIM.kill(G, b); HUD.ui.selected = new Set([SIM.hqOf(G, 0).id]); HUD.ui.page = 'main'; G.players[0].res = { mp: 900, mu: 100, fu: 200 }; }")
        await pg.wait_for_timeout(400)
        await pg.tap('.card .slot:nth-child(9)'); await pg.wait_for_timeout(200)
        hq = await pg.evaluate("() => { const h = SIM.hqOf(G, 0); RENDER.cam.x = h.x; RENDER.cam.y = h.y; RENDER.cam.k = 1; return RENDER.toScreen(h.x, h.y); }")
        await tap(hq[0], hq[1]); await pg.wait_for_timeout(200)
        print('bad-spot banner:', await pg.evaluate("() => document.querySelector('.banner').textContent"), '| still placing:', await pg.evaluate("() => HUD.ui.mode && HUD.ui.mode.type"))
        await pg.evaluate("() => { HUD.ui.mode = null; HUD.ui.page = 'main'; }")
        # minimap tap moves the camera
        box = await pg.locator('.mmframe canvas').bounding_box()
        await tap(box['x'] + box['width'] * .8, box['y'] + box['height'] * .5); await pg.wait_for_timeout(200)
        print('cam after minimap tap', await pg.evaluate("() => [RENDER.cam.x|0, RENDER.cam.y|0]"))
        # portrait prompt
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        print('portrait class', await pg.evaluate("document.body.className"))
        await pg.screenshot(path='/tmp/shots/m3-portrait.png')
        await pg.set_viewport_size({'width': 844, 'height': 390}); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { HUD.ui.paused = false; for (let i = 0; i < 20 * 150; i++) { AI.step(G, 1); AI.step(G, 0); SIM.step(G, SIM.DT); } const e = G.ents.filter(e => e.owner === 0 && e.type === 'squad' && !e.dead).pop(); if (e) { RENDER.cam.x = e.x; RENDER.cam.y = e.y; HUD.ui.selected = new Set([e.id]); } }")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path='/tmp/shots/m4-play.png')
        print(errs or 'no page errors')
        await b.close()
asyncio.run(main())
