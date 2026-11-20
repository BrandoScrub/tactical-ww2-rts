"""Field defences a builder lays (data.js DEFENCES) and the two fighting positions CoH3's engineers build.
Metres in, units out (kit.M, 55 units a metre: props are not compressed like houses). x along the line, y across,
z up; the camera sees the +x and +y faces. Grey blockouts first (DESIGN_METHOD.md step 6): shapes and sizes only.

CoH3 (coh3stats.com, Nov 2026): US Engineers and German Pioneers both build Sandbag Wall (6 s, heavy cover),
Barbed Wire Fence (3 s, blocks infantry, crushed by vehicles), Tank Trap (9 s, blocks vehicles, heavy cover, heavy
tanks crush it). US Fighting Position (100 mp, 15 s) and German Fighting Nest (50 mp, 20 s) hold one infantry squad
or an HMG team. Game lengths per piece: sandbags 4 m, wire 4 m, tank trap 2 m (data.js).

Real sizes used:
  sandbag laid 20 x 10 x 5 in (0.5 x 0.25 x 0.13 m): Military Training Pamphlet No. 30 Part V (1941)
  knife rest (Spanischer Reiter): 4 ft high, legs spread 4 ft, trestles 4-5 ft apart: Lone Sentry, German barbed wire
  concertina on screw pickets; coil about 0.9 m across: FM 5-15 (1944) / Lone Sentry
  Czech hedgehog: at most 1.4 m high, steel angle: Wikipedia, US Engineer School EN0065
  German positions in the Italian hills: shallow scooped pits ringed with stone and earth walls 3-4 ft high:
  Tactical and Technical Trends, "German Stone Bunkers"
"""
import os, sys, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
import numpy as np
from artkit import shapes as sh
from artkit.assembly import Assembly
from artkit.core.geom import Geometry
from models.kit import M

BAG = (.5, .25, .13)          # laid sandbag, metres


