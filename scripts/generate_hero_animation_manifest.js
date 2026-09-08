#!/usr/bin/env node

// Image/HeroAnimations/<frame_size>/<heroId>/*.png を走査して、
// Data/HeroAnimations/hero_animations.json と metadata.json を生成する。
//
//   node scripts/generate_hero_animation_manifest.js          マニフェストを書き出す
//   node scripts/generate_hero_animation_manifest.js --check  書き出さずに内容だけ確認する
//
// ファイル名の規約は Data/HeroAnimations/README.md を参照。

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ANIMATION_IMAGE_ROOT = path.join(ROOT, "Image", "HeroAnimations");
const ANIMATION_DATA_DIR = path.join(ROOT, "Data", "HeroAnimations");
const MANIFEST_PATH = path.join(ANIMATION_DATA_DIR, "hero_animations.json");
const META_PATH = path.join(ANIMATION_DATA_DIR, "metadata.json");
const HEROES_PATH = path.join(ROOT, "Data", "Heroes", "heroes.json");

// 8方向。key がファイル名で使う正式な向きの表記。
const DIRECTIONS = [
  { key: "s", label: { ja: "下", en: "South" }, vector: [0, 1], aliases: ["south", "down", "front", "d"] },
  { key: "se", label: { ja: "右下", en: "South East" }, vector: [1, 1], aliases: ["southeast", "downright", "dr"] },
  { key: "e", label: { ja: "右", en: "East" }, vector: [1, 0], aliases: ["east", "right", "r"] },
  { key: "ne", label: { ja: "右上", en: "North East" }, vector: [1, -1], aliases: ["northeast", "upright", "ur"] },
  { key: "n", label: { ja: "上", en: "North" }, vector: [0, -1], aliases: ["north", "up", "back", "u"] },
  { key: "nw", label: { ja: "左上", en: "North West" }, vector: [-1, -1], aliases: ["northwest", "upleft", "ul"] },
  { key: "w", label: { ja: "左", en: "West" }, vector: [-1, 0], aliases: ["west", "left", "l"] },
  { key: "sw", label: { ja: "左下", en: "South West" }, vector: [-1, 1], aliases: ["southwest", "downleft", "dl"] },
];

// 左向きが無い場合に、右向きを左右反転して使うための対応表。
const DIRECTION_MIRROR = { nw: "ne", w: "e", sw: "se" };

// よくある表記ゆれを正式なモーション名に寄せる。ここに無いモーション名は
// そのまま採用するので、新しいモーションを追加しても表を触らずに動く。
const MOTION_ALIASES = {
  idle: "idle",
  stand: "idle",
  wait: "idle",
  walk: "walk",
  move: "walk",
  attack: "attack",
  attak: "attack",
  atack: "attack",
  atk: "attack",
  run: "run",
  dash: "run",
  hurt: "hurt",
  damage: "hurt",
  die: "die",
  death: "die",
  cast: "cast",
  skill: "cast",
};

const MOTION_LABELS = {
  idle: { ja: "待機", en: "Idle" },
  walk: { ja: "歩行", en: "Walk" },
  attack: { ja: "攻撃", en: "Attack" },
  run: { ja: "走り", en: "Run" },
  hurt: { ja: "被弾", en: "Hurt" },
  die: { ja: "戦闘不能", en: "Die" },
  cast: { ja: "スキル発動", en: "Cast" },
};

const directionByAlias = new Map();
DIRECTIONS.forEach((direction) => {
  directionByAlias.set(direction.key, direction.key);
  direction.aliases.forEach((alias) => directionByAlias.set(alias, direction.key));
});

