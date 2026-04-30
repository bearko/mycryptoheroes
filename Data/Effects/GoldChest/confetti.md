# Confetti API

紙吹雪エフェクトの完全なAPI仕様です。

## 基本的な使い方

```html
<script src="../src/confetti.js"></script>
<script>
    Confetti.start();           // 紙吹雪開始
    Confetti.stop();            // 新規生成停止（既存粒子は落ちきる）
    Confetti.remove();          // 即座に全削除
</script>
```

## メソッド一覧

### `Confetti.start(timeout?, min?, max?)`

紙吹雪の生成を開始します。

| 引数 | 型 | 説明 |
|------|-----|------|
| `timeout` | number? | 自動停止までのミリ秒。省略時は手動で `stop()` するまで継続 |
| `min` | number? | 最小粒子数。`max` と組み合わせるとランダム化 |
| `max` | number? | 最大粒子数 |

```javascript
Confetti.start();              // デフォルト120粒子で開始
Confetti.start(3000);          // 3秒後に自動停止
Confetti.start(0, 50, 200);    // 50〜200粒子のランダム生成
```

### `Confetti.stop()`

新規粒子の生成を停止します。既に画面上にある粒子はそのまま落下しきります。

### `Confetti.remove()`

紙吹雪を即座に全削除します。Canvas はクリアされ、状態もリセットされます。モーダルを閉じる時などに使います。

### `Confetti.toggle()`

`start()` と `stop()` をトグルします。

### `Confetti.pause()` / `Confetti.resume()` / `Confetti.togglePause()`

アニメーションを一時停止 / 再開します。`stop()` と異なり粒子の状態は保持されます。

### `Confetti.isRunning()` / `Confetti.isPaused()`

現在の状態を返します。

## 設定プロパティ

`Confetti.start()` を呼ぶ前に変更してください。

| プロパティ | デフォルト | 説明 |
|------------|-----------|------|
| `Confetti.maxCount` | 120 | 最大粒子数。多いほど密集する。モバイルなら60〜80推奨 |
| `Confetti.speed` | 2 | 落下速度。値が大きいほど速い |
| `Confetti.frameInterval` | 15 | フレーム間隔(ms)。低スペック端末では30程度に上げると軽くなる |
| `Confetti.alpha` | 1 | 透明度（0.0〜1.0） |
| `Confetti.gradient` | false | true にすると粒子に2色グラデーションがかかる |

```javascript
Confetti.maxCount = 200;
Confetti.speed = 3;
Confetti.gradient = true;
Confetti.start();
```

## 描画の仕組み

紙吹雪は四角い粒子ではなく **「線分（lineTo）」** として描かれています。これがマイクリの紙吹雪らしい「ヒラヒラ感」を出している正体です。

```javascript
ctx.beginPath();
ctx.lineWidth = particle.diameter;        // 太さ 5〜15px
ctx.moveTo(x + diameter/2, y);            // 始点
ctx.lineTo(x2, y2);                       // 終点（傾きあり）
ctx.stroke();
```

各粒子の動きは以下のように更新されます。

```javascript
particle.tiltAngle += particle.tiltAngleIncrement;     // 角度変化
particle.x += Math.sin(waveAngle);                     // 横揺れ
particle.y += (Math.cos(waveAngle) + diameter + speed) * 0.5;  // 落下
particle.tilt = Math.sin(particle.tiltAngle) * 15;     // 傾き
```

## カラーパレット

12色固定。`alpha` プロパティで透明度を調整します。

| 色名 | RGB |
|------|-----|
| DodgerBlue | 30,144,255 |
| OliveDrab | 107,142,35 |
| Gold | 255,215,0 |
| Pink | 255,192,203 |
| SlateBlue | 106,90,205 |
| LightBlue | 173,216,230 |
| Violet | 238,130,238 |
| PaleGreen | 152,251,152 |
| SteelBlue | 70,130,180 |
| SandyBrown | 244,164,96 |
| Chocolate | 210,105,30 |
| Crimson | 220,20,60 |

色を変更したい場合はソース上部の `colors` 配列を直接編集してください。詳細は [customization.md](customization.md) を参照。

## Canvas の挙動

- `<canvas id="confetti-canvas">` を `<body>` 直下に動的に挿入します
- `position: fixed`, `z-index: 999999`, `pointer-events: none` で全画面オーバーレイ
- `window.resize` イベントを監視してサイズ自動調整
- 一度生成した Canvas は `remove()` を呼んでも DOM からは消えません（次回 start で再利用）

## パフォーマンスのコツ

- **粒子数を絞る** — モバイルでは60〜80でも十分派手に見えます
- **frameInterval を上げる** — 30にすれば描画頻度が半分になり、見た目もそれなりに維持できます
- **gradient = false を維持** — グラデーション計算は粒子ごとに行われるため、true にすると重くなります
- **長時間流しっぱなしにしない** — 演出は2〜3秒で `stop()` を呼ぶのが理想

## 既知の制約

- IE11 では `requestAnimationFrame` の代わりに `setTimeout` フォールバックを使うため、若干カクつくことがあります
- iOS Safari の低電力モードではフレームレートが30fpsに制限されます
