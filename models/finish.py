"""The finishing pass on the vehicle blockouts (DESIGN_METHOD.md step 6, pass 3): tertiary detail, only where it
helps the read. One function per vehicle, applied by roster.vehicles() to the agreed blockout before it is painted;
the blockouts themselves (models/*_vehicles*.py, tools/render.py) are unchanged, so the two can still be compared.

What every vehicle gets, and why:
  markings   the national marking where the real vehicle carried it (white star: hood, glacis, hull sides; Balkenkreuz:
             hull sides; red-and-white turret numbers on German tanks). At play size it is one bright spot that says
             whose it is, on top of the paint colour.
  stowage    bedrolls, crates, spare track, tools, cans: a vehicle that has been lived in. Pale canvas and dark steel
             break the single paint colour into the value blocks the eye reads at play size.
  the face   headlamps, grilles, glass: which end is the front.
  the role   whatever states the job: heads in an open turret (thinly armoured), skirts (late-war German armour),
             a radio set and whip on the scout car, packs on the troop carrier.
German armour wears the three-colour scheme (material hull -> de_camo, see roster / dress.paint); soft-skins stay
plain dark yellow. Every part still has its reason and its mount, and Machine.check() must stay empty.

References (real vehicles; nothing copied from another game's models): Willys MB, M8, M5A1, M4A3, M26, M3 half-track,
M10, CCKW, M24 survivors and wartime photographs of how crews stowed them; BMW R75, Sd.Kfz. 222 and 251, Panzer II F,
Panzer IV H (turret Schürzen), Panther G (hull skirt strip, cleaning-rod tube), StuG III G (hull Schürzen on rails,
often with a plate missing), Tiger I (tow cables along the roof, spare track on the nose), Opel Blitz."""
import math
import numpy as np
from artkit import shapes as sh
from .kit import *

STAR = 'white star: the Allied recognition mark, here where the real vehicle carried it'
CROSS = 'Balkenkreuz on the hull side: the German national marking'
NUM = 'turret number, red with a white edge: company, platoon, vehicle; the one bright accent on a German tank'
GLASS = 'glass: a dark pane with a glint, so the cab reads as a cab'
GRILLE = 'engine deck grille: where the engine breathes; a dark patch that marks the rear'
SIDES = ((1, 'l'), (-1, 'r'))


def plate_side(rx, tz, a, b, c, h, inset, sd, y=0.0):
    """Centre and normal of a plate_turret's side face."""
    return (rx, y + sd * (b - inset / 2), tz + h / 2), (0.0, sd * h, inset)


def round_side(m, name, decal, rx, r, z, sd, w, h, on, why):
    """A marking on the side of a round (cast) turret: a flat quad tangent to the wall, sunk a hair at its middle so
    its ends stand no more than a unit proud (keep w under about 0.6 r)."""
    mark(m, name, decal, (rx, sd * (r - 0.012), z), (0, sd, 0), w, h, on, why)


# ================================================================ American
def jeep(m):
    mark(m, 'hood_star', 'us_star', (2.56, 0, 0.990), (0.058, 0, 1), 0.56, 0.56, 'hood', STAR)
    mark(m, 'grille', 'us_grille', (3.08, 0, 0.74), (1, 0, 0), 0.66, 0.40, 'hood', 'slotted radiator grille: the jeep face')
    for sd, s in SIDES:
        lamp(m, f'lamp_{s}', 2.98, sd * 0.54, 0.93, f'fender_{s}', r=0.08)
    mark(m, 'glass_front', 'glass', (2.03, 0, 1.27), (1, 0, 0), 1.22, 0.40, 'windscreen', GLASS)
    mark(m, 'glass_back', 'glass', (1.97, 0, 1.27), (-1, 0, 0), 1.22, 0.40, 'windscreen', GLASS)
    m.add('radio', slab(0.36, 0.72, -0.76, -0.52, 0.98, 1.30, 'steel'), 'radio set on the wheel arch: a scout reports what it sees', on='rear_arch_r')
    aerial(m, 'aerial', 0.24, -0.64, 0.98, 1.55, 'rear_arch_r', lean=0.25)
    tool(m, 'shovel', (1.22, 0.525, 0.72), (1.92, 0.525, 0.72), 'tub', 'shovel', wall=True)
    roll(m, 'bumper_roll', (3.25, -0.52, 0.67), (3.25, 0.52, 0.67), 0.09, 'bumper')
    m.add('pack', slab(0.30, 0.82, 0.52, 0.76, 0.98, 1.17, 'canvas'), 'musette bags on the wheel arch', on='rear_arch_l')


