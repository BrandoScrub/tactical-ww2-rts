"""Aircraft and parachutes for air abilities (strafing runs, bombing runs, recon, paradrops, supply drops): grey
blockouts, one artkit.machine.Machine each with check() empty. Briefs follow artkit/DESIGN_METHOD.md.

Frame (kit.py): x tail (0) to nose, y across (+y = the aircraft's left), z up; metres in, 55 units a metre out. Things
that fly have no ground (Machine(ground=None)). Aircraft are modelled in flight: gear up where it retracts, props as
blades on a spinner that turns on the thrust line (the game blurs or spins them). Parachutes hang from z = 0 at the
jumper's boots, canopy above.

Real sizes throughout, so a P-47 is about 270 px across at the units' export scale and the blimp about 1700 px long:
how big the game draws them is an open choice (CoH draws its aircraft smaller than true scale), made at export.
"""
import math
import numpy as np
from artkit import shapes as sh
from artkit.machine import Machine
from .kit import M, P, solid, slab, rod, disc

X_AXIS = (1, 0, 0)


# ---------------------------------------------------------------- builders
def _ellipse(x, hw, zb, zt, n=16, y=0.0):
    zc, h = (zb + zt) / 2, (zt - zb) / 2
    return [(x, y + hw * math.cos(2 * math.pi * k / n), zc + h * math.sin(2 * math.pi * k / n)) for k in range(n)]


def body(stations, mat='hull', y=0.0, smooth=True):
    """A convex streamlined body through stations [(x, half-width, bottom z, top z)]: fuselage, nacelle, spat."""
    return solid([p for s in stations for p in _ellipse(*s, y=y)], mat, smooth=smooth)


def _section(y, le, te, z, t):
    """An aerofoil cut at span y: leading edge le, trailing edge te, chord line at z, thickness t (thickest at 30%)."""
    c = le - te
    return [(le, y, z), (te, y, z), (le - 0.3 * c, y, z + 0.6 * t), (le - 0.3 * c, y, z - 0.4 * t),
            (le - 0.7 * c, y, z + 0.35 * t), (le - 0.7 * c, y, z - 0.2 * t), (le - 0.08 * c, y, z + 0.3 * t)]


def surface(m, name, sections, on, why, mat='hull', mirror=True):
    """A wing or tailplane: sections [(y, le, te, z, t)] root to tip, each pair of neighbours one convex panel,
    panel k mounted on panel k-1 (the root panel on `on`). Both sides unless mirror=False. Returns the tip panel names."""
    tips = []
    for sd, s in ((1, 'l'), (-1, 'r')) if mirror else ((1, ''),):
        prev = on
        for k, (a, b) in enumerate(zip(sections[:-1], sections[1:])):
            pts = _section(sd * a[0], *a[1:]) + _section(sd * b[0], *b[1:])
            n = f'{name}_{s}{k}' if mirror else f'{name}{k}'
            m.add(n, solid(pts, mat), why if k == 0 else f'{name.replace("_", " ")}, next panel out', on=prev)
            prev = n
        tips.append(prev)
    return tips


def fin(m, name, sections, on, why, y=0.0, mat='hull'):
    """A vertical fin: sections [(z, le, te, t)] root to tip, at span position y."""
    prev = on
    for k, (a, b) in enumerate(zip(sections[:-1], sections[1:])):
        pts = []
        for z, le, te, t in (a, b):
            c = le - te
            pts += [(le, y, z), (te, y, z), (le - 0.3 * c, y + t / 2, z), (le - 0.3 * c, y - t / 2, z),
                    (le - 0.7 * c, y + t / 3, z), (le - 0.7 * c, y - t / 3, z)]
        n = f'{name}{k}'
        m.add(n, solid(pts, mat), why if k == 0 else 'fin, upper part', on=prev)
        prev = n
    return prev


def _blade(c, ang, r0, r1, ch0, ch1, t, pitch):
    """Corners of one propeller blade in the disc at c (thrust along +x), at angle ang round the axis."""
    c = np.asarray(c, float); d = np.array([0, math.cos(ang), math.sin(ang)]); tg = np.array([0, -math.sin(ang), math.cos(ang)])
    ex = np.array([1.0, 0, 0]); p = math.radians(pitch)
    cd = tg * math.cos(p) + ex * math.sin(p); th = ex * math.cos(p) - tg * math.sin(p)
    return [tuple(c + r * d + sc * ch / 2 * cd + st * t / 2 * th) for r, ch in ((r0, ch0), (r1, ch1)) for sc in (1, -1) for st in (1, -1)]


def prop(m, name, x, y, z, r, blades, on, spinner=0.35, length=0.6, chord=0.30, pitch=35, why='propeller'):
    """Spinner on the thrust line at (x, y, z) pointing +x, turning on it, carrying `blades` blades of radius r."""
    m.add(f'{name}_spinner', sh.blob_lathe([(spinner * M, 0), (spinner * 0.92 * M, length * 0.4 * M), (spinner * 0.5 * M, length * 0.8 * M), (0.02 * M, length * M)], 'steel', seg=12)
          .ry(90).move(*P(x, y, z)), f'{why}: spinner over the hub, the axis the blades turn on', on=on, turns=(P(x, y, z), X_AXIS))
    for k in range(blades):
        a = 2 * math.pi * k / blades + math.pi / 2
        m.add(f'{name}_blade{k}', solid(_blade((x + length * 0.35, y, z), a, spinner * 0.8, r, chord * 0.8, chord, 0.06, pitch), 'steel'),
              'blade: pitched to bite air; the disc it sweeps is what reads at play size', on=f'{name}_spinner', small_ok=True)


def radial_cowl(m, name, x0, x1, y, z, r, on, why='round cowling over a radial engine: the blunt drum nose that marks it'):
    """A radial engine's cowl from x0 (back) to x1 (front lip), radius r."""
    g = sh.lathe([(r * 0.92 * M, 0), (r * M, (x1 - x0) * 0.35 * M), (r * M, (x1 - x0) * 0.8 * M), (r * 0.9 * M, (x1 - x0) * M), (r * 0.55 * M, (x1 - x0) * M)], 'hull', n=20)
    m.add(name, sh.soften(g).ry(90).move(*P(x0, y, z)), why, on=on)


def head(m, name, x, y, z, on, contact=(), why='crew head in the cockpit: the human-scale cue (0.25 m)'):
    m.add(name, sh.sphere(0.13 * M, 'dark', seg=8, rings=5).move(*P(x, y, z)), why, on=on, contact=contact, small_ok=True)


