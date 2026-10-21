#!/usr/bin/env python3
"""Export tournament banner assets from the duelcup master PSD.

Usage: python3 scripts/export_tournament_banner_assets.py path/to/duelcup_master_clb.psd

The PSD (~413MB) is not committed. This script writes transparent PNGs into
``Image/TournamentBanners`` and regenerates
``Data/TournamentBanners/tournament_banner_assets.json`` / ``metadata.json``.

Requires ``pip install 'psd-tools[composite]'`` (scipy is needed for the
gradient overlays). Each group is composited on its own, with the visibility
of its child layers left as saved, so layers that use special blend modes can
look slightly different from the full banner in Photoshop.
"""

import datetime
import json
import os
import re
import sys

from psd_tools import PSDImage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE_DIR = os.path.join(ROOT, "Image", "TournamentBanners")
DATA_DIR = os.path.join(ROOT, "Data", "TournamentBanners")

# PSD layer names -> ASCII file names.
NAME_MAP = {
    "リアルタイム": "realtime",
    "レーティング": "rating",
    "トーナメント": "tournament",
    "鬼タイム": "oni_time",
    "AURA": "aura",
    "ボタン": "click_button",
    "文字：More Info yoko": "more_info",
    "Lagendaly": "legendary",
    "ドラゴン全部 のコピー": "dragon_cup",
    "ドラゴン：エッグ": "egg",
    "ドラゴン：ベイビー": "baby",
    "ドラゴン：ブルー": "blue",
    "ドラゴン：レッド": "red",
    "Challenge のコピー": "challenge",
    "world champ": "world_champ",
    "小さい鬼タイム": "oni_time_small",
    "Oasysコラボ": "collab_oasys",
    "1912コラボ": "collab_1912",
    "Rep": "trial_cup",
    "Term        6 ": "term_6",
    "フィルター": "filter",
    "mch_logo_yoko_b (1)": "mch_logo_yoko_b",
    "The Leading Non‑Fungible Token Event のコピー": "nftnyc_tagline",
    "NYC - February 20, 2020 ": "nftnyc_date",
}


def slug(name):
    name = NAME_MAP.get(name, NAME_MAP.get(name.replace(" のコピー", ""), name))
    name = name.replace(" のコピー", "")
    name = NAME_MAP.get(name, name)
    return re.sub(r"[^0-9A-Za-z._-]+", "_", name.strip()).strip("_-").lower()


