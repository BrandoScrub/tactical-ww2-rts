"""Infantry for both sides: artkit.figure.Biped troopers (artkit.parts.trooper) with each side's headgear, kit and
weapons, the crew-served weapons as small Machines, and the five squads posed for review.

Briefs (DESIGN_METHOD.md step 1), shared by both sides; what differs is named per part below.
  riflemen:   the line squad: bolt-action or self-loading rifles, a leader with a submachine gun. Reads as: several
              men, long guns, one short gun.
  engineers:  build, clear and burn: a flamethrower man (tanks on his back: the signature), one with a shovel, a leader.
              Reads as: backpack tanks and tools, not rifles.
  mortar:     a tube on a baseplate and bipod, a gunner kneeling at it, a loader with a bomb, a leader. Indirect fire:
              the steep tube is the read.
  machine gun: a gun on a tripod, the gunner sitting behind it, a loader with an ammunition box, a leader. Reads as: a
              low wide tripod with a long gun, men low behind it; faces one way.
  anti-tank:  a rocket tube on a man's shoulder (the long tube is the read), a loader kneeling with a rocket, a rifleman.
Silhouette difference between the sides at 40 px: the helmet (American: plain dome; German: flared skirt over the
ears and neck), the lower leg (canvas leggings against tall dark boots), and the colour (olive drab against field grey).
Weapons are modelled along +x and oversized about 1.2x like the engine's own, so they read at play size; the rocket
tubes are true length (they are long enough already).
"""
import math
import numpy as np
from artkit.parts import soldier as S
from artkit.parts.trooper import build_trooper, trooper_clips, sighted
from artkit.shapes import blob_lathe as lathe, slab as box, beam, sphere, cyl
from artkit.core.geom import T, RY, RZ, xf, Geometry
from artkit.machine import Machine
from . import kit as K

# ------------------------------------------------------------------ headgear and kit
def m1_helmet():
    """American M1: a plain deep dome with a short even brim."""
    return lathe([(8.5, 9.6), (8.1, 11.2), (7.5, 14.4), (5.6, 17.4), (0, 18.5)], 'helmet', 12).move(.3, 0, 0)

def stahlhelm():
    """German M35/40: the dome, then a skirt flaring out and down over the ears and neck, shallower over the brow."""
    m = lathe([(7.6, 11.6), (7.3, 14.6), (5.4, 17.3), (0, 18.3)], 'helmet', 12)
    skirt = lathe([(9.9, 6.8), (8.6, 9.2), (7.6, 11.6)], 'helmet', 12)
    brow = lathe([(9.0, 10.2), (7.6, 11.6)], 'helmet', 12)
    keep = lambda g, front: g.take(np.nonzero((g.P[:, :, 0].mean(1) > 2.0) == front)[0])
    return (m + keep(skirt, False) + keep(brow, True)).move(.2, 0, 0)

def canteen():   return cyl((-4, -9.6, -5), (-4, -9.6, 2), 2.6, 'canvas')
def bread_bag(): return box(-6, 0, -10.8, -8.6, -7, 1, 'canvas')
def satchel():   return box(-5, 4, 9.0, 13.0, 2, 14, 'canvas')
def ammo_box():  return box(-5, 5, -2, 2, -11, -3, 'steel')                       # hangs from a hand
def bomb():      return cyl((0, 0, -3), (0, 0, -11), 2.0, 'steel', r1=1.2) + cyl((0, 0, -11), (0, 0, -15), 1.8, 'steel', seg=6)
def rocket():    return cyl((0, 0, 4), (0, 0, -3), 1.9, 'steel', r1=1.5) + cyl((0, 0, -3), (0, 0, -14), 1.0, 'steel') + cyl((0, 0, -14), (0, 0, -17), 2.0, 'steel', seg=6)

