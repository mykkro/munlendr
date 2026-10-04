import { hiDpiContext } from './format.js';

const SIZE = 120;
const EDGE_DEG = 30; // degrees from vertical at the rim of the ball
const COLORS = { ball: '#2a2352', ring3: '#4be3ac', ring10: '#ffd166', cross: 'rgba(255,255,255,0.18)', axisGood: '#4be3ac', axisWarn: '#ffd166', axisBad: '#ff6f91', retro: '#ffd166', pro: '#9ad0ff', text: '#b9b0d6' };

export class AttitudeBall {
  constructor(canvas) {
    this.ctx = hiDpiContext(canvas, SIZE, SIZE);
  }

  draw(t, { showVelocity }) {
    const ctx = this.ctx, c = SIZE / 2, R = SIZE * 0.44;
    const toXY = (angleDeg, bearing) => {
      const r = Math.min(R, (angleDeg / EDGE_DEG) * R), b = (bearing * Math.PI) / 180;
      return [c + Math.sin(b) * r, c - Math.cos(b) * r];
    };
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5;
    for (const [deg, col] of [[10, COLORS.ring10], [3, COLORS.ring3]]) {
      ctx.strokeStyle = col;
      ctx.beginPath(); ctx.arc(c, c, (deg / EDGE_DEG) * R, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = COLORS.cross;
    ctx.beginPath(); ctx.moveTo(c - R, c); ctx.lineTo(c + R, c); ctx.moveTo(c, c - R); ctx.lineTo(c, c + R); ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, c - R + 10);

    if (showVelocity && t.speed > 0.2) {
      const [ve, vn, vu] = t.velLocal;
      const sp = Math.hypot(ve, vn, vu);
      const retroAngle = (Math.acos(Math.max(-1, Math.min(1, -vu / sp))) * 180) / Math.PI;
      const [rx, ry] = toXY(retroAngle, (Math.atan2(-ve, -vn) * 180) / Math.PI);
      ctx.strokeStyle = COLORS.retro; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.moveTo(rx - 4, ry - 4); ctx.lineTo(rx + 4, ry + 4); ctx.moveTo(rx + 4, ry - 4); ctx.lineTo(rx - 4, ry + 4); ctx.stroke();
      const proAngle = 180 - retroAngle;
      if (proAngle < EDGE_DEG) {
        const [px, py] = toXY(proAngle, (Math.atan2(ve, vn) * 180) / Math.PI);
        ctx.strokeStyle = COLORS.pro;
        ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = COLORS.pro; ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }

    const [ax, ay] = toXY(t.tilt, t.tiltDir ?? 0);
    const col = t.tilt < 3 ? COLORS.axisGood : t.tilt < 10 ? COLORS.axisWarn : COLORS.axisBad;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
  }
}