def _pillow(L, W, H, mat='sandbag'):
    """A filled bag: full size at its waist, ends and faces drawn in, shaded round (a casting-style soften)."""
    l, w, h, i = L / 2, W / 2, H / 2, .82
    pts = [(sx * l, sy * w, 0) for sx in (-1, 1) for sy in (-1, 1)]
    pts += [(sx * l * i, sy * w * i, sz * h) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    pts += [(sx * l, 0, sz * h * .7) for sx in (-1, 1) for sz in (-1, 1)]     # ends bulge: the tied neck and the seam
    g = sh.convex([tuple(v * M for v in p) for p in pts], mat)
    return sh.soften(g)


def _place(g, x, y, z, ang):
    """Turn g (built along +x) by ang radians about z, then move to (x, y, z) metres."""
    return g.rz(math.degrees(ang)).move(x * M, y * M, z * M)


def _path(length, bend):
    """Centre line of a wall: straight along x, or an arc that bows towards +y by `bend` metres at the middle.
    Returns (pos, run): pos(s) -> (x, y, angle) for s in metres along the line, run = the line's own length."""
    if abs(bend) < 1e-3:
        return (lambda s: (s, 0.0, 0.0)), length
    c = length / 2; R = (c * c + bend * bend) / (2 * bend); th = 2 * math.asin(c / R)
    cy = bend - R
    def pos(s):
        a = -th / 2 + s / R                                             # angle from the arc's mid-point
        return c + R * math.sin(a), cy + R * math.cos(a), -a
    return pos, R * th


# ---------------------------------------------------------------------------------------------------------------
def sandbag_wall(length=4.0, bend=0.0, courses=6, module=False):
    """BRIEF
      is:        a sandbag breastwork, the CoH3 Sandbag Wall (one 4 m piece; bend > 0 for the curved pieces maps ship)
      does:      heavy cover for a squad kneeling behind it; vaultable; grenades and HE wear it down
      gameplay:  4 m long (data.js len), knee-to-waist high so men behind it read as covered, not hidden
      built:     bags filled with earth, laid in courses with joints broken (half-bag stagger), thicker at the base
                 and stepped in towards the top so the wall stands without a revetment frame
      references: MTP No. 30 Part V (bag 20 x 10 x 5 in laid); US / British field photos (stepped breastworks);
                 CoH3 sandbag walls (single colour band, rounded tops read at play size)
      read_at_play_size: "a low lumpy tan wall men crouch behind"
    module=True: a piece the game repeats along any line: every bag whose centre falls in [0, length) is kept (the
    stagger's half bags overhang the ends and meet the next piece's), and the piece is centred on the origin.
    """
    a = Assembly(); pos, run = _path(length, bend)
    a.note(f'sandbag wall {length} m, bend {bend} m, {courses} courses')
    L, W, H = BAG
    rows = [3, 3, 2, 2, 2, 1][:courses] + [1] * max(0, courses - 6)   # why: about 0.75 m thick at the base stops rifle fire; stepped in so it stands
    for c, n in enumerate(rows):
        gs = []; off = (c % 2) * L / 2                                  # why: half-bag stagger so no joint runs through two courses
        k = int(math.ceil(run / L)) + 2
        for r in range(n):
            yo = (r - (n - 1) / 2) * W
            for i in range(k):
                s = i * L + L / 2 - off
                if module: ok = -1e-6 <= s < run - 1e-6
                else: ok = L * .3 <= s <= run - L * .3                 # ends finish square, no half bags hanging off
                if not ok: continue
                x, y, ang = pos(s)
                gs.append(_place(_pillow(L * .98, W * .96, H), x - math.sin(ang) * yo, y + math.cos(ang) * yo, c * H * .92 + H / 2, ang))
        a.add(f'course_{c}', Geometry.join(gs), grounded=(c == 0), tag='body')   # why: each course rests on the one below
    if module: a.shift(-length / 2 * M, 0, 0)
    return a


# ---------------------------------------------------------------------------------------------------------------
def _helix(x0, x1, r, zc, pitch, y=0.0, n_per=20):
    t = np.linspace(0, 1, max(8, int((x1 - x0) / pitch * n_per)))
    th = 2 * math.pi * (x1 - x0) / pitch * t
    return np.stack([x0 + (x1 - x0) * t + .05 * np.sin(th), y + r * np.cos(th), zc + r * np.sin(th)], 1) * M


def wire_concertina(length=4.0, module=False):
    """BRIEF
      is:        a concertina-wire fence on steel screw pickets, the US Barbed Wire Fence
      does:      blocks infantry; any vehicle crushes it; wire cutters open a gap; no cover (sight passes through)
      gameplay:  4 m piece; must read as an obstacle, not a wall: see-through, a coil on posts
      built:     a factory coil of barbed wire stretched along the line, held by angle-iron screw pickets every 2 m,
                 a straight strand along the top and the bottom ties the coil to the pickets
      references: FM 5-15 (1944) concertina fence; Lone Sentry "Barbed wire" (coils on angle irons or screw pickets);
                 CoH3 wire (dark coil, thin posts)
      read_at_play_size: "a dark spiky coil strung between thin posts"
    """
    a = Assembly(); a.note(f'concertina fence {length} m')
    R, ZC = .45, .47
    pitch = length / round(length / .22)                            # a whole number of loops, so pieces join
    xs = np.arange(0, length + 1e-6, 2.0)
    if module and len(xs) > 1 and abs(xs[-1] - length) < 1e-6: xs = xs[:-1]   # the next piece brings the far picket
    for i, x in enumerate(xs):              # why: a picket every 2 m holds the coil's stretch
        a.add(f'picket_{i}', sh.block((x - .03) * M, (x + .03) * M, -.03 * M, .03 * M, 0, 1.05 * M, 'steel'), grounded=True, tag='body')
        a.add(f'picket_eye_{i}', sh.block((x - .045) * M, (x + .045) * M, -.045 * M, .045 * M, .9 * M, .96 * M, 'steel'), tag='trim')   # why: the eye the top strand is tied through
    a.extra(sh.sweep(_helix(0, length, R, ZC, pitch), .03 * M, 'wire'), tag='body')   # why: the coil itself; loops ~22 cm apart when stretched
    for z in (.93, .05):                                           # why: top and ground strands lash the coil to every picket
        a.extra(sh.sweep(sh.catenary((0, 0, z * M), (length * M, 0, z * M), .04 * M if z > .5 else 0, n=max(10, int(length * 8))), .015 * M, 'wire'), tag='body')
    if module: a.shift(-length / 2 * M, 0, 0)
    return a


def wire_knife_rest(length=4.0, module=False, bay=None):
    """BRIEF
      is:        a knife rest (Spanischer Reiter): timber X-trestles joined by a ridge pole and laced with barbed wire,
                 the German Barbed Wire Fence
      does:      blocks infantry; vehicles crush it; can be dragged aside to open a lane (why the Germans liked it)
      gameplay:  4 m piece, about 1.2 m high, see-through
      built:     pairs of poles crossed and nailed into X-trestles; a long pole rests in the crotches; wire wound
                 criss-cross from leg to leg on both faces
      references: Lone Sentry, German barbed wire obstacles (4 ft high, legs 4 ft apart, trestles 4-5 ft apart);
                 Atlantic Wall and Gustav Line photos
      read_at_play_size: "a row of wooden Xs with wire between them"
    """
    a = Assembly(); a.note(f'knife rest {length} m')
    xs = np.linspace(0, length, 4); X = .9; SPAN = .62              # why: four trestles, ~1.33 m apart; crotch 0.9 m up
    if bay: xs = np.arange(0, length + 1e-6, bay)
    for i, x in enumerate(xs[:-1] if module else xs):               # module: the next piece brings the far trestle
        for s in (-1, 1):                                           # why: two poles crossed make each trestle; the pair splay 1.2 m at the foot
            a.strut(f'leg_{i}_{s}', (x * M, s * SPAN * M, 0), (x * M, -s * .32 * M, 1.22 * M), .045 * M, 'timber', free=True, tag='body')
        a.add(f'crotch_{i}', sh.block((x - .06) * M, (x + .06) * M, -.06 * M, .06 * M, (X - .06) * M, (X + .06) * M, 'timber'), grounded=False, tag='trim')   # why: the nailed crossing the ridge pole rests in
    a.add('ridge', Geometry.join([sh.cyl(((xs[i] - (0 if module or i else .1)) * M, 0, (X + .08) * M), ((xs[i + 1] + (0 if module or i < len(xs) - 2 else .1)) * M, 0, (X + .08) * M), .05 * M, 'timber') for i in range(len(xs) - 1)]), tag='body')   # why: the long pole ties the trestles into one frame that can be dragged
    for i in range(len(xs) - 1):                                    # why: wire laced leg to leg across each bay, on both faces, so there is no gap to crawl through
        x0, x1 = xs[i], xs[i + 1]
        for s in (-1, 1):
            for z0, z1 in ((.15, .75), (.75, .15), (.45, .45), (.15, .15)):
                y0 = s * (SPAN - (SPAN + .32) * z0 / 1.22); y1 = s * (SPAN - (SPAN + .32) * z1 / 1.22)
                a.extra(sh.sweep(np.array([(x0 * M, y0 * M, z0 * M), (x1 * M, y1 * M, z1 * M)]), .015 * M, 'wire'), tag='body')
    if module: a.shift(-length / 2 * M, 0, 0)
    return a


# ---------------------------------------------------------------------------------------------------------------
def _rot_diag_up():
    """Rotation taking the cube diagonal (1, 1, 1) to +z: the three beams then stand on three ends, three up."""
    d = np.array([1, 1, 1]) / math.sqrt(3); z = np.array([0, 0, 1.0])
    v = np.cross(d, z); s = np.linalg.norm(v); c = d @ z
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / s ** 2)


