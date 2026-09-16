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
GIF_DIR = os.path.join(IMAGE_DIR, "Gif")
DATA_DIR = os.path.join(ROOT, "Data", "Characters")

DEFAULT_CREDIT_TEXT = "ドット絵：こじもこ"
MAYCRI_CREDIT_TEXT = "原画：こはるさん／ドット絵：こじもこさん"


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


class _BitWriter:
    """Packs LZW codes of varying bit width into a GIF sub-block stream."""

    def __init__(self):
        self.chunks = bytearray()
        self.accumulator = 0
        self.bit_count = 0

    def write(self, code, width):
        self.accumulator |= code << self.bit_count
        self.bit_count += width
        while self.bit_count >= 8:
            self.chunks.append(self.accumulator & 0xFF)
            self.accumulator >>= 8
            self.bit_count -= 8

    def finish(self):
        if self.bit_count:
            self.chunks.append(self.accumulator & 0xFF)
            self.accumulator = 0
            self.bit_count = 0
        blocks = bytearray()
        for start in range(0, len(self.chunks), 255):
            block = self.chunks[start : start + 255]
            blocks.append(len(block))
            blocks += block
        blocks.append(0)
        return bytes(blocks)


def lzw_encode(indexes, min_code_size):
    clear_code = 1 << min_code_size
    end_code = clear_code + 1
    writer = _BitWriter()
    table = {}
    code_size = 0
    next_code = 0

    def reset_table():
        table.clear()
        table.update({bytes([value]): value for value in range(clear_code)})
        return min_code_size + 1, end_code + 1

    code_size, next_code = reset_table()
    writer.write(clear_code, code_size)
    prefix = b""
    for value in indexes:
        candidate = prefix + bytes([value])
        if candidate in table:
            prefix = candidate
            continue
        writer.write(table[prefix], code_size)
        if next_code < 4096:
            table[candidate] = next_code
            next_code += 1
            if next_code > (1 << code_size) and code_size < 12:
                code_size += 1
        else:
            writer.write(clear_code, code_size)
            code_size, next_code = reset_table()
        prefix = bytes([value])
    if prefix:
        writer.write(table[prefix], code_size)
    writer.write(end_code, code_size)
    return min_code_size, writer.finish()


def write_gif(path, width, height, frames):
    """Write a looping GIF89a. `frames` is a list of (rgba bytes, duration_ms).

    The sprites use binary alpha and few colors, so every color gets its own
    palette slot and index 0 is reserved for transparency: no quantization.
    """
    palette_index = {}
    palette = []
    for rgba, _ in frames:
        for offset in range(0, len(rgba), 4):
            if rgba[offset + 3] == 0:
                continue
            color = bytes(rgba[offset : offset + 3])
            if color not in palette_index:
                palette_index[color] = len(palette) + 1
                palette.append(color)
    if len(palette) + 1 > 256:
        raise ValueError("%s needs more than 256 palette entries." % path)

    table_size = 2
    while table_size < len(palette) + 1:
        table_size *= 2
    bits = table_size.bit_length() - 1

    out = bytearray(b"GIF89a")
    out += struct.pack("<HHBBB", width, height, 0xF0 | (bits - 1), 0, 0)
    out += b"\x00\x00\x00"  # index 0 = transparent
    for color in palette:
        out += color
    out += b"\x00\x00\x00" * (table_size - len(palette) - 1)
    out += b"\x21\xff\x0bNETSCAPE2.0\x03\x01\x00\x00\x00"  # loop forever

    min_code_size = max(2, bits)
    for rgba, duration_ms in frames:
        indexes = bytearray(width * height)
        for pixel in range(width * height):
            offset = pixel * 4
            if rgba[offset + 3] != 0:
                indexes[pixel] = palette_index[bytes(rgba[offset : offset + 3])]
        # Disposal method 2 (restore to background) keeps transparency correct.
        out += b"\x21\xf9\x04\x09" + struct.pack("<HBB", int(round(duration_ms / 10.0)), 0, 0)
        out += b"\x2c" + struct.pack("<HHHHB", 0, 0, width, height, 0)
        code_size, data = lzw_encode(indexes, min_code_size)
        out.append(code_size)
        out += data
    out += b"\x3b"

    with open(path, "wb") as handle:
        handle.write(bytes(out))


