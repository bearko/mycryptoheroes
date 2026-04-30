# 自ゲームへの組み込み手順

このドキュメントでは、本リポジトリの実装を Unity / React / Vue / Web ゲームエンジンに組み込む方法を解説します。

bearko さんのターン制タクティクスゲームは Unity 主体なので、Unity セクションを最初に詳しく扱います。

## Unity への移植

Unity ではブラウザ Canvas が使えないため、`confetti.js` のロジックを直接持ち込むことはできません。代わりに Unity の **Particle System** で同等の演出を作り、宝箱モーダルは UGUI で再現します。

### Particle System で紙吹雪

新しい GameObject に `ParticleSystem` をアタッチし、以下のように設定します。

| モジュール | 設定 |
|-----------|------|
| Main / Duration | 2.0 |
| Main / Start Lifetime | 4〜6 (Random Between Two Constants) |
| Main / Start Speed | 2〜4 |
| Main / Start Size | 0.1〜0.3 |
| Main / Start Rotation | 0〜360 |
| Main / Start Color | Random Between Two Colors（後述） |
| Emission / Rate over Time | 60 |
| Shape / Shape | Box（画面上端に配置） |
| Renderer / Material | 紙吹雪用の細長いPlane（線分の代替） |

**Start Color の Random Color List** に、マイクリの12色を Random Between Colors で設定すると元の雰囲気を再現できます。

```
DodgerBlue  (30, 144, 255)
OliveDrab   (107, 142, 35)
Gold        (255, 215, 0)
Pink        (255, 192, 203)
SlateBlue   (106, 90, 205)
LightBlue   (173, 216, 230)
Violet      (238, 130, 238)
PaleGreen   (152, 251, 152)
SteelBlue   (70, 130, 180)
SandyBrown  (244, 164, 96)
Chocolate   (210, 105, 30)
Crimson     (220, 20, 60)
```

### Confetti コントローラの C# スクリプト例

```csharp
using UnityEngine;

public class ConfettiController : MonoBehaviour
{
    [SerializeField] private ParticleSystem confettiSystem;

    private static ConfettiController _instance;
    public static ConfettiController Instance => _instance;

    private void Awake() => _instance = this;

    public void Start()    => confettiSystem.Play();
    public void Stop()     => confettiSystem.Stop();
    public void Remove()   => confettiSystem.Clear();

    public void StartFor(float seconds)
    {
        confettiSystem.Play();
        Invoke(nameof(Stop), seconds);
    }
}
```

使い方:
```csharp
ConfettiController.Instance.StartFor(2.5f);
```

### 金宝箱モーダル（UGUI）

1. Canvas を作成（Render Mode: Screen Space - Overlay）
2. 子 Image として暗転背景（Color: 黒、Alpha: 0.75）
3. その下にダイアログ Image（Color: `#2a2d34`、サイズ: 360x320）
4. ダイアログ内に以下を配置:
   - Text: "CONGRATULATIONS"
   - Image: 宝箱アイコン（金グラデのSprite背景 + treasure-chest SVG をPNG化したアイコン）
   - Text: "You found a gold chest!" (Color: `#FFD700`, Bold)
   - Button: "Yay!" (Color: `#FDFDFD`)

宝箱の金グラデは以下の方法で再現できます。

- **シェーダー方式**: Unity の Image に Linear Gradient シェーダーを適用（Asset Store の `UI Gradient` などが使える）
- **テクスチャ方式**: Photoshop で `#ffe766` → `#998100` のグラデ画像を作って Sprite として読み込む

### 演出の連動例

```csharp
public class QuestResultPresenter : MonoBehaviour
{
    [SerializeField] private GameObject goldChestModal;

    public void ShowGoldChestReward()
    {
        ConfettiController.Instance.StartFor(3f);
        goldChestModal.SetActive(true);
    }

    public void OnYayButtonClicked()
    {
        goldChestModal.SetActive(false);
        ConfettiController.Instance.Stop();
    }
}
```