# ------------------------------------------------------------------ weapons
def garand():
    """American self-loading rifle: full wooden handguard to near the muzzle, gas cylinder under the barrel, no bolt knob."""
    m = beam(-16, 1.5, -4.4, 1.1, -5, 1.4, -2.0, 1.2, 'wood') + box(-16.7, -16, -1.5, 1.5, -4.4, 1.1, 'steel')
    m += box(-5, 3.2, -1.5, 1.5, -1.8, 1.7, 'steel')
    m += beam(3.2, 1.4, -1.6, 1.5, 18, 1.25, -1.0, 1.5, 'wood')
    m += cyl((18, 0, .9), (25, 0, .9), 1.0, 'steel') + cyl((18, 0, -.4), (24, 0, -.4), .9, 'steel')
    m += box(23.2, 24, -.3, .3, 1.8, 3.0, 'steel')
    k = 1.25
    return dict(name='self-loading rifle', mesh=m.scaled(k), grips={'R': (-8, 0, -2), 'L': (7.5, 0, -1.5)}, muzzle=(25.5 * k, 0, .9 * k),
                sight=3.9, butt=-20.9, port=(10.8, 0.5, 13, 72, 38, 0))

def kar98():
    """German bolt-action rifle: the engine's carbine is already this shape (turned-down bolt, barrel band)."""
    w = S.carbine(); w['name'] = 'bolt-action rifle'; return w

def thompson():
    """American submachine gun: wooden butt and fore grip, box magazine, short fat barrel."""
    m = beam(-15, 1.5, -4.6, .8, -5, 1.4, -2.2, 1.0, 'wood') + box(-5, 6, -1.6, 1.6, -1.8, 1.8, 'steel')
    m += box(-4.6, -2.6, -1.0, 1.0, -5.6, -1.8, 'wood') + box(1.2, 3.6, -1.0, 1.0, -8.5, -1.8, 'steel')
    m += beam(6.5, 1.3, -2.6, .2, 12.5, 1.2, -2.2, .2, 'wood') + cyl((6, 0, .6), (16, 0, .6), 1.15, 'steel') + cyl((16, 0, .6), (18, 0, .6), 1.5, 'steel')
    k = 1.2
    return dict(name='submachine gun', mesh=m.scaled(k), grips={'R': (-4.4, 0, -4.2), 'L': (11, 0, -2.6)}, muzzle=(18 * k, 0, .6 * k),
                sight=3.8, butt=-15 * k, port=(10.5, .5, 12, 60, 24, 0))

def mp40():
    """German submachine gun: all steel, no wood: a tube receiver, a long straight magazine, a wire stock."""
    m = cyl((-6, 0, .4), (8, 0, .4), 1.6, 'steel') + cyl((8, 0, .4), (17.5, 0, .4), .95, 'steel')
    m += box(-5, -3, -1.0, 1.0, -5.4, -1.0, 'steel') + box(4.6, 6.8, -.9, .9, -10.5, -1.0, 'steel')
    m += cyl((-6, 0, -.4), (-16, 0, -2.2), .7, 'steel', seg=6) + box(-16.8, -15.8, -1.2, 1.2, -4.6, .2, 'steel')
    k = 1.2
    return dict(name='submachine gun', mesh=m.scaled(k), grips={'R': (-4.8, 0, -4.0), 'L': (6.8, 0, -7)}, muzzle=(17.5 * k, 0, .4 * k),
                sight=3.4, butt=-16.8 * k, port=(10.5, .5, 12, 60, 24, 0))

def bar():
    """American automatic rifle (BAR): a heavy rifle with a long box magazine under it and a folded bipod at the muzzle."""
    m = beam(-17, 1.5, -4.6, 1.0, -6, 1.4, -2.2, 1.3, 'wood') + box(-17.7, -17, -1.5, 1.5, -4.6, 1.0, 'steel')
    m += box(-6, 6, -1.7, 1.7, -2.2, 2.0, 'steel') + box(-1.5, 2.0, -1.0, 1.0, -8.5, -2.2, 'steel')
    m += beam(6, 1.5, -1.8, 1.0, 15, 1.3, -1.4, .8, 'wood') + cyl((6, 0, .6), (27, 0, .6), 1.15, 'steel') + cyl((27, 0, .6), (29, 0, .6), 1.5, 'steel')
    for y in (-1.3, 1.3): m += cyl((25, y, -.6), (15, y * 1.3, -2.6), .55, 'steel', seg=5)
    k = 1.2
    return dict(name='automatic rifle', mesh=m.scaled(k), grips={'R': (-5, 0, -4.0), 'L': (10.5, 0, -2.4)}, muzzle=(29 * k, 0, .6 * k),
                sight=4.6, butt=-17.7 * k, port=(11.2, .5, 11, 66, 26, 0), flash=1.25)

