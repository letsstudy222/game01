/* =====================================================================
   HELIOS — Procedural 3D Universe Simulator  (v2)
   Pure client-side: HTML5 + Vanilla JS + Three.js r128 (CDN).
   ---------------------------------------------------------------------
   v2 changes:
     • Ship physics: linear damping (auto-decelerate), 3 speed modes
       (NORMAL / TURBO=Shift / WARP DRIVE=F or J with FOV stretch)
     • True logarithmic scaling for radii AND orbital distances
     • THREE.Clock + delta-time Euler integration (FPS-independent)
     • Realistic per-planet surfaces: cratered gray Mercury, cloud-
       shrouded volcanic Venus, specular-ocean Earth with drifting
       clouds, CO₂-capped Mars, counter-flowing Jupiter bands + Great
       Red Spot, straw Saturn + bright rings, smooth cyan Uranus,
       deep-blue Neptune with white streaks + Great Dark Spot
   ===================================================================== */
'use strict';

/* =====================================================================
   0. UTILITIES — seeded RNG + simplex noise (JS & GLSL)
   ===================================================================== */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    const x1 = x0 - i1 + G3,   y1 = y0 - j1 + G3,   z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3,  y3 = y0 - 1 + 3*G3,  z3 = z0 - 1 + 3*G3;
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
    return 32 * (n0 + n1 + n2 + n3);
  };
  return Simplex;
})();

function fbm(simplex, x, y, z, octaves, lacunarity, gain) {
  let amp = 0.5, freq = 1, sum = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * simplex.noise3(x * freq, y * freq, z * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum;
}

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
   1. LOGARITHMIC SCALING
   ---------------------------------------------------------------------
   Real 1:1 space is 99.9999% emptiness. We compress it with log maps:
     radius   : R = (ln(km) − 5)^2.2 × 1.5        (log-power: keeps the
                Sun ≫ Jupiter ≫ Earth ≫ Moon contrast that pure ln loses)
     distance : D = (ln(km) − offset) × K          (planets vs moons use
                different offsets/K, both pure Math.log as requested)
   The ship is ~2 units long, so Earth (R≈28) towers over it and
   Jupiter (R≈82) fills the sky on approach. The renderer's logarithmic
   depth buffer removes Z-fighting across the whole range.
   ===================================================================== */
function logRadius(km)      { return Math.pow(Math.log(km) - 5, 2.2) * 1.5; }
function logOrbitPlanet(km) { return (Math.log(km) - 16.8) * 2600; }  // heliocentric
function logOrbitMoon(km)   { return (Math.log(km) - 11.7) * 140;  }  // planetocentric
const KM_PER_AU = 1.496e8;
const YEAR_SECONDS = 300;            // 1 Earth year at time-warp ×1
const WARP_STEPS = [1, 10, 50, 200, 1000];
const G_GAME = 1.25;

const canvas = document.getElementById('space');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, logarithmicDepthBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.05, 5e6);
scene.add(new THREE.AmbientLight(0x223344, 0.35));

const clock = new THREE.Clock();   // FPS-independent delta time

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  if (gradePass) gradePass.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
});

/* =====================================================================
   2. STARFIELD + glow texture helper
   ===================================================================== */
function buildStarfield() {
  const rand = mulberry32(777);
  const N = 9000;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const bandNormal = new THREE.Vector3(0.35, 1, 0.2).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    v.set(s * Math.cos(th), u, s * Math.sin(th));
    if (rand() < 0.45) {
      const d = v.dot(bandNormal);
      v.addScaledVector(bandNormal, -d * 0.85).normalize();
    }
    const R = 2.2e6;
    pos[i*3] = v.x * R; pos[i*3+1] = v.y * R; pos[i*3+2] = v.z * R;
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

/* =====================================================================
   2b. CINEMATIC FX — nebula, space dust, post-processing pipeline
   ---------------------------------------------------------------------
   RenderPass → UnrealBloomPass → WarpStreakPass (radial motion blur)
   → GradePass (ACES filmic tonemap + NMS-style teal/orange grade +
     atmosphere immersion tint + vignette + cockpit hologram overlay).
   If the post-processing CDN scripts failed to load, everything
   gracefully falls back to a plain renderer.render().
   ===================================================================== */
const fx = {
  burn: 0,            // re-entry intensity (set by physics)
  turbo: 0,           // turbo-thrust shake (set by physics)
  relSpeed: 0,        // ship speed RELATIVE to the local frame — HUD/FX
  relVel: new THREE.Vector3(),   //   must never use absolute velocity,
  atmoAmt: 0,         // 0..1 how deep inside an atmosphere
  atmoSm: 0,          // smoothed
  atmoColor: new THREE.Color(0x88aaff),
  warp: 0             // smoothed warp-drive ramp 0..1
};

let composer = null, bloomPass = null, warpPass = null, gradePass = null;
let nebula = null, dust = null;

// ---- Procedural multi-colour nebula: THREE.Points + soft noise shader
function buildNebula() {
  const rand = mulberry32(31337);
  const palette = [0x7b4dff, 0x19d9c4, 0xff4da6, 0xff9a3c, 0x3c7bff, 0x9dff6a];
  const clusters = [];
  for (let c = 0; c < 6; c++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    clusters.push({
      dir: new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)),
      col: new THREE.Color(palette[c]),
      spread: 0.22 + rand() * 0.3
    });
  }
  const N = 2600, R = 50000;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const size = new Float32Array(N), seed = new Float32Array(N), alp = new Float32Array(N);
  const v = new THREE.Vector3(), cc = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const cl = clusters[Math.floor(rand() * clusters.length)];
    v.copy(cl.dir);
    v.x += (rand() + rand() + rand() - 1.5) * cl.spread;
    v.y += (rand() + rand() + rand() - 1.5) * cl.spread;
    v.z += (rand() + rand() + rand() - 1.5) * cl.spread;
    v.normalize().multiplyScalar(R);
    pos[i*3] = v.x; pos[i*3+1] = v.y; pos[i*3+2] = v.z;
    cc.copy(cl.col).lerp(new THREE.Color(0xffffff), rand() * 0.25)
      .multiplyScalar(0.5 + rand() * 0.5);
    col[i*3] = cc.r; col[i*3+1] = cc.g; col[i*3+2] = cc.b;
    size[i] = 40 + rand() * 80;        // px — stays under GPU point-size caps
    seed[i] = rand() * 100;
    alp[i] = 0.3 + rand() * 0.7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
attribute float aAlpha;
varying vec3 vColor;
varying float vSeed;
varying float vAlpha;
void main(){
  vColor = aColor; vSeed = aSeed; vAlpha = aAlpha;
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: GLSL_NOISE + `
uniform float uTime;
varying vec3 vColor;
varying float vSeed;
varying float vAlpha;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float soft = smoothstep(0.5, 0.05, d);
  // drifting 3D noise makes each puff shimmer slowly (ethereal motion)
  float n = fbm(vec3(p * 3.5, vSeed + uTime * 0.03), 3) * 0.5 + 0.5;
  float a = soft * soft * n * vAlpha * 0.30;
  gl_FragColor = vec4(vColor * (0.55 + 0.9 * n), a);
}`,
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending
  });
  nebula = new THREE.Points(geo, mat);
  nebula.renderOrder = -1;           // paint behind stars & everything else
  nebula.frustumCulled = false;
  scene.add(nebula);
}

