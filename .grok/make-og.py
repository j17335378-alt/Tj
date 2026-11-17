"""TikJil share card. Image generation was unavailable, so this is a designed lockup."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

S = 2
W, H = 1200 * S, 630 * S


def rgba(hex_color, a=255):
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4)) + (a,)


BG = rgba("09090F")
LAV = rgba("B18CFF")
TEAL = rgba("67D9D0")
CREAM = rgba("F6F3FC")

FONT_TITLE = "/workspace/.grok/fonts/Outfit-600.ttf"
FONT_TAG = "/workspace/.grok/fonts/Outfit-400.ttf"


def text_width(text, font, tracking):
    total = 0
    for i, ch in enumerate(text):
        b = font.getbbox(ch)
        total += b[2] - b[0]
        if i < len(text) - 1:
            total += tracking
    return total


def fit_font(path, text, tracking, target_w):
    lo, hi = 80, 900
    best = 120
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(path, mid)
        if text_width(text, font, tracking) <= target_w:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ImageFont.truetype(path, best)


title = "TikJil"
tag = "Private library"
title_track = -3 * S
tag_track = 4 * S
# Half to two-thirds of the 1200px frame. Measure in 2x pixels.
font_title = fit_font(FONT_TITLE, title, title_track, int(1200 * 0.62 * S))
font_tag = ImageFont.truetype(FONT_TAG, max(18, font_title.size // 9))

base = Image.new("RGBA", (W, H), BG)

glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
cx = W // 2
g.ellipse((cx - 520 * S, 40 * S, cx + 520 * S, 560 * S), fill=rgba("2A1840", 150))
g.ellipse((cx - 280 * S, 80 * S, cx + 280 * S, 420 * S), fill=rgba("B18CFF", 46))
g.ellipse((cx + 40 * S, 220 * S, cx + 460 * S, 520 * S), fill=rgba("67D9D0", 28))
glow = glow.filter(ImageFilter.GaussianBlur(64 * S))
base = Image.alpha_composite(base, glow)


def make_frame(w, h):
    pad = 6 * S
    im = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(
        (pad, pad, pad + w, pad + h),
        radius=18 * S,
        fill=(12, 10, 18, 220),
        outline=rgba("B18CFF", 36),
        width=max(2, S),
    )
    inset = 12 * S
    d.rounded_rectangle(
        (pad + inset, pad + inset, pad + w - inset, pad + h - inset),
        radius=12 * S,
        fill=(7, 7, 12, 230),
    )
    d.polygon(
        [
            (pad + w * 0.46, pad + h * 0.38),
            (pad + w * 0.46, pad + h * 0.62),
            (pad + w * 0.60, pad + h * 0.50),
        ],
        fill=rgba("B18CFF", 28),
    )
    return im


frames = Image.new("RGBA", (W, H), (0, 0, 0, 0))


def stamp(frame, rot, fcx, fcy):
    spun = frame.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
    frames.alpha_composite(spun, (int(fcx - spun.width / 2), int(fcy - spun.height / 2)))


stamp(make_frame(250 * S, 146 * S), -14, int(W * 0.14), int(H * 0.72))
stamp(make_frame(250 * S, 146 * S), 13, int(W * 0.86), int(H * 0.70))
base = Image.alpha_composite(base, frames)

# vignette + fine grain
arr = np.asarray(base).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W]
nx = (xx - W / 2) / (W * 0.58)
ny = (yy - H / 2) / (H * 0.62)
vignette = np.clip(nx * nx + ny * ny, 0, 1)
for c in range(3):
    arr[:, :, c] *= 1 - 0.55 * vignette
rng = np.random.default_rng(11)
grain = rng.normal(0, 4.8, (H, W))
for c in range(3):
    arr[:, :, c] = np.clip(arr[:, :, c] + grain, 0, 255)
arr[:, :, 3] = 255
base = Image.fromarray(arr.astype(np.uint8), "RGBA")

# Measure the lockup, then place it as one centered block.
tri_h = int(font_title.size * 0.46)
tri_w = tri_h * (11 / 13)
title_w = text_width(title, font_title, title_track)
title_box = font_title.getbbox(title)
title_h = title_box[3] - title_box[1]
tag_w = text_width(tag, font_tag, tag_track)
tag_box = font_tag.getbbox(tag)
tag_h = tag_box[3] - tag_box[1]
gap_after_tri = 18 * S
gap_after_title = 16 * S
rule_h = 3 * S
gap_after_rule = 14 * S
block_h = tri_h + gap_after_tri + title_h + gap_after_title + rule_h + gap_after_rule + tag_h
top = (H - block_h) / 2

halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
hd = ImageDraw.Draw(halo)
tri_cy = top + tri_h / 2
hd.ellipse(
    (cx - tri_h * 1.15, tri_cy - tri_h * 1.05, cx + tri_h * 1.15, tri_cy + tri_h * 1.05),
    fill=rgba("B18CFF", 64),
)
halo = halo.filter(ImageFilter.GaussianBlur(22 * S))
base = Image.alpha_composite(base, halo)

draw = ImageDraw.Draw(base)
left = cx - tri_w * 0.38
draw.polygon(
    [(left, top), (left, top + tri_h), (left + tri_w, tri_cy)],
    fill=LAV,
)

title_top = top + tri_h + gap_after_tri - title_box[1]


def draw_tracked(text, font, y_top, fill, tracking):
    tw = text_width(text, font, tracking)
    x = cx - tw / 2
    for i, ch in enumerate(text):
        b = font.getbbox(ch)
        draw.text((x - b[0], y_top), ch, font=font, fill=fill)
        x += (b[2] - b[0]) + tracking


draw_tracked(title, font_title, title_top, CREAM, title_track)
rule_y = title_top + title_box[3] + gap_after_title
rule_w = 78 * S
draw.rounded_rectangle(
    (cx - rule_w / 2, rule_y, cx + rule_w / 2, rule_y + rule_h),
    radius=2 * S,
    fill=TEAL,
)
tag_top = rule_y + rule_h + gap_after_rule - tag_box[1]
draw_tracked(tag, font_tag, tag_top, TEAL, tag_track)

inset = 32 * S
draw.rounded_rectangle(
    (inset, inset, W - inset - 1, H - inset - 1),
    radius=26 * S,
    outline=(42, 38, 58, 255),
    width=max(2, S),
)

out = base.convert("RGB").resize((1200, 630), Image.Resampling.LANCZOS)
out.save("/workspace/.grok/og-raw.png", "PNG")
print(
    "title_font",
    font_title.size // S,
    "title_w",
    round(title_w / S, 1),
    "tag_w",
    round(tag_w / S, 1),
    "block_top",
    round(top / S, 1),
    "block_h",
    round(block_h / S, 1),
)
