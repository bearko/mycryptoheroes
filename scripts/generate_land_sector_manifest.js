#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const SECTOR_IMAGE_DIR = path.join(ROOT, "Image", "LandSectors");
const SECTOR_DATA_DIR = path.join(ROOT, "Data", "LandSectors");
const MANIFEST_PATH = path.join(SECTOR_DATA_DIR, "land_sectors.json");
const META_PATH = path.join(SECTOR_DATA_DIR, "metadata.json");

const RARITY_ORDER = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
// Land names and their order follow Image/Cryptids (01_Ocean.png ...).
const LANDS = [
  [1, "Ocean"],
  [2, "Strawberry"],
  [3, "Tangerine"],
  [4, "Lime"],
  [5, "Graphite"],
  [6, "Grape"],
  [7, "Sage"],
  [8, "Blueberry"],
  [9, "Ruby"],
];

function readChunks(buffer) {
  if (!buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("Not a PNG file.");
  }
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: buffer.slice(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return chunks;
}

/** Color of the top-left pixel, which is the land-colored background. */
function backgroundColor(buffer) {
  const chunks = readChunks(buffer);
  const header = chunks.find((chunk) => chunk.type === "IHDR").data;
  const bitDepth = header.readUInt8(8);
  const colorType = header.readUInt8(9);
  const interlace = header.readUInt8(12);
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}).`);
  }
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const raw = zlib.inflateSync(idat);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  // Only the first pixel is needed. On row 0 every filter references a zero row,
  // so Sub/Up/Average/Paeth all leave the first pixel's bytes unchanged.
  const filter = raw.readUInt8(0);
  if (filter > 4) {
    throw new Error(`Unknown PNG filter type ${filter}.`);
  }
  const pixel = raw.slice(1, 1 + bytesPerPixel);
  return `#${pixel.slice(0, 3).toString("hex")}`;
}

function pngInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    background_color: backgroundColor(buffer),
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    size_bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function main() {
  fs.mkdirSync(SECTOR_DATA_DIR, { recursive: true });
  const sectors = fs
    .readdirSync(SECTOR_IMAGE_DIR)
    .filter((file) => /^\d+_[^_]+_\d+_[^.]+\.png$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => {
      const [, landOrder, landName, rarityId, rarityName] = file.match(/^(\d+)_([^_]+)_(\d+)_([^.]+)\.png$/);
      const known = LANDS.find(([, name]) => name === landName);
      if (!known || Number(landOrder) !== known[0]) {
        throw new Error(`${file}: unknown land or wrong land number.`);
      }
      if (RARITY_ORDER[Number(rarityId) - 1] !== rarityName) {
        throw new Error(`${file}: rarity ${rarityId} should be ${RARITY_ORDER[Number(rarityId) - 1]}.`);
      }
      const imageFilePath = `Image/LandSectors/${file}`;
      return {
        id: `${landName.toLowerCase()}_${rarityName.toLowerCase()}`,
        land_id: Number(landOrder),
        land_name: landName,
        rarity_id: Number(rarityId),
        rarity_name: rarityName,
        filename: file,
        image_file_path: imageFilePath,
        description: `マイクリ内のゲーム内ギルド「ランド」${landName}のランドセクタアイコン（${rarityName}）。`,
        ...pngInfo(path.join(ROOT, imageFilePath)),
      };
    });

  const landsWithIcons = [...new Set(sectors.map((sector) => sector.land_name))];
  const pendingLands = LANDS.map(([, name]) => name).filter((name) => !landsWithIcons.includes(name));

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(sectors, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        generated_by: "scripts/generate_land_sector_manifest.js",
        total_land_sectors: sectors.length,
        expected_total_land_sectors: LANDS.length * RARITY_ORDER.length,
        rarity_order: RARITY_ORDER,
        lands_with_icons: landsWithIcons,
        lands_pending: pendingLands,
        canvas: { width: 64, height: 64 },
        filename_note:
          "ファイル名は [ランド連番]_[ランド名]_[レアリティID]_[レアリティ名].png です。ランド連番はImage/Cryptidsと揃えています。",
        background_note:
          "各アイコンの背景色はランドカラーで、背景は透過ではなく不透明です。background_color は左上ピクセルの色です。",
        pixel_art_note:
          "ドット絵のため、拡大表示にはニアレストネイバー法（image-rendering: pixelated）を使用してください。",
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${sectors.length} land sector icon records (${pendingLands.length} lands pending).`);
}

main();
