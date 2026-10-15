# TankHit — Build Prompt

Build **TankHit**, a 3D browser game for analyzing armor penetration. The player picks a target tank, a round type, and a shot angle, then fires. The game plays the impact back in slow motion on a **cutaway X-ray view** of the tank. The player watches the penetrator hit the armor, break through or fail, throw spall into the crew compartment, strike the **ballistic-gel crew dummies**, and possibly **cook off the stowed ammunition**.

Think of War Thunder's *Protection Analysis* and *Hit Camera*, combined with the shot-replay X-ray in *Gunner, HEAT, PC!*, packaged as a standalone sandbox and puzzle game.

---

## Tech stack

- **TypeScript + Vite + Three.js.** Runs in the browser with no backend.
- Tank geometry is built procedurally from primitives (boxes, wedges, cylinders), described in data files. No external 3D models are required for v1.
- Simulation logic lives in plain TS modules with **no Three.js imports**, so it can be unit-tested with Vitest.
- Simple UI: HTML/CSS overlay panels, dark semi-transparent, in the War Thunder analysis style.

## Core loop

1. **Select target**: choose a tank from a list (see the vehicle list below).
2. **Select round**: pick a round family and a specific shell. Show its stats: penetration (mm RHA) at range, velocity, mass, and filler.
3. **Aim**: orbit the camera around the tank and click a point on the hull or turret. Then set:
   - **Distance** slider (0–3000 m), which changes velocity and penetration
   - **Impact angle**, either derived from where the camera is (like the "respect vertical camera angle" checkbox) or entered by hand as yaw and pitch
   - A preview line showing the shot path and the **effective armor thickness** at that point (LOS thickness = thickness / cos θ)
   - A pre-shot indicator colored **green / yellow / red** for likely / marginal / unlikely penetration (as in Protection Analysis)
4. **Fire**: the camera switches to the cutaway and plays the impact in slow motion with time controls: play/pause, scrub, 0.1×/0.25×/1× speed.
5. **Results panel**: penetrated or not, armor defeated (mm), residual penetration, spall fragment count, dummies hit (by body region), modules damaged, and whether an ammo cook-off happened. Show an overall result: *Non-pen / Pen – no damage / Crew injured / Disabled / Knocked out / Catastrophic (cook-off)*.
6. **Shot log**: keep every shot in a list (like the "Hits" panel). Any shot can be replayed, and the user can switch between shots with A/D.

## Cutaway / X-ray rendering

- The outer hull renders as a **translucent shell** with a glowing outline edge, similar to the reference screenshots.
- Internal modules are visible as solid, color-coded objects:
  - **Crew dummies**: translucent ballistic-gel figures (amber/peach) seated at the driver, gunner, commander, and loader stations
  - **Ammunition**: individual rounds in racks, colored by type (APFSDS, HEAT, HE)
  - **Engine, transmission, fuel tanks, breech, turret ring, radio, optics**
- **Composite armor arrays** show their internal layers (steel, ceramic, rubber/NERA, air gap) when cut through, like the composite armor cutaway reference.
- A **section plane** lets the player slice the tank along the shot line. Default is auto-align to the shot. Free mode can be toggled.
- Damaged modules change color: green → yellow → orange → red → black (destroyed).

## Rounds (v1)

Each round is a data file with mass, velocity, length/diameter, material, and filler. Penetration is computed from these values, not hardcoded.

| Family | Examples | Behavior |
|---|---|---|
| **APFSDS** (tungsten / DU) | M829A1, 3BM42, DM53 | Long-rod kinetic penetrator. Very little normalization, high penetration. Ricochets at extreme angles. A DU rod gives a self-sharpening bonus and a **pyrophoric flash** inside (incendiary chance) |
| **AP / APC / APCBC** | BR-365K, M61 | Full-caliber kinetic round. Normalizes toward the armor. Shatters on very thick armor |
| **APHE** | PzGr 39 | Kinetic penetration, then a fuze delay, then an internal explosion with a fragmentation sphere |
| **HEAT / HEATFS** | M456A2, 3BK14 | Shaped-charge jet with penetration that does not depend on velocity. Defeated by spaced armor, ERA, and composite. Produces a narrow spall cone |
| **HESH** | L35 | No penetration. Causes **back-face scabbing** spall when the plate is thinner than the threshold |
| **HE** | OF-412 | Overpressure plus fragmentation. Only effective against thin armor or open tops |

## Penetration & spall model

Use simplified models that can be tuned. They should look plausible, not be exact:

- **Kinetic**: use a simplified **Lanz-Odermatt** formula for long rods and **de Marre** for full-caliber AP. Penetration decreases with distance (velocity drop-off).
- **Angle**: effective thickness = t / cos θ. Apply a normalization angle for each round family. Above a ricochet threshold, roll for a bounce.
- **Spaced armor and ERA** reduce HEAT penetration. ERA also degrades long rods a little.
- **Composite**: each layer has a material multiplier, different for KE and CE (data-driven).
- **Spall**: on penetration, emit a cone of fragments from the exit point. The fragment count and cone angle depend on caliber, residual energy, and the round family. Fragments are raycast against internal modules and lose energy with each hit.
- **Shell path**: if residual penetration remains, the penetrator keeps going through the interior and can hit and pass through modules, losing energy each time.

## Ballistic gel crew dummies

- Each dummy has hit zones: head, torso, arms, legs, each with an HP value.
- On impact, show a **gel wound channel**: a glowing, cavity-shaped mark inside the translucent dummy, sized by fragment energy (temporary cavity plus permanent channel). This is clinical and stylized, not gory.
- Dummy states: *Unhurt / Lightly wounded / Severely wounded / Incapacitated*. Incapacitated crew shuts down that station (for example, a knocked-out gunner means "gun can't fire").

## Ammunition cook-off

- Every stowed round is a module with HP and **propellant** / **explosive filler**.
- A spall fragment or penetrator hitting a round triggers a roll. Chance increases with energy and when the propellant charge is hit directly.
- Outcomes:
  - **Deflagration / fire**: burning propellant spreads over several seconds and can ignite rounds next to it (chain reaction)
  - **Detonation**: instant catastrophic explosion that blows off the turret, plays a big particle effect, and sets the result to "Catastrophic"
- **Blow-out panels / ammo bustle** (Abrams-style): when the vehicle has them and the bustle doors are closed, the cook-off vents outward. The crew survives and the result is "Ammo lost, crew safe".
- Show propagation in the replay: rounds glow orange → red → white before they go.

## Vehicles (v1: 4 tanks, data-driven)

1. **T-34-85**: simple sloped steel. Good for learning angles
2. **M1 Abrams (early)**: composite front, isolated turret bustle ammo with blow-out panels
3. **T-72B**: composite plus **ERA**, carousel autoloader under the turret (ammo cook-off is very likely)
4. **IS-3 / heavy tank**: thick cast armor with complex angles

Each vehicle is defined in a JSON/TS file containing armor plates (geometry, thickness, material, layers), module positions, crew stations, and ammo rack layout. Adding a new tank should only require a new data file.

## Game modes

- **Sandbox**: free fire with unlimited shots and every round unlocked.
- **Challenges**: puzzle-style objectives, for example "Knock out the T-72B with only 2 shots", "Penetrate the Abrams turret without triggering the bustle", or "Find the weak spot that cooks off the carousel". Rate 1–3 stars by shots used.
- **Compare Rounds**: fire 2–4 different rounds at the same point and compare the results side by side.

## UI / Controls

- Left panel: Target → Round family → Shell → Distance slider → computed penetration (mm). Right panel: shot results. Bottom bar: replay timeline.
- Mouse: orbit, zoom, and click to aim. **Space**: fire. **X**: toggle X-ray. **A/D**: switch shot. **W/S**: move along the shot path. **R**: reset camera.
- Color legend always visible: armor thickness heatmap (blue = thin, red = thick) when hovering over the hull.

## Visual style

- Dark, clean, technical look like a military analysis tool. The ground is a simple concrete pad with soft shadows.
- Shell tracer: bright red/orange line. Spall: yellow-orange streaks that fade. HEAT jet: thin blue-white line. Cook-off: big orange/white bloom with smoke.
- Use bloom post-processing for the glowing elements.

## Project structure

```
src/
  sim/        # pure TS: ballistics, penetration, spall, damage, cookoff (unit tested)
  data/       # vehicles/*.ts, rounds/*.ts, materials.ts
  render/     # three.js scene, cutaway shader, tank builder, particles, replay
  ui/         # panels, shot log, results
  modes/      # sandbox, challenges, compare
  main.ts
tests/        # vitest for sim/
```

## Milestones

1. Scaffold Vite + TS + Three.js. Render one tank (T-34-85) from data with an orbit camera and X-ray translucency.
2. Aiming plus LOS thickness preview. Kinetic penetration model (AP and APFSDS). Pen/non-pen result.
3. Spall cone, internal raycasts, gel dummies with hit zones and wound channels.
4. Ammo modules plus the cook-off chain. Replay timeline with slow motion.
5. Add HEAT/HESH/APHE/HE, composite and ERA, and the remaining 3 tanks.
6. Challenges mode, Compare mode, polish (bloom, particles, sound).

After each milestone, the game must run (`npm run dev`) and the `sim/` tests must pass. Commit after each milestone.