// ---- Space dust: line segments around the ship. Streams past the hull
//      to sell velocity; the tail vertex is stretched along −velocity so
//      the same particles become hyperspace star-streaks during warp.
const DUST_BOX = 320;
function buildDust() {
  const N = 900;
  const pos = new Float32Array(N * 2 * 3);
  const end = new Float32Array(N * 2);
  const rand = mulberry32(9099);
  for (let i = 0; i < N; i++) {
    const x = rand() * DUST_BOX, y = rand() * DUST_BOX, z = rand() * DUST_BOX;
    pos[i*6] = x;   pos[i*6+1] = y;   pos[i*6+2] = z;
    pos[i*6+3] = x; pos[i*6+4] = y;   pos[i*6+5] = z;
    end[i*2] = 0;   end[i*2+1] = 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aEnd;
uniform vec3 uCenter;
uniform vec3 uVel;
uniform float uStretch;
uniform float uBox;
varying float vEnd;
void main(){
  vEnd = aEnd;
  // infinite wrap: particles always fill a box around the camera
  vec3 rel = mod(position - uCenter, vec3(uBox)) - 0.5 * uBox;
  vec3 world = uCenter + rel - uVel * uStretch * aEnd;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  #include <logdepthbuf_vertex>
}`,
    fragmentShader: `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAlpha;
varying float vEnd;
void main(){
  gl_FragColor = vec4(0.72, 0.86, 1.0, (1.0 - vEnd * 0.85) * uAlpha);
  #include <logdepthbuf_fragment>
}`,
    uniforms: {
      uCenter: { value: new THREE.Vector3() },
      uVel:    { value: new THREE.Vector3() },
      uStretch:{ value: 0.05 },
      uBox:    { value: DUST_BOX },
      uAlpha:  { value: 0.3 }
    },
    transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  dust = new THREE.LineSegments(geo, mat);
  dust.frustumCulled = false;
  scene.add(dust);
}

// ---- Custom post passes -------------------------------------------
const POST_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Radial motion blur toward screen centre — hyperspace star-streaks
const WarpStreakShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
  vertexShader: POST_VERT,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uAmount;
varying vec2 vUv;
void main(){
  vec4 base = texture2D(tDiffuse, vUv);
  if (uAmount < 0.01) { gl_FragColor = base; return; }
  vec2 dir = vUv - 0.5;
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 10; i++) {
    float t = float(i) / 10.0;
    acc += texture2D(tDiffuse, vUv - dir * uAmount * 0.14 * t);
  }
  acc /= 10.0;
  gl_FragColor = mix(base, acc * 1.1, smoothstep(0.0, 0.35, uAmount));
}`
};

// ACES filmic tonemap + colour grade + vignette + cockpit hologram
const GradeShader = {
  uniforms: {
    tDiffuse:  { value: null },
    uTime:     { value: 0 },
    uWarp:     { value: 0 },
    uAtmo:     { value: 0 },
    uAtmoColor:{ value: new THREE.Color(0x88aaff) },
    uExposure: { value: 1.18 },
    uRes:      { value: new THREE.Vector2(1920, 1080) }
  },
  vertexShader: POST_VERT,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uWarp;
uniform float uAtmo;
uniform vec3 uAtmoColor;
uniform float uExposure;
uniform vec2 uRes;
varying vec2 vUv;
// ACES filmic curve (Narkowicz fit) — the ACESFilmicToneMapping look,
// applied here so custom shaders & post FX are graded identically.
vec3 ACESFilm(vec3 x){
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  // chromatic aberration, stronger during warp
  float ca = 0.0012 + uWarp * 0.005;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + c * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ca).b;
  // atmosphere immersion: screen melts smoothly into the sky colour
  col = mix(col, uAtmoColor * (0.35 + 0.75 * dot(col, vec3(0.333))), uAtmo * 0.5);
  // tonemap + NMS-style grade: teal shadows, warm highlights, punchy sat
  col = ACESFilm(col * uExposure);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.22);
  col += vec3(0.000, 0.026, 0.055) * (1.0 - l);
  col += vec3(0.060, 0.024, -0.015) * l * l;
  // vignette
  col *= 1.0 - r2 * 0.5;
  // ---- cockpit hologram overlay (edges only) ----
  float edge = smoothstep(0.14, 0.5, r2);
  vec2 g = uv * uRes / 36.0;
  vec2 gf = abs(fract(g) - 0.5);
  float grid = step(0.47, gf.x) + step(0.47, gf.y);
  float sw = fract(uTime * 0.06);
  float sweep = exp(-pow((uv.y - sw) * 55.0, 2.0));
  float scan = sin(uv.y * uRes.y * 1.35) * 0.5 + 0.5;
  vec3 holo = vec3(0.43, 0.90, 1.0);
  col += holo * grid * 0.030 * edge;
  col += holo * sweep * 0.045 * edge;
  col *= 1.0 - scan * 0.03;
  gl_FragColor = vec4(col, 1.0);
}`
};

function initPost() {
  const ok = THREE.EffectComposer && THREE.RenderPass &&
             THREE.ShaderPass && THREE.UnrealBloomPass;
  if (!ok) {                          // CDN blocked → graceful fallback
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    return;
  }
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85,   // strength — suns, engines, lava, ring ice all glow
    0.45,   // radius
    0.80);  // threshold
  composer.addPass(bloomPass);
  warpPass = new THREE.ShaderPass(WarpStreakShader);
  composer.addPass(warpPass);
  gradePass = new THREE.ShaderPass(GradeShader);
  gradePass.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
  composer.addPass(gradePass);
}


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
  return new THREE.CanvasTexture(c);
}

/* =====================================================================
   3. SHADERS — atmosphere, clouds, gas giants v2, sun, rings
   (all include Three.js log-depth chunks so custom materials share the
    same logarithmic depth buffer as built-in materials)
   ===================================================================== */
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
uniform vec3 uColor;
uniform vec3 uSunPos;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main(){
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 sunDir  = normalize(uSunPos - vWorldPos);
  float rim = pow(clamp(dot(viewDir, vNormal) + 1.05, 0.0, 1.05), uPower);
  float day = clamp(dot(-vNormal, sunDir) * 0.6 + 0.5, 0.05, 1.0);
  float mie = pow(max(dot(-viewDir, sunDir), 0.0), 24.0) * 0.9;
  // stylized volumetric rim: the limb burns toward white so the bloom
  // pass picks it up and the planet edge glows like a neon halo
  vec3 rimCol = mix(uColor, vec3(1.0), pow(rim, 3.0) * 0.4);
  vec3 col = rimCol * rim * day * uIntensity * 1.35
           + vec3(1.0, 0.9, 0.75) * mie * rim;
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
    side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  return new THREE.Mesh(geo, mat);
}

// --- Cloud layer: animated fbm coverage. Venus uses near-opaque cream
//     (surface completely shrouded); Earth uses drifting white patches.
const CLOUD_VERT = `
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
const CLOUD_FRAG = `
#include <common>
#include <logdepthbuf_pars_fragment>
` + GLSL_NOISE + `
uniform vec3 uColA;      // lit cloud colour
uniform vec3 uColB;      // shadowed cloud colour
uniform vec3 uSunPos;
uniform float uTime;
uniform float uCover;    // 0..1  coverage threshold (1 = fully shrouded)
uniform float uScale;
uniform float uSpeed;
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main(){
  vec3 p = normalize(vPos);
  float n = fbm(p * uScale + vec3(uTime * uSpeed, 0.0, uTime * uSpeed * 0.6), 5);
  float n2 = fbm(p * uScale * 3.1 + vec3(0.0, uTime * uSpeed * 1.7, 0.0), 4);
  float cover = smoothstep(0.55 - uCover, 0.75 - uCover * 0.5, n * 0.7 + n2 * 0.3 + 0.5);
  vec3 sunDir = normalize(uSunPos - vWorldPos);
  float light = clamp(dot(vNormalW, sunDir), 0.0, 1.0);
  vec3 col = mix(uColB, uColA, pow(light, 0.7) * (0.6 + 0.4 * n2));
  gl_FragColor = vec4(col * (0.15 + light), cover);
  #include <logdepthbuf_fragment>
}`;

function makeClouds(radius, opts) {
  const geo = new THREE.SphereGeometry(radius, 56, 40);
  const mat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    uniforms: {
      uColA:  { value: new THREE.Color(opts.colA) },
      uColB:  { value: new THREE.Color(opts.colB) },
      uSunPos:{ value: new THREE.Vector3() },
      uTime:  { value: 0 },
      uCover: { value: opts.cover },
      uScale: { value: opts.scale },
      uSpeed: { value: opts.speed }
    },
    transparent: true, depthWrite: false
  });
  return new THREE.Mesh(geo, mat);
}

