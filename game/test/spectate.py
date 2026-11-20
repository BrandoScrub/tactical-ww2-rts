"""Watch AI check, PC and phone: the fog button cycles off -> US view -> DE view -> off, each showing the right units,
and the - button folds the speed bar down to the speed in use (tapping it then steps through the speeds).
Prints 'spectate ok' when every step holds."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/game/index.html'
SHOTS = '/tmp/shots'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


async def run(p, name, ctx_args):
    b = await p.chromium.launch(channel='chrome', args=ARGS)
    ctx = await b.new_context(**ctx_args)
    pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    bad = []
    def check(ok, what):
        if not ok: bad.append(what)
    await pg.goto(URL)
    await pg.wait_for_function("!document.querySelector('#mm-watch').disabled", timeout=120000)
    await pg.evaluate("() => { try { localStorage.removeItem('ww2rts.specMin'); } catch (e) {} }")
    await pg.click('#mm-watch')
    await pg.wait_for_function("window.G && G.spectate && document.querySelector('.specbar .fogb')", timeout=60000)
    # let both armies spread out a little, then hold still
    await pg.evaluate("() => { for (let i = 0; i < 90 / SIM.DT; i++) { AI.step(G, 1); AI.step(G, 0); SIM.step(G, SIM.DT); } }")
    await pg.evaluate("() => { HUD.ui.paused = true; }")
    count = """() => { const r = [0, 1].map(s => G.ents.filter(e => !e.dead && e.owner === s && e.type !== 'building'));
                       return { all: r.map(a => a.length), shown: r.map(a => a.filter(e => FOG.shown(G, e)).length),
                                label: document.querySelector('.specbar .fogb').textContent }; }"""
    async def state():
        await pg.wait_for_timeout(250); return await pg.evaluate(count)
    s = await state(); print(name, 'start', s)
    check(s['label'] == 'Fog off' and s['shown'] == s['all'], 'fog off at start shows every unit')
    await pg.screenshot(path=f'{SHOTS}/spec-{name}-0-off.png')
    await pg.click('.specbar .fogb'); s = await state(); print(name, 'click 1', s)
    check(s['label'] == 'Fog: US' and s['shown'][0] == s['all'][0] and s['shown'][1] < s['all'][1], 'US view hides unseen Germans')
    await pg.screenshot(path=f'{SHOTS}/spec-{name}-1-us.png')
    await pg.click('.specbar .fogb'); s = await state(); print(name, 'click 2', s)
    check(s['label'] == 'Fog: DE' and s['shown'][1] == s['all'][1] and s['shown'][0] < s['all'][0], 'DE view hides unseen Americans')
    await pg.screenshot(path=f'{SHOTS}/spec-{name}-2-de.png')
    await pg.click('.specbar .fogb'); s = await state(); print(name, 'click 3', s)
    check(s['label'] == 'Fog off' and s['shown'] == s['all'], 'third click turns fog off again')
    # fold the bar
    await pg.click('.specbar .minb'); await pg.wait_for_timeout(250)
    vis = await pg.evaluate("""() => [...document.querySelectorAll('.specbar > *, .specbar .spd button')]
        .filter(n => n.offsetParent && getComputedStyle(n).display !== 'none' && n.tagName === 'BUTTON').map(n => n.textContent)""")
    w = await pg.evaluate("() => document.querySelector('.specbar').getBoundingClientRect().width")
    print(name, 'folded buttons', vis, 'width', round(w))
    check(len(vis) == 2 and vis[0].endswith('x') and vis[1] == '+', 'folded bar shows only the speed and +')
    await pg.screenshot(path=f'{SHOTS}/spec-{name}-3-folded.png')
    sp0 = await pg.evaluate("() => MAIN.speed()")
    await pg.click('.specbar .spd button.on'); await pg.wait_for_timeout(250)
    sp1 = await pg.evaluate("() => MAIN.speed()")
    print(name, 'speed step', sp0, '->', sp1)
    check(sp1 != sp0, 'folded speed button steps the speed')
    stored = await pg.evaluate("() => localStorage.getItem('ww2rts.specMin')")
    check(stored == '1', 'folded state remembered')
    await pg.click('.specbar .minb'); await pg.wait_for_timeout(250)
    n = await pg.evaluate("() => [...document.querySelectorAll('.specbar .spd button')].filter(b => getComputedStyle(b).display !== 'none').length")
    check(n == 4, 'unfolded bar shows all four speeds')
    check(not errs, 'no page errors: ' + '; '.join(errs[:3]))
    await b.close()
    return bad


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        bad = await run(p, 'pc', {'viewport': {'width': 1600, 'height': 900}})
        bad += await run(p, 'phone', {'viewport': {'width': 844, 'height': 390}, 'device_scale_factor': 2, 'is_mobile': True, 'has_touch': True})
    print('spectate ok' if not bad else 'PROBLEMS: ' + ' | '.join(bad))
asyncio.run(main())
