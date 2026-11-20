"""Review the base-building blockouts (models/bases.py) the way artkit/DESIGN_METHOD.md step 7 asks: the assembly
checker, the design critic at play size, and grey sheets at play size (0.4, the export scale) and close (1.0), with
the line weight hierarchy so a shape's own edges show.

  python3 tools/review_bases.py <out> [key ...]
Writes <out>/bases_play.png, <out>/bases_close.png and <out>/bases_review.txt; prints the report.
"""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
import numpy as np
from artkit.style import Style
from artkit.core.light import Rules
from artkit.core.materials import Materials, Material
from artkit.sprite import picture, sheet
from artkit import design
from models import bases

LINES = Rules(ink_width=0.75, ink_inner=0.5, ink_step=4, ink_crease=35, ink_crease_width=0.35)


def greys():
    """Flat greys in three values (DESIGN_METHOD: blockouts are grey): mechanism and steel darker, openings darkest,
    canvas and nets lighter than walls, so the value blocks the critic measures are visible to the eye too."""
    g = lambda v: Material(np.full((8, 8, 3), v / 255, np.float32), 'tile', 0.05)
    tone = {'steel': 118, 'rubber': 70, 'opening': 52, 'us_canvas': 196, 'de_canvas': 150, 'flag': 228,
            'earth': 140, 'concrete': 186, 'sandbag': 172, 'planks': 160, 'timber': 112}
    return Materials(fallback=lambda n: g(tone.get(n.split('@')[0], 170)))


def main(out, keys):
    os.makedirs(out, exist_ok=True)
    st = Style.load(os.path.join(ROOT, 'styles', 'ww2')); G = greys()
    play, close, labs, lines = [], [], [], []
    for k in keys:
        fn, rank = bases.ALL[k]
        a = fn(); g = a.geometry()
        rep = design.critique(a, st, rank=rank, key=k, play=0.4)
        lines.append(rep.text())
        if rep.lost: lines.append('  too small at play size: ' + ', '.join(rep.lost))
        labs.append(f'{k}  {rep.score:.0f}/100')
        play.append(picture(g, st, scale=0.4, mats=G, lighting=LINES)[0])
        if '--close' in sys.argv: close.append(picture(g, st, scale=1.0, mats=G, lighting=LINES)[0])
    sheet(play, labs, cols=5).save(os.path.join(out, 'bases_play.png'))
    if close: sheet(close, labs, cols=3).save(os.path.join(out, 'bases_close.png'))
    open(os.path.join(out, 'bases_review.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'scratch', [k for k in sys.argv[2:] if k != '--close'] or list(bases.ALL))
