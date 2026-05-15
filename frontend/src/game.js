import * as THREE from 'three';
import { Robot } from './robot.js';
import { UI } from './ui.js';
import { Cinematic } from './cinematic.js';

// ── Constants ──────────────────────────────────────────────
const GRID_COLS       = 9;
const BUBBLE_R        = 0.44;
const SPACING         = 1.05;       // center-to-center
const GRID_Z          = -10;
const GRID_TOP_Y      = 5.0;
const WALL_X          = 5.0;        // ±X bounce walls
const SHOOT_SPEED     = 16;
const SNAP_THRESHOLD  = SPACING * 1.15;
const GAMEOVER_Y      = -2.2;       // bubble y below this = game over
const CELEBRATE_SECS  = 6;

const BUBBLE_COLORS = [
  0xff4da6,  // hot pink
  0x00f0ff,  // cyan
  0xffe600,  // yellow
  0x00ff88,  // green
  0xaa44ff,  // purple
  0xff8800,  // orange
];

const CELEBRATE_MSGS = [
  'NICE ONE!', 'YESSS!', 'COMBO!', 'CLEAN!',
  'AMAZING!', "LET'S GO!", 'PERFECT!',
];

// ── Grid helpers ────────────────────────────────────────────
function gridPos(row, col) {
  // Even rows are offset half a spacing to the right (hex layout)
  const offset = (row % 2 === 0) ? SPACING * 0.5 : 0;
  const x = (col - (GRID_COLS - 1) / 2) * SPACING + offset;
  const y = GRID_TOP_Y - row * SPACING;
  return new THREE.Vector3(x, y, GRID_Z);
}

function getNeighbors(row, col) {
  const even = row % 2 === 0;
  const candidates = [
    [row - 1, even ? col - 1 : col    ],
    [row - 1, even ? col     : col + 1],
    [row,     col - 1],
    [row,     col + 1],
    [row + 1, even ? col - 1 : col    ],
    [row + 1, even ? col     : col + 1],
  ];
  return candidates.filter(([r, c]) => r >= 0 && c >= 0 && c < GRID_COLS);
}

// ── Particle ────────────────────────────────────────────────
class Particle {
  constructor(scene, position, color) {
    const geo = new THREE.SphereGeometry(0.1 + Math.random() * 0.08, 6, 4);
    const mat = new THREE.MeshPhongMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 1,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
    );
    this.life    = 0;
    this.maxLife = 0.65 + Math.random() * 0.25;
    scene.add(this.mesh);
  }

  update(dt) {
    this.life += dt;
    this.velocity.y -= 12 * dt; // gravity
    this.mesh.position.addScaledVector(this.velocity, dt);
    const t = this.life / this.maxLife;
    this.mesh.material.opacity = 1 - t;
    const s = (1 - t) * 0.9 + 0.1;
    this.mesh.scale.setScalar(s);
  }

  get dead() { return this.life >= this.maxLife; }
}