class Exporter:
    def __init__(self, psd):
        self.psd = psd
        self.assets = []

    def path(self, layer):
        names = []
        while layer is not None and layer is not self.psd:
            names.append(layer.name)
            layer = layer.parent
        return "/".join(reversed(names))

    def render(self, layer, viewport=None, hide_text=False):
        restore = []
        node = layer
        while node is not None and node is not self.psd:
            restore.append((node, node.visible))
            node.visible = True
            node = node.parent
        if hide_text and layer.is_group():
            for child in layer.descendants():
                if child.kind == "type" and child.visible:
                    restore.append((child, True))
                    child.visible = False
        image = layer.composite(viewport=viewport) if viewport else layer.composite()
        for node, visible in restore:
            node.visible = visible
        return image

    def save(self, image, rel, category, layer=None, note=None):
        if any(a["image"] == "Image/TournamentBanners/" + rel for a in self.assets):
            rel = rel[:-4] + "_2.png"
        out = os.path.join(IMAGE_DIR, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        image.save(out)
        self.assets.append({
            "image": "Image/TournamentBanners/" + rel,
            "category": category,
            "width": image.width,
            "height": image.height,
            "psd_layer": self.path(layer) if layer is not None else None,
            "note": note,
        })


def main():
    psd = PSDImage.open(sys.argv[1])
    ex = Exporter(psd)
    top = list(psd)

    def first(name, group=None, parent=None):
        return [l for l in (parent or top) if l.name == name and (group is None or l.is_group() == group)][-1]

    ex.save(psd.composite(), "preview/banner_current.png", "preview", note="PSD保存時の表示状態")

    seen = set()
    for layer in psd.descendants():
        if layer.kind != "smartobject":
            continue
        so = layer.smart_object
        if so.filename in seen:
            continue
        seen.add(so.filename)
        base, ext = os.path.splitext(so.filename)
        rel = "originals/" + slug(base) + ext.lower()
        out = os.path.join(IMAGE_DIR, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(so.data)
        ex.assets.append({"image": "Image/TournamentBanners/" + rel, "category": "original",
                          "width": None, "height": None, "psd_layer": ex.path(layer),
                          "note": "スマートオブジェクトに埋め込まれていた元画像"})

    icon_groups = {
        "rule": ["リアルタイム", "レーティング", "トーナメント", "鬼タイム", "AURA"],
        "format": ["standard on", "modern on", "legacy on"],
        "class_label": ["Rep", "Novice", "Challenge", "Common", "Uncommon", "Rare", "Epic", "Lagendaly", "all"],
        "button": ["ボタン", "文字：More Info yoko"],
    }
    for category, names in icon_groups.items():
        for name in names:
            layer = first(name, group=True)
            ex.save(ex.render(layer), f"icons/{category}/{slug(name)}.png", category, layer)

    cups = [
        ("ドラゴン全部 のコピー", ["Challenge", "Common", "ドラゴン：エッグ", "ドラゴン：ベイビー", "ドラゴン：ブルー", "ドラゴン：レッド", "Absolute"]),
        ("9on9", ["C", "U", "R", "E", "L", "Absolute JIN"]),
        ("HRC", ["Challenge のコピー", "U", "R", "E", "L"]),
        ("world champ", ["Princess", "Prince", "Queen", "King"]),
        ("gym", ["ドラゴン：エッグ のコピー", "ドラゴン：ベイビー のコピー", "ドラゴン：ブルー のコピー", "Absolute のコピー"]),
    ]
    for group_name, subs in cups:
        group = first(group_name)
        for sub in subs:
            layer = first(sub, parent=list(group))
            base = f"cups/{slug(group_name)}/{slug(sub)}"
            ex.save(ex.render(layer, hide_text=True), base + "_icon.png", "cup_icon", layer, "タイトル文字なし")
            ex.save(ex.render(layer), base + "_with_title.png", "cup_icon", layer, "タイトル文字あり")
            for child in layer.descendants():
                if child.kind == "type" and child.visible:
                    ex.save(ex.render(child), base + "_title.png", "cup_title", child, "タイトル文字のみ")
                    break
    frame = first("FIX", parent=list(first("9on9")))
    ex.save(ex.render(frame), "cups/9on9/frame.png", "cup_icon", frame)

    for layer in first("レギュ").descendants():
        if layer.kind in ("type", "pixel") and layer.bbox[2] > layer.bbox[0]:
            prefix = "" if layer.parent.name == "レギュ" else slug(layer.parent.name) + "_"
            ex.save(ex.render(layer), f"regulation/{prefix}{slug(layer.name)}.png", "regulation", layer)
    for name in ["Oasysコラボ", "1912コラボ", "Rep", "Test", "Term        6 "]:
        layer = first(name, group=False)
        ex.save(ex.render(layer), f"regulation/{slug(name)}.png", "regulation", layer)

    for layer in first("logo"):
        ex.save(ex.render(layer), f"logos/{slug(layer.name)}.png", "logo", layer)

    viewport = (0, 0, psd.width, psd.height)
    backgrounds = [("背景 のコピー 2", "base"), ("kingDragon", "king_dragon"), ("exwars", "exwars"),
                   ("ex wars", "exwars_title"), ("1912 bg", "1912_bg"), ("レイヤー 331", "layer331"),
                   ("レイヤー 509", "layer509"), ("レイヤー 513", "layer513_shadow"),
                   ("フィルタ", "filter_overlay"), ("フィルタ years cup", "filter_overlay_years_cup")]
    for name, label in backgrounds:
        layer = first(name)
        ex.save(ex.render(layer, viewport=viewport), f"backgrounds/{label}.png", "background", layer)
    for name in ["background", "Dragon", "kumo", "フィルター"]:
        layer = first(name, parent=list(first("kingDragon")))
        ex.save(ex.render(layer, viewport=viewport), f"backgrounds/king_dragon_parts/{slug(name)}.png",
                "background", layer)

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "tournament_banner_assets.json"), "w", encoding="utf-8") as f:
        json.dump(ex.assets, f, ensure_ascii=False, indent=2)
        f.write("\n")
    counts = {}
    for a in ex.assets:
        counts[a["category"]] = counts.get(a["category"], 0) + 1
    metadata = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": os.path.basename(sys.argv[1]),
        "source_size": [psd.width, psd.height],
        "source_layer_count": len(list(psd.descendants())),
        "total_assets": len(ex.assets),
        "counts_by_category": counts,
        "note": "MCH社より提供された大会バナーPSDから書き出した素材です。PSD本体は容量が大きいためリポジトリには含めていません。",
    }
    with open(os.path.join(DATA_DIR, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"exported {len(ex.assets)} assets")


if __name__ == "__main__":
    main()