# --------------------------------------------------------------------------
# Pose table: one entry per frame of each Aseprite source.
# --------------------------------------------------------------------------
SPRITE_SETS = [
    {
        "id": "chris",
        "character": "chris",
        "source": "chris.aseprite",
        "description": "クリスくんの基本立ち絵とポーズ/表情差分。",
        "loop_name": "待機（まばたき）ループ",
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
        "loop_name": "口パク（リップシンク）ループ",
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
        "loop_name": "泣き叫びループ",
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
        "loop_name": "待機（まばたき）ループ",
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
        "loop_name": "挨拶ループ（キラキラ演出付き）",
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
        "loop_name": "口パク（リップシンク）ループ",
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
        "loop_name": "腕組み待機ループ",
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
        "loop_name": "待機ループ",
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
        "credit_text": DEFAULT_CREDIT_TEXT,
    },
    {
        "id": "navi_ain",
        "name_ja": "マインちゃん",
        "name_en": "Mine",
        "description": "マイクリの派生コンテンツや解説動画で利用できるオリジナルキャラクター。白衣と指し棒で解説を担当するナビゲーター役の少女。",
        "credit_text": DEFAULT_CREDIT_TEXT,
    },
    {
        "id": "maycri",
        "name_ja": "マイクリくん",
        "name_en": "MCH",
        "description": "マイクリの派生コンテンツや解説動画で利用できるオリジナルキャラクター。メガホンを持った丸いマスコット。",
        "credit_text": MAYCRI_CREDIT_TEXT,
    },
]

USAGE_NOTE = (
    "クリスくん/マインちゃん/マイクリくんは本リポジトリオーナーがデザインの著作権込みで委託・納品を受けたオリジナルキャラクターです。"
    "マイクリの派生コンテンツや解説動画で利用でき、自作・改変や他のイラストレーターへの依頼も含めて自由に利用できます。"
    "マイクリ公式の画像ではないため、公式デザインガイドラインの「マイクリ画像」の制約対象ではありません。"
)
CREDIT_NOTE = (
    "クレジット表記は任意です。記載する場合は、クリスくん/マインちゃんは「%s」、"
    "マイクリくんは「%s」としてください。各キャラクターの表記は characters.json の credit にも記録しています。"
    % (DEFAULT_CREDIT_TEXT, MAYCRI_CREDIT_TEXT)
)


def build_animation(sprite_set, ase, frames, rendered, animation_id, name, description, frame_indexes):
    """Describe one playable sequence and write its reference GIF."""
    gif_filename = "%s.gif" % animation_id
    write_gif(
        os.path.join(GIF_DIR, gif_filename),
        ase.width,
        ase.height,
        [(rendered[index], frames[index]["duration_ms"]) for index in frame_indexes],
    )
    payload = open(os.path.join(GIF_DIR, gif_filename), "rb").read()
    return {
        "id": animation_id,
        "name": name,
        "description": description,
        "frame_indexes": list(frame_indexes),
        "total_duration_ms": sum(frames[index]["duration_ms"] for index in frame_indexes),
        "loop": True,
        "gif_filename": gif_filename,
        "gif_file_path": "Image/Characters/Gif/%s" % gif_filename,
        "gif_size_bytes": len(payload),
        "gif_sha256": hashlib.sha256(payload).hexdigest(),
        "frames": [
            {
                "index": index,
                "duration_ms": frames[index]["duration_ms"],
                "filename": frames[index]["filename"],
                "image_file_path": frames[index]["image_file_path"],
            }
            for index in frame_indexes
        ],
    }


