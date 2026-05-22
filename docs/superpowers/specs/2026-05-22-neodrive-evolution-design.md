# Design Spec: NeoDrive Evolution

## 1. Overview
Enhance the NeoDrive Simulator with dynamic difficulty, synchronized physics-based UI, and refined gameplay mechanics to provide a more challenging and realistic "cyber-racer" experience.

## 2. Core Improvements

### 2.1 Dynamic Difficulty Scaling
- **Intensity Factor:** A global `intensity` value (0.0 to 1.0) calculated as `min(1.0, score / 100000)`.
- **Speed Scaling:** Traffic and player max speed scale by up to 1.5x at max intensity.
- **Traffic Density:** Spawn intervals decrease from 900ms to 500ms based on intensity.
- **Lane Switching:** At intensity > 0.5, traffic cars have a chance to switch lanes to block the player.

### 2.2 Physics & Speedometer Synchronization
- **Linear Acceleration:** Replace force-based acceleration with a constant `ACCEL` value for predictable handling.
- **UI Sync:** Remove `displayedSpeed` interpolation; the speedometer will map `player.speed` (0-1000) directly to a display value (0-320 KM/H).
- **Responsive Braking:** Significantly increase braking friction for immediate deceleration feedback.

### 2.3 Collision & Gameplay Refinement
- **Surgical Collisions:** Shrink collision hitboxes to match car visuals more closely, reducing "ghost" crashes.
- **Near Miss Overhaul:** Reward near misses with a temporary score multiplier and a small nitro boost.
- **Responsive Controls:** Ensure touch and keyboard inputs have identical sensitivity curves.

## 3. Technical Implementation

### 3.1 Physics Update
```javascript
// Current exponential logic
const force = targetAccel - (this.player.speed * PLAYER_CONFIG.FRICTION);
this.player.speed += force * step;

// New linear logic
if (targetAccel > 0) {
    this.player.speed = Math.min(this.player.speed + ACCEL * step, MAX_SPEED);
} else {
    this.player.speed = Math.max(this.player.speed - BRAKE_FORCE * step, 0);
}
```

### 3.2 Difficulty Integration
Add a `getDifficulty()` method to `GameController` that returns the `intensity` factor, influencing `spawnTimer` and `traffic.speed`.

## 4. Success Criteria
1. Speedometer reflects car movement 1:1 without lag or exponential jumps.
2. Gameplay becomes noticeably faster and more crowded as the score increases.
3. Collisions feel "fair" (no crashes when cars clearly don't touch).
