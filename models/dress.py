"""Each side's paint and cloth: figure materials registered as <side>_<name>, and the renaming that puts them on."""
import os
import numpy as np
from artkit import figure
from artkit.figure import material

TILES = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'styles', 'ww2', 'tiles')
# a figure material's kind -> the painted close-up tile whose grain it takes (its own colour is kept)
GRAIN = {'wool': 'wool', 'leather': 'leather', 'canvas': 'us_canvas', 'metal': 'steel'}
GRAIN_PX = 96            # texels per repeat: at figure.TEX_PX_PER_UNIT (3) one repeat is 32 units, about 0.6 m on a man

# ---- figure materials per side (registered in the figure registry under <side>_<name>)
CLOTH = {
 'us': dict(tunic=((130, 124, 84), 'wool'), trousers=((104, 94, 64), 'wool'), puttee=((160, 148, 108), 'canvas'), helmet=((74, 82, 54), 'metal'),
            canvas=((176, 164, 120), 'canvas'), leather=((100, 68, 42), 'leather'), boot=((64, 46, 34), 'leather'), blanket=((120, 112, 80), 'wool'),
            brass=((150, 130, 72), 'metal'), tube=((74, 82, 54), 'metal'), tank=((92, 98, 84), 'metal'), hazard=((158, 62, 42), 'metal'), hide=((100, 68, 42), 'leather')),
 'de': dict(tunic=((108, 116, 104), 'wool'), trousers=((102, 108, 100), 'wool'), puttee=((102, 108, 100), 'wool'), helmet=((72, 80, 76), 'metal'),
            canvas=((128, 124, 100), 'canvas'), leather=((52, 42, 36), 'leather'), boot=((38, 34, 32), 'leather'), blanket=((110, 110, 104), 'wool'),
            brass=((160, 136, 76), 'metal'), tube=((170, 146, 98), 'metal'), tank=((90, 96, 90), 'metal'), hazard=((158, 62, 42), 'metal'), hide=((52, 42, 36), 'leather')),
}
for _s, _t in CLOTH.items():
    for _n, (_c, _k) in _t.items(): material(f'{_s}_{_n}', _c, _k)


def _rename(g, table):
    return g.set(mat=np.array([table.get(m, m) for m in g.mat], object))


def dress(u, side):
    """A trooper's parts in his side's materials."""
    t = {n: f'{side}_{n}' for n in CLOTH[side]}
    u.parts = [(b, _rename(g, t), n, w) for b, g, n, w in u.parts]
    return u


def _wrap(g, mat, seed):
    """Faces in `mat` take their texture position from where they are on the vehicle (each face projected along the
    axis it faces most), not from their own middle: a camouflage pattern then runs on across plates and round a
    turret, and no two vehicles wear the same patches."""
    sel = np.asarray(g.mat) == mat
    if not sel.any(): return g
    P = np.asarray(g.P, float); UV = np.array(g.UV, float); ax = np.abs(np.asarray(g.FN, float)).argmax(1)
    r = np.random.default_rng(seed); off = r.uniform(0, 4000, (3, 2))
    for a, (i, j) in enumerate(((1, 2), (0, 2), (0, 1))):
        k = sel & (ax == a)
        UV[k] = P[k][:, :, [i, j]] + off[a]
    return g._new(UV=UV)


def paint(m, side, camo=False):
    """A machine in its side's paint (hull plate, stowage); steel, rubber and wood are shared. camo: the German
    three-colour scheme (tile de_camo, tools/make_markings.py) instead of plain dark yellow."""
    t = {'hull': f'{side}_camo' if camo else f'{side}_hull', 'canvas': f'{side}_canvas'}
    seed = sum(map(ord, m.name))
    for p in m.parts.values():
        p.geom = _rename(p.geom, t)
        if camo: p.geom = _wrap(p.geom, f'{side}_camo', seed)
    return m




_grain = {}


def _grain_tile(name):
    """The painted tile shrunk to GRAIN_PX and divided by its own mean: pure grain around 1.0."""
    if name not in _grain:
        from PIL import Image
        p = os.path.join(TILES, name + '.jpg')
        if not os.path.exists(p): _grain[name] = None
        else:
            a = np.asarray(Image.open(p).convert('RGB').resize((GRAIN_PX, GRAIN_PX), Image.LANCZOS), float)
            _grain[name] = a / a.reshape(-1, 3).mean(0)
    return _grain[name]


def texture_cloth():
    """Give every side material (us_*, de_*) the grain of its painted tile, keeping its colour: wool serge,
    leather, canvas webbing and steel. Materials whose kind has no painted tile keep the procedural texture."""
    for d in figure.MATS:
        if not d['name'].startswith(('us_', 'de_')): continue
        g = _grain_tile(GRAIN.get(d['kind'], ''))
        if g is not None: d['tex'] = np.clip(g * np.asarray(d['color'], float) / 255.0, 0, 1)
