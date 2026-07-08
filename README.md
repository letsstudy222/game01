# HELIOS — Procedural 3D Universe Simulator

A fully client-side, scientifically-grounded 3D space simulation.
**HTML5 + Vanilla JavaScript + Three.js r128 (CDN only).**
No backend, no Node.js, no bundler. Deploy the folder as-is to GitHub Pages.

## Play locally
Just open `index.html` in any modern browser (Chrome / Edge / Firefox / Safari).
No build step, no server required.

## Deploy to GitHub Pages
1. Create a new repository on GitHub (e.g. `helios-sim`).
2. Upload these 3 files to the repository root:
   - `index.html`
   - `style.css`
   - `game.js`
3. Go to **Settings → Pages → Source**: select branch `main`, folder `/ (root)`, then Save.
4. Your game is live at `https://<username>.github.io/helios-sim/` within ~1 minute.

## Controls
| Key | Action |
|---|---|
| `W` / `S` | Main thrust / reverse thrust |
| `A` / `D` | Yaw left / right |
| `↑` / `↓` | Pitch |
| `Q` / `E` | Roll |
| `SHIFT` | Turbo mode (cruise between moons) |
| `F` / `J` | Warp Drive toggle (hyper-cruise between planets, FOV stretch + star-streaks) |
| `SPACE` | Reset view — levels the ship & snaps the camera behind the tail (hold to lock) |
| `B` | Hard brake |
| `V` | Toggle chase / cockpit view |
| `T` | Scan nearest celestial body |
| `1`–`5` | Time warp ×1 / ×10 / ×50 / ×200 / ×1000 |
| `N` | Hyperjump to next star system (costs 20% fuel) |
| `H` | Toggle controls help |

## v3 — No Man's Sky-style visuals
- **Cinematic post-processing** — EffectComposer pipeline: UnrealBloomPass
  (glowing suns, engines, Venus lava, Saturn's ice rings), a radial
  motion-blur warp-streak pass, and a final ACES-filmic tonemap +
  teal/orange colour-grade + vignette + cockpit hologram pass.
- **Procedural nebulae** — 2,600 soft noise-shaded points in six coloured
  clusters (violet/teal/magenta/amber) shimmering slowly behind the stars.
- **Space dust streaks** — 900 wrap-around line particles stream past the
  hull to sell velocity, and stretch into hyperspace streaks during warp.
- **Distance-adaptive micro-detail** — rocky surfaces gain high-frequency
  noise and crack lines as you close in (injected into the PBR shader).
- **Camera shake** — sin-oscillator rattle during turbo, warp and re-entry.
- Post-processing scripts load from jsDelivr; if unavailable the game
  falls back to plain rendering automatically.
- **Terrain-true collision** — one analytic height function drives both
  the visible mesh and the physics boundary: fly into valleys, skim
  mountain ridges, and touch down on the actual ground. Idling below
  45 u altitude engages a gentle 6 u/s glide that lands the ship itself.

## Terra Earth — flagship realistic terrain
- **Spherified-cube mesh** (6 warped cube faces, ~77k tris): uniform
  triangle density with zero polar pinching artifacts.
- **GPU vertex-shader displacement**: layered 6-octave fBm continents,
  ridged-multifractal mountain chains, billow-noise rolling plains —
  normals rebuilt per-vertex from the height-field gradient so
  MeshStandardMaterial lights every ridge and valley correctly.
- **Height + slope biomes** in the fragment shader: abyss → sand →
  grass → steppe → bare rock (cliffs darken with slope) → snow, with a
  snow line that descends toward the poles; specular sea at sea level.
- **One terrain recipe, two runtimes**: the exact Ashima-simplex
  arithmetic runs in GLSL for rendering and in JavaScript for physics,
  so the collision surface IS the rendered ground, and the collision
  reach adapts to the tallest peak (visRadius + maxTerrain).

## What's inside
- **Kepler orbital mechanics** — real orbital elements (a, e, i) for all 8 planets
  and major moons; Kepler's equation solved per frame with Newton–Raphson;
  periods follow Kepler's third law (T ∝ a^1.5).
- **Procedural planets, zero texture files** — CPU 3D simplex-noise heightmaps
  with ridged mountains, canyons and crater fields (Mercury, Moon, Mars…);
  animated GLSL fbm band shaders for gas giants incl. Jupiter's Great Red Spot;
  noise-banded translucent ring shader for Saturn.
- **Rayleigh/Mie-style atmosphere shader** — sun-lit rim scattering with a
  forward-scatter Mie lobe: thick gold on Venus, blue on Earth, thin orange
  on Mars, hazy nitrogen on Titan.
- **Newtonian flight model** — pure inertia in vacuum, n-body gravity with
  emergent slingshot maneuvers, exponential atmospheric drag, re-entry burn
  with hull damage, and soft-landing / crash-bounce logic.
- **Survival systems** — fuel, hull integrity, recharging shields; land on a
  planet (< 22 u/s) to refuel and repair.
- **Smart scaling** — 1 AU = 1200 units, sqrt-compressed radii, and Three.js
  logarithmic depth buffer (log-depth chunks injected into every custom
  shader) so there is no Z-fighting from a moon's surface out to Neptune.
- **Performance** — instanced rendering for the 1,600-rock asteroid belt,
  shared noise shader chunk, HUD updated every 3rd frame; targets 60 FPS.
- **3 extra procedural star systems** — seeded generation (mulberry32) of
  stars, rocky worlds, gas giants, rings and atmospheres. Press `N` to jump.
