# Dynamic Difficulty Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement lane-switching traffic, player max speed scaling, and centralized difficulty configuration.

**Architecture:** Use a new `DIFFICULTY_CONFIG` object for constants. Enhance `TrafficCar` with smooth horizontal interpolation and blocking logic. Update player physics to scale `MAX_SPEED` with intensity.

**Tech Stack:** Vanilla JavaScript.

---

### Task 1: Difficulty Configuration

**Files:**
- Modify: `script.js:30-40`

- [ ] **Step 1: Add DIFFICULTY_CONFIG**

```javascript
    const DIFFICULTY_CONFIG = {
        MAX_INTENSITY_SCORE: 100000,
        SPEED_SCALING_FACTOR: 1.5,
        SPAWN_INTERVAL: { MAX: 900, MIN: 500 },
        LANE_SWITCH: {
            INTENSITY_THRESHOLD: 0.5,
            CHANCE: 0.5,      // Chance per second
            COOLDOWN: 2.0     // Seconds between switches
        }
    };
```

- [ ] **Step 2: Refactor GameController.getDifficulty**

```javascript
        getDifficulty() {
            return Math.min(1.0, this.score / DIFFICULTY_CONFIG.MAX_INTENSITY_SCORE);
        }
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: add centralized difficulty configuration"
```

---

### Task 2: Enhance TrafficCar Properties

**Files:**
- Modify: `script.js:210-230`

- [ ] **Step 1: Update TrafficCar.reset and TrafficCar.spawn**

```javascript
    class TrafficCar {
        constructor() { this.reset(); }
        reset() {
            this.lane = Math.floor(Math.random() * CONFIG.LANE_COUNT);
            this.logicalY = -250;
            this.x = undefined; // Will be initialized on first update or spawn
            this.speed = 120 + Math.random() * 180;
            this.color = TRAFFIC_CONFIG.COLORS[Math.floor(Math.random() * 4)];
            this.active = false;
            this.missed = false;
            this.switchCooldown = 0;
        }
        spawn() {
            this.lane = Math.floor(Math.random() * CONFIG.LANE_COUNT);
            this.logicalY = -250;
            this.active = true;
            this.missed = false;
            this.switchCooldown = Math.random() * 2; // Random initial cooldown
            const marginX = CONFIG.ROAD_MARGIN;
            this.x = marginX + this.lane * CONFIG.LANE_WIDTH + CONFIG.LANE_WIDTH / 2;
        }
```

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "refactor: add x and switchCooldown to TrafficCar"
```

---

### Task 3: Implement Traffic Lane Switching

**Files:**
- Modify: `script.js:231-240`

- [ ] **Step 1: Update TrafficCar.update**

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
            this.x = lerp(this.x, targetX, dt * 5);

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

            if (this.logicalY > 1200 || this.logicalY < -600) this.active = false;
        }
```

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "feat: implement traffic lane switching and blocking logic"
```

---

### Task 4: Update GameController Logic

**Files:**
- Modify: `script.js:330-360`

- [ ] **Step 1: Update Traffic update and Spawn scaling in GameController.update**

```javascript
            // Scale spawn timer
            this.spawnTimer += dt * 1000;
            const spawnInterval = DIFFICULTY_CONFIG.SPAWN_INTERVAL.MAX - (difficulty * (DIFFICULTY_CONFIG.SPAWN_INTERVAL.MAX - DIFFICULTY_CONFIG.SPAWN_INTERVAL.MIN));
            if (this.spawnTimer > spawnInterval) {
                const car = this.trafficPool.find(c => !c.active);
                if (car) { car.spawn(); this.spawnTimer = 0; }
            }
            this.trafficPool.forEach(c => c.update(dt, this.player.speed, difficulty, this.player.x));
```

- [ ] **Step 2: Update Player Speed scaling in GameController.update**

```javascript
            const PHYSICS_STEP = 1 / 120;
            let remaining = dt;
            const maxSpeed = PLAYER_CONFIG.MAX_SPEED * (1 + difficulty * (DIFFICULTY_CONFIG.SPEED_SCALING_FACTOR - 1));
            
            while (remaining > 0) {
                const step = Math.min(remaining, PHYSICS_STEP);
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
```

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat: scale player max speed and spawn interval by intensity"
```

---

### Task 5: Final Rendering and UI Fixes

**Files:**
- Modify: `script.js:460-470`

- [ ] **Step 1: Update drawCarBody to use car.x**

```javascript
        drawCarBody(car, isPlayer = false) {
            const { ctx } = this;
            const lx = isPlayer ? this.player.x : car.x;
            const ly = isPlayer ? PLAYER_CONFIG.Y_POS : car.logicalY;
```

- [ ] **Step 2: Commit**

```bash
git add script.js
git commit -m "fix: use TrafficCar.x for rendering to support smooth lane changes"
```
