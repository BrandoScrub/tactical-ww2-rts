"""The one check before a merge. Runs everything, builds the game the way it is published, and plays it.

    python3 tools/ship.py            all checks; prints PASS or FAIL as its last line
    python3 tools/ship.py --quick    skips the long AI soak (for trying things out; a merge needs the full run)

PASS means: merge, then publish dist/ to the "Tactical WW2 RTS" artifact (see CLAUDE.md).

What it runs, in order (it stops at the first failure and says which):
  1. art engine pinned copy untouched      tools/update_artkit.py --verify
  2. every vehicle and crew weapon holds    tools/check.py                      TOTAL 0
     together, every map house has art     game/test/houses.js                 no problems
     queued orders, capture-point orders,  game/test/orders.js                 orders ok
     repairs, mortar and MG choices
     unit classes and squad-owned weapons  game/test/classes.js                no problems
     half-dug positions, AI anti-tank      game/test/positions.js              positions ok
  3. AI against AI, 8 matches of 18 min     game/test/soak.js 8 18              no problems
  4. the build                              tools/build_web.py dist             (fails if any art file is missing)
  5. the build in a browser, PC and phone   loads with no page errors and all its art, a skirmish starts as each side
  6. real input in the browser              game/test/flow.py de, game/test/mobile.py    no page errors
     Watch AI fog button and folding bar   game/test/spectate.py (PC and phone)          spectate ok
No local web server is needed: the browser is answered from the files on disk.
"""
import asyncio, mimetypes, os, runpy, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']


def run(name, cmd, ok=None, timeout=3600):
    t = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    out = (p.stdout + p.stderr).strip()
    good = p.returncode == 0 and (ok is None or ok in out)
    print(f'{"ok  " if good else "FAIL"} {name} ({time.time() - t:.0f}s)', flush=True)
    if not good: print('\n'.join('     ' + l for l in out.splitlines()[-25:]))
    return good


def serve(page, root):
    """Answer http://localhost:8765/... from files under root, so no web server is needed."""
    async def handler(route):
        path = route.request.url.split('localhost:8765/', 1)[1].split('?')[0].split('#')[0] or 'index.html'
        f = os.path.join(root, path)
        if os.path.isfile(f): await route.fulfill(path=f, content_type=mimetypes.guess_type(f)[0] or 'application/octet-stream')
        else: await route.fulfill(status=404, body='')
    return page.route('http://localhost:8765/**', handler)


def offline_playwright(root):
    """Make every Playwright page opened from here on answer localhost:8765 from disk, and fall back from the
    installed Chrome to Playwright's own Chromium when Chrome is not there (the repo's browser tests ask for Chrome)."""
    from playwright.async_api._generated import Browser, BrowserType
    new_page, new_context, launch = Browser.new_page, Browser.new_context, BrowserType.launch
    async def _new_page(self, *a, **k):
        pg = await new_page(self, *a, **k); await serve(pg, root); return pg
    async def _new_context(self, *a, **k):            # a context's own pages: route the whole context
        ctx = await new_context(self, *a, **k); await serve(ctx, root); return ctx
    async def _launch(self, *a, **k):
        try: return await launch(self, *a, **k)
        except Exception:
            k.pop('channel', None); return await launch(self, *a, **k)
    Browser.new_page, Browser.new_context, BrowserType.launch = _new_page, _new_context, _launch


async def play_build():
    """The published build: PC and phone sizes, all art loaded, a skirmish starts as each side, no page errors."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(args=CHROME_ARGS)
        problems = []
        for label, view, side in (('PC', {'width': 1400, 'height': 850}, '#start'), ('phone', {'width': 844, 'height': 390}, '#start2')):
            ctx = await b.new_context(viewport=view, has_touch=label == 'phone')
            pg = await ctx.new_page(); errs, missing = [], []
            pg.on('pageerror', lambda e, errs=errs: errs.append(str(e)))
            pg.on('response', lambda r, missing=missing: missing.append(r.url) if r.status == 404 else None)
            await serve(pg, DIST)
            await pg.goto('http://localhost:8765/index.html')
            await pg.wait_for_function("!document.querySelector('#start').disabled", timeout=240000)
            art = await pg.evaluate("""() => { const L = RENDER.lib || {}, k = Object.keys(L);
                return { units: k.filter(n => L[n] && L[n].m && L[n].m.kind !== 'static').length,
                         houses: k.filter(n => n.startsWith('farmhouse') || n.startsWith('cottage')).length } }""")
            await pg.click('#mm-skirmish'); await pg.click(side); await pg.wait_for_timeout(6000)
            started = await pg.evaluate("() => !!(RENDER.G && RENDER.G.t > 0)")
            if errs: problems.append(f'{label}: page errors {errs[:3]}')
            if missing: problems.append(f'{label}: missing files {missing[:5]}')
            if art['houses'] < 12: problems.append(f'{label}: farmhouse art not loaded ({art})')
            if not started: problems.append(f'{label}: the skirmish did not start')
            await ctx.close()
        await b.close()
        return problems


def browser_stage():
    t = time.time()
    try: problems = asyncio.run(play_build())
    except Exception as e: problems = [f'{type(e).__name__}: {e}']
    print(f'{"ok  " if not problems else "FAIL"} the build in a browser, PC and phone ({time.time() - t:.0f}s)', flush=True)
    for x in problems: print('     ' + x)
    return not problems


def input_stage():
    """The repo's real-input browser tests, each in its own process, answered from the repository folder."""
    good = True
    for script, args, ok in (('game/test/flow.py', ['de'], 'no page errors'), ('game/test/mobile.py', [], 'no page errors'),
                             ('game/test/spectate.py', [], 'spectate ok')):
        good &= run(f'{script} {" ".join(args)}'.strip(), [sys.executable, __file__, '--offline', script] + args, ok=ok, timeout=900)
    return good


def main(args):
    quick = '--quick' in args
    t = time.time()
    steps = [
        lambda: run('art engine untouched', [sys.executable, 'tools/update_artkit.py', '--verify']),
        lambda: run('vehicles and crew weapons hold together', [sys.executable, 'tools/check.py'], ok='TOTAL 0'),
        lambda: run('every map house has art', ['node', 'game/test/houses.js'], ok='no problems'),
        lambda: run('orders, repairs, mortar and MG choices', ['node', 'game/test/orders.js'], ok='orders ok'),
        lambda: run('unit classes and squad weapons', ['node', 'game/test/classes.js'], ok='no problems'),
        lambda: run('positions can be finished, AI answers armour', ['node', 'game/test/positions.js'], ok='positions ok'),
    ]
    if not quick: steps.append(lambda: run('AI against AI, 8 matches', ['node', 'game/test/soak.js', '8', '18'], ok='no problems'))
    steps += [
        lambda: run('build', [sys.executable, 'tools/build_web.py', DIST]),
        browser_stage,
        input_stage,
    ]
    for s in steps:
        if not s():
            print(f'FAIL ({time.time() - t:.0f}s): fix the step above and run tools/ship.py again'); return 1
    print(f'{"PASS (quick: not for merging)" if quick else "PASS"} ({time.time() - t:.0f}s): merge, then publish dist/ to the game artifact')
    return 0


if __name__ == '__main__':
    if sys.argv[1:2] == ['--offline']:                     # run one of the repo's browser tests without a web server
        offline_playwright(ROOT)
        sys.argv = sys.argv[2:]
        runpy.run_path(sys.argv[0], run_name='__main__')
    else:
        sys.exit(main(sys.argv[1:]))
