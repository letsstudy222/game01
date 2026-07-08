/* =====================================================================
   HELIOS — Procedural 3D Universe Simulator
   Pure client-side: HTML5 + Vanilla JS + Three.js r128 (CDN).
   No backend, no bundler. Deploy the folder as-is to GitHub Pages.
   ---------------------------------------------------------------------
   Systems:
     1. Kepler orbital mechanics (solved per-frame via Newton iteration)
     2. Procedural planets — 3D simplex-noise terrain, crater fields,
        GLSL gas-giant band shaders, Rayleigh/Mie-style atmosphere glow
     3. Newtonian ship physics — inertia, n-body gravity, slingshots,
        atmospheric drag + re-entry burn
     4. Survival HUD — fuel / hull / shields / planetary scanner
   ===================================================================== */
'use strict';

/* =====================================================================
   0. UTILITIES
   ===================================================================== */

// Deterministic seeded RNG (mulberry32) — powers all procedural content.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------- 3D Simplex noise (JS) --------------------
// Compact implementation (Stefan Gustavson's algorithm) used for CPU
// terrain displacement. No texture files needed anywhere in the game.
const SimplexNoise = (function () {
  const F3 = 1 / 3, G3 = 1 / 6;
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  function Simplex(seed) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const n = Math.floor(rand() * (i + 1));
      const q = p[i]; p[i] = p[n]; p[n] = q;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  Simplex.prototype.noise3 = function (xin, yin, zin) {
    const perm = this.perm, permMod12 = this.permMod12;
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1=1;j1=0;k1=0; i2=1;j2=1;k2=0; }
      else if (x0 >= z0) { i1=1;j1=0;k1=0; i2=1;j2=0;k2=1; }
      else               { i1=0;j1=0;k1=1; i2=1;j2=0;k2=1; }
    } else {
      if (y0 < z0)       { i1=0;j1=0;k1=1; i2=0;j2=1;k2=1; }
      else if (x0 < z0)  { i1=0;j1=1;k1=0; i2=0;j2=1;k2=1; }
      else               { i1=0;j1=1;k1=0; i2=1;j2=1;k2=0; }
    }
    const x1 = x0 - i1 + G3,     y1 = y0 - j1 + G3,     z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3,   y2 = y0 - j2 + 2*G3,   z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3,    y3 = y0 - 1 + 3*G3,    z3 = z0 - 1 + 3*G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 < 0) n0 = 0; else {
      const gi0 = permMod12[ii + perm[jj + perm[kk]]];
      t0 *= t0;
      n0 = t0 * t0 * (grad3[gi0][0]*x0 + grad3[gi0][1]*y0 + grad3[gi0][2]*z0);
    }
    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 < 0) n1 = 0; else {
      const gi1 = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
      t1 *= t1;
      n1 = t1 * t1 * (grad3[gi1][0]*x1 + grad3[gi1][1]*y1 + grad3[gi1][2]*z1);
    }
    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 < 0) n2 = 0; else {
      const gi2 = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
      t2 *= t2;
      n2 = t2 * t2 * (grad3[gi2][0]*x2 + grad3[gi2][1]*y2 + grad3[gi2][2]*z2);
    }
    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 < 0) n3 = 0; else {
      const gi3 = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];
      t3 *= t3;
      n3 = t3 * t3 * (grad3[gi3][0]*x3 + grad3[gi3][1]*y3 + grad3[gi3][2]*z3);
    }
    return 32 * (n0 + n1 + n2 + n3); // roughly in [-1, 1]
  };
  return Simplex;
})();

// Fractal Brownian Motion over simplex — the terrain workhorse.
function fbm(simplex, x, y, z, octaves, lacunarity, gain) {
  let amp = 0.5, freq = 1, sum = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * simplex.noise3(x * freq, y * freq, z * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum;
}

// ------------------------- GLSL noise chunk --------------------------
// Ashima/Ian McEwan simplex noise, shared by every procedural shader.
const GLSL_NOISE = `
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p, int oct){
  float a = 0.5, f = 1.0, s = 0.0;
  for(int i = 0; i < 8; i++){
    if(i >= oct) break;
    s += a * snoise(p * f);
    f *= 2.03; a *= 0.5;
  }
  return s;
}`;

/* =====================================================================
   1. GLOBAL CONFIG & SCALING
   ---------------------------------------------------------------------
   "Smart scaling": distances use 1 AU = 1200 units; body radii are
   compressed with a square-root law so the Sun does not swallow the
   inner planets visually. Z-fighting across these huge ranges is
   eliminated with the renderer's logarithmic depth buffer.
   ===================================================================== */
const AU = 1200;                                   // world units per AU
const radiusScale = km => Math.pow(km, 0.5) * 0.28; // sqrt compression
const YEAR_SECONDS = 300;                          // 1 Earth year at warp ×1
const WARP_STEPS = [1, 10, 50, 200, 1000];
const G_GAME = 1.25;                               // gravity tuning factor

const canvas = document.getElementById('space');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, logarithmicDepthBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.1, 5e6);
scene.add(new THREE.AmbientLight(0x223344, 0.35));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =====================================================================
   2. STARFIELD (background — 9000 points, milky-way band bias)
   ===================================================================== */
function buildStarfield() {
  const rand = mulberry32(777);
  const N = 9000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const bandNormal = new THREE.Vector3(0.35, 1, 0.2).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // uniform direction
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    v.set(s * Math.cos(th), u, s * Math.sin(th));
    // 45% of stars pulled toward a galactic band
    if (rand() < 0.45) {
      const d = v.dot(bandNormal);
      v.addScaledVector(bandNormal, -d * 0.85).normalize();
    }
    const R = 2.2e6;
    pos[i*3] = v.x * R; pos[i*3+1] = v.y * R; pos[i*3+2] = v.z * R;
    // star colour temperature
    const t = rand();
    let r, g, b;
    if (t < 0.6)      { r = 1;   g = 1;    b = 1;   }
    else if (t < 0.8) { r = 0.7; g = 0.82; b = 1;   }
    else if (t < 0.93){ r = 1;   g = 0.85; b = 0.6; }
    else              { r = 1;   g = 0.55; b = 0.45;}
    const lum = 0.35 + rand() * 0.65;
    col[i*3] = r*lum; col[i*3+1] = g*lum; col[i*3+2] = b*lum;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.6, sizeAttenuation: false, vertexColors: true,
    depthWrite: false, transparent: true, opacity: 0.95
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}
const starfield = buildStarfield();

// Canvas-generated radial glow texture (reused for sun corona & engine)
function makeGlowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* =====================================================================
   3. SHADERS — atmosphere (Rayleigh/Mie style), gas giants, sun, rings
   ===================================================================== */

