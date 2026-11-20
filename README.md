# Tactical WW2 RTS

A Company of Heroes 3 style tactical RTS in the browser, American against German, Italy 1944. Playable now: a 1v1
skirmish against the AI with victory points, on PC (mouse and keyboard) or a phone (touch). The 70 animated units
(vehicles, crew weapons and infantry, both sides) are modelled and exported with the art engine artkit
(BrandoScrub/Game-Engine-System-Design) by its DESIGN_METHOD.md; the HUD and rules follow the annotated CoH3
reference in `docs/reference/coh3/`.

## Play
Serve the repository root (`python3 -m http.server`) and open `game/index.html`, or build a folder for any static host
with `python3 tools/build_web.py <out>` (`dist/` by default, ignored by git). Touch controls switch on by themselves on
a phone; the menu's Controls option forces either mode.

## Game code (`game/`)
```
game/index.html    page, HUD styles (desktop and phone), menus; loads artkit/runtime and src/ in order
game/src/data.js   every number: weapons, squads, vehicles, buildings, defences, abilities, cover, economy
game/src/map.js    the skirmish map: points, sectors, cover segments, houses, trees, line of sight, pathfinding
game/src/sim.js    orders, movement, territory and supply, economy and upkeep, production, construction,
                   reinforcement, retreat, veterancy, victory points (fixed 20 steps a second)
game/src/combat.js targets, hits, directional cover, suppression, armour facing and penetration, explosions
game/src/fog.js    fog of war with true line of sight
game/src/ai.js     the skirmish opponent (either side)
game/src/render.js isometric drawing with the artkit sprites; game-world markers
game/src/hud.js    HUD, command card (QWER / ASDF / ZXCV), mouse, keyboard and touch input
game/src/main.js   boot, menus, main loop
game/test/         node: headless.js (duels), aivsai.js (one match), soak.js (many matches with invariant checks);
                   headless Chrome: flow.py (opening by input), battle.py, browser.py, mobile.py (phone), restart.py
```
Unit numbers come from CoH3 game data (coh3stats.com, patch 3.0.1). Units with no CoH3 counterpart in their slot are
marked `standIn` with the slot they fill. Player buildings are flat stand-ins until they are modelled, and battlegroups
are structure only until they are designed.

Before any merge: `python3 tools/ship.py` prints `PASS`. It is the one check: every test, the published build, and that
build played in a browser on PC and phone sizes (no web server needed). Then merge and publish `dist/` (see CLAUDE.md).

## Layout
```
artkit/            the art engine, pinned (artkit/VENDORED.json: engine commit + every file's hash). Never edit here.
game/              the browser game (above)
models/            how each unit is drawn (Python): vehicles, infantry, crews, paint; roster.py lists them all
data/units.json    the art roster: kind, side, name, headings, art key. build_art.py exports exactly these.
styles/ww2/        the game's artkit style pack; tiles/ holds the painted texture sources (1024 px)
art/               the exports: assets.json, pack/ pages, crew_layout.json (committed: the game ships its art);
                   ground/ holds the ground tiles the game paints the map with (512 px copies of styles/ww2/tiles)
tools/             build, check, preview, engine-update and web-build scripts (below)
docs/reference/    annotated Company of Heroes 3 screenshots: HUD, menus and battlefield reference (coh3/README.md)
docs/previews/     review GIFs and sheets drawn from art/
docs/sheets/       grey and colour review sheets of every vehicle and squad, play-size line-up (tools/build.py)
exports/obj/       every vehicle and squad as OBJ + MTL (metres, y up, flat colours) for other 3D tools (tools/build.py)
```

## Commands (from the repository root; Python 3 with numpy, scipy and Pillow)
- `python3 tools/check.py`: `Machine.check()` on every machine (all must be empty).
- `python3 tools/build_art.py [key ...] [-j N]`: export units into `art/` (all, or keys containing a substring); rewrites `crew_layout.json`.
  Everything takes about an hour on two processes; the 16-heading tanks are 6 to 12 minutes each.
- `python3 tools/list_units.py`: the unit table below (paste it in after an export that changes keys or clips).
- `python3 tools/preview_units.py art docs/previews`, `tools/preview_teams.py`, `tools/preview_turn.py`: review pictures from `art/`.
- `python3 tools/build.py <out>`: grey review sheets of every vehicle and squad and an OBJ + MTL per model
  (what is in `docs/sheets/` and `exports/obj/`; rebuild into a scratch folder and copy over after changing a model).
- `python3 tools/update_artkit.py <engine checkout>`: re-pin the engine; `--verify` checks the pinned copy.
- `python3 tools/build_web.py [out]`: the game, its runtime and art in one folder for any static host.

