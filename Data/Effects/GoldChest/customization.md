# カスタマイズ例集

このドキュメントでは、実装をベースに様々なカスタマイズを行う方法を紹介します。

## 1. レアリティ別の宝箱バリエーション

ゴールドだけでなく、シルバー・ブロンズなど複数のレアリティを表現したいケースは多いはずです。グラデーションの色を変えるだけで簡単に対応できます。

```javascript
const RARITY_GRADIENTS = {
    bronze: 'linear-gradient(to left top, #ffb878, #8b4513)',
    silver: 'linear-gradient(to left top, #f0f0f0, #707070)',
    gold:   'linear-gradient(to left top, #ffe766, #998100)',
    rainbow: 'linear-gradient(to left top, #ff6b6b, #4ecdc4, #ffe66d)'
};

function showChest(rarity) {
    GoldChestModal.show({
        bodyText: `You found a ${rarity} chest!`,
        onClose: () => {}
    });
    // モーダル表示後にアイコンの背景を上書き
    setTimeout(() => {
        const icon = document.querySelector('.goldChestModal__icon');
        if (icon) icon.style.background = RARITY_GRADIENTS[rarity];
    }, 0);
}

showChest('silver');
```

レアリティに応じて紙吹雪の派手さも変えると効果的です。

```javascript
function showChestWithEffect(rarity) {
    const config = {
        bronze: { maxCount: 50,  speed: 2 },
        silver: { maxCount: 100, speed: 2 },
        gold:   { maxCount: 150, speed: 3 },
        rainbow:{ maxCount: 250, speed: 4, gradient: true }
    };
    Object.assign(Confetti, config[rarity]);
    showChest(rarity);
}
```

## 2. 紙吹雪のカラーパレット変更

`src/confetti.js` 上部の `colors` 配列を編集します。

### 例: チームカラー2色だけにする

```javascript
var colors = [
    'rgba(220,20,60,',   // Red
    'rgba(30,144,255,'   // Blue
];
```

### 例: パステル系で統一

```javascript
var colors = [
    'rgba(255,182,193,', // LightPink
    'rgba(176,224,230,', // PowderBlue
    'rgba(255,255,224,', // LightYellow
    'rgba(221,160,221,', // Plum
    'rgba(152,251,152,'  // PaleGreen
];
```

### 例: 単色（ゴールドのみ）

```javascript
var colors = ['rgba(255,215,0,'];
```

## 3. 紙吹雪の形を変える

デフォルトでは「線分」として描画されますが、`drawParticles` 関数を書き換えれば形を変えられます。

### 円形にする

`src/confetti.js` の `drawParticles` を以下に置き換え。

```javascript
function drawParticles(ctx) {
    var particle, x, y;
    for (var i = 0; i < particles.length; i++) {
        particle = particles[i];
        x = particle.x + particle.tilt;
        y = particle.y + particle.diameter / 2;
        ctx.beginPath();
        ctx.fillStyle = particle.color;
        ctx.arc(x, y, particle.diameter / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}
```

### 星形・ハート形（スプライト紙吹雪）

画像を使う場合は、画像をプリロードして `drawImage` で描画します。

```javascript
var sprite = new Image();
sprite.src = 'assets/star.png';

function drawParticles(ctx) {
    if (!sprite.complete) return;
    for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.save();
        ctx.translate(p.x + p.tilt, p.y);
        ctx.rotate(p.tiltAngle);
        ctx.drawImage(sprite, -p.diameter / 2, -p.diameter / 2, p.diameter, p.diameter);
        ctx.restore();
    }
}
```

## 4. モバイル最適化

iPhone のSafariなど低スペック端末では粒子数を減らしたほうが快適です。

```javascript
const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

Confetti.maxCount = isMobile ? 60 : 120;
Confetti.frameInterval = isMobile ? 25 : 15;
Confetti.start();
```

## 5. モーダルなしで紙吹雪だけ使う

レベルアップ・実績解除など、宝箱以外の場面で紙吹雪を流したい場合。

```javascript
function celebrateLevelUp() {
    Confetti.start();
    setTimeout(() => {
        Confetti.stop();
        // 既存粒子が落ちきるまで待つ
        setTimeout(() => Confetti.remove(), 3000);
    }, 1500);
}
```

## 6. ボタンテキストとTweet文を多言語化

```javascript
const lang = (navigator.language || 'en').slice(0, 2);

const i18n = {
    ja: {
        header: 'おめでとう！',
        body: '金の宝箱を見つけた！',
        button: 'やった！',
        tweetText: '金の宝箱をゲットした！'
    },
    en: {
        header: 'CONGRATULATIONS',
        body: 'You found a gold chest!',
        button: 'Yay!',
        tweetText: 'I just dropped a gold chest!'
    },
    ko: {
        header: '축하합니다!',
        body: '황금 보물상자를 발견했습니다!',
        button: '좋아요!',
        tweetText: '황금 보물상자를 얻었어요!'
    }
};

const t = i18n[lang] || i18n.en;

GoldChestModal.show({
    headerText: t.header,
    bodyText: t.body,
    buttonText: t.button,
    tweetText: t.tweetText,
    tweetUrl: 'https://yourgame.com',
    tweetHashtags: 'YourGame'
});
```

## 7. 効果音と組み合わせる

ライセンスフリーの効果音（`treasure_open.mp3` など）を別途用意し、モーダル表示時に再生。

```javascript
function showGoldChestWithSound() {
    const audio = new Audio('assets/treasure_open.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {
        // ユーザー操作なしの自動再生がブロックされた場合
    });
    GoldChestModal.show();
}
```

ブラウザの自動再生ポリシー上、ユーザー操作起因（クリックなど）でないと音が出ません。

## 8. 段階的演出（紙吹雪 → モーダル）

紙吹雪を先に流して期待感を高めてからモーダルを出す演出。

```javascript
function dramaticGoldChest() {
    Confetti.start();
    setTimeout(() => {
        GoldChestModal.show({ confetti: false }); // 既に流れているので二重起動防止
    }, 800);
}
```

## 9. テスト用に確率モードを作る

開発中は「100回叩いて何回出るか」を確認したいことがあります。

```javascript
function rollChest(probability) {
    if (Math.random() < probability) {
        GoldChestModal.show();
        return true;
    }
    return false;
}

// 確率10%の宝箱
document.getElementById('quest-button').addEventListener('click', () => {
    if (!rollChest(0.1)) {
        console.log('No chest this time');
    }
});
```

## 10. アクセシビリティ強化（reduced-motion 対応）

ユーザーが「動きを減らす」設定にしている場合、紙吹雪を出さない配慮。

```javascript
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

GoldChestModal.show({
    confetti: !reducedMotion
});
```
