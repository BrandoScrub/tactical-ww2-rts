"""Field works the builders put up besides the defences in models/defences.py: resource caches, the German Concrete
Bunker and the gun pits the howitzer emplacements sit in. Metres in, units out (kit.M), +x the front (the enemy side),
z up, the same frame as the fighting positions. Grey blockouts first (DESIGN_METHOD.md step 6), then painted by
tools/build_props.py with the WW2 tiles.

CoH3 (coh3stats.com / cohdex.com, Nov 2026):
  Resource Cache (US Engineers, Wehrmacht Pioneers): 200 mp, 20 s, 600 health, built over a captured point; +50% of the
    point's munitions or fuel; the point can't be captured while it stands.
  Concrete Bunker (Wehrmacht Pioneers): 175 mp, 35 s, 720 health; holds one squad or an HMG team; upgrades to an MG 42
    bunker (60 mu), a Repair Bunker (70 mu, +6 hp/s to vehicles and structures near) or a Medical Bunker (70 mu).
  M2A1 Howitzer Emplacement (US Engineers, 320 mp 60 fu, 40 s) and leFH 18 Howitzer Emplacement: barrage only.

Real sizes used:
  ammunition box (US M2A1 / German Munitionskasten) about 0.30 x 0.18 x 0.28 m; wooden shell crate about 0.75 x 0.35
  x 0.30 m; 55 US gal / 200 l drum 0.58 m across, 0.88 m high; jerrycan 0.35 x 0.17 x 0.47 m
  German field bunkers in Italy (Gustav and Hitler Lines): small poured-concrete pillboxes about 3-4 m square, walls
  0.5-1 m, roof slab earthed over, one or two slits: Lone Sentry, "German field fortifications in Italy" (1944)
  105 mm M2A1 in action: trails spread about 4.6 m back from the axle; a pit ringed with sandbags or earth, open at
  the rear for the trails and the ammunition: FM 6-74 (1944) emplacement sketches
"""
import os, sys, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
import numpy as np
from artkit import shapes as sh
from artkit.assembly import Assembly
from artkit.core.geom import Geometry
from models.kit import M
from models.defences import _pillow, _place, _ring, BAG


def _box(cx, cy, z, L, W, H, ang, mat):
    """A box L long (along ang), W wide, H high, standing at (cx, cy, z) metres."""
    g = sh.block(-L / 2 * M, L / 2 * M, -W / 2 * M, W / 2 * M, 0, H * M, mat)
    return g.rz(math.degrees(ang)).move(cx * M, cy * M, z * M)


def _drum(cx, cy, z, mat, r=.29, h=.88):
    return sh.prism(r * M, h * M, mat, n=12).move(cx * M, cy * M, z * M)


def _bag_ring(r, z0, courses, gap, thick=2, skip=None):
    """Sandbag courses round a ring of radius r, open `gap` radians at the rear (-x). skip(c, ang) leaves a bag out."""
    L, W, H = BAG; out = []
    for c in range(courses):
        gs = []
        for rr in ((r - .13, r + .13) if c < thick else (r,)):
            for ang in _ring(rr, math.pi + gap / 2, 3 * math.pi - gap / 2, L):
                ang += (c % 2) * L / 2 / rr
                if skip and skip(c, ang): continue
                gs.append(_place(_pillow(L * .96, W * .96, H), rr * math.cos(ang), rr * math.sin(ang), z0 + c * H * .92 + H / 2, ang + math.pi / 2))
        out.append(Geometry.join(gs))
    return out


