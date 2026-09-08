# Data/HeroAnimations

ヒーローごとのデフォルメ（SD）アニメーション素材を、ヒーローIDで紐づけて管理する場所です。既存のドット絵（`Image/Heroes/[ID].png`）とはフォルダを分けて、`Image/HeroAnimations/` 以下に置きます。

- `hero_animations.json`: 全ヒーロー分のアニメーション一覧（自動生成）。
- `metadata.json`: 件数、収録モーション、警告、クレジット（自動生成）。
- 画像本体: `Image/HeroAnimations/<テンプレートサイズ>/<ヒーローID>/`

## 収録済み

| ヒーローID | 名前 | モーション | 方向 | コマ数 |
|-----------|------|-----------|------|--------|
| `10001` | MCHウォーリアー | `idle` / `walk` | 8方向 | 各4コマ（100ms） |
| `10001` | MCHウォーリアー | `attack` | 5方向（左向きは反転） | 7コマ（50〜200ms） |

## フォルダ構成

```
Image/HeroAnimations/
└── 16x32/                 元テンプレートのキャラクターサイズ
    └── 10001/             ヒーローID。Data/Heroes/heroes.json の id と一致させる
        ├── idle_s.gif     そのまま再生できるGIF
        ├── idle_s.png     同じコマを横1列に並べたスプライトシート
        ├── idle_se.gif
        ├── idle_se.png
        ├── ...
        ├── walk_s.gif / walk_s.png
        ├── ...
        ├── attack_s.gif / attack_s.png
        └── ...
```

ヒーローIDのフォルダ名は `Data/Heroes/heroes.json` の `id` と同じ値にしてください。生成スクリプトがマスタと突き合わせ、見つからないIDは警告として `metadata.json` に記録します。

> **注意**: 制作ツール側のフォルダ名やファイル名の連番（`prod_1001`、`1001_16x32_animation_...` など）は、`heroes.json` のヒーローIDとは一致しないことがあります。実際、MCHウォーリアーのIDは `10001` で、`1001` は別のヒーロー（コナン・ドイル）です。スクリプトは存在しないIDしか警告できないため、フォルダ名は必ず `heroes.json` の `id` を確認してから付けてください。

## サイズについて

フォルダ名の `16x32` は**元テンプレートのキャラクターサイズ**です。実際の画像のキャンバスは **32x32** で、攻撃モーションで剣が枠外に振られる分の余白を含みます。1コマの実サイズは `hero_animations.json` の `canvas_width` / `canvas_height`、および各クリップの `frame_width` / `frame_height` を参照してください。

## 2つの形式

| 形式 | 用途 |
|------|------|
| `.gif` | ブラウザやチャットでそのまま再生できます。`<img src="...">` を置くだけで動きます。 |
| `.png` | 横1列のスプライトシート。GIFを読めないゲームエンジンや、WebGL/Canvasでコマ送りしたい場合に使います。 |

PNGはGIFと同じコマを、同じ順序・同じピクセルで並べたものです（`scripts/build_hero_animation_sheets.py` で生成）。n番目のコマの切り出し位置は次の通りです。

```js
const sx = (n % sheet.columns) * frame_width;
const sy = Math.floor(n / sheet.columns) * frame_height;
```

各コマの表示時間は、クリップの `durations_ms` に1コマずつ入っています（`idle` / `walk` は 100ms 均一、`attack` は 50〜200ms の可変）。等速で再生すると攻撃のタメと振りが崩れるので、`durations_ms` をそのまま使ってください。

ドット絵なので、拡大表示するときはニアレストネイバー（CSSなら `image-rendering: pixelated;`）を使ってください。

## ファイル名の規約

```
<モーション>_<方向>.gif   /  <モーション>_<方向>.png
```

例: `idle_s.gif`、`walk_ne.png`、`attack_e.gif`

### 方向

`s`（下）を基準に時計回りで8方向です。

| キー | 向き | 別名として認識する表記 |
|------|------|------------------------|
| `s`  | 下（手前） | `south` `down` `front` `d` |
| `se` | 右下 | `southeast` `down_right` `dr` |
| `e`  | 右 | `east` `right` `side_right` `r` |
| `ne` | 右上 | `northeast` `up_right` `ur` |
| `n`  | 上（奥） | `north` `up` `back` `u` |
| `nw` | 左上 | `northwest` `up_left` `ul` |
| `w`  | 左 | `west` `left` `side_left` `l` |
| `sw` | 左下 | `southwest` `down_left` `dl` |

攻撃モーションのように5方向（`s` `se` `e` `ne` `n`）しか無い場合は、左向きの3方向を右向きの左右反転で表示してください。どの向きを反転で作るかは、各モーションの `mirrored_directions` に入ります。

```json
"mirrored_directions": [
  { "direction": "nw", "mirror_of": "ne" },
  { "direction": "w",  "mirror_of": "e"  },
  { "direction": "sw", "mirror_of": "se" }
]
```

### モーション

`idle`（待機）、`walk`（歩行）、`attack`（攻撃）を収録しています。`stand` → `idle`、`attak` / `atk` → `attack` のような表記ゆれは正式名に寄せます。

表に無いモーション名はそのまま新しいモーションとして登録されるので、`run` や `cast` などを後から追加してもスクリプトの修正は不要です。日本語ラベルを付けたい場合だけ `scripts/generate_hero_animation_manifest.js` の `MOTION_LABELS` に追記してください。

なお、ファイル名に制作ツール由来の接頭辞（ヒーローID、`16x32`、`animation`）が付いていても読み飛ばすので、`10001_16x32_animation_attack_down_right.gif` のような名前でもモーションと方向を判定できます。ただしリポジトリに入れるときは、上の規約どおりに揃えてください。

## ヒーローを追加する手順

1. `Image/HeroAnimations/16x32/<ヒーローID>/` を作り、`<モーション>_<方向>.gif` の名前でGIFを置く。
2. GIFからPNGスプライトシートを生成する。

```bash
pip install Pillow
python3 scripts/build_hero_animation_sheets.py

# 特定のヒーローだけ作り直したいとき
python3 scripts/build_hero_animation_sheets.py --hero 10001
```

3. マニフェストを再生成する。

```bash
node scripts/generate_hero_animation_manifest.js

# 書き出さずに、警告だけ先に確認したいとき
node scripts/generate_hero_animation_manifest.js --check
```

4. `metadata.json` の `warnings` が空になっていることを確認する。ファイル名から方向やモーションを判定できなかった画像、GIFとPNGのコマ数が食い違う画像は、ここに列挙されます。

## クレジット

このフォルダのデフォルメアニメーションは、**[Eris Esra's Character Templates Pack](https://erisesra.itch.io/character-templates-pack)**（作者: Eris Esra）のキャラクターテンプレートをもとに作成しています。素材を再配布・改変する際は、テンプレート側のライセンス条件も併せて確認してください。

ヒーローの意匠そのものの取り扱いは、リポジトリルートの `README.md` にある「画像利用ガイドライン要約」に従います。
