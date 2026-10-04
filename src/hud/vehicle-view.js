import { hiDpiContext } from './format.js';
import { THRUSTERS } from '../sim/actuators.js';

const W = 110, H = 180;
const PX = 26;              // pixels per metre (vertical)
const CY = H / 2;
const toY = (z) => CY - z * PX;
const HALF_W = 22;

export class VehicleView {
  constructor(canvas) {
    this.ctx = hiDpiContext(canvas, W, H);
  }

  draw(t, difficulty) {
    const ctx = this.ctx, cx = W / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f4efff';
    ctx.strokeRect(cx - HALF_W, toY(3), HALF_W * 2, 6 * PX);

    const tank = (z0, z1, pct, color) => {
      const top = toY(z1), bottom = toY(z0), h = bottom - top;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(cx - HALF_W + 5, top, HALF_W * 2 - 10, h);
      ctx.fillStyle = color;
      const fh = h * Math.max(0, Math.min(1, pct));
      ctx.fillRect(cx - HALF_W + 6, bottom - fh, HALF_W * 2 - 12, fh);
    };
    tank(-2.6, -0.4, t.fuelPct, '#f2c14e');
    tank(0.6, 1.4, t.rcsPct, '#9ad0ff');

    THRUSTERS.forEach((th, i) => {
      const o = t.thrusters[i];
      if (o < 0.05) return;
      const y = toY(th.ring === 'top' ? 3 : -3) + (th.ring === 'top' ? 6 : -6);
      ctx.fillStyle = ctx.strokeStyle = `rgba(232,243,255,${0.4 + 0.6 * o})`;
      if (th.axis === 0) {
        const side = -th.sign; // the jet leaves from the opposite side of the push
        const x0 = cx + side * HALF_W;
        ctx.beginPath(); ctx.moveTo(x0, y - 5); ctx.lineTo(x0 + side * 14, y); ctx.lineTo(x0, y + 5); ctx.closePath(); ctx.fill();
      } else {
        const x0 = cx + (th.sign > 0 ? -8 : 8);
        ctx.beginPath(); ctx.arc(x0, y, 4, 0, Math.PI * 2); ctx.stroke();
        if (th.sign > 0) { ctx.beginPath(); ctx.arc(x0, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(x0 - 3, y - 3); ctx.lineTo(x0 + 3, y + 3); ctx.moveTo(x0 + 3, y - 3); ctx.lineTo(x0 - 3, y + 3); ctx.stroke(); }
      }
    });

    const yc = toY(t.zcm);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(cx + HALF_W + 4, toY(3)); ctx.lineTo(cx + HALF_W + 4, toY(-3)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff6f59';
    ctx.beginPath(); ctx.arc(cx, yc, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e1838';
    ctx.beginPath(); ctx.moveTo(cx, yc); ctx.arc(cx, yc, 6, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx, yc); ctx.arc(cx, yc, 6, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#b9b0d6';
    ctx.font = '700 9px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${t.lTop.toFixed(2)}`, cx + HALF_W + 7, (toY(3) + yc) / 2 + 3);
    ctx.fillText(`${t.lBot.toFixed(2)}`, cx + HALF_W + 7, (toY(-3) + yc) / 2 + 3);
    ctx.textAlign = 'center';
    ctx.fillText(difficulty === 'hard' ? 'CoM moves' : 'CoM fixed', cx, H - 2);
  }
}
