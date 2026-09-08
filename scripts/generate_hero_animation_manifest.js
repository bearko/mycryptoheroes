#!/usr/bin/env node

// Image/HeroAnimations/<テンプレートサイズ>/<ヒーローID>/ を走査して、
// Data/HeroAnimations/hero_animations.json と metadata.json を生成する。
//
//   node scripts/generate_hero_animation_manifest.js          マニフェストを書き出す
//   node scripts/generate_hero_animation_manifest.js --check  書き出さずに内容だけ確認する
//
// 1モーション1方向につき、GIF（そのまま再生できる形）と、同名のPNG
// スプライトシート（横1列。scripts/build_hero_animation_sheets.py で生成）を
// 組にして記録する。ファイル名の規約は Data/HeroAnimations/README.md を参照。

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
  {
    key: "se",
    label: { ja: "右下", en: "South East" },
    vector: [1, 1],
    aliases: ["southeast", "downright", "dr"],
  },
  { key: "e", label: { ja: "右", en: "East" }, vector: [1, 0], aliases: ["east", "right", "sideright", "r"] },
  { key: "ne", label: { ja: "右上", en: "North East" }, vector: [1, -1], aliases: ["northeast", "upright", "ur"] },
  { key: "n", label: { ja: "上", en: "North" }, vector: [0, -1], aliases: ["north", "up", "back", "u"] },
  { key: "nw", label: { ja: "左上", en: "North West" }, vector: [-1, -1], aliases: ["northwest", "upleft", "ul"] },
  { key: "w", label: { ja: "左", en: "West" }, vector: [-1, 0], aliases: ["west", "left", "sideleft", "l"] },
  {
    key: "sw",
    label: { ja: "左下", en: "South West" },
    vector: [-1, 1],
    aliases: ["southwest", "downleft", "dl"],
  },
];

// 左向きの素材が無い場合に、右向きを左右反転して使うための対応表。
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

// 元素材のファイル名に含まれがちで、モーション名ではないトークン。
const FILLER_TOKENS = new Set(["animation", "anim", "sprite", "sprites"]);

const directionByAlias = new Map();
DIRECTIONS.forEach((direction) => {
  directionByAlias.set(direction.key, direction.key);
  direction.aliases.forEach((alias) => directionByAlias.set(alias, direction.key));
});

function digest(buffer) {
  return { sha256: crypto.createHash("sha256").update(buffer).digest("hex"), size_bytes: buffer.length };
}

function readPng(buffer, label) {
  if (!buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`${label} is not a PNG file.`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), ...digest(buffer) };
}

// GIFのブロックを辿って、キャンバスサイズ・コマ数・各コマの表示時間を読む。
// 画素は復号しないので、LZWの展開は不要。
function readGif(buffer, label) {
  const signature = buffer.slice(0, 6).toString("latin1");
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    throw new Error(`${label} is not a GIF file.`);
  }
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const packed = buffer[10];

  let cursor = 13;
  if (packed & 0x80) cursor += 3 * (1 << ((packed & 0x07) + 1));

  const delays = [];
  let pendingDelay = null;
  let loopCount = null;
  let transparent = false;

  while (cursor < buffer.length) {
    const marker = buffer[cursor];
    if (marker === 0x3b) break;

    if (marker === 0x21) {
      const label21 = buffer[cursor + 1];
      cursor += 2;
      if (label21 === 0xf9) {
        const controlFlags = buffer[cursor + 1];
        pendingDelay = buffer.readUInt16LE(cursor + 2);
        if (controlFlags & 0x01) transparent = true;
      }
      while (buffer[cursor] !== 0) {
        // NETSCAPE2.0 のループ回数サブブロック
        if (label21 === 0xff && buffer[cursor] === 3 && buffer[cursor + 1] === 1) {
          loopCount = buffer.readUInt16LE(cursor + 2);
        }
        cursor += buffer[cursor] + 1;
      }
      cursor += 1;
    } else if (marker === 0x2c) {
      delays.push(pendingDelay === null ? 0 : pendingDelay);
      pendingDelay = null;
      const localFlags = buffer[cursor + 9];
      cursor += 10;
      if (localFlags & 0x80) cursor += 3 * (1 << ((localFlags & 0x07) + 1));
      cursor += 1; // LZW minimum code size
      while (buffer[cursor] !== 0) cursor += buffer[cursor] + 1;
      cursor += 1;
    } else {
      cursor += 1;
    }
  }

  return {
    width,
    height,
    frame_count: delays.length,
    // GIFの表示時間は1/100秒単位。
    durations_ms: delays.map((delay) => delay * 10),
    loop: loopCount === null ? null : loopCount === 0,
    transparent,
    ...digest(buffer),
  };
}

// "16x32" のようなフォルダ名からテンプレートのキャラクターサイズを取り出す。
function parseTemplateSize(directoryName) {
  const matched = /^(\d+)x(\d+)$/.exec(directoryName);
  if (!matched) return null;
  return { width: Number(matched[1]), height: Number(matched[2]) };
}