// --- Atmosphere glow: back-side shell. Fresnel rim modulated by the
// sun direction (Rayleigh day-side scattering) plus a Mie forward-
// scattering lobe that brightens the limb facing the sun.
const ATMO_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormal;
varying vec3 vWorldPos;
void main(){
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const ATMO_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;      // Rayleigh tint (blue for Earth, gold for Venus…)
uniform vec3 uSunPos;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main(){
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 sunDir  = normalize(uSunPos - vWorldPos);
  // rim term (shell rendered BackSide, so invert normal)
  float rim = pow(clamp(dot(viewDir, vNormal) + 1.05, 0.0, 1.05), uPower);
  // day-side illumination (Rayleigh-ish)
  float day = clamp(dot(-vNormal, sunDir) * 0.6 + 0.5, 0.05, 1.0);
  // Mie forward scattering: bright halo when looking toward the sun
  float mie = pow(max(dot(-viewDir, sunDir), 0.0), 24.0) * 0.9;
  vec3 col = uColor * rim * day * uIntensity + vec3(1.0, 0.9, 0.75) * mie * rim;
  gl_FragColor = vec4(col, clamp(rim * day, 0.0, 1.0));
  #include <logdepthbuf_fragment>
}`;

function makeAtmosphere(radius, colorHex, power, intensity) {
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const mat = new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    uniforms: {
      uColor:     { value: new THREE.Color(colorHex) },
      uSunPos:    { value: new THREE.Vector3() },
      uPower:     { value: power },
      uIntensity: { value: intensity }
    },
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  return new THREE.Mesh(geo, mat);
}

// --- Gas giant surface: animated banded fbm, optional storm vortex
const GAS_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main(){
  vPos = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const GAS_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
` + GLSL_NOISE + `
uniform vec3 uColA;   // light band
uniform vec3 uColB;   // dark band
uniform vec3 uColC;   // accent
uniform vec3 uSunPos;
uniform float uTime;
uniform float uSeed;
uniform float uBands;
uniform float uStorm;   // 1.0 => Great-Red-Spot style vortex
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main(){
  vec3 p = normalize(vPos);
  float lat = p.y;
  // turbulent distortion of the band latitude (fluid-like motion)
  float turb = fbm(p * 3.0 + vec3(uSeed, uTime * 0.02, 0.0), 5) * 0.35
             + fbm(p * 9.0 + vec3(0.0, uSeed, uTime * 0.05), 4) * 0.12;
  float bands = sin((lat + turb) * uBands * 3.14159);
  float m = smoothstep(-0.85, 0.85, bands);
  vec3 col = mix(uColB, uColA, m);
  // fine streaks along flow
  float streak = fbm(vec3(p.x * 2.0, (lat + turb) * 20.0, p.z * 2.0 + uSeed), 4);
  col = mix(col, uColC, smoothstep(0.35, 0.8, streak) * 0.35);
  // storm vortex (anticyclone)
  if (uStorm > 0.5) {
    float lon = atan(p.z, p.x) + uTime * 0.004;
    vec2 sp = vec2(mod(lon + 3.14159, 6.28318) - 3.14159, lat + 0.32);
    sp.x *= 0.55;
    float d = length(sp * vec2(3.2, 9.0));
    float spot = smoothstep(1.0, 0.25, d);
    float swirl = fbm(vec3(sp * 12.0, uTime * 0.1 + uSeed), 4) * 0.25;
    col = mix(col, vec3(0.78, 0.28, 0.16) + swirl, spot * 0.9);
  }
  // Lambert lighting from sun
  vec3 sunDir = normalize(uSunPos - vWorldPos);
  float light = clamp(dot(vNormalW, sunDir), 0.0, 1.0);
  light = pow(light, 0.8) * 1.15 + 0.03;
  gl_FragColor = vec4(col * light, 1.0);
  #include <logdepthbuf_fragment>
}`;

function makeGasMaterial(opts) {
  return new THREE.ShaderMaterial({
    vertexShader: GAS_VERT,
    fragmentShader: GAS_FRAG,
    uniforms: {
      uColA:  { value: new THREE.Color(opts.colA) },
      uColB:  { value: new THREE.Color(opts.colB) },
      uColC:  { value: new THREE.Color(opts.colC) },
      uSunPos:{ value: new THREE.Vector3() },
      uTime:  { value: 0 },
      uSeed:  { value: opts.seed || 0 },
      uBands: { value: opts.bands || 9 },
      uStorm: { value: opts.storm ? 1 : 0 }
    }
  });
}

// --- Sun surface: boiling emissive fbm
const SUN_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
` + GLSL_NOISE + `
uniform float uTime;
uniform vec3 uColHot;
uniform vec3 uColCool;
varying vec3 vPos;
void main(){
  vec3 p = normalize(vPos);
  float n = fbm(p * 4.0 + vec3(uTime * 0.05), 5);
  float n2 = fbm(p * 12.0 - vec3(uTime * 0.08), 4);
  float v = clamp(n * 0.7 + n2 * 0.4 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColCool, uColHot, v) * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}`;
const SUN_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

// --- Planetary rings: noise-banded translucent disc
const RING_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vLocal;
void main(){
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const RING_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
` + GLSL_NOISE + `
uniform float uInner;
uniform float uOuter;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uSeed;
varying vec3 vLocal;
void main(){
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  // radial band structure — 1-D noise sampled along radius
  float bands = fbm(vec3(t * 26.0, uSeed, 0.0), 4) * 0.5 + 0.5;
  float gaps  = smoothstep(0.28, 0.36, fbm(vec3(t * 60.0, uSeed * 2.0, 1.0), 3) * 0.5 + 0.5);
  float edge  = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.92, t);
  float alpha = bands * gaps * edge * 0.85;
  vec3 col = mix(uColB, uColA, bands);
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
}`;

/* =====================================================================
   4. KEPLER ORBITAL MECHANICS
   ---------------------------------------------------------------------
   Position from classical elements (a, e, i, Ω, ω, M0).
   Kepler's equation M = E − e·sin(E) is solved every frame with
   Newton–Raphson iteration; period follows Kepler's third law T ∝ a^1.5.
   ===================================================================== */
function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let it = 0; it < 10; it++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  return E;
}

// Fills `out` with position relative to the parent body.
function keplerPosition(el, simTime, out) {
  const period = YEAR_SECONDS * Math.pow(el.a / AU, 1.5) * (el.periodScale || 1);
  const M = el.M0 + (2 * Math.PI * simTime) / period;
  const E = solveKepler(M % (2 * Math.PI), el.e);
  const xo = el.a * (Math.cos(E) - el.e);                       // orbital plane
  const yo = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const cw = Math.cos(el.w),  sw = Math.sin(el.w);              // arg. periapsis
  const cO = Math.cos(el.O),  sO = Math.sin(el.O);              // asc. node
  const ci = Math.cos(el.i),  si = Math.sin(el.i);              // inclination
  const x1 = cw * xo - sw * yo;
  const y1 = sw * xo + cw * yo;
  out.set(
    cO * x1 - sO * y1 * ci,
    y1 * si,
    sO * x1 + cO * y1 * ci
  );
  return out;
}

/* =====================================================================
   5. CELESTIAL BODY FACTORY
   ===================================================================== */
const bodies = [];   // every star/planet/moon in every system
const systems = [];  // star systems for the N-key jump

