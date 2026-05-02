#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const https = require("https");
const http = require("http");

const SOURCE_URL = "https://www.mycryptoheroes.net/ja/dictionary/extensions";
const ROOT = path.resolve(__dirname, "..");
const EXTENSION_IMAGE_DIR = path.join(ROOT, "Image", "Extensions");
const EXTENSION_DATA_DIR = path.join(ROOT, "Data", "Extensions");
const JSON_PATH = path.join(EXTENSION_DATA_DIR, "extensions.json");
const CSV_PATH = path.join(EXTENSION_DATA_DIR, "extensions.csv");
const META_PATH = path.join(EXTENSION_DATA_DIR, "metadata.json");

const ORIGINAL_RARITIES = {
  0: "Novice",
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
};

const REPLICA_RARITIES = {
  1: "RepF",
  2: "RepE",
  3: "RepD",
  4: "RepC",
  5: "RepB",
  6: "RepA",
  7: "RepS",
};

const EXPANSION_TYPES = {
  0: "Legacy",
  2: "Modern",
};

const RESTRICTED_EXTENSIONS = new Map([
  [2101, "おとなの防具屋さん / リリエッタの盾"],
  [3101, "おとなの防具屋さん / モクク"],
  [4101, "おとなの防具屋さん / マモリ"],
  [15101, "おとなの防具屋さん / リリエッタの盾.Rep B"],
  [16101, "おとなの防具屋さん / モクク.Rep A"],
  [17101, "おとなの防具屋さん / マモリ.Rep S"],
  [4166, "ファンキルオルタナ / レーヴァテイン[PK Alterna]"],
  [4167, "ファンキルオルタナ / アルマス[PK Alterna]"],
  [4168, "ファンキルオルタナ / フェイルノート[PK Alterna]"],
  [2062, "ブレイブ フロンティア ヒーローズ 創剣 / 創輝剣ベルテ"],
  [3062, "ブレイブ フロンティア ヒーローズ 創剣 / 創聖剣ベラネル"],
  [1060, "手塚オールスター / ヒョウタンツギ"],
  [2060, "手塚オールスター / ロビタ"],
  [3060, "手塚オールスター / ユニコ"],
  [4060, "手塚オールスター / レオ"],
  [5060, "手塚オールスター / 火の鳥"],
  [11060, "手塚オールスター / 手塚オールスター.RepF"],
  [12060, "手塚オールスター / 手塚オールスター.RepE"],
  [13060, "手塚オールスター / 手塚オールスター.RepD"],
  [14060, "手塚オールスター / 手塚オールスター.RepC"],
  [15060, "手塚オールスター / 手塚オールスター.RepB"],
  [16060, "手塚オールスター / 手塚オールスター.RepA"],
  [17060, "手塚オールスター / 手塚オールスター.RepS"],
  [4114, "南葛SC / 南葛SCのエンブレム"],
  [5114, "南葛SC / 南葛SCのインシグニア"],
  [4145, "余市町ワイン / 余市町赤ワイン"],
  [4146, "余市町ワイン / 余市町白ワイン"],
  [5144, "余市町ワイン / 余市の宝〜北海道余市町名産ワイン〜"],
]);

function request(url, responseType = "utf8", redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; mycryptoheroes-db-fetcher/1.0; +https://github.com/)",
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          if (redirects > 5) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const redirectedUrl = new URL(res.headers.location, url).toString();
          res.resume();
          request(redirectedUrl, responseType, redirects + 1).then(resolve, reject);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve(responseType === "buffer" ? body : body.toString(responseType));
        });
      }
    );
    req.setTimeout(30000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
    req.on("error", reject);
  });
}

