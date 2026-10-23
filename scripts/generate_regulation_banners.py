#!/usr/bin/env python3
"""大会バナーの素材（Image/TournamentBanners）を組み合わせて、ドラゴンカップのレギュレーションのバナーを作る。

MCH 公式サイトのカップ画像（cups/1300〜1304.png）の代わりに使う。
コラボ相手のロゴ（OASYS）が入っていない素材だけを使う。

    python3 scripts/generate_regulation_banners.py
    → Image/TournamentBanners/generated/regulation/<id>.png（960×360、16:6）

Pillow が要る。
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Image/TournamentBanners"
OUT = SRC / "generated/regulation"
W, H = 960, 360

# id: (アイコン, 題字, 下地の色, アイコンの切り抜き（なければ全体）)
#   Common のアイコンは下に OASYS のロゴがあるので、上だけ切り抜く
#   Red の題字は dragon_cup、アイコンは gym の Absolute（OASYS のない赤い龍）
BANNERS = {
    "common": ("cups/dragon_cup/common_icon.png", "cups/dragon_cup/common_title.png", (154, 166, 184), (0, 0, 318, 234)),
    "egg": ("cups/gym/egg_icon.png", "cups/gym/egg_title.png", (227, 192, 116), None),
    "baby": ("cups/gym/baby_icon.png", "cups/gym/baby_title.png", (116, 207, 163), None),
    "blue": ("cups/gym/blue_icon.png", "cups/gym/blue_title.png", (90, 169, 255), None),
    "red": ("cups/gym/absolute_icon.png", "cups/dragon_cup/red_title.png", (255, 82, 82), None),
    "absolute": ("cups/dragon_cup/absolute_icon.png", "cups/gym/absolute_title.png", (168, 85, 247), None),
}


def cover(im, w, h):
    """縦横比を保って w×h を覆うように拡大し、中央で切る"""
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def fit(im, w, h):
    """縦横比を保って w×h に収める"""
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def shadow(im, radius=6, alpha=110):
    """題字・アイコンの下に敷く、ぼかした影"""
    a = im.getchannel("A").point(lambda v: v * alpha // 255)
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    sh.putalpha(a)
    pad = radius * 3
    out = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    out.alpha_composite(sh, (pad, pad))
    return out.filter(ImageFilter.GaussianBlur(radius)), pad


def make(icon_path, title_path, color, crop):
    base = cover(Image.open(SRC / "backgrounds/base.png").convert("RGBA"), W, H)
    # レギュレーションの色をうすく重ねる（右ほど濃い）
    tint = Image.new("RGBA", (W, H), color + (0,))
    grad = Image.linear_gradient("L").rotate(90).resize((W, H)).point(lambda v: 40 + v * 70 // 255)
    tint.putalpha(grad)
    canvas = Image.alpha_composite(base, tint)
    # 下に細い帯（レギュレーションの色）
    ImageDraw.Draw(canvas).rectangle((0, H - 10, W, H), fill=color + (255,))

    icon = Image.open(SRC / icon_path).convert("RGBA")
    if crop:
        icon = icon.crop(crop)
    icon = fit(icon, 330, 300)
    title = fit(Image.open(SRC / title_path).convert("RGBA"), 560, 150)

    ix = 30 + (330 - icon.width) // 2
    iy = (H - 10 - icon.height) // 2
    tx = 370 + (560 - title.width) // 2
    ty = (H - 10 - title.height) // 2
    for im, x, y in ((icon, ix, iy), (title, tx, ty)):
        sh, pad = shadow(im)
        canvas.alpha_composite(sh, (x - pad + 4, y - pad + 6))
        canvas.alpha_composite(im, (x, y))
    return canvas.convert("RGB")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for rid, (icon, title, color, crop) in BANNERS.items():
        path = OUT / f"{rid}.png"
        make(icon, title, color, crop).save(path, optimize=True)
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
