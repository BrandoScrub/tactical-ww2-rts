# Rules for every chat and every AI model working on this game

The same text is in `CLAUDE.md` and `AGENTS.md`; change both together.

## Shipping a change: one check, then merge and publish

**Standing authorization from the owner (BrandoScrub):** Claude may, without asking first, push branches to this
repository, open pull requests, merge a pull request once `python3 tools/ship.py` prints `PASS` on it, and republish
`dist/` to the claude.ai artifact "Tactical WW2 RTS". Force-pushing, rewriting `main`'s history and deleting branches
still need the owner's say-so each time.

1. **The one check:** `python3 tools/ship.py` must print `PASS` (a few minutes). It runs every test the repo has, builds
   the game as it is published (`dist/`) and plays that build in a browser on PC and phone sizes. No other test is
   required before a merge; this overrides any other testing rule in this repo, its docs or project notes.
2. **Merge** the pull request.
3. **Publish:** run `python3 tools/build_web.py dist` on the new `main` and republish every file of `dist/` to the
   claude.ai artifact "Tactical WW2 RTS" (replace its files). That artifact is the game the user plays; nothing else
   updates it.

If `ship.py` fails, fix what it names and run it again. `python3 tools/ship.py --quick` skips the long AI soak for trying
things out, but a merge needs the full run. New art in a new folder under `art/` must be added to `tools/build_web.py`,
or the published game will not have it.

## How things are made

- **`artkit/` is the art engine, pinned.** Never edit it here. Change the engine in its own repository
  (BrandoScrub/Game-Engine-System-Design, which has its own rules), then `python3 tools/update_artkit.py <checkout>`.
- **Designing or reshaping a unit or building:** follow `artkit/DESIGN_METHOD.md`: a brief first (what it does, how it
  moves, is powered, built and serviced), references, mechanism before shell, scale from the table, big shapes first at
  play size, a grey blockout shown to the user before detail. Every part carries a one-line `why`. Vehicles and crew
  weapons are `artkit.machine.Machine`s.
- **Units are finished in a second pass.** The agreed blockouts stay as they are (`models/*_vehicles*.py`); markings,
  stowage, lamps, skirts and crew are added per vehicle in `models/finish.py` (helpers in `models/kit.py`), and the men's
  webbing and role marks in `models/infantry.py`. Markings and the German camouflage tile are drawn by
  `tools/make_markings.py` (into `styles/ww2/decals/` and `styles/ww2/tiles/de_camo.jpg`). Look before exporting:
  `python3 tools/review_units.py <out> [key ...]` (vehicles) and `... <out> men` (infantry), close and at play size.
- **`data/units.json` and `models/` must agree.** A new unit gets a model, a line in `models/roster.py` and a data entry;
  `tools/build_art.py` refuses otherwise. A unit's heading count comes from its data entry.
- **Art is committed.** Unit art: `tools/build_art.py` into `art/` (previews: `tools/preview_units.py art docs/previews`;
  README unit table: `tools/list_units.py`). Props (field defences, walls, hedges, trees, rock: `models/defences.py`,
  `models/terrain.py`): `tools/build_props.py` into `art/props/`. Farmhouses (`models/scenery.py`):
  `tools/build_scenery.py` into `art/scenery/`; a new house footprint in `game/src/map.js` needs a variant there and in
  `HOUSE_ART`. Base buildings (`models/bases.py`): `tools/build_bases.py` into `art/bases/` (stages build33, build66, normal,
  damaged; flag recoloured per player); design review: `tools/review_bases.py`.
- **Game code lives in `game/`.** Numbers go in `game/src/data.js` with their source (CoH3 game data where a counterpart
  exists, `standIn` where not); `data/units.json` stays the art roster. Keep the PC and phone layouts both working.