def mg42_light():
    """German MG 42 on its bipod: a square-section barrel shroud, a drum under the feed, the hooked stock."""
    m = beam(-19, 1.3, -5.0, 1.6, -7, 1.5, -1.6, 2.0, 'wood') + box(-7, 7, -1.7, 1.7, -2.0, 2.4, 'steel')
    m += box(-5.2, -3.2, -1.0, 1.0, -5.6, -2.0, 'wood') + cyl((1.5, 3.4, -3.0), (1.5, 3.4, 1.0), 3.4, 'steel', seg=10)
    m += box(7, 27, -1.6, 1.6, -1.2, 2.0, 'shroud') + cyl((27, 0, .4), (30, 0, .4), 1.9, 'steel', r1=1.3, seg=8)
    for y in (-1.5, 1.5): m += cyl((24, y, -1.2), (13, y * 1.4, -3.4), .55, 'steel', seg=5)
    k = 1.15
    return dict(name='light machine gun', mesh=m.scaled(k), grips={'R': (-4.6, 0, -4.2), 'L': (11, 0, -2.4)}, muzzle=(30 * k, 0, .4 * k),
                sight=4.9, butt=-19 * k, port=(11.2, .5, 11, 66, 26, 0), flash=1.3)

def m1_carbine():
    """American carbine: a short light rifle, slim stock, small magazine."""
    m = beam(-13, 1.3, -3.8, .9, -4, 1.2, -1.8, 1.0, 'wood') + box(-4, 3, -1.3, 1.3, -1.6, 1.4, 'steel') + box(-.5, 1.6, -.8, .8, -4.6, -1.6, 'steel')
    m += beam(3, 1.2, -1.4, 1.1, 11, 1.0, -.9, 1.0, 'wood') + cyl((3, 0, .7), (19, 0, .7), .85, 'steel') + box(17.6, 18.3, -.3, .3, 1.4, 2.4, 'steel')
    k = 1.25
    return dict(name='carbine', mesh=m.scaled(k), grips={'R': (-6.5, 0, -1.8), 'L': (6.5, 0, -1.3)}, muzzle=(19.5 * k, 0, .7 * k),
                sight=3.4, butt=-16.5, port=(10.5, .5, 12.5, 68, 34, 0))

def stg44():
    """German assault rifle: stamped receiver, wooden butt, the long curved magazine that marks it."""
    m = beam(-16, 1.4, -4.4, 1.2, -6, 1.4, -2.0, 1.4, 'wood') + box(-6, 8, -1.5, 1.5, -2.0, 2.0, 'steel') + box(-5, -3, -1.0, 1.0, -5.8, -2.0, 'steel')
    m += beam(2.0, 1.0, -9.5, -8.0, 4.4, 1.0, -2.0, -2.0, 'steel') + beam(.5, 1.0, -9.5, -8.6, 2.0, 1.0, -9.5, -8.0, 'steel')
    m += cyl((8, 0, 1.0), (15, 0, 1.0), 1.5, 'steel') + cyl((15, 0, .6), (22, 0, .6), .9, 'steel') + box(20.4, 21.1, -.3, .3, 1.4, 3.0, 'steel')
    k = 1.2
    return dict(name='assault rifle', mesh=m.scaled(k), grips={'R': (-4.6, 0, -4.2), 'L': (9.5, 0, -2.2)}, muzzle=(22 * k, 0, .6 * k),
                sight=4.2, butt=-16 * k, port=(10.6, .5, 12, 62, 26, 0))

def bazooka():
    """American 2.36 in rocket launcher: a thin 1.4 m tube, wooden shoulder stock and grip under it, flared tail."""
    m = cyl((-34, 0, 0), (40, 0, 0), 1.7, 'tube', seg=10) + cyl((-37, 0, 0), (-34, 0, 0), 2.6, 'tube', r1=1.7, seg=10) + cyl((40, 0, 0), (42, 0, 0), 1.7, 'tube', r1=2.4, seg=10)
    m += beam(-10, 1.2, -7.5, -1.5, -2, 1.2, -4.5, -1.5, 'wood') + box(5, 7.2, -1.0, 1.0, -6.5, -1.5, 'wood') + box(12, 13, -.4, .4, 1.5, 5, 'steel')
    return dict(name='rocket launcher', mesh=m, grips={'R': (6, 0, -4.5), 'L': (17, 0, -2.2)}, muzzle=(42, 0, 0), sight=5, butt=-6, flash=1.8)

