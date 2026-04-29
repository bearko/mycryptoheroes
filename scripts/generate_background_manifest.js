#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BACKGROUND_IMAGE_DIR = path.join(ROOT, "Image", "Backgrounds");
const BACKGROUND_DATA_DIR = path.join(ROOT, "Data", "Backgrounds");
const MANIFEST_PATH = path.join(BACKGROUND_DATA_DIR, "backgrounds.json");
const META_PATH = path.join(BACKGROUND_DATA_DIR, "metadata.json");

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (!buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`${filePath} is not a PNG file.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
    size_bytes: buffer.length,
  };
}

function main() {
  fs.mkdirSync(BACKGROUND_DATA_DIR, { recursive: true });
  const files = fs
    .readdirSync(BACKGROUND_IMAGE_DIR)
    .filter((file) => file.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const backgrounds = files.map((file) => {
    const filePath = path.join(BACKGROUND_IMAGE_DIR, file);
    const dimensions = pngDimensions(filePath);
    return {
      id: path.basename(file, ".png"),
      filename: file,
      image_file_path: `Image/Backgrounds/${file}`,
      ...dimensions,
      orientation: dimensions.height >= dimensions.width ? "portrait" : "landscape",
      usage_note:
        "Battle background image. Use as-is in portrait layouts; for landscape layouts, enlarge/crop around the center.",
    };
  });

  const hashGroups = backgrounds.reduce((groups, background) => {
    const group = groups.get(background.sha256) || [];
    group.push(background.filename);
    groups.set(background.sha256, group);
    return groups;
  }, new Map());
  const duplicate_groups = [...hashGroups.values()].filter((group) => group.length > 1);

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(backgrounds, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_backgrounds: backgrounds.length,
        duplicate_groups,
        note:
          "Background assets are managed with special permission from MCH Co.Ltd. They are not listed as covered assets in the public design guideline.",
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${backgrounds.length} background records with ${duplicate_groups.length} duplicate groups.`);
}

main();
