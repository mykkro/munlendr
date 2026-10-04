import { hiDpiContext } from './format.js';

const SIZE = 120;
const RANGES = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];

export class NavMap {
  constructor(canvas) {
    this.ctx = hiDpiContext(canvas, SIZE, SIZE);
  }

  draw(t) {
    const ctx = this.ctx, c = SIZE / 2, R = SIZE * 0.45;
    const range = RANGES.find((r) => r >= Math.max(40, t.targetDistance * 1.25)) ?? RANGES[RANGES.length - 1];
    const k = R / range;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#2a2352';
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(c, c, R / 2, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = '#4be3ac'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c, c, 5, 0, Math.PI * 2); ctx.moveTo(c - 9, c); ctx.lineTo(c + 9, c); ctx.moveTo(c, c - 9); ctx.lineTo(c, c + 9); ctx.stroke();

    let x = t.x * k, y = -t.y * k;
    const d = Math.hypot(x, y);
    if (d > R) { x *= R / d; y *= R / d; }
    const vx = t.vEast * 10 * k, vy = -t.vNorth * 10 * k; // 10 s ahead
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c + x, c + y); ctx.lineTo(c + x + Math.max(-R, Math.min(R, vx)), c + y + Math.max(-R, Math.min(R, vy))); ctx.stroke();
    ctx.fillStyle = '#ff6f59';
    ctx.beginPath(); ctx.arc(c + x, c + y, 4.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#b9b0d6';
    ctx.font = '700 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(range >= 1000 ? `${range / 1000} km` : `${range} m`, 4, SIZE - 4);
    ctx.textAlign = 'center';
    ctx.fillText('N', c, c - R + 10);
  }
}
