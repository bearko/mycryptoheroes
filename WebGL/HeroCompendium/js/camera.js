// 2Dの正射影カメラ。zoom は「ワールド1単位あたりのCSSピクセル数」。

const MIN_ZOOM = 6;
const MAX_ZOOM = 260;
const FIT_MAX_ZOOM = 140;

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 48;
    this.targetX = 0;
    this.targetY = 0;
    this.targetZoom = 48;
    this.viewWidth = 1;
    this.viewHeight = 1;
  }

  setViewport(width, height) {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
  }

  clampZoom(zoom) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  }

  // ドラッグ操作は追従なしで即座に動かす。
  panBy(dxPixels, dyPixels) {
    this.x -= dxPixels / this.zoom;
    this.y += dyPixels / this.zoom;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  // カーソル位置のワールド座標を固定したままズームする。
  zoomAt(factor, screenX, screenY) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = this.clampZoom(this.zoom * factor);
    this.targetZoom = this.zoom;
    const after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  moveTo(x, y, zoom) {
    this.targetX = x;
    this.targetY = y;
    if (zoom != null) this.targetZoom = this.clampZoom(zoom);
  }

  // レイアウト全体が画面に収まる位置とズームを目標にする。
  fit(bounds, padding) {
    const pad = padding || { left: 0, right: 0, top: 0, bottom: 0 };
    const usableWidth = Math.max(80, this.viewWidth - pad.left - pad.right);
    const usableHeight = Math.max(80, this.viewHeight - pad.top - pad.bottom);
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
    const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
    // 数体しか残っていないときに拡大しすぎないよう、全体表示のズームには上限を設ける。
    const zoom = this.clampZoom(Math.min(usableWidth / worldWidth, usableHeight / worldHeight, FIT_MAX_ZOOM));
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    // パネル類でふさがれている分だけ、見える領域の中心をずらす。
    this.moveTo(
      centerX - (pad.left - pad.right) / 2 / zoom,
      centerY + (pad.top - pad.bottom) / 2 / zoom,
      zoom,
    );
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 9);
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * k;
  }

  screenToWorld(screenX, screenY) {
    return {
      x: this.x + (screenX - this.viewWidth / 2) / this.zoom,
      y: this.y - (screenY - this.viewHeight / 2) / this.zoom,
    };
  }

  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.x) * this.zoom + this.viewWidth / 2,
      y: (this.y - worldY) * this.zoom + this.viewHeight / 2,
    };
  }

  // シェーダーへ渡す view uniform: (camX, camY, clipScaleX, clipScaleY)
  viewUniform() {
    return [this.x, this.y, (2 * this.zoom) / this.viewWidth, (2 * this.zoom) / this.viewHeight];
  }
}