def panzerschreck():
    """German 88 mm rocket launcher: a fat 1.6 m stovepipe with a square blast shield beside the sight."""
    m = cyl((-45, 0, 0), (45, 0, 0), 2.5, 'tube', seg=10) + cyl((-48, 0, 0), (-45, 0, 0), 3.3, 'tube', r1=2.5, seg=10)
    m += box(10, 11, -4, 9, -5, 11, 'tube') + box(2, 4.2, -1.0, 1.0, -7.5, -2.3, 'steel') + box(-10, -8, -1.0, 1.0, -7.5, -2.3, 'steel')
    m += beam(-22, 1.2, -6.5, -2.3, -14, 1.2, -4.5, -2.3, 'steel')
    return dict(name='rocket launcher', mesh=m, grips={'R': (3, 0, -5.5), 'L': (-9, 0, -5.5)}, muzzle=(45, 0, 0), sight=6, butt=-18, flash=2.2)

def shell():     return cyl((0, 0, 3), (0, 0, -9), 2.2, 'brass') + cyl((0, 0, -9), (0, 0, -15), 2.2, 'steel', r1=0.8)

# ---- loads for moving a crew weapon: carried on the right shoulder (a "weapon" spec, so the trooper's footwork applies)
def _load(name, mesh):
    return dict(name=name, mesh=mesh, grips={'R': (9, 0, -2.5), 'L': (11, 5, -3.5)}, muzzle=(20, 0, 0), sight=4, butt=-10, port=(1, -11.5, 30.8, 0, 8, 0))

def carried_mg(german=False):
    """The machine gun off its tripod, over the shoulder."""
    if german:
        m = box(-10, 10, -1.8, 1.8, -2.4, 2.6, 'steel') + beam(-27, 1.3, -4.5, 2.0, -10, 1.5, -1.5, 2.2, 'wood') + cyl((10, 0, .4), (37, 0, .4), 2.0, 'steel', seg=8)
    else:
        m = box(-17, 7, -2.0, 2.0, -3.2, 3.2, 'steel') + cyl((7, 0, .4), (35, 0, .4), 1.8, 'steel', seg=8) + box(-20, -17, -1.0, 1.0, -4.5, 1.5, 'wood')
    return _load('machine gun, carried', m)

def carried_tripod(german=False):
    """The tripod folded: three legs together, the head at the front."""
    L = 26 if german else 22
    m = box(L - 6, L, -3, 3, -3, 3, 'steel')
    for y, z in ((0, 1.6), (-1.7, -1.2), (1.7, -1.2)): m += cyl((-L, y, z), (L - 6, y, z), 1.3, 'steel', seg=6)
    return _load('tripod, carried', m)

def carried_tube(german=False):
    """The mortar tube with its bipod folded along it."""
    L, r = (30, 2.9) if german else (21, 2.3)
    m = cyl((-L, 0, 0), (L, 0, 0), r, 'steel', seg=8) + cyl((L * .2, 0, 0), (L * .2 + 4, 0, 0), r + 1.2, 'steel', seg=8)
    for y in (-1.6, 1.6): m += cyl((L * .2, y, -r - 1), (-L * .7, y, -r - 1), 1.0, 'steel', seg=5)
    return _load('mortar tube, carried', m)

def baseplate_on_back(german=False):
    w = 10.5 if german else 8.5
    return box(-13.2, -10.0, -w, w, 3, 3 + 2 * w, 'steel')

