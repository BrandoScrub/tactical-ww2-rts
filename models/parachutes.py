"""Parachutes for paradropped squads and supply drops: one artkit.machine.Machine per rig and stage, check() empty.
Briefs follow artkit/DESIGN_METHOD.md. Frame as models/kit.py: metres in, 55 units a metre out; the jumper faces +x,
+y is his left, his boots are at z = 0 (the rig hangs above him); a landed rig lies on the ground (z = 0).

Stages (the three pictures a drop needs):
  opening   just out of the aircraft: the canopy a narrow half-filled tube, lines taut and nearly parallel
  open      the descent: full canopy, lines fanning from the skirt down to the risers
  landed    on the ground: the canopy a collapsed heap beside the landing point, lines trailing to the harness

What a real canopy is, and so what is modelled (the first version was a smooth balloon on twelve thick ropes):
  gores     a flat circular canopy is sewn from wedge panels (28 on a 28 ft canopy). A suspension line runs up every
            seam and over the top, so each seam is pulled in and each gore billows out between two lines: a
            scalloped pumpkin, not a dome. The skirt arches up between the line attachments.
  shape     the cloth is a flat disc, so inflated it is about two thirds of its laid-out diameter across and
            shallower than a hemisphere, widest a little above the skirt, with the skirt drawn in under it.
  vent      a hole at the crown lets air out so the canopy does not rock.
  lines     one per seam, all the same length, gathered at the bottom into the risers: four risers on the American
            harness (front and back of each shoulder), one V strap behind the back on the German one.
Sources: US 28 ft flat circular canopy (28 gores, 28 lines, T-5 with its 22 ft chest reserve): US rigging manuals and
surviving T-5 assemblies. German RZ 20: built from general knowledge of the type (single suspension point behind the
shoulders, no reserve, no risers to hold); its line length here is a stand-in. Line lengths: T-5 22 ft (6.7 m).
"""
import math
import numpy as np
from artkit import shapes as sh
from artkit.core.geom import Geometry, SMOOTH, RY
from artkit.machine import Machine
from .kit import M, P, solid, slab, rod, disc

CORD = 0.02          # drawn radius of a suspension line (m): real cord is 4 mm; this is 1 px at play size
LINE_WHY = 'suspension lines, one per seam, from the skirt down to the riser (drawn as lines: no outline)'


