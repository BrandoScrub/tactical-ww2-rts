"""The finishing pass on the aircraft blockouts (models/aircraft.py), as models/finish.py is for the vehicles: detail
only where it helps the read, every part still with its reason and its mount, Machine.check() still empty.

What each aircraft gets, and why:
  paint      American: olive drab over neutral grey. German: the Mediterranean scheme, sand yellow with olive-green
             blotches over pale blue, so a German aircraft is the same family of colour as German armour on the
             ground and cannot be taken for an American one. Upper or under colour is chosen per face by which way
             it points. The Ju 52 wears its paint on corrugated sheet, the ridges running along the airframe.
  markings   US star-and-bar (fuselage sides, top of the left wing: where it was carried from 1943), Balkenkreuz
             (fuselage sides, top of both wings), the white band round the rear fuselage that German aircraft wore
             in the Mediterranean. The swastika on the fin is left off. Lettering on the airship.
  the job    guns in the wings (it strafes), tubes (it fires rockets), a bomb, an open jump door, a row of cabin
             windows (it carries men).
  the face   the dark mouth of a radial cowl with its ring of cooling flaps behind, exhaust stains, aerial masts.
Nothing is on the underside that the game's camera cannot see.
"""
import math
import numpy as np
from artkit import shapes as sh
from artkit.core.geom import Geometry
from .kit import M, P, UP, solid, slab, rod, disc, mark
from .aircraft import body, SIDE
from .dress import _rename, _wrap

SIDES = ((1, 'l'), (-1, 'r'))
STAR = 'US star-and-bar: the national insignia as carried from August 1943'
CROSS = 'Balkenkreuz: the German national marking'
FWD = (1, 0, 0)


# ---------------------------------------------------------------- where things are on a body or a wing
def _st(stations, x):
    xs = [s[0] for s in stations]; a = np.array(stations, float)
    return tuple(float(np.interp(x, xs, a[:, k])) for k in (1, 2, 3))


def side_at(m, x, sd, z=None, part='fuselage', y0=0.0):
    """A point on the side of a body() at station x (and height z; default: its widest line), with the outward normal."""
    st, box = m.ref[part], m.ref.get('box', 2.0) if part == 'fuselage' else 2.0
    def pt(x, z):
        hw, zb, zt = _st(st, x); zc, h = (zb + zt) / 2, (zt - zb) / 2
        zz = zc if z is None else z
        return np.array([x, y0 + sd * hw * max(0.0, 1 - abs((zz - zc) / h) ** box) ** (1 / box), zz])
    hw, zb, zt = _st(st, x); zz = (zb + zt) / 2 if z is None else z
    a, b, c = pt(x, zz), pt(x + 0.3, zz), pt(x, zz + 0.12)
    n = np.cross(b - a, c - a) * sd; n = n / np.linalg.norm(n)
    return tuple(a), tuple(n)


def wing_top(m, y, f=0.5, name='wing'):
    """A point on a wing's upper surface at span y (signed) and chord fraction f from the leading edge, with its normal."""
    S = np.array(m.ref[name], float); sd = 1 if y >= 0 else -1
    def pt(yy, f):
        le, te, z, t = (float(np.interp(abs(yy), S[:, 0], S[:, k])) for k in (1, 2, 3, 4))
        top = np.interp(f, [0.0, 0.08, 0.3, 0.7, 1.0], [0.0, 0.3, 0.6, 0.35, 0.0]) * t
        return np.array([le - f * (le - te), yy, z + top])
    a, b, c = pt(y, f), pt(y, f - 0.15), pt(y + sd * 0.3, f)
    n = np.cross(b - a, c - a) * sd; n = n / np.linalg.norm(n)
    return tuple(a), tuple(n if n[2] > 0 else -n)


def panel_of(m, y, name='wing'):
    """The wing panel part that span position y lies on."""
    S = m.ref[name]; k = max(0, max(i for i in range(len(S) - 1) if S[i][0] <= abs(y) + 1e-6))
    return f'{name}_{"l" if y >= 0 else "r"}{k}'


