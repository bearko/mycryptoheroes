#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const JINGLE_BASE_URL = "https://d2fvodbijouf8s.cloudfront.net/sounds/jingles";
const JINGLE_DIR = path.join(ROOT, "Audio", "SE", "Jingles");
const STYLE_DIR = path.join(ROOT, "Style", "Cutins");
const DATA_DIR = path.join(ROOT, "Data", "Effects");
const CUTIN_MANIFEST_PATH = path.join(DATA_DIR, "cutins.json");

const JINGLES = [
  {
    key: "win",
    label: "勝利",
    description: "勝利時に再生されるジングル。",
    source_file: "win.mp3",
    audio_file_path: "Audio/SE/Jingles/win.mp3",
  },
  {
    key: "lose",
    label: "敗北",
    description: "敗北時に再生されるジングル。",
    source_file: "lose.mp3",
    audio_file_path: "Audio/SE/Jingles/lose.mp3",
  },
  {
    key: "knight",
    label: "ナイト戦結果",
    description: "ランドバトル、アリーナ、コロシアム、ジムの結果演出で使われるジングル。",
    source_file: "knight.mp3",
    audio_file_path: "Audio/SE/Jingles/knight.mp3",
  },
];

const CSS_FILES = [
  {
    key: "passive_skill_cutin",
    label: "パッシブスキル発動カットイン",
    css_file_path: "Style/Cutins/passive_skill_cutin.css",
    source_note:
      "Extracted from the battle status component. The original effect combines gradients, random triangle pieces, hero images, and skill-name text.",
    css: `.mch-passive-cutin {
  align-items: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  left: 0;
  padding: 3rem 0;
  position: absolute;
  top: 50%;
  transform: translateY(-50%) skewY(-10deg);
  transition: all 0.1s;
  width: 100%;
  z-index: 4;
  -webkit-mask-image: linear-gradient(#000 1%, #000 99%);
  mask-image: linear-gradient(#000 1%, #000 99%);
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
}

@media (min-width: 768px) {
  .mch-passive-cutin {
    padding: 6rem 0;
  }
}

.mch-passive-cutin--ally {
  background: linear-gradient(to right bottom, #609da8 0, #609da8 50%, #282b33 0, #282b33);
}

.mch-passive-cutin--opponent {
  background: linear-gradient(to left top, #be6c65 0, #be6c65 50%, #282b33 0, #282b33);
}

.mch-passive-cutin__triangle {
  mix-blend-mode: color-dodge;
  opacity: 0;
  position: absolute;
}

.mch-passive-cutin__triangle--ally {
  background: linear-gradient(to left bottom, #609da8 0, #609da8);
}

.mch-passive-cutin__triangle--opponent {
  background: linear-gradient(to left bottom, #be6c65 0, #be6c65);
}

.mch-passive-cutin__shine {
  animation: mch-passive-cutin-shine 0.6s linear infinite alternate;
  height: 100%;
  left: 0;
  mix-blend-mode: color-dodge;
  opacity: 1;
  position: absolute;
  top: 0;
  width: 100%;
}

.mch-passive-cutin__shine--ally {
  background: linear-gradient(180deg, #024, #059 20%, #059 80%, #024);
}

.mch-passive-cutin__shine--opponent {
  background: linear-gradient(180deg, #402, #903 20%, #903 80%, #402);
}

@keyframes mch-passive-cutin-shine {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 0.8;
  }
}

.mch-passive-cutin-enter {
  opacity: 0;
  transform: translate(100%, -50%) skewY(-10deg);
}

.mch-passive-cutin-enter-to,
.mch-passive-cutin-leave {
  opacity: 1;
  transform: translateY(-50%) skewY(-10deg);
}

.mch-passive-cutin-leave-to {
  opacity: 0;
  transform: translate(-100%, -50%) skewY(-10deg);
}

.mch-passive-cutin-unit {
  align-items: center;
  display: flex;
  justify-content: center;
  left: 0;
  padding: 1rem 0;
  position: absolute;
  top: 50%;
  transform: translateY(-50%) skewY(-10deg);
  transition: all 0.1s;
  width: 100%;
  z-index: 4;
}

@media (min-width: 768px) {
  .mch-passive-cutin-unit {
    padding: 4rem 0;
  }
}

.mch-passive-cutin-unit__image {
  image-rendering: pixelated;
  margin-left: 2rem;
  margin-right: 2rem;
  max-width: 128px;
  transform: scale(2) skewY(10deg);
}

@media (min-width: 768px) {
  .mch-passive-cutin-unit__image {
    margin-left: 6rem;
    margin-right: 6rem;
    transform: scale(4) skewY(10deg);
  }
}

.mch-passive-cutin-unit__skill-name {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  margin: 0;
  opacity: 0.8;
  text-shadow: 2px 2px 0 #333, -2px 2px 0 #333, -2px -2px 0 #333, 2px -2px 0 #333;
}

@media (min-width: 768px) {
  .mch-passive-cutin-unit__skill-name {
    font-size: 3rem;
  }
}
`,
  },
  {
    key: "battle_result_cutin",
    label: "勝利/敗北表示カットイン",
    css_file_path: "Style/Cutins/battle_result_cutin.css",
    source_note:
      "Extracted from the battle status component. The original result visual is a text label; win/lose audio is handled by jingles.",
    css: `.mch-battle-result-label {
  align-items: center;
  display: flex;
  height: 100%;
  left: 0;
  position: absolute;
  top: 0;
  width: 100%;
  z-index: 10;
}

.mch-battle-result-label__text {
  background: #282b33;
  flex: 1 0 auto;
  font-size: 3rem;
  font-weight: 700;
  left: 50%;
  margin: 0;
  opacity: 0.8;
  padding: 1rem;
  position: absolute;
  text-align: center;
  top: 50%;
  transform: translate(-50%, -50%) rotate(-10deg);
  width: 150%;
}

.mch-battle-result-label-enter-active {
  animation: mch-battle-result-jack-in 0.75s both;
}

@keyframes mch-battle-result-jack-in {
  0% {
    opacity: 0;
    transform: scale(0.1) rotate(30deg);
    transform-origin: center bottom;
  }
  50% {
    transform: rotate(-10deg);
  }
  70% {
    transform: rotate(3deg);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
`,
  },
];

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          Accept: "audio/mpeg,audio/*,*/*",
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

