"""Play the opening through real input: each side orders its first base building from the HQ card (bottom-left slot, Z),
it builds itself; then infantry is queued from it."""
import sys, asyncio
from playwright.async_api import async_playwright
SIDE = sys.argv[1] if len(sys.argv) > 1 else 'de'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await b.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e) + ' @ ' + (e.stack or '').split(chr(10))[1:3].__str__()))
        await pg.goto('http://localhost:8765/game/index.html')
        await pg.wait_for_function("!document.querySelector('#start').disabled", timeout=120000)
        await pg.click('#mm-skirmish'); await pg.click('#start' if SIDE == 'us' else '#start2'); await pg.wait_for_timeout(600)
        await pg.mouse.move(800, 400)
        # where to put the building: a free spot behind the HQ, in screen coordinates
        spot = await pg.evaluate("""(side) => { const hq = SIM.hqOf(G, 0), id = G.players[0].F.buildings[0];
           RENDER.cam.x = hq.x + 8; RENDER.cam.y = hq.y - 8;
           for (let r = 18; r < 40; r += 3) for (let a = 0; a < 24; a++) { const x = hq.x + Math.cos(a / 24 * U.TAU) * r, y = hq.y + Math.sin(a / 24 * U.TAU) * r; if (!SIM.canPlace(G, 0, id, x, y)) return { x, y }; } return null; }""", SIDE)
        await pg.wait_for_timeout(300)
        sp = await pg.evaluate("(p) => RENDER.toScreen(p.x, p.y)", spot)
        hq = await pg.evaluate("() => { const h = SIM.hqOf(G, 0); return RENDER.toScreen(h.x, h.y, 1); }")
        await pg.mouse.click(hq[0], hq[1]); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/shots/flow-hq.png')
        await pg.keyboard.press('z')                          # bottom-left slot: the first base building
        await pg.mouse.move(sp[0], sp[1]); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/shots/flow-ghost.png')
        await pg.mouse.click(sp[0], sp[1]); await pg.wait_for_timeout(300)
        st = await pg.evaluate("() => G.ents.filter(e => e.owner === 0).map(e => e.defId + (e.type === 'building' ? ':' + e.built.toFixed(2) : ':' + e.order.type))")
        print('after placing', st)
        await pg.evaluate("() => { for (let i = 0; i < 20 * 25; i++) { AI.step(G, 1); SIM.step(G, SIM.DT); } }")
        st = await pg.evaluate("() => G.ents.filter(e => e.owner === 0).map(e => e.defId + (e.type === 'building' ? ':' + e.built.toFixed(2) : ':' + e.order.type))")
        print('25 s later', st)
        # select the new building through its production tab and queue the first unit with Q
        await pg.evaluate("() => { const b = G.ents.find(e => e.type === 'building' && e.owner === 0 && !e.def.retreat); HUD.ui.selected = new Set([b.id]); G.players[0].res.mp = 800; }")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press('q'); await pg.keyboard.press('q')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path='/tmp/shots/flow-queue.png')
        print('queue', await pg.evaluate("() => G.ents.filter(e => e.type === 'building' && e.owner === 0).map(b => b.defId + ' [' + b.queue.map(q => q.unit).join(',') + ']')"))
        print(errs or 'no page errors')
        await b.close()
asyncio.run(main())
