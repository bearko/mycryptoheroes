#!/usr/bin/env python3

"""GIFのデフォルメアニメーションから、横1列のPNGスプライトシートを書き出す。

ゲームエンジンではGIFをそのまま扱えないことが多いため、
Image/HeroAnimations/<テンプレートサイズ>/<ヒーローID>/*.gif と同じ場所に
同名の .png を生成して、どちらでも使えるようにする。

    pip install Pillow
    python3 scripts/build_hero_animation_sheets.py
    python3 scripts/build_hero_animation_sheets.py --hero 10001
"""

import argparse
from pathlib import Path
import sys

try:
    from PIL import Image, ImageSequence
except ImportError:  # pragma: no cover - 実行環境の案内
    sys.exit("Pillow が必要です。`pip install Pillow` を実行してください。")

ROOT = Path(__file__).resolve().parents[1]
ANIMATION_IMAGE_ROOT = ROOT / "Image" / "HeroAnimations"


def load_frames(gif_path):
    """GIFの各コマを、破棄方法を反映した合成済みのRGBAとして取り出す。"""
    with Image.open(gif_path) as image:
        canvas = image.size
        frames = []
        durations = []
        for frame in ImageSequence.Iterator(image):
            frames.append(frame.convert("RGBA"))
            durations.append(int(frame.info.get("duration", 0)))
        return canvas, frames, durations


def build_sheet(gif_path):
    canvas, frames, durations = load_frames(gif_path)
    if not frames:
        raise ValueError(f"{gif_path}: コマを読み取れませんでした。")

    width, height = canvas
    sheet = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * width, 0))

    png_path = gif_path.with_suffix(".png")
    # ドット絵なので減色や圧縮での色変化が起きないよう、RGBAのまま保存する。
    sheet.save(png_path, "PNG", optimize=True)
    return png_path, len(frames), durations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hero", help="ヒーローIDを指定して、そのフォルダだけ処理する。")
    args = parser.parse_args()

    if not ANIMATION_IMAGE_ROOT.exists():
        sys.exit(f"{ANIMATION_IMAGE_ROOT} がありません。")

    gif_paths = sorted(ANIMATION_IMAGE_ROOT.glob("*/*/*.gif"))
    if args.hero:
        gif_paths = [path for path in gif_paths if path.parent.name == args.hero]
    if not gif_paths:
        sys.exit("対象のGIFが見つかりませんでした。")

    for gif_path in gif_paths:
        png_path, frame_count, durations = build_sheet(gif_path)
        relative = png_path.relative_to(ROOT).as_posix()
        unique = sorted(set(durations))
        print(f"{relative}: {frame_count} frames, durations={unique}ms")

    print(f"Wrote {len(gif_paths)} sprite sheets.")


if __name__ == "__main__":
    main()