def tank_trap(L=2.2, seed=3):
    """BRIEF
      is:        a Czech hedgehog: three steel angle beams crossed at right angles, the CoH3 Tank Trap
      does:      stops vehicles (a hull riding onto it is lifted off its tracks); heavy cover; infantry walk past;
                 heavy tanks crush it
      gameplay:  one per 2 m of line (data.js len 2); about 1.3 m high, so it reads lower than a wall but spiky
      built:     three rolled-steel angles (about 15 cm legs) bolted through gusset plates where they cross; not
                 anchored: it works by its shape, rolling under a hull
      references: Czech hedgehog spec (60 tf, at most 1.4 m high); Normandy and Atlantic Wall photos; CoH3 tank
                 traps (dark steel X shapes, a hard silhouette)
      read_at_play_size: "a black spiky jack, three legs on the ground, three in the air"
      note: spins of about 50-80 degrees hide one beam behind another at this camera; seeds 3-5 show all three
    """
    a = Assembly(); a.note(f'czech hedgehog, beams {L} m')
    Rm = _rot_diag_up(); h = L / 2 / math.sqrt(3)                   # ends sit h below and above the crossing
    zc = h + .02; rng = np.random.default_rng(seed); spin = rng.random() * 120
    leg = .16; t = .035
    prof = [(-leg / 2, -leg / 2), (leg / 2, -leg / 2), (leg / 2, -leg / 2 + t), (-leg / 2 + t, -leg / 2 + t), (-leg / 2 + t, leg / 2), (-leg / 2, leg / 2)]
    for i in range(3):
        e = Rm[:, i] * L / 2
        p0, p1 = (-e + [0, 0, zc]), (e + [0, 0, zc])
        g = sh.sweep(np.array([p0, p1]) * M, [(u * M, v * M) for u, v in prof], 'steel')    # why: an L-section beam: cheap rolled steel, stiff both ways
        a.add(f'beam_{i}', g.rz(spin), grounded=True, tag='body')
    gus = sh.convex([tuple(v) for v in (np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]) * .14 @ Rm.T + [0, 0, zc]) * M], 'steel')
    a.add('gussets', gus.rz(spin), tag='trim')                      # why: plates bolted through all three beams where they cross hold the shape under a tank's weight
    return a


