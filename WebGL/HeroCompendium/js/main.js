// ヒーロー図鑑ビューアのエントリポイント。
// 状態管理 (絞り込み / 並べ替え / レイアウト / 選択) と、描画ループの駆動を行う。

import { createContext } from './gl-core.js';
import { Renderer, INSTANCE_FLOATS } from './scene.js';
import { Camera } from './camera.js';
import { HeroAtlas } from './atlas.js';
import { EffectPlayer } from './effects.js';
import { computeLayout, statScale, CARD_PITCH } from './layout.js';
import {
  loadHeroes,
  collectAttributes,
  filterHeroes,
  sortHeroes,
  FACTIONS,
  RARITY_TIERS,
  CATEGORIES,
  STAT_KEYS,
} from './heroes.js';
import { text } from './i18n.js';
import {
  applyStaticText,
  createChip,
  fillSelect,
  renderDetail,
  showTooltip,
  hideTooltip,
  cssColor,
} from './ui.js';

const EFFECT_LABELS = {
  1: { ja: '単体ダメージ', en: 'Single damage' },
  2: { ja: '全体ダメージ', en: 'Area damage' },
  3: { ja: '回復/復活', en: 'Heal / Resurrection' },
  4: { ja: 'バフ', en: 'Buff' },
  5: { ja: 'デバフ/状態異常', en: 'Debuff / Status' },
};

const SORT_KEYS = ['id', 'name', 'total', 'rarity', 'hp', 'phy', 'int', 'agi'];

const dom = {
  canvas: document.getElementById('stage'),
  labels: document.getElementById('labels'),
  tooltip: document.getElementById('tooltip'),
  topbar: document.getElementById('topbar'),
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  detail: document.getElementById('detail'),
  hints: document.getElementById('hints'),
  loading: document.getElementById('loading'),
  loadingBar: document.getElementById('loading-bar'),
  loadingLabel: document.getElementById('loading-label'),
  fatal: document.getElementById('fatal'),
  search: document.getElementById('search'),
  count: document.getElementById('hero-count'),
  layoutModes: document.getElementById('layout-modes'),
  fitButton: document.getElementById('fit-button'),
  soundButton: document.getElementById('sound-button'),
  langButton: document.getElementById('lang-button'),
  resetButton: document.getElementById('reset-button'),
  rarityChips: document.getElementById('rarity-chips'),
  factionChips: document.getElementById('faction-chips'),
  categoryChips: document.getElementById('category-chips'),
  attributeSelect: document.getElementById('attribute-select'),
  effectSelect: document.getElementById('effect-select'),
  sortSelect: document.getElementById('sort-select'),
};

const state = {
  lang: 'ja',
  layoutMode: 'grid',
  sortKey: 'id',
  filters: {
    query: '',
    rarities: new Set(),
    factions: new Set(),
    categories: new Set(),
    attributeId: 0,
    effectId: 0,
  },
  heroes: [],
  nodes: [],
  nodeById: new Map(),
  visible: [],
  labels: [],
  bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
  selectedId: 0,
  hoveredId: 0,
  scale: { hp: 1, phy: 1, int: 1, agi: 1 },
  statScale: { phy: 1, int: 1 },
};

let gl = null;
let renderer = null;
let camera = null;
let atlas = null;
let effects = null;
let instanceData = null;
let labelPool = [];
let needsFit = true;

function showFatal(message, detail) {
  dom.loading.classList.add('done');
  dom.fatal.hidden = false;
  dom.fatal.textContent = '';
  const title = document.createElement('p');
  title.textContent = message;
  dom.fatal.appendChild(title);
  if (detail) {
    const hint = document.createElement('p');
    hint.innerHTML = detail;
    dom.fatal.appendChild(hint);
  }
}

/* ---------------- 絞り込み / レイアウト ---------------- */

function categoryLabel(key) {
  const found = CATEGORIES.find((category) => category.key === key);
  if (!found) return key;
  return state.lang === 'ja' ? found.ja : found.en;
}

function effectLabel(effectId) {
  const found = EFFECT_LABELS[effectId];
  return found ? found[state.lang] || found.ja : '';
}