function getNuxtState(html) {
  const match = html.match(/<script>window\.__NUXT__=([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("Could not find window.__NUXT__ payload in the dictionary page.");
  }

  const sandbox = { window: {}, Map, Set, Object, Array, Number, String, Boolean, Math, Date };
  vm.createContext(sandbox);
  vm.runInContext(`window.__NUXT__=${match[1]}`, sandbox, { timeout: 10000 });
  return sandbox.window.__NUXT__.state;
}

function isOriginal(extension) {
  return extension.extensionType >= 1000 && extension.extensionType < 10000;
}

function rarityName(extension) {
  return isOriginal(extension)
    ? ORIGINAL_RARITIES[extension.rarity] || null
    : REPLICA_RARITIES[extension.rarity] || null;
}

function categoryFor(extension) {
  if (isOriginal(extension)) {
    return extension.expansionType === 2 ? "modern" : "legacy";
  }
  return "replica";
}

function descriptionForLocale(description, locale) {
  const localized = description?.[locale] || {};
  const effects = Array.isArray(localized.effects) ? localized.effects : [];
  return {
    condition: localized.condition || "",
    trigger_rate: localized.triggerRate ?? null,
    effects: effects.map((effect) => ({
      description: effect.description || "",
      success_rate: effect.successRate ?? null,
      min_rate: effect.minRate ?? null,
      max_rate: effect.maxRate ?? null,
      additional_condition: effect.additionalCondition || null,
    })),
    text: [localized.condition || "", ...effects.map((effect) => effect.description || "")]
      .filter(Boolean)
      .join(" / "),
  };
}

function normalizeSkill(skill) {
  if (!skill) return null;
  return {
    id: skill.skillId,
    name: skill.name,
    icon_file_name: skill.iconFileName || null,
    effect_id: skill.effectId ?? null,
    description: {
      ja: descriptionForLocale(skill.description, "ja"),
      en: descriptionForLocale(skill.description, "en"),
      zh: descriptionForLocale(skill.description, "zh"),
    },
  };
}

function normalizeAura(aura) {
  if (!aura) return null;
  return {
    id: aura.auraId,
    name: aura.name,
    description: aura.description,
  };
}

function normalizeExtension(extension, skillById, auraById) {
  const imagePath = `Image/Extensions/${extension.extensionType}.png`;
  return {
    id: extension.extensionType,
    name: extension.name,
    image_file_path: imagePath,
    source_image_url: extension.imageUrl,
    category: categoryFor(extension),
    is_dictionary_visible: isOriginal(extension),
    series: {
      id: extension.series ?? Number(String(extension.extensionType).slice(-3)),
      name: extension.seriesName,
    },
    rarity: {
      id: extension.rarity ?? null,
      name: rarityName(extension),
    },
    expansion: {
      id: extension.expansionType ?? null,
      name: EXPANSION_TYPES[extension.expansionType] || null,
    },
    max_level_stats: {
      hp: extension.maxParam?.hp ?? null,
      phy: extension.maxParam?.phy ?? null,
      int: extension.maxParam?.int ?? null,
      agi: extension.maxParam?.agi ?? null,
    },
    initial_stats: {
      hp: extension.initialParam?.hp ?? null,
      phy: extension.initialParam?.phy ?? null,
      int: extension.initialParam?.int ?? null,
      agi: extension.initialParam?.agi ?? null,
    },
    active_skill: normalizeSkill(skillById.get(extension.active)),
    aura: normalizeAura(auraById.get(extension.aura)),
    raw: {
      active_skill_id: extension.active || null,
      aura_id: extension.aura || null,
    },
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(extensions) {
  const columns = [
    ["id", (extension) => extension.id],
    ["name_ja", (extension) => extension.name.ja],
    ["name_en", (extension) => extension.name.en],
    ["image_file_path", (extension) => extension.image_file_path],
    ["category", (extension) => extension.category],
    ["is_dictionary_visible", (extension) => extension.is_dictionary_visible],
    ["series_id", (extension) => extension.series.id],
    ["series_ja", (extension) => extension.series.name.ja],
    ["series_en", (extension) => extension.series.name.en],
    ["rarity", (extension) => extension.rarity.name],
    ["expansion", (extension) => extension.expansion.name],
    ["hp", (extension) => extension.max_level_stats.hp],
    ["phy", (extension) => extension.max_level_stats.phy],
    ["int", (extension) => extension.max_level_stats.int],
    ["agi", (extension) => extension.max_level_stats.agi],
    ["active_skill_name_ja", (extension) => extension.active_skill?.name?.ja],
    ["active_skill_name_en", (extension) => extension.active_skill?.name?.en],
    ["active_skill_text_ja", (extension) => extension.active_skill?.description?.ja?.text],
    ["active_skill_text_en", (extension) => extension.active_skill?.description?.en?.text],
    ["aura_name_ja", (extension) => extension.aura?.name?.ja],
    ["aura_text_ja", (extension) => extension.aura?.description?.ja],
  ];
  const rows = [columns.map(([name]) => csvEscape(name)).join(",")];
  for (const extension of extensions) {
    rows.push(columns.map(([, getter]) => csvEscape(getter(extension))).join(","));
  }
  fs.writeFileSync(CSV_PATH, `${rows.join("\n")}\n`);
}

async function tryDownload(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request(url, "buffer");
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw lastError;
}

async function downloadImage(extension) {
  const imagePath = path.join(ROOT, extension.image_file_path);
  let lastError;
  try {
    const image = await tryDownload(extension.source_image_url);
    fs.writeFileSync(imagePath, image);
    return null;
  } catch (error) {
    lastError = error;
  }
  return {
    id: extension.id,
    name: extension.name,
    image_file_path: extension.image_file_path,
    source_image_url: extension.source_image_url,
    error: lastError.message,
  };
}

async function downloadImages(extensions) {
  fs.rmSync(EXTENSION_IMAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(EXTENSION_IMAGE_DIR, { recursive: true });
  const queue = [...extensions];
  const failures = [];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length > 0) {
      const extension = queue.shift();
      const failure = await downloadImage(extension);
      if (failure) failures.push(failure);
    }
  });
  await Promise.all(workers);
  return failures.sort((a, b) => a.id - b.id);
}

async function main() {
  fs.mkdirSync(EXTENSION_DATA_DIR, { recursive: true });
  fs.mkdirSync(EXTENSION_IMAGE_DIR, { recursive: true });

  const html = await request(SOURCE_URL);
  const state = getNuxtState(html);
  const skillById = new Map(state.skill.masters.map((skill) => [skill.skillId, skill]));
  const auraById = new Map((state.aura.masters || []).map((aura) => [aura.auraId, aura]));
  const restrictedExtensions = state.extension.masters.filter((extension) =>
    RESTRICTED_EXTENSIONS.has(extension.extensionType)
  );
  const extensions = state.extension.masters
    .filter((extension) => !RESTRICTED_EXTENSIONS.has(extension.extensionType))
    .map((extension) => normalizeExtension(extension, skillById, auraById))
    .sort((a, b) => a.id - b.id);

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(extensions, null, 2)}\n`);
  writeCsv(extensions);
  const imageDownloadFailures = await downloadImages(extensions);

  const visibleExtensions = extensions.filter((extension) => extension.is_dictionary_visible);
  const metadata = {
    source_url: SOURCE_URL,
    fetched_at: new Date().toISOString(),
    login_required_for_public_master_data: false,
    note: "The public extension dictionary page embeds extension, active skill, aura, and image URL master data in window.__NUXT__; wallet login is not required for these public records.",
    total_extension_master_records: extensions.length,
    dictionary_visible_records: visibleExtensions.length,
    image_count: fs.readdirSync(EXTENSION_IMAGE_DIR).filter((file) => file.endsWith(".png")).length,
    restricted_removed_records: restrictedExtensions
      .map((extension) => ({
        id: extension.extensionType,
        reason: RESTRICTED_EXTENSIONS.get(extension.extensionType),
        name: extension.name,
        series_name: extension.seriesName,
      }))
      .sort((a, b) => a.id - b.id),
    image_download_failures: imageDownloadFailures,
    category_counts: extensions.reduce((counts, extension) => {
      counts[extension.category] = (counts[extension.category] || 0) + 1;
      return counts;
    }, {}),
  };
  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(
    `Wrote ${extensions.length} extension records (${visibleExtensions.length} dictionary-visible), ${metadata.image_count} images, and ${imageDownloadFailures.length} image failures.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
