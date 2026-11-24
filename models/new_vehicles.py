"""The units CoH3's core rosters field that the game had no art for: grey blockouts (primary and secondary masses), one
Machine each, check() empty. Briefs follow artkit/DESIGN_METHOD.md; real dimensions x 55 (kit.M).
Not in the roster yet (models/roster.py, data/units.json): they go in once the blockouts are agreed, then get their
finishing pass (models/finish.py) like the rest.

  US   M18 Hellcat (Tank Depot; the M10 stands in), M4(105) Sherman with the M1 dozer blade (Tank Depot)
  DE   Kettenkrad (HQ; the motorcycle stands in), Sd.Kfz. 221 (Luftwaffe Kp.; the 222 stands in), Marder III M
       (Luftwaffe Kp.; the Panzer II stands in), Wirbelwind (Luftwaffe Kp.), Sturmpanzer IV Brummbär (Panzer Kp.),
       2 cm Flak 30 and Nebelwerfer 42 (team weapons)
Sizes from the published data of each vehicle (lengths, widths, heights, wheel counts and diameters, barrel lengths);
looks from surviving vehicles as noted in each brief. No online picture comparison was made: see `checked`."""
import math
from artkit import shapes as sh
from artkit.machine import Machine
from .kit import *


# ------------------------------------------------------------------------------------------------------------- US
def hellcat():
    """Brief
    is:       tank destroyer (M18 Hellcat, 76 mm Gun Motor Carriage), crew 5, 76 mm gun in an open-topped turret
    does:     the fastest tracked vehicle in the war: gets to a flank, kills a tank, leaves; armour stops rifle fire only
    gameplay: 2 x 1 tiles; must read as lower, lighter and longer-gunned than the Sherman and unlike the M10 it replaces
              in the Tank Depot: five big evenly spaced wheels (not bogies), a small rounded open turret with a long bustle
    power:    radial engine at the rear, drive shaft forward to FRONT sprockets
    moves:    five road wheels a side on torsion bars (26 in, evenly spaced), four return rollers, rear idler;
              turret on a ring; gun behind a rounded cast shield
    built:    welded thin plate: sides sloped in over the tracks, a long glacis; turret open on top with a deep bustle
              for the radio and ready rounds
    serviced: two hatches on the roof ahead of the turret; the open turret top; engine slides out of the tail
    references: M18 survivors (the five spoked wheels, low hull, bustle as long as the turret); US TM 9-755
              (hull 5.28 m, width 2.87 m, 2.57 m high over the AA gun)
    read_at_play_size: a low sloped hull on five even wheels, a small open turret with a long tail, a long thin gun with a knob
    checked:  check() empty; play size: reads as a tank destroyer with an open turret. Not compared side by side with photos.
    """
    m = Machine('US tank destroyer (M18 Hellcat)')
    lw = 0.85
    up = [(x, y, 1.15) for x in (0.0, 5.28) for y in (-1.43, 1.43)] + [(x, y, 1.68) for x in (0.40, 3.95) for y in (-1.02, 1.02)]
    m.add('upper_hull', solid(up), 'upper hull: thin plate, sides and glacis sloped in over the tracks')
    m.add('lower_hull', solid(across([(0.30, 0.45), (0.10, 0.72), (0.10, 1.16), (5.28, 1.16), (5.52, 0.88), (5.36, 0.58), (4.90, 0.45)], -lw, lw)),
          'tub between the tracks; transmission in the nose', on='upper_hull')
    top = running_gear(m, 'lower_hull', lw, 1.20, 0.36, [0.98 + 0.80 * k for k in range(5)], 0.33, (4.92, 0.70, 0.30), (0.40, 0.55, 0.28),
                       rollers=[1.40, 2.20, 3.00, 3.80], rr=0.09, rz=0.92, belly=0.45)
    assert top < 1.15, top
    for sd, s in ((1, 'driver'), (-1, 'codriver')):
        m.add(f'{s}_hatch', disc(3.72, sd * 0.66, 1.68, 1.72, 0.20), 'crew hatch ahead of the turret: scale cue', on='upper_hull')
    m.add('engine_grille', slab(0.50, 1.35, -0.80, 0.80, 1.68, 1.72, 'steel'), 'engine deck grille: marks the rear', on='upper_hull')
    tz = ring(m, 2.55, 1.68, 0.88)
    plate_turret(m, 2.55, tz, 0.88, 0.84, 0.36, 0.58, 0.10, why='small welded turret with rounded corners, open on top')
    m.add('well', slab(2.55 - 0.50, 2.55 + 0.40, -0.52, 0.52, tz + 0.58, tz + 0.60, 'steel'), 'the open top: a dark well where the crew stand', on='turret')
    m.add('bustle', solid([(2.55 + x, y, tz + z) for x, w in ((-0.80, 0.62), (-1.72, 0.50)) for y in (-w, w) for z in (0.14, 0.56)]),
          'deep bustle: radio and ready rounds; it balances the long gun and is the tail that marks this turret', on='turret')
    m.add('mantlet', solid([(2.55 + x, y, tz + z) for x, w, z0, z1 in ((0.80, 0.52, 0.06, 0.54), (1.12, 0.34, 0.14, 0.46)) for y in (-w, w) for z in (z0, z1)], 'steel', smooth=True),
          'rounded cast gun shield', on='turret')
    gun(m, (3.67, 0, tz + 0.30), 3.15, 0.052, 'mantlet', brake=(0.10, 0.28), why='76 mm M1A2: long and thin with a muzzle brake')
    m.add('aa_post', disc(2.55 - 0.55, 0.62, tz + 0.58, tz + 0.86, 0.04), 'ring-mount post at the left rear of the turret', on='turret', small_ok=True)
    m.add('aa_gun', rod((2.55 - 1.05, 0.62, tz + 0.90), (2.55 + 0.25, 0.62, tz + 0.90), 0.04), '.50 cal on its mount: a line over the open top', on='aa_post', small_ok=True)
    return m


