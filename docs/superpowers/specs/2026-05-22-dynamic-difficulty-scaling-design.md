# Design Spec: Dynamic Difficulty Scaling

## 1. Overview
Implement missing dynamic difficulty scaling features in NeoDrive Simulator to enhance gameplay challenge as the score increases. This includes lane-switching traffic, player speed scaling, and refactoring magic numbers into a central configuration.

## 2. Core Improvements

### 2.1 Difficulty Configuration
Introduce a `DIFFICULTY_CONFIG` object to centralize scaling constants, replacing magic numbers in the logic.

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

### 2.2 Traffic Lane Switching
Enhance `TrafficCar` to move horizontally and block the player at high intensity.
- **Smooth Transition:** Add `this.x` to `TrafficCar`. Use `lerp` to move `this.x` towards the target lane center.
- **Blocking Logic:** If `intensity > 0.5`, traffic cars ahead of the player will have a chance to switch to the player's lane.
- **Cooldown:** Implement a `switchCooldown` to ensure cars don't switch lanes too frequently or jitter.

### 2.3 Player Max Speed Scaling
Update the player's physics logic to scale `MAX_SPEED` based on current intensity.
- **Dynamic Cap:** `currentMaxSpeed = PLAYER_CONFIG.MAX_SPEED * (1 + difficulty * 0.5)`.
- **Acceleration:** Ensure linear acceleration respects the dynamic speed cap.

### 2.4 Magic Number Refactoring
- Update `getDifficulty()` to use `DIFFICULTY_CONFIG.MAX_INTENSITY_SCORE`.
- Update traffic spawning logic to use `DIFFICULTY_CONFIG.SPAWN_INTERVAL`.
- Update traffic speed scaling to use `DIFFICULTY_CONFIG.SPEED_SCALING_FACTOR`.

## 3. Technical Implementation

### 3.1 TrafficCar Update
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
    this.x = lerp(this.x, targetX, dt * 5); // 5 is the smoothing factor

    // Lane Switching Logic
    if (difficulty > DIFFICULTY_CONFIG.LANE_SWITCH.INTENSITY_THRESHOLD) {
        this.switchCooldown -= dt;
        if (this.switchCooldown <= 0 && this.logicalY < 800 && this.logicalY > -200) {
            if (Math.random() < DIFFICULTY_CONFIG.LANE_SWITCH.CHANCE * dt) {
                const playerLane = Math.floor((playerX - marginX) / CONFIG.LANE_WIDTH);
                if (playerLane !== this.lane) {
                    const dir = playerLane > this.lane ? 1 : -1;
                    this.lane += dir;
                    this.switchCooldown = DIFFICULTY_CONFIG.LANE_SWITCH.COOLDOWN;
                }
            }
        }
    }

    if (this.logicalY > 1200 || this.logicalY < -600) this.active = false;
}
```

### 3.2 GameController Update
```javascript
const maxSpeed = PLAYER_CONFIG.MAX_SPEED * (1 + difficulty * (DIFFICULTY_CONFIG.SPEED_SCALING_FACTOR - 1));
if (isMoving) {
    const accel = this.player.nitroActive ? PLAYER_CONFIG.NITRO_ACCEL : PLAYER_CONFIG.ACCEL;
    this.player.speed = Math.min(this.player.speed + accel * step, maxSpeed);
}
```

## 4. Success Criteria
1. Traffic cars switch lanes smoothly when the score exceeds 50,000.
2. Player speed can exceed the base `MAX_SPEED` (1000) as score increases.
3. No magic numbers related to difficulty remain in the core logic.
4. UI Speedometer correctly displays the increased speeds.
