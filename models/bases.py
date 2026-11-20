"""Base buildings: the two HQs and the eight production buildings, the canvas stand-ins' replacements. BLOCKOUT STAGE
(DESIGN_METHOD.md step 7): primary and secondary masses only, shown grey for review before any detail.
Metres in, units out (kit.M). x along the long side, y across, z up; the camera sees the +x and +y walls, so every
building's way out (doors, the vehicle bay) faces +y or +x. Footprints are game/src/data.js `size` (w x d).

SHARED BRIEF
  is:        field-built base structures, central Italy, summer 1944
  does:      produce units (they walk or drive out of the front), reinforce nearby squads, are shelled and blown up
  gameplay:  footprint as data.js; readable at play size as "whose" (US canvas, timber and sandbags; German concrete,
             timber and camouflage netting) and "what tier" (infantry: small and huts; vehicles: big open bays)
  built:     US: engineers' field works (pyramidal tents, Quonset hut, timber sheds, a steel-framed workshop);
             German: pioneers' works (concrete, half-buried huts, revetted vehicle pens under nets)
  moves:     nothing; doors and bay openings shown open
  serviced:  vehicles drive in and out of the bay openings; men walk in by the doors
  references: CoH3 Wehrmacht HQ (a squat concrete command bunker: reference screenshot 05); US M1934 pyramidal squad
             tents; WW2 Quonset huts; field motor pools (open timber sheds with canvas roofs, fuel-drum dumps);
             German Unterstande / RAD timber huts; camouflage-netted vehicle pens. Our own designs: the CoH3
             base buildings are a function and size reference, not copied.
  read_at_play_size: US "a sandbagged camp of tents and sheds"; DE "concrete and nets dug into the ground"
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path: sys.path.insert(0, ROOT)
from artkit import shapes as sh
from artkit.assembly import Assembly
from artkit import library as lib
from models.kit import M


def blk(a, x0, x1, y0, y1, z0, z1, mat, name, why, tag='body', grounded=False):
    """A block in metres. `why` is the part's reason (DESIGN_METHOD step 1); kept in the notes for the review."""
    a.add(name, sh.block(x0 * M, x1 * M, y0 * M, y1 * M, z0 * M, z1 * M, mat), grounded=grounded, tag=tag)
    a.note(f'{name}: {why}')


def bags(a, x0, y0, length, rows=3, name='bags', why='sandbag wall: cover and blast protection'):
    g = lib.sandbags(length * M, rows=rows)
    a.add(name, g.move(x0 * M, y0 * M, 0), grounded=True, tag='yard'); a.note(f'{name}: {why}')


def post(a, x, y, z0, z1, name, why='a timber post carries the roof', t=.2, free=False):
    a.strut(name, (x * M, y * M, z0 * M), (x * M, y * M, z1 * M), t * M, 'timber', free=free); a.note(f'{name}: {why}')


def gable(a, x0, y0, w, d, z, rise, mat, name, why, over=.3):
    a.add(name, sh.gable(w * M, d * M, rise * M, mat, overhang=over * M, thick=.15 * M).move(x0 * M, y0 * M, z * M), tag='roof')
    a.note(f'{name}: {why}')


# ---------------------------------------------------------------- US Forces
def us_hq(w=14, d=10):
    """Command post: a sandbagged timber blockhouse with a raised command hut, radio mast and flag. Reinforces and is
    the retreat point, so it is the heaviest-looking US structure: low, wide, walled."""
    a = Assembly(); a.note('US HQ: dug-in command post')
    blk(a, 0, 10.5, 0, d, 0, 2.4, 'sandbag', 'blockhouse', 'the dug-in lower storey: earth-filled timber crib faced with bags', grounded=True)
    blk(a, 1.5, 9, 1.5, 8, 2.4, 4.6, 'planks', 'command_hut', 'the raised hut where the staff work, windows on the field')
    gable(a, 1.5, 1.5, 7.5, 6.5, 4.6, 1.2, 'us_canvas', 'hut_roof', 'canvas over a timber roof: rain off, little to burn')
    blk(a, 5, 7.5, d - .02, d + .02, 0, 2.0, 'opening', 'door', 'the way in and out, facing the front', tag='opening')
    for i, x in enumerate((.6, 7.8)): bags(a, x, d + .6, 2.6, name=f'front_bags_{i}', why='a breastwork in front of the door')
    blk(a, 11, 13.5, 2, 8, 0, 1.4, 'planks', 'radio_shack', 'the signals room, half dug in beside the blockhouse', grounded=True)
    a.add('mast', lib.antenna(9 * M).move(12.2 * M, 5 * M, 1.4 * M), tag='signature'); a.note('mast: the radio mast, the HQ landmark seen across the map')
    post(a, 1, 1, 2.4, 8.5, 'flagpole', 'the flag: whose base this is', t=.12, free=True)
    return a


