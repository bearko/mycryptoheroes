// 図鑑のWebGL描画。背景シェーダー、カードのインスタンス描画、
// パッシブスキルのエフェクトスプライト再生の3つのパスで構成する。

import { createProgram, createBuffer, createUnitQuad, bindInstancedVec4 } from './gl-core.js';

// 1インスタンスあたりの float 数 (vec4 x 5)
export const INSTANCE_FLOATS = 20;

const BACKGROUND_VS = `
precision highp float;
attribute vec2 a_corner;
uniform vec4 u_view;
varying vec2 v_world;
void main() {
  v_world = vec2(u_view.x + a_corner.x / u_view.z, u_view.y + a_corner.y / u_view.w);
  gl_Position = vec4(a_corner, 0.0, 1.0);
}
`;

const BACKGROUND_FS = `
precision highp float;
uniform float u_time;
uniform float u_zoomPx;
uniform vec3 u_accent;
varying vec2 v_world;

// ワールド座標に固定したグリッド。線幅は画面ピクセル基準で一定に見せる。
float gridLine(vec2 world, float spacing, float widthPx) {
  vec2 g = abs(fract(world / spacing - 0.5) - 0.5) * spacing;
  float d = min(g.x, g.y);
  float w = widthPx / max(u_zoomPx, 0.001);
  return 1.0 - smoothstep(w * 0.5, w * 1.5, d);
}

void main() {
  float radial = length(v_world) * 0.012;
  vec3 base = mix(vec3(0.055, 0.062, 0.082), vec3(0.020, 0.023, 0.032), clamp(radial, 0.0, 1.0));

  // 中央からゆっくり広がる淡い光。勢力フィルタの色を薄く混ぜる。
  float pulse = 0.5 + 0.5 * sin(u_time * 0.35 - length(v_world) * 0.05);
  base += u_accent * 0.045 * pulse * exp(-radial * 1.4);

  base += vec3(0.16, 0.18, 0.24) * gridLine(v_world, 6.1, 1.0) * 0.35;
  base += vec3(0.22, 0.24, 0.32) * gridLine(v_world, 30.5, 1.4) * 0.35;

  gl_FragColor = vec4(base, 1.0);
}
`;

const CARD_VS = `
precision highp float;
attribute vec2 a_corner;
attribute vec4 a_transform;
attribute vec4 a_uv;
attribute vec4 a_rarity;
attribute vec4 a_faction;
attribute vec4 a_state;

uniform vec4 u_view;
uniform float u_zoomPx;
uniform float u_time;

varying vec2 v_local;
varying vec2 v_uvBase;
varying float v_uvSize;
varying float v_hasImage;
varying vec4 v_rarity;
varying vec4 v_faction;
varying vec4 v_state;
varying float v_fade;
varying float v_aa;

void main() {
  float fade = a_transform.w;
  float hover = a_state.x;
  float selected = a_state.y;
  float bob = sin(u_time * 2.0 + a_state.w * 6.2831) * 0.012 * selected;
  float size = a_transform.z * mix(0.55, 1.0, fade) * (1.0 + hover * 0.12 + selected * 0.10);

  vec2 world = a_transform.xy + vec2(0.0, bob) + (a_corner - 0.5) * size;
  gl_Position = vec4((world.x - u_view.x) * u_view.z, (world.y - u_view.y) * u_view.w, 0.0, 1.0);

  v_local = a_corner;
  v_uvBase = a_uv.xy;
  v_uvSize = a_uv.z;
  v_hasImage = a_uv.w;
  v_rarity = a_rarity;
  v_faction = a_faction;
  v_state = a_state;
  v_fade = fade;
  // アンチエイリアス幅をカードの画面上のサイズから求める (fwidth を使わない)。
  v_aa = 1.5 / max(size * u_zoomPx, 2.0);
}
`;

