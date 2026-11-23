"""Map editor check, PC (mouse) and phone (touch): opens from the main menu showing the default map, Check finds it
playable and balanced, tools place a house, a road (tap points, Done) and a field, Select picks and drags a house,
Erase removes it, Undo brings it back, a sketch stroke and a note go on the notes layer, Files gives the JSON, and
Play > Watch AI starts a match on the edited map. Prints 'editor ok' when every step holds; screenshots in /tmp/shots."""
import asyncio, os, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/game/index.html'
SHOTS = '/tmp/shots'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


async def run(p, name, ctx_args):
    os.makedirs(SHOTS, exist_ok=True)
    b = await p.chromium.launch(channel='chrome', args=ARGS)
    ctx = await b.new_context(**ctx_args)
    pg = await ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    bad = []
    def check(ok, what):
        if not ok: bad.append(what)
    touch = ctx_args.get('has_touch')
    async def tap(x, y):
        if touch: await pg.touchscreen.tap(x, y)
        else: await pg.mouse.click(x, y)
        await pg.wait_for_timeout(60)
    async def at(wx, wy):
        return await pg.evaluate(f'() => EDITOR.toScreen({wx}, {wy})')
    async def tool(t): await pg.click(f'#ed-tools [data-tool="{t}"]')
    count = lambda k: pg.evaluate(f'() => EDITOR._state().def.{k}.length')

    await pg.goto(URL)
    await pg.evaluate("() => { try { localStorage.removeItem('tw2-editor-map'); } catch (e) {} }")
    await pg.wait_for_function("!document.querySelector('#mm-editor').disabled", timeout=240000)
    await pg.click('#mm-editor')
    await pg.wait_for_timeout(400)
    check(await pg.evaluate("() => !document.querySelector('#editor').classList.contains('hide') && EDITOR.isOpen()"), 'editor opens')
    check(await count('houses') == 16, 'editor starts from the default map')
    await pg.screenshot(path=f'{SHOTS}/ed-{name}-0.png')
    await pg.click('#ed-check'); await pg.wait_for_timeout(300)
    out = await pg.inner_text('#ed-out')
    check('Playable' in out and 'balanced' in out, f'check: default map playable and balanced ({out[:120]!r})')
    await pg.screenshot(path=f'{SHOTS}/ed-{name}-1-check.png')
    await pg.click('#ed-check')
    # start blank so taps land on open ground
    await pg.click('#ed-files'); await pg.click('#ed-xnew'); await pg.click('#ed-files')
    check(await count('houses') == 0 and await count('bases') == 2, 'blank map has only the bases')
    h0 = await count('houses')
    await tool('house'); x, y = await at(100, 100); await tap(x, y)
    check(await count('houses') == h0 + 1, 'house placed')
    await tool('road')
    for wx, wy in ((60, 100), (80, 120), (100, 140)):
        x, y = await at(wx, wy); await tap(x, y)
    await pg.click('#ed-props button.go')
    check(await count('roads') == 1 and await pg.evaluate('() => EDITOR._state().def.roads[0].pts.length') == 3, 'road drawn from three taps')
    await tool('field')
    for wx, wy in ((120, 60), (140, 60), (140, 80), (120, 80)):
        x, y = await at(wx, wy); await tap(x, y)
    await pg.click('#ed-props button.go')
    check(await count('fields') == 1, 'field drawn')
    # select the house and drag it 10 m along x
    await tool('select'); x, y = await at(100, 100); await tap(x, y)
    check(await pg.evaluate("() => (EDITOR._state().sel || {}).list") == 'houses', 'tap selects the house')
    x2, y2 = await at(110, 100)
    if touch:
        cdp = await ctx.new_cdp_session(pg)
        async def tp(kind, px, py): await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': px, 'y': py}]})
        await tp('touchStart', x, y)
        for i in range(1, 9): await tp('touchMove', x + (x2 - x) * i / 8, y + (y2 - y) * i / 8)
        await tp('touchEnd', x2, y2)
    else:
        await pg.mouse.move(x, y); await pg.mouse.down()
        for i in range(1, 9): await pg.mouse.move(x + (x2 - x) * i / 8, y + (y2 - y) * i / 8)
        await pg.mouse.up()
    hx = await pg.evaluate('() => EDITOR._state().def.houses[0].x')
    check(abs(hx - 110) < 1.5, f'house dragged to x 110 (is {hx})')
    await tool('erase'); x, y = await at(hx, 100); await tap(x, y)
    check(await count('houses') == 0, 'erase removes the house')
    await pg.click('#ed-undo')
    check(await count('houses') == 1, 'undo brings it back')
    # a sketch stroke and a note
    await tool('sketch'); x, y = await at(40, 60); x2, y2 = await at(70, 40)
    if touch:
        await tp('touchStart', x, y)
        for i in range(1, 9): await tp('touchMove', x + (x2 - x) * i / 8, y + (y2 - y) * i / 8)
        await tp('touchEnd', x2, y2)
    else:
        await pg.mouse.move(x, y); await pg.mouse.down()
        for i in range(1, 9): await pg.mouse.move(x + (x2 - x) * i / 8, y + (y2 - y) * i / 8)
        await pg.mouse.up()
    await tool('note'); x, y = await at(150, 150); await tap(x, y)
    check(await count('notes') == 2, 'sketch stroke and note added')
    await pg.screenshot(path=f'{SHOTS}/ed-{name}-2-edited.png')
    # files: the JSON round-trips
    await pg.click('#ed-files'); await pg.wait_for_timeout(200)
    js = await pg.input_value('#ed-json')
    check('"houses"' in js and '"notes"' in js, 'Files shows the map JSON')
    await pg.click('#ed-files')
    # play: back to the default map so the check passes, then Watch AI on it
    await pg.click('#ed-files'); await pg.click('#ed-out [data-map="valle"]'); await pg.click('#ed-files')
    await tool('house'); x, y = await at(100, 30); await tap(x, y)              # one edit, so it is not just the default
    await pg.click('#ed-play'); await pg.click('#ed-out [data-play="watch"]')
    await pg.wait_for_function('window.G && G.spectate', timeout=60000)
    check(await pg.evaluate('() => G.map.houses.length') == 17, 'Watch AI plays the edited map')
    await pg.evaluate("() => { HUD.ui.paused = true; }")
    await pg.screenshot(path=f'{SHOTS}/ed-{name}-3-play.png')
    print(name, 'errors' if errs else 'no page errors', errs[:3])
    await b.close()
    return bad + [f'page error: {e}' for e in errs]


async def main():
    async with async_playwright() as p:
        bad = await run(p, 'pc', {'viewport': {'width': 1400, 'height': 850}})
        bad += await run(p, 'phone', {'viewport': {'width': 844, 'height': 390}, 'has_touch': True, 'is_mobile': True})
    for b in bad: print('FAIL', b)
    print('editor ok' if not bad else f'{len(bad)} problems')
    sys.exit(1 if bad else 0)

asyncio.run(main())
