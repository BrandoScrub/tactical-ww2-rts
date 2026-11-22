"""Review sheets of the aircraft and parachutes (models/aircraft.py, air_finish.py, parachutes.py; DESIGN_METHOD.md step 7):
  python3 tools/review_aircraft.py <out> [key ...] [--grey]
Aircraft: play size (0.4 px a unit, the units' export scale; the airship at 0.1) at four headings and a closer look at
two, finished and painted (--grey: the blockouts, flat grey). Parachutes: each rig's three stages. Prints every check()."""
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


def main(out, only, grey_mode=False, finished=True):
    from models import roster, aircraft as A, parachutes as C      # roster registers each side's cloth
    os.makedirs(out, exist_ok=True)
    st = Style.load(os.path.join(ROOT, 'styles', 'ww2')); mats = grey() if grey_mode else None
    shot = lambda g, scale: picture(g, st, scale=scale, mats=mats, camera=CAM)[0] if mats else picture(g, st, scale=scale, camera=CAM)[0]
    want = lambda n: not only or any(o in n for o in only)
    # ---- aircraft: play size at four headings, closer at two
    groups = {'fighters': ('p47', 'bf109', 'ju87'), 'bombers': ('b25', 'c47', 'ju52'), 'airship': ('k_ship',)}
    close_scale = {'fighters': 1.0, 'bombers': 0.5, 'airship': 0.16}
    for gname, keys in groups.items():
        items = [k for k in keys if want(k)]
        if not items: continue
        play, close, labs = [], [], []
        for k in items:
            m = A.finished(k) if finished and not grey_mode else A.BLOCKOUT[k](); issues = m.check()
            print(f'{k:10s} {len(m.parts):3d} parts  check: {"empty" if not issues else issues}', flush=True)
            g = m.geometry()
            play += [shot(turn(g, hd), 0.4 if gname != 'airship' else 0.1) for hd in (300, 30, 120, 210)]
            for hd in (300, 30):
                close.append(shot(turn(g, hd), close_scale[gname])); labs.append(f'{k} {hd}')
        sheet(play, None, cols=4, bg=GROUND).save(f'{out}/{gname}_play.png')
        sheet(close, labs, cols=2, bg=GROUND).save(f'{out}/{gname}_close.png')
    # ---- parachutes: the three stages of each rig, closer and at play size
    rigs = [(side, role, fn) for side, role, fn in C.RIGS if want(role) or want(f'{side}_{role}')]
    if rigs and (not only or any(o in ('parachute', 'supply_drop', 'chutes') or '_' in o for o in only)):
        close, play, labs = [], [], []
        for side, role, fn in rigs:
            for stage in C.STAGES:
                m = fn(stage); issues = m.check()
                print(f'{side}_{role} {stage:8s} {len(m.parts):3d} parts  check: {"empty" if not issues else issues}', flush=True)
                g = m.geometry()
                close.append(shot(turn(g, 300), 0.8)); labs.append(f'{side} {role} {stage}')
                play += [shot(turn(g, hd), 0.4) for hd in ((300, 30) if stage != 'open' else (300, 30, 120, 210))]
        sheet(close, labs, cols=3, bg=GROUND).save(f'{out}/parachutes_close.png')
        sheet(play, None, cols=8, bg=GROUND).save(f'{out}/parachutes_play.png')
    print('wrote', sorted(os.listdir(out)))


if __name__ == '__main__':
    a = [x for x in sys.argv[2:] if not x.startswith('--')]
    main(sys.argv[1] if len(sys.argv) > 1 else 'aircraft_review', a, grey_mode='--grey' in sys.argv)
