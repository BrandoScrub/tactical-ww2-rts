# Rules for every chat and every AI model working on this game

The same text is in `CLAUDE.md` and `AGENTS.md`; change both together.

- **`artkit/` is the art engine, pinned.** Never edit it here. Change the engine in its own repository
  (BrandoScrub/Game-Engine-System-Design, which has its own rules), then `python3 tools/update_artkit.py <checkout>`;
  `python3 tools/update_artkit.py --verify` must pass before a commit.
- **Designing or reshaping a unit:** follow `artkit/DESIGN_METHOD.md`: a brief first (what it does, how it moves, is
  powered, built and serviced), references, mechanism before shell, scale from the table, big shapes first at play size,
  a grey blockout shown to the user before detail. Every part carries a one-line `why`. Vehicles and crew weapons are
  `artkit.machine.Machine`s and their `check()` must be empty (`python3 tools/check.py`).
- **`data/units.json` and `models/` must agree.** A new unit gets a model, a line in `models/roster.py` and a data entry;
  `tools/build_art.py` refuses otherwise. A unit's heading count comes from its data entry.
- **Art is committed.** After `tools/build_art.py`, look at the previews (`tools/preview_units.py art docs/previews`),
  refresh the README unit table (`tools/list_units.py`) if keys or clips changed, and commit `art/` with the change.
- **Game code lives in `game/`.** Numbers go in `game/src/data.js` with their source (CoH3 game data where a counterpart
  exists, `standIn` where not); `data/units.json` stays the art roster. Before a commit that touches `game/`:
  `node game/test/soak.js 8 18` prints `no problems`, and `game/test/flow.py de` and `game/test/mobile.py` print
  `no page errors` (serve the root on port 8765 first). Keep the PC and phone layouts both working.
- **Map buildings** (farmhouses) are `models/scenery.py`, exported by `python3 tools/build_scenery.py` into `art/scenery/` and
  `art/scenery.json` (apart from the unit art). A new house footprint in `game/src/map.js` needs a variant there and in
  `HOUSE_ART`; `node game/test/houses.js` must print `no problems`. Commit `art/scenery*` with the change.
- Before a commit: `python3 tools/check.py` prints `TOTAL 0`; `python3 tools/update_artkit.py --verify` passes.
