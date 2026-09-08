// 64x64 のヒーロー画像 404 枚を 1 枚のテクスチャアトラスにまとめる。
// 読み込めたものから texSubImage2D で流し込むので、待たずに描画を開始できる。

import { createPixelTexture } from './gl-core.js';

const CELL = 64;
const ATLAS_SIZE = 2048;
const COLUMNS = ATLAS_SIZE / CELL;
const CONCURRENCY = 24;

export class HeroAtlas {
  constructor(gl, heroes) {
    this.gl = gl;
    this.texture = createPixelTexture(gl, ATLAS_SIZE);
    this.cellUvSize = CELL / ATLAS_SIZE;
    this.slots = new Map();
    this.loaded = new Set();
    this.failed = new Set();
    heroes.forEach((hero, index) => {
      this.slots.set(hero.id, {
        u: ((index % COLUMNS) * CELL) / ATLAS_SIZE,
        v: (Math.floor(index / COLUMNS) * CELL) / ATLAS_SIZE,
        x: (index % COLUMNS) * CELL,
        y: Math.floor(index / COLUMNS) * CELL,
      });
    });
    if (heroes.length > COLUMNS * COLUMNS) {
      console.warn('ヒーロー数がアトラスの収容数を超えています', heroes.length, COLUMNS * COLUMNS);
    }
  }

  slotOf(heroId) {
    return this.slots.get(heroId);
  }

  isLoaded(heroId) {
    return this.loaded.has(heroId);
  }

  upload(hero, image) {
    const slot = this.slots.get(hero.id);
    if (!slot) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, slot.x, slot.y, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.loaded.add(hero.id);
  }

  // 同時接続数を絞りつつ全画像を読み込む。onProgress(done, total) で進捗を通知。
  async loadAll(heroes, onProgress) {
    let cursor = 0;
    let done = 0;
    const total = heroes.length;

    const worker = async () => {
      while (cursor < total) {
        const hero = heroes[cursor];
        cursor += 1;
        try {
          const image = await loadImage(hero.imagePath);
          this.upload(hero, image);
        } catch (error) {
          this.failed.add(hero.id);
        }
        done += 1;
        if (onProgress) onProgress(done, total);
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, total); i += 1) workers.push(worker());
    await Promise.all(workers);
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした: ' + src));
    image.src = src;
  });
}