// --- Gas giant v2: counter-flowing latitudinal bands (adjacent bands
//     drift in opposite directions like real zonal jets), tunable
//     smoothness (Uranus), storm colour (Great Red / Great Dark Spot).
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
uniform vec3 uColA;        // light band
uniform vec3 uColB;        // dark band
uniform vec3 uColC;        // streak accent (white wisps)
uniform vec3 uStormColor;
uniform vec3 uSunPos;
uniform float uTime;
uniform float uSeed;
uniform float uBands;
uniform float uTurb;       // band-edge turbulence (small => smooth Uranus)
uniform float uFlow;       // zonal jet speed
uniform float uStorm;      // 0 = none
uniform float uStormLat;
varying vec3 vPos;
varying vec3 vNormalW;
varying vec3 vWorldPos;
void main(){
  vec3 p = normalize(vPos);
  float lat = p.y;
  float lon = atan(p.z, p.x);
  // adjacent latitude bands flow in OPPOSITE directions
  float bandIdx = floor((lat * 0.5 + 0.5) * uBands);
  float dir = mod(bandIdx, 2.0) * 2.0 - 1.0;
  float lonF = lon + dir * uTime * uFlow;
  float cl = sqrt(max(0.0, 1.0 - lat * lat));
  vec3 q = vec3(cos(lonF) * cl, lat, sin(lonF) * cl);
  float turb = fbm(q * 3.0 + vec3(uSeed), 5) * uTurb
             + fbm(q * 9.0 + vec3(0.0, uSeed, uSeed), 4) * uTurb * 0.35;
  float bands = sin((lat + turb) * uBands * 3.14159);
  float m = smoothstep(-0.85, 0.85, bands);
  vec3 col = mix(uColB, uColA, m);
  float streak = fbm(vec3(q.x * 2.0, (lat + turb) * 22.0, q.z * 2.0 + uSeed), 4);
  col = mix(col, uColC, smoothstep(0.35, 0.85, streak) * 0.4);
  if (uStorm > 0.5) {
    vec2 sp = vec2(mod(lonF * 0.55 + 3.14159, 6.28318) - 3.14159, lat - uStormLat);
    float d = length(sp * vec2(3.2, 9.0));
    float spot = smoothstep(1.0, 0.25, d);
    float swirl = fbm(vec3(sp * 12.0, uTime * 0.1 + uSeed), 4) * 0.2;
    col = mix(col, uStormColor + swirl, spot * 0.92);
  }
  vec3 sunDir = normalize(uSunPos - vWorldPos);
  float light = clamp(dot(vNormalW, sunDir), 0.0, 1.0);
  light = pow(light, 0.8) * 1.15 + 0.03;
  gl_FragColor = vec4(col * light, 1.0);
  #include <logdepthbuf_fragment>
}`;

function makeGasMaterial(o) {
  return new THREE.ShaderMaterial({
    vertexShader: GAS_VERT, fragmentShader: GAS_FRAG,
    uniforms: {
      uColA:  { value: new THREE.Color(o.colA) },
      uColB:  { value: new THREE.Color(o.colB) },
      uColC:  { value: new THREE.Color(o.colC) },
      uStormColor: { value: new THREE.Color(o.stormColor || 0xc74a2a) },
      uSunPos:{ value: new THREE.Vector3() },
      uTime:  { value: 0 },
      uSeed:  { value: o.seed || 0 },
      uBands: { value: o.bands || 9 },
      uTurb:  { value: o.turb !== undefined ? o.turb : 0.35 },
      uFlow:  { value: o.flow !== undefined ? o.flow : 0.01 },
      uStorm: { value: o.storm ? 1 : 0 },
      uStormLat: { value: o.stormLat !== undefined ? o.stormLat : -0.32 }
    }
  });
}

const SUN_VERT = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
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
uniform float uBright;    // ice-particle sparkle boost (Saturn = high)
varying vec3 vLocal;
void main(){
  float r = length(vLocal.xy);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float bands = fbm(vec3(t * 26.0, uSeed, 0.0), 4) * 0.5 + 0.5;
  float gaps  = smoothstep(0.28, 0.36, fbm(vec3(t * 60.0, uSeed * 2.0, 1.0), 3) * 0.5 + 0.5);
  float fine  = fbm(vec3(t * 240.0, uSeed * 3.0, 2.0), 3) * 0.5 + 0.5; // billions of grains
  float edge  = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.92, t);
  float alpha = bands * gaps * edge * (0.7 + 0.3 * fine);
  vec3 col = mix(uColB, uColA, bands) * (0.8 + fine * uBright);
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
}`;

/* =====================================================================
   4. KEPLER ORBITAL MECHANICS  (unchanged math, log-scaled display a)
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

// el.a       — DISPLAY semi-major axis (log-scaled world units)
// el.aRealAU — REAL semi-major axis, drives the period (Kepler III)
function keplerPosition(el, simTime, out) {
  const period = YEAR_SECONDS * Math.pow(el.aRealAU, 1.5) * (el.periodScale || 1);
  const M = el.M0 + (2 * Math.PI * simTime) / period;
  const E = solveKepler(M % (2 * Math.PI), el.e);
  const xo = el.a * (Math.cos(E) - el.e);
  const yo = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const cw = Math.cos(el.w),  sw = Math.sin(el.w);
  const cO = Math.cos(el.O),  sO = Math.sin(el.O);
  const ci = Math.cos(el.i),  si = Math.sin(el.i);
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
   5. CELESTIAL BODY FACTORY v2
   ===================================================================== */
const bodies = [];
const systems = [];

// ---- Rocky planet: noise terrain + craters + optional specular ocean
//      sphere (Phong sun-glint) + optional lava glow at low elevations
function buildRockyMesh(cfg) {
  const r = cfg.visRadius;
  const detail = cfg.detail || (r > 20 ? 112 : 64);
  const geo = new THREE.SphereGeometry(r, detail, Math.round(detail * 0.66));
  const pos = geo.attributes.position;
  const simplex = new SimplexNoise(cfg.seed);
  const rand = mulberry32(cfg.seed ^ 0x9e3779b9);

  const craters = [];
  for (let c = 0; c < (cfg.craters || 0); c++) {
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    craters.push({
      dir: new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)),
      size: 0.03 + rand() * 0.14,
      depth: (0.004 + rand() * 0.012) * r
    });
  }

  const colors = new Float32Array(pos.count * 3);
  const glowAttr = new Float32Array(pos.count);   // 0 everywhere but lava
  const v = new THREE.Vector3();
  const cTmp = new THREE.Color();
  const amp = cfg.amp * r;
  const seaLevel = cfg.ocean ? cfg.ocean.level : null;

  for (let idx = 0; idx < pos.count; idx++) {
    v.fromBufferAttribute(pos, idx).normalize();
    let h = fbm(simplex, v.x * cfg.freq, v.y * cfg.freq, v.z * cfg.freq, 6, 2.1, 0.5);
    const ridge = 1 - Math.abs(fbm(simplex, v.x*cfg.freq*2.3+9, v.y*cfg.freq*2.3, v.z*cfg.freq*2.3, 4, 2.2, 0.5));
    h = h * 0.75 + (ridge * ridge - 0.55) * 0.5 * cfg.ridged;
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
    let hw = h * amp;
    const hNorm = h;
    // emissive lava mask — feeds the bloom pass on Venus basins
    if (cfg.lava && hNorm < -0.22)
      glowAttr[idx] = THREE.MathUtils.clamp((-0.22 - hNorm) * 4, 0, 1);
    // land below sea level is tucked just under the ocean sphere
    if (seaLevel !== null && hw < seaLevel * amp) hw = seaLevel * amp - 0.05;
    v.multiplyScalar(r + hw);
    pos.setXYZ(idx, v.x, v.y, v.z);

    const lat = Math.abs(v.y / v.length());
    const pal = cfg.palette;
    let stop = 0;
    const hn = THREE.MathUtils.clamp((hNorm + 0.6) / 1.2, 0, 1);
    while (stop < pal.length - 1 && hn > pal[stop + 1].h) stop++;
    const p0 = pal[Math.max(0, stop)], p1 = pal[Math.min(pal.length - 1, stop + 1)];
    const f = p1.h === p0.h ? 0 : THREE.MathUtils.clamp((hn - p0.h) / (p1.h - p0.h), 0, 1);
    cTmp.setHex(p0.c).lerp(new THREE.Color(p1.c), f);
    // volcanic lava glow in the lowest basins (Venus surface)
    if (cfg.lava && hNorm < -0.22) {
      const glow = THREE.MathUtils.clamp((-0.22 - hNorm) * 4, 0, 1);
      cTmp.lerp(new THREE.Color(0xff5a1a), glow);
    }
    if (cfg.iceCaps && lat > cfg.iceCaps)
      cTmp.lerp(new THREE.Color(0xf4f6f8), THREE.MathUtils.clamp((lat - cfg.iceCaps) * 8, 0, 1));
    colors[idx*3] = cTmp.r; colors[idx*3+1] = cTmp.g; colors[idx*3+2] = cTmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glowAttr, 1));
  geo.computeVertexNormals();
  // Standard PBR material, extended via onBeforeCompile with:
  //  • distance-adaptive micro-detail: as the ship closes in, high-
  //    frequency noise + crack lines fade in so the surface never
  //    turns into a blurry lo-poly ball at close range
  //  • per-vertex emissive lava (aGlow) that feeds the bloom pass
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.02
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlanetR = { value: r };
    shader.uniforms.uDetailFreq = { value: 26 / r };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nattribute float aGlow;\nvarying float vGlow;\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvGlow = aGlow;\nvObjPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying float vGlow;\nvarying vec3 vObjPos;\nuniform float uPlanetR;\nuniform float uDetailFreq;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>',
        `#include <color_fragment>
{
  float camD = length(vViewPosition);
  float fade = 1.0 - smoothstep(uPlanetR * 0.12, uPlanetR * 2.0, camD);
  if (fade > 0.003) {
    float micro  = fbm(vObjPos * uDetailFreq * 10.0, 4);
    float cracks = 1.0 - smoothstep(0.015, 0.05,
                     abs(snoise(vObjPos * uDetailFreq * 27.0)));
    diffuseColor.rgb *= 1.0 + micro * 0.28 * fade - cracks * 0.22 * fade;
  }
}`)
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.07) * vGlow * vGlow * 2.6;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  // Specular ocean: smooth Phong sphere at sea level — the sun glints
  // off it (Earth's "specular map" effect) while land stays matte.
  if (cfg.ocean) {
    const oc = new THREE.Mesh(
      new THREE.SphereGeometry(r + (cfg.ocean.level * amp), 64, 44),
      new THREE.MeshPhongMaterial({
        color: cfg.ocean.color, specular: 0xaaccee,
        shininess: cfg.ocean.shininess || 90
      }));
    mesh.add(oc);
  }
  return mesh;
}