function isMp3(buffer) {
  return buffer.slice(0, 3).toString("ascii") === "ID3" || buffer[0] === 0xff;
}

async function main() {
  fs.mkdirSync(JINGLE_DIR, { recursive: true });
  fs.mkdirSync(STYLE_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const failures = [];
  const jingles = [];

  for (const jingle of JINGLES) {
    const sourceUrl = `${JINGLE_BASE_URL}/${jingle.source_file}`;
    try {
      const audio = await request(sourceUrl);
      if (!isMp3(audio)) {
        throw new Error(`Unexpected MP3 signature for ${sourceUrl}`);
      }
      fs.writeFileSync(path.join(ROOT, jingle.audio_file_path), audio);
      jingles.push({
        key: jingle.key,
        label: jingle.label,
        description: jingle.description,
        audio_file_path: jingle.audio_file_path,
        source_url: sourceUrl,
        size_bytes: audio.length,
        sha256: crypto.createHash("sha256").update(audio).digest("hex"),
      });
    } catch (error) {
      failures.push({
        key: jingle.key,
        source_url: sourceUrl,
        error: error.message,
      });
    }
  }

  const styles = CSS_FILES.map((style) => {
    fs.writeFileSync(path.join(ROOT, style.css_file_path), style.css);
    return {
      key: style.key,
      label: style.label,
      css_file_path: style.css_file_path,
      source_note: style.source_note,
    };
  });

  fs.writeFileSync(
    CUTIN_MANIFEST_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        styles,
        jingles,
        audio_download_failures: failures,
        note:
          "Passive skill cut-ins and battle result visuals are CSS/DOM effects rather than standalone images. Win/lose/knight result jingles are standalone MP3 files.",
      },
      null,
      2
    )}\n`
  );

  console.log(`Wrote ${styles.length} CSS files and ${jingles.length} jingles with ${failures.length} failures.`);
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
