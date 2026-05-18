import { TOTAL_LEVELS } from './levels.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';

export class UI {
  constructor(game) {
    this.game = game;
    this.leaderboardOpen    = false;
    this.levelsOpen         = false;
    this._returnToHome      = false;
    this._returnToMainMenu  = false;
    this._setupTabs();
    this._setupForms();
    this._setupLeaderboard();
    this._setupLevels();
    this._setupLevelComplete();
    this._setupGameOver();
    this._setupHomeScreen();
  }

  // ── Tabs ──────────────────────────────────────────────────
  _setupTabs() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab + '-form').classList.add('active');
      });
    });
  }

  // ── Auth forms ────────────────────────────────────────────
  _setupForms() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl    = document.getElementById('login-error');
      errEl.textContent = '';
      try {
        const res  = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.game.setAuth(data.token, data.username);
        this.hideAuth();
        this._afterAuth();
      } catch { errEl.textContent = 'Cannot connect to server'; }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm  = document.getElementById('reg-confirm').value;
      const errEl    = document.getElementById('register-error');
      errEl.textContent = '';
      if (password !== confirm) { errEl.textContent = 'Passwords do not match'; return; }
      try {
        const res  = await fetch(`${API}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.game.setAuth(data.token, data.username);
        this.hideAuth();
        this._afterAuth();
      } catch { errEl.textContent = 'Cannot connect to server'; }
    });

    document.getElementById('guest-btn').addEventListener('click', () => {
      this.hideAuth();
      this._afterAuth();
    });
  }

  /** Called after login / register / guest — show main menu. */
  _afterAuth() {
    document.getElementById('hud').style.display = 'block';
    this.renderLevelMap();
    this.game.mainMenu.show();
  }

  // ── Home Screen ───────────────────────────────────────────
  _setupHomeScreen() {
    document.getElementById('home-hud-btn').addEventListener('click', () => {
      this.game.freePlayMode = false;
      this.game.isPlaying    = false;
      this.game.audio.stopMusic();
      this._hideGameplayUI();
      this.resetLevelLabel();
      this.game.mainMenu.show();
    });

    document.getElementById('home-play-btn').addEventListener('click', () => {
      this.game.audio.resume();
      this.hideHomeScreen();
      this._fadeToLevel(this.game.nextUnlockedLevel());
    });

    document.getElementById('home-levels-btn').addEventListener('click', () => {
      this._returnToHome = true;
      this.hideHomeScreen();
      this.showLevels();
    });

    document.getElementById('home-how-btn').addEventListener('click', () => {
      this.showInstructions();
    });

    document.getElementById('home-settings-btn').addEventListener('click', () => {
      this.showSettings();
    });

    document.getElementById('instructions-close').addEventListener('click', () => this.hideInstructions());
    document.getElementById('instructions-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideInstructions();
    });

    document.getElementById('settings-close').addEventListener('click', () => this.hideSettings());
    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideSettings();
    });

    document.getElementById('home-logout-btn').addEventListener('click', () => {
      this.hideSettings();
      this.hideHomeScreen();
      this.game.setAuth(null, null);
      this._hideGameplayUI();
      this.hideHUD();
      this.showAuth();
    });

    const musicToggle = document.getElementById('music-toggle');
    const sfxToggle   = document.getElementById('sfx-toggle');

    const musicOn = localStorage.getItem('dz3d_music') !== 'off';
    const sfxOn   = localStorage.getItem('dz3d_sfx')   !== 'off';
    this._updateToggle(musicToggle, musicOn);
    this._updateToggle(sfxToggle, sfxOn);
    this.game.audio.setMusicEnabled(musicOn);
    this.game.audio.setSFXEnabled(sfxOn);

    musicToggle.addEventListener('click', () => {
      const nowOn = musicToggle.classList.contains('off');
      localStorage.setItem('dz3d_music', nowOn ? 'on' : 'off');
      this._updateToggle(musicToggle, nowOn);
      this.game.audio.setMusicEnabled(nowOn);
    });

    sfxToggle.addEventListener('click', () => {
      const nowOn = sfxToggle.classList.contains('off');
      localStorage.setItem('dz3d_sfx', nowOn ? 'on' : 'off');
      this._updateToggle(sfxToggle, nowOn);
      this.game.audio.setSFXEnabled(nowOn);
    });
  }

  _updateToggle(btn, isOn) {
    btn.textContent = isOn ? 'ON' : 'OFF';
    btn.classList.toggle('off', !isOn);
  }

  showHomeScreen() {
    const nextLvl   = this.game.nextUnlockedLevel();
    const completed = this.game.levelProgress.filter(Boolean).length;
    const total     = this.game.levelProgress.length;
    const name      = this.game.username;

    document.getElementById('home-player-name').textContent =
      name ? `WELCOME BACK, ${name.toUpperCase()}` : 'PLAYING AS GUEST';
    document.getElementById('home-level-info').textContent =
      `${completed} OF ${total} LEVELS COMPLETE`;
    document.getElementById('home-progress-bar').style.width =
      `${Math.round((completed / total) * 100)}%`;

    const playBtn = document.getElementById('home-play-btn');
    if (completed >= total)  playBtn.textContent = '▶ PLAY AGAIN';
    else if (completed === 0) playBtn.textContent = '▶ START PLAYING';
    else                      playBtn.textContent = `▶ CONTINUE — LEVEL ${nextLvl}`;

    document.getElementById('home-screen').style.display = 'flex';
  }

  hideHomeScreen() { document.getElementById('home-screen').style.display = 'none'; }

  // ── Instructions ──────────────────────────────────────────
  showInstructions() { document.getElementById('instructions-modal').style.display = 'flex'; }
  hideInstructions() { document.getElementById('instructions-modal').style.display = 'none'; }

  // ── Settings ──────────────────────────────────────────────
  showSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
  hideSettings() { document.getElementById('settings-modal').style.display = 'none'; }

  // ── Free Play HUD helpers ─────────────────────────────────
  showFreePlayHUD(score, wave, best) {
    document.querySelectorAll('.score-label')[1].textContent = 'WAVE';
    document.getElementById('score-display').textContent = score.toLocaleString();
    document.getElementById('level-display').textContent = wave;
    document.getElementById('best-display').textContent  = best.toLocaleString();
  }

  resetLevelLabel() {
    document.querySelectorAll('.score-label')[1].textContent = 'LEVEL';
  }

  showFreePlayWaveClear(wave) {
    const el = document.getElementById('fp-wave-clear');
    document.getElementById('fp-wc-num').textContent = `WAVE ${wave}`;
    el.style.display = 'flex';
    // Reset animation by re-inserting children
    el.querySelectorAll('div').forEach(d => { d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; });
    setTimeout(() => { el.style.display = 'none'; }, 2400);
  }

  // ── Leaderboard ───────────────────────────────────────────
  _setupLeaderboard() {
    document.getElementById('leaderboard-btn').addEventListener('click', () => this.toggleLeaderboard());
    document.getElementById('leaderboard-close').addEventListener('click', () => this.hideLeaderboard());
  }

  toggleLeaderboard() {
    if (this.leaderboardOpen) this.hideLeaderboard();
    else this.showLeaderboard();
  }

  async showLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div style="color:rgba(0,200,255,0.5);font-size:10px;text-align:center;padding:20px;letter-spacing:2px;">LOADING...</div>';
    document.getElementById('leaderboard-panel').classList.add('open');
    this.leaderboardOpen = true;
    try {
      const res  = await fetch(`${API}/leaderboard`);
      const data = await res.json();
      list.innerHTML = '';
      if (!data.length) { list.innerHTML = '<div style="color:rgba(255,255,255,0.35);font-size:10px;text-align:center;padding:20px;letter-spacing:2px;">NO SCORES YET</div>'; return; }
      const rankClasses = ['gold', 'silver', 'bronze'];
      const rankSymbols = ['#1', '#2', '#3'];
      data.forEach((entry, i) => {
        const el = document.createElement('div');
        el.className = 'lb-entry';
        el.innerHTML = `<div class="${i < 3 ? `lb-rank ${rankClasses[i]}` : 'lb-rank'}">${i < 3 ? rankSymbols[i] : '#' + (i+1)}</div><div class="lb-username">${_esc(entry.username)}</div><div class="lb-info"><div class="lb-score">${entry.score.toLocaleString()}</div><div class="lb-level">LVL ${entry.level}</div></div>`;
        list.appendChild(el);
      });
    } catch { list.innerHTML = '<div style="color:#ff4444;font-size:10px;text-align:center;padding:20px;">Failed to load</div>'; }
  }

  hideLeaderboard() {
    document.getElementById('leaderboard-panel').classList.remove('open');
    this.leaderboardOpen = false;
  }

  // ── Levels panel ──────────────────────────────────────────
  _setupLevels() {
    document.getElementById('levels-btn').addEventListener('click', () => {
      this.renderLevelMap();
      this.toggleLevels();
    });
    document.getElementById('levels-close').addEventListener('click', () => this.hideLevels());
  }

  toggleLevels() {
    if (this.levelsOpen) this.hideLevels();
    else this.showLevels();
  }

  showLevels() {
    document.getElementById('levels-panel').classList.add('open');
    this.levelsOpen = true;
  }

  hideLevels() {
    document.getElementById('levels-panel').classList.remove('open');
    this.levelsOpen = false;
    if (this._returnToMainMenu) {
      this._returnToMainMenu = false;
      this.game.mainMenu.show();
    } else if (this._returnToHome) {
      this._returnToHome = false;
      this.showHomeScreen();
    }
  }

  renderLevelMap() {
    const progress = this.game.levelProgress;
    const map      = document.getElementById('levels-map');
    map.innerHTML  = '';

    const tiers = [
      { label: 'TIER 1 — BEGINNER',    start: 1,  end: 8  },
      { label: 'TIER 2 — EASY',        start: 9,  end: 16 },
      { label: 'TIER 3 — MEDIUM',      start: 17, end: 24 },
      { label: 'TIER 4 — HARD',        start: 25, end: 32 },
      { label: 'TIER 5 — EXPERT',      start: 33, end: 40 },
    ];

    const starStore = JSON.parse(localStorage.getItem('dz3d_stars') || '{}');

    tiers.forEach(({ label, start, end }, tierIdx) => {
      const tierLabel = document.createElement('div');
      tierLabel.className = 'tier-label';
      tierLabel.textContent = label;
      map.appendChild(tierLabel);

      const grid = document.createElement('div');
      grid.className = `levels-grid tier-${tierIdx}`;

      for (let n = start; n <= end; n++) {
        const done      = !!progress[n - 1];
        const unlocked  = this.game.isLevelUnlocked(n);
        const isCurrent = !done && unlocked;

        const tile = document.createElement('div');
        tile.className = `level-tile ${done ? 'done' : isCurrent ? 'active' : 'locked'}`;
        tile.title = `Level ${n}`;

        const stars = done ? (starStore[n] || 1) : 0;
        const starStr = done ? ('★'.repeat(stars) + '☆'.repeat(3 - stars)) : '';

        tile.innerHTML = `
          <span class="tile-num">${n}</span>
          ${done    ? `<span class="tile-check">✓</span>` : ''}
          ${!unlocked ? `<span class="tile-lock">🔒</span>` : ''}
          ${done    ? `<span class="tile-stars">${starStr}</span>` : ''}
        `;

        if (unlocked) {
          tile.addEventListener('click', () => {
            this._returnToHome     = false;
            this._returnToMainMenu = false;
            this.game.freePlayMode = false;
            this.hideLevels();
            this._fadeToLevel(n);
          });
        }

        grid.appendChild(tile);
      }

      map.appendChild(grid);
    });
  }

  // ── Level fade transition ─────────────────────────────────
  _fadeToLevel(n) {
    const fade = document.getElementById('level-fade');
    fade.classList.add('in');
    setTimeout(() => {
      this.game.startLevel(n);
      fade.classList.remove('in');
    }, 380);
  }

  // ── Level Complete overlay ────────────────────────────────
  _setupLevelComplete() {
    document.getElementById('lc-next-btn').addEventListener('click', () => {
      this.hideLevelComplete();
      const next = this.game.currentLevelNum + 1;
      if (next <= TOTAL_LEVELS) {
        this._fadeToLevel(next);
      } else {
        this._hideGameplayUI();
        this.renderLevelMap();
        this.showLevels();
      }
    });
    document.getElementById('lc-map-btn').addEventListener('click', () => {
      this.hideLevelComplete();
      this._hideGameplayUI();
      this.renderLevelMap();
      this.showLevels();
    });
  }

  showLevelComplete(levelNum, levelScore, stars) {
    // Persist stars
    const starStore = JSON.parse(localStorage.getItem('dz3d_stars') || '{}');
    if (!starStore[levelNum] || stars > starStore[levelNum]) {
      starStore[levelNum] = stars;
      localStorage.setItem('dz3d_stars', JSON.stringify(starStore));
    }

    const isLast = levelNum >= TOTAL_LEVELS;
    document.getElementById('lc-win-msg').style.display  = isLast ? 'block' : 'none';
    document.getElementById('lc-num').textContent        = levelNum;
    document.getElementById('lc-score-val').textContent  = levelScore.toLocaleString();
    document.getElementById('lc-next-btn').style.display = isLast ? 'none' : 'block';
    document.getElementById('lc-stars').textContent      = '';
    document.getElementById('level-complete').classList.add('visible');

    // Animate stars in one by one
    const starsEl = document.getElementById('lc-stars');
    starsEl.textContent = '☆☆☆';
    for (let i = 1; i <= 3; i++) {
      setTimeout(() => {
        const filled  = '★'.repeat(Math.min(i, stars));
        const empty   = '☆'.repeat(Math.max(0, 3 - Math.min(i, stars)));
        starsEl.textContent = filled + empty;
        if (i <= stars) starsEl.classList.add('star-pop');
        setTimeout(() => starsEl.classList.remove('star-pop'), 350);
      }, i * 420);
    }
  }

  hideLevelComplete() {
    document.getElementById('level-complete').classList.remove('visible');
  }

  // ── Game Over (level failed) ──────────────────────────────
  _setupGameOver() {
    document.getElementById('retry-btn').addEventListener('click', () => {
      this.hideGameOver();
      this._fadeToLevel(this.game.currentLevelNum);
    });
    document.getElementById('go-map-btn').addEventListener('click', () => {
      this.hideGameOver();
      this._hideGameplayUI();
      this.renderLevelMap();
      this.showLevels();
    });
  }

  showGameOver(score, levelNum) {
    document.getElementById('go-score-val').textContent = score.toLocaleString();
    document.getElementById('go-level-val').textContent = levelNum;
    document.getElementById('game-over').classList.add('visible');
  }

  hideGameOver() { document.getElementById('game-over').classList.remove('visible'); }

  // ── Auth ──────────────────────────────────────────────────
  hideAuth() { document.getElementById('auth-screen').style.display = 'none'; }
  showAuth()  { document.getElementById('auth-screen').style.display = 'flex'; }

  // ── HUD ───────────────────────────────────────────────────
  _hideGameplayUI() {
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('bubble-indicators').style.display = 'none';
    document.getElementById('bubble-progress-wrap').style.display = 'none';
    document.getElementById('special-legend').style.display = 'none';
    document.getElementById('combo-display').style.display = 'none';
  }

  showHUD() {
    document.getElementById('hud').style.display = 'block';
    document.getElementById('bubble-indicators').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'block';
    document.getElementById('bubble-progress-wrap').style.display = 'flex';
    document.getElementById('special-legend').style.display = 'block';
  }

  hideHUD() {
    document.getElementById('hud').style.display = 'none';
    document.getElementById('bubble-indicators').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
    document.getElementById('bubble-progress-wrap').style.display = 'none';
    document.getElementById('special-legend').style.display = 'none';
    document.getElementById('combo-display').style.display = 'none';
  }

  updateHUD(score, levelNum, best) {
    document.getElementById('score-display').textContent = score.toLocaleString();
    document.getElementById('level-display').textContent = `${levelNum}/40`;
    document.getElementById('best-display').textContent  = best.toLocaleString();
  }

  updateBubbleCount(remaining, total) {
    const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
    document.getElementById('bubble-count-text').textContent = `${remaining} LEFT`;
    document.getElementById('bubble-progress-bar').style.width = pct + '%';
    // Turn red when nearly done
    const bar = document.getElementById('bubble-progress-bar');
    if (remaining <= Math.ceil(total * 0.2)) {
      bar.style.background = 'linear-gradient(90deg, #ff4da6, #ff8800)';
    } else {
      bar.style.background = 'linear-gradient(90deg, #00c8ff, #00ff88)';
    }
  }

  updateCombo(streak, multiplier) {
    const el = document.getElementById('combo-display');
    if (streak <= 1) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const multEl = document.getElementById('combo-mult');
    multEl.textContent = multiplier.toFixed(1) + '×';
    // Retrigger scale-pop animation
    multEl.classList.remove('pop');
    void multEl.offsetWidth;
    multEl.classList.add('pop');
    document.getElementById('combo-label').textContent = `${streak} COMBO`;
  }

  updateCurrentBubble(colorHex) {
    const hex = '#' + colorHex.toString(16).padStart(6, '0');
    const el  = document.getElementById('current-bubble-preview');
    el.style.background = `radial-gradient(circle at 35% 35%, #fff8, ${hex})`;
    el.style.boxShadow  = `0 0 12px ${hex}`;
  }

  updateNextBubble(colorHex) {
    const hex = '#' + colorHex.toString(16).padStart(6, '0');
    const el  = document.getElementById('next-bubble-preview');
    el.style.background = `radial-gradient(circle at 35% 35%, #fff8, ${hex})`;
    el.style.boxShadow  = `0 0 12px ${hex}`;
  }

  showMiniText(msg) {
    const el = document.getElementById('mini-text');
    el.textContent = msg;
    if (!el.classList.contains('visible')) el.classList.add('visible');
    clearTimeout(this._miniTextTimer);
    this._miniTextTimer = setTimeout(() => el.classList.remove('visible'), 1800);
  }

  // ── Celebration ───────────────────────────────────────────
  showCelebration(msg) {
    const el = document.getElementById('speech-bubble');
    el.textContent = msg;
    el.classList.remove('hiding');
    void el.offsetWidth;
    el.classList.add('visible');
  }

  hideCelebration() {
    const el = document.getElementById('speech-bubble');
    if (!el.classList.contains('visible')) return;
    el.classList.add('hiding');
    setTimeout(() => el.classList.remove('visible', 'hiding'), 480);
  }
}

function _esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
