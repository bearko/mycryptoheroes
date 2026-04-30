# GitHubへのアップロード手順

## 配置の最終形

```
bearko/mycryptoheroes/   ← 既存リポジトリ
│
├── Audio/                          [既存] 触らない
├── Data/
│   ├── Heroes/                     [既存] 触らない
│   ├── Extensions/                 [既存] 触らない
│   ├── ...                         [既存] 触らない
│   └── Effects/
│       ├── battle_effect_sprites.json  [既存] 触らない
│       ├── cutins.json                 [既存] 触らない
│       │
│       └── GoldChest/                  [新規追加] ← ここ全部新規
│           ├── README.md
│           ├── src/
│           │   ├── confetti.js
│           │   └── gold-chest-modal.js
│           ├── demo/
│           │   └── index.html
│           ├── assets/
│           │   └── treasure-chest.svg
│           └── docs/
│               ├── confetti.md
│               ├── gold-chest-modal.md
│               ├── analysis.md
│               ├── customization.md
│               └── integration.md
│
├── Image/                          [既存] 触らない
├── Style/Cutins/                   [既存] 触らない
├── scripts/                        [既存] 触らない
├── LICENSE                         [既存] 触らない
└── README.md                       [既存に追記] 末尾にセクション追加
```

## 操作手順

### Step 1: ローカルにクローン

```bash
cd ~/your-workspace
git clone https://github.com/bearko/mycryptoheroes.git
cd mycryptoheroes
```

すでにクローン済みなら最新化：
```bash
cd mycryptoheroes
git pull origin main
```

### Step 2: GoldChest フォルダを配置

ダウンロードした出力物の `Data/Effects/GoldChest/` フォルダを、リポジトリの `Data/Effects/` 配下にそのままコピーします。

**macOS / Linux:**
```bash
# ダウンロードした GoldChest/ がカレントにある前提
cp -r /path/to/downloaded/Data/Effects/GoldChest ./Data/Effects/
```

**Windows (PowerShell):**
```powershell
Copy-Item -Recurse "C:\path\to\downloaded\Data\Effects\GoldChest" ".\Data\Effects\"
```

または、Finder/Explorer で `GoldChest` フォルダごと `Data/Effects/` の中にドラッグ＆ドロップでもOKです。

### Step 3: ルート README.md に追記

`README_APPEND_SNIPPET.md` の中身（コードブロック内のmarkdown）をコピーして、リポジトリルートの `README.md` の末尾に貼り付けます。

挿入位置の推奨は「## 再取得方法」セクションの直後、または末尾です。

### Step 4: 確認

```bash
git status
```

以下が表示されればOK：

```
modified:   README.md

Untracked files:
  Data/Effects/GoldChest/
```

中身も確認：
```bash
git diff README.md
ls Data/Effects/GoldChest/
```

### Step 5: コミット & プッシュ

```bash
git add Data/Effects/GoldChest/
git add README.md
git commit -m "Add gold chest drop effect (confetti + modal) under Data/Effects/GoldChest"
git push origin main
```

## 確認項目（プッシュ前）

- [ ] `Data/Effects/GoldChest/` 配下に9ファイル＋4フォルダが入っている
- [ ] ルートの `README.md` に金宝箱演出セクションが追記されている
- [ ] `git status` でこの2点以外の変更がない（既存ファイルが意図せず変わっていない）
- [ ] `demo/index.html` をブラウザで開いて動作確認した

## トラブルシューティング

### Q. push したらコンフリクトと言われた

リポジトリ側で別の変更が入っている可能性があります：

```bash
git pull --rebase origin main
git push origin main
```

### Q. 間違って LICENSE を上書きしてしまった

ダウンロードした出力物に `LICENSE` は含めていないので問題ないはずですが、もし上書きしてしまった場合：

```bash
git checkout origin/main -- LICENSE
```

### Q. demo/index.html を開いても動かない

`<script src="../src/confetti.js">` の相対パスが、`demo/index.html` から見た `src/` への相対パスとして正しい構造になっています。`Data/Effects/GoldChest/demo/index.html` をそのままブラウザで開けば、`Data/Effects/GoldChest/src/confetti.js` を読み込みます。

ブラウザの開発者ツールで「ファイルが見つかりません」エラーが出る場合は、配置場所を再確認してください。