def greyhound(m):
    tz = 1.66
    for sd, s in SIDES:
        mark(m, f'star_{s}', 'us_star', (1.25, sd * 1.075, 1.33), (0, sd * 0.54, 0.25), 0.46, 0.46, 'upper_hull', STAR)
        lamp(m, f'lamp_{s}', 3.84, sd * 0.90, 1.37, 'upper_hull')
    m.add('well', disc(2.38, 0, tz + 0.50, tz + 0.515, 0.62, 'opening'), 'the open turret top: a dark well; thin armour, no roof', on='turret')
    crew(m, 'commander', 'us', 2.26, 0.27, tz + 0.50, 'turret', through=('well', 'ring_guard', 'upper_hull', 'lower_hull'))
    crew(m, 'gunner', 'us', 2.50, -0.27, tz + 0.50, 'turret', through=('well', 'ring_guard', 'upper_hull', 'lower_hull'), show=0.40)
    mark(m, 'deck_grille', 'deck_slats', (1.05, 0, 1.60), UP, 1.30, 0.62, 'upper_hull', GRILLE)
    roll(m, 'deck_roll', (0.52, -0.70, 1.69), (0.52, 0.70, 1.69), 0.10, 'upper_hull')
    aerial(m, 'aerial', 0.55, 0.86, 1.60, 1.6, 'upper_hull', lean=0.3)


def stuart(m):
    tz = 1.62
    for sd, s in SIDES:
        mark(m, f'star_{s}', 'us_star', (1.55, sd * 1.12, 1.36), (0, sd, 0), 0.36, 0.36, 'upper_hull', STAR)
        lamp(m, f'lamp_{s}', 3.70, sd * 0.92, 1.42, 'upper_hull', r=0.08)
    for sd, s in SIDES: round_side(m, f'turret_star_{s}', 'us_star', 2.20, 0.64, tz + 0.22, sd, 0.24, 0.24, 'turret', STAR)
    mark(m, 'glacis_star', 'us_star', (3.72, 0.12, 1.317), (0.42, 0, 0.90), 0.42, 0.42, 'upper_hull', STAR)
    mark(m, 'deck_grille', 'deck_slats', (0.72, 0, 1.70), UP, 1.50, 0.86, 'engine_deck', GRILLE)
    roll(m, 'tail_roll', (-0.02, -0.62, 1.62), (-0.02, 0.62, 1.62), 0.10, 'rear_box')
    tool(m, 'shovel', (2.00, 1.145, 1.44), (2.85, 1.145, 1.44), 'upper_hull', 'shovel', wall=True)
    links(m, 'spare_links', 2.20, 3.00, -1.185, -1.12, 1.26, 1.48, 'upper_hull')
    aerial(m, 'aerial', 2.20 - 0.80, -0.22, tz + 0.46, 1.3, 'bustle', lean=0.25)