function addBody(cfg) {
  const group = new THREE.Group();
  let mesh, gasMat = null, cloudMesh = null;

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
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(cfg.glowInner || 'rgba(255,240,190,0.9)',
                           cfg.glowOuter || 'rgba(255,120,30,0.35)'),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    }));
    corona.scale.setScalar(cfg.visRadius * 4.5);
    group.add(corona);
    group.add(new THREE.PointLight(cfg.lightColor || 0xfff4e0, 1.6, 0, 0));
  } else if (cfg.type === 'gas') {
    gasMat = makeGasMaterial(cfg.gas);
    mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.visRadius, 80, 56), gasMat);
    group.add(mesh);
    if (cfg.rings) {
      const inner = cfg.visRadius * cfg.rings.inner;
      const outer = cfg.visRadius * cfg.rings.outer;
      const rm = new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: {
          uInner: { value: inner }, uOuter: { value: outer },
          uColA: { value: new THREE.Color(cfg.rings.colA) },
          uColB: { value: new THREE.Color(cfg.rings.colB) },
          uSeed: { value: (cfg.seed || 1) % 100 },
          uBright: { value: cfg.rings.bright !== undefined ? cfg.rings.bright : 0.4 }
        },
        side: THREE.DoubleSide, transparent: true, depthWrite: false
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 180, 1), rm);
      ring.rotation.x = Math.PI / 2 + (cfg.rings.tilt || 0);
      group.add(ring);
    }
  } else {
    mesh = buildRockyMesh(cfg);
    group.add(mesh);
  }

  if (cfg.clouds) {
    cloudMesh = makeClouds(cfg.visRadius * cfg.clouds.height, cfg.clouds);
    group.add(cloudMesh);
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
    name: cfg.name, type: cfg.type, group, mesh, gasMat, cloudMesh,
    visRadius: cfg.visRadius,
    orbit: cfg.orbit || null,
    parent: cfg.parent || null,
    spin: cfg.spin !== undefined ? cfg.spin : 0.02,
    axialTilt: cfg.axialTilt || 0,
    mu: (cfg.surfaceG || 0) * cfg.visRadius * cfg.visRadius * G_GAME,
    surfaceG: cfg.surfaceG || 0,
    atmo: cfg.atmoPhys || null,
    atmoColor: cfg.atmosphere ? cfg.atmosphere.color
             : (cfg.clouds ? cfg.clouds.colA : 0x88aaff),
    scan: cfg.scan || null,
    systemIndex: cfg.systemIndex,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    _prevPos: new THREE.Vector3(),
    _atmoMat: cfg._atmoMat || null
  };
  mesh.rotation.z = body.axialTilt;
  bodies.push(body);
  return body;
}

/* =====================================================================
   6. THE SOLAR SYSTEM — realistic surfaces, log-scaled geometry
   ===================================================================== */
const D2R = Math.PI / 180;
// distKm: real mean orbital distance (drives log-scaled display radius)
// aAU:    real semi-major axis in AU (drives the true Kepler period)
function els(distKm, aAU, e, iDeg, M0deg, extra) {
  return Object.assign({
    a: extra && extra.moon ? logOrbitMoon(distKm) : logOrbitPlanet(distKm),
    aRealAU: aAU, e, i: iDeg * D2R,
    O: 0, w: (M0deg * 1.7 % 360) * D2R, M0: M0deg * D2R
  }, extra || {});
}

