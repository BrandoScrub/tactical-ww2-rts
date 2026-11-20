"""The roster as the exporter sees it: every unit as a rig with its clips, wearing its side's materials.
Vehicles: artkit.machine.MachineRig (idle, move, fire). Men: artkit.figure.Biped with the trooper clips."""
import math
import numpy as np
from artkit.figure import material, Clip, keyframes
from artkit.parts.trooper import trooper_clips, sighted
from . import us_vehicles, de_vehicles, us_vehicles2, de_vehicles2, infantry as I

material('us_jump', (164, 150, 108), 'canvas'); material('de_smock', (118, 104, 70), 'canvas')      # airborne jump suit; camouflage smock

SIDES = ('us', 'de')

from .dress import CLOTH, dress, paint, _rename, texture_cloth
texture_cloth()


# ---- vehicles
# Weapons that stand still in play keep 8 headings; everything that drives gets 16 (long hulls show the snap at 8).
STATIC = ('anti_tank_gun', 'tripod_mg', 'mortar', 'howitzer')


def headings_for(key):
    return 8 if any(key.endswith('_' + s) or ('_' + s + '_') in key for s in STATIC) else 16


def vehicle_rig(m, key, headings=None):
    headings = headings or headings_for(key)
    lo = np.min([p.geom.bounds()[0] for p in m.parts.values()], 0); hi = np.max([p.geom.bounds()[1] for p in m.parts.values()], 0)
    body = [n for n in m.parts if n not in m.subtree('turret')] if 'turret' in m.parts else list(m.parts)
    blo = np.min([m.parts[n].geom.bounds()[0] for n in body], 0); bhi = np.max([m.parts[n].geom.bounds()[1] for n in body], 0)
    origin = ((blo[0] + bhi[0]) / 2, (blo[1] + bhi[1]) / 2, 0.0)
    barrel = next((n for n in ('muzzle', 'gun', 'barrel', 'mg_barrel', 'mg') if n in m.parts), None)
    tip = None
    if barrel:
        b0, b1 = m.parts[barrel].geom.bounds(); tip = (b1[0], (b0[1] + b1[1]) / 2, (b0[2] + b1[2]) / 2)
    recoil = [n for n in ('gun', 'muzzle', 'barrel', 'breech', 'mg_barrel') if n in m.parts]
    return m.rig(origin, upper=['turret'] if 'turret' in m.parts else [], muzzle=tip, recoil=recoil, headings=headings, name=key)


def vehicles(side):
    """[(key, role, name, machine)]"""
    V = us_vehicles if side == 'us' else de_vehicles
    out = []
    V2 = us_vehicles2 if side == 'us' else de_vehicles2
    for role, name, fn in V.ALL + V2.ALL:
        key = f"{side}_{role.replace(' ', '_').replace('-', '_')}"
        out.append((key, role, name, paint(fn(), side)))
    gun = V.at57 if side == 'us' else V.pak40
    out.append((f'{side}_anti_tank_gun_limbered', 'crew weapon', 'anti-tank gun, trails closed for moving', paint(gun(deployed=False), side)))
    for name, fn in (('tripod_mg', I.tripod_mg), ('mortar', I.mortar)):
        mm = fn(side == 'de'); out.append((f'{side}_{name}', 'crew weapon', mm.name, paint(mm, side)))
    return out


def vehicle_clips(rig):
    tracked = bool(rig.belts)
    clips = [rig.idle(frames=1), rig.move(frames=6 if tracked else 1)]
    if rig.muzzle_at is not None and not rig.name.endswith('_limbered'): clips.append(rig.fire(frames=5, recoil=3.0 if not rig.top and not tracked and len(rig.m.parts) < 12 else 7.0))
    return clips


# ---- men
def _still(name, pose, frames=1, fps=6, loop=True):
    return Clip(name, lambda t: pose, frames=frames, fps=fps, loop=loop)


def _shot(name, pose, flash=True, frames=5, fps=14):
    """A crew fire clip: the pose held, a flash on the first frame."""
    def fn(t):
        p = dict(pose); p['flash'] = np.array([1.0 if (flash and t < 0.2) else 0.0]); return p
    return Clip(name, fn, frames=frames, fps=fps, loop=False, events={'fire': 0})