# ---------------------------------------------------------------- canopy
class Canopy:
    """A gored canopy. d: inflated diameter (m), h: height skirt to crown, gores: panels, skirt_z: height of the
    skirt's line attachments, vent: vent radius, billow: how far a gore bulges out between its lines (share of the
    radius, at the skirt), arch: how far the skirt rises between attachments (m), tuck: how far below the widest
    point the skirt sits (radians of the profile). ragged: per-gore unevenness (a collapsed or filling canopy)."""

    def __init__(s, d, h, gores=28, skirt_z=0.0, vent=0.23, billow=0.075, arch=0.16, tuck=0.26, ragged=0.0, seed=1,
                 centre=(0.0, 0.0), stretch=(1.0, 1.0)):
        s.R, s.gores, s.vent, s.billow, s.arch, s.tuck = d / 2, gores, vent, billow, arch, tuck
        s.p1 = math.acos(min(0.99, vent / s.R)); s.semi = h / (math.sin(s.p1) + math.sin(tuck))
        s.skirt_z, s.centre, s.stretch = skirt_z, centre, stretch
        r = np.random.default_rng(seed)
        a = 2 * math.pi * np.arange(gores + 1) / gores; p = r.uniform(0, 6.28, 4)
        low = lambda q: 0.5 * np.sin(2 * a + p[q]) + 0.3 * np.sin(3 * a + p[q + 1]) + 0.2 * r.uniform(-1, 1, gores + 1)    # mostly slow: folds, not teeth
        s.wob = 1.0 + ragged * low(0)[:gores]; s.lift = ragged * (0.5 + 0.5 * low(2)); s.lift[-1] = s.lift[0]

    def at(s, k, u, t):
        """A point on gore k: u 0..1 across it (0 and 1 are its seams), t 0 at the skirt to 1 at the vent. Metres."""
        a = 2 * math.pi * (k + u) / s.gores; phi = -s.tuck + (s.p1 + s.tuck) * t; b = math.sin(math.pi * u)
        r = s.R * math.cos(phi) * (1 + s.billow * (1 - t) ** 0.7 * b * s.wob[k % s.gores])
        r *= 1 + (s.wob[k % s.gores] - 1) * (1 - u) * (1 - t) + (s.wob[(k + 1) % s.gores] - 1) * u * (1 - t) if s.lift.any() else 1
        z = s.semi * (math.sin(phi) + math.sin(s.tuck)) + s.arch * b * (1 - t) ** 3
        z += s.semi * (s.lift[k % s.gores] * (1 - u) + s.lift[(k + 1) % s.gores] * u) * math.sin(math.pi * min(1.0, t * 1.4)) * 0.8
        return np.array([s.centre[0] + s.stretch[0] * r * math.cos(a), s.centre[1] + s.stretch[1] * r * math.sin(a), s.skirt_z + z])

    def seam(s, k): return tuple(s.at(k, 0.0, 0.0))

    @property
    def crown(s): return float(s.at(0, 0.0, 1.0)[2])

    def geometry(s, mat, alt=None, sub=4, rings=9):
        """The cloth: smooth inside a gore, creased at every seam. alt: a second material for every other gore."""
        Pn, Nn, UV, mats = [], [], [], []
        e = 1e-3
        def nrm(k, u, t):
            u0, u1 = max(0.0, u - e), min(1.0, u + e); t0, t1 = max(0.0, t - e), min(1.0, t + e)
            n = np.cross(s.at(k, u1, t) - s.at(k, u0, t), s.at(k, u, t1) - s.at(k, u, t0))
            return n / max(np.linalg.norm(n), 1e-9)
        gw = 2 * math.pi * s.R / s.gores * M; gh = s.semi * 1.6 * M
        for k in range(s.gores):
            V = [[s.at(k, j / sub, i / rings) * M for j in range(sub + 1)] for i in range(rings + 1)]
            Nv = [[nrm(k, j / sub, i / rings) for j in range(sub + 1)] for i in range(rings + 1)]
            for i in range(rings):
                for j in range(sub):
                    q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                    for tri in ((0, 1, 2), (0, 2, 3)):
                        Pn.append([V[q[c][0]][q[c][1]] for c in tri]); Nn.append([Nv[q[c][0]][q[c][1]] for c in tri])
                        UV.append([((k + q[c][1] / sub) * gw, q[c][0] / rings * gh) for c in tri])
                        mats.append(alt if alt and k % 2 else mat)
        return Geometry(P=np.array(Pn), N=np.array(Nn), UV=np.array(UV), mat=np.array(mats, object), look=SMOOTH, wear=False)

    def vent_cap(s, mat='opening'):
        c = s.at(0, 0.0, 1.0); return disc(s.centre[0], s.centre[1], c[2] - 0.03, c[2] + 0.02, s.vent * 1.02, mat, seg=14)


def lines(m, name, can, ks, end, on='canopy', contact=(), sag=0.0):
    """Suspension lines from the canopy's seams ks down to one point: a single part, drawn without outlines."""
    g = []
    for k in ks:
        a = np.array(can.seam(k)); b = np.array(end, float)
        if sag:
            mid = (a + b) / 2; mid[2] = min(a[2], b[2], sag); pts = [a, mid, b]
        else: pts = [a, b]
        g += [sh.cyl(P(*p), P(*q), CORD * M, 'cord', seg=4, thin=1, wear=False) for p, q in zip(pts[:-1], pts[1:])]
    g = Geometry.join(g); g = g._new(low=np.ones(len(g), np.int8))          # thin + low: neither seeds nor rims an ink line
    m.add(name, g, LINE_WHY, on=on, contact=contact, convex=False, small_ok=True)