def dozer_sherman():
    """Brief
    is:       M4(105) Sherman with the M1 bulldozer blade, crew 5, 105 mm howitzer
    does:     infantry-support tank: a big slow shell against men, guns and buildings; the blade clears wire, tank
              traps and rubble (CoH3: the Bulldozer Sherman of the Tank Depot)
    gameplay: 2 x 1 tiles; the Sherman's shape, so it must differ at a glance: a wide blade across the nose and a
              short fat gun
    power:    the Sherman's: engine at the rear, FRONT sprockets; the blade is raised by a hydraulic jack on the nose
    moves:    as the Sherman; the blade pivots up and down on two push arms hinged at the middle bogies
    built:    the engine's own M4A3 blockout (artkit/demo/blockouts/m4_medium_tank.py) with the 75 mm barrel replaced;
              blade a curved plate 3.15 m wide and about 1 m high with a cutting edge, on two box-section arms
    serviced: as the Sherman; arms unpin at the bogie brackets
    references: M4 dozer tanks in Italy and Normandy 1944 (blade wider than the tank, arms outside the tracks to the
              centre bogie, jack on the transmission cover); M4(105) (short barrel, no muzzle brake)
    read_at_play_size: a Sherman pushing a wide plate, with a stubby gun
    checked:  check() empty; blade reads at play size from every heading but straight behind.
    """
    from artkit.demo.blockouts import m4_medium_tank
    m = m4_medium_tank.machine()
    m.name = 'US M4(105) Sherman with dozer blade'
    lo, hi = m.parts['gun'].geom.bounds(); gy, gz = (lo[1] + hi[1]) / 2 / M, (lo[2] + hi[2]) / 2 / M; x0 = lo[0] / M
    del m.parts['muzzle']; del m.parts['gun']
    m.add('gun', rod((x0, gy, gz), (x0 + 1.25, gy, gz), 0.095), '105 mm howitzer: short and fat, no brake; says high explosive, not anti-tank', on='gun_shield')
    cy = 1.45                                                       # the engine's blockout has its centre line at y = 1.45
    for sd, s in ((1, 'l'), (-1, 'r')):
        y0, y1 = sorted((cy + sd * 1.16, cy + sd * 1.45))
        m.add(f'dozer_pivot_{s}', slab(2.61, 2.75, y0, y1, 0.36, 0.60, 'steel'), 'trunnion plate on the middle bogie bracket: the push arm hinges here', on=f'bracket_{s}1')
        y0, y1 = sorted((cy + sd * 1.33, cy + sd * 1.45))
        m.add(f'dozer_arm_{s}', slab(2.75, 6.22, y0, y1, 0.40, 0.56, 'steel'), 'push arm, box section, outside the track: carries the blade and takes the push', on=f'dozer_pivot_{s}')
    blade = [(6.22, y, z) for y in (cy - 1.58, cy + 1.58) for z in (0.06, 1.00)] + [(6.36, y, z) for y in (cy - 1.58, cy + 1.58) for z in (0.02, 0.30)] + \
            [(6.34, y, 1.06) for y in (cy - 1.58, cy + 1.58)]
    m.add('blade', solid(blade, 'steel'), 'the blade: wider than the tank, a cutting edge low in front and a lip on top', on='dozer_arm_l', contact=['dozer_arm_r'])
    m.add('jack', rod((5.50, cy, 1.08), (6.24, cy, 0.86), 0.07), 'hydraulic jack from the transmission cover to the blade: what lifts it', on='nose', contact=['blade', 'upper_hull'], small_ok=True)
    return m


