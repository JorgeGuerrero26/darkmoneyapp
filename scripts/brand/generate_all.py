"""Genera todas las variantes de la marca a partir de icon-billetera.png (referencia).

Uso: python -I scripts/brand/generate_all.py <referencia> <logo_raw.png> <carpeta de salida> <Archivo_600SemiBold.ttf>
Entradas: logo_raw.png (billetera extraída de la referencia con su sombra, ver extract_logo.py).
Salidas en OUT/: logo-billetera.png, icon-billetera-adaptive.png, icon-billetera-adaptive-bg.png,
icon-billetera-monochrome.png, notification-icon.png, logo_darkmoney.png (drawable del plugin), banner-darkmoney.jpeg.
"""
import math
import os
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

REF, RAW, OUT, FONT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
os.makedirs(OUT, exist_ok=True)

ref = Image.open(REF).convert("RGB")
raw = Image.open(RAW).convert("RGBA")
r, g, b, a = raw.split()
rgb = Image.merge("RGB", (r, g, b))
is_fg = rgb.convert("L").point(lambda v: 255 if v > 40 else 0)
fg_alpha = ImageChops.multiply(a, is_fg)
art_full = Image.merge("RGBA", (r, g, b, fg_alpha))
art_bbox = fg_alpha.point(lambda v: 255 if v > 128 else 0).getbbox()
art = art_full.crop(art_bbox)  # billetera + tarjeta, sin sombra, recortada justa
AW, AH = art.size
print("arte", art_bbox, art.size)

# Tarjeta (verde) vs billetera (blanca), para la silueta de dos tonos.
ar, ag, ab, aa = art.split()
green = Image.merge("RGB", (ar, ag, ab)).point(lambda v: v)
card_mask = Image.eval(ImageChops.subtract(ag, ar), lambda v: 255 if v > 45 else 0)
card_mask = ImageChops.multiply(card_mask, aa.point(lambda v: 255 if v > 128 else 0))


def with_shadow(img, offset, blur, opacity):
    """Pone una sombra suave hacia abajo (como la de la referencia) detrás del arte."""
    w, h = img.size
    pad = blur * 3 + offset
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    sil = img.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    sh = Image.new("L", canvas.size, 0)
    sh.paste(sil, (pad, pad + offset))
    sh = sh.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: round(v * opacity))
    canvas.alpha_composite(Image.merge("RGBA", (Image.new("L", canvas.size, 0),) * 3 + (sh,)))
    canvas.alpha_composite(img, (pad, pad))
    return canvas, pad


def scaled_art(width):
    h = round(AH * width / AW)
    return art.resize((width, h), Image.LANCZOS)


def silhouette(width, card_alpha):
    """Silueta blanca: billetera opaca, tarjeta más tenue (los íconos temáticos y de notificación solo usan el alfa)."""
    h = round(AH * width / AW)
    alpha = aa.resize((width, h), Image.LANCZOS)
    card = card_mask.resize((width, h), Image.LANCZOS)
    dim = ImageChops.multiply(card, Image.new("L", card.size, round(255 * (1 - card_alpha))))
    alpha = ImageChops.subtract(alpha, ImageChops.multiply(alpha, dim.point(lambda v: v)))
    white = Image.new("L", (width, h), 255)
    return Image.merge("RGBA", (white, white, white, alpha))


# 1) Logo para la app y la pantalla de carga: arte a 760 px de ancho con su sombra.
logo_art = scaled_art(760)
logo, _ = with_shadow(logo_art, offset=20, blur=24, opacity=0.55)
bb = logo.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
logo = logo.crop((bb[0] - 12, bb[1] - 12, bb[2] + 12, bb[3] + 12))
logo.save(os.path.join(OUT, "logo-billetera.png"), optimize=True)
print("logo-billetera", logo.size)

# 2) Ícono adaptativo de Android (lienzo 108 dp = 1024 px; zona segura: círculo de 66 dp).
CANVAS = 1024
ART_W = round(0.46 * CANVAS)
half_diag = math.hypot(ART_W / 2, AH * ART_W / AW / 2) / CANVAS
print("adaptativo: ancho del arte", ART_W, "| semidiagonal", round(half_diag, 3), "<= 0.306 (zona segura)")
assert half_diag <= 0.305, "la billetera se saldría de la zona segura"
fg_art = scaled_art(ART_W)
fg_shadowed, pad = with_shadow(fg_art, offset=14, blur=16, opacity=0.6)
fg = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
ox = (CANVAS - fg_art.width) // 2 - pad
oy = (CANVAS - fg_art.height) // 2 - pad
fg.alpha_composite(fg_shadowed, (ox, oy))
fg.save(os.path.join(OUT, "icon-billetera-adaptive.png"), optimize=True)