function buildSolarSystem() {
  const sysIdx = systems.length;
  const origin = new THREE.Vector3(0, 0, 0);

  const sun = addBody({
    name: 'Sun', type: 'star', systemIndex: sysIdx,
    visRadius: logRadius(696000),        // ≈ 164 units
    surfaceG: 40, spin: 0.002,
    scan: { cls: 'G2V main-sequence star', mass: '1.989×10³⁰ kg', radius: '696,000 km',
            grav: '274 m/s²', temp: '5,505 °C (photosphere)', press: '—',
            atmo: [['H', 73], ['He', 25], ['O/C/…', 2]] }
  });

  const P = (cfg) => { cfg.parent = sun; cfg.systemIndex = sysIdx; return addBody(cfg); };

  // ---- MERCURY: ash-gray, saturated with craters, airless ----
  P({ name: 'Mercury', type: 'rocky', visRadius: logRadius(2440),
    seed: 11, freq: 3.4, amp: 0.05, ridged: 0.35, craters: 130,
    palette: [{h:0,c:0x3f3d3b},{h:0.4,c:0x5c5955},{h:0.7,c:0x7a766f},{h:1,c:0x9d9890}],
    iceCaps: 0, surfaceG: 3.7, spin: 0.004,
    orbit: els(5.79e7, 0.387, 0.2056, 7.0, 40),
    scan: { cls: 'Rocky (airless)', mass: '3.30×10²³ kg', radius: '2,440 km',
            grav: '3.70 m/s²', temp: '−173 … +427 °C', press: '≈ 0 (trace exosphere)',
            atmo: [['O₂', 42], ['Na', 29], ['H₂', 22], ['He', 6]] } });

  // ---- VENUS: volcanic red surface UNDER a total cream cloud shroud ----
  P({ name: 'Venus', type: 'rocky', visRadius: logRadius(6052),
    seed: 22, freq: 2.6, amp: 0.035, ridged: 0.8, craters: 6, lava: true,
    palette: [{h:0,c:0x5a1e10},{h:0.35,c:0x83402a},{h:0.65,c:0xa25a35},{h:1,c:0xc07a48}],
    iceCaps: 0, surfaceG: 8.87, spin: -0.001,
    orbit: els(1.082e8, 0.723, 0.0068, 3.39, 120),
    clouds: { height: 1.05, colA: 0xf2dc9e, colB: 0xc79a4c,
              cover: 1.0, scale: 2.2, speed: 0.02 },       // fully shrouded
    atmosphere: { color: 0xe8c56a, scale: 1.22, power: 2.6, intensity: 2.4 },
    atmoPhys: { height: 1.3, density: 3.0 },
    scan: { cls: 'Rocky (runaway greenhouse)', mass: '4.87×10²⁴ kg', radius: '6,052 km',
            grav: '8.87 m/s²', temp: '462 °C', press: '92 bar',
            atmo: [['CO₂', 96.5], ['N₂', 3.5]] } });

  // ---- EARTH: green/tan continents, specular ocean, drifting clouds ----
  const earth = P({ name: 'Earth', type: 'rocky', visRadius: logRadius(6371),
    seed: 33, freq: 2.2, amp: 0.05, ridged: 0.8, craters: 0,
    ocean: { level: 0.02, color: 0x123f75, shininess: 120 },  // sun-glint sea
    palette: [{h:0,c:0x2f6b31},{h:0.55,c:0x6f8a3a},{h:0.7,c:0x9c7a4a},{h:0.86,c:0x8f8d85},{h:1,c:0xffffff}],
    iceCaps: 0.88, surfaceG: 9.81, spin: 0.03, axialTilt: 23.4 * D2R,
    orbit: els(1.496e8, 1.0, 0.0167, 0.0, 200),
    clouds: { height: 1.03, colA: 0xffffff, colB: 0x9fb2c8,
              cover: 0.42, scale: 3.0, speed: 0.012 },       // slow white layer
    atmosphere: { color: 0x4d9eff, scale: 1.18, power: 3.4, intensity: 1.6 },
    atmoPhys: { height: 1.25, density: 1.0 },
    scan: { cls: 'Rocky (habitable)', mass: '5.97×10²⁴ kg', radius: '6,371 km',
            grav: '9.81 m/s²', temp: '15 °C mean', press: '1.013 bar',
            atmo: [['N₂', 78], ['O₂', 21], ['Ar', 0.9], ['CO₂', 0.04]] } });

  addBody({ name: 'Moon', type: 'rocky', parent: earth, systemIndex: sysIdx,
    visRadius: logRadius(1737), seed: 44, freq: 3.4, amp: 0.05, ridged: 0.3,
    craters: 90,
    palette: [{h:0,c:0x55534f},{h:0.5,c:0x7d7a74},{h:1,c:0xb0aca4}],
    iceCaps: 0, surfaceG: 1.62, spin: 0.005,
    orbit: els(3.844e5, 0.00257, 0.0549, 5.1, 30, { moon: true, periodScale: 1000 }),
    scan: { cls: 'Rocky moon (airless)', mass: '7.35×10²² kg', radius: '1,737 km',
            grav: '1.62 m/s²', temp: '−173 … +127 °C', press: '≈ 0',
            atmo: [['He/Ne/Ar', 100]] } });

  // ---- MARS: iron-oxide red, deep canyons, white CO₂ polar caps ----
  P({ name: 'Mars', type: 'rocky', visRadius: logRadius(3390),
    seed: 55, freq: 2.8, amp: 0.08, ridged: 1.1, craters: 45,
    palette: [{h:0,c:0x6e2b18},{h:0.45,c:0xa24522},{h:0.7,c:0xc46a35},{h:1,c:0xdb9258}],
    iceCaps: 0.88, surfaceG: 3.71, spin: 0.028, axialTilt: 25 * D2R,
    orbit: els(2.279e8, 1.524, 0.0934, 1.85, 300),
    atmosphere: { color: 0xe8a07a, scale: 1.1, power: 3.8, intensity: 0.65 }, // thin pink-orange
    atmoPhys: { height: 1.12, density: 0.15 },
    scan: { cls: 'Rocky (cold desert)', mass: '6.42×10²³ kg', radius: '3,390 km',
            grav: '3.71 m/s²', temp: '−63 °C mean', press: '0.006 bar',
            atmo: [['CO₂', 95], ['N₂', 2.8], ['Ar', 2]] } });

  // ---- JUPITER: brown/beige/white counter-flowing bands + GRS south ----
  const jupiter = P({ name: 'Jupiter', type: 'gas', visRadius: logRadius(69911),
    seed: 66, surfaceG: 24.8, spin: 0.06, axialTilt: 3 * D2R,
    gas: { colA: 0xe8dcc4, colB: 0x9c6b45, colC: 0xf7f1e2,
           bands: 12, turb: 0.32, flow: 0.02,
           storm: true, stormColor: 0xc74a2a, stormLat: -0.32, seed: 6.6 },
    orbit: els(7.785e8, 5.203, 0.0484, 1.3, 15),
    atmosphere: { color: 0xd9b98a, scale: 1.08, power: 3.5, intensity: 0.9 },
    atmoPhys: { height: 1.1, density: 2.0 },
    scan: { cls: 'Gas giant', mass: '1.90×10²⁷ kg', radius: '69,911 km',
            grav: '24.8 m/s²', temp: '−108 °C (cloud tops)', press: '≫1000 bar (no surface)',
            atmo: [['H₂', 90], ['He', 10]] } });

  [['Io', 4.217e5, 1821, 0x8a7a2c, 0xe8dd8a],
   ['Europa', 6.709e5, 1561, 0x8a8f96, 0xd7dde2],
   ['Ganymede', 1.0704e6, 2634, 0x6d7580, 0xc4ccd4],
   ['Callisto', 1.8827e6, 2410, 0x5b5650, 0xa8a098]]
  .forEach(([nm, dKm, rKm, lo, hi], k) => {
    addBody({ name: nm, type: 'rocky', parent: jupiter, systemIndex: sysIdx,
      visRadius: logRadius(rKm), seed: 100 + k * 7,
      freq: 3.5, amp: 0.04, ridged: 0.4, craters: 35,
      palette: [{h:0,c:lo},
        {h:0.6,c:((((lo>>16)+(hi>>16))>>1)<<16)|(((((lo>>8)&255)+((hi>>8)&255))>>1)<<8)|(((lo&255)+(hi&255))>>1)},
        {h:1,c:hi}],
      iceCaps: 0, surfaceG: 1.5, spin: 0.004,
      orbit: els(dKm, 0.003 + k * 0.002, 0.005, 1 + k, 60 + k * 90, { moon: true, periodScale: 220 }),
      scan: { cls: 'Icy/volcanic moon', mass: '≈10²³ kg', radius: rKm.toLocaleString() + ' km',
              grav: '≈1.5 m/s²', temp: '−160 °C', press: '≈ 0',
              atmo: [['trace', 100]] } });
  });

  // ---- SATURN: pale straw, wide thin ice rings that sparkle ----
  const saturn = P({ name: 'Saturn', type: 'gas', visRadius: logRadius(58232),
    seed: 77, surfaceG: 10.4, spin: 0.055, axialTilt: 26.7 * D2R,
    gas: { colA: 0xf0e3bb, colB: 0xcbb182, colC: 0xf8f2df,
           bands: 9, turb: 0.22, flow: 0.014, storm: false, seed: 7.7 },
    rings: { inner: 1.35, outer: 2.5, colA: 0xefe2c2, colB: 0x9a875f,
             bright: 0.9, tilt: 0.05 },
    orbit: els(1.4335e9, 9.537, 0.0542, 2.49, 220),
    atmoPhys: { height: 1.1, density: 1.6 },
    scan: { cls: 'Gas giant (ringed)', mass: '5.68×10²⁶ kg', radius: '58,232 km',
            grav: '10.4 m/s²', temp: '−139 °C', press: '≫1000 bar',
            atmo: [['H₂', 96], ['He', 3]] } });

  addBody({ name: 'Titan', type: 'rocky', parent: saturn, systemIndex: sysIdx,
    visRadius: logRadius(2575), seed: 130, freq: 2.4, amp: 0.03, ridged: 0.5,
    craters: 6, ocean: { level: 0.0, color: 0x2e2a1a, shininess: 60 },
    palette: [{h:0,c:0x7a5a28},{h:0.6,c:0xa8823c},{h:1,c:0xd0ad5e}],
    iceCaps: 0, surfaceG: 1.35, spin: 0.003,
    orbit: els(1.2219e6, 0.008, 0.028, 0.3, 10, { moon: true, periodScale: 190 }),
    clouds: { height: 1.06, colA: 0xd8a24e, colB: 0x8f6a2e,
              cover: 0.9, scale: 2.5, speed: 0.015 },
    atmosphere: { color: 0xd8a24e, scale: 1.2, power: 3.0, intensity: 1.4 },
    atmoPhys: { height: 1.25, density: 1.4 },
    scan: { cls: 'Moon (dense atmosphere)', mass: '1.35×10²³ kg', radius: '2,575 km',
            grav: '1.35 m/s²', temp: '−179 °C', press: '1.45 bar',
            atmo: [['N₂', 95], ['CH₄', 5]] } });

  // ---- URANUS: featureless smooth cyan, axis tipped on its side ----
  P({ name: 'Uranus', type: 'gas', visRadius: logRadius(25362),
    seed: 88, surfaceG: 8.7, spin: -0.03, axialTilt: 97.8 * D2R,
    gas: { colA: 0xbdeee8, colB: 0x83cdd1, colC: 0xd9f6f2,
           bands: 3, turb: 0.06, flow: 0.004, storm: false, seed: 8.8 }, // methane-smooth
    orbit: els(2.877e9, 19.19, 0.0472, 0.77, 100),
    atmoPhys: { height: 1.1, density: 1.2 },
    scan: { cls: 'Ice giant', mass: '8.68×10²⁵ kg', radius: '25,362 km',
            grav: '8.69 m/s²', temp: '−197 °C', press: '≫1000 bar',
            atmo: [['H₂', 83], ['He', 15], ['CH₄', 2]] } });

  // ---- NEPTUNE: deep blue, white streaks, Great Dark Spot ----
  P({ name: 'Neptune', type: 'gas', visRadius: logRadius(24622),
    seed: 99, surfaceG: 11.15, spin: 0.035, axialTilt: 28 * D2R,
    gas: { colA: 0x3f6ad4, colB: 0x1e3a96, colC: 0xf0f5ff,   // white wisps
           bands: 6, turb: 0.28, flow: 0.03,
           storm: true, stormColor: 0x101f52, stormLat: -0.25, seed: 9.9 }, // dark spot
    orbit: els(4.503e9, 30.07, 0.0086, 1.77, 260),
    atmoPhys: { height: 1.1, density: 1.3 },
    scan: { cls: 'Ice giant', mass: '1.02×10²⁶ kg', radius: '24,622 km',
            grav: '11.15 m/s²', temp: '−201 °C', press: '≫1000 bar',
            atmo: [['H₂', 80], ['He', 19], ['CH₄', 1]] } });

  // ---- Asteroid belt: instanced, between Mars (~6.3k) & Jupiter (~9.5k)
  const beltGeo = new THREE.IcosahedronGeometry(1, 0);
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x8d8378, roughness: 1 });
  const belt = new THREE.InstancedMesh(beltGeo, beltMat, 1600);
  const dummy = new THREE.Object3D();
  const brand = mulberry32(4242);
  for (let i = 0; i < 1600; i++) {
    const a = 6900 + brand() * 2100;
    const th = brand() * Math.PI * 2;
    dummy.position.set(Math.cos(th) * a, (brand() - 0.5) * 90, Math.sin(th) * a);
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
   7. PROCEDURAL STAR SYSTEMS (log-scaled)
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

  const star = addBody({
    name: starName, type: 'star', systemIndex: sysIdx,
    visRadius: logRadius(300000 + rand() * 700000),
    surfaceG: 30 + rand() * 30, spin: 0.002,
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
    const distKm = aAU * KM_PER_AU;
    const isGas = aAU > 2.2 && rand() < 0.65;
    const nm = genName(rand);
    if (isGas) {
      const c1 = new THREE.Color().setHSL(rand(), 0.4 + rand()*0.3, 0.6);
      const c2 = c1.clone().offsetHSL(0.04, 0, -0.25);
      const c3 = c1.clone().offsetHSL(-0.03, 0, 0.2);
      addBody({ name: nm, type: 'gas', parent: star, systemIndex: sysIdx,
        visRadius: logRadius(30000 + rand() * 45000),
        surfaceG: 8 + rand() * 18, spin: 0.03 + rand()*0.04,
        gas: { colA: c1.getHex(), colB: c2.getHex(), colC: c3.getHex(),
               bands: 4 + Math.floor(rand()*9), turb: 0.1 + rand()*0.3,
               flow: 0.005 + rand()*0.03, storm: rand() < 0.4,
               stormColor: 0xc74a2a, stormLat: -0.4 + rand()*0.8, seed: rand()*20 },
        rings: rand() < 0.45 ? { inner: 1.3, outer: 2.0 + rand(),
               colA: c3.getHex(), colB: c2.getHex(), bright: rand(), tilt: rand()*0.3 } : null,
        orbit: els(distKm, aAU, rand()*0.1, rand()*6, rand()*360),
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
      const hasOcean = hasAtmo && rand() < 0.5;
      const g = 2 + rand() * 12;
      const rock = addBody({ name: nm, type: 'rocky', parent: star, systemIndex: sysIdx,
        visRadius: logRadius(2000 + rand() * 7000),
        seed: seed * 13 + p * 101, freq: 2 + rand() * 2.5,
        amp: 0.03 + rand() * 0.06, ridged: rand(), craters: Math.floor(rand() * 70),
        ocean: hasOcean ? { level: 0.01,
          color: new THREE.Color().setHSL((hue+0.5)%1, 0.5, 0.3).getHex(),
          shininess: 100 } : null,
        palette: [{h:0,c:base.getHex()},{h:0.55,c:mid.getHex()},{h:1,c:high.getHex()}],
        iceCaps: rand() < 0.4 ? 0.85 : 0,
        surfaceG: g, spin: 0.01 + rand()*0.03,
        orbit: els(distKm, aAU, rand()*0.15, rand()*8, rand()*360),
        clouds: hasAtmo && rand() < 0.6 ? { height: 1.04,
          colA: 0xffffff, colB: 0xa9b6c6, cover: 0.3 + rand()*0.3,
          scale: 2.5 + rand()*2, speed: 0.01 + rand()*0.02 } : null,
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
   8. SPACESHIP v2 — mesh (small vs the giant planets), speed modes
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
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 1.4), darkMat);
  wing.position.set(0, -0.1, 1.0); g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 1.0), darkMat);
  fin.position.set(0, 0.6, 1.4); g.add(fin);
  [-1, 1].forEach(s => {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.3, 10), darkMat);
    eng.rotation.x = Math.PI / 2;
    eng.position.set(s * 1.5, -0.1, 1.6);
    g.add(eng);
  });
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
  const burn = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff6a1c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(burn);
  g.scale.setScalar(0.5);   // keep the ship tiny — planets should feel colossal
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
  warpDrive: false,
  landedOn: null,
  landLocal: new THREE.Vector3(),
  lastHitT: -99,
  dead: false
};

/* -------- Speed modes ------------------------------------------------
   NORMAL : gentle thrust, low cap — precision flying & landings
   TURBO  : hold SHIFT — cruise between moons of one system
   WARP   : press F or J — hyper-cruise between planets, FOV stretch
   Releasing thrust engages linear damping: velocity eases back toward
   the local reference frame (nearest body if close, else rest).      */
const MODES = {
  NORMAL: { accel: 30,   max: 60,    damp: 1.9, fuelRate: 1.0 },
  TURBO:  { accel: 380,  max: 1500,  damp: 1.1, fuelRate: 3.0 },
  WARP:   { accel: 6000, max: 24000, damp: 0.0, fuelRate: 5.0 }
};
const ROT_SPEED = 1.6;
const SAFE_LANDING_V = 25;
const BRAKE_DAMP = 4.5;              // SPACE — hard brake
const WARP_DROP_RADII = 8;           // auto-exit warp this close to a body

const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyT') scanNearest();
  if (e.code === 'KeyN') jumpNextSystem();
  if (e.code === 'KeyH') document.getElementById('controls').classList.toggle('hidden');
  if (e.code === 'KeyF' || e.code === 'KeyJ') toggleWarpDrive();
  if (/^Digit[1-5]$/.test(e.code)) {
    warpIndex = parseInt(e.code.slice(5), 10) - 1;
    ui.warp.textContent = '×' + WARP_STEPS[warpIndex];
  }
  if (['ArrowUp','ArrowDown','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// If the window loses focus mid-keypress the 'keyup' never arrives and
// the ship thrusts/spins forever. Clear ALL key state on focus loss.
function clearKeys() {
  for (const k in keys) keys[k] = false;
  ship.throttle = 0;
}
window.addEventListener('blur', clearKeys);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearKeys();
});

function toggleWarpDrive() {
  if (ship.dead || ship.landedOn) return;
  if (!ship.warpDrive && ship.fuel < 5) { flashFlag('flag-warn', 1.2); return; }
  ship.warpDrive = !ship.warpDrive;
}

function currentMode() {
  if (ship.warpDrive) return MODES.WARP;
  if (keys['ShiftLeft'] || keys['ShiftRight']) return MODES.TURBO;
  return MODES.NORMAL;
}
function currentModeName() {
  if (ship.warpDrive) return 'WARP DRIVE';
  if (keys['ShiftLeft'] || keys['ShiftRight']) return 'TURBO';
  return 'NORMAL';
}

let currentSystem = 0;
function respawn() {
  const sys = systems[currentSystem];
  ship.pos.copy(sys.spawn());
  ship.quat.identity();
  ship.fuel = 100; ship.hull = 100; ship.shield = 100;
  ship.landedOn = null; ship.dead = false; ship.warpDrive = false;
  // CRITICAL: planets orbit at ~100+ u/s. Spawning with vel = 0 makes
  // the planet visibly run away from the ship — the classic "auto
  // drift on load" bug. Spawn co-moving with the nearest body instead.
  syncToLocalFrame();
  camPos.copy(ship.pos).add(_tmpV.set(0, 1.9, 7).applyQuaternion(ship.quat));
  document.getElementById('gameover').classList.add('hidden');
}

// Match the ship's velocity to the nearest body's orbital velocity.
function syncToLocalFrame() {
  const gb = gravBody();
  if (gb && ship.pos.distanceTo(gb.position) < gb.visRadius * 60
         && gb.velocity.length() < 5000) {
    ship.vel.copy(gb.velocity);
  } else {
    ship.vel.set(0, 0, 0);
  }
}
document.getElementById('respawn').addEventListener('click', (e) => {
  e.currentTarget.blur();     // else SPACE (brake) would click it again
  currentSystem = 0;
  ui.system.textContent = systems[0].name;
  clearKeys();
  respawn();
});

function jumpNextSystem() {
  if (ship.dead) return;
  if (ship.fuel < 20) return flashFlag('flag-warn', 1.2);
  ship.fuel -= 20;
  currentSystem = (currentSystem + 1) % systems.length;
  const sys = systems[currentSystem];
  ship.pos.copy(sys.spawn());
  ship.landedOn = null; ship.warpDrive = false;
  syncToLocalFrame();                       // co-move with the new planet
  camPos.copy(ship.pos).add(_tmpV.set(0, 1.9, 7).applyQuaternion(ship.quat));
  ui.system.textContent = sys.name;
}

/* =====================================================================
   9. HUD BINDINGS (+ dynamically injected MODE row & new key help)
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

// MODE row injected above VEL
(function injectModeRow() {
  const nav = document.getElementById('navpanel');
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<label>MODE</label><span id="mode-val" class="mono">NORMAL</span>';
  nav.insertBefore(row, nav.firstChild);
  ui.mode = document.getElementById('mode-val');
})();

// key help updated to the v2 control scheme
document.getElementById('controls').innerHTML =
  '<span><b>W/S</b> thrust</span><span><b>A/D</b> yaw</span>' +
  '<span><b>↑/↓</b> pitch</span><span><b>Q/E</b> roll</span>' +
  '<span><b>SHIFT</b> turbo</span><span><b>F/J</b> warp drive</span>' +
  '<span><b>SPACE</b> brake</span><span><b>T</b> scan</span>' +
  '<span><b>1–5</b> time warp</span><span><b>N</b> next system</span>' +
  '<span><b>H</b> hide help</span>';

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

// The body whose gravity DOMINATES at the ship (max μ/r²). Using raw
// nearest-distance made a passing moon hijack the reference frame and
// drag the ship along at its orbital speed — a major drift source.
function gravBody() {
  let best = null, bi = 0;
  for (const b of bodies) {
    if (b.systemIndex !== currentSystem || b.mu === 0) continue;
    const r = Math.max(1, b.position.distanceTo(ship.pos));
    if (r > b.visRadius * 120) continue;
    const infl = b.mu / (r * r);
    if (infl > bi) { bi = infl; best = b; }
  }
  return best;
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
  if (d > 1000) return (d / 1000).toFixed(1) + ' ku';
  return Math.round(d) + ' u';
}

/* =====================================================================
   10. PHYSICS v2 — delta-time Euler integration, linear damping,
       speed caps per mode, n-body gravity, drag, warp auto-drop
   ===================================================================== */
const _tmpV = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _refVel = new THREE.Vector3();
const _gAcc = new THREE.Vector3();     // gravity accel this step (for flight assist)
const _relV = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1);
const _up = new THREE.Vector3(0, 1, 0);