# ------------------------------------------------------------------------------------------------------------- DE
def kettenkrad():
    """Brief
    is:       Sd.Kfz. 2 Kettenkrad: a half-track motorcycle, driver and two passengers facing rearward, unarmed
    does:     the fast capper of the German HQ in CoH3: runs wire and men to points, sees, never fights
    gameplay: 1 x 1 tile, no armour, no weapon; must read as tiny, tracked, with a motorcycle front, and which way it goes
    power:    car engine in the middle of the tub behind the driver; drives the tracks
    moves:    one front wheel in a motorcycle fork steers (and brakes a track on tight turns); short tracks with four
              overlapping road wheels a side, front sprocket, rear idler
    built:    pressed-steel tub about 1 m wide over the tracks; driver astride the engine cover behind the fork; a rear
              bench for two facing backwards; track guards as flat fenders
    serviced: engine cover lifts between driver and bench
    references: Kettenkrad survivors (3.0 m long, 1.0 m wide, 1.2 m high; the big headlamp fork, overlapping dished
              wheels, rear bench with a grab rail)
    read_at_play_size: a motorcycle front wheel and handlebars on a tiny tracked box with a man on it
    checked:  check() empty; small at play size (about 66 px long): the fork wheel and the driver carry it.
    """
    m = Machine('German half-track motorcycle (Kettenkrad)')
    lw = 0.25
    m.add('body', slab(0.12, 1.95, -0.49, 0.49, 0.64, 0.82), 'body tub over the tracks: its edges are the track guards')
    m.add('tub', slab(0.20, 1.85, -lw, lw, 0.24, 0.65), 'narrow tub between the tracks: engine and gearbox sit in it', on='body')
    top = running_gear(m, 'tub', lw, 0.39, 0.17, [0.60 + 0.24 * k for k in range(4)], 0.19, (1.70, 0.36, 0.17), (0.22, 0.34, 0.16),
                       interleave=True, belly=0.28, band=0.04, tooth=0.03, pitch=0.10, hub=0.2)
    assert top < 0.64, top
    for n in [n for n in m.parts if n.startswith('hub_')]: del m.parts[n]      # under 2 px on wheels this small: cut (DESIGN_METHOD step 6)
    m.add('engine_cover', slab(0.78, 1.20, -0.26, 0.26, 0.82, 0.98), 'engine cover behind the driver: the hump in the middle', on='body')
    m.add('seat', slab(1.20, 1.50, -0.17, 0.17, 0.82, 0.92, 'steel'), "driver's saddle: the human-scale cue", on='body')
    m.add('bench', slab(0.14, 0.26, -0.44, 0.44, 0.82, 1.08, 'steel'), 'back of the rear bench: two men ride facing backwards', on='body')
    m.add('head', slab(1.85, 2.05, -0.10, 0.10, 0.62, 1.02, 'steel'), 'steering head on the tub nose: the fork turns in it', on='body', contact=['tub'])
    for nm, y in (('fork_l', 0.10), ('fork_r', -0.10)):
        m.add(nm, rod((2.00, y, 0.98), (2.46, y, 0.30), 0.035), 'fork leg: carries the front axle and steers it', on='head', small_ok=True)
    m.add('front_wheel', wheel(2.46, 0, 0.30, 0.30, 0.11), 'front wheel in a motorcycle fork: the mark of this machine', on='fork_l', contact=['fork_r'], turns=(P(2.46, 0, 0.30), ACROSS))
    m.add('handlebar', rod((1.92, -0.32, 1.06), (1.92, 0.32, 1.06), 0.03), 'handlebar: wide, so it reads as a motorcycle from above', on='head', small_ok=True)
    m.add('headlamp', rod((2.05, 0, 0.90), (2.19, 0, 0.90), 0.085), 'headlamp on the fork: marks the front', on='head')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y0, y1 = sorted((sd * 0.26, sd * 0.47))
        m.add(f'tank_{s}', slab(1.28, 1.80, y0, y1, 0.82, 0.98), 'fuel tank either side of the driver, over the track', on='body')
    from .infantry import crewman, SIT
    m.add('driver', crewman('de', SIT, (70, 0, 46), L=(105, 14, 60), R=(105, -14, 60)), 'driver at the bars: without him it does not read as something you ride',
          on='seat', contact=['body', 'engine_cover', 'tank_l', 'tank_r'], convex=False, small_ok=True)
    return m


