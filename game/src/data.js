/* Game data: factions, buildings, squads, vehicles, weapons.

   Numbers come from Company of Heroes 3 game data as listed on coh3stats.com (patch 3.0.1) wherever our art has a
   CoH3 counterpart. Units marked `standIn` have no CoH3 counterpart in that slot; their numbers are estimates sized
   to the slot they fill. Distances are metres, times seconds, rates per minute unless named otherwise.

   Weapon profile arrays are [near, mid, far] at the distances in `rng`. Accuracy is multiplied by the target's
   target size (infantry 1, team weapons 1.33 to 1.45, vehicles 10 to 20), so the same rule serves rifles and tank guns.
   Suppression is per second of fire, as a fraction of a squad's full scale (pinned at 0.65). */

/* Unit classes. Every squad has `cls` (infantry class) and every vehicle has `cls` (weight class). They carry no rules
   yet: they are the hook for later weapon damage and other mechanics (a weapon's damage or penetration against a class,
   crush rules, abilities that only hit some classes). Not a CoH3 system: CoH3 works from each unit's own armour and
   target size; these groups are this game's own design.
   Every weapon has a `type` (rifle, smg, assault, lmg, sniper, flamer, hmg, vehicle_mg, launcher, at_gun, tank_gun,
   autocannon, mortar) for the same purpose; `kind` stays the rule the combat code uses today. */
