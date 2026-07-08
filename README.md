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
| `SPACE` | Afterburner (×9 thrust, heavy fuel burn) |
| `SHIFT` | Retro-thrusters (burn against velocity vector) |
| `T` | Scan nearest celestial body |
| `1`–`5` | Time warp ×1 / ×10 / ×50 / ×200 / ×1000 |
| `N` | Hyperjump to next star system (costs 20% fuel) |
| `H` | Toggle controls help |

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