def sdkfz221():
    """Brief
    is:       4x4 light armoured car (Sd.Kfz. 221), crew 2, one MG 34 in a small open turret
    does:     the first German light vehicle in CoH3 (221 Scout Car): chases infantry off points early, dies to anything heavier
    gameplay: 1 x 2 tiles; the 222's hull, so the turret has to tell them apart: smaller, lower, a thin machine gun
              instead of the 20 mm
    power, moves, built: as the 222 (rear engine, four driven and steered wheels, the diamond-section welded hull)
    serviced: deck hatch; open turret top under mesh screens
    references: Sd.Kfz. 221 survivors and photos (seven-sided one-man turret hardly wider than the roof, MG 34)
    read_at_play_size: the faceted coffin on four big wheels with a very small turret and a thin gun
    checked:  check() empty; differs from the 222 at play size by turret size only: enough side by side, weak alone.
    """
    from .de_vehicles import sdkfz222
    m = sdkfz222(); m.name = 'German light armoured car (Sd.Kfz. 221)'
    for n in ('screens', 'muzzle', 'gun', 'mantlet', 'turret', 'ring_guard'): m.parts.pop(n, None)
    tz = ring(m, 2.45, 1.50, 0.46)
    plate_turret(m, 2.45, tz, 0.42, 0.42, 0.18, 0.28, 0.07, why='one-man open turret, seven-sided, hardly wider than the roof')
    m.add('mantlet', slab(2.45 + 0.34, 2.45 + 0.48, -0.10, 0.10, tz + 0.08, tz + 0.24, 'steel'), 'gun slot plate', on='turret', small_ok=True)
    m.add('gun', rod((2.93, 0, tz + 0.17), (3.70, 0, tz + 0.17), 0.03), 'MG 34: thin, a line that carries', on='mantlet', small_ok=True)
    m.add('screens', solid([(2.45 + x, y, tz + 0.28) for x in (-0.30, 0.30) for y in (-0.32, 0.32)] + [(2.45 + x, 0, tz + 0.42) for x in (-0.27, 0.27)], 'steel'),
          'grenade screens over the open top, folded to a ridge', on='turret')
    return m


def marder3():
    """Brief
    is:       tank destroyer (Marder III Ausf. M): a 7.5 cm Pak 40 on the Panzer 38(t) chassis, crew 4
    does:     a cheap early gun that kills light and medium armour from range; open, thin, dies to anything that hits it
    gameplay: 1.5 x 1 tiles; ONE layer (no turret: the hull aims, like the StuG); small chassis, tall open box at the
              back, a gun far too long for it
    power:    engine in the middle (moved forward on the M so the gun crew stand at the rear), FRONT sprockets
    moves:    four large road wheels a side on leaf springs (775 mm, the mark of the 38(t)), one return roller, rear idler
    built:    riveted and welded hull; driver under a cast hood on the right of the sloped nose; fighting compartment at
              the rear: sloped side and front plates, open top and back; the Pak 40 over the engine deck
    serviced: open rear; engine hatches on the deck ahead of the gun
    references: Marder III M survivors (4.96 m with gun, 2.15 m wide, 2.48 m high; four big wheels, gun overhanging
              the nose, compartment at the very back)
    read_at_play_size: a small hull on four big wheels, an open-topped box at the back, a long gun with a fat tip out over the front
    checked:  check() empty; play size: the four big wheels and the rear box read; the gun reads.
    """
    m = Machine('German tank destroyer (Marder III M)')
    lw = 0.72
    m.add('upper_hull', solid(across([(0.10, 1.10), (0.10, 1.38), (3.25, 1.38), (3.80, 1.10)], -1.06, 1.06)), 'track covers and engine deck; the sloped plate in front is the glacis')
    m.add('lower_hull', solid(across([(0.30, 0.42), (0.12, 0.68), (0.12, 1.11), (3.80, 1.11), (4.52, 0.90), (4.58, 0.66), (4.20, 0.42)], -lw, lw)),
          'tub between the tracks; transmission in the nose', on='upper_hull')
    top = running_gear(m, 'lower_hull', lw, 0.90, 0.29, [0.98 + 0.86 * k for k in range(4)], 0.385, (4.32, 0.64, 0.28), (0.30, 0.56, 0.27),
                       rollers=[2.20], rr=0.09, rz=0.89, belly=0.42)
    assert top < 1.10, top
    m.add('driver_hood', solid([(x, y, z) for x in (3.05, 3.62) for y in (-0.72, -0.14) for z in (1.30, 1.60)], smooth=True),
          "driver's cast hood on the right of the nose: gives it a face; scale cue", on='upper_hull')
    m.add('floor', slab(0.16, 1.95, -0.86, 0.86, 1.38, 1.40, 'steel'), 'fighting compartment floor: a dark well, open above', on='upper_hull')
    for sd, s in ((1, 'l'), (-1, 'r')):
        w = [(x, sd * y, z) for x in (0.14, 2.00) for y, z in ((1.04, 1.38), (0.98, 1.38), (0.82, 2.22), (0.76, 2.22))]
        m.add(f'side_{s}', solid(w), 'side plate of the fighting compartment, leaning in: splinter cover for the gun crew', on='upper_hull')
        f = [(x, sd * y, z) for x, z in ((2.00, 1.38), (2.08, 1.38), (1.84, 2.22), (1.92, 2.22)) for y in (0.20, 1.00 if z < 2 else 0.80)]
        m.add(f'front_{s}', solid(f), 'front plate half, leaning back: split so the gun can traverse and elevate between', on='upper_hull', contact=[f'side_{s}'])
        y0, y1 = sorted((sd * 0.74, sd * 1.06))
        m.add(f'mudguard_{s}', slab(3.78, 4.45, y0, y1, 1.075, 1.12, 'steel'), 'track guard forward over the sprocket', on='upper_hull')
    m.add('mount', slab(1.55, 2.05, -0.22, 0.22, 1.38, 1.82, 'steel'), 'gun mount on the hull roof: the Pak 40 cradle sits on it without its wheels', on='upper_hull', contact=['floor'])
    m.add('breech', slab(1.05, 1.60, -0.14, 0.14, 1.78, 2.06, 'steel'), 'breech block: the heavy end, inside the compartment', on='mount')
    m.add('shield', solid([(x, y, z) for x, w in ((2.06, 0.20), (2.30, 0.14)) for y in (-w, w) for z in (1.74, 2.12)], 'steel'), 'small inner shield moving with the gun: closes the gap between the front plates', on='mount')
    gun(m, (1.60, 0, 1.92), 3.30, 0.05, 'breech', brake=(0.10, 0.36), why='7.5 cm Pak 40, 3.4 m: longer than the hull is high, out over the nose')
    m.parts['gun'].contact = ('shield',)
    m.add('muffler', rod((0.02, -0.50, 1.22), (0.02, 0.50, 1.22), 0.10, 'exhaust'), 'muffler across the tail: marks the rear', on='upper_hull')
    return m