// ---- Rocky planet: CPU noise-displaced sphere with crater fields ----
function buildRockyMesh(cfg) {
  const r = cfg.visRadius;
  const detail = cfg.detail || (r > 15 ? 96 : 48);
  const geo = new THREE.SphereGeometry(r, detail, Math.round(detail * 0.66));
  const pos = geo.attributes.position;
  const simplex = new SimplexNoise(cfg.seed);
  const rand = mulberry32(cfg.seed ^ 0x9e3779b9);

  // crater field
  const craters = [];
  const nCr = cfg.craters || 0;
  for (let c = 0; c < nCr; c++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    craters.push({
      dir: new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)),
      size: 0.04 + rand() * 0.16,          // angular radius (rad)
      depth: (0.004 + rand() * 0.012) * r  // world units
    });
  }

  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const cTmp = new THREE.Color();
  const amp = cfg.amp * r;                 // mountain amplitude
  const seaLevel = cfg.seaLevel;           // null = no ocean

  for (let idx = 0; idx < pos.count; idx++) {
    v.fromBufferAttribute(pos, idx).normalize();
    // base fbm terrain + ridged component for mountain chains/canyons
    let h = fbm(simplex, v.x * cfg.freq, v.y * cfg.freq, v.z * cfg.freq, 6, 2.1, 0.5);
    const ridge = 1 - Math.abs(fbm(simplex, v.x*cfg.freq*2.3+9, v.y*cfg.freq*2.3, v.z*cfg.freq*2.3, 4, 2.2, 0.5));
    h = h * 0.75 + (ridge * ridge - 0.55) * 0.5 * cfg.ridged;
    // craters (bowl + raised rim)
    for (let c = 0; c < craters.length; c++) {
      const cr = craters[c];
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(cr.dir), -1, 1));
      if (ang < cr.size * 1.4) {
        const t = ang / cr.size;
        const bowl = t < 1 ? (t * t - 1) : 0;
        const rim = Math.exp(-((t - 1) * (t - 1)) / 0.03) * 0.55;
        h += (bowl * 0.8 + rim) * (cr.depth / amp);
      }
    }
    let hw = h * amp;                       // world-space height
    let hNorm = h;                          // for colouring
    if (seaLevel !== null && hw < seaLevel * amp) {
      hw = seaLevel * amp;                  // flatten oceans
    }
    v.multiplyScalar(r + hw);
    pos.setXYZ(idx, v.x, v.y, v.z);

    // ---- colouring by height + latitude ----
    const lat = Math.abs(v.y / v.length());
    const pal = cfg.palette;
    let stop = 0;
    const hn = THREE.MathUtils.clamp((hNorm + 0.6) / 1.2, 0, 1);
    while (stop < pal.length - 1 && hn > pal[stop + 1].h) stop++;
    const p0 = pal[Math.max(0, stop)], p1 = pal[Math.min(pal.length - 1, stop + 1)];
    const f = p1.h === p0.h ? 0 : THREE.MathUtils.clamp((hn - p0.h) / (p1.h - p0.h), 0, 1);
    cTmp.setHex(p0.c).lerp(new THREE.Color(p1.c), f);
    if (seaLevel !== null && hNorm < seaLevel) cTmp.setHex(cfg.oceanColor);
    if (cfg.iceCaps && lat > cfg.iceCaps) cTmp.lerp(new THREE.Color(0xf4f6f8), THREE.MathUtils.clamp((lat - cfg.iceCaps) * 8, 0, 1));
    colors[idx*3] = cTmp.r; colors[idx*3+1] = cTmp.g; colors[idx*3+2] = cTmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.02,
    flatShading: false
  });
  return new THREE.Mesh(geo, mat);
}

// ---- Generic body registration ----
function addBody(cfg) {
  const group = new THREE.Group();
  let mesh, gasMat = null;

  if (cfg.type === 'star') {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SUN_VERT, fragmentShader: SUN_FRAG,
      uniforms: {
        uTime:   { value: 0 },
        uColHot: { value: new THREE.Color(cfg.hot || 0xfff3b0) },
        uColCool:{ value: new THREE.Color(cfg.cool || 0xff7b1c) }
      }
    });
    mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.visRadius, 64, 48), mat);
    group.add(mesh);
    // corona sprite
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(cfg.glowInner || 'rgba(255,240,190,0.9)',
                           cfg.glowOuter || 'rgba(255,120,30,0.35)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    corona.scale.setScalar(cfg.visRadius * 4.5);
    group.add(corona);
    const light = new THREE.PointLight(cfg.lightColor || 0xfff4e0, 1.6, 0, 0);
    group.add(light);
  } else if (cfg.type === 'gas') {
    gasMat = makeGasMaterial(cfg.gas);
    mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.visRadius, 72, 48), gasMat);
    group.add(mesh);
    if (cfg.rings) {
      const inner = cfg.visRadius * cfg.rings.inner;
      const outer = cfg.visRadius * cfg.rings.outer;
      const rg = new THREE.RingGeometry(inner, outer, 160, 1);
      const rm = new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: {
          uInner: { value: inner }, uOuter: { value: outer },
          uColA: { value: new THREE.Color(cfg.rings.colA) },
          uColB: { value: new THREE.Color(cfg.rings.colB) },
          uSeed: { value: (cfg.seed || 1) % 100 }
        },
        side: THREE.DoubleSide, transparent: true, depthWrite: false
      });
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = Math.PI / 2 + (cfg.rings.tilt || 0);
      group.add(ring);
    }
  } else { // rocky
    mesh = buildRockyMesh(cfg);
    group.add(mesh);
  }

  if (cfg.atmosphere) {
    const at = makeAtmosphere(
      cfg.visRadius * (cfg.atmosphere.scale || 1.16),
      cfg.atmosphere.color, cfg.atmosphere.power || 3.2,
      cfg.atmosphere.intensity || 1.2);
    group.add(at);
    cfg._atmoMat = at.material;
  }

  scene.add(group);
  const body = {
    name: cfg.name, type: cfg.type, group, mesh, gasMat,
    visRadius: cfg.visRadius,
    orbit: cfg.orbit || null,        // Kepler elements, relative to parent
    parent: cfg.parent || null,      // another body object
    spin: cfg.spin !== undefined ? cfg.spin : 0.02,
    axialTilt: cfg.axialTilt || 0,
    // gravity: surface acceleration (game units) => mu = g·r²
    mu: (cfg.surfaceG || 0) * cfg.visRadius * cfg.visRadius * G_GAME,
    surfaceG: cfg.surfaceG || 0,
    atmo: cfg.atmoPhys || null,      // { height, density } for drag
    scan: cfg.scan || null,          // scanner datasheet
    systemIndex: cfg.systemIndex,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),   // finite-difference, for landing frames
    _prevPos: new THREE.Vector3(),
    _atmoMat: cfg._atmoMat || null
  };
  mesh.rotation.z = body.axialTilt;
  bodies.push(body);
  return body;
}

/* =====================================================================
   6. THE SOLAR SYSTEM — real orbital data (a in AU, e, i in deg)
   Scanner data uses real physical values.
   ===================================================================== */
const D2R = Math.PI / 180;
function els(aAU, e, iDeg, M0deg, extra) {
  return Object.assign({
    a: aAU * AU, e, i: iDeg * D2R,
    O: Math.random() * 0, w: (M0deg * 1.7 % 360) * D2R, M0: M0deg * D2R
  }, extra || {});
}