function rebuild(options) {
  const filtered = filterHeroes(state.heroes, state.filters);
  const sorted = sortHeroes(filtered, state.sortKey);
  state.visible = sorted;

  const aspect = Math.max(0.4, availableWidth() / availableHeight());
  const layout = computeLayout(sorted, state.layoutMode, {
    aspect,
    lang: state.lang,
    scale: state.statScale,
  });
  state.labels = layout.labels;
  state.bounds = layout.bounds;

  state.nodes.forEach((node) => {
    node.target = 0;
  });
  sorted.forEach((hero, index) => {
    const node = state.nodeById.get(hero.id);
    node.target = 1;
    node.tx = layout.positions[index * 2];
    node.ty = layout.positions[index * 2 + 1];
    node.order = index;
    if (node.fade < 0.02) {
      node.x = node.tx;
      node.y = node.ty;
    }
  });

  dom.count.textContent = text(state.lang, 'heroCount')(sorted.length, state.heroes.length);
  updateEmptyNote(sorted.length === 0);

  if (state.selectedId && !sorted.some((hero) => hero.id === state.selectedId)) {
    closeDetail();
  }
  if (options && options.fit) needsFit = true;
}

function updateEmptyNote(isEmpty) {
  let note = document.getElementById('empty-note');
  if (!isEmpty) {
    if (note) note.remove();
    return;
  }
  if (!note) {
    note = document.createElement('p');
    note.id = 'empty-note';
    document.body.appendChild(note);
  }
  note.textContent = text(state.lang, 'empty');
}

/* ---------------- 画面まわりの寸法 ---------------- */

function panelPadding() {
  const compact = window.innerWidth <= 860;
  const top = dom.topbar.offsetHeight + 16;

  // 狭い画面ではパネルが下から重なるので、その高さぶんを下の余白として扱う。
  if (compact) {
    let bottom = 24;
    if (!dom.detail.hidden) bottom = Math.max(bottom, dom.detail.getBoundingClientRect().height + 20);
    if (!dom.sidebar.classList.contains('collapsed')) {
      bottom = Math.max(bottom, dom.sidebar.getBoundingClientRect().height + 20);
    }
    return { top, bottom, left: 16, right: 16 };
  }

  const left = dom.sidebar.classList.contains('collapsed')
    ? 24
    : dom.sidebar.getBoundingClientRect().width + 28;
  const right = dom.detail.hidden ? 24 : dom.detail.getBoundingClientRect().width + 28;
  return { top, bottom: 56, left, right };
}

function availableWidth() {
  const pad = panelPadding();
  return Math.max(120, window.innerWidth - pad.left - pad.right);
}

function availableHeight() {
  const pad = panelPadding();
  return Math.max(120, window.innerHeight - pad.top - pad.bottom);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  dom.canvas.width = Math.round(width * dpr);
  dom.canvas.height = Math.round(height * dpr);
  dom.canvas.style.width = width + 'px';
  dom.canvas.style.height = height + 'px';
  camera.setViewport(width, height);
  renderer.resize(dom.canvas.width, dom.canvas.height);
}

/* ---------------- 選択・詳細 ---------------- */

function focusOn(node, zoom) {
  const pad = panelPadding();
  const targetZoom = camera.clampZoom(zoom != null ? zoom : Math.max(camera.targetZoom, 74));
  const centerX = (pad.left + (window.innerWidth - pad.right)) / 2;
  const centerY = (pad.top + (window.innerHeight - pad.bottom)) / 2;
  camera.moveTo(
    node.tx - (centerX - window.innerWidth / 2) / targetZoom,
    node.ty + (centerY - window.innerHeight / 2) / targetZoom,
    targetZoom,
  );
}

function selectHero(heroId, options) {
  const hero = state.heroes.find((item) => item.id === heroId);
  if (!hero) return;
  state.selectedId = heroId;
  hideTooltip(dom.tooltip);
  const node = state.nodeById.get(heroId);

  renderDetail(dom.detail, hero, state.lang, {
    scale: state.scale,
    categoryLabel: categoryLabel(hero.category),
    effectLabel: hero.passive ? effectLabel(hero.passive.effectId) : '',
    onClose: closeDetail,
    onAttribute: (attributeId) => {
      state.filters.attributeId = attributeId;
      dom.attributeSelect.value = String(attributeId);
      rebuild({ fit: true });
    },
    onReplay: () => playEffect(hero, node),
  });

  if (node && (!options || options.focus !== false)) focusOn(node);
  if (!options || options.playEffect !== false) playEffect(hero, node);
  if (history.replaceState) history.replaceState(null, '', '#hero=' + heroId);
}