def _stores(a, side, spots):
    """The stock a cache holds: crates of shells and small-arms ammunition, fuel drums and cans."""
    drum = 'drum_' + side
    for i, (kind, x, y, ang, stack) in enumerate(spots):
        if kind == 'crate':                                       # why: wooden shell crates, the munitions the cache adds
            for k in range(stack): a.add(f'crate_{i}_{k}', _box(x, y, k * .3, .75, .35, .3, ang + k * .12, 'wood'), grounded=(k == 0), tag='body')
        elif kind == 'ammo':                                      # why: steel ammunition boxes, smaller and darker
            for k in range(stack): a.add(f'ammo_{i}_{k}', _box(x, y, k * .28, .3, .18, .28, ang, 'steel'), grounded=(k == 0), tag='trim')
        elif kind == 'drum':                                      # why: fuel drums, the fuel the cache adds; the biggest shapes, so they read
            a.add(f'drum_{i}', _drum(x, y, 0, drum), grounded=True, tag='body')
        elif kind == 'can':                                       # why: jerrycans in a row, the fuel carried forward by hand
            a.add(f'can_{i}', _box(x, y, 0, .35, .17, .47, ang, drum), grounded=True, tag='trim')


def resource_cache(side='us'):
    """BRIEF
      is:        a forward supply dump over a held point: the CoH3 Resource Cache
      does:      raises the point's munitions and fuel income by half; while it stands the point can't be taken
      gameplay:  about 3 m across, sits on the point's flag; must read as 'stores' (crates and drums), not as a
                 fighting position (no dark hole in the middle, nobody inside)
      built:     stores stacked on cleared ground, a low wall round them against splinters (US sandbags, German field
                 stone), a gap left to carry things in and out
      references: US Army supply dumps in Italy 1944 (crates stacked in the open, drums in rows); German
                 Munitionslager photos; CoH3 Resource Cache (a low ring with crates and barrels inside)
      read_at_play_size: "a low ring with boxes and barrels in it"
    """
    a = Assembly(); a.note(f'{side} resource cache, r 1.45 m')
    r = 1.45; gap = math.radians(70)
    a.add('floor', sh.prism(1.4 * M, .02 * M, 'earth', n=20), grounded=True, tag='base')   # why: cleared, trodden ground under the stores
    if side == 'us':
        for c, g in enumerate(_bag_ring(r, 0, 2, gap)): a.add(f'course_{c}', g, grounded=(c == 0), tag='body')   # why: two courses only: splinter cover for the stores, not a fighting wall
    else:
        rng = np.random.default_rng(7); gs = []
        for ang in _ring(r, math.pi + gap / 2, 3 * math.pi - gap / 2, .34):   # why: one course of field stone, what the Pioneers had to hand
            s = .34 * (.85 + .3 * rng.random())
            gs.append(sh.rock(s * M, 'field_stone', seed=int(rng.integers(1e6)), detail=1, flatten=.55).rz(rng.random() * 360).move(r * math.cos(ang) * M, r * math.sin(ang) * M, 0))
        a.add('stones', Geometry.join(gs), grounded=True, tag='body')
    _stores(a, side, [('drum', .55, .55, 0, 1), ('drum', .55, -.05, 0, 1), ('drum', -.05, .6, 0, 1),
                      ('crate', .1, -.6, .1, 2), ('crate', -.45, -.25, 1.4, 2), ('ammo', -.5, .35, .3, 2), ('ammo', -.15, .25, .3, 1),
                      ('can', .75, -.65, .9, 1), ('can', .62, -.82, .9, 1)])
    return a