function buildSolarSystem() {
  const sysIdx = systems.length;
  const origin = new THREE.Vector3(0, 0, 0);

  const sun = addBody({
    name: 'Sun', type: 'star', systemIndex: sysIdx,
    visRadius: radiusScale(696000) * 0.55,   // extra compression for the star
    surfaceG: 40, spin: 0.002,
    scan: { cls: 'G2V main-sequence star', mass: '1.989×10³⁰ kg', radius: '696,000 km',
            grav: '274 m/s²', temp: '5,505 °C (photosphere)', press: '—',
            atmo: [['H', 73], ['He', 25], ['O/C/…', 2]] }
  });

  const P = (cfg) => { cfg.parent = sun; cfg.systemIndex = sysIdx; return addBody(cfg); };

  P({ name: 'Mercury', type: 'rocky', visRadius: radiusScale(2440),
    seed: 11, freq: 3.2, amp: 0.045, ridged: 0.4, craters: 60, seaLevel: null,
    palette: [{h:0,c:0x4a4440},{h:0.45,c:0x6e6660},{h:0.75,c:0x8d857c},{h:1,c:0xb5aca0}],
    oceanColor: 0, iceCaps: 0, surfaceG: 3.7, spin: 0.004,
    orbit: els(0.387, 0.2056, 7.0, 40),
    scan: { cls: 'Rocky (airless)', mass: '3.30×10²³ kg', radius: '2,440 km',
            grav: '3.70 m/s²', temp: '−173 … +427 °C', press: '≈ 0 (trace exosphere)',
            atmo: [['O₂', 42], ['Na', 29], ['H₂', 22], ['He', 6]] } });

  P({ name: 'Venus', type: 'rocky', visRadius: radiusScale(6052),
    seed: 22, freq: 2.6, amp: 0.03, ridged: 0.7, craters: 8, seaLevel: null,
    palette: [{h:0,c:0x8a6b35},{h:0.5,c:0xb98f47},{h:0.8,c:0xd9b164},{h:1,c:0xf0d489}],
    oceanColor: 0, iceCaps: 0, surfaceG: 8.87, spin: -0.001,
    orbit: els(0.723, 0.0068, 3.39, 120),
    atmosphere: { color: 0xe8c56a, scale: 1.22, power: 2.6, intensity: 2.2 },
    atmoPhys: { height: 1.3, density: 3.0 },
    scan: { cls: 'Rocky (runaway greenhouse)', mass: '4.87×10²⁴ kg', radius: '6,052 km',
            grav: '8.87 m/s²', temp: '462 °C', press: '92 bar',
            atmo: [['CO₂', 96.5], ['N₂', 3.5]] } });

  const earth = P({ name: 'Earth', type: 'rocky', visRadius: radiusScale(6371),
    seed: 33, freq: 2.2, amp: 0.05, ridged: 0.8, craters: 0, seaLevel: 0.02,
    palette: [{h:0,c:0x2f6b31},{h:0.55,c:0x5d8a3a},{h:0.72,c:0x8b7355},{h:0.88,c:0x9b9b93},{h:1,c:0xffffff}],
    oceanColor: 0x1a4f8a, iceCaps: 0.88, surfaceG: 9.81, spin: 0.03, axialTilt: 23.4 * D2R,
    orbit: els(1.0, 0.0167, 0.0, 200),
    atmosphere: { color: 0x4d9eff, scale: 1.18, power: 3.4, intensity: 1.6 },
    atmoPhys: { height: 1.25, density: 1.0 },
    scan: { cls: 'Rocky (habitable)', mass: '5.97×10²⁴ kg', radius: '6,371 km',
            grav: '9.81 m/s²', temp: '15 °C mean', press: '1.013 bar',
            atmo: [['N₂', 78], ['O₂', 21], ['Ar', 0.9], ['CO₂', 0.04]] } });

  addBody({ name: 'Moon', type: 'rocky', parent: earth, systemIndex: sysIdx,
    visRadius: radiusScale(1737), seed: 44, freq: 3.4, amp: 0.05, ridged: 0.3,
    craters: 90, seaLevel: null,
    palette: [{h:0,c:0x55534f},{h:0.5,c:0x7d7a74},{h:1,c:0xb0aca4}],
    oceanColor: 0, iceCaps: 0, surfaceG: 1.62, spin: 0.005,
    orbit: els(0.055, 0.0549, 5.1, 30, { periodScale: 0.25 }),
    scan: { cls: 'Rocky moon (airless)', mass: '7.35×10²² kg', radius: '1,737 km',
            grav: '1.62 m/s²', temp: '−173 … +127 °C', press: '≈ 0',
            atmo: [['He/Ne/Ar', 100]] } });

  P({ name: 'Mars', type: 'rocky', visRadius: radiusScale(3390),
    seed: 55, freq: 2.8, amp: 0.075, ridged: 1.0, craters: 45, seaLevel: null,
    palette: [{h:0,c:0x6e3320},{h:0.45,c:0x9c4a26},{h:0.7,c:0xc06a38},{h:1,c:0xd9915d}],
    oceanColor: 0, iceCaps: 0.9, surfaceG: 3.71, spin: 0.028, axialTilt: 25 * D2R,
    orbit: els(1.524, 0.0934, 1.85, 300),
    atmosphere: { color: 0xd88a58, scale: 1.1, power: 3.8, intensity: 0.7 },
    atmoPhys: { height: 1.12, density: 0.15 },
    scan: { cls: 'Rocky (cold desert)', mass: '6.42×10²³ kg', radius: '3,390 km',
            grav: '3.71 m/s²', temp: '−63 °C mean', press: '0.006 bar',
            atmo: [['CO₂', 95], ['N₂', 2.8], ['Ar', 2]] } });

  const jupiter = P({ name: 'Jupiter', type: 'gas', visRadius: radiusScale(69911),
    seed: 66, surfaceG: 24.8, spin: 0.06, axialTilt: 3 * D2R,
    gas: { colA: 0xd8c3a0, colB: 0x9c7a55, colC: 0xefe4cd, bands: 11, storm: true, seed: 6.6 },
    orbit: els(5.203, 0.0484, 1.3, 15),
    atmosphere: { color: 0xd9b98a, scale: 1.08, power: 3.5, intensity: 0.9 },
    atmoPhys: { height: 1.1, density: 2.0 },
    scan: { cls: 'Gas giant', mass: '1.90×10²⁷ kg', radius: '69,911 km',
            grav: '24.8 m/s²', temp: '−108 °C (cloud tops)', press: '≫1000 bar (no surface)',
            atmo: [['H₂', 90], ['He', 10]] } });

  ['Io:0.020:0x7', 'Europa:0.030:0x8', 'Ganymede:0.042:0x9', 'Callisto:0.056:0xa']
    .forEach((s, k) => {
      const [nm, aStr] = s.split(':');
      addBody({ name: nm, type: 'rocky', parent: jupiter, systemIndex: sysIdx,
        visRadius: radiusScale(2000 + k * 350), seed: 100 + k * 7,
        freq: 3.5, amp: 0.04, ridged: 0.4, craters: 30, seaLevel: null,
        palette: k === 0
          ? [{h:0,c:0x8a7a2c},{h:0.6,c:0xc9b13c},{h:1,c:0xe8dd8a}]
          : [{h:0,c:0x6d7580},{h:0.6,c:0x9aa4ae},{h:1,c:0xd7dde2}],
        oceanColor: 0, iceCaps: 0, surfaceG: 1.5, spin: 0.004,
        orbit: els(parseFloat(aStr), 0.005, 1 + k, 60 + k * 90, { periodScale: 0.15 }),
        scan: { cls: 'Icy/volcanic moon', mass: '≈10²³ kg', radius: '≈2,000 km',
                grav: '≈1.5 m/s²', temp: '−160 °C', press: '≈ 0',
                atmo: [['trace', 100]] } });
    });

  const saturn = P({ name: 'Saturn', type: 'gas', visRadius: radiusScale(58232),
    seed: 77, surfaceG: 10.4, spin: 0.055, axialTilt: 26.7 * D2R,
    gas: { colA: 0xe6d5a8, colB: 0xbfa46e, colC: 0xf4ead0, bands: 8, storm: false, seed: 7.7 },
    rings: { inner: 1.35, outer: 2.4, colA: 0xd9c8a4, colB: 0x8a7a5c, tilt: 0.05 },
    orbit: els(9.537, 0.0542, 2.49, 220),
    atmoPhys: { height: 1.1, density: 1.6 },
    scan: { cls: 'Gas giant (ringed)', mass: '5.68×10²⁶ kg', radius: '58,232 km',
            grav: '10.4 m/s²', temp: '−139 °C', press: '≫1000 bar',
            atmo: [['H₂', 96], ['He', 3]] } });

  addBody({ name: 'Titan', type: 'rocky', parent: saturn, systemIndex: sysIdx,
    visRadius: radiusScale(2575), seed: 130, freq: 2.4, amp: 0.03, ridged: 0.5,
    craters: 6, seaLevel: 0.0,
    palette: [{h:0,c:0x7a5a28},{h:0.6,c:0xa8823c},{h:1,c:0xd0ad5e}],
    oceanColor: 0x3b3220, iceCaps: 0, surfaceG: 1.35, spin: 0.003,
    orbit: els(0.06, 0.028, 0.3, 10, { periodScale: 0.2 }),
    atmosphere: { color: 0xd8a24e, scale: 1.2, power: 3.0, intensity: 1.4 },
    atmoPhys: { height: 1.25, density: 1.4 },
    scan: { cls: 'Moon (dense atmosphere)', mass: '1.35×10²³ kg', radius: '2,575 km',
            grav: '1.35 m/s²', temp: '−179 °C', press: '1.45 bar',
            atmo: [['N₂', 95], ['CH₄', 5]] } });

  P({ name: 'Uranus', type: 'gas', visRadius: radiusScale(25362),
    seed: 88, surfaceG: 8.7, spin: -0.03, axialTilt: 97.8 * D2R,
    gas: { colA: 0xaee5e0, colB: 0x6fbdc2, colC: 0xd6f4f0, bands: 4, storm: false, seed: 8.8 },
    orbit: els(19.19, 0.0472, 0.77, 100),
    atmoPhys: { height: 1.1, density: 1.2 },
    scan: { cls: 'Ice giant', mass: '8.68×10²⁵ kg', radius: '25,362 km',
            grav: '8.69 m/s²', temp: '−197 °C', press: '≫1000 bar',
            atmo: [['H₂', 83], ['He', 15], ['CH₄', 2]] } });

  P({ name: 'Neptune', type: 'gas', visRadius: radiusScale(24622),
    seed: 99, surfaceG: 11.15, spin: 0.035, axialTilt: 28 * D2R,
    gas: { colA: 0x5d86e8, colB: 0x2c4bb0, colC: 0x9cb8f2, bands: 6, storm: false, seed: 9.9 },
    orbit: els(30.07, 0.0086, 1.77, 260),
    atmoPhys: { height: 1.1, density: 1.3 },
    scan: { cls: 'Ice giant', mass: '1.02×10²⁶ kg', radius: '24,622 km',
            grav: '11.15 m/s²', temp: '−201 °C', press: '≫1000 bar',
            atmo: [['H₂', 80], ['He', 19], ['CH₄', 1]] } });

  // ---- Asteroid belt: instanced rendering, 1600 rocks Mars↔Jupiter ----
  const beltGeo = new THREE.IcosahedronGeometry(1, 0);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x8d8378, roughness: 1 });
  const belt = new THREE.InstancedMesh(beltGeo, beltMat, 1600);
  const dummy = new THREE.Object3D();
  const brand = mulberry32(4242);
  for (let i = 0; i < 1600; i++) {
    const a = (2.1 + brand() * 1.2) * AU;
    const th = brand() * Math.PI * 2;
    dummy.position.set(
      Math.cos(th) * a,
      (brand() - 0.5) * 60,
      Math.sin(th) * a);
    dummy.rotation.set(brand()*6, brand()*6, brand()*6);
    dummy.scale.setScalar(0.6 + brand() * 2.4);
    dummy.updateMatrix();
    belt.setMatrixAt(i, dummy.matrix);
  }
  scene.add(belt);

  systems.push({
    name: 'SOL', star: sun, origin,
    spawn: () => {
      const e = bodies.find(b => b.name === 'Earth');
      return e.position.clone().add(new THREE.Vector3(0, e.visRadius * 1.2, e.visRadius * 4));
    },
    belt
  });
}

