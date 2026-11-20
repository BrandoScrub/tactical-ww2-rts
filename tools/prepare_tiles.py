"""Prepare painted tiles: raw image-model output in styles/ww2/incoming/ -> finished seamless tiles.

    python3 tools/prepare_tiles.py            # every texture in RECIPES
    python3 tools/prepare_tiles.py wall_stone # just these
    python3 tools/prepare_tiles.py --game     # only refresh art/materials/ (the tiles the game paints itself)

Writes styles/ww2/tiles/<name>.jpg (1024 px source; the art pipeline loads these as materials) and, for ground
tiles, art/ground/<name>.jpg (512 px, what the game's map painter loads); for GAME_TILES, art/materials/<name>.jpg
(256 px: houses, cover and crates the game draws itself). Then prints each tile's seam score.

Each recipe is a list of steps, applied in order:
  ('rows', y0, y1)   keep whole rows/courses/boards only: the band y0..y1 (centres of two joint lines), cropped
                     square from the middle, so the tile repeats top to bottom on a joint
  ('hue', deg)       rotate hue            ('sat', k)   scale saturation          ('gain', k)  scale brightness
  ('mean', rgb)      scale each channel so the tile's average is exactly rgb (matches the old procedural colour)
  ('grey', k)        pull toward neutral grey at the same brightness (k=1: fully grey)
  ('gaps', k)        darken the darkest quarter (mortar gaps, joints) by k
  ('soften', r)      Gaussian blur radius r px at 1024 (fine regular weaves shimmer when shrunk to unit size)
  ('seam', 'xy')     blend each edge band with the half-shifted tile so it wraps without a visible seam;
                     'x' only for rows/boards (keeps rows aligned); contrast-preserving
  ('from', name, k, char)  build from another processed tile: darken by k, mix in char (charred) at that strength;
                     any further steps then apply to the result
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN, OUT, GROUND, GAME = (os.path.join(ROOT, p) for p in ('styles/ww2/incoming', 'styles/ww2/tiles', 'art/ground', 'art/materials'))
N = 1024

# materials the game itself paints (houses, cover, crates): written to art/materials/<name>.jpg at 256 px
GAME_TILES = {'wall_stucco', 'wall_stone', 'stone_dressed', 'roof_tile', 'charred', 'shutter', 'timber', 'sandbag',
              'field_wall', 'hedge_foliage', 'planks', 'rubble', 'steel'}
GROUND_TILES = {'ground_green_grass', 'field_wheat', 'ground_olive_grove', 'crater_earth'}

RECIPES = {
    # ground (6 m a tile)
    'ground_green_grass': [('hue', 12), ('seam', 'xy')],          # delivered too yellow: reads brown over dry grass
    'field_wheat':        [('sat', 1.06), ('gain', 1.02), ('seam', 'xy')],   # a little more golden than stubble
    'ground_olive_grove': [('sat', .8), ('seam', 'xy')],          # orange glowed hotter than the rest of the map
    'crater_earth':       [('seam', 'xy')],
    # farmhouse
    'wall_stucco':   [('sat', .75), ('seam', 'xy')],
    'wall_stone':    [('sat', .72), ('grey', .15), ('seam', 'xy')],     # apart from stucco: greyer
    'stone_dressed': [('rows', 120, 1213), ('seam', 'x')],              # 9 whole courses
    'stone_rough':   [('seam', 'xy')],
    'roof_tile':     [],                                                # 8 x 16 tiles, already repeats cleanly
    'roof_ridge':    [('from', 'roof_tile', 1.0, 0)],                   # the ridge cap reuses the roof tiles
    'shutter':       [('rows', 80, 1239), ('seam', 'x')],               # 14 whole slats
    'timber':        [('seam', 'xy')],
    'rubble':        [('sat', .7), ('grey', .1), ('gain', .97), ('seam', 'xy')],   # was the colour of ground_dirt
    'charred':       [('seam', 'xy')],
    'timber_charred': [('from', 'timber', .45, .35)],
    'wood':          [('from', 'timber', 1.0, 0), ('mean', (112, 74, 44))],   # unit woodwork (gun trails, stowage, truck beds)
    # cover and props
    'sandbag':       [('sat', .8), ('soften', .9), ('seam', 'xy')],
    'field_wall':    [('sat', .75), ('grey', .12), ('gaps', .3), ('seam', 'xy')],
    'hedge_foliage': [('hue', 5), ('seam', 'xy')],
    'planks':        [('rows', 151, 1183), ('seam', 'x')],              # 6 whole boards
    # vehicles and men: the averages of the procedural stand-ins in style.json, so units keep their colours
    'us_hull':   [('mean', (98, 104, 64)), ('seam', 'xy')],
    'de_hull':   [('mean', (184, 158, 104)), ('seam', 'xy')],
    'steel':     [('mean', (70, 72, 66)), ('seam', 'xy')],
    'rubber':    [('mean', (42, 41, 40)), ('seam', 'xy')],
    'us_canvas': [('mean', (136, 128, 86)), ('seam', 'xy')],
    'de_canvas': [('mean', (126, 122, 98)), ('seam', 'xy')],
    'wool':      [('grey', 1.0), ('soften', .8), ('seam', 'xy')],
    'leather':   [('sat', .82), ('seam', 'xy')],
}


def to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0); gc = np.where(m, (mx - g) / np.where(m, d, 1), 0); bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = np.where(m, (h / 6) % 1, 0)
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return np.stack([h, s, mx], -1)


def from_hsv(x):
    h, s, v = x[..., 0], x[..., 1], x[..., 2]
    i = np.floor(h * 6).astype(int) % 6; f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    ch = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    out = np.zeros(x.shape)
    for k, (r, g, b) in enumerate(ch):
        m = i == k
        out[..., 0][m], out[..., 1][m], out[..., 2][m] = r[m], g[m], b[m]
    return out


def lum(a): return a[..., 0] * .299 + a[..., 1] * .587 + a[..., 2] * .114


def seam(a, axes):
    """Blend an edge band with the tile shifted by half, so opposite edges meet; keeps contrast in the band."""
    for ax in ('y', 'x'):
        if ax not in axes: continue
        n = a.shape[0 if ax == 'y' else 1]; band = n // 9
        s = np.roll(a, n // 2, axis=0 if ax == 'y' else 1)
        t = np.arange(n, dtype=float); d = np.minimum(t, n - 1 - t)
        w = np.clip(1 - d / band, 0, 1); w = .5 - .5 * np.cos(np.pi * w)          # 1 at the edge, 0 inside the band
        w = w[:, None, None] if ax == 'y' else w[None, :, None]
        mu = a.mean((0, 1))
        mix = mu + ((a - mu) * (1 - w) + (s - mu) * w) / np.sqrt((1 - w) ** 2 + w ** 2)
        a = mix
    return a


def process(name, done):
    steps = RECIPES[name]
    if steps and steps[0][0] == 'from':
        _, src, k, char = steps[0]
        a = done[src] * k * (1 - char) + done['charred'] * char
        if len(steps) == 1: return np.clip(a, 0, 255)
        steps = steps[1:]                                            # further steps apply to the derived tile
    else:
        im = Image.open(os.path.join(IN, name + '.png' if os.path.exists(os.path.join(IN, name + '.png')) else name + '.jpg')).convert('RGB')
        a = np.asarray(im, float)
    for st in steps:
        op = st[0]
        if op == 'rows':
            y0, y1 = st[1], st[2]; h = y1 - y0; x0 = (a.shape[1] - h) // 2
            a = a[y0:y1, x0:x0 + h]
        elif op == 'hue':
            x = to_hsv(a / 255); x[..., 0] = (x[..., 0] + st[1] / 360) % 1; a = from_hsv(x) * 255
        elif op == 'sat':
            x = to_hsv(a / 255); x[..., 1] = np.clip(x[..., 1] * st[1], 0, 1); a = from_hsv(x) * 255
        elif op == 'gain':
            a = a * st[1]
        elif op == 'mean':
            a = a * (np.array(st[1], float) / a.mean((0, 1)))
        elif op == 'grey':
            L = lum(a)[..., None]; a = a * (1 - st[1]) + L * st[1]
        elif op == 'gaps':
            L = lum(a); q = np.percentile(L, 25); m = np.clip((q - L) / q * 3, 0, 1)[..., None]
            a = a * (1 - st[1] * m)
        elif op == 'soften':
            a = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((N, N), Image.LANCZOS)
                           .filter(ImageFilter.GaussianBlur(st[1])), float)
        elif op == 'seam':
            a = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((N, N), Image.LANCZOS), float)
            a = seam(a, st[1])
    a = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((N, N), Image.LANCZOS), float)
    return np.clip(a, 0, 255)


def seam_score(a):
    L = lum(a)
    inner = (np.abs(np.diff(L, axis=1)).mean() + np.abs(np.diff(L, axis=0)).mean()) / 2
    return np.abs(L[:, 0] - L[:, -1]).mean() / inner, np.abs(L[0] - L[-1]).mean() / inner


def game_copy(n):
    os.makedirs(GAME, exist_ok=True)
    Image.open(os.path.join(OUT, n + '.jpg')).resize((256, 256), Image.LANCZOS).save(os.path.join(GAME, n + '.jpg'), quality=88)


def main(names):
    if names == ['--game']:                       # just refresh art/materials/ from the finished tiles
        for n in sorted(GAME_TILES): game_copy(n)
        return print(f'{len(GAME_TILES)} game materials written to art/materials/')
    names = names or list(RECIPES)
    done = {}
    order = sorted(names, key=lambda n: RECIPES[n][:1] == [] or RECIPES[n][0][0] == 'from')
    for n in order:
        for dep in ([RECIPES[n][0][1], 'charred'] if RECIPES[n] and RECIPES[n][0][0] == 'from' else []):
            if dep not in done:
                done[dep] = process(dep, done)
        a = done[n] = process(n, done)
        im = Image.fromarray(a.astype(np.uint8))
        im.save(os.path.join(OUT, n + '.jpg'), quality=92)
        if n in GROUND_TILES: im.resize((512, 512), Image.LANCZOS).save(os.path.join(GROUND, n + '.jpg'), quality=88)
        if n in GAME_TILES: game_copy(n)
        sx, sy = seam_score(a)
        print(f'{n:16s} mean {[int(v) for v in a.mean((0, 1))]}  seam x{sx:.2f} y{sy:.2f}' + ('  ground' if n in GROUND_TILES else ''))


if __name__ == '__main__':
    main(sys.argv[1:])