def sherman(m):
    """The engine's own M4A3 blockout is built round its tile (x - 4, y + 80 units): these parts are written about the
    centre line like every other vehicle, then moved to match."""
    before = set(m.parts)
    RX, tz = 2.90, 1.95
    gz = lambda x: 1.88 - (x - 4.25) * (0.76 / 1.37)
    for sd, s in SIDES:
        mark(m, f'star_{s}', 'us_star', (1.55, sd * 1.31, 1.50), (0, sd, 0), 0.52, 0.52, 'upper_hull', STAR)
        mark(m, f'serial_{s}', 'us_serial', (0.62, sd * 1.31, 1.50), (0, sd, 0), 0.80, 0.15, 'upper_hull', 'registration number in white: every US Army vehicle wore one')
        links(m, f'links_{s}', 2.75, 3.75, sd * 1.31, sd * 1.38, 1.46, 1.70, 'upper_hull')
        lamp(m, f'lamp_{s}', 4.40, sd * 1.10, gz(4.47) + 0.085, 'upper_hull', r=0.08)
    for sd, s in SIDES: round_side(m, f'turret_star_{s}', 'us_star', RX, 1.065, tz + 0.40, sd, 0.44, 0.44, 'turret', STAR)
    mark(m, 'glacis_star', 'us_star', (5.05, 0, gz(5.05)), (0.76, 0, 1.37), 0.50, 0.50, 'upper_hull', STAR)
    mark(m, 'deck_grille', 'deck_slats', (0.80, 0, 1.88), UP, 1.70, 1.00, 'upper_hull', GRILLE)
    roll(m, 'tail_roll', (-0.11, -0.95, 1.56), (-0.11, 0.95, 1.56), 0.12, 'upper_hull')
    crate(m, 'crate', 0.12, 0.62, 0.62, 1.20, 1.88, 2.12, 'upper_hull')
    roll(m, 'deck_roll', (0.36, -1.15, 1.97), (0.36, -0.30, 1.97), 0.10, 'upper_hull')
    tool(m, 'shovel', (0.95, 1.18, 1.905), (1.72, 1.18, 1.905), 'upper_hull', 'shovel')
    aerial(m, 'aerial', RX - 1.18, -0.30, tz + 0.64, 1.5, 'bustle', lean=0.25)
    m.add('aa_post', disc(RX - 0.52, 0, tz + 0.90, tz + 1.26, 0.04), 'pintle on the turret roof for the heavy machine gun', on='turret', small_ok=True)
    m.add('aa_gun', rod((RX - 0.98, 0, tz + 1.30), (RX + 0.22, 0, tz + 1.30), 0.04), '.50 cal on the roof: a second line over the turret, an American mark', on='aa_post', small_ok=True)
    for n in set(m.parts) - before: m.parts[n].geom = m.parts[n].geom.move(-4.0, 80.0, 0.0)


def at57(m):
    m.add('apron', slab(0.29, 0.32, -0.62, 0.62, 0.14, 0.42), 'hinged apron under the shield: closes the gap to the ground', on='saddle')
    m.add('sight', slab(0.18, 0.30, 0.20, 0.34, 1.26, 1.40, 'steel'), "gunner's sight over the shield top, left of the barrel", on='shield_l', small_ok=True)


def pershing(m):
    RX, tz = 3.25, 1.81
    gz = lambda x: 1.75 - (x - 4.65) * (0.53 / 1.35)
    for sd, s in SIDES:
        mark(m, f'star_{s}', 'us_star', (1.55, sd * 1.72, 1.48), (0, sd, 0), 0.42, 0.42, 'upper_hull', STAR)
        mark(m, f'serial_{s}', 'us_serial', (3.10, sd * 1.72, 1.50), (0, sd, 0), 0.90, 0.16, 'upper_hull', 'registration number in white')
        lamp(m, f'lamp_{s}', 5.20, sd * 1.38, gz(5.27) + 0.095, 'upper_hull')
        roll(m, f'bustle_roll_{s}', (RX - 2.02, sd * 0.10, tz + 0.38), (RX - 2.02, sd * 0.42, tz + 0.38), 0.10, 'bustle', small_ok=True)
    for sd, s in SIDES: round_side(m, f'turret_star_{s}', 'us_star', RX, 1.05, tz + 0.29, sd, 0.36, 0.36, 'turret', STAR)
    mark(m, 'glacis_star', 'us_star', (5.42, 0.15, gz(5.42)), (0.53, 0, 1.35), 0.54, 0.54, 'upper_hull', STAR)
    mark(m, 'deck_grille', 'deck_slats', (1.535, 0, 1.80), UP, 2.20, 0.92, 'engine_grille', GRILLE)
    tool(m, 'shovel', (2.50, -1.685, 1.84), (3.70, -1.685, 1.84), 'fender_bin_r', 'shovel', wall=True)
    m.add('exhaust', rod((0.02, -0.38, 1.46), (0.02, 0.38, 1.46), 0.10, 'exhaust'), 'muffler across the tail plate: marks the rear', on='upper_hull')
    crate(m, 'crate', 0.22, 0.82, -0.45, 0.50, 1.70, 1.97, 'upper_hull')
    aerial(m, 'aerial', RX - 1.62, -0.36, tz + 0.58, 1.6, 'bustle', lean=0.25)


