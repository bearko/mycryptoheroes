# 解析メモ — マイクリ実装の抽出経緯

このドキュメントは、My Crypto Heroes のクライアントサイドJSから紙吹雪と金宝箱モーダルの実装を特定・抽出した手順の記録です。

## 出発点

きっかけは「マイクリのクエストで金箱が出た時の演出を、自作ゲームで再現したい」というシンプルな動機です。マイクリは Vue.js + webpack でビルドされた SPA で、production ビルドの JS は minify + chunk 分割されていますが、ソースマップは公開されておらず、Pro license のフォントアイコンとカスタム描画ロジックの両方が混在していました。

## 解析の流れ

### Step 1: 表側のページを観察

最初に `https://www.mycryptoheroes.net/ja/quest` を fetch しましたが、ログイン前のマーケティングページしか取得できず、肝心のクエスト画面のHTML/JSは含まれていませんでした。

**学び**: SPA のクライアントロジックは初期HTMLには出てこない。ログイン後の DevTools が必須。

### Step 2: DevTools で chunk を特定

実際にログインしてクエストをプレイし、DevTools の Network タブで読み込まれている JS を観察。クエスト画面で読み込まれる主要な chunk は以下でした。

- `quest.186f36a.js` — クエスト一覧画面のVueコンポーネント
- `quest.js` (ハッシュ違い) — バトル/結果画面のロジック
- 数多くのCSS module chunk（番号で識別）

### Step 3: quest.186f36a.js — 最初の手がかり

このファイルにモーダルのテンプレートが含まれており、以下の決定的な発見がありました。

```javascript
// minify されたコードから抜粋（整形）
"font-awesome-icon",
{ class: "goldChest", icon: ["fal", "treasure-chest"] }
```

**判明したこと**:
- 宝箱アイコンは Font Awesome の **`treasure-chest`** アイコンを使用
- スタイル指定は **`fal`**（Font Awesome **L**ight = **Pro 専用**）
- カスタム pixel art アセットではない

これにより、宝箱アイコン自体は Font Awesome Pro のライセンスがあれば誰でも合法的に再現可能だと分かりました。

### Step 4: CSS module 3688 — フェイクの手がかり

クラス名 `battleJinInfo` を持つ CSS module を発見。当初「Jin = 金 = Gold」かと思いましたが、これは **「陣（じん）」= バトルフォーメーション** の意味で、金宝箱とは無関係でした。

**学び**: ローマ字表記された日本語は、英語/中国語の同じスペルと混同されやすい。`Jin` は「陣」「人」「仁」「神」など多義。

### Step 5: quests/index ページのバンドル — 半当たり

クエスト一覧画面の大きいバンドルには「出発モーダル」（`departureModal`）の実装はあったものの、**結果画面の金宝箱ロジックは含まれていませんでした**。マイクリは画面遷移ごとに別 chunk を遅延ロードしているため、バトル結果画面に入った時点で読み込まれる別 chunk を探す必要がありました。

### Step 6: quest.js（バトル/結果画面）— 大当たり

バトル結果画面で読み込まれる chunk に、求めていた全実装がありました。

#### Module 2653 — 紙吹雪ロジック

minify を整形すると以下の構造でした。

```javascript
var Confetti = {
    maxCount: 120,
    speed: 2,
    frameInterval: 15,
    alpha: 1,
    gradient: false,
    // ...
};

var colors = [
    "rgba(30,144,255,",   // DodgerBlue
    "rgba(107,142,35,",   // OliveDrab
    "rgba(255,215,0,",    // Gold
    // ... 全12色
];
```

**この実装の特徴的な点**:
- `canvas-confetti` のような有名ライブラリではない
- 粒子は四角ではなく **線分（lineTo）** で描画
- カラーパレット末尾の `,` は後で `alpha + ')'` を結合するため

実はこのアルゴリズム自体は [confetti.js by davidpsalter](https://github.com/davidpsalter/confetti) など複数のオープンソース実装に存在しており、マイクリはそれを取り込んで使っているか、独立に同様の実装を書いたものと思われます。重要なのは「マイクリで使われている具体的なパラメータ値」です。

#### Module 2919 — GoldChest コンポーネント

Vue コンポーネントとして以下のライフサイクルが組まれていました。

```javascript
{
    created: function () {
        confetti.default.start();   // モーダル表示時に紙吹雪開始
    },
    beforeDestroy: function () {
        confetti.default.stop();    // モーダル消滅時に停止
    }
}
```

#### CSS — 金色グラデーション

```css
.goldChest__icon {
    background: linear-gradient(to left top, #ffe766, #998100);
    border-radius: 0.5rem;
    padding: 0.7rem;
    font-size: 2rem;
}

.goldChest__text {
    color: gold;
    font-size: 1.2rem;
    font-weight: 700;
}
```

これがあのキラキラした金色の宝箱の正体です。明るい黄金色 `#ffe766` から濃い黄土色 `#998100` への斜めグラデーション。

#### Tweet ボタン

```javascript
var url = "https://twitter.com/share?text=" +
    encodeURIComponent("I just dropped a gold chest!") +
    "&url=" + encodeURIComponent("https://mch.gg") +
    "&hashtags=" + encodeURIComponent("MCH,MyCryptoHeroes");
```

色は Twitter 公式ブルー `#1da1f2`。

## 抽出した値の一覧

このリポジトリの実装に取り込んだ「マイクリそのまま」の値です。

| 項目 | 値 |
|------|-----|
| 紙吹雪 maxCount | 120 |
| 紙吹雪 speed | 2 |
| 紙吹雪 frameInterval | 15ms |
| 紙吹雪 粒子直径 | 5〜15px (random) |
| 紙吹雪 カラーパレット | 12色固定 |
| Canvas z-index | 999999 |
| 金色グラデ | `linear-gradient(to left top, #ffe766, #998100)` |
| モーダル背景 | `#2a2d34` |
| モーダル padding | `1.5rem` |
| Tweet ボタン色 | `#1da1f2` |
| 宝箱アイコン | Font Awesome Pro `fal treasure-chest` |

## このリポジトリと元実装との違い

- **Vue.js 依存を排除** — `created` / `beforeDestroy` の代わりに `show()` / `hide()` の関数API
- **Font Awesome Pro 非依存** — フォールバック用の汎用 SVG を同梱（ただし Pro ライセンスがあれば差し替え可能）
- **TweetボタンをURL/テキスト動的生成に** — `tweetUrl` オプションで自由にカスタマイズ
- **ESCキーとaria属性追加** — アクセシビリティ強化
- **コメントを日本語で完備** — 学習・改造目的で読みやすく

## 教訓

1. **SPA の解析は DevTools が必須** — 初期HTMLには何も載っていない
2. **chunk の読み込みタイミングを観察する** — 画面遷移ごとに別ファイルが読まれる
3. **minify されていてもクラス名は残ることが多い** — `goldChest__icon` のような BEM 風命名が手がかりになる
4. **Font Awesome のクラス名は識別しやすい** — `["fal", "treasure-chest"]` のような配列指定がそのまま見える
5. **CSS module の番号だけでは何のスタイルか分からない** — クラス名と組み合わせて意味を推測する必要がある