def canopy(m, name, x0, x1, hw, zb, zt, on, framed=False, why='canopy glazing over the cockpit'):
    """A canopy from x0 to x1: rounded bubble, or framed flat panes (framed=True)."""
    xm = x0 + (x1 - x0) * 0.45
    if framed:
        pts = [(x0, sy * hw * 0.7, zb) for sy in (1, -1)] + [(x1, sy * hw * 0.6, zb) for sy in (1, -1)]
        pts += [(x0 + 0.2, sy * hw * 0.35, zt - 0.08) for sy in (1, -1)] + [(x1 - 0.45, sy * hw * 0.5, zt) for sy in (1, -1)]
        pts += [(xm, sy * hw, zb) for sy in (1, -1)] + [(xm, sy * hw * 0.55, zt) for sy in (1, -1)]
        m.add(name, solid(pts, 'glass'), why, on=on)
    else:
        m.add(name, body([(x0, hw * 0.3, zb, zb + 0.15), (x0 + (x1 - x0) * 0.25, hw * 0.85, zb, zt - 0.08), (xm, hw, zb, zt),
                          (x1 - (x1 - x0) * 0.2, hw * 0.8, zb, zt - 0.12), (x1, hw * 0.4, zb, zb + 0.2)], 'glass'), why, on=on)


# ---------------------------------------------------------------- fighters
def p47():
    """Brief
    is:       P-47D-25 Thunderbolt, single-seat fighter-bomber; the US strafing and rocket aircraft over Italy, 1944
    does:     strafing runs (eight .50 cal in the wings) and rocket strikes (triple M10 tubes under each wing)
    gameplay: an ability call-in: flies in, makes one or two passes over the target, leaves; must read as American,
              fighter, heavy, and which way it is diving
    power:    18-cylinder radial (R-2800) in a deep round cowl; turbo-supercharger in the rear fuselage fed by
              ducts along the belly (why the fuselage is so deep)
    moves:    4-blade 4 m propeller on the thrust line; ailerons, elevators, rudder (not separate in the blockout)
    built:    stressed-skin monocoque; semi-elliptical wing, low on the fuselage
    serviced: cowl panels; guns through hatches in the wing tops
    references: P-47D-25 bubbletop (Republic drawings; 57th FG and 86th FBG in Italy); CoH3's P-47 strafing pass
    read_at_play_size: a big blunt round nose and a fat body on broad elliptical wings, a bubble canopy, a cross of
              tailplane and fin; rocket tubes as short dark bars under the wings
    """
    m = Machine('US fighter-bomber (P-47D Thunderbolt)', ground=None)
    m.add('fuselage', body([(0.0, 0.06, 0.05, 0.30), (0.5, 0.14, -0.12, 0.38), (3.0, 0.34, -0.45, 0.55), (6.4, 0.58, -0.82, 0.72),
                            (8.4, 0.70, -0.95, 0.78), (9.9, 0.74, -0.95, 0.74)]),
          'deep oval monocoque: engine, pilot, and the turbo ducting under them (the Jug\'s belly)')
    radial_cowl(m, 'cowl', 9.85, 10.95, 0, -0.1, 0.78, 'fuselage', 'big round cowl over the R-2800 radial: the blunt nose that IS this aeroplane')
    m.add('chin', body([(9.2, 0.42, -1.05, -0.55), (10.5, 0.44, -1.06, -0.55), (10.9, 0.34, -0.95, -0.6)]),
          'intercooler and oil-cooler intake under the cowl: the oval, not round, nose seen head on', on='fuselage', contact=['cowl'])
    prop(m, 'prop', 10.95, 0, -0.1, 2.0, 4, 'cowl', spinner=0.30, length=0.55, chord=0.34, why='4-blade Curtiss propeller, 4 m')
    canopy(m, 'canopy', 6.6, 8.3, 0.36, 0.62, 1.32, 'fuselage', why='bubble canopy: the pilot sees all round; marks the D-25 and the middle of the aircraft')
    head(m, 'pilot', 7.5, 0, 1.00, 'canopy')
    surface(m, 'wing', [(0.35, 8.35, 5.55, -0.62, 0.42), (2.4, 8.20, 5.70, -0.45, 0.36), (4.6, 7.80, 5.95, -0.30, 0.26),
                        (5.8, 7.35, 6.20, -0.22, 0.18), (6.2, 6.95, 6.45, -0.19, 0.12)],
            'fuselage', 'low semi-elliptical wing, 4 degrees dihedral: guns, fuel and the main gear (retracted) live in it')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y = sd * 3.9
        m.add(f'rockets_{s}', solid([(x, y + dy, z) for x in (6.2, 8.5) for dy in (-0.22, 0.22) for z in (-0.82, -0.64)], 'steel'),
              'triple M10 rocket tubes under the wing: the rocket-strike load, three tubes bundled', on=f'rocket_pylon_{s}')
        m.add(f'rocket_pylon_{s}', slab(6.9, 7.6, y - 0.04, y + 0.04, -0.66, -0.40, 'steel'),
              'pylon: hangs the tube bundle from the wing spar', on=f'wing_{s}1', small_ok=True)
    surface(m, 'tailplane', [(0.10, 1.55, 0.25, 0.20, 0.16), (2.3, 1.15, 0.45, 0.20, 0.08)], 'fuselage',
            'tailplane and elevator: pitch, so it can dive and pull out')
    fin(m, 'fin', [(0.30, 1.85, 0.0, 0.16), (1.00, 1.30, 0.05, 0.12), (1.75, 0.85, 0.25, 0.08)], 'fuselage',
        'fin and rudder: yaw; with the tailplane, the cross at the back that says aeroplane')
    return m