def _rig(m, can, cloth, alt, why):
    m.add('canopy', can.geometry(cloth, alt), why)
    m.add('vent', can.vent_cap(), 'apex vent: lets air out of the crown so the canopy does not rock', on='canopy', small_ok=True)


def _heap(m, cloth, alt, gores, at, d, why, seed):
    """The canopy collapsed on the ground: a low uneven heap of cloth, one side still humped with trapped air."""
    can = Canopy(d, 0.55, gores, skirt_z=0.0, vent=0.2, billow=0.05, arch=0.0, tuck=0.02, ragged=0.38, seed=seed, centre=at, stretch=(1.25, 0.82))
    m.add('canopy', can.geometry(cloth, alt, sub=3, rings=6), why, convex=False)
    return can


# ---------------------------------------------------------------- the man under it
DESCEND = dict(pelvis=(0, 0, -5), chest_rot=(0, 4, 0), foot_L=(7, 3.5, 0, 12, 2), foot_R=(7, -3.5, 0, 12, -2))    # feet and knees together, knees eased: the landing position
HANG = dict(pelvis=(0, 0, -4), chest_rot=(0, -4, 0), foot_L=(10, 7, 0, 0, 8), foot_R=(4, -7, 0, 0, -8))        # slung from behind: knees eased, legs hanging under him


def _man(side, pose, hands=None, lean=0.0, pivot=(0, 0, 0)):
    from .infantry import crewman
    L, R = (tuple(P(*h)) for h in hands) if hands else (None, None)
    g = crewman(side, pose, (0, 0, 0), L=L, R=R)
    return g.about(P(*pivot), RY(lean)) if lean else g