# ------------------------------------------------------------------ crew-served weapons (Machines; metres)
def tripod_mg(german=False):
    """Machine gun on a tripod. American: .30 cal M1919A4 on the low M2 tripod (box receiver, perforated jacket).
    German: MG 42 on the taller Lafette (round shroud, shoulder stock)."""
    h = 0.46 if german else 0.34
    m = Machine('MG 42 on Lafette' if german else '.30 cal M1919A4 on M2 tripod')
    m.add('head', K.slab(-0.06, 0.06, -0.06, 0.06, h - 0.10, h, 'steel'), 'tripod head: the gun traverses on it', small_ok=True)
    for nm, end in (('front_leg', (0.50, 0, 0.03)), ('rear_leg_l', (-0.52, 0.34, 0.03)), ('rear_leg_r', (-0.52, -0.34, 0.03))):
        m.add(nm, K.rod((0, 0, h - 0.05), end, 0.028), 'tripod leg: three points on the ground take the recoil', on='head', small_ok=True)
    m.add('receiver', K.slab(-0.30 if not german else -0.34, 0.16, -0.05, 0.05, h, h + 0.13, 'steel'), 'receiver: feed and lock', on='head', small_ok=True)
    m.add('barrel', K.rod((0.16, 0, h + 0.075), (0.80 if german else 0.74, 0, h + 0.075), 0.036 if german else 0.032), 'barrel in its cooling jacket: the line that points', on='receiver', small_ok=True)
    if german: m.add('stock', K.solid([(-0.34, y, h + z) for y in (-0.03, 0.03) for z in (0.02, 0.12)] + [(-0.62, y, h + z) for y in (-0.03, 0.03) for z in (-0.06, 0.10)], 'wood'), 'shoulder stock', on='receiver', small_ok=True)
    else: m.add('grip', K.slab(-0.38, -0.30, -0.025, 0.025, h - 0.04, h + 0.08, 'wood'), 'pistol grip at the back plate', on='receiver', small_ok=True)
    m.add('belt_box', K.slab(-0.12, 0.10, 0.05, 0.19, h - 0.06, h + 0.12, 'steel'), 'ammunition box hung on the left: the feed', on='receiver', small_ok=True)
    return m

def mortar(german=False):
    """Mortar: tube, baseplate, bipod. American: 60 mm M2 (small). German: 8 cm GrW 34 (half as big again)."""
    L, r, w = (1.14, 0.052, 0.30) if german else (0.76, 0.042, 0.22)
    a = math.radians(62); tip = (L * math.cos(a), 0, 0.05 + L * math.sin(a)); col = tuple(0.62 * t + (0, 0, 0.02)[i] for i, t in enumerate(tip))
    m = Machine('8 cm mortar' if german else '60 mm mortar M2')
    m.add('baseplate', K.slab(-w, w * 0.6, -w, w, 0.0, 0.06, 'steel'), 'baseplate: spreads the recoil into the ground')
    m.add('tube', K.rod((0, 0, 0.05), tip, r), 'the tube, steeply raised: bombs go in the top', on='baseplate', small_ok=True)
    m.add('collar', K.rod(tuple(c - 0.05 * d for c, d in zip(col, (math.cos(a), 0, math.sin(a)))), tuple(c + 0.05 * d for c, d in zip(col, (math.cos(a), 0, math.sin(a)))), r + 0.025),
          'collar where the bipod clamps the tube (elevation and traverse screws live here)', on='tube', small_ok=True)
    for sd, s in ((1, 'l'), (-1, 'r')):
        m.add(f'leg_{s}', K.rod((col[0], sd * (r + 0.035), col[2]), (col[0] + 0.22, sd * (0.30 if german else 0.24), 0.028), 0.025), 'bipod leg', on='collar', small_ok=True)
    return m

# ------------------------------------------------------------------ troopers
from artkit.figure import material
material('marking', (226, 222, 206), 'plain')              # white paint on a helmet

def _line(pts, r, mat, seg=5):
    m = None
    for a, b in zip(pts, pts[1:]):
        s = cyl(a, b, r, mat, seg=seg); m = s if m is None else m + s
    return m

def webbing(mat):
    """Load-carrying straps over both shoulders, crossing to a Y at the back: pale canvas on the American, black
    leather on the German. At 40 px it is two lines down the chest: the difference between a man and a uniform."""
    m = None
    for sy in (1, -1):
        s = _line([(7.2, sy * 4.0, 3), (7.7, sy * 4.5, 20), (3.6, sy * 5.4, 26.5), (-3.6, sy * 5.4, 26.5), (-7.8, sy * 4.4, 20), (-7.3, sy * 1.2, 4)], 1.05, mat)
        m = s if m is None else m + s
    return m

def cartridge_belt():
    """American M1923 belt: a broad canvas band of pockets round the waist (the German wears a narrow leather belt)."""
    return lathe([(9.25, 2.8), (9.25, 7.2)], 'canvas').scaled(.84, 1.08, 1)

