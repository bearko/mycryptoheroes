// heroes.json を図鑑用に正規化し、絞り込み / 並べ替え / レイアウト計算を行う。

const HERO_JSON = '../../Data/Heroes/heroes.json';

// 四神カラー。レアリティとは別に、勢力を色で見分けるために使う。
export const FACTIONS = [
  { id: 1, ja: '朱雀', en: 'SUZAKU', color: [0.88, 0.31, 0.29] },
  { id: 2, ja: '青龍', en: 'SEIRYU', color: [0.25, 0.62, 0.94] },
  { id: 3, ja: '玄武', en: 'GENBU', color: [0.45, 0.42, 0.78] },
  { id: 4, ja: '黄竜', en: 'KOURYU', color: [0.94, 0.74, 0.24] },
  { id: 5, ja: '白虎', en: 'BYAKKO', color: [0.82, 0.85, 0.90] },
];

// レアリティ段位 (1〜5)。オリジナルとレプリカで名称が違うが段位は共通。
export const RARITY_TIERS = [
  { tier: 1, ja: 'Common', en: 'Common', color: [0.60, 0.65, 0.72] },
  { tier: 2, ja: 'Uncommon / RepC', en: 'Uncommon / RepC', color: [0.31, 0.75, 0.42] },
  { tier: 3, ja: 'Rare / RepB', en: 'Rare / RepB', color: [0.24, 0.61, 0.94] },
  { tier: 4, ja: 'Epic / RepA', en: 'Epic / RepA', color: [0.69, 0.38, 0.91] },
  { tier: 5, ja: 'Legendary / RepS', en: 'Legendary / RepS', color: [0.94, 0.71, 0.16] },
];

export const CATEGORIES = [
  { key: 'original', ja: 'オリジナル', en: 'Original' },
  { key: 'replica', ja: 'レプリカ', en: 'Replica' },
  { key: 'collaboration', ja: 'コラボ', en: 'Collaboration' },
  { key: 'novice', ja: 'ノービス', en: 'Novice' },
  { key: 'other', ja: 'その他', en: 'Other' },
];

const NOVICE_COLOR = [0.42, 0.47, 0.55];

// パッシブスキルアイコン名 -> Image/BattleIcons 配下の実ファイル。
// マスタ側にしか存在しないアイコン (agi / barrier / BUF_chg) は画像なしで扱う。
const PASSIVE_ICON_PATHS = {
  'hp.png': 'Parameters/hp.png',
  'phy.png': 'Parameters/phy.png',
  'int.png': 'Parameters/int.png',
  'buf_phy.png': 'Buffs/buf_phy.png',
  'buf_int.png': 'Buffs/buf_int.png',
  'buf_agi.png': 'Buffs/buf_agi.png',
  'dbf_phy.png': 'Buffs/dbf_phy.png',
  'dbf_int.png': 'Buffs/dbf_int.png',
  'dbf_agi.png': 'Buffs/dbf_agi.png',
  'confused.png': 'StatusEffects/confused.png',
  'fear.png': 'StatusEffects/fear.png',
  'sleep.png': 'StatusEffects/sleep.png',
};

export const STAT_KEYS = ['hp', 'phy', 'int', 'agi'];

function passiveIconPath(fileName) {
  if (!fileName) return null;
  const rel = PASSIVE_ICON_PATHS[String(fileName).toLowerCase()];
  return rel ? '../../Image/BattleIcons/' + rel : null;
}

// {triggerRate} などのプレースホルダを実値で埋めたスキル文を作る。
function skillText(description) {
  if (!description) return '';
  const raw = description.text || '';
  return raw.replace(/\{triggerRate\}/g, String(description.trigger_rate != null ? description.trigger_rate : '?'));
}