def insignia(m, decal, why, fus_x=None, fus_h=0.0, wing_y=(), wing_h=0.0, aspect=1.0, fus_z=None):
    for sd, s in SIDES:
        if fus_x is not None:
            c, n = side_at(m, fus_x, sd, fus_z)
            mark(m, f'insignia_{s}', decal, c, n, fus_h * aspect, fus_h, 'fuselage', why + ' (fuselage side)')
    for y in wing_y:
        c, n = wing_top(m, y, 0.5)
        mark(m, f'insignia_wing_{"l" if y > 0 else "r"}', decal, c, n, wing_h * aspect, wing_h, panel_of(m, y), why + ' (wing top)', up=FWD)


def band(m, x0, x1, mat='air_band', why='white band round the rear fuselage: the Mediterranean theatre marking on German aircraft'):
    st, box = m.ref['fuselage'], m.ref.get('box', 2.0)
    ring = lambda x: (x,) + tuple(v + d for v, d in zip(_st(st, x), (0.012, -0.012, 0.012)))
    m.add('theatre_band', body([ring(x0), ring(x1)], mat, box=box, smooth=box < 2.5), why, on='fuselage')


def engine_face(m, name, x, y, z, r, on):
    """The front of a radial: the dark mouth of the cowl, and behind it the ring of cooling flaps."""
    m.add(f'{name}_mouth', sh.cyl(P(x - 0.05, y, z), P(x + 0.015, y, z), r * 0.60 * M, 'opening', seg=14), 'the open front of the cowl: cooling air goes in round the engine; a dark disc that says radial', on=on)


def cowl_flaps(m, name, x, y, z, r, on, contact=()):
    m.add(f'{name}_flaps', sh.lathe([(r * 1.0 * M, 0), (r * 1.045 * M, 0.02 * M), (r * 1.045 * M, 0.20 * M), (r * 1.0 * M, 0.22 * M)], 'steel', n=20).ry(90).move(*P(x, y, z)),
          'ring of cooling flaps at the back of the cowl: a dark band that ends the nose', on=on, contact=contact, convex=False)


def mast(m, x, z, h=0.55, lean=0.12, on='fuselage', y=0.0):
    m.add('aerial_mast', rod((x, y, z - 0.03), (x - lean, y, z + h), 0.022, 'steel', seg=4), 'radio aerial mast behind the cockpit (a line that carries)', on=on, small_ok=True)


def guns(m, name, pts, length, r, on, why, contact=()):
    g = Geometry.join([sh.cyl(P(*p), P(p[0] + length, p[1], p[2]), r * M, 'steel', seg=6) for p in pts])
    m.add(name, g, why, on=on, contact=contact, convex=False, small_ok=True)


def exhaust(m, name, x0, x1, y, z, on, sd):
    y0, y1 = sorted((y, y + sd * 0.05))
    m.add(name, slab(x0, x1, y0, y1, z - 0.05, z + 0.05, 'exhaust'), 'row of exhaust stubs along the cowl: a dark streak that marks an inline engine', on=on, small_ok=True)


# ---------------------------------------------------------------- one function per aircraft
def p47(m):
    insignia(m, 'us_air_star', STAR, fus_x=4.3, fus_h=0.72, wing_y=(3.4,), wing_h=1.0, aspect=2.1)
    engine_face(m, 'cowl', 10.95, 0, -0.1, 0.78, 'cowl'); cowl_flaps(m, 'cowl', 9.72, 0, -0.1, 0.78, 'cowl', ['fuselage', 'chin'])
    mast(m, 6.2, 0.74)
    for sd, s in SIDES:
        pts = []
        for k in range(4):
            y = sd * (2.55 + 0.22 * k); (c, n) = wing_top(m, y, 0.03)
            pts.append((c[0] - 0.05, y, c[2] - 0.02))
        guns(m, f'wing_guns_{s}', pts, 0.42, 0.028, panel_of(m, sd * 2.9), 'four .50 calibre guns in the wing, barrels staggered out of the leading edge: what it strafes with')
        mark(m, f'serial_{s}', 'us_tail_serial', (0.95, sd * 0.07, 1.05), (0, sd, 0), 0.9, 0.22, 'fin0', 'serial number on the fin, in yellow')
    return m


