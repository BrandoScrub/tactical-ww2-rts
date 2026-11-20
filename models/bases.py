"""Base buildings: the two HQs and the eight production buildings that replace the canvas stand-ins.
BLOCKOUT STAGE (artkit/DESIGN_METHOD.md step 7): primary and secondary masses only, judged at play size (0.4 px a
unit, the export scale) with artkit.design.critique before they are shown.

Metres in, units out (kit.M). x along the long side, y across, z up. The camera sees the +x (right, shaded) and +y
(front, lit) walls, so each building's way out faces +y or +x, and its signature stands at the BACK corner (low x, low
y): on screen height is z minus depth, so the same mast at the front reads lower (artkit README, Design logic).
Footprints are game/src/data.js `size` (w x d); nothing is drawn past them.

SHARED BRIEF
  is:        field-built base structures, central Italy, summer 1944
  does:      each makes one kind of unit, which walks or drives out of the front; HQs also reinforce and take retreats
  gameplay:  footprint as data.js; must read at play size as WHOSE (US: canvas, timber, sandbags, corrugated steel;
             German: poured concrete, earth banks, camouflage nets) and WHAT IT MAKES (infantry: tents and huts;
             support weapons: a weapon pit; vehicles: a ramp, a fuel tank, a bay; tanks: a crane over a big door)
  built:     US engineers: prefabricated and tented (Quonset huts, pyramidal and ward tents, timber sheds, steel halls).
             German pioneers: dug in and poured (battered concrete, earth revetments, nets on poles)
  serviced:  men in by the doors; vehicles through the bays; engines and turrets lifted by cranes and hoists
  references: US M1934 pyramidal squad tent and ward tent (canvas on poles, low walls); the Quonset hut (corrugated
             half-barrel); US field motor pools (open sheds, timber service ramps, elevated fuel tanks); German
             Regelbau command bunkers and the CoH3 Wehrmacht HQ (squat concrete, sloped shoulders, a cupola:
             docs/reference/coh3/screenshots/05-headquarters.png); Flak 38 emplacements (a round raised pit);
             German vehicle revetments under nets; portal gantry cranes at tank workshops. Function and size are
             taken from CoH3, never its models.
  read_at_play_size: US "a sandbagged camp of tents, huts and sheds under a flag"; DE "concrete and earth dug into
             the ground under nets"; and each one by its signature
Ranks for the critic: the HQs are 'landmark', the others 'major'.
"""
import math, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
from artkit import shapes as sh
from artkit.assembly import Assembly
from artkit.core.geom import Geometry
from artkit.parts import building as B
from models.kit import M

COURSE = 36          # height of one sandbag course in units (artkit.parts.building.SANDBAG is 40 high, laid overlapping)


