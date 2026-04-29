#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_BASE_URL = "https://www.mycryptoheroes.net/_nuxt/img";
const IMAGE_DIR = path.join(ROOT, "Image", "Effects", "Battle");
const DATA_DIR = path.join(ROOT, "Data", "Effects");
const MANIFEST_PATH = path.join(DATA_DIR, "battle_effect_sprites.json");
const META_PATH = path.join(DATA_DIR, "metadata.json");

const EFFECTS = [
  {
    id: 1,
    key: "single_damage",
    label: "単体ダメージ",
    source_file: "1.f84b685.png",
  },
  {
    id: 2,
    key: "area_damage",
    label: "全体ダメージ",
    source_file: "2.8c8874d.png",
  },
  {
    id: 3,
    key: "heal_resurrection",
    label: "回復/復活",
    source_file: "3.e490628.png",
  },
  {
    id: 4,
    key: "buff",
    label: "バフ",
    source_file: "4.ba0ae4c.png",
  },
  {
    id: 5,
    key: "debuff_status_effect",
    label: "デバフ/状態異常系",
    source_file: "5.86ac5e0.png",
  },
  {
    id: 6,
    key: "effect_06",
    label: "Effect 06",
    source_file: "6.c0df96a.png",
  },
  {
    id: 7,
    key: "effect_07",
    label: "Effect 07",
    source_file: "7.c9ef197.png",
  },
  {
    id: 8,
    key: "effect_08",
    label: "Effect 08",
    source_file: "8.c304a89.png",
  },
  {
    id: 9,
    key: "effect_09",
    label: "Effect 09",
    source_file: "9.afb78ab.png",
  },
  {
    id: 10,
    key: "effect_10",
    label: "Effect 10",
    source_file: "10.f340c96.png",
  },
  {
    id: 11,
    key: "effect_11",
    label: "Effect 11",
    source_file: "11.423e504.png",
  },
  {
    id: 12,
    key: "effect_12",
    label: "Effect 12",
    source_file: "12.d86dd43.png",
  },
];

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          Accept: "image/png,image/*,*/*",
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
          request(redirectedUrl, redirects + 1).then(resolve, reject);
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
            return;
          }
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        });
      }
    );
    req.setTimeout(30000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
    req.on("error", reject);
  });
}

function pngInfo(buffer) {
  if (!buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("Unexpected PNG signature.");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    frame_width: 100,
    frame_height: 100,
    frame_count: (buffer.readUInt32BE(16) / 100) * (buffer.readUInt32BE(20) / 100),
    size_bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

async function main() {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const failures = [];
  const manifest = [];

  for (const effect of EFFECTS) {
    const sourceUrl = `${SOURCE_BASE_URL}/${effect.source_file}`;
    const filename = `${String(effect.id).padStart(2, "0")}_${effect.key}.png`;
    const imageFilePath = `Image/Effects/Battle/${filename}`;
    try {
      const image = await request(sourceUrl);
      const info = pngInfo(image);
      fs.writeFileSync(path.join(ROOT, imageFilePath), image);
      manifest.push({
        id: effect.id,
        key: effect.key,
        label: effect.label,
        image_file_path: imageFilePath,
        source_url: sourceUrl,
        css_class: `effect-${effect.id}`,
        usage_note:
          "Battle Action effect sprite. The original renderer advances the background position in 100px steps for 60 frames.",
        ...info,
      });
    } catch (error) {
      failures.push({
        id: effect.id,
        key: effect.key,
        source_url: sourceUrl,
        error: error.message,
      });
    }
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        total_effect_sprites: EFFECTS.length,
        downloaded_effect_sprites: manifest.length,
        image_download_failures: failures,
        note:
          "Battle Action effects are CSS sprites used by action__effect.effect-N. Current public skill masters reference effectId 1 through 5; sprites 6 through 12 are included because the battle CSS defines them.",
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${manifest.length} battle effect sprites with ${failures.length} failures.`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