def bf109(m):
    insignia(m, 'de_cross', CROSS, fus_x=3.75, fus_h=0.62, wing_y=(3.3, -3.3), wing_h=0.8)
    band(m, 2.55, 3.05)
    mast(m, 4.75, 0.50, h=0.5)
    for sd, s in SIDES:
        m.add(f'beule_{s}', body([(6.45, 0.03, 0.34, 0.42), (6.75, 0.15, 0.26, 0.60), (7.25, 0.13, 0.26, 0.56), (7.6, 0.03, 0.32, 0.40)], y=sd * 0.24),
              'bulge over the breech of the 13 mm gun: the bump on each side of the nose that names the G-6', on='fuselage')
        exhaust(m, f'exhaust_{s}', 7.25, 8.15, sd * 0.40, -0.18, 'fuselage', sd)
    m.add('supercharger', body([(7.0, 0.03, -0.02, 0.10), (7.5, 0.10, -0.08, 0.16), (7.75, 0.10, -0.08, 0.16)], y=0.47),
          'supercharger air intake on the left of the nose: a 109 is not the same on both sides', on='fuselage', small_ok=True)
    guns(m, 'cowl_guns', [(7.5, 0.16, 0.40), (7.5, -0.16, 0.40)], 0.8, 0.022, 'fuselage', 'two 13 mm guns in troughs over the engine: what it strafes with')
    m.add('tailwheel_leg', rod((0.75, 0, -0.08), (0.62, 0, -0.42), 0.035), 'fixed tailwheel leg (it stayed down on the G-6)', on='fuselage', small_ok=True)
    m.add('tailwheel', sh.cyl(P(0.62, -0.05, -0.47), P(0.62, 0.05, -0.47), 0.14 * M, 'rubber', seg=10), 'tailwheel', on='tailwheel_leg', small_ok=True)
    return m


def ju87(m):
    insignia(m, 'de_cross', CROSS, fus_x=3.9, fus_h=0.70, wing_y=(5.0, -5.0), wing_h=0.95)
    band(m, 2.5, 3.05)
    mast(m, 6.6, 1.12, h=0.6, on='canopy')
    S = m.ref['wing']
    for sd, s in SIDES:
        exhaust(m, f'exhaust_{s}', 9.3, 10.3, sd * 0.57, -0.05, 'fuselage', sd)
        for k, (ya, yb) in enumerate(((2.9, 5.6), (5.6, 6.7))):                          # the Junkers double wing, outer panels
            pts = []
            for yy in (ya, yb):
                te, zw = (float(np.interp(yy, [q[0] for q in S], [q[j] for q in S])) for j in (2, 3))
                pts += [(te + 0.22, sd * yy, zw - 0.02), (te + 0.22, sd * yy, zw - 0.14), (te - 0.55, sd * yy, zw - 0.18), (te - 0.55, sd * yy, zw - 0.25)]
            m.add(f'flap_{s}{k}', solid(pts), 'Junkers double wing: flap and aileron hung clear below the trailing edge; a second line behind the wing that marks a Junkers',
                  on=f'wing_{s}{k + 1}', small_ok=True)
        c, _ = wing_top(m, sd * 2.75, 0.03)
        guns(m, f'wing_gun_{s}', [(c[0] - 0.05, sd * 2.95, c[2] - 0.05)], 0.55, 0.03, f'wing_{s}1', 'gun in the wing just outside the bend: it strafes as well as bombs')
    return m


def b25(m):
    insignia(m, 'us_air_star', STAR, fus_x=4.3, fus_h=0.85, wing_y=(7.2,), wing_h=1.25, aspect=2.1)
    mast(m, 8.6, 0.85, h=0.5)
    for sd, s in SIDES:
        y = sd * 2.95
        engine_face(m, f'cowl_{s}', 12.75, y, 0.08, 0.80, f'cowl_{s}'); cowl_flaps(m, f'cowl_{s}', 11.78, y, 0.08, 0.80, f'cowl_{s}', [f'nacelle_{s}'])
        c, n = side_at(m, 6.3, sd, 0.15)
        mark(m, f'waist_window_{s}', 'glass', c, n, 0.95, 0.55, 'fuselage', 'waist gun window behind the wing: a gunner each side')
        m.add(f'gun_pack_{s}', body([(12.0, 0.03, -0.30, -0.18), (12.5, 0.14, -0.50, 0.02), (13.3, 0.14, -0.50, 0.02), (13.7, 0.04, -0.30, -0.18)], y=sd * 0.86),
              'blister with two fixed .50s on the side of the nose: the J strafes with them', on='fuselage')
        guns(m, f'pack_guns_{s}', [(13.6, sd * 0.90, -0.12), (13.6, sd * 0.90, -0.36)], 0.75, 0.025, f'gun_pack_{s}', 'the barrels of the side pack')
        mark(m, f'serial_{s}', 'us_tail_serial', (1.15, sd * 3.455, 1.15), (0, sd, 0), 1.0, 0.24, f'fin_{s}1', 'serial number on the outside of each fin')
    guns(m, 'nose_gun', [(16.0, 0, -0.08)], 0.55, 0.028, 'nose_glass', 'flexible .50 through the nose glazing')
    guns(m, 'tail_guns', [(-1.0, 0.07, 0.30), (-1.0, -0.07, 0.30)], 0.75, 0.025, 'tail_gun', 'twin .50s in the tail: the sting')
    return m


