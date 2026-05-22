# NeoDrive Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform NeoDrive Simulator into a high-intensity cyber-racer with linear physics, score-based difficulty scaling, and refined collision mechanics.

**Architecture:** We will modify the `GameController` to manage a global difficulty state, refactor the `PLAYER_CONFIG` physics, and sync the `UIHandler` directly to the physics engine.

**Tech Stack:** Vanilla JavaScript (Canvas API), CSS3 (Cyberpunk aesthetic).

---

### Task 1: Linear Physics & Speedometer Synchronization

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Update PLAYER_CONFIG constants**
Update `PLAYER_CONFIG` to include linear `ACCEL` and `BRAKE_FORCE` instead of just a generic base.

```javascript
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
```

- [ ] **Step 2: Refactor Physics Update Logic**
Change the `update(dt)` loop in `GameController` to use linear math.

```javascript
            // In GameController.update(dt)
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
```

- [ ] **Step 3: Sync Speedometer UI**
Remove `displayedSpeed` interpolation from `UIHandler.update` and map `player.speed` directly.

```javascript
        // In UIHandler.update
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
            // ... rest of nitro/combo code ...
        }
```

- [ ] **Step 4: Commit**
```bash
git add script.js
git commit -m "feat: implement linear physics and synced speedometer"
```

---

### Task 2: Dynamic Difficulty Scaling

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Add Intensity Logic**
Add `getDifficulty()` to `GameController` and use it to scale game parameters.

```javascript
        getDifficulty() {
            return Math.min(1.0, this.score / 100000);
        }

        update(dt) {
            // ... inside update ...
            const difficulty = this.getDifficulty();
            
            // Scale spawn timer
            this.spawnTimer += dt * 1000;
            const spawnInterval = 900 - (difficulty * 400); // Ramps from 900ms to 500ms
            if (this.spawnTimer > spawnInterval) {
                const car = this.trafficPool.find(c => !c.active);
                if (car) { car.spawn(); this.spawnTimer = 0; }
            }
        }
```

- [ ] **Step 2: Scale Traffic Speed**
Update `TrafficCar.update` to account for difficulty.

```javascript
    class TrafficCar {
        // ...
        update(dt, playerSpeed, difficulty) {
            if (!this.active) return;
            const difficultyMultiplier = 1 + (difficulty * 0.5); // Up to 1.5x speed
            this.logicalY += (playerSpeed - (this.speed * difficultyMultiplier)) * dt;
            if (this.logicalY > 1200 || this.logicalY < -600) this.active = false;
        }
    }
```

- [ ] **Step 3: Commit**
```bash
git add script.js
git commit -m "feat: add score-based difficulty scaling"
```

---

### Task 3: Collision Box Refinement & Near Miss Boost

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Adjust Hitbox Logic**
Modify `checkCollisions` in `GameController` for tighter boxes.

```javascript
                // Current: dx < 110 && dy < 100 for near miss
                // New logic: dx < 90 && dy < 95
                if (dx < 90 && dy < 95 && !c.missed) {
                    if (dx >= 55) { // Narrower overlap threshold
                        this.score += 500 * this.combo;
                        this.combo++;
                        this.ui.showNearMiss();
                        this.audio.playNearMiss();
                        c.missed = true;
                        this.nitro = Math.min(100, this.nitro + 20); // Increased boost
                    }
                }

                // Current: dx < 65 && dy < 85 for crash
                // New: dx < 50 && dy < 80
                if (dx < 50 && dy < 80) {
                    // crash logic...
                }
```

- [ ] **Step 2: Commit**
```bash
git add script.js
git commit -m "perf: refine collision hitboxes and improve near-miss rewards"
```
