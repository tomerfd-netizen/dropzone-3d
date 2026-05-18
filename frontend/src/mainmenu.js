const API = import.meta.env.VITE_API_URL || 'http://localhost:4001/api';

export class MainMenu {
  constructor(game) {
    this.game  = game;
    this._frame = null;
    this._prevTs = 0;
    this._stars  = [];
    this._nebulae = [];
    this._robotClickCount = 0;
    this._robotClickTimer = null;

    this._initParticles();
    this._bindEvents();
  }

  // ── Starfield + nebula init ──────────────────────────────
  _initParticles() {
    for (let i = 0; i < 300; i++) {
      this._stars.push({
        x: Math.random(), y: Math.random(),
        r:   0.4 + Math.random() * 1.5,
        ph:  Math.random() * Math.PI * 2,
        spd: 0.35 + Math.random() * 1.1,
        dx:  (Math.random() - 0.5) * 0.000035,
        dy:  (Math.random() - 0.5) * 0.000018,
      });
    }
    this._nebulae = [
      { cx: 0.18, cy: 0.22, rx: 0.32, r: 88,  g: 18,  b: 185, a: 0.075 },
      { cx: 0.80, cy: 0.38, rx: 0.26, r: 18,  g: 58,  b: 210, a: 0.065 },
      { cx: 0.52, cy: 0.78, rx: 0.30, r: 115, g: 12,  b: 145, a: 0.070 },
      { cx: 0.28, cy: 0.68, rx: 0.22, r: 28,  g: 42,  b: 190, a: 0.050 },
      { cx: 0.88, cy: 0.14, rx: 0.20, r: 72,  g: 18,  b: 205, a: 0.048 },
    ];
  }