/* =====================================================================
   7. PROCEDURAL STAR SYSTEMS (seeded generation)
   ===================================================================== */
const NAME_A = ['Kel','Vor','Ash','Tyr','Nyx','Ori','Zeh','Cal','Umb','Rho'];
const NAME_B = ['aris','onis','eth','ara','ion','umis','yra','antor','eus','ix'];
function genName(rand) {
  return NAME_A[Math.floor(rand()*NAME_A.length)] + NAME_B[Math.floor(rand()*NAME_B.length)];
}

function buildProceduralSystem(seed, originVec) {
  const rand = mulberry32(seed);
  const sysIdx = systems.length;
  const starName = genName(rand).toUpperCase() + '-' + (seed % 97);
  const starHue = rand();
  const hot  = starHue < 0.33 ? 0xcfe0ff : starHue < 0.66 ? 0xfff3b0 : 0xffd9a8;
  const cool = starHue < 0.33 ? 0x6f9dff : starHue < 0.66 ? 0xff8c1c : 0xd94f1e;
  const starR = radiusScale(400000 + rand() * 600000) * 0.55;

  const star = addBody({
    name: starName, type: 'star', systemIndex: sysIdx,
    visRadius: starR, surfaceG: 30 + rand() * 30, spin: 0.002,
    hot, cool, lightColor: hot,
    scan: { cls: 'Main-sequence star (procedural)', mass: (0.4+rand()*2).toFixed(2)+' M☉',
            radius: '—', grav: '—', temp: (3000 + Math.floor(rand()*5000)) + ' K', press: '—',
            atmo: [['H', 74], ['He', 24], ['metals', 2]] }
  });
  star.group.position.copy(originVec);

  const nPl = 3 + Math.floor(rand() * 4);
  let firstRock = null;
  for (let p = 0; p < nPl; p++) {
    const aAU = 0.4 + p * (0.5 + rand() * 0.9);
    const isGas = aAU > 2.2 && rand() < 0.65;
    const nm = genName(rand);
    if (isGas) {
      const c1 = new THREE.Color().setHSL(rand(), 0.4 + rand()*0.3, 0.6);
      const c2 = c1.clone().offsetHSL(0.04, 0, -0.25);
      const c3 = c1.clone().offsetHSL(-0.03, 0, 0.2);
      addBody({ name: nm, type: 'gas', parent: star, systemIndex: sysIdx,
        visRadius: radiusScale(30000 + rand() * 45000),
        surfaceG: 8 + rand() * 18, spin: 0.03 + rand()*0.04,
        gas: { colA: c1.getHex(), colB: c2.getHex(), colC: c3.getHex(),
               bands: 4 + Math.floor(rand()*9), storm: rand() < 0.4, seed: rand()*20 },
        rings: rand() < 0.45 ? { inner: 1.3, outer: 2.0 + rand(),
               colA: c3.getHex(), colB: c2.getHex(), tilt: rand()*0.3 } : null,
        orbit: els(aAU, rand()*0.1, rand()*6, rand()*360),
        atmoPhys: { height: 1.1, density: 1.5 },
        scan: { cls: 'Gas giant (procedural)', mass: (0.1+rand()*3).toFixed(2)+' Mʲ',
                radius: '—', grav: (8+rand()*18).toFixed(1)+' m/s²',
                temp: (-180 + Math.floor(rand()*120)) + ' °C', press: '≫1000 bar',
                atmo: [['H₂', 88], ['He', 11], ['CH₄', 1]] } });
    } else {
      const hue = rand();
      const base = new THREE.Color().setHSL(hue, 0.35, 0.35);
      const mid  = base.clone().offsetHSL(0.02, 0, 0.12);
      const high = base.clone().offsetHSL(0.04, -0.1, 0.3);
      const hasAtmo = rand() < 0.5;
      const g = 2 + rand() * 12;
      const rock = addBody({ name: nm, type: 'rocky', parent: star, systemIndex: sysIdx,
        visRadius: radiusScale(2000 + rand() * 7000),
        seed: seed * 13 + p * 101, freq: 2 + rand() * 2.5,
        amp: 0.03 + rand() * 0.06, ridged: rand(), craters: Math.floor(rand() * 70),
        seaLevel: hasAtmo && rand() < 0.5 ? 0.01 : null,
        palette: [{h:0,c:base.getHex()},{h:0.55,c:mid.getHex()},{h:1,c:high.getHex()}],
        oceanColor: new THREE.Color().setHSL((hue+0.5)%1, 0.5, 0.3).getHex(),
        iceCaps: rand() < 0.4 ? 0.85 : 0,
        surfaceG: g, spin: 0.01 + rand()*0.03,
        orbit: els(aAU, rand()*0.15, rand()*8, rand()*360),
        atmosphere: hasAtmo ? { color: new THREE.Color().setHSL(rand(),0.6,0.6).getHex(),
                                scale: 1.15, power: 3.2, intensity: 1.2 } : null,
        atmoPhys: hasAtmo ? { height: 1.2, density: 0.3 + rand() } : null,
        scan: { cls: 'Rocky (procedural)', mass: (0.05+rand()*2).toFixed(2)+' M⊕',
                radius: '—', grav: g.toFixed(2)+' m/s²',
                temp: (-150 + Math.floor(rand()*300)) + ' °C',
                press: hasAtmo ? (0.1+rand()*4).toFixed(2)+' bar' : '≈ 0',
                atmo: hasAtmo
                  ? [['CO₂', Math.floor(30+rand()*60)], ['N₂', Math.floor(rand()*40)], ['Ar', Math.floor(rand()*8)]]
                  : [['trace', 100]] } });
      if (!firstRock) firstRock = rock;
    }
  }

  systems.push({
    name: starName, star, origin: originVec.clone(),
    spawn: () => {
      const t = firstRock || star;
      return t.position.clone().add(new THREE.Vector3(0, t.visRadius * 1.5, t.visRadius * 5));
    }
  });
}

