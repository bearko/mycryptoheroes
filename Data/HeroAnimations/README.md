# Data/HeroAnimations

ヒーローごとのデフォルメ（SD）アニメーション素材を、ヒーローIDで紐づけて管理する場所です。既存のドット絵（`Image/Heroes/[ID].png`）とはフォルダを分けて、`Image/HeroAnimations/` 以下に置きます。

- `hero_animations.json`: 全ヒーロー分のアニメーションシート一覧（自動生成）。
- `metadata.json`: 件数、収録モーション、警告、クレジット（自動生成）。
- 画像本体: `Image/HeroAnimations/<コマサイズ>/<ヒーローID>/*.png`

## フォルダ構成

```
Image/HeroAnimations/
└── 16x32/                 1コマのサイズ。別サイズを追加する場合は 32x32/ のように並べる
    └── 10001/             ヒーローID。Data/Heroes/heroes.json の id と一致させる
        ├── idle_s.png
        ├── idle_se.png
        ├── ...
        ├── walk_s.png
        ├── ...
        ├── attack_s.png
        └── ...
```

ヒーローIDのフォルダ名は `Data/Heroes/heroes.json` の `id` と同じ値にしてください。生成スクリプトがマスタと突き合わせ、見つからないIDは警告として `metadata.json` に記録します。

> **注意**: 制作ツール側のフォルダ名（`prod_1001` のような連番）は、`heroes.json` のヒーローIDとは一致しないことがあります。たとえばMCHウォーリアーのIDは `10001` で、`1001` は別のヒーロー（コナン・ドイル）です。スクリプトは存在しないIDしか警告できないため、フォルダ名は必ず `heroes.json` の `id` を確認してから付けてください。

## ファイル名の規約

```
<モーション>_<方向>.png       例: idle_s.png / walk_ne.png / attack_e.png
<モーション>.png              全方向を「行」に並べた1枚のシートの場合
```

### 方向

`s`（下）を基準に時計回りで8方向です。

| キー | 向き | 別名として認識する表記 |
|------|------|------------------------|
| `s`  | 下（手前） | `south` `down` `front` `d` |
| `se` | 右下 | `southeast` `downright` `dr` |
| `e`  | 右 | `east` `right` `r` |
| `ne` | 右上 | `northeast` `upright` `ur` |
| `n`  | 上（奥） | `north` `up` `back` `u` |
| `nw` | 左上 | `northwest` `upleft` `ul` |
| `w`  | 左 | `west` `left` `l` |
| `sw` | 左下 | `southwest` `downleft` `dl` |

攻撃モーションのように5方向（`s` `se` `e` `ne` `n`）しか無い場合は、左向きの3方向を右向きの左右反転で表示してください。どの向きを反転で作るかは `hero_animations.json` の各モーションの `mirrored_directions` に入ります。

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

## シートの並び

各PNGは1コマ `frame_width x frame_height`（16x32）のグリッドで、**左から右へ**コマが並ぶスプライトシートです。

- `<モーション>_<方向>.png` は1行。`frame_count` = 横のコマ数。
- `<モーション>.png` は行が方向に対応します。上の行から `direction_order`（`s` → `se` → `e` → `ne` → `n` → `nw` → `w` → `sw`）の順です。実際の対応は各シートの `row_directions` に入ります。

n番目のコマの切り出し位置は次の通りです。

```js
const sx = (n % sheet.columns) * frame_width;
const sy = Math.floor(n / sheet.columns) * frame_height;
```

ドット絵なので、拡大表示するときはニアレストネイバー（CSSなら `image-rendering: pixelated;`）を使ってください。

## ヒーローを追加する手順

1. `Image/HeroAnimations/16x32/<ヒーローID>/` を作り、上の規約でPNGを置く。
2. マニフェストを再生成する。

```bash
node scripts/generate_hero_animation_manifest.js

# 書き出さずに、警告だけ先に確認したいとき
node scripts/generate_hero_animation_manifest.js --check
```

3. `metadata.json` の `warnings` が空になっていることを確認する。ファイル名から方向やモーションを判定できなかったPNGは、ここに列挙されます。

## クレジット

このフォルダのデフォルメアニメーションは、**[Eris Esra's Character Templates Pack](https://erisesra.itch.io/character-templates-pack)**（作者: Eris Esra）のキャラクターテンプレートをもとに作成しています。素材を再配布・改変する際は、テンプレート側のライセンス条件も併せて確認してください。

ヒーローの意匠そのものの取り扱いは、リポジトリルートの `README.md` にある「画像利用ガイドライン要約」に従います。
