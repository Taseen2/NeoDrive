/**
 * NEO DRIVE SIMULATOR - CORE ENGINE
 * 
 * Optimized and feature-complete game engine.
 */

(function () {
    'use strict';

    // ==========================
    // 1. ENGINE CONSTANTS
    // ==========================

    const STATE = { START: 'START', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };

    const VIEW = {
        WIDTH: 1000,
        HEIGHT: 1500 // Matches CSS 4:5 aspect ratio
    };

    const CONFIG = {
        LANE_COUNT: 4,
        LANE_WIDTH: 150,
        ROAD_COLOR: '#080808',
        GRID_COLOR: 'rgba(0, 243, 255, 0.15)',
        COLORS: {
            CYAN: '#00f3ff',
            MAGENTA: '#bc13fe',
            YELLOW: '#fffa00',
            RED: '#ff0033',
            PLAYER: '#ff0033'
        },
        get ROAD_MARGIN() { return (VIEW.WIDTH - (this.LANE_COUNT * this.LANE_WIDTH)) / 2; }
    };

    const PLAYER_CONFIG = {
        WIDTH: 70,
        HEIGHT: 110,
        Y_POS: 850,
        MAX_SPEED: 1000,
        NORMAL_MAX_SPEED: 800,
        ACCEL: 400,          // NEW: Linear acceleration
        BRAKE_FORCE: 1200,   // NEW: Sharp braking
        FRICTION: 150,       // NEW: Constant passive deceleration
        NITRO_ACCEL: 600,    // NEW: Linear nitro boost
        TURN_SPEED: 600,
        MAX_NITRO: 100
    };

    const TRAFFIC_CONFIG = {
        WIDTH: 65,
        HEIGHT: 110,
        COLORS: ['#00f3ff', '#ff00ff', '#00ff00', '#ffff00'],
        POOL_SIZE: 10
    };

    function lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }


    // ==========================
    // 3. AUDIO ENGINE
    // ==========================

    class AudioEngine {
        constructor() {
            this.ctx = null;
            this.osc = null;
            this.gain = null;
            this.initialized = false;
        }

        init() {
            if (this.initialized) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.osc = this.ctx.createOscillator();
                this.gain = this.ctx.createGain();

                this.osc.type = 'sawtooth';
                this.osc.frequency.setValueAtTime(45, this.ctx.currentTime);
                this.gain.gain.setValueAtTime(0, this.ctx.currentTime);

                const lpf = this.ctx.createBiquadFilter();
                lpf.type = 'lowpass';
                lpf.frequency.setValueAtTime(500, this.ctx.currentTime);

                this.osc.connect(lpf);
                lpf.connect(this.gain);
                this.gain.connect(this.ctx.destination);

                this.osc.start();
                this.initialized = true;
            } catch (e) {
                console.warn("Audio Context failed.");
            }
        }

        update(speedRatio, isNitro) {
            if (!this.initialized) return;
            const freq = 45 + (speedRatio * 150) + (isNitro ? 80 : 0);
            this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
            const volume = 0.04 + (speedRatio * 0.1) + (isNitro ? 0.06 : 0);
            this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        }

        stop() {
            if (this.gain && this.initialized)
                this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }

        playCrash() {
            if (!this.initialized) return;
            const n = this.ctx.createBufferSource();
            const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
            const d = b.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            n.buffer = b;

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(0.25, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4);

            n.connect(g);
            g.connect(this.ctx.destination);
            n.start();
        }

        playNearMiss() {
            if (!this.initialized) return;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(800, this.ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
            g.gain.setValueAtTime(0.1, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
            o.connect(g);
            g.connect(this.ctx.destination);
            o.start();
            o.stop(this.ctx.currentTime + 0.1);
        }
    }


    // ==========================
    // 4. INPUT HANDLER
    // ==========================

    class InputHandler {
        constructor() {
            this.keys = {};
            window.addEventListener('keydown', e => this.keys[e.code] = true);
            window.addEventListener('keyup', e => this.keys[e.code] = false);

            const setupTouch = (id, key) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[key] = true; }, { passive: false });
                el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[key] = false; }, { passive: false });
            };

            setupTouch('touch-left', 'KeyA');
            setupTouch('touch-right', 'KeyD');
            setupTouch('nitro-btn', 'ShiftLeft');
            setupTouch('brake-btn', 'KeyS');
        }

        isPressed(code) { return !!this.keys[code]; }
    }


    // ==========================
    // 5. UI HANDLER
    // ==========================

    class UIHandler {
        constructor() {
            this.scoreVal = document.getElementById('score-val');
            this.comboVal = document.getElementById('combo-val');
            this.comboContainer = document.getElementById('combo-container');
            this.speedNum = document.getElementById('speed-num');
            this.speedGaugeFill = document.getElementById('speed-gauge-fill');
            this.nitroBar = document.getElementById('nitro-bar');
            this.nitroStatus = document.getElementById('nitro-status');
            this.nearMissPop = document.getElementById('near-miss-pop');
            this.highScoreStart = document.getElementById('high-score-start');
            this.highScoreEnd = document.getElementById('high-score-end');

            this.screens = {
                hud: document.getElementById('hud-overlay'),
                start: document.getElementById('start-screen'),
                pause: document.getElementById('pause-screen'),
                gameOver: document.getElementById('game-over-screen')
            };
            this.flashOverlay = document.getElementById('flash-overlay');

            this.cache = { score: -1, combo: -1, speed: -1, nitro: -1, nitroReady: false };
            this.displayedSpeed = 0;
        }

        update(speed, nitro, score, combo, maxSpeed, dt) {
            const s = Math.floor(score);
            if (this.cache.score !== s) {
                if (this.scoreVal) this.scoreVal.textContent = s.toString().padStart(6, '0');
                this.cache.score = s;
            }

            const rs = Math.round((speed / 1000) * 320); // Scale to 320 KM/H
            if (this.cache.speed !== rs) {
                if (this.speedNum) this.speedNum.textContent = rs;
                if (this.speedGaugeFill) {
                    const circumference = 339;
                    const maxArc = 255;
                    const fillPercent = Math.min(speed / 800, 1.25); // Use base max speed for gauge
                    const offset = circumference - (fillPercent * maxArc);
                    this.speedGaugeFill.style.strokeDashoffset = offset;
                    this.speedGaugeFill.style.stroke = speed > 800 ? CONFIG.COLORS.RED : CONFIG.COLORS.CYAN;
                }
                this.cache.speed = rs;
            }

            const n = Math.floor(nitro);
            if (this.cache.nitro !== n) {
                if (this.nitroBar) this.nitroBar.style.width = `${n}%`;
                const ready = n >= PLAYER_CONFIG.MAX_NITRO;
                if (this.cache.nitroReady !== ready) {
                    if (this.nitroStatus) this.nitroStatus.classList.toggle('hidden', !ready);
                    this.cache.nitroReady = ready;
                }
                this.cache.nitro = n;
            }

            if (this.cache.combo !== combo) {
                if (this.comboContainer) this.comboContainer.classList.toggle('hidden', combo <= 1);
                if (this.comboVal && combo > 1) this.comboVal.textContent = `x${combo}`;
                this.cache.combo = combo;
            }
        }

        triggerFlash() {
            if (!this.flashOverlay) return;
            this.flashOverlay.style.opacity = '1';
            setTimeout(() => { if (this.flashOverlay) this.flashOverlay.style.opacity = '0'; }, 100);
        }

        showNearMiss() {
            if (!this.nearMissPop) return;
            this.nearMissPop.classList.remove('hidden');
            setTimeout(() => { if (this.nearMissPop) this.nearMissPop.classList.add('hidden'); }, 800);
        }

        switchState(state, data = {}) {
            Object.values(this.screens).forEach(s => { if (s) s.classList.add('hidden'); });
            const mobileControls = document.getElementById('mobile-controls');
            const mobileOnly = document.getElementById('mobile-only-controls');

            if (state === STATE.START) {
                this.screens.start.classList.remove('hidden');
                if (this.highScoreStart) this.highScoreStart.textContent = `BEST_DRIVE: ${data.highScore.toString().padStart(6, '0')}`;
            } else if (state === STATE.PLAYING) {
                this.screens.hud.classList.remove('hidden');
                const isTouch = 'ontouchstart' in window;
                if (isTouch && mobileControls) mobileControls.classList.remove('hidden');
                if (isTouch && mobileOnly) mobileOnly.classList.remove('hidden');
            } else if (state === STATE.PAUSED) {
                this.screens.hud.classList.remove('hidden');
                this.screens.pause.classList.remove('hidden');
            } else if (state === STATE.GAMEOVER) {
                this.screens.gameOver.classList.remove('hidden');
                if (document.getElementById('final-score')) document.getElementById('final-score').textContent = Math.floor(data.score).toString().padStart(6, '0');
                if (this.highScoreEnd) this.highScoreEnd.textContent = data.highScore.toString().padStart(6, '0');
                if (mobileControls) mobileControls.classList.add('hidden');
                if (mobileOnly) mobileOnly.classList.add('hidden');
            }
        }
    }


    // ==========================
    // 6. PARTICLE ENGINE
    // ==========================

    class ParticleSystem {
        constructor() { this.particles = []; }
        spawn(x, y, color, count = 15, speed = 10) {
            for (let i = 0; i < count; i++) {
                this.particles.push({ x, y, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed, life: 1.0, color });
            }
        }
        update(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx; p.y += p.vy; p.life -= dt * 2.5;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }
        draw(ctx) {
            this.particles.forEach(p => {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, 4, 4);
            });
            ctx.globalAlpha = 1;
        }
    }


    // ==========================
    // 7. ENTITIES (Traffic)
    // ==========================

    class TrafficCar {
        constructor() { this.reset(); }
        reset() {
            this.lane = Math.floor(Math.random() * CONFIG.LANE_COUNT);
            this.logicalY = -250;
            this.speed = 120 + Math.random() * 180;
            this.color = TRAFFIC_CONFIG.COLORS[Math.floor(Math.random() * 4)];
            this.active = false;
            this.missed = false;
        }
        spawn() {
            this.lane = Math.floor(Math.random() * CONFIG.LANE_COUNT);
            this.logicalY = -250;
            this.active = true;
            this.missed = false;
        }
        update(dt, playerSpeed) {
            if (!this.active) return;
            this.logicalY += (playerSpeed - this.speed) * dt;
            if (this.logicalY > 1200 || this.logicalY < -600) this.active = false;
        }
    }


    // ==========================
    // 8. GAME CONTROLLER
    // ==========================

    class GameController {
        constructor() {
            this.canvas = document.getElementById('gameCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.ui = new UIHandler();
            this.audio = new AudioEngine();
            this.input = new InputHandler();
            this.particles = new ParticleSystem();

            this.state = STATE.START;
            this.score = 0;
            this.combo = 1;
            this.offset = 0;
            this.shake = 0;
            this.hitstop = 0;
            this.nitro = 100;
            this.crashTimer = null;
            this.highScore = this.loadHighScore();

            this.player = { x: VIEW.WIDTH / 2, speed: 0, nitroActive: false };
            this.trafficPool = Array.from({ length: TRAFFIC_CONFIG.POOL_SIZE }, () => new TrafficCar());
            this.spawnTimer = 0;

            this.init();
        }

        loadHighScore() {
            return parseInt(localStorage.getItem('neoDrive_highScore')) || 0;
        }

        saveHighScore(s) {
            if (s > this.highScore) {
                this.highScore = Math.floor(s);
                localStorage.setItem('neoDrive_highScore', this.highScore);
            }
        }

        init() {
            const resize = () => {
                const dpr = window.devicePixelRatio || 1;
                const container = document.getElementById('game-container');
                const winW = window.innerWidth, winH = window.innerHeight;
                let tw = winW, th = winW * 1.25;
                if (th > winH) { th = winH; tw = winH * 0.8; }
                if (container) {
                    container.style.width = Math.floor(tw) + 'px';
                    container.style.height = Math.floor(th) + 'px';
                }
                this.canvas.width = Math.floor(VIEW.WIDTH * dpr);
                this.canvas.height = Math.floor(VIEW.HEIGHT * dpr);
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.scale(dpr, dpr);
            };
            window.addEventListener('resize', resize);
            resize();

            document.getElementById('start-btn').addEventListener('click', () => this.start());
            document.getElementById('restart-btn').addEventListener('click', () => this.start());
            document.getElementById('pause-btn-hud').addEventListener('click', () => this.togglePause());
            document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());

            window.addEventListener('keydown', e => {
                if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
            });
            
            this.ui.switchState(STATE.START, { highScore: this.highScore });
            requestAnimationFrame(t => this.loop(t));
        }

        togglePause() {
            if (this.state === STATE.PLAYING) {
                this.state = STATE.PAUSED;
                this.audio.stop();
                this.ui.switchState(STATE.PAUSED);
            } else if (this.state === STATE.PAUSED) {
                this.state = STATE.PLAYING;
                this.ui.switchState(STATE.PLAYING);
            }
        }

        start() {
            if (this.crashTimer) clearTimeout(this.crashTimer);
            this.state = STATE.PLAYING;
            this.score = 0;
            this.combo = 1;
            this.nitro = 100;
            this.player.x = VIEW.WIDTH / 2;
            this.player.speed = 0;
            this.player.nitroActive = false;
            this.trafficPool.forEach(c => c.active = false);
            this.particles.particles = [];
            this.offset = 0;
            this.shake = 0;
            this.hitstop = 0;
            this.spawnTimer = 0;
            this.ui.switchState(STATE.PLAYING);
            this.audio.init();
        }

        update(dt) {
            if (this.state === STATE.PAUSED) return;
            if (this.hitstop > 0) { this.hitstop -= dt * 1000; return; }
            if (this.state !== STATE.PLAYING) return;

            let isMoving = (this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp'));
            let isBraking = (this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown'));
            if (!isMoving && ('ontouchstart' in window) && window.innerWidth < 1024) isMoving = true;

            this.player.nitroActive = false;
            if ((this.input.isPressed('ShiftLeft') || this.input.isPressed('ShiftRight')) && this.nitro > 0 && isMoving) {
                this.nitro -= 40 * dt;
                this.player.nitroActive = true;
            } else {
                this.nitro = Math.min(100, this.nitro + 12 * dt);
            }

            const PHYSICS_STEP = 1 / 120;
            let remaining = dt;
            while (remaining > 0) {
                const step = Math.min(remaining, PHYSICS_STEP);
                if (isBraking) {
                    this.player.speed = Math.max(0, this.player.speed - PLAYER_CONFIG.BRAKE_FORCE * step);
                } else if (isMoving) {
                    const accel = this.player.nitroActive ? PLAYER_CONFIG.NITRO_ACCEL : PLAYER_CONFIG.ACCEL;
                    this.player.speed = Math.min(this.player.speed + accel * step, PLAYER_CONFIG.MAX_SPEED);
                } else {
                    this.player.speed = Math.max(0, this.player.speed - PLAYER_CONFIG.FRICTION * step);
                }
                remaining -= step;
            }

            const turnFactor = Math.min(this.player.speed / 200, 1.0);
            if (this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft')) this.player.x -= PLAYER_CONFIG.TURN_SPEED * turnFactor * dt;
            if (this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight')) this.player.x += PLAYER_CONFIG.TURN_SPEED * turnFactor * dt;

            const margin = CONFIG.ROAD_MARGIN + 50;
            this.player.x = Math.max(margin, Math.min(this.player.x, VIEW.WIDTH - margin));

            this.offset += this.player.speed * dt;

            this.spawnTimer += dt * 1000;
            if (this.spawnTimer > 900) {
                const car = this.trafficPool.find(c => !c.active);
                if (car) { car.spawn(); this.spawnTimer = 0; }
            }
            this.trafficPool.forEach(c => c.update(dt, this.player.speed));

            if (this.player.speed > 10) this.score += (this.player.speed * dt) / 10;
            this.checkCollisions();

            this.shake = (this.player.speed / PLAYER_CONFIG.MAX_SPEED) * 2 + (this.player.nitroActive ? 6 : 0);
            this.ui.update(this.player.speed, this.nitro, this.score, this.combo, PLAYER_CONFIG.NORMAL_MAX_SPEED, dt);
            this.audio.update(this.player.speed / PLAYER_CONFIG.MAX_SPEED, this.player.nitroActive);
        }

        checkCollisions() {
            const px = this.player.x;
            const py = PLAYER_CONFIG.Y_POS;
            const marginX = CONFIG.ROAD_MARGIN;

            for (const c of this.trafficPool) {
                if (!c.active) continue;
                const cx = marginX + c.lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
                const cy = c.logicalY;
                const dx = Math.abs(px - cx);
                const dy = Math.abs(py - cy);

                if (dx < 110 && dy < 100 && !c.missed) {
                    if (dx >= 65) {
                        this.score += 500 * this.combo;
                        this.combo++;
                        this.ui.showNearMiss();
                        this.audio.playNearMiss();
                        c.missed = true;
                        this.nitro = Math.min(100, this.nitro + 15);
                    }
                }

                if (dx < 65 && dy < 85) {
                    this.ui.triggerFlash();
                    this.audio.playCrash();
                    this.hitstop = 300;
                    this.particles.spawn(px, py, CONFIG.COLORS.RED, 30, 15);
                    this.saveHighScore(this.score);
                    this.crashTimer = setTimeout(() => {
                        if (this.state === STATE.PLAYING) {
                            this.state = STATE.GAMEOVER;
                            this.ui.switchState(STATE.GAMEOVER, { score: this.score, highScore: this.highScore });
                            this.audio.stop();
                        }
                    }, 300);
                }
            }
        }

        render() {
            const { ctx } = this;
            ctx.clearRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
            ctx.save();
            if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

            // Road
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
            const marginX = CONFIG.ROAD_MARGIN;
            ctx.fillStyle = CONFIG.ROAD_COLOR;
            ctx.fillRect(marginX, 0, CONFIG.LANE_COUNT * CONFIG.LANE_WIDTH, VIEW.HEIGHT);

            // Grid
            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.lineWidth = 2;
            for (let i = -1; i <= 10; i++) {
                const y = (i * 100 + (this.offset % 100));
                ctx.beginPath();
                ctx.moveTo(marginX, y); ctx.lineTo(VIEW.WIDTH - marginX, y); ctx.stroke();
            }

            // Lanes
            for (let i = 0; i <= CONFIG.LANE_COUNT; i++) {
                const x = marginX + i * CONFIG.LANE_WIDTH;
                ctx.beginPath();
                ctx.strokeStyle = (i === 0 || i === CONFIG.LANE_COUNT) ? CONFIG.COLORS.CYAN : 'rgba(255,255,255,0.1)';
                ctx.lineWidth = (i === 0 || i === CONFIG.LANE_COUNT) ? 4 : 2;
                ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.HEIGHT); ctx.stroke();
            }

            // Nitro Speed Lines
            if (this.player.nitroActive) {
                ctx.strokeStyle = 'rgba(188, 19, 254, 0.4)';
                ctx.lineWidth = 2;
                for (let i = 0; i < 20; i++) {
                    const x = Math.random() * VIEW.WIDTH;
                    const y = Math.random() * VIEW.HEIGHT;
                    const len = 50 + Math.random() * 100;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
                }
            }

            this.trafficPool.forEach(c => { if (c.active) this.drawCarBody(c); });
            this.drawCarBody(null, true);
            this.particles.draw(ctx);
            ctx.restore();
        }

        drawCarBody(car, isPlayer = false) {
            const { ctx } = this;
            const marginX = CONFIG.ROAD_MARGIN;
            const lx = isPlayer ? this.player.x : (marginX + car.lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2);
            const ly = isPlayer ? PLAYER_CONFIG.Y_POS : car.logicalY;
            const w = isPlayer ? PLAYER_CONFIG.WIDTH : TRAFFIC_CONFIG.WIDTH;
            const h = isPlayer ? PLAYER_CONFIG.HEIGHT : TRAFFIC_CONFIG.HEIGHT;
            const x = lx - w / 2;
            const y = ly - h / 2;

            ctx.fillStyle = isPlayer ? (this.player.nitroActive ? 'rgba(188, 19, 254, 0.3)' : 'rgba(0, 243, 255, 0.2)') : `${car.color}33`;
            ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
            ctx.fillStyle = isPlayer ? (this.player.nitroActive ? CONFIG.COLORS.MAGENTA : CONFIG.COLORS.PLAYER) : car.color;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#000';
            ctx.fillRect(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.25);
            ctx.fillRect(x + w * 0.15, y + h * 0.6, w * 0.7, h * 0.15);

            if (isPlayer) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(x + 5, y - 5, 12, 5);
                ctx.fillRect(x + w - 17, y - 5, 12, 5);
                if (this.player.nitroActive) {
                    ctx.fillStyle = CONFIG.COLORS.YELLOW;
                    const fl = 20 + Math.random() * 30;
                    ctx.fillRect(x + w * 0.2, y + h, w * 0.2, fl);
                    ctx.fillRect(x + w * 0.6, y + h, w * 0.2, fl);
                }
            } else {
                ctx.fillStyle = CONFIG.COLORS.RED;
                ctx.fillRect(x + 5, y + h, 12, 5);
                ctx.fillRect(x + w - 17, y + h, 12, 5);
            }
        }

        loop(timestamp) {
            const dt = Math.min((timestamp - (this.lastTime || timestamp)) / 1000, 0.1);
            this.lastTime = timestamp;
            this.update(dt);
            this.particles.update(dt);
            this.render();
            requestAnimationFrame(t => this.loop(t));
        }
    }

    if (document.readyState === 'complete') new GameController();
    else window.addEventListener('load', () => new GameController());
})();
