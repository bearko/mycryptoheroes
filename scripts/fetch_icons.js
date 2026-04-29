#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const ICON_IMAGE_DIR = path.join(ROOT, "Image", "Icons");
const ICON_DATA_DIR = path.join(ROOT, "Data", "Icons");
const ICON_MANIFEST_PATH = path.join(ICON_DATA_DIR, "icons.json");
const META_PATH = path.join(ICON_DATA_DIR, "metadata.json");

const ICONS = [
  {
    key: "gum",
    name: "GUM",
    description: "Game Users Money。マイクリプトヒーローズのゲーム内通貨として利用されている通貨のアイコン。",
    file_path: "Image/Icons/gum.png",
    source_url: "https://www.mycryptoheroes.net/_nuxt/img/icon_gum.cd9a4ae.png",
  },
  {
    key: "cp",
    name: "Cp",
    description: "Cryptonium（クリプトニウム）。マイクリプトヒーローズのゲーム内ポイント。",
    file_path: "Image/Icons/cp.png",
    source_url: "https://www.mycryptoheroes.net/_nuxt/img/icon_cp.e83e3dd.png",
  },
  {
    key: "ce",
    name: "CE",
    description: "Crypto Energy（クリプトエナジー）。マイクリプトヒーローズの経験値。",
    file_path: "Image/Icons/ce.png",
    source_url: "https://www.mycryptoheroes.net/_nuxt/img/icon_ce.6fd0f35.png",
  },
  {
    key: "emblem",
    name: "エンブレム",
    description: "マイクリプトヒーローズのゲーム内報酬（ポイント）。",
    file_path: "Image/Icons/emblem.webp",
    source_url: "https://www.mycryptoheroes.net/_nuxt/img/401.9cba15b.webp",
  },
  {
    key: "gold_dust",
    name: "ゴールドダスト",
    description: "マイクリプトヒーローズのゲーム内報酬（ポイント）。",
    file_path: "Image/Icons/gold_dust.webp",
    source_url: "https://www.mycryptoheroes.net/_nuxt/img/501.2ad2ede.webp",
  },
  {
    key: "mch_icon",
    name: "マイクリプトヒーローズのアイコン",
    description: "My Crypto Heroesの正方形アイコン。",
    file_path: "Image/Icons/mch_icon.png",
    source_url: "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/MCH_logo_square_L.png",
  },
  {
    key: "mch_logo_horizontal",
    name: "マイクリプトヒーローズのロゴ",
    description: "My Crypto Heroesの横長ロゴ。",
    file_path: "Image/Icons/mch_logo_horizontal.png",
    source_url: "https://www.mycryptoheroes.net/_nuxt/img/mch_logo_yoko_b.e8a9d09.png",
  },
  {
    key: "mchc_official",
    name: "MCHC",
    description: "マイクリプトヒーローズが稼働するブロックチェーンネットワーク（MCH Verse）のトークン。",
    file_path: "Image/Icons/mchc_official.png",
    source_url: "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/MCHC_Official.png",
  },
  {
    key: "mchc_text_non_official",
    name: "MCHC text non official",
    description: "MCHCのテキストロゴ素材。",
    file_path: "Image/Icons/mchc_text_non_official.png",
    source_url: "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/MCHC_text_non%20official.png",
  },
  {
    key: "mai_sd",
    name: "MAI",
    description: "MCH Verseを擬人化したアイドルキャラクターのアイコン。",
    file_path: "Image/Icons/mai_sd.png",
    source_url: "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/MAI_SD.png",
  },
  {
    key: "mch_company_logo",
    name: "MCH",
    description: "マイクリプトヒーローズを運営する会社のロゴ。",
    file_path: "Image/Icons/mch_company_logo.png",
    source_url: "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/MCH%20co_logo_b_sharp.png",
  },
  {
    key: "mch_company_logo_negate",
    name: "MCH negate",
    description: "マイクリプトヒーローズを運営する会社の反転ロゴ。",
    file_path: "Image/Icons/mch_company_logo_negate.png",
    source_url: "https://raw.githubusercontent.com/bearko/mycryptoheroes/main/MCH_co_logo_b_sharp_negate.png",
  },
];

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          Accept: "image/png,image/webp,image/*,*/*",
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

function isExpectedImage(buffer, filePath) {
  const ext = path.extname(filePath);
  if (ext === ".png") {
    return buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (ext === ".webp") {
    return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function main() {
  fs.mkdirSync(ICON_IMAGE_DIR, { recursive: true });
  fs.mkdirSync(ICON_DATA_DIR, { recursive: true });

  const failures = [];
  const manifest = [];

  for (const icon of ICONS) {
    try {
      const image = await request(icon.source_url);
      if (!isExpectedImage(image, icon.file_path)) {
        throw new Error(`Unexpected image format for ${icon.source_url}`);
      }
      fs.writeFileSync(path.join(ROOT, icon.file_path), image);
      manifest.push({
        key: icon.key,
        name: icon.name,
        description: icon.description,
        image_file_path: icon.file_path,
        source_url: icon.source_url,
      });
    } catch (error) {
      failures.push({
        key: icon.key,
        source_url: icon.source_url,
        error: error.message,
      });
    }
  }

  fs.writeFileSync(ICON_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        fetched_at: new Date().toISOString(),
        total_icons: ICONS.length,
        downloaded_icons: manifest.length,
        image_download_failures: failures,
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${manifest.length} icons with ${failures.length} failures.`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
