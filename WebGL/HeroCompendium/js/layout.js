// カードのワールド座標を決めるレイアウト計算。
// カード1枚のサイズを 1.0 とし、CARD_PITCH 間隔で並べる。

import { FACTIONS } from './heroes.js';

export const CARD_PITCH = 1.22;
const SCATTER_SPAN = 34;
const LABEL_MARGIN = 2.4;

// id から決まる擬似乱数。散布図で完全に重なるカードを少しだけずらすために使う。
function jitter(id, salt) {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function gridColumns(count, aspect) {
  if (count <= 1) return 1;
  return Math.max(1, Math.min(count, Math.round(Math.sqrt(count * Math.max(aspect, 0.35)))));
}

function emptyResult() {
  return { positions: new Float32Array(0), labels: [], bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 } };
}

// カードとラベルの両方が収まる矩形。ラベルは横に伸びるぶんだけ余白を足す。
function boundsOf(positions, labels) {
  if (!positions.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 2) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
  }
  (labels || []).forEach((label) => {
    minX = Math.min(minX, label.x - LABEL_MARGIN);
    maxX = Math.max(maxX, label.x + LABEL_MARGIN);
    minY = Math.min(minY, label.y);
    maxY = Math.max(maxY, label.y);
  });
  return { minX: minX - 0.6, maxX: maxX + 0.6, minY: minY - 0.6, maxY: maxY + 0.6 };
}

function gridLayout(heroes, aspect) {
  const count = heroes.length;
  const cols = gridColumns(count, aspect);
  const rows = Math.ceil(count / cols);
  const positions = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[i * 2] = (col - (cols - 1) / 2) * CARD_PITCH;
    positions[i * 2 + 1] = ((rows - 1) / 2 - row) * CARD_PITCH;
  }
  return { positions, labels: [], bounds: boundsOf(positions, []) };
}

// 勢力ごとのかたまりを作り、かたまり自体も画面比率に合わせて格子状に並べる。
function factionLayout(heroes, lang, aspect) {
  const groups = FACTIONS.map((faction) => ({
    faction,
    members: heroes.filter((hero) => hero.factionId === faction.id),
  })).filter((group) => group.members.length > 0);

  const others = heroes.filter((hero) => !FACTIONS.some((f) => f.id === hero.factionId));
  if (others.length) groups.push({ faction: null, members: others });
  if (!groups.length) return emptyResult();

  const positions = new Float32Array(heroes.length * 2);
  const index = new Map(heroes.map((hero, i) => [hero.id, i]));
  const labels = [];

  const blocks = groups.map((group) => {
    const cols = Math.max(1, Math.round(Math.sqrt(group.members.length)));
    const rows = Math.ceil(group.members.length / cols);
    return { group, cols, rows, width: cols * CARD_PITCH, height: rows * CARD_PITCH };
  });

  const perRow = Math.max(1, Math.min(blocks.length, Math.round(Math.sqrt((blocks.length * aspect) / 1.15))));
  const blockRows = [];
  for (let i = 0; i < blocks.length; i += perRow) blockRows.push(blocks.slice(i, i + perRow));

  const gapX = CARD_PITCH * 1.8;
  const gapY = CARD_PITCH * 2.8;
  const rowWidths = blockRows.map((row) => row.reduce((sum, b) => sum + b.width, 0) + gapX * (row.length - 1));
  const rowHeights = blockRows.map((row) => row.reduce((max, b) => Math.max(max, b.height), 0));
  const totalHeight = rowHeights.reduce((sum, h) => sum + h, 0) + gapY * (blockRows.length - 1);

  let rowTop = totalHeight / 2;
  blockRows.forEach((row, rowIndex) => {
    let cursorX = -rowWidths[rowIndex] / 2;
    row.forEach((block) => {
      const centerX = cursorX + block.width / 2;
      block.group.members.forEach((hero, i) => {
        const col = i % block.cols;
        const line = Math.floor(i / block.cols);
        const target = index.get(hero.id) * 2;
        positions[target] = centerX + (col - (block.cols - 1) / 2) * CARD_PITCH;
        positions[target + 1] = rowTop - (line + 0.5) * CARD_PITCH;
      });
      const faction = block.group.faction;
      labels.push({
        x: centerX,
        y: rowTop + CARD_PITCH * 0.7,
        text: (faction ? (lang === 'ja' ? faction.ja : faction.en) : lang === 'ja' ? '勢力なし' : 'No faction')
          + ' (' + block.group.members.length + ')',
        color: faction ? faction.color : [0.6, 0.62, 0.68],
      });
      cursorX += block.width + gapX;
    });
    rowTop -= rowHeights[rowIndex] + gapY;
  });

  return { positions, labels, bounds: boundsOf(positions, labels) };
}

// PHY を横軸、INT を縦軸にした散布図。スケールは全ヒーロー基準で固定する。
function scatterLayout(heroes, scale, lang) {
  const positions = new Float32Array(heroes.length * 2);
  heroes.forEach((hero, i) => {
    const nx = scale.phy > 0 ? hero.max.phy / scale.phy : 0;
    const ny = scale.int > 0 ? hero.max.int / scale.int : 0;
    positions[i * 2] = (nx - 0.5) * SCATTER_SPAN + jitter(hero.id, 1) * CARD_PITCH * 0.6;
    positions[i * 2 + 1] = (ny - 0.5) * SCATTER_SPAN + jitter(hero.id, 2) * CARD_PITCH * 0.6;
  });
  const half = SCATTER_SPAN / 2;
  const labels = [
    {
      x: 0,
      y: -half - CARD_PITCH * 1.6,
      text: lang === 'ja' ? 'PHY (最大レベル) →' : 'PHY (max level) →',
      color: [0.95, 0.55, 0.45],
    },
    {
      x: -half - CARD_PITCH * 2.6,
      y: 0,
      text: lang === 'ja' ? 'INT (最大レベル) ↑' : 'INT (max level) ↑',
      color: [0.5, 0.75, 0.98],
    },
  ];
  return { positions, labels, bounds: boundsOf(positions, labels) };
}

export function computeLayout(heroes, mode, options) {
  if (!heroes.length) return emptyResult();
  if (mode === 'faction') return factionLayout(heroes, options.lang, options.aspect);
  if (mode === 'scatter') return scatterLayout(heroes, options.scale, options.lang);
  return gridLayout(heroes, options.aspect);
}

// 散布図の軸スケール。絞り込みで軸が伸び縮みしないよう全件から求める。
export function statScale(heroes) {
  return {
    phy: heroes.reduce((max, hero) => Math.max(max, hero.max.phy), 1),
    int: heroes.reduce((max, hero) => Math.max(max, hero.max.int), 1),
  };
}
