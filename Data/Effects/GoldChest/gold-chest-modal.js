/**
 * gold-chest-modal.js
 * --------------------------------------------------------------
 * My Crypto Heroes の "You found a gold chest!" モーダルを再現。
 * Confetti.js と組み合わせて使用する想定。
 *
 * Public API:
 *   GoldChestModal.show(options?)
 *     options.onClose       : function   モーダルを閉じた時のコールバック
 *     options.tweetUrl      : string     Tweetボタンの遷移先 (省略時は無効化)
 *     options.tweetText     : string     Tweet文面
 *     options.confetti      : boolean    紙吹雪を一緒に出すか (default: true)
 *     options.headerText    : string     "CONGRATULATIONS"
 *     options.bodyText      : string     "You found a gold chest!"
 *     options.buttonText    : string     "Yay!"
 *
 *   GoldChestModal.hide()
 *
 * 必要な要素:
 *   - Font Awesome の treasure-chest アイコン (Pro ライセンス必須)
 *     代替: SVG アイコンを assets/treasure-chest.svg として同梱
 *   - confetti.js (option.confetti = true の場合)
 * --------------------------------------------------------------
 */
(function (global) {
    'use strict';

    var GoldChestModal = {};

    var modalElement = null;
    var currentOptions = null;

    // SVG アイコン (Font Awesome treasure-chest を使えない環境向けフォールバック)
    var DEFAULT_CHEST_SVG =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" width="48" height="48" fill="currentColor">' +
        '<path d="M64 224v240c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V224H336v32c0 8.84-7.16 16-16 16h-64c-8.84 0-16-7.16-16-16v-32H64zm480-96v32H32v-32C32 92.65 60.65 64 96 64h384c35.35 0 64 28.65 64 64zM304 224h-32v32h32v-32z"/>' +
        '</svg>';

    function injectStyles() {
        if (document.getElementById('gold-chest-modal-styles')) return;
        var style = document.createElement('style');
        style.id = 'gold-chest-modal-styles';
        style.textContent =
            '.goldChestModal__overlay {' +
            '  position: fixed; inset: 0;' +
            '  background: rgba(0, 0, 0, 0.75);' +
            '  z-index: 1000000;' +
            '  display: flex; align-items: center; justify-content: center;' +
            '  animation: goldChestFadeIn 0.3s ease-out;' +
            '}' +
            '.goldChestModal__dialog {' +
            '  background: #2a2d34;' +
            '  border-radius: 8px;' +
            '  min-width: 300px; max-width: 90vw;' +
            '  padding: 1.5rem;' +
            '  text-align: center;' +
            '  color: #fff;' +
            '  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);' +
            '  animation: goldChestBounceIn 0.5s ease-out;' +
            '}' +
            '.goldChestModal__header {' +
            '  font-size: 1.1rem;' +
            '  font-weight: 700;' +
            '  letter-spacing: 1px;' +
            '  margin-bottom: 1.25rem;' +
            '  color: #fff;' +
            '}' +
            '.goldChestModal__icon {' +
            '  display: inline-block;' +
            '  background: gold;' +
            '  background: linear-gradient(to left top, #ffe766, #998100);' +
            '  border-radius: 0.5rem;' +
            '  padding: 0.7rem;' +
            '  font-size: 2rem;' +
            '  line-height: 1;' +
            '  color: #fff;' +
            '  margin-bottom: 1rem;' +
            '}' +
            '.goldChestModal__icon svg {' +
            '  display: block;' +
            '  width: 48px; height: 48px;' +
            '}' +
            '.goldChestModal__text {' +
            '  font-size: 1.2rem;' +
            '  font-weight: 700;' +
            '  color: gold;' +
            '  margin-bottom: 1.5rem;' +
            '}' +
            '.goldChestModal__footer {' +
            '  display: flex;' +
            '  gap: 0.75rem;' +
            '  justify-content: center;' +
            '  flex-wrap: wrap;' +
            '}' +
            '.goldChestModal__button {' +
            '  padding: 0.6rem 1.5rem;' +
            '  border: none;' +
            '  border-radius: 4px;' +
            '  font-size: 0.95rem;' +
            '  font-weight: 700;' +
            '  cursor: pointer;' +
            '  transition: opacity 0.2s;' +
            '}' +
            '.goldChestModal__button:hover { opacity: 0.85; }' +
            '.goldChestModal__button--primary {' +
            '  background: #fdfdfd;' +
            '  color: #303030;' +
            '}' +
            '.goldChestModal__button--twitter {' +
            '  background: #1da1f2;' +
            '  color: #fff;' +
            '  text-decoration: none;' +
            '  display: inline-flex;' +
            '  align-items: center;' +
            '  gap: 0.4rem;' +
            '}' +
            '@keyframes goldChestFadeIn {' +
            '  from { opacity: 0; }' +
            '  to { opacity: 1; }' +
            '}' +
            '@keyframes goldChestBounceIn {' +
            '  0% { transform: scale(0.3); opacity: 0; }' +
            '  50% { transform: scale(1.05); }' +
            '  70% { transform: scale(0.9); }' +
            '  100% { transform: scale(1); opacity: 1; }' +
            '}';
        document.head.appendChild(style);
    }

    function buildModal(opts) {
        var overlay = document.createElement('div');
        overlay.className = 'goldChestModal__overlay';

        var dialog = document.createElement('div');
        dialog.className = 'goldChestModal__dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'goldChestModalHeader');

        var header = document.createElement('div');
        header.className = 'goldChestModal__header';
        header.id = 'goldChestModalHeader';
        header.textContent = opts.headerText;

        var iconWrap = document.createElement('div');
        iconWrap.className = 'goldChestModal__icon';
        iconWrap.innerHTML = opts.iconSvg || DEFAULT_CHEST_SVG;

        var text = document.createElement('div');
        text.className = 'goldChestModal__text';
        text.textContent = opts.bodyText;

        var footer = document.createElement('div');
        footer.className = 'goldChestModal__footer';

        if (opts.tweetUrl) {
            var tweetLink = document.createElement('a');
            tweetLink.className = 'goldChestModal__button goldChestModal__button--twitter';
            var params = [
                'text=' + encodeURIComponent(opts.tweetText),
                'url=' + encodeURIComponent(opts.tweetUrl),
                'hashtags=' + encodeURIComponent(opts.tweetHashtags || '')
            ].join('&');
            tweetLink.href = 'https://twitter.com/share?' + params;
            tweetLink.target = '_blank';
            tweetLink.rel = 'noopener noreferrer';
            tweetLink.textContent = 'Tweet';
            footer.appendChild(tweetLink);
        }

        var btn = document.createElement('button');
        btn.className = 'goldChestModal__button goldChestModal__button--primary';
        btn.type = 'button';
        btn.textContent = opts.buttonText;
        btn.addEventListener('click', hide);
        footer.appendChild(btn);

        dialog.appendChild(header);
        dialog.appendChild(iconWrap);
        dialog.appendChild(text);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);

        // ESCで閉じる
        document.addEventListener('keydown', onKeydown);

        return overlay;
    }

    function onKeydown(e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            hide();
        }
    }

    function show(options) {
        var defaults = {
            headerText: 'CONGRATULATIONS',
            bodyText: 'You found a gold chest!',
            buttonText: 'Yay!',
            tweetUrl: null,
            tweetText: 'I just dropped a gold chest!',
            tweetHashtags: '',
            iconSvg: null,
            confetti: true,
            onClose: null
        };

        var opts = {};
        for (var key in defaults) {
            opts[key] = (options && options[key] != null) ? options[key] : defaults[key];
        }
        currentOptions = opts;

        injectStyles();

        if (modalElement) {
            modalElement.parentNode && modalElement.parentNode.removeChild(modalElement);
        }

        modalElement = buildModal(opts);
        document.body.appendChild(modalElement);

        if (opts.confetti && global.Confetti) {
            global.Confetti.start();
        }
    }

    function hide() {
        if (modalElement && modalElement.parentNode) {
            modalElement.parentNode.removeChild(modalElement);
        }
        modalElement = null;
        document.removeEventListener('keydown', onKeydown);

        if (global.Confetti && global.Confetti.isRunning && global.Confetti.isRunning()) {
            global.Confetti.stop();
        }

        if (currentOptions && typeof currentOptions.onClose === 'function') {
            currentOptions.onClose();
        }
        currentOptions = null;
    }

    GoldChestModal.show = show;
    GoldChestModal.hide = hide;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GoldChestModal;
    } else {
        global.GoldChestModal = GoldChestModal;
    }
})(typeof window !== 'undefined' ? window : this);
