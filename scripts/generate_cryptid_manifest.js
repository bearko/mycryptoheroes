#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CRYPTID_IMAGE_DIR = path.join(ROOT, "Image", "Cryptids");
const CRYPTID_DATA_DIR = path.join(ROOT, "Data", "Cryptids");
const MANIFEST_PATH = path.join(CRYPTID_DATA_DIR, "cryptids.json");
const META_PATH = path.join(CRYPTID_DATA_DIR, "metadata.json");

function pngInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`${filePath} is not a PNG file.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    size_bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function main() {
  fs.mkdirSync(CRYPTID_DATA_DIR, { recursive: true });
  const cryptids = fs
    .readdirSync(CRYPTID_IMAGE_DIR)
    .filter((file) => /^\d+_[^.]+\.png$/.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => {
      const [, orderText, landName] = file.match(/^(\d+)_([^.]+)\.png$/);
      const imageFilePath = `Image/Cryptids/${file}`;
      return {
        id: Number(orderText),
        land_name: landName,
        filename: file,
        image_file_path: imageFilePath,
        description: `マイクリ内のゲーム内ギルド「ランド」${landName}の守護神的な存在である「クリプタイド」のアイコン。`,
        ...pngInfo(path.join(ROOT, imageFilePath)),
      };
    });

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(cryptids, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_cryptids: cryptids.length,
        note: "The land name is parsed from each filename after removing the leading sequence number.",
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${cryptids.length} cryptid icon records.`);
}

main();