class Build(Assembly):
    """An Assembly in metres in which every part carries its reason (DESIGN_METHOD step 1), kept in the notes."""
    def __init__(s, name, brief):
        super().__init__(); s.name = name; s.whys = {}
        s.note(f'{name}: {brief}')

    def part(s, name, geom, why, tag='body', grounded=False):
        s.whys[name] = why; s.note(f'{name}: {why}')
        return s.add(name, geom, grounded=grounded, tag=tag)

    def blk(s, name, x0, x1, y0, y1, z0, z1, mat, why, tag='body', grounded=None):
        g = sh.block(x0 * M, x1 * M, y0 * M, y1 * M, z0 * M, z1 * M, mat)
        return s.part(name, g, why, tag, z0 <= .05 if grounded is None else grounded)

    def beam(s, name, p0, p1, t, mat, why, free=False):
        s.whys[name] = why; s.note(f'{name}: {why}')
        s.strut(name, tuple(v * M for v in p0), tuple(v * M for v in p1), t * M, mat, free=free)

    def roof(s, name, x0, y0, w, d, z, rise, mat, why, along='x', over=.35, thick=.18):
        """A pitched roof over w x d with its eaves at z, ridge along x or y."""
        if along == 'x': g = sh.gable(w * M, d * M, rise * M, mat, overhang=over * M, thick=thick * M).move(x0 * M, y0 * M, z * M)
        else: g = sh.gable(d * M, w * M, rise * M, mat, overhang=over * M, thick=thick * M).rz(90).move((x0 + w) * M, y0 * M, z * M)
        return s.part(name, g, why, 'roof')

    def gable_fill(s, name, x0, y0, w, d, z, rise, mat, why, along='x'):
        """The triangular end walls under a pitched roof."""
        tri = lambda span, length: sh.extrude([(0, 0), (span / 2 * M, rise * M), (span * M, 0)], length * M, mat)   # clockwise: faces out
        if along == 'x': g = tri(d, w).move(x0 * M, y0 * M, z * M)
        else: g = tri(w, d).rz(90).move((x0 + w) * M, y0 * M, z * M)
        return s.part(name, g, why, 'body')

    def batter(s, name, x0, x1, y0, y1, h, inset, mat, why, tag='base'):
        """A wall or bank that leans in as it rises (concrete glacis, earth bank, sandbag revetment)."""
        return s.part(name, B.frustum(x0 * M, y0 * M, x1 * M, y1 * M, inset * M, h * M, mat), why, tag, True)

    def bags(s, name, x0, y0, length, why, along='x', courses=2, z=0.0):
        """Sandbag courses laid with the engine's bag profile (1 m thick)."""
        f = B.sandbags_x if along == 'x' else B.sandbags_y
        g = Geometry.join([f(x0 * M, y0 * M, z * M + i * COURSE, length * M) for i in range(courses)])
        return s.part(name, g, why, 'siege', z <= .05)

    def ring_of_bags(s, name, cx, cy, r, z, n, gap, why, courses=2):
        """A round parapet of bag runs, each a chord of the circle; `gap` lists the chords left out (the way in)."""
        for i in range(n):
            if i in gap: continue
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            p0 = (cx + r * math.cos(t0), cy + r * math.sin(t0)); p1 = (cx + r * math.cos(t1), cy + r * math.sin(t1))
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
            g = Geometry.join([B.sandbags_x(0, 0, k * COURSE, L * M) for k in range(courses)]).rz(ang).move(p0[0] * M, p0[1] * M, z * M)
            s.part(f'{name}_{i}', g, why, 'siege', z <= .05)

    def opening(s, name, side, a0, a1, at, z0, z1, why):
        """A dark doorway or bay on a seen wall: side 'y' (front wall at y=at, a along x) or 'x' (right wall at x=at).
        Ground-level openings are recorded as doors so the checker confirms there is ground in front of them."""
        if side == 'y': g = sh.block(a0 * M, a1 * M, (at - .02) * M, (at + .03) * M, z0 * M, z1 * M, 'opening')
        else: g = sh.block((at - .02) * M, (at + .03) * M, a0 * M, a1 * M, z0 * M, z1 * M, 'opening')
        s.part(name, g, why, 'opening', False)
        if z0 <= .05:
            c = (a0 + a1) / 2
            s.mark_door(name, *((c * M, at * M, 0) if side == 'y' else (at * M, c * M, 0)), side=side)

    def mast(s, name, x, y, z, h, why, base=1.6):
        """A lattice radio mast (DESIGN_METHOD chain: wide foot -> tapering lattice -> kit at the top)."""
        g = sh.lattice(base * M, .35 * M, h * M, max(3, int(h // 2.2)), 'steel', t=.09 * M).move((x - base / 2) * M, (y - base / 2) * M, z * M)
        g = g + sh.strut(((x - .9) * M, y * M, (z + h * .9) * M), ((x + .9) * M, y * M, (z + h * .9) * M), .08 * M, 'steel')
        g = g + sh.strut((x * M, (y - .7) * M, (z + h * .8) * M), (x * M, (y + .7) * M, (z + h * .8) * M), .08 * M, 'steel')
        return s.part(name, g, why, 'signature', z <= .05)

    def flag(s, name, x, y, z, h, why, w=2.6, hgt=1.6):
        """A pole and a flag in the faction cloth: the one colour, up on the skyline where it carries. The cloth hangs
        from the pole (loose geometry: it is held by the pole, not standing on anything), flying toward -y so it shows
        against the sky behind the building."""
        s.beam(name + '_pole', (x, y, z), (x, y, z + h), .12, 'steel', 'the pole the colours fly from', free=True)
        s.whys[name] = why; s.note(f'{name}: {why}')
        return s.extra(sh.quad((x * M, y * M, (z + h - hgt - .1) * M), (0, -w * M, 0), (0, 0, hgt * M), 'flag', wear=False), 'accent')

    def tower(s, name, x0, y0, size, deck, roof_mat, why, splay=.3):
        """A four-legged timber tower: splayed legs, a boarded box at the top, posts and a pyramid cap."""
        x1, y1 = x0 + size, y0 + size
        for i, (x, y) in enumerate(((x0, y0), (x1, y0), (x0, y1), (x1, y1))):
            s.beam(f'{name}_leg_{i}', (x, y, 0), (x + (splay if x == x0 else -splay), y + (splay if y == y0 else -splay), deck), .2, 'timber', 'a tower leg, splayed for stability')
        s.blk(f'{name}_box', x0 + splay - .1, x1 - splay + .1, y0 + splay - .1, y1 - splay + .1, deck, deck + 1.0, 'planks', why, tag='signature', grounded=False)
        for i, (x, y) in enumerate(((x0 + splay, y0 + splay), (x1 - splay, y0 + splay), (x0 + splay, y1 - splay), (x1 - splay, y1 - splay))):
            s.beam(f'{name}_post_{i}', (x, y, deck + 1.0), (x, y, deck + 1.8), .1, 'timber', 'posts carry the cap')
        s.part(f'{name}_cap', sh.pyramid((size - 2 * splay + .8) * M, (size - 2 * splay + .8) * M, .9 * M, roof_mat).move((x0 + splay - .4) * M, (y0 + splay - .4) * M, (deck + 1.8) * M),
               'a cap against sun and rain', 'signature')
        return deck + 1.8


# ================================================================ US Forces
def us_hq(w=14, d=10):
    """Battalion command post. Does: commands, reinforces squads, takes retreats; the target that ends the match.
    Masses: a sandbagged dugout podium (the shelter), a timber command hut set back on it (the staff room), a radio
    mast at the back corner (command means signals). A canvas fly at the front is the briefing area; sandbag wings
    guard the dugout door."""
    a = Build('us_hq', 'command post: dugout podium, hut set back on it, radio mast, flag')
    a.batter('dugout', 0, 9.6, 0, 9.4, 1.8, .45, 'sandbag', 'the dugout: earth-filled bags battered back so blast slides off; the podium everything stands on')
    a.blk('dugout_roof', .45, 9.15, .45, 8.95, 1.8, 2.1, 'planks', 'a log-and-plank slab over the dugout', tag='base')
    a.blk('hut', 1.2, 8.2, 1.0, 5.6, 2.1, 4.6, 'planks', 'the command hut where the staff work, raised to see over the bags')
    a.roof('hut_roof', 1.2, 1.0, 7, 4.6, 4.6, 1.4, 'us_canvas', 'a canvas-covered roof: US field camp from above')
    a.gable_fill('hut_gables', 1.2, 1.0, 7, 4.6, 4.6, 1.4, 'planks', 'boarded gable ends')
    a.opening('hut_door', 'y', 4.0, 5.0, 5.6, 2.1, 4.1, 'the hut door onto the dugout roof')
    a.opening('hut_window', 'x', 2.0, 4.6, 8.2, 3.0, 3.9, 'a long window on the field: the map table looks out')
    for i, (x, y) in enumerate(((10.2, 4.6), (13.4, 4.6), (10.2, 8.8), (13.4, 8.8))):
        a.beam(f'fly_pole_{i}', (x, y, 0), (x, y, 2.6), .14, 'timber', 'a pole of the briefing fly')
    a.roof('fly', 10.2, 4.6, 3.2, 4.2, 2.6, .9, 'us_canvas', 'the briefing fly beside the dugout: orders given under canvas in the open', along='y', over=.2, thick=.08)
    a.blk('map_table', 11.0, 12.6, 6.0, 7.4, 0, .9, 'planks', 'the map table under the fly: this is where the battle is run', tag='yard')
    a.opening('dugout_door', 'y', 5.3, 6.5, 9.4, 0, 1.6, 'the dugout door: squads reinforce here, retreats run to it')
    a.bags('door_wing_l', 3.7, 9.4, 1.6, 'blast wing left of the door')
    a.bags('door_wing_r', 6.5, 9.4, 1.6, 'blast wing right of the door')
    a.mast('mast', 11.8, 1.8, 0, 13.0, 'the radio mast at the back corner: command means signals; the tallest thing in the base')
    a.flag('flag', 8.6, 1.0, 2.1, 6.0, 'the colours over the command post: whose base this is')
    return a


def us_barracks(w=12, d=9):
    """Barracks: where rifle squads are formed and quartered. Masses: a long ward tent along the front (mess and drill
    hall, door flap open toward the field), two pyramidal squad tents set back behind it (the squads' quarters; their
    peaks are the skyline), the colours at the back corner. Says: men live here."""
    a = Build('us_barracks', 'tent lines: ward tent in front, two pyramidal squad tents behind, flag')
    a.blk('ward_floor', 2.4, 11.4, 4.4, 8.6, 0, .25, 'planks', 'a plank floor out of the mud', tag='base')
    a.blk('ward_walls', 2.5, 11.3, 4.5, 8.5, .25, 1.7, 'us_canvas', 'the ward tent\'s low canvas walls')
    a.roof('ward_roof', 2.5, 4.5, 8.8, 4.0, 1.7, 1.7, 'us_canvas', 'the ward tent roof on its ridge poles: a long canvas hall', over=.25, thick=.08)
    a.gable_fill('ward_ends', 2.5, 4.5, 8.8, 4.0, 1.7, 1.7, 'us_canvas', 'tent ends')
    a.opening('ward_door', 'y', 6.2, 7.6, 8.5, .25, 1.6, 'the door flap tied back toward the field: squads muster out of it')
    a.opening('ward_flap', 'x', 5.6, 7.4, 11.3, .25, 1.5, 'the end flap rolled up for air')
    for i, x in enumerate((.6, 5.2)):
        a.blk(f'squad_floor_{i}', x, x + 4.2, .3, 4.1, 0, .25, 'planks', 'a squad tent floor', tag='base')
        a.blk(f'squad_wall_{i}', x + .1, x + 4.1, .4, 4.0, .25, 1.4, 'us_canvas', 'the squad tent\'s low walls')
        a.part(f'squad_roof_{i}', sh.pyramid(4.4 * M, 4.0 * M, 2.9 * M, 'us_canvas').move((x - .1) * M, .2 * M, 1.4 * M),
               'the pyramidal squad tent on its centre pole: the shape that says US camp; quarters for a squad', 'signature')
    a.bags('side_bags', 10.2, .4, 3.4, 'a blast wall closing the side of the lines', along='y')
    for i, (x, y) in enumerate(((.4, 5.4), (.4, 6.3), (1.3, 5.4))):
        a.blk(f'kit_{i}', x, x + .8, y, y + .8, 0, .6, 'planks', 'kit and ammunition crates by the front: the camp is supplied', tag='yard')
    for i, (x, y) in enumerate(((.9, 8.0), (2.0, 8.4))):
        for j, (dx, dy) in enumerate(((-.3, -.2), (.3, -.2), (0, .3))):
            a.beam(f'rifle_stack_{i}_{j}', (x + dx, y + dy, 0), (x, y, 1.2), .07, 'timber', 'rifles stacked in a tripod: men at drill', free=j == 2)
    a.flag('flag', .4, .4, 0, 7.0, 'the colours at the back corner of the lines, on the skyline')
    return a


def us_wsc(w=12, d=9):
    """Weapon Support Center: crew weapons (machine guns, mortars, bazookas) kept and their crews trained. Masses: a
    Quonset armoury along the back (corrugated half-barrel: reads US and "store"), a round sandbagged weapon pit at the
    front with a machine gun and a mortar in it (what this building makes, shown), a range tower at the back corner
    flying the red range flag."""
    a = Build('us_wsc', 'Quonset armoury, weapon pit in front, range tower with red flag')
    r, L, y0 = 2.7, 8.0, .4
    prof = [(y0 + r - r * math.cos(math.pi * i / 12), .3 + r * math.sin(math.pi * i / 12)) for i in range(13)] + [(y0 + 2 * r, 0), (y0, 0)]
    a.part('quonset', sh.extrude([(y * M, z * M) for y, z in prof], L * M, 'steel').move(3.6 * M, 0, 0),
           'the Quonset hut: corrugated steel bolted up in a day; the armoury the crew weapons are kept in; walls and roof in one', 'roof', True)
    a.blk('quonset_foot', 3.5, 11.7, y0 - .1, y0 + 2 * r + .1, 0, .3, 'concrete', 'the poured footing the arches bolt to', tag='base')
    a.blk('quonset_end', 11.6, 11.75, y0 + .4, y0 + 2 * r - .4, .3, 2.6, 'planks', 'the timber end wall', grounded=False)
    a.opening('armoury_door', 'x', y0 + 1.7, y0 + 2 * r - 1.7, 11.75, .3, 2.3, 'double doors: a gun goes out on its wheels')
    cx, cy = 8.6, 6.9
    a.ring_of_bags('pit_bags', cx, cy, 1.8, 0, 10, (6, 7), 'the round weapon pit: bags all round so the crew can fight to any side')
    a.beam('mg_tripod', (cx + .5, cy + .4, 0), (cx + .5, cy + .4, 1.0), .14, 'steel', 'the machine gun\'s tripod head at firing height')
    a.part('mg', sh.box(1.3 * M, .22 * M, .26 * M, 'steel').rz(30).move((cx + .3) * M, (cy + .1) * M, 1.0 * M), 'a machine gun over the bags: support weapons are made here', 'signature')
    a.beam('mortar_tube', (cx - .6, cy - .2, .1), (cx - .1, cy + .3, 1.2), .16, 'steel', 'a mortar tube at 60 degrees: the other half of the roster', free=True)
    top = a.tower('range_tower', .3, .3, 2.4, 5.6, 'us_canvas', 'the range officer\'s box, waist-high boards: crews are trained here')
    a.flag('flag', 2.3, 2.3, top, 2.4, 'the red range flag: live firing; the accent on the skyline')
    return a


def us_motorpool(w=14, d=11):
    """Motor Pool: light vehicles serviced and issued. Masses: an open-fronted timber shed with a lean-to canvas roof
    over two vehicle bays (a garage, read from its dark open front), a timber service ramp in the yard that a jeep
    drives up for work underneath (the shape that says "vehicles"), and an elevated fuel tank on a timber tower at the
    back corner (gravity-fed fuel; the skyline)."""
    a = Build('us_motorpool', 'open vehicle shed, service ramp in the yard, elevated fuel tank')
    a.blk('shed_floor', 3.4, 13.6, .4, 7.4, 0, .15, 'concrete', 'a slab the vehicles stand on', tag='base')
    a.blk('back_wall', 3.4, 13.6, .4, .7, 0, 3.6, 'planks', 'a boarded back wall')
    a.blk('end_wall', 3.4, 3.7, .7, 7.4, 0, 3.6, 'planks', 'a boarded end wall against the wind')
    a.blk('bay_wall', 8.35, 8.65, .7, 6.8, 0, 2.2, 'planks', 'a low wall between the bays: one job each')
    for i, x in enumerate((8.5, 13.4)): a.beam(f'front_post_{i}', (x, 7.2, 0), (x, 7.2, 3.3), .25, 'timber', 'posts carry the roof over the open front')
    a.blk('lintel', 3.4, 13.6, 7.05, 7.35, 3.3, 3.6, 'timber', 'the beam across the open front, the bays\' lintel', tag='trim', grounded=False)
    a.part('shed_roof', B.shed_roof(10.2 * M, 7.0 * M, .9 * M, 'us_canvas', 'planks', o=.35 * M).move(3.4 * M, .4 * M, 3.6 * M),
           'a lean-to roof of tarpaulin on rafters, falling to the front: shade for the mechanics', 'roof')
    a.opening('bay_a', 'y', 3.8, 8.3, 7.2, 0, 3.2, 'the first bay, open to the yard')
    a.opening('bay_b', 'y', 8.7, 13.3, 7.2, 0, 3.2, 'the second bay')
    for i, y in enumerate((8.0, 9.6)):
        a.part(f'ramp_{i}', sh.wedge(2.6 * M, .7 * M, 1.2 * M, 'planks').move(9.0 * M, y * M, 0), 'a runway a jeep\'s wheels climb', 'signature', True)
        a.blk(f'ramp_top_{i}', 11.6, 13.4, y, y + .7, 0, 1.2, 'planks', 'the level run the jeep stands on for work underneath', tag='signature')
    a.blk('work_pit', 11.6, 13.4, 8.7, 9.6, 0, .05, 'opening', 'the gap between the runways a mechanic works from', tag='opening')
    for i, (x, y) in enumerate(((.4, .4), (2.6, .4), (.4, 2.6), (2.6, 2.6))):
        a.beam(f'tank_leg_{i}', (x, y, 0), (x, y, 5.4), .24, 'timber', 'a leg of the fuel tower: high enough to fill a truck by gravity')
    a.blk('tank_deck', .2, 2.8, .2, 2.8, 5.4, 5.65, 'planks', 'the deck the tank sits on', tag='signature', grounded=False)
    a.part('fuel_tank', sh.cyl((1.5 * M, 1.5 * M, 5.65 * M), (1.5 * M, 1.5 * M, 7.9 * M), 1.25 * M, 'steel', seg=12), 'the fuel tank: gravity feeds the hose; it makes the skyline', 'signature')
    a.beam('fuel_hose', (2.6, 2.6, 5.4), (2.9, 3.3, .05), .08, 'rubber', 'the hose down to the filling point')
    for i in range(6):
        a.part(f'drum_{i}', sh.cyl(((.8 + (i % 3) * .7) * M, (4.6 + (i // 3) * .7) * M, 0), ((.8 + (i % 3) * .7) * M, (4.6 + (i // 3) * .7) * M, .9 * M), .3 * M, 'steel', seg=10),
               'fuel drums: the dump beside the tank', 'yard', True)
    a.flag('flag', 13.3, .6, 4.5, 3.4, 'the colours on the shed corner')
    return a


def us_depot(w=16, d=12):
    """Tank Depot: tanks assembled and repaired. Masses: a tall steel workshop hall with two tank-sized doors, a lower
    stores wing on its far end (a second roof level), a portal gantry crane over the front apron with an engine
    hanging from its hoist (heavy vehicles), a ventilator along the hall ridge."""
    a = Build('us_depot', 'steel workshop hall, stores wing, gantry crane over the apron with a hanging engine')
    a.blk('wing', 0, 3.5, .4, 7.0, 0, 3.4, 'steel', 'the stores and office wing: parts, tools, the foreman')
    a.blk('wing_roof', -.1, 3.5, .3, 7.1, 3.4, 3.7, 'steel', 'the wing\'s flat roof, below the hall\'s: two roof levels', tag='roof', grounded=False)
    a.blk('hall', 3.5, 9.6, 0, 8.0, 0, 5.6, 'steel', 'the heavy bay: corrugated sheet on a steel frame, tall enough to lift a Sherman\'s engine out')
    a.roof('hall_roof', 3.5, 0, 6.1, 8.0, 5.6, 1.4, 'steel', 'the heavy bay\'s roof, ridge front to back', along='y')
    a.gable_fill('hall_gables', 3.5, 0, 6.1, 8.0, 5.6, 1.4, 'steel', 'its gable over the door', along='y')
    a.blk('light_bay', 9.6, 15.6, 1.6, 8.0, 0, 3.6, 'steel', 'the light bay: tracks and running gear, no crane needed, so lower')
    a.roof('light_roof', 9.6, 1.6, 6.0, 6.4, 3.6, .9, 'steel', 'its own lower roof: the hall steps down', along='y')
    a.gable_fill('light_gables', 9.6, 1.6, 6.0, 6.4, 3.6, .9, 'steel', 'its gable', along='y')
    a.opening('door_a', 'y', 4.3, 8.8, 8.0, 0, 4.6, 'the heavy bay\'s tank door: a Sherman is 3 m wide and 2.7 m tall')
    a.opening('door_b', 'y', 10.4, 14.8, 8.0, 0, 3.0, 'the light bay\'s door')
    a.blk('apron', 3.6, 15.8, 8.0, 11.8, 0, .12, 'concrete', 'the apron the tanks stand on under the crane', tag='base')
    for x in (3.8, 15.4):
        for y in (8.4, 11.4):
            a.beam(f'gantry_leg_{x:.0f}_{y:.0f}', (x, y, 0), (x, 9.9, 8.6), .35, 'steel', 'an A-frame leg: the portal stands over the apron')
    a.blk('gantry_girder', 3.5, 15.7, 9.5, 10.3, 8.6, 9.5, 'steel', 'the box girder the hoist trolley runs along: heavy lifting', tag='signature', grounded=False)
    a.blk('trolley', 9.6, 10.6, 9.4, 10.4, 8.0, 8.6, 'steel', 'the hoist trolley', tag='signature', grounded=False)
    a.beam('hook_line', (10.1, 9.9, 8.0), (10.1, 9.9, 3.2), .08, 'steel', 'the chain down to the load')
    a.blk('engine', 9.3, 10.9, 9.3, 10.5, 2.0, 3.2, 'steel', 'a tank engine lifted out on the hook: what this building does', tag='signature', grounded=False)
    a.flag('flag', .3, .6, 3.7, 5.0, 'the colours on the wing, at the back corner')
    return a


# ================================================================ Wehrmacht
def de_hq(w=14, d=10):
    """Gefechtsstand: a reinforced-concrete command bunker, the base's anchor and retreat point (the CoH3 Wehrmacht HQ
    is this kind of building). Masses: a squat battered concrete body (walls lean back: shells glance off), a raised
    command block set back on it with chamfered sides, an armoured observation cupola on that, a radio mast at the back
    corner; the entrance recessed between blast walls at the front, earth banked against the back."""
    a = Build('de_hq', 'battered concrete bunker, raised command block, cupola, mast, recessed entrance')
    a.batter('bank_back', 0, 14, 0, 1.6, 1.6, .5, 'earth', 'earth banked against the back wall: the enemy side is buried')
    a.batter('body', .3, 12.0, .3, 9.0, 2.6, .7, 'concrete', 'the bunker body: 2 m of concrete, walls battered back so a shell skids off', tag='body')
    a.blk('roof_slab', 1.0, 11.3, 1.0, 8.3, 2.6, 2.9, 'concrete', 'the burster slab over the rooms', tag='roof', grounded=False)
    prof = [(1.6, 2.9), (2.4, 4.9), (6.6, 4.9), (7.4, 2.9)]
    a.part('command_block', sh.extrude([(y * M, z * M) for y, z in prof], 7.2 * M, 'concrete').move(1.8 * M, 0, 0),
           'the raised command block: the staff room, chamfered all round', 'body')
    a.part('cupola', sh.cyl((4.6 * M, 4.5 * M, 4.9 * M), (4.6 * M, 4.5 * M, 5.9 * M), .75 * M, 'steel', r1=.6 * M, seg=12),
           'the armoured observation cupola: the commander watches through its periscope ring', 'signature')
    a.batter('mast_mound', 11.4, 14.0, 0, 3.2, 1.0, .5, 'earth', 'the earth mound the mast stands on, beside the bunker')
    a.mast('mast', 12.7, 1.6, 1.0, 11.0, 'the radio mast at the back corner, off the bunker so a hit on it does not bring the roof in: the command net')
    a.blk('entry_l', 6.6, 7.6, 8.2, 10.0, 0, 1.7, 'concrete', 'a blast wall: the door is never in line with the field')
    a.blk('entry_r', 10.6, 11.6, 8.2, 10.0, 0, 1.7, 'concrete', 'the other blast wall')
    a.blk('entry_roof', 6.4, 11.8, 8.0, 10.0, 1.7, 2.0, 'concrete', 'the entry\'s own slab, below the bunker\'s: a protected porch', tag='roof', grounded=False)
    a.opening('door', 'y', 8.0, 10.2, 10.0, 0, 1.6, 'the armoured door: squads reinforce here, retreats run to it')
    a.flag('pennant', 9.6, 1.6, 2.9, 4.4, 'the command pennant on the bunker roof', w=3.0, hgt=1.8)
    return a


def de_infanterie(w=12, d=9):
    """Infanterie Kompanie: the grenadiers' billets. Masses: a long timber barrack hut half sunk in an earth bank (its
    roof comes low), a shorter hut at right angles on the right making an L round a front yard (the assembly ground),
    a timber watch tower at the back corner; a sandbagged trench along the front of the yard."""
    a = Build('de_infanterie', 'L of half-sunk timber huts round an assembly yard, watch tower, front trench')
    a.batter('bank_a', 0, 9.2, .2, 4.4, .8, .4, 'earth', 'earth banked against the hut: sunk half a storey for cover')
    a.blk('hut_a', .4, 8.8, .6, 4.0, 0, 2.2, 'planks', 'the long barrack hut: bunks for the company')
    a.roof('roof_a', .4, .6, 8.4, 3.4, 2.2, 1.4, 'planks', 'a steep boarded roof under tar paper: low, so it hides')
    a.gable_fill('ends_a', .4, .6, 8.4, 3.4, 2.2, 1.4, 'planks', 'gable ends')
    a.opening('door_a', 'y', 4.0, 5.0, 4.0, 0, 2.0, 'the barrack door onto the yard')
    for i, x in enumerate((1.2, 2.6, 6.0, 7.4)): a.opening(f'win_a_{i}', 'y', x, x + .7, 4.0, 1.2, 1.8, 'windows just above the bank')
    a.batter('bank_b', 8.6, 12.0, 3.4, 9.0, .8, .4, 'earth', 'the second hut\'s bank')
    a.blk('hut_b', 9.0, 11.6, 3.8, 8.6, 0, 2.6, 'planks', 'the orderly room and stores, at right angles: the L closes the yard')
    a.roof('roof_b', 9.0, 3.8, 2.6, 4.8, 2.6, 1.3, 'planks', 'its roof, ridge across: a second roof line', along='y')
    a.gable_fill('ends_b', 9.0, 3.8, 2.6, 4.8, 2.6, 1.3, 'planks', 'gable ends', along='y')
    a.opening('door_b', 'x', 6.6, 7.6, 11.6, 0, 2.3, 'the stores door, toward the road')
    a.blk('yard', .4, 8.6, 4.6, 8.6, 0, .06, 'concrete', 'the trodden assembly yard where squads form up', tag='yard')
    a.bags('trench_bags', .6, 7.9, 7.6, 'the trench along the front of the yard, its spoil bagged', courses=1)
    top = a.tower('tower', .1, .1, 2.2, 6.0, 'planks', 'the sentry\'s box at the top of the watch tower')
    a.flag('pennant', 1.9, 1.9, top, 2.0, 'the company pennant over the tower')
    return a


def de_luftwaffe(w=12, d=9):
    """Luftwaffe Kompanie: the air force's ground company (it manned the flak). Masses: a flat-roofed concrete office
    block at the back with a stair head on its roof, a big raised flak emplacement at the front corner (a round earth
    bank with bags on its rim and a 2 cm Flak 38 on its pedestal, barrel high: the signature), and a direction-finding
    mast on the office roof."""
    a = Build('de_luftwaffe', 'concrete office, raised round flak pit with its gun, direction-finding mast')
    a.blk('office', .3, 7.0, .3, 5.2, 0, 3.0, 'concrete', 'the company office and signals room')
    a.blk('office_roof', .1, 7.2, .1, 5.4, 3.0, 3.35, 'concrete', 'a flat slab with a lip', tag='roof', grounded=False)
    a.blk('stair_head', 1.0, 3.0, 1.0, 3.0, 3.35, 4.6, 'concrete', 'the stair head onto the roof: a second roof level', tag='roof', grounded=False)
    a.opening('door', 'y', 4.2, 5.4, 5.2, 0, 2.2, 'the office door')
    a.opening('window', 'x', 1.5, 4.0, 7.0, 1.4, 2.2, 'the signals room window')
    a.mast('df_mast', 2.0, 2.0, 4.6, 7.5, 'the direction-finding mast: Luftwaffe signals; the tallest thing here')
    cx, cy = 9.1, 6.0
    a.part('pit_bank', sh.cyl((cx * M, cy * M, 0), (cx * M, cy * M, 1.1 * M), 2.8 * M, 'earth', r1=2.3 * M, seg=16),
           'the raised round bank of the gun pit: the gun has to turn all the way round', 'base', True)
    a.ring_of_bags('pit_bags', cx, cy, 2.05, 1.1, 12, (7, 8), 'bags on the rim: cover for the gun crew')
    a.part('flak_pedestal', sh.cyl((cx * M, cy * M, 1.1 * M), (cx * M, cy * M, 2.0 * M), .45 * M, 'steel', r1=.3 * M, seg=10), 'the pedestal the gun turns on', 'signature')
    a.blk('flak_shield', cx - .1, cx + .1, cy - .8, cy + .8, 1.9, 2.8, 'steel', 'the gun shield', tag='signature', grounded=False)
    a.beam('flak_barrel', (cx, cy, 2.3), (cx + 1.6, cy + 1.2, 4.3), .14, 'steel', 'the 2 cm barrel pointing at the sky: anti-aircraft', free=True)
    a.flag('pennant', 6.8, .5, 3.35, 2.4, 'the Luftwaffe pennant on the office corner')
    return a


def de_pzgren(w=14, d=10):
    """Panzergrenadier Kompanie: half-tracks and their grenadiers. Masses: two vehicle pens cut into an earth bank (the
    earth is the wall), each under a camouflage net spread on poles and peaked over a centre pole (hidden vehicles), a
    sunken command dugout at the side, a radio mast on the bank at the back corner."""
    a = Build('de_pzgren', 'two earth-revetted vehicle pens under peaked nets, command dugout, mast')
    a.batter('bank_back', 0, 14, 0, 2.6, 2.0, .8, 'earth', 'the earth bank the pens are dug into')
    for i, x in enumerate((2.6, 8.4)):
        a.batter(f'bank_side_{i}', x - 1.4, x, 2.0, 9.6, 2.0, .6, 'earth', 'the revetment between pens: blast in one does not reach the next')
    a.batter('bank_end', 12.8, 14.0, 2.0, 9.6, 2.0, .45, 'earth', 'the end revetment')
    for i, x in enumerate((2.8, 8.6)):
        cx = x + 2.0
        for j, (px, py) in enumerate(((x, 2.4), (x + 4.0, 2.4), (x, 9.4), (x + 4.0, 9.4))):
            a.beam(f'net_pole_{i}_{j}', (px, py, 0), (px, py, 2.6), .12, 'timber', 'a net pole at the pen corner')
        a.beam(f'net_mast_{i}', (cx, 5.9, 0), (cx, 5.9, 4.6), .18, 'timber', 'the centre pole that lifts the net clear of the vehicle')
        a.part(f'net_{i}', sh.pyramid(4.2 * M, 7.2 * M, 2.0 * M, 'de_canvas').move((x - .1) * M, 2.3 * M, 2.6 * M),
               'the camouflage net over the pen: hidden from the air, peaked over its pole', 'roof')
        a.opening(f'pen_{i}', 'y', x + .2, x + 3.8, 9.6, 0, 2.4, 'the open mouth of the pen: half-tracks back in and drive out')
    a.blk('dugout', 0, 2.6, 6.0, 9.4, 0, 1.6, 'concrete', 'the company dugout, sunk to its eaves')
    a.blk('dugout_roof', -.1, 2.7, 5.9, 9.5, 1.6, 1.9, 'planks', 'logs and earth over it', tag='roof', grounded=False)
    a.opening('dugout_door', 'y', .8, 1.8, 9.4, 0, 1.4, 'the dugout door')
    a.mast('mast', 1.3, 1.3, 2.0, 7.0, 'the radio mast on the bank at the back corner: the half-tracks\' net')
    a.flag('pennant', 13.4, 2.4, 2.0, 4.0, 'the company pennant on the bank')
    return a


def de_panzer(w=16, d=12):
    """Panzer Kompanie: tanks issued and repaired. Masses: an arched tank hall (timber ribs under netting on concrete
    side walls, earth banked up its flanks: dug in), open to the front; a lower workshop on its far end (a second roof
    level); a portal gantry over the front apron lifting a turret (the turret says tanks)."""
    a = Build('de_panzer', 'arched tank hall dug into earth banks, lower workshop, portal gantry lifting a turret')
    a.batter('bank_l', 2.6, 4.2, 0, 8.6, 2.2, .7, 'earth', 'earth banked up the hall\'s flank')
    a.batter('bank_r', 13.6, 15.4, 0, 8.6, 2.2, .7, 'earth', 'and the other flank')
    a.blk('wall_l', 3.4, 4.0, 0, 8.4, 0, 2.6, 'concrete', 'the hall\'s concrete side wall')
    a.blk('wall_r', 13.8, 14.4, 0, 8.4, 0, 2.6, 'concrete', 'the other side wall')
    a.blk('back_wall', 4.0, 13.8, 0, .5, 0, 2.6, 'concrete', 'the back wall')
    n, cx, r = 10, 8.9, 5.5
    outer = [(cx - r * math.cos(math.pi * i / n), 2.6 + 3.2 * math.sin(math.pi * i / n)) for i in range(n + 1)]
    inner = [(cx - (r - .25) * math.cos(math.pi * i / n), 2.6 + 2.95 * math.sin(math.pi * i / n)) for i in range(n, -1, -1)]
    arch = sh.extrude([(x * M, z * M) for x, z in outer + inner], 8.4 * M, 'de_canvas')   # (x, z) section along the extrude's x
    a.part('arch', arch.rz(-90).move(0, 8.4 * M, 0), 'the arched roof: timber ribs under netting, tall enough for a Panzer IV on blocks', 'roof')
    a.opening('bay', 'y', 4.3, 13.5, 8.4, 0, 4.0, 'the open front: tanks drive straight in')
    a.blk('workshop', 0, 2.6, .5, 6.0, 0, 3.0, 'concrete', 'the machine shop on the far end')
    a.blk('workshop_roof', -.1, 2.7, .4, 6.1, 3.0, 3.3, 'planks', 'its flat roof, below the arch', tag='roof', grounded=False)
    a.opening('workshop_door', 'y', .6, 2.0, 6.0, 0, 2.2, 'the workshop door')
    a.blk('apron', 3.4, 15.8, 8.4, 11.8, 0, .12, 'concrete', 'the concrete apron under the gantry', tag='base')
    for x in (3.6, 15.5):
        for y in (8.6, 11.6):
            a.beam(f'gantry_leg_{x:.0f}_{y:.0f}', (x, y, 0), (x, 10.1, 8.8), .35, 'steel', 'an A-frame leg of the portal gantry')
    a.blk('gantry_girder', 3.3, 15.8, 9.7, 10.5, 8.8, 9.7, 'steel', 'the girder: a turret weighs tons', tag='signature', grounded=False)
    a.blk('trolley', 10.3, 11.3, 9.6, 10.6, 8.2, 8.8, 'steel', 'the hoist trolley', tag='signature', grounded=False)
    a.beam('chains', (10.8, 10.1, 8.2), (10.8, 10.1, 4.0), .08, 'steel', 'the chain to the load')
    a.part('turret', sh.cyl((10.8 * M, 10.1 * M, 2.9 * M), (10.8 * M, 10.1 * M, 4.0 * M), 1.2 * M, 'steel', r1=.95 * M, seg=10),
           'a tank turret on the hook: this building makes tanks', 'signature')
    a.beam('gun', (10.8, 10.1, 3.4), (12.9, 11.6, 3.4), .14, 'steel', 'the turret\'s gun: no mistaking it', free=True)
    a.flag('pennant', 2.4, .7, 3.3, 4.0, 'the company pennant over the workshop')
    return a


ALL = {
    'us_hq': (us_hq, 'landmark'), 'us_barracks': (us_barracks, 'major'), 'us_wsc': (us_wsc, 'major'),
    'us_motorpool': (us_motorpool, 'major'), 'us_depot': (us_depot, 'major'),
    'de_hq': (de_hq, 'landmark'), 'de_infanterie': (de_infanterie, 'major'), 'de_luftwaffe': (de_luftwaffe, 'major'),
    'de_pzgren': (de_pzgren, 'major'), 'de_panzer': (de_panzer, 'major'),
}
