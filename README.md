# 🏎️ NeoDrive Simulator

A high-intensity, cyberpunk-themed 2D arcade racing simulation built with Vanilla JavaScript and Canvas API. 

![NeoDrive Screenshot](docs/screenshots/main_menu.png) *(Note: Add your screenshot here!)*

## 🌟 Key Features

- **🚀 Linear Physics Engine:** Smooth, predictable car handling with realistic acceleration and sharp braking logic.
- **📈 Dynamic Difficulty Scaling:** The game intensity (traffic speed, spawn rates, and your own max speed) ramps up continuously based on your score.
- **🤖 Aggressive Traffic AI:** High-intensity play triggers lane-switching traffic that actively attempts to block your path.
- **⚡ Nitro Overdrive:** Harness plasma-based boosts with cinematic FOV warping, chromatic aberration glitches, and motion trails.
- **📊 High-Performance HUD:** A responsive, circular neon speedometer synchronized 1:1 with the physics engine.
- **🎨 Cinematic Visuals:** Features include steering-based car tilting, animated underglow, flickering plasma exhaust, and collision sparks.
- **📱 Fully Responsive:** Optimized for all screen resolutions with adaptive UI and touch controls for mobile.

## 🕹️ How to Play

### Keyboard Controls
- **W** / **Up Arrow**: Thrust (Accelerate)
- **S** / **Down Arrow**: Brake (Decelerate)
- **A** / **Left Arrow**: Steer Left
- **D** / **Right Arrow**: Steer Right
- **SHIFT**: Nitro Overdrive (Requires boost charge)
- **P** / **ESC**: Toggle Pause
- **ENTER**: Start / Restart Game / Resume (from Pause)

### Mobile Controls
- **Touch Screen Edges**: Steer Left/Right
- **BOOST Button**: Activate Nitro
- **BRAKE Button**: Decelerate
- *Auto-acceleration is active on mobile.*

## 🛠️ Technical Overview

The project follows a clean, modular architecture inspired by senior-level engineering standards.

- **Unified Configuration:** The entire engine is governed by a central `ENGINE_CONFIG` hierarchy for easy balancing.
- **Physics Sub-Steering:** Movement logic is executed in a high-frequency sub-loop (120Hz) to ensure frame-rate independent gameplay.
- **Object-Oriented Design:** Uses specialized classes (`Player`, `TrafficCar`, `ParticleSystem`) inheriting from a `BaseEntity` structure.
- **UI Caching:** The HUD uses a data-caching system to minimize expensive DOM manipulations and maintain high FPS.
- **GPU Acceleration:** Heavy visual effects utilize `will-change` and hardware-accelerated CSS transforms.

## 🚀 Getting Started

1. Clone this repository.
2. Open `index.html` in any modern web browser.
3. Initiate drive sequence.

---

*Developed with passion for the cyberpunk aesthetic and high-performance web engineering.*