/* =====================================================================
   8. SPACESHIP — mesh, Newtonian physics, controls
   ===================================================================== */
function buildShip() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.4, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.6, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x66d9ff, roughness: 0.1, metalness: 0.9, emissive: 0x113344 });

  const fus = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.6, 12), hullMat);
  fus.rotation.x = -Math.PI / 2; g.add(fus);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), glassMat);
  cabin.position.set(0, 0.35, -0.4); g.add(cabin);
  const wingGeo = new THREE.BoxGeometry(4.2, 0.08, 1.4);
  const wing = new THREE.Mesh(wingGeo, darkMat);
  wing.position.set(0, -0.1, 1.0); g.add(wing);
  const finGeo = new THREE.BoxGeometry(0.08, 1.2, 1.0);
  const fin = new THREE.Mesh(finGeo, darkMat);
  fin.position.set(0, 0.6, 1.4); g.add(fin);
  [-1, 1].forEach(s => {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.3, 10), darkMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s * 1.5, -0.1, 1.6);
    g.add(eng);
  });
  // engine flame sprites
  const flameTex = makeGlowTexture('rgba(180,230,255,1)', 'rgba(60,120,255,0.5)');
  const flames = [];
  [-1.5, 1.5, 0].forEach(x => {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    f.position.set(x, x === 0 ? 0 : -0.1, x === 0 ? 2.6 : 2.4);
    f.scale.setScalar(0.001);
    g.add(f); flames.push(f);
  });
  // re-entry glow shell
  const burn = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff6a1c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(burn);
  scene.add(g);
  return { group: g, flames, burn };
}

const shipVisual = buildShip();
const ship = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  fuel: 100, hull: 100, shield: 100,
  throttle: 0,
  landedOn: null,
  landLocal: new THREE.Vector3(),
  lastHitT: -99,
  dead: false
};

