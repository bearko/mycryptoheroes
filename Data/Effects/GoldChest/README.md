# Data/Effects/GoldChest

My Crypto Heroes のクエスト画面で表示される **金宝箱ドロップ演出**（紙吹雪エフェクト + 金宝箱モーダル）を、フレームワーク非依存の素のHTML/CSS/JSで再現した実装です。

このフォルダは、リポジトリの上位フォルダ `Data/Effects/` に既に存在する `battle_effect_sprites.json`（Action欄スプライト）や `cutins.json`（カットイン演出）と並ぶ、もう一つの「ゲーム内エフェクト演出資産」として位置付けています。

## 何が入っているか

| パス | 内容 |
|------|------|
| `src/confetti.js` | 紙吹雪エフェクト本体（Canvas描画、外部依存なし） |
| `src/gold-chest-modal.js` | 金宝箱モーダル本体（背景暗転 + アイコン + Tweetボタン） |
| `demo/index.html` | 動作確認用のデモページ |
| `assets/treasure-chest.svg` | 宝箱アイコンのフォールバックSVG (CC0) |
| `docs/confetti.md` | 紙吹雪APIの詳細仕様 |
| `docs/gold-chest-modal.md` | 金宝箱モーダルAPIの詳細仕様 |
| `docs/analysis.md` | マイクリのJSバンドルから実装を抽出した経緯 |
| `docs/customization.md` | レアリティ別バリエーション・色変更などの応用例 |
| `docs/integration.md` | Unity / React / Vue への組み込み手順 |

## クイックスタート

```html
<script src="src/confetti.js"></script>
<script src="src/gold-chest-modal.js"></script>

<button onclick="GoldChestModal.show()">レアドロップ！</button>
```

これだけで紙吹雪付きの金宝箱モーダルが表示されます。

## デモを試す

`demo/index.html` をブラウザで直接開くと、Start/Stop/Pauseの操作、パラメータ調整スライダーで挙動を確認できます。`file://` でも動作します。

## マイクリから抽出した値

| 項目 | 値 | 出典 |
|------|-----|------|
| 紙吹雪 maxCount | 120 | quest.js (module 2653) |
| 紙吹雪 speed | 2 | 同上 |
| 紙吹雪 frameInterval | 15ms | 同上 |
| カラーパレット | 12色固定 (DodgerBlue, OliveDrab, Gold, ...) | 同上 |
| 金色グラデ | `linear-gradient(to left top, #ffe766, #998100)` | quest.js (module 2919, .goldChest__icon) |
| モーダル背景 | `#2a2d34` | 同上 |
| 宝箱アイコン | Font Awesome Pro `fal treasure-chest` | quest.186f36a.js |
| Tweet文 | "I just dropped a gold chest!" | quest.js |
| Tweetハッシュタグ | "MCH,MyCryptoHeroes" | 同上 |

詳しい解析プロセスは [docs/analysis.md](docs/analysis.md) を参照。

## 宝箱アイコンについて

オリジナルの実装は Font Awesome Pro の `treasure-chest` アイコンを使用していますが、Font Awesome Pro の SVG はライセンス購読者の自プロジェクト内利用に限定されているため、本リポジトリには **CC0 のフォールバック SVG** のみを `assets/treasure-chest.svg` として同梱しています。

Font Awesome Pro のライセンスを保有している場合は、`GoldChestModal.show({ iconSvg: ... })` オプションで自分のローカルにある SVG を差し込んでください。詳細は [docs/gold-chest-modal.md](docs/gold-chest-modal.md) を参照。

## ライセンス

このフォルダのコードは、リポジトリルートの [LICENSE](../../../LICENSE)（MIT）に従います。

`assets/treasure-chest.svg` は CC0 (Public Domain) の自作SVGです。

## 注意事項

- **ロジック**: 紙吹雪のアルゴリズム自体は Canvas に細い線分を描画するシンプルなもので、同系統のオープンソース実装（[davidpsalter/confetti](https://github.com/davidpsalter/confetti) など）が複数存在します。本実装はマイクリで使われている「具体的なパラメータ値」を保存することに価値があります。
- **画像/演出の利用**: 本フォルダには **マイクリの画像アセットそのもの** は含まれていません（含まれているのはCC0のフォールバックSVGのみ）。リポジトリ内の Image/* に格納されているマイクリ画像との利用については、ルートREADMEの「画像利用ガイドライン要約」セクションに従ってください。
