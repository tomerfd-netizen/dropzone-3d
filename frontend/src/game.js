import * as THREE from 'three';
import { Robot } from './robot.js';
import { UI } from './ui.js';
import { MainMenu } from './mainmenu.js';
import { Cinematic } from './cinematic.js';
import { LEVELS, TOTAL_LEVELS, makeRng } from './levels.js';
import { AudioEngine } from './audio.js';

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
const RAINBOW        = -1;  // wildcard colorIdx for rainbow bubbles

const BUBBLE_COLORS = [
  0xff4da6,  // hot pink
  0x00f0ff,  // cyan
  0xffe600,  // yellow
  0x00ff88,  // green
  0xaa44ff,  // purple
  0xff8800,  // orange
];

const EMISSIVE_I = [0.10, 0.13, 0.09, 0.12, 0.08, 0.11];

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

// ── Particle (burst on pop) ─────────────────────────────────
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

// ── Shard (3D rigid fragment on pop) ───────────────────────
class Shard {
  constructor(scene, position, color) {
    const useTetra = Math.random() < 0.6;
    const geo = useTetra
      ? new THREE.TetrahedronGeometry(0.13 + Math.random() * 0.10, 0)
      : new THREE.OctahedronGeometry(0.09 + Math.random() * 0.08, 0);
    const mat = new THREE.MeshPhongMaterial({
      color, emissive: color, emissiveIntensity: 0.55,
      transparent: true, opacity: 0.92, shininess: 140,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );

    const speed = 4 + Math.random() * 6;
    const angle = Math.random() * Math.PI * 2;
    const elev  = (Math.random() * 0.7 + 0.15) * Math.PI * 0.5;
    this.velocity = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elev) * speed,
      Math.abs(Math.sin(elev)) * speed + 2,
      (Math.random() - 0.5) * 4,
    );
    this.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
    );
    this.life    = 0;
    this.maxLife = 0.42 + Math.random() * 0.38;
    scene.add(this.mesh);
  }

  update(dt) {
    this.life += dt;
    this.velocity.y -= 24 * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);
    this.mesh.rotation.x += this.spin.x * dt;
    this.mesh.rotation.y += this.spin.y * dt;
    this.mesh.rotation.z += this.spin.z * dt;
    const t = this.life / this.maxLife;
    this.mesh.material.opacity = Math.max(0, 1 - t * t);
    this.mesh.scale.setScalar(Math.max(0, 1 - t * 0.55));
  }

  get dead() { return this.life >= this.maxLife; }
}

// ── Trail Particle (bullet trail) ──────────────────────────
class TrailParticle {
  constructor(scene, position, color) {
    const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.035, 4, 3);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 1.0,
      (Math.random() - 0.5) * 1.0,
      (Math.random() - 0.5) * 0.6,
    );
    this.life    = 0;
    this.maxLife = 0.10 + Math.random() * 0.09;
    scene.add(this.mesh);
  }

  update(dt) {
    this.life += dt;
    this.mesh.position.addScaledVector(this.velocity, dt);
    const t = this.life / this.maxLife;
    this.mesh.material.opacity = Math.max(0, 0.72 * (1 - t));
    this.mesh.scale.setScalar(Math.max(0, 1 - t));
  }

  get dead() { return this.life >= this.maxLife; }
}

