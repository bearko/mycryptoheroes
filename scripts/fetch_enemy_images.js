#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_BASE_URL = "https://www.mycryptoheroes.net/images/enemies";
const ENEMY_MASTER_URL = "https://www.mycryptoheroes.net/data/enemy_types.json";
const ENEMY_IMAGE_DIR = path.join(ROOT, "Image", "Enemies");
const ENEMY_DATA_DIR = path.join(ROOT, "Data", "Enemies");
const MANIFEST_PATH = path.join(ENEMY_DATA_DIR, "enemy_images.json");
const META_PATH = path.join(ENEMY_DATA_DIR, "metadata.json");

function request(url, responseType = "buffer", redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          Accept: "image/png,application/json,*/*",
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

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseType === "utf8" ? body.toString("utf8") : body);
            return;
          }
          const error = new Error(`HTTP ${res.statusCode} for ${url}`);
          error.statusCode = res.statusCode;
          error.bodyPrefix = body.slice(0, 32).toString("hex");
          reject(error);
        });
      }
    );
    req.setTimeout(30000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
    req.on("error", reject);
  });
}

function isPng(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 8 &&
    buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  );
}

async function getEnemyMasterByImageName() {
  try {
    const body = await request(ENEMY_MASTER_URL, "utf8");
    const enemies = JSON.parse(body);
    return enemies.reduce((map, enemy) => {
      const list = map.get(enemy.image) || [];
      list.push(enemy);
      map.set(enemy.image, list);
      return map;
    }, new Map());
  } catch (error) {
    return new Map();
  }
}

async function fetchCandidate(id, enemyMasterByImageName) {
  const filename = `${String(id).padStart(3, "0")}.png`;
  const sourceUrl = `${SOURCE_BASE_URL}/${filename}`;
  try {
    const body = await request(sourceUrl);
    if (!isPng(body)) {
      return {
        found: null,
        miss: { filename, source_url: sourceUrl, reason: "response was not a PNG" },
      };
    }

    const imagePath = path.join(ENEMY_IMAGE_DIR, filename);
    fs.writeFileSync(imagePath, body);
    const masters = enemyMasterByImageName.get(filename) || [];
    return {
      found: {
        id,
        filename,
        image_file_path: `Image/Enemies/${filename}`,
        source_image_url: sourceUrl,
        names: [...new Map(masters.map((enemy) => [JSON.stringify(enemy.name), enemy.name])).values()],
        enemy_types: masters.map((enemy) => enemy.enemyType).sort((a, b) => a - b),
      },
      miss: null,
    };
  } catch (error) {
    return {
      found: null,
      miss: {
        filename,
        source_url: sourceUrl,
        reason: error.message,
      },
    };
  }
}

async function fetchEnemyImages() {
  fs.mkdirSync(ENEMY_DATA_DIR, { recursive: true });
  fs.rmSync(ENEMY_IMAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(ENEMY_IMAGE_DIR, { recursive: true });

  const enemyMasterByImageName = await getEnemyMasterByImageName();
  const queue = Array.from({ length: 1000 }, (_, index) => index);
  const found = [];
  const misses = [];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      const result = await fetchCandidate(id, enemyMasterByImageName);
      if (result.found) found.push(result.found);
      if (result.miss) misses.push(result.miss);
    }
  });

  await Promise.all(workers);
  found.sort((a, b) => a.id - b.id);
  misses.sort((a, b) => a.filename.localeCompare(b.filename));

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(found, null, 2)}\n`);
  const metadata = {
    source_url_pattern: `${SOURCE_BASE_URL}/[000-999].png`,
    master_data_url: ENEMY_MASTER_URL,
    fetched_at: new Date().toISOString(),
    tested_range: "000-999",
    valid_png_count: found.length,
    invalid_or_missing_count: misses.length,
    image_count: fs.readdirSync(ENEMY_IMAGE_DIR).filter((file) => file.endsWith(".png")).length,
    note: "Each URL in 000-999 was requested and saved only when the response was a valid PNG.",
  };
  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(
    `Fetched ${found.length} valid enemy PNGs from ${metadata.tested_range}; ${misses.length} candidates were invalid or missing.`
  );
}

fetchEnemyImages().catch((error) => {
  console.error(error);
  process.exit(1);
});
