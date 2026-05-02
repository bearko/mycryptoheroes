#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const https = require("https");
const http = require("http");

const SOURCE_URL = "https://www.mycryptoheroes.net/ja/dictionary/heroes";
const ROOT = path.resolve(__dirname, "..");
const HERO_IMAGE_DIR = path.join(ROOT, "Image", "Heroes");
const HERO_DATA_DIR = path.join(ROOT, "Data", "Heroes");
const JSON_PATH = path.join(HERO_DATA_DIR, "heroes.json");
const CSV_PATH = path.join(HERO_DATA_DIR, "heroes.csv");
const META_PATH = path.join(HERO_DATA_DIR, "metadata.json");

const FACTIONS = {
  0: { ja: "未設定", en: "None" },
  1: { ja: "朱雀", en: "SUZAKU" },
  2: { ja: "青龍", en: "SEIRYU" },
  3: { ja: "玄武", en: "GENBU" },
  4: { ja: "黄竜", en: "KOURYU" },
  5: { ja: "白虎", en: "BYAKKO" },
};

const ENCHANTS = {
  101: { key: "reduction", name: { ja: "reduction", en: "Reduction" } },
  102: { key: "phy_alleviation", name: { ja: "phy_alleviation", en: "PHY Alleviation" } },
  103: { key: "int_alleviation", name: { ja: "int_alleviation", en: "INT Alleviation" } },
  104: { key: "adversity", name: { ja: "adversity", en: "Adversity" } },
};