const CARD_FS = `
precision highp float;
uniform sampler2D u_atlas;
uniform float u_time;

varying vec2 v_local;
varying vec2 v_uvBase;
varying float v_uvSize;
varying float v_hasImage;
varying vec4 v_rarity;
varying vec4 v_faction;
varying vec4 v_state;
varying float v_fade;
varying float v_aa;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = v_local - 0.5;
  float hover = v_state.x;
  float selected = v_state.y;
  float dim = v_state.z;

  float d = roundedBox(p, vec2(0.462), 0.085);
  if (d > 0.08) discard;
  float body = 1.0 - smoothstep(-v_aa, v_aa, d);

  // 台紙。勢力色をごく薄く敷いて、上下でグラデーションさせる。
  vec3 panel = mix(vec3(0.105, 0.115, 0.145), vec3(0.055, 0.060, 0.080), 1.0 - v_local.y);
  panel = mix(panel, v_faction.rgb, 0.10);
  panel = mix(panel, v_rarity.rgb, 0.05 + 0.05 * v_rarity.a);

  vec3 color = panel;

  // ヒーロー画像。カード中央 86% の正方形領域に等倍で貼る。
  vec2 art = (v_local - 0.5) / 0.84 + 0.5;
  if (v_hasImage > 0.5 && art.x > 0.0 && art.x < 1.0 && art.y > 0.0 && art.y < 1.0) {
    vec2 uv = v_uvBase + vec2(art.x, 1.0 - art.y) * v_uvSize;
    vec4 texel = texture2D(u_atlas, uv);
    color = mix(color, texel.rgb, texel.a);
  }

  // レアリティ枠。レプリカは内側にもう1本細い線を入れて区別する。
  float border = smoothstep(-0.030 - v_aa, -0.030 + v_aa, d) * (1.0 - smoothstep(-v_aa, v_aa, d));
  color = mix(color, v_rarity.rgb, border * (0.75 + 0.25 * v_rarity.a));
  float innerLine = smoothstep(-0.062 - v_aa, -0.062 + v_aa, d) * (1.0 - smoothstep(-0.048 - v_aa, -0.048 + v_aa, d));
  color = mix(color, v_rarity.rgb * 0.55, innerLine * v_faction.a * 0.9);

  // 左上の勢力ウェッジ。
  float wedge = 1.0 - smoothstep(0.26, 0.26 + v_aa * 6.0, v_local.x + (1.0 - v_local.y));
  color = mix(color, v_faction.rgb, wedge * 0.85 * body);

  // ホバー/選択の強調。選択中は時間で脈打つリングを重ねる。
  color += v_rarity.rgb * hover * 0.20;
  float ring = (1.0 - smoothstep(0.0, 0.055, abs(d + 0.012)));
  float pulse = 0.55 + 0.45 * sin(u_time * 4.0);
  color += vec3(1.0) * ring * selected * (0.25 + 0.35 * pulse);

  color = mix(color, vec3(0.06, 0.07, 0.09), dim * 0.72);

  float alpha = body * v_fade * mix(1.0, 0.35, dim);
  float glow = (1.0 - smoothstep(0.0, 0.075, max(d, 0.0))) * max(hover * 0.45, selected * 0.75) * v_fade;
  color += v_rarity.rgb * glow * 0.9;
  alpha = clamp(alpha + glow * 0.55, 0.0, 1.0);

  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const EFFECT_VS = `