function closeDetail() {
  state.selectedId = 0;
  dom.detail.hidden = true;
  dom.detail.textContent = '';
  effects.stop();
  if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
}

function playEffect(hero, node) {
  if (!hero.passive || !node) return;
  effects.play(hero.passive.effectId, node.x, node.y, CARD_PITCH * 2.6);
}

/* ---------------- 入力 ---------------- */

function pickAt(screenX, screenY) {
  const world = camera.screenToWorld(screenX, screenY);
  let hit = null;
  state.nodes.forEach((node) => {
    if (node.fade < 0.5) return;
    const half = 0.5;
    if (Math.abs(world.x - node.x) > half || Math.abs(world.y - node.y) > half) return;
    if (!hit || node.order > hit.order) hit = node;
  });
  return hit;
}

function setupPointer() {
  const pointers = new Map();
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;

  dom.canvas.addEventListener('pointerdown', (event) => {
    dom.canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      dragging = true;
      moved = 0;
      lastX = event.clientX;
      lastY = event.clientY;
      dom.canvas.classList.add('dragging');
    } else if (pointers.size === 2) {
      pinchDistance = distanceBetween(pointers);
    }
  });

  dom.canvas.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pointers.size === 2) {
      const next = distanceBetween(pointers);
      if (pinchDistance > 0 && next > 0) {
        const center = centerOf(pointers);
        camera.zoomAt(next / pinchDistance, center.x, center.y);
      }
      pinchDistance = next;
      hideTooltip(dom.tooltip);
      return;
    }

    if (dragging) {
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      camera.panBy(dx, dy);
      lastX = event.clientX;
      lastY = event.clientY;
      hideTooltip(dom.tooltip);
      return;
    }

    if (event.pointerType === 'touch') return;
    const node = pickAt(event.clientX, event.clientY);
    state.hoveredId = node ? node.hero.id : 0;
    if (node) showTooltip(dom.tooltip, node.hero, state.lang, event.clientX, event.clientY);
    else hideTooltip(dom.tooltip);
  });

  const endPointer = (event) => {
    const wasDragging = dragging && pointers.size === 1;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (pointers.size === 0) {
      dragging = false;
      dom.canvas.classList.remove('dragging');
      if (wasDragging && moved < 6) {
        const node = pickAt(event.clientX, event.clientY);
        if (node) selectHero(node.hero.id);
        else closeDetail();
      }
    }
  };

  dom.canvas.addEventListener('pointerup', endPointer);
  dom.canvas.addEventListener('pointercancel', endPointer);
  dom.canvas.addEventListener('pointerleave', () => {
    state.hoveredId = 0;
    hideTooltip(dom.tooltip);
  });

  dom.canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0016));
    camera.zoomAt(factor, event.clientX, event.clientY);
  }, { passive: false });
}

