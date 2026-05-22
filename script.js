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
        WIDTH: 1200,
        HEIGHT: 1500 // Matches CSS 4:5 aspect ratio
    };

    const CONFIG = {
        LANE_COUNT: 4,
        LANE_WIDTH: 250,
        ROAD_COLOR: '#080808',
        GRID_COLOR: 'rgba(0, 243, 255, 0.15)',
        PHYSICS_STEP: 1 / 120,
        ROAD_SAFETY_MARGIN: 50,
        SCORE_SCALING: 10,
        GAUGE: {
            CIRCUMFERENCE: 339,
            MAX_ARC: 255,
            DISPLAY_MAX_SPEED: 320,
            GAUGE_MAX_SPEED: 800
        },
        GRID: {
            SPACING: 100,
            LINE_WIDTH: 2
        },
        PARTICLES: {
            DEFAULT_COUNT: 15,
            DEFAULT_SPEED: 10,
            DECAY_RATE: 2.5,
            SIZE: 4
        },
        AUDIO: {
            ENGINE: {
                BASE_FREQ: 45,
                SPEED_FREQ_SCALE: 150,
                NITRO_FREQ_BOOST: 80,
                BASE_VOL: 0.04,
                SPEED_VOL_SCALE: 0.1,
                NITRO_VOL_BOOST: 0.06,
                LPF_FREQ: 500
            },
            CRASH: {
                DURATION: 0.4,
                VOL: 0.25,
                DECAY_VOL: 0.01
            },
            NEAR_MISS: {
                FREQ_START: 800,
                FREQ_END: 1200,
                VOL: 0.1,
                DECAY_VOL: 0.01,
                DURATION: 0.1
            }
        },
        COLORS: {
            CYAN: '#00f3ff',
            MAGENTA: '#bc13fe',
            YELLOW: '#fffa00',
            RED: '#ff0033',
            PLAYER: '#ff0033',
            ROAD_BASE: '#111',
            LANE_LINE: 'rgba(255,255,255,0.1)',
            NITRO_LINE: 'rgba(188, 19, 254, 0.4)'
        },
        COLLISION: {
            NEAR_MISS: {
                WIDTH: 90,
                HEIGHT: 95,
                THRESHOLD: 55,
                NITRO_REWARD: 20,
                SCORE_BASE: 500
            },
            CRASH: {
                WIDTH: 50,
                HEIGHT: 80,
                HITSTOP: 300,
                PARTICLE_COUNT: 30,
                PARTICLE_SPEED: 15,
                DEATH_DELAY: 300
            }
        },
        get ROAD_MARGIN() { return (VIEW.WIDTH - (this.LANE_COUNT * this.LANE_WIDTH)) / 2; }
    };

    const DIFFICULTY_CONFIG = {
        MAX_INTENSITY_SCORE: 100000,
        SPEED_SCALING_FACTOR: 1.5,
        SPAWN_INTERVAL: { MAX: 900, MIN: 500 },
        LANE_SWITCH: {
            INTENSITY_THRESHOLD: 0.5,
            CHANCE: 0.5,      // Chance per second
            COOLDOWN: 2.0,    // Seconds between switches
            ACTIVE_RANGE: { MIN: -200, MAX: 800 }
        }
    };

    const GAUGE_CONFIG = {
        NEEDLE_SMOOTHING: 8,
        PULSE_THRESHOLD: 0.8,    // 80% of max speed
        VIBRATE_THRESHOLD: 0.95, // 95% of max speed
        VIBRATE_INTENSITY: 2,
        COLOR_TRANSITION_SPEED: 5
    };

    const VISUAL_CONFIG = {
        PLAYER: {
            GLOW_STRENGTH: 25,
            UNDERGLOW_PULSE: 0.1,
            STEER_TILT_MAX: 12,
            TILT_SMOOTHING: 10,
            EXHAUST_FLICKER: 0.15,
            TRAIL_MAX: 12,
            SPEED_GLOW_FACTOR: 1.5
        },
        SPARKS: {
            COUNT: 10,
            SPEED: 15,
            COLOR: '#fffa00'
        }
    };

    const PLAYER_CONFIG = {
        WIDTH: 70,
        HEIGHT: 110,
        Y_POS: 850,
        MAX_SPEED: 1000,
        NORMAL_MAX_SPEED: 800,
        ACCEL: 400,
        BRAKE_FORCE: 1200,
        FRICTION: 150,
        NITRO_ACCEL: 600,
        NITRO_CONSUMPTION: 40,
        NITRO_REGEN: 12,
        TURN_SPEED: 600,
        MIN_SPEED_FOR_TURN: 200,
        MAX_NITRO: 100,
        SHAKE: {
            BASE: 2,
            NITRO: 6
        }
    };

    const TRAFFIC_CONFIG = {
        WIDTH: 65,
        HEIGHT: 110,
        COLORS: ['#00f3ff', '#ff00ff', '#00ff00', '#ffff00'],
        POOL_SIZE: 10,
        INITIAL_Y: -250,
        DESPAWN_Y_BOTTOM: 1200,
        DESPAWN_Y_TOP: -600,
        X_SMOOTHING: 5,
        BASE_SPEED_MIN: 120,
        BASE_SPEED_VAR: 180
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
                this.osc.frequency.setValueAtTime(CONFIG.AUDIO.ENGINE.BASE_FREQ, this.ctx.currentTime);
                this.gain.gain.setValueAtTime(0, this.ctx.currentTime);

                const lpf = this.ctx.createBiquadFilter();
                lpf.type = 'lowpass';
                lpf.frequency.setValueAtTime(CONFIG.AUDIO.ENGINE.LPF_FREQ, this.ctx.currentTime);

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
            const freq = CONFIG.AUDIO.ENGINE.BASE_FREQ + (speedRatio * CONFIG.AUDIO.ENGINE.SPEED_FREQ_SCALE) + (isNitro ? CONFIG.AUDIO.ENGINE.NITRO_FREQ_BOOST : 0);
            this.osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
            const volume = CONFIG.AUDIO.ENGINE.BASE_VOL + (speedRatio * CONFIG.AUDIO.ENGINE.SPEED_VOL_SCALE) + (isNitro ? CONFIG.AUDIO.ENGINE.NITRO_VOL_BOOST : 0);
            this.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        }

        stop() {
            if (this.gain && this.initialized)
                this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }

        playCrash() {
            if (!this.initialized) return;
            const n = this.ctx.createBufferSource();
            const b = this.ctx.createBuffer(1, this.ctx.sampleRate * CONFIG.AUDIO.CRASH.DURATION, this.ctx.sampleRate);
            const d = b.getChannelData(0);
            for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            n.buffer = b;

            const g = this.ctx.createGain();
            g.gain.setValueAtTime(CONFIG.AUDIO.CRASH.VOL, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(CONFIG.AUDIO.CRASH.DECAY_VOL, this.ctx.currentTime + CONFIG.AUDIO.CRASH.DURATION);

            n.connect(g);
            g.connect(this.ctx.destination);
            n.start();
        }

        playNearMiss() {
            if (!this.initialized) return;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(CONFIG.AUDIO.NEAR_MISS.FREQ_START, this.ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(CONFIG.AUDIO.NEAR_MISS.FREQ_END, this.ctx.currentTime + CONFIG.AUDIO.NEAR_MISS.DURATION);
            g.gain.setValueAtTime(CONFIG.AUDIO.NEAR_MISS.VOL, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(CONFIG.AUDIO.NEAR_MISS.DECAY_VOL, this.ctx.currentTime + CONFIG.AUDIO.NEAR_MISS.DURATION);
            o.connect(g);
            g.connect(this.ctx.destination);
            o.start();
            o.stop(this.ctx.currentTime + CONFIG.AUDIO.NEAR_MISS.DURATION);
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
            this.internal = {
                needlePercent: 0,
                displaySpeed: 0,
                gaugeColor: CONFIG.COLORS.CYAN
            };
        }

        update(speed, nitro, score, combo, maxSpeed, dt, isNitroActive) {
            const s = Math.floor(score);
            if (this.cache.score !== s) {
                if (this.scoreVal) this.scoreVal.textContent = s.toString().padStart(6, '0');
                this.cache.score = s;
            }

            // Nitro active screen effect
            const container = document.getElementById('game-container');
            if (container) container.classList.toggle('nitro-active', !!isNitroActive);

            // 1. Smooth Speed Interpolation
            const targetRs = Math.round((speed / 1000) * CONFIG.GAUGE.DISPLAY_MAX_SPEED);
            this.internal.displaySpeed = lerp(this.internal.displaySpeed, targetRs, dt * GAUGE_CONFIG.NEEDLE_SMOOTHING);
            const displaySpeedInt = Math.round(this.internal.displaySpeed);

            if (this.cache.speed !== displaySpeedInt) {
                if (this.speedNum) this.speedNum.textContent = displaySpeedInt;
                this.cache.speed = displaySpeedInt;
            }

            // 2. Gauge Visuals & Vibration
            if (this.speedGaugeFill) {
                const targetPercent = Math.min(speed / CONFIG.GAUGE.GAUGE_MAX_SPEED, 1.25);
                this.internal.needlePercent = lerp(this.internal.needlePercent, targetPercent, dt * GAUGE_CONFIG.NEEDLE_SMOOTHING);
                
                const circumference = CONFIG.GAUGE.CIRCUMFERENCE;
                const maxArc = CONFIG.GAUGE.MAX_ARC;
                const offset = circumference - (this.internal.needlePercent * maxArc);
                
                // Vibrate at high speeds
                let vibration = 0;
                if (targetPercent > GAUGE_CONFIG.VIBRATE_THRESHOLD) {
                    vibration = (Math.random() - 0.5) * GAUGE_CONFIG.VIBRATE_INTENSITY;
                }

                this.speedGaugeFill.style.strokeDashoffset = offset;
                this.speedGaugeFill.style.transform = `rotate(${vibration}deg)`;
                
                // Color Transition
                const targetColor = speed > PLAYER_CONFIG.NORMAL_MAX_SPEED ? CONFIG.COLORS.RED : CONFIG.COLORS.CYAN;
                this.speedGaugeFill.style.stroke = targetColor;
                
                // Pulse effect
                if (targetPercent > GAUGE_CONFIG.PULSE_THRESHOLD) {
                    this.speedGaugeFill.style.filter = `drop-shadow(0 0 ${10 + Math.sin(Date.now() / 50) * 5}px ${targetColor})`;
                } else {
                    this.speedGaugeFill.style.filter = 'none';
                }
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
            // Apply transition effects
            const container = document.getElementById('game-container');
            if (container) {
                container.style.filter = 'blur(10px) brightness(0.5)';
                setTimeout(() => container.style.filter = 'none', 400);
            }

            Object.values(this.screens).forEach(s => { if (s) s.classList.add('hidden'); });
            const mobileControls = document.getElementById('mobile-controls');
            const mobileOnly = document.getElementById('mobile-only-controls');

            if (state === STATE.START) {
                if (this.screens.start) this.screens.start.classList.remove('hidden');
                if (this.highScoreStart) this.highScoreStart.textContent = `BEST_DRIVE: ${data.highScore.toString().padStart(6, '0')}`;
            } else if (state === STATE.PLAYING) {
                if (this.screens.hud) this.screens.hud.classList.remove('hidden');
                const isTouch = 'ontouchstart' in window;
                if (isTouch && mobileControls) mobileControls.classList.remove('hidden');
                if (isTouch && mobileOnly) mobileOnly.classList.remove('hidden');
            } else if (state === STATE.PAUSED) {
                if (this.screens.hud) this.screens.hud.classList.remove('hidden');
                if (this.screens.pause) this.screens.pause.classList.remove('hidden');
            } else if (state === STATE.GAMEOVER) {
                if (this.screens.gameOver) this.screens.gameOver.classList.remove('hidden');
                const finalScoreEl = document.getElementById('final-score');
                if (finalScoreEl) finalScoreEl.textContent = Math.floor(data.score).toString().padStart(6, '0');
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
        spawn(x, y, color, count = CONFIG.PARTICLES.DEFAULT_COUNT, speed = CONFIG.PARTICLES.DEFAULT_SPEED) {
            for (let i = 0; i < count; i++) {
                this.particles.push({ x, y, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed, life: 1.0, color });
            }
        }
        update(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx; p.y += p.vy; p.life -= dt * CONFIG.PARTICLES.DECAY_RATE;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        }
        draw(ctx) {
            this.particles.forEach(p => {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x, p.y, CONFIG.PARTICLES.SIZE, CONFIG.PARTICLES.SIZE);
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
            this.logicalY = TRAFFIC_CONFIG.INITIAL_Y;
            this.x = undefined;
            this.speed = TRAFFIC_CONFIG.BASE_SPEED_MIN + Math.random() * TRAFFIC_CONFIG.BASE_SPEED_VAR;
            this.color = TRAFFIC_CONFIG.COLORS[Math.floor(Math.random() * TRAFFIC_CONFIG.COLORS.length)];
            this.active = false;
            this.missed = false;
            this.switchCooldown = 0;
        }
        spawn() {
            this.lane = Math.floor(Math.random() * CONFIG.LANE_COUNT);
            this.logicalY = TRAFFIC_CONFIG.INITIAL_Y;
            this.active = true;
            this.missed = false;
            this.switchCooldown = Math.random() * 2;
            const marginX = CONFIG.ROAD_MARGIN;
            this.x = marginX + this.lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
        }
        update(dt, playerSpeed, difficulty, playerX) {
            if (!this.active) return;
            const difficultyMultiplier = 1 + (difficulty * (DIFFICULTY_CONFIG.SPEED_SCALING_FACTOR - 1));
            this.logicalY += (playerSpeed - (this.speed * difficultyMultiplier)) * dt;
            const marginX = CONFIG.ROAD_MARGIN;
            const targetX = marginX + this.lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
            if (this.x === undefined) this.x = targetX;
            this.x = lerp(this.x, targetX, dt * TRAFFIC_CONFIG.X_SMOOTHING);

            if (difficulty > DIFFICULTY_CONFIG.LANE_SWITCH.INTENSITY_THRESHOLD) {
                this.switchCooldown -= dt;
                if (this.switchCooldown <= 0 && this.logicalY < DIFFICULTY_CONFIG.LANE_SWITCH.ACTIVE_RANGE.MAX && this.logicalY > DIFFICULTY_CONFIG.LANE_SWITCH.ACTIVE_RANGE.MIN) {
                    if (Math.random() < DIFFICULTY_CONFIG.LANE_SWITCH.CHANCE * dt) {
                        const playerLane = Math.floor((playerX - marginX) / CONFIG.LANE_WIDTH);
                        if (playerLane !== this.lane) {
                            const dir = playerLane > this.lane ? 1 : -1;
                            const newLane = this.lane + dir;
                            if (newLane >= 0 && newLane < CONFIG.LANE_COUNT) {
                                this.lane = newLane;
                                this.switchCooldown = DIFFICULTY_CONFIG.LANE_SWITCH.COOLDOWN;
                            }
                        }
                    }
                }
            }

            if (this.logicalY > TRAFFIC_CONFIG.DESPAWN_Y_BOTTOM || this.logicalY < TRAFFIC_CONFIG.DESPAWN_Y_TOP) this.active = false;
        }
    }


    // ==========================
    // 8. GAME CONTROLLER
    // ==========================

    class GameController {
        constructor() {
            this.canvas = document.getElementById('gameCanvas');
            if (!this.canvas) return;
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
            this.nitro = PLAYER_CONFIG.MAX_NITRO;
            this.crashTimer = null;
            this.highScore = this.loadHighScore();
            this.cameraScale = 1.0;
            this.lastTime = 0;

            this.player = { 
                x: VIEW.WIDTH / 2, 
                speed: 0, 
                nitroActive: false, 
                trail: [],
                tilt: 0,
                glowIntensity: 0,
                underglowPulse: 0
            };
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

        getDifficulty() {
            return Math.min(1.0, this.score / DIFFICULTY_CONFIG.MAX_INTENSITY_SCORE);
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

            const startBtn = document.getElementById('start-btn');
            if (startBtn) startBtn.addEventListener('click', () => this.start());
            const restartBtn = document.getElementById('restart-btn');
            if (restartBtn) restartBtn.addEventListener('click', () => this.start());
            const pauseBtnHud = document.getElementById('pause-btn-hud');
            if (pauseBtnHud) pauseBtnHud.addEventListener('click', () => this.togglePause());
            const resumeBtn = document.getElementById('resume-btn');
            if (resumeBtn) resumeBtn.addEventListener('click', () => this.togglePause());

            window.addEventListener('keydown', e => {
                if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
                if (e.code === 'Enter' || e.code === 'NumpadEnter') {
                    if (this.state === STATE.START || this.state === STATE.GAMEOVER) this.start();
                }
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
            this.nitro = PLAYER_CONFIG.MAX_NITRO;
            this.player.x = VIEW.WIDTH / 2;
            this.player.speed = 0;
            this.player.nitroActive = false;
            this.player.trail = [];
            this.trafficPool.forEach(c => c.active = false);
            this.particles.particles = [];
            this.offset = 0;
            this.shake = 0;
            this.hitstop = 0;
            this.spawnTimer = 0;
            this.cameraScale = 1.0;
            this.ui.switchState(STATE.PLAYING);
            this.audio.init();
        }

        update(dt) {
            if (this.state === STATE.PAUSED) return;
            if (this.hitstop > 0) { this.hitstop -= dt * 1000; return; }
            if (this.state !== STATE.PLAYING) return;

            const difficulty = this.getDifficulty();
            let isMoving = (this.input.isPressed('KeyW') || this.input.isPressed('ArrowUp'));
            let isBraking = (this.input.isPressed('KeyS') || this.input.isPressed('ArrowDown'));
            if (!isMoving && ('ontouchstart' in window) && window.innerWidth < 1024) isMoving = true;

            this.player.nitroActive = false;
            if ((this.input.isPressed('ShiftLeft') || this.input.isPressed('ShiftRight')) && this.nitro > 0 && isMoving) {
                this.nitro -= PLAYER_CONFIG.NITRO_CONSUMPTION * dt;
                this.player.nitroActive = true;
            } else if (this.player.speed > 10) {
                this.nitro = Math.min(PLAYER_CONFIG.MAX_NITRO, this.nitro + PLAYER_CONFIG.NITRO_REGEN * dt);
            }

            let remaining = dt;
            const maxSpeed = PLAYER_CONFIG.MAX_SPEED * (1 + difficulty * (DIFFICULTY_CONFIG.SPEED_SCALING_FACTOR - 1));

            while (remaining > 0) {
                const step = Math.min(remaining, CONFIG.PHYSICS_STEP);
                if (isBraking) {
                    this.player.speed = Math.max(0, this.player.speed - PLAYER_CONFIG.BRAKE_FORCE * step);
                } else if (isMoving) {
                    const accel = this.player.nitroActive ? PLAYER_CONFIG.NITRO_ACCEL : PLAYER_CONFIG.ACCEL;
                    this.player.speed = Math.min(this.player.speed + accel * step, maxSpeed);
                } else {
                    this.player.speed = Math.max(0, this.player.speed - PLAYER_CONFIG.FRICTION * step);
                }
                remaining -= step;
            }

            const turnFactor = Math.min(this.player.speed / PLAYER_CONFIG.MIN_SPEED_FOR_TURN, 1.0);
            if (this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft')) this.player.x -= PLAYER_CONFIG.TURN_SPEED * turnFactor * dt;
            if (this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight')) this.player.x += PLAYER_CONFIG.TURN_SPEED * turnFactor * dt;

            const targetTilt = (this.input.isPressed('KeyA') || this.input.isPressed('ArrowLeft')) ? -VISUAL_CONFIG.PLAYER.STEER_TILT_MAX : 
                               (this.input.isPressed('KeyD') || this.input.isPressed('ArrowRight')) ? VISUAL_CONFIG.PLAYER.STEER_TILT_MAX : 0;
            this.player.tilt = lerp(this.player.tilt, targetTilt, dt * VISUAL_CONFIG.PLAYER.TILT_SMOOTHING);
            
            this.player.underglowPulse += dt * 5;
            const speedRatio = this.player.speed / PLAYER_CONFIG.MAX_SPEED;
            this.player.glowIntensity = (speedRatio * VISUAL_CONFIG.PLAYER.SPEED_GLOW_FACTOR) + (this.player.nitroActive ? 1.5 : 1.0);

            const margin = CONFIG.ROAD_MARGIN + CONFIG.ROAD_SAFETY_MARGIN;
            this.player.x = Math.max(margin, Math.min(this.player.x, VIEW.WIDTH - margin));

            // Trail Logic
            if (this.player.nitroActive) {
                this.player.trail.push({ x: this.player.x, y: PLAYER_CONFIG.Y_POS });
                if (this.player.trail.length > 10) this.player.trail.shift();
            } else if (this.player.trail.length > 0) {
                this.player.trail.shift();
            }

            // FOV Logic
            const targetScale = this.player.nitroActive ? 0.95 : 1.0;
            this.cameraScale = lerp(this.cameraScale, targetScale, dt * 5);

            this.offset += this.player.speed * dt;

            this.spawnTimer += dt * 1000;
            const spawnInterval = DIFFICULTY_CONFIG.SPAWN_INTERVAL.MAX - (difficulty * (DIFFICULTY_CONFIG.SPAWN_INTERVAL.MAX - DIFFICULTY_CONFIG.SPAWN_INTERVAL.MIN));
            if (this.spawnTimer > spawnInterval) {
                const car = this.trafficPool.find(c => !c.active);
                if (car) { car.spawn(); this.spawnTimer = 0; }
            }
            this.trafficPool.forEach(c => c.update(dt, this.player.speed, difficulty, this.player.x));

            if (this.player.speed > 10) this.score += (this.player.speed * dt) / CONFIG.SCORE_SCALING;
            this.checkCollisions();

            this.shake = (this.player.speed / PLAYER_CONFIG.MAX_SPEED) * PLAYER_CONFIG.SHAKE.BASE + (this.player.nitroActive ? PLAYER_CONFIG.SHAKE.NITRO : 0);
            this.ui.update(this.player.speed, this.nitro, this.score, this.combo, PLAYER_CONFIG.NORMAL_MAX_SPEED, dt, this.player.nitroActive);
            this.audio.update(this.player.speed / PLAYER_CONFIG.MAX_SPEED, this.player.nitroActive);
        }

        checkCollisions() {
            const px = this.player.x, py = PLAYER_CONFIG.Y_POS;
            for (const c of this.trafficPool) {
                if (!c.active) continue;
                const dx = Math.abs(px - c.x), dy = Math.abs(py - c.logicalY);

                if (dx < CONFIG.COLLISION.NEAR_MISS.WIDTH && dy < CONFIG.COLLISION.NEAR_MISS.HEIGHT && !c.missed) {
                    if (dx >= CONFIG.COLLISION.NEAR_MISS.THRESHOLD) {
                        this.score += CONFIG.COLLISION.NEAR_MISS.SCORE_BASE * this.combo;
                        this.combo++;
                        this.ui.showNearMiss();
                        this.audio.playNearMiss();
                        c.missed = true;
                        this.nitro = Math.min(PLAYER_CONFIG.MAX_NITRO, this.nitro + CONFIG.COLLISION.NEAR_MISS.NITRO_REWARD);
                    }
                }

                if (dx < CONFIG.COLLISION.CRASH.WIDTH && dy < CONFIG.COLLISION.CRASH.HEIGHT) {
                    this.particles.spawn(px, py, VISUAL_CONFIG.SPARKS.COLOR, VISUAL_CONFIG.SPARKS.COUNT, VISUAL_CONFIG.SPARKS.SPEED);
                    this.ui.triggerFlash();
                    this.audio.playCrash();
                    this.hitstop = CONFIG.COLLISION.CRASH.HITSTOP;
                    this.particles.spawn(px, py, CONFIG.COLORS.RED, CONFIG.COLLISION.CRASH.PARTICLE_COUNT, CONFIG.COLLISION.CRASH.PARTICLE_SPEED);
                    this.saveHighScore(this.score);
                    this.crashTimer = setTimeout(() => {
                        if (this.state === STATE.PLAYING) {
                            this.state = STATE.GAMEOVER;
                            this.ui.switchState(STATE.GAMEOVER, { score: this.score, highScore: this.highScore });
                            this.audio.stop();
                        }
                    }, CONFIG.COLLISION.CRASH.DEATH_DELAY);
                }
            }
        }

        render() {
            const { ctx } = this;
            ctx.clearRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
            ctx.save();
            if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
            if (this.cameraScale !== 1.0) {
                const cx = VIEW.WIDTH / 2, cy = PLAYER_CONFIG.Y_POS;
                ctx.translate(cx, cy); ctx.scale(this.cameraScale, this.cameraScale); ctx.translate(-cx, -cy);
            }

            ctx.fillStyle = CONFIG.COLORS.ROAD_BASE;
            ctx.fillRect(0, 0, VIEW.WIDTH, VIEW.HEIGHT);
            const marginX = CONFIG.ROAD_MARGIN;
            ctx.fillStyle = CONFIG.ROAD_COLOR;
            ctx.fillRect(marginX, 0, CONFIG.LANE_COUNT * CONFIG.LANE_WIDTH, VIEW.HEIGHT);

            ctx.strokeStyle = CONFIG.GRID_COLOR;
            ctx.lineWidth = CONFIG.GRID.LINE_WIDTH;
            for (let i = -1; i <= 10; i++) {
                const y = (i * CONFIG.GRID.SPACING + (this.offset % CONFIG.GRID.SPACING));
                ctx.beginPath(); ctx.moveTo(marginX, y); ctx.lineTo(VIEW.WIDTH - marginX, y); ctx.stroke();
            }

            for (let i = 0; i <= CONFIG.LANE_COUNT; i++) {
                const x = marginX + i * CONFIG.LANE_WIDTH;
                ctx.beginPath();
                ctx.strokeStyle = (i === 0 || i === CONFIG.LANE_COUNT) ? CONFIG.COLORS.CYAN : CONFIG.COLORS.LANE_LINE;
                ctx.lineWidth = (i === 0 || i === CONFIG.LANE_COUNT) ? 4 : 2;
                ctx.moveTo(x, 0); ctx.lineTo(x, VIEW.HEIGHT); ctx.stroke();
            }

            if (this.player.nitroActive) {
                ctx.strokeStyle = CONFIG.COLORS.NITRO_LINE;
                ctx.lineWidth = 2;
                for (let i = 0; i < 20; i++) {
                    const x = Math.random() * VIEW.WIDTH, y = Math.random() * VIEW.HEIGHT, len = 50 + Math.random() * 100;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
                }
            }

            if (this.player.trail.length > 1) {
                ctx.save();
                this.player.trail.forEach((pos, i) => {
                    ctx.globalAlpha = i / this.player.trail.length * 0.3;
                    this.drawCarBody({ x: pos.x, y: pos.y, color: CONFIG.COLORS.MAGENTA }, true, true);
                });
                ctx.restore();
            }

            this.trafficPool.forEach(c => { if (c.active) this.drawCarBody(c); });
            this.drawCarBody(null, true);
            this.particles.draw(ctx);
            ctx.restore();
        }

        drawCarBody(car, isPlayer = false, isGhost = false) {
            const { ctx } = this;
            const lx = isPlayer ? (isGhost ? car.x : this.player.x) : car.x;
            const ly = isPlayer ? (isGhost ? car.y : PLAYER_CONFIG.Y_POS) : car.logicalY;
            const w = isPlayer ? PLAYER_CONFIG.WIDTH : TRAFFIC_CONFIG.WIDTH;
            const h = isPlayer ? PLAYER_CONFIG.HEIGHT : TRAFFIC_CONFIG.HEIGHT;
            const x = -w / 2, y = -h / 2;

            ctx.save();
            ctx.translate(lx, ly);

            if (isPlayer && !isGhost) {
                ctx.rotate(this.player.tilt * Math.PI / 180);
                
                // 1. UNDERGLOW
                const ugColor = this.player.nitroActive ? CONFIG.COLORS.MAGENTA : CONFIG.COLORS.CYAN;
                const ugPulse = 15 + Math.sin(this.player.underglowPulse) * 10;
                ctx.shadowBlur = ugPulse;
                ctx.shadowColor = ugColor;
                ctx.fillStyle = ugColor + '44';
                ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
            }

            if (isGhost) {
                ctx.fillStyle = CONFIG.COLORS.MAGENTA;
                ctx.globalAlpha = car.alpha || 0.3;
                ctx.fillRect(x, y, w, h);
                ctx.restore();
                return;
            }

            // 2. CHASSIS GLOW
            if (isPlayer) {
                ctx.shadowBlur = VISUAL_CONFIG.PLAYER.GLOW_STRENGTH * this.player.glowIntensity;
                ctx.shadowColor = this.player.nitroActive ? CONFIG.COLORS.MAGENTA : CONFIG.COLORS.CYAN;
            } else {
                ctx.shadowBlur = 5;
                ctx.shadowColor = car.color;
            }

            // 3. MAIN BODY
            ctx.fillStyle = isPlayer ? (this.player.nitroActive ? CONFIG.COLORS.MAGENTA : CONFIG.COLORS.PLAYER) : car.color;
            ctx.fillRect(x, y, w, h);
            
            // Cockpit / Detail
            ctx.fillStyle = '#000';
            ctx.fillRect(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.25);
            ctx.fillRect(x + w * 0.15, y + h * 0.6, w * 0.7, h * 0.15);

            if (isPlayer) {
                // Headlights
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#fff';
                ctx.fillRect(x + 5, y - 5, 15, 6);
                ctx.fillRect(x + w - 20, y - 5, 15, 6);

                // 4. EXHAUST FLAME ANIMATION
                if (this.player.speed > 100) {
                    const flameLen = (this.player.speed / 1000) * 80 * (this.player.nitroActive ? 2 : 1);
                    const flicker = Math.random() * 15;
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = this.player.nitroActive ? CONFIG.COLORS.MAGENTA : CONFIG.COLORS.YELLOW;
                    ctx.fillStyle = this.player.nitroActive ? CONFIG.COLORS.MAGENTA : CONFIG.COLORS.YELLOW;
                    ctx.fillRect(x + w * 0.2, y + h - 5, w * 0.2, flameLen + flicker);
                    ctx.fillRect(x + w * 0.6, y + h - 5, w * 0.2, flameLen + flicker);
                }
            } else {
                // Tail lights for traffic
                ctx.fillStyle = CONFIG.COLORS.RED;
                ctx.fillRect(x + 5, y + h - 2, 12, 5);
                ctx.fillRect(x + w - 17, y + h - 2, 12, 5);
            }

            ctx.restore();
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