precision highp float;
attribute vec2 a_corner;
uniform vec4 u_view;
uniform vec4 u_rect; // x, y, size, unused
varying vec2 v_local;
void main() {
  vec2 world = u_rect.xy + (a_corner - 0.5) * u_rect.z;
  gl_Position = vec4((world.x - u_view.x) * u_view.z, (world.y - u_view.y) * u_view.w, 0.0, 1.0);
  v_local = a_corner;
}
`;

const EFFECT_FS = `
precision highp float;
uniform sampler2D u_sheet;
uniform vec4 u_frame; // cols, rows, frameIndex, alpha
varying vec2 v_local;
void main() {
  float cols = u_frame.x;
  float rows = u_frame.y;
  float index = floor(u_frame.z);
  float col = mod(index, cols);
  float row = floor(index / cols);
  vec2 cell = vec2(1.0 / cols, 1.0 / rows);
  vec2 uv = (vec2(col, row) + vec2(v_local.x, 1.0 - v_local.y)) * cell;
  vec4 texel = texture2D(u_sheet, uv);
  gl_FragColor = vec4(texel.rgb, texel.a * u_frame.w);
}
`;

export class Renderer {
  constructor(gl) {
    this.gl = gl;
    this.quad = createUnitQuad(gl);
    this.fullscreen = createBuffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    this.background = createProgram(gl, BACKGROUND_VS, BACKGROUND_FS);
    this.cards = createProgram(gl, CARD_VS, CARD_FS);
    this.effect = createProgram(gl, EFFECT_VS, EFFECT_FS);
    this.instanceBuffer = gl.createBuffer();
    this.instanceCapacity = 0;

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(pixelWidth, pixelHeight) {
    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  drawBackground(view, time, zoomPx, accent) {
    const gl = this.gl;
    const { program, attributes, uniforms } = this.background;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreen);
    gl.enableVertexAttribArray(attributes.a_corner);
    gl.vertexAttribPointer(attributes.a_corner, 2, gl.FLOAT, false, 0, 0);
    gl.instancing.divisor(attributes.a_corner, 0);
    gl.uniform4fv(uniforms.u_view, view);
    gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_zoomPx, zoomPx);
    gl.uniform3fv(uniforms.u_accent, accent);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  drawCards(view, time, zoomPx, data, count, atlasTexture) {
    if (count <= 0) return;
    const gl = this.gl;
    const { program, attributes, uniforms } = this.cards;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    if (count > this.instanceCapacity) {
      this.instanceCapacity = Math.max(count, 64);
      gl.bufferData(gl.ARRAY_BUFFER, this.instanceCapacity * INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * INSTANCE_FLOATS));

    gl.useProgram(program);
    bindInstancedVec4(gl, attributes.a_transform, INSTANCE_FLOATS, 0);
    bindInstancedVec4(gl, attributes.a_uv, INSTANCE_FLOATS, 4);
    bindInstancedVec4(gl, attributes.a_rarity, INSTANCE_FLOATS, 8);
    bindInstancedVec4(gl, attributes.a_faction, INSTANCE_FLOATS, 12);
    bindInstancedVec4(gl, attributes.a_state, INSTANCE_FLOATS, 16);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(attributes.a_corner);
    gl.vertexAttribPointer(attributes.a_corner, 2, gl.FLOAT, false, 0, 0);
    gl.instancing.divisor(attributes.a_corner, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.uniform1i(uniforms.u_atlas, 0);
    gl.uniform4fv(uniforms.u_view, view);
    gl.uniform1f(uniforms.u_zoomPx, zoomPx);
    gl.uniform1f(uniforms.u_time, time);

    gl.instancing.drawArrays(gl.TRIANGLE_STRIP, 0, 4, count);

    // 他のパス (背景/エフェクト) は非インスタンス描画なので、後片付けしておく。
    [attributes.a_transform, attributes.a_uv, attributes.a_rarity, attributes.a_faction, attributes.a_state]
      .forEach((location) => {
        if (location === undefined || location < 0) return;
        gl.instancing.divisor(location, 0);
        gl.disableVertexAttribArray(location);
      });
  }

  drawEffect(view, rect, texture, cols, rows, frame, alpha) {
    const gl = this.gl;
    const { program, attributes, uniforms } = this.effect;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(attributes.a_corner);
    gl.vertexAttribPointer(attributes.a_corner, 2, gl.FLOAT, false, 0, 0);
    gl.instancing.divisor(attributes.a_corner, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.u_sheet, 0);
    gl.uniform4fv(uniforms.u_view, view);
    gl.uniform4f(uniforms.u_rect, rect.x, rect.y, rect.size, 0);
    gl.uniform4f(uniforms.u_frame, cols, rows, frame, alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