// ── Game ────────────────────────────────────────────────────
class Game {
  constructor() {
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });

    // grid[row][col] = { mesh, colorIdx } | null
    this.grid     = [];
    this.particles = [];

    // Flying bubble
    this.flying = null; // { mesh, velocity, colorIdx }

    this.currentColor = 0;
    this.nextColor    = 0;
    this.numColors    = 3;

    this.score     = 0;
    this.level     = 1;
    this.levelPts  = 0;    // points accumulated since last level-up
    this.bestScore = parseInt(localStorage.getItem('dz3d_best') || '0');

    this.celebrating    = false;
    this.celebrateTimer = 0;

    this.isPlaying = false;
    this.gameOver  = false;
    this.canShoot  = true;

    this.shotCount      = 0;
    this.poppingBubbles = [];
    this.cinematicActive = false;
    this.cinematic      = null;

    this.token    = null;
    this.username = null;

    this.mouseNDC = new THREE.Vector2(0, 0);
    this.clock    = new THREE.Clock();

    this.robot = null;
    this.ui    = null;
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x08081a);
    document.getElementById('game-canvas').appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 0);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0x334477, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 8, 3);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.4);
    fill.position.set(-5, -2, -6);
    this.scene.add(fill);
    // Accent point light aimed at the bubble grid for dynamic reflections
    const gridLight = new THREE.PointLight(0xffffff, 1.2, 18);
    gridLight.position.set(0, 4, -6);
    this.scene.add(gridLight);

    this._createStarfield();

    this.robot = new Robot(this.camera);
    this.ui    = new UI(this);
    this.cinematic = new Cinematic(() => {
      this.cinematicActive = false;
      if (this.isPlaying && !this.celebrating) this.canShoot = true;
    });

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    window.addEventListener('click', (e) => {
      // Ignore clicks on UI elements
      if (e.target !== this.renderer.domElement) return;
      this._shoot();
    });

    this._animate();
  }

  _createStarfield() {
    const geo = new THREE.BufferGeometry();
    const n   = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 240;
      pos[i*3+1] = (Math.random() - 0.5) * 240;
      pos[i*3+2] = -60 - Math.random() * 140;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true })));
  }

  // ── Auth ────────────────────────────────────────────────
  setAuth(token, username) {
    this.token    = token;
    this.username = username;
  }

  // ── Start / Reset ────────────────────────────────────────
  startGame() {
    if (this.cinematic) this.cinematic.cancel();
    this.cinematicActive = false;

    this.score     = 0;
    this.level     = 1;
    this.levelPts  = 0;
    this.numColors = 3;
    this.gameOver  = false;
    this.canShoot  = true;
    this.celebrating    = false;
    this.celebrateTimer = 0;

    this.shotCount = 0;

    // Clear particles
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];

    // Clear any mid-pop bubbles
    this.poppingBubbles.forEach(pb => this.scene.remove(pb.mesh));
    this.poppingBubbles = [];

    // Clear flying bubble
    if (this.flying) { this.scene.remove(this.flying.mesh); this.flying = null; }

    // Clear grid
    this._clearGrid();
    this._buildGrid(6);

    // Pick first two colors
    this.currentColor = this._randColor();
    this.nextColor    = this._randColor();
    this.robot.setMuzzleColor(BUBBLE_COLORS[this.currentColor]);

    this.isPlaying = true;
    this.ui.showHUD();
    this.ui.updateHUD(this.score, this.level, this.bestScore);
    this.ui.updateCurrentBubble(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);
  }

  _clearGrid() {
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell) this.scene.remove(cell.mesh);
      }
    }
    this.grid = [];
  }

  _buildGrid(numRows) {
    for (let r = 0; r < numRows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        // ~10% gaps for variety
        if (Math.random() < 0.90) {
          this._placeGridBubble(r, c, this._randColor());
        } else {
          this.grid[r][c] = null;
        }
      }
    }
  }

  _placeGridBubble(row, col, colorIdx) {
    const mesh = this._makeBubbleMesh(BUBBLE_COLORS[colorIdx], colorIdx);
    mesh.position.copy(gridPos(row, col));
    this.scene.add(mesh);
    if (!this.grid[row]) this.grid[row] = [];
    this.grid[row][col] = { mesh, colorIdx };
  }

  _makeBubbleMesh(colorHex, colorIdx = 0) {
    const emissiveIntensities = [0.10, 0.13, 0.09, 0.12, 0.08, 0.11];
    const emissive = emissiveIntensities[Math.min(colorIdx, emissiveIntensities.length - 1)];

    const geo = new THREE.SphereGeometry(BUBBLE_R, 24, 16);
    const mat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: emissive,
      roughness: 0.04,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transmission: 0.12,
      transparent: true,
      opacity: 0.90,
    });
    const sphere = new THREE.Mesh(geo, mat);

    // Small specular highlight sphere to simulate glass light reflection
    const hlGeo = new THREE.SphereGeometry(BUBBLE_R * 0.20, 8, 6);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const highlight = new THREE.Mesh(hlGeo, hlMat);
    highlight.position.set(BUBBLE_R * 0.22, BUBBLE_R * 0.28, BUBBLE_R * 0.40);

    const group = new THREE.Group();
    group.add(sphere);
    group.add(highlight);
    return group;
  }

  _randColor() {
    return Math.floor(Math.random() * this.numColors);
  }

  // ── Shoot ────────────────────────────────────────────────
  _shoot() {
    if (!this.isPlaying || !this.canShoot || this.flying || this.celebrating || this.gameOver) return;

    // Direction: from camera toward mouse position in NDC
    const dir = new THREE.Vector3(this.mouseNDC.x, this.mouseNDC.y, -1)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();

    // Start position: roughly at muzzle
    const startPos = this.robot.getMuzzleWorldPosition();

    const mesh = this._makeBubbleMesh(BUBBLE_COLORS[this.currentColor], this.currentColor);
    mesh.position.copy(startPos);
    this.scene.add(mesh);

    this.flying = {
      mesh,
      velocity: dir.multiplyScalar(SHOOT_SPEED),
      colorIdx: this.currentColor,
    };

    // Advance colors
    this.currentColor = this.nextColor;
    this.nextColor    = this._randColor();
    this.robot.setMuzzleColor(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateCurrentBubble(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);

    // Every 5 shots: cinematic robot moment
    this.shotCount++;
    if (this.shotCount >= 5) {
      this.shotCount = 0;
      this._triggerCinematic();
    }
  }

  _triggerCinematic() {
    if (this.cinematicActive) return;
    const msgs = [
      "You're on fire!", 'Keep shooting!', 'Almost there!', "Let's gooo!",
      "Don't stop now!", 'Locked in!', 'Beast mode activated!',
      'You got this!', 'Stay sharp!', 'Incredible aim!',
    ];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    this.cinematicActive = true;
    this.canShoot = false;
    this.cinematic.start(msg);
  }

  // ── Update flying bubble ─────────────────────────────────
  _updateFlying(dt) {
    if (!this.flying) return;
    const fb = this.flying;
    fb.mesh.position.addScaledVector(fb.velocity, dt);

    // Wall bounces
    if (fb.mesh.position.x > WALL_X)  { fb.mesh.position.x = WALL_X;  fb.velocity.x *= -1; }
    if (fb.mesh.position.x < -WALL_X) { fb.mesh.position.x = -WALL_X; fb.velocity.x *= -1; }

    // Check if close enough to snap
    const snap = this._findSnapPosition(fb.mesh.position);
    if (snap) {
      this._snapBubble(snap.row, snap.col, fb.colorIdx);
      this.scene.remove(fb.mesh);
      this.flying = null;
    }

    // Safety: if bubble goes too far back or forward, remove
    if (fb.mesh.position.z < -20 || fb.mesh.position.z > 2) {
      this.scene.remove(fb.mesh);
      this.flying = null;
    }
  }

  _findSnapPosition(pos) {
    const rows = this.grid.length;
    let bestDist = Infinity;
    let bestR = -1, bestC = -1;

    // Only consider positions within z-range of the grid
    if (pos.z > GRID_Z + SPACING * 2) return null;

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        // Must be empty
        if (this.grid[r] && this.grid[r][c]) continue;

        // Must be adjacent to an existing bubble (or in row 0)
        let hasNeighbor = r === 0;
        if (!hasNeighbor) {
          for (const [nr, nc] of getNeighbors(r, c)) {
            if (this.grid[nr] && this.grid[nr][nc]) { hasNeighbor = true; break; }
          }
        }
        if (!hasNeighbor) continue;

        const wp = gridPos(r, c);
        const d  = wp.distanceTo(pos);
        if (d < bestDist) { bestDist = d; bestR = r; bestC = c; }
      }
    }

    if (bestDist <= SNAP_THRESHOLD && bestR >= 0) return { row: bestR, col: bestC };
    return null;
  }

  _snapBubble(row, col, colorIdx) {
    // Ensure grid rows exist
    while (this.grid.length <= row) this.grid.push([]);
    if (!this.grid[row]) this.grid[row] = [];

    this._placeGridBubble(row, col, colorIdx);

    // Flood fill same-color connected group
    const group = this._floodFill(row, col, colorIdx);
    if (group.length >= 3) {
      // Note full rows before pop
      const fullRowsBefore = this._getFullRows();

      // Pop them — remove from grid immediately, animate visually
      for (const [r, c] of group) {
        const cell = this.grid[r][c];
        this._spawnParticles(cell.mesh.position, colorIdx, 14);
        this._addPoppingBubble(cell.mesh);
        this.grid[r][c] = null;
      }

      // Score
      const pts = (30 + (group.length - 3) * 10) * this.level;
      this._addScore(pts);

      // Check for row clears
      const fullRowsAfter  = this._getFullRows();
      const clearedRows = [...fullRowsBefore].filter(r => !fullRowsAfter.has(r));
      if (clearedRows.length > 0) {
        this._addScore(clearedRows.length * 50 * this.level);
        this._triggerCelebration();
      }

      // Remove orphaned bubbles (not connected to top)
      this._removeOrphans();
    }

    // Check game over
    this._checkGameOver();
  }

  _floodFill(startRow, startCol, colorIdx) {
    const visited = new Set();
    const result  = [];
    const stack   = [[startRow, startCol]];

    while (stack.length) {
      const [r, c] = stack.pop();
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (!this.grid[r] || !this.grid[r][c] || this.grid[r][c].colorIdx !== colorIdx) continue;

      result.push([r, c]);
      for (const [nr, nc] of getNeighbors(r, c)) {
        if (!visited.has(`${nr},${nc}`)) stack.push([nr, nc]);
      }
    }
    return result;
  }

  _getFullRows() {
    const full = new Set();
    for (let r = 0; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      let count = 0;
      for (let c = 0; c < GRID_COLS; c++) if (row[c]) count++;
      if (count === GRID_COLS) full.add(r);
    }
    return full;
  }

  _removeOrphans() {
    // Bubbles not reachable from row 0 are orphans (fall off)
    const connected = new Set();
    const stack = [];

    for (let c = 0; c < GRID_COLS; c++) {
      if (this.grid[0] && this.grid[0][c]) stack.push([0, c]);
    }

    while (stack.length) {
      const [r, c] = stack.pop();
      const key = `${r},${c}`;
      if (connected.has(key)) continue;
      if (!this.grid[r] || !this.grid[r][c]) continue;
      connected.add(key);
      for (const [nr, nc] of getNeighbors(r, c)) stack.push([nr, nc]);
    }

    for (let r = 0; r < this.grid.length; r++) {
      if (!this.grid[r]) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] && !connected.has(`${r},${c}`)) {
          const cell = this.grid[r][c];
          this._spawnParticles(cell.mesh.position, cell.colorIdx, 8);
          this._addPoppingBubble(cell.mesh);
          this.grid[r][c] = null;
        }
      }
    }
  }

  // ── Scoring / Leveling ───────────────────────────────────
  _addScore(pts) {
    this.score    += pts;
    this.levelPts += pts;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('dz3d_best', this.bestScore);
    }

    const threshold = 300 * this.level;
    if (this.levelPts >= threshold) {
      this.levelPts -= threshold;
      this._levelUp();
    }

    this.ui.updateHUD(this.score, this.level, this.bestScore);
  }

  _levelUp() {
    this.level++;
    this.numColors = Math.min(6, 2 + this.level);
    this._addGridRow();
    this.ui.updateHUD(this.score, this.level, this.bestScore);
  }

  _addGridRow() {
    // Shift all existing rows down one index and reposition their bubbles
    const newGrid = [[]];
    for (let r = 0; r < this.grid.length; r++) {
      newGrid.push(this.grid[r] || []);
    }
    this.grid = newGrid;

    // Reposition bubbles in shifted rows
    for (let r = 1; r < this.grid.length; r++) {
      const row = this.grid[r];
      if (!row) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        if (row[c]) row[c].mesh.position.copy(gridPos(r, c));
      }
    }

    // Fill new row 0
    for (let c = 0; c < GRID_COLS; c++) {
      this._placeGridBubble(0, c, this._randColor());
    }
  }

  // ── Celebration ──────────────────────────────────────────
  _triggerCelebration() {
    if (this.celebrating) return;
    this.celebrating    = true;
    this.celebrateTimer = 0;
    this.canShoot       = false;

    const msg = CELEBRATE_MSGS[Math.floor(Math.random() * CELEBRATE_MSGS.length)];
    this.robot.startCelebration();
    this.ui.showCelebration(msg);
  }

  _endCelebration() {
    this.celebrating = false;
    if (!this.cinematicActive) this.canShoot = true;
    this.robot.stopCelebration();
    this.ui.hideCelebration();
  }

  // ── Particles ────────────────────────────────────────────
  _spawnParticles(pos, colorIdx, count) {
    const color = BUBBLE_COLORS[colorIdx];
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(this.scene, pos.clone(), color));
    }
  }

  _updateParticles(dt) {
    this.particles = this.particles.filter(p => {
      p.update(dt);
      if (p.dead) { this.scene.remove(p.mesh); return false; }
      return true;
    });
  }

  _addPoppingBubble(mesh) {
    this.poppingBubbles.push({ mesh, time: 0, duration: 0.22 });
  }

  _updatePoppingBubbles(dt) {
    this.poppingBubbles = this.poppingBubbles.filter(pb => {
      pb.time += dt;
      const t = pb.time / pb.duration;
      if (t >= 1) { this.scene.remove(pb.mesh); return false; }
      // Grow slightly then shrink to nothing
      const scale = t < 0.35
        ? 1 + (t / 0.35) * 0.32
        : 1.32 * (1 - (t - 0.35) / 0.65);
      pb.mesh.scale.setScalar(Math.max(0, scale));
      return true;
    });
  }

  // ── Game Over ────────────────────────────────────────────
  _checkGameOver() {
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell && cell.mesh.position.y < GAMEOVER_Y) {
          this._triggerGameOver();
          return;
        }
      }
    }
  }

  async _triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver  = true;
    this.isPlaying = false;
    this.canShoot  = false;

    let saved = false;
    if (this.token) {
      try {
        const res = await fetch('http://localhost:4001/api/scores', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
          },
          body: JSON.stringify({ score: this.score, level: this.level }),
        });
        saved = res.ok;
      } catch { /* no-op */ }
    }

    this.ui.showGameOver(this.score, this.level, saved);
  }

  // ── Resize / RAF ─────────────────────────────────────────
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.isPlaying) {
      this._updateFlying(dt);
      this._updateParticles(dt);
      this._updatePoppingBubbles(dt);

      if (this.celebrating) {
        this.celebrateTimer += dt;
        if (this.celebrateTimer >= CELEBRATE_SECS) this._endCelebration();
      }
    }

    if (this.robot) this.robot.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

// ── Bootstrap ───────────────────────────────────────────────
const game = new Game();
game.init();