def halftrack(m):
    mark(m, 'hood_star', 'us_star_ring', (4.82, 0, 1.4204), (0.12, 0, 1.45), 0.74, 0.74, 'hood', STAR)
    for sd, s in SIDES:
        mark(m, f'serial_{s}', 'us_serial', (4.82, sd * 0.50, 1.14), (0, sd, 0), 0.84, 0.15, 'hood', 'registration number on the hood side')
        mark(m, f'star_{s}', 'us_star', (0.72, sd * 1.08, 1.40), (0, sd, 0), 0.40, 0.40, f'side_{s}', STAR)
        for k, x in enumerate((1.25, 2.05)):
            y0, y1 = sorted((sd * 1.08, sd * 1.22))
            m.add(f'pack_{s}{k}', slab(x, x + 0.48, y0, y1, 1.36, 1.66, 'canvas'), 'packs and bedrolls hung on the bay side: a squad lives out of this vehicle', on=f'side_{s}')
        y0, y1 = sorted((sd * 1.08, sd * 1.24))
        m.add(f'can_{s}', slab(3.68, 4.02, y0, y1, 1.00, 1.46, 'steel'), 'jerry can racked on the cab side', on='cab')
        lamp(m, f'lamp_{s}', 5.18, sd * 0.78, 1.05, f'fender_{s}')
        mark(m, f'glass_{s}', 'glass', (4.08, sd * 0.50, 1.71), (1, 0, 0), 0.78, 0.26, 'windscreen', GLASS)
    roll(m, 'tail_roll', (0.27, -0.80, 1.32), (0.27, 0.80, 1.32), 0.10, 'tail')
    aerial(m, 'aerial', 3.45, -1.05, 1.72, 1.6, 'side_r', lean=0.25)


def wolverine(m):
    RX, tz = 2.90, 1.82
    gz = lambda x: 1.76 - (x - 4.30) * (0.64 / 1.32)
    through = ('well', 'ring_guard', 'upper_hull')
    for sd, s in SIDES:
        mark(m, f'star_{s}', 'us_star', (1.50, sd * 1.28, 1.44), (0, sd * 0.64, 0.44), 0.46, 0.46, 'upper_hull', STAR)
        lamp(m, f'lamp_{s}', 4.86, sd * 1.02, gz(4.93) + 0.095, 'upper_hull')
        for k, x in enumerate((2.6, 3.3, 4.0)):
            m.add(f'boss_{s}{k}', sh.cyl(P(x, sd * 1.28, 1.44), P(x, sd * 1.325, 1.505), 0.10 * M, 'hull', seg=8),
                  'bolt boss for add-on armour: the row of studs that marks an M10', on='upper_hull', small_ok=True)
    mark(m, 'glacis_star', 'us_star', (5.02, 0, gz(5.02)), (0.64, 0, 1.32), 0.50, 0.50, 'upper_hull', STAR)
    mark(m, 'deck_grille', 'deck_slats', (1.05, 0, 1.80), UP, 1.70, 1.00, 'engine_grille', GRILLE)
    crew(m, 'commander', 'us', RX - 0.28, 0.34, tz + 0.64, 'turret', through=through)
    crew(m, 'loader', 'us', RX - 0.05, -0.36, tz + 0.64, 'turret', through=through + ('lower_hull',), show=0.42)
    roll(m, 'side_roll', (0.55, 1.50, 1.215), (1.35, 1.50, 1.215), 0.09, 'upper_hull')
    aerial(m, 'aerial', 0.52, -0.96, 1.76, 1.6, 'upper_hull', lean=0.3)


def truck(m):
    mark(m, 'hood_star', 'us_star', (5.47, 0, 1.4605), (0.12, 0, 1.15), 0.60, 0.60, 'hood', STAR)
    mark(m, 'grille', 'us_truck_grille', (6.085, 0, 1.09), (0.62, 0, -0.07), 0.84, 0.52, 'hood', 'radiator grille behind its brush guard: the truck face')
    mark(m, 'windscreen', 'glass', (4.80, 0, 1.78), (1, 0, 0), 1.50, 0.34, 'cab_top', GLASS)
    for sd, s in SIDES:
        mark(m, f'door_star_{s}', 'us_star', (4.42, sd * 0.92, 1.18), (0, sd, 0), 0.42, 0.42, 'cab', STAR)
        mark(m, f'serial_{s}', 'us_serial', (5.45, sd * 0.50, 1.16), (0, sd, 0), 0.84, 0.15, 'hood', 'registration number on the hood side')
        lamp(m, f'lamp_{s}', 5.72, sd * 0.80, 1.10, f'fender_{s}')
    sec = [(-1.08, 1.62), (-1.02, 2.20), (-0.60, 2.52), (0, 2.58), (0.60, 2.52), (1.02, 2.20), (1.08, 1.62)]
    for k, x in enumerate((0.70, 1.55, 2.40, 3.25)):
        hoop = [(x + dx, y * 1.012, 1.62 + (z - 1.62) * 1.02) for y, z in sec for dx in (-0.035, 0.035)]
        m.add(f'bow_{k}', solid(hoop, 'canvas'), 'the tilt pulled tight over a bow: ribs that say canvas, not a steel box', on='tilt')
    m.add('can', slab(4.02, 4.36, 0.92, 1.08, 0.80, 1.26, 'steel'), 'jerry can on the running board', on='cab')


