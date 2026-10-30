"""Extrae la billetera 3D (con su sombra) de icon-billetera.png sobre fondo transparente.

El fondo de la referencia es un degradado gris oscuro con una luz suave al centro. Se estima por fila a partir de
franjas laterales sin arte, y cada píxel se separa en: primer plano (más claro que el fondo: billetera blanca o tarjeta
verde) o sombra (más oscuro que el fondo: negro semitransparente).
"""
import sys
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
ref = Image.open(src).convert("RGB")
W, H = ref.size
px = ref.load()

# Fondo por fila: promedio de franjas laterales (sin arte), interpolado hacia el centro con el brillo de arriba/abajo.
def band(y, x0, x1):
    acc = [0, 0, 0]
    n = 0
    for x in range(x0, x1):
        p = px[x, y]
        for c in range(3):
            acc[c] += p[c]
        n += 1
    return [v / n for v in acc]

left = [band(y, 12, 110) for y in range(H)]
right = [band(y, W - 110, W - 12) for y in range(H)]
# Brillo central (luz suave): columna central fuera del arte (arriba y abajo) comparada con los lados.
top_c = band(30, W // 2 - 40, W // 2 + 40)
bot_c = band(H - 30, W // 2 - 40, W // 2 + 40)
top_side = [(a + b) / 2 for a, b in zip(left[30], right[30])]
bot_side = [(a + b) / 2 for a, b in zip(left[H - 30], right[H - 30])]
boost_top = [c - s for c, s in zip(top_c, top_side)]
boost_bot = [c - s for c, s in zip(bot_c, bot_side)]

def bg(x, y):
    t = x / (W - 1)
    side = [l * (1 - t) + r * t for l, r in zip(left[y], right[y])]
    # Luz: máxima al centro horizontal (perfil coseno), interpolada entre arriba y abajo.
    import math
    w = 0.5 - 0.5 * math.cos(2 * math.pi * t)
    v = y / (H - 1)
    boost = [bt * (1 - v) + bb * v for bt, bb in zip(boost_top, boost_bot)]
    return [s + w * b for s, b in zip(side, boost)]

outimg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
op = outimg.load()
DFG = 180.0  # distancia de canal del fondo al primer plano pleno
for y in range(H):
    for x in range(W):
        c = px[x, y]
        b = bg(x, y)
        d = max(c[i] - b[i] for i in range(3))
        lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        lumb = 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]
        if d > 6:
            a = min(1.0, d / DFG)
            f = [min(255, max(0, round(b[i] + (c[i] - b[i]) / a))) for i in range(3)]
            op[x, y] = (f[0], f[1], f[2], round(a * 255))
        elif lum < lumb - 1.5:
            a = min(1.0, (lumb - lum) / max(lumb, 1)) * 1.15
            op[x, y] = (0, 0, 0, round(min(1.0, a) * 255))

# Limpieza de ruido suelto lejos del arte y recorte con margen.
alpha = outimg.getchannel("A").point(lambda v: 0 if v < 6 else v)
outimg.putalpha(alpha)
bbox = alpha.point(lambda v: 255 if v > 10 else 0).getbbox()
pad = 24
crop = outimg.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(W, bbox[2] + pad), min(H, bbox[3] + pad)))
crop.save(out)
print("bbox", bbox, "->", crop.size)