def concrete_bunker():
    """BRIEF
      is:        the Wehrmacht Concrete Bunker: a small poured-concrete pillbox
      does:      holds one infantry squad or an HMG team (heavy cover, they fire from the slits); can be turned into an
                 MG 42 bunker, a repair bunker or a medical bunker
      gameplay:  about 3.6 m square inside a ring of stones, about 1.6 m high so men behind it are hidden; the slits
                 face the enemy (+x); the door at the back (-x)
      built:     poured concrete walls 0.4 m thick on a footing, a roof slab cast over them with a lip, earth and turf
                 heaped on the roof; slits with stepped (splayed) mouths; a low blast wall in front of the rear door;
                 field stones heaped round the foot
      references: Lone Sentry, German field fortifications in Italy (small square pillboxes, slits, earthed roofs);
                 Gustav Line photos (Cassino 1944); CoH3 Concrete Bunker (a low grey block in a ring of stones,
                 reference board 08, item 11)
      read_at_play_size: "a squat grey block with a dark slit, in a ring of stones"
    """
    a = Assembly(); a.note('DE concrete bunker, 3.6 m square')
    h, hw = 1.45, 1.8
    # why: the walls, battered a little (wider at the foot) as poured concrete was against blast
    a.add('walls', sh.convex([(sx * (hw + (.12 if z == 0 else 0)) * M, sy * (hw + (.12 if z == 0 else 0)) * M, z * M) for sx in (-1, 1) for sy in (-1, 1) for z in (0, h)], 'concrete'), grounded=True, tag='body')
    a.add('roof', sh.block(-(hw + .15) * M, (hw + .15) * M, -(hw + .15) * M, (hw + .15) * M, h * M, (h + .28) * M, 'concrete'), tag='body')   # why: the roof slab, cast with a lip over the walls
    mound = [(r * math.cos(t) * M, r * math.sin(t) * M, z * M) for r, z in ((1.95, 0), (1.55, .32), (.7, .46)) for t in np.linspace(0, 2 * math.pi, 10, endpoint=False)]
    a.add('earth', sh.convex(mound, 'turf').move(0, 0, (h + .28) * M), tag='trim')   # why: earth and turf heaped on the roof against shells and to hide it from the air
    # why: the firing slits: a wide one to the front for the squad or the MG, narrow ones on the flanks
    a.add('slit_front', sh.block((hw + .1) * M, (hw + .14) * M, -.75 * M, .75 * M, .8 * M, 1.05 * M, 'opening'), tag='opening')
    for s in (-1, 1):
        a.add(f'slit_side_{s}', sh.block(-.4 * M, .4 * M, s * (hw + .1) * M, s * (hw + .14) * M, .8 * M, 1.02 * M, 'opening'), tag='opening')
    a.add('splay', sh.block((hw + .1) * M, (hw + .2) * M, -.95 * M, .95 * M, .72 * M, .78 * M, 'concrete'), tag='trim')   # why: the stepped sill under the front slit, which turns ricochets away from it
    a.add('door', sh.block(-(hw + .14) * M, -(hw + .1) * M, -.45 * M, .45 * M, 0, 1.2 * M, 'opening'), tag='opening')   # why: the way in at the back, away from the enemy
    a.add('blast_wall', sh.block(-(hw + 1.25) * M, -(hw + .8) * M, -.9 * M, .9 * M, 0, .75 * M, 'concrete'), grounded=True, tag='body')   # why: a wall in front of the door so a shell behind the bunker can't blow straight in
    rng = np.random.default_rng(11); gs = []
    for ang in _ring(2.55, 0, 2 * math.pi, .42):                    # why: field stones heaped round the foot (reference board item 11)
        if abs(math.remainder(ang - math.pi, 2 * math.pi)) < .38: continue   # why: the path to the door stays clear
        s = .4 * (.8 + .4 * rng.random())
        gs.append(sh.rock(s * M, 'field_stone', seed=int(rng.integers(1e6)), detail=1, flatten=.5).rz(rng.random() * 360).move(2.55 * math.cos(ang) * M, 2.55 * math.sin(ang) * M, 0))
    a.add('stones', Geometry.join(gs), grounded=True, tag='base')
    return a


