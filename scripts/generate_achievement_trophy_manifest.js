#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "MCH社より受領（2026-10-21、Google Drive経由）";
// "Please wait for the reveal." placeholder art shipped for achievements whose art is not yet revealed.
const PLACEHOLDER_SHA256 = "60dcf9a47dd4014c8859de407fb2c4a8ef9f2ade5524a32fa0739f958a868a12";

const KINDS = [
  {
    key: "achievements",
    label: "アチーブメント",
    prefix: "piece",
    imageDir: "Achievements",
    dataDir: "Achievements",
    manifest: "achievements.json",
  },
  {
    key: "trophies",
    label: "トロフィー",
    prefix: "trophy",
    imageDir: "Trophies",
    dataDir: "Trophies",
    manifest: "trophies.json",
  },
];

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

function writeKind(kind) {
  const imageDir = path.join(ROOT, "Image", kind.imageDir);
  const dataDir = path.join(ROOT, "Data", kind.dataDir);
  const pattern = new RegExp(`^${kind.prefix}_(\\d+)\\.png$`);
  fs.mkdirSync(dataDir, { recursive: true });

  const records = fs
    .readdirSync(imageDir)
    .filter((file) => pattern.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => {
      const [, id] = file.match(pattern);
      const imageFilePath = `Image/${kind.imageDir}/${file}`;
      const info = pngInfo(path.join(ROOT, imageFilePath));
      return {
        id: Number(id),
        filename: file,
        image_file_path: imageFilePath,
        is_placeholder: info.sha256 === PLACEHOLDER_SHA256,
        // Acquisition conditions are still being confirmed with MCH.
        name: null,
        acquisition_condition: null,
        description: `ゲーム内の大会成績や獲得条件の達成を称える称号「${kind.label}」のアート。`,
        ...info,
      };
    });

  const hashGroups = {};
  for (const record of records) {
    (hashGroups[record.sha256] = hashGroups[record.sha256] || []).push(record.filename);
  }
  const duplicateGroups = Object.values(hashGroups).filter((files) => files.length > 1);
  const sizes = {};
  for (const record of records) {
    const size = `${record.width}x${record.height}`;
    sizes[size] = (sizes[size] || 0) + 1;
  }

  fs.writeFileSync(path.join(dataDir, kind.manifest), `${JSON.stringify(records, null, 2)}\n`);
  fs.writeFileSync(
    path.join(dataDir, "metadata.json"),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        generated_by: "scripts/generate_achievement_trophy_manifest.js",
        source: SOURCE,
        [`total_${kind.key}`]: records.length,
        placeholder_count: records.filter((record) => record.is_placeholder).length,
        image_sizes: sizes,
        filename_note: `ファイル名は受領時の名前（${kind.prefix}_[ID].png）を維持しています。id はファイル名の数値部分です。`,
        acquisition_condition_note:
          "名称と獲得条件はMCH社に確認中のため、現時点では name / acquisition_condition を null にしています。",
        placeholder_note:
          "is_placeholder が true の画像は「Please wait for the reveal.」と書かれた未公開用の仮アートです。",
        duplicate_image_groups: duplicateGroups,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${records.length} ${kind.key} records.`);
}

KINDS.forEach(writeKind);
