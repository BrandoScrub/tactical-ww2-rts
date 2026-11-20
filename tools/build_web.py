"""Assemble the browser game into one folder that any static host (or a claude.ai artifact) can serve.

    python3 tools/build_web.py <out>          # default: dist/

Layout of <out>: index.html, src/*.js (the game), lib/*.js (the pinned artkit runtime), art/ (assets.json,
crew_layout.json and the sprite pages). During development open game/index.html from the repository root instead;
it loads the same files from ../art and ../artkit/runtime.
"""
import json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _files(rec):
    """Every file a scenery or props record points at (src, shadow src, team masks, nested facings and stages)."""
    out = []
    if isinstance(rec, dict):
        for k, v in rec.items():
            if k in ('src', 'team') and isinstance(v, str) and '.' in v: out.append(v)
            else: out += _files(v)
    elif isinstance(rec, list):
        for v in rec: out += _files(v)
    return out


def main(out):
    out = os.path.abspath(out)
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(os.path.join(out, 'src'))
    os.makedirs(os.path.join(out, 'lib'))
    os.makedirs(os.path.join(out, 'art', 'pack'))
    # every art folder the game loads besides the unit pages: ground tiles, game-drawn materials, map buildings
    # (scenery: the farmhouses) and field-defence / terrain props. A folder missing here is art missing in the build.
    for d in ('ground', 'materials', 'scenery', 'props'):
        if os.path.isdir(os.path.join(ROOT, 'art', d)):
            shutil.copytree(os.path.join(ROOT, 'art', d), os.path.join(out, 'art', d))
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
    for f in ('assets.json', 'crew_layout.json', 'scenery.json', 'props.json'):
        if os.path.exists(os.path.join(ROOT, 'art', f)):
            shutil.copy(os.path.join(ROOT, 'art', f), os.path.join(out, 'art', f))
    # every art file the game's code names must be in the build
    missing = [f for f in ('scenery.json', 'props.json') if os.path.exists(os.path.join(ROOT, 'art', f))
               for src in [json.load(open(os.path.join(out, 'art', f)))] for v in src.values()
               for p in _files(v) if not os.path.exists(os.path.join(out, 'art', p))]
    if missing: sys.exit(f'build is missing art: {missing[:5]}')
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
    n = sum(len(fs) for _, _, fs in os.walk(out))
    print(f'{out}: {n} files, {size / 1048576:.1f} MiB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'dist'))