def c47(m):
    insignia(m, 'us_air_star', STAR, fus_x=7.9, fus_h=1.0, wing_y=(9.5,), wing_h=1.5, aspect=2.1, fus_z=0.15)
    mast(m, 16.4, 1.22, h=0.55)
    for sd, s in SIDES:
        y = sd * 3.35
        engine_face(m, f'cowl_{s}', 14.35, y, -0.50, 0.76, f'cowl_{s}'); cowl_flaps(m, f'cowl_{s}', 13.38, y, -0.50, 0.76, f'cowl_{s}', [f'nacelle_{s}'])
        c, n = side_at(m, 12.9, sd, 0.50)
        mark(m, f'windows_{s}', 'cabin_windows_7' , c, n, 6.4, 0.40, 'fuselage', 'row of cabin windows: it carries men')
        m.add(f'wheel_{s}', sh.cyl(P(11.6, y - 0.16, -1.22), P(11.6, y + 0.16, -1.22), 0.50 * M, 'rubber', seg=14),
              'main wheel, half out of the nacelle even when retracted: the C-47 could belly in on them', on=f'nacelle_{s}', contact=[f'wing_{s}0'])
        mark(m, f'serial_{s}', 'us_tail_serial', (1.35, sd * 0.092, 2.35), (0, sd, 0), 1.1, 0.30, 'fin1', 'serial number on the fin')
    m.add('astrodome', sh.sphere(0.22 * M, 'canopy_glass', seg=8, rings=5).move(*P(15.6, 0, 1.22)), 'navigator\'s dome on the roof behind the flight deck', on='fuselage', small_ok=True)
    return m


def ju52(m):
    insignia(m, 'de_cross', CROSS, fus_x=3.3, fus_h=0.85, wing_y=(9.0, -9.0), wing_h=1.6, fus_z=0.25)
    band(m, 6.0, 6.7)
    mast(m, 14.8, 1.15, h=0.6)
    engine_face(m, 'cowl_c', 18.45, 0, -0.10, 0.72, 'cowl_c')
    for sd, s in SIDES:
        y = sd * 3.4
        engine_face(m, f'cowl_{s}', 15.85, y, -0.78, 0.66, f'cowl_{s}')
        c, n = side_at(m, 10.6, sd, 0.45)
        mark(m, f'windows_{s}', 'cabin_windows_7', c, n, 6.6, 0.42, 'fuselage', 'row of square cabin windows: it carries men')
    m.add('gun_ring', disc(6.9, 0, 1.13, 1.22, 0.45, 'steel', seg=14), 'open gunner\'s ring on the roof behind the wing: the military Ju 52', on='fuselage')
    m.add('dorsal_gun', rod((6.9, 0, 1.22), (5.9, 0, 1.50), 0.025, 'steel', seg=5), 'MG 15 on the ring, pointing aft (a line that carries)', on='gun_ring', small_ok=True)
    return m