const THRUST_ACCEL = 42;       // u/s²
const BOOST_MULT = 9;
const ROT_SPEED = 1.6;         // rad/s
const SAFE_LANDING_V = 22;     // u/s

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyT') scanNearest();
  if (e.code === 'KeyN') jumpNextSystem();
  if (e.code === 'KeyH') document.getElementById('controls').classList.toggle('hidden');
  if (/^Digit[1-5]$/.test(e.code)) {
    warpIndex = parseInt(e.code.slice(5), 10) - 1;
    ui.warp.textContent = '×' + WARP_STEPS[warpIndex];
  }
  if (['ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function respawn() {
  const sys = systems[currentSystem];
  ship.pos.copy(sys.spawn());
  ship.vel.set(0, 0, 0);
  ship.quat.identity();
  ship.fuel = 100; ship.hull = 100; ship.shield = 100;
  ship.landedOn = null; ship.dead = false;
  document.getElementById('gameover').classList.add('hidden');
}
document.getElementById('respawn').addEventListener('click', () => {
  currentSystem = 0;
  ui.system.textContent = systems[0].name;
  respawn();
});

let currentSystem = 0;
function jumpNextSystem() {
  if (ship.dead) return;
  if (ship.fuel < 20) return flashFlag('flag-warn', 1.2);
  ship.fuel -= 20;
  currentSystem = (currentSystem + 1) % systems.length;
  const sys = systems[currentSystem];
  ship.pos.copy(sys.spawn());
  ship.vel.set(0, 0, 0);
  ship.landedOn = null;
  ui.system.textContent = sys.name;
}

/* =====================================================================
   9. HUD BINDINGS
   ===================================================================== */
const ui = {
  fuelF: document.getElementById('fuel-fill'), fuelV: document.getElementById('fuel-val'),
  hullF: document.getElementById('hull-fill'), hullV: document.getElementById('hull-val'),
  shF: document.getElementById('shield-fill'), shV: document.getElementById('shield-val'),
  vel: document.getElementById('vel-val'), thr: document.getElementById('thr-val'),
  grav: document.getElementById('grav-val'),
  nearName: document.getElementById('near-name'), nearDist: document.getElementById('near-dist'),
  alt: document.getElementById('alt-val'),
  warp: document.getElementById('warp-val'), system: document.getElementById('system-name'),
  fAtmo: document.getElementById('flag-atmo'), fBurn: document.getElementById('flag-reentry'),
  fLand: document.getElementById('flag-landed'), fWarn: document.getElementById('flag-warn'),
  vignette: document.getElementById('burn-vignette'),
  labels: document.getElementById('labels'),
  scanner: document.getElementById('scanner')
};
let warpIndex = 0;

const flagTimers = {};
function flashFlag(id, sec) {
  document.getElementById(id).classList.remove('hidden');
  flagTimers[id] = sec;
}

function scanNearest() {
  const b = nearestBody();
  if (!b || !b.scan) return;
  const d = b.position.distanceTo(ship.pos);
  if (d > 40000) return;
  ui.scanner.classList.remove('hidden');
  document.getElementById('scan-name').textContent = b.name.toUpperCase();
  document.getElementById('scan-class').textContent = b.scan.cls;
  document.getElementById('scan-mass').textContent = b.scan.mass;
  document.getElementById('scan-radius').textContent = b.scan.radius;
  document.getElementById('scan-grav').textContent = b.scan.grav;
  document.getElementById('scan-temp').textContent = b.scan.temp;
  document.getElementById('scan-press').textContent = b.scan.press;
  const list = document.getElementById('scan-atmo');
  list.innerHTML = '';
  b.scan.atmo.forEach(([gas, pct]) => {
    const row = document.createElement('div');
    row.className = 'atmo-row';
    row.innerHTML = '<b>' + gas + '</b><span class="abar"><i style="width:' +
      Math.min(100, pct) + '%"></i></span><em>' + pct + '%</em>';
    list.appendChild(row);
  });
}

function nearestBody() {
  let best = null, bd = Infinity;
  for (const b of bodies) {
    if (b.systemIndex !== currentSystem) continue;
    const d = b.position.distanceTo(ship.pos) - b.visRadius;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// projected DOM labels for nearby bodies
const labelPool = [];
for (let i = 0; i < 8; i++) {
  const el = document.createElement('div');
  el.className = 'body-label hidden';
  ui.labels.appendChild(el);
  labelPool.push(el);
}
const _proj = new THREE.Vector3();
function updateLabels() {
  const cands = bodies
    .filter(b => b.systemIndex === currentSystem)
    .map(b => ({ b, d: b.position.distanceTo(ship.pos) }))
    .filter(o => o.d < 120000)
    .sort((a, z) => a.d - z.d)
    .slice(0, labelPool.length);
  labelPool.forEach((el, i) => {
    const o = cands[i];
    if (!o) { el.classList.add('hidden'); return; }
    _proj.copy(o.b.position).project(camera);
    if (_proj.z > 1 || Math.abs(_proj.x) > 1.05 || Math.abs(_proj.y) > 1.05) {
      el.classList.add('hidden'); return;
    }
    el.classList.remove('hidden');
    el.style.left = ((_proj.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    el.style.top = ((-_proj.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    el.textContent = o.b.name + ' · ' + fmtDist(o.d);
  });
}
function fmtDist(d) {
  if (d > AU * 0.5) return (d / AU).toFixed(2) + ' AU';
  if (d > 1000) return (d / 1000).toFixed(1) + ' ku';
  return Math.round(d) + ' u';
}

/* =====================================================================
   10. PHYSICS STEP — Newtonian inertia, n-body gravity, drag, landing
   ===================================================================== */
const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();

function physicsStep(dt) {
  if (ship.dead) return;

  // ---- rotation (torque-free attitude control, instant response) ----
  const rq = new THREE.Quaternion();
  if (keys['KeyA'])      { rq.setFromAxisAngle(new THREE.Vector3(0,1,0),  ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['KeyD'])      { rq.setFromAxisAngle(new THREE.Vector3(0,1,0), -ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['ArrowUp'])   { rq.setFromAxisAngle(new THREE.Vector3(1,0,0), -ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['ArrowDown']) { rq.setFromAxisAngle(new THREE.Vector3(1,0,0),  ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['KeyQ'])      { rq.setFromAxisAngle(new THREE.Vector3(0,0,1),  ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['KeyE'])      { rq.setFromAxisAngle(new THREE.Vector3(0,0,1), -ROT_SPEED*dt); ship.quat.multiply(rq); }
  ship.quat.normalize();

  _fwd.set(0, 0, -1).applyQuaternion(ship.quat);

  // ---- landed state: ride the planet, refuel, wait for takeoff ----
  if (ship.landedOn) {
    const b = ship.landedOn;
    _tmpV.copy(ship.landLocal).applyQuaternion(b.mesh.getWorldQuaternion(new THREE.Quaternion()));
    ship.pos.copy(b.position).addScaledVector(_tmpV.normalize(), b.visRadius + 1.6);
    ship.vel.copy(b.velocity);
    ship.fuel = Math.min(100, ship.fuel + 6 * dt);
    ship.hull = Math.min(100, ship.hull + 2 * dt);
    ui.fLand.classList.remove('hidden');
    if (keys['KeyW'] && ship.fuel > 0.5) {          // take off
      ship.landedOn = null;
      _tmpV2.copy(ship.pos).sub(b.position).normalize();
      ship.vel.addScaledVector(_tmpV2, 30);
      ui.fLand.classList.add('hidden');
    }
    return;
  }
  ui.fLand.classList.add('hidden');

  // ---- thrust (consumes fuel; nothing decelerates you but physics) ----
  ship.throttle = 0;
  const boosting = keys['Space'];
  const mult = boosting ? BOOST_MULT : 1;
  if (ship.fuel > 0) {
    if (keys['KeyW']) {
      ship.vel.addScaledVector(_fwd, THRUST_ACCEL * mult * dt);
      ship.fuel -= (boosting ? 6 : 1.1) * dt;
      ship.throttle = boosting ? 1 : 0.55;
    }
    if (keys['KeyS']) {
      ship.vel.addScaledVector(_fwd, -THRUST_ACCEL * 0.6 * dt);
      ship.fuel -= 0.8 * dt;
      ship.throttle = Math.max(ship.throttle, 0.3);
    }
    if (keys['ShiftLeft'] || keys['ShiftRight']) {  // retro-thrusters: burn against v
      const sp = ship.vel.length();
      if (sp > 0.01) {
        const dec = Math.min(sp, THRUST_ACCEL * 1.4 * dt);
        ship.vel.addScaledVector(_tmpV.copy(ship.vel).normalize(), -dec);
        ship.fuel -= 0.9 * dt;
        ship.throttle = Math.max(ship.throttle, 0.4);
      }
    }
    ship.fuel = Math.max(0, ship.fuel);
  }

  // ---- n-body gravity (gravity-assist slingshots emerge naturally) ----
  let gPull = 0;
  let atmoBody = null, atmoDensity = 0;
  for (const b of bodies) {
    if (b.systemIndex !== currentSystem || b.mu === 0) continue;
    _tmpV.copy(b.position).sub(ship.pos);
    const r = _tmpV.length();
    if (r > b.visRadius * 120) continue;            // sphere of influence cutoff
    const a = b.mu / (r * r);
    ship.vel.addScaledVector(_tmpV.normalize(), a * dt);
    gPull += a;

    // atmosphere check
    if (b.atmo && r < b.visRadius * b.atmo.height) {
      const alt01 = (r - b.visRadius) / (b.visRadius * (b.atmo.height - 1));
      atmoDensity = b.atmo.density * Math.exp(-Math.max(0, alt01) * 4);
      atmoBody = b;
    }

    // ---- surface collision / landing ----
    if (r < b.visRadius + 1.6) {
      const relV = _tmpV2.copy(ship.vel).sub(b.velocity);
      const speed = relV.length();
      if (b.type === 'star') { damage(200 * dt + 50); }
      else if (speed <= SAFE_LANDING_V) {
        ship.landedOn = b;
        ship.landLocal.copy(ship.pos).sub(b.position)
          .applyQuaternion(b.mesh.getWorldQuaternion(new THREE.Quaternion()).invert());
      } else {
        damage((speed - SAFE_LANDING_V) * 1.6);
        // bounce: reflect relative velocity off the surface normal
        const n = _tmpV.copy(ship.pos).sub(b.position).normalize();
        const vn = relV.dot(n);
        relV.addScaledVector(n, -1.7 * vn);
        ship.vel.copy(b.velocity).addScaledVector(relV, 0.55);
        ship.pos.copy(b.position).addScaledVector(n, b.visRadius + 2.0);
      }
    }
  }
  ui.grav.textContent = gPull.toFixed(2);
  if (gPull > 25) flashFlag('flag-warn', 0.3); 

  // ---- atmospheric drag + re-entry burn ----
  let burning = 0;
  if (atmoBody) {
    ui.fAtmo.classList.remove('hidden');
    const relV = _tmpV2.copy(ship.vel).sub(atmoBody.velocity);
    const sp = relV.length();
    const drag = 0.0025 * atmoDensity * sp;         // a = k·ρ·v² (per unit v)
    ship.vel.addScaledVector(relV, -Math.min(0.9, drag * dt));
    if (sp > 90) {
      burning = THREE.MathUtils.clamp((sp - 90) / 160, 0, 1) * atmoDensity;
      damage(burning * 9 * dt);
    }
  } else {
    ui.fAtmo.classList.add('hidden');
  }
  ui.fBurn.classList.toggle('hidden', burning < 0.05);
  ui.vignette.style.opacity = Math.min(0.9, burning).toFixed(2);
  shipVisual.burn.material.opacity = Math.min(0.65, burning);

  // ---- shields recharge after 5 s without damage ----
  if (perfTime - ship.lastHitT > 5) {
    ship.shield = Math.min(100, ship.shield + 1.6 * dt);
  }

  // ---- integrate (pure inertia in vacuum — Newton's first law) ----
  ship.pos.addScaledVector(ship.vel, dt);
}

function damage(amount) {
  ship.lastHitT = perfTime;
  if (ship.shield > 0) {
    const absorbed = Math.min(ship.shield, amount * 0.8);
    ship.shield -= absorbed;
    amount -= absorbed;
  }
  ship.hull -= amount;
  if (ship.hull <= 0 && !ship.dead) {
    ship.hull = 0; ship.dead = true;
    document.getElementById('gameover').classList.remove('hidden');
  }
}

/* =====================================================================
   11. MAIN LOOP
   ===================================================================== */
let simTime = 0;        // orbital time (warped)
let perfTime = 0;       // real seconds
let lastFrame = performance.now();
const _sunPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

function updateBodies(dt) {
  const warp = WARP_STEPS[warpIndex];
  simTime += dt * warp;
  for (const b of bodies) {
    b._prevPos.copy(b.position);
    if (b.orbit && b.parent) {
      keplerPosition(b.orbit, simTime, _tmpV);
      b.position.copy(b.parent.position).add(_tmpV);
    } else {
      b.position.copy(systems[b.systemIndex] ? systems[b.systemIndex].origin : b.group.position);
    }
    b.group.position.copy(b.position);
    if (dt > 0) b.velocity.copy(b.position).sub(b._prevPos).divideScalar(dt);
    b.mesh.rotation.y += b.spin * dt * Math.min(warp, 50);
    // shader uniforms
    if (b.gasMat) {
      b.gasMat.uniforms.uTime.value = perfTime;
      const star = systems[b.systemIndex].star;
      b.gasMat.uniforms.uSunPos.value.copy(star.position);
    }
    if (b.type === 'star') {
      b.mesh.material.uniforms.uTime.value = perfTime;
    }
    if (b._atmoMat) {
      const star = systems[b.systemIndex].star;
      b._atmoMat.uniforms.uSunPos.value.copy(star.position);
    }
  }
  // asteroid belt slow revolution
  if (systems[0].belt) systems[0].belt.rotation.y += 0.002 * dt * Math.min(warp, 50);
}

function updateCamera(dt) {
  shipVisual.group.position.copy(ship.pos);
  shipVisual.group.quaternion.copy(ship.quat);
  // engine flames scale with throttle
  shipVisual.flames.forEach(f => {
    const s = ship.throttle * (1.2 + Math.random() * 0.5);
    f.scale.setScalar(Math.max(0.001, s));
  });
  // chase camera
  _up.set(0, 1, 0).applyQuaternion(ship.quat);
  camTarget.copy(ship.pos)
    .add(_tmpV.set(0, 3.2, 11.5).applyQuaternion(ship.quat));
  const k = 1 - Math.pow(0.0015, dt);
  camPos.lerp(camTarget, k);
  camera.position.copy(camPos);
  camera.up.copy(_up);
  camera.lookAt(_tmpV.copy(ship.pos).addScaledVector(_fwd, 30));
  // subtle FOV kick with speed
  const targetFov = 62 + Math.min(14, ship.vel.length() * 0.012);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
  camera.updateProjectionMatrix();
  starfield.position.copy(camera.position); // keep sky infinitely far
}

function updateHUD() {
  ui.fuelF.style.width = ship.fuel + '%';  ui.fuelV.textContent = Math.round(ship.fuel) + '%';
  ui.hullF.style.width = ship.hull + '%';  ui.hullV.textContent = Math.round(ship.hull) + '%';
  ui.shF.style.width = ship.shield + '%';  ui.shV.textContent = Math.round(ship.shield) + '%';
  ui.vel.textContent = ship.vel.length().toFixed(1);
  ui.thr.textContent = Math.round(ship.throttle * 100) + '%';
  const nb = nearestBody();
  if (nb) {
    ui.nearName.textContent = nb.name;
    const d = nb.position.distanceTo(ship.pos);
    ui.nearDist.textContent = fmtDist(d);
    ui.alt.textContent = fmtDist(Math.max(0, d - nb.visRadius));
  }
  for (const id in flagTimers) {
    flagTimers[id] -= 0.05;
    if (flagTimers[id] <= 0) { document.getElementById(id).classList.add('hidden'); delete flagTimers[id]; }
  }
}

let frameCount = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = Math.min(0.05, (now - lastFrame) / 1000); // clamp to avoid tunneling
  lastFrame = now;
  perfTime += dt;

  updateBodies(dt);
  // substep physics for stability near planets
  const sub = 2;
  for (let s = 0; s < sub; s++) physicsStep(dt / sub);
  updateCamera(dt);

  frameCount++;
  if (frameCount % 3 === 0) { updateHUD(); updateLabels(); }

  renderer.render(scene, camera);
}

/* =====================================================================
   12. BOOTSTRAP — staged generation with loading feedback
   ===================================================================== */
const loaderFill = document.getElementById('loader-fill');
const loaderStatus = document.getElementById('loader-status');
const buildSteps = [
  ['Building the Solar System…', () => buildSolarSystem()],
  ['Seeding star system Alpha…', () => buildProceduralSystem(1337, new THREE.Vector3( 900000, 40000, -350000))],
  ['Seeding star system Beta…',  () => buildProceduralSystem(4242, new THREE.Vector3(-750000, -60000, 600000))],
  ['Seeding star system Gamma…', () => buildProceduralSystem(9001, new THREE.Vector3( 200000, 120000, 950000))],
  ['Calibrating orbits…', () => { updateBodies(0); updateBodies(0.0001); }],
  ['Launching…', () => {
    respawn();
    camPos.copy(ship.pos).add(new THREE.Vector3(0, 4, 14));
    document.getElementById('hud').classList.remove('hidden');
  }]
];
let stepIdx = 0;
function runBuildStep() {
  if (stepIdx >= buildSteps.length) {
    document.getElementById('loader').classList.add('fade');
    lastFrame = performance.now();
    animate();
    return;
  }
  const [label, fn] = buildSteps[stepIdx];
  loaderStatus.textContent = label;
  loaderFill.style.width = Math.round((stepIdx / buildSteps.length) * 100) + '%';
  // give the browser a frame to paint the loader text before heavy work
  requestAnimationFrame(() => setTimeout(() => {
    fn();
    stepIdx++;
    runBuildStep();
  }, 16));
}
runBuildStep();
