import * as THREE from 'three';
import { Robot } from './robot.js';
import { UI } from './ui.js';
import { Cinematic } from './cinematic.js';
import { LEVELS, TOTAL_LEVELS, makeRng } from './levels.js';

// ── Constants ──────────────────────────────────────────────
const GRID_COLS      = 9;
const BUBBLE_R       = 0.44;
const SPACING        = 1.05;
const GRID_Z         = -10;
const GRID_TOP_Y     = 5.0;
const WALL_X         = 5.0;
const SHOOT_SPEED    = 16;
const SNAP_THRESHOLD = SPACING * 1.15;
const GAMEOVER_Y     = -2.2;
const CELEBRATE_SECS = 6;

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
      color, emissive: color, emissiveIntensity: 0.6,
      transparent: true, opacity: 1,
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
    this.velocity.y -= 12 * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);
    const t = this.life / this.maxLife;
    this.mesh.material.opacity = 1 - t;
    this.mesh.scale.setScalar(Math.max(0, (1 - t) * 0.9 + 0.1));
  }

  get dead() { return this.life >= this.maxLife; }
}

// ── Game ────────────────────────────────────────────────────
class Game {
  constructor() {
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });

    this.grid     = [];
    this.particles = [];
    this.flying   = null;

    this.currentColor = 0;
    this.nextColor    = 0;
    this.numColors    = 3;

    // ── Level state ──
    this.currentLevelNum    = 1;
    this.score              = 0;      // cumulative across all levels
    this.levelScore         = 0;      // score earned in current level only
    this.levelShots         = 0;      // shots fired in current level
    this.initialBubbleCount = 0;      // bubbles at level start (for star rating)
    this.bestScore          = parseInt(localStorage.getItem('dz3d_best') || '0');

    // levelProgress[i] = true means level i+1 is completed
    const saved = localStorage.getItem('dz3d_progress');
    this.levelProgress = saved ? JSON.parse(saved) : Array(TOTAL_LEVELS).fill(false);

    this.celebrating    = false;
    this.celebrateTimer = 0;

    this.isPlaying    = false;
    this.gameOver     = false;
    this.levelComplete = false;
    this.canShoot     = true;

    this.shotCount       = 0;
    this.poppingBubbles  = [];
    this.cinematicActive = false;
    this.cinematic       = null;

    this.token    = null;
    this.username = null;

    this.mouseNDC = new THREE.Vector2(0, 0);
    this.clock    = new THREE.Clock();
    this.robot    = null;
    this.ui       = null;
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x08081a);
    document.getElementById('game-canvas').appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 0);

    this.scene.add(new THREE.AmbientLight(0x334477, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 8, 3);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4488ff, 0.4);
    fill.position.set(-5, -2, -6);
    this.scene.add(fill);
    const gridLight = new THREE.PointLight(0xffffff, 1.2, 18);
    gridLight.position.set(0, 4, -6);
    this.scene.add(gridLight);

    this._createStarfield();

    this.robot     = new Robot(this.camera);
    this.ui        = new UI(this);
    this.cinematic = new Cinematic(() => {
      this.cinematicActive = false;
      if (this.isPlaying && !this.celebrating) this.canShoot = true;
    });

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
      // Crosshair follows cursor
      const ch = document.getElementById('crosshair');
      if (ch && ch.style.display !== 'none') {
        ch.style.left = e.clientX + 'px';
        ch.style.top  = e.clientY + 'px';
      }
    });
    window.addEventListener('click', (e) => {
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

  // ── Level helpers ────────────────────────────────────────
  /** Returns 1-indexed number of the next level to play (first incomplete). */
  nextUnlockedLevel() {
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      if (!this.levelProgress[i]) return i + 1;
    }
    return TOTAL_LEVELS; // all done — allow replaying last
  }

  isLevelUnlocked(n) {
    if (n === 1) return true;
    return !!this.levelProgress[n - 2]; // previous level completed
  }

  // ── Start Level ─────────────────────────────────────────
  startLevel(levelNum) {
    if (this.cinematic) this.cinematic.cancel();
    this.cinematicActive = false;

    this.currentLevelNum = levelNum;
    this.levelScore      = 0;
    this.levelShots      = 0;
    this.levelComplete   = false;
    this.gameOver        = false;
    this.canShoot        = true;
    this.celebrating     = false;
    this.celebrateTimer  = 0;
    this.shotCount       = 0;

    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.poppingBubbles.forEach(pb => this.scene.remove(pb.mesh));
    this.poppingBubbles = [];
    if (this.flying) { this.scene.remove(this.flying.mesh); this.flying = null; }

    this._clearGrid();

    const config = LEVELS[levelNum - 1];
    this.numColors = config.numColors;
    this._buildGridFromLevel(config, levelNum);

    this.currentColor = this._randColor();
    this.nextColor    = this._randColor();
    this.robot.setMuzzleColor(BUBBLE_COLORS[this.currentColor]);

    this.isPlaying = true;
    this.ui.showHUD();
    this.ui.updateHUD(this.score, this.currentLevelNum, this.bestScore);
    this.ui.updateCurrentBubble(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);
    this.ui.updateBubbleCount(this.initialBubbleCount, this.initialBubbleCount);
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

  /** Build the grid deterministically from a level config + level number (seed). */
  _buildGridFromLevel(config, levelNum) {
    const { rows, numColors, density, pattern } = config;
    const rng = makeRng(levelNum * 7919);

    for (let r = 0; r < rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        if (rng() > density) {
          this.grid[r][c] = null;
          continue;
        }
        let colorIdx;
        if (pattern === 'striped') {
          colorIdx = r % numColors;
        } else if (pattern === 'checkers') {
          colorIdx = (r + c) % numColors;
        } else {
          colorIdx = Math.floor(rng() * numColors);
        }
        this._placeGridBubble(r, c, colorIdx);
      }
    }

    this.initialBubbleCount = this._countBubbles();
  }

  _countBubbles() {
    let count = 0;
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) { if (cell) count++; }
    }
    return count;
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
      color: colorHex, emissive: colorHex, emissiveIntensity: emissive,
      roughness: 0.04, metalness: 0.08,
      clearcoat: 1.0, clearcoatRoughness: 0.04,
      transmission: 0.12, transparent: true, opacity: 0.90,
    });
    const sphere = new THREE.Mesh(geo, mat);
    const hlGeo  = new THREE.SphereGeometry(BUBBLE_R * 0.20, 8, 6);
    const hlMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
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

  /**
   * Smart color picker: weighted by how many of each color remain on the board.
   * If the board is empty (level nearly done), falls back to _randColor().
   */
  _smartColor() {
    const counts = {};
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell) counts[cell.colorIdx] = (counts[cell.colorIdx] || 0) + 1;
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return this._randColor();
    // Weighted random proportional to count
    const total = entries.reduce((s, [, n]) => s + n, 0);
    let r = Math.random() * total;
    for (const [idx, n] of entries) {
      r -= n;
      if (r <= 0) return parseInt(idx);
    }
    return parseInt(entries[0][0]);
  }

  // ── Shoot ────────────────────────────────────────────────
  _shoot() {
    if (!this.isPlaying || !this.canShoot || this.flying || this.celebrating || this.gameOver || this.levelComplete) return;

    const dir = new THREE.Vector3(this.mouseNDC.x, this.mouseNDC.y, -1)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();

    const startPos = this.robot.getMuzzleWorldPosition();
    const mesh     = this._makeBubbleMesh(BUBBLE_COLORS[this.currentColor], this.currentColor);
    mesh.position.copy(startPos);
    this.scene.add(mesh);

    this.flying = { mesh, velocity: dir.multiplyScalar(SHOOT_SPEED), colorIdx: this.currentColor };
    this.levelShots++;

    this.currentColor = this.nextColor;
    this.nextColor    = this._smartColor();
    this.robot.setMuzzleColor(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateCurrentBubble(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);

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

    if (fb.mesh.position.x >  WALL_X) { fb.mesh.position.x =  WALL_X; fb.velocity.x *= -1; }
    if (fb.mesh.position.x < -WALL_X) { fb.mesh.position.x = -WALL_X; fb.velocity.x *= -1; }

    const snap = this._findSnapPosition(fb.mesh.position);
    if (snap) {
      this._snapBubble(snap.row, snap.col, fb.colorIdx);
      this.scene.remove(fb.mesh);
      this.flying = null;
    }

    if (fb.mesh.position.z < -20 || fb.mesh.position.z > 2) {
      this.scene.remove(fb.mesh);
      this.flying = null;
    }
  }

  _findSnapPosition(pos) {
    const rows = this.grid.length;
    let bestDist = Infinity, bestR = -1, bestC = -1;

    if (pos.z > GRID_Z + SPACING * 2) return null;

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r] && this.grid[r][c]) continue;
        let hasNeighbor = r === 0;
        if (!hasNeighbor) {
          for (const [nr, nc] of getNeighbors(r, c)) {
            if (this.grid[nr] && this.grid[nr][nc]) { hasNeighbor = true; break; }
          }
        }
        if (!hasNeighbor) continue;
        const d = gridPos(r, c).distanceTo(pos);
        if (d < bestDist) { bestDist = d; bestR = r; bestC = c; }
      }
    }
    return (bestDist <= SNAP_THRESHOLD && bestR >= 0) ? { row: bestR, col: bestC } : null;
  }

  _snapBubble(row, col, colorIdx) {
    while (this.grid.length <= row) this.grid.push([]);
    if (!this.grid[row]) this.grid[row] = [];

    this._placeGridBubble(row, col, colorIdx);

    const group = this._floodFill(row, col, colorIdx);
    if (group.length >= 3) {
      const fullRowsBefore = this._getFullRows();

      for (const [r, c] of group) {
        const cell = this.grid[r][c];
        this._spawnParticles(cell.mesh.position, colorIdx, 14);
        this._addPoppingBubble(cell.mesh);
        this.grid[r][c] = null;
      }

      const pts = (30 + (group.length - 3) * 10) * this.currentLevelNum;
      this._addScore(pts);

      this._removeOrphans();
      const fullRowsAfter  = this._getFullRows();
      const clearedRows = [...fullRowsBefore].filter(r => !fullRowsAfter.has(r));
      if (clearedRows.length > 0) {
        this._addScore(clearedRows.length * 50 * this.currentLevelNum);
        this._triggerCelebration();
      }
      // Regenerate next color based on remaining board after matches resolved
      this.nextColor = this._smartColor();
      this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);

      // Update remaining bubble count
      this.ui.updateBubbleCount(this._countBubbles(), this.initialBubbleCount);

      // ── Win condition ──
      this._checkLevelComplete();
    } else {
      // Even if no match, update count (player added a bubble)
      this.ui.updateBubbleCount(this._countBubbles(), this.initialBubbleCount);
    }

    this._checkGameOver();
  }

  _floodFill(startRow, startCol, colorIdx) {
    const visited = new Set(), result = [];
    const stack = [[startRow, startCol]];
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
    const connected = new Set(), stack = [];
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

  // ── Scoring ──────────────────────────────────────────────
  _addScore(pts) {
    this.score      += pts;
    this.levelScore += pts;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('dz3d_best', this.bestScore);
    }
    this.ui.updateHUD(this.score, this.currentLevelNum, this.bestScore);
  }

  // ── Level Complete ───────────────────────────────────────
  _checkLevelComplete() {
    if (this._countBubbles() === 0) this._triggerLevelComplete();
  }

  async _triggerLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.isPlaying     = false;
    this.canShoot      = false;

    // Star rating based on shots fired vs. initial bubbles
    const ratio = this.levelShots / Math.max(1, this.initialBubbleCount);
    const stars  = ratio <= 0.65 ? 3 : ratio <= 1.1 ? 2 : 1;

    // Bonus points
    const bonus = stars * 75 * this.currentLevelNum;
    this._addScore(bonus);

    // Persist level completion
    this.levelProgress[this.currentLevelNum - 1] = true;
    localStorage.setItem('dz3d_progress', JSON.stringify(this.levelProgress));

    // Submit score to leaderboard
    if (this.token) {
      try {
        await fetch('http://localhost:4001/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
          body: JSON.stringify({ score: this.score, level: this.currentLevelNum }),
        });
      } catch { /* no-op */ }
    }

    this.ui.showLevelComplete(this.currentLevelNum, this.levelScore, stars);
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
    if (!this.cinematicActive && !this.levelComplete) this.canShoot = true;
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
      const scale = t < 0.35
        ? 1 + (t / 0.35) * 0.32
        : 1.32 * (1 - (t - 0.35) / 0.65);
      pb.mesh.scale.setScalar(Math.max(0, scale));
      return true;
    });
  }

  // ── Game Over (level failed) ─────────────────────────────
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

  _triggerGameOver() {
    if (this.gameOver || this.levelComplete) return;
    this.gameOver  = true;
    this.isPlaying = false;
    this.canShoot  = false;
    this.ui.showGameOver(this.score, this.currentLevelNum);
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