def bf109():
    """Brief
    is:       Bf 109 G-6, single-seat fighter; the Luftwaffe's commonest fighter over Italy, 1944
    does:     strafing passes (two 13 mm over the engine, a 20 mm firing through the spinner); escorts
    gameplay: an ability call-in; must read as German, small, slim and fast, set against the fat P-47
    power:    inverted V12 (DB 605) in a slim pointed nose; coolant radiators under each wing, oil cooler under the chin
    moves:    3-blade 3 m propeller; gear retracts outward into the wing
    built:    small stressed-skin fuselage; straight-tapered wing with rounded tips; strut-braced tailplane
    serviced: engine cowls hinge up; framed canopy hinges to the right
    references: Bf 109 G-6 (Messerschmitt drawings; JG 53 and JG 77 in Italy); CoH series Luftwaffe fighters
    read_at_play_size: a thin dart: pointed spinner, narrow body, short straight wings with two dark radiators
              under them, framed canopy, rounded fin
    """
    m = Machine('German fighter (Bf 109 G-6)', ground=None)
    m.add('fuselage', body([(0.0, 0.05, 0.08, 0.28), (0.5, 0.11, -0.10, 0.36), (3.4, 0.32, -0.42, 0.46), (5.8, 0.45, -0.55, 0.56),
                            (7.2, 0.44, -0.58, 0.46), (8.55, 0.38, -0.50, 0.30)]),
          'slim monocoque round the pilot; the long nose holds the inverted V12 (its narrow top is why the nose tapers)')
    m.add('oil_cooler', body([(7.0, 0.20, -0.82, -0.45), (8.2, 0.22, -0.78, -0.40)]),
          'oil cooler under the chin: the small belly scoop of the G', on='fuselage')
    prop(m, 'prop', 8.55, 0, -0.10, 1.5, 3, 'fuselage', spinner=0.36, length=0.75, chord=0.26, why='3-blade VDM propeller, 3 m; the big pointed spinner')
    canopy(m, 'canopy', 5.0, 6.45, 0.33, 0.48, 0.98, 'fuselage', framed=True, why='framed canopy, heavy panes: a German cockpit')
    head(m, 'pilot', 5.6, 0, 0.78, 'canopy')
    surface(m, 'wing', [(0.30, 7.05, 5.0, -0.48, 0.32), (2.6, 6.85, 5.35, -0.24, 0.24), (4.6, 6.55, 5.65, -0.02, 0.16),
                        (4.95, 6.30, 5.85, 0.02, 0.10)],
            'fuselage', 'low, straight-tapered wing, 6 degrees dihedral; short span: it is small and quick to roll')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y = sd * 1.75
        m.add(f'radiator_{s}', solid([(x, y + dy, z) for x in (5.1, 6.0) for dy in (-0.32, 0.32) for z in (-0.62, -0.38)]),
              'coolant radiator under the wing: a liquid-cooled engine has to dump heat; two dark boxes that mark the 109',
              on='wing_l0' if sd > 0 else 'wing_r0')
    surface(m, 'tailplane', [(0.04, 1.05, 0.15, 0.42, 0.10), (1.6, 0.85, 0.30, 0.42, 0.06)], 'fin0',
            'tailplane set high on the fin, braced by a strut each side')
    for sd, s in ((1, 'l'), (-1, 'r')):
        m.add(f'tail_strut_{s}', rod((0.75, sd * 0.10, 0.05), (0.70, sd * 0.85, 0.40), 0.03), 'tailplane strut down to the fuselage: the Bf 109 tail',
              on='fuselage', contact=[f'tailplane_{s}0'], small_ok=True)
    fin(m, 'fin', [(0.25, 1.35, 0.0, 0.14), (0.85, 1.05, 0.02, 0.10), (1.45, 0.65, 0.18, 0.06)], 'fuselage',
        'rounded fin and rudder')
    return m


# ---------------------------------------------------------------- bombers
def ju87():
    """Brief
    is:       Ju 87 D Stuka, two-seat dive bomber; CoH3's Luftwaffe strafing and bombing aircraft
    does:     dives near-vertically onto a target and releases one heavy bomb; strafes with wing guns
    gameplay: an ability call-in; the dive is the event, so it must read as German, angular, bent-winged and
              carrying a bomb, from straight above and steeply below
    power:    inverted V12 (Jumo 211) in the nose, a big radiator bath under it
    moves:    3-blade 3.4 m propeller; FIXED spatted main gear (no retraction); bomb swung clear of the prop on a
              crutch under the belly; dive brakes under the outer wings
    built:    angular all-metal fuselage; inverted gull wing (inner panels down, outer panels up), so the short
              fixed gear sits at the lowest point, the bend
    serviced: long greenhouse canopy, pilot in front, rear gunner facing back
    references: Ju 87 D-1/D-3 (Junkers drawings; StG 3 in Italy); CoH3 Stuka; Battle of Britain-era photos for the
              gull wing seen head on
    read_at_play_size: a W of a wing with two big boots hanging from its bends, a long canopy, a deep chin, a bomb
    """
    m = Machine('German dive bomber (Ju 87 D Stuka)', ground=None)
    m.add('fuselage', body([(0.0, 0.07, -0.05, 0.36), (2.0, 0.32, -0.40, 0.48), (5.0, 0.52, -0.68, 0.56), (8.0, 0.60, -0.80, 0.60),
                            (10.1, 0.56, -0.72, 0.50), (10.9, 0.42, -0.50, 0.30)], smooth=False),
          'angular fuselage: two crew in the middle, engine in the nose; flat-sided (built, not cast)')
    m.add('radiator', body([(9.2, 0.40, -1.25, -0.55), (10.4, 0.44, -1.30, -0.50), (10.85, 0.36, -1.0, -0.45)], smooth=False),
          'deep radiator bath under the nose: the Stuka\'s heavy jaw', on='fuselage')
    prop(m, 'prop', 10.9, 0, -0.12, 1.7, 3, 'fuselage', spinner=0.30, length=0.55, chord=0.28, why='3-blade Junkers propeller, 3.4 m')
    canopy(m, 'canopy', 5.2, 8.1, 0.46, 0.50, 1.18, 'fuselage', framed=True, why='long greenhouse over pilot and rear gunner, back to back')
    head(m, 'pilot', 7.3, 0, 0.95, 'canopy')
    head(m, 'gunner', 5.9, 0, 0.92, 'canopy', why='rear gunner, facing back: the second head says two-seater')
    m.add('rear_mg', rod((5.6, 0, 0.98), (4.7, 0, 1.12), 0.04), 'twin MG 81Z poking back out of the canopy (a line that carries)', on='canopy', small_ok=True)
    # inverted gull: inner panel slopes DOWN 12 degrees to the bend, outer panel UP 8 degrees to the tip
    bend = 2.6; zb = -0.40 - (bend - 0.5) * math.tan(math.radians(12))
    surface(m, 'wing', [(0.5, 8.55, 6.15, -0.40, 0.50), (bend, 8.45, 6.10, zb, 0.42),
                        (5.6, 8.05, 6.35, zb + 3.0 * math.tan(math.radians(8)), 0.26), (6.9, 7.60, 6.70, zb + 4.3 * math.tan(math.radians(8)), 0.14)],
            'fuselage', 'inverted gull wing: low at the bend so the fixed gear is short and the crew sees down past it')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y = sd * bend
        m.add(f'gear_leg_{s}', solid([(x, y + dy, z) for x in (7.85, 8.25) for dy in (-0.12, 0.12) for z in (zb - 1.1, zb + 0.05)]),
              'fixed gear leg in its fairing from the wing bend: it never retracts', on=f'wing_{s}0', contact=[f'wing_{s}1'])
        m.add(f'spat_{s}', body([(7.2, 0.06, zb - 1.55, zb - 1.35, ), (7.6, 0.22, zb - 1.85, zb - 1.05), (8.3, 0.25, zb - 1.90, zb - 1.00), (8.8, 0.10, zb - 1.55, zb - 1.25)], y=y),
              'wheel spat over the main wheel: the Stuka\'s boots, the shape everyone knows', on=f'gear_leg_{s}')
        y0, y1 = sorted((sd * 3.0, sd * 4.6)); zo = zb + 1.2 * math.tan(math.radians(8))
        m.add(f'dive_brake_{s}', slab(7.35, 7.6, y0, y1, zo - 0.38, zo - 0.08, 'steel'),
              'dive brake slats under the outer wing: hold the dive speed down', on=f'wing_{s}1', small_ok=True)
    m.add('bomb_crutch', solid([(x, y, z) for x in (6.6, 7.8) for y in (-0.18, 0.18) for z in (-0.95, -0.70)], 'steel'),
          'bomb crutch: swings the bomb out past the propeller in the dive', on='fuselage')
    m.add('bomb', body([(5.4, 0.08, -1.22, -1.06), (5.9, 0.24, -1.38, -0.90), (7.6, 0.24, -1.38, -0.90), (8.1, 0.10, -1.24, -1.04)], 'steel'),
          'SC 500 bomb (2 m, 0.47 m across) on the crutch: the reason it dives', on='bomb_crutch')
    m.add('bomb_fins', solid([(x, y, z) for x in (5.0, 5.5) for y in (-0.26, 0.26) for z in (-1.40, -0.88)], 'steel'),
          'bomb tail fins: keep it straight after release', on='bomb')
    surface(m, 'tailplane', [(0.10, 1.75, 0.35, 0.30, 0.14), (2.4, 1.45, 0.55, 0.30, 0.08)], 'fuselage', 'tailplane, braced')
    for sd, s in ((1, 'l'), (-1, 'r')):
        m.add(f'tail_strut_{s}', rod((1.2, sd * 0.12, -0.15), (1.15, sd * 1.25, 0.26), 0.03), 'tailplane strut: braced tail', on='fuselage',
              contact=[f'tailplane_{s}0'], small_ok=True)
    fin(m, 'fin', [(0.30, 1.75, 0.0, 0.16), (1.0, 1.35, 0.05, 0.12), (1.75, 0.95, 0.30, 0.08)], 'fuselage', 'fin and rudder, squarish')
    return m