// 末尾の1〜2トークンを方向として解釈する。"down_right" や "side_left" にも対応。
function matchDirection(tokens) {
  for (const take of [2, 1]) {
    if (tokens.length <= take) continue;
    const key = directionByAlias.get(tokens.slice(-take).join(""));
    if (key) return { key, rest: tokens.slice(0, -take) };
  }
  return null;
}

// "attack_se.gif"                        -> { motion: "attack", direction: "se" }
// "10001_16x32_animation_attack_down_right.gif" -> 同上（ID・サイズ・animation は読み飛ばす）
// "idle.png"                             -> { motion: "idle", direction: null }
function parseFileName(fileName, heroId) {
  const base = path.basename(fileName, path.extname(fileName)).toLowerCase();
  let tokens = base.split(/[_\-\s.]+/).filter(Boolean);

  while (tokens.length > 1 && (/^\d+$/.test(tokens[0]) || /^\d+x\d+$/.test(tokens[0]))) tokens = tokens.slice(1);
  tokens = tokens.filter((token) => !FILLER_TOKENS.has(token));
  if (!tokens.length) return null;

  const matched = matchDirection(tokens);
  const motionTokens = matched ? matched.rest : tokens;
  if (!motionTokens.length) return null;

  const rawMotion = motionTokens.join("_");
  return {
    motion: MOTION_ALIASES[rawMotion] || rawMotion,
    direction: matched ? matched.key : null,
    raw_motion: rawMotion,
    hero_id_prefixed: base.startsWith(`${heroId}_`),
  };
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
  return new Map(JSON.parse(fs.readFileSync(HEROES_PATH, "utf8")).map((hero) => [String(hero.id), hero]));
}