def men(side):
    """[(key, name, unit, clips)]: walking troops get the full trooper set (idle, walk, run, back, aim, fire, die);
    the rocket gunner gets it with his own aim and fire; deployed crew get idle and fire in place."""
    us = side == 'us'
    rifle, smg = (I.garand, I.thompson) if us else (I.kar98, I.mp40)
    out = []
    def add(key, name, u, clips): out.append((f'{side}_{key}', name, dress(u, side), clips))
    u = I.trooper(side, rifle(), ['pack']); add('rifleman', 'rifleman', u, trooper_clips(u, fire='auto' if us else 'bolt')[0])
    u = I.trooper(side, smg()); add('leader', 'leader, submachine gun', u, trooper_clips(u, fire='auto')[0])
    u = I.trooper(side, I.S.flame_gun(), ['flame']); add('flamethrower', 'engineer, flamethrower', u, trooper_clips(u, fire='auto', weight=1.6)[0])
    u = I.trooper(side, rifle(), ['shovel']); add('sapper', 'engineer, shovel', u, trooper_clips(u, fire='auto' if us else 'bolt')[0])
    # rocket gunner: the trooper's footwork, his own shouldered aim and shot
    u = I.trooper(side, I.bazooka() if us else I.panzerschreck())
    base, st, _ = trooper_clips(u, fire='auto')
    up = I.shouldered(u, I.STAND_TUBE)
    clips = [c for c in base if c.name in ('idle', 'walk', 'run', 'die')]
    clips += [Clip('aim', keyframes(st['ready'], [(0.0, {}), (1.0, up)]), frames=6, fps=12, loop=False), _shot('fire', up, frames=6, fps=12)]
    add('rocket_gunner', 'rocket gunner', u, clips)
    # deployed crew (they walk as riflemen; these are the in-place models)
    mt = I.mortar(not us); col = np.array(mt.parts['collar'].geom.bounds()).mean(0)
    u = I.trooper(side, rifle()); p = I.reach(u, I.slung(u, u.pose(**I.KNEEL)), L=col + (0, 6, 0) - (-20, 26, 0), R=col + (-6, -2, -8) - (-20, 26, 0))
    add('mortar_gunner', 'mortar gunner (stands 20 behind, 26 left of the mortar)', u, [_still('idle', p), _shot('fire', p, flash=False)])
    mg = I.tripod_mg(not us); back = np.array(mg.parts['receiver'].geom.bounds()[0]); h = np.array(mg.parts['receiver'].geom.bounds()[1])[2]
    u = I.trooper(side, rifle()); p = I.reach(u, I.slung(u, u.pose(**I.SIT)), L=(32, 3, h - 3), R=(28, -3, h - 4))
    add('mg_gunner', 'machine gunner (sits 30 behind the receiver)', u, [_still('idle', p), _shot('fire', p, flash=False)])
    for key, bone, mesh, nm in (('loader_box', 'hand_L', I.ammo_box(), 'loader with ammunition box'), ('loader_bomb', 'hand_R', I.bomb(), 'loader with mortar bomb'),
                                ('loader_rocket', 'hand_R', I.rocket(), 'loader with rocket')):
        u = I.carry(I.trooper(side, rifle()), bone, mesh, nm); p = I.slung(u, u.pose(**I.KNEEL))
        if key != 'loader_box': p = I.reach(u, p, R=(12, -8, 44))
        add(key, nm, u, [_still('idle', p)])
    return out


# ---- where a crew stands: weapon model frame, units (+x = the way the weapon faces, +y = its left), heading in
# degrees relative to the weapon (multiples of 45, so an 8-heading sprite exists for every weapon heading). artkit units: 160 a tile. Written to art/crew_layout.json by layout.py.
CREW_AT = {'at_gunner': (-25, 32, 0), 'at_loader': (-50, -34, 45), 'at_commander': (-95, 55, 0)}
PUSH_AT = {'pusher#1': (-150, 15, 0), 'pusher#2': (-150, -15, 0)}
BREECH = (-44, 0, 44)                      # where the shell goes in