function distanceBetween(pointers) {
  const [a, b] = Array.from(pointers.values());
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centerOf(pointers) {
  const [a, b] = Array.from(pointers.values());
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/* ---------------- コントロール構築 ---------------- */

function buildControls() {
  const counts = {
    rarity: new Map(),
    faction: new Map(),
    category: new Map(),
  };
  state.heroes.forEach((hero) => {
    counts.rarity.set(hero.rarityTier, (counts.rarity.get(hero.rarityTier) || 0) + 1);
    counts.faction.set(hero.factionId, (counts.faction.get(hero.factionId) || 0) + 1);
    counts.category.set(hero.category, (counts.category.get(hero.category) || 0) + 1);
  });

  dom.rarityChips.textContent = '';
  RARITY_TIERS.forEach((tier) => {
    dom.rarityChips.appendChild(createChip({
      label: state.lang === 'ja' ? tier.ja : tier.en,
      color: cssColor(tier.color),
      count: counts.rarity.get(tier.tier) || 0,
      pressed: state.filters.rarities.has(tier.tier),
      onToggle: (on) => {
        if (on) state.filters.rarities.add(tier.tier);
        else state.filters.rarities.delete(tier.tier);
        rebuild({ fit: true });
      },
    }));
  });
  if (counts.rarity.get(0)) {
    dom.rarityChips.appendChild(createChip({
      label: text(state.lang, 'novice'),
      color: 'rgba(140,150,168,0.9)',
      count: counts.rarity.get(0),
      pressed: state.filters.rarities.has(0),
      onToggle: (on) => {
        if (on) state.filters.rarities.add(0);
        else state.filters.rarities.delete(0);
        rebuild({ fit: true });
      },
    }));
  }

  dom.factionChips.textContent = '';
  FACTIONS.forEach((faction) => {
    dom.factionChips.appendChild(createChip({
      label: state.lang === 'ja' ? faction.ja : faction.en,
      color: cssColor(faction.color),
      count: counts.faction.get(faction.id) || 0,
      pressed: state.filters.factions.has(faction.id),
      onToggle: (on) => {
        if (on) state.filters.factions.add(faction.id);
        else state.filters.factions.delete(faction.id);
        rebuild({ fit: true });
      },
    }));
  });

  dom.categoryChips.textContent = '';
  CATEGORIES.forEach((category) => {
    if (!counts.category.get(category.key)) return;
    dom.categoryChips.appendChild(createChip({
      label: state.lang === 'ja' ? category.ja : category.en,
      count: counts.category.get(category.key),
      pressed: state.filters.categories.has(category.key),
      onToggle: (on) => {
        if (on) state.filters.categories.add(category.key);
        else state.filters.categories.delete(category.key);
        rebuild({ fit: true });
      },
    }));
  });

  const attributes = collectAttributes(state.heroes);
  fillSelect(
    dom.attributeSelect,
    [{ value: 0, label: text(state.lang, 'attributeAll') }].concat(
      attributes.map((attribute) => ({
        value: attribute.id,
        label: (state.lang === 'ja' ? attribute.ja : attribute.en) + ' (' + attribute.count + ')',
      })),
    ),
    state.filters.attributeId,
  );

  fillSelect(
    dom.effectSelect,
    [{ value: 0, label: text(state.lang, 'effectAll') }].concat(
      Object.keys(EFFECT_LABELS).map((key) => ({ value: Number(key), label: effectLabel(Number(key)) })),
    ),
    state.filters.effectId,
  );

  fillSelect(
    dom.sortSelect,
    SORT_KEYS.map((key) => ({
      value: key,
      label: text(state.lang, 'sort' + key.charAt(0).toUpperCase() + key.slice(1)),
    })),
    state.sortKey,
  );

  dom.layoutModes.textContent = '';
  [['grid', 'layoutGrid'], ['faction', 'layoutFaction'], ['scatter', 'layoutScatter']].forEach(([mode, key]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text(state.lang, key);
    button.setAttribute('aria-pressed', state.layoutMode === mode ? 'true' : 'false');
    button.addEventListener('click', () => {
      state.layoutMode = mode;
      Array.from(dom.layoutModes.children).forEach((child) => {
        child.setAttribute('aria-pressed', child === button ? 'true' : 'false');
      });
      rebuild({ fit: true });
    });
    dom.layoutModes.appendChild(button);
  });

  dom.hints.textContent = '';
  ['hintDrag', 'hintWheel', 'hintClick'].forEach((key) => {
    const span = document.createElement('span');
    span.textContent = text(state.lang, key);
    dom.hints.appendChild(span);
  });

  dom.soundButton.textContent = (effects.soundEnabled ? '🔊 ' : '🔇 ') + text(state.lang, 'sound');
  dom.soundButton.setAttribute('aria-pressed', effects.soundEnabled ? 'true' : 'false');
}

function bindControls() {
  let searchTimer = 0;
  dom.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.filters.query = dom.search.value;
      rebuild({ fit: true });
    }, 140);
  });

  dom.attributeSelect.addEventListener('change', () => {
    state.filters.attributeId = Number(dom.attributeSelect.value);
    rebuild({ fit: true });
  });

  dom.effectSelect.addEventListener('change', () => {
    state.filters.effectId = Number(dom.effectSelect.value);
    rebuild({ fit: true });
  });

  dom.sortSelect.addEventListener('change', () => {
    state.sortKey = dom.sortSelect.value;
    rebuild({});
  });

  dom.resetButton.addEventListener('click', () => {
    state.filters.query = '';
    state.filters.rarities.clear();
    state.filters.factions.clear();
    state.filters.categories.clear();
    state.filters.attributeId = 0;
    state.filters.effectId = 0;
    dom.search.value = '';
    buildControls();
    rebuild({ fit: true });
  });

  dom.fitButton.addEventListener('click', () => {
    needsFit = true;
  });

  dom.soundButton.addEventListener('click', () => {
    effects.soundEnabled = !effects.soundEnabled;
    dom.soundButton.textContent = (effects.soundEnabled ? '🔊 ' : '🔇 ') + text(state.lang, 'sound');
    dom.soundButton.setAttribute('aria-pressed', effects.soundEnabled ? 'true' : 'false');
  });

  dom.langButton.addEventListener('click', () => {
    state.lang = state.lang === 'ja' ? 'en' : 'ja';
    applyStaticText(state.lang);
    buildControls();
    rebuild({});
    if (state.selectedId) selectHero(state.selectedId, { focus: false, playEffect: false });
  });

  dom.sidebarToggle.addEventListener('click', () => {
    const collapsed = dom.sidebar.classList.toggle('collapsed');
    dom.sidebarToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDetail();
    if (event.target === dom.search) return;
    if (event.key === 'f' || event.key === 'F') needsFit = true;
    if (event.key === '/') {
      event.preventDefault();
      dom.search.focus();
    }
  });

  window.addEventListener('resize', () => {
    resize();
    rebuild({});
  });
}