def b25():
    """Brief
    is:       B-25J Mitchell, twin-engine medium bomber, crew 6; the 12th Air Force's bomber over Italy, 1944
    does:     level bombing in formation (carpet bombing runs), bombs from an internal bay
    gameplay: an ability call-in, usually three in a row; must read as American, twin-engined, bigger than the
              fighters, and the twin tail is its signature from above
    power:    two 14-cylinder radials (R-2600) in long nacelles that also hold the main gear
    moves:    two 3-blade 3.8 m propellers; bomb bay doors under the centre (closed in the blockout)
    built:    slab-sided fuselage; gull wing (dihedral inboard of the engines, flat outboard); twin fins on the
              tailplane tips
    serviced: glazed bombardier nose, stepped cockpit, dorsal turret behind it, tail gun position
    references: B-25J (North American drawings; 321st and 340th BG, Corsica and Italy 1944); CoH3 carpet bombing
    read_at_play_size: a long body, two big engines on a bent wing, glass nose, a turret bump, and an H-shaped tail
    """
    m = Machine('US medium bomber (B-25J Mitchell)', ground=None)
    m.add('fuselage', body([(0.0, 0.30, -0.15, 0.45), (1.0, 0.42, -0.35, 0.58), (4.0, 0.65, -0.75, 0.72), (9.0, 0.78, -1.0, 0.85),
                            (13.2, 0.78, -1.0, 0.85), (14.9, 0.70, -0.88, 0.66)], smooth=False),
          'slab-sided fuselage: crew front and back, the bomb bay in the middle under the wing')
    m.add('nose_glass', body([(14.85, 0.68, -0.86, 0.62), (15.6, 0.50, -0.65, 0.42), (16.1, 0.18, -0.30, 0.10)], 'glass'),
          'glazed nose: the bombardier aims from here', on='fuselage')
    canopy(m, 'canopy', 11.6, 13.4, 0.72, 0.70, 1.40, 'fuselage', framed=True, why='stepped cockpit, pilot and co-pilot side by side')
    head(m, 'pilot', 12.6, 0.35, 1.12, 'canopy')
    m.add('turret', sh.soften(sh.lathe([(0.62 * M, 0), (0.62 * M, 0.12 * M), (0.52 * M, 0.40 * M), (0.25 * M, 0.58 * M), (0, 0.62 * M)], 'glass', n=16)).move(*P(10.1, 0, 0.82)),
          'Martin dorsal turret on a ring: the round bump behind the cockpit', on='fuselage', turns=(P(10.1, 0, 0.82), (0, 0, 1)))
    m.add('turret_guns', solid([(x, y, z) for x in (10.3, 11.6) for y in (-0.16, 0.16) for z in (1.10, 1.20)], 'steel'),
          'twin .50s in the turret', on='turret', small_ok=True)
    m.add('tail_gun', body([(-0.35, 0.18, 0.05, 0.40), (0.3, 0.30, -0.05, 0.62), (1.0, 0.30, 0.25, 0.65)], 'glass'),
          'tail gunner\'s glazed position: the B-25J sting', on='fuselage', contact=['tailplane_l0', 'tailplane_r0'])
    # gull wing: 4.7 degrees dihedral to the nacelles, flat outboard
    r = 3.6; zr = -0.05 + (r - 0.7) * math.tan(math.radians(4.7))
    surface(m, 'wing', [(0.7, 11.05, 7.35, -0.05, 0.55), (r, 10.75, 7.55, zr, 0.48), (9.6, 9.70, 7.90, zr, 0.24), (10.3, 9.35, 8.10, zr, 0.14)],
            'fuselage', 'shoulder-mid gull wing: bent at the engines; carries engines, fuel and gear')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y = sd * 2.95; zc = 0.08
        m.add(f'nacelle_{s}', body([(6.2, 0.15, zc - 0.15, zc + 0.10), (8.5, 0.62, zc - 0.70, zc + 0.55), (11.4, 0.76, zc - 0.78, zc + 0.72), (12.0, 0.76, zc - 0.76, zc + 0.74)], y=y),
              'engine nacelle: holds the radial in front and the main gear behind it, so it runs long past the wing', on=f'wing_{s}0', contact=[f'wing_{s}1'])
        radial_cowl(m, f'cowl_{s}', 11.9, 12.75, y, zc, 0.80, f'nacelle_{s}')
        prop(m, f'prop_{s}', 12.75, y, zc, 1.9, 3, f'cowl_{s}', spinner=0.26, length=0.45, chord=0.30, why='3-blade Hamilton propeller, 3.8 m')
    surface(m, 'tailplane', [(0.20, 2.35, 0.25, 0.48, 0.20), (3.35, 2.05, 0.45, 0.62, 0.12)], 'fuselage',
            'tailplane with a little dihedral, carrying a fin at each tip')
    for sd, s in ((1, 'l'), (-1, 'r')):
        fin(m, f'fin_{s}', [(-0.35, 2.15, 0.10, 0.18), (0.62, 2.20, 0.10, 0.16), (1.90, 1.95, 0.30, 0.12)], f'tailplane_{s}0',
            'twin fins on the tailplane tips: the H tail that names the Mitchell', y=sd * 3.38)
        m.parts[f'fin_{s}1'].contact = (f'tailplane_{s}0',)
    return m


