"""Map terrain pieces for central Italy, summer 1944: the field walls, hedgerows, trees and rock the map places
(map.js: 'wall' heavy cover / blocks vehicles, 'hedge' light cover / blocks vehicles, olive and cypress trees,
rock outcrops that block sight and movement). Metres in, units out (kit.M). Grey blockouts (DESIGN_METHOD.md 6).

References: Tuscan and Umbrian dry-stone terrace walls (muri a secco: battered, through-stones, a coping course);
roadside hedgerows of bramble, hawthorn and laurel on low earth banks; Olea europaea (old trees 4-6 m, split
hollow trunks, wide flat silver-green crowns); Cupressus sempervirens 'Stricta' (narrow columns, 10-20 m);
limestone outcrops of the Apennine foothills; CoH3 Italy maps (low walls read as a pale band, trees as clumps).
"""
import os, sys, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
import numpy as np
from artkit import shapes as sh
from artkit.assembly import Assembly
from artkit.core.geom import Geometry
from models.kit import M


def stone_wall(length=4.0, height=1.0, seed=1):
    """BRIEF
      is:        a dry-stone field wall (muro a secco) along a lane or field edge
      does:      heavy cover; blocks vehicles; infantry vault it; shells knock gaps in it
      gameplay:  4 m piece, about 1 m high: a crouching man is covered, a standing one sees over
      built:     field stones laid without mortar in rough courses, big ones at the foot, the faces battered
                 inward (about 0.65 m thick at the base, 0.45 m at the top), a course of flat coping stones on top
                 to shed rain and hold the wall together
      read_at_play_size: "a pale knee-to-waist stone band"
    """
    a = Assembly(); rng = np.random.default_rng(seed); a.note(f'dry-stone wall {length} x {height} m')
    base, top = .65, .45
    a.add('hearting', sh.extrude([(-top / 2 * M, (height - .12) * M), (top / 2 * M, (height - .12) * M), (base / 2 * M, 0), (-base / 2 * M, 0)][::-1], length * M, 'earth'), grounded=True, tag='base')   # why: small rubble packed between the two faces; drawn as a core the face stones sit on
    z = 0.0; c = 0
    while z < height - .2:
        hgt = .26 - .05 * c + .04 * rng.random()                       # why: biggest stones at the foot, smaller as it rises
        hw = (base + (top - base) * (z + hgt / 2) / height) / 2
        gs = []; x = rng.random() * .2
        while x < length - .05:
            w = min(length - x, .32 + .28 * rng.random())
            for side in (-1, 1):                                       # why: two faces, each stone set with its length into the wall
                y0 = side * hw; y1 = side * (hw - .2)
                gs.append(sh.slab(x * M + 2, (x + w) * M - 2, min(y0, y1) * M, max(y0, y1) * M, z * M, (z + hgt) * M - 1, 'stone_rough'))
            x += w
        a.add(f'course_{c}', Geometry.join(gs), grounded=(c == 0), tag='body')
        z += hgt; c += 1
    gs = []; x = 0.0
    while x < length - .05:                                            # why: coping: flat stones laid across the top, wider than the wall, throw rain clear
        w = min(length - x, .22 + .1 * rng.random())
        gs.append(sh.slab(x * M + 2, (x + w) * M - 2, -(top / 2 + .04) * M, (top / 2 + .04) * M, z * M, (z + .12) * M, 'stone_dressed'))
        x += w
    a.add('coping', Geometry.join(gs), tag='trim')
    return a