### Unity 用ファイル構成の提案

```
Assets/
├── Scripts/
│   ├── ConfettiController.cs
│   └── QuestResultPresenter.cs
├── Prefabs/
│   ├── ConfettiSystem.prefab
│   └── GoldChestModal.prefab
├── Sprites/
│   ├── GoldGradient.png
│   └── TreasureChest.png
└── Materials/
    └── ConfettiParticle.mat
```

## React への組み込み

```jsx
import { useEffect, useRef } from 'react';

// confetti.js を import できるように export を確認
// (本リポジトリの src/confetti.js は CommonJS / ブラウザ両対応)
import Confetti from './lib/confetti';
import GoldChestModal from './lib/gold-chest-modal';

export function GoldChestRewardScene({ visible, onClose }) {
    useEffect(() => {
        if (visible) {
            GoldChestModal.show({
                tweetUrl: 'https://yourgame.com',
                tweetText: 'レアな金宝箱をゲット！',
                onClose
            });
        } else {
            GoldChestModal.hide();
        }
    }, [visible, onClose]);

    return null; // モーダルはbodyに直接inject される
}
```

React の状態管理に組み込む場合は、`useEffect` の cleanup で `GoldChestModal.hide()` を呼ぶことを忘れずに。

## Vue 3 への組み込み

```vue
<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue';
import Confetti from './lib/confetti';
import GoldChestModal from './lib/gold-chest-modal';

const props = defineProps(['visible']);
const emit = defineEmits(['close']);

watch(() => props.visible, (val) => {
    if (val) {
        GoldChestModal.show({
            onClose: () => emit('close')
        });
    } else {
        GoldChestModal.hide();
    }
});

onBeforeUnmount(() => {
    GoldChestModal.hide();
});
</script>

<template>
    <!-- このコンポーネント自体は何もレンダリングしない -->
</template>
```

## Cocos Creator / Phaser

これらのHTML5ゲームエンジンは canvas を独占的に使うため、本実装の Canvas（z-index: 999999 でオーバーレイ）はゲームキャンバスの上に重なる形で動作します。

そのまま `<script>` タグで読み込めば、ゲームの世界とは別レイヤーで紙吹雪が降ります。モーダルも DOM ベースなのでゲームキャンバスを邪魔しません。

```html
<!-- index.html -->
<script src="confetti.js"></script>
<script src="gold-chest-modal.js"></script>
<script>
    // Phaser scene の中から
    this.events.on('rare_drop', () => {
        GoldChestModal.show();
    });
</script>
```

## Electron デスクトップアプリ

Electron は内部が Chromium なので、ブラウザ版とまったく同じく動きます。
レンダラープロセスの HTML に `<script>` で読み込むだけで OK。

メインプロセスから演出を起動したい場合は IPC 経由で。

```javascript
// renderer
ipcRenderer.on('show-gold-chest', () => {
    GoldChestModal.show();
});

// main
mainWindow.webContents.send('show-gold-chest');
```

## モバイル WebView (Cordova / Capacitor)

iOS の WKWebView も Android の WebView も Canvas が動くため、追加設定なしで動作します。低スペック端末向けに `Confetti.maxCount` を下げる調整だけ推奨。

## まとめ — タクティクスゲームでの推奨組み込み

bearko さんのターン制タクティクスゲーム（Unity 主体）の場合、以下の流れが現実的です。

1. **プロトタイプ段階（React）**: 本リポジトリの JS をそのまま `import` してドロップ演出のタイミング検証
2. **Unity 移植段階**: Particle System + UGUI で再実装。色値・グラデ値・タイミングは本リポジトリの値を流用
3. **演出の閾値設定**: クエスト結果画面で `Random.value < 0.05` のような確率判定 → 該当時に金宝箱演出

この実装は「マイクリのレファレンス値を保存しておくスニペット集」として位置付けると、移植先言語が変わっても基準値として使い続けられます。