# ---------------------------------------------------------------- transports (they carry the paratroopers)
STATIONS_C47 = [(0.0, 0.12, 0.30, 0.80), (0.5, 0.25, 0.10, 0.85), (4.0, 0.82, -0.62, 1.05), (9.0, 1.17, -1.15, 1.25),
                (16.8, 1.17, -1.15, 1.25), (18.6, 0.82, -0.85, 0.95), (19.4, 0.28, -0.22, 0.25)]
STATIONS_JU52 = [(0.0, 0.14, 0.40, 0.85), (2.5, 0.48, -0.40, 0.98), (8.5, 0.95, -1.10, 1.15), (15.5, 0.95, -1.10, 1.15), (17.6, 0.72, -0.80, 0.70)]


def side_panel(stations, x0, x1, z0, z1, out=0.07, mat='dark'):
    """A thin panel lying on the left side of a body() (a door, a hatch): x0..x1, z0..z1, standing `out` proud."""
    xs, st = [s_[0] for s_ in stations], np.array(stations, float)
    pts = []
    for x in (x0, x1):
        hw, zb, zt = (np.interp(x, xs, st[:, k]) for k in (1, 2, 3))
        zc, h = (zb + zt) / 2, (zt - zb) / 2
        for z in (z0, (z0 + z1) / 2, z1):
            y = hw * math.sqrt(max(0.0, 1 - ((z - zc) / h) ** 2))
            pts += [(x, y - 0.08, z), (x, y + out, z)]
    return solid(pts, mat)


def c47():
    """Brief
    is:       C-47 Skytrain, twin-engine transport; carries 18 paratroopers or bundles; the US paradrop aircraft
    does:     flies low and straight over the drop zone; men jump from the door on the left behind the wing
    gameplay: an ability call-in for paradrops and supply drops; the jump door is where the parachutes appear
    power:    two 14-cylinder radials (R-1830) in nacelles on the wing
    moves:    two 3-blade 3.5 m propellers; gear retracts into the nacelles
    built:    round stressed-skin fuselage; low wing, swept leading edge, straight trailing edge, flat centre section
              and dihedral outer panels; single tall fin with a long dorsal fillet
    serviced: big cargo door, left rear, with the jump door in it (the human-scale cue: 1.5 m tall)
    references: C-47A (Douglas drawings; Troop Carrier Command, Operation Dragoon from Italy, Aug 1944); CoH3
              paradrop and supply drop
    read_at_play_size: a long round body on a long straight-backed wing with two engines, single fin, dark door
    """
    m = Machine('US transport (C-47 Skytrain)', ground=None)
    m.add('fuselage', body(STATIONS_C47),
          'round fuselage: a long tube of cabin for the stick of paratroopers or cargo')
    canopy(m, 'windscreen', 16.9, 18.4, 0.85, 0.90, 1.42, 'fuselage', framed=True, why='flight deck windscreen: marks the nose end')
    head(m, 'pilot', 17.5, 0.45, 1.18, 'windscreen')
    m.add('jump_door', side_panel(STATIONS_C47, 5.2, 6.8, -0.45, 1.0),
          'cargo door, left rear, open for the jump (1.5 m tall: the human-scale cue); parachutes come out here', on='fuselage')
    surface(m, 'wing', [(0.8, 13.30, 9.10, -0.95, 0.62), (3.6, 13.10, 9.20, -0.95, 0.58), (12.5, 11.10, 9.30, -0.95 + 8.9 * math.tan(math.radians(5)), 0.26),
                        (14.5, 10.40, 9.45, -0.95 + 10.9 * math.tan(math.radians(5)), 0.12)],
            'fuselage', 'low wing: flat centre section through the cabin floor, outer panels with dihedral; straight trailing edge')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y = sd * 3.35; zc = -0.50
        m.add(f'nacelle_{s}', body([(9.4, 0.20, zc - 0.25, zc + 0.10), (11.2, 0.62, zc - 0.65, zc + 0.58), (13.6, 0.72, zc - 0.70, zc + 0.70)], y=y),
              'engine nacelle on the wing: engine in front, gear well behind', on=f'wing_{s}0', contact=[f'wing_{s}1'])
        radial_cowl(m, f'cowl_{s}', 13.5, 14.35, y, zc, 0.76, f'nacelle_{s}')
        prop(m, f'prop_{s}', 14.35, y, zc, 1.75, 3, f'cowl_{s}', spinner=0.25, length=0.40, chord=0.28, why='3-blade Hamilton propeller, 3.5 m')
    surface(m, 'tailplane', [(0.20, 2.55, 0.15, 0.78, 0.22), (4.4, 1.75, 0.45, 0.82, 0.10)], 'fuselage', 'tailplane and elevators')
    fin(m, 'fin', [(0.95, 4.6, 0.0, 0.24), (1.55, 2.9, 0.05, 0.22), (3.40, 1.25, 0.30, 0.14), (3.70, 0.95, 0.40, 0.08)], 'fuselage',
        'tall fin and rudder with a long dorsal fillet: the DC-3 tail')
    return m


