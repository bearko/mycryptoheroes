// DOM側のUI組み立て。WebGLキャンバスの上に重ねる操作パネルと詳細表示。

import { STAT_KEYS } from './heroes.js';
import { text } from './i18n.js';

const STAT_COLORS = { hp: 'var(--hp)', phy: 'var(--phy)', int: 'var(--int)', agi: 'var(--agi)' };

export function cssColor(rgb, alpha) {
  const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const a = alpha == null ? 1 : alpha;
  return 'rgba(' + to255(rgb[0]) + ',' + to255(rgb[1]) + ',' + to255(rgb[2]) + ',' + a + ')';
}

export function applyStaticText(lang) {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = text(lang, element.dataset.i18n);
  });
  document.getElementById('search').placeholder = text(lang, 'search');
  document.documentElement.lang = lang;
}

export function createChip({ label, color, count, pressed, onToggle }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip';
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  if (color) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = color;
    button.appendChild(dot);
  }
  button.appendChild(document.createTextNode(label));
  if (count != null) {
    const badge = document.createElement('span');
    badge.className = 'count';
    badge.textContent = String(count);
    button.appendChild(badge);
  }
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', next ? 'true' : 'false');
    onToggle(next);
  });
  return button;
}

export function fillSelect(select, options, value) {
  select.textContent = '';
  options.forEach((option) => {
    const element = document.createElement('option');
    element.value = String(option.value);
    element.textContent = option.label;
    select.appendChild(element);
  });
  select.value = String(value);
}

function statRow(key, value, max, initial) {
  const row = document.createElement('div');
  row.className = 'stat-row';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = key.toUpperCase();

  const track = document.createElement('span');
  track.className = 'track';
  const fill = document.createElement('i');
  fill.className = 'fill';
  fill.style.width = Math.max(2, (value / Math.max(max, 1)) * 100) + '%';
  fill.style.background = STAT_COLORS[key];
  track.appendChild(fill);

  const amount = document.createElement('span');
  amount.className = 'value';
  amount.textContent = String(value);
  if (initial != null) {
    const small = document.createElement('small');
    small.textContent = ' /' + initial;
    amount.appendChild(small);
  }

  row.append(label, track, amount);
  return row;
}

function section(titleKey, lang) {
  const element = document.createElement('section');
  element.className = 'detail-section';
  const heading = document.createElement('h3');
  heading.textContent = text(lang, titleKey);
  element.appendChild(heading);
  return element;
}

function badge(label, color) {
  const element = document.createElement('span');
  element.className = 'badge';
  element.style.color = color;
  const dot = document.createElement('span');
  dot.className = 'dot';
  element.append(dot, document.createTextNode(label));
  return element;
}