# ---------------------------------------------------------------- personnel parachutes
def us_parachute(stage='open', jumper=True):
    """Brief
    is:       T-5 troop parachute, US Army airborne 1942-45: 28 ft flat circular canopy (28 gores, 28 lines), static
              line opened, with a 22 ft reserve in a chest pack
    does:     lowers one paratrooper at about 5-6 m/s from a C-47's door
    gameplay: each man of a paradropped squad comes down under one, lands, and leaves it on the ground; it must read
              as a canopy over a man from every heading and tell American from German
    power:    none: drag
    moves:    opens as a streamer, fills, sways; collapses on landing (the three stages)
    built:    camouflage nylon gores (green patches: the 1943-44 airborne canopy); lines gathered seven to a riser,
              four risers (front and back of each shoulder) down to the harness; empty pack tray on his back;
              reserve on his chest
    serviced: packed by riggers; the man checks the man in front
    references: surviving T-5 assemblies and wartime photographs (Sicily, Operation Dragoon); 28 ft canopy rigging
              manuals for the gore and line layout
    read_at_play_size: a scalloped green dome, a fan of pale lines closing to two points at his shoulders, a man
              hanging upright with his hands up on the risers and a pack on his chest
    The man is a stand-in for scale and pose (jumper=False leaves him out: the game hangs the squad's own man there).
    """
    m = Machine(f'US personnel parachute (T-5), {stage}', ground=0.0 if stage == 'landed' else None)
    if stage == 'landed':
        can = _heap(m, 'us_chute', None, 28, (-4.6, 0.9), 5.0, 'the canopy collapsed where it fell: left on the drop zone', 5)
        m.add('harness', slab(-0.35, 0.25, -0.30, 0.30, 0.0, 0.14, 'us_canvas'), 'harness and pack tray dropped at the landing point: he is out of it and fighting', on='lines')
        m.add('reserve', slab(0.24, 0.56, -0.20, 0.20, 0.0, 0.20, 'us_canvas'), 'unused reserve pack lying by the harness', on='harness', small_ok=True)
        lines(m, 'lines', can, [k for k in range(28) if math.cos(2 * math.pi * k / 28) > 0.1], (0.0, 0.0, 0.10), sag=0.03)
        return m
    full = stage == 'open'
    sh_z = 1.45                                                       # shoulder height of a hanging man (m)
    links = {(fx, sd): (fx * 0.10, sd * 0.34, sh_z + 0.92) for fx in (1, -1) for sd in (1, -1)}    # connector links: tops of the four risers
    d, h, L = (5.8, 2.45, 6.7) if full else (1.9, 3.3, 6.7)
    skirt = sh_z + 0.92 + math.sqrt(L * L - (d / 2 * 0.96 - 0.3) ** 2)
    can = Canopy(d, h, 28, skirt_z=skirt) if full else Canopy(d, h, 28, skirt_z=skirt, billow=0.12, arch=0.05, tuck=0.5, ragged=0.10, seed=3)
    _rig(m, can, 'us_chute', None, 'inflated canopy, 28 gores: each billows between two lines; the drag that lowers him' if full
         else 'canopy just out of the pack: a narrow tube of cloth beginning to fill from the skirt')
    for (fx, sd), tip in links.items():
        n = ('f' if fx > 0 else 'b') + ('l' if sd > 0 else 'r')
        ks = [k for k in range(28) if (math.cos(2 * math.pi * (k + 0.5) / 28) > 0) == (fx > 0) and (math.sin(2 * math.pi * (k + 0.5) / 28) > 0) == (sd > 0)]
        lines(m, f'lines_{n}', can, ks, tip, contact=[f'riser_{n}'])
        m.add(f'riser_{n}', rod((fx * 0.04, sd * 0.19, sh_z), tip, 0.026, 'us_canvas', seg=4), 'riser: webbing from the shoulder up to seven lines; front and back of each shoulder',
              on=f'lines_{n}', small_ok=True)
    m.add('harness', slab(-0.16, 0.16, -0.21, 0.21, sh_z - 0.10, sh_z + 0.02, 'us_canvas'), 'harness yoke over the shoulders: the four risers are sewn to it',
          on='riser_fl', contact=['riser_fr', 'riser_bl', 'riser_br'], small_ok=True)
    m.add('pack_tray', slab(-0.30, -0.13, -0.19, 0.19, 0.98, sh_z - 0.04, 'us_canvas'), 'empty pack tray on his back: the canopy came out of it', on='harness')
    for sd, s_ in ((1, 'l'), (-1, 'r')):
        y0, y1 = sorted((sd * 0.10, sd * 0.17))
        m.add(f'lift_web_{s_}', slab(0.09, 0.14, y0, y1, 1.10, sh_z - 0.08, 'us_canvas'), 'main lift web down the chest from the shoulder: the reserve clips to its rings',
              on='harness', small_ok=True)
    m.add('reserve', slab(0.12, 0.31, -0.17, 0.17, 0.98, 1.24, 'us_canvas'), 'reserve parachute on the chest: only the Americans carry one, so it tells the sides apart',
          on='lift_web_l', contact=['lift_web_r'])
    if jumper:
        hands = [(0.10, 0.31, sh_z + 0.55), (0.10, -0.31, sh_z + 0.55)]
        m.add('jumper', _man('us', DESCEND, hands), 'the paratrooper, upright, hands on the front risers, feet together (stand-in: the game hangs the squad\'s own man here)',
              on='harness', contact=['pack_tray', 'reserve', 'lift_web_l', 'lift_web_r', 'riser_fl', 'riser_fr'], convex=False, small_ok=True)
    return m