def _local(at, p):
    """A weapon-frame point seen from a man standing at (x, y, heading)."""
    x, y, h = at; c, s = math.cos(math.radians(-h)), math.sin(math.radians(-h)); dx, dy = p[0] - x, p[1] - y
    return (c * dx - s * dy, s * dx + c * dy, p[2])


def crews(side):
    """[(key, name, unit, clips)]: anti-tank gun crew in place, men pushing a limbered gun, and the mortar and
    machine gun teams carrying their weapons."""
    us = side == 'us'
    rifle, smg = (I.garand, I.thompson) if us else (I.kar98, I.mp40)
    out = []
    def add(key, name, u, clips): out.append((f'{side}_{key}', name, dress(u, side), clips))
    # gunner: kneels left of the breech, hands on the laying wheels
    u = I.trooper(side, rifle()); at = CREW_AT['at_gunner']
    p = I.reach(u, I.slung(u, u.pose(**I.KNEEL)), L=_local(at, (-4, 23, 42)), R=_local(at, (-8, 30, 36)))
    flinch = dict(p); flinch['chest_rot'] = np.array([0.0, -4, 0]); flinch['head_rot'] = np.array([0.0, -10, 0])
    add('at_gunner', 'anti-tank gunner', u, [_still('idle', p), Clip('fire', keyframes(p, [(0.0, {}), (0.15, flinch), (1.0, {})]), frames=6, fps=12, loop=False, events={'fire': 0})])
    # loader: kneels right of the breech with a round; "fire" is his reload: round into the breech and back for the next
    u = I.carry(I.trooper(side, rifle()), 'hand_R', I.shell(), 'shell'); at = CREW_AT['at_loader']
    p0 = I.reach(u, I.slung(u, u.pose(**I.KNEEL)), R=(11, -7, 40))
    lean = dict(p0); lean['chest_rot'] = np.array([0.0, 22, 0]); p1 = I.reach(u, lean, R=_local(at, BREECH))
    ram = {k: p1[k] for k in ('hand_R', 'chest_rot')}
    add('at_loader', 'anti-tank loader', u, [_still('idle', p0), Clip('fire', keyframes(p0, [(0.0, {}), (0.35, {}), (0.6, ram), (0.75, ram), (1.0, {})]), frames=8, fps=10, loop=False)])
    # commander: kneels behind and to the left, submachine gun up, watching the target
    u = I.trooper(side, smg()); add('at_commander', 'anti-tank gun commander', u, [_still('idle', sighted(u, I.KNEEL))])
    # pusher: walks bent forward with both hands out on the trail (rifle slung)
    u = I.trooper(side, rifle()); _, st, ex = trooper_clips(u, fire='auto')
    def push(fn):
        def f(t):
            q = I.slung(u, dict(fn(t))); q['hand_L'] = np.array([16.0, 8, 12]); q['hand_R'] = np.array([16.0, -8, 12])
            q['chest_rot'] = np.asarray(q['chest_rot'], float) + (0, 16, 0); q['head_rot'] = np.array([0.0, -14, 0]); return q
        return f
    add('pusher', 'man pushing a gun', u, [Clip('idle', push(lambda t: st['ready']), frames=1, fps=6, loop=True),
                                          Clip('walk', push(ex['walk']), frames=10, fps=14, loop=True, stride=ex['walk_stride'])])
    # carriers: the trooper's own footwork with the load on the right shoulder (or the baseplate on the back)
    for key, w, kit, nm in (('mg_carrier', I.carried_mg(not us), [], 'machine gunner carrying the gun'),
                            ('tripod_carrier', I.carried_tripod(not us), [], 'loader carrying the tripod'),
                            ('tube_carrier', I.carried_tube(not us), [], 'mortar gunner carrying the tube'),
                            ('baseplate_carrier', rifle(), ['baseplate'], 'mortar loader with the baseplate on his back')):
        u = I.trooper(side, w, kit)
        add(key, nm, u, [c for c in trooper_clips(u, fire='auto', weight=1.5)[0] if c.name in ('idle', 'walk', 'run', 'die')])
    return out


