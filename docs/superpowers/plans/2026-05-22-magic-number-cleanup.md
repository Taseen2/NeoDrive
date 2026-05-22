# Magic Number Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parameterize the NeoDrive Simulator engine by moving literal "magic numbers" into centralized configuration objects in `script.js`.

**Architecture:** Move constants from implementation logic into `CONFIG`, `PLAYER_CONFIG`, and `TRAFFIC_CONFIG` objects.

**Tech Stack:** JavaScript (ES6)

---

### Task 1: Update Configuration Objects

**Files:**
- Modify: `script.js:15-60`

- [ ] **Step 1: Update `CONFIG`, `PLAYER_CONFIG`, and `TRAFFIC_CONFIG` with new parameters**

```javascript
    const CONFIG = {
        LANE_COUNT: 4,
        LANE_WIDTH: 150,
        ROAD_COLOR: '#080808',
        GRID_COLOR: 'rgba(0, 243, 255, 0.15)',
        PHYSICS_STEP: 1 / 120,
        ROAD_SAFETY_MARGIN: 50,
        SCORE_SCALING: 10,
        COLORS: {
            CYAN: '#00f3ff',
            MAGENTA: '#bc13fe',
            YELLOW: '#fffa00',
            RED: '#ff0033',
            PLAYER: '#ff0033'
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
        MAX_NITRO: 100
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
```

- [ ] **Step 2: Commit config updates**

```bash
git add script.js
git commit -m "chore: parameterize config objects"
```

### Task 2: Parameterize `TrafficCar`

**Files:**
- Modify: `script.js:250-300`

- [ ] **Step 1: Update `TrafficCar.reset` and `spawn` to use `TRAFFIC_CONFIG` constants**

```javascript
        reset() {
            this.lane = Math.floor(Math.random() * CONFIG.LANE_COUNT);
            this.logicalY = TRAFFIC_CONFIG.INITIAL_Y;
            this.x = undefined; 
            this.speed = TRAFFIC_CONFIG.BASE_SPEED_MIN + Math.random() * TRAFFIC_CONFIG.BASE_SPEED_VAR;
            this.color = TRAFFIC_CONFIG.COLORS[Math.floor(Math.random() * 4)];
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
```

- [ ] **Step 2: Update `TrafficCar.update` to use `TRAFFIC_CONFIG` constants**

```javascript
        update(dt, playerSpeed, difficulty, playerX) {
            if (!this.active) return;
            
            // Y Movement
            const difficultyMultiplier = 1 + (difficulty * (DIFFICULTY_CONFIG.SPEED_SCALING_FACTOR - 1));
            this.logicalY += (playerSpeed - (this.speed * difficultyMultiplier)) * dt;
            
            // X Movement (Smoothing)
            const marginX = CONFIG.ROAD_MARGIN;
            const targetX = marginX + this.lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
            if (this.x === undefined) this.x = targetX;
            this.x = lerp(this.x, targetX, dt * TRAFFIC_CONFIG.X_SMOOTHING);

            // Lane Switching Logic
            if (difficulty > DIFFICULTY_CONFIG.LANE_SWITCH.INTENSITY_THRESHOLD) {
                this.switchCooldown -= dt;
                if (this.switchCooldown <= 0 && this.logicalY < 800 && this.logicalY > -200) {
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
```

- [ ] **Step 3: Commit `TrafficCar` parameterization**

```bash
git add script.js
git commit -m "refactor(traffic): use traffic config constants"
```

### Task 3: Parameterize `GameController.update`

**Files:**
- Modify: `script.js:370-430`

- [ ] **Step 1: Use `PLAYER_CONFIG` and `CONFIG` constants in `GameController.update`**

```javascript
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
            } else {
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

            const margin = CONFIG.ROAD_MARGIN + CONFIG.ROAD_SAFETY_MARGIN;
            this.player.x = Math.max(margin, Math.min(this.player.x, VIEW.WIDTH - margin));

            this.offset += this.player.speed * dt;

            // Scale spawn timer
            this.spawnTimer += dt * 1000;
            const spawnInterval = DIFFICULTY_CONFIG.SPAWN_INTERVAL.MAX - (difficulty * (DIFFICULTY_CONFIG.SPAWN_INTERVAL.MAX - DIFFICULTY_CONFIG.SPAWN_INTERVAL.MIN));
            if (this.spawnTimer > spawnInterval) {
                const car = this.trafficPool.find(c => !c.active);
                if (car) { car.spawn(); this.spawnTimer = 0; }
            }
            this.trafficPool.forEach(c => c.update(dt, this.player.speed, difficulty, this.player.x));

            if (this.player.speed > 10) this.score += (this.player.speed * dt) / CONFIG.SCORE_SCALING;
            this.checkCollisions();

            this.shake = (this.player.speed / PLAYER_CONFIG.MAX_SPEED) * 2 + (this.player.nitroActive ? 6 : 0);
            this.ui.update(this.player.speed, this.nitro, this.score, this.combo, PLAYER_CONFIG.NORMAL_MAX_SPEED, dt);
            this.audio.update(this.player.speed / PLAYER_CONFIG.MAX_SPEED, this.player.nitroActive);
        }
```

- [ ] **Step 2: Commit `GameController.update` parameterization**

```bash
git add script.js
git commit -m "refactor(game): use player and engine config constants"
```

### Task 4: Parameterize `GameController.checkCollisions` and Initialization

**Files:**
- Modify: `script.js:330, 360, 430-460`

- [ ] **Step 1: Replace literal `100` with `PLAYER_CONFIG.MAX_NITRO` in `GameController.constructor` and `start`**

```javascript
// constructor
            this.nitro = PLAYER_CONFIG.MAX_NITRO;

// start()
            this.nitro = PLAYER_CONFIG.MAX_NITRO;
```

- [ ] **Step 2: Update `GameController.checkCollisions` to use `CONFIG` constants**

```javascript
        checkCollisions() {
            const px = this.player.x;
            const py = PLAYER_CONFIG.Y_POS;
            const marginX = CONFIG.ROAD_MARGIN;

            for (const c of this.trafficPool) {
                if (!c.active) continue;
                const cx = c.x;
                const cy = c.logicalY;
                const dx = Math.abs(px - cx);
                const dy = Math.abs(py - cy);

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
```

- [ ] **Step 3: Commit final parameterization**

```bash
git add script.js
git commit -m "refactor(game): finalize magic number cleanup"
```