function physicsStep(dt) {
  if (ship.dead || !(dt > 0)) return;      // guard: never integrate NaN/0

  // ---- attitude (keyup handled globally; blur clears stuck keys) ----
  const rq = new THREE.Quaternion();
  if (keys['KeyA'])      { rq.setFromAxisAngle(new THREE.Vector3(0,1,0),  ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['KeyD'])      { rq.setFromAxisAngle(new THREE.Vector3(0,1,0), -ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['ArrowUp'])   { rq.setFromAxisAngle(new THREE.Vector3(1,0,0), -ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['ArrowDown']) { rq.setFromAxisAngle(new THREE.Vector3(1,0,0),  ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['KeyQ'])      { rq.setFromAxisAngle(new THREE.Vector3(0,0,1),  ROT_SPEED*dt); ship.quat.multiply(rq); }
  if (keys['KeyE'])      { rq.setFromAxisAngle(new THREE.Vector3(0,0,1), -ROT_SPEED*dt); ship.quat.multiply(rq); }
  ship.quat.normalize();
  _fwd.set(0, 0, -1).applyQuaternion(ship.quat);

  // ---- landed: ride the planet, refuel, W = take off ----
  if (ship.landedOn) {
    const b = ship.landedOn;
    _tmpV.copy(ship.landLocal).applyQuaternion(b.mesh.getWorldQuaternion(new THREE.Quaternion()));
    ship.pos.copy(b.position).addScaledVector(_tmpV.normalize(), b.visRadius + 0.9);
    ship.vel.copy(b.velocity);
    ship.fuel = Math.min(100, ship.fuel + 6 * dt);
    ship.hull = Math.min(100, ship.hull + 2 * dt);
    ui.fLand.classList.remove('hidden');
    fx.relSpeed = 0; fx.relVel.set(0, 0, 0); fx.burn = 0; fx.turbo = 0; fx.atmoAmt = 0;
    if (keys['KeyW'] && ship.fuel > 0.5) {
      ship.landedOn = null;
      _tmpV2.copy(ship.pos).sub(b.position).normalize();
      ship.vel.addScaledVector(_tmpV2, 25);
      ui.fLand.classList.add('hidden');
    }
    return;
  }
  ui.fLand.classList.add('hidden');

  /* ---- OBSERVATION MODE ---------------------------------------------
     At time-warp ×10…×1000 the finite-difference body velocities scale
     with the warp (a planet "moves" 1000× faster per real second). If
     the ship kept coupling to that frame it would be yanked away at
     absurd speeds — the "uncontrollable auto-run" bug. So while the
     time warp is engaged the ship simply coasts: gravity, drag,
     collisions and frame-damping are suspended until warp returns ×1. */
  const observing = WARP_STEPS[warpIndex] > 1;

  // ---- local reference frame: the gravitationally dominant body ----
  const nb = nearestBody();                 // for warp auto-drop / HUD
  const gb = gravBody();                    // for the velocity frame
  if (!observing && gb && ship.pos.distanceTo(gb.position) < gb.visRadius * 60) {
    _refVel.copy(gb.velocity);
  } else {
    _refVel.set(0, 0, 0);
  }

  // ---- thrust / warp drive ----
  const mode = currentMode();
  ship.throttle = 0;
  let thrusting = false;

  if (ship.warpDrive) {
    // intuitive kill switches: brake or reverse also drops the drive
    if (ship.fuel <= 0 || keys['Space'] || keys['KeyS']) ship.warpDrive = false;
    else {
      ship.vel.addScaledVector(_fwd, mode.accel * dt);
      ship.fuel = Math.max(0, ship.fuel - mode.fuelRate * dt);
      ship.throttle = 1;
      thrusting = true;
      if (nb && ship.pos.distanceTo(nb.position) < nb.visRadius * WARP_DROP_RADII) {
        ship.warpDrive = false;
      }
    }
  } else if (ship.fuel > 0) {
    if (keys['KeyW']) {
      ship.vel.addScaledVector(_fwd, mode.accel * dt);
      ship.fuel = Math.max(0, ship.fuel - mode.fuelRate * dt);
      ship.throttle = mode === MODES.TURBO ? 1 : 0.55;
      thrusting = true;
    }
    if (keys['KeyS']) {
      ship.vel.addScaledVector(_fwd, -mode.accel * 0.6 * dt);
      ship.fuel = Math.max(0, ship.fuel - mode.fuelRate * 0.7 * dt);
      ship.throttle = Math.max(ship.throttle, 0.3);
      thrusting = true;
    }
  }

  /* ---- n-body gravity FIRST, damping AFTER -------------------------
     v2 damped before gravity, so gravity re-injected velocity every
     frame and an idle ship sank into the nearest planet forever —
     "drifts by itself with no input". Correct order: apply gravity,
     then let damping / flight-assist neutralise it while idle.       */
  let gPull = 0;
  let atmoBody = null, atmoDensity = 0;
  _gAcc.set(0, 0, 0);
  if (!observing) {
    for (const b of bodies) {
      if (b.systemIndex !== currentSystem || b.mu === 0) continue;
      _tmpV.copy(b.position).sub(ship.pos);
      const r = _tmpV.length();
      if (r > b.visRadius * 120) continue;
      const a = b.mu / (r * r);
      _tmpV.normalize();
      ship.vel.addScaledVector(_tmpV, a * dt);
      _gAcc.addScaledVector(_tmpV, a);
      gPull += a;

      if (b.atmo && r < b.visRadius * b.atmo.height) {
        const alt01 = (r - b.visRadius) / (b.visRadius * (b.atmo.height - 1));
        atmoDensity = b.atmo.density * Math.exp(-Math.max(0, alt01) * 4);
        atmoBody = b;
      }

      if (r < b.visRadius + 0.9) {
        const relV = _tmpV2.copy(ship.vel).sub(b.velocity);
        const speed = relV.length();
        if (b.type === 'star') { damage(200 * dt + 50); }
        else if (speed <= SAFE_LANDING_V) {
          ship.landedOn = b;
          ship.warpDrive = false;
          ship.landLocal.copy(ship.pos).sub(b.position)
            .applyQuaternion(b.mesh.getWorldQuaternion(new THREE.Quaternion()).invert());
        } else {
          damage((speed - SAFE_LANDING_V) * 1.6);
          const n = _tmpV.copy(ship.pos).sub(b.position).normalize();
          const vn = relV.dot(n);
          relV.addScaledVector(n, -1.7 * vn);
          ship.vel.copy(b.velocity).addScaledVector(relV, 0.55);
          ship.pos.copy(b.position).addScaledVector(n, b.visRadius + 1.4);
        }
      }
    }
  }
  ui.grav.textContent = gPull.toFixed(2);
  if (gPull > 25) flashFlag('flag-warn', 0.3);

  // relative velocity in the local frame
  _relV.copy(ship.vel).sub(_refVel);
  let relSpeed = _relV.length();

  // ---- hard brake (SPACE): exponential decay toward local rest ----
  if (keys['Space'] && ship.fuel > 0) {
    const k = 1 - Math.exp(-BRAKE_DAMP * dt);
    ship.vel.addScaledVector(_relV, -k);
    ship.fuel = Math.max(0, ship.fuel - 0.6 * dt);
    ship.throttle = Math.max(ship.throttle, 0.4);
  }
  // ---- LINEAR DAMPING + FLIGHT ASSIST while idle -------------------
  else if (!thrusting && mode.damp > 0) {
    if (relSpeed > 0.01) {
      const k = 1 - Math.exp(-mode.damp * dt);
      ship.vel.addScaledVector(_relV, -k);
    }
    // flight assist: at low relative speed the RCS silently counters
    // gravity, so a parked ship HOVERS instead of endlessly falling.
    // Fades out above 30 u/s so gravity slingshots still work.
    const assist = THREE.MathUtils.clamp(1 - relSpeed / 30, 0, 1);
    if (assist > 0) ship.vel.addScaledVector(_gAcc, -assist * dt);
  }

  // per-mode speed cap (soft clamp so gravity assists still add punch)
  _relV.copy(ship.vel).sub(_refVel);
  relSpeed = _relV.length();
  if (relSpeed > mode.max) {
    const k = Math.min(1, 3 * dt) * (1 - mode.max / relSpeed);
    ship.vel.addScaledVector(_relV, -k);
  }

  // ---- atmospheric drag + re-entry burn ----
  let burning = 0;
  if (atmoBody) {
    ui.fAtmo.classList.remove('hidden');
    const relV = _tmpV2.copy(ship.vel).sub(atmoBody.velocity);
    const spd = relV.length();
    const drag = 0.0025 * atmoDensity * spd;
    ship.vel.addScaledVector(relV, -Math.min(0.9, drag * dt));
    if (spd > 70) {
      burning = THREE.MathUtils.clamp((spd - 70) / 140, 0, 1) * atmoDensity;
      damage(burning * 9 * dt);
      ship.warpDrive = false;
    }
  } else {
    ui.fAtmo.classList.add('hidden');
  }
  ui.fBurn.classList.toggle('hidden', burning < 0.05);
  ui.vignette.style.opacity = Math.min(0.9, burning).toFixed(2);
  shipVisual.burn.material.opacity = Math.min(0.65, burning);

  // ---- feed the cinematic FX state (RELATIVE frame only) ----
  fx.burn = burning;
  fx.turbo = (mode === MODES.TURBO && thrusting) ? 1 : 0;
  fx.relVel.copy(ship.vel).sub(_refVel);
  fx.relSpeed = fx.relVel.length();
  if (atmoBody) {
    fx.atmoColor.setHex(atmoBody.atmoColor);
    fx.atmoAmt = Math.min(1, atmoDensity / atmoBody.atmo.density);
  } else {
    fx.atmoAmt = 0;
  }

  // ---- shields recharge after 5 s without damage ----
  if (perfTime - ship.lastHitT > 5) {
    ship.shield = Math.min(100, ship.shield + 1.6 * dt);
  }

  // ---- Euler integration: x += v·dt (delta-time, FPS-independent) ----
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
    ship.hull = 0; ship.dead = true; ship.warpDrive = false;
    document.getElementById('gameover').classList.remove('hidden');
  }
}

/* =====================================================================
   11. MAIN LOOP — THREE.Clock delta time, LERP chase camera, FOV stretch
   ===================================================================== */
let simTime = 0;
let perfTime = 0;
const camTarget = new THREE.Vector3();
const _shakeOff = new THREE.Vector3();  // display-only shake offset
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
    if (b.cloudMesh) {
      b.cloudMesh.rotation.y += b.spin * 0.7 * dt * Math.min(warp, 50);
      b.cloudMesh.material.uniforms.uTime.value = perfTime;
      b.cloudMesh.material.uniforms.uSunPos.value.copy(systems[b.systemIndex].star.position);
    }
    if (b.gasMat) {
      b.gasMat.uniforms.uTime.value = perfTime;
      b.gasMat.uniforms.uSunPos.value.copy(systems[b.systemIndex].star.position);
    }
    if (b.type === 'star') b.mesh.material.uniforms.uTime.value = perfTime;
    if (b._atmoMat) b._atmoMat.uniforms.uSunPos.value.copy(systems[b.systemIndex].star.position);
  }
  if (systems[0] && systems[0].belt)
    systems[0].belt.rotation.y += 0.002 * dt * Math.min(warp, 50);
}

function updateCamera(dt) {
  shipVisual.group.position.copy(ship.pos);
  shipVisual.group.quaternion.copy(ship.quat);
  shipVisual.flames.forEach(f => {
    const s = ship.throttle * (1.2 + Math.random() * 0.5) * (ship.warpDrive ? 2.2 : 1);
    f.scale.setScalar(Math.max(0.001, s));
  });
  // LERP chase camera — smooth, judder-free follow
  _up.set(0, 1, 0).applyQuaternion(ship.quat);
  camTarget.copy(ship.pos)
    .add(_tmpV.set(0, 1.9, 7).applyQuaternion(ship.quat));
  const k = 1 - Math.pow(0.0015, dt);
  camPos.lerp(camTarget, k);          // camPos = persistent smoothed state
  camera.position.copy(camPos);       // shake is applied AFTER this copy,
  // so the offset only affects the DISPLAYED camera for this one frame
  // and can never leak into camPos, ship.pos or ship.vel (no drift).
  _shakeOff.set(0, 0, 0);
  const shakeAmp = fx.burn * 0.6 + fx.turbo * 0.10 + fx.warp * 0.20;
  if (shakeAmp > 0.001) {
    const t = perfTime;
    _shakeOff.set(
      Math.sin(t * 37.1)       * shakeAmp,
      Math.sin(t * 43.7 + 1.7) * shakeAmp * 0.8,
      Math.sin(t * 29.3 + 0.6) * shakeAmp * 0.5);
    camera.position.add(_shakeOff);
  }
  camera.up.copy(_up);
  camera.lookAt(_tmpV.copy(ship.pos).addScaledVector(_fwd, 30));
  // FOV stretch: warp drive pulls the view wide for a smooth hyperspace feel
  // (relative speed — parked beside an orbiting planet must read as 0)
  const speedKick = Math.min(10, fx.relSpeed * 0.006);
  const targetFov = ship.warpDrive ? 96 : 62 + speedKick;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 2.5);
  camera.updateProjectionMatrix();
  starfield.position.copy(camera.position);
}