def hedgerow(length=4.0, seed=2):
    """BRIEF
      is:        an Italian roadside hedgerow: bramble, hawthorn and laurel grown on a low earth bank
      does:      light cover; blocks sight through it; blocks vehicles (the bank and stems); infantry push through
      gameplay:  4 m piece, about 1.8 m high: taller than a man so it hides, but thin
      built:     a bank of earth thrown up from the ditch beside it, woody stems rooted along its crest, foliage
                 massed on top and spilling down the sides
      read_at_play_size: "a dark green lumpy band"
    """
    a = Assembly(); rng = np.random.default_rng(seed); a.note(f'hedgerow {length} m')
    a.add('bank', sh.extrude([(-.7 * M, 0), (-.35 * M, .35 * M), (.35 * M, .35 * M), (.7 * M, 0)][::-1], length * M, 'earth'), grounded=True, tag='base')   # why: the ditch spoil the hedge was planted on
    xs = np.arange(.3, length, .55) + rng.random() * .1
    for i, x in enumerate(xs):                                          # why: stems along the crest carry the foliage
        a.strut(f'stem_{i}', (x * M, 0, .35 * M), ((x + rng.normal() * .1) * M, rng.normal() * .1 * M, 1.2 * M), .05 * M, 'bark', free=True, tag='detail')
    gs = []
    for x in np.arange(.2, length, .45):                                # why: foliage masses: overlapping clumps, lower and wider at the sides
        for y, z, r in ((0, 1.25, .5), (-.35, .85, .38), (.35, .85, .38)):
            rr = r * (.85 + .3 * rng.random())
            gs.append(sh.ellipsoid(rr * M, rr * .9 * M, rr * .8 * M, 'foliage', at=((x + rng.normal() * .08) * M, (y + rng.normal() * .05) * M, (z + rng.normal() * .08) * M), seg=8, rings=5))
    a.add('foliage', Geometry.join(gs), tag='body')
    return a


def olive(seed=3, h=4.5):
    """BRIEF
      is:        an old olive tree in a grove (map.js 'olive', blocks a 2 m circle, hides men under it)
      does:      blocks movement at the trunk; the crown blocks sight a little; the groves are light concealment
      gameplay:  crown about 5 m across and low: units under it are half-hidden, so the crown must stay thin
      built:     a short thick trunk split into two or three leaning limbs, each carrying a flat cloud of small
                 grey-green leaves; old trees are hollow and twisted
      read_at_play_size: "a squat tree with a wide silvery flat-topped crown"
    """
    a = Assembly(); rng = np.random.default_rng(seed); a.note(f'olive tree {h} m')
    a.add('trunk', sh.cyl((0, 0, 0), (0, 0, 1.1 * M), .3 * M, 'bark', r1=.22 * M, seg=9), grounded=True, tag='body')   # why: a short thick bole; olives are pruned low so the fruit can be picked
    tips = []
    for i in range(3):                                                  # why: the trunk splits into leaning limbs, each carrying part of the crown
        ang = i * 2.1 + rng.random() * .6; d = 1.0 + .5 * rng.random()
        tip = (math.cos(ang) * d * M, math.sin(ang) * d * M, (2.4 + .4 * rng.random()) * M)
        a.add(f'limb_{i}', sh.cyl((0, 0, 1.0 * M), tip, .17 * M, 'bark', r1=.09 * M, seg=7), tag='body'); tips.append(tip)
    gs = []
    for (tx, ty, tz) in tips:                                           # why: a flat cloud of foliage over each limb end; light gets through between them
        for j in range(3):
            r = (.95 + .35 * rng.random()) * M
            gs.append(sh.ellipsoid(r, r * .9, r * .55, 'foliage_olive', at=(tx + rng.normal() * .45 * M, ty + rng.normal() * .45 * M, tz + (.55 + .35 * rng.random()) * M), seg=9, rings=5))
    gs.append(sh.ellipsoid(1.3 * M, 1.3 * M, .6 * M, 'foliage_olive', at=(0, 0, (h - .9) * M), seg=9, rings=5))   # why: the crown closes over the centre
    a.add('crown', Geometry.join(gs), tag='body')
    return a


