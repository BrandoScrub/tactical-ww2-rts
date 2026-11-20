"""Assemble the browser game into one folder that any static host (or a claude.ai artifact) can serve.

    python3 tools/build_web.py <out>          # default: dist/

Layout of <out>: index.html, src/*.js (the game), lib/*.js (the pinned artkit runtime), art/ (assets.json,
crew_layout.json and the sprite pages). During development open game/index.html from the repository root instead;
it loads the same files from ../art and ../artkit/runtime.
"""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(out):
    out = os.path.abspath(out)
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'src'))
    os.makedirs(os.path.join(out, 'lib'))
    os.makedirs(os.path.join(out, 'art', 'pack'))
    shutil.copytree(os.path.join(ROOT, 'art', 'ground'), os.path.join(out, 'art', 'ground'))
    shutil.copytree(os.path.join(ROOT, 'art', 'materials'), os.path.join(out, 'art', 'materials'))
    html = open(os.path.join(ROOT, 'game', 'index.html')).read()
    html = html.replace('../artkit/runtime/', 'lib/')
    html = html.replace('<canvas id="view"></canvas>', '<script>window.ART_BASE = "art/";</script>\n<canvas id="view"></canvas>')
    open(os.path.join(out, 'index.html'), 'w').write(html)
    for f in sorted(os.listdir(os.path.join(ROOT, 'game', 'src'))):
        if f.endswith('.js'):
            shutil.copy(os.path.join(ROOT, 'game', 'src', f), os.path.join(out, 'src', f))
    for f in ('glcanvas.js', 'units.js', 'artkit.js'):
        shutil.copy(os.path.join(ROOT, 'artkit', 'runtime', f), os.path.join(out, 'lib', f))
    assets = json.load(open(os.path.join(ROOT, 'art', 'assets.json')))
    pages = set()
    for a in assets.values():
        for p in a.get('pack', []) + a.get('team_pack', []):
            pages.add(p)
    for p in sorted(pages):
        shutil.copy(os.path.join(ROOT, 'art', p), os.path.join(out, 'art', p))
    for f in ('assets.json', 'crew_layout.json'):
        shutil.copy(os.path.join(ROOT, 'art', f), os.path.join(out, 'art', f))
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
    n = sum(len(fs) for _, _, fs in os.walk(out))
    print(f'{out}: {n} files, {size / 1048576:.1f} MiB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist'))
