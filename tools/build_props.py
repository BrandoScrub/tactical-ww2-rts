"""Make the game's prop art: field defences and terrain pieces from models/defences.py and models/terrain.py, painted
with the WW2 tiles (styles/ww2/tiles), as sprite strips the game draws (game/src/render.js, drawProp).

  python3 tools/build_props.py            every prop
  python3 tools/build_props.py sandbag    only keys containing one of these words

Writes art/props/<key>.png (one frame per heading, side by side) and art/props.json:
  {"<key>": {"src": "props/<key>.png", "frame": [w, h], "anchor": [x, y], "headings": n, "span": 180 | 360,
             "len": metres (line pieces: the game repeats the piece every `len` metres along a cover line)}}
anchor: where the piece's origin (its centre on the ground) falls in each frame, in sprite pixels at scale 0.4
(1 game pixel at zoom 1: PXM 22 px a metre, the same scale as the unit art). Frame i shows the piece turned
i * span / headings degrees about z. Line pieces are the same seen from either side, so they turn through 180.
Every model's check() must be empty."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
import numpy as np
from PIL import Image, ImageEnhance
from artkit.style import Style
from artkit.sprite import picture
from artkit.export import keyed, KEY_TILES
from artkit.core.materials import Materials
from models.kit import M
from models import defences as D, terrain as T

OUT = os.path.join(ROOT, 'art')
SCALE = 0.4

# key: (make, headings, span, len)
PROPS = {
    # line pieces: make(length) builds a run three pieces long, centred; the middle piece is cut out of its picture
    'sandbags':      (lambda L: D.sandbag_wall(L, module=True), 16, 180, 1.0),
    'wire_us':       (lambda L: D.wire_concertina(L, module=True), 16, 180, 2.0),
    'wire_de':       (lambda L: D.wire_knife_rest(L, module=True, bay=4 / 3), 16, 180, 4 / 3),
    'wall':          (lambda L: T.stone_wall(L, module=True), 16, 180, 1.0),
    'hedge':         (lambda L: T.hedgerow(L, seed=2, module=True), 16, 180, 1.0),
    'hedge_b':       (lambda L: T.hedgerow(L, seed=9, module=True), 16, 180, 1.0),
    'tanktrap_0':    (lambda: D.tank_trap(seed=3), 1, 360, 0),
    'tanktrap_1':    (lambda: D.tank_trap(seed=4), 1, 360, 0),
    'tanktrap_2':    (lambda: D.tank_trap(seed=5), 1, 360, 0),
    # fighting positions come as a back half and a front half, so men in them sort between the two
    'position_us':   (D.fighting_position_us, 8, 360, 'split'),
    'position_de':   (D.fighting_nest_de, 8, 360, 'split'),
    'olive_0':       (lambda: T.olive(seed=3), 1, 360, 0),
    'olive_1':       (lambda: T.olive(seed=11), 1, 360, 0),
    'olive_2':       (lambda: T.olive(seed=17), 1, 360, 0),
    'olive_3':       (lambda: T.olive(seed=23), 1, 360, 0),
    'cypress_0':     (lambda: T.cypress(h=10.0), 1, 360, 0),
    'cypress_1':     (lambda: T.cypress(h=8.5), 1, 360, 0),
    'outcrop_0':     (lambda: T.outcrop(4.0, seed=6), 1, 360, 0),
    'outcrop_1':     (lambda: T.outcrop(3.2, seed=13), 1, 360, 0),
}


def materials(style):
    """The style's tiles plus the few these props need that are made from them."""
    m = style.materials()
    t = m.tiles
    def grade(name, sat=1.0, bright=1.0, mul=(1, 1, 1)):
        im = t[name].convert('RGB')
        im = ImageEnhance.Brightness(ImageEnhance.Color(im).enhance(sat)).enhance(bright)
        a = np.asarray(im).astype(np.float32) * np.array(mul, np.float32)
        return Image.fromarray(a.clip(0, 255).astype(np.uint8))
    t['earth'] = t['ground_dirt']
    t['bark'] = grade('timber', .7, .85)
    t['wire'] = grade('steel', .4, .45)
    t['field_stone'] = t['stone_rough']
    t['foliage_olive'] = grade('hedge_foliage', .45, 1.25, (1.0, 1.02, .98))     # olive leaves: grey-green, silvery
    t['foliage_dark'] = grade('hedge_foliage', .7, .62, (.9, 1.0, .95))          # cypress: dense, dark, cooler
    t['limestone'] = grade('stone_rough', .35, 1.55)
    t['opening'] = Image.new('RGB', (8, 8), (44, 40, 34))
    m.cache.clear()
    return m