def bandolier():
    """Cloth bandolier of rifle clips slung across the chest: the rifleman's mark."""
    return _line([(6.6, -6.4, 5), (7.9, 0, 15), (5.6, 6.6, 24), (-5.6, 6.6, 24), (-8.0, 0, 15), (-6.6, -6.4, 5)], 1.7, 'canvas', seg=6)

def belt_of_rounds():
    """A belt of cartridges draped round the neck: the machine gunner's mark, a brass line on field grey."""
    return _line([(7.4, -4.6, 8), (7.6, -5.0, 19), (3.0, -5.6, 26.6), (-4.4, 0, 27.2), (3.0, 5.6, 26.6), (7.6, 5.0, 19), (7.4, 4.6, 10)], 1.35, 'brass', seg=6)

def magazine_belt():
    """Automatic-rifle belt: six tall magazine pockets round the waist."""
    m = None
    for a in (-70, -42, -14, 14, 42, 70, 110, 250):
        p = box(7.6, 9.6, -1.9, 1.9, .5, 8.5, 'canvas').rz(a).scaled(.86, 1.10, 1); m = p if m is None else m + p
    return m

def helmet_stripe():
    """White bar on the back of the helmet (and a smaller one on the front): the mark men follow in the dark; here
    it is what tells the squad leader from his riflemen."""
    return box(-8.6, -7.0, -3.4, 3.4, 11.4, 13.6, 'marking').move(.3, 0, 0) + box(7.3, 8.6, -1.0, 1.0, 11.6, 14.6, 'marking').move(.3, 0, 0)

def field_cap():
    """German M43 field cap: a soft peaked cap instead of the helmet. The leader's silhouette."""
    m = lathe([(6.3, 10.6), (6.5, 15.0), (5.9, 16.6), (0, 17.0)], 'tunic', 10)
    m += box(5.0, 10.2, -4.2, 4.2, 10.6, 11.6, 'tunic')                      # the peak
    m += sphere(1.0, 'brass', 6, 4).move(6.4, 0, 14.0)
    return m.move(.3, 0, .6)

def shelter_roll():
    """Camouflage shelter quarter rolled on the back of the belt: a brown-green bar on the German's back."""
    return cyl((-9.2, -7.5, 8.5), (-9.2, 7.5, 8.5), 2.7, 'de_smock', seg=8)

def trooper(side, weapon, kit=()):
    """side 'us' or 'de'. kit: any of 'pack', 'flame', 'shovel', 'satchel', 'baseplate', 'cape' (scrim cape), 'scrim'
    (netted helmet), and the role marks: 'leader' (American: white helmet bar, field-glass case; German: field cap,
    field-glass case), 'bandolier' (rifleman), 'belt' (machine gunner: belt of rounds / magazine belt), 'cover'
    (camouflage helmet cover)."""
    us = side == 'us'
    chest = [(webbing('canvas' if us else 'leather'), 'webbing')]
    pelvis = [(S.ammo_pouches().mat_as('canvas') if us else S.ammo_pouches(), 'ammunition pouches')]
    if us: pelvis.append((cartridge_belt(), 'cartridge belt'))
    if 'pack' in kit: chest.append((S.pack(), 'pack'))
    elif not us and not any(k in kit for k in ('flame', 'baseplate', 'cape')): chest.append((shelter_roll(), 'shelter quarter'))
    if 'flame' in kit: chest += [(S.fuel_tanks(), 'flamethrower tanks'), (S.fuel_hose(), 'fuel hose')]
    if 'shovel' in kit: chest.append((S.shovel_on_shoulder(), 'shovel'))
    if 'satchel' in kit: chest.append((satchel(), 'satchel charge'))
    if 'baseplate' in kit: chest.append((baseplate_on_back(not us), 'mortar baseplate'))
    if 'cape' in kit: chest.append((S.camo_cape(), 'scrim cape'))
    if 'bandolier' in kit: chest.append((bandolier(), 'bandolier'))
    if 'belt' in kit:
        if us: pelvis.append((magazine_belt(), 'magazine belt'))
        else: chest.append((belt_of_rounds(), 'belt of rounds'))
    if 'leader' in kit: pelvis.append((S.field_glasses(), 'field-glass case'))
    pelvis.append((canteen(), 'canteen') if us else (S.canister(), 'gas mask tin'))
    if not us: pelvis.append((bread_bag(), 'bread bag'))
    if 'scrim' in kit: hat = (S.scrim_helmet(), 'netted helmet')
    elif us: hat = ((m1_helmet() + helmet_stripe(), 'M1 helmet with a leader\'s bar') if 'leader' in kit else (m1_helmet(), 'M1 helmet'))
    elif 'leader' in kit: hat = (field_cap(), 'field cap')
    elif 'cover' in kit: hat = (stahlhelm().mat_as('de_smock'), 'steel helmet in a camouflage cover')
    else: hat = (stahlhelm(), 'steel helmet')
    u = build_trooper(f'{side} trooper', weapon, hat, chest=chest, pelvis=pelvis)
    if not us:                                       # tall boots instead of leggings
        u.parts = [(b, (g.mat_as('boot') if b.startswith('shin') else g), n, w) for b, g, n, w in u.parts]
    return u