function readPng(filePath) {
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

// "16x32" のようなフォルダ名から1コマのサイズを取り出す。
function parseFrameSize(directoryName) {
  const matched = /^(\d+)x(\d+)$/.exec(directoryName);
  if (!matched) return null;
  return { frame_width: Number(matched[1]), frame_height: Number(matched[2]) };
}

// "attack_se.png" -> { motion: "attack", direction: "se" }
// "idle.png"      -> { motion: "idle", direction: null }  (全方向が行方向に並ぶシート)
// "10001_walk_n.png" のようにヒーローIDが前置されていても解釈できる。
function parseFileName(fileName, heroId) {
  const base = path.basename(fileName, path.extname(fileName)).toLowerCase();
  let tokens = base.split(/[_\-\s.]+/).filter(Boolean);
  if (tokens.length > 1 && (tokens[0] === String(heroId) || tokens[0] === `prod${heroId}`)) tokens = tokens.slice(1);
  if (!tokens.length) return null;

  const last = tokens[tokens.length - 1];
  const direction = directionByAlias.get(last) || null;
  const motionTokens = direction ? tokens.slice(0, -1) : tokens;
  if (!motionTokens.length) return null;

  const rawMotion = motionTokens.join("_");
  return { motion: MOTION_ALIASES[rawMotion] || rawMotion, direction, raw_motion: rawMotion };
}

function listDirectories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function loadHeroIndex() {
  if (!fs.existsSync(HEROES_PATH)) return new Map();
  const heroes = JSON.parse(fs.readFileSync(HEROES_PATH, "utf8"));
  return new Map(heroes.map((hero) => [String(hero.id), hero]));
}

function collectHero(frameSizeDir, frameSize, heroDirName, heroIndex, warnings) {
  const heroDir = path.join(ANIMATION_IMAGE_ROOT, frameSizeDir, heroDirName);
  const relativeDir = `Image/HeroAnimations/${frameSizeDir}/${heroDirName}`;
  const heroId = Number(heroDirName);

  if (!Number.isInteger(heroId)) {
    warnings.push(`${relativeDir}: フォルダ名がヒーローIDの数値ではありません。`);
    return null;
  }
  const master = heroIndex.get(heroDirName) || null;
  if (!master) {
    warnings.push(`${relativeDir}: heroes.json に ID ${heroId} のヒーローが見つかりません。`);
  }

  const files = fs
    .readdirSync(heroDir)
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const motions = new Map();
  files.forEach((file) => {
    const parsed = parseFileName(file, heroId);
    if (!parsed) {
      warnings.push(`${relativeDir}/${file}: ファイル名からモーションを判定できませんでした。`);
      return;
    }

    const png = readPng(path.join(heroDir, file));
    if (png.width % frameSize.frame_width !== 0 || png.height % frameSize.frame_height !== 0) {
      warnings.push(
        `${relativeDir}/${file}: ${png.width}x${png.height} が1コマ ${frameSize.frame_width}x${frameSize.frame_height} で割り切れません。`
      );
      return;
    }

    const columns = png.width / frameSize.frame_width;
    const rows = png.height / frameSize.frame_height;
    if (parsed.direction && rows !== 1) {
      warnings.push(`${relativeDir}/${file}: 方向つきのシートですが ${rows} 行あります。1行を想定しています。`);
    }

    const sheet = {
      direction: parsed.direction,
      filename: file,
      image_file_path: `${relativeDir}/${file}`,
      width: png.width,
      height: png.height,
      columns,
      rows,
      frame_count: parsed.direction ? columns : columns * rows,
      sha256: png.sha256,
      size_bytes: png.size_bytes,
    };
    if (!parsed.direction) {
      // 方向がファイル名に無いシートは、行が direction_order の並びだと解釈する。
      sheet.row_directions = DIRECTIONS.slice(0, rows).map((direction) => direction.key);
    }

    if (!motions.has(parsed.motion)) motions.set(parsed.motion, []);
    motions.get(parsed.motion).push(sheet);
  });

  if (!motions.size) return null;

  const motionRecords = [...motions.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, sheets]) => {
      const present = new Set();
      sheets.forEach((sheet) => {
        if (sheet.direction) present.add(sheet.direction);
        else (sheet.row_directions || []).forEach((direction) => present.add(direction));
      });
      const directions = DIRECTIONS.filter((direction) => present.has(direction.key)).map((d) => d.key);
      // 素材が無い左向きは、対になる右向きを左右反転して使う。
      const mirrored = Object.entries(DIRECTION_MIRROR)
        .filter(([target, source]) => !present.has(target) && present.has(source))
        .map(([target, source]) => ({ direction: target, mirror_of: source }));

      sheets.sort((a, b) => {
        const order = (sheet) => (sheet.direction ? DIRECTIONS.findIndex((d) => d.key === sheet.direction) : -1);
        return order(a) - order(b);
      });

      return {
        key,
        label: MOTION_LABELS[key] || { ja: key, en: key },
        directions,
        mirrored_directions: mirrored,
        frame_count: sheets.reduce((max, sheet) => Math.max(max, sheet.frame_count), 0),
        sheets,
      };
    });

  return {
    hero_id: heroId,
    hero_name: master ? master.name : null,
    hero_image_file_path: master ? master.image_file_path : null,
    frame_size: `${frameSize.frame_width}x${frameSize.frame_height}`,
    frame_width: frameSize.frame_width,
    frame_height: frameSize.frame_height,
    directory: relativeDir,
    motions: motionRecords,
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const heroIndex = loadHeroIndex();
  const warnings = [];
  const heroes = [];
  const frameSizes = [];

  listDirectories(ANIMATION_IMAGE_ROOT).forEach((frameSizeDir) => {
    const frameSize = parseFrameSize(frameSizeDir);
    if (!frameSize) {
      warnings.push(`Image/HeroAnimations/${frameSizeDir}: フォルダ名が "16x32" 形式ではありません。`);
      return;
    }
    frameSizes.push(frameSizeDir);
    listDirectories(path.join(ANIMATION_IMAGE_ROOT, frameSizeDir)).forEach((heroDirName) => {
      const hero = collectHero(frameSizeDir, frameSize, heroDirName, heroIndex, warnings);
      if (hero) heroes.push(hero);
    });
  });

  heroes.sort((a, b) => a.hero_id - b.hero_id || a.frame_size.localeCompare(b.frame_size));

  const manifest = {
    format: {
      sheet_layout:
        "Each PNG is a sprite sheet laid out on a grid of frame_width x frame_height cells, read left to right.",
      direction_order: DIRECTIONS.map((direction) => direction.key),
      direction_mirror: DIRECTION_MIRROR,
      file_name_rule: "<motion>_<direction>.png (direction is optional when one sheet holds every direction as rows)",
      scaling_note: "Pixel art. Scale with nearest neighbor (image-rendering: pixelated), never bicubic.",
    },
    directions: DIRECTIONS.map(({ key, label, vector }) => ({ key, label, vector })),
    heroes,
  };

  const totalSheets = heroes.reduce(
    (sum, hero) => sum + hero.motions.reduce((count, motion) => count + motion.sheets.length, 0),
    0
  );

  const metadata = {
    generated_at: new Date().toISOString(),
    total_heroes: heroes.length,
    total_sheets: totalSheets,
    frame_sizes: frameSizes,
    motions: [...new Set(heroes.flatMap((hero) => hero.motions.map((motion) => motion.key)))].sort(),
    heroes_missing_master_record: heroes.filter((hero) => !hero.hero_name).map((hero) => hero.hero_id),
    warnings,
    credit: {
      template: "Eris Esra's Character Templates Pack",
      author: "Eris Esra",
      url: "https://erisesra.itch.io/character-templates-pack",
      note:
        "Hero deformed animations in Image/HeroAnimations are drawn on this character template. Check the template's own license before redistributing.",
    },
    note:
      "Hero artwork itself follows the MCH design guideline summarized in the repository README.",
  };

  if (checkOnly) {
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    fs.mkdirSync(ANIMATION_DATA_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  console.log(`Wrote ${heroes.length} hero animation records (${totalSheets} sheets).`);
  warnings.forEach((warning) => console.warn(`  warning: ${warning}`));
  if (!heroes.length) {
    console.log(
      "Image/HeroAnimations/<frame_size>/<heroId>/ に PNG を置いてから実行してください（例: Image/HeroAnimations/16x32/10001/idle_s.png）。"
    );
  }
}

main();