def k_ship(m):
    prof = np.array(m.ref['envelope'], float)                    # (radius, x)
    def env(x, sd, dz=0.0):
        r = float(np.interp(x, prof[:, 1], prof[:, 0])); dr = (float(np.interp(x + 0.5, prof[:, 1], prof[:, 0])) - r) / 0.5
        a = math.asin(dz / r); n = np.array([-dr, sd * math.cos(a), math.sin(a)]); n /= np.linalg.norm(n)
        return (x, sd * r * math.cos(a), 8.8 + dz), tuple(n)
    for sd, s in SIDES:
        c, n = env(37.0, sd); mark(m, f'us_navy_{s}', 'us_navy', c, n, 15.0, 2.6, 'envelope', 'U.S. NAVY along the envelope: whose airship it is, readable from the ground')
        c, n = env(19.5, sd); mark(m, f'number_{s}', 'k_number', c, n, 6.0, 1.9, 'envelope', 'the ship\'s own number aft')
        c, n = env(59.0, sd); mark(m, f'star_{s}', 'us_air_star', c, n, 5.0, 2.4, 'envelope', STAR + ' (envelope, forward)')
        m.add(f'depth_bomb_{s}', body([(43.6, 0.05, -1.60, -1.50), (44.0, 0.23, -1.78, -1.32), (45.0, 0.23, -1.78, -1.32), (45.3, 0.12, -1.66, -1.44)], 'steel', y=sd * 0.75),
              'depth bomb on its rack under the car: it hunts submarines when it is not spotting', on='car', small_ok=True)
    m.add('nose_battens', sh.blob_lathe([((r + 0.05) * M, x * M) for r, x in prof if x >= 68.0] , 'us_air_under', seg=24).ry(90).move(*P(0, 0, 8.8)),
          'stiffened nose: a cone of battens that keeps the bow from caving in at the mast and at speed', on='envelope', contact=['nose_cone'], convex=False)
    m.add('landing_wheel', sh.cyl(P(44.5, -0.12, -1.75), P(44.5, 0.12, -1.75), 0.36 * M, 'rubber', seg=12), 'single landing wheel under the car', on='car')
    g = Geometry.join([sh.cyl(P(74.0, sy * 1.6, 8.8 - 2.9), P(73.0 - 2.0, sy * 2.2, -6.0), 0.05 * M, 'cord', seg=4, thin=1, wear=False) for sy in (1, -1)])
    m.add('handling_lines', g._new(low=np.ones(len(g), np.int8)), 'handling lines hanging from the bow: the ground crew catch these to land it (lines that carry)',
          on='envelope', convex=False, small_ok=True)
    guns(m, 'nose_gun', [(50.9, 0, -0.1)], 0.9, 0.03, 'car', '.50 calibre in the nose of the car')
    return m


FINISH = {'p47': p47, 'bf109': bf109, 'ju87': ju87, 'b25': b25, 'c47': c47, 'ju52': ju52, 'k_ship': k_ship}


def apply(m, key):
    return FINISH[key](m)


# ---------------------------------------------------------------- paint
def _along(g, mat):
    """Corrugated sheet: lay the tile so its bands run along the airframe (x) on every face."""
    sel = np.asarray(g.mat) == mat
    if not sel.any(): return g
    Pn = np.asarray(g.P, float); UV = np.array(g.UV, float); ax = np.abs(np.asarray(g.FN, float))
    side = sel & (ax[:, 1] >= ax[:, 2])
    UV[side] = Pn[side][:, :, [0, 2]]; UV[sel & ~side] = Pn[sel & ~side][:, :, [0, 1]]
    return g._new(UV=UV)


def paint(m, key):
    """Each face in its side's upper or under colour by which way it points; glazing, openings and the airship's own
    cloth. The German blotches run on across parts (dress._wrap), as the vehicles' camouflage does."""
    side = SIDE[key]; seed = sum(map(ord, m.name))
    if key == 'k_ship': top = under = 'envelope'
    else: top, under = (f'{side}_air' if key != 'ju52' else 'de_air_corr'), f'{side}_air_under'
    for p in m.parts.values():
        g = p.geom; mats = np.asarray(g.mat, object).copy(); hull = mats == 'hull'
        if hull.any():
            mats[hull] = np.where(np.asarray(g.FN)[hull][:, 2] < -0.35, under, top)
        t = {'canvas': 'envelope' if key == 'k_ship' else f'{side}_canvas', 'glass': 'canopy_glass', 'dark': 'opening'}
        g = g.set(mat=np.array([t.get(x, x) for x in mats], object))
        if side == 'de': g = _along(g, 'de_air_corr') if key == 'ju52' else _wrap(g, 'de_air', seed)
        p.geom = g
    return m
