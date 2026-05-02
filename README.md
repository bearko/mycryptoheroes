# My Crypto Heroes asset database

My Crypto Heroes の公開図鑑などから、ヒーロー、エクステンション、エネミー、音声素材を整理したデータベースです。

## 収録データ

- `Data/Heroes/heroes.json`: 権利上利用できない対象を除外したヒーローマスタ 404 件のJSON。
- `Data/Heroes/heroes.csv`: 主要項目を表形式で確認するためのCSV。
- `Data/Heroes/metadata.json`: 取得元、件数、ウォレットログイン要否、画像取得時の補足。
- `Image/Heroes/*.png`: ヒーロー画像。ファイル名は `Image/Heroes/[ID].png` です。
- `Data/Extensions/extensions.json`: 権利上利用できない対象を除外したエクステンションマスタ 1797 件のJSON。
- `Data/Extensions/extensions.csv`: エクステンション主要項目のCSV。
- `Data/Extensions/metadata.json`: エクステンション取得元、件数、ウォレットログイン要否、画像取得結果。
- `Image/Extensions/*.png`: エクステンション画像。ファイル名は `Image/Extensions/[ID].png` です。
- `Data/Enemies/enemies.json`: 公式CSVをもとにした全エネミーマスタ 938 件のJSON。
- `Data/Enemies/enemies.csv`: エネミー主要項目のCSV。
- `Data/Enemies/enemy_skills.json`: 公式CSVをもとにしたエネミースキル 1912 件のJSON。
- `Data/Enemies/enemy_images.json`: エネミー画像とenemyTypeの紐づけ一覧。
- `Data/Enemies/metadata.json`: 公式CSV、画像紐づけ、欠損スキルIDなどの補足。
- `Image/Enemies/*.png`: 有効なエネミー画像 502 件。公式CSV参照画像と既存取得済み画像を保持しています。
- `Data/Backgrounds/backgrounds.json`: バトル背景などに使う背景画像 37 件の一覧。
- `Data/Backgrounds/metadata.json`: 背景画像の件数、重複グループ、利用許可に関する補足。
- `Image/Backgrounds/*.png`: 背景画像。ファイル名はアップロード時の名前を維持しています。
- `Data/Icons/icons.json`: 通貨、ポイント、ロゴなどのアイコン一覧。
- `Image/Icons/*`: GUM、Cp、CE、報酬、MCH/MCHC/MAIロゴ類の画像。
- `Data/BattleIcons/battle_icons.json`: パラメーター、バフ/デバフ、状態異常系アイコンの一覧。
- `Image/BattleIcons/*`: バトルUI用アイコン。
- `Data/Effects/battle_effect_sprites.json`: Action欄で使うバトルエフェクトスプライトの一覧。
- `Image/Effects/Battle/*.png`: バトルエフェクトの100pxグリッドPNGスプライト。
- `Data/Effects/cutins.json`: パッシブスキル発動、勝利/敗北表示のCSSとジングル一覧。
- `Style/Cutins/*.css`: カットイン演出を再現するCSS。
- `Data/Cryptids/cryptids.json`: ランドごとのクリプタイドアイコン一覧。
- `Image/Cryptids/*.png`: クリプタイドアイコン。ファイル名の連番を除いた名称がランド名です。
- `Data/SoundEffects/battle_sound_effects.json`: バトル中のサウンドエフェクト一覧。
- `Audio/BGM/*.mp3`: BGM素材。
- `Audio/SE/*.wav`: SE素材。
- `Audio/SE/Battle/*`: バトル演出用SE素材。MP3/OGGを収録しています。
- `Audio/SE/Jingles/*.mp3`: 勝利/敗北などの結果ジングル。

`heroes.json` には、ヒーロー名、ID、画像パス、Max Level Stats（HP/PHY/INT/AGI）、Passiveスキル名と内容、Attribute、Rarity、勢力、Enchantを収録しています。

`extensions.json` には、エクステンション名、ID、画像パス、シリーズ、Rarity、Legacy/Modern区分、Max Level Stats（HP/PHY/INT/AGI）、Active Skill名と内容、Aura情報を収録しています。

ヒーロー/エクステンションの一部コラボ・権利対象素材は、利用不可のためDBと画像フォルダから除外しています。除外したレコードは各 `metadata.json` の `restricted_removed_records` に記録しています。

`enemies.json` には、エネミー名、ID、画像パス、基礎パラメーター（HP/PHY/INT/AGI）、成長値、Active Skill、Passive Skillを収録しています。画像は `image` ファイル名で `Image/Enemies` と紐づけています。

## ゲーム開発での使い方