def de_parachute(stage='open', jumper=True):
    """Brief
    is:       RZ 20 troop parachute, Luftwaffe Fallschirmjager 1941-45: 28-gore flat circular canopy, static line
              opened, no reserve
    does:     lowers one man, quickly and without control
    gameplay: as the American rig; the difference that carries is the man: the RZ hangs him from ONE point behind
              his shoulders, so he comes down tipped forward, arms and legs free, with no risers to hold and no
              chest pack
    power:    none: drag
    moves:    as the American rig (opening, open, landed)
    built:    pale silk or camouflage gores (pale here, to set it against the American green); the lines gather
              into one point above and behind him; a V strap runs from there to two rings on the back of the harness
    references: Fallschirmjager drop photographs (Crete; the Gran Sasso and Leros drops of 1943); general knowledge
              of the RZ harness. Line length (5.6 m) is a stand-in.
    read_at_play_size: a pale scalloped dome, lines closing to a single point, a man tipped forward under it
    """
    m = Machine(f'German personnel parachute (RZ 20), {stage}', ground=0.0 if stage == 'landed' else None)
    if stage == 'landed':
        can = _heap(m, 'de_chute', None, 28, (-4.2, -0.8), 5.0, 'the canopy collapsed where it fell', 9)
        m.add('harness', slab(-0.30, 0.25, -0.28, 0.28, 0.0, 0.13, 'de_canvas'), 'harness dropped at the landing point (the RZ took a long minute to get out of)', on='lines')
        lines(m, 'lines', can, [k for k in range(28) if math.cos(2 * math.pi * k / 28) > 0.1], (0.0, 0.0, 0.09), sag=0.03)
        return m
    full = stage == 'open'
    lean, pivot = 30.0, (0.0, 0.0, 1.0)
    R = RY(lean)[:3, :3]
    tip = lambda p: tuple(np.asarray(pivot) + R @ (np.asarray(p, float) - np.asarray(pivot)))      # a point on the man, after he tips forward
    rings = {sd: tip((-0.15, sd * 0.17, 1.38)) for sd in (1, -1)}                                  # the two rings at the back of his shoulders
    apex = (rings[1][0] - 0.05, 0.0, rings[1][2] + 1.15)                                           # where every line meets
    d, h, L = (5.8, 2.45, 5.6) if full else (1.9, 3.3, 5.6)
    skirt = apex[2] + math.sqrt(L * L - (d / 2 * 0.96) ** 2)
    can = (Canopy(d, h, 28, skirt_z=skirt, centre=(apex[0], 0.0)) if full else
           Canopy(d, h, 28, skirt_z=skirt, billow=0.12, arch=0.05, tuck=0.5, ragged=0.10, seed=7, centre=(apex[0], 0.0)))
    _rig(m, can, 'de_chute', None, 'inflated canopy, 28 gores' if full else 'canopy just out of the bag, beginning to fill')
    lines(m, 'lines', can, range(28), apex, contact=['strap_l', 'strap_r'])
    for sd, s in ((1, 'l'), (-1, 'r')):
        m.add(f'strap_{s}', rod(rings[sd], apex, 0.028, 'de_canvas', seg=4), 'one leg of the V strap from the single suspension point down to a ring behind the shoulder: why he hangs forward',
              on='lines', small_ok=True)
    body = lambda x0, x1, y0, y1, z0, z1: sh.convex([P(*tip((x, y, z))) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)], 'de_canvas')
    m.add('harness', body(-0.17, -0.11, -0.20, 0.20, 1.22, 1.44), 'harness back plate with the two rings: the whole load goes through here',
          on='strap_l', contact=['strap_r'], small_ok=True)
    m.add('pack', body(-0.30, -0.15, -0.17, 0.17, 0.98, 1.24), 'empty parachute bag on his back, below the rings', on='harness')
    if jumper:
        m.add('jumper', _man('de', HANG, lean=lean, pivot=pivot), 'the Fallschirmjager, tipped forward, limbs free (stand-in: the game hangs the squad\'s own man here)',
              on='harness', contact=['pack'], convex=False, small_ok=True)
    return m


