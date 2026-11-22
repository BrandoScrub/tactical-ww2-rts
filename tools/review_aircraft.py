"""Grey blockout review sheets of the aircraft and parachutes (models/aircraft.py; artkit/DESIGN_METHOD.md step 7):
  python3 tools/review_aircraft.py <out> [key-part ...]
Per model: play size (0.4 px a unit, the units' export scale) at four headings, and a closer look at two, flat grey
(darker for steel, darkest for rubber and openings), with the engine's lines. Also prints each model's check()."""
import sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
import numpy as np
from artkit.style import Style
from artkit.core.materials import Materials, Material
from artkit.core.geom import RZ
from artkit.core.space import Camera
from artkit.sprite import picture, sheet

CAM = Camera.from_pack({'view': 'iso', 'plates': False})
GROUND = (112, 104, 74)


def grey():
    g = lambda v: Material(np.full((8, 8, 3), v / 255, np.float32), 'tile', 0.05)
    G, L, D, K = g(170), g(205), g(110), g(60)
    pick = {'steel': D, 'rubber': K, 'dark': K, 'glass': D, 'canvas': L}
    return Materials(fallback=lambda n: pick.get(n.split('@')[0], G))


def turn(g, deg):
    lo, hi = g.bounds(); c = (np.asarray(lo) + np.asarray(hi)) / 2
    return g.about(c, RZ(deg))


def main(out, only):
    from models import aircraft as A
    os.makedirs(out, exist_ok=True)
    st, mats = Style.load(os.path.join(ROOT, 'styles', 'ww2')), grey()
    shot = lambda g, scale: picture(g, st, scale=scale, mats=mats, camera=CAM)[0]
    groups = {'fighters': ('fighter', 'dive bomber'), 'bombers': ('bomber', 'transport'), 'airship': ('airship',),
              'parachutes': ('parachute', 'supply drop')}
    close_scale = {'fighters': 1.0, 'bombers': 0.5, 'airship': 0.16, 'parachutes': 1.0}
    for gname, roles in groups.items():
        items = [(s, r, fn) for s, r, fn in A.ALL if r in roles and (not only or any(o in fn.__name__ for o in only))]
        if not items: continue
        play, close, labs = [], [], []
        for side, role, fn in items:
            m = fn(); issues = m.check()
            print(f'{fn.__name__:16s} {len(m.parts):3d} parts  check: {"empty" if not issues else issues}')
            g = m.geometry()
            play += [shot(turn(g, hd), 0.4) for hd in (300, 30, 120, 210)]
            for hd in (300, 30):
                close.append(shot(turn(g, hd), close_scale[gname])); labs.append(f'{fn.__name__} {hd}')
        sheet(play, None, cols=4, bg=GROUND).save(f'{out}/{gname}_play.png')
        sheet(close, labs, cols=2, bg=GROUND).save(f'{out}/{gname}_close.png')
    print('wrote', sorted(os.listdir(out)))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'aircraft_review', sys.argv[2:])