WING_JU52 = np.array([(0.6, 14.9, 10.4, -1.00, 0.85), (4.6, 14.6, 10.5, -0.86, 0.75), (13.0, 12.8, 10.9, -0.55, 0.32), (14.6, 12.2, 11.1, -0.48, 0.16)])
WING_JU52 = WING_JU52[:, [0, 1, 2, 3, 4]]


def ju52():
    """Brief
    is:       Ju 52/3m g4e, three-engine transport ("Tante Ju"); carries 12-18 Fallschirmjager or containers
    does:     flies low over the drop zone; men jump from the door on the left; containers drop from the belly
    gameplay: the German paradrop and supply-drop aircraft; must read as German, old-fashioned and three-engined
    power:    three 9-cylinder radials (BMW 132): one in the nose, one in front of each wing, toed out
    moves:    three 3-blade propellers; FIXED main gear under the wing nacelles; "double wing" flaps hung below the
              trailing edge along the whole span
    built:    corrugated metal skin (cut until detail: at play size it is a grain, not a shape); boxy fuselage
    serviced: cabin door left rear (the human-scale cue), cockpit windscreen high in front
    references: Ju 52/3m (Junkers drawings; transport units round Rome and the Anzio front 1944); CoH3 Fallschirmjager
              paradrop
    read_at_play_size: three engines in a row across the front, a long thick wing with a strip hanging under its
              back edge, a boxy body, spindly fixed gear
    """
    m = Machine('German transport (Ju 52/3m)', ground=None)
    m.add('fuselage', body(STATIONS_JU52, smooth=False),
          'boxy fuselage, flat sides: the cabin (built of corrugated sheet, not a round tube)')
    radial_cowl(m, 'cowl_c', 17.55, 18.45, 0, -0.10, 0.72, 'fuselage', 'nose engine in a ring cowl: the third engine')
    prop(m, 'prop_c', 18.45, 0, -0.10, 1.4, 3, 'cowl_c', spinner=0.22, length=0.35, chord=0.26, why='3-blade propeller, 2.8 m')
    canopy(m, 'windscreen', 15.4, 17.0, 0.80, 0.95, 1.55, 'fuselage', framed=True, why='cockpit glazing, high and stepped: marks the nose end')
    head(m, 'pilot', 16.2, 0.4, 1.32, 'windscreen')
    m.add('jump_door', side_panel(STATIONS_JU52, 4.4, 5.6, -0.55, 0.85),
          'cabin door, left rear, open for the jump: the human-scale cue', on='fuselage')
    surface(m, 'wing', [tuple(w) for w in WING_JU52],
            'fuselage', 'thick low wing, swept leading edge: a 1930s wing, deep enough to stand in at the root')
    for sd, s in ((1, 'l'), (-1, 'r')):
        for k, (ya, yb) in enumerate(((1.2, 4.6), (4.6, 13.0), (13.0, 13.6))):
            pts = []
            for yy in (ya, yb):
                te = np.interp(yy, WING_JU52[:, 0], WING_JU52[:, 2]); zw = np.interp(yy, WING_JU52[:, 0], WING_JU52[:, 3])
                pts += [(te + 0.30, sd * yy, zw - 0.02), (te + 0.30, sd * yy, zw - 0.16), (te - 1.0, sd * yy, zw - 0.20), (te - 1.0, sd * yy, zw - 0.28)]
            m.add(f'flaps_{s}{k}', solid(pts), 'Junkers "double wing": flaps and ailerons hung in a strip under the trailing edge, the whole span' if k == 0
                  else 'double-wing strip, next panel out', on=f'wing_{s}{k}')
        y = sd * 4.6; zc = -0.75
        m.add(f'nacelle_{s}', body([(12.5, 0.30, zc - 0.25, zc + 0.15), (14.2, 0.58, zc - 0.55, zc + 0.55), (15.2, 0.62, zc - 0.58, zc + 0.58)], y=y),
              'wing engine mount on the leading edge', on=f'wing_{s}1', contact=[f'wing_{s}0'])
        radial_cowl(m, f'cowl_{s}', 15.1, 15.85, y, zc, 0.66, f'nacelle_{s}', 'wing engine in a ring cowl')
        prop(m, f'prop_{s}', 15.85, y, zc, 1.4, 3, f'cowl_{s}', spinner=0.20, length=0.32, chord=0.26, why='3-blade propeller, 2.8 m')
        m.add(f'gear_{s}', solid([(x, y + dy, z) for x in (12.8, 13.3) for dy in (-0.12, 0.12) for z in (-2.25, -1.0)], 'steel'),
              'fixed main gear leg under the engine: it never retracts', on=f'wing_{s}1', contact=[f'wing_{s}0', f'nacelle_{s}'])
        m.add(f'wheel_{s}', sh.cyl(P(13.05, y - 0.2, -2.35), P(13.05, y + 0.2, -2.35), 0.62 * M, 'rubber', seg=16),
              'main wheel, 1.25 m: hangs out in the wind on a fixed gear', on=f'gear_{s}')
    surface(m, 'tailplane', [(0.25, 2.55, 0.10, 0.75, 0.20), (4.6, 1.85, 0.40, 0.80, 0.10)], 'fuselage', 'tailplane and elevators')
    fin(m, 'fin', [(0.85, 2.9, 0.0, 0.22), (2.4, 2.2, 0.15, 0.16), (3.4, 1.5, 0.40, 0.10)], 'fuselage', 'tall rounded fin and rudder')
    return m