def chaffee(m):
    RX, tz = 2.40, 1.68
    gz = lambda x: 1.62 - (x - 3.55) * (0.42 / 1.20)
    for sd, s in SIDES:
        mark(m, f'star_{s}', 'us_star', (1.40, sd * 1.365, 1.41), (0, sd * 0.42, 0.17), 0.36, 0.36, 'upper_hull', STAR)
        lamp(m, f'lamp_{s}', 4.18, sd * 1.05, gz(4.25) + 0.085, 'upper_hull', r=0.08)
        roll(m, f'bustle_roll_{s}', (RX - 1.39, sd * 0.06, tz + 0.32), (RX - 1.39, sd * 0.42, tz + 0.32), 0.09, 'bustle', small_ok=True)
    for sd, s in SIDES: round_side(m, f'turret_star_{s}', 'us_star', RX, 0.84, tz + 0.25, sd, 0.28, 0.28, 'turret', STAR)
    mark(m, 'glacis_star', 'us_star', (4.18, 0.18, gz(4.18)), (0.42, 0, 1.20), 0.46, 0.46, 'upper_hull', STAR)
    mark(m, 'deck_grille', 'deck_slats', (0.875, 0, 1.66), UP, 1.80, 0.80, 'engine_grille', GRILLE)
    aerial(m, 'aerial', RX - 1.02, 0.30, tz + 0.50, 1.4, 'bustle', lean=0.25)


# ================================================================ German
def _guard(m, name, x, y, r, w, on, wheel_name, a0=28, a1=152):
    """A mudguard: the cap of a circle over a wheel (hull paint)."""
    pts = [(x + (r + 0.05) * math.cos(math.radians(a)), yy, r + (r + 0.05) * math.sin(math.radians(a))) for a in range(a0, a1 + 1, 12) for yy in (y - w / 2, y + w / 2)]
    m.add(name, solid(pts), 'mudguard over the wheel: pressed steel in the vehicle paint, so the machine wears its side\'s colour', on=on, contact=[wheel_name])


def kradschuetzen(m):
    _guard(m, 'rear_guard', 0.40, 0.40, 0.34, 0.17, 'seat', 'rear_wheel')
    _guard(m, 'front_guard', 1.95, 0.40, 0.34, 0.17, 'fork_l', 'front_wheel', a0=40, a1=150)
    _guard(m, 'sidecar_guard', 0.87, -0.68, 0.34, 0.17, 'sidecar', 'sidecar_wheel')
    m.add('pannier', slab(0.24, 0.60, 0.53, 0.66, 0.40, 0.64, 'canvas'), 'saddle bag beside the rear wheel', on='stay_a')
    m.add('exhaust', rod((1.05, 0.63, 0.31), (0.12, 0.60, 0.36), 0.04, 'exhaust'), 'exhaust pipe running back from the cylinder (a line that carries)', on='engine', small_ok=True)
    mark(m, 'plate', 'de_plate', (2.12, -0.31, 0.62), (1, 0, 0), 0.26, 0.15, 'sidecar', 'number plate on the sidecar nose')