  // ── Event wiring ─────────────────────────────────────────
  _bindEvents() {
    document.getElementById('mm-levels-btn').addEventListener('click', () => {
      this.game.audio.resume();
      this.hide();
      this.game.ui._returnToMainMenu = true;
      this.game.ui.renderLevelMap();
      this.game.ui.showLevels();
    });

    document.getElementById('mm-freeplay-btn').addEventListener('click', () => {
      this.game.audio.resume();
      this.hide();
      this.game.startFreePlay();
    });

    document.getElementById('mm-lb-btn').addEventListener('click', () => {
      this.game.ui.showLeaderboard();
    });

    document.getElementById('mm-logout-btn2').addEventListener('click', () => {
      this.hide();
      this.game.setAuth(null, null);
      this.game.ui.hideHUD();
      this.game.ui._hideGameplayUI();
      this.game.ui.showAuth();
    });

    // Triple-click robot → admin page
    document.getElementById('mm-robot').addEventListener('click', () => {
      this._robotClickCount++;
      clearTimeout(this._robotClickTimer);
      this._robotClickTimer = setTimeout(() => { this._robotClickCount = 0; }, 650);
      if (this._robotClickCount >= 3) {
        this._robotClickCount = 0;
        this._openAdmin();
      }
    });

    document.getElementById('admin-back').addEventListener('click', () => {
      document.getElementById('admin-screen').style.display = 'none';
    });
    document.getElementById('admin-screen').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) document.getElementById('admin-screen').style.display = 'none';
    });
  }

  // ── Admin page ───────────────────────────────────────────
  async _openAdmin() {
    const screen = document.getElementById('admin-screen');
    const body   = document.getElementById('admin-body');
    body.innerHTML = '<div style="color:rgba(0,200,255,0.5);font-size:10px;text-align:center;padding:28px;letter-spacing:2px;">LOADING...</div>';
    screen.style.display = 'flex';
    try {
      const data = await fetch(`${API}/admin/stats`).then(r => r.json());
      const rankCol = ['#ffd700', '#c0c0c0', '#cd7f32'];
      body.innerHTML = `
        <div class="admin-stats-row">
          <div class="admin-stat-box">
            <div class="admin-stat-label">TOTAL USERS</div>
            <div class="admin-stat-val">${data.totalUsers}</div>
          </div>
          <div class="admin-stat-box">
            <div class="admin-stat-label">GAMES PLAYED</div>
            <div class="admin-stat-val">${data.totalGames}</div>
          </div>
        </div>
        <div class="admin-section-title">TOP 5 SCORES</div>
        <div>
          ${data.top5Scores.map((s, i) => `
            <div class="admin-list-row">
              <span class="admin-rank" style="color:${rankCol[i] || 'rgba(0,200,255,0.7)'}">#${i + 1}</span>
              <span class="admin-name">${_esc(s.username)}</span>
              <span class="admin-score">${s.score.toLocaleString()}</span>
              <span class="admin-level">LVL ${s.level}</span>
            </div>`).join('')}
        </div>
        <div class="admin-section-title">RECENT ACTIVITY</div>
        <div>
          ${data.recentScores.map(s => `
            <div class="admin-list-row">
              <span class="admin-name">${_esc(s.username)}</span>
              <span class="admin-score">${s.score.toLocaleString()}</span>
              <span class="admin-level">LVL ${s.level}</span>
              <span class="admin-date">${new Date(s.date).toLocaleDateString()}</span>
            </div>`).join('')}
        </div>`;
    } catch {
      body.innerHTML = '<div style="color:#ff4444;font-size:10px;text-align:center;padding:28px;">Failed to load stats</div>';
    }
  }

  // ── Public API ───────────────────────────────────────────
  show() {
    this._refreshInfo();
    document.getElementById('main-menu').style.display = 'flex';
    this._startLoop();
  }

  hide() {
    document.getElementById('main-menu').style.display = 'none';
    this._stopLoop();
  }

  _refreshInfo() {
    const username = this.game.username;
    const best     = this.game.bestScore;
    document.getElementById('mm-uname').textContent =
      username ? username.toUpperCase() : 'GUEST';
    document.getElementById('mm-best').textContent =
      best > 0 ? `BEST: ${best.toLocaleString()}` : '';
  }

  // ── Render loop ──────────────────────────────────────────
  _startLoop() {
    this._stopLoop();
    const loop = (ts) => {
      const dt = ts - (this._prevTs || ts);
      this._prevTs = ts;
      this._drawBg(ts);
      this._drawRobot(ts);
      this._frame = requestAnimationFrame(loop);
    };
    this._frame = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this._frame != null) { cancelAnimationFrame(this._frame); this._frame = null; }
  }

  // ── Background canvas ────────────────────────────────────
  _drawBg(ts) {
    const canvas = document.getElementById('mm-bg');
    const W = window.innerWidth, H = window.innerHeight;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#07071a';
    ctx.fillRect(0, 0, W, H);

    // Nebulae — radial gradients, very subtle
    for (const n of this._nebulae) {
      const x = n.cx * W, y = n.cy * H, r = n.rx * Math.min(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0,   `rgba(${n.r},${n.g},${n.b},${n.a})`);
      g.addColorStop(0.5, `rgba(${n.r},${n.g},${n.b},${n.a * 0.3})`);
      g.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Stars — slowly drifting, twinkling
    for (const s of this._stars) {
      s.x = (s.x + s.dx + 1) % 1;
      s.y = (s.y + s.dy + 1) % 1;
      const tw = (Math.sin(ts * s.spd * 0.001 + s.ph) + 1) * 0.5;
      const a  = 0.2 + tw * 0.8;
      const r  = s.r * (0.65 + tw * 0.5);
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fill();
    }
  }

  // ── Robot canvas ─────────────────────────────────────────
  _drawRobot(ts) {
    const canvas = document.getElementById('mm-robot');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 140, 210);

    const bob      = Math.sin(ts * 0.001 * Math.PI) * 6;         // ±6px, 2s period
    const glow     = (Math.sin(ts * 0.0025) + 1) * 0.5;           // 0-1 pulse
    const blinking = (ts % 3400) > 3240;                           // blink near end of 3.4s cycle
    const cx       = 70;
    const gy       = 198 + bob;                                    // ground reference Y

    const rr = (x, y, w, h, r) => {
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else {
        const m = Math.min(r, w / 2, h / 2);
        ctx.moveTo(x + m, y);
        ctx.lineTo(x + w - m, y);
        ctx.arcTo(x + w, y, x + w, y + m, m);
        ctx.lineTo(x + w, y + h - m);
        ctx.arcTo(x + w, y + h, x + w - m, y + h, m);
        ctx.lineTo(x + m, y + h);
        ctx.arcTo(x, y + h, x, y + h - m, m);
        ctx.lineTo(x, y + m);
        ctx.arcTo(x, y, x + m, y, m);
        ctx.closePath();
      }
    };

    // Shadow (inversely sized with bob height)
    ctx.beginPath();
    ctx.ellipse(cx, 205, 30 - bob * 0.5, 7 - bob * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${(0.20 - bob * 0.01).toFixed(2)})`;
    ctx.fill();

    // Feet
    const footColor = '#0d0d26';
    rr(cx - 39, gy - 14, 30, 11, 4); ctx.fillStyle = footColor; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.2; ctx.stroke();
    rr(cx + 9,  gy - 14, 30, 11, 4); ctx.fillStyle = footColor; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.2; ctx.stroke();

    // Legs
    const legColor = '#121230';
    rr(cx - 34, gy - 42, 22, 30, 5); ctx.fillStyle = legColor; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.4; ctx.stroke();
    rr(cx + 12, gy - 42, 22, 30, 5); ctx.fillStyle = legColor; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.4; ctx.stroke();

    // Body
    rr(cx - 36, gy - 102, 72, 62, 10);
    ctx.fillStyle = '#0c0c27'; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.8; ctx.stroke();

    // Chest panel glow
    rr(cx - 22, gy - 92, 44, 32, 6);
    ctx.fillStyle = `rgba(0,200,255,${(0.04 + glow * 0.08).toFixed(3)})`; ctx.fill();
    ctx.strokeStyle = `rgba(0,200,255,${(0.28 + glow * 0.32).toFixed(3)})`; ctx.lineWidth = 1; ctx.stroke();

    // Chest indicator dots
    [['#00ff88', -14], ['#00c8ff', 0], ['#ff4da6', 14]].forEach(([color, dx]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, gy - 72, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5 + glow * 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Arms
    const armColor = '#0e0e2a';
    rr(cx - 52, gy - 96, 16, 40, 6); ctx.fillStyle = armColor; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.4; ctx.stroke();
    rr(cx + 36, gy - 96, 16, 40, 6); ctx.fillStyle = armColor; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 1.4; ctx.stroke();

    // Head
    rr(cx - 38, gy - 150, 76, 50, 12);
    ctx.fillStyle = '#0c0c27'; ctx.fill();
    ctx.strokeStyle = '#00c8ff'; ctx.lineWidth = 2; ctx.stroke();

    // Visor slit
    rr(cx - 28, gy - 134, 56, 14, 5);
    ctx.fillStyle = `rgba(0,200,255,${(0.07 + glow * 0.07).toFixed(3)})`; ctx.fill();
    ctx.strokeStyle = 'rgba(0,200,255,0.22)'; ctx.lineWidth = 1; ctx.stroke();

    // Eyes
    const eyeY = gy - 142;
    const eyeGlowA = (0.6 + glow * 0.4).toFixed(2);
    if (blinking) {
      ctx.strokeStyle = `rgba(0,200,255,${eyeGlowA})`;
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 24, eyeY); ctx.lineTo(cx - 9, eyeY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 9,  eyeY); ctx.lineTo(cx + 24, eyeY); ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      [-15, 15].forEach(dx => {
        // Eye socket
        ctx.beginPath(); ctx.arc(cx + dx, eyeY, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#01122a'; ctx.fill();
        ctx.strokeStyle = `rgba(0,200,255,${eyeGlowA})`; ctx.lineWidth = 1.5; ctx.stroke();
        // Pupil glow
        ctx.beginPath(); ctx.arc(cx + dx, eyeY, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${eyeGlowA})`; ctx.fill();
        // Specular shine
        ctx.beginPath(); ctx.arc(cx + dx - 2.5, eyeY - 3, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fill();
      });
    }

    // Antenna stick
    ctx.beginPath();
    ctx.moveTo(cx, gy - 150);
    ctx.lineTo(cx, gy - 182);
    ctx.strokeStyle = `rgba(0,200,255,${(0.55 + glow * 0.3).toFixed(2)})`;
    ctx.lineWidth = 2; ctx.stroke();

    // Antenna tip — glowing orb
    const tipY  = gy - 185;
    const tipA  = 0.6 + glow * 0.4;
    const tipG  = ctx.createRadialGradient(cx, tipY, 0, cx, tipY, 11);
    tipG.addColorStop(0, `rgba(0,220,255,${tipA.toFixed(2)})`);
    tipG.addColorStop(0.5, `rgba(0,200,255,${(tipA * 0.4).toFixed(2)})`);
    tipG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tipG;
    ctx.beginPath(); ctx.arc(cx, tipY, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, tipY, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,230,255,${tipA.toFixed(2)})`; ctx.fill();
  }
}

function _esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
