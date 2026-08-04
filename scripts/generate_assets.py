from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math

OUT = Path(__file__).resolve().parents[1] / 'apps' / 'mobile' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)


def gradient(size: int, dark: bool = False) -> Image.Image:
    image = Image.new('RGB', (size, size))
    pixels = image.load()
    top = (2, 6, 23) if dark else (37, 99, 235)
    bottom = (15, 23, 42) if dark else (20, 184, 166)
    for y in range(size):
        for x in range(size):
            t = min(1, max(0, (x * 0.35 + y * 0.65) / size))
            pixels[x, y] = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
    return image


def mark(size: int, white=True, padding=0.20) -> Image.Image:
    scale = 4
    canvas = Image.new('RGBA', (size * scale, size * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(canvas)
    s = size * scale
    color = (255, 255, 255, 255) if white else (37, 99, 235, 255)
    accent = (165, 243, 252, 255) if white else (20, 184, 166, 255)
    box = int(s * padding)
    # Location orbit.
    d.ellipse((box, box, s - box, s - box), outline=color, width=max(3, int(s * 0.045)))
    # Deliberately open orbit for a sense of movement.
    d.arc((box * 0.70, box * 1.10, s - box * 0.70, s - box * 0.45), 198, 338,
          fill=accent, width=max(3, int(s * 0.034)))
    # Atlas north arrow / abstract A.
    cx = s / 2
    top = s * 0.25
    left = s * 0.35
    right = s * 0.65
    bottom = s * 0.72
    d.line((left, bottom, cx, top, right, bottom), fill=color, width=int(s * 0.055), joint='curve')
    d.line((s * 0.405, s * 0.575, s * 0.595, s * 0.575), fill=accent, width=int(s * 0.040))
    # Location core.
    r = s * 0.035
    d.ellipse((cx-r, s*0.39-r, cx+r, s*0.39+r), fill=accent)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def make_icon() -> None:
    size = 1024
    bg = gradient(size)
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((130, 80, 930, 880), fill=(125, 211, 252, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    bg = Image.alpha_composite(bg.convert('RGBA'), glow)
    bg = Image.alpha_composite(bg, mark(size, True, 0.22))
    bg.convert('RGB').save(OUT / 'icon.png', quality=95)

    adaptive = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    adaptive = Image.alpha_composite(adaptive, mark(size, True, 0.27))
    adaptive.save(OUT / 'adaptive-icon.png')

    splash = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    splash = Image.alpha_composite(splash, mark(512, True, 0.19))
    splash.save(OUT / 'splash-icon.png')

    notification = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    nd = ImageDraw.Draw(notification)
    nd.ellipse((18, 18, 78, 78), outline=(255, 255, 255, 255), width=8)
    nd.polygon([(48, 24), (30, 70), (48, 58), (66, 70)], fill=(255, 255, 255, 255))
    notification.save(OUT / 'notification-icon.png')

    favicon = gradient(64)
    favicon = Image.alpha_composite(favicon.convert('RGBA'), mark(64, True, 0.18))
    favicon.save(OUT / 'favicon.png')


if __name__ == '__main__':
    make_icon()
