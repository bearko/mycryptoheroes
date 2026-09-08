// WebGL コンテキスト生成とシェーダー/バッファまわりの薄いラッパー。
// WebGL2 を優先し、無い場合は WebGL1 + ANGLE_instanced_arrays にフォールバックする。
// シェーダーは両方で動くように GLSL ES 1.00 で書く。

export function createContext(canvas) {
  const options = { alpha: false, antialias: true, depth: false, premultipliedAlpha: false };
  let gl = canvas.getContext('webgl2', options);
  let instancing = null;

  if (gl) {
    instancing = {
      divisor: (index, d) => gl.vertexAttribDivisor(index, d),
      drawArrays: (mode, first, count, primcount) => gl.drawArraysInstanced(mode, first, count, primcount),
    };
  } else {
    gl = canvas.getContext('webgl', options) || canvas.getContext('experimental-webgl', options);
    if (!gl) return null;
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    if (!ext) return null;
    instancing = {
      divisor: (index, d) => ext.vertexAttribDivisorANGLE(index, d),
      drawArrays: (mode, first, count, primcount) => ext.drawArraysInstancedANGLE(mode, first, count, primcount),
    };
  }

  gl.instancing = instancing;
  gl.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  return gl;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('shader compile failed: ' + log);
  }
  return shader;
}

// リンク済みプログラムと、attribute/uniform のロケーション表を返す。
export function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('program link failed: ' + log);
  }

  const attributes = {};
  const attributeCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < attributeCount; i += 1) {
    const info = gl.getActiveAttrib(program, i);
    attributes[info.name] = gl.getAttribLocation(program, info.name);
  }

  const uniforms = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i += 1) {
    const info = gl.getActiveUniform(program, i);
    const name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  return { program, attributes, uniforms };
}

export function createBuffer(gl, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  return buffer;
}

// 1枚のカードを描くための単位クアッド (0..1)。三角形ストリップで4頂点。
export function createUnitQuad(gl) {
  return createBuffer(gl, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
}

// float 単位のオフセット/ストライドで vec4 属性をバインドするヘルパー。
export function bindInstancedVec4(gl, location, strideFloats, offsetFloats) {
  if (location === undefined || location < 0) return;
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 4, gl.FLOAT, false, strideFloats * 4, offsetFloats * 4);
  gl.instancing.divisor(location, 1);
}

// ドット絵をぼかさないための空テクスチャ (NEAREST + CLAMP_TO_EDGE)。
export function createPixelTexture(gl, size) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function createTextureFromImage(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
