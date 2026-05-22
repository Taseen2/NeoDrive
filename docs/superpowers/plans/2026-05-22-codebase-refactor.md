# Codebase Refactor & Performance Optimization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the NeoDrive Simulator codebase to professional senior-level standards, removing bloat and redundancy while preserving all features and the modern UI exactly as they are.

**Architecture:** We will unify the fragmented configuration objects into a single hierarchical structure, extract visual logic from the core game loop into dedicated methods, and modernize the CSS using CSS custom properties and DRY principles.

**Tech Stack:** Vanilla JavaScript (ES6+), Modern CSS3, Semantic HTML5.

---

### Task 1: Unified Configuration & Architecture Refactor

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Merge all configuration objects**
Consolidate `VIEW`, `CONFIG`, `DIFFICULTY_CONFIG`, `GAUGE_CONFIG`, `VISUAL_CONFIG`, `PLAYER_CONFIG`, and `TRAFFIC_CONFIG` into a single `ENGINE_CONFIG` hierarchy.

- [ ] **Step 2: Implement a Base Entity class**
Extract common logic (x, y, width, height) from `TrafficCar` and internal player representation into a reusable structure to reduce boilerplate.

- [ ] **Step 3: Refactor GameController class structure**
Organize methods into groups: Initialization, Core Logic, Visual Processing, and Input Handling.

---

### Task 2: Logic Consolidation & Visual Processing

**Files:**
- Modify: `script.js`

- [ ] **Step 1: Extract visual update logic**
Move the player visual updates (tilt, underglow, glow intensity) from `update(dt)` to a dedicated `updateVisuals(dt)` method.

- [ ] **Step 2: Simplify State Management**
Refactor `switchState` to use a more data-driven approach, reducing nested `if/else` blocks and repetitive DOM manipulation.

- [ ] **Step 3: Optimize Render Loop**
Cache frequently used context properties and avoid redundant `ctx.save()/restore()` calls where possible. Simplify `drawCarBody` to handle both player and traffic car rendering more efficiently.

---

### Task 3: CSS & HTML Modernization

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Semantic HTML Cleanup**
Ensure `index.html` uses appropriate tags (`main`, `section`, `nav`) and remove redundant wrappers that don't serve a layout or visual purpose.

- [ ] **Step 2: DRY CSS Refactor**
Consolidate repeated rules (like glass effects, blurs, and neon glows) into shared CSS classes or mixin-like variable sets. Optimize animation performance using `will-change` where appropriate.

- [ ] **Step 3: Global Variables Audit**
Ensure all colors and layout constants are driven by `:root` variables in `style.css`, perfectly synced with the values in `script.js`.

---

### Task 4: Final Polish & Verification

- [ ] **Step 1: Remove dead code**
Search for and delete all commented-out code, unused variables, and abandoned event listeners identified during the refactor.

- [ ] **Step 2: Verify functionality**
Perform a full regression check: movement, nitro, difficulty scaling, game over, reboot, and high-speed visuals.

- [ ] **Step 3: Performance Check**
Ensure frame rates are stable and there are no memory leaks from the refactored loop.
