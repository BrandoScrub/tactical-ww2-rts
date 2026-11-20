"""Scenery: the Italian farmhouse (casa colonica), first of the map's buildings to leave the canvas stand-ins.
Metres in, units out (kit.M). x along the ridge, y across, z up; the camera sees the +x and +y walls.

BRIEF (DESIGN_METHOD.md step 1)
  is:        a central-Italian farmhouse, 1944: animals and stores below, the family above
  does:      cover and a garrison for one squad; blocks sight; is shelled to a ruin over the match
  gameplay:  footprint 6-9 x 6-8 m (map.js halfHouses), walls 4.2 m, ridge +2.2 m (render.js), so the
             blockout keeps the box the game already uses for line of sight and the garrison
  built:     rubble stone laid in lime, dressed stone at the corners, timber floor and roof beams,
             terracotta coppi tiles; some rendered in lime stucco, some left as bare stone
  moves:     nothing; doors and shutters are the only working parts (shown open)
  serviced:  the external stair is how people reach the upper floor; the ground floor opens to the yard
  references: Tuscan / Umbrian case coloniche (outside stair and landing, dovecote tower, small windows);
             CoH3 Italian farmhouses (big roof, few strong openings read at play size)
  read_at_play_size: "a pale stone house with a red roof and a stair up its side, that a squad can go into"
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
from artkit import shapes as sh
from artkit.assembly import Assembly
from artkit import library as lib
from models.kit import M


def blk(x0, x1, y0, y1, z0, z1, mat): return sh.block(x0 * M, x1 * M, y0 * M, y1 * M, z0 * M, z1 * M, mat)


EAVES, RISE, FLOOR = 4.2, 2.2, 2.1


def farmhouse(w=9.0, d=7.0, wall='stucco', stair=True, tower=False, state='normal'):
    """state: 'normal', 'damaged' (roof holed by a shell, a breach in the gable end, still standing and garrisoned)
    or 'ruined' via farmhouse_ruin()."""
    a = Assembly(); W = 'wall_' + wall; dmg = state == 'damaged'
    a.note(f'farmhouse {w} x {d} m, {wall}, stair={stair}, tower={tower}, {state}')
    a.add('walls', sh.block(0, w * M, 0, d * M, 0, EAVES * M, W, top='charred' if dmg else None), grounded=True, tag='body')   # why: the inside shows black where the roof is open
    a.add('plinth', blk(-.08, w + .08, -.08, d + .08, 0, .45, 'stone_rough'), grounded=True, tag='base')  # why: rubble footing kept back from the damp, a dark heavy band that grounds the house
    for (x, y) in ((w, d), (w, 0), (0, d)):                                                              # why: dressed corner stones lock the rubble walls; reads as masonry at any size
        for i in range(7):
            q = .55 if i % 2 else .35
            a.add(f'quoin_{x:.0f}_{y:.0f}_{i}', blk(x - q if x else -.04, x + .04 if x else q, y - q if y else -.04, y + .04 if y else q, .45 + i * .55, .45 + i * .55 + .5, 'stone_dressed'), tag='trim')
    a.add('floor_band', blk(-.05, w + .05, -.05, d + .05, FLOOR - .12, FLOOR, 'stone_dressed'), tag='trim')  # why: the first-floor beams bear here; says "two storeys"
    # roof: ridge along x, low Mediterranean pitch, deep eaves to shed rain off the walls
    if not dmg:
        a.add('roof', sh.gable(w * M, d * M, RISE * M, 'roof_tile', overhang=.45 * M, thick=.18 * M, cap='roof_ridge').move(0, 0, EAVES * M), tag='roof')
    else:
        roof_holed(a, w, d)
    a.add('eaves_course', blk(-.1, w + .1, -.1, d + .1, EAVES - .15, EAVES, 'stone_dressed'), tag='trim')   # why: a corbelled course carries the overhang
    # chimney on the gable end wall over the kitchen hearth (upper floor, x = w end)
    cx = w - .9
    a.add('chimney', blk(cx - .35, cx + .35, d / 2 + .5, d / 2 + 1.2, EAVES, EAVES + RISE + (.3 if dmg else .9), W), tag='signature')  # why: the hearth flue rises through the roof by the ridge
    if not dmg: a.add('chimney_cap', blk(cx - .45, cx + .45, d / 2 + .4, d / 2 + 1.3, EAVES + RISE + .9, EAVES + RISE + 1.05, 'roof_tile'), tag='trim')  # why: tiles over the flue keep rain out
    # openings: small and few (thick walls, hot summers); dark recess + frame + open shutters
    def window(side, f, z, ww=.8, hh=1.1):
        n = f'win_{side}_{f:.1f}_{z:.1f}'
        if side == 'x':
            y = f; a.add(n, blk(w - .02, w + .02, y - ww / 2, y + ww / 2, z, z + hh, 'opening'), tag='opening')
            a.add(n + '_sill', blk(w, w + .12, y - ww / 2 - .08, y + ww / 2 + .08, z - .1, z, 'stone_dressed'), tag='trim')  # why: a stone sill throws water clear of the wall
            for s in (-1, 1): a.add(n + f'_shutter{s}', blk(w, w + .05, y + s * (ww / 2 + .02), y + s * (ww / 2 + .42), z, z + hh, 'shutter'), tag='accent')  # why: louvred shutters fold back against the wall
        elif side == '-x':                                                                                # the x = 0 end: seen when the house is turned
            y = f; a.add(n, blk(-.02, .02, y - ww / 2, y + ww / 2, z, z + hh, 'opening'), tag='opening')
            a.add(n + '_sill', blk(-.12, 0, y - ww / 2 - .08, y + ww / 2 + .08, z - .1, z, 'stone_dressed'), tag='trim')
            for s in (-1, 1): a.add(n + f'_shutter{s}', blk(-.05, 0, y + s * (ww / 2 + .02), y + s * (ww / 2 + .42), z, z + hh, 'shutter'), tag='accent')
        else:
            x = f; a.add(n, blk(x - ww / 2, x + ww / 2, d - .02, d + .02, z, z + hh, 'opening'), tag='opening')
            a.add(n + '_sill', blk(x - ww / 2 - .08, x + ww / 2 + .08, d, d + .12, z - .1, z, 'stone_dressed'), tag='trim')
            for s in (-1, 1): a.add(n + f'_shutter{s}', blk(x + s * (ww / 2 + .02), x + s * (ww / 2 + .42), d, d + .05, z, z + hh, 'shutter'), tag='accent')
    # +x gable end: arched stable door below, two windows above
    a.add('stable_door', blk(w - .02, w + .02, d / 2 - .8, d / 2 + .8, .0, 2.0, 'opening'), tag='opening')  # why: wide enough for an ox; the squad's way in from the yard
    a.add('stable_arch', blk(w, w + .1, d / 2 - 1.0, d / 2 + 1.0, 2.0, 2.3, 'stone_dressed'), tag='trim')   # why: the stone lintel spans the wide opening
    a.mark_door('stable_door', w * M, d / 2 * M, 0, side='x')
    for y in (d * .25, d * .75):
        if not (dmg and y > d / 2): window('x', y, 2.6)
    if dmg: breach_x(a, w, d)
    # -x gable end: an upper window either side of the flue wall and a small one below; it faces the camera when the
    # house is turned (ridge along y), so it needs openings like the other seen walls
    for y in (d * .3, d * .7): window('-x', y, 2.6)
    window('-x', d * .5, 1.0, .6, .7)
    # +y long wall: ground-floor windows small and high (stores), upper ones larger (rooms)
    xs = [w * f for f in ((.2, .5, .8) if w >= 8 else (.3, .7))]
    for x in xs: window('y', x, 2.6)
    if not stair:
        for x in xs[:-1]: window('y', x, .9, .6, .7)
        a.add('front_door', blk(xs[-1] - .5, xs[-1] + .5, d - .02, d + .02, 0, 1.9, 'opening'), tag='opening')
        a.mark_door('front_door', xs[-1] * M, d * M, 0)
    else:
        # external stair along the +y wall, rising from the x = 0 end to a landing at the first floor
        land0, land1 = w * .62, w * .62 + 1.4
        steps = 9; run0, run1 = .4, land0
        for i in range(steps):                                                                            # why: a solid masonry stair; each tread rests on the one below
            x0 = run0 + (run1 - run0) * i / steps
            a.add(f'stair_{i}', blk(x0, run1, d, d + 1.0, 0, FLOOR * (i + 1) / steps, 'stone_rough'), grounded=True, tag='signature')
        a.add('landing', blk(land0, land1, d, d + 1.2, 0, FLOOR, 'stone_rough'), grounded=True, tag='signature')  # why: the platform outside the upper door, a stable mass to the ground
        a.add('parapet', blk(run0, land1, d + .85, d + 1.2, FLOOR, FLOOR + .8, W), tag='trim')            # why: a low wall stops a fall off the landing; also the squad's cover line
        a.add('upper_door', blk(land0 + .3, land0 + 1.1, d - .02, d + .02, FLOOR, FLOOR + 1.9, 'opening'), tag='opening')
        a.mark_door('upper_door', (land0 + .7) * M, d * M, FLOOR * M)
        a.add('loggia_roof', sh.gable(1.6 * M, 1.4 * M, .35 * M, 'roof_tile', overhang=.1 * M, thick=.12 * M).move((land0 - .1) * M, (d - .1) * M, (FLOOR + 2.2) * M), tag='accent')
        for x in (land0 - .05, land1 - .15):                                                              # why: two timber posts carry the little porch roof from the parapet
            a.strut(f'porch_post_{x:.1f}', ((x + .1) * M, (d + 1.05) * M, (FLOOR + .8) * M), ((x + .1) * M, (d + 1.05) * M, (FLOOR + 2.2) * M), .14 * M, 'timber')
        if w * .88 - .55 > land1:                                                                         # why: a store door beside the stair, at yard level
            a.add('ground_door', blk(w * .88 - .55, w * .88 + .55, d - .02, d + .02, 0, 1.9, 'opening'), tag='opening')
    if tower:
        # dovecote (colombaia) rising through the roof at the x = 0 end: pigeons for meat and manure
        t0, t1 = .3, 2.9; ty0, ty1 = d / 2 - 1.3, d / 2 + 1.3
        a.add('tower', blk(t0, t1, ty0, ty1, EAVES, EAVES + RISE + 2.2, W), tag='signature')              # why: rises off the gable wall below it; the tallest thing on the farm, a landmark
        a.add('tower_roof', sh.pyramid((t1 - t0 + .6) * M, (ty1 - ty0 + .6) * M, .9 * M, 'roof_tile').move((t0 - .3) * M, (ty0 - .3) * M, (EAVES + RISE + 2.2) * M), tag='roof')
        for y in (ty0 + .7, ty1 - .7):                                                                    # why: the birds' openings near the top
            a.add(f'dove_hole_{y:.1f}', blk(t1 - .02, t1 + .02, y - .2, y + .2, EAVES + RISE + 1.3, EAVES + RISE + 1.7, 'opening'), tag='opening')
    return a


def roof_slope(w, d, x0, x1, side, o=.45, thick=.18, mat='roof_tile'):
    """One slope of the farmhouse roof from x0 to x1 (metres), the same section sh.gable makes. side +1: the +y slope."""
    slope = RISE / (d / 2); ez = -o * slope
    front = [(d / 2, RISE), (d / 2, RISE - thick), (d + o, ez - thick), (d + o, ez)]
    prof = front[::-1] if side > 0 else [(d - y, z) for y, z in front]
    return sh.extrude([(y * M, z * M) for y, z in prof], (x1 - x0) * M, mat).move(x0 * M, 0, EAVES * M)


def roof_holed(a, w, d):
    """A shell came through the +y slope: tiles and battens gone over a span, the rafters left, some snapped."""
    o = .45; h0, h1 = w * .3, w * .3 + 3.2
    a.add('roof_back', roof_slope(w, d, -o, w + o, -1), tag='roof')                  # why: the far slope is untouched
    a.add('roof_front_a', roof_slope(w, d, -o, h0, 1), tag='roof')                   # why: the slope either side of the hole still carries its tiles
    a.add('roof_front_b', roof_slope(w, d, h1, w + o, 1), tag='roof')
    a.add('roof_void', roof_slope(w, d, h0, h1, 1, mat='charred').move(0, 0, -.3 * M), tag='opening')   # why: through the hole, the burnt-out attic reads black
    a.strut('ridge_beam', (-o * M, d / 2 * M, (EAVES + RISE - .1) * M), ((w + o) * M, d / 2 * M, (EAVES + RISE - .1) * M), .2 * M, 'timber')  # why: the ridge beam spans gable to gable and survives the hit
    slope = RISE / (d / 2)
    for i, x in enumerate([h0 + .4 + k * .6 for k in range(5)]):                     # why: rafters run ridge to wall plate every 0.6 m
        top = (x * M, d / 2 * M, (EAVES + RISE - .1) * M)
        f = (1.0, .45, 1.0, .7, 1.0)[i]                                              # some snapped part-way: the shell's work
        y = d / 2 + (d / 2 + .1) * f; end = (x * M, y * M, (EAVES + RISE - .1 - slope * (y - d / 2)) * M)
        a.strut(f'rafter_{i}', top, end, .12 * M, 'timber_charred', free=f < 1)


def breach_x(a, w, d):
    """A shell breach through the +x gable end's upper storey, its rubble spilled down the wall into the yard."""
    yc, zc = d * .74, 3.0
    pts = [(-.95, -.55), (-.6, -.95), (.1, -1.05), (.7, -.75), (.95, -.1), (.8, .55), (.3, .85), (-.4, .8), (-.85, .3)]
    hole = sh.polygon([((w + .03) * M, (yc + dy) * M, (zc + dz) * M) for dy, dz in pts], 'charred')
    a.add('breach', hole, tag='opening')                                             # why: the hole into the gutted upper room
    for i, (dy, dz) in enumerate(pts):                                               # why: broken stones stick out round the rim
        q = .22 if i % 2 else .16
        a.add(f'breach_rim_{i}', blk(w - .05, w + .12, yc + dy * 1.08 - q, yc + dy * 1.08 + q, zc + dz * 1.08 - q, zc + dz * 1.08 + q, 'stone_rough'), tag='trim')
    a.add('breach_spill', sh.rock(2.2 * M, 'stone_rough', seed=4, detail=1, flatten=.4).move((w + .55) * M, yc * M, 0), grounded=True, tag='yard')   # why: the wall that was blown out lands at its foot
    a.add('breach_spill_tiles', sh.rock(1.0 * M, 'stone_rough', seed=9, detail=1, flatten=.45).move((w + .9) * M, (yc - .9) * M, 0), grounded=True, tag='yard')


