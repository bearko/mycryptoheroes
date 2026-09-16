#!/usr/bin/env python3
"""Export original character sprites from Aseprite sources.

Reads ``Image/Characters/Source/*.aseprite`` with a minimal pure-stdlib
Aseprite parser, writes one RGBA PNG per frame into ``Image/Characters``
and regenerates ``Data/Characters/characters.json`` / ``metadata.json``.

Hidden layers (the designer's reference/sketch layers) are skipped, so the
exported PNGs match what Aseprite renders with the default layer visibility.
"""

import datetime
import hashlib
import json
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, "Image", "Characters", "Source")
IMAGE_DIR = os.path.join(ROOT, "Image", "Characters")
DATA_DIR = os.path.join(ROOT, "Data", "Characters")

CREDIT_TEXT = "ドット絵：こじもこ"


# --------------------------------------------------------------------------
# Aseprite parser (spec: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md)
# --------------------------------------------------------------------------
class AsepriteFile:
    def __init__(self, path):
        data = open(path, "rb").read()
        self.path = path
        _, magic, self.frame_count, self.width, self.height, self.depth = struct.unpack_from(
            "<IHHHHH", data, 0
        )
        if magic != 0xA5E0:
            raise ValueError("%s is not an Aseprite file." % path)
        self.transparent_index = data[28]
        self.layers = []
        self.frames = []
        self.tags = []
        self.palette = {}

        offset = 128
        while offset < len(data):
            frame_size, frame_magic, old_chunks, duration = struct.unpack_from("<IHHH", data, offset)
            if frame_magic != 0xF1FA:
                raise ValueError("Broken frame header in %s" % path)
            new_chunks = struct.unpack_from("<I", data, offset + 12)[0]
            chunk_count = new_chunks or old_chunks
            frame_end = offset + frame_size
            cursor = offset + 16
            cels = []
            for _ in range(chunk_count):
                chunk_size, chunk_type = struct.unpack_from("<IH", data, cursor)
                chunk_end = cursor + chunk_size
                body = cursor + 6
                if chunk_type == 0x2004:
                    self.layers.append(self._read_layer(data, body))
                elif chunk_type == 0x2005:
                    cels.append(self._read_cel(data, body, chunk_end))
                elif chunk_type == 0x2019:
                    self._read_palette(data, body)
                elif chunk_type == 0x2018:
                    self._read_tags(data, body)
                cursor = chunk_end
            self.frames.append({"duration": duration, "cels": cels})
            offset = frame_end

    @staticmethod
    def _read_string(data, offset):
        length = struct.unpack_from("<H", data, offset)[0]
        return data[offset + 2 : offset + 2 + length].decode("utf-8"), offset + 2 + length

    def _read_layer(self, data, offset):
        flags, layer_type, child_level = struct.unpack_from("<HHH", data, offset)
        blend_mode, opacity = struct.unpack_from("<HB", data, offset + 10)
        name, _ = self._read_string(data, offset + 16)
        return {
            "name": name,
            "visible": bool(flags & 1),
            "type": layer_type,
            "child_level": child_level,
            "blend_mode": blend_mode,
            "opacity": opacity,
        }

    def _read_cel(self, data, offset, end):
        layer_index, x, y, opacity, cel_type = struct.unpack_from("<HhhBH", data, offset)
        cel = {"layer": layer_index, "x": x, "y": y, "opacity": opacity, "type": cel_type}
        body = offset + 16
        if cel_type in (0, 2):
            width, height = struct.unpack_from("<HH", data, body)
            pixels = data[body + 4 : end]
            if cel_type == 2:
                pixels = zlib.decompress(pixels)
            cel.update(width=width, height=height, pixels=pixels)
        elif cel_type == 1:
            cel["link"] = struct.unpack_from("<H", data, body)[0]
        else:
            raise ValueError("Unsupported cel type %d in %s" % (cel_type, self.path))
        return cel

    def _read_palette(self, data, offset):
        _, first, last = struct.unpack_from("<III", data, offset)
        cursor = offset + 20
        for index in range(first, last + 1):
            entry_flags, red, green, blue, alpha = struct.unpack_from("<HBBBB", data, cursor)
            cursor += 6
            if entry_flags & 1:
                _, cursor = self._read_string(data, cursor)
            self.palette[index] = (red, green, blue, alpha)

    def _read_tags(self, data, offset):
        count = struct.unpack_from("<H", data, offset)[0]
        cursor = offset + 10
        for _ in range(count):
            from_frame, to_frame = struct.unpack_from("<HH", data, cursor)
            name, cursor = self._read_string(data, cursor + 17)
            self.tags.append({"name": name, "from": from_frame, "to": to_frame})

    def resolve_cel(self, frame_index, cel):
        """Follow linked cels (cel type 1) back to the frame that owns the pixels."""
        seen = set()
        current = cel
        while current["type"] == 1:
            target = current["link"]
            if target in seen:
                raise ValueError("Circular cel link in %s" % self.path)
            seen.add(target)
            matches = [c for c in self.frames[target]["cels"] if c["layer"] == cel["layer"]]
            if not matches:
                return None
            current = matches[0]
        resolved = dict(current)
        resolved["x"] = cel["x"]
        resolved["y"] = cel["y"]
        resolved["opacity"] = cel["opacity"]
        return resolved

    def cel_rgba(self, cel):
        count = cel["width"] * cel["height"]
        pixels = cel["pixels"]
        out = bytearray(count * 4)
        if self.depth == 32:
            out[:] = pixels[: count * 4]
        elif self.depth == 8:
            for i in range(count):
                index = pixels[i]
                red, green, blue, alpha = self.palette.get(index, (0, 0, 0, 0))
                if index == self.transparent_index:
                    alpha = 0
                out[i * 4 : i * 4 + 4] = bytes((red, green, blue, alpha))
        elif self.depth == 16:
            for i in range(count):
                value = pixels[i * 2]
                out[i * 4 : i * 4 + 4] = bytes((value, value, value, pixels[i * 2 + 1]))
        else:
            raise ValueError("Unsupported color depth %d" % self.depth)
        return out

    def render_frame(self, frame_index):
        """Composite one frame into an RGBA byte buffer (straight alpha, normal blend)."""
        canvas = bytearray(self.width * self.height * 4)
        for cel in sorted(self.frames[frame_index]["cels"], key=lambda c: c["layer"]):
            layer = self.layers[cel["layer"]]
            if not layer["visible"]:
                continue
            if layer["blend_mode"] != 0:
                raise ValueError("Unsupported blend mode %d on layer %s" % (layer["blend_mode"], layer["name"]))
            resolved = self.resolve_cel(frame_index, cel)
            if resolved is None or "pixels" not in resolved:
                continue
            rgba = self.cel_rgba(resolved)
            factor = (layer["opacity"] / 255.0) * (resolved["opacity"] / 255.0)
            for y in range(resolved["height"]):
                target_y = resolved["y"] + y
                if not 0 <= target_y < self.height:
                    continue
                for x in range(resolved["width"]):
                    target_x = resolved["x"] + x
                    if not 0 <= target_x < self.width:
                        continue
                    si = (y * resolved["width"] + x) * 4
                    src_a = rgba[si + 3] * factor
                    if src_a <= 0:
                        continue
                    di = (target_y * self.width + target_x) * 4
                    src_a /= 255.0
                    dst_a = canvas[di + 3] / 255.0
                    out_a = src_a + dst_a * (1.0 - src_a)
                    for channel in range(3):
                        src_c = rgba[si + channel]
                        dst_c = canvas[di + channel]
                        canvas[di + channel] = int(round((src_c * src_a + dst_c * dst_a * (1.0 - src_a)) / out_a))
                    canvas[di + 3] = int(round(out_a * 255))
        return canvas


