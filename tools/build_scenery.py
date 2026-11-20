"""Export the map's buildings (models/scenery.py) as still sprites the game draws in place of its canvas stand-ins.

  python3 tools/build_scenery.py              every farmhouse variant, as authored and turned (ridge along y)
  python3 tools/build_scenery.py cottage      only keys containing one of these

Writes art/scenery/<key>[_r][_<state>].png (+ _shadow.png) and art/scenery.json, kept apart from art/assets.json so a
unit build never drops them. Stages: normal, damaged (game: house under 60% health), ruined (house collapsed).
Each key is exported twice: '<key>' with its ridge along x and '<key>_r' turned a quarter so the ridge runs along y,
both showing their detailed walls (+x, +y) to the camera. game/src/map.js picks the key by footprint."""
import json, os, shutil, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from artkit.style import Style
from artkit.export import Exporter
from models import scenery

OUT = os.path.join(ROOT, 'art', 'scenery')


def main(args):
    keys = [k for k in scenery.VARIANTS if not args or any(a in k for a in args)]
    if not keys: sys.exit('no scenery key matches ' + ' '.join(args))
    path = os.path.join(ROOT, 'art', 'scenery.json')
    A = json.load(open(path)) if os.path.exists(path) else {}
    tmp = tempfile.mkdtemp(prefix='scenery_')
    ex = Exporter(Style.load(os.path.join(ROOT, 'styles', 'ww2')), tmp, log=lambda *a: None)
    for k in keys:
        for turn in (0, 3):
            name = k + ('_r' if turn else '')
            ex.static(name, scenery.asset(k, turn))
            print(' ', name, flush=True)
    os.makedirs(OUT, exist_ok=True)
    for name, rec in ex.assets.items():
        for st in rec['states'].values():
            st['src'] = 'scenery/' + st['src']; shutil.copy(os.path.join(tmp, st['src'][8:]), OUT)
            if 'shadow' in st: st['shadow']['src'] = 'scenery/' + st['shadow']['src']; shutil.copy(os.path.join(tmp, st['shadow']['src'][8:]), OUT)
        rec['metres'] = [round(v / 55, 3) for v in rec['footprint']]          # footprint is in artkit units, 55 a metre
        A[name] = rec
    shutil.rmtree(tmp)
    A = {k: A[k] for k in sorted(A)}
    json.dump(A, open(path, 'w'), separators=(',', ':'))
    print(f'art/scenery.json: {len(A)} buildings')


if __name__ == '__main__':
    main(sys.argv[1:])
