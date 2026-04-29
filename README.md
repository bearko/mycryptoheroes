# My Crypto Heroes hero database

My Crypto Heroes の公開ヒーロー図鑑から、ヒーローマスタ情報と画像を抽出したデータベースです。

## 収録データ

- `Data/Heroes/heroes.json`: 全ヒーローマスタ 414 件のJSON。
- `Data/Heroes/heroes.csv`: 主要項目を表形式で確認するためのCSV。
- `Data/Heroes/metadata.json`: 取得元、件数、ウォレットログイン要否、画像取得時の補足。
- `Image/Heroes/*.png`: ヒーロー画像。ファイル名は `Image/Heroes/[ID].png` です。

`heroes.json` には、ヒーロー名、ID、画像パス、Max Level Stats（HP/PHY/INT/AGI）、Passiveスキル名と内容、Attribute、Rarity、勢力、Enchantを収録しています。

## ウォレットログイン要否の検証

`https://www.mycryptoheroes.net/ja/dictionary/heroes` は、ウォレット未ログインの通常HTTP取得でも SSR HTML 内の `window.__NUXT__` に以下の公開マスタを埋め込んで返します。

- ヒーローマスタ
- Passiveスキルマスタ
- Attributeマスタ
- 画像URL

そのため、このリポジトリの公開ヒーローDB作成にはウォレットログインは不要でした。`Data/Heroes/metadata.json` の `login_required_for_public_master_data` も `false` として記録しています。

## 再取得方法

Node.js で以下を実行すると、JSON/CSV/画像を再生成します。

```bash
node scripts/fetch_heroes.js
```

一部レプリカ画像URLはCDNで直接 503 になることがあります。該当ヒーローは同名の元ヒーロー画像URLへフォールバックして `Image/Heroes/[ID].png` として保存し、`metadata.json` の `image_download_fallbacks` に記録します。