def sdkfz222(m):
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (1.22, sd * 0.785, 1.23), (0, sd * 0.54, 0.33), 0.34, 0.34, 'upper_hull', CROSS)
        lamp(m, f'lamp_{s}', 4.16, sd * 0.50, 1.165, 'upper_hull', r=0.08)
        m.add(f'width_pole_{s}', rod((4.40, sd * 0.47, 1.02), (4.40, sd * 0.47, 1.50), 0.015, seg=5),
              'width indicator on the nose corner: the driver cannot see his own front wheels (a line that carries)', on='upper_hull', small_ok=True)
    mark(m, 'plate', 'de_plate', (4.60, 0, 0.87), (1, 0, 0), 0.50, 0.15, 'lower_hull', 'number plate on the nose')
    aerial(m, 'aerial', 1.00, -0.50, 1.50, 1.4, 'upper_hull', lean=0.25)
    


def panzer2(m):
    tz = 1.54
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (1.25, sd * 1.10, 1.305), (0, sd, 0), 0.28, 0.28, 'upper_hull', CROSS)
        c, n = plate_side(2.30, tz, 0.62, 0.60, 0.22, 0.42, 0.08, sd, y=0.08)
        mark(m, f'number_{s}', 'de_num_131', c, n, 0.50, 0.26, 'turret', NUM)
    mark(m, 'deck_grille', 'deck_slats', (0.68, 0, 1.48), UP, 1.40, 0.80, 'upper_hull', GRILLE)
    m.add('spare_tracks', solid(across([(3.75, 1.11), (4.35, 0.99), (4.37, 1.055), (3.77, 1.175)], -0.42, 0.42), 'steel'),
          'spare track links on the nose: extra armour, and a dark band across the front', on='lower_hull')
    m.add('jack', slab(1.00, 1.42, 0.80, 1.06, 1.48, 1.62, 'steel'), 'jack block on the track guard', on='upper_hull')
    tool(m, 'shovel', (1.65, 0.96, 1.505), (2.70, 0.96, 1.505), 'upper_hull', 'shovel')
    lamp(m, 'lamp', 4.15, 0.94, 1.245, 'mudguard_l', r=0.08)
    aerial(m, 'aerial', 0.60, -0.98, 1.48, 1.4, 'upper_hull', lean=0.25)


def panzer4(m):
    RX, tz = 3.02, 1.76
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (3.35, sd * 1.42, 1.48), (0, sd, 0), 0.34, 0.34, 'upper_hull', CROSS)
        y0, y1 = sorted((sd * 0.76, sd * 1.05))
        m.add(f'skirt_bracket_{s}', slab(RX - 0.40, RX - 0.30, y0, y1, tz + 0.38, tz + 0.44, 'steel'), 'bracket holding the skirt plate off the turret side', on='turret', small_ok=True)
        y0, y1 = sorted((sd * 1.03, sd * 1.07))
        m.add(f'skirt_{s}', slab(RX - 1.50, RX + 0.42, y0, y1, tz + 0.06, tz + 0.58), 'turret Schürzen: a thin plate standing off the armour against anti-tank rifles and hollow charges; the mark of the late Panzer IV', on=f'skirt_bracket_{s}')
        mark(m, f'number_{s}', 'de_num_324', (RX - 0.55, sd * 1.07, tz + 0.32), (0, sd, 0), 0.62, 0.30, f'skirt_{s}', NUM)
        mark(m, f'deck_grille_{s}', 'deck_slats', (0.82, sd * 0.72, 1.70), UP, 1.00, 1.00, 'upper_hull', GRILLE)
    m.add('skirt_rear', slab(RX - 1.54, RX - 1.50, -1.07, 1.07, tz + 0.06, tz + 0.58), 'the skirt carried round the turret rear, behind the bin', on='skirt_l', contact=['skirt_r'])
    for k, x in enumerate((1.00, 1.58)):
        m.add(f'spare_wheel_{k}', wheel(x, 1.46, 1.48, 0.235, 0.08), 'spare road wheel on the hull side: small wheels wear out', on='upper_hull')
    tool(m, 'shovel', (0.80, -1.445, 1.50), (2.00, -1.445, 1.50), 'upper_hull', 'shovel', wall=True)
    lamp(m, 'lamp', 5.25, 1.20, 1.37, 'mudguard_l')
    aerial(m, 'aerial', 0.32, -1.30, 1.70, 1.5, 'upper_hull', lean=0.3)


def pak40(m):
    m.add('apron', slab(0.30, 0.33, -0.55, 0.55, 0.12, 0.44), 'hinged apron under the shield', on='saddle')