def _pz4_hull(m):
    """The Panzer IV hull and running gear, as models/de_vehicles.panzer4 builds them (same numbers): the Wirbelwind and
    the Brummbär are built on it."""
    lw = 0.98
    m.add('upper_hull', solid(across([(0.15, 1.25), (0.15, 1.70), (4.15, 1.70), (4.30, 1.25)], -1.42, 1.42)), 'vertical-sided superstructure overhanging the tracks')
    m.add('lower_hull', solid(across([(0.35, 0.45), (0.05, 0.75), (0.05, 1.26), (4.30, 1.26), (5.65, 1.02), (5.72, 0.72), (5.30, 0.45)], -lw, lw)),
          'tub between the tracks; the low glacis ahead of the superstructure is its roof', on='upper_hull')
    top = running_gear(m, 'lower_hull', lw, 1.21, 0.40, [1.05 + 0.50 * k for k in range(8)], 0.235, (5.45, 0.74, 0.36), (0.45, 0.66, 0.33),
                       rollers=[1.35, 2.45, 3.55, 4.65], rr=0.11, rz=1.01, belly=0.45)
    assert top < 1.25, top
    for sd, s in ((1, 'l'), (-1, 'r')):
        y0, y1 = sorted((sd * 1.00, sd * 1.42))
        m.add(f'mudguard_{s}', slab(4.28, 5.78, y0, y1, 1.235, 1.28, 'steel'), 'track guard forward over the sprocket: the long fender line', on='upper_hull')
    m.add('muffler', rod((-0.12, -0.65, 1.00), (-0.12, 0.65, 1.00), 0.16, 'exhaust'), 'big muffler drum across the tail plate: marks the rear', on='lower_hull')