def main():
    os.makedirs(IMAGE_DIR, exist_ok=True)
    os.makedirs(GIF_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

    sets_by_character = {character["id"]: [] for character in CHARACTERS}
    total_frames = 0
    total_animations = 0
    exported_filenames = set()
    exported_gif_filenames = set()

    for sprite_set in SPRITE_SETS:
        source_path = os.path.join(SOURCE_DIR, sprite_set["source"])
        ase = AsepriteFile(source_path)
        if ase.frame_count != len(sprite_set["frames"]):
            raise ValueError(
                "%s has %d frames but the pose table lists %d."
                % (sprite_set["source"], ase.frame_count, len(sprite_set["frames"]))
            )

        frames = []
        rendered = []
        for index, (pose, description) in enumerate(sprite_set["frames"]):
            filename = "%s_%02d_%s.png" % (sprite_set["id"], index, pose)
            exported_filenames.add(filename)
            output_path = os.path.join(IMAGE_DIR, filename)
            rendered.append(ase.render_frame(index))
            write_png(output_path, ase.width, ase.height, rendered[index])
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

        # Playable sequences: the Aseprite loop tag, plus a preview of every frame.
        animations = []
        loop_tag = ase.tags[0] if ase.tags else None
        loop_indexes = (
            list(range(loop_tag["from"], loop_tag["to"] + 1))
            if loop_tag
            else list(range(len(frames)))
        )
        animations.append(
            build_animation(
                sprite_set,
                ase,
                frames,
                rendered,
                "%s_loop" % sprite_set["id"],
                sprite_set["loop_name"],
                "Asepriteのループタグで指定された区間。コマ%s〜%sを順番に繰り返します。"
                % (loop_indexes[0], loop_indexes[-1]),
                loop_indexes,
            )
        )
        if len(loop_indexes) != len(frames):
            animations.append(
                build_animation(
                    sprite_set,
                    ase,
                    frames,
                    rendered,
                    "%s_all" % sprite_set["id"],
                    "全コマ（お手本用）",
                    "この差分セットの全コマを順番に再生するプレビュー。個別の差分を確認する用途です。",
                    list(range(len(frames))),
                )
            )
        for animation in animations:
            exported_gif_filenames.add(animation["gif_filename"])
        total_animations += len(animations)

        sets_by_character[sprite_set["character"]].append(
            {
                "id": sprite_set["id"],
                "description": sprite_set["description"],
                "source_file_path": "Image/Characters/Source/%s" % sprite_set["source"],
                "canvas": {"width": ase.width, "height": ase.height},
                "loop_tags": ase.tags,
                "animations": animations,
                "frames": frames,
            }
        )

    # Drop files left over from earlier runs (e.g. after a pose was renamed).
    for filename in sorted(os.listdir(IMAGE_DIR)):
        if filename.endswith(".png") and filename not in exported_filenames:
            os.remove(os.path.join(IMAGE_DIR, filename))
            print("Removed stale %s" % filename)
    for filename in sorted(os.listdir(GIF_DIR)):
        if filename.endswith(".gif") and filename not in exported_gif_filenames:
            os.remove(os.path.join(GIF_DIR, filename))
            print("Removed stale %s" % filename)

    characters = []
    for character in CHARACTERS:
        entry = dict(character)
        entry["credit"] = {"required": False, "text": entry.pop("credit_text")}
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
        "total_animations": total_animations,
        "source_format": "Aseprite (Image/Characters/Source/*.aseprite)",
        "export_note": (
            "各PNGはAsepriteソースの1フレームをRGBAで書き出したものです。"
            "デザイナーの下書き用非表示レイヤーは除外しています。"
        ),
        "animation_note": (
            "PNGのつながりは characters.json の animations に定義しています。"
            "`<差分セットID>_loop` がAsepriteのループタグ区間、`<差分セットID>_all` が全コマのプレビューです。"
            "同じ内容を Image/Characters/Gif/ にアニメーションGIFとしても書き出しています。"
        ),
        "pixel_art_note": "ドット絵のため、拡大表示にはニアレストネイバー法（image-rendering: pixelated）を使用してください。",
        "usage_note": USAGE_NOTE,
        "credit_note": CREDIT_NOTE,
        "credit": {
            "required": False,
            "by_character": {character["id"]: character["credit_text"] for character in CHARACTERS},
        },
    }
    with open(os.path.join(DATA_DIR, "metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(
        "Exported %d frames and %d animations from %d Aseprite sources."
        % (total_frames, total_animations, len(SPRITE_SETS))
    )


if __name__ == "__main__":
    main()