def panther(m):
    RX, tz = 3.15, 1.86
    gz = lambda x: 1.80 - (x - 4.75) * (0.50 / 0.80)
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (0.92, sd * 1.486, 1.50), (0, sd * 0.50, 0.36), 0.32, 0.32, 'upper_hull', CROSS)
        c, n = plate_side(RX, tz, 1.05, 1.02, 0.36, 0.78, 0.20, sd)
        mark(m, f'number_{s}', 'de_num_211', c, n, 0.74, 0.36, 'turret', NUM)
        y0, y1 = sorted((sd * 1.63, sd * 1.67))
        m.add(f'skirt_{s}', slab(0.40, 5.30, y0, y1, 1.02, 1.31), 'skirt strip hung from the hull edge over the top run of the track', on='upper_hull')
        mark(m, f'deck_grille_{s}', 'deck_slats', (1.72, sd * 0.72, 1.80), UP, 0.90, 0.46, 'upper_hull', GRILLE)
    m.add('rod_tube', rod((1.60, 1.465, 1.667), (3.50, 1.465, 1.667), 0.08, 'hull'), 'tube for the gun-cleaning rods along the left side: a Panther mark', on='upper_hull')
    
    lamp(m, 'lamp', 5.18, 1.00, gz(5.25) + 0.095, 'upper_hull')
    roll(m, 'turret_roll', (RX - 1.05, -0.50, tz + 0.36), (RX - 1.05, 0.50, tz + 0.36), 0.10, 'turret')
    aerial(m, 'aerial', 2.00, 1.12, 1.80, 1.6, 'upper_hull', lean=0.3)


def sdkfz251(m):
    from .infantry import crewman, SIT
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (2.85, sd * 0.925, 1.51), (0, sd * 0.46, 0.25), 0.34, 0.34, f'side_{s}', CROSS)
        lamp(m, f'lamp_{s}', 4.86, sd * 0.76, 1.00, f'mudguard_{s}', r=0.08)
    roll(m, 'tail_roll', (0.12, -0.62, 1.46), (0.12, 0.62, 1.46), 0.09, 'tail')
    aerial(m, 'aerial', 3.42, -0.62, 1.69, 1.5, 'cab', lean=0.25)
    for k, (x, y) in enumerate(((55, -20), (135, -20))):
        m.add(f'rider_b{k}', crewman('de', SIT, (x, y, 70)), 'more grenadiers in the bay: a full squad rides here', on='lower_body', convex=False, small_ok=True)


def stug(m):
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (3.10, sd * 1.225, 1.71), (0, sd * 0.50, 0.35), 0.34, 0.34, 'casemate', CROSS)
        y0, y1 = sorted((sd * 1.45, sd * 1.56))
        m.add(f'skirt_rail_{s}', slab(0.45, 4.78, y0, y1, 1.37, 1.42, 'steel'), 'rail along the track cover: the skirt plates hang on it', on='upper_hull', small_ok=True)
        for k in range(4):
            if sd < 0 and k == 2: continue                       # one plate lost: they hung loose and tore off in close country
            x0 = 0.50 + 1.07 * k
            y0, y1 = sorted((sd * 1.52, sd * 1.56))
            m.add(f'skirt_{s}{k}', slab(x0, x0 + 1.02, y0, y1, 0.68, 1.44), 'Schürzen plate hung on the rail: stand-off armour over the thin hull side; the late StuG look', on=f'skirt_rail_{s}')
        mark(m, f'number_{s}', 'de_num_233', (1.57 + 0.51, sd * 1.56, 1.08), (0, sd, 0), 0.62, 0.30, f'skirt_{s}1', NUM)
        m.add(f'spare_wheel_{s}', disc(1.60, sd * 0.62, 1.46, 1.56, 0.26, 'rubber', seg=14), 'spare road wheel lying on the engine deck', on='upper_hull')
        aerial(m, f'aerial_{s}', 2.02, sd * 1.25, 1.46, 1.5, 'upper_hull', lean=0.25)
    m.add('spare_tracks', solid(across([(4.35, 1.21), (5.05, 1.047), (5.07, 1.112), (4.37, 1.275)], -0.62, 0.62), 'steel'),
          'spare track links on the nose: extra armour on the weakest plate', on='lower_hull')
    lamp(m, 'lamp', 4.85, 1.20, 1.34, 'mudguard_l')


