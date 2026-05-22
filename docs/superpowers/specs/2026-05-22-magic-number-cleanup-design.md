# Design Document - Magic Number Cleanup

Parameterize the NeoDrive Simulator engine by moving literal "magic numbers" into centralized configuration objects.

## Goals
- Remove all literal magic numbers from implementation logic.
- Centralize game balance and physics parameters in `CONFIG`, `PLAYER_CONFIG`, and `TRAFFIC_CONFIG`.
- Improve maintainability and ease of tuning.

## Proposed Changes

### Configuration Additions

#### `CONFIG` Object
- `PHYSICS_STEP`: `1 / 120` (Fixed physics time step)
- `ROAD_SAFETY_MARGIN`: `50` (Padding from road edges)
- `SCORE_SCALING`: `10` (Divisor for score calculation from speed)
- `COLLISION.NEAR_MISS.SCORE_BASE`: `500` (Base score for near miss)
- `COLLISION.CRASH.PARTICLE_SPEED`: `15` (Initial speed of crash particles)

#### `PLAYER_CONFIG` Object
- `NITRO_CONSUMPTION`: `40` (Nitro drained per second)
- `NITRO_REGEN`: `12` (Nitro recharged per second)
- `MIN_SPEED_FOR_TURN`: `200` (Speed at which turning becomes full speed)

#### `TRAFFIC_CONFIG` Object
- `INITIAL_Y`: `-250` (Spawn position above view)
- `DESPAWN_Y_BOTTOM`: `1200` (Despawn threshold below view)
- `DESPAWN_Y_TOP`: `-600` (Despawn threshold above view)
- `X_SMOOTHING`: `5` (Lerp factor for lane switching)
- `BASE_SPEED_MIN`: `120` (Minimum base traffic speed)
- `BASE_SPEED_VAR`: `180` (Variance in traffic speed)

### Implementation Updates

- **`TrafficCar`**: Use `TRAFFIC_CONFIG` constants in `reset`, `spawn`, and `update`.
- **`GameController.update`**:
    - Use `PLAYER_CONFIG.NITRO_CONSUMPTION` and `NITRO_REGEN`.
    - Use `PLAYER_CONFIG.MAX_NITRO` instead of literal `100`.
    - Use `CONFIG.PHYSICS_STEP`.
    - Use `PLAYER_CONFIG.MIN_SPEED_FOR_TURN`.
    - Use `CONFIG.ROAD_SAFETY_MARGIN`.
    - Use `CONFIG.SCORE_SCALING`.
- **`GameController.checkCollisions`**:
    - Use `CONFIG.COLLISION.NEAR_MISS.SCORE_BASE`.
    - Use `PLAYER_CONFIG.MAX_NITRO` instead of literal `100`.
    - Use `CONFIG.COLLISION.CRASH.PARTICLE_SPEED`.

## Verification Plan
- **Manual Playtest**: Ensure nitro drain/regen feels identical.
- **Logic Check**: Verify lane switching smoothing and traffic spawning/despawning still work.
- **Score Check**: Ensure score still increments correctly based on speed.