# ---------------------------------------------------------------- supply drops
def _cargo(m, stage, cloth, load_top, d, L, seed, alt=None, gores=24):
    """The cargo canopy and its lines down to one link above the load. Returns the link point (the load hangs from it)."""
    link = (0.0, 0.0, load_top + 0.75)
    full = stage == 'open'
    dd, h = (d, d * 0.42) if full else (d * 0.33, d * 0.55)
    skirt = link[2] + math.sqrt(L * L - (dd / 2 * 0.96) ** 2)
    can = Canopy(dd, h, gores, skirt_z=skirt, vent=0.2) if full else Canopy(dd, h, gores, skirt_z=skirt, vent=0.2, billow=0.12, arch=0.05, tuck=0.5, ragged=0.10, seed=seed)
    _rig(m, can, cloth, alt, 'cargo canopy: smaller than a man\'s, coloured so the men on the ground know what is under it')
    lines(m, 'lines', can, range(gores), link, contact=['link'])
    m.add('link', disc(0, 0, link[2] - 0.06, link[2] + 0.06, 0.07, 'steel', seg=8), 'steel link where the lines meet the load\'s sling', on='lines', small_ok=True)
    return link


def us_supply_drop(stage='open'):
    """Brief
    is:       A-7 delivery sling round two ammunition crates under a G-1 24 ft cargo parachute
    does:     drops ammunition and rations from a C-47's door or its belly racks
    gameplay: the supply-drop call-in; lands as crates the squads collect. Must read as a crate, not a man
    built:    two wooden crates (0.9 x 0.45 x 0.35 m each) stacked, bound by two webbing straps that meet at one
              link; a 24-gore cargo canopy. US cargo canopies were dyed by contents: red for ammunition (used here),
              blue rations, yellow signals, green fuel, white medical
    references: A-7 sling and G-1 canopy in Troop Carrier resupply photographs (Dragoon, Market Garden)
    read_at_play_size: a small red dome over a wooden box
    """
    m = Machine(f'US supply drop (A-7 sling, G-1 cargo canopy), {stage}', ground=0.0 if stage == 'landed' else None)
    top = 0.70
    def load(on):
        m.add('crate_upper', slab(-0.45, 0.45, -0.24, 0.24, 0.35, top, 'wood'), 'ammunition crate: the supplies', on=on)
        m.add('crate_lower', slab(-0.45, 0.45, -0.24, 0.24, 0.0, 0.35, 'wood'), 'second crate strapped under it', on='crate_upper')
        for k, x in enumerate((-0.25, 0.25)):
            m.add(f'band{k}', slab(x - 0.04, x + 0.04, -0.26, 0.26, 0.0, top + 0.02, 'us_canvas'), 'webbing strap of the A-7 sling binding the crates', on='crate_upper',
                  contact=['crate_lower'], small_ok=True)
    if stage == 'landed':
        can = _heap(m, 'us_cargo_chute', None, 24, (-3.6, 0.7), 4.2, 'the cargo canopy collapsed beside the load: its red marks the drop for the men who need it', 4)
        link = (-0.75, 0.0, 0.06)
        lines(m, 'lines', can, [k for k in range(24) if math.cos(2 * math.pi * k / 24) > 0.1], link, sag=0.03, contact=['link'])
        m.add('link', disc(link[0], 0, 0.0, 0.10, 0.07, 'steel', seg=8), 'steel link where the lines meet the sling, lying by the crates', on='lines', small_ok=True)
        for k, sy in enumerate((1, -1)):
            m.add(f'sling{k}', rod((-0.47, sy * 0.24, top), link, 0.022, 'us_canvas', seg=4), 'sling leg, slack now', on='link', small_ok=True)
        load('sling0')
        return m
    link = _cargo(m, stage, 'us_cargo_chute', top, 4.9, 5.2, 4)
    for k, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        m.add(f'sling{k}', rod((sx * 0.25, sy * 0.24, top), link, 0.022, 'us_canvas', seg=4), 'sling leg from a strap up to the link', on='link', small_ok=True)
    load('sling0')
    return m


