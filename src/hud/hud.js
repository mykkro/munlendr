import { AttitudeBall } from './attitude-ball.js';
import { NavMap } from './nav-map.js';
import { VehicleView } from './vehicle-view.js';
import { fmt, fmtSigned, fmtDistance, fmtClock, fmtBearing, compass, vsLevel, burnLevel, escapeHtml } from './format.js';

const TEMPLATE = `
<div class="panel hud-status">
  <span class="hud-mission" data-k="mission"></span>
  <span class="hud-clock" data-k="clock"></span>
  <span class="chip" data-k="chipSas">SAS</span>
  <span class="chip" data-k="chipAids">AIDS</span>
  <span class="chip" data-k="chipFrame">CAM</span>
  <span class="chip" data-k="chipCam">CHASE</span>
  <div class="hud-messages" data-k="messages"></div>
</div>
<div class="panel hud-height">
  <h3>Height</h3>
  <div class="row big"><label>AGL</label><b data-k="agl"></b></div>
  <div class="row"><label>Altitude</label><b data-k="alt"></b></div>
  <div class="row"><label>Impact in</label><b data-k="tti"></b></div>
  <div class="row" data-k="burnRow"><label>Burn at</label><b data-k="burn"></b></div>
</div>
<div class="panel hud-velocity">
  <h3>Velocity</h3>
  <div class="row big"><label>Vertical</label><b data-k="vs"></b></div>
  <div class="row"><label>Horizontal <i class="arrow" data-k="hArrow">➤</i></label><b data-k="hs"></b></div>
  <div class="row"><label>Total</label><b data-k="speed"></b></div>
</div>
<div class="panel hud-nav">
  <h3>Navigation</h3>
  <canvas data-k="map"></canvas>
  <div class="row"><label>Target</label><b data-k="dist"></b></div>
  <div class="row"><label>Bearing</label><b data-k="bearing"></b></div>
  <div class="row"><label>E, N</label><b data-k="xy"></b></div>
</div>
<div class="panel hud-attitude">
  <h3>Attitude</h3>
  <canvas data-k="ball"></canvas>
  <div class="row"><label>Tilt</label><b data-k="tilt"></b></div>
  <div class="row"><label>Rate</label><b data-k="rate"></b></div>
</div>
<div class="panel hud-propulsion">
  <div class="throttle">
    <div class="bar"><div class="fill cmd" data-k="barCmd"></div><span>CMD</span></div>
    <div class="bar"><div class="fill act" data-k="barAct"></div><span>ACT</span></div>
    <div class="ign" data-k="ign">IGN</div>
  </div>
  <div class="grid">
    <h3>Propulsion</h3>
    <div class="row"><label>Throttle cmd / act</label><b data-k="thr"></b></div>
    <div class="row"><label>Fuel</label><b data-k="fuel"></b></div>
    <div class="row"><label>RCS</label><b data-k="rcs"></b></div>
    <div class="row"><label>Δv left</label><b data-k="dv"></b></div>
    <div class="row"><label>TWR</label><b data-k="twr"></b></div>
  </div>
</div>
<div class="panel hud-vehicle" data-k="vehicle">
  <h3>Vehicle</h3>
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
    this.set('chipAids', s.aidsAvailable ? 'AIDS' : 'NO AIDS');
    this.el.chipAids.classList.toggle('on', s.aids && s.aidsAvailable);
    this.set('chipFrame', s.controlFrame === 'body' ? 'BODY' : 'CAM');
    this.set('chipCam', s.cameraName.toUpperCase());
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
      this.set('burn', Number.isFinite(s.burnNow) ? `${fmt(s.burnNow)} m` : 'TOO LATE');
      this.level('burn', burnLevel(t.agl, s.burnNow));
    }

    this.set('vs', `${fmtSigned(t.vs, 1)} m/s`);
    this.level('vs', vsLevel(t.vs));
    this.set('hs', `${fmt(t.hs, 1)} m/s ${compass(t.hDir)}`);
    this.level('hs', t.hs < 0.5 ? 'good' : t.hs < 1.5 ? 'warn' : 'bad');
    this.el.hArrow.style.visibility = t.hDir == null ? 'hidden' : 'visible';
    this.el.hArrow.style.transform = `rotate(${(t.hDir ?? 0) - 90}deg)`;
    this.set('speed', `${fmt(t.speed, 1)} m/s`);

    this.set('tilt', `${fmt(t.tilt, 1)}° ${compass(t.tiltDir)}`);
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

    this.ball.draw(t, { showVelocity: s.aids && s.aidsAvailable });
    this.map.draw(t);
    this.el.vehicle.classList.toggle('hidden', !s.vehicleView);
    if (s.vehicleView) this.vehicle.draw(t, s.difficulty);
  }
}
