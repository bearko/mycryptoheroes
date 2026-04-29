#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "Data", "BattleIcons");
const MANIFEST_PATH = path.join(DATA_DIR, "battle_icons.json");
const META_PATH = path.join(DATA_DIR, "metadata.json");

const ICONS = [
  {
    key: "hp",
    category: "parameter",
    label: "HP",
    description: "パラメーター「HP（体力）」のアイコン。",
    image_file_path: "Image/BattleIcons/Parameters/hp.png",
    original_filename: "hp.c2865e7.png",
  },
  {
    key: "phy",
    category: "parameter",
    label: "PHY",
    description: "パラメーター「PHY（物理攻防力）」のアイコン。",
    image_file_path: "Image/BattleIcons/Parameters/phy.png",
    original_filename: "phy.8096d8c.png",
  },
  {
    key: "int",
    category: "parameter",
    label: "INT",
    description: "パラメーター「INT（魔法攻防力）」のアイコン。",
    image_file_path: "Image/BattleIcons/Parameters/int.png",
    original_filename: "int.515cf2c.png",
  },
  {
    key: "buf_agi",
    category: "buff",
    label: "AGI Buff",
    description: "AGIパラメーターにバフがかかっている、またはバフ効果があることを示すアイコン。",
    image_file_path: "Image/BattleIcons/Buffs/buf_agi.png",
    original_filename: "BUF_agi.4586287.png",
  },
  {
    key: "buf_int",
    category: "buff",
    label: "INT Buff",
    description: "INTパラメーターにバフがかかっている、またはバフ効果があることを示すアイコン。",
    image_file_path: "Image/BattleIcons/Buffs/buf_int.png",
    original_filename: "BUF_int.2f901a7.png",
  },
  {
    key: "buf_phy",
    category: "buff",
    label: "PHY Buff",
    description: "PHYパラメーターにバフがかかっている、またはバフ効果があることを示すアイコン。",
    image_file_path: "Image/BattleIcons/Buffs/buf_phy.png",
    original_filename: "BUF_phy.4201776.png",
  },
  {
    key: "dbf_agi",
    category: "debuff",
    label: "AGI Debuff",
    description: "AGIパラメーターにデバフがかかっている、またはデバフ効果があることを示すアイコン。",
    image_file_path: "Image/BattleIcons/Buffs/dbf_agi.png",
    original_filename: "DBF_agi.5b64f7d.png",
  },
  {
    key: "dbf_int",
    category: "debuff",
    label: "INT Debuff",
    description: "INTパラメーターにデバフがかかっている、またはデバフ効果があることを示すアイコン。",
    image_file_path: "Image/BattleIcons/Buffs/dbf_int.png",
    original_filename: "DBF_int.d900ce2.png",
  },
  {
    key: "dbf_phy",
    category: "debuff",
    label: "PHY Debuff",
    description: "PHYパラメーターにデバフがかかっている、またはデバフ効果があることを示すアイコン。",
    image_file_path: "Image/BattleIcons/Buffs/dbf_phy.png",
    original_filename: "DBF_phy.8e27536.png",
  },
  {
    key: "bleed",
    category: "status_effect",
    label: "Bleed",
    description: "状態異常「出血」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/bleed.png",
    original_filename: "bleed.de8a6fa.png",
  },
  {
    key: "confused",
    category: "status_effect",
    label: "Confusion",
    description: "状態異常「混乱」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/confused.png",
    original_filename: "confused.7a06ff2.png",
  },
  {
    key: "decoy",
    category: "status_effect",
    label: "Decoy",
    description: "特殊状態「デコイ」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/decoy.png",
    original_filename: "decoy.png",
  },
  {
    key: "fear",
    category: "status_effect",
    label: "Fear",
    description: "状態異常「恐怖」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/fear.png",
    original_filename: "fear.7cf661d.png",
  },
  {
    key: "poison",
    category: "status_effect",
    label: "Poison",
    description: "状態異常「毒」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/poison.png",
    original_filename: "poison.bb975e7.png",
  },
  {
    key: "resurrection",
    category: "status_effect",
    label: "Resurrection",
    description: "特殊状態「復活」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/resurrection.png",
    original_filename: "resurrection.png",
  },
  {
    key: "sleep",
    category: "status_effect",
    label: "Sleep",
    description: "状態異常「睡眠」を示すアイコン。",
    image_file_path: "Image/BattleIcons/StatusEffects/sleep.png",
    original_filename: "sleep.e04cc45.png",
  },
];

function pngInfo(imageFilePath) {
  const absolutePath = path.join(ROOT, imageFilePath);
  const buffer = fs.readFileSync(absolutePath);
  if (!buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error(`${imageFilePath} is not a PNG file.`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    size_bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const manifest = ICONS.map((icon) => ({
    ...icon,
    ...pngInfo(icon.image_file_path),
  }));
  const category_counts = manifest.reduce((counts, icon) => {
    counts[icon.category] = (counts[icon.category] || 0) + 1;
    return counts;
  }, {});

  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_icons: manifest.length,
        category_counts,
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${manifest.length} battle icon records.`);
}

main();
