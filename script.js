/**
 * NEO DRIVE SIMULATOR - CORE ENGINE v4.1
 * 
 * High-performance 2D arcade engine with sub-stepped physics and cinematic visuals.
 * Refactored for maximum stability and beginner-friendly readability.
 */

(function () {
    'use strict';

    // ==========================
    // 1. ENGINE CONSTANTS
    // ==========================

    const STATE = { START: 'START', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAMEOVER: 'GAMEOVER' };

    const ENGINE_CONFIG = {
        VIEW: { WIDTH: 1200, HEIGHT: 1500 },
        CORE: {
            LANE_COUNT: 4, LANE_WIDTH: 250, ROAD_COLOR: '#080808',
            GRID_COLOR: 'rgba(0, 243, 255, 0.15)', PHYSICS_STEP: 1 / 120,
            ROAD_SAFETY_MARGIN: 50, SCORE_SCALING: 10,
            get ROAD_MARGIN() { return (ENGINE_CONFIG.VIEW.WIDTH - (this.LANE_COUNT * this.LANE_WIDTH)) / 2; }
        },
        GAUGE: {
            CIRCUMFERENCE: 339, MAX_ARC: 255, DISPLAY_MAX_SPEED: 320, GAUGE_MAX_SPEED: 800,
            NEEDLE_SMOOTHING: 8, PULSE_THRESHOLD: 0.8, VIBRATE_THRESHOLD: 0.95,
            VIBRATE_INTENSITY: 2
        },
        GRID: { SPACING: 100, LINE_WIDTH: 2 },
        PARTICLES: { DEFAULT_COUNT: 15, DEFAULT_SPEED: 10, DECAY_RATE: 2.5, SIZE: 4 },
        AUDIO: {
            ENGINE: { BASE_FREQ: 45, SPEED_FREQ_SCALE: 150, NITRO_FREQ_BOOST: 80, BASE_VOL: 0.04, SPEED_VOL_SCALE: 0.1, NITRO_VOL_BOOST: 0.06, LPF_FREQ: 500 },
            CRASH: { DURATION: 0.4, VOL: 0.25, DECAY_VOL: 0.01 },
            NEAR_MISS: { FREQ_START: 800, FREQ_END: 1200, VOL: 0.1, DECAY_VOL: 0.01, DURATION: 0.1 }
        },
        COLORS: {
            CYAN: '#00f3ff', MAGENTA: '#bc13fe', YELLOW: '#fffa00', RED: '#ff0033',
            PLAYER: '#ff0033', ROAD_BASE: '#111', LANE_LINE: 'rgba(255,255,255,0.1)',
            NITRO_LINE: 'rgba(188, 19, 254, 0.4)'
        },
        COLLISION: {
            NEAR_MISS: { WIDTH: 90, HEIGHT: 95, THRESHOLD: 55, NITRO_REWARD: 20, SCORE_BASE: 500 },
            CRASH: { WIDTH: 50, HEIGHT: 80, HITSTOP: 300, PARTICLE_COUNT: 30, PARTICLE_SPEED: 15, DEATH_DELAY: 300 }
        },
        DIFFICULTY: {
            MAX_INTENSITY_SCORE: 100000, SPEED_SCALING_FACTOR: 1.5,
            SPAWN_INTERVAL: { MAX: 900, MIN: 500 },
            LANE_SWITCH: { INTENSITY_THRESHOLD: 0.5, CHANCE: 0.5, COOLDOWN: 2.0, ACTIVE_RANGE: { MIN: -200, MAX: 800 } }
        },
        VISUALS: {
            PLAYER: { GLOW_STRENGTH: 25, UNDERGLOW_PULSE: 0.1, STEER_TILT_MAX: 12, TILT_SMOOTHING: 10, EXHAUST_FLICKER: 0.15, TRAIL_MAX: 12, SPEED_GLOW_FACTOR: 1.5 },
            SPARKS: { COUNT: 10, SPEED: 15, COLOR: '#fffa00' }
        },
        PLAYER: {
            WIDTH: 70, HEIGHT: 110, Y_POS: 850, MAX_SPEED: 1000, NORMAL_MAX_SPEED: 800,
            ACCEL: 400, BRAKE_FORCE: 1200, FRICTION: 150, NITRO_ACCEL: 600,
            NITRO_CONSUMPTION: 40, NITRO_REGEN: 12, TURN_SPEED: 600, MIN_SPEED_FOR_TURN: 200,
            MAX_NITRO: 100, SHAKE: { BASE: 2, NITRO: 6 }
        },
        TRAFFIC: {
            WIDTH: 65, HEIGHT: 110, COLORS: ['#00f3ff', '#ff00ff', '#00ff00', '#ffff00'],
            POOL_SIZE: 10, INITIAL_Y: -250, DESPAWN_Y_BOTTOM: 1200, DESPAWN_Y_TOP: -600,
            X_SMOOTHING: 5, BASE_SPEED_MIN: 120, BASE_SPEED_VAR: 180
        }
    };

    function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }

    // ==========================
    // 2. ARCHITECTURE & ENTITIES
    // ==========================

    class BaseEntity {
        constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; }
    }

    class Player extends BaseEntity {
        constructor() {
            super(ENGINE_CONFIG.VIEW.WIDTH / 2, ENGINE_CONFIG.PLAYER.Y_POS, ENGINE_CONFIG.PLAYER.WIDTH, ENGINE_CONFIG.PLAYER.HEIGHT);
            this.reset();
        }
        reset() {
            this.x = ENGINE_CONFIG.VIEW.WIDTH / 2; this.speed = 0; this.nitroActive = false;
            this.trail = []; this.tilt = 0; this.glowIntensity = 0; this.underglowPulse = 0;
        }
    }

    class TrafficCar extends BaseEntity {
        constructor() {
            super(0, 0, ENGINE_CONFIG.TRAFFIC.WIDTH, ENGINE_CONFIG.TRAFFIC.HEIGHT);
            this.reset();
        }
        reset() {
            this.active = false; this.missed = false; this.switchCooldown = 0;
            this.speed = 0; this.lane = 0; this.x = 0; this.logicalY = ENGINE_CONFIG.TRAFFIC.INITIAL_Y;
            this.color = ENGINE_CONFIG.TRAFFIC.COLORS[0];
        }
        spawn() {
            this.lane = Math.floor(Math.random() * ENGINE_CONFIG.CORE.LANE_COUNT);
            this.logicalY = ENGINE_CONFIG.TRAFFIC.INITIAL_Y;
            this.active = true; this.missed = false; this.switchCooldown = Math.random() * 2;
            this.speed = ENGINE_CONFIG.TRAFFIC.BASE_SPEED_MIN + Math.random() * ENGINE_CONFIG.TRAFFIC.BASE_SPEED_VAR;
            this.color = ENGINE_CONFIG.TRAFFIC.COLORS[Math.floor(Math.random() * ENGINE_CONFIG.TRAFFIC.COLORS.length)];
            const marginX = ENGINE_CONFIG.CORE.ROAD_MARGIN;
            this.x = marginX + this.lane * ENGINE_CONFIG.CORE.LANE_WIDTH + ENGINE_CONFIG.CORE.LANE_WIDTH / 2;
        }
        update(dt, playerSpeed, difficulty, playerX) {
            if (!this.active) return;
            const diffMult = 1 + (difficulty * (ENGINE_CONFIG.DIFFICULTY.SPEED_SCALING_FACTOR - 1));
            this.logicalY += (playerSpeed - (this.speed * diffMult)) * dt;
            const marginX = ENGINE_CONFIG.CORE.ROAD_MARGIN;
            const targetX = marginX + this.lane * ENGINE_CONFIG.CORE.LANE_WIDTH + ENGINE_CONFIG.CORE.LANE_WIDTH / 2;
            this.x = lerp(this.x, targetX, dt * ENGINE_CONFIG.TRAFFIC.X_SMOOTHING);

            if (difficulty > ENGINE_CONFIG.DIFFICULTY.LANE_SWITCH.INTENSITY_THRESHOLD) {
                this.switchCooldown -= dt;
                if (this.switchCooldown <= 0 && this.logicalY < ENGINE_CONFIG.DIFFICULTY.LANE_SWITCH.ACTIVE_RANGE.MAX && this.logicalY > ENGINE_CONFIG.DIFFICULTY.LANE_SWITCH.ACTIVE_RANGE.MIN) {
                    if (Math.random() < ENGINE_CONFIG.DIFFICULTY.LANE_SWITCH.CHANCE * dt) {
                        const playerLane = Math.floor((playerX - marginX) / ENGINE_CONFIG.CORE.LANE_WIDTH);
                        if (playerLane !== this.lane) {
                            const dir = playerLane > this.lane ? 1 : -1;
                            const newLane = this.lane + dir;
                            if (newLane >= 0 && newLane < ENGINE_CONFIG.CORE.LANE_COUNT) {
                                this.lane = newLane; this.switchCooldown = ENGINE_CONFIG.DIFFICULTY.LANE_SWITCH.COOLDOWN;
                            }
                        }
                    }
                }
            }
            if (this.logicalY > ENGINE_CONFIG.TRAFFIC.DESPAWN_Y_BOTTOM || this.logicalY < ENGINE_CONFIG.TRAFFIC.DESPAWN_Y_TOP) this.active = false;
        }
    }

    // ==========================
    // 3. SYSTEMS
    // ==========================

    class AudioEngine {
        constructor() { this.ctx = null; this.osc = null; this.gain = null; this.initialized = false; }
        init() {
            if (this.initialized) return;
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.osc = this.ctx.createOscillator(); this.gain = this.ctx.createGain();
                this.osc.type = 'sawtooth'; this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
                const lpf = this.ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.setValueAtTime(ENGINE_CONFIG.AUDIO.ENGINE.LPF_FREQ, this.ctx.currentTime);
                this.osc.connect(lpf); lpf.connect(this.gain); this.gain.connect(this.ctx.destination);
                this.osc.start(); this.initialized = true;
            } catch (e) { console.warn("Audio failed."); }
        }
        update(speedRatio, isNitro) {
            if (!this.initialized) return;
            const freq = ENGINE_CONFIG.AUDIO.ENGINE.BASE_FREQ + (speedRatio * ENGINE_CONFIG.AUDIO.ENGINE.SPEED_FREQ_SCALE) + (isNitro ? ENGINE_CONFIG.AUDIO.ENGINE.NITRO_FREQ_BOOST : 0);
            this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
            const volume = ENGINE_CONFIG.AUDIO.ENGINE.BASE_VOL + (speedRatio * ENGINE_CONFIG.AUDIO.ENGINE.SPEED_VOL_SCALE) + (isNitro ? ENGINE_CONFIG.AUDIO.ENGINE.NITRO_VOL_BOOST : 0);
            this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        }
        stop() { if (this.gain && this.initialized) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); }
        playCrash() {
            if (!this.initialized) return;
            const n = this.ctx.createBufferSource(); const b = this.ctx.createBuffer(1, this.ctx.sampleRate * ENGINE_CONFIG.AUDIO.CRASH.DURATION, this.ctx.sampleRate);
            const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            n.buffer = b; const g = this.ctx.createGain(); g.gain.setValueAtTime(ENGINE_CONFIG.AUDIO.CRASH.VOL, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(ENGINE_CONFIG.AUDIO.CRASH.DECAY_VOL, this.ctx.currentTime + ENGINE_CONFIG.AUDIO.CRASH.DURATION);
            n.connect(g); g.connect(this.ctx.destination); n.start();
        }
        playNearMiss() {
            if (!this.initialized) return;
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type = 'square'; o.frequency.setValueAtTime(ENGINE_CONFIG.AUDIO.NEAR_MISS.FREQ_START, this.ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(ENGINE_CONFIG.AUDIO.NEAR_MISS.FREQ_END, this.ctx.currentTime + ENGINE_CONFIG.AUDIO.NEAR_MISS.DURATION);
            g.gain.setValueAtTime(ENGINE_CONFIG.AUDIO.NEAR_MISS.VOL, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(ENGINE_CONFIG.AUDIO.NEAR_MISS.DECAY_VOL, this.ctx.currentTime + ENGINE_CONFIG.AUDIO.NEAR_MISS.DURATION);
            o.connect(g); g.connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + ENGINE_CONFIG.AUDIO.NEAR_MISS.DURATION);
        }
    }

    class UIHandler {
        constructor() {
            this.scoreVal = document.getElementById('score-val'); this.comboVal = document.getElementById('combo-val');
            this.comboContainer = document.getElementById('combo-container'); this.speedNum = document.getElementById('speed-num');
            this.speedGaugeFill = document.getElementById('speed-gauge-fill'); this.nitroBar = document.getElementById('nitro-bar');
            this.nitroStatus = document.getElementById('nitro-status'); this.nearMissPop = document.getElementById('near-miss-pop');
            this.highScoreStart = document.getElementById('high-score-start'); this.highScoreEnd = document.getElementById('high-score-end');
            this.screens = {
                hud: document.getElementById('hud-overlay'), start: document.getElementById('start-screen'),
                pause: document.getElementById('pause-screen'), gameOver: document.getElementById('game-over-screen')
            };
            this.flashOverlay = document.getElementById('flash-overlay');
            this.cache = { score: -1, combo: -1, speed: -1, nitro: -1, nitroReady: false };
            this.internal = { needlePercent: 0, displaySpeed: 0 };
        }
        switchState(state, data = {}) {
            Object.values(this.screens).forEach(s => { if (s) s.classList.add('hidden'); });
            const container = document.getElementById('game-container');
            if (container) { container.style.filter = 'blur(10px) brightness(0.5)'; setTimeout(() => container.style.filter = 'none', 400); }
            if (state === STATE.START) {
                if (this.screens.start) this.screens.start.classList.remove('hidden');
                if (this.highScoreStart) this.highScoreStart.textContent = `BEST_DRIVE: ${data.highScore.toString().padStart(6, '0')}`;
            } else if (state === STATE.PLAYING) {
                if (this.screens.hud) this.screens.hud.classList.remove('hidden');
                const isTouch = 'ontouchstart' in window;
                const c = document.getElementById('mobile-controls'), co = document.getElementById('mobile-only-controls');
                if (isTouch && c) c.classList.remove('hidden'); if (isTouch && co) co.classList.remove('hidden');
            } else if (state === STATE.PAUSED) {
                if (this.screens.hud) this.screens.hud.classList.remove('hidden');
                if (this.screens.pause) this.screens.pause.classList.remove('hidden');
            } else if (state === STATE.GAMEOVER) {
                if (this.screens.gameOver) this.screens.gameOver.classList.remove('hidden');
                const fs = document.getElementById('final-score'); if (fs) fs.textContent = Math.floor(data.score).toString().padStart(6, '0');
                if (this.highScoreEnd) this.highScoreEnd.textContent = data.highScore.toString().padStart(6, '0');
            }
        }
        update(speed, nitro, score, combo, dt, isNitroActive) {
            const s = Math.floor(score); if (this.cache.score !== s) { if (this.scoreVal) this.scoreVal.textContent = s.toString().padStart(6, '0'); this.cache.score = s; }
            const container = document.getElementById('game-container'); if (container) container.classList.toggle('nitro-active', !!isNitroActive);
            const targetRs = Math.round((speed / 1000) * ENGINE_CONFIG.GAUGE.DISPLAY_MAX_SPEED);
            this.internal.displaySpeed = lerp(this.internal.displaySpeed, targetRs, dt * ENGINE_CONFIG.GAUGE.NEEDLE_SMOOTHING);
            const dsi = Math.round(this.internal.displaySpeed);
            if (this.cache.speed !== dsi) { if (this.speedNum) this.speedNum.textContent = dsi; this.cache.speed = dsi; }
            if (this.speedGaugeFill) {
                const targetPct = Math.min(speed / ENGINE_CONFIG.GAUGE.GAUGE_MAX_SPEED, 1.25);
                this.internal.needlePercent = lerp(this.internal.needlePercent, targetPct, dt * ENGINE_CONFIG.GAUGE.NEEDLE_SMOOTHING);
                const offset = ENGINE_CONFIG.GAUGE.CIRCUMFERENCE - (this.internal.needlePercent * ENGINE_CONFIG.GAUGE.MAX_ARC);
                let vibr = 0; if (targetPct > ENGINE_CONFIG.GAUGE.VIBRATE_THRESHOLD) vibr = (Math.random() - 0.5) * ENGINE_CONFIG.GAUGE.VIBRATE_INTENSITY;
                this.speedGaugeFill.style.strokeDashoffset = offset; this.speedGaugeFill.style.transform = `rotate(${vibr}deg)`;
                const targetColor = speed > ENGINE_CONFIG.PLAYER.NORMAL_MAX_SPEED ? ENGINE_CONFIG.COLORS.RED : ENGINE_CONFIG.COLORS.CYAN;
                this.speedGaugeFill.style.stroke = targetColor;
                if (targetPct > ENGINE_CONFIG.GAUGE.PULSE_THRESHOLD) this.speedGaugeFill.style.filter = `drop-shadow(0 0 ${10 + Math.sin(Date.now() / 50) * 5}px ${targetColor})`;
                else this.speedGaugeFill.style.filter = 'none';
            }
            const n = Math.floor(nitro); if (this.cache.nitro !== n) { 
                if (this.nitroBar) this.nitroBar.style.width = `${n}%`; 
                const ready = n >= ENGINE_CONFIG.PLAYER.MAX_NITRO;
                if (this.cache.nitroReady !== ready) { if (this.nitroStatus) this.nitroStatus.classList.toggle('hidden', !ready); this.cache.nitroReady = ready; }
                this.cache.nitro = n; 
            }
            if (this.cache.combo !== combo) { if (this.comboContainer) this.comboContainer.classList.toggle('hidden', combo <= 1); if (this.comboVal && combo > 1) this.comboVal.textContent = `x${combo}`; this.cache.combo = combo; }
        }
        triggerFlash() { if (!this.flashOverlay) return; this.flashOverlay.style.opacity = '1'; setTimeout(() => { if (this.flashOverlay) this.flashOverlay.style.opacity = '0'; }, 100); }
        showNearMiss() { if (!this.nearMissPop) return; this.nearMissPop.classList.remove('hidden'); setTimeout(() => { if (this.nearMissPop) this.nearMissPop.classList.add('hidden'); }, 800); }
    }

    class ParticleSystem {
        constructor() { this.particles = []; }
        spawn(x, y, color, count = ENGINE_CONFIG.PARTICLES.DEFAULT_COUNT, speed = ENGINE_CONFIG.PARTICLES.DEFAULT_SPEED) {
            for (let i = 0; i < count; i++) { this.particles.push({ x, y, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed, life: 1.0, color }); }
        }
        update(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i]; p.x += p.vx; p.y += p.vy; p.life -= dt * ENGINE_CONFIG.PARTICLES.DECAY_RATE;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }
        draw(ctx) {
            this.particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, ENGINE_CONFIG.PARTICLES.SIZE, ENGINE_CONFIG.PARTICLES.SIZE); });
            ctx.globalAlpha = 1;
        }
    }

    // ==========================
    // 4. GAME CONTROLLER
    // ==========================

    class GameController {
        constructor() {
            this.canvas = document.getElementById('gameCanvas'); if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.ui = new UIHandler(); this.audio = new AudioEngine(); this.particles = new ParticleSystem();
            this.player = new Player();
            this.trafficPool = Array.from({ length: ENGINE_CONFIG.TRAFFIC.POOL_SIZE }, () => new TrafficCar());
            this.keys = {}; this.state = STATE.START;
            this.score = 0; this.combo = 1; this.offset = 0; this.shake = 0; this.hitstop = 0; this.spawnTimer = 0;
            this.nitro = ENGINE_CONFIG.PLAYER.MAX_NITRO; this.highScore = this.loadHighScore();
            this.cameraScale = 1.0; this.lastTime = 0; this.init();
        }

        init() {
            this.setupResize();
            window.addEventListener('keydown', e => this.keys[e.code] = true);
            window.addEventListener('keyup', e => this.keys[e.code] = false);
            const setupTouch = (id, key) => {
                const el = document.getElementById(id); if (!el) return;
                el.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[key] = true; }, { passive: false });
                el.addEventListener('touchend', (e) => { e.preventDefault(); this.keys[key] = false; }, { passive: false });
            };
            setupTouch('touch-left', 'KeyA'); setupTouch('touch-right', 'KeyD'); setupTouch('nitro-btn', 'ShiftLeft'); setupTouch('brake-btn', 'KeyS');
            const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
            bind('start-btn', () => this.start()); bind('restart-btn', () => this.start());
            bind('pause-btn-hud', () => this.togglePause()); bind('resume-btn', () => this.togglePause());
            window.addEventListener('keydown', e => {
                if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
                if (e.code === 'Enter' || e.code === 'NumpadEnter') {
                    if (this.state === STATE.START || this.state === STATE.GAMEOVER) this.start();
                    if (this.state === STATE.PAUSED) this.togglePause();
                }
            });
            this.ui.switchState(STATE.START, { highScore: this.highScore });
            requestAnimationFrame(t => this.loop(t));
        }

        setupResize() {
            const resize = () => {
                const dpr = window.devicePixelRatio || 1;
                const container = document.getElementById('game-container');
                const winW = window.innerWidth, winH = window.innerHeight;

                // Calculate the best fit preserving 4:5 aspect ratio
                let tw = winW * 0.95;
                let th = tw * 1.25;

                if (th > winH * 0.95) {
                    th = winH * 0.95;
                    tw = th * 0.8;
                }

                if (container) {
                    container.style.width = Math.floor(tw) + 'px';
                    container.style.height = Math.floor(th) + 'px';
                }

                this.canvas.width = Math.floor(ENGINE_CONFIG.VIEW.WIDTH * dpr);
                this.canvas.height = Math.floor(ENGINE_CONFIG.VIEW.HEIGHT * dpr);
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.scale(dpr, dpr);
            };
            window.addEventListener('resize', resize);
            resize();
        }

        start() {
            if (this.crashTimer) clearTimeout(this.crashTimer);
            this.state = STATE.PLAYING; this.score = 0; this.combo = 1; this.nitro = ENGINE_CONFIG.PLAYER.MAX_NITRO;
            this.player.reset(); this.trafficPool.forEach(c => c.reset());
            this.particles.particles = []; this.offset = 0; this.shake = 0; this.hitstop = 0; this.spawnTimer = 0; this.cameraScale = 1.0;
            this.ui.switchState(STATE.PLAYING); this.audio.init();
        }

        togglePause() {
            if (this.state === STATE.PLAYING) { this.state = STATE.PAUSED; this.audio.stop(); this.ui.switchState(STATE.PAUSED); }
            else if (this.state === STATE.PAUSED) { this.state = STATE.PLAYING; this.ui.switchState(STATE.PLAYING); }
        }

        update(dt) {
            if (this.state === STATE.PAUSED) return; if (this.hitstop > 0) { this.hitstop -= dt * 1000; return; } if (this.state !== STATE.PLAYING) return;
            const difficulty = Math.min(1.0, this.score / ENGINE_CONFIG.DIFFICULTY.MAX_INTENSITY_SCORE);
            let isMoving = (this.keys['KeyW'] || this.keys['ArrowUp']); let isBraking = (this.keys['KeyS'] || this.keys['ArrowDown']);
            if (!isMoving && ('ontouchstart' in window) && window.innerWidth < 1024) isMoving = true;
            this.player.nitroActive = false;
            if ((this.keys['ShiftLeft'] || this.keys['ShiftRight']) && this.nitro > 0 && isMoving) { this.nitro -= ENGINE_CONFIG.PLAYER.NITRO_CONSUMPTION * dt; this.player.nitroActive = true; }
            else if (this.player.speed > 10) { this.nitro = Math.min(ENGINE_CONFIG.PLAYER.MAX_NITRO, this.nitro + ENGINE_CONFIG.PLAYER.NITRO_REGEN * dt); }
            let remaining = dt; const maxSpeed = ENGINE_CONFIG.PLAYER.MAX_SPEED * (1 + difficulty * (ENGINE_CONFIG.DIFFICULTY.SPEED_SCALING_FACTOR - 1));
            while (remaining > 0) {
                const step = Math.min(remaining, ENGINE_CONFIG.CORE.PHYSICS_STEP);
                if (isBraking) this.player.speed = Math.max(0, this.player.speed - ENGINE_CONFIG.PLAYER.BRAKE_FORCE * step);
                else if (isMoving) { const acc = this.player.nitroActive ? ENGINE_CONFIG.PLAYER.NITRO_ACCEL : ENGINE_CONFIG.PLAYER.ACCEL; this.player.speed = Math.min(this.player.speed + acc * step, maxSpeed); }
                else this.player.speed = Math.max(0, this.player.speed - ENGINE_CONFIG.PLAYER.FRICTION * step);
                const turnFactor = Math.min(this.player.speed / ENGINE_CONFIG.PLAYER.MIN_SPEED_FOR_TURN, 1.0);
                if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.player.x -= ENGINE_CONFIG.PLAYER.TURN_SPEED * turnFactor * step;
                if (this.keys['KeyD'] || this.keys['ArrowRight']) this.player.x += ENGINE_CONFIG.PLAYER.TURN_SPEED * turnFactor * step;
                this.offset += this.player.speed * step; remaining -= step;
            }
            const margin = ENGINE_CONFIG.CORE.ROAD_MARGIN + ENGINE_CONFIG.CORE.ROAD_SAFETY_MARGIN;
            this.player.x = Math.max(margin, Math.min(this.player.x, ENGINE_CONFIG.VIEW.WIDTH - margin));
            this.spawnTimer += dt * 1000;
            const spawnInterval = ENGINE_CONFIG.DIFFICULTY.SPAWN_INTERVAL.MAX - (difficulty * (ENGINE_CONFIG.DIFFICULTY.SPAWN_INTERVAL.MAX - ENGINE_CONFIG.DIFFICULTY.SPAWN_INTERVAL.MIN));
            if (this.spawnTimer > spawnInterval) { const car = this.trafficPool.find(c => !c.active); if (car) { car.spawn(); this.spawnTimer = 0; } }
            this.trafficPool.forEach(c => c.update(dt, this.player.speed, difficulty, this.player.x));
            if (this.player.speed > 10) this.score += (this.player.speed * dt) / ENGINE_CONFIG.CORE.SCORE_SCALING;
            this.checkCollisions(); this.updateVisuals(dt);
            this.shake = (this.player.speed / ENGINE_CONFIG.PLAYER.MAX_SPEED) * ENGINE_CONFIG.PLAYER.SHAKE.BASE + (this.player.nitroActive ? ENGINE_CONFIG.PLAYER.SHAKE.NITRO : 0);
            this.ui.update(this.player.speed, this.nitro, this.score, this.combo, dt, this.player.nitroActive);
            this.audio.update(this.player.speed / ENGINE_CONFIG.PLAYER.MAX_SPEED, this.player.nitroActive);
        }

        updateVisuals(dt) {
            const targetTilt = (this.keys['KeyA'] || this.keys['ArrowLeft']) ? -ENGINE_CONFIG.VISUALS.PLAYER.STEER_TILT_MAX : (this.keys['KeyD'] || this.keys['ArrowRight']) ? ENGINE_CONFIG.VISUALS.PLAYER.STEER_TILT_MAX : 0;
            this.player.tilt = lerp(this.player.tilt, targetTilt, dt * ENGINE_CONFIG.VISUALS.PLAYER.TILT_SMOOTHING);
            this.player.underglowPulse += dt * 5;
            const speedRatio = this.player.speed / ENGINE_CONFIG.PLAYER.MAX_SPEED;
            this.player.glowIntensity = (speedRatio * ENGINE_CONFIG.VISUALS.PLAYER.SPEED_GLOW_FACTOR) + (this.player.nitroActive ? 1.5 : 1.0);
            if (this.player.nitroActive) { this.player.trail.push({ x: this.player.x, y: this.player.y }); if (this.player.trail.length > ENGINE_CONFIG.VISUALS.PLAYER.TRAIL_MAX) this.player.trail.shift(); }
            else if (this.player.trail.length > 0) this.player.trail.shift();
            const targetScale = this.player.nitroActive ? 0.95 : 1.0; this.cameraScale = lerp(this.cameraScale, targetScale, dt * 5);
        }

        checkCollisions() {
            const px = this.player.x, py = this.player.y;
            for (const c of this.trafficPool) {
                if (!c.active) continue;
                const dx = Math.abs(px - c.x), dy = Math.abs(py - c.logicalY);
                if (dx < ENGINE_CONFIG.COLLISION.NEAR_MISS.WIDTH && dy < ENGINE_CONFIG.COLLISION.NEAR_MISS.HEIGHT && !c.missed) {
                    if (dx >= ENGINE_CONFIG.COLLISION.NEAR_MISS.THRESHOLD) {
                        this.score += ENGINE_CONFIG.COLLISION.NEAR_MISS.SCORE_BASE * this.combo;
                        this.combo++; this.ui.showNearMiss(); this.audio.playNearMiss(); c.missed = true;
                        this.nitro = Math.min(ENGINE_CONFIG.PLAYER.MAX_NITRO, this.nitro + ENGINE_CONFIG.COLLISION.NEAR_MISS.NITRO_REWARD);
                    }
                }
                if (dx < ENGINE_CONFIG.COLLISION.CRASH.WIDTH && dy < ENGINE_CONFIG.COLLISION.CRASH.HEIGHT) {
                    this.particles.spawn(px, py, ENGINE_CONFIG.VISUALS.SPARKS.COLOR, ENGINE_CONFIG.VISUALS.SPARKS.COUNT, ENGINE_CONFIG.VISUALS.SPARKS.SPEED);
                    this.ui.triggerFlash(); this.audio.playCrash(); this.hitstop = ENGINE_CONFIG.COLLISION.CRASH.HITSTOP;
                    this.particles.spawn(px, py, ENGINE_CONFIG.COLORS.RED, ENGINE_CONFIG.COLLISION.CRASH.PARTICLE_COUNT, ENGINE_CONFIG.COLLISION.CRASH.PARTICLE_SPEED);
                    this.saveHighScore(this.score);
                    this.crashTimer = setTimeout(() => {
                        if (this.state === STATE.PLAYING) { this.state = STATE.GAMEOVER; this.ui.switchState(STATE.GAMEOVER, { score: this.score, highScore: this.highScore }); this.audio.stop(); }
                    }, ENGINE_CONFIG.COLLISION.CRASH.DEATH_DELAY);
                }
            }
        }

        render() {
            const { ctx } = this; ctx.clearRect(0, 0, ENGINE_CONFIG.VIEW.WIDTH, ENGINE_CONFIG.VIEW.HEIGHT); ctx.save();
            if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
            if (this.cameraScale !== 1.0) {
                const cx = ENGINE_CONFIG.VIEW.WIDTH / 2, cy = ENGINE_CONFIG.PLAYER.Y_POS;
                ctx.translate(cx, cy); ctx.scale(this.cameraScale, this.cameraScale); ctx.translate(-cx, -cy);
            }
            this.drawRoad();
            this.trafficPool.forEach(c => { if (c.active) this.drawCarBody({ x: c.x, y: c.logicalY, w: c.width, h: c.height, color: c.color }); });
            if (this.player.trail.length > 1) {
                this.player.trail.forEach((pos, i) => { this.drawCarBody({ x: pos.x, y: pos.y, w: this.player.width, h: this.player.height, color: ENGINE_CONFIG.COLORS.MAGENTA, alpha: i / this.player.trail.length * 0.3, isGhost: true }); });
            }
            this.drawCarBody({ x: this.player.x, y: this.player.y, w: this.player.width, h: this.player.height, color: ENGINE_CONFIG.COLORS.PLAYER, isPlayer: true });
            this.particles.draw(ctx); ctx.restore();
        }

        drawRoad() {
            const { ctx } = this; const marginX = ENGINE_CONFIG.CORE.ROAD_MARGIN;
            ctx.fillStyle = ENGINE_CONFIG.COLORS.ROAD_BASE; ctx.fillRect(0, 0, ENGINE_CONFIG.VIEW.WIDTH, ENGINE_CONFIG.VIEW.HEIGHT);
            ctx.fillStyle = ENGINE_CONFIG.CORE.ROAD_COLOR; ctx.fillRect(marginX, 0, ENGINE_CONFIG.CORE.LANE_COUNT * ENGINE_CONFIG.CORE.LANE_WIDTH, ENGINE_CONFIG.VIEW.HEIGHT);
            ctx.strokeStyle = ENGINE_CONFIG.CORE.GRID_COLOR; ctx.lineWidth = ENGINE_CONFIG.GRID.LINE_WIDTH;
            for (let i = -1; i <= 15; i++) {
                const y = (i * ENGINE_CONFIG.GRID.SPACING + (this.offset % ENGINE_CONFIG.GRID.SPACING));
                ctx.beginPath(); ctx.moveTo(marginX, y); ctx.lineTo(ENGINE_CONFIG.VIEW.WIDTH - marginX, y); ctx.stroke();
            }
            for (let i = 0; i <= ENGINE_CONFIG.CORE.LANE_COUNT; i++) {
                const x = marginX + i * ENGINE_CONFIG.CORE.LANE_WIDTH; ctx.beginPath();
                ctx.strokeStyle = (i === 0 || i === ENGINE_CONFIG.CORE.LANE_COUNT) ? ENGINE_CONFIG.COLORS.CYAN : ENGINE_CONFIG.COLORS.LANE_LINE;
                ctx.lineWidth = (i === 0 || i === ENGINE_CONFIG.CORE.LANE_COUNT) ? 4 : 2; ctx.moveTo(x, 0); ctx.lineTo(x, ENGINE_CONFIG.VIEW.HEIGHT); ctx.stroke();
            }
            if (this.player.nitroActive) {
                ctx.strokeStyle = ENGINE_CONFIG.COLORS.NITRO_LINE; ctx.lineWidth = 2;
                for (let i = 0; i < 20; i++) {
                    const x = Math.random() * ENGINE_CONFIG.VIEW.WIDTH, y = Math.random() * ENGINE_CONFIG.VIEW.HEIGHT, len = 50 + Math.random() * 100;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
                }
            }
        }

        drawCarBody(cfg) {
            const { ctx } = this; ctx.save(); ctx.translate(cfg.x, cfg.y);
            if (cfg.isPlayer) ctx.rotate(this.player.tilt * Math.PI / 180);
            if (cfg.isPlayer && !cfg.isGhost) {
                const ugColor = this.player.nitroActive ? ENGINE_CONFIG.COLORS.MAGENTA : ENGINE_CONFIG.COLORS.CYAN;
                const ugPulse = 15 + Math.sin(this.player.underglowPulse) * 10;
                ctx.shadowBlur = ugPulse; ctx.shadowColor = ugColor; ctx.fillStyle = ugColor + '44';
                ctx.fillRect(-cfg.w / 2 - 10, -cfg.h / 2 - 10, cfg.w + 20, cfg.h + 20);
            }
            if (cfg.isPlayer && !cfg.isGhost) {
                ctx.shadowBlur = ENGINE_CONFIG.VISUALS.PLAYER.GLOW_STRENGTH * this.player.glowIntensity;
                ctx.shadowColor = this.player.nitroActive ? ENGINE_CONFIG.COLORS.MAGENTA : ENGINE_CONFIG.COLORS.CYAN;
            } else if (cfg.isGhost) {
                ctx.fillStyle = cfg.color; ctx.globalAlpha = cfg.alpha || 0.3; ctx.fillRect(-cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h); ctx.restore(); return;
            } else { ctx.shadowBlur = 5; ctx.shadowColor = cfg.color; }
            ctx.fillStyle = cfg.isPlayer ? (this.player.nitroActive ? ENGINE_CONFIG.COLORS.MAGENTA : ENGINE_CONFIG.COLORS.PLAYER) : cfg.color;
            ctx.fillRect(-cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h); ctx.fillStyle = '#000';
            ctx.fillRect(-cfg.w / 2 + cfg.w * 0.15, -cfg.h / 2 + cfg.h * 0.2, cfg.w * 0.7, cfg.h * 0.25);
            ctx.fillRect(-cfg.w / 2 + cfg.w * 0.15, -cfg.h / 2 + cfg.h * 0.6, cfg.w * 0.7, cfg.h * 0.15);
            if (cfg.isPlayer) {
                ctx.fillStyle = '#fff'; ctx.shadowBlur = 15; ctx.shadowColor = '#fff';
                ctx.fillRect(-cfg.w / 2 + 5, -cfg.h / 2 - 5, 15, 6); ctx.fillRect(cfg.w / 2 - 20, -cfg.h / 2 - 5, 15, 6);
                if (this.player.speed > 100) {
                    const flameLen = (this.player.speed / 1000) * 80 * (this.player.nitroActive ? 2 : 1); const flick = Math.random() * 15;
                    ctx.shadowBlur = 20; ctx.shadowColor = this.player.nitroActive ? ENGINE_CONFIG.COLORS.MAGENTA : ENGINE_CONFIG.COLORS.YELLOW;
                    ctx.fillStyle = this.player.nitroActive ? ENGINE_CONFIG.COLORS.MAGENTA : ENGINE_CONFIG.COLORS.YELLOW;
                    ctx.fillRect(-cfg.w / 2 + cfg.w * 0.2, cfg.h / 2 - 5, cfg.w * 0.2, flameLen + flick);
                    ctx.fillRect(-cfg.w / 2 + cfg.w * 0.6, cfg.h / 2 - 5, cfg.w * 0.2, flameLen + flick);
                }
            } else { ctx.fillStyle = ENGINE_CONFIG.COLORS.RED; ctx.fillRect(-cfg.w / 2 + 5, cfg.h / 2 - 2, 12, 5); ctx.fillRect(cfg.w / 2 - 17, cfg.h / 2 - 2, 12, 5); }
            ctx.restore();
        }

        loadHighScore() { return parseInt(localStorage.getItem('neoDrive_highScore')) || 0; }
        saveHighScore(s) { if (s > this.highScore) { this.highScore = Math.floor(s); localStorage.setItem('neoDrive_highScore', this.highScore); } }
        loop(timestamp) {
            const dt = Math.min((timestamp - (this.lastTime || timestamp)) / 1000, 0.1); this.lastTime = timestamp;
            this.update(dt); this.particles.update(dt); this.render(); requestAnimationFrame(t => this.loop(t));
        }
    }

    if (document.readyState === 'complete') new GameController(); else window.addEventListener('load', () => new GameController());
})();