function normalize(record) {
  const rarityTier = record.rarity && record.rarity.id != null ? record.rarity.id : 0;
  const rarityName = (record.rarity && record.rarity.name) || 'Novice';
  const faction = FACTIONS.find((f) => f.id === (record.faction && record.faction.id)) || null;
  const tier = RARITY_TIERS.find((r) => r.tier === rarityTier) || null;
  const max = record.max_level_stats || { hp: 0, phy: 0, int: 0, agi: 0 };
  const passive = record.passive || null;

  const attributes = (record.attributes || []).map((a) => ({
    id: a.id,
    ja: a.name.ja,
    en: a.name.en,
  }));

  const hero = {
    id: record.id,
    name: record.name,
    imagePath: '../../' + record.image_file_path,
    category: record.category,
    issued: record.issued,
    rarityTier,
    rarityName,
    isReplica: /^Rep/.test(rarityName),
    faction,
    factionId: faction ? faction.id : 0,
    color: tier ? tier.color : NOVICE_COLOR,
    max,
    initial: record.initial_stats || { hp: 0, phy: 0, int: 0, agi: 0 },
    total: STAT_KEYS.reduce((sum, key) => sum + (max[key] || 0), 0),
    attributes,
    enchants: (record.enchants || []).map((e) => ({
      key: e.key,
      ja: e.name.ja,
      en: e.name.en,
      rate: e.effect_rate,
    })),
    wikipedia: (record.raw && record.raw.wikipedia_url) || null,
    passive: passive
      ? {
          id: passive.id,
          name: passive.name,
          effectId: passive.effect_id,
          iconPath: passiveIconPath(passive.icon_file_name),
          text: {
            ja: skillText(passive.description && passive.description.ja),
            en: skillText(passive.description && passive.description.en),
          },
        }
      : null,
  };

  const searchParts = [
    String(hero.id),
    hero.name.ja,
    hero.name.en,
    hero.rarityName,
    faction ? faction.ja : '',
    faction ? faction.en : '',
    hero.passive ? hero.passive.name.ja : '',
    hero.passive ? hero.passive.name.en : '',
    hero.passive ? hero.passive.text.ja : '',
    hero.passive ? hero.passive.text.en : '',
    attributes.map((a) => a.ja + ' ' + a.en).join(' '),
  ];
  hero.search = searchParts.join(' ').toLowerCase();
  return hero;
}

export async function loadHeroes() {
  const response = await fetch(HERO_JSON);
  if (!response.ok) {
    throw new Error('heroes.json を読み込めませんでした (HTTP ' + response.status + ')');
  }
  const records = await response.json();
  return records.map(normalize);
}

// 全ヒーローに登場する属性を、件数の多い順に並べて返す。
export function collectAttributes(heroes) {
  const counts = new Map();
  heroes.forEach((hero) => {
    hero.attributes.forEach((attribute) => {
      const found = counts.get(attribute.id);
      if (found) found.count += 1;
      else counts.set(attribute.id, { id: attribute.id, ja: attribute.ja, en: attribute.en, count: 1 });
    });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.id - b.id);
}

export function filterHeroes(heroes, filters) {
  const query = filters.query.trim().toLowerCase();
  return heroes.filter((hero) => {
    if (filters.rarities.size && !filters.rarities.has(hero.rarityTier)) return false;
    if (filters.factions.size && !filters.factions.has(hero.factionId)) return false;
    if (filters.categories.size && !filters.categories.has(hero.category)) return false;
    if (filters.attributeId && !hero.attributes.some((a) => a.id === filters.attributeId)) return false;
    if (filters.effectId && (!hero.passive || hero.passive.effectId !== filters.effectId)) return false;
    if (query && hero.search.indexOf(query) === -1) return false;
    return true;
  });
}

export const SORTS = {
  id: (a, b) => a.id - b.id,
  name: (a, b) => a.name.ja.localeCompare(b.name.ja, 'ja'),
  total: (a, b) => b.total - a.total || a.id - b.id,
  hp: (a, b) => b.max.hp - a.max.hp || a.id - b.id,
  phy: (a, b) => b.max.phy - a.max.phy || a.id - b.id,
  int: (a, b) => b.max.int - a.max.int || a.id - b.id,
  agi: (a, b) => b.max.agi - a.max.agi || a.id - b.id,
  rarity: (a, b) => b.rarityTier - a.rarityTier || a.id - b.id,
};

export function sortHeroes(heroes, sortKey) {
  const compare = SORTS[sortKey] || SORTS.id;
  return heroes.slice().sort(compare);
}
