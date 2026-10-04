import { AttitudeBall } from './attitude-ball.js';
import { NavMap } from './nav-map.js';
import { VehicleView } from './vehicle-view.js';
import { fmt, fmtSigned, fmtDistance, fmtClock, fmtBearing, compass, vsLevel, burnLevel, escapeHtml } from './format.js';
import { t as tr, onLanguageChange } from '../i18n.js';

const TEMPLATE = `
<div class="panel hud-status">
  <span class="hud-mission" data-k="mission"></span>
  <span class="hud-clock" data-k="clock"></span>
  <span class="chip" data-k="chipSas">SAS</span>
  <span class="chip" data-k="chipAids">AIDS</span>
  <span class="chip" data-k="chipFrame">CAM</span>
  <span class="chip" data-k="chipCam">CHASE</span>
  <span class="hint"><kbd>Esc</kbd> <span data-t="hud.hint"></span></span>
  <div class="hud-messages" data-k="messages"></div>
</div>
<div class="hud-col left">
<div class="panel hud-height">
  <h3 data-t="hud.height"></h3>
  <div class="row big"><label data-t="hud.agl"></label><b data-k="agl"></b></div>
  <div class="row"><label data-t="hud.altitude"></label><b data-k="alt"></b></div>
  <div class="row"><label data-t="hud.impact"></label><b data-k="tti"></b></div>
  <div class="row" data-k="burnRow"><label data-t="hud.burnAt"></label><b data-k="burn"></b></div>
</div>
<div class="panel hud-velocity">
  <h3 data-t="hud.velocity"></h3>
  <div class="row big"><label data-t="hud.vertical"></label><b data-k="vs"></b></div>
  <div class="row"><label><span data-t="hud.horizontal"></span> <i class="arrow" data-k="hArrow">➤</i></label><b data-k="hs"></b></div>
  <div class="row"><label data-t="hud.total"></label><b data-k="speed"></b></div>
</div>
</div>
<div class="hud-col right">
<div class="panel hud-nav">
  <h3 data-t="hud.navigation"></h3>
  <canvas data-k="map"></canvas>
  <div class="row"><label data-t="hud.target"></label><b data-k="dist"></b></div>
  <div class="row"><label data-t="hud.bearing"></label><b data-k="bearing"></b></div>
  <div class="row"><label data-t="hud.en"></label><b data-k="xy"></b></div>
</div>
<div class="panel hud-attitude">
  <h3 data-t="hud.attitude"></h3>
  <canvas data-k="ball"></canvas>
  <div class="row"><label data-t="hud.tilt"></label><b data-k="tilt"></b></div>
  <div class="row"><label data-t="hud.rate"></label><b data-k="rate"></b></div>
</div>
</div>
<div class="panel hud-propulsion">
  <div class="throttle">
    <div class="bar"><div class="fill cmd" data-k="barCmd"></div><span>CMD</span></div>
    <div class="bar"><div class="fill act" data-k="barAct"></div><span>ACT</span></div>
    <div class="ign" data-k="ign">IGN</div>
  </div>
  <div class="grid">
    <h3 data-t="hud.propulsion"></h3>
    <div class="row"><label data-t="hud.throttle"></label><b data-k="thr"></b></div>
    <div class="row"><label data-t="hud.fuel"></label><b data-k="fuel"></b></div>
    <div class="row"><label data-t="hud.rcs"></label><b data-k="rcs"></b></div>
    <div class="row"><label data-t="hud.dv"></label><b data-k="dv"></b></div>
    <div class="row"><label data-t="hud.twr"></label><b data-k="twr"></b></div>
  </div>
</div>
<div class="panel hud-vehicle" data-k="vehicle">
  <h3 data-t="hud.vehicle"></h3>
  <canvas data-k="veh"></canvas>
</div>`;

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = TEMPLATE;
    this.el = {};
    root.querySelectorAll('[data-k]').forEach((e) => { this.el[e.dataset.k] = e; });
    this.ball = new AttitudeBall(this.el.ball);
    this.map = new NavMap(this.el.map);
    this.vehicle = new VehicleView(this.el.veh);
    this.relabel();
    onLanguageChange(() => this.relabel());
  }

  // Static labels carry data-t keys; values are re-set on the next update after a language switch.
  relabel() {
    this.root.querySelectorAll('[data-t]').forEach((e) => { e.textContent = tr(e.dataset.t); });
    this.points = tr('compass').split(',');
    this.text = {};
    this.msgKey = '';
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  setScale(s) {
    this.root.style.setProperty('--hud-scale', String(s));
  }

  set(k, v) {
    if (this.text[k] !== v) {
      this.text[k] = v;
      this.el[k].textContent = v;
    }
  }

  level(k, lvl) {
    const c = this.el[k].classList;
    c.toggle('good', lvl === 'good');
    c.toggle('warn', lvl === 'warn');
    c.toggle('bad', lvl === 'bad');
  }

  update(t, s) {
    this.root.classList.toggle('collapsed', !s.visible);
    this.set('mission', s.missionName);
    this.set('clock', fmtClock(s.time));
    this.el.chipSas.classList.toggle('on', s.sas);
    this.set('chipAids', tr(s.aidsAvailable ? 'hud.aids' : 'hud.noAids'));
    this.el.chipAids.classList.toggle('on', s.aids && s.aidsAvailable);
    this.set('chipFrame', tr(s.controlFrame === 'body' ? 'hud.frameBody' : 'hud.frameCam'));
    this.set('chipCam', tr(`cam.${s.camera}`).toUpperCase());
    const key = s.messages.map((m) => `${m.level}:${m.text}`).join('|');
    if (key !== this.msgKey) {
      this.msgKey = key;
      this.el.messages.innerHTML = s.messages.map((m) => `<span class="msg ${m.level}">${escapeHtml(m.text)}</span>`).join('');
    }

    this.set('agl', `${fmt(t.agl, t.agl < 100 ? 1 : 0)} m`);
    this.set('alt', `${fmt(t.altitude / 1000, 2)} km`);
    this.set('tti', t.timeToImpact == null ? '—' : `${fmt(t.timeToImpact, 1)} s`);
    const showBurn = s.aids && s.aidsAvailable && s.burnNow != null;
    this.el.burnRow.classList.toggle('hidden', !showBurn);
    if (showBurn) {
      this.set('burn', Number.isFinite(s.burnNow) ? `${fmt(s.burnNow)} m` : tr('hud.tooLate'));
      this.level('burn', burnLevel(t.agl, s.burnNow));
    }

    this.set('vs', `${fmtSigned(t.vs, 1)} m/s`);
    this.level('vs', vsLevel(t.vs));
    this.set('hs', `${fmt(t.hs, 1)} m/s ${compass(t.hDir, this.points)}`);
    this.level('hs', t.hs < 0.5 ? 'good' : t.hs < 1.5 ? 'warn' : 'bad');
    this.el.hArrow.style.visibility = t.hDir == null ? 'hidden' : 'visible';
    this.el.hArrow.style.transform = `rotate(${(t.hDir ?? 0) - 90}deg)`;
    this.set('speed', `${fmt(t.speed, 1)} m/s`);

    this.set('tilt', `${fmt(t.tilt, 1)}° ${compass(t.tiltDir, this.points)}`);
    this.level('tilt', t.tilt < 3 ? 'good' : t.tilt < 10 ? 'warn' : 'bad');
    this.set('rate', `${fmt(t.rate, 1)} °/s`);
    this.level('rate', t.rate < 2 ? 'good' : t.rate < 5 ? 'warn' : 'bad');

    this.el.barCmd.style.height = `${Math.round(t.throttleCmd * 100)}%`;
    this.el.barAct.style.height = `${Math.round(t.throttle * 100)}%`;
    this.el.ign.classList.toggle('on', t.igniting);
    this.set('thr', `${fmt(t.throttleCmd * 100)} / ${fmt(t.throttle * 100)} %`);
    this.set('fuel', `${fmt(t.fuel)} kg · ${fmt(t.fuelPct * 100)}%`);
    this.level('fuel', t.fuelPct > 0.25 ? 'good' : t.fuelPct > 0.1 ? 'warn' : 'bad');
    this.set('rcs', `${fmt(t.rcs, 1)} kg`);
    this.level('rcs', t.rcsPct > 0.3 ? 'good' : t.rcsPct > 0.15 ? 'warn' : 'bad');
    this.set('dv', `${fmt(t.dv)} m/s`);
    this.set('twr', fmt(t.twr, 2));

    this.set('dist', fmtDistance(t.targetDistance));
    this.set('bearing', fmtBearing(t.targetBearing));
    this.set('xy', `${fmt(t.x)}, ${fmt(t.y)} m`);

    this.ball.draw(t, { showVelocity: s.aids && s.aidsAvailable, north: this.points[0] });
    this.map.draw(t, this.points[0]);
    this.el.vehicle.classList.toggle('hidden', !s.vehicleView);
    if (s.vehicleView) this.vehicle.draw(t, tr(s.difficulty === 'hard' ? 'hud.comMoves' : 'hud.comFixed'));
  }
}
