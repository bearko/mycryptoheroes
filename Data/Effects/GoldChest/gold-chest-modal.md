# Gold Chest Modal API

金宝箱モーダルの完全なAPI仕様です。

## 基本的な使い方

```html
<script src="../src/confetti.js"></script>
<script src="../src/gold-chest-modal.js"></script>
<script>
    GoldChestModal.show();   // 紙吹雪付きで表示
</script>
```

confetti.js を先に読み込むと、モーダル表示と同時に紙吹雪も自動再生されます。

## メソッド

### `GoldChestModal.show(options?)`

モーダルを表示します。

| オプション | 型 | デフォルト | 説明 |
|------------|-----|-----------|------|
| `headerText` | string | `"CONGRATULATIONS"` | モーダル上部のテキスト |
| `bodyText` | string | `"You found a gold chest!"` | 宝箱アイコン下のメインテキスト |
| `buttonText` | string | `"Yay!"` | 閉じるボタンの文言 |
| `tweetUrl` | string \| null | `null` | Tweet ボタンのリンク先URL。null の場合 Tweet ボタン非表示 |
| `tweetText` | string | `"I just dropped a gold chest!"` | Tweet 文面 |
| `tweetHashtags` | string | `""` | Tweet ハッシュタグ（カンマ区切り） |
| `iconSvg` | string \| null | null | 宝箱アイコンの SVG コード文字列。省略時はデフォルトSVG使用 |
| `confetti` | boolean | true | 紙吹雪を一緒に出すか |
| `onClose` | function \| null | null | モーダルを閉じた時のコールバック |

### `GoldChestModal.hide()`

モーダルを閉じます。閉じる時は紙吹雪も自動的に停止します。

## 使用例

### シンプルに表示

```javascript
GoldChestModal.show();
```

### Tweet ボタン付き

```javascript
GoldChestModal.show({
    tweetUrl: 'https://yourgame.com',
    tweetText: 'レアアイテムをゲットした！',
    tweetHashtags: 'YourGame,RareDrop'
});
```

### 紙吹雪なし（モーダルのみ）

```javascript
GoldChestModal.show({ confetti: false });
```

### 閉じた時の処理

```javascript
GoldChestModal.show({
    onClose: function () {
        console.log('モーダルが閉じられた');
        showNextScreen();  // 次画面へ遷移
    }
});
```

### Font Awesome Pro の treasure-chest を使う

Font Awesome Pro のライセンスを保有している場合、`treasure-chest` アイコンのSVGを直接渡すことで、マイクリと完全に同じ見た目になります。

```javascript
const treasureChestSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="48" height="48">
  <!-- Font Awesome Pro の treasure-chest の path をここに -->
</svg>`;

GoldChestModal.show({
    iconSvg: treasureChestSvg
});
```

Font Awesome Pro のSVGは `node_modules/@fortawesome/fontawesome-pro/svgs/solid/treasure-chest.svg` に含まれています。SVGをファイルから読み込む場合は以下のようにします。

```javascript
fetch('path/to/treasure-chest.svg')
    .then(r => r.text())
    .then(svg => GoldChestModal.show({ iconSvg: svg }));
```

### 多言語対応

```javascript
const i18n = {
    ja: { header: 'おめでとう！', body: '金の宝箱を見つけた！', button: 'やった！' },
    en: { header: 'CONGRATULATIONS', body: 'You found a gold chest!', button: 'Yay!' }
};
const lang = navigator.language.startsWith('ja') ? 'ja' : 'en';

GoldChestModal.show({
    headerText: i18n[lang].header,
    bodyText: i18n[lang].body,
    buttonText: i18n[lang].button
});
```

## スタイリング

モーダルのスタイルは `<style id="gold-chest-modal-styles">` として `<head>` に動的注入されます。上書きしたい場合は、後から同IDのstyleタグを定義するか、`!important` で上書きしてください。

主要なクラス名は以下です。

| クラス名 | 役割 |
|---------|------|
| `.goldChestModal__overlay` | 背景の暗転オーバーレイ |
| `.goldChestModal__dialog` | モーダル本体（ダークグレー背景） |
| `.goldChestModal__header` | "CONGRATULATIONS" 部分 |
| `.goldChestModal__icon` | 金色グラデの宝箱アイコン部分 |
| `.goldChestModal__text` | "You found a gold chest!" 部分 |
| `.goldChestModal__button--primary` | Yay! ボタン |
| `.goldChestModal__button--twitter` | Tweet ボタン |

## 金色グラデーションについて

宝箱アイコンの背景は以下のCSSで定義されています。マイクリの実装と完全に同じ値です。

```css
.goldChestModal__icon {
    background: gold;
    background: linear-gradient(to left top, #ffe766, #998100);
    border-radius: 0.5rem;
    padding: 0.7rem;
    font-size: 2rem;
}
```

ゴールド以外（例: シルバー、ブロンズ）に変えたい場合は [customization.md](customization.md) を参照してください。

## アクセシビリティ

- ESC キーで閉じる
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 設定済み
- ボタンは `<button type="button">` を使用しキーボード操作可能
- Tweet リンクは `rel="noopener noreferrer"` で安全な外部遷移

## 既知の制約

- 同時に複数のモーダルは表示できません（`show()` を連続して呼ぶと最後のものに置き換わります）
- アニメーション（fadeIn / bounceIn）は `<style>` タグで定義されているため、CSP の `style-src 'self'` 環境では動作しない場合があります