# ---------------------------------------------------------------------------------------------------------------
def _ring(r, s0, s1, step):
    """Angles (radians) round a ring from s0 to s1, about `step` metres apart at radius r."""
    n = max(2, int(abs(s1 - s0) * r / step))
    return np.linspace(s0, s1, n, endpoint=False) + (s1 - s0) / n / 2


def fighting_position_us():
    """BRIEF
      is:        a sandbagged weapon pit, the US Fighting Position (garrison: one squad or an HMG team)
      does:      heavy cover all round for the men in it; the firing notch sets where an HMG covers
      gameplay:  about 3.4 m across, low enough to see over, open at the back for the way in
      built:     a circular pit dug about 0.6 m, the spoil thrown forward, the parapet revetted with sandbags,
                 a notch left in the top course at the front for the gun; a gap at the rear to climb in
      references: FM 5-15 (1944) MG emplacements; Italy 1944 US positions; CoH3 Fighting Position (round
                 sandbag ring with a dark interior)
      read_at_play_size: "a ring of sandbags with a dark hole in the middle, open at the back"
    """
    a = Assembly(); a.note('US fighting position, r 1.45 m')
    L, W, H = BAG; r = 1.45; gap = math.radians(50)                 # front (+x) at angle 0; entry gap centred at the rear
    a.add('pit', sh.prism(1.15 * M, .02 * M, 'opening', n=20), grounded=True, tag='opening')   # why: the dug floor, in shadow from the parapet
    a.add('spoil', sh.lathe([(1.85 * M, 0), (1.62 * M, .2 * M), (1.3 * M, .24 * M), (1.2 * M, 0)], 'earth', n=20), grounded=True, tag='base')   # why: the dug earth thrown up round the pit, under the bags
    for c in range(4):                                              # why: four courses on the spoil: chest-high to a man standing in the pit
        gs = []; off = (c % 2) * .5
        for rr in ((r - .13, r + .13) if c < 2 else (r,)):         # why: two bags thick low down where fire hits, one at the top
            for ang in _ring(rr, math.pi + gap / 2, 3 * math.pi - gap / 2, L):
                ang += (c % 2) * L / 2 / rr                             # why: half-bag stagger between courses
                if c == 3 and abs(math.remainder(ang, 2 * math.pi)) < math.radians(18): continue   # why: the firing notch for the HMG, facing the enemy
                gs.append(_place(_pillow(L * .96, W * .96, H), rr * math.cos(ang), rr * math.sin(ang), .24 + c * H * .92 + H / 2, ang + math.pi / 2))
        a.add(f'course_{c}', Geometry.join(gs), grounded=(c == 0), tag='body')
    return a