def wirbelwind():
    """Brief
    is:       anti-aircraft tank (Flakpanzer IV Wirbelwind): four 2 cm guns (Flakvierling 38) in an open turret on the
              Panzer IV hull, crew 5
    does:     shoots aircraft down and shreds infantry and light vehicles with a wall of 20 mm; useless against tanks
    gameplay: 2 x 1 tiles; the Panzer IV's hull, so the turret must say what it is: tall, many-sided, open, four thin
              barrels in a row instead of one long gun
    power:    the Panzer IV's: rear engine, FRONT sprockets
    moves:    the Panzer IV's eight small wheels a side; turret on the tank's ring, turned by hand and hydraulic motor
    built:    nine-sided turret of thin plates, each bent outward at the waist (the 'biscuit tin'), open on top; the
              quad mount inside on trunnions; barrels through a slot in the front plates
    serviced: open top; hull hatches ahead of the turret
    references: Wirbelwind survivors (the faceted open turret taller than the hull roof is wide, four barrels in two pairs)
    read_at_play_size: a Panzer IV hull with a tall faceted open drum and four thin barrels
    checked:  check() empty; at play size the four barrels merge into two lines; the turret shape carries it.
    """
    m = Machine('German anti-aircraft tank (Wirbelwind)')
    _pz4_hull(m)
    for sd, s in ((1, 'driver'), (-1, 'radio')):
        m.add(f'{s}_hatch', disc(3.86, sd * 1.02, 1.70, 1.74, 0.20), 'crew hatch on the roof corner: scale cue', on='upper_hull')
    rx = 2.85; tz = ring(m, rx, 1.70, 1.00)
    plan = lambda a, c: [(sx * u, sy * v) for u, v in ((a, a - c), (a - c, a)) for sx in (1, -1) for sy in (1, -1)]
    pts = [(rx + u, v, tz) for u, v in plan(0.92, 0.38)] + [(rx + u, v, tz + 0.50) for u, v in plan(1.12, 0.46)] + [(rx + u, v, tz + 1.00) for u, v in plan(0.86, 0.36)]
    m.add('turret', solid(pts), 'open turret of thin plates bent outward at the waist: room for the gun crew, the biscuit-tin shape that marks it', on='ring_guard', turns=(P(rx, 0, tz), UP))
    m.add('well', slab(rx - 0.62, rx + 0.62, -0.62, 0.62, tz + 1.00, tz + 1.02, 'steel'), 'the open top: a dark well, the mount and crew inside', on='turret')
    m.add('mantlet', slab(rx + 0.90, rx + 1.14, -0.56, 0.56, tz + 0.42, tz + 0.74, 'steel'), 'gun slot shield across the front plates: the four barrels come through it', on='turret')
    gz = tz + 0.58
    gun(m, (rx + 1.14, 0.44, gz), 1.15, 0.03, 'mantlet', why='2 cm barrel (outer left): thin, a line that carries')
    for k, y in enumerate((0.26, -0.26, -0.44)):
        m.add(f'gun_{k}', rod((rx + 1.14, y, gz), (rx + 2.29, y, gz), 0.03), '2 cm barrel: four in a row say anti-aircraft', on='mantlet', small_ok=True)
    return m


def brummbaer():
    """Brief
    is:       assault tank (Sturmpanzer IV 'Brummbär'): a 15 cm howitzer in a heavy casemate on the Panzer IV hull, crew 5
    does:     knocks down buildings, bunkers and whatever infantry is in them at short range; slow to aim (no turret)
    gameplay: 2 x 1 tiles; ONE layer, like the StuG; must read as the tallest, heaviest box on a Panzer IV hull, with
              a very short, very fat gun in a ball in its sloped front
    power:    the Panzer IV's: rear engine, FRONT sprockets
    moves:    the Panzer IV's eight small wheels a side; the gun moves a few degrees in its ball mount
    built:    thick welded plates: a casemate over the front two thirds, front plate sloped at 40 degrees from the
              glacis to the roof, sides leaning in; the howitzer in a ball mount with a thick armoured sleeve
    serviced: two hatches and a ventilator on the roof; the Panzer IV's engine deck behind
    references: Brummbär survivors (late series: the tall slab front with the ball, sleeve wider than the barrel is long)
    read_at_play_size: a Panzer IV hull under a big sloped block, a stub of a gun with a thick collar
    checked:  check() empty; the block and the stub read at play size from front and side.
    """
    m = Machine('German assault tank (Brummbaer)')
    _pz4_hull(m)
    case = [(x, y, 1.70) for x in (1.75, 4.28) for y in (-1.42, 1.42)] + [(x, y, 2.52) for x in (1.95, 3.42) for y in (-1.10, 1.10)]
    m.add('casemate', solid(case), 'fixed fighting compartment of thick plate: front sloped back to the roof, sides leaning in', on='upper_hull')
    ax, az = 3.88, 2.10
    m.add('mantlet', sh.soften(sh.ellipsoid(0.36 * M, 0.40 * M, 0.36 * M, 'steel', at=P(ax, 0, az))), 'ball mount in the front plate: the howitzer swings in it', on='casemate')
    m.add('sleeve', rod((ax + 0.20, 0, az), (ax + 0.70, 0, az), 0.21), 'armoured sleeve round the barrel: thicker than the barrel is long, the mark of this gun', on='mantlet')
    m.add('gun', rod((ax + 0.70, 0, az), (ax + 1.25, 0, az), 0.12), '15 cm StuH 43: a stub, the widest bore on the field', on='sleeve')
    for sd, s in ((1, 'commander'), (-1, 'loader')):
        m.add(f'{s}_hatch', disc(2.60, sd * 0.55, 2.52, 2.57, 0.26), 'roof hatch: scale cue', on='casemate')
    m.add('ventilator', disc(3.10, 0, 2.52, 2.60, 0.16), 'ventilator cowl: a 15 cm breech fills the box with fumes', on='casemate')
    m.add('driver_visor', slab(4.02, 4.12, 0.55, 1.10, 1.86, 2.02, 'steel'), "driver's visor in the sloped front, left: gives it a face", on='casemate', small_ok=True)
    return m