KEYS = Materials(tiles={k: Image.new('RGBA', (8, 8), v) for k, v in KEY_TILES.items()})


def piece_of(g, ln):
    """Which piece (-1, 0, +1) of a three-piece run each triangle belongs to. Whole small objects (a bag, a stone, a clump of
    leaves) go with the piece their centre is in, so none is sliced; long ones (a wire coil, a strand) by triangle."""
    n = len(g.P); V = np.round(g.P.reshape(-1, 3), 2)
    _, inv = np.unique(V, axis=0, return_inverse=True); inv = inv.reshape(n, 3)
    par = np.arange(inv.max() + 1)
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for t in inv:
        r0 = find(t[0])
        for v in t[1:]:
            r = find(v)
            if r != r0: par[r] = r0
    comp = np.array([find(t[0]) for t in inv])
    x = g.P.mean(1)[:, 0] / M; out = np.zeros(n, int)
    which = lambda c: np.where(c < -ln / 2 - 1e-6, -1, np.where(c < ln / 2 - 1e-6, 0, 1))
    for c in np.unique(comp):
        sel = comp == c; xs = g.P[sel][..., 0] / M
        out[sel] = which((xs.max() + xs.min()) / 2) if xs.max() - xs.min() <= ln * 1.2 else which(x[sel])
    return out


def keyed_cut(gr, sel, style, mats):
    """(picture, origin, mask): mask = the pixels showing the triangles in sel, with their outline ink."""
    img, meta = picture(gr, style, scale=SCALE, mats=mats)
    kim, kmeta = picture(keyed(gr, sel), style, scale=SCALE, ink_emit=True, mats=KEYS)
    assert kmeta['origin'] == meta['origin'] and kim.size == img.size
    k = np.asarray(kim).astype(int)
    plate = (k[..., 0] > 150) & (k[..., 1] < 100) & (k[..., 2] > 150)
    rest = (k[..., 1] > 150) & (k[..., 0] < 100)
    grow = plate.copy()
    for _ in range(3):
        g2 = grow.copy(); g2[1:] |= grow[:-1]; g2[:-1] |= grow[1:]; g2[:, 1:] |= grow[:, :-1]; g2[:, :-1] |= grow[:, 1:]
        grow = g2 & ~rest
    return np.asarray(img), meta['origin'], grow


def split_halves(g, deg, style, mats):
    """A fighting position turned deg: its far half (behind the centre as the camera sees it) and its near half."""
    gr = g.rz(deg); c = gr.P.mean(1)
    img, o, back = keyed_cut(gr, (c[:, 0] + c[:, 1]) < 0, style, mats)
    b = img.copy(); b[~back] = 0
    f = img.copy(); f[back] = 0
    return (b, o), (f, o)


def cut_middle(g, ln, deg, style, mats, piece=None):
    """A line piece's picture with no outline where it meets its neighbours: the run is drawn three pieces long, then a
    keyed render (the middle piece one flat colour, the rest another) says which pixels are the middle piece. Its
    outline ink is kept by growing the key into ink pixels that are not the neighbours'."""
    piece = piece_of(g, ln) if piece is None else piece
    mid = piece == 0
    gr = g.rz(deg)
    img, meta = picture(gr, style, scale=SCALE, mats=mats)
    kim, kmeta = picture(keyed(gr, mid), style, scale=SCALE, ink_emit=True, mats=KEYS)
    assert kmeta['origin'] == meta['origin'] and kim.size == img.size
    k = np.asarray(kim).astype(int)
    plate = (k[..., 0] > 150) & (k[..., 1] < 100) & (k[..., 2] > 150)
    rest = (k[..., 1] > 150) & (k[..., 0] < 100)
    grow = plate.copy()
    for _ in range(3):                                                     # ink lines are up to ~3 px wide here
        g2 = grow.copy(); g2[1:] |= grow[:-1]; g2[:-1] |= grow[1:]; g2[:, 1:] |= grow[:, :-1]; g2[:, :-1] |= grow[:, 1:]
        grow = g2 & ~rest
    a = np.asarray(img).copy(); a[~grow] = 0
    return a, meta['origin']


