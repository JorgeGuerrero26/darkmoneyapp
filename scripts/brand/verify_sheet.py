"""Hoja de verificación: cómo se ve cada variante en uso real (máscaras de lanzador, tamaños chicos, fondos).

Uso: python -I scripts/brand/verify_sheet.py <carpeta con las salidas de generate_all.py> assets/images/icon-billetera.png
Deja verificacion.png junto a esa carpeta.
"""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
REF = sys.argv[2]
d = lambda n: Image.open(f"{OUT}/{n}").convert("RGBA")
fg, bgimg, mono, small, logo = d("icon-billetera-adaptive.png"), d("icon-billetera-adaptive-bg.png"), d("icon-billetera-monochrome.png"), d("notification-icon.png"), d("logo-billetera.png")
ref = Image.open(REF).convert("RGBA")

# Ícono adaptativo compuesto, recortado a la ventana visible (72 de 108 dp).
full = bgimg.copy()
full.alpha_composite(fg)
v = round(1024 * 72 / 108)
o = (1024 - v) // 2
visible = full.crop((o, o, o + v, o + v))


def mask(shape, size):
    m = Image.new("L", (size, size), 0)
    dr = ImageDraw.Draw(m)
    if shape == "circulo":
        dr.ellipse((0, 0, size - 1, size - 1), fill=255)
    elif shape == "squircle":
        dr.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.32), fill=255)
    elif shape == "cuadrado":
        dr.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.12), fill=255)
    elif shape == "gota":
        dr.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.5), fill=255)
        dr.rectangle((size // 2, size // 2, size - 1, size - 1), fill=255)
    return m


def masked(img, shape, size):
    im = img.resize((size, size), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask(shape, size))
    return out


def themed(size):
    # Android 13+: silueta teñida sobre un fondo de color del tema.
    tile = Image.new("RGBA", (1024, 1024), (205, 230, 215, 255))
    tint = Image.new("RGBA", (1024, 1024), (25, 70, 50, 255))
    tile.paste(tint, (0, 0), mono.getchannel("A"))
    return masked(tile.crop((o, o, o + v, o + v)), "circulo", size)


def notif(size, bgc):
    tile = Image.new("RGBA", (size + 16, size + 16), bgc)
    s = small.resize((size, size), Image.LANCZOS)
    white = Image.new("RGBA", s.size, (255, 255, 255, 255))
    tile.paste(white, (8, 8), s.getchannel("A"))
    return tile


W, H = 1500, 1180
sheet = Image.new("RGBA", (W, H), (245, 245, 245, 255))
dr = ImageDraw.Draw(sheet)
label = lambda x, y, t: dr.text((x, y), t, fill=(30, 30, 30, 255))

# Fila 1: máscaras de lanzador a 192 px sobre fondo de pantalla claro y oscuro.
label(20, 6, "Android adaptativo (192 px): circulo / squircle / cuadrado / gota  -- sobre claro y oscuro")
x = 20
for shape in ["circulo", "squircle", "cuadrado", "gota"]:
    sheet.alpha_composite(masked(visible, shape, 192), (x, 24))
    x += 210
dark = Image.new("RGBA", (840, 230), (18, 18, 22, 255))
xx = 10
for shape in ["circulo", "squircle", "cuadrado", "gota"]:
    dark.alpha_composite(masked(visible, shape, 192), (xx, 18))
    xx += 210
sheet.alpha_composite(dark, (20, 236))

# Fila 2: tamaños chicos: Android, iOS, temático y notificación.
y = 490
label(20, y - 18, "Chicos: Android 48/36/24 | iOS 60/40/29 | tematico Android 13 (48/36) | notificacion 24/18 sobre gris y blanco")
x = 20
for s in [48, 36, 24]:
    sheet.alpha_composite(masked(visible, "circulo", s), (x, y)); x += s + 14
x += 20
for s in [60, 40, 29]:
    sheet.alpha_composite(masked(ref, "cuadrado", s), (x, y)); x += s + 14
x += 20
for s in [48, 36]:
    sheet.alpha_composite(themed(s), (x, y)); x += s + 14
x += 20
for s, bgc in [(24, (90, 90, 95, 255)), (18, (90, 90, 95, 255)), (24, (230, 230, 230, 255))]:
    sheet.alpha_composite(notif(s, bgc), (x, y)); x += s + 30

# Fila 3: logo en la app (pantalla de carga, login, aviso) sobre los fondos reales y blanco; al final la referencia.
label(20, 582, "Logo en la app: carga sobre #0E0D0C | login | aviso | sobre blanco | referencia iOS")
xs = 20
for bgc, wlogo in [((14, 13, 12, 255), 260), ((14, 13, 12, 255), 180), ((30, 30, 34, 255), 40), ((255, 255, 255, 255), 260)]:
    lg = logo.copy(); lg.thumbnail((wlogo, wlogo), Image.LANCZOS)
    tile = Image.new("RGBA", (wlogo + 40, 240), bgc)
    tile.alpha_composite(lg, (20, (240 - lg.height) // 2))
    sheet.alpha_composite(tile, (xs, 600))
    xs += tile.width + 16
r = ref.copy(); r.thumbnail((240, 240))
sheet.alpha_composite(r, (xs, 600))

# Fila 4: banner de invitaciones y capa monocroma.
label(20, 852, "Banner de invitaciones (correo)")
bn = Image.open(f"{OUT}/banner-darkmoney.jpeg").convert("RGBA"); bn.thumbnail((450, 300))
sheet.alpha_composite(bn, (20, 870))
mono_prev = Image.new("RGBA", (300, 300), (40, 40, 40, 255))
mp = mono.copy(); mp.thumbnail((300, 300)); mono_prev.alpha_composite(mp)
label(500, 852, "Monocromo (capa)")
sheet.alpha_composite(mono_prev, (500, 870))
sheet.convert("RGB").save(f"{OUT}/../verificacion.png")
print("ok")