def blitz(m):
    mark(m, 'windscreen', 'glass', (4.45, 0, 1.79), (0.46, 0, 0.20), 1.50, 0.38, 'cab', GLASS)
    mark(m, 'grille', 'de_grille', (5.62, 0, 1.03), (1, 0, 0), 0.62, 0.50, 'hood', 'radiator grille: the truck face')
    mark(m, 'plate', 'de_plate', (5.72, 0, 0.60), (1, 0, 0), 0.52, 0.15, 'bumper', 'number plate on the bumper')
    for sd, s in SIDES:
        mark(m, f'window_{s}', 'glass', (3.99, sd * 0.92, 1.72), (0, sd, 0), 0.56, 0.38, 'cab', GLASS)
        lamp(m, f'lamp_{s}', 5.22, sd * 0.74, 1.11, f'fender_{s}')
    m.add('tarp', slab(1.90, 3.40, -0.90, 0.90, 1.68, 1.75, 'canvas'), 'tarpaulin thrown over the crates', on='crates')


def tiger(m):
    RX, tz = 3.00, 1.88
    for sd, s in SIDES:
        mark(m, f'cross_{s}', 'de_cross', (1.60, sd * 1.78, 1.57), (0, sd, 0), 0.40, 0.40, 'upper_hull', CROSS)
        y0, y1 = sorted((sd * 1.78, sd * 1.92))
        m.add(f'side_guard_{s}', slab(0.30, 4.85, y0, y1, 1.30, 1.345, 'steel'), 'narrow track guard along the hull side', on='upper_hull', small_ok=True)
        m.add(f'tow_cable_{s}', rod((1.60, sd * 1.52, 1.85), (4.55, sd * 1.52, 1.85), 0.03, seg=6), 'tow cable clipped along the roof edge: 57 tons gets stuck (a line that carries)', on='upper_hull', small_ok=True)
        lamp(m, f'lamp_{s}', 4.62, sd * 1.32, 1.91, 'upper_hull')
    mark(m, 'number', 'de_num_412', (RX - 1.50, 0, tz + 0.36), (-1, 0, 0), 0.72, 0.34, 'bin', NUM)
    for sd, s in SIDES: round_side(m, f'number_{s}', 'de_num_412', RX, 1.06, tz + 0.42, sd, 0.62, 0.30, 'turret', NUM)
    m.add('spare_tracks', solid(across([(5.00, 1.435), (5.70, 1.345), (5.72, 1.415), (5.02, 1.505)], -0.72, 0.72), 'steel'),
          'spare track links across the nose: extra armour, a dark band on the front', on='lower_hull')
    tool(m, 'shovel', (2.20, 1.30, 1.845), (3.40, 1.30, 1.845), 'upper_hull', 'shovel')
    aerial(m, 'aerial', 0.25, -1.60, 1.82, 1.7, 'upper_hull', lean=0.3)


FINISH = {'us_scout': jeep, 'us_armoured_car': greyhound, 'us_light_tank': stuart, 'us_medium_tank': sherman, 'us_anti_tank_gun': at57,
          'us_anti_tank_gun_limbered': at57, 'us_heavy_tank': pershing, 'us_half_track': halftrack, 'us_tank_destroyer': wolverine,
          'us_truck': truck, 'us_light_tank_m24': chaffee,
          'de_scout': kradschuetzen, 'de_armoured_car': sdkfz222, 'de_light_tank': panzer2, 'de_medium_tank': panzer4, 'de_anti_tank_gun': pak40,
          'de_anti_tank_gun_limbered': pak40, 'de_heavy_tank': panther, 'de_half_track': sdkfz251, 'de_assault_gun': stug, 'de_truck': blitz,
          'de_heavy_tank_tiger': tiger}
# German armour and guns in the three-colour scheme; soft-skins (truck, motorcycle) stay plain dark yellow
CAMO = {'de_armoured_car', 'de_light_tank', 'de_medium_tank', 'de_anti_tank_gun', 'de_anti_tank_gun_limbered', 'de_heavy_tank', 'de_half_track',
        'de_assault_gun', 'de_heavy_tank_tiger', 'de_howitzer'}


def apply(m, key):
    """Finish machine m (the blockout for unit `key`) in place; returns it."""
    if key in FINISH: FINISH[key](m)
    return m
