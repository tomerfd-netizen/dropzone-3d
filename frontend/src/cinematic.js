// Cinematic overlay — 2D canvas robot character, 6-second sequence

const TOTAL      = 6.0;
const SLIDE_IN   = 1.2;   // phase 1 ends
const IDLE_END   = 4.8;   // phase 2 ends, phase 3 begins

export class Cinematic {
  constructor(onEnd) {
    this.onEnd   = onEnd;
    this.canvas  = null;
    this.ctx     = null;
    this.active  = false;
    this.raf     = null;
    this.startTime = 0;
    this.mode    = 'walk'; // 'walk' | 'ship'
    this.message = '';
  }

  start(message) {
    if (this.active) return;
    this.active  = true;
    this.message = message;
    this.mode    = Math.random() < 0.5 ? 'walk' : 'ship';
    this.startTime = performance.now();

    const dpr = window.devicePixelRatio || 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width  = window.innerWidth  * dpr;
    this.canvas.height = window.innerHeight * dpr;
    Object.assign(this.canvas.style, {
      position: 'fixed', top: '0', left: '0',
      width:  window.innerWidth  + 'px',
      height: window.innerHeight + 'px',
      zIndex: '500',
      pointerEvents: 'none',
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(dpr, dpr);

    this._tick();
  }

  cancel() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.canvas) { this.canvas.remove(); this.canvas = null; }
    // does NOT call onEnd
  }

  _tick() {
    const t = (performance.now() - this.startTime) / 1000;
    if (t >= TOTAL) { this._finish(); return; }
    this._draw(t);
    this.raf = requestAnimationFrame(() => this._tick());
  }

