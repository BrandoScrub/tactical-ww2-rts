"""Run Machine.check() on every machine: python3 tools/check.py [module ...] (default: every vehicle module and infantry,
then every vehicle as the game exports it: the blockout with its finishing pass, models/finish.py; then the aircraft
blockouts, the aircraft finished (models/air_finish.py) and every parachute rig and stage)."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)   # the pinned artkit/ and models/
import time
import importlib
bad = 0
for mod in sys.argv[1:] or ['us_vehicles', 'de_vehicles', 'us_vehicles2', 'de_vehicles2', 'new_vehicles', 'infantry']:
    V = importlib.import_module('models.' + mod)
    for role, name, fn in V.ALL:
        t = time.time(); m = fn(); iss = m.check(); bad += len(iss)
        print(f'{name}: {len(m.parts)} parts, {len(iss)} issues ({time.time()-t:.1f}s)')
        for i in iss: print('   ', i)
if not sys.argv[1:]:
    from models import roster
    for side in roster.SIDES:
        for key, _, name, m in roster.vehicles(side):
            t = time.time(); iss = m.check(); bad += len(iss)
            print(f'{key} finished: {len(m.parts)} parts, {len(iss)} issues ({time.time()-t:.1f}s)')
            for i in iss: print('   ', i)
if not sys.argv[1:]:
    from models import aircraft, parachutes
    for role, name, fn in aircraft.ALL + parachutes.ALL:
        t = time.time(); m = fn(); iss = m.check(); bad += len(iss)
        print(f'{name}: {len(m.parts)} parts, {len(iss)} issues ({time.time()-t:.1f}s)')
        for i in iss: print('   ', i)
    for key in aircraft.BLOCKOUT:
        t = time.time(); m = aircraft.finished(key); iss = m.check(); bad += len(iss)
        print(f'{key} finished: {len(m.parts)} parts, {len(iss)} issues ({time.time()-t:.1f}s)')
        for i in iss: print('   ', i)
print('TOTAL', bad)
sys.exit(1 if bad else 0)