function updateHUD() {
  ui.fuelF.style.width = ship.fuel + '%';  ui.fuelV.textContent = Math.round(ship.fuel) + '%';
  ui.hullF.style.width = ship.hull + '%';  ui.hullV.textContent = Math.round(ship.hull) + '%';
  ui.shF.style.width = ship.shield + '%';  ui.shV.textContent = Math.round(ship.shield) + '%';
  ui.vel.textContent = fx.relSpeed.toFixed(1);
  ui.thr.textContent = Math.round(ship.throttle * 100) + '%';
  ui.mode.textContent = currentModeName();
  ui.mode.style.color = ship.warpDrive ? 'var(--amber)' : '';
  ui.warp.style.color = (WARP_STEPS[warpIndex] > 1) ? 'var(--red)' : 'var(--amber)';
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
let wasObserving = false;
function animate() {
  requestAnimationFrame(animate);
  // THREE.Clock delta — ship speed identical on 30, 60 or 144 FPS rigs
  const dt = Math.min(0.05, clock.getDelta());
  perfTime += dt;

  updateBodies(dt);
  const sub = 2;                    // physics substeps for stability
  for (let s = 0; s < sub; s++) physicsStep(dt / sub);
  updateCamera(dt);

  frameCount++;
  if (frameCount % 3 === 0) { updateHUD(); updateLabels(); }

  // leaving time-warp observation mode: velocities of the bodies are
  // sane again — re-anchor the ship to the local frame once, smoothly
  const observingNow = WARP_STEPS[warpIndex] > 1 && !ship.landedOn && !ship.dead;
  if (wasObserving && !observingNow) syncToLocalFrame();
  wasObserving = observingNow;
  if (ship.dead) { fx.burn *= Math.max(0, 1 - dt * 3); fx.turbo = 0; }

  // ---- cinematic FX updates ----
  fx.warp += ((ship.warpDrive ? 1 : 0) - fx.warp) * Math.min(1, dt * 2.2);
  fx.atmoSm += (fx.atmoAmt - fx.atmoSm) * Math.min(1, dt * 3);
  if (nebula) {
    nebula.position.copy(camera.position);
    nebula.material.uniforms.uTime.value = perfTime;
  }
  if (dust) {
    const sp = fx.relSpeed;                 // relative — no false motion
    const u = dust.material.uniforms;
    u.uCenter.value.copy(camera.position);
    u.uVel.value.copy(fx.relVel);
    u.uStretch.value = 0.03 + sp * 0.0012 + fx.warp * 0.55;   // warp streaks
    u.uAlpha.value = THREE.MathUtils.clamp(sp / 60, 0.05, 0.8) + fx.warp * 0.2;
  }
  if (composer) {
    warpPass.uniforms.uAmount.value = fx.warp;
    gradePass.uniforms.uTime.value = perfTime;
    gradePass.uniforms.uWarp.value = fx.warp;
    gradePass.uniforms.uAtmo.value = fx.atmoSm;
    gradePass.uniforms.uAtmoColor.value.copy(fx.atmoColor);
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

/* =====================================================================
   12. BOOTSTRAP
   ===================================================================== */
const loaderFill = document.getElementById('loader-fill');
const loaderStatus = document.getElementById('loader-status');
const buildSteps = [
  ['Building the Solar System…', () => buildSolarSystem()],
  ['Seeding star system Alpha…', () => buildProceduralSystem(1337, new THREE.Vector3( 900000, 40000, -350000))],
  ['Seeding star system Beta…',  () => buildProceduralSystem(4242, new THREE.Vector3(-750000, -60000, 600000))],
  ['Seeding star system Gamma…', () => buildProceduralSystem(9001, new THREE.Vector3( 200000, 120000, 950000))],
  ['Igniting nebulae…', () => { buildNebula(); buildDust(); initPost(); }],
  ['Calibrating orbits…', () => { updateBodies(0); updateBodies(0.0001); }],
  ['Launching…', () => {
    respawn();
    camPos.copy(ship.pos).add(new THREE.Vector3(0, 2, 8));
    document.getElementById('hud').classList.remove('hidden');
  }]
];
let stepIdx = 0;
function runBuildStep() {
  if (stepIdx >= buildSteps.length) {
    document.getElementById('loader').classList.add('fade');
    clock.getDelta();          // discard load time from the first frame
    animate();
    return;
  }
  const [label, fn] = buildSteps[stepIdx];
  loaderStatus.textContent = label;
  loaderFill.style.width = Math.round((stepIdx / buildSteps.length) * 100) + '%';
  requestAnimationFrame(() => setTimeout(() => {
    fn();
    stepIdx++;
    runBuildStep();
  }, 16));
}
runBuildStep();