A new unit: model it in `models/` (brief first, `check()` empty), add it to `roster.py` and an entry in `data/units.json`,
then `tools/build_art.py <its key>`. `build_art.py` refuses when data and models disagree.

| Role | American | German |
|---|---|---|
| Scout | Jeep (Willys MB), driver and gunner aboard | Motorcycle and sidecar, rider and gunner aboard |
| Armoured car | M8 Greyhound | Sd.Kfz. 222 |
| Light tank | M5A1 Stuart | Panzer II Ausf. F |
| Medium tank | M4A3 Sherman (the engine's own blockout, unchanged) | Panzer IV Ausf. H |
| Anti-tank gun | 57 mm M1 + gunner, loader, commander | 7.5 cm Pak 40 + the same crew |
| Heavy tank | M26 Pershing | Panther Ausf. G |
| Line infantry | rifleman (M1 rifle), leader (Thompson) | rifleman (Kar98k), leader (MP40) |
| Engineers | flamethrower, sapper with shovel | the same roles |
| Mortar | 60 mm M2 + gunner, loader | 8 cm GrW 34 + gunner, loader |
| Machine gun | .30 cal on tripod + gunner, loader | MG 42 on Lafette + gunner, loader |
| Anti-tank infantry | rocket gunner (bazooka), loader | rocket gunner (Panzerschreck), loader |

### Second wave
| Role | American | German |
|---|---|---|
| Half-track (crew and riders aboard) | M3 half-track, .50 cal | Sd.Kfz. 251, shielded MG |
| Tank killer | M10 tank destroyer (turret) | StuG III G assault gun (no turret: one layer, the gun points where the hull points) |
| Truck | CCKW 2.5-ton, canvas tilt | Opel Blitz, open wooden bed with drums and crates |
| Tank | M24 Chaffee light tank | Tiger I heavy tank |
| Field howitzer | 105 mm M2A1 | 10.5 cm leFH 18 |
| Sniper | scoped rifle, netted helmet | scoped rifle, scrim cape |
| Light machine gunner | BAR | MG 42 on bipod |
| Assault trooper | airborne, M1 carbine | panzergrenadier, StG 44, camouflage smock |

Keys: `<side>_half_track`, `us_tank_destroyer`, `de_assault_gun`, `<side>_truck`, `us_light_tank_m24`, `de_heavy_tank_tiger`,
`<side>_howitzer`, `<side>_sniper`, `<side>_lmg`, `<side>_assault_trooper`. The howitzers take the anti-tank gun crew
(`at_gunner`, `at_loader`, `at_commander`; see `crew_layout.json`) and have no limbered state. These ten vehicles were built
with their detail in one pass (no separate grey blockout review), in `models/us_vehicles2.py` and `models/de_vehicles2.py`.

## Every unit key
Generated from `art/assets.json` by `python3 tools/list_units.py` (rerun it after an export). Layers: `L` hull / legs, `U` turret / torso, `F` an extra front layer where the engine adds one, `S` shadow.

| Key | Kind | What | Headings | Layers | Clips |
|---|---|---|---|---|---|
| `de_armoured_car` | vehicle | Sd.Kfz. 222 | 16 | L S U | idle, move, fire |
| `us_armoured_car` | vehicle | M8 Greyhound | 16 | L S U | idle, move, fire |
| `de_assault_gun` | vehicle | StuG III G | 16 | F S | idle, move, fire |
| `de_half_track` | vehicle | Sd.Kfz. 251 | 16 | F S | idle, move, fire |
| `us_half_track` | vehicle | M3 half-track | 16 | F S | idle, move, fire |
| `de_heavy_tank` | vehicle | Panther | 16 | L S U | idle, move, fire |
| `us_heavy_tank` | vehicle | M26 Pershing | 16 | L S U | idle, move, fire |
| `de_heavy_tank_tiger` | vehicle | Tiger I | 16 | L S U | idle, move, fire |
| `de_light_tank` | vehicle | Panzer II | 16 | L S U | idle, move, fire |
| `us_light_tank` | vehicle | M5A1 Stuart | 16 | L S U | idle, move, fire |
| `us_light_tank_m24` | vehicle | M24 Chaffee | 16 | L S U | idle, move, fire |
| `de_medium_tank` | vehicle | Panzer IV | 16 | L S U | idle, move, fire |
| `us_medium_tank` | vehicle | M4A3 Sherman | 16 | L S U | idle, move, fire |
| `de_scout` | vehicle | Motorcycle and sidecar | 16 | F S | idle, move, fire |
| `us_scout` | vehicle | Jeep (Willys MB) | 16 | F S | idle, move, fire |
| `us_tank_destroyer` | vehicle | M10 | 16 | L S U | idle, move, fire |
| `de_truck` | vehicle | Opel Blitz | 16 | F S | idle, move |
| `us_truck` | vehicle | CCKW 2.5-ton truck | 16 | F S | idle, move |
| `de_anti_tank_gun` | crew weapon | Pak 40 | 8 | F S | idle, move, fire |
| `us_anti_tank_gun` | crew weapon | 57 mm M1 | 8 | F S | idle, move, fire |
| `de_anti_tank_gun_limbered` | crew weapon | anti-tank gun, trails closed for moving | 8 | F S | idle, move |
| `us_anti_tank_gun_limbered` | crew weapon | anti-tank gun, trails closed for moving | 8 | F S | idle, move |
| `de_howitzer` | crew weapon | 10.5 cm leFH 18 | 8 | F S | idle, move, fire |
| `us_howitzer` | crew weapon | 105 mm M2A1 | 8 | F S | idle, move, fire |
| `de_mortar` | crew weapon | 8 cm mortar | 8 | F S | idle, move |
| `us_mortar` | crew weapon | 60 mm mortar M2 | 8 | F S | idle, move |
| `de_tripod_mg` | crew weapon | MG 42 on Lafette | 8 | F S | idle, move, fire |
| `us_tripod_mg` | crew weapon | .30 cal M1919A4 on M2 tripod | 8 | F S | idle, move, fire |
| `de_assault_trooper` | man | panzergrenadier, assault rifle | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_assault_trooper` | man | airborne trooper, carbine | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_at_commander` | man | anti-tank gun commander | 8 | L S U | idle |
| `us_at_commander` | man | anti-tank gun commander | 8 | L S U | idle |
| `de_at_gunner` | man | anti-tank gunner | 8 | L S U | idle, fire |
| `us_at_gunner` | man | anti-tank gunner | 8 | L S U | idle, fire |
| `de_at_loader` | man | anti-tank loader | 8 | L S U | idle, fire |
| `us_at_loader` | man | anti-tank loader | 8 | L S U | idle, fire |
| `de_baseplate_carrier` | man | mortar loader with the baseplate on his back | 8 | L S U | idle, walk, run, die |
| `us_baseplate_carrier` | man | mortar loader with the baseplate on his back | 8 | L S U | idle, walk, run, die |
| `de_flamethrower` | man | engineer, flamethrower | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_flamethrower` | man | engineer, flamethrower | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_leader` | man | leader, submachine gun | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_leader` | man | leader, submachine gun | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_lmg` | man | light machine gunner | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_lmg` | man | automatic rifleman | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_loader_bomb` | man | loader with mortar bomb | 8 | L S U | idle |
| `us_loader_bomb` | man | loader with mortar bomb | 8 | L S U | idle |
| `de_loader_box` | man | loader with ammunition box | 8 | L S U | idle |
| `us_loader_box` | man | loader with ammunition box | 8 | L S U | idle |
| `de_loader_rocket` | man | loader with rocket | 8 | L S U | idle |
| `us_loader_rocket` | man | loader with rocket | 8 | L S U | idle |
| `de_mg_carrier` | man | machine gunner carrying the gun | 8 | L S U | idle, walk, run, die |
| `us_mg_carrier` | man | machine gunner carrying the gun | 8 | L S U | idle, walk, run, die |
| `de_mg_gunner` | man | machine gunner (sits 30 behind the receiver) | 8 | L S U | idle, fire |
| `us_mg_gunner` | man | machine gunner (sits 30 behind the receiver) | 8 | L S U | idle, fire |
| `de_mortar_gunner` | man | mortar gunner (stands 20 behind, 26 left of the mortar) | 8 | L S U | idle, fire |
| `us_mortar_gunner` | man | mortar gunner (stands 20 behind, 26 left of the mortar) | 8 | L S U | idle, fire |
| `de_pusher` | man | man pushing a gun | 8 | L S U | idle, walk |
| `us_pusher` | man | man pushing a gun | 8 | L S U | idle, walk |
| `de_rifleman` | man | rifleman | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_rifleman` | man | rifleman | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_rocket_gunner` | man | rocket gunner | 8 | L S U | idle, walk, run, die, aim, fire |
| `us_rocket_gunner` | man | rocket gunner | 8 | L S U | idle, walk, run, die, aim, fire |
| `de_sapper` | man | engineer, shovel | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_sapper` | man | engineer, shovel | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_sniper` | man | sniper, scoped rifle | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `us_sniper` | man | sniper, scoped rifle | 8 | L S U | idle, walk, run, back, aim, fire, die |
| `de_tripod_carrier` | man | loader carrying the tripod | 8 | L S U | idle, walk, run, die |
| `us_tripod_carrier` | man | loader carrying the tripod | 8 | L S U | idle, walk, run, die |
| `de_tube_carrier` | man | mortar gunner carrying the tube | 8 | L S U | idle, walk, run, die |
| `us_tube_carrier` | man | mortar gunner carrying the tube | 8 | L S U | idle, walk, run, die |

## Models
- `models/kit.py`: shared builders (running gear with a continuous track, turrets on rings, axles, howitzer carriage); metres in, 55 units a metre.
- `models/us_vehicles.py`, `models/de_vehicles.py` (first wave), `models/us_vehicles2.py`, `models/de_vehicles2.py` (second): one function per vehicle; the brief is its docstring; returns an `artkit.machine.Machine`.
- `models/infantry.py`: helmets, kit, weapons, crew-served weapons (Machines), `trooper(side, weapon, kit)`, poses, vehicle crewmen.
- `models/dress.py`: each side's figure materials and hull paint.
- `models/roster.py`: every unit as the exporter sees it (rig + clips), `headings_for()`, where crews stand, `catalogue()`.

## What is in `art/assets.json`
- Keys: `<side>_<role>`: `us_scout`, `us_armoured_car`, `us_light_tank`, `us_medium_tank`, `us_anti_tank_gun`, `us_heavy_tank`,
  `us_tripod_mg`, `us_mortar`, `us_rifleman`, `us_leader`, `us_flamethrower`, `us_sapper`, `us_rocket_gunner`,
  `us_mortar_gunner`, `us_mg_gunner`, `us_loader_box`, `us_loader_bomb`, `us_loader_rocket`; the same with `de_`.
- Headings: everything that drives (scouts, armoured cars, half-tracks, trucks, tanks, tank destroyer, assault gun) has 16;
  the anti-tank guns, howitzers, mortars, tripod machine guns and all infantry have 8. Read `headings` from each entry, do not assume.
  `models/roster.py` `headings_for()` decides it. Turreted vehicles are two layers (hull `L`, turret `U` on the socket) plus shadow `S`: the turret aims on its own.
- Vehicle clips: `idle`, `move` (tracked: 6 frames, one track pitch per cycle, pick the frame by distance so tracks never slide), `fire` (gun recoils; muzzle point per frame).
- Walking men: `idle`, `walk`, `run`, `back`, `aim`, `fire`, `die` (legs and torso layers). Rocket gunner: `idle`, `walk`, `run`, `aim`, `fire`, `die`.
- Deployed crew (`mortar_gunner`, `mg_gunner`, `loader_*`, `at_gunner`, `at_loader`, `at_commander`): `idle` in place; gunners also `fire`; `at_loader`'s `fire` is his reload (round into the breech).
- Moving a crew weapon: `<side>_anti_tank_gun_limbered` (trails closed; `idle`, `move`) with two `<side>_pusher` (`idle`, `walk`) at the trail ends;
  the machine gun team walks as `mg_carrier` + `tripod_carrier`, the mortar team as `tube_carrier` + `baseplate_carrier` (`idle`, `walk`, `run`, `die`). No weapon sprite is drawn while they carry it.
- `art/crew_layout.json` (written by `layout.py`): for each crew weapon, who stands where, deployed and moving: x, y in units in the weapon's own frame
  (+x the way it faces, +y its left) from the weapon's ground anchor, and a heading relative to the weapon (multiples of 45, so a sprite exists at every weapon heading).
  Rotate the offset by the weapon's heading, add the man's relative heading to it, draw shadows first and sprites back to front. `preview_teams.py` does exactly this.

## What was checked
- `Machine.check()` is empty for all 22 vehicles, the 2 limbered guns and the 4 crew weapons, after the detail pass and with crews aboard.
- Looked at close, at play size, and as exported frames at every heading.
- The pinned engine (artkit at 724c9e7) reproduces the shipped art byte for byte (checked on a truck, a mortar, a rifleman and a loader).
- Infantry have no automatic check: judged by eye.

## Known gaps
- Materials are flat procedural stand-ins; no painted tiles, no national markings or decals.
- Open-topped turrets (M8, Sd.Kfz. 222) are closed. Suspension is one arm per wheel, no bogie brackets or leaf springs.
- Wheels do not spin in `move` (they are round, so it does not show; tread would).
- Set-up and pack-up are a swap, not an animation (no clip of the tripod being unfolded or the trails being spread). Crews are separate sprites, so a kneeling man can overlap a trail by a few pixels. No team-colour section in the pack.
- The StuG has no side skirts (they would hide the wheels); the M10 turret top is a dark plate, not a real opening.
- The pinned `artkit/preview.py` draws a wide top layer (a turret with a long gun) off its hull. The fix is on the engine's
  branch `fix-preview-top-layer`, not merged yet; re-pin after it is. `tools/preview_*.py` here never had the problem.
- Game: buildings are flat stand-ins (no models yet); battlegroups are structure only; no garrisons, transports, mines or
  off-map abilities yet; seven units fill CoH3 slots we have no art for (marked `standIn` in `game/src/data.js`).