def us_barracks(w=12, d=9):
    """Two M1934 pyramidal squad tents on timber floors, a sandbag wall and a stack of kit: where riflemen muster."""
    a = Assembly(); a.note('US Barracks: tent lines')
    for i, x in enumerate((.5, 6.5)):
        blk(a, x, x + 5, 1, 6, 0, .3, 'planks', f'floor_{i}', 'a timber floor keeps the tent out of the mud', grounded=True)
        blk(a, x + .1, x + 4.9, 1.1, 5.9, .3, 1.7, 'us_canvas', f'tent_wall_{i}', 'the tent\'s low walls (rolled up in summer)')
        a.add(f'tent_roof_{i}', sh.pyramid(5.2 * M, 5.2 * M, 2.6 * M, 'us_canvas').move((x - .1) * M, .9 * M, 1.7 * M), tag='roof')
        a.note(f'tent_roof_{i}: the pyramidal tent on its centre pole: the shape that says "US camp"')
        blk(a, x + 1.8, x + 3.2, 5.9, 5.94, .3, 1.7, 'opening', f'tent_door_{i}', 'the flap tied back, facing the front', tag='opening')
    bags(a, .5, d - .9, 11, name='front_bags', why='a low wall along the front of the lines')
    for i, (x, y) in enumerate(((11.0, 1.0), (11.0, 2.4), (11.0, 3.8))):
        blk(a, x, x + .9, y, y + .9, 0, .7, 'planks', f'crate_{i}', 'kit and ammunition crates: the camp is supplied', grounded=True)
    return a


def us_wsc(w=12, d=9):
    """Weapon Support Center: a Quonset hut (corrugated steel half-barrel) where crew weapons are kept, its end door
    on the front, sandbags along the side and crated weapons outside."""
    a = Assembly(); a.note('US Weapon Support Center: Quonset hut')
    import math
    r = 3.2; n = 10                                                                  # clockwise (y right, z up): left foot, over the top, right foot
    prof = [(4.5 - r * math.cos(math.pi * i / n), .3 + r * math.sin(math.pi * i / n)) for i in range(n + 1)] + [(4.5 + r, 0), (4.5 - r, 0)]
    a.add('quonset', sh.extrude([(y * M, z * M) for y, z in prof], 10.5 * M, 'steel').move(.5 * M, 0, 0), grounded=True, tag='body')
    a.note('quonset: the half-barrel steel hut, shipped flat and bolted up in a day; reads US at a glance')
    blk(a, 10.98, 11.02, 3.3, 5.7, 0, 2.6, 'opening', 'end_door', 'double doors in the end wall, wide enough for a gun on its wheels', tag='opening')
    bags(a, 1, 8.3, 9, name='side_bags', why='blast wall along the long side')
    for i, x in enumerate((1.0, 2.2)):
        blk(a, x, x + 1.0, .2, .9, 0, .6, 'planks', f'weapon_crate_{i}', 'long crates: machine guns and bazookas', grounded=True)
    return a