def carry(u, bone, mesh, name):
    u.attach(bone, mesh, name); return u

# ------------------------------------------------------------------ poses
KNEEL = dict(pelvis=(0, 0, -23), pelvis_rot=(0, 6, 0), chest_rot=(0, 6, 0), foot_L=(13, 6, 0, 0, 4), foot_R=(-21, -6, 0, 72, -4),
             knee_L=(1, 0, .6), knee_R=(1, 0, -1.2))
SIT = dict(pelvis=(-6, 0, -41), pelvis_rot=(0, -4, 0), chest_rot=(0, 16, 0), foot_L=(22, 12, 0, -10, 20), foot_R=(22, -12, 0, -10, -20),
           knee_L=(.4, .5, 1), knee_R=(.4, -.5, 1))

def stances(u):
    _, st, _ = trooper_clips(u, fire='auto'); return st

def reach(u, pose, **targets):
    """Free hands to world points: reach(u, pose, L=(x, y, z), R=...)."""
    pose = u.pose(**pose) if 'flash' not in pose else dict(pose)
    inv = np.linalg.inv(u.solve(pose)['chest'])
    for sd, p in targets.items():
        pose['hand_' + sd] = np.asarray(xf(inv, p), float); pose['grip_' + sd] = np.array([0.0])
    return pose

def shouldered(u, body):
    """A tube on the right shoulder, level, pointing along +x."""
    pose = u.pose(grip_L=1, grip_R=1, **body)
    s = xf(u.solve(pose)['chest'], (1, -11.5, 30.6))
    pose['prop'] = u.prop_from_world(pose, T(*s) @ T(-u.weapon['butt'], 0, 0)); return pose

STAND_TUBE = dict(pelvis=(0, 0, -3), pelvis_rot=(-22, 3, 0), chest_rot=(-8, 4, 0), head_rot=(28, 2, 0), foot_L=(10, 4, 0, 0, -6), foot_R=(-9, -6, 0, 0, -48))

def place(u, pose, x=0, y=0, heading=0):
    return u.build(pose, heading)[0].move(x, y, 0)

def slung(u, pose):
    """The weapon out of the hands, hung across the back (crew who work with both hands)."""
    p = dict(pose); p['prop'] = np.array([-9.0, 2, 14, 100, 62, 0]); p['grip_L'] = np.array([0.0]); p['grip_R'] = np.array([0.0]); return p