# ---------------------------------------------------------------- airship
def k_ship():
    """Brief
    is:       K-class non-rigid airship (US Navy, ZP-14 flew the western Mediterranean from 1944); a blimp: the
              envelope keeps its shape by gas pressure, no frame inside
    does:     slow patrol and spotting; in game a recon loiter (it circles and reveals)
    gameplay: an ability call-in that stays up a long time; must read as huge, slow and soft beside every other
              aircraft, with the crew car underneath giving it scale
    power:    two radial engines on outriggers either side of the control car
    moves:    tractor propellers; four tail fins (top, bottom, both sides) with rudders and elevators
    built:    rubberised-fabric envelope with ballonets inside; control car slung under it on internal cables;
              battened nose cone for the mooring mast
    serviced: crew of ten in the car; boarding door on its side (the human-scale cue)
    references: K-ship drawings and photos (Goodyear, 1943-44); the Hindenburg-era Zeppelins are rigid and were
              all scrapped by 1940, so there is no German counterpart in 1944
    read_at_play_size: a long pale cigar with a cross of fins at the back and a small car with two engines under
              its middle
    """
    m = Machine('US Navy airship (K-class blimp)', ground=None)
    prof = [(0.0, 0.0), (4.5, 6.0), (7.6, 16.0), (8.8, 30.0), (8.8, 44.0), (8.1, 58.0), (6.2, 68.0), (3.6, 74.0), (0.5, 76.7)]
    m.add('envelope', sh.blob_lathe([(r * M, z * M) for r, z in prof], 'canvas', seg=24).ry(90).move(*P(0, 0, 8.8)),
          'gas envelope, 77 m by 17.6 m: the shape is the lifting gas, so it is round and smooth')
    m.add('nose_cone', sh.cyl(P(76.4, 0, 8.8), P(77.2, 0, 8.8), 0.8 * M, 'steel', seg=12),
          'mooring cone with nose battens: where the mast takes it', on='envelope')
    for k, (dy, dz, s) in enumerate(((0, 1, 'top'), (0, -1, 'bottom'), (1, 0, 'l'), (-1, 0, 'r'))):
        def at(x, out):
            rr = np.interp(x, [p[1] for p in prof], [p[0] for p in prof]) - 0.4
            return (x, dy * (rr + out), 8.8 + dz * (rr + out))
        pts = []
        for x, out in ((3.0, 0.0), (15.0, 0.0), (5.5, 6.5), (11.0, 6.5)):
            px, py, pz = at(x, out)
            pts += [(px, py + 0.18 * abs(dz), pz + 0.18 * abs(dy)), (px, py - 0.18 * abs(dz), pz - 0.18 * abs(dy))]
        m.add(f'fin_{s}', solid(pts), 'tail fin with its rudder or elevator: steers and steadies it (four in a cross)', on='envelope')
    m.add('car', solid([(x, y, z) for x, w in ((38.0, 0.8), (40.0, 1.35), (49.0, 1.35), (51.0, 0.6)) for y in (-w, w) for z in (-1.4, 0.35)] +
                       [(x, y, 0.55) for x in (40.0, 49.0) for y in (-0.6, 0.6)]),
          'control car: crew, controls and engines hang here, under the middle where the lift is', on='envelope')
    m.add('car_windows', slab(46.0, 49.6, -1.40, 1.40, -0.45, -0.05, 'glass'), 'flight deck windows: marks the front of the car', on='car')
    m.add('door', slab(42.0, 43.0, 1.33, 1.43, -1.3, -0.05, 'dark'), 'boarding door: the human-scale cue (1.5 m)', on='car')
    for sd, s in ((1, 'l'), (-1, 'r')):
        y = sd * 4.3
        m.add(f'outrigger_{s}', rod((44.5, sd * 1.2, -0.3), (44.5, y, -0.3), 0.12), 'outrigger strut: holds the engine clear of the car', on='car', small_ok=True)
        m.add(f'engine_{s}', body([(42.0, 0.15, -0.45, -0.15), (43.0, 0.55, -0.85, 0.25), (45.6, 0.62, -0.92, 0.32)], y=y),
              'engine nacelle on the outrigger', on=f'outrigger_{s}')
        radial_cowl(m, f'cowl_{s}', 45.5, 46.1, y, -0.3, 0.66, f'engine_{s}', 'radial engine cowl')
        prop(m, f'prop_{s}', 46.1, y, -0.3, 1.5, 3, f'cowl_{s}', spinner=0.20, length=0.35, chord=0.26, why='tractor propeller, 3 m')
    return m


# ---------------------------------------------------------------- parachutes
def _canopy(m, d, crown, skirt, why, mat='canvas', name='canopy'):
    """An open personnel or cargo canopy: inflated diameter d, crown at z=crown, skirt at z=skirt."""
    R = d / 2; h = crown - skirt
    prof = [(R * 0.90, 0), (R, h * 0.18), (R * 0.97, h * 0.40), (R * 0.86, h * 0.63), (R * 0.62, h * 0.84), (R * 0.32, h * 0.97), (R * 0.07, h)]
    m.add(name, sh.blob_lathe([(r * M, z * M) for r, z in prof], mat, seg=24).move(*P(0, 0, skirt)), why)
    m.add('vent', disc(0, 0, crown - 0.04, crown + 0.03, R * 0.07, 'dark', seg=12), 'apex vent: lets air out the top so it does not swing', on=name, small_ok=True)
    return R * 0.90


def _lines(m, n, r, skirt, ends, why='rigging lines from the skirt down to the risers (lines that carry)'):
    """n line bundles from the skirt (radius r, height skirt) to the nearest of `ends` [(name, (x, y, z))].
    Returns {end name: the first line that reaches it} (what that end hangs from)."""
    first = {}
    for k in range(n):
        a = 2 * math.pi * k / n + math.pi / n; top = (r * math.cos(a), r * math.sin(a), skirt + 0.02)
        en, p = min(ends, key=lambda e: (e[1][0] - top[0]) ** 2 + (e[1][1] - top[1]) ** 2)
        m.add(f'line{k}', rod(top, p, 0.012, 'canvas', seg=4), why, on='canopy', contact=[en], small_ok=True)
        first.setdefault(en, f'line{k}')
    return first


def us_parachute():
    """Brief
    is:       T-5 personnel parachute, US Army 1943-44 (28 ft flat canopy, about 6.4 m across inflated)
    does:     lowers one paratrooper at about 5 m/s; opened by static line as he leaves the C-47's door
    gameplay: the squad's men come down under these over the drop zone, then the chutes are dropped; must read as a
              round dome above a man with lines converging on his shoulders
    power:    none: drag
    moves:    sways; collapses on landing (an animation, not geometry)
    built:    silk or nylon gores sewn into a flat circle, 28 suspension lines (12 bundles drawn) to four risers
    references: T-5 assembly (TM 10-1601), Operation Dragoon photographs; the jumper hangs upright, risers to both shoulders
    read_at_play_size: a pale dome over a small dark figure, joined by a fan of thin lines
    The jumper is the unit's own sprite; a stand-in man is drawn here only for scale (part 'jumper').
    """
    m = Machine('US personnel parachute (T-5)', ground=None)
    skirt, crown = 7.4, 10.6
    r = _canopy(m, 6.4, crown, skirt, 'inflated canopy, 6.4 m across: the dome that slows the fall')
    ends = [(f'riser_{s}', (0.0, sd * 0.35, 2.55)) for sd, s in ((1, 'l'), (-1, 'r'))]
    first = _lines(m, 12, r, skirt, ends)
    for (n, conf), sd in zip(ends, (1, -1)):
        m.add(n, rod((0.0, sd * 0.20, 1.45), conf, 0.025, 'canvas', seg=4), 'riser pair down to the shoulder: he hangs upright, hands on them',
              on=first[n], small_ok=True)
    m.add('harness', slab(-0.10, 0.10, -0.24, 0.24, 1.35, 1.50, 'canvas'), 'harness yoke at the shoulders: where the risers clip on',
          on='riser_l', contact=['riser_r'], small_ok=True)
    _jumper(m, 'us', [(0.0, 0.33, 2.15), (0.0, -0.33, 2.15)])
    return m