function collectHero(templateDirName, templateSize, heroDirName, heroIndex, warnings) {
  const heroDir = path.join(ANIMATION_IMAGE_ROOT, templateDirName, heroDirName);
  const relativeDir = `Image/HeroAnimations/${templateDirName}/${heroDirName}`;
  const heroId = Number(heroDirName);

  if (!Number.isInteger(heroId)) {
    warnings.push(`${relativeDir}: フォルダ名がヒーローIDの数値ではありません。`);
    return null;
  }
  const master = heroIndex.get(heroDirName) || null;
  if (!master) warnings.push(`${relativeDir}: heroes.json に ID ${heroId} のヒーローが見つかりません。`);

  // (モーション, 方向) ごとに GIF と PNG を1組にまとめる。
  const clips = new Map();
  const files = fs
    .readdirSync(heroDir)
    .filter((file) => /\.(gif|png)$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  files.forEach((file) => {
    const parsed = parseFileName(file, heroId);
    if (!parsed) {
      warnings.push(`${relativeDir}/${file}: ファイル名からモーションを判定できませんでした。`);
      return;
    }
    const extension = path.extname(file).toLowerCase();
    const buffer = fs.readFileSync(path.join(heroDir, file));
    const key = `${parsed.motion}/${parsed.direction || "all"}`;
    if (!clips.has(key)) clips.set(key, { motion: parsed.motion, direction: parsed.direction });
    const clip = clips.get(key);

    try {
      if (extension === ".gif") {
        clip.gif = { image_file_path: `${relativeDir}/${file}`, ...readGif(buffer, `${relativeDir}/${file}`) };
      } else {
        clip.png = { image_file_path: `${relativeDir}/${file}`, ...readPng(buffer, `${relativeDir}/${file}`) };
      }
    } catch (error) {
      warnings.push(`${relativeDir}/${file}: ${error.message}`);
    }
  });

  const records = [];
  clips.forEach((clip) => {
    const { gif, png } = clip;
    if (!gif && !png) return;

    // コマのサイズはGIFのキャンバスを正とし、GIFが無ければテンプレートサイズを使う。
    const frameWidth = gif ? gif.width : templateSize.width;
    const frameHeight = gif ? gif.height : templateSize.height;
    let frameCount = gif ? gif.frame_count : 0;
    let columns = frameCount;
    let rows = 1;

    if (png) {
      if (png.width % frameWidth !== 0 || png.height % frameHeight !== 0) {
        warnings.push(
          `${png.image_file_path}: ${png.width}x${png.height} が1コマ ${frameWidth}x${frameHeight} で割り切れません。`
        );
      } else {
        columns = png.width / frameWidth;
        rows = png.height / frameHeight;
        const sheetFrames = columns * rows;
        if (gif && sheetFrames !== gif.frame_count) {
          warnings.push(
            `${png.image_file_path}: スプライトシートは ${sheetFrames} コマですが、GIFは ${gif.frame_count} コマです。`
          );
        }
        if (!gif) frameCount = sheetFrames;
      }
    }

    const record = {
      direction: clip.direction,
      frame_count: frameCount,
      frame_width: frameWidth,
      frame_height: frameHeight,
    };
    if (gif) {
      record.durations_ms = gif.durations_ms;
      record.total_duration_ms = gif.durations_ms.reduce((sum, value) => sum + value, 0);
      record.loop = gif.loop;
      record.gif = {
        image_file_path: gif.image_file_path,
        width: gif.width,
        height: gif.height,
        sha256: gif.sha256,
        size_bytes: gif.size_bytes,
      };
    }
    if (png) {
      record.sprite_sheet = {
        image_file_path: png.image_file_path,
        width: png.width,
        height: png.height,
        columns,
        rows,
        sha256: png.sha256,
        size_bytes: png.size_bytes,
      };
    }
    if (!clip.direction && rows > 1) {
      // 方向がファイル名に無いシートは、行が direction_order の並びだと解釈する。
      record.row_directions = DIRECTIONS.slice(0, rows).map((direction) => direction.key);
    }
    records.push({ motion: clip.motion, record });
  });

  if (!records.length) return null;

  const motions = new Map();
  records.forEach(({ motion, record }) => {
    if (!motions.has(motion)) motions.set(motion, []);
    motions.get(motion).push(record);
  });

  const motionRecords = [...motions.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, clipRecords]) => {
      const present = new Set();
      clipRecords.forEach((clip) => {
        if (clip.direction) present.add(clip.direction);
        else (clip.row_directions || []).forEach((direction) => present.add(direction));
      });
      const directions = DIRECTIONS.filter((direction) => present.has(direction.key)).map((d) => d.key);
      const mirrored = Object.entries(DIRECTION_MIRROR)
        .filter(([target, source]) => !present.has(target) && present.has(source))
        .map(([target, source]) => ({ direction: target, mirror_of: source }));

      clipRecords.sort((a, b) => {
        const order = (clip) => (clip.direction ? DIRECTIONS.findIndex((d) => d.key === clip.direction) : -1);
        return order(a) - order(b);
      });

      return {
        key,
        label: MOTION_LABELS[key] || { ja: key, en: key },
        directions,
        mirrored_directions: mirrored,
        frame_count: clipRecords.reduce((max, clip) => Math.max(max, clip.frame_count), 0),
        clips: clipRecords,
      };
    });

  const anyClip = records[0].record;
  return {
    hero_id: heroId,
    hero_name: master ? master.name : null,
    hero_image_file_path: master ? master.image_file_path : null,
    template_size: templateDirName,
    canvas_width: anyClip.frame_width,
    canvas_height: anyClip.frame_height,
    directory: relativeDir,
    motions: motionRecords,
  };
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const heroIndex = loadHeroIndex();
  const warnings = [];
  const heroes = [];
  const templateSizes = [];

  listDirectories(ANIMATION_IMAGE_ROOT).forEach((templateDirName) => {
    const templateSize = parseTemplateSize(templateDirName);
    if (!templateSize) {
      warnings.push(`Image/HeroAnimations/${templateDirName}: フォルダ名が "16x32" 形式ではありません。`);
      return;
    }
    templateSizes.push(templateDirName);
    listDirectories(path.join(ANIMATION_IMAGE_ROOT, templateDirName)).forEach((heroDirName) => {
      const hero = collectHero(templateDirName, templateSize, heroDirName, heroIndex, warnings);
      if (hero) heroes.push(hero);
    });
  });

  heroes.sort((a, b) => a.hero_id - b.hero_id || a.template_size.localeCompare(b.template_size));

  const manifest = {
    format: {
      template_size_note:
        "The folder name (e.g. 16x32) is the character size of the source template. The actual canvas of each frame is canvas_width x canvas_height, which leaves room for weapons that reach outside the character box.",
      sprite_sheet_layout: "Each PNG is a horizontal strip of frames, read left to right.",
      gif_note: "The GIF holds the same frames and can be played as-is in a browser.",
      direction_order: DIRECTIONS.map((direction) => direction.key),
      direction_mirror: DIRECTION_MIRROR,
      file_name_rule: "<motion>_<direction>.gif / .png",
      scaling_note: "Pixel art. Scale with nearest neighbor (image-rendering: pixelated), never bicubic.",
    },
    directions: DIRECTIONS.map(({ key, label, vector }) => ({ key, label, vector })),
    heroes,
  };

  const totalClips = heroes.reduce(
    (sum, hero) => sum + hero.motions.reduce((count, motion) => count + motion.clips.length, 0),
    0
  );

  const metadata = {
    generated_at: new Date().toISOString(),
    total_heroes: heroes.length,
    total_clips: totalClips,
    template_sizes: templateSizes,
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
    note: "Hero artwork itself follows the MCH design guideline summarized in the repository README.",
  };

  if (checkOnly) {
    console.log(JSON.stringify(metadata, null, 2));
  } else {
    fs.mkdirSync(ANIMATION_DATA_DIR, { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  console.log(`Wrote ${heroes.length} hero animation records (${totalClips} clips).`);
  warnings.forEach((warning) => console.warn(`  warning: ${warning}`));
  if (!heroes.length) {
    console.log(
      "Image/HeroAnimations/<テンプレートサイズ>/<ヒーローID>/ に画像を置いてから実行してください（例: Image/HeroAnimations/16x32/10001/idle_s.gif）。"
    );
  }
}

main();