def us_motorpool(w=14, d=11):
    """Motor Pool: an open-sided timber shed with a low canvas roof over two vehicle bays, open to the front, a fuel
    drum dump and a workbench. The first US building that makes vehicles: it reads as a garage."""
    a = Assembly(); a.note('US Motor Pool: open vehicle shed')
    blk(a, .5, 13.5, .5, 9, 0, .15, 'planks', 'hardstanding', 'a plank and gravel floor the trucks can stand on', grounded=True)
    for i, x in enumerate((.6, 7, 13.4)):
        for j, y in enumerate((.6, 8.9)): post(a, x, y, 0, 4.0, f'post_{i}_{j}')
    blk(a, .5, 13.5, .5, .8, 0, 4.0, 'planks', 'back_wall', 'a boarded back wall against the wind', grounded=True)
    gable(a, .5, .5, 13, 8.5, 4.0, 1.0, 'us_canvas', 'roof', 'tarpaulin over rafters: shade for the mechanics, cheap to raise')
    for i in range(6):
        a.add(f'drum_{i}', lib.barrel(.3 * M, .9 * M).move((1 + (i % 3) * .65) * M, (9.8 + (i // 3) * .65) * M, 0), grounded=True, tag='yard')
    a.note('drum_*: the fuel dump: jerricans and drums, set out of the shed')
    blk(a, 11.8, 13.2, 1.2, 2.0, 0, .9, 'planks', 'bench', 'the mechanics\' bench along the back')
    return a


def us_depot(w=16, d=12):
    """Tank Depot: a steel-framed workshop hall, tall enough for a Sherman on jacks, one long side open as the bay, a
    gantry beam with a chain hoist over the door for lifting engines and turrets, and a ramp of planks."""
    a = Assembly(); a.note('US Tank Depot: steel-framed workshop')
    blk(a, 0, 16, 0, 9.5, 0, 6.0, 'steel', 'hall', 'the hall: corrugated sheet on a steel frame', grounded=True)
    gable(a, 0, 0, 16, 9.5, 6.0, 1.4, 'steel', 'hall_roof', 'a shallow steel roof spanning the bays')
    for i, x in enumerate((1, 8.5)):
        blk(a, x, x + 6.5, 9.48, 9.52, 0, 5.0, 'opening', f'bay_{i}', 'two tank-sized doors facing the front', tag='opening')
    for x in (.3, 15.7): post(a, x, 11.6, 0, 7.0, f'gantry_leg_{x:.0f}', 'the gantry legs stand clear of the doors', t=.35)
    a.strut('gantry_beam', (.3 * M, 11.6 * M, 7.0 * M), (15.7 * M, 11.6 * M, 7.0 * M), .45 * M, 'steel')
    a.note('gantry_beam: the crane rail over the apron, for lifting engines out: says "heavy vehicles"')
    blk(a, 3, 5, 9.6, 12, 0, .25, 'planks', 'ramp', 'plank apron so the tracks do not chew the yard', grounded=True)
    return a


# ---------------------------------------------------------------- Wehrmacht
def de_hq(w=14, d=10):
    """Command bunker: a squat poured-concrete block with sloped shoulders (shells glance off), an armoured door in a
    recessed entry, an observation cupola and a radio mast on the roof. The CoH3 Wehrmacht HQ is this kind of thing."""
    a = Assembly(); a.note('DE HQ: concrete command bunker')
    blk(a, 0, w, 0, d, 0, 2.8, 'concrete', 'bunker', 'the poured-concrete body, walls 2 m thick', grounded=True)
    prof = [(0, 2.8), (1.2, 4.0), (d - 1.2, 4.0), (d, 2.8)]                       # sloped shoulders along the long sides
    a.add('roof_slab', sh.extrude([(y * M, z * M) for y, z in prof], w * M, 'concrete'), tag='roof')
    a.note('roof_slab: a thick roof with chamfered edges: a shell skids off instead of biting')
    blk(a, 9, 12, d - .4, d + .02, 0, 2.2, 'opening', 'entry', 'the recessed entry with its armoured door, facing the front', tag='opening')
    for i, x in enumerate((8.3, 12.2)): blk(a, x, x + .5, d, d + 1.6, 0, 2.4, 'concrete', f'entry_wing_{i}', 'blast walls either side of the door', grounded=True)
    a.add('cupola', sh.prism(.9 * M, .9 * M, 'steel', n=10).move(4 * M, 5 * M, 4.0 * M), tag='signature'); a.note('cupola: the armoured observation cupola, a periscope ring')
    a.add('mast', lib.antenna(8 * M).move(11 * M, 3 * M, 4.0 * M), tag='signature'); a.note('mast: the radio mast')
    for i, x in enumerate((1.5, 4.5)): blk(a, x, x + 1.4, d - .02, d + .02, 1.2, 1.6, 'opening', f'loophole_{i}', 'firing slits over the front', tag='opening')
    return a


def de_infanterie(w=12, d=9):
    """Infanterie Kompanie: a timber hut half sunk in a concrete-lined pit, earth banked along its sides, a low pitched
    roof, steps down to the door: the grenadiers' quarters."""
    a = Assembly(); a.note('DE Infanterie Kompanie: half-buried timber hut')
    blk(a, 0, w, 0, d, 0, 1.0, 'concrete', 'pit_wall', 'the concrete curb of the pit the hut stands in', grounded=True)
    blk(a, .8, 11.2, .8, 8.2, 1.0, 3.0, 'planks', 'hut', 'the timber hut above ground: barrack room and stores')
    gable(a, .8, .8, 10.4, 7.4, 3.0, 1.3, 'planks', 'roof', 'boarded roof under turf: low so it hides')
    blk(a, 6, 7.4, 8.1, 9.3, 0, .6, 'concrete', 'steps', 'steps down into the pit to the door', grounded=True)
    blk(a, 6.1, 7.3, 8.18, 8.22, 1.0, 2.8, 'opening', 'door', 'the door at the bottom of the steps', tag='opening')
    for i, x in enumerate((2, 4.2, 9)): blk(a, x, x + 1, 8.18, 8.22, 1.9, 2.6, 'opening', f'window_{i}', 'small windows just above the bank', tag='opening')
    return a


def de_luftwaffe(w=12, d=9):
    """Luftwaffe Kompanie: a concrete-and-timber field office with a sandbagged gun pit at one end (the Luftwaffe
    manned the flak) and a tall direction-finding mast: ground troops of the air force."""
    a = Assembly(); a.note('DE Luftwaffe Kompanie: field office and gun pit')
    blk(a, 0, 7.5, 0, d, 0, 3.2, 'concrete', 'office', 'the concrete office block', grounded=True)
    a.add('office_roof', sh.block(-.2 * M, 7.7 * M, -.2 * M, (d + .2) * M, 3.2 * M, 3.6 * M, 'concrete'), tag='roof'); a.note('office_roof: a flat slab with a lip')
    blk(a, 3, 4.6, d - .02, d + .02, 0, 2.2, 'opening', 'door', 'the door, facing the front', tag='opening')
    import math
    ring = [((9.7 + 2.0 * math.cos(t * math.pi / 6)) * M, (4.5 + 2.0 * math.sin(t * math.pi / 6)) * M) for t in range(12)]
    for i, (x, y) in enumerate(ring):
        if i in (2, 3): continue                                                  # the way in to the pit, toward the front
        a.add(f'pit_bags_{i}', lib.sandbags(1.1 * M, rows=4).move(x - .55 * M, y - .15 * M, 0), grounded=True, tag='yard')
    a.note('pit_bags_*: the round sandbagged gun pit: the flak position that says Luftwaffe')
    a.add('flak', sh.prism(.5 * M, 1.0 * M, 'steel', n=8).move(9.7 * M, 4.5 * M, 0), grounded=True, tag='signature'); a.note('flak: the light flak gun on its pedestal (blockout: a post)')
    a.strut('flak_barrel', (9.7 * M, 4.5 * M, 1.0 * M), (11.0 * M, 5.5 * M, 2.3 * M), .12 * M, 'steel', free=True); a.note('flak_barrel: pointing up: anti-aircraft')
    a.add('mast', lib.antenna(10 * M).move(1.5 * M, 1.5 * M, 3.6 * M), tag='signature'); a.note('mast: the direction-finding mast, taller than anything else in the base')
    return a


def de_pzgren(w=14, d=10):
    """Panzergrenadier Kompanie: a revetted vehicle pen: concrete side walls, a timber roof on posts covered with a
    camouflage net, open to the front for the half-tracks, a small concrete office at the back corner."""
    a = Assembly(); a.note('DE Panzergrenadier Kompanie: netted vehicle pen')
    for i, x in enumerate((0, 13.2)): blk(a, x, x + .8, 0, d - 1, 0, 2.6, 'concrete', f'revetment_{i}', 'concrete side walls: blast protection for the vehicles', grounded=True)
    blk(a, .8, 13.2, 0, .8, 0, 2.6, 'concrete', 'back_wall', 'the back wall closes the pen', grounded=True)
    for i, x in enumerate((.4, 7, 13.6)): post(a, x, d - 1, 0, 3.4, f'front_post_{i}', 'posts carry the roof beam across the open front')
    blk(a, 0, w, 0, d - .8, 3.4, 3.6, 'planks', 'roof', 'a flat timber roof over the bays')
    a.add('net', sh.block(-.3 * M, (w + .3) * M, -.3 * M, (d - .5) * M, 3.6 * M, 3.75 * M, 'de_canvas').move(0, 0, 0), tag='roof')
    a.note('net: the camouflage net draped over the roof and down the sides: hidden from the air')
    blk(a, 1, 4, .8, 3.5, 0, 2.4, 'concrete', 'office', 'the company office in the back corner, out of the vehicles\' way', grounded=True)
    return a


def de_panzer(w=16, d=12):
    """Panzer Kompanie: a big vehicle hall for tanks: concrete U-walls, an arched roof of timber ribs under camouflage
    netting, an open front with a drive-in apron, and a tripod hoist for lifting turrets in the yard."""
    a = Assembly(); a.note('DE Panzer Kompanie: arched tank hall')
    import math
    for i, x in enumerate((0, 15.2)): blk(a, x, x + .8, 0, 9.5, 0, 3.0, 'concrete', f'wall_{i}', 'the hall\'s concrete side walls', grounded=True)
    blk(a, .8, 15.2, 0, .8, 0, 3.0, 'concrete', 'back_wall', 'the back wall', grounded=True)
    r = 8.0; n = 8
    arch = [(8.0 + r * math.cos(math.pi * i / n), 3.0 + 3.0 * math.sin(math.pi * i / n)) for i in range(n + 1)]
    # the arched roof: a curved net over ribs, ridge along y (the tanks drive in along it)
    pts = [(x, z) for x, z in arch]
    for k in range(len(pts) - 1):
        (x0, z0), (x1, z1) = pts[k], pts[k + 1]
        a.add(f'arch_{k}', sh.quad((x0 * M, 0, z0 * M), (0, 9.5 * M, 0), ((x1 - x0) * M, 0, (z1 - z0) * M), 'de_canvas'), tag='roof')
    a.note('arch_*: the arched netted roof: tall enough for a Panzer IV, reads as a hangar')
    blk(a, 2, 14, 9.46, 9.5, 0, 3.0, 'opening', 'bay', 'the open front the tanks drive through', tag='opening')
    blk(a, 4, 12, 9.5, 12, 0, .2, 'concrete', 'apron', 'a concrete apron in front of the bay', grounded=True)
    for i, (x, y) in enumerate(((14.5, 10.5), (15.8, 11.6), (13.6, 11.7))):
        a.strut(f'hoist_leg_{i}', (x * M, y * M, 0), (14.6 * M, 11.3 * M, 5.5 * M), .18 * M, 'timber')
    a.note('hoist_leg_*: the tripod hoist for lifting engines and turrets in the yard: says "tank workshop"')
    return a


ALL = {
    'us_hq': us_hq, 'us_barracks': us_barracks, 'us_wsc': us_wsc, 'us_motorpool': us_motorpool, 'us_depot': us_depot,
    'de_hq': de_hq, 'de_infanterie': de_infanterie, 'de_luftwaffe': de_luftwaffe, 'de_pzgren': de_pzgren, 'de_panzer': de_panzer,
}


if __name__ == '__main__':
    from tools.render import shot, mats, sheet
    out = sys.argv[1] if len(sys.argv) > 1 else 'scratch'; os.makedirs(out, exist_ok=True)
    G = mats((196, 196, 192), {'opening': (55, 55, 55), 'us_canvas': (175, 175, 168), 'de_canvas': (150, 150, 145),
                               'sandbag': (180, 178, 170), 'planks': (165, 162, 155), 'steel': (140, 140, 140),
                               'concrete': (205, 205, 200), 'timber': (110, 110, 110)})
    keys = sys.argv[2:] or list(ALL)
    close, labs, play = [], [], []
    for key in keys:
        a = ALL[key](); iss = a.check()
        print(key, 'check:', iss or 'empty')
        g = a.geometry(); close.append(shot(g, .45, G)); labs.append(key); play.append(shot(g, .2, G))
    sheet(close, labs, cols=5).save(f'{out}/bases_blockout.png')
    sheet(play, labs, cols=5).save(f'{out}/bases_blockout_play.png')