/* ---------------- 描画ループ ---------------- */

function syncLabels() {
  while (labelPool.length < state.labels.length) {
    const element = document.createElement('div');
    element.className = 'world-label';
    dom.labels.appendChild(element);
    labelPool.push(element);
  }
  labelPool.forEach((element, index) => {
    const label = state.labels[index];
    if (!label) {
      element.style.display = 'none';
      return;
    }
    const screen = camera.worldToScreen(label.x, label.y);
    element.style.display = 'block';
    element.style.left = screen.x + 'px';
    element.style.top = screen.y + 'px';
    element.style.color = cssColor(label.color, 0.92);
    element.style.fontSize = Math.max(11, Math.min(22, camera.zoom * 0.32)) + 'px';
    element.textContent = label.text;
  });
}

function writeInstances() {
  const drawOrder = [];
  state.nodes.forEach((node) => {
    if (node.fade > 0.01) drawOrder.push(node);
  });
  // ホバー/選択中のカードは最後に描いて手前に出す。
  drawOrder.sort((a, b) => priority(a) - priority(b));

  let offset = 0;
  drawOrder.forEach((node) => {
    const hero = node.hero;
    const slot = atlas.slotOf(hero.id);
    const hasImage = atlas.isLoaded(hero.id) ? 1 : 0;
    const faction = hero.faction ? hero.faction.color : [0.45, 0.48, 0.55];

    instanceData[offset] = node.x;
    instanceData[offset + 1] = node.y;
    instanceData[offset + 2] = 1;
    instanceData[offset + 3] = node.fade;

    instanceData[offset + 4] = slot ? slot.u : 0;
    instanceData[offset + 5] = slot ? slot.v : 0;
    instanceData[offset + 6] = atlas.cellUvSize;
    instanceData[offset + 7] = hasImage;

    instanceData[offset + 8] = hero.color[0];
    instanceData[offset + 9] = hero.color[1];
    instanceData[offset + 10] = hero.color[2];
    instanceData[offset + 11] = hero.rarityTier / 5;

    instanceData[offset + 12] = faction[0];
    instanceData[offset + 13] = faction[1];
    instanceData[offset + 14] = faction[2];
    instanceData[offset + 15] = hero.isReplica ? 1 : 0;

    instanceData[offset + 16] = hero.id === state.hoveredId ? 1 : 0;
    instanceData[offset + 17] = hero.id === state.selectedId ? 1 : 0;
    instanceData[offset + 18] = 0;
    instanceData[offset + 19] = (hero.id % 97) / 97;

    offset += INSTANCE_FLOATS;
  });
  return drawOrder.length;
}

function priority(node) {
  if (node.hero.id === state.selectedId) return 2;
  if (node.hero.id === state.hoveredId) return 1;
  return 0;
}