# ------------------------------------------------------------------ squads
def squads(side):
    """[(squad name, [(label, geometry)]), ...]: every model in the squad, posed, standing on z = 0, facing +x."""
    us = side == 'us'
    rifle, smg = (garand, thompson) if us else (kar98, mp40)
    out = []
    # riflemen
    a, b, c = trooper(side, rifle(), ['pack']), trooper(side, rifle()), trooper(side, smg())
    out.append(('Riflemen' if us else 'Grenadiers', [
        ('rifleman, aiming', place(a, stances(a)['aim'], 10, 96)), ('rifleman, ready', place(b, stances(b)['ready'], -20, 32)),
        ('rifleman, kneeling', place(b, sighted(b, KNEEL), 16, -32)), ('leader, submachine gun', place(c, stances(c)['ready'], -24, -96))]))
    # engineers
    f, s, l = trooper(side, S.flame_gun(), ['flame']), trooper(side, rifle(), ['shovel']), trooper(side, smg(), ['satchel'])
    out.append(('Engineers' if us else 'Pioneers', [
        ('flamethrower', place(f, stances(f)['aim'], 10, 66)), ('sapper with shovel', place(s, stances(s)['ready'], -10, 0)),
        ('leader with satchel charge', place(l, sighted(l, KNEEL), 12, -66))]))
    # mortar
    g, ld, ob = trooper(side, rifle()), carry(trooper(side, rifle()), 'hand_R', bomb(), 'mortar bomb'), trooper(side, smg())
    mt = mortar(not us); tip = np.array(mt.parts['tube'].geom.bounds()[1]); col = np.array(mt.parts['collar'].geom.bounds()).mean(0)
    gp = reach(g, slung(g, g.pose(**KNEEL)), L=col + (0, 6, 0), R=col + (-6, -2, -8))
    lp = reach(ld, slung(ld, ld.pose(**{**KNEEL, 'chest_rot': (-30, 10, 0)})), R=(8, -30, 62), L=(10, -20, 40))
    out.append(('Mortar team', [('mortar', mt.geometry()), ('gunner', place(g, gp, -20, 26)), ('loader with bomb', place(ld, lp, 4, -34, 80)),
                                ('leader', place(ob, stances(ob)['ready'], -52, -6))]))
    # machine gun
    g, ld, ob = trooper(side, rifle()), carry(trooper(side, rifle()), 'hand_L', ammo_box(), 'ammunition box'), trooper(side, smg())
    mg = tripod_mg(not us); back = np.array(mg.parts['receiver'].geom.bounds()[0]); h = np.array(mg.parts['receiver'].geom.bounds()[1])[2]
    gp = reach(g, slung(g, g.pose(**SIT)), L=(back[0] + 2, 3, h - 3), R=(back[0] - 2, -3, h - 4))
    lp = slung(ld, ld.pose(**KNEEL))
    out.append(('Machine gun team', [('gun on tripod', mg.geometry()), ('gunner', place(g, gp, back[0] - 30, 0)),
                                     ('loader with ammunition', place(ld, lp, -14, 34, -20)), ('leader', place(ob, stances(ob)['ready'], -70, -30))]))
    # anti-tank
    t = trooper(side, bazooka() if us else panzerschreck()); ld = carry(trooper(side, rifle()), 'hand_R', rocket(), 'rocket'); r = trooper(side, rifle())
    lp = reach(ld, slung(ld, ld.pose(**KNEEL)), R=(12, -8, 44))
    out.append(('Bazooka team' if us else 'Panzerschreck team', [
        ('gunner, tube shouldered', place(t, shouldered(t, STAND_TUBE))), ('loader with rocket', place(ld, lp, -34, -34, 20)),
        ('rifleman', place(r, stances(r)['aim'], -6, 44))]))
    return out


RIDE = dict(pelvis=(-4, 0, -22), pelvis_rot=(0, 14, 0), chest_rot=(0, 12, 0), head_rot=(0, -22, 0), foot_L=(6, 11, 0, 0, 10), foot_R=(6, -11, 0, 0, -10),
            knee_L=(1, .5, .4), knee_R=(1, -.5, .4))
STAND = dict(pelvis=(0, 0, -2), chest_rot=(0, 6, 0), foot_L=(2, 6, 0, 0, 6), foot_R=(-2, -6, 0, 0, -6))

def crewman(side, body, at, L=None, R=None):
    """A vehicle crewman as plain geometry in the vehicle's frame (units): body is a pose dict (SIT, RIDE, STAND),
    `at` where the figure's ground origin goes, L / R the points his hands hold (vehicle frame, units)."""
    from .dress import dress
    u = trooper(side, kar98()); u.parts = [p for p in u.parts if p[0] != 'prop']
    dress(u, side)
    at = np.asarray(at, float); tg = {k: np.asarray(v, float) - at for k, v in (('L', L), ('R', R)) if v is not None}
    pose = reach(u, u.pose(**body), **tg) if tg else u.pose(**body)
    return u.build(pose, 0.0)[0].move(*at)

CREW = [('crew weapon', '.30 cal on tripod', lambda: tripod_mg(False)), ('crew weapon', 'MG 42 on Lafette', lambda: tripod_mg(True)),
        ('crew weapon', '60 mm mortar', lambda: mortar(False)), ('crew weapon', '8 cm mortar', lambda: mortar(True))]
ALL = CREW