- JSON/CSVの `image_file_path` を参照すると、対応する画像ファイルを読み込めます。
- 通貨・ポイント・ロゴ類は `Data/Icons/icons.json` から用途説明と `image_file_path` を参照できます。
- パラメーター、バフ/デバフ、状態異常系アイコンは `Data/BattleIcons/battle_icons.json` から用途説明と `image_file_path` を参照できます。
- Action欄のバトルエフェクトは `Data/Effects/battle_effect_sprites.json` からCSSクラス、用途、`image_file_path` を参照できます。
- クリプタイドアイコンは `Data/Cryptids/cryptids.json` からランド名と `image_file_path` を参照できます。
- 背景画像はバトル背景などに利用できます。縦長画面ではそのまま表示し、横長画面では中央部分を拡大・クロップする形で利用してください。
- BGMは `Audio/BGM`、効果音は `Audio/SE` を参照してください。
- ドット絵素材を拡大表示する場合は、バイキュービック法ではなく、ニアレストネイバー法を強く推奨します。ブラウザでは `image-rendering: pixelated;` などを指定してください。
- 画像/音声の権利や利用可否は、必ず公式の最新ガイドラインを確認してください。

## 世界観・ゲーム設計の参考情報

- 元のMy Crypto Heroesは、歴史上の偉人であるヒーローに装備品であるエクステンションを装備し、3人パーティを作って3vs3のPvPやPvEバトルを楽しむゲームです。
- ヒーローのスキルは、その偉人の歴史上の逸話などをもとにしたものが多くあります。
- ゲーム内に固定シナリオは存在しないため、「ヒーローがエクステンションを装備して戦う」という基本を押さえると、My Crypto Heroesらしいゲーム体験を作りやすくなります。
- 元のゲームは戦略性・戦術性が非常に高く、ヒーローやエクステンションのスキルの組み合わせで、いかに相手に有利なパーティを組むかを問われるオートバトルストラテジーゲームです。

## クリプタイド補足

クリプタイドは、マイクリ内のゲーム内ギルド「ランド」の守護神的な存在です。`Image/Cryptids` のファイル名は `01_Ocean.png` のように連番とランド名で構成しており、連番を除いた `Ocean`、`Strawberry` などがそのままランド名です。

## バトルSE補足

- `1_single_damage`: 単体ダメージ。
- `2_area_damage`: 全体ダメージ。
- `3_heal_resurrection`: 回復/復活。
- `4_buff`: バフ。
- `5_debuff_status_effect`: デバフ/状態異常系。

## バトルエフェクト補足

Action欄のダメージ、回復、バフ/デバフ演出は `effect-1`〜`effect-12` のCSSスプライトです。各PNGは100pxグリッドのスプライトシートで、元のゲームでは `background-position` を100px単位で動かしてアニメーションさせています。

- `01_single_damage`: 単体ダメージ。
- `02_area_damage`: 全体ダメージ。
- `03_heal_resurrection`: 回復/復活。
- `04_buff`: バフ。
- `05_debuff_status_effect`: デバフ/状態異常系。
- `06_effect_06`〜`12_effect_12`: バトルCSS上で定義されている追加エフェクトスプライト。現行の公開スキルマスタでは主に `effectId` 1〜5 が使われています。

## カットイン・ジングル補足

パッシブスキル発動カットインと勝利/敗北表示は、単体画像ではなくCSS/DOM演出です。再利用しやすいよう、元の演出から抽出したCSSを `Style/Cutins` に格納しています。

- `Style/Cutins/passive_skill_cutin.css`: パッシブスキル発動時のカットイン。ヒーロー画像、スキル名、青/赤グラデーション、三角形パーツを組み合わせます。
- `Style/Cutins/battle_result_cutin.css`: 勝利/敗北表示のテキストカットイン。
- `Audio/SE/Jingles/win.mp3`: 勝利時ジングル。
- `Audio/SE/Jingles/lose.mp3`: 敗北時ジングル。
- `Audio/SE/Jingles/knight.mp3`: ランドバトル、アリーナ、コロシアム、ジムの結果演出ジングル。

## バトルUIアイコン補足

- `hp`: パラメーター「HP（体力）」のアイコン。
- `phy`: パラメーター「PHY（物理攻防力）」のアイコン。
- `int`: パラメーター「INT（魔法攻防力）」のアイコン。
- `buf_agi`: AGIパラメーターにバフがかかっている、またはバフ効果があることを示すアイコン。
- `dbf_agi`: AGIパラメーターにデバフがかかっている、またはデバフ効果があることを示すアイコン。
- `buf_phy` / `buf_int`: PHY/INTパラメーターのバフを示すアイコン。
- `dbf_phy` / `dbf_int`: PHY/INTパラメーターのデバフを示すアイコン。
- `poison`、`bleed`、`sleep`、`confused`、`fear`、`decoy`、`resurrection`: 状態異常・特殊状態系のアイコン。

## アイコン補足

- `gum`: GUM（Game Users Money）。ゲーム内通貨として利用されている通貨アイコン。
- `cp`: Cp / Cryptonium（クリプトニウム）。ゲーム内ポイント。
- `ce`: CE / Crypto Energy（クリプトエナジー）。経験値。
- `emblem`: エンブレム。ゲーム内報酬（ポイント）。
- `gold_dust`: ゴールドダスト。ゲーム内報酬（ポイント）。
- `mch_icon`: My Crypto Heroesの正方形アイコン。
- `mch_logo_horizontal`: My Crypto Heroesの横長ロゴ。
- `mchc_official`: MCHC。MCH Verseのトークン。
- `mchc_text_non_official`: MCHCのテキストロゴ素材。
- `mai_sd`: MAI。MCH Verseを擬人化したアイドルキャラクターのアイコン。
- `mch_company_logo`: My Crypto Heroesを運営する会社のロゴ。
- `mch_company_logo_negate`: My Crypto Heroesを運営する会社の反転ロゴ。