def more_men(side):
    """[(key, name, unit, clips)]: sniper, light machine gunner, assault trooper; all with the full trooper clips."""
    us = side == 'us'; out = []
    def add(key, name, u, clips, over=None):
        u = dress(u, side)
        if over: u.parts = [(b, _rename(g, over), n, w) for b, g, n, w in u.parts]
        out.append((f'{side}_{key}', name, u, clips))
    u = I.trooper(side, I.S.scoped_rifle(), ['scrim'] if us else ['cape']); add('sniper', 'sniper, scoped rifle', u, trooper_clips(u, fire='bolt')[0])
    u = I.trooper(side, I.bar() if us else I.mg42_light(), ['pack']); add('lmg', 'automatic rifleman' if us else 'light machine gunner', u, trooper_clips(u, fire='auto', weight=1.4)[0])
    if us: u = I.trooper(side, I.m1_carbine(), ['scrim', 'pack']); add('assault_trooper', 'airborne trooper, carbine', u, trooper_clips(u, fire='auto')[0], {'us_tunic': 'us_jump', 'us_trousers': 'us_jump'})
    else: u = I.trooper(side, I.stg44()); add('assault_trooper', 'panzergrenadier, assault rifle', u, trooper_clips(u, fire='auto')[0], {'de_tunic': 'de_smock'})
    return out


def layout(side):
    """Who stands where round each crew weapon, relative to the weapon's own ground anchor."""
    us = side == 'us'; V = {k: m for k, _, _, m in vehicles(side)}
    def anchor(key): return np.asarray(vehicle_rig(V[key], key).origin, float)
    def rel(key, table): return [dict(unit=f"{side}_{n.split('#')[0]}", x=round(float(x - anchor(key)[0]), 1), y=round(float(y - anchor(key)[1]), 1), heading=h) for n, (x, y, h) in table.items()]
    back = float(V[f'{side}_tripod_mg'].parts['receiver'].geom.bounds()[0][0])
    return {
        f'{side}_anti_tank_gun': dict(crew=rel(f'{side}_anti_tank_gun', CREW_AT), moving=dict(weapon=f'{side}_anti_tank_gun_limbered', crew=rel(f'{side}_anti_tank_gun_limbered', PUSH_AT))),
        f'{side}_mortar': dict(crew=rel(f'{side}_mortar', {'mortar_gunner': (-20, 26, 0), 'loader_bomb': (4, -34, 90)}), moving=dict(weapon=None, crew=[dict(unit=f'{side}_tube_carrier'), dict(unit=f'{side}_baseplate_carrier')])),
        f'{side}_tripod_mg': dict(crew=rel(f'{side}_tripod_mg', {'mg_gunner': (back - 30, 0, 0), 'loader_box': (-14, 34, 0)}), moving=dict(weapon=None, crew=[dict(unit=f'{side}_mg_carrier'), dict(unit=f'{side}_tripod_carrier')])),
        f'{side}_howitzer': dict(crew=rel(f'{side}_howitzer', CREW_AT)),
        f'{side}_rocket_gunner': dict(crew=[dict(unit=f'{side}_loader_rocket', x=-34, y=-34, heading=0)]),
    }


def catalogue():
    """{key: dict(kind, side, name, headings, make)} for every unit the models can draw; make() -> (rig or figure, clips).
    kind: 'vehicle' (drives), 'crew weapon' (towed or set up by a crew), 'man'."""
    out = {}
    for side in SIDES:
        for key, role, name, m in vehicles(side):
            def make(m=m, key=key, h=None):
                rig = vehicle_rig(m, key, h); return rig, vehicle_clips(rig)
            out[key] = dict(kind='crew weapon' if headings_for(key) == 8 else 'vehicle', side=side, name=name, headings=headings_for(key), make=make)
        for key, name, u, clips in men(side) + crews(side) + more_men(side):
            out[key] = dict(kind='man', side=side, name=name, headings=8, make=lambda u=u, clips=clips: (u, clips))
    return out
