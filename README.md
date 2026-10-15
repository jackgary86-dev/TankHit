# TankHit

**Play it:** https://jackgary86-dev.github.io/TankHit/

**Download:** installers for Windows (.exe), macOS (.dmg) and Linux (.AppImage / .deb) are attached to every [GitHub Release](https://github.com/jackgary86-dev/TankHit/releases/latest). The desktop app runs fully offline.

Armor penetration sandbox. Pick a tank, a round and an angle, fire, then watch an X-ray cutaway replay of the penetrator, spall, ballistic-gel crew dummies and ammunition cook-off.

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # simulation unit tests
npm run build   # production build in dist/
npm run desktop # run the Electron desktop app
npm run package # build installers into release/ (current OS)
npm run smoke   # launch the desktop app, run its self-test, exit
```

Releases: push a tag like `v0.2.0` and the `Release installers` workflow builds all three platforms and attaches them to the release. It can also be run from the Actions tab (choose a tag/branch and whether to publish as a draft), and the `CI` workflow can be run manually to produce a Windows installer as a downloadable artifact without cutting a release.

## Modes

- **Sandbox** – free fire, every round unlocked; damage carries over until you hit *Repair vehicle*.
- **Challenges** – eleven puzzles with fixed rounds/range and a shot limit; 1–3 stars by shots used, and stars unlock the later puzzles.
- **Share link** – every shot can be reproduced from its URL (vehicle, round, range, aim, seed, turret yaw).
- **Compare Rounds** – fire up to four rounds at the same point on a fresh tank with the same seed and compare side by side.
- **Duel** – turn-based fight against an AI tank; both sides keep their damage, crew losses matter, the AI aims at your weakest spot.
- **Daily** – one scenario per day for everyone, three attempts, shareable result.

## Controls

| Key | Action |
| --- | --- |
| Mouse drag / wheel | Orbit / zoom |
| Click armor | Lock aim point (hover previews LOS and penetration) |
| Space | Fire (or Compare) |
| Esc | Clear aim |
| X | X-ray view (again: back to Painted) |
| C | Cut view: the painted tank sliced open along the shot with solid, layered cross-sections; press again to cut facing the camera |
| Shift+C | Cutaway view: X-ray with the section plane |
| H | Armour map view: plates coloured by thickness |
| K | Kill-map view: knock-out probability across the silhouette (Monte-Carlo, computed in a worker) |
| G | Gunner's sight: real shell drop, time of flight, dispersion; drag to traverse, wheel to zoom |
| Q / E | Traverse the turret |
| V | Auto camera (frames each impact) |
| P / Enter | Play / pause replay |
| A / D | Previous / next shot |
| W / S (+Shift) | Ride the camera along the shot path |
| R | Reset camera |
| M | Mute |

## Vehicles

M4A3 (76) W Sherman, T-34-85, Panther G, Tiger I, IS-3, T-55, M48 Patton, T-72B, M1 Abrams, Leopard 2A4 and Challenger 1 – each is a data file in `src/data/vehicles/` built with the helpers in `src/data/builder.ts`. Add a tank by adding a file and registering it in `src/data/vehicles/index.ts`.

## Simulation

`src/sim/` is pure TypeScript (no three.js) and fully unit-tested:

- **Kinetic** – simplified Lanz–Odermatt (long rods, DU self-sharpening) and de Marre (full-calibre AP/APHE), velocity drop-off, normalization, ricochet and overmatch.
- **Chemical** – HEAT jets (standoff loss, ERA, composite CE multipliers), HESH scabbing, APHE fuze delay bursts, HE blast and thin-plate penetration.
- **Spall** – cones raycast through modules and gel dummies with energy loss per hit.
- **Crew** – zone HP, wound channels, incapacitation and station loss.
- **Cook-off** – ignition rolls, propagation through racks, detonation or blow-out-panel venting; wet stowage quenches most ignitions.
- **Ballistics** – point-mass arc with drag for the gunner's sight; superelevation solved per range.

See [PROMPT.md](PROMPT.md) for the original design brief.
