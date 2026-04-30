# mycryptoheroes-effects

[My Crypto Heroes](https://www.mycryptoheroes.net/) のクエスト画面で使われている **紙吹雪エフェクト** と **金宝箱モーダル** を、フレームワーク非依存の素のHTML/CSS/JSで再現した実装集です。

ターン制タクティクスゲームなど、自作ゲームにレアドロップ演出を組み込みたい開発者向けのリファレンス実装として公開しています。

## デモ

`demo/index.html` をブラウザで開くと、以下が試せます。

- 紙吹雪の Start / Stop / Pause / Remove
- 金宝箱モーダルの表示（紙吹雪あり / なし）
- パラメータ（粒子数・速度・透明度・グラデーション）のリアルタイム調整

## 特徴

- **外部ライブラリ不要** — Canvas に直接描画。npm/CDNへの依存ゼロ
- **マイクリ実装を忠実に再現** — 12色の固定パレット、粒子は四角ではなく「線分」、`Math.sin/cos` による揺らぎ
- **2KB台の軽量実装** — minify前で約8KB、minify後はさらに小さい
- **ESC キーでモーダル閉じ・aria属性付き** — アクセシビリティ配慮済み
- **モジュール export 対応** — `module.exports` でも `window.Confetti` でも使える

## クイックスタート

```html
<script src="src/confetti.js"></script>
<script src="src/gold-chest-modal.js"></script>

<button onclick="GoldChestModal.show()">レアドロップ！</button>
```

これだけで紙吹雪付きの金宝箱モーダルが表示されます。

## ファイル構成

```
mycryptoheroes/
├── README.md                     ← このファイル
├── src/
│   ├── confetti.js               ← 紙吹雪エフェクト本体
│   └── gold-chest-modal.js       ← 金宝箱モーダル本体
├── demo/
│   └── index.html                ← デモページ
├── assets/
│   └── treasure-chest.svg        ← 宝箱アイコン (フォールバック用)
└── docs/
    ├── confetti.md               ← 紙吹雪のAPI詳細
    ├── gold-chest-modal.md       ← モーダルのAPI詳細
    ├── analysis.md               ← マイクリ実装の解析メモ
    ├── customization.md          ← カスタマイズ例集
    └── integration.md            ← 自ゲームへの組み込み手順
```

## ドキュメント

- [紙吹雪エフェクトのAPI](docs/confetti.md) — `Confetti.start()` などの詳細
- [金宝箱モーダルのAPI](docs/gold-chest-modal.md) — `GoldChestModal.show()` のオプション
- [マイクリ実装の解析メモ](docs/analysis.md) — どこからこの実装を抽出したかの経緯
- [カスタマイズ例](docs/customization.md) — 色変更・スプライト紙吹雪・自作ゲームでの応用
- [自ゲームへの組み込み手順](docs/integration.md) — Unity / React / Vue で使う場合

## ブラウザサポート

Canvas API と `requestAnimationFrame` が動けばOK。実質的に IE11 以降の全モダンブラウザで動作します（IE11 用の polyfill 含む）。

## ライセンスと免責

このリポジトリのコード自体は **MIT License** で公開しています。

ただし、以下の点に注意してください。

- **アルゴリズム自体** は My Crypto Heroes のクライアントサイドJSから抽出・再構成したものです。同様のロジックは [confetti.js](https://github.com/davidpsalter/confetti) など複数のオープンソース実装が存在し、当該実装も同系統のシンプルなCanvas紙吹雪です。商用利用については各自で判断してください。
- **金宝箱の宝箱アイコン** は元実装では Font Awesome Pro の `treasure-chest` を使用しています。このリポジトリには代替として CC0 のシンプルなSVGを同梱しています。Font Awesome Pro を使用する場合はライセンス購入が必要です。
- **My Crypto Heroes** は double jump.tokyo Inc. および MCH Co., Ltd. の作品です。本リポジトリは公式とは無関係の研究・教育目的の実装です。

## 作者

[@bearko](https://github.com/bearko)

ターン制タクティクスゲームを開発中。マイクリのリスペクトを込めて、自作ゲームに同じテイストの演出を組み込むため抽出しました。