# Fondo del adaptativo: el degradado gris oscuro de la referencia (sin la billetera).
W, H = ref.size
px = ref.load()
def band(y, x0, x1):
    acc = [0, 0, 0]
    for x in range(x0, x1):
        p = px[x, y]
        for c in range(3):
            acc[c] += p[c]
    n = x1 - x0
    return [v / n for v in acc]
left = [band(y, 12, 110) for y in range(H)]
right = [band(y, W - 110, W - 12) for y in range(H)]
top_c, bot_c = band(30, W // 2 - 40, W // 2 + 40), band(H - 30, W // 2 - 40, W // 2 + 40)
top_s = [(p + q) / 2 for p, q in zip(left[30], right[30])]
bot_s = [(p + q) / 2 for p, q in zip(left[H - 30], right[H - 30])]
bg = Image.new("RGB", (W, H))
bp = bg.load()
for y in range(H):
    v = y / (H - 1)
    boost = [(tc - ts) * (1 - v) + (bc - bs) * v for tc, ts, bc, bs in zip(top_c, top_s, bot_c, bot_s)]
    for x in range(W):
        t = x / (W - 1)
        w = 0.5 - 0.5 * math.cos(2 * math.pi * t)
        bp[x, y] = tuple(round(l * (1 - t) + rr * t + w * bo) for l, rr, bo in zip(left[y], right[y], boost))
bg = bg.filter(ImageFilter.GaussianBlur(8))
bg.save(os.path.join(OUT, "icon-billetera-adaptive-bg.png"), optimize=True)
print("fondo: arriba", bg.getpixel((512, 20)), "abajo", bg.getpixel((512, 1000)))

# 3) Monocromo (íconos temáticos de Android 13+): misma posición que el primer plano.
mono = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
sil = silhouette(ART_W, card_alpha=0.55)
mono.alpha_composite(sil, ((CANVAS - sil.width) // 2, (CANVAS - sil.height) // 2))
mono.save(os.path.join(OUT, "icon-billetera-monochrome.png"), optimize=True)

# 4) Ícono pequeño de notificaciones (96x96, blanco sobre transparente; Android usa solo el alfa).
small = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
nsil = silhouette(84, card_alpha=0.55)
small.alpha_composite(nsil, ((96 - nsil.width) // 2, (96 - nsil.height) // 2))
small.save(os.path.join(OUT, "notification-icon.png"), optimize=True)

# 5) Drawable del plugin (encabezado de la ventana rápida de movimientos): el logo a 256 px de ancho.
drawable = logo.copy()
drawable.thumbnail((256, 256), Image.LANCZOS)
drawable.save(os.path.join(OUT, "logo_darkmoney.png"), optimize=True)

# 6) Banner de las invitaciones (correo): 1536x1024, fondo de la referencia, billetera y nombre.
BW, BH = 1536, 1024
banner = bg.resize((BW, BW)).crop((0, (BW - BH) // 2, BW, (BW - BH) // 2 + BH)).convert("RGBA")
b_art = scaled_art(430)
b_logo, b_pad = with_shadow(b_art, offset=18, blur=22, opacity=0.6)
font = ImageFont.truetype(FONT, 150)
draw = ImageDraw.Draw(banner)
text = "DarkMoney"
tb = draw.textbbox((0, 0), text, font=font)
tw, th = tb[2] - tb[0], tb[3] - tb[1]
gap = 70
total = b_art.width + gap + tw
x0 = (BW - total) // 2
banner.alpha_composite(b_logo, (x0 - b_pad, (BH - b_art.height) // 2 - b_pad))
draw.text((x0 + b_art.width + gap - tb[0], (BH - th) // 2 - tb[1]), text, font=font, fill=(244, 241, 236, 255))
banner.convert("RGB").save(os.path.join(OUT, "banner-darkmoney.jpeg"), quality=90, optimize=True)
print("listo")