def de_supply_drop(stage='open'):
    """Brief
    is:       Abwurfbehalter (air-drop canister), the Luftwaffe's standard supply container
    does:     drops weapons and ammunition to Fallschirmjager and cut-off troops
    gameplay: the German supply-drop call-in; lands as a canister
    built:    steel cylinder 1.6 m long, 0.4 m across, hanging nose down; a crushable corrugated cap on the nose
              takes the landing; its parachute packs into the tail end; carrying handles; coloured bands by contents
    references: Abwurfbehalter survivors and Luftwaffe drawings; photographs from Crete and Italy
    read_at_play_size: a small pale dome over an upright steel tube with a red band (lying on its side once landed)
    """
    m = Machine(f'German supply drop (Abwurfbehalter), {stage}', ground=0.0 if stage == 'landed' else None)
    if stage == 'landed':
        can = _heap(m, 'de_chute', None, 24, (-3.8, -0.6), 4.2, 'the cargo canopy collapsed beside the canister', 6)
        lines(m, 'lines', can, [k for k in range(24) if math.cos(2 * math.pi * k / 24) > 0.1], (-0.82, 0.0, 0.20), sag=0.03, contact=['canister'])
        m.add('canister', sh.cyl(P(-0.80, 0, 0.20), P(0.55, 0, 0.20), 0.20 * M, 'de_hull', seg=14), 'the canister on its side where it fell: open it along the seam', on='lines')
        m.add('crush_cap', sh.cyl(P(0.55, 0, 0.20), P(0.80, 0, 0.20), 0.20 * M, 'steel', r1=0.15 * M, seg=14), 'crush cap, spent', on='canister')
        m.add('band', sh.cyl(P(-0.25, 0, 0.20), P(-0.05, 0, 0.20), 0.207 * M, 'band_red', seg=14), 'coloured band: what is inside', on='canister', small_ok=True)
        return m
    top = 1.85
    link = _cargo(m, stage, 'de_chute', top, 4.6, 5.0, 6)
    m.add('riser', rod((0, 0, top), link, 0.028, 'de_canvas', seg=4), 'riser from the canister\'s tail up to the link', on='link', small_ok=True)
    m.add('canister', sh.cyl(P(0, 0, 0.25), P(0, 0, top), 0.20 * M, 'de_hull', seg=14), 'steel canister, hanging nose down: the supplies', on='riser')
    m.add('crush_cap', sh.cyl(P(0, 0, 0.0), P(0, 0, 0.25), 0.15 * M, 'steel', r1=0.20 * M, seg=14), 'crushable cap on the nose: takes the landing', on='canister')
    m.add('band', sh.cyl(P(0, 0, 1.15), P(0, 0, 1.35), 0.207 * M, 'band_red', seg=14), 'coloured band round the canister: tells what is inside', on='canister', small_ok=True)
    for sd, s in ((1, 'l'), (-1, 'r')):
        m.add(f'handle_{s}', slab(-0.03, 0.03, sd * 0.19, sd * 0.27, 0.70, 1.00, 'steel') if sd > 0 else slab(-0.03, 0.03, -0.27, -0.19, 0.70, 1.00, 'steel'),
              'carrying handle: four men carry it off the drop zone (the human-scale cue)', on='canister', small_ok=True)
    return m


STAGES = ('opening', 'open', 'landed')
RIGS = [('us', 'parachute', us_parachute), ('de', 'parachute', de_parachute), ('us', 'supply_drop', us_supply_drop), ('de', 'supply_drop', de_supply_drop)]
# tools/check.py reads ALL as (role, name, constructor)
ALL = [(role.replace('_', ' '), f'{side} {role} {stage}', (lambda fn=fn, stage=stage: fn(stage))) for side, role, fn in RIGS for stage in STAGES]