// ── Game ────────────────────────────────────────────────────
class Game {
  constructor() {
    this.scene    = new THREE.Scene();
    this.camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });

    this.grid           = [];
    this.particles      = [];
    this.shards         = [];
    this.trailParticles = [];
    this.flying         = null;

    this.currentColor = 0;
    this.nextColor    = 0;
    this.numColors    = 3;

    // ── Level state ──
    this.currentLevelNum    = 1;
    this.score              = 0;
    this.levelScore         = 0;
    this.levelShots         = 0;
    this.initialBubbleCount = 0;
    this.bestScore          = parseInt(localStorage.getItem('dz3d_best') || '0');

    const saved = localStorage.getItem('dz3d_progress');
    this.levelProgress = saved ? JSON.parse(saved) : Array(TOTAL_LEVELS).fill(false);

    this.celebrating    = false;
    this.celebrateTimer = 0;

    this.isPlaying     = false;
    this.gameOver      = false;
    this.levelComplete = false;
    this.canShoot      = true;

    this.shotCount       = 0;
    this.cinematicActive = false;
    this.cinematic       = null;

    this.token    = null;
    this.username = null;

    this.freePlayMode = false;
    this.freePlayWave = 0;

    // ── Combo system ──────────────────────────────────────
    this.comboStreak     = 0;
    this.comboMultiplier = 1;
    this._lastMatchTime  = 0;

    // ── Camera dynamics ──────────────────────────────────
    this.camRecoil      = 0;
    this.camRecoilVel   = 0;
    this.shakeIntensity = 0;

    // ── Combo flash light ─────────────────────────────────
    this.comboLight          = null;
    this.comboLightIntensity = 0;

    // ── Rainbow animation ─────────────────────────────────
    this._rainbowHue = 0;

    this.mouseNDC = new THREE.Vector2(0, 0);
    this.clock    = new THREE.Clock();
    this.robot    = null;
    this.ui       = null;
    this.audio    = new AudioEngine();
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

    this.comboLight = new THREE.PointLight(0xffffff, 0, 22);
    this.comboLight.position.set(0, 2, GRID_Z + 3);
    this.scene.add(this.comboLight);

    this._createStarfield();

    this.robot     = new Robot(this.camera);
    this.ui        = new UI(this);
    this.mainMenu  = new MainMenu(this);
    this.cinematic = new Cinematic(() => {
      this.cinematicActive = false;
      if (this.isPlaying && !this.celebrating) this.canShoot = true;
    });

    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('mousemove', (e) => {
      this.mouseNDC.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
      const ch = document.getElementById('crosshair');
      if (ch && ch.style.display !== 'none') {
        ch.style.left = e.clientX + 'px';
        ch.style.top  = e.clientY + 'px';
      }
    });
    window.addEventListener('click', (e) => {
      this.audio.resume();
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
  nextUnlockedLevel() {
    for (let i = 0; i < TOTAL_LEVELS; i++) {
      if (!this.levelProgress[i]) return i + 1;
    }
    return TOTAL_LEVELS;
  }

  isLevelUnlocked(n) {
    if (n === 1) return true;
    return !!this.levelProgress[n - 2];
  }

  // ── Free Play ────────────────────────────────────────────
  startFreePlay() {
    this.freePlayMode = true;
    this.freePlayWave = 1;
    this.score        = 0;
    this.levelScore   = 0;
    this.bestScore    = parseInt(localStorage.getItem('dz3d_best') || '0');
    this._startFreePlayWave();
  }

  _startFreePlayWave() {
    if (this.cinematic) this.cinematic.cancel();
    this.cinematicActive = false;

    this.currentLevelNum  = this.freePlayWave;
    this.levelScore       = 0;
    this.levelShots       = 0;
    this.levelComplete    = false;
    this.gameOver         = false;
    this.canShoot         = true;
    this.celebrating      = false;
    this.celebrateTimer   = 0;
    this.shotCount        = 0;
    this.comboStreak      = 0;
    this.comboMultiplier  = 1;
    this.ui && this.ui.updateCombo(0, 1);

    this.audio.popPitchIdx    = 0;
    this.audio.stopMusic();
    this.camRecoil            = 0;
    this.camRecoilVel         = 0;
    this.shakeIntensity       = 0;
    this.comboLightIntensity  = 0;
    if (this.comboLight) this.comboLight.intensity = 0;

    this.particles.forEach(p => this.scene.remove(p.mesh));     this.particles      = [];
    this.shards.forEach(s => this.scene.remove(s.mesh));        this.shards         = [];
    this.trailParticles.forEach(t => this.scene.remove(t.mesh)); this.trailParticles = [];
    if (this.flying) { this.scene.remove(this.flying.mesh); this.flying = null; }

    this._clearGrid();

    const w   = this.freePlayWave;
    this.numColors = Math.min(2 + Math.floor(w / 2), 6);
    const config   = {
      rows:      Math.min(4 + Math.floor(w * 0.75), 11),
      numColors: this.numColors,
      density:   Math.min(0.68 + w * 0.013, 0.91),
      pattern:   'random',
    };
    this._buildGridFromLevel(config, w);

    this.currentColor = this._randColor();
    this.nextColor    = this._randColor();
    this.robot.setMuzzleColor(BUBBLE_COLORS[this.currentColor]);

    this.isPlaying = true;
    this.audio.startMusic();
    this.ui.showHUD();
    this.ui.showFreePlayHUD(this.score, w, this.bestScore);
    this.ui.updateCurrentBubble(BUBBLE_COLORS[this.currentColor]);
    this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);
    this.ui.updateBubbleCount(this.initialBubbleCount, this.initialBubbleCount);
  }

  _triggerFreePlayWaveClear() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.isPlaying     = false;
    this.canShoot      = false;
    this.audio.levelComplete();
    this.audio.stopMusic();

    this.ui.showFreePlayWaveClear(this.freePlayWave);

    setTimeout(() => {
      const fade = document.getElementById('level-fade');
      fade.classList.add('in');
      setTimeout(() => {
        this.freePlayWave++;
        this._startFreePlayWave();
        fade.classList.remove('in');
      }, 380);
    }, 1900);
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

    // Reset combo
    this.comboStreak     = 0;
    this.comboMultiplier = 1;
    this.ui && this.ui.updateCombo(0, 1);

    // Reset audio & camera
    this.audio.popPitchIdx   = 0;
    this.audio.stopMusic();
    this.camRecoil           = 0;
    this.camRecoilVel        = 0;
    this.shakeIntensity      = 0;
    this.comboLightIntensity = 0;
    if (this.comboLight) this.comboLight.intensity = 0;

    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.shards.forEach(s => this.scene.remove(s.mesh));
    this.shards = [];
    this.trailParticles.forEach(t => this.scene.remove(t.mesh));
    this.trailParticles = [];

    if (this.flying) { this.scene.remove(this.flying.mesh); this.flying = null; }

    this._clearGrid();

    const config = LEVELS[levelNum - 1];
    this.numColors = config.numColors;
    this._buildGridFromLevel(config, levelNum);

    this.currentColor = this._randColor();
    this.nextColor    = this._randColor();
    this.robot.setMuzzleColor(BUBBLE_COLORS[this.currentColor]);

    this.freePlayMode = false;
    this.isPlaying    = true;
    this.audio.startMusic();
    this.ui.showHUD();
    this.ui.resetLevelLabel();
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

  // ── Grid generation ─────────────────────────────────────
  _buildGridFromLevel(config, levelNum) {
    const { rows, numColors, density, pattern } = config;
    const rng  = makeRng(levelNum * 7919);
    const tier = Math.ceil(levelNum / 8);

    for (let r = 0; r < rows; r++) {
      this.grid[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        if (rng() > density) { this.grid[r][c] = null; continue; }

        let colorIdx;
        if (pattern === 'striped')       colorIdx = r % numColors;
        else if (pattern === 'checkers') colorIdx = (r + c) % numColors;
        else                             colorIdx = Math.floor(rng() * numColors);

        const type           = tier >= 2 ? this._rollSpecialType(rng(), tier) : 'normal';
        const finalColorIdx  = type === 'rainbow' ? RAINBOW : colorIdx;
        this._placeGridBubble(r, c, finalColorIdx, type);
      }
    }

    this.initialBubbleCount = this._countBubbles();
  }

  // Returns special bubble type based on tier probability table.
  _rollSpecialType(roll, tier) {
    // Cumulative thresholds: [bomb, laser, rainbow, armored]
    const thresholds = [
      null,                            // tier 1 — no specials
      [0.05, 0.05, 0.08, 0.08],        // tier 2 — 5% bomb, 3% rainbow
      [0.05, 0.09, 0.13, 0.15],        // tier 3 — 5% bomb, 4% laser, 4% rainbow, 2% armored
      [0.06, 0.11, 0.16, 0.20],        // tier 4
      [0.07, 0.13, 0.19, 0.25],        // tier 5
    ];
    const types = ['bomb', 'laser', 'rainbow', 'armored'];
    const t     = thresholds[Math.min(tier - 1, 4)];
    if (!t) return 'normal';
    for (let i = 0; i < t.length; i++) {
      if (roll < t[i]) return types[i];
    }
    return 'normal';
  }

  _countBubbles() {
    let count = 0;
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) { if (cell) count++; }
    }
    return count;
  }

  _placeGridBubble(row, col, colorIdx, type = 'normal') {
    const colorHex = colorIdx >= 0 ? BUBBLE_COLORS[colorIdx] : 0xffffff;
    const mesh     = this._makeBubbleMesh(colorHex, colorIdx, type);
    mesh.position.copy(gridPos(row, col));
    this.scene.add(mesh);
    if (!this.grid[row]) this.grid[row] = [];
    // Store reference to sphere material so we can update it for armored damage / rainbow animation
    const sphereMat = mesh.children[0].material;
    this.grid[row][col] = { mesh, colorIdx, type, hitsLeft: type === 'armored' ? 2 : 1, sphereMat };
  }

  _makeBubbleMesh(colorHex, colorIdx = 0, type = 'normal') {
    const group = new THREE.Group();

    // Per-type sphere material
    let mat;
    switch (type) {
      case 'bomb':
        mat = new THREE.MeshPhysicalMaterial({
          color: 0x1a0400, emissive: 0xff3300, emissiveIntensity: 0.78,
          roughness: 0.35, metalness: 0.5,
          clearcoat: 0.7, clearcoatRoughness: 0.12,
          transparent: true, opacity: 0.95,
        });
        break;
      case 'laser':
        mat = new THREE.MeshPhysicalMaterial({
          color: 0x001824, emissive: 0x00eeff, emissiveIntensity: 0.88,
          roughness: 0.02, metalness: 0.05,
          clearcoat: 1.0, clearcoatRoughness: 0.02,
          transparent: true, opacity: 0.92,
        });
        break;
      case 'rainbow':
        mat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff, emissive: 0xff88ff, emissiveIntensity: 0.45,
          roughness: 0.02, metalness: 0.0,
          clearcoat: 1.0, clearcoatRoughness: 0.01,
          transparent: true, opacity: 0.88,
        });
        break;
      case 'armored':
        mat = new THREE.MeshPhysicalMaterial({
          color: 0x888888, emissive: 0x444444, emissiveIntensity: 0.18,
          roughness: 0.65, metalness: 0.88,
          clearcoat: 0.3, clearcoatRoughness: 0.5,
          transparent: true, opacity: 0.97,
        });
        break;
      default: {
        const emissive = EMISSIVE_I[Math.min(Math.max(colorIdx, 0), EMISSIVE_I.length - 1)];
        mat = new THREE.MeshPhysicalMaterial({
          color: colorHex, emissive: colorHex, emissiveIntensity: emissive,
          roughness: 0.04, metalness: 0.08,
          clearcoat: 1.0, clearcoatRoughness: 0.04,
          transmission: 0.12, transparent: true, opacity: 0.90,
        });
      }
    }

    group.add(new THREE.Mesh(new THREE.SphereGeometry(BUBBLE_R, 24, 16), mat));

    // Specular highlight dot (all types)
    const hlMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BUBBLE_R * 0.20, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    );
    hlMesh.position.set(BUBBLE_R * 0.22, BUBBLE_R * 0.28, BUBBLE_R * 0.40);
    group.add(hlMesh);

    // Type-specific decoration rings
    if (type === 'bomb') {
      const ringGeo = new THREE.TorusGeometry(BUBBLE_R + 0.055, 0.040, 6, 20);
      const ringMat = new THREE.MeshPhongMaterial({ color: 0xff5500, emissive: 0xff2200, emissiveIntensity: 0.75 });
      const r1 = new THREE.Mesh(ringGeo, ringMat);
      const r2 = new THREE.Mesh(ringGeo, ringMat);
      r2.rotation.x = Math.PI / 2;
      group.add(r1, r2);
    } else if (type === 'laser') {
      // Flat horizontal scan ring
      const ringGeo = new THREE.TorusGeometry(BUBBLE_R + 0.11, 0.030, 5, 28);
      const ringMat = new THREE.MeshPhongMaterial({ color: 0x00eeff, emissive: 0x00ddff, emissiveIntensity: 1.05, transparent: true, opacity: 0.80 });
      group.add(new THREE.Mesh(ringGeo, ringMat));
    } else if (type === 'armored') {
      // Hexagonal protective ring
      const ringGeo = new THREE.TorusGeometry(BUBBLE_R + 0.072, 0.048, 6, 6);
      const ringMat = new THREE.MeshPhongMaterial({ color: 0x777777, emissive: 0x333333, emissiveIntensity: 0.22, shininess: 200 });
      const ring    = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.z = Math.PI / 6;
      group.add(ring);
    }

    return group;
  }

  _randColor() {
    return Math.floor(Math.random() * this.numColors);
  }

  _smartColor() {
    const counts = {};
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell && cell.colorIdx >= 0) {
          counts[cell.colorIdx] = (counts[cell.colorIdx] || 0) + 1;
        }
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return this._randColor();
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

    this.camRecoil    = -0.22;
    this.camRecoilVel = 0;
    this.audio.shoot();

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

  // ── Flying bubble update ─────────────────────────────────
  _updateFlying(dt) {
    if (!this.flying) return;
    const fb = this.flying;
    fb.mesh.position.addScaledVector(fb.velocity, dt);

    if (Math.random() < 0.88) {
      this.trailParticles.push(
        new TrailParticle(this.scene, fb.mesh.position.clone(), BUBBLE_COLORS[fb.colorIdx])
      );
    }

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

  // ── Snap & match logic ───────────────────────────────────
  _snapBubble(row, col, colorIdx) {
    while (this.grid.length <= row) this.grid.push([]);
    if (!this.grid[row]) this.grid[row] = [];

    this._placeGridBubble(row, col, colorIdx);

    const group = this._floodFill(row, col, colorIdx);

    if (group.length >= 3) {
      const fullRowsBefore = this._getFullRows();
      const now            = this.clock.elapsedTime;

      // Combo streak — continues if last match was within 4 seconds
      if (now - this._lastMatchTime < 4.0) {
        this.comboStreak++;
      } else {
        this.comboStreak = 1;
      }
      this._lastMatchTime  = now;
      this.comboMultiplier = 1 + Math.min(this.comboStreak - 1, 7) * 0.5;
      this.ui.updateCombo(this.comboStreak, this.comboMultiplier);

      // Capture special types BEFORE removing cells
      const bombs      = [];
      const laserRows  = new Set();

      group.forEach(([r, c], i) => {
        const cell = this.grid[r][c];
        if (cell.type === 'bomb')  bombs.push([r, c]);
        if (cell.type === 'laser') laserRows.add(r);
        const safeColor = cell.colorIdx >= 0 ? cell.colorIdx : 0;
        this._spawnParticles(cell.mesh.position, safeColor, 12);
        this._spawnShards(cell.mesh.position, safeColor, 7);
        this.scene.remove(cell.mesh);
        this.grid[r][c] = null;
        this.audio.pop(i * 0.04);
      });

      // Base match score (combo-multiplied)
      this._addScore((30 + (group.length - 3) * 10) * this.currentLevelNum, true);

      // Damage any adjacent armored bubbles
      const armoredHit = new Set();
      for (const [r, c] of group) {
        for (const [nr, nc] of getNeighbors(r, c)) {
          const key = `${nr},${nc}`;
          if (!armoredHit.has(key) && this.grid[nr]?.[nc]?.type === 'armored') {
            armoredHit.add(key);
            this._hitArmored(nr, nc);
          }
        }
      }

      // Trigger bomb explosions
      for (const [r, c] of bombs) this._detonateRadius(r, c);

      // Trigger laser row clears
      for (const r of laserRows) this._clearRow(r);

      this._removeOrphans();

      const fullRowsAfter = this._getFullRows();
      const clearedRows   = [...fullRowsBefore].filter(r => !fullRowsAfter.has(r));
      if (clearedRows.length > 0) {
        this._addScore(clearedRows.length * 50 * this.currentLevelNum, false);
        this._triggerCelebration();
      }

      this.nextColor = this._smartColor();
      this.ui.updateNextBubble(BUBBLE_COLORS[this.nextColor]);
      const rem = this._countBubbles();
      this.ui.updateBubbleCount(rem, this.initialBubbleCount);
      this.audio.updateMusicIntensity(rem, this.initialBubbleCount);
      this._checkLevelComplete();
    } else {
      // Miss — break combo streak
      this.comboStreak    = 0;
      this.comboMultiplier = 1;
      this.ui.updateCombo(0, 1);
      this.ui.updateBubbleCount(this._countBubbles(), this.initialBubbleCount);
    }

    this._checkGameOver();
  }

  // Rainbow cells match any incoming color; armored never matches.
  _floodFill(startRow, startCol, colorIdx) {
    const visited = new Set(), result = [];
    const stack   = [[startRow, startCol]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const key    = `${r},${c}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!this.grid[r] || !this.grid[r][c]) continue;
      const cell = this.grid[r][c];
      if (cell.type === 'armored') continue;
      if (cell.colorIdx !== colorIdx && cell.colorIdx !== RAINBOW) continue;
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
      const key    = `${r},${c}`;
      if (connected.has(key)) continue;
      if (!this.grid[r] || !this.grid[r][c]) continue;
      connected.add(key);
      for (const [nr, nc] of getNeighbors(r, c)) stack.push([nr, nc]);
    }
    let orphanIdx = 0;
    for (let r = 0; r < this.grid.length; r++) {
      if (!this.grid[r]) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] && !connected.has(`${r},${c}`)) {
          const cell      = this.grid[r][c];
          const safeColor = cell.colorIdx >= 0 ? cell.colorIdx : 0;
          this._spawnParticles(cell.mesh.position, safeColor, 8);
          this._spawnShards(cell.mesh.position, safeColor, 5);
          this.audio.pop(orphanIdx * 0.055);
          orphanIdx++;
          this.scene.remove(cell.mesh);
          this.grid[r][c] = null;
        }
      }
    }
  }

  // ── Special bubble effects ───────────────────────────────

  _detonateRadius(row, col, radius = 1.95) {
    const center    = gridPos(row, col);
    const toExplode = [];
    for (let r = 0; r < this.grid.length; r++) {
      if (!this.grid[r]) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.grid[r][c] && gridPos(r, c).distanceTo(center) <= radius) {
          toExplode.push([r, c]);
        }
      }
    }
    let idx = 0;
    for (const [r, c] of toExplode) {
      const cell      = this.grid[r][c];
      const safeColor = cell.colorIdx >= 0 ? cell.colorIdx : 0;
      this._spawnParticles(cell.mesh.position, safeColor, 10);
      this._spawnShards(cell.mesh.position, safeColor, 5);
      this.audio.pop(idx++ * 0.03);
      this.scene.remove(cell.mesh);
      this.grid[r][c] = null;
    }
    if (toExplode.length > 0) {
      this.shakeIntensity = 0.22;
      this.comboLightIntensity = 7.5;
      this.comboLight.color.setHex(0xff5500);
      this.comboLight.intensity = 7.5;
      this._addScore(toExplode.length * 15 * this.currentLevelNum, true);
    }
  }

  _clearRow(row) {
    if (!this.grid[row]) return;
    let cleared = 0;
    for (let c = 0; c < GRID_COLS; c++) {
      if (!this.grid[row][c]) continue;
      const cell      = this.grid[row][c];
      const safeColor = cell.colorIdx >= 0 ? cell.colorIdx : 1;
      this._spawnParticles(cell.mesh.position, safeColor, 8);
      this._spawnShards(cell.mesh.position, safeColor, 4);
      this.audio.pop(c * 0.04);
      this.scene.remove(cell.mesh);
      this.grid[row][c] = null;
      cleared++;
    }
    if (cleared > 0) {
      this.comboLightIntensity = 6.0;
      this.comboLight.color.setHex(0x00eeff);
      this.comboLight.intensity = 6.0;
      this._addScore(cleared * 20 * this.currentLevelNum, true);
    }
  }

  _hitArmored(row, col) {
    const cell = this.grid[row][col];
    if (!cell || cell.type !== 'armored') return;
    cell.hitsLeft--;
    if (cell.hitsLeft <= 0) {
      this._spawnParticles(cell.mesh.position, 0, 10);
      this._spawnShards(cell.mesh.position, 0, 5);
      this.audio.pop();
      this._addScore(25 * this.currentLevelNum, false);
      this.scene.remove(cell.mesh);
      this.grid[row][col] = null;
    } else {
      // Visual crack: shift to orange-bronze tint
      if (cell.sphereMat) {
        cell.sphereMat.color.setHex(0x996633);
        cell.sphereMat.emissive.setHex(0xcc4400);
        cell.sphereMat.emissiveIntensity = 0.55;
      }
    }
  }

  // ── Scoring ──────────────────────────────────────────────
  _addScore(pts, applyMultiplier = false) {
    const final = applyMultiplier ? Math.round(pts * this.comboMultiplier) : pts;
    this.score      += final;
    this.levelScore += final;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('dz3d_best', this.bestScore);
    }
    this.ui.updateHUD(this.score, this.currentLevelNum, this.bestScore);
  }

  // ── Level Complete ───────────────────────────────────────
  _checkLevelComplete() {
    if (this._countBubbles() === 0) {
      if (this.freePlayMode) this._triggerFreePlayWaveClear();
      else                   this._triggerLevelComplete();
    }
  }

  async _triggerLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.isPlaying     = false;
    this.canShoot      = false;

    this.shakeIntensity = 0.26;
    this.audio.levelComplete();
    this.audio.stopMusic();

    const ratio = this.levelShots / Math.max(1, this.initialBubbleCount);
    const stars  = ratio <= 0.65 ? 3 : ratio <= 1.1 ? 2 : 1;

    this._addScore(stars * 75 * this.currentLevelNum, false);

    this.levelProgress[this.currentLevelNum - 1] = true;
    localStorage.setItem('dz3d_progress', JSON.stringify(this.levelProgress));

    if (this.token) {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';
        await fetch(`${apiUrl}/scores`, {
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

    this.shakeIntensity      = 0.15;
    this.comboLightIntensity = 5.5;
    if (this.comboLight) {
      this.comboLight.color.setHex(BUBBLE_COLORS[this.currentColor] ?? 0xffffff);
      this.comboLight.intensity = this.comboLightIntensity;
    }
    this.audio.combo();
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

  // ── Particles & effects ──────────────────────────────────
  _spawnParticles(pos, colorIdx, count) {
    const color = BUBBLE_COLORS[Math.max(0, colorIdx)];
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(this.scene, pos.clone(), color));
    }
  }

  _spawnShards(pos, colorIdx, count) {
    const color = BUBBLE_COLORS[Math.max(0, colorIdx)];
    for (let i = 0; i < count; i++) {
      this.shards.push(new Shard(this.scene, pos.clone(), color));
    }
  }

  _updateParticles(dt) {
    this.particles = this.particles.filter(p => {
      p.update(dt);
      if (p.dead) { this.scene.remove(p.mesh); return false; }
      return true;
    });
  }

  _updateShards(dt) {
    this.shards = this.shards.filter(s => {
      s.update(dt);
      if (s.dead) { this.scene.remove(s.mesh); return false; }
      return true;
    });
  }

  _updateTrailParticles(dt) {
    this.trailParticles = this.trailParticles.filter(t => {
      t.update(dt);
      if (t.dead) { this.scene.remove(t.mesh); return false; }
      return true;
    });
  }

  // Animate rainbow bubble hue each frame
  _updateRainbowBubbles(dt) {
    this._rainbowHue = (this._rainbowHue + dt * 0.45) % 1;
    const col = new THREE.Color().setHSL(this._rainbowHue, 1.0, 0.65);
    for (const row of this.grid) {
      if (!row) continue;
      for (const cell of row) {
        if (cell?.type === 'rainbow' && cell.sphereMat) {
          cell.sphereMat.color.copy(col);
          cell.sphereMat.emissive.copy(col);
        }
      }
    }
  }

  // ── Game Over ────────────────────────────────────────────
  _checkGameOver() {
    if (this.freePlayMode) return;
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
    this.shakeIntensity = 0.32;
    this.audio.gameOver();
    this.audio.stopMusic();
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

    // ── Camera dynamics ──────────────────────────────────

    const tiltX = -this.mouseNDC.y * 0.045;
    const tiltY =  this.mouseNDC.x * 0.045;
    this.camera.rotation.x += (tiltX - this.camera.rotation.x) * 5 * dt;
    this.camera.rotation.y += (tiltY - this.camera.rotation.y) * 5 * dt;

    const springK = 200, springB = 14;
    this.camRecoilVel += (-springK * this.camRecoil) * dt;
    this.camRecoilVel *= Math.max(0, 1 - springB * dt);
    this.camRecoil    += this.camRecoilVel * dt;

    let shakeX = 0, shakeY = 0;
    if (this.shakeIntensity > 0.001) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.max(0, 1 - 8 * dt);
    }

    this.camera.position.set(shakeX, shakeY, this.camRecoil);

    if (this.comboLightIntensity > 0 && this.comboLight) {
      this.comboLightIntensity = Math.max(0, this.comboLightIntensity - 7 * dt);
      this.comboLight.intensity = this.comboLightIntensity;
    }

    // ── Game logic ────────────────────────────────────────
    if (this.isPlaying) {
      this._updateFlying(dt);
      this._updateParticles(dt);
      this._updateShards(dt);
      this._updateTrailParticles(dt);
      this._updateRainbowBubbles(dt);
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