def render(key, make, headings, span, style, mats, ln=0):
    if ln == 'split':
        asm = make(); issues = asm.check()
        if issues: sys.exit(f'{key}: check() is not empty: {issues[:3]}')
        g = asm.geometry(); halves = [split_halves(g, i * span / headings, style, mats) for i in range(headings)]
        rec = strip(key + '_back', [h[0] for h in halves], headings, span)
        rec['front'] = strip(key + '_front', [h[1] for h in halves], headings, span)
        return rec
    asm = make(3 * ln) if ln else make()
    issues = asm.check()
    if issues: sys.exit(f'{key}: check() is not empty: {issues[:3]}')
    g = asm.geometry()
    if ln:
        # four kinds of piece: inside a run (neighbours both sides), first, last, and a run of one; each cut from a
        # run with only the neighbours it really has, so the open end is drawn whole
        pc = piece_of(g, ln); recs = {}
        for name, keep in (('mid', (-1, 0, 1)), ('first', (0, 1)), ('last', (-1, 0)), ('solo', (0,))):
            sel = np.isin(pc, keep); gs = g.take(np.nonzero(sel)[0])
            frames = [cut_middle(gs, ln, i * span / headings, style, mats, pc[sel]) for i in range(headings)]
            recs[name] = strip(f'{key}_{name}' if name != 'mid' else key, frames, headings, span)
        rec = recs.pop('mid'); rec['ends'] = recs
        return rec
    frames = []
    for i in range(headings):
        img, meta = picture(g.rz(i * span / headings), style, scale=SCALE, mats=mats)
        frames.append((np.asarray(img), meta['origin']))
    return strip(key, frames, headings, span)


def strip(key, frames, headings, span):
    # align on the origin, then crop every frame to the union of what they cover
    ox = max(int(round(o[0])) for _, o in frames); oy = max(int(round(o[1])) for _, o in frames)
    W = ox + max(a.shape[1] - int(round(o[0])) for a, o in frames); H = oy + max(a.shape[0] - int(round(o[1])) for a, o in frames)
    canv = []
    for a, o in frames:
        c = np.zeros((H, W, 4), np.uint8); x, y = ox - int(round(o[0])), oy - int(round(o[1]))
        c[y:y + a.shape[0], x:x + a.shape[1]] = a; canv.append(c)
    al = np.max([c[..., 3] for c in canv], 0); ys, xs = np.nonzero(al)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    strip = np.concatenate([c[y0:y1, x0:x1] for c in canv], 1)
    os.makedirs(os.path.join(OUT, 'props'), exist_ok=True)
    Image.fromarray(strip, 'RGBA').save(os.path.join(OUT, 'props', key + '.png'), optimize=True)
    return {'src': f'props/{key}.png', 'frame': [int(x1 - x0), int(y1 - y0)], 'anchor': [ox - int(x0), oy - int(y0)],
            'headings': headings, 'span': span}


def main(args):
    style = Style.load(os.path.join(ROOT, 'styles', 'ww2')); mats = materials(style)
    path = os.path.join(OUT, 'props.json')
    out = json.load(open(path)) if os.path.exists(path) and args else {}
    keys = [k for k in PROPS if not args or any(a in k for a in args)]
    for k in keys:
        make, n, span, ln = PROPS[k]
        rec = render(k, make, n, span, style, mats, ln)
        if ln and ln != 'split': rec['len'] = round(ln, 4)
        out[k] = rec; print(f'  {k}: {n} headings, frame {rec["frame"]}', flush=True)
    out = {k: out[k] for k in PROPS if k in out}
    json.dump(out, open(path, 'w'), indent=1)
    print(f'art/props.json: {len(out)} props')


if __name__ == '__main__':
    main(sys.argv[1:])