def gun_pit(side='us'):
    """BRIEF
      is:        a howitzer emplacement: the pit a 105 mm field howitzer fires from (CoH3 M2A1 / leFH 18 Howitzer
                 Emplacement)
      does:      shelters the gun and crew from splinters and small arms; open at the rear for the trails and the
                 ammunition; the gun turns inside it
      gameplay:  about 6.4 m across, so the game's howitzer sprite (about 6 m with trails) fits in it, its trails
                 out through the rear gap; low (knee to waist high) so the gun reads above it
      built:     US: sandbags on the dug spoil, three courses, two bags thick at the foot; German: an earth berm
                 faced with field stone, a course of sandbags on top at the front; both with ready rounds stacked
                 inside at the rear
      references: FM 6-74 (1944) 105 mm howitzer emplacement; photos of US 105s in Italy (low sandbag rings, open
                 rears, shell cases piled behind); German leFH 18 positions near Cassino (earth berm, stone facing)
      read_at_play_size: "a wide low ring with a big gun in it, open at the back"
    """
    a = Assembly(); a.note(f'{side} howitzer gun pit, r 3.0 m')
    r = 3.0; gap = math.radians(55)
    a.add('floor', sh.prism((r - .2) * M, .02 * M, 'earth', n=28), grounded=True, tag='base')   # why: the dug and levelled floor the gun stands on
    if side == 'us':
        a.add('spoil', sh.lathe([((r + .45) * M, 0), ((r + .25) * M, .18 * M), ((r - .25) * M, .2 * M), ((r - .35) * M, 0)], 'earth', n=28), grounded=True, tag='base')   # why: the dug earth thrown up round the pit, under the bags
        for c, g in enumerate(_bag_ring(r, .18, 3, gap)): a.add(f'course_{c}', g, tag='body')   # why: three courses: waist high to the crew, the gun's shield and barrel show over it
    else:
        a.add('berm', sh.lathe([((r + .6) * M, 0), ((r + .3) * M, .45 * M), ((r - .15) * M, .55 * M), ((r - .3) * M, 0)], 'earth', n=28), grounded=True, tag='body')   # why: an earth berm: the Germans dug in and piled the spoil round
        rng = np.random.default_rng(5); gs = []
        for ang in _ring(r - .2, math.pi + gap / 2, 3 * math.pi - gap / 2, .36):   # why: stones facing the inside of the berm, so it doesn't slump into the pit
            s = .34 * (.85 + .3 * rng.random())
            gs.append(sh.rock(s * M, 'field_stone', seed=int(rng.integers(1e6)), detail=1, flatten=.55).rz(rng.random() * 360).move((r - .2) * math.cos(ang) * M, (r - .2) * math.sin(ang) * M, .05 * M))
        a.add('facing', Geometry.join(gs), tag='trim')
        for c, g in enumerate(_bag_ring(r, .5, 1, math.radians(200), thick=0)): a.add(f'bags_{c}', g, tag='trim')   # why: a course of sandbags on the front of the berm, where fire comes from
    # cut the walls where the trails go: the gap is at -x; ready rounds either side of it, inside
    _stores(a, side, [('crate', -2.1, 1.25, .5, 2), ('crate', -2.35, .85, .5, 1), ('ammo', -2.0, -1.3, -.4, 2), ('crate', -2.3, -.95, -.5, 1)])
    return a


VARIANTS = {
    'cache_us': lambda: resource_cache('us'),
    'cache_de': lambda: resource_cache('de'),
    'bunker_de': concrete_bunker,
    'gunpit_us': lambda: gun_pit('us'),
    'gunpit_de': lambda: gun_pit('de'),
}

GREYS = {'sandbag': (196, 190, 176), 'steel': (95, 95, 98), 'wood': (150, 130, 100), 'concrete': (175, 175, 170),
         'field_stone': (165, 165, 160), 'earth': (140, 132, 118), 'turf': (130, 140, 110), 'opening': (55, 55, 55), 'drum_us': (110, 115, 80), 'drum_de': (170, 150, 90)}


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
        close.append(shot(ref, 1.0, G)); labs.append(key); play.append(shot(g, .4, G))
    sheet(close, labs, cols=3).save(f'{out}/fieldworks_close.png')
    sheet(play, None, cols=5, zoom=2).save(f'{out}/fieldworks_play.png')
    print('wrote', out)
