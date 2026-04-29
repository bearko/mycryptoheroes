# My Crypto Heroes asset database

My Crypto Heroes の公開図鑑などから、ヒーロー、エクステンション、エネミー、音声素材を整理したデータベースです。

## 収録データ

- `Data/Heroes/heroes.json`: 全ヒーローマスタ 414 件のJSON。
- `Data/Heroes/heroes.csv`: 主要項目を表形式で確認するためのCSV。
- `Data/Heroes/metadata.json`: 取得元、件数、ウォレットログイン要否、画像取得時の補足。
- `Image/Heroes/*.png`: ヒーロー画像。ファイル名は `Image/Heroes/[ID].png` です。
- `Data/Extensions/extensions.json`: 全エクステンションマスタ 1825 件のJSON。
- `Data/Extensions/extensions.csv`: エクステンション主要項目のCSV。
- `Data/Extensions/metadata.json`: エクステンション取得元、件数、ウォレットログイン要否、画像取得結果。
- `Image/Extensions/*.png`: エクステンション画像。ファイル名は `Image/Extensions/[ID].png` です。
- `Data/Enemies/enemy_images.json`: 000〜999を総当たりして取得できたエネミー画像の一覧。
- `Data/Enemies/metadata.json`: エネミー画像の取得元、総当たり範囲、取得件数。
- `Image/Enemies/*.png`: 有効なエネミー画像 488 件。ファイル名は取得元と同じ3桁PNGです。
- `Data/Icons/icons.json`: 通貨、ポイント、ロゴなどのアイコン一覧。
- `Image/Icons/*`: GUM、Cp、CE、報酬、MCH/MCHC/MAIロゴ類の画像。
- `Audio/BGM/*.mp3`: BGM素材。
- `Audio/SE/*.wav`: SE素材。

`heroes.json` には、ヒーロー名、ID、画像パス、Max Level Stats（HP/PHY/INT/AGI）、Passiveスキル名と内容、Attribute、Rarity、勢力、Enchantを収録しています。

`extensions.json` には、エクステンション名、ID、画像パス、シリーズ、Rarity、Legacy/Modern区分、Max Level Stats（HP/PHY/INT/AGI）、Active Skill名と内容、Aura情報を収録しています。

## ゲーム開発での使い方

- JSON/CSVの `image_file_path` を参照すると、対応する画像ファイルを読み込めます。
- 通貨・ポイント・ロゴ類は `Data/Icons/icons.json` から用途説明と `image_file_path` を参照できます。
- BGMは `Audio/BGM`、効果音は `Audio/SE` を参照してください。
- ドット絵素材を拡大表示する場合は、バイキュービック法ではなく、ニアレストネイバー法を強く推奨します。ブラウザでは `image-rendering: pixelated;` などを指定してください。
- 画像/音声の権利や利用可否は、必ず公式の最新ガイドラインを確認してください。

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
node scripts/fetch_icons.js
```

一部レプリカ画像URLはCDNで直接 503 になることがあります。該当ヒーローは同名の元ヒーロー画像URLへフォールバックして `Image/Heroes/[ID].png` として保存し、`metadata.json` の `image_download_fallbacks` に記録します。