def fighting_nest_de(seed=4):
    """BRIEF
      is:        a stone sangar, the German Fighting Nest as it was built in the Italian hills
      does:      heavy cover for one squad or an HMG team; the firing slot sets the gun's arc
      gameplay:  about 3.6 m across, a little higher than the US pit (no digging in rocky ground), open at the back
      built:     a shallow scooped pit ringed with dry-laid field stone and earth, 3-4 ft high, big stones at the
                 foot, smaller ones on top, a gap left in the front wall for the gun
      references: Tactical and Technical Trends, "German Stone Bunkers" (Italian mountains: scooped pits, stone
                 and earth walls 3-4 ft high); Lone Sentry, German field defenses observed in Italy (1944); CoH3
                 Fighting Nest (low ring, earth tones)
      read_at_play_size: "a low ring of grey stones with a dark hole in the middle"
    """
    a = Assembly(); a.note('DE stone fighting nest, r 1.55 m')
    rng = np.random.default_rng(seed); r = 1.55; gap = math.radians(55)
    a.add('pit', sh.prism(1.2 * M, .02 * M, 'opening', n=20), grounded=True, tag='opening')   # why: the scooped floor, dark inside the wall
    a.add('earth_core', sh.lathe([((r + .1) * M, 0), ((r + .05) * M, .3 * M), ((r - .2) * M, .32 * M), ((r - .3) * M, 0)], 'earth', n=20), grounded=True, tag='base')   # why: earth packed behind and under the facing stones, what actually stops bullets
    for c, (sz, z) in enumerate(((.42, .0), (.34, .3), (.27, .56))):   # why: big stones at the foot, smaller as it rises; dry-laid, so it tapers
        gs = []
        for ang in _ring(r - c * .06, math.pi + gap / 2, 3 * math.pi - gap / 2, sz * .95):
            if c == 2 and abs(math.remainder(ang, 2 * math.pi)) < math.radians(16): continue   # why: the firing slot
            for side in ((-1, 1) if c < 2 else (0,)):
                rr = r - c * .06 + side * sz * .38
                s = sz * (.85 + .3 * rng.random())
                g = sh.rock(s * M, 'field_stone', seed=int(rng.integers(1e6)), detail=1, flatten=.55)
                gs.append(g.rz(rng.random() * 360).move(rr * math.cos(ang) * M, rr * math.sin(ang) * M, z * M))
        a.add(f'course_{c}', Geometry.join(gs), grounded=(c == 0), tag='body')
    return a


VARIANTS = {
    'sandbags':        lambda: sandbag_wall(),
    'sandbags_curved': lambda: sandbag_wall(4.0, 0.8),
    'wire_us':         wire_concertina,
    'wire_de':         wire_knife_rest,
    'tanktrap':        tank_trap,
    'position_us':     fighting_position_us,
    'nest_de':         fighting_nest_de,
}

GREYS = {'sandbag': (196, 190, 176), 'wire': (60, 60, 60), 'steel': (95, 95, 98), 'timber': (120, 112, 100),
         'stone_rough': (165, 165, 160), 'field_stone': (165, 165, 160), 'earth': (140, 132, 118), 'opening': (55, 55, 55)}


if __name__ == '__main__':
    from tools.render import shot, mats, sheet
    from models.kit import M as _M
    out = sys.argv[1] if len(sys.argv) > 1 else 'scratch'; os.makedirs(out, exist_ok=True)
    G = mats((180, 180, 176), GREYS)
    keys = sys.argv[2:] or list(VARIANTS)
    close, labs, play = [], [], []
    man = sh.block(-.2 * M, .2 * M, -.15 * M, .15 * M, 0, 1.8 * M, 'opening')
    for key in keys:
        asm = VARIANTS[key]()
        print(key, 'check:', asm.check() or 'empty')
        g = asm.geometry(); lo, hi = g.bounds()
        print(f'   size {((hi[0]-lo[0])/M):.2f} x {((hi[1]-lo[1])/M):.2f} x {((hi[2]-lo[2])/M):.2f} m')
        ref = Geometry.join([g, man.move(lo[0] - .8 * M, (lo[1] + hi[1]) / 2, 0)])      # a 1.8 m man for scale
        close.append(shot(ref, 1.0, G)); labs.append(key); play.append(shot(g, .4, G))
    sheet(close, labs, cols=4).save(f'{out}/defences_close.png')
    sheet(play, None, cols=7, zoom=2).save(f'{out}/defences_play.png')
    print('wrote', out)