def turned(g, w, turn):
    """The house geometry turned so its ridge runs along y (turn=3: a quarter turn clockwise seen from above).
    The +y side (the stair) comes round to +x, so the two walls the camera sees are still the detailed ones."""
    if not turn: return g
    from artkit.core.geom import T, RZ
    return g.at(T(0, w * M, 0) @ RZ(-90.0))


def _ruin_walls(w, d, wall, stair, tower, turn=0):
    """The standing walls of the ruin: the whole house clipped at a ragged line. Turned before the cut, so the
    cut-open insides darken for the turned view."""
    from artkit.recipe import Asset
    import numpy as np
    g = turned(farmhouse(w, d, wall, stair, tower).geometry(), w, turn)
    if turn % 2: w, d = d, w                                                          # the ragged line is laid out on the turned house, so
    c = g.P.mean(1) / M                                                               # the far-right corner stands tallest in both views
    rng = np.random.default_rng(int(w * 7 + d * 3))
    ph = rng.random(4) * 6
    rag = .55 * np.sin(c[:, 0] * 1.7 + ph[0]) + .4 * np.sin(c[:, 1] * 2.3 + ph[1]) + .3 * np.sin((c[:, 0] + c[:, 1]) * 4.1 + ph[2])
    lim = 1.6 + rag
    for (cx, cy, top) in ((w, 0, 4.4), (0, d, 2.9), (w, d, 2.4), (0, 0, 3.4)):       # corners stand longest
        lim = np.maximum(lim, top - 1.0 * np.hypot(c[:, 0] - cx, c[:, 1] - cy) + .3 * rag)
    for (cx, cy, r) in ((w * .55, d, 1.0), (w, d * .4, .8)):                          # shell gaps broken down near the ground
        lim = np.where(np.hypot(c[:, 0] - cx, c[:, 1] - cy) < r, np.minimum(lim, .5 + .2 * rag), lim)
    return Asset._cut(g, lim * M, M)                                                 # H = 1 m: only parts under 30 cm are kept or lost whole


