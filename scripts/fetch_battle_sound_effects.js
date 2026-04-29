#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_BASE_URL = "https://d2fvodbijouf8s.cloudfront.net/sounds/se";
const AUDIO_DIR = path.join(ROOT, "Audio", "SE", "Battle");
const DATA_DIR = path.join(ROOT, "Data", "SoundEffects");
const MANIFEST_PATH = path.join(DATA_DIR, "battle_sound_effects.json");
const META_PATH = path.join(DATA_DIR, "metadata.json");

const EFFECTS = [
  {
    id: 1,
    key: "single_damage",
    label: "単体ダメージ",
    description: "単体ダメージ演出で使用するサウンドエフェクト。",
  },
  {
    id: 2,
    key: "area_damage",
    label: "全体ダメージ",
    description: "全体ダメージ演出で使用するサウンドエフェクト。",
  },
  {
    id: 3,
    key: "heal_resurrection",
    label: "回復/復活",
    description: "回復または復活演出で使用するサウンドエフェクト。",
  },
  {
    id: 4,
    key: "buff",
    label: "バフ",
    description: "バフ演出で使用するサウンドエフェクト。",
  },
  {
    id: 5,
    key: "debuff_status_effect",
    label: "デバフ/状態異常系",
    description: "デバフまたは状態異常演出で使用するサウンドエフェクト。",
  },
];

const FORMATS = ["mp3", "ogg"];

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          Accept: "audio/mpeg,audio/ogg,audio/*,*/*",
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

function isExpectedAudio(buffer, format) {
  if (format === "ogg") {
    return buffer.slice(0, 4).toString("ascii") === "OggS";
  }
  if (format === "mp3") {
    return buffer.slice(0, 3).toString("ascii") === "ID3" || buffer[0] === 0xff;
  }
  return false;
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const failures = [];
  const manifest = [];

  for (const effect of EFFECTS) {
    const files = [];
    for (const format of FORMATS) {
      const sourceUrl = `${SOURCE_BASE_URL}/${effect.id}.${format}`;
      const filename = `${effect.id}_${effect.key}.${format}`;
      const audioFilePath = `Audio/SE/Battle/${filename}`;
      try {
        const audio = await request(sourceUrl);
        if (!isExpectedAudio(audio, format)) {
          throw new Error(`Unexpected ${format} audio signature for ${sourceUrl}`);
        }
        fs.writeFileSync(path.join(ROOT, audioFilePath), audio);
        files.push({
          format,
          audio_file_path: audioFilePath,
          source_url: sourceUrl,
          size_bytes: audio.length,
          sha256: crypto.createHash("sha256").update(audio).digest("hex"),
        });
      } catch (error) {
        failures.push({
          id: effect.id,
          key: effect.key,
          format,
          source_url: sourceUrl,
          error: error.message,
        });
      }
    }

    manifest.push({
      id: effect.id,
      key: effect.key,
      label: effect.label,
      description: effect.description,
      files,
    });
  }

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        source_url_pattern: `${SOURCE_BASE_URL}/[1-5].{mp3,ogg}`,
        total_effects: EFFECTS.length,
        total_files: manifest.reduce((count, effect) => count + effect.files.length, 0),
        audio_download_failures: failures,
        note:
          "Battle source loads getSe(1)..getSe(5); effect-N classes map these IDs to battle animations.",
      },
      null,
      2
    )}\n`
  );

  console.log(
    `Wrote ${manifest.length} battle sound effects and ${manifest.reduce(
      (count, effect) => count + effect.files.length,
      0
    )} files with ${failures.length} failures.`
  );
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
