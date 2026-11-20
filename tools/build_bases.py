"""Export the base buildings (models/bases.py: both HQs and the eight production buildings) as still sprites, painted
with the WW2 tiles, that the game draws in place of its canvas stand-ins (game/src/render.js, drawBuilding).

  python3 tools/build_bases.py                 every building
  python3 tools/build_bases.py us_hq de_hq     only these keys
  python3 tools/build_bases.py --preview out   no export: a sheet of every stage at play size, out/bases_textured.png

Writes art/bases/<key>[_<stage>].png (+ _shadow.png, + _team.png: the flag's mask, recoloured per player by
ArtKit.teams) and art/bases.json. Stages, chosen by the game:
  build33, build66   under construction (built < 0.5, built < 1): walls up to a third / two thirds of the body's
                     height inside scaffolding
  normal
  damaged            under half health: the roofs and upper walls broken down to a ragged line with rubble round the
                     foot; masts, towers, gantries and the flag (the building's signature) stay, so it still reads
A destroyed building is removed by the game, so there is no ruin stage.

Materials: the style's tiles, plus concrete (stone_dressed, greyed: poured, not laid) and earth (ground_dirt, as the
field-defence props use). Every model's check() must be empty."""
import json, os, shutil, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
import numpy as np
from PIL import Image, ImageEnhance
from artkit.style import Style
from artkit.export import Exporter
from artkit.recipe import Asset, TILE
from artkit.team import Team
from artkit import library as lib
from models.kit import M
from models import bases

OUT = os.path.join(ROOT, 'art', 'bases')
BODY_TAGS = ('body', 'roof', 'base')           # what the building's height is measured on (not masts, towers, gantries)
KEEP_TAGS = ('signature', 'accent')            # what a damaged building keeps whole


def materials(style):
    """The style's tiles plus concrete and earth, made from them."""
    m = style.materials(); t = m.tiles
    def grade(name, sat=1.0, bright=1.0, mul=(1, 1, 1)):
        im = t[name].convert('RGB')
        im = ImageEnhance.Brightness(ImageEnhance.Color(im).enhance(sat)).enhance(bright)
        a = np.asarray(im).astype(np.float32) * np.array(mul, np.float32)
        return Image.fromarray(a.clip(0, 255).astype(np.uint8))
    t['concrete'] = grade('stone_dressed', .25, .92, (1.0, 1.0, 1.02))   # poured concrete: the dressed stone's grain, cold grey
    t['earth'] = t['ground_dirt']
    m.cache.clear()
    return m


def stages(a):
    """name -> Geometry for every stage of one Build."""
    g = a.geometry(); tags = a.tags()
    tag = np.array([tags.get(int(p), 'detail') for p in g.part])
    body = np.isin(tag, BODY_TAGS)
    H = float(g.P[body][..., 2].max()) if body.any() else float(g.P[..., 2].max())
    lo, hi = g.bounds(); w, d = hi[0] - lo[0], hi[1] - lo[1]
    c = g.P.mean(1)
    out = {'normal': g}
    for f in (.33, .66):                                                         # walls rise inside scaffolding
        built = Asset._cut(g, np.full(len(g), f * H), H)
        out[f'build{int(f * 100)}'] = built + lib.scaffold(w - 24, d - 24, max(40.0, f * H + 20), 'timber').move(lo[0] + 12, lo[1] + 12, 0)
    rng = np.random.default_rng(len(a.name))                                   # damaged: a ragged line at 60-80% of the body
    ph = rng.random(3) * 6
    rag = .09 * np.sin(c[:, 0] / M * 1.3 + ph[0]) + .07 * np.sin(c[:, 1] / M * 1.9 + ph[1]) + .05 * np.sin((c[:, 0] + c[:, 1]) / M * 3.7 + ph[2])
    lim = H * (.7 + rag)
    lim[np.isin(tag, KEEP_TAGS) | (g.part == 0)] = np.inf                      # signature, flag and loose kit survive
    rub = lib.rubble(r=min(w, d) * .3, n=18, mat='rubble', seed=5).move(lo[0] + w * .55, lo[1] + d * .55, 0)
    out['damaged'] = Asset._cut(g, lim, H) + rub
    return out


def asset(key):
    fn, rank = bases.ALL[key]; a = fn()
    problems = a.check()
    if problems: sys.exit(f'{key}: check() found problems:\n  ' + '\n  '.join(map(str, problems)))
    w, d = bases_size(key)
    S = stages(a)

    class Staged(Asset):
        def states(s): return S
    return Staged({'name': key, 'footprint': [w * M / TILE, d * M / TILE], 'rank': rank}, geom=S['normal'])


def bases_size(key):
    """The footprint in metres: the model function's own defaults, which are game/src/data.js `size`."""
    import inspect
    p = inspect.signature(bases.ALL[key][0]).parameters
    return p['w'].default, p['d'].default


def preview(out, keys):
    from artkit.sprite import picture, sheet
    st = Style.load(os.path.join(ROOT, 'styles', 'ww2')); mats = materials(st)
    pics, labs = [], []
    for k in keys:
        S = stages(bases.ALL[k][0]())
        for name in ('build33', 'build66', 'normal', 'damaged'):
            pics.append(picture(S[name], st, scale=.4, mats=mats)[0]); labs.append(f'{k} {name}')
    os.makedirs(out, exist_ok=True)
    sheet(pics, labs, cols=4).save(os.path.join(out, 'bases_textured.png'))
    print('wrote', os.path.join(out, 'bases_textured.png'))


def main(keys):
    st = Style.load(os.path.join(ROOT, 'styles', 'ww2')); materials(st)
    path = os.path.join(ROOT, 'art', 'bases.json')
    A = json.load(open(path)) if os.path.exists(path) else {}
    tmp = tempfile.mkdtemp(prefix='bases_')
    ex = Exporter(st, tmp, log=lambda *a: None)
    for k in keys:
        ex.static(k, asset(k), team=Team(['flag']))
        print(' ', k, flush=True)
    os.makedirs(OUT, exist_ok=True)
    def move(rec, field):
        if field in rec and isinstance(rec[field], str):
            shutil.copy(os.path.join(tmp, rec[field]), OUT); rec[field] = 'bases/' + rec[field]
    for name, rec in ex.assets.items():
        for s in rec['states'].values():
            move(s, 'src'); move(s, 'team')
            if 'shadow' in s: move(s['shadow'], 'src')
        w, d = bases_size(name)
        rec['metres'] = [w, d]
        A[name] = rec
    shutil.rmtree(tmp)
    A = {k: A[k] for k in sorted(A)}
    json.dump(A, open(path, 'w'), separators=(',', ':'))
    print(f'art/bases.json: {len(A)} buildings')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--preview']:
        preview(args[1] if len(args) > 1 else 'scratch', args[2:] or list(bases.ALL))
    else:
        main([k for k in bases.ALL if not args or k in args])