function accentColor() {
  if (state.filters.factions.size === 1) {
    const id = Array.from(state.filters.factions)[0];
    const faction = FACTIONS.find((item) => item.id === id);
    if (faction) return faction.color;
  }
  if (state.selectedId) {
    const hero = state.heroes.find((item) => item.id === state.selectedId);
    if (hero) return hero.color;
  }
  return [0.36, 0.42, 0.72];
}

let lastTime = 0;

function frame(now) {
  const time = now / 1000;
  const dt = Math.min(0.05, lastTime ? time - lastTime : 0.016);
  lastTime = time;

  if (needsFit) {
    camera.fit(state.bounds, panelPadding());
    needsFit = false;
  }
  camera.update(dt);

  const move = 1 - Math.exp(-dt * 8);
  const fade = 1 - Math.exp(-dt * 7);
  state.nodes.forEach((node) => {
    node.x += (node.tx - node.x) * move;
    node.y += (node.ty - node.y) * move;
    node.fade += (node.target - node.fade) * fade;
  });

  const view = camera.viewUniform();
  renderer.drawBackground(view, time, camera.zoom, accentColor());
  const count = writeInstances();
  renderer.drawCards(view, time, camera.zoom, instanceData, count, atlas.texture);

  const active = effects.step(dt);
  if (active) {
    renderer.drawEffect(view, active, active.texture, active.cols, active.rows, active.frame, active.alpha);
  }

  syncLabels();
  requestAnimationFrame(frame);
}

/* ---------------- 初期化 ---------------- */

async function main() {
  gl = createContext(dom.canvas);
  if (!gl) {
    showFatal(
      'このブラウザではWebGLを利用できません。',
      'WebGL2、またはWebGL1 + ANGLE_instanced_arrays に対応したブラウザで開いてください。',
    );
    return;
  }

  let heroes;
  try {
    heroes = await loadHeroes();
  } catch (error) {
    showFatal(
      'ヒーローデータを読み込めませんでした。',
      'リポジトリのルートで <code>python3 -m http.server</code> を実行し、'
        + '<code>http://localhost:8000/WebGL/HeroCompendium/</code> を開いてください。'
        + '（file:// では fetch がブロックされます）',
    );
    return;
  }

  state.heroes = heroes;
  state.nodes = heroes.map((hero, index) => ({
    hero,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    fade: 0,
    target: 0,
    order: index,
  }));
  state.nodeById = new Map(state.nodes.map((node) => [node.hero.id, node]));
  state.scale = STAT_KEYS.reduce((acc, key) => {
    acc[key] = heroes.reduce((max, hero) => Math.max(max, hero.max[key]), 1);
    return acc;
  }, {});
  state.statScale = statScale(heroes);

  renderer = new Renderer(gl);
  camera = new Camera();
  atlas = new HeroAtlas(gl, heroes);
  effects = new EffectPlayer(gl);
  instanceData = new Float32Array(heroes.length * INSTANCE_FLOATS);

  // 狭い画面では絞り込みパネルを畳んだ状態で始める。
  if (window.innerWidth <= 860) {
    dom.sidebar.classList.add('collapsed');
    dom.sidebarToggle.setAttribute('aria-expanded', 'false');
  }

  applyStaticText(state.lang);
  buildControls();
  bindControls();
  setupPointer();
  resize();
  rebuild({ fit: true });
  requestAnimationFrame(frame);

  dom.loadingLabel.textContent = text(state.lang, 'loading');
  const dismissLoading = () => {
    if (dom.loading.classList.contains('done')) return;
    dom.loading.classList.add('done');
    setTimeout(() => { dom.loading.style.display = 'none'; }, 400);
  };
  // 画像は読み込めた順にアトラスへ流し込まれるので、遅い回線でも待たせすぎない。
  const loadingTimeout = setTimeout(dismissLoading, 4000);
  atlas.loadAll(heroes, (done, total) => {
    dom.loadingBar.style.width = ((done / total) * 100).toFixed(1) + '%';
    if (done === total) {
      clearTimeout(loadingTimeout);
      dismissLoading();
    }
  });

  const match = /hero=(\d+)/.exec(location.hash);
  if (match) {
    const heroId = Number(match[1]);
    if (state.heroes.some((hero) => hero.id === heroId)) {
      selectHero(heroId, { playEffect: false });
      needsFit = false;
    }
  }
}

main();
