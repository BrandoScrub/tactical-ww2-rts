"""Coloured review sheets of the unit models (DESIGN_METHOD.md step 7), without a full export:
  python3 tools/review_units.py <out> [key-part ...]
Per unit: close (1.0) at two headings and play size (0.4, shown 3x) at four, in the game's paint, on the ground colour."""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
import numpy as np
from PIL import Image
from artkit.style import Style
from artkit.core.geom import RZ
from artkit.core.space import Camera
from artkit.sprite import picture, sheet

ST = Style.load(os.path.join(ROOT, 'styles', 'ww2'))
CAM = Camera.from_pack({'view': 'iso', 'plates': False})
GROUND = (112, 104, 74)


def turn(g, deg):
    lo, hi = g.bounds(); c = (np.asarray(lo) + np.asarray(hi)) / 2; c[2] = 0
    return g.about(c, RZ(deg))


def shot(g, scale): return picture(g, ST, scale=scale, camera=CAM)[0]


def main(out, only):
    from models import roster
    os.makedirs(out, exist_ok=True)
    for side in roster.SIDES:
        V = [(k, m) for k, _, _, m in roster.vehicles(side) if not only or any(o in k for o in only)]
        if not V: continue
        close, play, labs = [], [], []
        for k, m in V:
            t = 'turret' in m.parts
            for hd, tu in ((300, 0), (30, 60 if t else 0), (150, 0)):
                close.append(shot(turn(m.geometry({'turret': tu} if tu else None), hd), 1.0)); labs.append(f'{k} {hd}')
            play += [shot(turn(m.geometry(), hd), 0.4) for hd in (300, 30, 120, 210)]
        sheet(close, labs, cols=3, bg=GROUND).save(f'{out}/{side}_close.png')
        sheet(play, None, cols=8, bg=GROUND, zoom=3).save(f'{out}/{side}_play.png')
        print(side, len(V), 'vehicles')


def men(out, only):
    """Every man in his idle pose: close (2.0) from the front quarter and the back quarter, and play size (0.4, shown 4x)."""
    os.makedirs(out, exist_ok=True)
    from models import roster
    from artkit.core.geom import Geometry
    for side in roster.SIDES:
        M = [(k, u, c) for k, _, u, c in roster.men(side) + roster.crews(side) + roster.more_men(side) if not only or any(o in k for o in only)]
        if not M: continue
        close, play, labs = [], [], []
        for k, u, clips in M:
            idle = next((c for c in clips if c.name == 'idle'), clips[0]); pose = dict(idle.fn(0.0))
            pose.setdefault('flash', np.array([0.0]))
            g = lambda hd: Geometry.join(u.build(pose, hd)[0]) if isinstance(u.build(pose, hd)[0], list) else u.build(pose, hd)[0]
            for hd in (330, 150): close.append(shot(g(hd), 2.0)); labs.append(f'{k.split("_", 1)[1]} {hd}')
            play += [shot(g(hd), 0.4) for hd in (330, 60, 150, 240)]
        sheet(close, labs, cols=8, bg=GROUND).save(f'{out}/{side}_men_close.png')
        sheet(play, None, cols=16, bg=GROUND, zoom=4).save(f'{out}/{side}_men_play.png')
        print(side, len(M), 'men')


if __name__ == '__main__':
    a = sys.argv[2:]
    if 'men' in a: men(sys.argv[1], [x for x in a if x != 'men'])
    else: main(sys.argv[1], a)
