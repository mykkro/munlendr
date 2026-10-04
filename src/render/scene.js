import * as THREE from 'three';
import { OutlinePass, PALETTE } from './toon.js';

const SKY_RADIUS = 1e6; // well inside the far plane: closer to it, float32 rounding clips whole dome triangles

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      up: { value: new THREE.Vector3(0, 0, 1) },
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      below: { value: new THREE.Color(PALETTE.skyBelow) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 up, top, horizon, below;
      varying vec3 vDir;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        float t = dot(normalize(vDir), up);
        // stay at the horizon colour a little below the horizontal: the horizon of a small moon dips several degrees
        vec3 c = t > 0.0 ? mix(horizon, top, pow(t, 0.45)) : mix(horizon, below, smoothstep(0.1, 0.6, -t));
        gl_FragColor = vec4(c, 1.0);
        #include <logdepthbuf_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  sky.userData.noNormalPass = true;
  return sky;
}

function createStars(count = 1600) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([r * Math.cos(a) * SKY_RADIUS * 0.95, r * Math.sin(a) * SKY_RADIUS * 0.95, z * SKY_RADIUS * 0.95], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: PALETTE.star, size: 2, sizeAttenuation: false }));
  stars.frustumCulled = false;
  stars.userData.noNormalPass = true;
  return stars;
}

export class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(PALETTE.skyBelow, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 1e7);
    this.camWorld = [0, 0, 0];
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.AmbientLight(PALETTE.ambient, 0.9));
    this.sky = createSky();
    this.stars = createStars();
    this.scene.add(this.sky, this.stars);
    this.outline = new OutlinePass(this.renderer);
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.outline.setSize(Math.max(1, Math.floor(w * pr)), Math.max(1, Math.floor(h * pr)));
  }

  setSunDirection(dir) {
    this.sun.position.set(dir[0] * 1000, dir[1] * 1000, dir[2] * 1000);
    this.sun.target.position.set(0, 0, 0);
  }

  setCamera({ position, target, up, fov }) {
    this.camWorld = position.slice();
    if (fov && fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(0, 0, 0);
    this.camera.up.set(up[0], up[1], up[2]);
    this.camera.lookAt(target[0] - position[0], target[1] - position[1], target[2] - position[2]);
    const l = Math.hypot(position[0], position[1], position[2]) || 1;
    this.sky.material.uniforms.up.value.set(position[0] / l, position[1] / l, position[2] / l);
  }

  toRender(world, out = new THREE.Vector3()) {
    return out.set(world[0] - this.camWorld[0], world[1] - this.camWorld[1], world[2] - this.camWorld[2]);
  }

  render() {
    this.outline.render(this.scene, this.camera);
  }

  clear() {
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
  }
}