def _ruin_debris(r, w, d):
    r.add('burnt_floor', blk(.15, w - .15, .15, d - .15, 0, .6, 'charred'), grounded=True, tag='yard')          # why: ash and burnt timber cover the ground floor
    r.add('floor_rubble', sh.rock(min(w, d) * .7 * M, 'rubble', seed=2, detail=2, flatten=.45).move(w * .5 * M, d * .5 * M, 0), grounded=True, tag='yard')   # why: the fallen floors, roof and wall tops fill the inside
    r.add('heap_a', sh.rock(2.2 * M, 'rubble', seed=3, detail=1, flatten=.6).move(w * .3 * M, d * .35 * M, .3 * M), grounded=True, tag='yard')           # why: the heaviest fall, under where the tower or chimney stood
    r.add('tile_heap', sh.rock(1.7 * M, 'roof_tile', seed=5, detail=1, flatten=.55).move(w * .62 * M, d * .62 * M, .3 * M), grounded=True, tag='yard')    # why: the roof came down in one piece
    r.add('gap_spill', sh.rock(2.0 * M, 'stone_rough', seed=6, detail=1, flatten=.38).move(w * .55 * M, (d + .5) * M, 0), grounded=True, tag='yard')      # why: the front gap's stones fell outward
    r.add('end_spill', sh.rock(1.6 * M, 'stone_rough', seed=8, detail=1, flatten=.38).move((w + .5) * M, d * .4 * M, 0), grounded=True, tag='yard')       # why: and the gable end's
    r.extra(lib.rubble(r=min(w, d) * .55 * M, n=40, mat='stone_rough', seed=11).move(w * .5 * M, d * .5 * M, 0), tag='yard')                         # why: loose stones and tile shards everywhere
    for i, (p0, p1) in enumerate((((w * .15, d * .25, .4), (w * .55, d * .7, 1.9)),   # why: charred floor joists and roof beams lie where they fell, ends on the rubble
                                  ((w * .62, d * .2, 2.3), (w * .85, d * .78, .6)),
                                  ((w * .35, d * .85, .5), (w * .7, d * .4, 1.5)))):
        r.strut(f'beam_{i}', tuple(v * M for v in p0), tuple(v * M for v in p1), .22 * M, 'timber_charred', free=True)
    return r


