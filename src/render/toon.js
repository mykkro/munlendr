import * as THREE from 'three';

export const PALETTE = {
  ink: '#1e1838',
  sun: '#fff1dc',
  ambient: '#7d6fb8',
  skyTop: '#130f33',
  skyHorizon: '#5a4596',
  skyBelow: '#0b0920',
  star: '#f4efff',
  rocketBody: '#f6f1e7',
  rocketFoil: '#f2c14e',
  rocketAccent: '#ff6f59',
  rocketDark: '#3b3360',
  plumeOuter: '#ff9f43',
  plumeInner: '#fff4c2',
  rcsPuff: '#e8f3ff',
  target: '#4be3ac',
  hint: '#9ad0ff',
  impact: '#ff6f91',
  dust: '#cfc6e8',
};

let gradientMap = null;
export function getGradientMap() {
  if (gradientMap) return gradientMap;
  const steps = [90, 170, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export const toonMaterial = (color, opts = {}) => new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(), ...opts });

const outlineMaterials = new Map();
function outlineMaterial(thickness) {
  if (outlineMaterials.has(thickness)) return outlineMaterials.get(thickness);
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(PALETTE.ink) }, thickness: { value: thickness } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      uniform float thickness;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec3 p = position + normal * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <logdepthbuf_fragment>
        #include <colorspace_fragment>
      }`,
  });
  outlineMaterials.set(thickness, m);
  return m;
}

export function addOutline(mesh, thickness = 0.05) {
  const shell = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  shell.userData.noNormalPass = true;
  shell.raycast = () => {};
  mesh.add(shell);
  return shell;
}

export class OutlinePass {
  constructor(renderer) {
    this.renderer = renderer;
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1);
    this.colorTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.colorTarget.depthTexture.type = THREE.UnsignedIntType;
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1);
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.prevClear = new THREE.Color();
    this.normalClear = new THREE.Color().setRGB(0.5, 0.5, 1);
    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        tNormal: { value: this.normalTarget.texture },
        texel: { value: new THREE.Vector2(1, 1) },
        cameraFar: { value: 1 },
        inkColor: { value: new THREE.Color(PALETTE.ink) },
        depthThreshold: { value: 0.02 },
        normalThreshold: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tDepth, tNormal;
        uniform vec2 texel;
        uniform float cameraFar, depthThreshold, normalThreshold;
        uniform vec3 inkColor;
        varying vec2 vUv;
        float viewZ(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return exp2(d * log2(cameraFar + 1.0)) - 1.0;
        }
        vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
        void main() {
          vec4 col = texture2D(tColor, vUv);
          vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
          float zc = viewZ(vUv);
          float ic = 1.0 / zc;
          float lap = abs(1.0 / viewZ(vUv - dx) + 1.0 / viewZ(vUv + dx) + 1.0 / viewZ(vUv - dy) + 1.0 / viewZ(vUv + dy) - 4.0 * ic) / ic;
          vec3 nc = nrm(vUv);
          float nd = max(max(1.0 - dot(nc, nrm(vUv - dx)), 1.0 - dot(nc, nrm(vUv + dx))),
                         max(1.0 - dot(nc, nrm(vUv - dy)), 1.0 - dot(nc, nrm(vUv + dy))));
          float edge = max(step(depthThreshold, lap), step(normalThreshold, nd));
          float fade = 1.0 - smoothstep(4000.0, 30000.0, zc);
          gl_FragColor = vec4(mix(col.rgb, inkColor, edge * fade * 0.85), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setSize(w, h) {
    this.colorTarget.setSize(w, h);
    this.normalTarget.setSize(w, h);
    this.material.uniforms.texel.value.set(1 / w, 1 / h);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.colorTarget);
    r.render(scene, camera);

    const hidden = [];
    scene.traverseVisible((o) => { if (o.userData.noNormalPass) hidden.push(o); });
    hidden.forEach((o) => { o.visible = false; });
    scene.overrideMaterial = this.normalMaterial;
    r.getClearColor(this.prevClear);
    const prevAlpha = r.getClearAlpha();
    r.setClearColor(this.normalClear, 1);
    r.setRenderTarget(this.normalTarget);
    r.render(scene, camera);
    r.setClearColor(this.prevClear, prevAlpha);
    scene.overrideMaterial = null;
    hidden.forEach((o) => { o.visible = true; });

    this.material.uniforms.cameraFar.value = camera.far;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
