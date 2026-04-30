/**
 * confetti.js
 * --------------------------------------------------------------
 * My Crypto Heroes (mycryptoheroes.net) のクエスト画面で使用されている
 * 紙吹雪エフェクトを忠実に再現した実装。
 *
 * 元実装の特徴:
 *   - canvas-confetti などの外部ライブラリを使わず Canvas に直接描画
 *   - 粒子は「四角」ではなく「線分 (lineTo)」として描かれる
 *   - Math.sin / Math.cos で揺らぎを表現
 *   - 12色の固定パレット
 *
 * Public API:
 *   Confetti.start(durationMs?, minCount?, maxCount?)
 *   Confetti.stop()
 *   Confetti.toggle()
 *   Confetti.pause()
 *   Confetti.resume()
 *   Confetti.togglePause()
 *   Confetti.remove()
 *   Confetti.isRunning()
 *   Confetti.isPaused()
 *
 * 設定可能プロパティ:
 *   Confetti.maxCount       (default: 120)
 *   Confetti.speed          (default: 2)
 *   Confetti.frameInterval  (default: 15)
 *   Confetti.alpha          (default: 1.0)
 *   Confetti.gradient       (default: false)
 * --------------------------------------------------------------
 */
(function (global) {
    'use strict';

    var Confetti = {
        maxCount: 120,
        speed: 2,
        frameInterval: 15,
        alpha: 1,
        gradient: false,
        start: null,
        stop: null,
        toggle: null,
        pause: null,
        resume: null,
        togglePause: null,
        remove: null,
        isPaused: null,
        isRunning: null
    };

    // requestAnimationFrame の polyfill
    var supportsAnimationFrame =
        window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame;

    // マイクリと同じ12色パレット
    var colors = [
        'rgba(30,144,255,',   // DodgerBlue
        'rgba(107,142,35,',   // OliveDrab
        'rgba(255,215,0,',    // Gold
        'rgba(255,192,203,',  // Pink
        'rgba(106,90,205,',   // SlateBlue
        'rgba(173,216,230,',  // LightBlue
        'rgba(238,130,238,',  // Violet
        'rgba(152,251,152,',  // PaleGreen
        'rgba(70,130,180,',   // SteelBlue
        'rgba(244,164,96,',   // SandyBrown
        'rgba(210,105,30,',   // Chocolate
        'rgba(220,20,60,'     // Crimson
    ];

    var streamingConfetti = false;
    var pause = false;
    var lastFrameTime = Date.now();
    var particles = [];
    var waveAngle = 0;
    var context = null;

    function resetParticle(particle, width, height) {
        particle.color = colors[(Math.random() * colors.length) | 0] + (Confetti.alpha + ')');
        particle.color2 = colors[(Math.random() * colors.length) | 0] + (Confetti.alpha + ')');
        particle.x = Math.random() * width;
        particle.y = Math.random() * height - height;
        particle.diameter = Math.random() * 10 + 5;
        particle.tilt = Math.random() * 10 - 10;
        particle.tiltAngleIncrement = Math.random() * 0.07 + 0.05;
        particle.tiltAngle = 0;
        return particle;
    }

    function pauseConfetti() {
        pause = true;
    }

    function resumeConfetti() {
        pause = false;
        runAnimation();
    }

    function runAnimation() {
        if (pause) return;

        if (particles.length === 0) {
            context.clearRect(0, 0, window.innerWidth, window.innerHeight);
            return;
        }

        var now = Date.now();
        var delta = now - lastFrameTime;

        if (!supportsAnimationFrame || delta > Confetti.frameInterval) {
            context.clearRect(0, 0, window.innerWidth, window.innerHeight);
            updateParticles();
            drawParticles(context);
            lastFrameTime = now - (delta % Confetti.frameInterval);
        }

        requestAnimationFrame(runAnimation);
    }

    function updateParticles() {
        var width = window.innerWidth;
        var height = window.innerHeight;
        var particle;

        waveAngle += 0.01;

        for (var i = 0; i < particles.length; i++) {
            particle = particles[i];

            if (!streamingConfetti && particle.y < -15) {
                particle.y = height + 100;
            } else {
                particle.tiltAngle += particle.tiltAngleIncrement;
                particle.x += Math.sin(waveAngle);
                particle.y += (Math.cos(waveAngle) + particle.diameter + Confetti.speed) * 0.5;
                particle.tilt = Math.sin(particle.tiltAngle) * 15;
            }

            if (particle.x > width + 20 || particle.x < -20 || particle.y > height) {
                if (streamingConfetti && particles.length <= Confetti.maxCount) {
                    resetParticle(particle, width, height);
                } else {
                    particles.splice(i, 1);
                    i--;
                }
            }
        }
    }

    function drawParticles(ctx) {
        var particle, x, x2, y2;
        for (var i = 0; i < particles.length; i++) {
            particle = particles[i];
            ctx.beginPath();
            ctx.lineWidth = particle.diameter;

            x2 = particle.x + particle.tilt;
            x = x2 + particle.diameter / 2;
            y2 = particle.y + particle.tilt + particle.diameter / 2;

            if (Confetti.gradient) {
                var gradient = ctx.createLinearGradient(x, particle.y, x2, y2);
                gradient.addColorStop('0', particle.color);
                gradient.addColorStop('1.0', particle.color2);
                ctx.strokeStyle = gradient;
            } else {
                ctx.strokeStyle = particle.color;
            }

            ctx.moveTo(x, particle.y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }

    function startConfetti(timeout, min, max) {
        var width = window.innerWidth;
        var height = window.innerHeight;

        // requestAnimationFrame fallback
        window.requestAnimationFrame = (function () {
            return (
                window.requestAnimationFrame ||
                window.webkitRequestAnimationFrame ||
                window.mozRequestAnimationFrame ||
                window.oRequestAnimationFrame ||
                window.msRequestAnimationFrame ||
                function (callback) {
                    return window.setTimeout(callback, Confetti.frameInterval);
                }
            );
        })();

        var canvas = document.getElementById('confetti-canvas');
        if (canvas === null) {
            canvas = document.createElement('canvas');
            canvas.setAttribute('id', 'confetti-canvas');
            canvas.setAttribute(
                'style',
                'display:block;z-index:999999;pointer-events:none;position:fixed;top:0;left:0;width:100%;height:100%;'
            );
            document.body.appendChild(canvas);
            canvas.width = width;
            canvas.height = height;

            window.addEventListener(
                'resize',
                function () {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                },
                true
            );

            context = canvas.getContext('2d');
        }

        var count = Confetti.maxCount;
        if (min) {
            if (max) {
                if (min === max) {
                    count = particles.length + max;
                } else {
                    if (min > max) {
                        var temp = min;
                        min = max;
                        max = temp;
                    }
                    count = particles.length + ((Math.random() * (max - min) + min) | 0);
                }
            } else {
                count = particles.length + min;
            }
        } else if (max) {
            count = particles.length + max;
        }

        while (particles.length < count) {
            particles.push(resetParticle({}, width, height));
        }

        streamingConfetti = true;
        pause = false;
        runAnimation();

        if (timeout) {
            window.setTimeout(stopConfetti, timeout);
        }
    }

    function stopConfetti() {
        streamingConfetti = false;
    }

    function removeConfetti() {
        stopConfetti();
        pause = false;
        particles = [];
    }

    function toggleConfetti() {
        if (streamingConfetti) {
            stopConfetti();
        } else {
            startConfetti();
        }
    }

    function isConfettiRunning() {
        return streamingConfetti;
    }

    function isConfettiPaused() {
        return pause;
    }

    function toggleConfettiPause() {
        if (pause) {
            resumeConfetti();
        } else {
            pauseConfetti();
        }
    }

    Confetti.start = startConfetti;
    Confetti.stop = stopConfetti;
    Confetti.toggle = toggleConfetti;
    Confetti.pause = pauseConfetti;
    Confetti.resume = resumeConfetti;
    Confetti.togglePause = toggleConfettiPause;
    Confetti.remove = removeConfetti;
    Confetti.isPaused = isConfettiPaused;
    Confetti.isRunning = isConfettiRunning;

    // export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Confetti;
    } else {
        global.Confetti = Confetti;
    }
})(typeof window !== 'undefined' ? window : this);