def flak30():
    """Brief
    is:       2 cm Flak 30 anti-aircraft gun on its ground mount, crew of 5 (figures separate)
    does:     the Luftwaffe Kompanie's team weapon in CoH3: fast 20 mm fire against infantry and light vehicles, and aircraft
    gameplay: 1 x 1 tile deployed; turns all round by hand; must read as a thin fast gun on a three-legged table, not
              an anti-tank gun (no trails, no wheels when emplaced)
    power:    hand cranked; 20-round box magazines fed from the left
    moves:    traverses on a ring on the triangular base; elevates on trunnions between two cheeks; towed on a
              two-wheel trailer (Sd.Ah. 51) that is taken away when it is emplaced
    built:    triangular platform with three levelling feet; ring; cradle cheeks; gunner's seat on the mount behind the
              breech; a small flat shield in two halves
    references: Flak 30 survivors (the low triangular base, seat hanging behind, long thin barrel with a cone flash hider)
    read_at_play_size: a low triangle on the ground, a small shield, a long thin barrel pointing up a little
    checked:  check() empty; thin at play size: the shield and base carry it, the barrel is a line.
    """
    m = Machine('German 2 cm anti-aircraft gun (Flak 30)')
    tri = [(1.05, 0.0), (-0.70, 0.85), (-0.70, -0.85)]
    m.add('base', solid([(x, y, z) for x, y in tri for z in (0.10, 0.24)], 'steel'), 'triangular platform: three points always stand firm on rough ground')
    for k, (x, y) in enumerate(tri):
        m.add(f'foot_{k}', disc(x * 0.90, y * 0.90, 0.0, 0.10, 0.13), 'levelling foot under each corner', on='base')
    m.add('ring', disc(0, 0, 0.24, 0.32, 0.42), 'traverse ring: the whole gun turns on it', on='base')
    m.add('mount', slab(-0.30, 0.30, -0.26, 0.26, 0.32, 0.50, 'steel'), 'turning mount on the ring: carries cheeks, seat and shield', on='ring')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y0, y1 = sorted((sd * 0.16, sd * 0.24))
        m.add(f'cheek_{s}', slab(-0.14, 0.14, y0, y1, 0.50, 0.98, 'steel'), 'cheek: carries the trunnion, the gun elevates between the pair', on='mount')
        y0, y1 = sorted((sd * 0.20, sd * 0.78))
        m.add(f'shield_{s}', slab(0.30, 0.35, y0, y1, 0.42, 1.22), 'shield half: flat plate either side of the gun', on='mount')
    e = math.radians(12); d = (math.cos(e), math.sin(e)); T = (0.0, 0.86)
    at = lambda a: (T[0] + a * d[0], 0.0, T[1] + a * d[1])
    m.add('trunnion', rod((0, -0.24, T[1]), (0, 0.24, T[1]), 0.05), 'trunnion pin through both cheeks: the pitch axis', on='cheek_l', contact=['cheek_r'], small_ok=True)
    m.add('breech', rod(at(-0.55), at(0.30), 0.085), 'receiver between the cheeks, on the trunnions', on='trunnion')
    m.add('gun', rod(at(0.30), at(1.70), 0.03), '2 cm barrel: long and thin, raised a little: it is for the sky first', on='breech', small_ok=True)
    m.add('muzzle', rod(at(1.52), at(1.72), 0.055), 'cone flash hider: the tip that reads', on='gun', small_ok=True)
    m.add('magazine', slab(-0.24, 0.04, 0.24, 0.44, 0.92, 1.06, 'steel'), 'box magazine sticking out of the left of the receiver: 20 rounds, changed constantly', on='cheek_l', small_ok=True)
    m.add('seat_arm', slab(-0.80, -0.30, -0.05, 0.05, 0.36, 0.46, 'steel'), 'arm carrying the gunner behind the breech: he turns with the gun', on='mount', small_ok=True)
    m.add('seat', slab(-0.98, -0.72, -0.17, 0.17, 0.46, 0.54, 'steel'), "gunner's seat: the human-scale cue", on='seat_arm')
    return m