def farmhouse_ruin(w=9.0, d=7.0, wall='stucco', stair=True, tower=False):
    """Shelled to a shell: roof and floors burned and fallen in, walls broken down to a ragged line that stands
    highest at the corners (dressed corner stones hold longest), the masonry stair left standing, the inside heaped
    with rubble and charred beams. Gameplay: no garrison, low walls give cover, sight passes over most of it."""
    r = Assembly()
    r.add('ruin', _ruin_walls(w, d, wall, stair, tower), grounded=True, tag='body')
    return _ruin_debris(r, w, d)


def states(w=9.0, d=7.0, wall='stucco', stair=True, tower=False, turn=0):
    """name -> Geometry for the game's three stages, turned when asked."""
    kw = dict(w=w, d=d, wall=wall, stair=stair, tower=tower)
    out = {st: turned(farmhouse(state=st, **kw).geometry(), w, turn) for st in ('normal', 'damaged')}
    W, D = (d, w) if turn % 2 else (w, d)
    out['ruined'] = _ruin_debris(Assembly(), W, D).geometry() + _ruin_walls(turn=turn, **kw)   # debris laid out on the turned footprint
    return out


def asset(key, turn=0):
    """An artkit Asset with the three hand-made stages, for artkit.export.Exporter.static."""
    from artkit.recipe import Asset, TILE
    kw = VARIANTS[key]; S = states(turn=turn, **kw)
    w, d = (kw['d'], kw['w']) if turn % 2 else (kw['w'], kw['d'])

    class Staged(Asset):
        def states(s): return S
    return Staged({'name': key + ('_r' if turn else ''), 'footprint': [w * M / TILE, d * M / TILE]}, geom=S['normal'])