def write_png(path, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        raw += rgba[y * stride : (y + 1) * stride]

    def chunk(tag, payload):
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


# --------------------------------------------------------------------------
# Pose table: one entry per frame of each Aseprite source.
# --------------------------------------------------------------------------
SPRITE_SETS = [
    {
        "id": "chris",
        "character": "chris",
        "source": "chris.aseprite",
        "description": "クリスくんの基本立ち絵とポーズ/表情差分。",
        "frames": [
            ("idle", "基本の立ちポーズ。"),
            ("arms_crossed", "腕を組んだポーズ。"),
            ("wave", "手を上げて挨拶するポーズ。"),
            ("cheer", "両手を上げて喜ぶポーズ。"),
            ("guts_pose", "拳を握ってウインクするガッツポーズ。"),
            ("smile", "笑顔で話す表情差分。"),
            ("laugh", "口を大きく開けて笑う表情差分。"),
            ("sparkle", "ひらめき/感動を表すキラキラ演出付きの表情差分。"),
            ("sad", "目を閉じて涙を流す悲しい表情差分。"),
            ("idle", "待機ループ1コマ目。目を開いた基本表情。"),
            ("blink", "待機ループ2コマ目。まばたき。"),
            ("blink", "待機ループ3コマ目。まばたき。"),
        ],
    },
    {
        "id": "chris_speak",
        "character": "chris",
        "source": "chris_speak.aseprite",
        "description": "クリスくんの口パク（リップシンク）用差分。",
        "frames": [
            ("talk", "口パク1コマ目。口を閉じた状態。"),
            ("talk", "口パク2コマ目。口を開いた状態。"),
            ("talk", "口パク3コマ目。口を閉じた状態。"),
            ("talk", "口パク4コマ目。口を大きめに開いた状態。"),
            ("talk", "口パク5コマ目。口を閉じた状態。"),
            ("blink", "まばたき1コマ目。"),
            ("blink", "まばたき2コマ目。"),
        ],
    },
    {
        "id": "chris_cry",
        "character": "chris",
        "source": "chris_cry.aseprite",
        "description": "クリスくんの泣き差分。",
        "frames": [
            ("sad", "腕を組んで目を閉じた悲しい表情。"),
            ("cry", "腕を組んで涙を流すポーズ。"),
            ("wail", "両手を上げて泣き叫ぶポーズ。口を開いた状態。"),
            ("wail", "両手を上げて泣き叫ぶポーズ。口を閉じた状態。"),
        ],
    },
    {
        "id": "navi_ain",
        "character": "navi_ain",
        "source": "navi_ain.aseprite",
        "description": "マインちゃんの基本立ち絵とポーズ/表情差分。指し棒を持ったナビゲーター姿。",
        "frames": [
            ("pointer_up", "指し棒を斜め上に構えた基本の立ちポーズ。"),
            ("arms_crossed", "指し棒を持ったまま腕を組んだポーズ。"),
            ("both_arms_up", "両手を上げて指し棒を掲げるポーズ。"),
            ("wave", "片手を上げて挨拶するポーズ。指し棒は下向きになります。"),
            ("hands_to_face", "両手を顔の横に上げたポーズ。驚きや照れの表現に使えます。"),
            ("wink", "ウインクして笑う表情差分。"),
            ("smile", "微笑む表情差分。"),
            ("talk", "口を開けて話す表情差分。"),
            ("sparkle", "ひらめき/感動を表すキラキラ演出付きの表情差分。"),
            ("cry", "涙を流す表情差分。"),
            ("teary", "涙目で困った表情差分。"),
            ("idle", "待機ループ1コマ目。目を開いた基本表情。"),
            ("blink", "待機ループ2コマ目。まばたき。"),
            ("blink", "待機ループ3コマ目。まばたき。"),
            ("talk", "口を開いた表情差分。"),
        ],
    },
    {
        "id": "navi_ain_greeting",
        "character": "navi_ain",
        "source": "navi_ain_greeting.aseprite",
        "description": "マインちゃんの挨拶ポーズ差分。キラキラ演出付きのコマを含みます。",
        "frames": [
            ("greet_sparkle", "片手を上げた挨拶ポーズ。キラキラ演出付きで口を閉じた状態。"),
            ("greet_sparkle", "片手を上げた挨拶ポーズ。キラキラ演出付きで口を開いた状態。"),
            ("greet", "片手を上げた挨拶ポーズ。口を閉じた状態。"),
            ("greet", "片手を上げた挨拶ポーズ。口を開いた状態。"),
            ("greet", "片手を上げた挨拶ポーズ。口を閉じた状態。"),
            ("greet", "片手を上げた挨拶ポーズ。口を開いた状態。"),
        ],
    },
    {
        "id": "navi_ain_speak",
        "character": "navi_ain",
        "source": "navi_ain_speak.aseprite",
        "description": "マインちゃんの口パク（リップシンク）用差分。指し棒を構えた基本ポーズ。",
        "frames": [
            ("talk", "口パク1コマ目。口を閉じた状態。"),
            ("talk", "口パク2コマ目。口を開いた状態。"),
            ("blink", "まばたき1コマ目。"),
            ("blink", "まばたき2コマ目。"),
        ],
    },
    {
        "id": "navi_ain_cross",
        "character": "navi_ain",
        "source": "navi_ain_cross.aseprite",
        "description": "マインちゃんの腕組みポーズ差分。",
        "frames": [
            ("talk", "腕を組んだまま口を開けて話すポーズ。"),
            ("smile", "腕を組んで微笑むポーズ。"),
            ("blink", "まばたき1コマ目。"),
            ("blink", "まばたき2コマ目。"),
        ],
    },
    {
        "id": "maycri",
        "character": "maycri",
        "source": "maycri.aseprite",
        "description": "マスコットキャラクターの待機アニメーション。目の表情差分で構成しています。",
        "frames": [
            ("eyes_blank", "基本コマ。瞳のない表情。"),
            ("eyes_small", "片目に小さな瞳が入った表情差分。"),
            ("eyes_wide", "両目に丸い瞳が入った表情差分。"),
            ("eyes_thin", "細い瞳の表情差分。"),
            ("eyes_blank", "待機ループ1コマ目。瞳のない基本の表情。"),
            ("blink", "待機ループ2コマ目。目を閉じた表情。"),
            ("eyes_small", "待機ループ3コマ目。小さな瞳の表情。"),
        ],
    },
]

CHARACTERS = [
    {
        "id": "chris",
        "name_ja": "クリスくん",
        "name_en": "Chris",
        "description": "マイクリの派生コンテンツや解説動画で利用できるオリジナルキャラクター。ハンチング帽とベストを身につけた緑髪の少年。",
    },
    {
        "id": "navi_ain",
        "name_ja": "マインちゃん",
        "name_en": "Mine",
        "description": "マイクリの派生コンテンツや解説動画で利用できるオリジナルキャラクター。白衣と指し棒で解説を担当するナビゲーター役の少女。",
    },
    {
        "id": "maycri",
        "name_ja": "マイクリ",
        "name_en": "Maycri",
        "description": "メガホンを持った丸いマスコットキャラクター。クリスくん/マインちゃんと同じ納品に含まれるオリジナル素材です。",
        "name_note": "名称はソースファイル名 `maycri.aseprite` 由来の暫定表記です。正式名称が決まり次第更新してください。",
    },
]

USAGE_NOTE = (
    "クリスくん/マインちゃんは本リポジトリオーナーがデザインの著作権込みで委託・納品を受けたオリジナルキャラクターです。"
    "マイクリの派生コンテンツや解説動画で利用でき、自作・改変や他のイラストレーターへの依頼も含めて自由に利用できます。"
    "マイクリ公式の画像ではないため、公式デザインガイドラインの「マイクリ画像」の制約対象ではありません。"
)
CREDIT_NOTE = "クレジット表記は任意です。記載する場合は「%s」としてください。" % CREDIT_TEXT


def main():
    os.makedirs(IMAGE_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    sets_by_character = {character["id"]: [] for character in CHARACTERS}
    total_frames = 0
    exported_filenames = set()

    for sprite_set in SPRITE_SETS:
        source_path = os.path.join(SOURCE_DIR, sprite_set["source"])
        ase = AsepriteFile(source_path)
        if ase.frame_count != len(sprite_set["frames"]):
            raise ValueError(
                "%s has %d frames but the pose table lists %d."
                % (sprite_set["source"], ase.frame_count, len(sprite_set["frames"]))
            )

        frames = []
        for index, (pose, description) in enumerate(sprite_set["frames"]):
            filename = "%s_%02d_%s.png" % (sprite_set["id"], index, pose)
            exported_filenames.add(filename)
            output_path = os.path.join(IMAGE_DIR, filename)
            write_png(output_path, ase.width, ase.height, ase.render_frame(index))
            payload = open(output_path, "rb").read()
            frames.append(
                {
                    "index": index,
                    "pose": pose,
                    "description": description,
                    "duration_ms": ase.frames[index]["duration"],
                    "filename": filename,
                    "image_file_path": "Image/Characters/%s" % filename,
                    "width": ase.width,
                    "height": ase.height,
                    "size_bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                }
            )
        total_frames += len(frames)

        sets_by_character[sprite_set["character"]].append(
            {
                "id": sprite_set["id"],
                "description": sprite_set["description"],
                "source_file_path": "Image/Characters/Source/%s" % sprite_set["source"],
                "canvas": {"width": ase.width, "height": ase.height},
                "loop_tags": ase.tags,
                "frames": frames,
            }
        )

    # Drop PNGs left over from earlier runs (e.g. after a pose was renamed).
    for filename in sorted(os.listdir(IMAGE_DIR)):
        if filename.endswith(".png") and filename not in exported_filenames:
            os.remove(os.path.join(IMAGE_DIR, filename))
            print("Removed stale %s" % filename)

    characters = []
    for character in CHARACTERS:
        entry = dict(character)
        entry["credit"] = {"required": False, "text": CREDIT_TEXT}
        entry["sprite_sets"] = sets_by_character[character["id"]]
        characters.append(entry)

    with open(os.path.join(DATA_DIR, "characters.json"), "w", encoding="utf-8") as handle:
        json.dump(characters, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    metadata = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "generated_by": "scripts/export_character_sprites.py",
        "total_characters": len(characters),
        "total_sprite_sets": len(SPRITE_SETS),
        "total_frames": total_frames,
        "source_format": "Aseprite (Image/Characters/Source/*.aseprite)",
        "export_note": (
            "各PNGはAsepriteソースの1フレームをRGBAで書き出したものです。"
            "デザイナーの下書き用非表示レイヤーは除外しています。"
        ),
        "pixel_art_note": "ドット絵のため、拡大表示にはニアレストネイバー法（image-rendering: pixelated）を使用してください。",
        "usage_note": USAGE_NOTE,
        "credit_note": CREDIT_NOTE,
        "credit": {"required": False, "text": CREDIT_TEXT},
    }
    with open(os.path.join(DATA_DIR, "metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print("Exported %d frames from %d Aseprite sources." % (total_frames, len(SPRITE_SETS)))


if __name__ == "__main__":
    main()