def nebelwerfer():
    """Brief
    is:       15 cm Nebelwerfer 41 six-barrelled rocket launcher on its split-trail carriage (CoH3's Nebelwerfer 42), crew of 4
    does:     a salvo of six rockets on an area: breaks up infantry, team weapons and emplacements; long reload, short life
              once seen (the smoke trails give it away)
    gameplay: 1 x 2 tiles deployed; must read as a cluster of fat tubes on a light carriage, pointing up; not a gun
              (no breech, no shield, no recoil)
    power:    rockets fired electrically from a cable 10 m away; loaded by hand from the rear
    moves:    two wheels (the 3.7 cm Pak carriage); trails spread; the tube cluster elevates on trunnions; a front
              prop under the cradle takes the weight when firing
    built:    six open tubes, 1.3 m long, 158 mm bore, in a ring held by two bands; light tubular trails with spades
    references: Nebelwerfer 41 survivors (six tubes in a hexagon, small wheels, the cluster longer than the carriage is high)
    read_at_play_size: six fat pipes in a bundle tilted up on two small wheels with a V of trails
    checked:  check() empty; the bundle reads at play size; from straight ahead the six open tube mouths show.
    """
    m = Machine('German rocket launcher (Nebelwerfer)')
    wr, wy, ww = 0.36, 0.70, 0.14
    m.add('axle', rod((0, -wy + ww / 2, wr), (0, wy - ww / 2, wr), 0.06), 'axle: carries the launcher on its wheels', small_ok=True)
    m.add('saddle', slab(-0.22, 0.26, -0.32, 0.32, wr - 0.08, wr + 0.10, 'steel'), 'saddle on the axle: carries the trunnion posts and the trail hinges', on='axle')
    for sd, s in ((1, 'l'), (-1, 'r')):
        m.add(f'wheel_{s}', wheel(0, sd * wy, wr, wr, ww), 'carriage wheel', on='axle', turns=(P(0, sd * wy, wr), ACROSS))
        m.add(f'hub_{s}', sh.cyl(P(0, sd * wy, wr), P(0, sd * (wy + ww / 2 + 0.04), wr), 0.4 * wr * M, 'steel', seg=12), 'hub', on=f'wheel_{s}', turns=(P(0, sd * wy, wr), ACROSS))
        m.add(f'trail_{s}', rod((-0.16, sd * 0.24, wr + 0.04), (-2.10, sd * 0.80, 0.07), 0.05), 'trail: spreads to steady the carriage', on='saddle', small_ok=True)
        y0, y1 = sorted((sd * 0.68, sd * 0.92))
        m.add(f'spade_{s}', slab(-2.22, -2.06, y0, y1, 0.0, 0.22, 'steel'), 'spade: digs in so the salvo does not shift it', on=f'trail_{s}')
        y0, y1 = sorted((sd * 0.34, sd * 0.42))
        m.add(f'post_{s}', slab(-0.08, 0.08, y0, y1, wr + 0.04, 1.10, 'steel'), 'trunnion post: the tube cluster elevates between the pair', on='saddle')
    e = math.radians(28); d = (math.cos(e), 0.0, math.sin(e)); n = (-math.sin(e), 0.0, math.cos(e)); T = (0.0, 0.0, 1.00)
    def at(a, r=0.0, ang=0.0):
        cy, cz = r * math.cos(ang), r * math.sin(ang)
        return (T[0] + a * d[0] + cz * n[0], cy, T[2] + a * d[2] + cz * n[2])
    m.add('band', rod(at(-0.14), at(0.14), 0.33), 'band clamping the six tubes together at the trunnions: what makes them one launcher', on='post_l', contact=['post_r'])
    for k in range(6):
        ang = math.radians(90 + 60 * k)
        m.add('gun' if k == 0 else f'tube_{k}', rod(at(-0.55, 0.20, ang), at(0.80, 0.20, ang), 0.095, 'hull', seg=10),
              'launch tube, open both ends: six in a ring, the shape nobody mistakes for a gun', on='band')
    m.add('prop', rod((0.30, 0, 0.0), (0.22, 0, wr - 0.04), 0.045), 'front prop under the saddle: takes the weight off the wheels when firing', on='saddle', small_ok=True)
    return m


ALL = [('tank destroyer m18', 'M18 Hellcat', hellcat), ('dozer tank', 'M4(105) Sherman dozer', dozer_sherman),
       ('tracked scout', 'Kettenkrad', kettenkrad), ('scout car', 'Sd.Kfz. 221', sdkfz221), ('tank destroyer', 'Marder III M', marder3),
       ('anti-aircraft tank', 'Wirbelwind', wirbelwind), ('assault tank', 'Brummbaer', brummbaer),
       ('anti-aircraft gun', '2 cm Flak 30', flak30), ('rocket launcher', 'Nebelwerfer', nebelwerfer)]
