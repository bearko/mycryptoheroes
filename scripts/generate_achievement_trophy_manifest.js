#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "MCH社より受領（2026-10-21、Google Drive経由）";
// Names and award conditions keyed by achievementType, as received from MCH.
const TYPES_PATH = path.join(ROOT, "Data", "Achievements", "achievement_types.json");
// "Please wait for the reveal." placeholder art shipped for achievements whose art is not yet revealed.
const PLACEHOLDER_SHA256 = "60dcf9a47dd4014c8859de407fb2c4a8ef9f2ade5524a32fa0739f958a868a12";

const KINDS = [
  {
    key: "achievements",
    label: "アチーブメント",
    prefix: "piece",
    category: "Piece",
    imageDir: "Achievements",
    dataDir: "Achievements",
    manifest: "achievements.json",
    csv: "achievements.csv",
  },
  {
    key: "trophies",
    label: "トロフィー",
    prefix: "trophy",
    category: "Trophy",
    imageDir: "Trophies",
    dataDir: "Trophies",
    manifest: "trophies.json",
    csv: "trophies.csv",
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

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, records) {
  const columns = [
    ["id", (record) => record.id],
    ["category", (record) => record.category],
    ["name_ja", (record) => record.name?.ja],
    ["name_en", (record) => record.name?.en],
    ["acquisition_condition_ja", (record) => record.acquisition_condition?.ja],
    ["acquisition_condition_en", (record) => record.acquisition_condition?.en],
    ["image_file_path", (record) => record.image_file_path],
    ["is_placeholder", (record) => record.is_placeholder],
  ];
  const rows = [columns.map(([name]) => csvEscape(name)).join(",")];
  for (const record of records) {
    rows.push(columns.map(([, getter]) => csvEscape(getter(record))).join(","));
  }
  fs.writeFileSync(filePath, `${rows.join("\n")}\n`);
}

// "None" in the source means the type has no separate award condition (e.g. tournament placings).
function localized(text) {
  if (!text || text.ja === "None" || (!text.ja && !text.en)) return null;
  return { ja: text.ja || null, en: text.en || null };
}

function writeKind(kind, types) {
  const imageDir = path.join(ROOT, "Image", kind.imageDir);
  const dataDir = path.join(ROOT, "Data", kind.dataDir);
  const pattern = new RegExp(`^${kind.prefix}_(\\d+)\\.png$`);
  fs.mkdirSync(dataDir, { recursive: true });

  const typeById = new Map(
    types.filter((type) => type.achievementCategory === kind.category).map((type) => [type.achievementType, type])
  );
  const imageById = new Map(
    fs
      .readdirSync(imageDir)
      .filter((file) => pattern.test(file))
      .map((file) => [Number(file.match(pattern)[1]), file])
  );
  const ids = [...new Set([...typeById.keys(), ...imageById.keys()])].sort((a, b) => a - b);

  const records = ids.map((id) => {
    const type = typeById.get(id);
    const file = imageById.get(id);
    const imageFilePath = file ? `Image/${kind.imageDir}/${file}` : null;
    const info = file
      ? pngInfo(path.join(ROOT, imageFilePath))
      : { width: null, height: null, size_bytes: null, sha256: null };
    return {
      id,
      category: kind.category,
      filename: file || null,
      image_file_path: imageFilePath,
      is_placeholder: info.sha256 === PLACEHOLDER_SHA256,
      name: type ? localized(type.name) : null,
      acquisition_condition: type ? localized(type.terms) : null,
      description: `ゲーム内の大会成績や獲得条件の達成を称える称号「${kind.label}」のアート。`,
      ...info,
    };
  });
  const withImages = records.filter((record) => record.image_file_path);

  const hashGroups = {};
  for (const record of withImages) {
    (hashGroups[record.sha256] = hashGroups[record.sha256] || []).push(record.filename);
  }
  const duplicateGroups = Object.values(hashGroups).filter((files) => files.length > 1);
  const sizes = {};
  for (const record of withImages) {
    const size = `${record.width}x${record.height}`;
    sizes[size] = (sizes[size] || 0) + 1;
  }

  fs.writeFileSync(path.join(dataDir, kind.manifest), `${JSON.stringify(records, null, 2)}\n`);
  writeCsv(path.join(dataDir, kind.csv), records);
  fs.writeFileSync(
    path.join(dataDir, "metadata.json"),
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        generated_by: "scripts/generate_achievement_trophy_manifest.js",
        source: SOURCE,
        types_source: "Data/Achievements/achievement_types.json",
        [`total_${kind.key}`]: records.length,
        total_images: withImages.length,
        ids_without_image: records.filter((record) => !record.image_file_path).map((record) => record.id),
        ids_without_type: records.filter((record) => !typeById.has(record.id)).map((record) => record.id),
        placeholder_count: records.filter((record) => record.is_placeholder).length,
        image_sizes: sizes,
        filename_note: `ファイル名は受領時の名前（${kind.prefix}_[ID].png）を維持しています。id はファイル名の数値部分です。`,
        acquisition_condition_note:
          "名称と獲得条件は achievement_types.json の achievementType とIDで紐づけています。獲得条件が \"None\"（大会順位などで付与されるもの）は acquisition_condition を null にしています。",
        ids_note:
          "ids_without_image は名称・条件はあるが画像がないID、ids_without_type は画像はあるが名称・条件がないIDです。",
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

const types = JSON.parse(fs.readFileSync(TYPES_PATH, "utf8"));
KINDS.forEach((kind) => writeKind(kind, types));