  _finish() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.canvas) { this.canvas.remove(); this.canvas = null; }
    if (this.onEnd) this.onEnd();
  }

  // ─────────────────────────────────────────────────────────
  _draw(t) {
    const W  = window.innerWidth;
    const H  = window.innerHeight;
    const cx = this.ctx;
    cx.clearRect(0, 0, W, H);

    // ── Letterbox band ──
    const bandAlpha = t < 0.35 ? (t / 0.35) * 0.58
                    : t > 5.65 ? ((TOTAL - t) / 0.35) * 0.58
                    : 0.58;
    cx.fillStyle = `rgba(0,0,0,${bandAlpha})`;
    cx.fillRect(0, H / 2 - 115, W, 230);

    // Subtle cyan border lines on the band
    cx.strokeStyle = `rgba(0,200,255,${bandAlpha * 0.4})`;
    cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(0, H / 2 - 115); cx.lineTo(W, H / 2 - 115); cx.stroke();
    cx.beginPath(); cx.moveTo(0, H / 2 + 115); cx.lineTo(W, H / 2 + 115); cx.stroke();

    // ── Character X position ──
    const CX = W / 2;
    let charX;
    if (t < SLIDE_IN) {
      charX = -160 + (CX + 160) * this._easeOut(t / SLIDE_IN);
    } else if (t < IDLE_END) {
      charX = CX;
    } else {
      charX = CX + (W + 160) * this._easeIn((t - IDLE_END) / (TOTAL - IDLE_END));
    }

    const charY = H / 2;
    const inIdle = t >= SLIDE_IN && t < IDLE_END;

    // ── Draw character ──
    if (this.mode === 'walk') {
      this._drawWalker(cx, charX, charY, t, inIdle);
    } else {
      this._drawShip(cx, charX, charY, t);
    }

    // ── Speech bubble ──
    if (inIdle) {
      const appear = Math.min(1, (t - SLIDE_IN) / 0.4);
      const vanish = t > 4.3 ? Math.max(0, (IDLE_END - t) / 0.5) : 1;
      const bubbleAlpha = appear * vanish;

      const shipBobY = this.mode === 'ship' ? Math.sin(t * 2.8) * 4 : 0;
      const idleBobY = this.mode === 'walk' ? Math.sin((t - SLIDE_IN) * 3.5) * 5 : 0;

      this._drawSpeechBubble(cx, charX, charY + idleBobY + shipBobY - 86, this.message, bubbleAlpha);
    }
  }

  // ── Walking robot ─────────────────────────────────────────
  _drawWalker(cx, cx2, cy, t, idle) {
    const bobY = idle ? Math.sin((t - SLIDE_IN) * 3.5) * 5 : Math.sin(t * 9) * 1.5;
    cx.save();
    cx.translate(cx2, cy + bobY);

    // Leg step (always animate while walking, gentle idle march when stationary)
    const stepRate = idle ? 1.6 : 3.2;
    const stepAmt  = idle ? 0.18 : 0.34;
    const step = Math.sin(t * stepRate * Math.PI * 2) * stepAmt;
    this._leg(cx, -13, 24, step, t);
    this._leg(cx, 13, 24, -step, t);

    // Body
    this._rr(cx, -25, -22, 50, 50, 9, '#2a2a5a');
    this._rr(cx, -18, -14, 36, 14, 4, '#3d3d7a');
    // Chest glow
    cx.fillStyle = '#00c8ff'; cx.shadowColor = '#00c8ff'; cx.shadowBlur = 14;
    cx.beginPath(); cx.arc(0, 10, 6, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;
    // Side vents
    this._rr(cx, -25, -2, 5, 18, 2, '#1a1a44');
    this._rr(cx, 20, -2, 5, 18, 2, '#1a1a44');

    // Arms
    this._rr(cx, -41, -17, 14, 32, 5, '#2a2a5a');
    this._rr(cx, 27, -17, 14, 32, 5, '#2a2a5a');
    this._circ(cx, -34, -17, 5, '#3d3d7a');
    this._circ(cx, 34, -17, 5, '#3d3d7a');

    // Head
    this._rr(cx, -22, -64, 44, 40, 10, '#2a2a5a');
    this._rr(cx, -16, -57, 32, 9, 3, '#3d3d7a');
    // Head side panels
    this._rr(cx, -22, -52, 5, 12, 2, '#1e1e4e');
    this._rr(cx, 17, -52, 5, 12, 2, '#1e1e4e');

    // Eyes (blink)
    const blink = Math.sin(t * 1.5 + 0.8) > 0.91 ? 0.08 : 1;
    cx.fillStyle = '#00ffff'; cx.shadowColor = '#00ffff'; cx.shadowBlur = 12;
    cx.beginPath(); cx.ellipse(-11, -43, 7, 7 * blink, 0, 0, Math.PI * 2); cx.fill();
    cx.beginPath(); cx.ellipse(11, -43, 7, 7 * blink, 0, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;
    // Eye shine
    if (blink > 0.5) {
      cx.fillStyle = 'rgba(255,255,255,0.5)';
      cx.beginPath(); cx.arc(-9, -46, 2, 0, Math.PI * 2); cx.fill();
      cx.beginPath(); cx.arc(13, -46, 2, 0, Math.PI * 2); cx.fill();
    }

    // Mouth (little line)
    cx.strokeStyle = '#00c8ff'; cx.lineWidth = 2; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(-6, -29); cx.lineTo(6, -29); cx.stroke();

    // Antenna
    cx.strokeStyle = '#5555cc'; cx.lineWidth = 3; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(0, -64); cx.lineTo(0, -80); cx.stroke();
    const ag = 0.5 + 0.5 * Math.sin(t * 5.5);
    cx.fillStyle = '#00c8ff'; cx.shadowColor = '#00c8ff'; cx.shadowBlur = 8 + ag * 12;
    cx.beginPath(); cx.arc(0, -83, 5, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;

    cx.restore();
  }

  _leg(cx, x, y, angle, t) {
    cx.save();
    cx.translate(x, y);
    cx.rotate(angle);
    this._rr(cx, -6, 0, 13, 22, 4, '#2a2a5a');
    this._rr(cx, -5, 21, 11, 17, 3, '#3d3d7a');
    this._rr(cx, -8, 35, 17, 8, 3, '#2a2a5a');
    cx.restore();
  }

  // ── Ship robot ────────────────────────────────────────────
  _drawShip(cx, cx2, cy, t) {
    const bob = Math.sin(t * 2.8) * 4;
    cx.save();
    cx.translate(cx2, cy + bob);

    // Engine trail (during slide-in and slide-out)
    const moving = t < SLIDE_IN || t >= IDLE_END;
    if (moving) {
      const trailDir = t < IDLE_END ? -1 : 1; // trail is behind travel direction
      const strength = t < SLIDE_IN
        ? this._easeOut(t / SLIDE_IN) * 0.75
        : this._easeOut((TOTAL - t) / (TOTAL - IDLE_END)) * 0.75;
      const grad = cx.createLinearGradient(trailDir * 12, 20, trailDir * 100, 20);
      grad.addColorStop(0, `rgba(0,200,255,${strength})`);
      grad.addColorStop(0.6, `rgba(0,100,255,${strength * 0.4})`);
      grad.addColorStop(1, 'rgba(0,80,200,0)');
      cx.fillStyle = grad;
      cx.beginPath();
      cx.ellipse(trailDir * 55, 22, 60, 11, 0, 0, Math.PI * 2);
      cx.fill();

      // Particle sparks
      cx.fillStyle = `rgba(0,220,255,${strength * 0.6})`;
      for (let i = 0; i < 4; i++) {
        const px = trailDir * (30 + i * 18 + Math.sin(t * 12 + i) * 6);
        const py = 20 + Math.sin(t * 9 + i * 1.5) * 6;
        cx.beginPath();
        cx.arc(px, py, 2 - i * 0.3, 0, Math.PI * 2);
        cx.fill();
      }
    }

    // Glow under hull
    const gp = 0.65 + 0.35 * Math.sin(t * 4.2);
    const ug = cx.createRadialGradient(0, 36, 0, 0, 36, 52);
    ug.addColorStop(0, `rgba(0,160,255,${0.55 * gp})`);
    ug.addColorStop(1, 'rgba(0,60,200,0)');
    cx.fillStyle = ug;
    cx.beginPath(); cx.ellipse(0, 36, 50, 18, 0, 0, Math.PI * 2); cx.fill();

    // Hull
    this._rr(cx, -50, 8, 100, 26, 13, '#1e1e4a');
    this._rr(cx, -42, 8, 84, 11, 6, '#3d3d7a');
    // Hull accent stripe
    cx.fillStyle = 'rgba(0,200,255,0.18)';
    cx.beginPath(); cx.ellipse(0, 12, 28, 4, 0, 0, Math.PI * 2); cx.fill();

    // Cockpit glass
    cx.fillStyle = 'rgba(0,200,255,0.14)';
    cx.strokeStyle = 'rgba(0,200,255,0.6)';
    cx.lineWidth = 1.5;
    cx.beginPath(); cx.ellipse(0, 6, 20, 14, 0, 0, Math.PI * 2);
    cx.fill(); cx.stroke();
    // Cockpit reflection
    cx.fillStyle = 'rgba(255,255,255,0.12)';
    cx.beginPath(); cx.ellipse(-5, 0, 8, 5, -0.4, 0, Math.PI * 2); cx.fill();

    // Engine nozzles
    [-30, 0, 30].forEach((nx, i) => {
      this._circ(cx, nx, 32, 6, '#0044bb');
      const ep = 0.5 + 0.5 * Math.sin(t * 5 + i * 1.2);
      cx.fillStyle = '#00c8ff'; cx.shadowColor = '#00c8ff'; cx.shadowBlur = 8 + ep * 8;
      cx.beginPath(); cx.arc(nx, 32, 3.5, 0, Math.PI * 2); cx.fill();
      cx.shadowBlur = 0;
    });

    // ── Robot body seated in cockpit ──
    this._rr(cx, -22, -32, 44, 38, 8, '#2a2a5a');
    this._rr(cx, -15, -25, 30, 13, 4, '#3d3d7a');
    cx.fillStyle = '#00c8ff'; cx.shadowColor = '#00c8ff'; cx.shadowBlur = 10;
    cx.beginPath(); cx.arc(0, -13, 5, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;
    // Side vents
    this._rr(cx, -22, -14, 4, 14, 2, '#1a1a44');
    this._rr(cx, 18, -14, 4, 14, 2, '#1a1a44');

    // Arms (angled outward slightly)
    this._rr(cx, -38, -28, 14, 26, 5, '#2a2a5a');
    this._rr(cx, 24, -28, 14, 26, 5, '#2a2a5a');
    this._circ(cx, -31, -28, 5, '#3d3d7a');
    this._circ(cx, 31, -28, 5, '#3d3d7a');

    // Head
    this._rr(cx, -20, -70, 40, 37, 9, '#2a2a5a');
    this._rr(cx, -14, -63, 28, 9, 3, '#3d3d7a');
    this._rr(cx, -20, -53, 5, 12, 2, '#1e1e4e');
    this._rr(cx, 15, -53, 5, 12, 2, '#1e1e4e');

    // Eyes
    const blink = Math.sin(t * 1.5 + 0.8) > 0.91 ? 0.08 : 1;
    cx.fillStyle = '#00ffff'; cx.shadowColor = '#00ffff'; cx.shadowBlur = 10;
    cx.beginPath(); cx.ellipse(-10, -51, 6.5, 6.5 * blink, 0, 0, Math.PI * 2); cx.fill();
    cx.beginPath(); cx.ellipse(10, -51, 6.5, 6.5 * blink, 0, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;
    if (blink > 0.5) {
      cx.fillStyle = 'rgba(255,255,255,0.5)';
      cx.beginPath(); cx.arc(-8, -54, 1.8, 0, Math.PI * 2); cx.fill();
      cx.beginPath(); cx.arc(12, -54, 1.8, 0, Math.PI * 2); cx.fill();
    }

    // Mouth
    cx.strokeStyle = '#00c8ff'; cx.lineWidth = 2; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(-5, -38); cx.lineTo(5, -38); cx.stroke();

    // Antenna
    cx.strokeStyle = '#5555cc'; cx.lineWidth = 2.5; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(0, -70); cx.lineTo(0, -84); cx.stroke();
    const ag = 0.5 + 0.5 * Math.sin(t * 5.5);
    cx.fillStyle = '#00c8ff'; cx.shadowColor = '#00c8ff'; cx.shadowBlur = 8 + ag * 12;
    cx.beginPath(); cx.arc(0, -87, 4.5, 0, Math.PI * 2); cx.fill();
    cx.shadowBlur = 0;

    cx.restore();
  }

  // ── Speech bubble ──────────────────────────────────────────
  _drawSpeechBubble(cx, x, y, text, alpha) {
    if (alpha <= 0) return;
    const sc = this._springScale(Math.min(1, alpha * 2.2));

    cx.save();
    cx.translate(x, y);
    cx.scale(sc, sc);
    cx.globalAlpha = Math.min(1, alpha * 1.8);

    cx.font = "bold 16px 'Orbitron', monospace";
    const tw  = cx.measureText(text).width;
    const pad = 24;
    const bw  = tw + pad * 2;
    const bh  = 48;
    const bx  = -bw / 2;
    const by  = -bh - 20;
    const r   = 12;

    // Glow
    cx.shadowColor = 'rgba(0,200,255,0.6)';
    cx.shadowBlur  = 20;

    // Bubble body (manual roundRect for compatibility)
    cx.fillStyle = '#ffffff';
    cx.beginPath();
    cx.moveTo(bx + r, by);
    cx.lineTo(bx + bw - r, by);
    cx.arcTo(bx + bw, by,        bx + bw, by + r,      r);
    cx.lineTo(bx + bw, by + bh - r);
    cx.arcTo(bx + bw, by + bh,   bx + bw - r, by + bh, r);
    cx.lineTo(16, by + bh);
    cx.lineTo(0,  by + bh + 18);  // pointer tip
    cx.lineTo(-16, by + bh);
    cx.lineTo(bx + r, by + bh);
    cx.arcTo(bx, by + bh,  bx, by + bh - r, r);
    cx.lineTo(bx, by + r);
    cx.arcTo(bx, by, bx + r, by, r);
    cx.closePath();
    cx.fill();
    cx.shadowBlur = 0;

    // Cyan outline
    cx.strokeStyle = 'rgba(0,200,255,0.35)';
    cx.lineWidth   = 1.5;
    cx.stroke();

    // Text
    cx.fillStyle      = '#1a1a3a';
    cx.textAlign      = 'center';
    cx.textBaseline   = 'middle';
    cx.shadowBlur     = 0;
    cx.globalAlpha    = 1;
    cx.fillText(text, 0, by + bh / 2 + 1);

    cx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────
  _springScale(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < 0.55) return (t / 0.55) * 1.24;
    return 1.24 - ((t - 0.55) / 0.45) * 0.24;
  }

  _easeOut(t) { return 1 - (1 - Math.min(1, t)) ** 3; }
  _easeIn(t)  { return Math.min(1, t) ** 3; }

  _rr(cx, x, y, w, h, r, color) {
    cx.fillStyle = color;
    cx.beginPath();
    cx.moveTo(x + r, y);
    cx.lineTo(x + w - r, y);
    cx.arcTo(x + w, y,        x + w, y + r,      r);
    cx.lineTo(x + w, y + h - r);
    cx.arcTo(x + w, y + h,   x + w - r, y + h,   r);
    cx.lineTo(x + r, y + h);
    cx.arcTo(x, y + h,  x, y + h - r, r);
    cx.lineTo(x, y + r);
    cx.arcTo(x, y, x + r, y, r);
    cx.closePath();
    cx.fill();
  }

  _circ(cx, x, y, r, color) {
    cx.fillStyle = color;
    cx.beginPath();
    cx.arc(x, y, r, 0, Math.PI * 2);
    cx.fill();
  }
}
