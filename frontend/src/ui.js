const API = 'http://localhost:4001/api';

export class UI {
  constructor(game) {
    this.game = game;
    this.leaderboardOpen = false;
    this._setupTabs();
    this._setupForms();
    this._setupLeaderboard();
    this._setupGameOver();
  }

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

  _setupForms() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';
      try {
        const res = await fetch(`${API}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.game.setAuth(data.token, data.username);
        this.hideAuth();
        this.game.startGame();
      } catch {
        errEl.textContent = 'Cannot connect to server';
      }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('reg-username').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm  = document.getElementById('reg-confirm').value;
      const errEl = document.getElementById('register-error');
      errEl.textContent = '';
      if (password !== confirm) { errEl.textContent = 'Passwords do not match'; return; }
      try {
        const res = await fetch(`${API}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.game.setAuth(data.token, data.username);
        this.hideAuth();
        this.game.startGame();
      } catch {
        errEl.textContent = 'Cannot connect to server';
      }
    });

    document.getElementById('guest-btn').addEventListener('click', () => {
      this.hideAuth();
      this.game.startGame();
    });
  }

  _setupLeaderboard() {
    document.getElementById('leaderboard-btn').addEventListener('click', () => this.toggleLeaderboard());
    document.getElementById('leaderboard-close').addEventListener('click', () => this.hideLeaderboard());
    document.getElementById('go-lb-btn').addEventListener('click', () => {
      this.hideGameOver();
      this.showLeaderboard();
    });
  }

  _setupGameOver() {
    document.getElementById('play-again-btn').addEventListener('click', () => {
      this.hideGameOver();
      this.game.startGame();
    });
  }

  // ── Auth ──
  hideAuth() { document.getElementById('auth-screen').style.display = 'none'; }
  showAuth()  { document.getElementById('auth-screen').style.display = 'flex'; }

  // ── HUD ──
  showHUD() {
    document.getElementById('hud').style.display = 'block';
    document.getElementById('bubble-indicators').style.display = 'flex';
    document.getElementById('crosshair').style.display = 'block';
  }
  hideHUD() {
    document.getElementById('hud').style.display = 'none';
    document.getElementById('bubble-indicators').style.display = 'none';
    document.getElementById('crosshair').style.display = 'none';
  }

  updateHUD(score, level, best) {
    document.getElementById('score-display').textContent = score.toLocaleString();
    document.getElementById('level-display').textContent = level;
    document.getElementById('best-display').textContent = best.toLocaleString();
  }

  updateCurrentBubble(colorHex) {
    const hex = '#' + colorHex.toString(16).padStart(6, '0');
    const el = document.getElementById('current-bubble-preview');
    el.style.background = `radial-gradient(circle at 35% 35%, #fff8, ${hex})`;
    el.style.boxShadow = `0 0 12px ${hex}`;
  }

  updateNextBubble(colorHex) {
    const hex = '#' + colorHex.toString(16).padStart(6, '0');
    const el = document.getElementById('next-bubble-preview');
    el.style.background = `radial-gradient(circle at 35% 35%, #fff8, ${hex})`;
    el.style.boxShadow = `0 0 12px ${hex}`;
  }

  showMiniText(msg) {
    const el = document.getElementById('mini-text');
    el.textContent = msg;
    if (!el.classList.contains('visible')) el.classList.add('visible');
    clearTimeout(this._miniTextTimer);
    this._miniTextTimer = setTimeout(() => el.classList.remove('visible'), 1800);
  }

  // ── Leaderboard ──
  async toggleLeaderboard() {
    if (this.leaderboardOpen) this.hideLeaderboard();
    else await this.showLeaderboard();
  }

  async showLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '<div style="color:rgba(0,200,255,0.5);font-size:10px;text-align:center;padding:20px;letter-spacing:2px;">LOADING...</div>';
    document.getElementById('leaderboard-panel').classList.add('open');
    this.leaderboardOpen = true;

    try {
      const res = await fetch(`${API}/leaderboard`);
      const data = await res.json();
      list.innerHTML = '';
      if (!data.length) {
        list.innerHTML = '<div style="color:rgba(255,255,255,0.35);font-size:10px;text-align:center;padding:20px;letter-spacing:2px;">NO SCORES YET</div>';
        return;
      }
      const rankClasses = ['gold', 'silver', 'bronze'];
      const rankSymbols = ['#1', '#2', '#3'];
      data.forEach((entry, i) => {
        const el = document.createElement('div');
        el.className = 'lb-entry';
        const rankCls = i < 3 ? `lb-rank ${rankClasses[i]}` : 'lb-rank';
        el.innerHTML = `
          <div class="${rankCls}">${i < 3 ? rankSymbols[i] : '#' + (i+1)}</div>
          <div class="lb-username">${_esc(entry.username)}</div>
          <div class="lb-info">
            <div class="lb-score">${entry.score.toLocaleString()}</div>
            <div class="lb-level">LVL ${entry.level}</div>
          </div>`;
        list.appendChild(el);
      });
    } catch {
      list.innerHTML = '<div style="color:#ff4444;font-size:10px;text-align:center;padding:20px;">Failed to load</div>';
    }
  }

  hideLeaderboard() {
    document.getElementById('leaderboard-panel').classList.remove('open');
    this.leaderboardOpen = false;
  }

  // ── Game Over ──
  showGameOver(score, level, scoreSaved) {
    document.getElementById('go-score-val').textContent = score.toLocaleString();
    document.getElementById('go-level-val').textContent = level;
    document.getElementById('go-saved').textContent = scoreSaved ? '✓ SCORE SAVED' : '';
    document.getElementById('game-over').classList.add('visible');
  }
  hideGameOver() { document.getElementById('game-over').classList.remove('visible'); }

  // ── Celebration ──
  showCelebration(msg) {
    const el = document.getElementById('speech-bubble');
    el.textContent = msg;
    el.classList.remove('hiding');
    void el.offsetWidth; // reflow to restart animation
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
