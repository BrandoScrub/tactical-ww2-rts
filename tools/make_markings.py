"""Markings and paint the unit models wear, drawn here so they can be redone: python3 tools/make_markings.py
Writes styles/ww2/decals/*.png (national markings, numbers, glass, grilles: stretched over one face each) and
styles/ww2/tiles/de_camo.jpg (the German three-colour scheme: the painted de_hull tile with sprayed olive-green and
red-brown bands). Sources: US Army AR 850-5 (white star, sizes by surface); German 1943 order (dark yellow base,
olive green and red-brown applied by the unit, soft sprayed edges); Balkenkreuz and turret numbers as on 1944 vehicles.
Aircraft (air()): the US star-and-bar of August 1943; Luftwaffe Mediterranean sand with olive-green blotches (tiles
de_air, and de_air_corr on corrugated sheet); cabin window rows; airship lettering; US camouflage parachute cloth."""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEC = os.path.join(ROOT, 'styles', 'ww2', 'decals'); TILES = os.path.join(ROOT, 'styles', 'ww2', 'tiles')
WHITE = (226, 222, 206); BLACK = (30, 30, 30); RED = (150, 44, 36)
S = 4                                   # draw big, shrink: smooth edges


def worn(im, seed, amount=0.10):
    """Chip a little paint off (alpha speckle), so a marking sits in the paint and not on top of it."""
    a = np.asarray(im).copy(); r = np.random.default_rng(seed)
    n = r.random((a.shape[0] // 3 + 1, a.shape[1] // 3 + 1)); n = np.kron(n, np.ones((3, 3)))[:a.shape[0], :a.shape[1]]
    a[..., 3] = np.where(n < amount, a[..., 3] * 0.35, a[..., 3] * 0.94).astype(np.uint8)
    return Image.fromarray(a, 'RGBA')


def star(n=96, ring=False):
    im = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = n * S / 2; R = c * (0.70 if ring else 0.96)
    pts = [(c + (R if k % 2 == 0 else R * 0.382) * math.sin(k * math.pi / 5), c - (R if k % 2 == 0 else R * 0.382) * math.cos(k * math.pi / 5)) for k in range(10)]
    d.polygon(pts, fill=WHITE + (255,))
    if ring:
        w = int(c * 0.13)
        for a0 in range(0, 360, 90): d.arc([w, w, 2 * c - w, 2 * c - w], a0 + 6, a0 + 84, fill=WHITE + (255,), width=w)
    return worn(im.resize((n, n), Image.LANCZOS), 1)


def cross(n=96):
    im = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); N = n * S; a, b, e = N * 0.33, N * 0.67, N * 0.07
    for box in ((a - e, 0, b + e, N), (0, a - e, N, b + e)): d.rectangle(box, fill=WHITE + (255,))
    for box in ((a, 0, b, N), (0, a, N, b)): d.rectangle(box, fill=BLACK + (255,))
    return worn(im.resize((n, n), Image.LANCZOS), 2, 0.06)


def font(px):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(p): return ImageFont.truetype(p, px)
    return ImageFont.load_default()


def text(s, fill, outline=None, h=48, plate=None):
    f = font(h * S); w = int(f.getlength(s)) + h * S // 2
    im = Image.new('RGBA', (w, int(h * S * 1.3)), (plate + (255,)) if plate else (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.text((w / 2, im.size[1] / 2), s, font=f, fill=fill + (255,), anchor='mm', stroke_width=(h * S // 9 if outline else 0), stroke_fill=(outline or fill) + (255,))
    return worn(im.resize((w // S, im.size[1] // S), Image.LANCZOS), sum(map(ord, s)), 0.05)


def glass(w=96, h=48):
    im = Image.new('RGBA', (w, h), (58, 70, 72, 255)); d = ImageDraw.Draw(im)
    d.polygon([(w * 0.12, h), (w * 0.34, 0), (w * 0.50, 0), (w * 0.28, h)], fill=(104, 122, 122, 255))
    d.polygon([(w * 0.58, h), (w * 0.80, 0), (w * 0.86, 0), (w * 0.64, h)], fill=(88, 104, 104, 255))
    d.rectangle([0, 0, w - 1, h - 1], outline=(40, 42, 40, 255), width=2)
    return im


def slats(w, h, n, vertical, frame, dark=(26, 26, 24), bar=None):
    """A grille: n dark slots in a painted frame (radiator: vertical slots; engine deck: slats across)."""
    im = Image.new('RGBA', (w, h), frame + (255,)); d = ImageDraw.Draw(im); m = 4
    L = (w if vertical else h) - 2 * m; step = L / n
    for k in range(n):
        a = m + k * step + step * 0.22; b = m + (k + 1) * step - step * 0.22
        d.rectangle([a, m, b, h - m] if vertical else [m, a, w - m, b], fill=dark + (255,))
    if bar: d.line([m, h / 2, w - m, h / 2] if vertical else [w / 2, m, w / 2, h - m], fill=bar + (255,), width=3)
    return im


def mesh(n=64, frame=(64, 66, 60)):
    im = Image.new('RGBA', (n, n), (22, 22, 20, 255)); d = ImageDraw.Draw(im)
    for k in range(0, n, 8): d.line([k, 0, k, n], fill=frame + (255,), width=2); d.line([0, k, n, k], fill=frame + (255,), width=2)
    d.rectangle([0, 0, n - 1, n - 1], outline=frame + (255,), width=4)
    return im


def lens(n=32):
    im = Image.new('RGBA', (n * S, n * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); N = n * S
    d.ellipse([0, 0, N - 1, N - 1], fill=(50, 50, 46, 255)); d.ellipse([N * .14, N * .14, N * .86, N * .86], fill=(196, 196, 170, 255))
    d.ellipse([N * .30, N * .22, N * .56, N * .48], fill=(236, 236, 220, 255))
    return im.resize((n, n), Image.LANCZOS)


def periodic(n, cells, seed):
    """Smooth noise that tiles: a coarse random grid, wrapped, blown up with a smooth curve."""
    r = np.random.default_rng(seed); g = r.random((cells, cells)); g = np.pad(g, ((0, 1), (0, 1)), mode='wrap')
    t = np.linspace(0, cells, n, endpoint=False); i = t.astype(int); f = t - i; f = f * f * (3 - 2 * f)
    a = g[i][:, i]; b = g[i][:, i + 1]; c = g[i + 1][:, i]; e = g[i + 1][:, i + 1]
    fx = f[None, :]; fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy


def camo(n=1024):
    """Dark yellow with soft-edged olive-green and red-brown bands: about a third of the surface repainted, the base
    still plainly the main colour, so the side still reads as dark yellow against American olive drab."""
    base = np.asarray(Image.open(os.path.join(TILES, 'de_hull.jpg')).convert('RGB').resize((n, n), Image.LANCZOS), float)
    grain = base / base.reshape(-1, 3).mean(0)
    def field(seed): return periodic(n, 4, seed) * 0.6 + periodic(n, 9, seed + 1) * 0.4
    def band(f, lo, hi, soft=0.03): return np.clip((f - lo) / soft, 0, 1) * np.clip((hi - f) / soft, 0, 1)
    g = band(field(11), 0.44, 0.56); b = band(field(23), 0.505, 0.61) * (1 - g)
    out = base.copy()
    for mask, col in ((g, (88, 98, 62)), (b, (124, 82, 56))):
        out = out * (1 - mask[..., None] * 0.92) + grain * np.array(col, float) * mask[..., None] * 0.92
    print('camo cover: green %.0f%%, brown %.0f%%' % (g.mean() * 100, b.mean() * 100))
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


# ---------------------------------------------------------------- aircraft and parachutes (models/air_finish.py, parachutes.py)
BLUE = (38, 52, 84)


def star_and_bar(h=96):
    """The US national insignia of August 1943 on: white star on a blue disc, a white bar each side, blue border."""
    R = h * S * 0.44; w = int(R * 4.6); im = Image.new('RGBA', (w, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); cx, cy = w / 2, h * S / 2; b = R * 0.12
    d.rectangle([cx - 2 * R - b, cy - R * 0.25 - b, cx + 2 * R + b, cy + R * 0.25 + b], fill=BLUE + (255,))
    d.ellipse([cx - R - b, cy - R - b, cx + R + b, cy + R + b], fill=BLUE + (255,))
    d.rectangle([cx - 2 * R, cy - R * 0.25, cx + 2 * R, cy + R * 0.25], fill=WHITE + (255,))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=BLUE + (255,))
    pts = [(cx + (R if k % 2 == 0 else R * 0.382) * math.sin(k * math.pi / 5), cy - (R if k % 2 == 0 else R * 0.382) * math.cos(k * math.pi / 5)) for k in range(10)]
    d.polygon(pts, fill=WHITE + (255,))
    return worn(im.resize((w // S, h), Image.LANCZOS), 7, 0.05)


def windows(n, w=40, h=34, gap=26, frame=(40, 42, 40)):
    """A row of n cabin windows on clear: dark panes with a glint, as the glass decal."""
    im = Image.new('RGBA', (n * (w + gap), h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    for k in range(n):
        x = k * (w + gap) + gap // 2
        d.rounded_rectangle([x, 0, x + w - 1, h - 1], 6, fill=(58, 70, 72, 255), outline=frame + (255,), width=2)
        d.polygon([(x + w * 0.2, h - 3), (x + w * 0.45, 3), (x + w * 0.62, 3), (x + w * 0.37, h - 3)], fill=(104, 122, 122, 255))
    return im


def mottle(n=1024, base=(182, 158, 110), blot=(98, 104, 68), cover=(0.50, 0.60), seed=31, cells=(6, 13)):
    """A flat paint with soft sprayed blotches of a second colour (Luftwaffe Mediterranean scheme; parachute camouflage)."""
    f = periodic(n, cells[0], seed) * 0.55 + periodic(n, cells[1], seed + 1) * 0.45
    k = np.clip((f - cover[0]) / 0.04, 0, 1) * np.clip((cover[1] + 0.2 - f) / 0.04, 0, 1)
    g = 1 + (periodic(n, 64, seed + 2) - 0.5) * 0.06
    out = (np.array(base, float) * (1 - k[..., None]) + np.array(blot, float) * k[..., None]) * g[..., None]
    return np.clip(out, 0, 255)


def corrugated(a, ridges=16):
    """The same paint on Junkers corrugated sheet: light and shade in bands across the tile's height (models put the
    bands along the airframe)."""
    n = a.shape[0]; v = np.sin(np.arange(n) / n * 2 * math.pi * ridges)
    return np.clip(a * (1 + 0.16 * v)[:, None, None], 0, 255)


def prop_disc(n=320, blades=3, seed=5):
    """A turning propeller as the eye sees it: a faint grey disc, denser where the blades are smeared, a yellow ring at
    the tips (blade-tip warning paint), clear in the middle where the spinner shows through.
    WORKAROUND (logged in the project notes): artkit has no partial transparency, a texel is solid or a hole. So the
    blur is drawn as fine radial streaks, solid or absent, which the renderer's own smoothing averages into a haze.
    A real translucent material belongs in the engine repository, as an option."""
    r_ = np.random.default_rng(seed + blades)
    y, x = np.mgrid[0:n, 0:n]; c = (n - 1) / 2; r = np.hypot(x - c, y - c) / c; a = np.arctan2(y - c, x - c)
    bins = 240; k = ((a + math.pi) / (2 * math.pi) * bins).astype(int) % bins
    dens = 0.20 + 0.16 * (0.5 + 0.5 * np.cos(a * blades * 2))                       # share of streaks drawn at this angle
    streak = r_.random(bins)[k] + (r_.random((n, n)) - 0.5) * 0.25 < dens            # mostly whole streaks, a little grain
    on = streak & (r > 0.16) & (r < 0.93)
    tip = (np.abs(r - 0.955) < 0.022) & (r_.random(bins)[k] < 0.7)
    rgb = np.empty((n, n, 3)); rgb[:] = (84, 86, 80); rgb[tip] = (204, 170, 62)
    return Image.fromarray(np.dstack([rgb, (on | tip) * 255]).astype(np.uint8), 'RGBA')


def air():
    """Only the aircraft and parachute markings and paints: python3 tools/make_markings.py air"""
    os.makedirs(DEC, exist_ok=True)
    out = {'us_air_star': star_and_bar(), 'cabin_windows_7': windows(7), 'cabin_windows_5': windows(5),
           'us_navy': text('U.S. NAVY', BLACK, h=64), 'k_number': text('K-109', BLACK, h=64), 'us_tail_serial': text('276541', (204, 170, 62), h=32)}
    out['prop_disc_3'] = prop_disc(blades=3); out['prop_disc_4'] = prop_disc(blades=4)
    for k, im in out.items(): im.save(os.path.join(DEC, k + '.png'))
    sand = mottle(cells=(4, 9))
    for name, arr in (('de_air', sand), ('de_air_corr', corrugated(mottle(cover=(2.0, 3.0)))),              # plain sand: blotches do not survive a 2.3 m tile
                      ('us_chute', mottle(base=(98, 110, 70), blot=(62, 76, 52), cover=(0.46, 0.60), seed=47))):
        Image.fromarray(arr.astype(np.uint8), 'RGB').save(os.path.join(TILES, name + '.jpg'), quality=92)


def main():
    os.makedirs(DEC, exist_ok=True)
    out = {'us_star': star(), 'us_star_ring': star(128, ring=True), 'de_cross': cross(), 'glass': glass(), 'lens': lens(),
           'us_grille': slats(96, 60, 9, True, (86, 92, 56)), 'us_truck_grille': slats(96, 72, 12, True, (86, 92, 56), bar=(86, 92, 56)),
           'de_grille': slats(72, 72, 9, False, (150, 128, 84), bar=(150, 128, 84)), 'deck_grille': mesh(),
           'deck_slats': slats(96, 64, 8, False, (60, 62, 56)),
           'us_serial': text('USA 3067421', WHITE, h=28), 'de_plate': text('WH-624 318', BLACK, h=28, plate=(214, 210, 196))}
    for num in ('211', '324', '131', '412', '233', '102'): out['de_num_' + num] = text(num, RED, WHITE, h=56)
    for k, im in out.items(): im.save(os.path.join(DEC, k + '.png'))
    camo().save(os.path.join(TILES, 'de_camo.jpg'), quality=92)
    air()


if __name__ == '__main__':
    import sys
    air() if 'air' in sys.argv[1:] else main()