def de_parachute():
    """Brief
    is:       RZ 20 personnel parachute, Luftwaffe 1941-44 (8.5 m flat canopy, about 6.6 m across inflated)
    does:     lowers one Fallschirmjager; static-line opened
    gameplay: as the US chute; the difference that carries: the RZ hangs the man from a single point at the back of
              his waist, so he comes down leaning forward, not upright, with nothing to hold
    power:    none: drag
    moves:    sways; the man cannot steer it
    built:    silk gores, 24 lines (12 bundles drawn) to a V riser joined behind the jumper's back
    references: RZ 20 (Luftwaffe manuals), photographs of drops round Rome 1943; the forward lean is the signature
    read_at_play_size: a dome over a figure tipped forward, the lines meeting behind his back
    """
    m = Machine('German personnel parachute (RZ 20)', ground=None)
    skirt, crown = 7.5, 10.8
    r = _canopy(m, 6.6, crown, skirt, 'inflated canopy, 6.6 m across')
    conf = (-0.45, 0.0, 2.35)
    first = _lines(m, 12, r, skirt, [('riser', conf)])
    m.add('riser', rod((-0.30, 0.0, 1.05), conf, 0.03, 'canvas', seg=4), 'the V riser down to one point at the back of the waist: why he hangs forward',
          on=first['riser'], small_ok=True)
    m.add('harness', slab(-0.46, -0.16, -0.22, 0.22, 0.86, 1.16, 'canvas'), 'harness ring at the small of the back', on='riser', small_ok=True)
    _jumper(m, 'de', None, lean=25)
    return m


def _jumper(m, side, hands, lean=0):
    """A stand-in man for scale (review only: the game draws the unit's own man), hanging from the harness."""
    from .infantry import crewman, STAND
    from artkit.core.geom import RY
    L, R = (tuple(P(*h)) for h in hands) if hands else (None, None)
    g = crewman(side, STAND, (0, 0, 0), L=L, R=R)
    if lean: g = g.about((-0.3 * M, 0, 1.0 * M), RY(lean))
    m.add('jumper', g, 'stand-in paratrooper for scale (review only; the unit\'s own sprite hangs here in game)',
          on='harness', convex=False, small_ok=True)


def us_supply_drop():
    """Brief
    is:       A-5 delivery container under a G-1 24 ft cargo parachute (coloured by contents in service)
    does:     drops ammunition, rations or medical kit from a C-47; lands hard
    gameplay: supply-drop call-in; lands as a crate the squads pick up
    built:    canvas-wrapped bundle (about 1.5 x 0.6 x 0.6 m) in webbing straps; four risers to a cargo canopy
    references: A-5 container (TM 10-1601), Operation Dragoon resupply photographs
    read_at_play_size: a smaller dome than a man's over a pale box
    """
    m = Machine('US supply drop (A-5 container, cargo chute)', ground=None)
    skirt, crown = 6.4, 9.0
    r = _canopy(m, 5.2, crown, skirt, 'cargo canopy, 5.2 m across inflated')
    conf = (0.0, 0.0, 1.9)
    first = _lines(m, 10, r, skirt, [('sling', conf)])
    m.add('sling', disc(0, 0, conf[2] - 0.05, conf[2] + 0.05, 0.08, 'steel'), 'link where the lines meet the sling', on=first['sling'], small_ok=True)
    m.add('bundle', slab(-0.75, 0.75, -0.32, 0.32, 0.0, 0.62, 'canvas'), 'A-5 bundle: the supplies, wrapped in canvas', on='strap0')
    for k, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        m.add(f'strap{k}', rod((sx * 0.70, sy * 0.28, 0.62), conf, 0.02, 'canvas', seg=4), 'sling strap from a corner of the bundle up to the link',
              on='sling', contact=['bundle'], small_ok=True)
    return m


def de_supply_drop():
    """Brief
    is:       Abwurfbehalter 250 supply canister under its cargo parachute
    does:     drops weapons and ammunition to Fallschirmjager; a crushable bumper cap takes the landing
    gameplay: German supply-drop call-in
    built:    steel cylinder about 1.7 m long and 0.4 m across, hanging nose down, crush cap at the bottom, the
              parachute packed in the top end
    references: Abwurfbehalter (Luftwaffe drawings), Crete and Italy photographs
    read_at_play_size: a dome over a short dark upright tube
    """
    m = Machine('German supply drop (Abwurfbehalter)', ground=None)
    skirt, crown = 6.8, 9.5
    r = _canopy(m, 5.4, crown, skirt, 'cargo canopy, 5.4 m across inflated')
    conf = (0.0, 0.0, 2.4)
    first = _lines(m, 10, r, skirt, [('riser', conf)])
    m.add('riser', rod((0, 0, 1.74), conf, 0.03, 'canvas', seg=4), 'riser from the lines down to the canister top', on=first['riser'], small_ok=True)
    m.add('canister', sh.cyl(P(0, 0, 0.25), P(0, 0, 1.75), 0.21 * M, 'hull', seg=14), 'steel supply canister, hanging upright', on='riser')
    m.add('crush_cap', sh.cyl(P(0, 0, 0.0), P(0, 0, 0.27), 0.18 * M, 'steel', r1=0.22 * M, seg=14), 'crush cap: takes the landing', on='canister')
    return m


ALL = [('us', 'fighter', p47), ('de', 'fighter', bf109), ('de', 'dive bomber', ju87), ('us', 'bomber', b25),
       ('us', 'transport', c47), ('de', 'transport', ju52), ('us', 'airship', k_ship),
       ('us', 'parachute', us_parachute), ('de', 'parachute', de_parachute),
       ('us', 'supply drop', us_supply_drop), ('de', 'supply drop', de_supply_drop)]