## 画像利用ガイドライン要約

公式ガイドライン: https://medium.com/mycryptoheroes/mch-design-guideline-ja-99ff0970ccdc

- 「マイクリ画像」は、運営側が提供するヒーロー、エクステンション、エネミー、MCHロゴマークを指します。
- 上記以外の画像は使用できません。
- 背景画像は上記ガイドラインの利用可能素材には明記されていませんが、本リポジトリではMCH Co.Ltd.から特別に許可をいただいて管理しています。
- 禁止事項に抵触しない範囲で、ゲーム内のアートエディット/アートギャラリー素材として利用できます。
- ゲーム外では、禁止事項に抵触しない非営利目的の二次創作素材として利用できます。
- 禁止事項には、ゲームイメージを損なう内容、公序良俗に反する内容、公式詐称、他者権利侵害の可能性がある内容が含まれます。
- 法人格のある企業・団体による二次創作、営利目的、またはガイドライン基準を超える利用は事前連絡が必要です。
- ガイドラインは変更される可能性があるため、利用前に公式記事を確認してください。

## ウォレットログイン要否の検証

`https://www.mycryptoheroes.net/ja/dictionary/heroes` と `https://www.mycryptoheroes.net/ja/dictionary/extensions` は、ウォレット未ログインの通常HTTP取得でも SSR HTML 内の `window.__NUXT__` に以下の公開マスタを埋め込んで返します。

- ヒーローマスタ
- エクステンションマスタ
- Passiveスキルマスタ
- Active Skillマスタ
- Auraマスタ
- Attributeマスタ
- 画像URL

そのため、このリポジトリの公開DB作成にはウォレットログインは不要でした。各 `metadata.json` の `login_required_for_public_master_data` も `false` として記録しています。

## 再取得方法

Node.js で以下を実行すると、JSON/CSV/画像を再生成します。

```bash
node scripts/fetch_heroes.js
node scripts/fetch_extensions.js
node scripts/fetch_enemy_images.js
python3 scripts/generate_enemy_database.py
node scripts/fetch_icons.js
node scripts/generate_background_manifest.js
node scripts/generate_battle_icon_manifest.js
node scripts/generate_cryptid_manifest.js
node scripts/fetch_battle_sound_effects.js
node scripts/fetch_battle_effect_sprites.js
node scripts/fetch_battle_cutin_assets.js
```

一部レプリカ画像URLはCDNで直接 503 になることがあります。該当ヒーローは同名の元ヒーロー画像URLへフォールバックして `Image/Heroes/[ID].png` として保存し、`metadata.json` の `image_download_fallbacks` に記録します。


# ルート README.md への追記用スニペット

このファイルは `git push` には含めません。
既存の `README.md` の末尾に、以下のセクションをコピペで追記してください。

挿入位置の推奨は「## 再取得方法」セクションの直後、または READMEの一番下です。

---

```markdown
## 金宝箱ドロップ演出（紙吹雪エフェクト + モーダル）

クエスト画面で金宝箱がドロップした時の演出を、フレームワーク非依存の素のHTML/CSS/JSで再現した実装を `Data/Effects/GoldChest/` に格納しています。

`Data/Effects/battle_effect_sprites.json`（Action欄スプライト）と `cutins.json`（パッシブ・勝敗カットイン）と並ぶ、ゲーム内エフェクト演出資産の一つです。

* `Data/Effects/GoldChest/README.md`: 概要と使い方。
* `Data/Effects/GoldChest/src/confetti.js`: 紙吹雪エフェクト本体（Canvas描画、外部依存なし）。
* `Data/Effects/GoldChest/src/gold-chest-modal.js`: 金宝箱モーダル本体。
* `Data/Effects/GoldChest/demo/index.html`: 動作確認用デモページ。`file://` で直接開けます。
* `Data/Effects/GoldChest/docs/`: API仕様、マイクリJSの解析メモ、Unity/Reactへの組み込み手順など。

紙吹雪のパラメータ（粒子数120、速度2、12色固定パレット）と金色グラデーション（`linear-gradient(to left top, #ffe766, #998100)`）はマイクリのクライアントサイドJSから抽出した値をそのまま使用しています。詳細な抽出プロセスは `Data/Effects/GoldChest/docs/analysis.md` を参照してください。
```

---

## なぜこの位置に入れるか

リポジトリ既存の `Data/Effects/` には以下が既に存在します：

- `Data/Effects/battle_effect_sprites.json` — Action欄スプライト一覧
- `Data/Effects/cutins.json` — カットインCSS/ジングル一覧

つまり「ゲーム内エフェクト演出を整理する場所」としてのフォルダが既に確立されているため、その下位に `GoldChest/` として並べるのが構造的に自然です。Style/Cutins と同じレベルに新規フォルダを作るより、Data/Effects 内に入れたほうが「演出系資産」という共通テーマが揃います。