export function renderDetail(container, hero, lang, options) {
  container.textContent = '';
  container.hidden = false;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'detail-close';
  close.title = text(lang, 'close');
  close.textContent = '×';
  close.addEventListener('click', options.onClose);
  container.appendChild(close);

  const top = document.createElement('div');
  top.className = 'detail-top';
  const portrait = document.createElement('img');
  portrait.className = 'detail-portrait';
  portrait.src = hero.imagePath;
  portrait.alt = hero.name[lang] || hero.name.ja;
  portrait.style.borderColor = cssColor(hero.color, 0.8);
  const heading = document.createElement('div');
  heading.className = 'detail-heading';
  const title = document.createElement('h2');
  title.textContent = hero.name[lang] || hero.name.ja;
  const sub = document.createElement('p');
  sub.className = 'sub';
  const otherName = lang === 'ja' ? hero.name.en : hero.name.ja;
  sub.textContent = otherName + '  #' + hero.id;
  heading.append(title, sub);
  top.append(portrait, heading);
  container.appendChild(top);

  const badges = document.createElement('div');
  badges.className = 'badges';
  badges.appendChild(badge(hero.rarityTier ? hero.rarityName : text(lang, 'novice'), cssColor(hero.color)));
  if (hero.faction) {
    badges.appendChild(badge(lang === 'ja' ? hero.faction.ja : hero.faction.en, cssColor(hero.faction.color)));
  }
  badges.appendChild(badge(options.categoryLabel, 'rgba(200,208,222,0.75)'));
  container.appendChild(badges);

  const statsSection = section('maxStats', lang);
  STAT_KEYS.forEach((key) => {
    statsSection.appendChild(statRow(key, hero.max[key], options.scale[key], hero.initial[key]));
  });
  container.appendChild(statsSection);

  if (hero.passive) {
    const passiveSection = section('passive', lang);
    const card = document.createElement('div');
    card.className = 'passive-card';
    const head = document.createElement('div');
    head.className = 'passive-head';
    if (hero.passive.iconPath) {
      const icon = document.createElement('img');
      icon.src = hero.passive.iconPath;
      icon.alt = '';
      head.appendChild(icon);
    }
    const name = document.createElement('strong');
    name.textContent = hero.passive.name[lang] || hero.passive.name.ja;
    head.appendChild(name);
    const body = document.createElement('p');
    body.className = 'passive-text';
    body.textContent = (hero.passive.text[lang] || hero.passive.text.ja || '').split(' / ').join('\n');
    card.append(head, body);

    const actions = document.createElement('div');
    actions.className = 'passive-actions';
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'ghost small';
    replay.textContent = text(lang, 'replay') + (options.effectLabel ? '（' + options.effectLabel + '）' : '');
    replay.addEventListener('click', options.onReplay);
    actions.appendChild(replay);
    card.appendChild(actions);

    passiveSection.appendChild(card);
    container.appendChild(passiveSection);
  }

  if (hero.attributes.length) {
    const attributeSection = section('attributes', lang);
    const list = document.createElement('div');
    list.className = 'tag-list';
    hero.attributes.forEach((attribute) => {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'tag';
      tag.textContent = lang === 'ja' ? attribute.ja : attribute.en;
      tag.addEventListener('click', () => options.onAttribute(attribute.id));
      list.appendChild(tag);
    });
    attributeSection.appendChild(list);
    container.appendChild(attributeSection);
  }

  if (hero.enchants.length) {
    const enchantSection = section('enchants', lang);
    const list = document.createElement('div');
    list.className = 'tag-list';
    hero.enchants.forEach((enchant) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.style.cursor = 'default';
      tag.textContent = (lang === 'ja' ? enchant.en : enchant.en) + ' +' + enchant.rate + '%';
      list.appendChild(tag);
    });
    enchantSection.appendChild(list);
    container.appendChild(enchantSection);
  }

  const metaSection = section('meta', lang);
  const meta = document.createElement('dl');
  meta.className = 'meta-grid';
  const rows = [
    [text(lang, 'issued'), hero.issued === '-' ? '—' : hero.issued],
    [text(lang, 'total'), String(hero.total)],
    ['ID', String(hero.id)],
  ];
  rows.forEach(([key, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = value;
    meta.append(dt, dd);
  });
  metaSection.appendChild(meta);
  container.appendChild(metaSection);

  const wikipedia = hero.wikipedia && (hero.wikipedia[lang] || hero.wikipedia.en);
  if (wikipedia) {
    const link = document.createElement('a');
    link.className = 'detail-link';
    link.href = wikipedia;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text(lang, 'wikipedia');
    container.appendChild(link);
  }

  container.scrollTop = 0;
}

export function showTooltip(element, hero, lang, screenX, screenY) {
  element.textContent = '';
  const name = document.createElement('strong');
  name.textContent = hero.name[lang] || hero.name.ja;
  const meta = document.createElement('span');
  const factionName = hero.faction ? (lang === 'ja' ? hero.faction.ja : hero.faction.en) : '—';
  const rarity = hero.rarityTier ? hero.rarityName : text(lang, 'novice');
  meta.textContent = rarity + ' / ' + factionName + ' / HP ' + hero.max.hp
    + ' PHY ' + hero.max.phy + ' INT ' + hero.max.int + ' AGI ' + hero.max.agi;
  element.append(name, meta);
  element.style.left = screenX + 'px';
  element.style.top = (screenY - 14) + 'px';
  element.hidden = false;
}

export function hideTooltip(element) {
  element.hidden = true;
}