const RESTRICTED_HERO_TYPES = new Set([
  2050, // イッパツマン & 逆転王
  3052, // キャシャーン & フレンダー
  3053, // クリスタル・ボーイ
  4042, // ブッダ
  4043, // 鉄腕アトム
  4058, // ヤッターマン1号 & 2号
  4059, // コブラ
  4061, // ティルフィング[PK Alterna]
  14042, // ブッダ.RepA
  14043, // 鉄腕アトム.RepA
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

function isOriginal(hero) {
  return hero.heroType >= 1000 && hero.heroType < 11000;
}

function isNovice(hero) {
  return String(hero.heroType).slice(0, 4) === "1000";
}

function isCollab(hero) {
  switch (hero.rarity) {
    case 5:
      return hero.heroType > 5032;
    case 4:
      return hero.heroType > 4057;
    case 3:
      return hero.heroType > 3051;
    case 2:
      return hero.heroType > 2049;
    case 1:
      return hero.heroType > 1008;
    default:
      return false;
  }
}

function categoryFor(hero) {
  if (isNovice(hero)) return "novice";
  if (isOriginal(hero) && isCollab(hero)) return "collaboration";
  if (isOriginal(hero)) return "original";
  if (hero.rarityStr && hero.rarityStr.startsWith("Rep")) return "replica";
  return "other";
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

function normalizeHero(hero, skillById, attributeById) {
  const passive = skillById.get(hero.passive);
  const attributes = (hero.attributeTypes || hero.attribute || []).map((attributeType) => {
    const attribute = attributeById.get(attributeType);
    return {
      id: attributeType,
      name: attribute?.name || { ja: String(attributeType), en: String(attributeType), zh: String(attributeType) },
    };
  });
  const faction = FACTIONS[hero.faction] || FACTIONS[0];
  const imagePath = `Image/Heroes/${hero.heroType}.png`;

  return {
    id: hero.heroType,
    name: hero.name,
    image_file_path: imagePath,
    source_image_url: hero.imageUrl,
    category: categoryFor(hero),
    is_dictionary_visible: isOriginal(hero) || isNovice(hero),
    is_updated: Boolean(hero.isUpdated),
    issued: hero.issued || null,
    rarity: {
      id: hero.rarity ?? null,
      name: hero.rarityStr || null,
    },
    faction: {
      id: hero.faction ?? 0,
      name: faction,
    },
    max_level_stats: {
      hp: hero.maxParam?.hp ?? null,
      phy: hero.maxParam?.phy ?? null,
      int: hero.maxParam?.int ?? null,
      agi: hero.maxParam?.agi ?? null,
    },
    initial_stats: {
      hp: hero.initialParam?.hp ?? null,
      phy: hero.initialParam?.phy ?? null,
      int: hero.initialParam?.int ?? null,
      agi: hero.initialParam?.agi ?? null,
    },
    passive: passive
      ? {
          id: passive.skillId,
          name: passive.name,
          icon_file_name: passive.iconFileName || null,
          effect_id: passive.effectId ?? null,
          description: {
            ja: descriptionForLocale(passive.description, "ja"),
            en: descriptionForLocale(passive.description, "en"),
            zh: descriptionForLocale(passive.description, "zh"),
          },
        }
      : null,
    attributes,
    enchants: (hero.enchants || []).map((enchant) => {
      const enchantType = enchant.enchantType ?? enchant.enchant_type;
      const master = ENCHANTS[enchantType] || {
        key: String(enchantType),
        name: { ja: String(enchantType), en: String(enchantType) },
      };
      return {
        type_id: enchantType,
        key: master.key,
        name: master.name,
        effect_rate: enchant.effectRate ?? enchant.effect_rate ?? null,
      };
    }),
    raw: {
      wikipedia_url: hero.wikipediaUrl || {},
      skill_ids: hero.skills || [],
    },
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(heroes) {
  const columns = [
    ["id", (hero) => hero.id],
    ["name_ja", (hero) => hero.name.ja],
    ["name_en", (hero) => hero.name.en],
    ["image_file_path", (hero) => hero.image_file_path],
    ["category", (hero) => hero.category],
    ["is_dictionary_visible", (hero) => hero.is_dictionary_visible],
    ["rarity", (hero) => hero.rarity.name],
    ["faction_ja", (hero) => hero.faction.name.ja],
    ["faction_en", (hero) => hero.faction.name.en],
    ["hp", (hero) => hero.max_level_stats.hp],
    ["phy", (hero) => hero.max_level_stats.phy],
    ["int", (hero) => hero.max_level_stats.int],
    ["agi", (hero) => hero.max_level_stats.agi],
    ["passive_name_ja", (hero) => hero.passive?.name?.ja],
    ["passive_name_en", (hero) => hero.passive?.name?.en],
    ["passive_text_ja", (hero) => hero.passive?.description?.ja?.text],
    ["passive_text_en", (hero) => hero.passive?.description?.en?.text],
    ["attributes_ja", (hero) => hero.attributes.map((attribute) => attribute.name.ja).join("; ")],
    ["attributes_en", (hero) => hero.attributes.map((attribute) => attribute.name.en).join("; ")],
    ["enchants", (hero) => hero.enchants.map((enchant) => `${enchant.key}:${enchant.effect_rate}`).join("; ")],
  ];
  const rows = [columns.map(([name]) => csvEscape(name)).join(",")];
  for (const hero of heroes) {
    rows.push(columns.map(([, getter]) => csvEscape(getter(hero))).join(","));
  }
  fs.writeFileSync(CSV_PATH, `${rows.join("\n")}\n`);
}

function imageFallbackUrls(hero, heroById) {
  const fallbackId = hero.id - 10000;
  const fallbackHero = heroById.get(fallbackId);
  if (!fallbackHero || fallbackHero.name.ja !== hero.name.ja) {
    return [];
  }
  return [fallbackHero.source_image_url];
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

async function downloadImage(hero, heroById) {
  const imagePath = path.join(ROOT, hero.image_file_path);
  if (fs.existsSync(imagePath) && fs.statSync(imagePath).size > 0) {
    return { failure: null, fallback: null };
  }

  let lastError;
  const urls = [hero.source_image_url, ...imageFallbackUrls(hero, heroById)];
  for (const [index, url] of urls.entries()) {
    try {
      const image = await tryDownload(url);
      fs.writeFileSync(imagePath, image);
      return {
        failure: null,
        fallback:
          index === 0
            ? null
            : {
                id: hero.id,
                name: hero.name,
                image_file_path: hero.image_file_path,
                requested_source_image_url: hero.source_image_url,
                downloaded_source_image_url: url,
              },
      };
    } catch (error) {
      lastError = error;
    }
  }
  return {
    failure: {
      id: hero.id,
      name: hero.name,
      image_file_path: hero.image_file_path,
      source_image_url: hero.source_image_url,
      error: lastError.message,
    },
    fallback: null,
  };
}

async function downloadImages(heroes) {
  fs.rmSync(HERO_IMAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(HERO_IMAGE_DIR, { recursive: true });
  const queue = [...heroes];
  const failures = [];
  const fallbacks = [];
  const heroById = new Map(heroes.map((hero) => [hero.id, hero]));
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length > 0) {
      const hero = queue.shift();
      const result = await downloadImage(hero, heroById);
      if (result.failure) failures.push(result.failure);
      if (result.fallback) fallbacks.push(result.fallback);
    }
  });
  await Promise.all(workers);
  return {
    failures: failures.sort((a, b) => a.id - b.id),
    fallbacks: fallbacks.sort((a, b) => a.id - b.id),
  };
}

async function main() {
  fs.mkdirSync(HERO_DATA_DIR, { recursive: true });
  fs.mkdirSync(HERO_IMAGE_DIR, { recursive: true });

  const html = await request(SOURCE_URL);
  const state = getNuxtState(html);
  const skillById = new Map(state.skill.masters.map((skill) => [skill.skillId, skill]));
  const attributeById = new Map(
    state.hero.heroAttributeTypes.map((attribute) => [attribute.heroAttributeType, attribute])
  );
  const restrictedHeroes = state.hero.masters.filter((hero) => RESTRICTED_HERO_TYPES.has(hero.heroType));
  const heroes = state.hero.masters
    .filter((hero) => !RESTRICTED_HERO_TYPES.has(hero.heroType))
    .map((hero) => normalizeHero(hero, skillById, attributeById))
    .sort((a, b) => a.id - b.id);

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(heroes, null, 2)}\n`);
  writeCsv(heroes);
  const imageDownloads = await downloadImages(heroes);

  const visibleHeroes = heroes.filter((hero) => hero.is_dictionary_visible);
  const metadata = {
    source_url: SOURCE_URL,
    fetched_at: new Date().toISOString(),
    login_required_for_public_master_data: false,
    note: "The public dictionary page embeds hero, passive skill, attribute, and image URL master data in window.__NUXT__; wallet login is not required for these public records.",
    total_hero_master_records: heroes.length,
    dictionary_visible_records: visibleHeroes.length,
    image_count: fs.readdirSync(HERO_IMAGE_DIR).filter((file) => file.endsWith(".png")).length,
    restricted_removed_records: restrictedHeroes
      .map((hero) => ({
        id: hero.heroType,
        name: hero.name,
      }))
      .sort((a, b) => a.id - b.id),
    image_download_failures: imageDownloads.failures,
    image_download_fallbacks: imageDownloads.fallbacks,
    category_counts: heroes.reduce((counts, hero) => {
      counts[hero.category] = (counts[hero.category] || 0) + 1;
      return counts;
    }, {}),
  };
  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(
    `Wrote ${heroes.length} hero records (${visibleHeroes.length} dictionary-visible), ${metadata.image_count} images, ${imageDownloads.fallbacks.length} fallback images, and ${imageDownloads.failures.length} image failures.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