VARIANTS = {
    'farmhouse_stair':  dict(w=9, d=7, wall='stucco', stair=True),
    'farmhouse_tower':  dict(w=9, d=6, wall='stone', stair=True, tower=True),
    'farmhouse_small':  dict(w=7, d=6, wall='stone', stair=False),
    'cottage':          dict(w=6, d=6, wall='stucco', stair=False),
    'farmhouse_long':   dict(w=8, d=6, wall='stucco', stair=True),                 # the map's 8 x 6 m houses
    'farmhouse_square': dict(w=7, d=7, wall='stucco', stair=False, tower=True),    # and its 7 x 7 m one: a small tower house
}


if __name__ == '__main__':
    from tools.render import shot, mats, sheet
    out = sys.argv[1] if len(sys.argv) > 1 else 'scratch'; os.makedirs(out, exist_ok=True)
    G = mats((196, 196, 192), {'roof_tile': (150, 150, 150), 'roof_ridge': (140, 140, 140), 'opening': (55, 55, 55),
                                'shutter': (110, 110, 110), 'stone_rough': (165, 165, 160), 'stone_dressed': (215, 215, 212),
                                'timber': (100, 100, 100), 'timber_charred': (60, 60, 60), 'charred': (45, 45, 45),
                                'rubble': (128, 126, 122)})
    keys = sys.argv[2:] or list(VARIANTS)
    close, labs, play = [], [], []
    for key in keys:
        kw = VARIANTS[key]
        for st in ('normal', 'damaged', 'ruined'):
            a = farmhouse_ruin(**kw) if st == 'ruined' else farmhouse(state=st, **kw)
            print(key, st, 'check:', a.check() or 'empty')
            g = a.geometry(); close.append(shot(g, .5, G)); labs.append(f'{key}  {st}'); play.append(shot(g, .2, G))
    sheet(close, labs, cols=3).save(f'{out}/farmhouse_states_close.png')
    sheet(play, None, cols=3, zoom=2).save(f'{out}/farmhouse_states_play.png')
    print('wrote', out)