const DATA = (() => {
  const W = {
    /* ---- small arms ---- */
    garand:   { name: 'M1 Garand', type: 'rifle', dmg: 12, acc: [.68, .615, .35], rng: [7, 25, 35], rpm: [28.2, 20.6, 16.5], pen: [1.5, 1, 1], supp: .006, moveAcc: .75, kind: 'small' },
    thompson: { name: 'Thompson', type: 'smg', dmg: 3, acc: [.56, .55, .37], rng: [7, 25, 35], rpm: [149, 93, 66], pen: [1, 1, 1], supp: .004, moveAcc: .85, kind: 'small' },
    bar:      { name: 'M1918 BAR', type: 'lmg', dmg: 5.25, acc: [.6, .46, .42], rng: [7, 17, 35], rpm: [159, 139, 123], pen: [1.75, 1.5, 1.33], supp: .04, moveAcc: .75, kind: 'small' },
    greaseGun:{ name: 'M3 Grease Gun', type: 'smg', dmg: 4, acc: [.456, .265, .17], rng: [7, 15, 35], rpm: [220, 114, 30], pen: [1, 1, 1], supp: .004, moveAcc: .8, kind: 'small' },
    carbine:  { name: 'M1 Carbine', type: 'rifle', dmg: 10, acc: [.8, .6, .3], rng: [7, 20, 35], rpm: [33.2, 20.7, 15.1], pen: [1.5, 1, 1], supp: .004, moveAcc: .75, kind: 'small' },
    kar98:    { name: 'Kar98k', type: 'rifle', dmg: 14, acc: [.75, .69, .68], rng: [7, 25, 35], rpm: [17.6, 13.7, 13], pen: [1.5, 1, 1], supp: .006, moveAcc: .5, kind: 'small' },
    mp40:     { name: 'MP40', type: 'smg', dmg: 4, acc: [.495, .385, .15], rng: [7, 25, 35], rpm: [212, 165, 40], pen: [1, 1, 1], supp: .004, moveAcc: .8, kind: 'small' },
    mp44:     { name: 'StG 44', type: 'assault', dmg: 5, acc: [.75, .65, .3], rng: [7, 25, 35], rpm: [149, 122, 58], pen: [1, 1, 1], supp: .006, moveAcc: .75, kind: 'small' },
    mg42lmg:  { name: 'MG 42 LMG', type: 'lmg', dmg: 5, acc: [.55, .45, .38], rng: [7, 20, 35], rpm: [300, 250, 200], pen: [1.75, 1.5, 1.33], supp: .05, moveAcc: .5, kind: 'small' },
    springfield: { name: 'M1903 Springfield', type: 'sniper', dmg: 110, acc: [2, 2, 2], rng: [0, 25, 50], rpm: [7.25, 7.25, 7.25], pen: [1, 1, 1], supp: 0, aim: 1.625, noVehicles: true, kind: 'sniper' },
    g43:      { name: 'G43 scoped', type: 'sniper', dmg: 110, acc: [2, 2, 2], rng: [0, 25, 50], rpm: [7.05, 7.05, 7.05], pen: [1, 1, 1], supp: 0, aim: 1.625, noVehicles: true, kind: 'sniper' },
    flamer:   { name: 'Flamethrower', type: 'flamer', dmg: 2, acc: [1, 1, 1], rng: [0, 10, 20], rpm: [142, 142, 142], pen: [2.5, 2.5, 2.5], supp: .05, ignoresCover: true, kind: 'flame' },
    /* ---- machine guns ---- */
    m1919:    { name: '.30 cal M1919', type: 'hmg', dmg: 5, acc: [.748, .518, .396], rng: [10, 30, 45], rpm: [574, 402, 297], pen: [2.5, 2.25, 1.75], supp: .143, suppFar: .074, suppRadius: 15, setup: 3.5, teardown: 3, arc: 95, kind: 'mg' },
    mg42:     { name: 'MG 42', type: 'hmg', dmg: 4, acc: [.702, .506, .283], rng: [10, 25, 45], rpm: [890, 741, 630], pen: [2.25, 1.75, 1.6], supp: .171, suppFar: .121, suppRadius: 17.5, setup: 3.5, teardown: 3.16, arc: 110, kind: 'mg' },
    coax30:   { name: '.30 cal coaxial', type: 'vehicle_mg', dmg: 4, acc: [.7, .5, .45], rng: [7, 20, 35], rpm: [271, 235, 201], pen: [1, 1, 1], supp: .03, kind: 'small' },
    hull30:   { name: '.30 cal hull MG', type: 'vehicle_mg', dmg: 4, acc: [.7, .5, .45], rng: [7, 20, 35], rpm: [278, 257, 227], pen: [1, 1, 1], supp: .03, arc: 60, kind: 'small' },
    mg34coax: { name: 'MG 34 coaxial', type: 'vehicle_mg', dmg: 3, acc: [.6, .5, .4], rng: [7, 20, 35], rpm: [522, 450, 394], pen: [1, 1, 1], supp: .03, kind: 'small' },
    m8coax:   { name: '.30 cal coaxial', type: 'vehicle_mg', dmg: 4, acc: [.59, .46, .24], rng: [7, 20, 35], rpm: [271, 235, 201], pen: [1, 1, 1], supp: .03, kind: 'small' },
    m2hb:     { name: 'M2HB .50 cal', type: 'vehicle_mg', dmg: 9, acc: [.55, .45, .35], rng: [7, 20, 35], rpm: [209, 209, 209], pen: [4, 3, 2], supp: .05, kind: 'small' },
    jeep30:   { name: '.30 cal', type: 'vehicle_mg', dmg: 4.5, acc: [.54, .435, .396], rng: [7, 20, 35], rpm: [362, 279, 254], pen: [2.25, 2.15, 2], supp: .04, kind: 'small' },
    mg42ht:   { name: 'MG 42', type: 'vehicle_mg', dmg: 5, acc: [.51, .36, .31], rng: [7, 20, 35], rpm: [431, 414, 414], pen: [1, 1, 1], supp: .05, kind: 'small' },
    mg34car:  { name: 'MG 34', type: 'vehicle_mg', dmg: 3.6, acc: [.66, .55, .4], accNote: 'standIn 2026-11-24: falls off with range like every other MG (was .63/.66/.70, which made the scout car better than Grenadiers at 35 m)', rng: [7, 20, 35], rpm: [590, 520, 480], pen: [2, 1.75, 1.5], supp: .05, kind: 'small' },
    mg34bike: { name: 'MG 34', type: 'vehicle_mg', dmg: 3.6, acc: [.5, .4, .3], rng: [7, 20, 30], rpm: [500, 450, 400], pen: [2, 1.75, 1.5], supp: .04, arc: 70, kind: 'small', standIn: true },
    /* ---- anti-tank ---- */
    bazooka:  { name: 'M1A1 Bazooka', type: 'launcher', dmg: 60, acc: [.067, .05, .0363], rng: [10, 22.5, 35], rpm: [12.65, 12.31, 11.76], pen: [200, 125, 110], kind: 'at', infAcc: .2 },
    schreck:  { name: 'RPzB 54 Panzerschreck', type: 'launcher', dmg: 160, acc: [.067, .05, .0363], rng: [10, 22.5, 35], rpm: [11.3, 9.9, 9.5], pen: [300, 180, 130], kind: 'at', infAcc: .2 },
    gun57:    { name: '57 mm M1', type: 'at_gun', dmg: 160, acc: [.067, .05, .0463], rng: [15, 35, 60], rpm: [12, 12, 11.7], pen: [300, 150, 120], arc: 66, setup: 2.5, teardown: 1.75, kind: 'at', aoe: 1, infAcc: .3 },
    pak40:    { name: '7.5 cm Pak 40', type: 'at_gun', dmg: 160, acc: [.075, .05, .0463], rng: [15, 35, 60], rpm: [11.43, 11.43, 11.16], pen: [380, 260, 130], arc: 66, setup: 2.5, teardown: 1.75, kind: 'at', aoe: 1, infAcc: .3 },
    /* ---- vehicle guns ---- */
    sherman75:{ name: '75 mm M3', type: 'tank_gun', dmg: 120, acc: [.075, .0475, .04], rng: [15, 27.5, 40], rpm: [10, 10, 10], pen: [135, 123, 110], kind: 'cannon', aoe: 3.2, turret: true, aoeNote: 'standIn 2026-11-24: bigger HE burst (was 2.5) so the Sherman is the anti-infantry tank and the Panzer IV the anti-armour one' },
    pz4_75:   { name: '7.5 cm KwK 40', type: 'tank_gun', dmg: 120, acc: [.075, .0475, .045], rng: [15, 27.5, 40], rpm: [12, 12, 12], pen: [200, 170, 140], kind: 'cannon', aoe: 2.5, turret: true },
    stug75:   { name: '7.5 cm StuK 40', type: 'tank_gun', dmg: 120, acc: [.1, .05, .04], rng: [15, 27.5, 40], rpm: [13.33, 13.33, 13.33], pen: [250, 200, 180], kind: 'cannon', aoe: 2.5, arc: 24 },
    m8_37:    { name: '37 mm M6', type: 'tank_gun', dmg: 80, acc: [.075, .0475, .035], rng: [10, 25, 40], rpm: [13.15, 13.15, 13.15], pen: [55, 45, 40], kind: 'cannon', aoe: 1.5, turret: true },
    chaffee75:{ name: '75 mm M6', type: 'tank_gun', dmg: 120, acc: [.1, .05, .04], rng: [15, 27.5, 40], rpm: [12.63, 12.63, 12.63], pen: [120, 108, 95], kind: 'cannon', aoe: 1.8, turret: true, aoeNote: 'standIn 2026-11-24: smaller burst (was 2.5) so the Chaffee hunts light vehicles and the Sherman is the infantry killer' },
    m10_76:   { name: '3-inch M7', type: 'tank_gun', dmg: 160, acc: [.075, .05, .045], rng: [15, 30, 50], rpm: [10, 10, 10], pen: [200, 180, 160], kind: 'cannon', aoe: 1.5, turret: true, standIn: true },
    pz2_20:   { name: '2 cm KwK 30', type: 'autocannon', dmg: 18, acc: [.06, .045, .035], rng: [10, 25, 40], rpm: [60, 60, 60], pen: [45, 35, 28], kind: 'cannon', aoe: .8, turret: true, standIn: true },
    /* ---- indirect ---- */
    mortar81: { name: '81 mm mortar', type: 'mortar', dmg: 100, pen: [20, 20, 20], rng: [25, 40, 90], rpm: [5.58, 5.58, 5.58], minRange: 25, setup: 2.4, teardown: 1.9, flight: 3.125, kind: 'indirect', aoe: 3, scatter: [3, 6, 13] },
    mortar60: { name: '60 mm M2 mortar', type: 'mortar', dmg: 80, pen: [15, 15, 15], rng: [20, 35, 80], rpm: [7, 7, 7], minRange: 20, setup: 2.4, teardown: 1.9, flight: 2.8, kind: 'indirect', aoe: 2.6, scatter: [3, 6, 12], standIn: true },
    grw34:    { name: '8 cm GrW 34', type: 'mortar', dmg: 100, pen: [20, 20, 20], rng: [25, 40, 90], rpm: [5.58, 5.58, 5.58], minRange: 25, setup: 2.4, teardown: 1.9, flight: 3.125, kind: 'indirect', aoe: 3, scatter: [3, 6, 13] },
  };

  const CLASSES = {
    infantry: {
      light:  { name: 'Light infantry', about: 'Builders and team-weapon crews: support troops, lightly equipped.' },
      medium: { name: 'Line infantry', about: 'Mainline rifle and anti-tank squads.' },
      elite:  { name: 'Elite infantry', about: 'Veteran or specialist troops: Panzergrenadiers, snipers.' },
    },
    vehicle: {
      ultralight: { name: 'Ultra-light vehicle', about: 'Unarmoured: jeeps, motorcycles. Small arms hurt them.' },
      light:      { name: 'Light vehicle', about: 'Lightly armoured: half-tracks, scout and armoured cars, light tanks.' },
      medium:     { name: 'Medium vehicle', about: 'Medium tanks, assault guns and tank destroyers.' },
      heavy:      { name: 'Heavy vehicle', about: 'Heavy tanks and tank destroyers (none in the roster yet).' },
    },
  };

  /* Squads. models: one entry per soldier, in the order they die last-first (the leader is first). `sprite` keys are
     art keys without the side prefix. Crew weapons name their deployed weapon sprite and crew layout key. */
  const SQUADS = {
    us_engineers: { name: 'Engineer Squad', side: 'us', cls: 'light', role: 'Support Infantry / Repair / Defense Builder', glyph: 'wrench',
      cost: { mp: 180 }, pop: 4, time: 25, upkeep: 4, reinforce: 24, hp: 100, speed: 3.6, sight: 35, capture: 1,
      models: ['sapper', 'sapper', 'sapper', 'sapper'], weapons: ['greaseGun', 'greaseGun', 'greaseGun', 'greaseGun'],
      vet: [600, 1800, 3600], builder: true, repair: 8,
      upgrades: [{ id: 'flame', name: 'M2 Flamethrower', cost: { mu: 50 }, time: 20, swap: { index: 1, sprite: 'flamethrower', weapon: 'flamer' } }],
      abilities: [] },
    us_riflemen: { name: 'Riflemen Squad', side: 'us', cls: 'medium', role: 'Mainline Infantry / Anti-infantry', glyph: 'rifle',
      cost: { mp: 270 }, pop: 8, time: 20, upkeep: 12, reinforce: 30, hp: 95, speed: 3.6, sight: 35, capture: 1.25,
      models: ['leader', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman'], weapons: ['thompson', 'garand', 'garand', 'garand', 'garand', 'garand'],
      vet: [900, 2700, 5400], vetBonus: [{ rAcc: .9 }, { acc: 1.25, rof: 1.1 }, { hp: 15, rAcc: .8, rof: 1.25 }],
      // standIn 2026-11-24: Garand more accurate close (CoH3 .68 / .615 near / mid) so Riflemen win a close fight with Grenadiers and lose a long one
      weaponStats: { garand: { acc: [.8, .64, .35] } },
      upgrades: [{ id: 'bar', name: 'M1918 BAR', cost: { mu: 60 }, time: 30, swap: { index: 1, sprite: 'lmg', weapon: 'bar' } }],
      abilities: ['fragGrenade', 'breach', 'smokeGrenade'] },
    us_mortar: { name: 'M2 Mortar Team', side: 'us', cls: 'light', role: 'Team Weapon / Light Artillery', glyph: 'mortar', standIn: 'CoH3 fields the 81 mm M1; our art is the 60 mm M2',
      cost: { mp: 240 }, pop: 7, time: 25, upkeep: 7.2, reinforce: 28, hp: 80, speed: 3.6, sight: 35, targetSize: 1.33,
      models: ['tube_carrier', 'baseplate_carrier', 'rifleman', 'rifleman'], weapons: ['mortar60', null, 'carbine', 'carbine'],
      crewWeapon: 'mortar', vet: [400, 1200, 2400], abilities: ['barrage', 'smokeBarrage'] },
    us_hmg: { name: 'M1919 Machine Gun Team', side: 'us', cls: 'light', role: 'Team Weapon / Suppression', glyph: 'mg',
      cost: { mp: 240 }, pop: 7, time: 25, upkeep: 7, reinforce: 28, hp: 90, speed: 3.6, sight: 35, targetSize: 1.45,
      models: ['mg_carrier', 'tripod_carrier', 'rifleman', 'rifleman'], weapons: ['m1919', null, 'carbine', 'carbine'],
      crewWeapon: 'tripod_mg', setupRAcc: .8, vet: [700, 2100, 4200] },
    us_bazooka: { name: 'Bazooka Squad', side: 'us', cls: 'medium', role: 'Support Infantry / Anti-vehicle', glyph: 'rocket',
      cost: { mp: 250 }, pop: 7, time: 25, upkeep: 8.5, reinforce: 28, hp: 95, speed: 3.6, sight: 35,
      models: ['rocket_gunner', 'rifleman', 'rifleman', 'rifleman'], weapons: ['bazooka', 'carbine', 'carbine', 'carbine'],
      vet: [1000, 3000, 6000] },
    us_sniper: { name: 'Sniper', side: 'us', cls: 'elite', role: 'Infantry / Long-range anti-infantry', glyph: 'sniper',
      cost: { mp: 320 }, pop: 8, time: 30, upkeep: 14, reinforce: 160, hp: 100, speed: 3.6, sight: 42.5, targetSize: 1.33, capture: 1.33,
      models: ['sniper'], weapons: ['springfield'], vet: [900, 2700, 5400], camoInCover: true },
    us_at_gun: { name: 'M1 Anti-tank Gun Team', side: 'us', cls: 'light', role: 'Team Weapon / Anti-vehicle', glyph: 'atgun',
      cost: { mp: 270 }, pop: 8, time: 45, upkeep: 8, reinforce: 29, hp: 90, speed: 3.6, sight: 35, targetSize: 1.33,
      models: ['pusher', 'pusher', 'rifleman', 'rifleman'], weapons: ['gun57', null, 'carbine', 'carbine'],
      crewWeapon: 'anti_tank_gun', towed: true, vet: [1100, 3300, 6600] },

    de_pioneers: { name: 'Pioneer Squad', side: 'de', cls: 'light', role: 'Support Infantry / Repair / Defense Builder', glyph: 'wrench',
      cost: { mp: 125 }, pop: 4, time: 18, upkeep: 4.2, reinforce: 22, hp: 95, speed: 3.6, sight: 42, capture: 1,
      models: ['sapper', 'sapper', 'sapper'], weapons: ['mp40', 'mp40', 'mp40'],
      vet: [500, 1500, 3000], builder: true, repair: 8,
      upgrades: [{ id: 'flame', name: 'Flammenwerfer 35', cost: { mu: 50 }, time: 30, swap: { index: 1, sprite: 'flamethrower', weapon: 'flamer' } }],
      abilities: [] },
    de_grenadiers: { name: 'Grenadier Squad', side: 'de', cls: 'medium', role: 'Mainline Infantry / Long-range anti-infantry', glyph: 'rifle',
      cost: { mp: 250 }, pop: 7, time: 20.4, upkeep: 10.5, reinforce: 25, hp: 80, speed: 3.6, sight: 35, capture: 1.25,
      models: ['leader', 'rifleman', 'rifleman', 'rifleman', 'rifleman', 'rifleman'], weapons: ['mp40', 'kar98', 'kar98', 'kar98', 'kar98', 'kar98'],
      vet: [750, 2250, 4500], vetBonus: [{ rAcc: .9 }, { acc: 1.25 }, { hp: 20, acc: 1.15 }],
      upgrades: [{ id: 'lmg', name: 'MG 42 Light Machine Gun', cost: { mu: 60 }, time: 30, swap: { index: 1, sprite: 'lmg', weapon: 'mg42lmg' } }],
      abilities: ['stickGrenade', 'breach', 'smokeGrenade'] },
    de_hmg: { name: 'MG 42 Machine Gun Team', side: 'de', cls: 'light', role: 'Team Weapon / Suppression', glyph: 'mg',
      cost: { mp: 240 }, pop: 7, time: 20, upkeep: 7, reinforce: 28, hp: 90, speed: 3.6, sight: 35, targetSize: 1.45,
      models: ['mg_carrier', 'tripod_carrier', 'rifleman', 'rifleman'], weapons: ['mg42', null, 'mp40', 'mp40'],
      crewWeapon: 'tripod_mg', setupRAcc: .8, vet: [700, 2100, 4200] },
    de_mortar: { name: 'GrW 34 Mortar Team', side: 'de', cls: 'light', role: 'Team Weapon / Light Artillery', glyph: 'mortar',
      cost: { mp: 240 }, pop: 7, time: 25, upkeep: 7.2, reinforce: 28, hp: 80, speed: 3.6, sight: 35, targetSize: 1.33,
      models: ['tube_carrier', 'baseplate_carrier', 'rifleman', 'rifleman'], weapons: ['grw34', null, 'mp40', 'mp40'],
      crewWeapon: 'mortar', vet: [400, 1200, 2400], abilities: ['barrage', 'smokeBarrage'] },
    de_sniper: { name: 'Sniper', side: 'de', cls: 'elite', role: 'Infantry / Long-range anti-infantry', glyph: 'sniper',
      cost: { mp: 320 }, pop: 8, time: 30, upkeep: 14, reinforce: 160, hp: 100, speed: 3.6, sight: 42.5, targetSize: 1.33, capture: 1.33,
      models: ['sniper'], weapons: ['g43'], vet: [1200, 3600, 7200], camoInCover: true },
    de_schreck: { name: 'Panzerschreck Squad', side: 'de', cls: 'medium', role: 'Support Infantry / Anti-vehicle', glyph: 'rocket', standIn: 'fills the Jäger slot of the Luftwaffe Kompanie',
      cost: { mp: 260 }, pop: 7, time: 25, upkeep: 8.5, reinforce: 28, hp: 90, speed: 3.6, sight: 35,
      models: ['rocket_gunner', 'rifleman', 'rifleman', 'rifleman'], weapons: ['schreck', 'kar98', 'kar98', 'kar98'],
      vet: [1000, 3000, 6000] },
    de_panzergrenadiers: { name: 'Panzergrenadier Squad', side: 'de', cls: 'elite', role: 'Advanced Infantry / Anti-infantry', glyph: 'elite',
      cost: { mp: 340 }, pop: 8, time: 30, upkeep: 12, reinforce: 32.4, hp: 115, speed: 3.6, sight: 35, capture: 1.5,
      models: ['assault_trooper', 'assault_trooper', 'assault_trooper', 'assault_trooper', 'assault_trooper'], weapons: ['mp44', 'mp44', 'mp44', 'mp44', 'mp44'],
      vet: [1000, 3000, 6000], vetBonus: [{ rAcc: .85 }, { rAcc: .85, rof: 1.25 }, { hp: 15, acc: 1.3 }], abilities: ['bundledGrenade', 'breach'] },
    de_at_gun: { name: 'Pak 40 Anti-tank Gun Team', side: 'de', cls: 'light', role: 'Team Weapon / Anti-vehicle', glyph: 'atgun',
      cost: { mp: 280 }, pop: 8, time: 45, upkeep: 8, reinforce: 29, hp: 90, speed: 3.6, sight: 35, targetSize: 1.33,
      models: ['pusher', 'pusher', 'rifleman', 'rifleman'], weapons: ['pak40', null, 'mp40', 'mp40'],
      crewWeapon: 'anti_tank_gun', towed: true, vet: [1100, 3300, 6600] },
  };

  /* Each squad owns its guns. The keys in a squad's `weapons` and upgrade swaps are base profiles from W; below, every
     squad gets its own copy of each one as W['<squad>:<weapon>'] (with `base` and `squad` set), so one squad's Kar98k
     or MP40 can be tuned without touching another's. Put per-squad changes in the squad's `weaponStats`, e.g.
     weaponStats: { kar98: { acc: [.8, .7, .6] } }. Nothing is changed yet: every copy matches its base. */
  for (const [id, sq] of Object.entries(SQUADS)) {
    const own = k => {
      if (!k) return k;
      const key = id + ':' + k;
      if (!W[key]) W[key] = { ...W[k], ...((sq.weaponStats || {})[k] || {}), base: k, squad: id };
      return key;
    };
    sq.weapons = sq.weapons.map(own);
    for (const u of sq.upgrades || []) if (u.swap && u.swap.weapon) u.swap.weapon = own(u.swap.weapon);
  }

  /* Vehicles. armor = [front, side, rear]. `soft`: unarmoured or thin-skinned (critical threshold, can't crush cover). `turret` vehicles aim their main gun on their own. */
  const VEHICLES = {
    us_jeep: { name: '1/4-ton 4x4 Truck', side: 'us', cls: 'ultralight', art: 'us_scout', role: 'Light Vehicle / Recon', glyph: 'jeep',
      cost: { mp: 220 }, pop: 4, time: 30, upkeep: 4, hp: 200, armor: [4.5, 4.25, 2.75], targetSize: 10.6, speed: 9.75, accel: 8.75, rot: 70, sight: 37.5, capture: 1.5,   // capture: owner's decision 2026-11-24 (CoH3's jeep can't); same rate as the motorcycle, standIn
      weapons: ['jeep30'], vet: [600, 1800, 3600], length: 3.4, width: 1.6, soft: true },
    us_halftrack: { name: 'M3 Armored Personnel Carrier', side: 'us', cls: 'light', art: 'us_half_track', role: 'Light Vehicle / Transport', glyph: 'halftrack',
      cost: { mp: 240, fu: 35 }, pop: 6, time: 60, upkeep: 9, hp: 300, armor: [7.5, 7, 5], targetSize: 16, speed: 7.2, accel: 2.5, rot: 60, sight: 35,
      weapons: ['m2hb'], vet: [1200, 3600, 7200], length: 6.2, width: 2.2, reinforces: true, soft: true },
    us_m8: { name: 'M8 Greyhound Armored Car', side: 'us', cls: 'light', art: 'us_armoured_car', role: 'Light Vehicle / Anti-infantry', glyph: 'armoredcar',
      cost: { mp: 260, fu: 50 }, pop: 8, time: 20, upkeep: 12, hp: 360, armor: [40, 30, 20], targetSize: 18, speed: 6.75, accel: 4.5, rot: 60, sight: 35,
      weapons: ['m8_37', 'm8coax'], vet: [1100, 3300, 6600], length: 5, width: 2.5 },
    us_chaffee: { name: 'M24 Chaffee Light Tank', side: 'us', cls: 'light', art: 'us_light_tank_m24', role: 'Light Tank / Anti-light-vehicle', glyph: 'lighttank',
      cost: { mp: 270, fu: 60 }, pop: 9, time: 45, upkeep: 13.5, hp: 480, armor: [50, 37.5, 25], targetSize: 18, speed: 6.9, accel: 5, rot: 60, sight: 35,
      weapons: ['chaffee75', 'coax30', 'hull30'], vet: [1100, 3300, 6600], length: 5.5, width: 3 },
    us_sherman: { name: 'M4A3 Sherman Medium Tank', side: 'us', cls: 'medium', art: 'us_medium_tank', role: 'Medium Tank / Anti-infantry / Anti-vehicle', glyph: 'tank',
      cost: { mp: 340, fu: 90 }, pop: 12, time: 60, upkeep: 18, hp: 720, armor: [195, 100, 80], targetSize: 20, speed: 5.5, accel: 2.3, rot: 45, sight: 35,
      weapons: ['sherman75', 'coax30', 'hull30'], vet: [1800, 5400, 10800], length: 6, width: 3 },
    us_m10: { name: 'M10 Tank Destroyer', side: 'us', cls: 'medium', art: 'us_tank_destroyer', role: 'Tank Destroyer / Anti-vehicle', glyph: 'td', standIn: 'fills the M18 Hellcat slot of the Tank Depot',
      cost: { mp: 300, fu: 85 }, pop: 10, time: 50, upkeep: 15, hp: 560, armor: [100, 60, 40], targetSize: 19, speed: 5.5, accel: 2.5, rot: 40, sight: 35,
      weapons: ['m10_76'], vet: [1400, 4200, 8400], length: 6.8, width: 3 },

    de_bike: { name: 'Motorcycle and Sidecar', side: 'de', cls: 'ultralight', art: 'de_scout', role: 'Ultra-light Vehicle / Recon', glyph: 'jeep', standIn: 'fills the Kettenkrad slot of the HQ',
      cost: { mp: 160 }, pop: 2, time: 20, upkeep: 2, hp: 180, armor: [4, 3, 3], targetSize: 9, speed: 11.75, accel: 8.5, rot: 85, sight: 40, capture: 1.5,
      weapons: ['mg34bike'], vet: [500, 1500, 3000], length: 2.4, width: 1.6, soft: true },
    de_222: { name: 'Sd.Kfz. 222 Scout Car', side: 'de', cls: 'light', art: 'de_armoured_car', role: 'Light Vehicle / Anti-infantry', glyph: 'armoredcar',
      cost: { mp: 220, fu: 35 }, pop: 5, time: 30, upkeep: 7.5, hp: 240, armor: [12, 12, 10], targetSize: 16, speed: 8.4, accel: 6, rot: 66, sight: 45,
      weapons: ['mg34car'], vet: [900, 2700, 5400], length: 4.8, width: 2, soft: true },
    de_pz2: { name: 'Panzer II Light Tank', side: 'de', cls: 'light', art: 'de_light_tank', role: 'Light Tank / Anti-infantry', glyph: 'lighttank', standIn: 'fills the Marder III slot of the Luftwaffe Kompanie',
      cost: { mp: 240, fu: 45 }, pop: 7, time: 35, upkeep: 10, hp: 400, armor: [45, 35, 25], targetSize: 17, speed: 6.5, accel: 4, rot: 55, sight: 35,
      weapons: ['pz2_20', 'mg34coax'], vet: [1000, 3000, 6000], length: 4.8, width: 2.3 },
    de_251: { name: '251 Medium Carrier', side: 'de', cls: 'light', art: 'de_half_track', role: 'Light Vehicle / Transport', glyph: 'halftrack',
      cost: { mp: 220, fu: 30 }, pop: 6, time: 60, upkeep: 9, hp: 320, armor: [9.5, 9.5, 6], targetSize: 16, speed: 7.2, accel: 3, rot: 60, sight: 35,
      weapons: ['mg42ht'], vet: [900, 2700, 5400], length: 5.8, width: 2.1, reinforces: true, soft: true },
    de_stug: { name: 'StuG III G Assault Gun', side: 'de', cls: 'medium', art: 'de_assault_gun', role: 'Assault Gun / Anti-vehicle', glyph: 'td',
      cost: { mp: 300, fu: 80 }, pop: 10, time: 45, upkeep: 15, hp: 600, armor: [225, 135, 80], targetSize: 18, speed: 5, accel: 2.25, rot: 40, sight: 35,
      weapons: ['stug75'], vet: [1300, 3900, 7800], length: 6.8, width: 2.9 },
    de_pz4: { name: 'Panzer IV Medium Tank', side: 'de', cls: 'medium', art: 'de_medium_tank', role: 'Medium Tank / Anti-infantry / Anti-vehicle', glyph: 'tank',
      cost: { mp: 360, fu: 100 }, pop: 13, time: 60, upkeep: 19.5, hp: 720, armor: [170, 95, 70], targetSize: 20, speed: 5.25, accel: 2, rot: 42, sight: 35,
      weapons: ['pz4_75', 'mg34coax', 'mg34coax'], vet: [1800, 5400, 10800], length: 7, width: 3 },
  };

  /* Buildings. `req`: buildings that must stand first (any one of a list in an inner array). `produce`: unit ids.
     Size in metres (footprint w x d). CoH3 places them from the HQ (Wehrmacht) or by engineers (US); here both
     factions place from the engineers' build page and the HQ card shows each tier, as the reference boards do. */
  const BUILDINGS = {
    us_hq: { name: 'Headquarters', side: 'us', hp: 3000, size: [14, 10], glyph: 'house', produce: ['us_engineers'], reinforce: true, retreat: true },
    us_barracks: { name: 'Barracks', side: 'us', hp: 1500, size: [12, 9], glyph: 'infantry', cost: { mp: 120, fu: 15 }, time: 15, produce: ['us_riflemen', 'us_mortar', 'us_jeep'], reinforce: true, tab: 1 },
    us_wsc: { name: 'Weapon Support Center', side: 'us', hp: 1500, size: [12, 9], glyph: 'shield', cost: { mp: 100, fu: 15 }, time: 15, produce: ['us_hmg', 'us_bazooka', 'us_sniper', 'us_halftrack'], reinforce: true, tab: 2 },
    us_motorpool: { name: 'Motor Pool', side: 'us', hp: 2000, size: [14, 11], glyph: 'halftrack', cost: { mp: 200, fu: 40 }, time: 40, req: [['us_barracks', 'us_wsc']], produce: ['us_m8', 'us_at_gun', 'us_chaffee'], tab: 3 },
    us_depot: { name: 'Tank Depot', side: 'us', hp: 2000, size: [16, 12], glyph: 'tank', cost: { mp: 300, fu: 140 }, time: 80, req: ['us_motorpool'], produce: ['us_sherman', 'us_m10'], tab: 4 },

    de_hq: { name: 'Headquarters', side: 'de', hp: 3000, size: [14, 10], glyph: 'house', produce: ['de_pioneers', 'de_bike'], reinforce: true, retreat: true },
    de_infanterie: { name: 'Infanterie Kompanie', side: 'de', hp: 1500, size: [12, 9], glyph: 'infantry', cost: { mp: 80, fu: 15 }, time: 15, produce: ['de_grenadiers', 'de_hmg', 'de_mortar', 'de_sniper'], reinforce: true, tab: 1 },
    de_luftwaffe: { name: 'Luftwaffe Kompanie', side: 'de', hp: 1500, size: [12, 9], glyph: 'shield', cost: { mp: 150, fu: 50 }, time: 40, req: ['de_infanterie'], produce: ['de_schreck', 'de_222', 'de_pz2'], reinforce: true, tab: 2 },
    de_pzgren: { name: 'Panzergrenadier Kompanie', side: 'de', hp: 2000, size: [14, 10], glyph: 'halftrack', cost: { mp: 150, fu: 40 }, time: 40, req: ['de_infanterie'], produce: ['de_panzergrenadiers', 'de_251', 'de_at_gun', 'de_stug'], reinforce: true, tab: 3 },
    de_panzer: { name: 'Panzer Kompanie', side: 'de', hp: 2000, size: [16, 12], glyph: 'tank', cost: { mp: 300, fu: 135 }, time: 55, req: [['de_luftwaffe', 'de_pzgren']], produce: ['de_pz4'], tab: 4 },
  };

  /* Field defences any builder can lay. Free: build time only (CoH3: sandbags 6 s, wire 3 s, tank trap 9 s per piece). */
  const DEFENCES = {
    sandbags: { name: 'Sandbag Wall', time: 6, hp: 220, cover: 'heavy', len: 4, blocksVehicles: false, blocksInfantry: false, crushable: 'heavy' },
    wire:     { name: 'Barbed Wire', time: 3, hp: 120, cover: null, len: 4, blocksInfantry: true, crushable: 'any' },
    tanktrap: { name: 'Tank Trap', time: 9, hp: 750, cover: 'heavy', len: 2, blocksVehicles: true, blocksInfantry: false, crushable: null },
    /* Garrisonable fighting positions (coh3stats.com, Nov 2026): US Engineers' Fighting Position 100 mp, 15 s; German
       Pioneers' Fighting Nest 50 mp, 20 s. Either holds one infantry squad or an HMG team in heavy cover, and is
       neutral when empty (any side can take it). Health is a stand-in: CoH3's value isn't published. */
    us_position: { name: 'Fighting Position', side: 'us', point: true, cost: { mp: 100 }, time: 15, hp: 600, size: 3.6, art: 'position_us', standIn: 'health' },
    de_position: { name: 'Fighting Nest', side: 'de', point: true, cost: { mp: 50 }, time: 20, hp: 500, size: 3.6, art: 'position_de', standIn: 'health' },
  };

  const ABILITIES = {
    fragGrenade: { name: 'Mk 2 Frag Grenade', cost: { mu: 25 }, range: 20, cooldown: 30, dmg: 160, aoe: 4, fuse: 1.25, target: 'ground', icon: 'grenade' },
    stickGrenade: { name: 'Stick Grenade', cost: { mu: 30 }, range: 23, cooldown: 30, dmg: 160, aoe: 4, fuse: 1.5, target: 'ground', icon: 'grenade' },
    bundledGrenade: { name: 'Bundled Grenade', cost: { mu: 35 }, range: 20, minRange: 5, cooldown: 30, dmg: 160, aoe: 5, fuse: 1.5, target: 'ground', icon: 'grenade' },
    breach: { name: 'Breach', cost: { mu: 30 }, range: 0, cooldown: 30, target: 'house', icon: 'breach', standIn: 'CoH3 Breach: grenades through the door force the garrison out; cost and damage are estimates' },
    smokeGrenade: { name: 'Smoke Grenade', cost: { mu: 15 }, range: 25, cooldown: 40, dmg: 0, aoe: 0, fuse: 1, target: 'ground', icon: 'smoke', smoke: { radius: 6, life: 22 }, standIn: 'smoke screen for line infantry; cost and size are estimates' },
    smokeBarrage: { name: 'Smoke Barrage', cost: { mu: 15 }, range: 90, minRange: 25, cooldown: 45, shots: 3, target: 'ground', icon: 'smoke', smoke: { radius: 7.5, life: 28 }, standIn: 'mortar smoke rounds; cost and size are estimates' },
    barrage: { name: 'High-Explosive Barrage', cost: {}, range: 90, minRange: 25, cooldown: 20, shots: 6, target: 'ground', icon: 'barrage' },
  };

  const FACTIONS = {
    us: { name: 'US Forces', hq: 'us_hq', builder: 'us_engineers', buildings: ['us_barracks', 'us_wsc', 'us_motorpool', 'us_depot'], colour: '#5aa6ff' },
    de: { name: 'Wehrmacht', hq: 'de_hq', builder: 'de_pioneers', buildings: ['de_infanterie', 'de_luftwaffe', 'de_pzgren', 'de_panzer'], colour: '#ff6a5a' },
  };

  /* Cover: CoH3 lowers accuracy and damage against covered targets; suppression is shrugged off faster in cover.
     Heavy-cover damage penalty 40% (Relic, 2026 notes); the rest follow the series' long-standing values. */
  const COVER = {
    none:     { acc: 1, dmg: 1, supp: 1, recover: 1, colour: '#bfbfbf' },
    light:    { acc: .75, dmg: 1, supp: .5, recover: 2.5, colour: '#f2c94c' },
    heavy:    { acc: .5, dmg: .6, supp: .25, recover: 5, colour: '#5bd16a' },
    garrison: { acc: .5, dmg: .6, supp: .25, recover: 5, colour: '#5bd16a' },
    negative: { acc: 1.25, dmg: 1.25, supp: 1.5, recover: .5, colour: '#e05050' },
  };

  /* Match economy (per minute). Starting stock and base income as seen on the reference boards (fuel +6 base). */
  const ECON = {
    start: { mp: 390, mu: 25, fu: 15 }, sandboxStart: { mp: 10000, mu: 10000, fu: 10000 } /* standIn: test mode purse */, baseIncome: { mp: 275, mu: 0, fu: 6 }, popCap: 100,
    point: { standard: { mu: 4, fu: 2 }, munitions: { mu: 10, fu: 0 }, fuel: { mu: 0, fu: 8 }, victory: { mu: 3, fu: 1 } },
    captureTime: 20, vpStart: 500, vpDrainPerDiff: .2,
  };

  /* Suppression thresholds as in the CoH series (suppressed .2, pinned .6 to .65). It only recovers once the squad has
     not been shot at for recoverDelay seconds (series rule; the delay itself is a stand-in). */
  const SUPP = { suppressed: .2, pinned: .65, recover: .07, recoverDelay: 1.5, cap: 1, standIn: 'recover, recoverDelay' };

  return { CLASSES, W, SQUADS, VEHICLES, BUILDINGS, DEFENCES, ABILITIES, FACTIONS, COVER, ECON, SUPP };
})();
if (typeof module !== 'undefined') module.exports = DATA;
