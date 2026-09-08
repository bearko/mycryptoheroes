// パッシブスキルの effect_id (1〜5) に対応する、バトルエフェクトスプライトとSEを扱う。
// マニフェストとアセットは、ヒーローを選択したときに初めて読み込む。

import { loadImage } from './atlas.js';
import { createTextureFromImage } from './gl-core.js';

const SPRITE_JSON = '../../Data/Effects/battle_effect_sprites.json';
const SE_JSON = '../../Data/SoundEffects/battle_sound_effects.json';
const FRAME_DURATION = 1 / 60;

export class EffectPlayer {
  constructor(gl) {
    this.gl = gl;
    this.manifest = null;
    this.sprites = new Map();
    this.sounds = new Map();
    this.pending = new Set();
    this.active = null;
    this.soundEnabled = false;
  }

  async loadManifest() {
    if (this.manifest) return this.manifest;
    const [spriteResponse, seResponse] = await Promise.all([fetch(SPRITE_JSON), fetch(SE_JSON)]);
    const sprites = spriteResponse.ok ? await spriteResponse.json() : [];
    const sounds = seResponse.ok ? await seResponse.json() : [];
    this.manifest = { sprites, sounds };
    return this.manifest;
  }

  async prepare(effectId) {
    if (!effectId || this.sprites.has(effectId) || this.pending.has(effectId)) return;
    this.pending.add(effectId);
    try {
      const manifest = await this.loadManifest();
      const entry = manifest.sprites.find((sprite) => sprite.id === effectId);
      if (entry) {
        const image = await loadImage('../../' + entry.image_file_path);
        this.sprites.set(effectId, {
          texture: createTextureFromImage(this.gl, image),
          cols: Math.max(1, Math.round(entry.width / entry.frame_width)),
          rows: Math.max(1, Math.round(entry.height / entry.frame_height)),
          frameCount: entry.frame_count,
          label: entry.label,
        });
      }
      const sound = manifest.sounds.find((item) => item.id === effectId);
      if (sound) {
        const mp3 = sound.files.find((file) => file.format === 'mp3') || sound.files[0];
        if (mp3) {
          const audio = new Audio('../../' + mp3.audio_file_path);
          audio.preload = 'auto';
          audio.volume = 0.5;
          this.sounds.set(effectId, audio);
        }
      }
    } catch (error) {
      console.warn('エフェクトアセットを読み込めませんでした', effectId, error);
    } finally {
      this.pending.delete(effectId);
    }
  }

  // 選択したヒーローの位置でスプライトを1回再生する。
  async play(effectId, worldX, worldY, size) {
    if (!effectId) return;
    await this.prepare(effectId);
    const sprite = this.sprites.get(effectId);
    if (!sprite) return;
    this.active = { effectId, x: worldX, y: worldY, size, elapsed: 0 };
    if (this.soundEnabled) {
      const audio = this.sounds.get(effectId);
      if (audio) {
        audio.currentTime = 0;
        const promise = audio.play();
        if (promise && promise.catch) promise.catch(() => {});
      }
    }
  }

  stop() {
    this.active = null;
  }

  // 再生中なら描画パラメータを返し、終了していたら null を返す。
  step(dt) {
    if (!this.active) return null;
    const sprite = this.sprites.get(this.active.effectId);
    if (!sprite) {
      this.active = null;
      return null;
    }
    this.active.elapsed += dt;
    const frame = Math.floor(this.active.elapsed / FRAME_DURATION);
    if (frame >= sprite.frameCount) {
      this.active = null;
      return null;
    }
    const progress = frame / sprite.frameCount;
    return {
      texture: sprite.texture,
      cols: sprite.cols,
      rows: sprite.rows,
      frame,
      alpha: Math.min(1, (1 - progress) * 3),
      x: this.active.x,
      y: this.active.y,
      size: this.active.size,
    };
  }
}