def cypress(seed=5, h=10.0):
    """BRIEF
      is:        an Italian cypress (Cupressus sempervirens 'Stricta'), lining drives and farm tracks
      does:      blocks movement and sight at its 1 m footprint; a landmark the eye navigates by
      gameplay:  tall and thin; must not hide much ground behind it from the camera
      built:     a short trunk hidden in a dense column of foliage, widest a third of the way up, tapering to a point
      read_at_play_size: "a dark green flame"
    """
    a = Assembly(); a.note(f'cypress {h} m')
    a.add('trunk', sh.cyl((0, 0, 0), (0, 0, .8 * M), .18 * M, 'bark', seg=7), grounded=True, tag='body')   # why: the bole shows only at the foot
    prof = [(.35, .5), (.85, 1.6), (1.0, h * .3), (.85, h * .55), (.5, h * .82), (0.0, h)]
    a.add('column', sh.blob_lathe([(r * M, z * M) for r, z in prof], 'foliage_dark', seg=10), tag='body')   # why: upright branches packed tight make a smooth column, widest low down
    return a


def outcrop(size=4.0, seed=6):
    """BRIEF
      is:        a limestone outcrop breaking through the dry grass
      does:      blocks movement and sight; men on top shoot down past cover (elevation rules)
      gameplay:  3-5 m across, about 1.5-2 m high
      built:     bedded limestone weathered into blocky slabs with flat tops (bedding planes), smaller blocks
                 fallen at the foot
      read_at_play_size: "a pale blocky rock heap"
    """
    a = Assembly(); rng = np.random.default_rng(seed); a.note(f'limestone outcrop {size} m')
    def bed(r, z0, z1, cx, cy, k=7):
        """One bedding layer: an irregular flat-topped block, the top face drawn in where the edges weathered."""
        ang = np.sort(rng.random(k) * 2 * math.pi); rad = r * (.7 + .3 * rng.random(k))
        lo = [((cx + math.cos(t) * q) * M, (cy + math.sin(t) * q) * M, z0 * M) for t, q in zip(ang, rad)]
        hi = [((cx + math.cos(t) * q * .82) * M, (cy + math.sin(t) * q * .82) * M, z1 * M) for t, q in zip(ang, rad)]
        return sh.convex(lo + hi, 'limestone')
    beds = ((size * .5, 0, .7, 0, 0), (size * .38, .7, 1.3, size * .08, -size * .06), (size * .22, 1.3, 1.75, size * .14, -size * .1))
    for i, (r, z0, z1, cx, cy) in enumerate(beds):                       # why: limestone breaks along level bedding planes, so it weathers into stepped flat-topped slabs
        a.add(f'bed_{i}', bed(r, z0, z1, cx, cy), grounded=(i == 0), tag='body')
    for i in range(4):                                                   # why: blocks fallen off the faces lie at the foot
        t = rng.random() * 2 * math.pi; d = size * (.55 + .1 * rng.random()); r = size * (.07 + .05 * rng.random())
        a.add(f'fallen_{i}', bed(r, 0, r * 1.1, math.cos(t) * d, math.sin(t) * d, 5), grounded=True, tag='detail')
    return a


VARIANTS = {
    'stone_wall': stone_wall,
    'hedgerow':   hedgerow,
    'olive':      olive,
    'cypress':    cypress,
    'outcrop':    outcrop,
}

GREYS = {'stone_rough': (170, 170, 165), 'stone_dressed': (210, 210, 205), 'earth': (140, 132, 118),
         'bark': (95, 90, 84), 'foliage': (120, 125, 112), 'foliage_olive': (160, 165, 150),
         'foliage_dark': (90, 96, 86), 'limestone': (200, 198, 190)}


if __name__ == '__main__':
    from tools.render import shot, mats, sheet
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
        ref = Geometry.join([g, man.move(lo[0] - .8 * M, (lo[1] + hi[1]) / 2, 0)])
        close.append(shot(ref, .6, G)); labs.append(key); play.append(shot(g, .4, G))
    sheet(close, labs, cols=5).save(f'{out}/terrain_close.png')
    sheet(play, None, cols=5, zoom=2).save(f'{out}/terrain_play.png')
    print('wrote', out)
